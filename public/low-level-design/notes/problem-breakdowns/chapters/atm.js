// LLD problem breakdown: ATM. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `atm`, part: 2, number: 0, difficulty: `medium`,
    title: `ATM: session states, an inventory-aware cash chain and all-or-nothing withdrawals`,
    references: [{ title: `awesome-low-level-design: ATM`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/atm.md` }],
    overview: `An ATM lets a cardholder authenticate with a PIN, check a balance and withdraw cash, while the bank, not the machine, owns the money. Two patterns earn their place: the <strong>State</strong> pattern for the session (idle, card inserted, authenticated, out of service), and a <strong>Chain of Responsibility</strong> of note cassettes that plans each withdrawal against the notes actually loaded. The requirement that defines the interview is that a withdrawal is <strong>all or nothing</strong> across two systems that share no transaction: plan the notes, debit the bank with an idempotency key, dispense, and reverse the debit if the dispenser jams.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `problem`, html: `<p>Design the software inside one ATM: the card session, the cash cassettes and the conversation with the bank. The bank is another system reached through an interface; the machine never stores balances or PINs.</p>` },
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Functional
  1. A customer inserts a card and enters a PIN; three wrong PINs in a row
     retain the card.
  2. Once authenticated: check the balance, withdraw cash, eject the card.
  3. Withdrawals are multiples of Rs 100, at most Rs 10,000 per transaction;
     the bank enforces the balance and a daily limit.
  4. The ATM holds cassettes of Rs 2000, 500, 200 and 100 notes, and pays any
     amount its loaded notes can make, not only what a greedy pick finds.
  5. A withdrawal is all or nothing: the customer gets the cash and is debited,
     or neither. A dispenser fault after the debit reverses it.
  6. Every attempt (completed, declined, reversed) is recorded.
  7. An operator can refill cassettes and take the ATM out of service.
  8. Thread-safe: a refill can overlap a session, and one account can be used
     from many ATMs at the same moment.

Out of scope
  - Deposits, transfers, PIN change, statements, other currencies,
    the network protocol to the bank, the screen and keypad UI.` }
      ] },
      { id: `clarifying`, title: `Questions that change the design`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`Who owns the balance?`, `The bank; the ATM asks through an interface`, `A <code>BankService</code>; no balances in the ATM`],
          [`Which notes, and can a cassette run out?`, `Rs 2000, 500, 200, 100; each cassette has a finite count`, `Planning against counts, not plain greedy`],
          [`Amount rules?`, `Multiples of Rs 100, at most Rs 10,000 per transaction; daily limit at the bank`, `What the ATM checks vs what the bank checks`],
          [`Wrong PIN?`, `Three tries per session, then retain the card; the bank also counts across ATMs`, `An attempt count inside the session state`],
          [`What if the dispenser jams after the debit?`, `Reverse the debit and go out of service`, `A compensating reversal and an OutOfService state`],
          [`Concurrency?`, `One customer per ATM, but operator refills overlap; many ATMs per account`, `One lock per ATM; atomic per-account debits at the bank`],
          [`Which mix of notes?`, `Largest notes first (a customer-chosen mix is a follow-up)`, `Chain ordered from the largest note down`]
        ] },
        { type: `callout`, tone: `insight`, html: `<p>Two different things are shared here, so there are two different locks. The machine's own state (session, cassette counts, journal) is shared between the customer and the operator and lives behind the ATM's lock. The account balance is shared between every ATM, app and branch, so only the bank can protect it.</p>` }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities, states and API`, blocks: [
        { type: `table`, headers: [`Type`, `Owns`], rows: [
          [`Atm`, `Facade: the current state, the cash dispenser, the journal and the lock; runs a withdrawal`],
          [`AtmState`, `Sealed interface; Idle, CardInserted, Authenticated, OutOfService are immutable records`],
          [`CashDispenser, Cassette`, `A chain of cassettes from the largest note down; plans and removes notes`],
          [`BankService`, `Interface: verify PIN, balance, debit with an idempotency key, reverse`],
          [`CashHardware`, `Interface to the physical dispenser and card slot; dispensing can fail`],
          [`Transaction`, `Immutable journal entry with a masked card number`]
        ] },
        { type: `diagram`, title: `Session states`, caption: `A third wrong PIN (or a card the bank has blocked) retains the card and returns to Idle. A session that ends with too little cash goes to OutOfService instead of Idle.`, svg: `<svg viewBox="0 0 640 270" role="img" aria-label="ATM session states: Idle, CardInserted, Authenticated and OutOfService with their transitions">
<defs><marker id="atm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="95" width="120" height="46" rx="23" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="123" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">Idle</text>
<rect x="240" y="95" width="150" height="46" rx="23" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="315" y="123" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">CardInserted</text>
<rect x="490" y="95" width="140" height="46" rx="23" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="560" y="123" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">Authenticated</text>
<rect x="240" y="200" width="150" height="46" rx="23" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="315" y="228" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">OutOfService</text>
<path d="M140 108 L238 108" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="189" y="100" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">insertCard</text>
<path d="M240 130 L142 130" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="190" y="156" text-anchor="middle" font-size="11" style="fill: var(--dg-ink)">eject, or retain</text>
<path d="M390 118 L488 118" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="439" y="110" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">PIN ok</text>
<path d="M290 95 C 280 58, 350 58, 340 93" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="315" y="54" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">wrong PIN</text>
<path d="M540 95 C 530 58, 600 58, 590 93" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="565" y="54" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">balance, withdraw</text>
<path d="M520 95 C 450 10, 150 10, 92 93" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="200" y="26" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">eject</text>
<path d="M560 141 C 560 200, 470 223, 392 223" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="500" y="256" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">dispenser fault</text>
<path d="M240 223 C 160 223, 80 200, 80 143" fill="none" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#atm-arrow)"/>
<text x="150" y="256" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">refill or restore</text>
</svg>` },
        { type: `keypoints`, items: [
          `<strong>State pattern, because behaviour and data depend on the session.</strong> Five actions times four states is twenty decisions, and two states carry data (the card, the wrong-PIN count). Each state is an immutable record holding only its own data; a transition swaps the reference under the ATM's lock.`,
          `<strong>Chain of Responsibility, because denominations are a list that changes.</strong> Each cassette handles its own note and passes the remainder on. Unlike the simple greedy chain, a link backs off to fewer notes when the rest of the chain cannot finish, so Rs 600 from 500s and 200s works.`,
          `<strong>Plan, debit, dispense, in that order.</strong> The plan reads counts only, so a decline changes nothing; the debit comes before cash leaves because a debit can be reversed and handed-out cash cannot.`,
          `<strong>The bank owns money and PIN checks.</strong> The ATM checks only local rules (multiple of Rs 100, per-transaction cap); the balance and the daily limit need every channel's view, so the bank checks them atomically with the debit.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `// Customer actions, interpreted by the current state
void insertCard(Card card);
PinResult enterPin(String pin);          // OK, WRONG_PIN or CARD_RETAINED
long balance();                          // paise
Transaction withdraw(long amount);       // paise; COMPLETED, DECLINED or REVERSED
void ejectCard();

// Operator actions
void refill(long note, int count);
void takeOutOfService();
void restore();
List<Transaction> journal();` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `text`, html: `<p>All money is a <code>long</code> in paise; <code>Atm.RS</code> (100) converts rupees, so a Rs 500 note is <code>500 * RS</code>.</p>` },
        { type: `code`, lang: `java`, title: `Values and the bank interface`, code: `record Card(String number) {
    String masked() { return "XXXX" + number.substring(number.length() - 4); }
    @Override public String toString() { return "Card[" + masked() + "]"; }   // never print the full number
}

enum PinResult { OK, WRONG_PIN, CARD_RETAINED }
enum AuthResult { OK, WRONG_PIN, BLOCKED }
enum DebitResult { OK, INSUFFICIENT_FUNDS, DAILY_LIMIT_EXCEEDED, CANCELLED }   // CANCELLED: reversed before it arrived
enum TxnStatus { COMPLETED, DECLINED, REVERSED }

record Transaction(String id, String atmId, String maskedCard, long amount,
                   TxnStatus status, String reason, Instant at) {}

/** The bank owns balances, PIN checks and the daily limit; the ATM only asks. */
interface BankService {
    AuthResult verifyPin(String cardNumber, String pin);     // the bank counts failures across all ATMs
    long balance(String cardNumber);
    DebitResult debit(String cardNumber, long amount, String idempotencyKey);   // atomic; a repeated key returns the first result
    void reverse(String cardNumber, String idempotencyKey);  // undoes that debit once
}

interface CashHardware {
    void dispense(Map<Long, Integer> notes) throws DispenseException;   // note value -> count
    void returnCard();
    void retainCard();
}

class DispenseException extends Exception {
    DispenseException(String message) { super(message); }
}` },
        { type: `code`, lang: `java`, title: `Inventory-aware dispense chain`, code: `/** One link in the chain: a cassette of one note value. Not thread-safe alone: the Atm's lock guards it. */
final class Cassette {
    final long note;                 // paise
    final Cassette next;             // the next smaller note, or null
    private int count;

    Cassette(long note, int count, Cassette next) { this.note = note; this.count = count; this.next = next; }

    /**
     * Adds to plan the notes that make amount from this cassette and the ones after it.
     * Tries the most notes first, then fewer, so it finds a mix whenever one exists. Changes no counts.
     */
    boolean plan(long amount, Map<Long, Integer> plan) {
        if (amount == 0) return true;
        int most = (int) Math.min(count, amount / note);
        for (int use = most; use >= 0; use--) {
            long rest = amount - use * note;
            if (rest == 0 || (next != null && next.plan(rest, plan))) {
                if (use > 0) plan.put(note, use);
                return true;
            }
        }
        return false;
    }

    int count() { return count; }
    void add(int n) { count += n; }
    void remove(int n) { count -= n; }
}

final class CashDispenser {
    private final Cassette head;                       // largest note first

    CashDispenser(long... notesLargestFirst) {
        Cassette c = null;
        for (int i = notesLargestFirst.length - 1; i >= 0; i--) c = new Cassette(notesLargestFirst[i], 0, c);
        head = c;
    }

    Optional<Map<Long, Integer>> plan(long amount) {
        Map<Long, Integer> plan = new TreeMap<>(Comparator.reverseOrder());
        return head.plan(amount, plan) ? Optional.of(plan) : Optional.empty();
    }

    /** Checks every cassette, then removes: never a partial removal. */
    void take(Map<Long, Integer> plan) {
        for (Cassette c = head; c != null; c = c.next)
            if (c.count() < plan.getOrDefault(c.note, 0)) throw new IllegalStateException("Stale plan");
        for (Cassette c = head; c != null; c = c.next) c.remove(plan.getOrDefault(c.note, 0));
    }

    void load(long note, int count) {
        for (Cassette c = head; c != null; c = c.next)
            if (c.note == note) { c.add(count); return; }
        throw new IllegalArgumentException("No cassette for note " + note);
    }

    long total() {
        long sum = 0;
        for (Cassette c = head; c != null; c = c.next) sum += c.note * c.count();
        return sum;
    }
}` },
        { type: `code`, lang: `java`, title: `Session states`, code: `/** What each customer action means right now. Records are immutable; the Atm swaps them under its lock. */
sealed interface AtmState permits Idle, CardInserted, Authenticated, OutOfService {
    default void insertCard(Atm atm, Card card)        { throw reject("insert a card"); }
    default PinResult enterPin(Atm atm, String pin)    { throw reject("enter a PIN"); }
    default long balance(Atm atm)                      { throw reject("check the balance"); }
    default Transaction withdraw(Atm atm, long amount) { throw reject("withdraw"); }
    default void ejectCard(Atm atm)                    { throw reject("eject a card"); }

    private IllegalStateException reject(String action) {
        return new IllegalStateException("Cannot " + action + " while " + getClass().getSimpleName());
    }
}

record Idle() implements AtmState {
    public void insertCard(Atm atm, Card card) { atm.setState(new CardInserted(card, 0)); }
}

record CardInserted(Card card, int wrongPins) implements AtmState {
    public PinResult enterPin(Atm atm, String pin) {
        AuthResult r = atm.bank().verifyPin(card.number(), pin);
        if (r == AuthResult.OK) {
            atm.setState(new Authenticated(card));
            return PinResult.OK;
        }
        if (r == AuthResult.BLOCKED || wrongPins + 1 >= Atm.MAX_PIN_ATTEMPTS) {
            atm.retainCard();                                  // ends the session
            return PinResult.CARD_RETAINED;
        }
        atm.setState(new CardInserted(card, wrongPins + 1));
        return PinResult.WRONG_PIN;
    }
    public void ejectCard(Atm atm) { atm.endSession(); }
}

record Authenticated(Card card) implements AtmState {
    public long balance(Atm atm) { return atm.bank().balance(card.number()); }
    public Transaction withdraw(Atm atm, long amount) { return atm.runWithdrawal(card, amount); }
    public void ejectCard(Atm atm) { atm.endSession(); }
}

record OutOfService(Reason reason) implements AtmState {   // rejects every customer action
    enum Reason { OUT_OF_CASH, FAULT, MAINTENANCE }
}` },
        { type: `code`, lang: `java`, title: `Atm`, code: `final class Atm {
    static final long RS = 100;                                // paise per rupee
    static final long STEP = 100 * RS;                         // withdrawals in multiples of Rs 100
    static final long PER_TXN_LIMIT = 10_000 * RS;
    static final int MAX_PIN_ATTEMPTS = 3;

    private final String id;
    private final BankService bank;
    private final CashHardware hardware;
    // Guarded by this object's monitor: every public method is synchronized.
    private final CashDispenser cash = new CashDispenser(2000 * RS, 500 * RS, 200 * RS, 100 * RS);
    private final List<Transaction> journal = new ArrayList<>();
    private AtmState state = new OutOfService(OutOfService.Reason.OUT_OF_CASH);   // empty until refilled

    Atm(String id, BankService bank, CashHardware hardware) { this.id = id; this.bank = bank; this.hardware = hardware; }

    // Customer actions: delegate to the current state.
    synchronized void insertCard(Card card)        { state.insertCard(this, card); }
    synchronized PinResult enterPin(String pin)    { return state.enterPin(this, pin); }
    synchronized long balance()                    { return state.balance(this); }
    synchronized Transaction withdraw(long amount) { return state.withdraw(this, amount); }
    synchronized void ejectCard()                  { state.ejectCard(this); }

    // Operator actions: may arrive mid-session; the monitor runs each one whole.
    synchronized void refill(long note, int count) {
        if (count <= 0) throw new IllegalArgumentException("Count must be positive");
        cash.load(note, count);
        if (state instanceof OutOfService o && o.reason() == OutOfService.Reason.OUT_OF_CASH) state = new Idle();
    }

    synchronized void takeOutOfService() {
        if (!(state instanceof Idle || state instanceof OutOfService)) throw new IllegalStateException("A customer is mid-session");
        state = new OutOfService(OutOfService.Reason.MAINTENANCE);
    }

    synchronized void restore() {
        if (!(state instanceof OutOfService)) throw new IllegalStateException("Not out of service");
        idleOrOutOfCash();
    }

    synchronized List<Transaction> journal() { return List.copyOf(journal); }

    // Called by the states, always from a synchronized method above, so the monitor is held.
    BankService bank() { return bank; }
    void setState(AtmState next) { state = next; }
    void retainCard() { hardware.retainCard(); idleOrOutOfCash(); }
    void endSession() { hardware.returnCard(); idleOrOutOfCash(); }

    private void idleOrOutOfCash() {
        state = cash.total() >= STEP ? new Idle() : new OutOfService(OutOfService.Reason.OUT_OF_CASH);
    }

    /** Plan the notes, debit the bank, then dispense; a dispenser fault reverses the debit. */
    Transaction runWithdrawal(Card card, long amount) {
        String txnId = UUID.randomUUID().toString();           // also the bank's idempotency key
        if (amount <= 0 || amount % STEP != 0) return recordTxn(txnId, card, amount, TxnStatus.DECLINED, "Amount must be a multiple of Rs 100");
        if (amount > PER_TXN_LIMIT) return recordTxn(txnId, card, amount, TxnStatus.DECLINED, "Above the per-transaction limit");
        Optional<Map<Long, Integer>> plan = cash.plan(amount);   // reads counts only
        if (plan.isEmpty()) return recordTxn(txnId, card, amount, TxnStatus.DECLINED, "Notes for this amount are not available");
        DebitResult debit = bank.debit(card.number(), amount, txnId);
        if (debit != DebitResult.OK) return recordTxn(txnId, card, amount, TxnStatus.DECLINED, debit.name());
        cash.take(plan.get());                                 // the notes leave the cassettes now
        try {
            hardware.dispense(plan.get());
        } catch (DispenseException e) {
            bank.reverse(card.number(), txnId);                // compensate; jammed notes go to the reject bin
            hardware.returnCard();
            state = new OutOfService(OutOfService.Reason.FAULT);
            return recordTxn(txnId, card, amount, TxnStatus.REVERSED, "Dispenser fault, debit reversed");
        }
        return recordTxn(txnId, card, amount, TxnStatus.COMPLETED, "Dispensed");
    }

    private Transaction recordTxn(String txnId, Card card, long amount, TxnStatus status, String reason) {
        Transaction t = new Transaction(txnId, id, card.masked(), amount, status, reason, Instant.now());
        journal.add(t);
        return t;
    }
}` },
        { type: `callout`, tone: `insight`, title: `Where thread safety lives`, html: `<p>Every public <code>Atm</code> method is <code>synchronized</code>, so one monitor guards the state, the cassette counts and the journal together: an operator's refill that arrives mid-withdrawal waits, then runs whole, and can never land between the plan and the take. The states are immutable records, and <code>CashDispenser</code> is deliberately unsynchronized because it is only ever touched under that monitor. Balances never live here; the bank makes each debit atomic per account.</p>` },
        { type: `callout`, tone: `tip`, title: `Holding the lock across the bank call`, html: `<p>It is a single-customer machine, so the only thing that waits is an operator action, for a bank call with a timeout of a few seconds. The lock order is always ATM then account, and the bank never calls back into an ATM, so no deadlock cycle can form. The Deep Dives show the variant that releases the lock during the call.</p>` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `The operator loads 10 x Rs 500 and 10 x Rs 200 (no Rs 2000 or Rs 100 notes). The ATM moves from OutOfService(OUT_OF_CASH) to Idle.`,
          `A customer inserts a card and types a wrong PIN: <code>WRONG_PIN</code>, and the state becomes <code>CardInserted(card, 1)</code>. The right PIN moves it to <code>Authenticated</code>.`,
          `Withdraw Rs 600. The Rs 500 link tries one note, leaving Rs 100 that nobody can make, so it backs off to zero; the Rs 200 link takes three. The bank debits with the transaction id as the key, the notes are removed and dispensed: <code>COMPLETED</code>.`,
          `Withdraw Rs 250: declined, not a multiple of Rs 100. Withdraw Rs 100: no loaded note can make it, so it is declined before the bank is called. Neither changes anything.`,
          `Withdraw Rs 1000: the plan is 2 x Rs 500, the bank debits, and the dispenser jams. The ATM reverses the debit with the same key, returns the card, records <code>REVERSED</code> and goes to OutOfService(FAULT).`,
          `An operator's <code>refill</code> sent during any of these steps waits for the monitor and runs between two customer actions, never inside one.`
        ] }
      ] }
    ],
    levels: levels(
      [`The card, PIN and withdrawal flow with clear states (an enum is acceptable at first), the bank behind an interface, and amount validation.`, `A dispense chain over the denominations that respects how many notes each cassette holds.`],
      [`The State pattern with immutable state records and every transition under one lock, with a reason it beats an enum here.`, `Inventory-aware planning that backtracks, with the greedy counter-example (Rs 600 from 500s and 200s).`, `The plan, debit, dispense order with a reversal on a jam, an idempotency key on the debit, and a clear account of what the ATM lock protects.`],
      [`Bank-side atomicity (per-account lock, compare-and-set or a conditional database update) and why the ATM lock cannot provide it.`, `Unknown outcomes after timeouts: retries with the same key, queued reversals, tombstones and reconciliation against the reject bin.`, `Security: encrypted PIN blocks, bank-wide attempt counters, inactivity timeouts, and keeping PINs and full card numbers out of logs.`]
    ),
    concepts: [
      { term: `State pattern for the session`, def: `The ATM hands each customer action to its current state object, which decides what the action means and which state comes next.`, why: `Twenty action and state combinations stay organised, and every invalid action gets one clear rejection.` },
      { term: `Immutable state records`, def: `Each state is a record holding only its own data (the card, the wrong-PIN count); a transition replaces the reference under the ATM's lock.`, why: `Nothing to reset by hand when a session ends, and nothing to synchronise inside a state.` },
      { term: `Chain of Responsibility over cassettes`, def: `Cassettes are linked from the largest note down; each handles its own denomination and passes the remainder on.`, why: `Adding or retiring a denomination is one link, and no method hard-codes the list.` },
      { term: `Inventory-aware backtracking`, def: `A link tries the most notes it can use, then one fewer each time the rest of the chain cannot finish.`, why: `Greedy declines Rs 600 when only 500s and 200s are loaded; backtracking finds 3 x Rs 200.`, ex: `Rs 2600 from 1 x 2000, 1 x 500, 5 x 200: greedy is stuck at Rs 100 left; the chain finds 2000 + 200 + 200 + 200.` },
      { term: `Plan, then commit`, def: `Compute the whole note plan without touching counts; remove notes only after the bank approves.`, why: `A decline at any step leaves the cassettes exactly as they were.` },
      { term: `Debit before dispense, reverse on fault`, def: `The bank is debited first; if the dispenser jams, a compensating reversal with the same key undoes the debit.`, why: `A debit can be undone; cash already handed out cannot.` },
      { term: `Idempotency key`, def: `Every debit carries the transaction id; the bank stores the outcome per key and returns it on a repeat.`, why: `Retrying after a timeout can never debit twice.` },
      { term: `Atomic debit at the bank`, def: `The balance check, the daily-limit check and the debit happen under one per-account lock, or as one conditional database update.`, why: `One account used from two ATMs at once can't be overdrawn.` },
      { term: `Card retention and attempt limits`, def: `Three wrong PINs in a session retain the card; the bank also counts failures across all ATMs and blocks the card.`, why: `A thief can't spread guesses across many machines.` }
    ],
    interview: [
      { q: `Why the State pattern here rather than an enum and switch statements?`, a: `Five customer actions times four states is twenty decisions, and two states carry data: the card and the wrong-PIN count. With an enum, every method switches on the status, and the card and counter sit in loose fields that each exit path must reset; miss one reset and the next customer inherits someone else's strikes. With state records, each state's rules sit together, its data travels inside it and disappears on transition, and a new state such as Dispensing is a new class. For two states with no data I'd use an enum.`, diff: `medium` },
      { q: `Why can a greedy dispense chain fail, and how do you fix it?`, a: `A large note taken early can leave a remainder that the smaller cassettes can't make. With only 500s and 200s loaded, greedy takes a 500 for Rs 600 and is stuck with Rs 100, although three 200s work. Each link tries the most notes first and, if the rest of the chain fails, retries with one fewer. It still finds the greedy answer in one pass when that works and backtracks only when it must. For many denominations, bounded change by dynamic programming does the same in a small table. Either way the plan reads counts only.`, diff: `medium` },
      { q: `In what order do you debit the account and dispense the cash?`, a: `Validate, plan the notes, debit the bank, remove the notes, dispense. Planning before the debit means a customer is never charged for an amount the machine can't pay. Debiting before dispensing matters because a debit can be reversed but cash handed out can't be recalled. If the dispenser faults, reverse the debit with the same key, record REVERSED, return the card and go out of service. Dispensing first and debiting after would turn a failed debit into free money.`, diff: `hard` },
      { q: `The same account withdraws at two ATMs at the same moment. What stops an overdraft?`, a: `Not the ATM locks: each one only protects its own machine. The bank makes check-and-debit one atomic step per account, under a per-account lock or as a conditional UPDATE ... WHERE balance >= amount. Both requests reach the bank; one passes the balance and daily-limit checks and debits, and the other sees the reduced balance and gets INSUFFICIENT_FUNDS. Different accounts never contend.`, diff: `medium` },
      { q: `The bank call times out during a debit. What do you do?`, a: `The outcome is unknown: the bank may have debited. Retry with the same idempotency key (the transaction id), so the bank returns the stored result instead of debiting again. If retries run out, dispense nothing, tell the customer, and queue a reversal with that key. The bank applies the reversal once, or, if the debit never arrived, stores a tombstone so a late debit with that key is refused. Reconciliation against the bank's ledger catches anything left over.`, diff: `hard` },
      { q: `Which limits does the ATM enforce and which does the bank enforce?`, a: `The multiple-of-Rs-100 rule and the per-transaction cap are local facts, so the ATM checks them before calling anyone. The balance and the daily limit depend on every ATM, app and branch the customer used today, so only the bank can check them, atomically with the debit. PINs split the same way: the ATM counts tries in this session to decide when to retain the card, and the bank counts failures across all ATMs and blocks the card, which the ATM obeys by retaining it.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `ATM in one screen`, type: `code`, lang: `java`, body: `sealed interface AtmState permits Idle, CardInserted, Authenticated, OutOfService {
    // insertCard, enterPin, balance, withdraw, ejectCard: reject by default
}
record CardInserted(Card card, int wrongPins) implements AtmState {}   // 3rd wrong PIN: retain the card
final class Cassette {                       // chain link, largest note first
    boolean plan(long amount, Map<Long, Integer> plan);   // most notes first, back off on failure
}
final class Atm {                            // every public method synchronized
    Transaction runWithdrawal(Card card, long amount) {
        // validate, plan (reads only), bank.debit(key), take notes, dispense
        // dispense fails: bank.reverse(key), OutOfService(FAULT)
    }
}
interface BankService {
    AuthResult verifyPin(String card, String pin);
    DebitResult debit(String card, long amount, String key);   // atomic per account, idempotent
    void reverse(String card, String key);
}` },
      { title: `Session state table`, type: `table`, headers: [`State`, `insertCard`, `enterPin`, `balance / withdraw`, `ejectCard`], rows: [
        [`Idle`, `Go to CardInserted`, `Reject`, `Reject`, `Reject`],
        [`CardInserted`, `Reject`, `OK: Authenticated. Wrong: count. 3rd wrong or BLOCKED: retain card, Idle`, `Reject`, `Return card, Idle`],
        [`Authenticated`, `Reject`, `Reject`, `Run it, stay (jam: OutOfService)`, `Return card, Idle`],
        [`OutOfService`, `Reject`, `Reject`, `Reject`, `Reject (refill or restore leaves it)`]
      ] },
      { title: `Edge cases`, type: `list`, items: [
        `Amount zero, negative, not a multiple of Rs 100, or above Rs 10,000: decline before planning`,
        `Reachable only by skipping a large note (Rs 600 from 500s and 200s): the chain backtracks`,
        `Unreachable with the loaded notes: decline before the debit`,
        `Insufficient funds or daily limit: the bank declines; no notes removed`,
        `Bank timeout: retry with the same key, then queue a reversal and dispense nothing`,
        `Dispenser jam after the debit: reverse, return the card, OutOfService(FAULT)`,
        `Third wrong PIN, or the bank says BLOCKED: retain the card`,
        `Refill during a session: waits for the monitor, never sees a half-done withdrawal`,
        `Cash runs low: the session ends in OutOfService(OUT_OF_CASH); a refill restores Idle`
      ] }
    ],
    labs: []
  });
})();
