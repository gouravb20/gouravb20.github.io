// Deep dives: Inventory Management (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["inventory-management"] = {
  hook: `<p>Once stock stays non-negative, transfers are atomic and alerts fire once per drop, interviewers push on what real inventory systems struggle with: orders that are placed but not yet shipped, stock that spends days on a truck, a warehouse whose lock gets hot, orders that span sites, and how you would prove any of it is thread-safe. You rarely implement these in full; show which class changes and why the rest doesn't.</p>`,
  sections: [
    {
      id: "reservations",
      title: `"How would you stop two customers buying the last unit while orders are still in flight?"`,
      kicker: "Follow-up: reservations",
      blocks: [
        { type: "problem", html: `<p>An order is placed at checkout, but stock is only removed when it ships hours later. Until then <code>warehousesWith</code> still counts those units, so a second customer can be promised the same widget. Removing stock at checkout isn't right either: if the customer abandons payment, the unit is gone from the books.</p>` },
        { type: "compare", items: [
          { title: "Weak: decrement at checkout", tone: "warn", html: `<p>Call <code>removeStock</code> when the order is placed. No overselling, but cancelled and abandoned orders must add stock back, and every failure path that forgets to do so leaks units for good.</p>` },
          { title: "Better: reserve, then commit or release", tone: "info", html: `<p>Track reserved units next to on-hand units; available = on hand minus reserved. Checkout reserves, shipping commits, cancelling releases. Correct, but a customer who closes the tab holds the stock forever.</p>` },
          { title: "Strong: reservations with an id and an expiry", tone: "ok", html: `<p>Each hold has an id and an expiry time. Commit and release refer to the id, so a hold can't be used twice, and a sweeper releases expired holds. Abandoned carts give their stock back on their own.</p>` }
        ] },
        { type: "code", lang: "java", title: "Reservations with expiry", code: `record Reservation(String id, String warehouseId, String productId, int qty, Instant expiresAt) {}

// Warehouse gains two maps, guarded by the same lock as stock. Every method: caller holds lock.
private final Map<String, Integer> reserved = new HashMap<>();      // product -> units held for open orders
private final Map<String, Reservation> holds = new HashMap<>();     // reservation id -> hold

int available(String productId) { return quantity(productId) - reserved.getOrDefault(productId, 0); }

Optional<Reservation> reserve(String productId, int qty, Instant expiresAt) {
    if (available(productId) < qty) return Optional.empty();       // the last units are already promised
    Reservation r = new Reservation(UUID.randomUUID().toString(), id, productId, qty, expiresAt);
    holds.put(r.id(), r);
    reserved.merge(productId, qty, Integer::sum);
    return Optional.of(r);
}

/** Order shipped. False if the id is unknown, already used or expired. */
boolean commit(String reservationId, Instant now, List<LowStockAlert> alerts) {
    Reservation r = unhold(reservationId);
    if (r == null || !r.expiresAt().isAfter(now)) return false;    // too late: the units are free again
    remove(r.productId(), r.qty(), alerts);                         // cannot fail: on hand never drops below reserved
    return true;
}

boolean release(String reservationId) { return unhold(reservationId) != null; }   // order cancelled

int releaseExpired(Instant now) {                                   // a scheduled sweeper calls this every minute
    List<String> expired = holds.values().stream()
        .filter(r -> !r.expiresAt().isAfter(now)).map(Reservation::id).toList();
    expired.forEach(this::unhold);
    return expired.size();
}

private Reservation unhold(String reservationId) {
    Reservation r = holds.remove(reservationId);
    if (r != null) reserved.merge(r.productId(), -r.qty(), Integer::sum);
    return r;
}` },
        { type: "code", lang: "text", title: "Reservation trace", code: `east: widget on hand 3, threshold 2; holds expire at t=15
t=0   reserve A, 2   -> held     onHand=3 reserved=2 available=1
t=0   reserve B, 2   -> refused  onHand=3 reserved=2 available=1   the last units are promised
t=0   reserve C, 1   -> held     onHand=3 reserved=3 available=0
t=5   commit A       -> true     onHand=1 reserved=1 available=0   ALERT east widget: 1 left, threshold 2
t=5   commit A again -> false    onHand=1 reserved=1 available=0   a hold is used once
t=20  releaseExpired -> 1        onHand=1 reserved=0 available=1   C's hold expired
t=20  commit C       -> false    onHand=1 reserved=0 available=1
t=20  reserve D, 1   -> held     onHand=1 reserved=1 available=0
t=21  release D      -> true     onHand=1 reserved=0 available=1` },
        { type: "keypoints", items: [
          "<strong>What changes:</strong> <code>Warehouse</code> gains the two maps and four methods; <code>InventoryManager</code> gains <code>reserve</code>, <code>commit</code> and <code>release</code> that lock one warehouse, exactly like <code>removeStock</code>. Transfers and alerts are untouched.",
          "Plain <code>removeStock</code>, transfers and <code>warehousesWith</code> must now check <code>available</code>, not on hand, or they would spend units already promised to someone.",
          "Pass the time in (or inject a <code>Clock</code>) rather than calling <code>Instant.now()</code> inside, so expiry is testable.",
          "Alerts still watch on-hand stock here; some businesses prefer to alert on available stock, which is a one-line change in where the crossing is checked."
        ] }
      ]
    },
    {
      id: "in-transit",
      title: `"What if a transfer takes three days on a truck?"`,
      kicker: "Follow-up: stock in transit",
      blocks: [
        { type: "text", html: `<p>The atomic transfer moves stock instantly. Real transfers leave one site today and arrive at another later, and can be cancelled on the way. The transfer now has a lifetime, so it finally earns a class: a small state machine with an id people can track.</p>` },
        { type: "code", lang: "java", title: "A two-step transfer", code: `enum TransferState { IN_TRANSIT, RECEIVED, CANCELLED }

final class Transfer {
    final String id = UUID.randomUUID().toString();
    final String productId, fromId, toId;
    final int qty;
    private final AtomicReference<TransferState> state = new AtomicReference<>(TransferState.IN_TRANSIT);

    Transfer(String productId, String fromId, String toId, int qty) {
        this.productId = productId; this.fromId = fromId; this.toId = toId; this.qty = qty;
    }

    /** Leaves IN_TRANSIT exactly once, even if receive and cancel race. */
    boolean finish(TransferState outcome) { return state.compareAndSet(TransferState.IN_TRANSIT, outcome); }
    TransferState state() { return state.get(); }
}

// InventoryManager gains: private final Map<String, Transfer> transfers = new ConcurrentHashMap<>();

Optional<Transfer> ship(String productId, String fromId, String toId, int qty) {
    get(toId);                                                          // fail fast on an unknown destination
    if (!removeStock(fromId, productId, qty)) return Optional.empty();  // leaves the source now
    Transfer t = new Transfer(productId, fromId, toId, qty);
    transfers.put(t.id, t);
    return Optional.of(t);
}

boolean receive(String transferId) { return settle(transferId, TransferState.RECEIVED); }
boolean cancel(String transferId)  { return settle(transferId, TransferState.CANCELLED); }

private boolean settle(String transferId, TransferState outcome) {
    Transfer t = transfers.get(transferId);
    if (t == null || !t.finish(outcome)) return false;                  // unknown, or already settled
    addStock(outcome == TransferState.RECEIVED ? t.toId : t.fromId, t.productId, t.qty);
    return true;
}` },
        { type: "keypoints", items: [
          "<strong>What changes:</strong> a new <code>Transfer</code> class and three manager methods built on <code>removeStock</code> and <code>addStock</code>. <code>Warehouse</code> doesn't change at all.",
          "The compare-and-set makes settlement exactly-once without a lock: if the truck is received and cancelled at the same moment, only one wins, so the units land in exactly one warehouse.",
          "In-transit units belong to neither warehouse's availability, but they are still company stock: a report sums on hand across warehouses plus open transfers.",
          "The instant <code>transfer</code> stays for moves within a campus; the two-step version is for anything that takes time."
        ] }
      ]
    },
    {
      id: "lock-granularity",
      title: `"One warehouse handles most orders and its lock is hot. What would you change?"`,
      kicker: "Follow-up: contention",
      blocks: [
        { type: "table", headers: ["Granularity", "Pros", "Cons"], rows: [
          ["One global lock", "Trivially correct; no ordering needed", "The whole company runs one operation at a time"],
          ["Per warehouse (the core design)", "Warehouses run in parallel; one simple lock per invariant", "Orders for different products in one busy warehouse queue behind each other"],
          ["Per (warehouse, product)", "Different products never contend", "Many more locks; anything spanning products or sites needs ordering across many keys"]
        ] },
        { type: "text", html: `<p>Stock rules never mix products: whether widgets can ship has nothing to do with gadgets. So the lock can move down to the product. Only <code>Warehouse</code> and the lines in the manager that take locks change; crossing detection and delivery are untouched.</p>` },
        { type: "code", lang: "java", title: "Per-product locks inside a warehouse", code: `final class Warehouse {
    final String id;
    private final ConcurrentHashMap<String, ReentrantLock> locks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Integer> stock = new ConcurrentHashMap<>();       // a value changes only under its product's lock
    private final ConcurrentHashMap<String, Integer> thresholds = new ConcurrentHashMap<>();

    ReentrantLock lockFor(String productId) { return locks.computeIfAbsent(productId, p -> new ReentrantLock()); }
    // quantity, add and remove are unchanged; the caller now holds lockFor(productId).
}

// InventoryManager.removeStock
ReentrantLock l = w.lockFor(productId);
l.lock();
try {
    ok = w.quantity(productId) >= qty;
    if (ok) w.remove(productId, qty, alerts);
} finally { l.unlock(); }

// InventoryManager.transfer: both locks are for the same product, so warehouse id is still a total order.
boolean fromFirst = fromId.compareTo(toId) < 0;
ReentrantLock first = (fromFirst ? from : to).lockFor(productId);
ReentrantLock second = (fromFirst ? to : from).lockFor(productId);` },
        { type: "callout", tone: "warning", html: `<p>The maps become <code>ConcurrentHashMap</code>s because different product locks now let two threads write the same map at once; a plain <code>HashMap</code> can corrupt itself under concurrent puts even for different keys. If the number of products is huge, use a fixed array of striped locks indexed by the product's hash instead of one lock per product; stripes can be shared by unrelated products, but ordering by warehouse id still works because both sides of a transfer use the same stripe index. Move to this only with evidence of contention.</p>` }
      ]
    },
    {
      id: "fulfilment",
      title: `"An order is too big for any one warehouse. How do you ship it?"`,
      kicker: "Follow-up: multi-warehouse orders",
      blocks: [
        { type: "text", html: `<p>Two questions hide in this one: <em>which</em> warehouses should ship (a policy that will change: fewest parcels, nearest, cheapest), and how to remove from several warehouses <em>all or nothing</em>. The policy is a <strong>Strategy</strong> that plans from a snapshot; the removal locks every warehouse in the plan in id order, re-checks, and removes from all or none.</p>` },
        { type: "code", lang: "java", title: "All-or-nothing orders across warehouses", code: `record Allocation(String warehouseId, int qty) {}

interface FulfilmentStrategy {
    /** Splits qty across warehouses given a snapshot of what each holds; empty if it can't be done. */
    List<Allocation> plan(Map<String, Integer> snapshot, int qty);
}

/** Fewest parcels: biggest holders first, ties by id so the plan is deterministic. */
final class FewestSplits implements FulfilmentStrategy {
    public List<Allocation> plan(Map<String, Integer> snapshot, int qty) {
        List<Allocation> out = new ArrayList<>();
        int left = qty;
        for (Map.Entry<String, Integer> e : snapshot.entrySet().stream()
                .sorted(Comparator.comparing((Map.Entry<String, Integer> x) -> -x.getValue())
                    .thenComparing(Map.Entry::getKey)).toList()) {
            if (left == 0) break;
            int take = Math.min(left, e.getValue());
            if (take > 0) { out.add(new Allocation(e.getKey(), take)); left -= take; }
        }
        return left == 0 ? out : List.of();
    }
}

// InventoryManager
boolean fulfil(String productId, int qty, FulfilmentStrategy strategy) {
    requirePositive(qty);
    List<Allocation> plan = strategy.plan(snapshot(productId), qty);   // snapshot: each warehouse read under its lock
    if (plan.isEmpty()) return false;
    List<Warehouse> sites = plan.stream().map(a -> get(a.warehouseId()))
        .sorted(Comparator.comparing((Warehouse w) -> w.id)).toList();   // id order, as in transfer
    List<LowStockAlert> alerts = new ArrayList<>();
    boolean ok;
    sites.forEach(w -> w.lock.lock());
    try {
        ok = plan.stream().allMatch(a -> get(a.warehouseId()).quantity(productId) >= a.qty());   // re-check
        if (ok) plan.forEach(a -> get(a.warehouseId()).remove(productId, a.qty(), alerts));
    } finally { sites.forEach(w -> w.lock.unlock()); }
    deliver(alerts);
    return ok;                                                          // false: stock moved since the snapshot
}` },
        { type: "keypoints", items: [
          "<strong>What changes:</strong> a new <code>FulfilmentStrategy</code> interface with one implementation per policy, and one manager method. <code>Warehouse</code> is untouched.",
          `Planning happens without locks on a snapshot; the plan can go stale, so the locked section re-checks every allocation before removing anything. A <code>false</code> means "plan again", not "out of stock".`,
          "Locking a list of warehouses is the same rule as a transfer, generalised: sorted by id, every thread takes them in the same order, so no cycle forms. A strategy must not list a warehouse twice."
        ] }
      ]
    },
    {
      id: "testing",
      title: `"How would you prove it is thread-safe?"`,
      kicker: "Follow-up: verification",
      blocks: [
        { type: "text", html: `<p>Concurrency bugs rarely show up in a single-threaded unit test. Write stress tests that start many threads at once and assert <strong>invariants</strong> rather than exact interleavings: units are neither created nor lost, nothing is sold twice, and everything finishes within a timeout (a deadlock shows up as a timeout).</p>` },
        { type: "code", lang: "java", title: "Stress tests that check invariants", code: `@Test
void opposingTransfersConserveStockAndNeverDeadlock() throws Exception {
    InventoryManager inv = new InventoryManager(List.of("east", "west"));
    inv.addStock("east", "widget", 1_000);
    inv.addStock("west", "widget", 1_000);
    ExecutorService pool = Executors.newFixedThreadPool(8);
    CountDownLatch start = new CountDownLatch(1);
    List<Future<?>> futures = new ArrayList<>();
    for (int i = 0; i < 8; i++) {
        boolean eastToWest = i % 2 == 0;                   // half each way: the mix that deadlocks without ordering
        futures.add(pool.submit(() -> {
            start.await();
            for (int j = 0; j < 10_000; j++)
                inv.transfer("widget", eastToWest ? "east" : "west", eastToWest ? "west" : "east", 1 + j % 3);
            return null;
        }));
    }
    start.countDown();
    for (Future<?> f : futures) f.get(10, TimeUnit.SECONDS);                 // a deadlock times out here
    pool.shutdown();
    assertEquals(2_000, inv.quantity("east", "widget") + inv.quantity("west", "widget"));   // nothing created or lost
}

@Test
void racingOrdersNeverOversell() throws Exception {
    InventoryManager inv = new InventoryManager(List.of("east"));
    inv.addStock("east", "widget", 50);
    ExecutorService pool = Executors.newFixedThreadPool(16);
    List<Future<Boolean>> orders = new ArrayList<>();
    for (int i = 0; i < 200; i++) orders.add(pool.submit(() -> inv.removeStock("east", "widget", 1)));
    int sold = 0;
    for (Future<Boolean> f : orders) if (f.get(10, TimeUnit.SECONDS)) sold++;
    pool.shutdown();
    assertEquals(50, sold);                                                    // exactly the stock, never more
    assertEquals(0, inv.quantity("east", "widget"));
}` },
        { type: "callout", tone: "tip", html: `<p>Run the read-then-write version from the solution through the second test and it fails within a few runs, selling more than 50. A test that can fail against the broken design is the evidence that it is testing something. Tools such as jcstress go further by exploring interleavings systematically.</p>` },
        { type: "quiz", q: "A product's threshold in a warehouse is 5 and stock is 8. In order: remove 3, remove 1, remove 2, add 6, remove 4. How many low-stock alerts fire?", options: ["One", "Two", "Three", "Four"], answer: 1, explain: `<p>8 to 5 stays at the threshold: no alert. 5 to 4 crosses below: alert one. 4 to 2 was already below: none. Adding 6 brings it to 8 and re-arms. 8 to 4 crosses again: alert two.</p>` }
      ]
    }
  ],
  takeaways: [
    "Each follow-up lands in one or two classes: reservations in Warehouse, in-transit stock in a new Transfer, contention in how locks are keyed, split orders in a FulfilmentStrategy.",
    "Reservations need an id and an expiry, and everything that spends stock must check available (on hand minus reserved).",
    "A transfer that takes time is a state machine; a compare-and-set makes receiving or cancelling exactly-once.",
    "Finer locks reduce contention but raise the cost of ordering; any operation over several locks sorts them the same way every time.",
    "Prove thread safety with stress tests that assert invariants and time out on deadlock, and check that they fail against the broken version."
  ]
};
