// Deep dives: Inventory Management (LLD). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["inventory-management"] = {
  hook: `<p>The core manager keeps stock non-negative, transfers atomically and alerts on threshold crossings. The follow-ups probe what inventory systems really struggle with: orders that are placed but not shipped, stock that is on a truck, how fine the locks should be, and how to prove the concurrency is right.</p>`,
  sections: [
    {
      id: "reservations",
      title: "Preventing overselling with reservations",
      kicker: "Follow-up: orders in flight",
      blocks: [
        { type: "problem", html: `<p>An order is placed, but the stock is only removed when it ships hours later. Meanwhile <code>warehousesWith</code> still counts those units, so a second order can be promised the same stock.</p>` },
        { type: "code", lang: "java", title: "On hand, reserved, available", code: `// Warehouse: guarded by lock
private final Map<String, Integer> onHand = new HashMap<>();
private final Map<String, Integer> reserved = new HashMap<>();

int available(String product) { return onHand.getOrDefault(product, 0) - reserved.getOrDefault(product, 0); }

void reserve(String product, int qty) {                 // order placed
    if (available(product) < qty) throw new InsufficientStockException(id, product, available(product), qty);
    reserved.merge(product, qty, Integer::sum);
}

void commit(String product, int qty) {                  // order shipped
    reserved.merge(product, -qty, Integer::sum);
    onHand.merge(product, -qty, Integer::sum);
}

void release(String product, int qty) {                 // order cancelled or reservation expired
    reserved.merge(product, -qty, Integer::sum);
}` },
        { type: "keypoints", items: [
          "Availability and low-stock alerts should use <strong>available</strong>, not on-hand.",
          "Give reservations an id and an expiry, and release expired ones (lazily or with a sweeper), or abandoned carts lock stock forever.",
          "Commit and release must reference a real reservation (by id) so a bug can't drive reserved negative."
        ] }
      ]
    },
    {
      id: "in-transit",
      title: "Stock in transit between warehouses",
      kicker: "Follow-up: transfers that take days",
      blocks: [
        { type: "text", html: `<p>The atomic transfer moves stock instantly, but real transfers ship on a truck. Model the transfer as its own object with a small state machine.</p>` },
        { type: "code", lang: "java", title: "A two-step transfer", code: `enum TransferState { IN_TRANSIT, RECEIVED, CANCELLED }

final class Transfer {
    final String id = UUID.randomUUID().toString();
    final String product, from, to;
    final int qty;
    private TransferState state = TransferState.IN_TRANSIT;
    Transfer(String product, String from, String to, int qty) { this.product = product; this.from = from; this.to = to; this.qty = qty; }

    synchronized void markReceived() {
        if (state != TransferState.IN_TRANSIT) throw new IllegalStateException("Transfer " + id + " is " + state);
        state = TransferState.RECEIVED;
    }
}

// InventoryManager
Transfer ship(String product, String fromId, String toId, int qty) {
    removeStock(fromId, product, qty);                   // leaves the source now
    Transfer t = new Transfer(product, fromId, toId, qty);
    transfers.put(t.id, t);
    return t;
}

void receive(String transferId) {
    Transfer t = transfers.get(transferId);
    t.markReceived();                                    // exactly once
    addStock(t.to, t.product, t.qty);                    // arrives at the destination
}` },
        { type: "callout", tone: "tip", html: `<p>In-transit units belong to neither warehouse's availability, but they are still company stock: reports sum on-hand plus in-transit. Cancelling a shipment returns the units to the source.</p>` }
      ]
    },
    {
      id: "lock-granularity",
      title: "How fine should the locks be?",
      kicker: "Follow-up: contention",
      blocks: [
        { type: "table", headers: ["Granularity", "Pros", "Cons"], rows: [
          ["One global lock", "Trivially correct, no deadlock", "Every operation in the company serializes"],
          ["Per warehouse (chosen)", "Warehouses run in parallel; simple invariant per lock", "Hot products in one warehouse contend"],
          ["Per (warehouse, product)", "Maximum parallelism", "More locks; transfers and multi-product orders need ordered locking across many keys"]
        ] },
        { type: "code", lang: "java", title: "Single-product updates without explicit locks", code: `// Per-product atomicity with ConcurrentHashMap.compute (no alerts, no transfers)
ConcurrentHashMap<String, Integer> stock = new ConcurrentHashMap<>();

void remove(String product, int qty) {
    stock.compute(product, (p, have) -> {
        int current = have == null ? 0 : have;
        if (current < qty) throw new InsufficientStockException("WH", p, current, qty);
        return current - qty;
    });
}` },
        { type: "callout", tone: "warning", html: `<p><code>compute</code> makes one key's update atomic, but a transfer touches two maps and must still lock both sides in a global order. Start with a lock per warehouse and go finer only with evidence of contention.</p>` }
      ]
    },
    {
      id: "testing",
      title: "Proving it under concurrency",
      kicker: "Follow-up: quality",
      blocks: [
        { type: "code", lang: "java", title: "A stress test that checks invariants", code: `@Test
void concurrentTransfersConserveStockAndNeverDeadlock() throws Exception {
    InventoryManager inv = new InventoryManager(List.of("A", "B"));
    inv.addStock("A", "widget", 1_000);
    inv.addStock("B", "widget", 1_000);
    ExecutorService pool = Executors.newFixedThreadPool(8);
    CountDownLatch start = new CountDownLatch(1);
    List<Future<?>> futures = new ArrayList<>();
    for (int i = 0; i < 8; i++) {
        boolean aToB = i % 2 == 0;                          // half A->B, half B->A: the deadlock-prone mix
        futures.add(pool.submit(() -> {
            start.await();
            for (int j = 0; j < 1_000; j++) {
                try { inv.transfer("widget", aToB ? "A" : "B", aToB ? "B" : "A", 1); }
                catch (InsufficientStockException ignored) { }
            }
            return null;
        }));
    }
    start.countDown();
    for (Future<?> f : futures) f.get(10, TimeUnit.SECONDS);   // a deadlock would time out here
    assertEquals(2_000, inv.quantity("A", "widget") + inv.quantity("B", "widget"));   // conserved
    pool.shutdown();
}` },
        { type: "quiz", q: "Stock of a product in warehouse W is 12 with a threshold of 10. Removals of 3, then 1, then 5 happen. How many low-stock alerts fire?", options: ["Zero", "One", "Two", "Three"], answer: 1, explain: `<p>12 to 9 crosses below 10 and fires once. 9 to 8 and 8 to 3 were already below the threshold, so they don't fire again. Restocking to 10 or more would re-arm the alert.</p>` }
      ]
    }
  ],
  takeaways: [
    "Separate on-hand from reserved; availability and alerts use available = on-hand minus reserved.",
    "Model slow transfers as a Transfer with IN_TRANSIT, RECEIVED and CANCELLED states.",
    "Lock per warehouse by default; finer locks need ordered locking for anything spanning keys.",
    "Stress-test with opposing transfers and assert conservation of stock and termination within a timeout."
  ]
};
