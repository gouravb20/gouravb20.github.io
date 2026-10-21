// LLD problem breakdown: Inventory Management. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `inventory-management`, part: 3, number: 0, difficulty: `hard`,
    title: `Inventory Management: stock across warehouses, atomic transfers, low-stock alerts`,
    overview: `A company keeps products in a fixed set of warehouses. The system receives stock, ships it for orders, answers "which warehouses can fulfil this?", moves stock between warehouses, and tells someone when a warehouse is running low on a product. Two rules make it hard: stock must <strong>never go negative</strong>, even when two orders race for the last units, and a <strong>transfer must be atomic</strong>, even when transfers run in both directions at once. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement the normal path and then the edge cases (comparing a weak, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The design lands on a <strong>lock per warehouse</strong>, transfers that take both locks in <strong>id order</strong>, and low-stock alerts as an <strong>Observer</strong> that fires once per threshold crossing and is called after the locks are released.`,
    source: { title: `Hello Interview: Inventory Management (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/inventory-management` },
    problem: [
      { id: `understanding`, title: `What an inventory system does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Stock arrives at warehouses on trucks and leaves when orders ship. Sales wants to know where a product can be shipped from; operations moves stock between sites to balance it; buyers want a warning before a warehouse runs out. Many of these things happen at the same moment, from different threads, against the same counts.</p>` },
        { type: `text`, html: `<p>The prompt is usually short: <em>"Design an inventory system that tracks products across several warehouses, supports adding, removing and transferring stock, and alerts when stock runs low."</em> It hides the two hard parts (no negative stock under concurrency, and atomic transfers), so the first minutes go into making them explicit.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the system must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Each answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Is the set of warehouses fixed, or can sites be added at run time?`, `Fixed, configured at start`, `An immutable warehouse map that needs no lock to read`],
          [`Is a low-stock threshold global per product, or per product per warehouse?`, `Per product per warehouse`, `Thresholds live inside each warehouse, next to the stock they watch`],
          [`What happens when a removal asks for more than is there?`, `Reject it and change nothing`, `Check before writing; short stock returns <code>false</code>, while bad arguments (unknown warehouse, quantity 0) throw`],
          [`Alert on every low reading, or once?`, `Once, when stock drops below the threshold; again only after it has been restocked`, `Compare before and after each change: alert on the crossing`],
          [`How are alerts delivered?`, `Call a pluggable listener; email or paging is someone else's job`, `An <code>AlertListener</code> interface (Observer)`],
          [`Do orders reserve stock first, or does removing stock fulfil the order?`, `Removing fulfils it; reservations are a follow-up`, `No reserved count in the core design`],
          [`Can one order be split across warehouses?`, `Not in the core: availability lists warehouses that can fulfil it alone`, `<code>warehousesWith(product, qty)</code> returns single warehouses`],
          [`Many threads at once, including transfers in both directions?`, `Yes`, `Per-warehouse locks, and a fixed lock order for transfers`]
        ] },
        { type: `callout`, tone: `insight`, title: `Must a transfer be atomic, and can transfers run both ways at once?`, html: `<p>This is the question that shapes the whole design. If a transfer is just "remove here, add there" as two calls, another thread can see the units in neither warehouse, or the add can fail after the remove. Making it atomic means holding both warehouses' locks at once, and as soon as two locks are held together, an A-to-B transfer and a B-to-A transfer can deadlock. Asking it out loud shows you have spotted the real problem; the answer is always "yes, atomic, and yes, concurrent".</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. Track the stock of each product in each of a fixed set of warehouses,
     configured at start.
  2. Add stock to a warehouse (a shipment received).
  3. Remove stock from a warehouse (an order fulfilled).
  4. Availability: for a product and quantity, list the warehouses that can
     fulfil it on their own.
  5. Transfer stock from one warehouse to another, atomically.
  6. Low-stock alerts: a threshold per product per warehouse; when stock drops
     below it, notify pluggable listeners once per drop.
  7. Stock never goes negative: a removal or transfer that would need more than
     is there returns false and changes nothing.
  8. Bad arguments (unknown warehouse, quantity of 0 or less, a transfer to the
     same warehouse) are rejected with an exception.
  9. Safe under concurrent use, including transfers in opposite directions.

Out of scope
  - The product catalogue, prices, orders and payments
  - Reservations and stock in transit (follow-ups)
  - Persistence and multiple servers` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules. Plenty of nouns appear (product, warehouse, stock, order, threshold, alert, transfer), and most of them should not become classes. Test each one.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Product`, `A <code>String</code> id, not a class`, `The catalogue is out of scope; here a product is only a key in a stock map`],
          [`Stock item (product plus count)`, `A map entry, not a class`, `A count with no behaviour; <code>Map&lt;String, Integer&gt;</code> inside a warehouse says it all`],
          [`Order`, `Not a class`, `Out of scope; an order arrives as a call to <code>removeStock</code>`],
          [`Threshold`, `A number in a map`, `Per product per warehouse, so it sits beside the stock in the warehouse`],
          [`Transfer`, `A method, not a class (for now)`, `An atomic move has no lifetime. It earns a class only when stock spends days in transit (a follow-up)`],
          [`Warehouse`, `A class`, `Holds stock and thresholds, enforces "never negative", and is the unit of locking`],
          [`InventoryManager`, `A class`, `The entry point: finds warehouses, takes locks, coordinates transfers, delivers alerts`],
          [`Low-stock alert`, `A record plus a listener interface`, `The alert is a value describing one crossing; the listener is the pluggable Observer`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`InventoryManager`, `The facade. Validates arguments, looks up warehouses, takes the right locks (one for add and remove, two in id order for a transfer), and delivers alerts after releasing them.`],
          [`Warehouse`, `Stock and thresholds for one site, and the lock that guards them. Applies a change and reports a threshold crossing. Never locks by itself: the manager decides how long a lock is held.`],
          [`LowStockAlert`, `An immutable record of one crossing: warehouse, product, the new quantity and the threshold.`],
          [`AlertListener`, `The interface outside code implements to hear about low stock.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Saying why a noun is <em>not</em> a class is worth as much as finding the ones that are. "Order is out of scope, so it's just a call to removeStock; Transfer is a method until it needs a lifetime" tells the interviewer you are scoping, not forgetting.</p>` }
      ] },
      { id: `manager-design`, title: `Class design: InventoryManager`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What the manager remembers`], rows: [
          [`"A fixed set of warehouses, configured at start"`, `<code>Map&lt;String, Warehouse&gt;</code>, built once and never changed`],
          [`"Notify pluggable listeners"`, `The list of <code>AlertListener</code>s`],
          [`"Safe under concurrent use"`, `Nothing extra: each warehouse carries its own lock`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Receive a shipment`, `<code>void addStock(String warehouseId, String productId, int qty)</code>`],
          [`Fulfil an order`, `<code>boolean removeStock(String warehouseId, String productId, int qty)</code>`],
          [`Move stock between sites`, `<code>boolean transfer(String productId, String fromId, String toId, int qty)</code>`],
          [`Where can this be shipped from?`, `<code>List&lt;String&gt; warehousesWith(String productId, int qty)</code>`],
          [`Read one count`, `<code>int quantity(String warehouseId, String productId)</code>`],
          [`Configure alerts`, `<code>void setThreshold(String warehouseId, String productId, int threshold)</code>, <code>void addListener(AlertListener l)</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Short stock returns false; bad arguments throw.</strong> Running out is an everyday business outcome the caller must handle, so it is a return value. An unknown warehouse or a quantity of 0 is a caller bug, so it is an exception.`,
          `<strong>The manager owns the locking, not the warehouse.</strong> A transfer must hold two warehouses' locks across a check and two writes. If every <code>Warehouse</code> method locked itself, the pair could not be made atomic. So warehouse methods assume the lock is held, and the manager takes it.`,
          `<strong>Availability is a snapshot.</strong> <code>warehousesWith</code> answers "who could ship this right now"; by the time the caller acts, it may have changed. The removal itself re-checks, so a stale answer can never oversell.`
        ] },
        { type: `text`, html: `<p>The biggest decision is <strong>how a stock update stays correct when several threads touch the same counts</strong>. Three options:</p>` },
        { type: `compare`, items: [
          { title: `Weak: read, check, then write`, tone: `warn`, html: `<p>Use a <code>ConcurrentHashMap</code> and do <code>get</code>, compare, <code>put</code>. Each call is thread-safe, but the three steps are not one step: two orders both read 8, both pass the check, and nine units are sold from eight. The concurrent map gives a false sense of safety.</p>` },
          { title: `Better: one global lock`, tone: `info`, html: `<p>Synchronize every operation on the manager. Correct, and transfers are trivially atomic with no deadlock possible. But a shipment in Dallas waits for a stock count in Berlin: the whole company runs one operation at a time.</p>` },
          { title: `Strong: a lock per warehouse, transfers in id order`, tone: `ok`, html: `<p>The rule "never negative" is per warehouse, so the warehouse is the natural unit of locking. Operations on different warehouses run in parallel. A transfer takes both locks, always lower id first, so A-to-B and B-to-A can never wait on each other in a cycle.</p>` }
        ] },
        { type: `text`, html: `<p>We take a lock per warehouse. A <code>ReentrantLock</code> rather than <code>synchronized</code> because the manager locks warehouses from outside and a follow-up may want <code>tryLock</code> with a timeout; nested <code>synchronized</code> blocks would work just as well for the core. Locking per product is finer still, and is a follow-up for when one hot warehouse shows contention.</p>` }
      ] },
      { id: `warehouse-design`, title: `Class design: Warehouse and alerts`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a warehouse remembers`], rows: [
          [`"Track the stock of each product"`, `<code>Map&lt;String, Integer&gt; stock</code>: product to units on hand; a missing product means 0`],
          [`"A threshold per product per warehouse"`, `<code>Map&lt;String, Integer&gt; thresholds</code>`],
          [`"Safe under concurrent use"`, `A <code>ReentrantLock</code> guarding both maps`]
        ] },
        { type: `table`, headers: [`Need`, `Method on Warehouse (caller holds the lock)`], rows: [
          [`Read a count`, `<code>int quantity(String productId)</code>`],
          [`Receive`, `<code>void add(String productId, int qty)</code>`],
          [`Ship, and report a crossing`, `<code>void remove(String productId, int qty, List&lt;LowStockAlert&gt; alerts)</code>`],
          [`Configure`, `<code>void setThreshold(String productId, int threshold)</code>`]
        ] },
        { type: `text`, html: `<p>The second decision is <strong>when and where a low-stock alert fires</strong>.</p>` },
        { type: `compare`, items: [
          { title: `Weak: alert whenever stock is below`, tone: `warn`, html: `<p>After every removal, if <code>stock &lt; threshold</code>, notify. Simple, but a warehouse sitting at 3 with a threshold of 5 alerts on every order, and the buyer starts ignoring the alerts.</p>` },
          { title: `Better: alert on the crossing, from inside the lock`, tone: `info`, html: `<p>Alert only when <code>before &gt;= threshold &gt; after</code>: one alert per drop, re-armed automatically by restocking. But the listener runs while the warehouse lock is held: a listener that sends an email stalls every order at that warehouse, and one that calls back into the manager from another thread can deadlock.</p>` },
          { title: `Strong: detect under the lock, deliver after it`, tone: `ok`, html: `<p><code>remove</code> appends a <code>LowStockAlert</code> to a list while the lock is held; the manager calls listeners only after unlocking. Detection is exact because it sees before and after atomically; delivery can be as slow as it likes.</p>` }
        ] },
        { type: `code`, lang: `java`, title: `LowStockAlert and AlertListener`, code: `/** One crossing below a threshold: built under the warehouse lock, delivered after it is released. */
record LowStockAlert(String warehouseId, String productId, int quantity, int threshold) {}

/** The Observer. Implementations may be slow or throw; the manager calls them outside every lock. */
interface AlertListener {
    void onLowStock(LowStockAlert alert);
}` },
        { type: `keypoints`, items: [
          `<strong>A record, not four arguments.</strong> Adding a field later (a timestamp, a reorder quantity) doesn't break every listener.`,
          `<strong>Setting a threshold doesn't alert.</strong> Only stock changes cross a threshold. If stock is already below a new threshold, the next restock above it arms the alert; say so if asked.`,
          `<strong>Alerts from different threads can arrive out of order,</strong> because delivery happens outside the lock. Each alert carries the quantity at the moment of the crossing, so a listener can still make sense of it.`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class InventoryManager {
    private final Map<String, Warehouse> warehouses;         // fixed at start, never modified
    private final List<AlertListener> listeners;             // a CopyOnWriteArrayList

    InventoryManager(Collection<String> warehouseIds);
    void addListener(AlertListener listener);
    void setThreshold(String warehouseId, String productId, int threshold);
    void addStock(String warehouseId, String productId, int qty);
    boolean removeStock(String warehouseId, String productId, int qty);         // false if short
    boolean transfer(String productId, String fromId, String toId, int qty);    // atomic; false if short
    int quantity(String warehouseId, String productId);
    List<String> warehousesWith(String productId, int qty);                     // a snapshot
}

final class Warehouse {
    final String id;
    final ReentrantLock lock;                                // guards both maps
    private final Map<String, Integer> stock;                // product -> units on hand
    private final Map<String, Integer> thresholds;           // product -> low-stock level

    int quantity(String productId);                          // every method: caller holds lock
    void add(String productId, int qty);
    void remove(String productId, int qty, List<LowStockAlert> alerts);
    void setThreshold(String productId, int threshold);
}

record LowStockAlert(String warehouseId, String productId, int quantity, int threshold) {}
interface AlertListener { void onLowStock(LowStockAlert alert); }` },
        { type: `text`, html: `<p>The manager coordinates and locks; the warehouse holds data and enforces its rule; alerts flow out through an interface. There is no Singleton: tests build as many managers as they like, and the application creates one and passes it to whoever needs it.</p>` }
      ] },
      { id: `warehouse-impl`, title: `Implementation: the warehouse`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method write the normal path first, then the edge cases. The warehouse is small: read a count, add, remove with crossing detection. Edge cases: a product never seen (count 0), removing more than is there (a guard, since the manager checks first), and an add that would overflow an <code>int</code>.</p>` },
        { type: `code`, lang: `java`, title: `Warehouse`, code: `final class Warehouse {
    final String id;
    final ReentrantLock lock = new ReentrantLock();
    private final Map<String, Integer> stock = new HashMap<>();        // guarded by lock
    private final Map<String, Integer> thresholds = new HashMap<>();   // guarded by lock

    Warehouse(String id) { this.id = id; }

    // Every method below assumes the caller holds lock; the manager decides how long it is held.

    int quantity(String productId) { return stock.getOrDefault(productId, 0); }   // unknown product: 0

    void setThreshold(String productId, int threshold) { thresholds.put(productId, threshold); }

    /** Receiving. addExact throws on overflow before merge writes, so a failed add changes nothing. */
    void add(String productId, int qty) { stock.merge(productId, qty, Math::addExact); }

    /** Shipping. The caller has checked quantity() under the same lock; the check here is only a guard. */
    void remove(String productId, int qty, List<LowStockAlert> alerts) {
        int before = quantity(productId);
        if (before < qty) throw new IllegalStateException("stock would go negative");   // a caller bug
        int after = before - qty;
        stock.put(productId, after);
        Integer t = thresholds.get(productId);
        if (t != null && before >= t && after < t)                         // crossed downward: once per drop
            alerts.add(new LowStockAlert(id, productId, after, t));
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Plain <code>HashMap</code>s are enough</strong> because every access happens under the warehouse lock. A <code>ConcurrentHashMap</code> here would add cost and suggest a safety the code doesn't rely on.`,
          `<strong>The crossing test needs both numbers.</strong> <code>before &gt;= t &amp;&amp; after &lt; t</code> fires once when stock drops through the threshold; a restock to <code>t</code> or more re-arms it without any extra flag.`,
          `<strong>Adding never alerts.</strong> Stock only crosses downward on a removal, so <code>add</code> has no alert parameter.`
        ] }
      ] },
      { id: `manager-impl`, title: `Implementation: stock, availability and alerts`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>The normal path for every single-warehouse operation is the same: validate, find the warehouse, lock, act, unlock, deliver alerts. The edge case that matters most is two orders racing for the last units, and it is worth showing the broken version first, because it looks correct.</p>` },
        { type: `code`, lang: `java`, title: `Why read-then-write oversells`, code: `// Broken: a concurrent map makes each call atomic, but not the pair.
ConcurrentHashMap<String, Integer> stock = new ConcurrentHashMap<>();

boolean removeStock(String productId, int qty) {
    int have = stock.getOrDefault(productId, 0);   // order A and order B both read 8
    if (have < qty) return false;                  // both pass: 8 >= 5 and 8 >= 4
    stock.put(productId, have - qty);              // A writes 3, B writes 4: nine units sold from eight
    return true;
}` },
        { type: `text`, html: `<p>The fix is not a cleverer map; it is putting the check and the write under one lock. With the warehouse lock held, whichever order gets it first sees 8 and ships; the second sees what is left and gets <code>false</code>.</p>` },
        { type: `code`, lang: `java`, title: `InventoryManager: stock, availability and alerts`, code: `final class InventoryManager {
    private final Map<String, Warehouse> warehouses;                         // fixed at start, read without locks
    private final List<AlertListener> listeners = new CopyOnWriteArrayList<>();

    InventoryManager(Collection<String> warehouseIds) {
        Map<String, Warehouse> m = new HashMap<>();
        for (String id : warehouseIds) m.put(id, new Warehouse(id));
        this.warehouses = Map.copyOf(m);
    }

    void addListener(AlertListener l) { listeners.add(Objects.requireNonNull(l)); }

    void setThreshold(String warehouseId, String productId, int threshold) {
        if (threshold < 0) throw new IllegalArgumentException("threshold must not be negative");
        Warehouse w = get(warehouseId);
        w.lock.lock();
        try { w.setThreshold(productId, threshold); } finally { w.lock.unlock(); }
    }

    void addStock(String warehouseId, String productId, int qty) {
        Warehouse w = get(warehouseId);
        requirePositive(qty);
        w.lock.lock();
        try { w.add(productId, qty); } finally { w.lock.unlock(); }
    }

    /** Fulfils an order from one warehouse. False, with nothing changed, if there isn't enough stock. */
    boolean removeStock(String warehouseId, String productId, int qty) {
        Warehouse w = get(warehouseId);
        requirePositive(qty);
        List<LowStockAlert> alerts = new ArrayList<>(1);
        boolean ok;
        w.lock.lock();
        try {
            ok = w.quantity(productId) >= qty;                              // check and act under one lock
            if (ok) w.remove(productId, qty, alerts);
        } finally { w.lock.unlock(); }
        deliver(alerts);                                                    // after unlocking
        return ok;
    }

    int quantity(String warehouseId, String productId) {
        Warehouse w = get(warehouseId);
        w.lock.lock();
        try { return w.quantity(productId); } finally { w.lock.unlock(); }
    }

    /** Warehouses that can fulfil qty on their own, sorted by id. Each is read under its own lock: a snapshot. */
    List<String> warehousesWith(String productId, int qty) {
        requirePositive(qty);
        List<String> out = new ArrayList<>();
        for (Warehouse w : warehouses.values()) {
            w.lock.lock();
            try { if (w.quantity(productId) >= qty) out.add(w.id); } finally { w.lock.unlock(); }
        }
        Collections.sort(out);
        return out;
    }

    private void deliver(List<LowStockAlert> alerts) {
        for (LowStockAlert a : alerts)
            for (AlertListener l : listeners) {
                try { l.onLowStock(a); }
                catch (RuntimeException e) { /* log it; one failing listener must not stop the rest */ }
            }
    }

    private Warehouse get(String id) {
        Warehouse w = warehouses.get(id);
        if (w == null) throw new IllegalArgumentException("unknown warehouse " + id);
        return w;
    }

    private static void requirePositive(int qty) {
        if (qty <= 0) throw new IllegalArgumentException("quantity must be positive");
    }
}` },
        { type: `list`, title: `Edge cases the code handles`, items: [
          `Two orders for the last units: the lock serialises them; one ships, the other gets <code>false</code> and nothing changes.`,
          `A removal larger than the stock: <code>false</code>, stock untouched. Negative stock is impossible because the check and the write share a lock.`,
          `Quantity 0 or negative, unknown warehouse, negative threshold: <code>IllegalArgumentException</code> before any lock is taken.`,
          `A product never received: its count is 0, so it can't be removed and isn't listed as available.`,
          `A listener that throws: caught per listener, so the stock change (already done) stands and the other listeners still hear about it.`,
          `Adding a listener while alerts are being delivered: <code>CopyOnWriteArrayList</code> lets delivery iterate a stable snapshot.`
        ] },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety, in one sentence per field: the warehouse map is immutable and safely published through a <code>final</code> field, so lookups need no lock; each warehouse's maps are touched only while its lock is held; the listener list is a <code>CopyOnWriteArrayList</code>, written rarely and read on every alert. Listeners are called with no lock held, so a slow or re-entrant listener can neither stall stock operations nor deadlock them.</p>` }
      ] },
      { id: `transfer-impl`, title: `Implementation: transfers between warehouses`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>A transfer is the one operation that touches two warehouses, and it has to look like a single step to everyone else: nobody may see the units in neither warehouse or in both. That means holding both locks across the check, the debit and the credit. Edge cases: the source is short, source and destination are the same, and two transfers run in opposite directions at the same moment.</p>` },
        { type: `problem`, html: `<p>Lock the source first, then the destination, and run <code>transfer(east &rarr; west)</code> alongside <code>transfer(west &rarr; east)</code>. The first takes east and waits for west; the second takes west and waits for east. Neither can continue, forever.</p>` },
        { type: `code`, lang: `java`, title: `InventoryManager.transfer`, code: `/** Moves qty from one warehouse to another atomically. False, with nothing changed, if the source is short. */
boolean transfer(String productId, String fromId, String toId, int qty) {
    requirePositive(qty);
    if (fromId.equals(toId)) throw new IllegalArgumentException("source and destination are the same");
    Warehouse from = get(fromId), to = get(toId);
    Warehouse first = fromId.compareTo(toId) < 0 ? from : to;          // one global order: by id
    Warehouse second = first == from ? to : from;
    List<LowStockAlert> alerts = new ArrayList<>(1);
    boolean ok;
    first.lock.lock();
    try {
        second.lock.lock();
        try {
            ok = from.quantity(productId) >= qty;
            if (ok) {
                to.add(productId, qty);                    // can only fail on overflow, before anything changed
                from.remove(productId, qty, alerts);       // cannot fail: checked above, both locks held
            }
        } finally { second.lock.unlock(); }
    } finally { first.lock.unlock(); }
    deliver(alerts);                                       // the destination only gains, so only the source alerts
    return ok;
}` },
        { type: `keypoints`, items: [
          `<strong>Lock order is by warehouse id, not by direction.</strong> Every transfer between east and west locks east first. A thread that holds nothing waits for east; a thread that holds east can always get west. No cycle can form, so no deadlock.`,
          `<strong>Credit before debit, after the check.</strong> The only way <code>add</code> can fail is overflow, which throws before it writes; doing it first means a failure leaves both warehouses untouched and no rollback is ever needed.`,
          `<strong>Same warehouse is rejected,</strong> not treated as a no-op: locking one <code>ReentrantLock</code> twice would succeed, but "move stock to where it already is" is almost certainly a caller bug.`,
          `<strong>The same rule covers anything that locks several warehouses,</strong> such as an order split across sites: sort the warehouses by id and lock in that order.`
        ] }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk a concrete scenario call by call before the interviewer does. Two warehouses, <code>east</code> and <code>west</code>; the widget threshold is 5 in east and 2 in west. The trace below is the output of running this design (ported to a small script) with a listener that prints each alert; the concurrent parts were run with a scheduler that switches threads at every lock acquisition.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `setThreshold(east, widget, 5)      setThreshold(west, widget, 2)
addStock(east, widget, 8)          addStock(west, widget, 3)         east=8 west=3

Two orders race for east's last units
  without a lock: A reads 8, B reads 8, A writes 3, B writes 4: 9 units sold from 8
  with the east lock, order A gets it first:
removeStock(east, widget, 5)  -> true    east=3   8 >= 5; 8 -> 3 crosses 5
  ALERT east widget: 3 left, threshold 5          delivered after A unlocks
removeStock(east, widget, 4)  -> false   east=3   order B sees 3 < 4; nothing changes

warehousesWith(widget, 3)     -> [east, west]

transfer(widget, west -> east, 3) -> true         locks east, then west (id order)
  ALERT west widget: 0 left, threshold 2          east=6 west=0

T1 transfer(east -> west, 2) and T2 transfer(west -> east, 1) at the same time
  source-first locking:
    T1 locks east, T2 locks west, T1 waits for west, T2 waits for east: DEADLOCK
  id-order locking (east before west):
    T1 locks east
    T2 waits for east
    T1 locks west
    T1 moves 2: east=4 west=2, unlocks
    T2 locks east
    ALERT east widget: 4 left, threshold 5        T1 delivers after unlocking
    T2 locks west
    T2 moves 1: west=1 east=5, unlocks
    ALERT west widget: 1 left, threshold 2
  both return true; east=5 west=1, total 6 = 11 received - 5 shipped

removeStock(east, widget, 1)  -> true    east=4   5 -> 4 crosses again (re-armed at 5)
  ALERT east widget: 4 left, threshold 5
removeStock(east, widget, 1)  -> true    east=3   already below: no alert
removeStock(east, widget, 10) -> false   east=3   short: nothing changes
addStock(east, widget, 0)       -> IllegalArgumentException: quantity must be positive
transfer(widget, east, east, 1) -> IllegalArgumentException: source and destination are the same
removeStock(north, widget, 1)   -> IllegalArgumentException: unknown warehouse north` },
        { type: `keypoints`, items: [
          `The race for the last units sold 5, not 9: the order that got the lock second saw the real count and was refused.`,
          `With id-order locking, T2 waited for east while holding nothing, so T1 could always finish. Source-first locking deadlocked on the very same pair of calls.`,
          `Alerts fired once per drop: east alerted at 8 to 3, again at 6 to 4 and 5 to 4 after restocks re-armed it, and not at 4 to 3. Every alert was delivered after the lock was released, even mid-way through another thread's transfer.`,
          `Units are conserved: 11 received, 5 shipped, 6 left across both warehouses after three transfers.`
        ] }
      ] }
    ],
    levels: levels(
      [`Warehouses with a stock map, add and remove that refuse to go negative, and an availability query.`, `A listener interface for low-stock alerts and a per-warehouse threshold.`, `Can explain, with a hint, why two threads removing at once need a lock.`],
      [`A lock per warehouse with the check and the write under it, and can say why a <code>ConcurrentHashMap</code> alone still oversells.`, `Atomic transfers with locks taken in a fixed order, and explains the deadlock that ordering prevents.`, `Alerts on the crossing, detected under the lock and delivered after it; short stock as a return value, bad input as an exception.`, `Names reservations as the fix for overselling while orders are in flight.`],
      [`Asks about transfer atomicity and opposite-direction transfers unprompted, and scopes reservations and in-transit stock as follow-ups.`, `Weighs lock granularity (global, per warehouse, per product) against contention and the cost of ordering many locks.`, `Designs reservations with expiry and a two-step transfer without restructuring the core, and explains availability as a snapshot.`, `Maps the design to a database (conditional updates, row locks taken in key order) and proposes stress tests that would catch both overselling and deadlock.`]
    ),
    concepts: [
      { term: `Non-negative invariant`, def: `A removal checks the count and writes the new one under the same lock; short stock returns false and changes nothing.`, why: `Failed operations leave no trace, and overselling is impossible.` },
      { term: `Check-then-act race`, def: `Reading a value, deciding, then writing, with another thread able to write in between.`, why: `The classic overselling bug; a thread-safe map does not prevent it.` },
      { term: `Lock per warehouse`, def: `Each warehouse has a <code>ReentrantLock</code> guarding its stock and thresholds.`, why: `The invariant is per warehouse, so warehouses run in parallel with a simple unit of locking.` },
      { term: `Ordered lock acquisition`, def: `Anything that needs several warehouse locks takes them in warehouse-id order.`, why: `No cycle of waiting threads can form, so opposite transfers can't deadlock.` },
      { term: `Atomic transfer`, def: `Check, credit and debit all happen while both locks are held.`, why: `No one sees the units in neither or both warehouses, and no rollback is needed.` },
      { term: `Threshold crossing`, def: `Alert when <code>before &gt;= threshold &gt; after</code>.`, why: `One alert per drop, re-armed by restocking, instead of one per order while low.` },
      { term: `Notify outside the lock`, def: `Collect alerts while locked; call listeners after unlocking.`, why: `Slow or re-entrant listeners can't stall or deadlock stock operations.` },
      { term: `Availability snapshot`, def: `<code>warehousesWith</code> reads each warehouse under its own lock, one after another.`, why: `Cheap and good enough for routing; the removal re-checks, so a stale answer never oversells.` }
    ],
    interview: [
      { q: `Stock is in a ConcurrentHashMap. Why can it still go wrong?`, a: `Each get and put is atomic on its own, but removing stock is three steps: read, check, write. Two orders can both read 8, both decide there is enough, and write 3 and 4, selling nine units from eight. The check and the write have to happen under one lock (or as one atomic compute on a single key). A thread-safe container doesn't make a sequence of calls atomic.`, diff: `medium` },
      { q: `How do you stop transfers from deadlocking?`, a: `Deadlock needs a cycle: one transfer holds A and waits for B while another holds B and waits for A. Take the two locks in a global order, by warehouse id, regardless of direction. Both transfers then go for A first; whoever loses waits while holding nothing, so the winner always finishes. The same rule extends to any operation that needs several warehouses: sort by id, lock in that order.`, diff: `medium` },
      { q: `Why does the manager take the locks instead of each Warehouse method locking itself?`, a: `Because a transfer has to hold two warehouses across a check and two writes. If add and remove each locked internally, the transfer could only call them one after another, and another thread could see or change the stock in between. So warehouse methods assume the lock is held and the manager decides the scope. The cost is a rule callers must follow, which is why the warehouse is package-private and only the manager touches it.`, diff: `medium` },
      { q: `Why fire alerts on the crossing and not whenever stock is low?`, a: `If every removal while low fired an alert, a warehouse sitting below its threshold would alert on every order, and people would learn to ignore it. Comparing before and after each change gives one alert per drop. Restocking to the threshold or above re-arms it with no extra state.`, diff: `easy` },
      { q: `Why call listeners after releasing the lock?`, a: `A listener might send an email, hit a webhook or call back into the manager. Under the lock, that holds up every operation on the warehouse for as long as the listener takes, and a listener that calls into the same warehouse from another thread, or waits on something that does, can deadlock. Detection needs the lock (it compares before and after atomically); delivery doesn't. Collect alerts while locked, deliver after, or hand them to an executor.`, diff: `medium` },
      { q: `Why return false for short stock but throw for a quantity of 0?`, a: `Running out is a normal outcome the caller must handle on every order, so it belongs in the return type where it can't be forgotten. A quantity of 0, an unknown warehouse, or a transfer to the same warehouse means the caller has a bug; an exception makes that loud. Mixing the two (throwing for short stock) pushes ordinary control flow into exception handling.`, diff: `easy` },
      { q: `How would you prevent overselling between "order placed" and "order shipped"?`, a: `Split stock into on hand and reserved. Placing an order reserves units: under the warehouse lock, check on hand minus reserved, then increase reserved, and return a reservation with an id and an expiry. Shipping commits it (both counts drop), cancelling releases it, and a sweeper releases expired holds so abandoned carts don't lock stock forever. Availability then uses on hand minus reserved, so two orders can't both be promised the same units.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Inventory in one screen`, type: `code`, lang: `java`, body: `record LowStockAlert(String warehouseId, String productId, int quantity, int threshold) {}
interface AlertListener { void onLowStock(LowStockAlert alert); }

final class Warehouse {                       // every method: caller holds lock
    ReentrantLock lock; Map<String, Integer> stock, thresholds;
    void add(String product, int qty);        // addExact: overflow throws before writing
    void remove(String product, int qty, List<LowStockAlert> alerts);   // before >= t > after: alert
}

final class InventoryManager {
    Map<String, Warehouse> warehouses;        // immutable; CopyOnWriteArrayList of listeners
    boolean removeStock(String wh, String product, int qty);   // lock; check and remove; unlock; deliver
    boolean transfer(String product, String from, String to, int qty);   // lock both in id order; credit, debit
    List<String> warehousesWith(String product, int qty);      // per-warehouse snapshot, sorted
}
// short stock: false; bad arguments: IllegalArgumentException; listeners: called after unlocking` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Overselling while orders are in flight`, `Warehouse gains reserved counts and Reservation holds with expiry (Deep Dives)`],
        [`Stock on a truck for days`, `A Transfer class with IN_TRANSIT, RECEIVED, CANCELLED; ship and receive on the manager (Deep Dives)`],
        [`One hot warehouse contends`, `Locks per (warehouse, product); transfers still order by warehouse id (Deep Dives)`],
        [`Which warehouse ships an order`, `A FulfilmentStrategy; multi-warehouse orders lock all sites in id order (Deep Dives)`],
        [`Proving it is thread-safe`, `Stress tests asserting conservation, no overselling and termination (Deep Dives)`],
        [`Alerts by email or Slack`, `A new AlertListener; nothing else changes`]
      ] }
    ],
    labs: []
  });
})();
