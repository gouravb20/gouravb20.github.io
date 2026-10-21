// LLD problem breakdown: Inventory Management. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `inventory-management`, part: 3, number: 0, difficulty: `hard`,
    title: `Inventory Management: stock across warehouses, atomic transfers, low-stock alerts`,
    overview: `Track product stock across a fixed set of warehouses: receive stock, ship it, find which warehouses can fulfil an order, transfer stock between warehouses, and alert when a warehouse runs low on a product. Two requirements make it hard: stock must <strong>never go negative</strong>, and everything must be <strong>thread-safe</strong>, including transfers that touch two warehouses at once. Alerts are an <strong>Observer</strong> with per-warehouse, per-product thresholds.`,
    source: { title: `Hello Interview: Inventory Management (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/inventory-management` },
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. Track stock of products across a fixed set of warehouses (configured at start).
  2. Add stock to a warehouse (receiving a shipment).
  3. Remove stock from a warehouse (fulfilling an order).
  4. Availability: for a product and quantity, which warehouses can fulfil it.
  5. Transfer stock between warehouses.
  6. Low-stock alerts: a threshold per product per warehouse; when stock drops
     below it, call a pluggable listener.
  7. Reject any operation that would make stock negative (validate before moving).
  8. Thread-safe under concurrent operations.

