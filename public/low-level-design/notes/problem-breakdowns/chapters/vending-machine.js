// LLD problem breakdown: Vending Machine. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `vending-machine`, part: 1, number: 0, difficulty: `easy`,
    title: `Vending Machine: states, escrow and making change`,
    references: [{ title: `awesome-low-level-design: Vending Machine`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/vending-machine.md` }],
    overview: `A machine sells items from coded slots. The customer picks an item, pays in coins, and gets the item plus change, or cancels and gets their coins back. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement the states and change-making (comparing a simple, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The design lands on the <strong>State</strong> pattern (Idle, ItemSelected and Dispensing, each input returning the next state), <strong>escrow</strong> for inserted coins so a refused sale returns exactly what went in, a small <strong>hardware boundary</strong> for the motor, coin tray and display, and change-making that finds an answer the limited coin box can actually pay, which greedy does not always do.`,
    problem: [
      { id: `understanding`, title: `What a vending machine does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>A vending machine holds items in numbered slots, each with a price. A customer chooses an item and feeds in coins. Once enough money is in, the machine drops the item and pays back any change from its own coins. At any point before that, the customer can give up and get their coins back. Meanwhile people press buttons at the wrong moment, choose things that are sold out, and overpay with coins the machine may not be able to break.</p>` },
        { type: `text`, html: `<p>The prompt is usually one sentence: <em>"Design a vending machine: customers select a product, pay, and get the product and their change."</em> It sounds small, and that is the trap: most of the design is in what happens when things go wrong. The first few minutes go into turning the sentence into a spec.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the customer can do</strong>, <strong>what happens with bad input or at the wrong moment</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Does the customer pick first and then pay, or pay first and then pick?`, `Pick first, then pay`, `The states: Idle, then ItemSelected while paying. A coin inserted before choosing is returned`],
          [`Coins, notes or cards?`, `Coins only: 5, 10 and 25 cents and a dollar coin. Cards maybe later`, `A small <code>Coin</code> type; card payment is a follow-up`],
          [`Is change paid in coins, and can the machine run out of them?`, `Yes; it holds a limited number of each coin`, `A coin box and a change-making rule; the sale is refused if change can't be paid`],
          [`If a sale can't go ahead, what happens to the money?`, `Every coin inserted for it comes back`, `Escrow: inserted coins are held apart until the sale completes`],
          [`Unknown codes, sold-out items, buttons pressed while an item drops?`, `Show a message and change nothing; a coin inserted at the wrong time comes back`, `Every state handles every input; nothing throws at the customer`],
          [`Does dispensing take time?`, `The motor runs for a second or two; the hardware says when the item has dropped`, `A Dispensing state and an <code>itemDispensed()</code> callback from the hardware`],
          [`What about fake or foreign coins?`, `The coin acceptor rejects them before our code sees them`, `No coin validation; only known <code>Coin</code> values arrive`],
          [`Restocking, card payments, sales reports, timeouts?`, `Leave them out for now`, `An out-of-scope list; they are the follow-ups`]
        ] },
        { type: `callout`, tone: `insight`, title: `Pick first or pay first?`, html: `<p>This one answer decides the state machine. Pick-first means the machine knows the price before any money goes in, so it can refuse a sold-out item without ever touching a coin, and it knows the moment the customer has paid enough. Pay-first needs a "credit" state that accepts coins and then validates a selection against the credit. Both are fine designs, but they are different designs, so ask before drawing a single class. The change question comes right after: "can it run out of coins?" turns a subtraction into an algorithm.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. The machine holds items, each with a code (such as A1), a name, a price
     in cents and a stock count.
  2. The customer selects an item first. An unknown or sold-out code is
     refused with a message, and nothing changes.
  3. After selecting, the customer inserts coins (5, 10, 25 cents, 1 dollar).
     A coin inserted before selecting is returned.
  4. When the coins cover the price, the machine releases the item and pays
     change in coins from its coin box.
  5. If the coin box cannot make the exact change, the sale is refused and
     every coin inserted for it is returned.
  6. Until the sale completes, cancel returns every inserted coin.
  7. Dispensing takes time; the hardware reports when the item has dropped.
     Input during dispensing is refused, and coins inserted then come back.
  8. Invalid actions never throw: the machine shows a message and stays
     consistent.
  9. Inputs arrive on different threads (keypad, coin slot, motor).

Out of scope
  - Card and mobile payments, bank notes
  - Restocking and service mode, sales reports
  - Timeouts for a customer who walks away
  - Fake coins (rejected by the coin acceptor hardware)` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules. There are plenty of candidates: customer, buttons, money, coins, items, slots, the coin box, the machine and its hardware. Test each one before committing to a class.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Customer`, `Not a class`, `An outside actor. What they do arrives as method calls; the machine never needs to remember who they are`],
          [`Button / keypad`, `Not a class`, `A press is just <code>selectItem("A1")</code>. Modelling the keypad adds objects without adding rules`],
          [`Money / balance`, `A <code>long</code> in cents, not a class`, `Amounts are only added and compared. Integer cents avoid rounding errors; a <code>Money</code> class earns its place only with several currencies`],
          [`Coin`, `An enum`, `A fixed set of denominations, each with a value. The change rule needs to know which coins exist`],
          [`Item (product)`, `A record`, `Code, name and price. Immutable, so it can be shared freely`],
          [`Slot`, `Folded into Inventory`, `A slot here is just a code with a stock count. It becomes a class only if slots gain rules of their own (capacity, jams)`],
          [`Coin box`, `A class`, `Holds how many of each coin the machine has, and answers "can I pay this amount, and with which coins?"`],
          [`State`, `An interface with a class per state`, `The same button means different things depending on what the machine is doing`],
          [`Motor, coin tray, display`, `One interface at the boundary`, `The machine drives them but doesn't implement them; a fake version makes the logic testable`],
          [`Transaction / sale record`, `Not now`, `Nothing in the requirements records past sales. It appears in the reporting follow-up`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`VendingMachine`, `The entry point. Receives every input (select, coin, cancel, item dropped), hands it to the current state, and owns the lock. Holds the inventory, coin box and hardware.`],
          [`MachineState`, `One class per state (<code>IdleState</code>, <code>ItemSelectedState</code>, <code>DispensingState</code>). Each decides what an input means right now and returns the next state.`],
          [`Inventory`, `Items by code and how many of each are left.`],
          [`CoinBox`, `Coins available for change, and the change-making rule.`],
          [`Item`, `An immutable code, name and price.`],
          [`Coin`, `The accepted denominations and their values in cents.`],
          [`MachineHardware`, `What the machine drives: release an item, return coins, show a message.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Saying out loud why something is <em>not</em> a class is as useful as finding the classes. "The customer is an actor, not an object; their actions are method calls" tells the interviewer you are modelling rules, not the real world noun by noun.</p>` }
      ] },
      { id: `machine-design`, title: `Class design: VendingMachine`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What VendingMachine remembers`], rows: [
          [`"Items with a code, a name, a price and stock"`, `An <code>Inventory</code>`],
          [`"Change in coins from its coin box"`, `A <code>CoinBox</code>`],
          [`"Behaviour depends on whether an item is chosen or dropping"`, `The current <code>MachineState</code>`],
          [`"Releases the item, returns coins, shows a message"`, `The <code>MachineHardware</code> it drives, passed in at construction`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`The operator stocks the machine`, `<code>void addItem(Item item, int quantity)</code>, <code>void loadCoins(Coin coin, int count)</code>`],
          [`The customer chooses an item`, `<code>void selectItem(String code)</code>`],
          [`The customer inserts a coin`, `<code>void insertCoin(Coin coin)</code>`],
          [`The customer gives up`, `<code>void cancel()</code>`],
          [`The motor reports that the item has dropped`, `<code>void itemDispensed()</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>No balance or selected-item field.</strong> They only mean something while an item is chosen, so they live in <code>ItemSelectedState</code>. The machine can't be "Idle with a balance of 40" because there is nowhere to store it.`,
          `<strong>Methods return void and report through the display.</strong> A person at the machine reads a screen; an exception would leave their coin in limbo. Tests check what a fake <code>MachineHardware</code> recorded.`,
          `<strong>One instance, created at startup and given its hardware.</strong> No Singleton: a test or a second machine on the same controller is just another <code>new VendingMachine(hw)</code>.`
        ] }
      ] },
      { id: `state-design`, title: `Class design: the states`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>The core question: <strong>where do the rules for "what does this input mean right now" live?</strong> A coin is accepted while paying, returned while idle and returned while dispensing. Cancel refunds while paying and does nothing otherwise.</p>` },
        { type: `compare`, items: [
          { title: `Good: a status enum and a switch in every method`, tone: `warn`, html: `<p>One <code>status</code> field and a <code>switch</code> in each of the four methods. Quick to write and fine for two states. But the selected item and the inserted coins become machine fields that are meaningless in Idle, the rules for one state are spread over four methods, and each new state edits every one of them.</p>` },
          { title: `Better: an enum whose constants override methods`, tone: `info`, html: `<p>Each enum constant implements the four inputs, so one state's rules sit together. But an enum constant is shared and can't carry per-sale data, so the selected item and coins still sit on the machine as nullable fields, and the "Idle with a balance" bug is still possible.</p>` },
          { title: `Great: a class per state; each input returns the next state`, tone: `ok`, html: `<p>A <code>MachineState</code> interface with four methods; <code>IdleState</code>, <code>ItemSelectedState</code> and <code>DispensingState</code> implement it. Each method returns the state to move to. <code>ItemSelectedState</code> holds the item and the inserted coins, so that data exists exactly while it is meaningful. A new state is a new class.</p>` }
        ] },
        { type: `text`, html: `<p>We take the classes. The machine stays tiny: every input is <code>state = state.input(this, ...)</code>. Returning the next state, rather than having states call a setter, keeps every transition visible in one line of each method.</p>` },
        { type: `table`, title: `What each input means in each state`, headers: [`State`, `selectItem`, `insertCoin`, `cancel`, `itemDispensed`], rows: [
          [`Idle`, `Known and in stock: go to ItemSelected; otherwise a message`, `Return the coin`, `Nothing to do`, `Ignore`],
          [`ItemSelected`, `Refuse: cancel first`, `Hold the coin; if paid enough, plan change, take stock, release, go to Dispensing (or refund all if change is impossible)`, `Return every coin, go to Idle`, `Ignore`],
          [`Dispensing`, `Refuse: please wait`, `Return the coin`, `Refuse`, `Go to Idle`]
        ] },
        { type: `diagram`, title: `States and transitions`, caption: `Selecting a stocked item leaves Idle; the coin that completes payment starts dispensing; the hardware's itemDispensed callback returns to Idle. Cancel, or change that can't be paid, returns the coins and goes back to Idle.`, svg: `<svg viewBox="0 0 690 225" role="img" aria-label="Idle, ItemSelected and Dispensing states with transitions">
<defs><marker id="lp-vm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="30" y="80" width="140" height="54" rx="27" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="100" y="112" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">Idle</text>
<rect x="260" y="80" width="170" height="54" rx="27" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="345" y="112" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">ItemSelected</text>
<rect x="520" y="80" width="140" height="54" rx="27" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="590" y="112" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">Dispensing</text>
<path d="M170 95 C 200 62, 230 62, 258 95" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-vm-arrow)"/>
<text x="210" y="55" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">selectItem (in stock)</text>
<path d="M430 95 C 460 62, 490 62, 518 95" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-vm-arrow)"/>
<text x="480" y="55" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">insertCoin (paid, change ok)</text>
<path d="M325 80 C 305 32, 385 32, 365 78" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-vm-arrow)"/>
<text x="345" y="22" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">insertCoin (not enough yet)</text>
<path d="M260 120 C 232 150, 200 150, 172 122" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-vm-arrow)"/>
<text x="215" y="163" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">cancel / no change</text>
<path d="M590 134 C 560 212, 130 212, 100 136" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-vm-arrow)"/>
<text x="400" y="218" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">itemDispensed (hardware callback)</text>
</svg>` },
        { type: `keypoints`, items: [
          `<strong>Every state handles every input.</strong> Refusing is a decision too; writing it down per state is how "invalid actions fail clearly" becomes code.`,
          `<strong>There is no "paid enough" state.</strong> The coin that covers the price completes the sale in the same call, so a "has money, waiting" state would never be observed. Dispensing is real because the motor takes time and input keeps arriving.`,
          `<strong>With two states an enum is defensible.</strong> Say so; the classes pay off at the third state and at the follow-ups (out of service, card authorising), which arrive as new classes.`
        ] }
      ] },
      { id: `money-design`, title: `Class design: coins, items, inventory and the coin box`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What is remembered, and where`], rows: [
          [`"Coins of 5, 10, 25 cents and a dollar"`, `<code>Coin</code>, an enum with each value in cents as a <code>long</code>`],
          [`"Items with a code, a name and a price"`, `<code>Item</code>, a record; the price is a <code>long</code> in cents`],
          [`"A stock count per item"`, `<code>Inventory</code>: items by code, and stock by code`],
          [`"Change from a limited number of each coin"`, `<code>CoinBox</code>: a count per coin`],
          [`"Every coin inserted for a refused sale comes back"`, `The inserted coins themselves, in <code>ItemSelectedState</code>, not just their total`]
        ] },
        { type: `text`, html: `<p>The last row is the <strong>escrow</strong> decision. Real machines hold inserted coins in a separate chamber until the sale completes. Keeping the list of coins (not a running total) means a cancel or a refused sale returns exactly the coins that went in, and those coins only join the coin box when the sale goes ahead. As a bonus, the coins just inserted can be paid out as change, which the change rule relies on.</p>` },
        { type: `code`, lang: `java`, title: `Coin, Item, Inventory and MachineHardware`, code: `/** The coins the acceptor recognises; anything else is rejected by the hardware before it reaches this code. */
enum Coin {
    NICKEL(5), DIME(10), QUARTER(25), DOLLAR(100);      // declared smallest first

    final long cents;
    Coin(long cents) { this.cents = cents; }
}

record Item(String code, String name, long priceCents) {}

/** Items and stock by code. Not thread-safe on its own: only used under the machine's lock. */
final class Inventory {
    private final Map<String, Item> items = new HashMap<>();
    private final Map<String, Integer> stock = new HashMap<>();

    void add(Item item, int quantity) {
        if (quantity < 0 || item.priceCents() <= 0) throw new IllegalArgumentException("bad price or quantity");
        items.put(item.code(), item);
        stock.merge(item.code(), quantity, Integer::sum);
    }

    Optional<Item> find(String code) { return Optional.ofNullable(items.get(code)); }
    boolean inStock(String code)      { return stock.getOrDefault(code, 0) > 0; }
    void takeOne(String code)         { stock.merge(code, -1, Integer::sum); }
}

/** What the machine drives: the real hardware in production, a fake that records calls in tests. */
interface MachineHardware {
    void release(String code);            // starts the motor and returns at once; itemDispensed() comes later on another thread
    void returnCoins(List<Coin> coins);   // drops coins into the tray; an empty list does nothing
    void display(String message);
}` },
        { type: `keypoints`, items: [
          `<strong>Money is a <code>long</code> of cents.</strong> A <code>double</code> cannot hold 0.10 exactly, and sums of coins drift. Integer cents make "paid at least the price" an exact comparison.`,
          `<strong>Inventory and CoinBox are not thread-safe on their own, on purpose.</strong> A sale changes stock, coins and state together, so one lock around all three is the unit of safety; a <code>ConcurrentHashMap</code> per collection would make each change safe but not the sale.`,
          `<strong>The hardware is an interface.</strong> The states never print or sleep; they tell the hardware what to do, and a test fake records it.`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class VendingMachine {
    private final Inventory inventory;                    // items and stock; guarded by this
    private final CoinBox coinBox;                        // coins for change; guarded by this
    private final MachineHardware hw;                     // motor, coin tray, display
    private MachineState state;                           // Idle, ItemSelected or Dispensing; guarded by this

    synchronized void addItem(Item item, int quantity);   // operator setup
    synchronized void loadCoins(Coin coin, int count);
    synchronized void selectItem(String code);            // customer inputs
    synchronized void insertCoin(Coin coin);
    synchronized void cancel();
    synchronized void itemDispensed();                    // hardware callback: the item has dropped
}

interface MachineState {                                  // each input returns the next state
    MachineState selectItem(VendingMachine m, String code);
    MachineState insertCoin(VendingMachine m, Coin coin);
    MachineState cancel(VendingMachine m);
    MachineState itemDispensed(VendingMachine m);
}
final class IdleState implements MachineState {}
final class ItemSelectedState implements MachineState {
    private final Item item;                              // what is being bought
    private final List<Coin> inserted;                    // escrow: the coins inserted for it
}
final class DispensingState implements MachineState {}

final class Inventory {
    Optional<Item> find(String code);
    boolean inStock(String code);
    void takeOne(String code);
}

final class CoinBox {
    void addAll(List<Coin> coins);
    void removeAll(List<Coin> coins);
    Optional<List<Coin>> planChange(long amountCents);    // fewest coins the box can pay, or empty
}

record Item(String code, String name, long priceCents) {}
enum Coin { NICKEL, DIME, QUARTER, DOLLAR }               // each with its value in cents
interface MachineHardware { void release(String code); void returnCoins(List<Coin> coins); void display(String message); }` },
        { type: `text`, html: `<p>The machine receives inputs and owns the lock; the states hold the rules; <code>Inventory</code> and <code>CoinBox</code> hold the stock and the money; the hardware interface is the only way out. Behaviour that depends on the current situation is the <strong>State</strong> pattern; nothing else here needs a pattern.</p>` }
      ] },
      { id: `machine-impl`, title: `Implementation: the machine and its states`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. Write the normal path first: select a stocked item, insert coins until the price is covered, plan the change, take one from stock, return the change, release the item, and wait for the drop. Then go through the edge cases.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `A coin before selecting: return it; Idle is unchanged.`,
          `An unknown code or a sold-out item: show a message; Idle is unchanged.`,
          `Selecting again while paying: refuse; the customer cancels first.`,
          `Paying exactly the price: change is zero, the plan is empty, no coins come back.`,
          `Change that the coin box can't pay: undo the deposit, return the inserted coins, go back to Idle.`,
          `Any input while dispensing: coins come back, buttons are refused.`,
          `A stray <code>itemDispensed()</code> outside Dispensing: ignore it.`
        ] },
        { type: `code`, lang: `java`, title: `VendingMachine`, code: `final class VendingMachine {
    private final Inventory inventory = new Inventory();      // guarded by this
    private final CoinBox coinBox = new CoinBox();            // guarded by this
    private final MachineHardware hw;
    private MachineState state = new IdleState();             // guarded by this

    VendingMachine(MachineHardware hw) { this.hw = hw; }

    // Operator setup.
    synchronized void addItem(Item item, int quantity) { inventory.add(item, quantity); }

    synchronized void loadCoins(Coin coin, int count) {
        if (count <= 0) throw new IllegalArgumentException("count must be positive");
        coinBox.add(coin, count);
    }

    // Customer inputs and the hardware callback: hand the input to the current state and keep the state it returns.
    synchronized void selectItem(String code) { state = state.selectItem(this, code); }
    synchronized void insertCoin(Coin coin)   { state = state.insertCoin(this, coin); }
    synchronized void cancel()                { state = state.cancel(this); }
    synchronized void itemDispensed()         { state = state.itemDispensed(this); }

    synchronized String stateName() { return state.name(); }

    // For the states only; they always run with this lock held.
    Inventory inventory() { return inventory; }
    CoinBox coinBox()     { return coinBox; }
    MachineHardware hw()  { return hw; }
}` },
        { type: `code`, lang: `java`, title: `Machine states: Idle, ItemSelected, Dispensing`, code: `/** One class per state. Each method handles one input and returns the next state; called only under the machine's lock. */
interface MachineState {
    String name();
    MachineState selectItem(VendingMachine m, String code);
    MachineState insertCoin(VendingMachine m, Coin coin);
    MachineState cancel(VendingMachine m);
    MachineState itemDispensed(VendingMachine m);
}

final class IdleState implements MachineState {
    public String name() { return "Idle"; }

    public MachineState selectItem(VendingMachine m, String code) {
        Optional<Item> item = m.inventory().find(code);
        if (item.isEmpty())               { m.hw().display("Unknown item " + code); return this; }
        if (!m.inventory().inStock(code)) { m.hw().display(code + " is sold out"); return this; }
        m.hw().display(item.get().name() + ": " + item.get().priceCents() + " cents");
        return new ItemSelectedState(item.get());
    }

    public MachineState insertCoin(VendingMachine m, Coin coin) {
        m.hw().returnCoins(List.of(coin));
        m.hw().display("Select an item first");
        return this;
    }

    public MachineState cancel(VendingMachine m)        { return this; }    // nothing to refund
    public MachineState itemDispensed(VendingMachine m) { return this; }    // stray signal: ignore
}

final class ItemSelectedState implements MachineState {
    private final Item item;
    private final List<Coin> inserted = new ArrayList<>();    // escrow; only touched under the machine's lock

    ItemSelectedState(Item item) { this.item = item; }
    public String name() { return "ItemSelected(" + item.code() + ")"; }

    public MachineState selectItem(VendingMachine m, String code) {
        m.hw().display("Cancel to choose another item");
        return this;
    }

    public MachineState insertCoin(VendingMachine m, Coin coin) {
        inserted.add(coin);
        long paid = inserted.stream().mapToLong(c -> c.cents).sum();
        if (paid < item.priceCents()) {
            m.hw().display("Paid " + paid + " of " + item.priceCents());
            return this;
        }
        return completeSale(m, paid - item.priceCents());
    }

    /** Plans everything before changing anything, so a refused sale leaves stock and coins as they were. */
    private MachineState completeSale(VendingMachine m, long changeDue) {
        CoinBox box = m.coinBox();
        box.addAll(inserted);                                  // the coins just inserted can be paid out as change
        Optional<List<Coin>> change = box.planChange(changeDue);
        if (change.isEmpty()) {
            box.removeAll(inserted);                           // undo the deposit
            m.hw().returnCoins(List.copyOf(inserted));
            m.hw().display("No change available, coins returned");
            return new IdleState();
        }
        box.removeAll(change.get());
        m.inventory().takeOne(item.code());
        m.hw().returnCoins(change.get());
        m.hw().release(item.code());
        return new DispensingState();
    }

    public MachineState cancel(VendingMachine m) {
        m.hw().returnCoins(List.copyOf(inserted));
        m.hw().display("Cancelled");
        return new IdleState();
    }

    public MachineState itemDispensed(VendingMachine m) { return this; }
}

final class DispensingState implements MachineState {
    public String name() { return "Dispensing"; }

    public MachineState selectItem(VendingMachine m, String code) { m.hw().display("Please wait"); return this; }

    public MachineState insertCoin(VendingMachine m, Coin coin) {
        m.hw().returnCoins(List.of(coin));
        m.hw().display("Please wait");
        return this;
    }

    public MachineState cancel(VendingMachine m) { m.hw().display("Already dispensing"); return this; }

    public MachineState itemDispensed(VendingMachine m) {
        m.hw().display("Thank you");
        return new IdleState();
    }
}` },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: the keypad, the coin slot and the motor's callback can call the machine from different threads. The inventory, the coin box, the current state and the escrow list inside <code>ItemSelectedState</code> are plain collections guarded by the machine's monitor: every public method is <code>synchronized</code>, and states, <code>Inventory</code> and <code>CoinBox</code> are only ever called from inside those methods. One lock, because a sale changes stock, coins and state together. One constraint follows: <code>release()</code> must start the motor and return, with <code>itemDispensed()</code> arriving later from the hardware's thread. A callback on the same thread, before <code>release()</code> returns, would get into Java's reentrant monitor while the state is still ItemSelected (the new state is stored only when <code>insertCoin</code> returns), and it would deadlock on Go's non-reentrant mutex.</p>` },
        { type: `text`, html: `<p>The pick-first flow, the <code>Coin</code> enum, an <code>Item</code> plus an <code>Inventory</code> of stock by code, and the Idle, ItemSelected and Dispensing states follow the <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/vendingmachine" target="_blank" rel="noopener">awesome-low-level-design vending machine</a>. The code here is written independently: the machine is created once and injected instead of being a Singleton; one lock guards all shared state; the separate dispense button and its "paid, waiting" state are folded into the coin that completes payment; cancel returns the inserted coins (the reference clears the balance without returning them); Dispensing lasts until the hardware reports the drop; and change is paid in coins from a limited box.</p>` }
      ] },
      { id: `change-impl`, title: `Implementation: making change`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p><code>planChange</code> is the one real algorithm. Before coding, compare rules on one example: the coin box holds one quarter and three dimes and no nickels, and the customer is owed either 35 or 30 cents.</p>` },
        { type: `table`, headers: [`Rule`, `Owed 35 cents`, `Owed 30 cents`, `What the customer sees`], rows: [
          [`Report the change as a number`, `"Change: 35"`, `"Change: 30"`, `The display promises money the code never pays out; there is no coin box at all`],
          [`Greedy: largest coin first`, `Quarter + dime`, `Quarter, then 5 left and no nickel: refused`, `Turned away at 30 cents, although three dimes would do`],
          [`Fewest coins the box can pay`, `Quarter + dime`, `Dime + dime + dime`, `Served whenever any combination of the coins on hand works`]
        ] },
        { type: `compare`, items: [
          { title: `Weak: change as a number`, tone: `bad`, html: `<p>Subtract and print. Fine before the interviewer asks about coins; wrong as soon as the machine has to hand back real coins it may not have.</p>` },
          { title: `Good: greedy from the largest coin`, tone: `warn`, html: `<p>Take as many of the largest coin as fit and are in the box, then the next. With unlimited US coins greedy always finds the fewest coins. With a limited box it can grab a quarter it can't complete, and refuse a sale that was possible.</p>` },
          { title: `Strong: fewest coins the box can actually pay`, tone: `ok`, html: `<p>A small dynamic program over amounts, one coin type at a time, respecting how many of each coin the box holds. It finds an answer whenever one exists, with the fewest coins. Amounts are a few hundred cents and the box holds a few dozen coins, so it is instant.</p>` }
        ] },
        { type: `text`, html: `<p>Greedy is worth writing first in an interview: it is five lines and correct most of the time. Then name the gap ("a limited box can make greedy refuse a sale it could have made") and replace it.</p>` },
        { type: `code`, lang: `java`, title: `Change: greedy, largest coin first`, code: `/** On CoinBox. As many of the largest coin as fit and are in the box, then the next. Can refuse when an answer exists. */
Optional<List<Coin>> greedyChange(long amount) {
    Coin[] coins = Coin.values();                              // smallest first
    List<Coin> plan = new ArrayList<>();
    long left = amount;
    for (int i = coins.length - 1; i >= 0; i--) {
        long use = Math.min(counts.getOrDefault(coins[i], 0), left / coins[i].cents);
        for (long j = 0; j < use; j++) plan.add(coins[i]);
        left -= use * coins[i].cents;
    }
    return left == 0 ? Optional.of(plan) : Optional.empty();
}` },
        { type: `code`, lang: `java`, title: `CoinBox: the fewest coins it can actually pay`, code: `/** Coins available for change. Not thread-safe on its own: only used under the machine's lock. */
final class CoinBox {
    private final EnumMap<Coin, Integer> counts = new EnumMap<>(Coin.class);

    void add(Coin coin, int n)       { counts.merge(coin, n, Integer::sum); }
    void addAll(List<Coin> coins)    { coins.forEach(c -> add(c, 1)); }
    void removeAll(List<Coin> coins) { coins.forEach(c -> add(c, -1)); }

    /** The fewest coins in the box that add up to amount, or empty if no combination does. Doesn't change the box. */
    Optional<List<Coin>> planChange(long amount) {
        Coin[] coins = Coin.values();
        int target = Math.toIntExact(amount);
        final int none = Integer.MAX_VALUE / 2;
        int[] best = new int[target + 1];                      // fewest coins for each sum, using the coin types seen so far
        Arrays.fill(best, none);
        best[0] = 0;
        int[][] used = new int[coins.length][target + 1];      // how many of coins[i] that best answer uses

        for (int i = 0; i < coins.length; i++) {
            int value = (int) coins[i].cents, have = counts.getOrDefault(coins[i], 0);
            int[] next = new int[target + 1];
            for (int sum = 0; sum <= target; sum++) {
                next[sum] = best[sum];                         // use none of this coin
                for (int k = 1; k <= have && k * value <= sum; k++) {
                    int candidate = best[sum - k * value] + k;
                    if (candidate < next[sum]) { next[sum] = candidate; used[i][sum] = k; }
                }
            }
            best = next;
        }
        if (best[target] >= none) return Optional.empty();

        List<Coin> plan = new ArrayList<>();                   // walk back from the largest coin type
        for (int i = coins.length - 1, sum = target; i >= 0; i--) {
            int k = used[i][sum];
            for (int j = 0; j < k; j++) plan.add(coins[i]);
            sum -= k * (int) coins[i].cents;
        }
        return Optional.of(plan);
    }
}` },
        { type: `keypoints`, items: [
          `<strong>Plan, then commit.</strong> <code>planChange</code> only reads the box. The sale removes the planned coins only after a plan exists, so a refusal changes nothing.`,
          `<strong>The inserted coins count.</strong> They join the box before planning: pay 100 for a 70 item with no small coins in the box and the change can still come from elsewhere, and the undo takes them back out if it can't.`,
          `<strong>Any denominations.</strong> Add a 50-cent coin or a 2-dollar coin to the enum and <code>planChange</code> still finds the fewest coins; greedy stops being optimal for many coin sets, even unlimited ones.`
        ] }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk through a concrete run, call by call, before the interviewer does. The machine has A1 (Cola, 70 cents, one left) and C3 (Water, 50 cents, two left), and the coin box holds one quarter and three dimes.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: ` #  call                  state after        what the hardware sees
 1  insertCoin(QUARTER)   Idle               return [QUARTER]; display "Select an item first"
 2  selectItem("Z9")      Idle               display "Unknown item Z9"
 3  selectItem("A1")      ItemSelected(A1)   display "Cola: 70 cents"
 4  insertCoin(DOLLAR)    Dispensing         paid 100, change due 30
                                             box with escrow: 1 dollar, 1 quarter, 3 dimes
                                             greedy would take the quarter, then fail on 5
                                             planChange(30) = [DIME, DIME, DIME]
                                             return [DIME, DIME, DIME]; release A1
                                             box now: 1 dollar, 1 quarter; A1 stock 0
 5  insertCoin(QUARTER)   Dispensing         return [QUARTER]; display "Please wait"
 6  itemDispensed()       Idle               display "Thank you"
 7  selectItem("A1")      Idle               display "A1 is sold out"
 8  selectItem("C3")      ItemSelected(C3)   display "Water: 50 cents"
 9  insertCoin(QUARTER)   ItemSelected(C3)   display "Paid 25 of 50"
10  cancel()              Idle               return [QUARTER]; display "Cancelled"
11  selectItem("C3")      ItemSelected(C3)   display "Water: 50 cents"
12  insertCoin(DOLLAR)    Idle               paid 100, change due 50
                                             box with escrow: 2 dollars, 1 quarter: 50 is impossible
                                             deposit undone; return [DOLLAR]
                                             display "No change available, coins returned"
13  selectItem("C3")      ItemSelected(C3)   display "Water: 50 cents"
14  insertCoin(QUARTER)   ItemSelected(C3)   display "Paid 25 of 50"
15  insertCoin(QUARTER)   Dispensing         paid 50, change due 0: planChange(0) = []
                                             release C3; box now: 1 dollar, 3 quarters; C3 stock 1
16  itemDispensed()       Idle               display "Thank you"` },
        { type: `keypoints`, items: [
          `Every invalid input (calls 1, 2, 5 and 7) left state, stock and coins exactly as they were, and every coin inserted at the wrong moment came back.`,
          `Call 4 is the sale greedy would have refused; the bounded search paid it with three dimes, using the dollar just inserted to keep the box whole.`,
          `Calls 10 and 12 returned the very coins that went in, thanks to escrow; after call 12 the box was back to one dollar and one quarter.`,
          `Call 15 paid the exact price: an empty plan, no coins returned, and the item released.`
        ] }
      ] }
    ],
    levels: levels(
      [`Turns "design a vending machine" into a short spec: select, pay, change, cancel, and what happens on bad input.`, `A working machine that handles each invalid action clearly (a coin before choosing, an unknown or sold-out item, cancel), even if behaviour starts as a status enum with switches.`, `Money in integer cents, and change returned at least as an amount, with hints toward real coins being fine.`],
      [`The State pattern with each input returning the next state, and the insight that ItemSelected carries data (the item and the inserted coins) the other states don't have.`, `Validate before mutate: change is planned before stock or coins change, so a refused sale leaves everything as it was, and refunds return the inserted coins.`, `One lock over inventory, coin box and state, with a sentence on why per-collection thread safety isn't enough.`, `Knows where follow-ups land: a new state is a new class; a new input is one method with a default.`],
      [`Asks "pick first or pay first?" and "can it run out of coins?" unprompted, and scopes tightly.`, `Knows greedy change fails with a limited coin box, shows the counterexample, and writes or sketches the bounded search.`, `Draws the hardware boundary (motor, coin tray, display) so states are testable with a fake, and names the callback constraint that follows from holding a lock while calling out.`, `Discusses trade-offs fluently (state classes vs an enum, escrow vs a running balance, card authorisation under the lock vs an authorising state) and handles stuck items, timeouts and reporting without restructuring.`]
    ),
    concepts: [
      { term: `State pattern`, def: `The machine delegates every input to a state object; <code>IdleState</code>, <code>ItemSelectedState</code> and <code>DispensingState</code> each implement all inputs.`, why: `The rules for one situation live together, and a new state is a new class rather than a new case in every method.` },
      { term: `Inputs return the next state`, def: `Each state method returns the state to move to; the machine runs <code>state = state.input(this, ...)</code>.`, why: `Every transition is visible in one place, and states never reach into the machine to swap themselves.` },
      { term: `Data lives in the state that needs it`, def: `The selected item and inserted coins are fields of <code>ItemSelectedState</code>, not of the machine.`, why: `Impossible combinations such as "Idle with a balance" can't be represented.` },
      { term: `Escrow`, def: `Inserted coins are kept as a list, apart from the coin box, until the sale completes.`, why: `Cancel and refused sales return exactly the coins that went in.` },
      { term: `Validate before mutate`, def: `Plan the change and check everything before taking stock or moving coins; undo the tentative deposit if the plan fails.`, why: `A refused sale leaves the machine exactly as it was.` },
      { term: `Bounded change-making`, def: `A dynamic program over amounts that respects how many of each coin the box holds and returns the fewest coins, or nothing.`, why: `Greedy can refuse a payable sale when coins are limited (30 cents from a quarter and three dimes).` },
      { term: `Hardware boundary`, def: `<code>MachineHardware</code> releases items, returns coins and shows messages; the motor reports back through <code>itemDispensed()</code>.`, why: `The states stay pure logic, testable with a fake, and dispensing can take real time.` },
      { term: `One lock for one invariant`, def: `Every public method of the machine is synchronized; inventory, coin box and states are only used inside them.`, why: `A sale changes stock, coins and state together; per-collection thread safety would not make the sale atomic.` }
    ],
    interview: [
      { q: `Why ask whether the customer picks first or pays first?`, a: `It decides the states. With pick-first, the machine knows the price before any money arrives, so it can refuse a sold-out item without handling coins and knows the exact moment payment is complete. Pay-first needs a credit state that accepts coins and validates later selections against the credit. Both work, but they are different state machines, so it is the first thing to settle.`, diff: `easy` },
      { q: `Why use state classes instead of a status enum and switch statements?`, a: `With an enum, each of the four input methods switches on the status, the selected item and coins sit on the machine as fields that are meaningless when idle, and every new state edits every method. With state classes, each state implements all inputs in one place, ItemSelectedState holds the item and coins so they exist only while meaningful, and a new state is a new class. With two simple states an enum is fine, and I would say so; the classes pay off at the third state and at the follow-ups.`, diff: `medium` },
      { q: `Why keep a list of inserted coins rather than a running balance?`, a: `A balance only says how much was paid, not with what. If the sale is cancelled or refused, the machine should return the coins that went in, which may not be possible from the coin box if it only knows the total. Keeping the coins in escrow makes refunds exact, and those coins join the box only when the sale goes ahead, where they can also be used for change.`, diff: `medium` },
      { q: `Greedy change-making is optimal for US coins. Why not use it?`, a: `It is optimal when the supply of each coin is unlimited. A machine has a limited box. With one quarter and three dimes, greedy takes the quarter for 30 cents, then needs a nickel it doesn't have, and refuses a sale that three dimes would have paid. A small dynamic program over amounts that respects coin counts finds an answer whenever one exists, with the fewest coins, and is instant for amounts of a few hundred cents.`, diff: `medium` },
      { q: `What happens if the machine can't make exact change?`, a: `The sale is refused before anything changes. The inserted coins were added to the box only tentatively so they could be used for change; the plan fails, the deposit is undone, the same coins are returned, the display explains why, and the machine goes back to Idle. Stock is untouched because it is only taken after a plan exists.`, diff: `easy` },
      { q: `The keypad, the coin slot and the motor callback run on different threads. What can go wrong and how do you prevent it?`, a: `Two inputs could interleave inside a sale: a coin arrives while another thread is halfway through planning change and taking stock, or the motor's callback flips the state while a coin is being handled. Every public method on the machine is synchronized, and the states, inventory and coin box are only used inside those methods, so each input runs to completion before the next. One lock rather than concurrent collections, because a sale must change stock, coins and state together.`, diff: `hard` },
      { q: `Why must release() not call itemDispensed() before it returns?`, a: `release() is called while the machine's lock is held, from inside insertCoin, and the new Dispensing state is stored only when insertCoin returns. In Java the monitor is reentrant, so a same-thread callback would get in, see ItemSelected, be ignored, and then the machine would sit in Dispensing forever. In Go the mutex is not reentrant, so it would deadlock. The contract is that release() starts the motor and returns, and the callback comes later from the hardware's own thread, which waits for the lock.`, diff: `hard` }
    ],
    cheatsheet: [
      { title: `Vending machine in one screen`, type: `code`, lang: `java`, body: `enum Coin { NICKEL(5), DIME(10), QUARTER(25), DOLLAR(100) }   // cents, as long
record Item(String code, String name, long priceCents) {}

final class VendingMachine {                                   // one lock guards inventory, coin box and state
    synchronized void selectItem(String code) { state = state.selectItem(this, code); }
    synchronized void insertCoin(Coin coin)   { state = state.insertCoin(this, coin); }
    synchronized void cancel()                { state = state.cancel(this); }
    synchronized void itemDispensed()         { state = state.itemDispensed(this); }   // hardware callback
}

interface MachineState { /* selectItem, insertCoin, cancel, itemDispensed: each returns the next state */ }
// Idle:          known and in stock -> ItemSelected; a coin is returned
// ItemSelected:  coin into escrow; once paid: add escrow to box, planChange, take stock,
//                return change, release -> Dispensing; no plan -> undo, return escrow -> Idle
//                cancel -> return escrow -> Idle
// Dispensing:    refuse buttons, return coins; itemDispensed -> Idle

// CoinBox.planChange(due): bounded DP, fewest coins the box can pay, empty if none` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Card payment`, `One new input with a refusing default; only ItemSelectedState accepts it (Deep Dives)`],
        [`The item gets stuck`, `A dispenseFailed callback; DispensingState remembers the sale and refunds (Deep Dives)`],
        [`Restocking, out of service`, `An OutOfServiceState on a refusing base class (Deep Dives)`],
        [`A customer walks away`, `A timeout input carrying a session id, so stale timers do nothing (Deep Dives)`],
        [`Sales reports`, `Events into a queue that a reporter thread uploads (Deep Dives)`],
        [`New coins or notes`, `Add to Coin; planChange already handles any denominations`],
        [`Pay first, then choose`, `A HasCreditState; Idle accepts coins instead of returning them`]
      ] }
    ],
    labs: []
  });
})();
