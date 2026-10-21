// Deep dives: ATM (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["atm"] = {
  hook: `<p>Once the session, the cash chain and the withdrawal work, interviewers add twists to see whether the design bends without breaking: a new operation, a different note mix, a bank that stops answering, two machines draining one account, a customer who walks away. You rarely implement them in full; you show which class changes and why the rest doesn't. Mid-level candidates may get one or two of these, senior and staff candidates several, in more depth.</p>`,
  sections: [
    {
      id: "deposits",
      title: "\"How would you add cash deposits?\"",
      kicker: "Follow-up: a new operation",
      blocks: [
        { type: "text", html: `<p>A deposit is one more customer action that only makes sense once the customer is authenticated. That is exactly what the State pattern is for: add a default that rejects, override it in one state, and the other states need no edits. The money side needs one new bank call and one new piece of hardware.</p>` },
        { type: "table", headers: ["Class", "Change"], rows: [
          ["AtmState", "One more default method, <code>deposit</code>, that rejects"],
          ["Authenticated", "Overrides <code>deposit</code> and hands it to the Atm"],
          ["Idle, CardInserted, OutOfService", "Nothing: the default already rejects"],
          ["BankService", "<code>credit(card, amount, key)</code>, idempotent by key like a debit"],
          ["CashHardware", "<code>acceptNotes()</code>: the note acceptor counts and checks the notes"],
          ["Atm", "<code>deposit()</code>, <code>runDeposit</code>, and a deposit bin for unverified notes"],
          ["CashDispenser, Cassette", "Nothing, unless the machine recycles deposited notes into its cassettes"]
        ] },
        { type: "code", lang: "java", title: "Deposits: one more action, one more bank call", code: `// AtmState: one more default, so Idle, CardInserted and OutOfService reject deposits without edits.
default Transaction deposit(Atm atm) { throw reject("deposit"); }

// Authenticated: the only state that allows it.
public Transaction deposit(Atm atm) { return atm.runDeposit(card); }

// BankService: a credit is idempotent by key, exactly like a debit.
void credit(String cardNumber, long amount, String idempotencyKey);

// CashHardware: counts and checks the notes; fakes and foreign notes go back to the customer.
Map<Long, Integer> acceptNotes() throws AcceptorException;

// Atm: the same monitor as every other action.
private final Map<Long, Integer> depositBin = new HashMap<>();   // guarded by this; emptied by an operator

synchronized Transaction deposit() { return state.deposit(this); }

Transaction runDeposit(Card card) {
    String txnId = UUID.randomUUID().toString();
    Map<Long, Integer> notes;
    try {
        notes = hardware.acceptNotes();
    } catch (AcceptorException e) {
        return recordTxn(txnId, card, 0, TxnStatus.DECLINED, "Note acceptor fault");
    }
    long amount = 0;
    for (Map.Entry<Long, Integer> e : notes.entrySet()) amount += e.getKey() * e.getValue();
    if (amount == 0) return recordTxn(txnId, card, 0, TxnStatus.DECLINED, "No valid notes");
    notes.forEach((note, n) -> depositBin.merge(note, n, Integer::sum));   // not the cassettes: unverified notes
    bank.credit(card.number(), amount, txnId);           // the amount comes from the counted notes, never the keypad
    return recordTxn(txnId, card, amount, TxnStatus.COMPLETED, "Deposited");
}` },
        { type: "keypoints", items: [
          "<strong>The amount is counted, never typed.</strong> The customer's claim about how much they put in is input you can't trust; the acceptor's count is the amount credited.",
          "<strong>The failure direction flips.</strong> In a withdrawal an unknown bank outcome is fixed by a reversal. In a deposit the machine already holds the customer's money, so an unknown outcome is fixed by retrying the credit with the same key until it lands.",
          "<strong>Real machines escrow the notes</strong> and show the count for the customer to confirm or cancel. That is one more state, <code>DepositEscrow(card, notes)</code>, whose confirm credits the bank and whose cancel hands the notes back."
        ] }
      ]
    },
    {
      id: "note-mix",
      title: "\"Can you pay with the fewest notes, or let the customer choose the mix?\"",
      kicker: "Follow-up: a planning strategy",
      blocks: [
        { type: "text", html: `<p>The backing-off chain finds a mix, largest notes first. Is that ever more notes than necessary? For Rs 2000, 500, 200 and 100 we checked 126,000 combinations of cassette counts and amounts against an exact fewest-notes search, and the two always used the same number of notes. With other denominations they can differ: with Rs 400, 300 and 100 notes, Rs 600 from the chain is 400 + 100 + 100, while the fewest is 300 + 300. Customers asking for "no Rs 2000 notes, please" is a more common reason to change the rule.</p>` },
        { type: "text", html: `<p>So planning becomes a <strong>Strategy</strong>. The cassettes keep owning the counts; a planner only reads them and returns a plan. <code>CashDispenser.plan</code> delegates to it, and <code>take</code>, <code>load</code> and <code>total</code> don't change. The existing chain becomes one planner among several.</p>` },
        { type: "code", lang: "java", title: "NotePlanner: fewest notes by dynamic programming", code: `/** How to turn an amount into notes. The cassettes own the counts; a planner only reads them. */
interface NotePlanner {
    Optional<Map<Long, Integer>> plan(long amount, SortedMap<Long, Integer> available);   // note -> count
}

// CashDispenser: plan delegates; counts() copies note -> count from the chain. take, load and total don't change.
Optional<Map<Long, Integer>> plan(long amount) { return planner.plan(amount, counts()); }

/** Fewest notes for any set of denominations, by bounded change-making. */
final class FewestNotes implements NotePlanner {
    public Optional<Map<Long, Integer>> plan(long amount, SortedMap<Long, Integer> available) {
        long unit = 100 * Atm.RS;                            // every note and amount is a multiple of Rs 100
        if (amount % unit != 0) return Optional.empty();
        int target = (int) (amount / unit), none = Integer.MAX_VALUE;
        List<Long> notes = List.copyOf(available.keySet());
        int[] best = new int[target + 1];                    // fewest notes for each sub-amount so far
        int[][] take = new int[notes.size()][target + 1];    // notes of type i used for that sub-amount
        Arrays.fill(best, none);
        best[0] = 0;
        for (int i = 0; i < notes.size(); i++) {
            int value = (int) (notes.get(i) / unit), count = available.get(notes.get(i));
            for (int a = target; a > 0; a--)                 // downwards: lower cells still hold the previous row
                for (int k = 1; k <= count && k * value <= a; k++) {
                    int prev = best[a - k * value];
                    if (prev != none && prev + k < best[a]) { best[a] = prev + k; take[i][a] = k; }
                }
        }
        if (best[target] == none) return Optional.empty();
        Map<Long, Integer> plan = new TreeMap<>(Comparator.reverseOrder());
        for (int i = notes.size() - 1, a = target; i >= 0; i--) {
            int k = take[i][a];
            if (k > 0) plan.put(notes.get(i), k);
            a -= k * (int) (notes.get(i) / unit);
        }
        return Optional.of(plan);
    }
}

/** "No Rs 2000 notes, please": hide some notes, then ask any other planner (a Decorator). */
record Without(Set<Long> excluded, NotePlanner inner) implements NotePlanner {
    public Optional<Map<Long, Integer>> plan(long amount, SortedMap<Long, Integer> available) {
        SortedMap<Long, Integer> view = new TreeMap<>(available);
        view.keySet().removeAll(excluded);
        return inner.plan(amount, view);
    }
}` },
        { type: "keypoints", items: [
          "The table has one cell per Rs 100 up to the amount, so a Rs 10,000 cap means 101 cells per note: tiny.",
          "A customer's preference reaches the planner through <code>Authenticated.withdraw</code>, for example as an optional set of excluded notes; the Atm wraps the default planner in <code>Without</code> for that one call.",
          "Other business rules (spend the fullest cassette first, include a few small notes for change) are more planners. Add them only when the requirement exists."
        ] },
        { type: "quiz", q: "Cassettes hold Rs 500 x 4 and Rs 200 x 5, nothing else. A customer asks for Rs 1,100. What should the dispenser do?", options: [
          "Decline: Rs 1,100 is not a multiple of Rs 500",
          "Dispense 500 + 500 and show Rs 100 as owed",
          "Dispense 500 + 200 + 200 + 200",
          "Debit the account first, then search for a mix"
        ], answer: 2, explain: `<p>Greedy takes two 500s and is stuck with Rs 100. The backing-off chain drops to one 500, and the 200 cassette makes the remaining Rs 600 with three notes; the fewest-notes planner finds the same four notes. Either way the plan exists before the bank is called, so a decline would never have debited anyone.</p>` }
      ]
    },
    {
      id: "bank-timeout",
      title: "\"The bank call times out in the middle of a debit. What does the ATM do?\"",
      kicker: "Follow-up: unknown outcomes",
      blocks: [
        { type: "text", html: `<p>A timeout is the worst answer: the bank may or may not have debited. Dispensing is unsafe (maybe no debit) and simply giving up is unsafe too (maybe a debit with no cash). The idempotency key already on every debit is what makes this solvable. Only <code>Atm</code> changes: the debit goes through a retry helper, and a background job sends reversals until the bank confirms them.</p>` },
        { type: "code", lang: "java", title: "Retry with the same key, then queue a reversal", code: `class BankTimeoutException extends RuntimeException {}    // the bank's outcome is unknown

record PendingReversal(String cardNumber, String key) {}

// Atm: added to under the Atm monitor, drained by a background thread without it, so a concurrent queue.
private final Queue<PendingReversal> pendingReversals = new ConcurrentLinkedQueue<>();

/** Up to three tries with one key: however many arrive, the bank applies the debit at most once. */
Optional<DebitResult> debitWithRetry(String cardNumber, long amount, String key) {
    for (int attempt = 1; attempt <= 3; attempt++) {
        try {
            return Optional.of(bank.debit(cardNumber, amount, key));
        } catch (BankTimeoutException e) {
            // Unknown outcome. The same key makes the retry safe; real code backs off between tries.
        }
    }
    pendingReversals.add(new PendingReversal(cardNumber, key));   // undo whatever may have happened
    return Optional.empty();
}

// In runWithdrawal the debit becomes:
//   Optional<DebitResult> debit = debitWithRetry(card.number(), amount, txnId);
//   if (debit.isEmpty()) return recordTxn(txnId, card, amount, TxnStatus.DECLINED, "Bank unavailable, reversal queued");

/** One background thread runs this every few seconds: each reversal is sent until the bank answers. */
void drainReversals() {
    for (PendingReversal r; (r = pendingReversals.peek()) != null; ) {
        try {
            bank.reverse(r.cardNumber(), r.key());
            pendingReversals.poll();                         // only this thread removes, so peek then poll is safe
        } catch (BankTimeoutException e) {
            return;                                          // try again on the next run
        }
    }
}` },
        { type: "callout", tone: "warning", title: "A reversal is a new ledger entry, not an undo", html: `<p>Banks never delete a ledger row. A reversal appends a credit that references the original debit's key, which is why it can be idempotent: the bank checks whether that key was already reversed. If the reversal arrives before a delayed debit, the bank stores a tombstone under the key so the late debit is refused rather than applied. That is the <code>CANCELLED</code> value of <code>DebitResult</code>.</p>` },
        { type: "keypoints", items: [
          "Nothing is dispensed after a failed retry: an unknown outcome is always resolved towards \"no debit\".",
          "The journal records the transaction with its key, so reconciliation can match it against the bank's ledger if a reversal is still queued when the machine restarts. In production the queue is persisted.",
          "<code>BankService</code>'s signature doesn't change; only the network client underneath it learns to throw on a timeout."
        ] }
      ]
    },
    {
      id: "two-atms",
      title: "\"Two ATMs withdraw from one account at the same moment. What stops an overdraft?\"",
      kicker: "Follow-up: concurrency at the bank",
      blocks: [
        { type: "text", html: `<p>Not the ATM's lock: it only protects one machine. Mixing up the two kinds of shared state is the most common mistake in this problem. Only the bank changes, and only its implementation: the interface already promises an atomic, idempotent debit.</p>` },
        { type: "table", headers: ["Shared state", "Touched by", "Guard", "Why it is safe"], rows: [
          ["Session state, cassette counts, journal", "This machine's customer, operator and timers", "The Atm monitor", "Each action is one critical section; a refill can't land between plan and take"],
          ["State objects", "Read under the Atm monitor", "Immutable records", "Nothing changes after construction"],
          ["Balance, daily total, idempotency records", "Every ATM, app and branch", "A per-account lock at the bank", "Check and debit are one step; two ATMs can't both pass the balance check"],
          ["The accounts map", "All bank threads", "ConcurrentHashMap", "Lookups and inserts are safe without a global lock"]
        ] },
        { type: "code", lang: "java", title: "Bank: atomic, idempotent debit", code: `final class InMemoryBank implements BankService {
    private record Debit(long amount, DebitResult result, boolean reversed, LocalDate day) {}

    private static final class Account {                     // every field guarded by synchronized (this)
        final String pinHash;                                // salted slow hash (bcrypt or Argon2), never the PIN
        final long dailyLimit;
        long balance, withdrawnToday;
        LocalDate day;
        int wrongPins;
        final Map<String, Debit> debits = new HashMap<>();   // idempotency key -> outcome

        Account(String pinHash, long balance, long dailyLimit) {
            this.pinHash = pinHash; this.balance = balance; this.dailyLimit = dailyLimit;
        }
    }

    private final Map<String, Account> accounts = new ConcurrentHashMap<>();   // by card number
    private final PinHasher hasher;                          // constant-time check against the slow hash
    private final Clock clock;

    InMemoryBank(PinHasher hasher, Clock clock) { this.hasher = hasher; this.clock = clock; }

    void open(String card, String pinHash, long balance, long dailyLimit) {
        accounts.put(card, new Account(pinHash, balance, dailyLimit));
    }

    public AuthResult verifyPin(String card, String pin) {
        Account a = accounts.get(card);
        if (a == null) return AuthResult.BLOCKED;            // unknown card: the ATM retains it
        synchronized (a) {
            if (a.wrongPins >= 3) return AuthResult.BLOCKED;
            if (hasher.matches(pin, a.pinHash)) { a.wrongPins = 0; return AuthResult.OK; }
            return ++a.wrongPins >= 3 ? AuthResult.BLOCKED : AuthResult.WRONG_PIN;
        }
    }

    public long balance(String card) {
        Account a = account(card);
        synchronized (a) { return a.balance; }
    }

    public DebitResult debit(String card, long amount, String key) {
        Account a = account(card);
        synchronized (a) {                                   // one account at a time; others run in parallel
            Debit seen = a.debits.get(key);
            if (seen != null) return seen.result();          // a retry: same answer, no second debit
            rollDay(a);
            DebitResult r = amount > a.balance ? DebitResult.INSUFFICIENT_FUNDS
                : a.withdrawnToday + amount > a.dailyLimit ? DebitResult.DAILY_LIMIT_EXCEEDED
                : DebitResult.OK;
            if (r == DebitResult.OK) { a.balance -= amount; a.withdrawnToday += amount; }
            a.debits.put(key, new Debit(amount, r, false, a.day));
            return r;
        }
    }

    public void reverse(String card, String key) {
        Account a = account(card);
        synchronized (a) {
            rollDay(a);
            Debit d = a.debits.get(key);
            if (d == null) {                                 // the reversal overtook the debit: refuse it later
                a.debits.put(key, new Debit(0, DebitResult.CANCELLED, true, a.day));
                return;
            }
            if (d.reversed() || d.result() != DebitResult.OK) return;   // already undone, or nothing taken
            a.balance += d.amount();
            if (d.day().equals(a.day)) a.withdrawnToday -= d.amount();
            a.debits.put(key, new Debit(d.amount(), d.result(), true, d.day()));
        }
    }

    private Account account(String card) {
        Account a = accounts.get(card);
        if (a == null) throw new IllegalArgumentException("Unknown card");
        return a;
    }

    private void rollDay(Account a) {
        LocalDate today = LocalDate.now(clock);
        if (!today.equals(a.day)) { a.day = today; a.withdrawnToday = 0; }
    }
}` },
        { type: "text", html: `<p>The idempotency record lives inside the account and is written under the same lock as the balance, so "have I seen this key?", "is there enough money?" and "debit it" form one atomic step. A compare-and-set on an <code>AtomicLong</code> balance could make the debit lock-free, but the daily total and the idempotency record would then be separate updates; changing three things together needs a lock, or one immutable account snapshot swapped through an <code>AtomicReference</code>. With a database, the same step is <code>UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance &gt;= ?</code> plus an insert into a table with a unique constraint on the idempotency key, in one transaction.</p>` },
        { type: "callout", tone: "mistake", html: `<p>Counting wrong PINs only in the ATM's memory. The count resets when the customer takes the card to the next machine, so the real limit lives at the bank, keyed by card, as <code>wrongPins</code> above. The ATM's own count is a usability feature: it decides when this machine keeps the card.</p>` }
      ]
    },
    {
      id: "refill-during-call",
      title: "\"Can an operator refill while the bank call is in flight?\"",
      kicker: "Follow-up: releasing the lock",
      blocks: [
        { type: "text", html: `<p>In the solution the Atm holds its monitor across the bank call, so a refill or a status screen waits for up to the call's timeout. If calls can be slow, release the lock for the call. Once the lock is released, other threads can observe the machine mid-withdrawal, so that moment must become a real state, and the planned notes must be reserved so a refill or a second plan can't spend them.</p>` },
        { type: "table", headers: ["Class", "Change"], rows: [
          ["AtmState", "A fifth record, <code>Dispensing</code>, added to the <code>permits</code> list; its defaults reject every customer action"],
          ["Atm", "<code>withdraw</code> runs in three steps: reserve under the lock, call the bank without it, finish under the lock"],
          ["CashDispenser", "Nothing new: <code>take</code> reserves and <code>load</code> puts reserved notes back"],
          ["Operator actions", "Nothing: a refill only adds counts; <code>takeOutOfService</code> already refuses anything but Idle"]
        ] },
        { type: "code", lang: "java", title: "Dispensing as a real state", code: `// The bank call is in flight. Every customer action reaches the interface defaults and is rejected.
record Dispensing(Card card, long amount, Map<Long, Integer> plan, String txnId) implements AtmState {}

// Atm.withdraw no longer holds the monitor across the bank call.
Transaction withdraw(long amount) {
    Dispensing d;
    synchronized (this) {
        if (!(state instanceof Authenticated a)) return state.withdraw(this, amount);   // the state rejects it
        String txnId = UUID.randomUUID().toString();
        if (amount <= 0 || amount % STEP != 0 || amount > PER_TXN_LIMIT)
            return recordTxn(txnId, a.card(), amount, TxnStatus.DECLINED, "Invalid amount");
        Optional<Map<Long, Integer>> plan = cash.plan(amount);
        if (plan.isEmpty()) return recordTxn(txnId, a.card(), amount, TxnStatus.DECLINED, "Notes for this amount are not available");
        cash.take(plan.get());                               // reserved: a refill or another plan can't spend them
        d = new Dispensing(a.card(), amount, Map.copyOf(plan.get()), txnId);
        state = d;
    }
    DebitResult debit;
    try {
        debit = bank.debit(d.card().number(), d.amount(), d.txnId());   // no lock: refills and status reads go ahead
    } catch (RuntimeException e) {
        debit = null;                                        // unknown outcome
    }
    synchronized (this) {
        if (debit != DebitResult.OK) {
            d.plan().forEach(cash::load);                    // un-reserve
            state = new Authenticated(d.card());
            if (debit == null) pendingReversals.add(new PendingReversal(d.card().number(), d.txnId()));
            String reason = debit == null ? "Bank unavailable, reversal queued" : debit.name();
            return recordTxn(d.txnId(), d.card(), d.amount(), TxnStatus.DECLINED, reason);
        }
        try {
            hardware.dispense(d.plan());
        } catch (DispenseException e) {
            bank.reverse(d.card().number(), d.txnId());
            hardware.returnCard();
            state = new OutOfService(OutOfService.Reason.FAULT);
            return recordTxn(d.txnId(), d.card(), d.amount(), TxnStatus.REVERSED, "Dispenser fault, debit reversed");
        }
        state = new Authenticated(d.card());
        return recordTxn(d.txnId(), d.card(), d.amount(), TxnStatus.COMPLETED, "Dispensed");
    }
}` },
        { type: "compare", items: [
          { title: "Hold the lock across the call", tone: "ok", html: `<p>The solution's choice. Simple and obviously correct: a single-customer machine has nobody else to serve, an operator waits at most one timeout, and the lock order is always ATM then account.</p>` },
          { title: "Reserve, unlock, call, relock", tone: "info", html: `<p>Worth it when calls can be slow or status screens must stay live. The price is a new state, a reservation that has to be undone on every non-OK path, and a few more cases to test.</p>` }
        ] },
        { type: "callout", tone: "interview", html: `<p>Lay out both and pick one: "Holding the lock is simpler and the only thing that waits is the operator. If the interviewer cares about a slow bank, I'd make Dispensing a real state and reserve the notes." Naming the cost of the clever option is what makes the answer senior.</p>` }
      ]
    },
    {
      id: "walk-away",
      title: "\"What if the customer walks away mid-session, or leaves the cash?\"",
      kicker: "Follow-up: timeouts",
      blocks: [
        { type: "text", html: `<p>Two different abandonments. A customer who walks away after the PIN leaves an authenticated session open for the next person; a customer who forgets the notes leaves them in the shutter. The first needs an inactivity timeout on the <code>Atm</code>; the second needs <code>CashHardware.dispense</code> to report whether the notes were taken, and the withdrawal to reverse if they weren't.</p>` },
        { type: "code", lang: "java", title: "Inactivity timeout and retracted cash", code: `static final Duration INACTIVITY = Duration.ofSeconds(30);
private final Clock clock;                                   // injected, so tests control time
private Instant lastActivity;                                // guarded by this; set by every customer action

/** Runs every few seconds on a ScheduledExecutorService, under the same monitor as every action. */
synchronized void checkInactivity() {
    boolean inSession = state instanceof CardInserted || state instanceof Authenticated;
    if (inSession && Duration.between(lastActivity, clock.instant()).compareTo(INACTIVITY) > 0)
        endSession();                                        // returns the card; the slot retains it if nobody takes it
}

// CashHardware.dispense now reports whether the notes were taken before the shutter closed.
enum Pickup { TAKEN, RETRACTED }
Pickup dispense(Map<Long, Integer> notes) throws DispenseException;

// In runWithdrawal, inside the existing try (a fault still reverses as before):
Pickup pickup = hardware.dispense(plan.get());
if (pickup == Pickup.RETRACTED) {                            // the notes went back into the reject bin
    bank.reverse(card.number(), txnId);
    return recordTxn(txnId, card, amount, TxnStatus.REVERSED, "Cash not taken, retracted");
}` },
        { type: "keypoints", items: [
          "<strong>The check and the actions share one monitor</strong>, so a timeout can never end a session in the middle of a withdrawal, and an action that arrives just before the check refreshes <code>lastActivity</code> first.",
          "<strong>Checking a timestamp beats scheduling one timer per session.</strong> A per-session timer has to be cancelled or ignored when the session ends early; a periodic check simply finds nothing to do.",
          "<strong>Retracted notes are not put back in the cassettes.</strong> Like jammed notes, they go to the reject bin, and the REVERSED journal entry lets an engineer reconcile the bin.",
          "<strong>Nothing sensitive leaks while waiting.</strong> The PIN only ever exists as an encrypted block from the keypad, and the journal and logs see <code>card.masked()</code>, never the full number."
        ] }
      ]
    }
  ],
  takeaways: [
    "Follow-ups should touch one or two classes: a state and the bank for deposits, the dispenser's planner for note mixes, the Atm for timeouts and timers, only the bank for cross-ATM races.",
    "A new operation is a default method on the state interface plus one override; the State pattern pays for itself here.",
    "Note planning becomes a Strategy when the rule must change; the chain and a fewest-notes search agree for Indian notes, and differ only for unusual denominations.",
    "An unknown bank outcome is resolved with the same idempotency key: retry, then queue a reversal; a tombstone stops a late debit.",
    "The ATM lock guards the machine; only the bank, with a per-account lock or a conditional update, can guard the balance.",
    "Releasing the lock during the bank call is possible, but it turns a hidden moment into a real Dispensing state with reserved notes."
  ]
};