Out of scope
  - The product catalogue, orders and payments, persistence.` }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Fixed warehouses or dynamic?`, `Fixed, configured at start`, `An immutable warehouse map`],
          [`Thresholds global or per warehouse?`, `Per product per warehouse`, `Threshold map inside each warehouse`],
          [`How are alerts delivered?`, `Call a listener interface; delivery is someone else's job`, `Observer`],
          [`Negative stock?`, `Never: reject the operation`, `Validate before mutating`],
          [`Concurrency?`, `Yes, many operations at once`, `Locks, and lock ordering for transfers`],
          [`Alert every time stock is low, or once?`, `When it crosses below the threshold`, `Crossing detection`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `table`, headers: [`Class`, `Owns`], rows: [
          [`InventoryManager`, `Facade: warehouses by id, listeners; add, remove, transfer, availability`],
          [`Warehouse`, `Stock per product, thresholds per product, and its own lock`],
          [`AlertListener`, `Interface: onLowStock(warehouseId, productId, quantity, threshold)`],
          [`LowStockAlert`, `Record describing a crossing, collected under the lock and delivered after`]
        ] },
        { type: `keypoints`, items: [
          `<strong>A lock per warehouse.</strong> Operations on different warehouses run in parallel; the invariant (no negative stock) is per warehouse, so that's the natural unit.`,
          `<strong>Transfers lock both warehouses in a fixed order</strong> (by id), so A-to-B and B-to-A transfers can't deadlock, and the move is atomic: nobody sees the stock in neither or both places.`,
          `<strong>Alerts fire on crossing</strong> from at-or-above the threshold to below it, so a warehouse sitting at low stock doesn't spam alerts, and they are delivered <strong>after the lock is released</strong>, so a slow listener can't stall stock operations.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `void addStock(String warehouseId, String productId, int qty);
void removeStock(String warehouseId, String productId, int qty);     // throws if it would go negative
void transfer(String productId, String fromId, String toId, int qty); // atomic
List<String> warehousesWith(String productId, int qty);
int quantity(String warehouseId, String productId);
void setThreshold(String warehouseId, String productId, int threshold);
void addListener(AlertListener listener);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Warehouse`, code: `interface AlertListener {
    void onLowStock(String warehouseId, String productId, int quantity, int threshold);
}

record LowStockAlert(String warehouseId, String productId, int quantity, int threshold) {}

final class Warehouse {
    final String id;
    final ReentrantLock lock = new ReentrantLock();
    private final Map<String, Integer> stock = new HashMap<>();       // guarded by lock
    private final Map<String, Integer> thresholds = new HashMap<>();  // guarded by lock

    Warehouse(String id) { this.id = id; }

    int quantity(String product) { return stock.getOrDefault(product, 0); }    // caller holds lock

    void setThreshold(String product, int threshold) { thresholds.put(product, threshold); }

    /** Applies a change and returns an alert if stock crossed below the threshold. Caller holds lock. */
    Optional<LowStockAlert> change(String product, int delta) {
        int before = quantity(product);
        int after = before + delta;
        if (after < 0) throw new InsufficientStockException(id, product, before, -delta);
        stock.put(product, after);
        Integer t = thresholds.get(product);
        return (t != null && before >= t && after < t)
            ? Optional.of(new LowStockAlert(id, product, after, t))
            : Optional.empty();
    }
}

class InsufficientStockException extends RuntimeException {
    InsufficientStockException(String warehouse, String product, int have, int want) {
        super(warehouse + " has " + have + " of " + product + ", cannot remove " + want);
    }
}` },
        { type: `code`, lang: `java`, title: `InventoryManager`, code: `final class InventoryManager {
    private final Map<String, Warehouse> warehouses;                         // fixed at start
    private final List<AlertListener> listeners = new CopyOnWriteArrayList<>();

    InventoryManager(Collection<String> warehouseIds) {
        Map<String, Warehouse> m = new HashMap<>();
        for (String id : warehouseIds) m.put(id, new Warehouse(id));
        this.warehouses = Map.copyOf(m);
    }

    void addListener(AlertListener l) { listeners.add(l); }

    void setThreshold(String warehouseId, String productId, int threshold) {
        Warehouse w = get(warehouseId);
        w.lock.lock();
        try { w.setThreshold(productId, threshold); } finally { w.lock.unlock(); }
    }

    void addStock(String warehouseId, String productId, int qty)    { apply(warehouseId, productId, positive(qty)); }
    void removeStock(String warehouseId, String productId, int qty) { apply(warehouseId, productId, -positive(qty)); }

    void transfer(String productId, String fromId, String toId, int qty) {
        positive(qty);
        if (fromId.equals(toId)) throw new IllegalArgumentException("Source and destination are the same");
        Warehouse from = get(fromId), to = get(toId);
        Warehouse first = fromId.compareTo(toId) < 0 ? from : to;          // global lock order
        Warehouse second = first == from ? to : from;
        List<LowStockAlert> alerts = new ArrayList<>(1);
        first.lock.lock();
        try {
            second.lock.lock();
            try {
                from.change(productId, -qty).ifPresent(alerts::add);         // throws before any change if short
                to.change(productId, qty);
            } finally { second.lock.unlock(); }
        } finally { first.lock.unlock(); }
        notifyAll(alerts);
    }

    int quantity(String warehouseId, String productId) {
        Warehouse w = get(warehouseId);
        w.lock.lock();
        try { return w.quantity(productId); } finally { w.lock.unlock(); }
    }

    List<String> warehousesWith(String productId, int qty) {
        List<String> out = new ArrayList<>();
        for (Warehouse w : warehouses.values()) {
            w.lock.lock();
            try { if (w.quantity(productId) >= qty) out.add(w.id); } finally { w.lock.unlock(); }
        }
        Collections.sort(out);
        return out;                                                         // a snapshot: may change right after
    }

    private void apply(String warehouseId, String productId, int delta) {
        Warehouse w = get(warehouseId);
        Optional<LowStockAlert> alert;
        w.lock.lock();
        try { alert = w.change(productId, delta); } finally { w.lock.unlock(); }
        alert.ifPresent(a -> notifyAll(List.of(a)));                       // outside the lock
    }

    private void notifyAll(List<LowStockAlert> alerts) {
        for (LowStockAlert a : alerts)
            for (AlertListener l : listeners) {
                try { l.onLowStock(a.warehouseId(), a.productId(), a.quantity(), a.threshold()); }
                catch (RuntimeException e) { /* log; one bad listener must not affect others */ }
            }
    }

    private Warehouse get(String id) {
        Warehouse w = warehouses.get(id);
        if (w == null) throw new IllegalArgumentException("Unknown warehouse " + id);
        return w;
    }

    private static int positive(int qty) {
        if (qty <= 0) throw new IllegalArgumentException("Quantity must be positive");
        return qty;
    }
}` },
        { type: `callout`, tone: `warning`, html: `<p>Two details make or break this code. In <code>transfer</code>, the source is debited first: if that throws, nothing has changed, so no rollback is needed. And listeners are called after the locks are released: a listener that sends an email, or calls back into the manager, would otherwise hold up (or deadlock) every operation on that warehouse.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `Threshold for "widget" in WH-A is 10. Stock is 12. <code>removeStock(WH-A, widget, 3)</code>: 12 to 9, crossing below 10, so one alert fires after the lock is released.`,
          `<code>removeStock(WH-A, widget, 1)</code>: 9 to 8, already below, so no new alert.`,
          `<code>removeStock(WH-A, widget, 50)</code>: would go negative, so it throws and stock stays 8.`,
          `Two threads transfer A-to-B and B-to-A at once: both lock WH-A first (by id order), so one waits; no deadlock.`,
          `<code>warehousesWith(widget, 5)</code> locks each warehouse briefly and returns the ids that have at least 5, a snapshot that may change a moment later.`
        ] }
      ] }
    ],
    levels: levels(
      [`Warehouses with stock maps, add and remove with validation, and a simple availability query.`, `A listener interface for alerts.`],
      [`Locks per warehouse, ordered locking for transfers, validation that leaves state untouched on failure.`, `Alerts on threshold crossing, delivered outside the lock.`, `Reservations to prevent overselling while orders are in flight.`],
      [`Lock granularity trade-offs (per product striping), in-transit stock as a two-step transfer, consistency of availability answers, and how the model maps to a database with conditional updates.`]
    ),
    concepts: [
      { term: `Non-negative invariant`, def: `Compute the new quantity first and reject it if negative, before writing.`, why: `Failed operations leave stock unchanged.` },
      { term: `Lock per warehouse`, def: `Each warehouse has a ReentrantLock guarding its stock and thresholds.`, why: `Parallelism across warehouses with a simple, correct unit of locking.` },
      { term: `Ordered locking`, def: `Transfers lock the two warehouses in id order.`, why: `A-to-B and B-to-A can't form a deadlock cycle.` },
      { term: `Atomic transfer`, def: `Debit and credit happen while holding both locks.`, why: `No observer sees the units in neither or both warehouses.` },
      { term: `Threshold crossing`, def: `Alert when stock goes from at-or-above the threshold to below it.`, why: `One alert per drop, not one per operation while low.` },
      { term: `Notify outside the lock`, def: `Collect alerts under the lock, deliver them after unlocking.`, why: `Slow or re-entrant listeners can't stall stock operations.` },
      { term: `Reservations`, def: `Track reserved units separately: available = on hand minus reserved.`, why: `Prevents overselling between "order placed" and "order shipped".` }
    ],
    interview: [
      { q: `How do you prevent deadlock in transfer?`, a: `Deadlock needs a cycle: one transfer holds A and waits for B while another holds B and waits for A. Acquire the two warehouse locks in a global order, by warehouse id, regardless of transfer direction. Both transfers then try A first, so one waits without holding anything and no cycle can form.`, diff: `medium` },
      { q: `Why fire alerts only on crossing the threshold?`, a: `If you alert whenever stock is below the threshold, every removal while low fires again and managers get spammed. Comparing before and after each change and firing only when before >= threshold > after gives one alert per drop. Restocking above the threshold re-arms it naturally.`, diff: `easy` },
      { q: `Why call listeners after releasing the lock?`, a: `A listener might send an email, call a webhook or even call back into the inventory manager. Under the lock, that would block every operation on the warehouse for as long as the listener takes, and a call back into the same warehouse from another thread could deadlock. Collect alerts while locked, then deliver them; optionally hand them to an executor.`, diff: `medium` },
      { q: `How do you prevent overselling while orders are in progress?`, a: `Split stock into on-hand and reserved. When an order is placed, reserve(qty) atomically checks on-hand minus reserved and increases reserved; shipping commits the reservation (decreasing both); cancellation or expiry releases it. Availability queries use on-hand minus reserved, so two orders can't both count the same units.`, diff: `hard` },
      { q: `How would you model stock in transit between warehouses?`, a: `Make transfer two steps. ship() debits the source and creates a Transfer record in IN_TRANSIT state; receive() credits the destination and marks it RECEIVED; a cancelled shipment returns stock to the source. In-transit units count towards neither warehouse's availability, and the Transfer is a small state machine with its own id for tracking.`, diff: `hard` },
      { q: `Could you lock per product instead of per warehouse?`, a: `Yes: stripe locks by (warehouse, product), or use ConcurrentHashMap.compute for single-product updates, so different products in one warehouse don't contend. Transfers still need two locks in a fixed order. It adds complexity, so I'd start per warehouse and move to finer locks only if contention shows up.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Inventory in one screen`, type: `code`, lang: `java`, body: `final class Warehouse {
    ReentrantLock lock; Map<String, Integer> stock, thresholds;
    Optional<LowStockAlert> change(String product, int delta);   // reject negative; detect crossing
}
final class InventoryManager {
    void addStock(...); void removeStock(...);                   // lock one warehouse
    void transfer(String product, String from, String to, int q);  // lock both in id order
    List<String> warehousesWith(String product, int q);
    // alerts collected under lock, delivered after unlock
}` },
      { title: `Follow-ups`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Overselling`, `on-hand vs reserved; reserve, commit, release with expiry`],
        [`In-transit stock`, `Two-step transfer with a Transfer state machine`],
        [`Contention`, `Locks per (warehouse, product)`],
        [`Fulfilment choice`, `A strategy picks warehouses: nearest, cheapest, fewest splits`]
      ] }
    ],
    labs: []
  });
})();
