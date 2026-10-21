// Deep dives: Vending Machine (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["vending-machine"] = {
  hook: `<p>Once the core works, interviewers add twists to see whether the design bends without breaking. You rarely implement them in full; you show which class changes and why the rest doesn't. For a vending machine the test is almost always the same: does a new payment method, a new failure or a new mode arrive as one new state or one new input, or does it touch every class? Junior candidates may get none of these, mid-level one or two, senior candidates several.</p>`,
  sections: [
    {
      id: "card-payment",
      title: "\"How would you accept a card as well as coins?\"",
      kicker: "Follow-up: a new payment method",
      blocks: [
        { type: "text", html: `<p>A card is one more input, and it only makes sense in one state: an item is chosen and nothing has been paid yet. So <code>MachineState</code> gains one method with a default that refuses, and only <code>ItemSelectedState</code> overrides it. Idle, Dispensing, the coin box and the inventory don't change. The card reader hands the machine a token, never the card number, and the amount charged is the item's price from the inventory, never a value from outside.</p>` },
        { type: "code", lang: "java", title: "Card payment: one new input, accepted by one state", code: `/** Charges a token from the card reader. The machine never sees or stores the card number. */
interface PaymentGateway { boolean charge(String cardToken, long amountCents, String idempotencyKey); }

interface MachineState {
    // ... the four existing inputs, unchanged
    default MachineState payByCard(VendingMachine m, String cardToken) {
        m.hw().display("Card not accepted right now");
        return this;
    }
}

// In VendingMachine, next to the other inputs:
//   synchronized void payByCard(String cardToken) { state = state.payByCard(this, cardToken); }

// In ItemSelectedState, the only override:
public MachineState payByCard(VendingMachine m, String cardToken) {
    if (!inserted.isEmpty()) { m.hw().display("Cancel your coins to pay by card"); return this; }
    String key = UUID.randomUUID().toString();                 // one per attempt, so a retried request can't charge twice
    if (!m.payments().charge(cardToken, item.priceCents(), key)) {
        m.hw().display("Card declined");
        return this;                                           // still ItemSelected: try coins or another card
    }
    m.inventory().takeOne(item.code());
    m.hw().release(item.code());
    return new DispensingState();
}` },
        { type: "keypoints", items: [
          "A default method means existing states compile and behave exactly as before; only the state where cards make sense opts in.",
          "Mixing coins and a card in one sale is refused to keep refunds simple; allowing it would mean charging the price minus the escrow.",
          "No change is due, so the coin box is not involved at all."
        ] },
        { type: "callout", tone: "warning", html: `<p>This version calls the payment network while holding the machine's lock, so the keypad freezes for the second or two that authorisation takes. That is acceptable for a single-customer machine, which should not accept other input mid-payment anyway. The stronger version adds an <code>AuthorisingState</code>: request the charge, return that state, and let the gateway's callback move to Dispensing or back to ItemSelected, exactly as the motor's callback ends Dispensing.</p>` }
      ]
    },
    {
      id: "stuck-item",
      title: "\"What if the item gets stuck?\"",
      kicker: "Follow-up: a hardware failure",
      blocks: [
        { type: "text", html: `<p>The motor turns, but the drop sensor never sees the item. The hardware gains a second callback, <code>dispenseFailed()</code>. Only Dispensing cares about it, so it is another input with a default that ignores it. The one real change is that <code>DispensingState</code> must now remember what it is dispensing, so it can refund the price and mark the slot as jammed.</p>` },
        { type: "code", lang: "java", title: "A stuck item: DispensingState remembers the sale and refunds it", code: `interface MachineState {
    // ... existing inputs
    default MachineState dispenseFailed(VendingMachine m) { return this; }   // stray signal: ignore
}

final class DispensingState implements MachineState {
    private final Item item;                                   // what is dropping, so a failure can be refunded
    DispensingState(Item item) { this.item = item; }
    // ... selectItem, insertCoin, cancel and itemDispensed unchanged

    public MachineState dispenseFailed(VendingMachine m) {
        m.inventory().disable(item.code());                    // jammed: sold out until an engineer clears it
        Optional<List<Coin>> refund = m.coinBox().planChange(item.priceCents());
        if (refund.isPresent()) {
            m.coinBox().removeAll(refund.get());
            m.hw().returnCoins(refund.get());
            m.hw().display("Item stuck, money returned");
        } else {
            m.recordOwed(item.priceCents());                   // kept for the operator to settle; never silently kept
            m.hw().display("Item stuck, please call the number on the machine");
        }
        return new IdleState();
    }
}
// ItemSelectedState.completeSale now returns new DispensingState(item).
// Inventory.disable(code) sets that code's stock to 0; recordOwed adds to a counter guarded by the machine's lock.` },
        { type: "keypoints", items: [
          "The refund reuses <code>planChange</code>: refunding is just paying out an amount, so the same rule applies, including the case where the box can't pay it.",
          "Classes touched: <code>MachineState</code> (a default), <code>DispensingState</code> (a field and one method), <code>Inventory</code> (disable). The other states don't change.",
          "Data again lives in the state that needs it: only Dispensing knows which item is in flight."
        ] }
      ]
    },
    {
      id: "out-of-service",
      title: "\"How would the operator restock it, or take it out of service?\"",
      kicker: "Follow-up: a new mode",
      blocks: [
        { type: "text", html: `<p>Restocking needs the machine to stop selling while the door is open. That is a new state that refuses every customer input. Dispensing already refuses most inputs too, so this is the moment a small base class pays off: it refuses everything by default, and each refusing state overrides only what it allows.</p>` },
        { type: "code", lang: "java", title: "Service mode: a refusing base class and an OutOfServiceState", code: `/** Refuses every customer input with a reason; subclasses override only what they allow. */
abstract class RejectingState implements MachineState {
    abstract String reason();
    public MachineState selectItem(VendingMachine m, String code) { m.hw().display(reason()); return this; }
    public MachineState insertCoin(VendingMachine m, Coin coin) {
        m.hw().returnCoins(List.of(coin));
        m.hw().display(reason());
        return this;
    }
    public MachineState cancel(VendingMachine m)        { return this; }
    public MachineState itemDispensed(VendingMachine m) { return this; }
}

final class OutOfServiceState extends RejectingState {
    public String name() { return "OutOfService"; }
    String reason()      { return "Out of service"; }
}

// In VendingMachine: the operator's key switch.
synchronized boolean enterService() {
    if (!(state instanceof IdleState)) return false;           // never interrupt a customer mid-purchase
    state = new OutOfServiceState();
    return true;
}

synchronized void restock(String code, int quantity) {
    if (!(state instanceof OutOfServiceState)) throw new IllegalStateException("open the machine first");
    inventory.restock(code, quantity);                          // adds to the stock of a known code
}

synchronized void leaveService() {
    if (state instanceof OutOfServiceState) state = new IdleState();
}` },
        { type: "keypoints", items: [
          "<code>DispensingState</code> could extend <code>RejectingState</code> and override only <code>itemDispensed</code>; that is a refactor, not a redesign.",
          "Entering service only from Idle protects a customer's coins; an alternative is to refund the escrow first, which is one line in <code>ItemSelectedState</code>.",
          "The same state covers \"everything is sold out\": when the item drops, <code>DispensingState.itemDispensed</code> returns <code>OutOfServiceState</code> instead of Idle if no stock is left."
        ] }
      ]
    },
    {
      id: "timeout",
      title: "\"What if a customer picks an item and walks away?\"",
      kicker: "Follow-up: time",
      blocks: [
        { type: "text", html: `<p>The machine should give up after a minute, refund whatever was inserted, and go back to Idle. A timer is easy; the trap is a stale timer. A customer selects, cancels, and a new customer selects 40 seconds later: the first timer must not cancel the second customer's purchase. So each selection gets a session number, and the timeout input carries it.</p>` },
        { type: "code", lang: "java", title: "Timeouts with a session number", code: `// In VendingMachine.
private final ScheduledExecutorService timers;                  // injected; one thread is plenty
private long session;                                           // guarded by this; counts selections

long startSession() {                                           // called by IdleState.selectItem, under the lock
    long id = ++session;
    timers.schedule(() -> timeout(id), 60, TimeUnit.SECONDS);   // runs later on the timer thread, which waits for the lock
    return id;
}

synchronized void timeout(long id) { state = state.timeout(this, id); }

// MachineState gains: default MachineState timeout(VendingMachine m, long id) { return this; }
// IdleState.selectItem now returns new ItemSelectedState(item.get(), m.startSession()).

// In ItemSelectedState, which stores its session id:
public MachineState timeout(VendingMachine m, long id) {
    if (id != session) return this;                             // a timer from an earlier selection
    return cancel(m);                                           // refund whatever was inserted
}` },
        { type: "keypoints", items: [
          "Only Idle-to-ItemSelected starts a session and only ItemSelected reacts to a timeout; in every other state the default ignores it, which also covers a timer that fires after the sale finished.",
          "The timer thread enters through a synchronized method like every other input, so a timeout can't interleave with a coin.",
          "Resetting the timer on each coin is the same idea: bump the session on every coin and schedule a fresh timer."
        ] },
        { type: "quiz", q: "A customer selects A1 and cancels. Forty seconds later another customer selects C3 and inserts a quarter. Twenty seconds after that, the first customer's 60-second timer fires. What happens?", options: [
          "The second customer's quarter is refunded and the machine goes to Idle",
          "Nothing: the timer's session id doesn't match the current ItemSelectedState, so it is ignored",
          "The machine goes to Idle but keeps the quarter",
          "The timer throws because the first session was already cancelled"
        ], answer: 1, explain: `<p>Each selection starts a new session. The stale timer carries the first session's id, and <code>ItemSelectedState.timeout</code> returns itself unchanged when the id doesn't match its own. The second customer's own timer will fire later with the right id.</p>` }
      ]
    },
    {
      id: "sales-reporting",
      title: "\"How would head office see sales and stock levels?\"",
      kicker: "Follow-up: reporting",
      blocks: [
        { type: "text", html: `<p>Now there is a reason for a sale record. The tempting version uploads each sale from inside <code>completeSale</code>, which puts a network call under the machine's lock: a slow connection would freeze the keypad. Instead, the sale is recorded into a bounded thread-safe queue, which never waits, and a reporter thread drains the queue and uploads in batches.</p>` },
        { type: "code", lang: "java", title: "Sales reporting through a queue", code: `record SaleEvent(String code, long priceCents, Instant at) {}

// In VendingMachine. The queue is thread-safe, so it can be filled under the machine's lock and drained by another thread.
private final BlockingQueue<SaleEvent> outbox = new LinkedBlockingQueue<>(10_000);
private final AtomicLong droppedEvents = new AtomicLong();      // readable without the lock, for monitoring

void recordSale(Item item) {                                    // called by completeSale, under the lock; never blocks
    if (!outbox.offer(new SaleEvent(item.code(), item.priceCents(), Instant.now()))) droppedEvents.incrementAndGet();
}

/** Runs on its own thread: waits for one event, takes up to 99 more, uploads them together. */
final class SalesReporter implements Runnable {
    private final BlockingQueue<SaleEvent> outbox;
    private final HeadOffice office;

    SalesReporter(BlockingQueue<SaleEvent> outbox, HeadOffice office) { this.outbox = outbox; this.office = office; }

    @Override public void run() {
        List<SaleEvent> batch = new ArrayList<>();
        while (!Thread.currentThread().isInterrupted()) {
            try {
                batch.add(outbox.take());
                outbox.drainTo(batch, 99);
                office.upload(batch);                           // retries and local persistence omitted
                batch.clear();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }
}` },
        { type: "keypoints", items: [
          "The only change to the sale itself is one <code>recordSale</code> call; the states, coin box and inventory stay as they were.",
          "<code>offer</code> rather than <code>put</code>: if head office is unreachable for days, the machine keeps selling and counts what it dropped instead of blocking.",
          "Low-stock alerts are another event type on the same queue, emitted when <code>takeOne</code> brings a count below a threshold."
        ] }
      ]
    }
  ],
  takeaways: [
    "Follow-ups should touch one or two classes: a new input is one method with a default, a new mode is one new state.",
    "Card payment: only ItemSelectedState accepts it; charge the inventory's price with a token and an idempotency key, and move slow authorisation into its own state.",
    "A stuck item: DispensingState remembers the sale and refunds it through the same planChange rule.",
    "Service mode: a refusing base class makes OutOfServiceState a few lines; enter it only from Idle.",
    "Timeouts: carry a session id so a stale timer can't cancel someone else's purchase.",
    "Reporting: record events into a bounded queue under the lock and upload from another thread; never call the network while holding the machine's lock."
  ]
};
