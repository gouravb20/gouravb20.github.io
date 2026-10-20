// Deep dive: Chapter 5, Design patterns. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>Design patterns are names for solutions that keep reappearing. Their real value in an interview is vocabulary: "pricing is a Strategy" tells the interviewer the whole structure in four words. Their danger is that they tempt you to add structure the problem doesn't need. This chapter covers the patterns that actually come up in LLD problems. For each one: the problem it solves, a compact Java shape, and the signal that it's the right tool. Every example is written to be safe when many threads call it at once, because LLD follow-ups almost always ask "what if two users do this at the same time?"</p>`,
  sections: [
    {
      id: "how-to-use",
      title: "How to use patterns in an interview",
      kicker: "Mindset",
      blocks: [
        { type: "steps", items: [
          "<strong>Start from the problem.</strong> Notice a force in the design: algorithms that vary, behaviour that depends on state, reactions to events, many optional parts.",
          "<strong>Reach for the pattern that resolves it</strong>, and name it in one sentence: \"Spot assignment varies by lot, so it's a Strategy.\"",
          "<strong>Keep it minimal.</strong> An interface and two or three small classes, not a framework.",
          "<strong>If no force is present, skip it</strong> and mention the pattern as a future extension point."
        ] },
        { type: "table", title: "The patterns that matter for LLD", headers: ["Group", "Pattern", "Shows up in"], rows: [
          ["Creational", "Factory, Builder, Singleton", "Vehicle and piece creation, complex requests, global controllers"],
          ["Structural", "Adapter, Decorator, Facade, Composite", "Payment providers, add-ons, booking flows, file systems"],
          ["Behavioural", "Strategy, Observer, State, Command, Chain of Responsibility, Template Method, Iterator", "Pricing, notifications, vending machines, undo, approvals"]
        ] },
        { type: "table", title: "Keeping each pattern thread-safe", headers: ["Pattern", "What can race", "How the examples stay safe"], rows: [
          ["Singleton", "Two threads both see no instance and both create one", "Check and create while holding a lock; for a lock-free fast path, double-checked locking with a <code>volatile</code> or atomic reference"],
          ["Factory, Strategy, Adapter, Decorator, Template Method", "Nothing, as long as they hold no mutable state", "<code>final</code> fields, immutable maps and records, stateless helpers"],
          ["Builder", "A builder shared between threads", "Each thread uses its own builder; the built object is immutable"],
          ["Composite, Iterator", "The structure changing while someone walks it", "Defensive copies, or iterate a snapshot taken under a lock"],
          ["State, Command", "Two events reading and replacing the current state or history at once", "One lock around each transition (<code>synchronized</code>, a mutex)"],
          ["Observer", "Listeners added during a publish; counters updated by two threads", "<code>CopyOnWriteArrayList</code> for listeners, an atomic or lock for the state, notify outside the lock"],
          ["Chain of Responsibility", "The chain being rewired while a request walks it", "Build the chain once with <code>final</code> links; keep per-request data in parameters"]
        ] }
      ]
    },
    {
      id: "creational",
      title: "Creational: Factory, Builder, Singleton",
      kicker: "Making objects",
      blocks: [
        { type: "code", lang: "java", title: "Factory: one place decides which class to create", code: `interface Notifier { void send(User u, String message); }
final class EmailNotifier implements Notifier { ... }
final class SmsNotifier   implements Notifier { ... }
final class PushNotifier  implements Notifier { ... }

final class NotifierFactory {
    private final Map<Channel, Notifier> byChannel;    // immutable, so any thread can call forUser
    NotifierFactory(EmailNotifier e, SmsNotifier s, PushNotifier p) {
        byChannel = Map.of(Channel.EMAIL, e, Channel.SMS, s, Channel.PUSH, p);
    }
    Notifier forUser(User u) { return byChannel.get(u.preferredChannel()); }
}` },
        { type: "code", lang: "java", title: "Builder: readable construction with validation at the end", code: `final class FlightSearch {
    private final String from, to;
    private final LocalDate date;
    private final Cabin cabin;
    private final int maxStops;

    private FlightSearch(Builder b) {
        from = b.from; to = b.to; date = b.date; cabin = b.cabin; maxStops = b.maxStops;
    }

    static Builder from(String from, String to) { return new Builder(from, to); }

    static final class Builder {
        private final String from, to;
        private LocalDate date = LocalDate.now();
        private Cabin cabin = Cabin.ECONOMY;
        private int maxStops = 2;
        private Builder(String from, String to) { this.from = from; this.to = to; }
        Builder on(LocalDate d)     { this.date = d; return this; }
        Builder cabin(Cabin c)      { this.cabin = c; return this; }
        Builder maxStops(int n)     { this.maxStops = n; return this; }
        FlightSearch build() {
            if (from.equals(to)) throw new IllegalArgumentException("origin equals destination");
            return new FlightSearch(this);
        }
    }
}

FlightSearch q = FlightSearch.from("BLR", "SFO").on(LocalDate.of(2026, 12, 20)).cabin(Cabin.BUSINESS).build();
// A builder is used by one thread; the FlightSearch it returns has only final fields, so it is safe to share.` },
        { type: "text", html: `<p>A singleton has two separate thread-safety jobs. <strong>Creation</strong>: exactly one instance must be made even if many threads ask for it at the same moment. <strong>Use</strong>: the one instance is shared by every thread, so its own fields need thread-safe types or locks. Creation is a check-then-act ("is it there? if not, build it"), and the language-agnostic way to make a check-then-act safe is to do it while holding a lock.</p>` },
        { type: "code", lang: "java", title: "Lazy Singleton with a lock", code: `final class Singleton {
    private static Singleton instance;

    private Singleton() {}

    static synchronized Singleton getInstance() {   // check and create under one lock
        if (instance == null) instance = new Singleton();
        return instance;
    }
}` },
        { type: "text", html: `<p>This is the default: lazy, simple, and obviously correct. The lock also guarantees that every thread sees a fully constructed object. Its only cost is taking an uncontended lock on every call, which is tens of nanoseconds. If <code>getInstance()</code> is called on a very hot path, keep the lock for the first call only with double-checked locking:</p>` },
        { type: "code", lang: "java", title: "Double-checked locking needs volatile", code: `final class Singleton {
    private static volatile Singleton instance;     // volatile: no thread sees a half-built object

    private Singleton() {}

    static Singleton getInstance() {
        if (instance == null) {                     // fast path: no lock once created
            synchronized (Singleton.class) {
                if (instance == null) instance = new Singleton();   // check again under the lock
            }
        }
        return instance;
    }
}` },
        { type: "compare", title: "Lazy singletons, safe and unsafe", items: [
          { title: "Check, then create, with no lock", tone: "bad", html: `<p>Two threads can both see no instance and both construct, so callers end up holding different instances.</p>` },
          { title: "Lock around check and create", tone: "ok", html: `<p>Correct in every language and the simplest to get right. The default answer.</p>` },
          { title: "Double-checked locking with a plain field", tone: "bad", html: `<p>Another thread can see the reference before the constructor's writes are visible and use a half-built object.</p>` },
          { title: "Double-checked locking with a volatile or atomic field", tone: "ok", html: `<p>Correct, and no lock after the first call. Use it when <code>getInstance()</code> is hot.</p>` }
        ] },
        { type: "callout", tone: "interview", title: "synchronized or an explicit lock?", html: `<p>For a singleton they are equivalent: both give mutual exclusion and make the new object visible to other threads. Prefer <code>synchronized</code> (or the language's plain mutex) because it can't be left locked by an exception. An explicit <code>ReentrantLock</code> only adds <code>tryLock</code>, timeouts and fairness, and creating one object needs none of them. In Go the same code uses a <code>sync.Mutex</code> plus an <code>atomic.Pointer</code>.</p>` },
        { type: "callout", tone: "warning", html: `<p>Singleton is the pattern interviewers most often push back on. It is global state: dependencies are hidden inside method bodies, tests can't swap in a fake, and tests leak state into each other. If the prompt says "there is one X", say "one instance, created at startup and injected" rather than reaching for a static <code>getInstance()</code>. If you do use one, say how it stays thread-safe for both creation and use.</p>` }
      ]
    },
    {
      id: "structural",
      title: "Structural: Adapter, Decorator, Facade, Composite",
      kicker: "Composing objects",
      blocks: [
        { type: "code", lang: "java", title: "Adapter: make a vendor fit your interface", code: `interface PaymentGateway { PaymentResult charge(Money amount, String token); }

final class AcmePayAdapter implements PaymentGateway {
    private final AcmePayClient client;                   // vendor SDK, different shape
    AcmePayAdapter(AcmePayClient client) { this.client = client; }

    public PaymentResult charge(Money amount, String token) {
        AcmeResponse r = client.createTransaction(token, amount.cents(), amount.currency().getCurrencyCode());
        return r.status() == AcmeStatus.OK ? PaymentResult.approved(r.txnId()) : PaymentResult.declined(r.message());
    }
}` },
        { type: "code", lang: "java", title: "Decorator: stackable features, same interface", code: `interface DataSource { void write(byte[] data); }

final class FileDataSource implements DataSource { ... }

record Compressed(DataSource inner) implements DataSource {
    public void write(byte[] data) { inner.write(Gzip.compress(data)); }
}
record Encrypted(DataSource inner, Key key) implements DataSource {
    public void write(byte[] data) { inner.write(Aes.encrypt(data, key)); }
}

DataSource out = new Encrypted(new Compressed(new FileDataSource(path)), key);   // any combination` },
        { type: "code", lang: "java", title: "Composite: files and folders through one interface", code: `sealed interface Node permits File, Folder {
    String name();
    long size();
}

record File(String name, long size) implements Node {}

record Folder(String name, List<Node> children) implements Node {
    Folder { children = List.copyOf(children); }   // immutable copy: no thread can change it mid-walk
    public long size() { return children.stream().mapToLong(Node::size).sum(); }   // recursion for free
}` },
        { type: "text", html: `<p><strong>Facade</strong> needs no code sketch: it's one class with a few high-level methods (<code>BookingFacade.book(show, seats, payment)</code>) that coordinates a subsystem (seat holds, payment, ticket generation, notifications), so clients don't have to know the order of calls.</p>` },
        { type: "compare", items: [
          { title: "Adapter", tone: "info", html: `<p>Changes an interface to the one you need. Same behaviour, different shape.</p>` },
          { title: "Decorator", tone: "info", html: `<p>Keeps the interface, adds behaviour. Stackable.</p>` },
          { title: "Facade", tone: "info", html: `<p>Offers a new, simpler interface over many objects.</p>` },
          { title: "Composite", tone: "info", html: `<p>Treats a group like a single item, recursively.</p>` }
        ] }
      ]
    },
    {
      id: "strategy-state",
      title: "Strategy and State",
      kicker: "Behaviour that varies",
      blocks: [
        { type: "text", html: `<p>These two are the most common patterns in LLD answers, and they look alike: an object delegates to an interchangeable helper. The difference is <strong>who changes the helper and why</strong>.</p>` },
        { type: "code", lang: "java", title: "Strategy: the client picks the algorithm", code: `interface DispatchStrategy { Elevator choose(List<Elevator> cars, Request r); }

final class NearestCar implements DispatchStrategy {
    public Elevator choose(List<Elevator> cars, Request r) {
        return cars.stream().min(Comparator.comparingInt(c -> Math.abs(c.floor() - r.floor()))).orElseThrow();
    }
}
final class LeastBusy implements DispatchStrategy {
    public Elevator choose(List<Elevator> cars, Request r) {
        return cars.stream().min(Comparator.comparingInt(Elevator::pendingStops)).orElseThrow();
    }
}

final class Dispatcher {
    private final DispatchStrategy strategy;           // chosen by configuration; strategies are stateless
    Dispatcher(DispatchStrategy s) { this.strategy = s; }
    void handle(Request r, List<Elevator> cars) { strategy.choose(cars, r).addStop(r.floor()); }   // addStop locks the car
}` },
        { type: "code", lang: "java", title: "State: the object's state picks the behaviour", code: `interface VendingState {
    VendingState insertCoin(Machine m, Money coin);
    VendingState select(Machine m, String slot);
    VendingState cancel(Machine m);
}

final class Idle implements VendingState {
    public VendingState insertCoin(Machine m, Money c) { m.addCredit(c); return new HasCredit(); }
    public VendingState select(Machine m, String s)    { m.display("Insert coins first"); return this; }
    public VendingState cancel(Machine m)              { return this; }
}

final class HasCredit implements VendingState {
    public VendingState insertCoin(Machine m, Money c) { m.addCredit(c); return this; }
    public VendingState select(Machine m, String slot) {
        if (!m.canAfford(slot)) { m.display("Not enough credit"); return this; }
        m.dispense(slot);
        m.returnChange();
        return new Idle();
    }
    public VendingState cancel(Machine m) { m.refund(); return new Idle(); }
}

final class Machine {
    private VendingState state = new Idle();           // guarded by this
    // One lock per transition: two buttons pressed at once can't both act on the same state.
    synchronized void insertCoin(Money c) { state = state.insertCoin(this, c); }
    synchronized void select(String slot) { state = state.select(this, slot); }
    synchronized void cancel()            { state = state.cancel(this); }
    // addCredit, canAfford, dispense, refund, display: only called from inside a transition
}` },
        { type: "table", headers: ["", "Strategy", "State"], rows: [
          ["Who switches the helper", "The client or configuration", "The states themselves, as events happen"],
          ["Question it answers", "How should we do X?", "What does X mean right now?"],
          ["Helpers know each other?", "No", "Often (a state returns the next state)"],
          ["LLD examples", "Pricing, matching, dispatching, spot selection", "Vending machine, order lifecycle, elevator door, traffic light"]
        ] },
        { type: "callout", tone: "tip", html: `<p>For a machine with three states and two actions, an enum plus a switch is simpler and perfectly acceptable. Mention State as the refactor once states and actions multiply, or when each state carries its own data.</p>` }
      ]
    },
    {
      id: "observer-command-chain",
      title: "Observer, Command and Chain of Responsibility",
      kicker: "Objects talking to each other",
      blocks: [
        { type: "code", lang: "java", title: "Observer: publish events, let listeners react", code: `interface SpotListener { void onChange(String floorId, int freeSpots); }

final class Floor {
    private final String id;
    private final List<SpotListener> listeners = new CopyOnWriteArrayList<>();
    private final AtomicInteger free = new AtomicInteger();

    void subscribe(SpotListener l)   { listeners.add(l); }
    void unsubscribe(SpotListener l) { listeners.remove(l); }

    void occupy() { publish(free.decrementAndGet()); }   // atomic: two cars can't lose an update
    void vacate() { publish(free.incrementAndGet()); }
    private void publish(int now) { listeners.forEach(l -> l.onChange(id, now)); }
}

floor.subscribe((id, n) -> entranceBoard.show(id, n));
floor.subscribe((id, n) -> metrics.gauge("free_spots", n, "floor", id));` },
        { type: "code", lang: "java", title: "Command: requests as objects, so they can be undone", code: `interface EditCommand { void execute(); void undo(); }

record InsertText(Document doc, int at, String text) implements EditCommand {
    public void execute() { doc.insert(at, text); }
    public void undo()    { doc.delete(at, text.length()); }
}

final class Editor {
    // ArrayDeque isn't thread-safe, and each method must change the document and both stacks together,
    // so every method holds the editor's lock.
    private final Deque<EditCommand> done = new ArrayDeque<>(), undone = new ArrayDeque<>();
    synchronized void run(EditCommand c) { c.execute(); done.push(c); undone.clear(); }
    synchronized void undo() { if (!done.isEmpty()) { EditCommand c = done.pop(); c.undo(); undone.push(c); } }
    synchronized void redo() { if (!undone.isEmpty()) { EditCommand c = undone.pop(); c.execute(); done.push(c); } }
}` },
        { type: "code", lang: "java", title: "Chain of Responsibility: an ATM paying out notes", code: `final class NoteDispenser {
    private final int note;
    private final NoteDispenser next;                  // fixed at construction, so the chain is safe to share
    NoteDispenser(int note, NoteDispenser next) { this.note = note; this.next = next; }

    // Per-request data travels in parameters, never in fields, so concurrent withdrawals don't mix.
    void dispense(int amount, Map<Integer, Integer> out) {
        int count = amount / note;
        if (count > 0) out.put(note, count);
        int rest = amount % note;
        if (rest > 0) {
            if (next == null) throw new IllegalArgumentException("can't make " + rest);
            next.dispense(rest, out);
        }
    }
}

NoteDispenser chain = new NoteDispenser(500, new NoteDispenser(200, new NoteDispenser(100, null)));
chain.dispense(1700, result);      // 3 x 500, 1 x 200` },
        { type: "callout", tone: "warning", html: `<p>Observer pitfalls worth mentioning: listeners that are never unsubscribed leak memory; a slow listener blocks the publisher if called synchronously (hand events to an executor); and listeners shouldn't depend on notification order. <code>CopyOnWriteArrayList</code> makes subscribe and publish safe across threads when publishing is far more common than subscribing.</p>` }
      ]
    },
    {
      id: "template-iterator",
      title: "Template Method and Iterator",
      kicker: "Two more worth knowing",
      blocks: [
        { type: "code", lang: "java", title: "Template Method: fixed skeleton, variable steps", code: `abstract class ReportExporter {
    final void export(Report r, OutputStream out) {   // the skeleton can't be overridden
        var rows = fetch(r);
        writeHeader(r, out);
        rows.forEach(row -> writeRow(row, out));
        writeFooter(out);
    }
    protected List<Row> fetch(Report r) { return r.rows(); }
    protected abstract void writeHeader(Report r, OutputStream out);
    protected abstract void writeRow(Row row, OutputStream out);
    protected void writeFooter(OutputStream out) {}
}

final class CsvExporter extends ReportExporter { ... }
final class PdfExporter extends ReportExporter { ... }
// Keep per-export state in locals and parameters, not fields, and one exporter can serve many threads.` },
        { type: "code", lang: "java", title: "Iterator: walk a structure without exposing it", code: `final class Board implements Iterable<Cell> {
    private final Cell[][] cells;                      // guarded by this
    Board(int rows, int cols) { cells = new Cell[rows][cols]; }

    synchronized void place(int row, int col, Cell c) { cells[row][col] = c; }

    // Returns an iterator over a snapshot taken under the lock, so a concurrent place() can't break the loop.
    public synchronized Iterator<Cell> iterator() {
        return Arrays.stream(cells).flatMap(Arrays::stream).toList().iterator();
    }
}

for (Cell c : board) { ... }      // callers never touch the 2D array` },
        { type: "callout", tone: "insight", html: `<p>Template Method uses inheritance; Strategy does the same job with composition. If the varying steps might be mixed and matched, or swapped at run time, prefer Strategy.</p>` }
      ]
    },
    {
      id: "pick-the-pattern",
      title: "Practise matching problems to patterns",
      kicker: "Drill",
      blocks: [
        { type: "lab", id: "patternPicker", caption: "Twelve scenarios from classic LLD problems. Pick the pattern each one is really about." },
        { type: "quiz", q: "In a movie booking system, the interviewer asks how you'd support different seat pricing: weekday, weekend, premium rows and holiday surcharges, possibly combined. Which approach fits best?", options: [
          "A Singleton PricingManager with a switch on day type and row",
          "A PricingStrategy interface for the base price, with Decorators (or a list of composable rules) adding surcharges",
          "Subclasses WeekendPremiumSeat, HolidayWeekdaySeat and so on",
          "A Facade around the seat map"
        ], answer: 1, explain: `<p>The base rule varies (Strategy) and surcharges stack in combinations (Decorator, or a list of rules applied in order). Subclassing per combination explodes, and a switch in a singleton breaks the open/closed principle every time marketing invents a new surcharge.</p>` }
      ]
    }
  ],
  takeaways: [
    "Start from a force in the design; name the pattern that resolves it in one sentence; keep it minimal.",
    "Factory centralises which class to create; Builder handles many optional parts; prefer injecting one instance to a Singleton.",
    "If you do use a Singleton, check and create it under a lock (double-checked locking with a volatile or atomic field if the call is hot), and make its state thread-safe too.",
    "Every pattern must survive concurrent callers: immutable fields and copies for shared structure, one lock around each state transition, atomics or thread-safe collections for shared counters and lists.",
    "Adapter changes an interface, Decorator adds behaviour behind the same one, Facade simplifies many, Composite treats groups like items.",
    "Strategy: the client picks the algorithm. State: the current state picks the behaviour.",
    "Observer decouples events from reactions; Command makes requests undoable and queueable; Chain of Responsibility passes a request along handlers.",
    "Template Method is the inheritance-based cousin of Strategy; prefer Strategy when steps vary independently."
  ],
  furtherReading: [
    { title: "Hello Interview: Design patterns", url: "https://www.hellointerview.com/learn/low-level-design/in-a-hurry/patterns", note: "The page this chapter follows." },
    { title: "Design Patterns: Elements of Reusable Object-Oriented Software (Gamma, Helm, Johnson, Vlissides)", note: "The original catalogue of 23 patterns." },
    { title: "Head First Design Patterns (Freeman and Robson)", note: "A friendlier introduction with Java examples." }
  ]
};
