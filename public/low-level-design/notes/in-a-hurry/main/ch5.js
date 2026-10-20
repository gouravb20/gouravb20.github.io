// Main tab: Chapter 5, Design patterns. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch5 = [
  {
    id: "forces-first",
    title: "Start from the force, not the pattern",
    kicker: "Mental model",
    blocks: [
      { type: "text", html: `<p>A design pattern is a named answer to a recurring tension in a design: an algorithm that varies, behaviour that depends on state, objects that must react to events, construction with many optional parts. In an interview the name is valuable because it is compressed communication. "Pricing is a Strategy" tells the interviewer an interface, a few implementations and an injected choice in four words.</p><p>The order of thinking matters. First notice the force in the requirements, then name the pattern that resolves it, then write its smallest useful version. Going the other way, picking patterns and then looking for places to put them, is the classic route to over-engineering.</p>` },
      { type: "table", title: "The smallest version worth writing", headers: ["Pattern", "Force that calls for it", "Minimal shape"], rows: [
        ["Strategy", "A rule or algorithm with two or more variants", "One interface, one class per variant, chosen and injected by the caller"],
        ["State", "Many actions whose meaning depends on the current state", "One interface, one class per state; each action returns the next state"],
        ["Observer", "Others must react to an event the source shouldn't know about", "A listener interface, subscribe, and a publish loop"],
        ["Factory", "Which concrete class to create depends on input or config", "One method or a map from key to constructor"],
        ["Builder", "Many optional parameters that must be validated together", "A nested builder whose build() validates and returns an immutable object"],
        ["Decorator", "Optional features in any combination", "A wrapper implementing the same interface, delegating to the inner object"],
        ["Command", "Requests that must be queued, logged or undone", "Objects with execute() and undo(), plus a history stack"]
      ] },
      { type: "callout", tone: "tip", html: `<p>Before adding a pattern, check you can finish this sentence: <em>"I'm using X because Y varies (or happens), and without it I'd have to Z."</em> If you can't fill in Y and Z from the requirements, leave the pattern out and mention it as an extension point.</p>` }
    ]
  },
  {
    id: "singleton-safely",
    title: "Singleton, done safely, and usually avoided",
    kicker: "Creational",
    blocks: [
      { type: "text", html: `<p>Singleton guarantees one instance of a class with a global access point. The naive lazy version, "if instance is null, create it", is a check-then-act race: two threads can both see null and build two instances. If you genuinely need a process-wide singleton, let the language make it thread-safe for you.</p>` },
      { type: "code", lang: "java", title: "Thread-safe Singleton: enum and holder idiom", code: `// Option 1: an enum. The JVM creates INSTANCE exactly once, thread-safely.
enum Metrics {
    INSTANCE;
    private final ConcurrentHashMap<String, LongAdder> counters = new ConcurrentHashMap<>();

    void increment(String name) { counters.computeIfAbsent(name, k -> new LongAdder()).increment(); }
    long count(String name) { LongAdder a = counters.get(name); return a == null ? 0 : a.sum(); }
}

// Option 2: initialization-on-demand holder. Lazy, with no locking in your code.
final class AppConfig {
    private final Map<String, String> values;            // immutable after construction

    private AppConfig() { values = Map.copyOf(ConfigLoader.load()); }

    private static final class Holder {
        static final AppConfig INSTANCE = new AppConfig();   // runs on first use of Holder
    }

    static AppConfig get() { return Holder.INSTANCE; }
    String value(String key) { return values.get(key); }
}` },
      { type: "text", html: `<p>Both rely on the JVM's class initialisation, which runs once under a lock and publishes the finished object to every thread. The instance's own state must be safe as well: <code>Metrics</code> uses <code>ConcurrentHashMap</code> and <code>LongAdder</code>, and <code>AppConfig</code> is immutable. A thread-safe way to create a singleton does not make its fields thread-safe.</p><p>You may be asked about double-checked locking. It works in modern Java only if the field is <code>volatile</code>. Without it, another thread can see a non-null reference to an object whose constructor hasn't finished writing its fields.</p>` },
      { type: "code", lang: "java", title: "Double-checked locking needs volatile", code: `final class Registry {
    private static volatile Registry instance;          // volatile is what makes this correct

    private Registry() { }

    static Registry get() {
        Registry r = instance;                          // one volatile read on the fast path
        if (r == null) {
            synchronized (Registry.class) {
                r = instance;
                if (r == null) instance = r = new Registry();
            }
        }
        return r;
    }
}` },
      { type: "callout", tone: "warning", html: `<p>Interviewers push back on Singleton because it hides dependencies inside method bodies and makes tests share state. When the prompt says "there is one parking lot", the stronger answer is <em>one instance, created at startup and passed to whoever needs it</em>. Mention the enum or holder idiom only if a true global really is required.</p>` }
    ]
  },
  {
    id: "patterns-together",
    title: "Strategy and Observer in one thread-safe class",
    kicker: "Worked example",
    blocks: [
      { type: "text", html: `<p>An online auction needs two things. Bid validation varies: some auctions require a minimum increment, others a percentage. That variation is a Strategy. When a new high bid lands, the bidder's screen, the outbid notifier and an audit log must all react, without the auction knowing about them. That is an Observer. Many bidders act at once, so the class must be safe under concurrent calls.</p>` },
      { type: "code", lang: "java", title: "An auction with a bid-rule strategy and observers", code: `interface BidRule { boolean accepts(long currentCents, long bidCents); }

record MinIncrement(long stepCents) implements BidRule {
    public boolean accepts(long current, long bid) { return bid >= current + stepCents; }
}

interface BidListener { void onNewHighBid(String auctionId, String bidder, long cents); }

final class Auction {
    private final String id;
    private final BidRule rule;                                       // Strategy, immutable
    private final List<BidListener> listeners = new CopyOnWriteArrayList<>();
    private long highCents;                                           // guarded by this
    private String highBidder;                                        // guarded by this

    Auction(String id, BidRule rule, long reserveCents) {
        this.id = id; this.rule = rule; this.highCents = reserveCents;
    }

    void subscribe(BidListener l) { listeners.add(l); }

    boolean bid(String bidder, long cents) {
        synchronized (this) {
            if (!rule.accepts(highCents, cents)) return false;
            highCents = cents;
            highBidder = bidder;
        }
        listeners.forEach(l -> l.onNewHighBid(id, bidder, cents));    // outside the lock
        return true;
    }
}` },
      { type: "keypoints", title: "Why it is safe, and the one subtlety", items: [
        "The check against the current high bid and the update of both fields happen in one <code>synchronized</code> block, so two racing bids can't both win.",
        "<code>BidRule</code> implementations are immutable records, so the strategy can be shared without locking.",
        "<code>CopyOnWriteArrayList</code> lets listeners subscribe while another thread is publishing, with no <code>ConcurrentModificationException</code>. It suits lists that are read far more often than they change.",
        "Listeners are called <em>after</em> the lock is released. A slow or misbehaving listener can't stall other bidders, and a listener that calls back into the auction can't deadlock it.",
        "The subtlety: two quick bids can notify out of order, so a listener might see 120 after 130. If order matters, include a sequence number, or publish through a single-threaded executor."
      ] }
    ]
  },
  {
    id: "choosing-under-pressure",
    title: "Choosing patterns under time pressure",
    kicker: "Interview",
    blocks: [
      { type: "text", html: `<p>The interviewer expects you to name a pattern in one sentence, tie it to a requirement, write its smallest version, and mention one cost. They do not expect a catalogue. Strategy, State, Observer, Factory and Builder cover most LLD problems; Decorator, Composite, Command and Chain of Responsibility come up in specific prompts such as add-ons, file systems, undo and approval flows.</p>` },
      { type: "list", title: "Mistakes that cost points", items: [
        "<strong>Pattern stacking:</strong> a factory that returns a builder for a singleton, all for one class with two fields.",
        "<strong>Singleton by default:</strong> making the main system class a singleton because 'there is only one'. Create one and inject it.",
        "<strong>A full State hierarchy for three states and two actions:</strong> an enum and a switch is shorter and clearer; mention State as the refactor when states multiply.",
        "<strong>Thread-unsafe Observer:</strong> a plain list mutated while being iterated, or listeners called while holding the subject's lock.",
        "<strong>Template Method where steps vary independently:</strong> inheritance locks the combinations in at compile time; a Strategy per step composes freely.",
        "<strong>Confusing Strategy and State:</strong> in Strategy the caller picks the behaviour; in State the object's own transitions pick it."
      ] },
      { type: "callout", tone: "interview", html: `<p>If asked why you didn't use more patterns, don't apologise. Point to where variation could appear later, such as pricing or notification channels, and say which pattern you would introduce there and when. Knowing when not to use a pattern is the stronger signal.</p>` }
    ]
  }
];
