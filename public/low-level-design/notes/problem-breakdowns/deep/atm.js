// Deep dives: ATM Machine (LLD). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["atm"] = {
  hook: `<p>The happy path of an ATM is four states and a loop over note values. What interviewers probe is everything around it: a dispense chain that says "cannot dispense" for Rs 600 while holding plenty of Rs 200 notes, a customer debited for cash that jammed inside the machine, a retried network call that debits twice, and two ATMs draining one account at the same instant.</p><p>Each section below takes one of those failures and shows the design choice that prevents it.</p>`,
  sections: [
    {
      id: "state-vs-switch",
      title: "State classes or an enum and a switch?",
      kicker: "Pattern choice",
      blocks: [
        { type: "text", html: `<p>Both designs encode the same twenty decisions (five actions, four states). The difference is where the decisions and the per-state data live. Here is the enum version of two of the five methods.</p>` },
        { type: "code", lang: "java", title: "Same rules as an enum switch", code: `enum Status { IDLE, CARD_INSERTED, AUTHENTICATED, OUT_OF_SERVICE }

final class SwitchAtm {
    private Status status = Status.IDLE;
    private Card card;               // meaningful only in CARD_INSERTED and AUTHENTICATED
    private int wrongPins;           // meaningful only in CARD_INSERTED

    synchronized PinResult enterPin(String pin) {
        switch (status) {
            case CARD_INSERTED -> { /* verify, count, maybe retain */ return PinResult.OK; }
            default -> throw new IllegalStateException("Cannot enter a PIN while " + status);
        }
    }

    synchronized void ejectCard() {
        switch (status) {
            case CARD_INSERTED, AUTHENTICATED -> {
                card = null; wrongPins = 0; status = Status.IDLE;   // forget one reset and the next customer inherits it
            }
            default -> throw new IllegalStateException("No card to eject");
        }
    }
    // ... and the same switch again in insertCard, balance and withdraw
}` },
        { type: "compare", items: [
          { title: "Enum and switch", tone: "warn", html: `<p>One method per action, each with a switch over every state. Per-state data (<code>card</code>, <code>wrongPins</code>) lives in fields that exist in every state and must be cleared on every exit path. Adding a Dispensing state means editing all five switches.</p>` },
          { title: "State records", tone: "ok", html: `<p>One record per state, holding only its own data. Leaving a state discards its data automatically, so there is nothing to reset. A new state is a new record plus the transitions into it; the default methods reject everything else.</p>` }
        ] },
        { type: "callout", tone: "interview", html: `<p>Say when you would pick each. Two or three states with no per-state data: an enum is shorter and clearer. Here the session carries data that must not leak between customers, and the state list is known to grow (Dispensing, DepositAccepted, PinChange), which is the force that justifies the pattern.</p>` },
        { type: "callout", tone: "tip", html: `<p>Making states immutable records has a concurrency bonus: a state object never changes after it is built, so it needs no lock of its own. The only mutable thing is the ATM's reference to the current state, and that only changes inside the ATM's synchronized methods.</p>` }
      ]
    },
    {
      id: "cash-chain",
      title: "An inventory-aware chain, and why greedy fails",
      kicker: "Chain of Responsibility",
      blocks: [
        { type: "problem", html: `<p>The simple chain from the In a Hurry notes hands the amount to the largest-note handler, which takes as many notes as fit and passes the remainder on. Once cassettes have real counts, that greedy rule declines amounts the machine could pay.</p>` },
        { type: "code", lang: "java", title: "Greedy chain that fails on 600", code: `final class GreedyLink {
    final long note;
    final GreedyLink next;
    int count;

    GreedyLink(long note, int count, GreedyLink next) { this.note = note; this.count = count; this.next = next; }

    boolean plan(long amount, Map<Long, Integer> plan) {
        int use = (int) Math.min(count, amount / note);      // take as many as fit, never fewer
        if (use > 0) plan.put(note, use);
        long rest = amount - use * note;
        return rest == 0 || (next != null && next.plan(rest, plan));
    }
}
// Cassettes: Rs 500 x 10, Rs 200 x 10, no Rs 100. plan(600) takes one 500, leaves 100 and fails,
// although 200 + 200 + 200 works. It also leaves a half-filled plan behind on failure.` },
        { type: "table", title: "Greedy vs the backtracking chain", headers: ["Amount", "Notes loaded", "Greedy", "Backtracking chain"], rows: [
          ["Rs 600", "500 x 10, 200 x 10", "500, then Rs 100 left: fails", "200 x 3"],
          ["Rs 800", "500 x 1, 200 x 10", "500 + 200, then Rs 100 left: fails", "200 x 4"],
          ["Rs 2600", "2000 x 1, 500 x 1, 200 x 5", "2000 + 500, then Rs 100 left: fails", "2000 + 200 x 3"],
          ["Rs 1100", "500 x 4, 200 x 5", "500 x 2, then Rs 100 left: fails", "500 + 200 x 3"],
          ["Rs 300", "500 x 4, 200 x 5", "200, then Rs 100 left: fails", "Fails too: correctly declined before the bank call"]
        ] },
        { type: "text", html: `<p>The fix in the solution keeps the chain's shape: each link still owns one denomination and passes the remainder on, but it tries the most notes first and backs off one at a time when the rest of the chain reports failure. Only the successful path writes to the plan, so a failed search leaves nothing behind. Because the greedy choice is tried first, the usual case costs one pass; the search is bounded by four links and the Rs 10,000 cap, so even an impossible amount costs well under a millisecond.</p>` },
        { type: "code", lang: "java", title: "Fewest notes by dynamic programming", code: `/**
 * Fewest notes that make amount using at most counts[i] notes of value notes[i]; empty if impossible.
 * Amounts are in units of Rs 100, so a Rs 10,000 cap means a table of 101 cells.
 */
static Optional<int[]> fewestNotes(int amount, int[] notes, int[] counts) {
    int n = notes.length, none = Integer.MAX_VALUE;
    int[] best = new int[amount + 1];                 // fewest notes for each sub-amount so far
    int[][] take = new int[n][amount + 1];            // notes of type i chosen at that step
    Arrays.fill(best, none);
    best[0] = 0;
    for (int i = 0; i < n; i++)
        for (int a = amount; a > 0; a--)              // downwards: lower cells still hold the previous row
            for (int k = 1; k <= counts[i] && k * notes[i] <= a; k++) {
                int prev = best[a - k * notes[i]];
                if (prev != none && prev + k < best[a]) { best[a] = prev + k; take[i][a] = k; }
            }
    if (best[amount] == none) return Optional.empty();
    int[] out = new int[n];
    for (int i = n - 1, a = amount; i >= 0; i--) { out[i] = take[i][a]; a -= out[i] * notes[i]; }
    return Optional.of(out);
}` },
        { type: "callout", tone: "insight", html: `<p>Backtracking finds <em>a</em> valid mix, largest notes first; dynamic programming finds the mix with the <em>fewest</em> notes. For Indian denominations the two usually agree. If the business wants something else, such as a few smaller notes so customers get change, or spending the fullest cassette first, that choice is a planning <strong>Strategy</strong> behind <code>CashDispenser.plan</code>. Add it only when that requirement exists.</p>` },
        { type: "quiz", q: "Cassettes hold Rs 500 x 4 and Rs 200 x 5, nothing else. A customer asks for Rs 1,100. What should the dispenser do?", options: [
          "Decline: Rs 1,100 is not a multiple of Rs 500",
          "Dispense 500 + 500 and show Rs 100 as owed",
          "Dispense 500 + 200 + 200 + 200",
          "Debit the account first, then search for a mix"
        ], answer: 2, explain: `<p>Greedy takes two 500s and is stuck with Rs 100. The backtracking chain backs off to one 500, and the 200 cassette makes the remaining Rs 600 with three notes. The plan is found before the bank is called, so a decline would never have debited anyone.</p>` }
      ]
    },
    {
      id: "all-or-nothing",
      title: "All-or-nothing withdrawal and rollback",
      kicker: "Failure handling",
      blocks: [
        { type: "text", html: `<p>A withdrawal changes two things that cannot share a database transaction: the bank's ledger and the notes in the machine. So the design orders the steps so that every failure has a cheap, safe fix.</p>` },
        { type: "table", headers: ["Step", "Can fail because", "State if it fails", "Fix"], rows: [
          ["1. Validate amount", "Not a multiple of Rs 100, above the cap", "Nothing changed", "Decline"],
          ["2. Plan notes", "Loaded notes cannot make the amount", "Nothing changed", "Decline, suggest amounts that work"],
          ["3. Debit at the bank", "Insufficient funds, daily limit, timeout", "Not debited, or unknown on a timeout", "Decline; on a timeout retry with the same key, then reverse"],
          ["4. Take notes and dispense", "Jam, sensor fault", "Debited, no cash given", "Reverse the debit, return the card, go OutOfService"],
          ["5. Customer leaves the cash", "Walks away", "Debited, cash presented", "Retract after a timeout and reverse (a common follow-up)"]
        ] },
        { type: "compare", items: [
          { title: "Dispense, then debit", tone: "bad", html: `<p>If the debit is declined or times out after the notes are out, the bank has paid cash it cannot recover. There is no compensating action for handed-out money.</p>` },
          { title: "Debit, then dispense, reverse on fault", tone: "ok", html: `<p>The worst case is a debit that is undone moments later. The bank can always credit an account; the reversal is idempotent by key, so sending it twice is harmless.</p>` },
          { title: "Plan before the debit", tone: "info", html: `<p>Declining before the bank call means a customer is never debited for an amount the machine could not pay, and the common "notes unavailable" case never needs a reversal.</p>` }
        ] },
        { type: "code", lang: "java", title: "Retry with the same key, then reverse", code: `record PendingReversal(String card, String key) {}
private final Queue<PendingReversal> pendingReversals = new ConcurrentLinkedQueue<>();   // drained by a background job

/** Up to three tries with the same key, so the bank applies the debit at most once. */
Optional<DebitResult> debitWithRetry(String card, long amount, String key) {
    for (int attempt = 1; attempt <= 3; attempt++) {
        try {
            return Optional.of(bank.debit(card, amount, key));
        } catch (BankTimeoutException e) {
            // Outcome unknown; the same key makes a retry safe (back off briefly in real code).
        }
    }
    pendingReversals.add(new PendingReversal(card, key));   // retried until the bank confirms
    return Optional.empty();                                 // tell the customer to try later; dispense nothing
}` },
        { type: "callout", tone: "warning", title: "A reversal is a new entry, not an undo", html: `<p>Banks never delete a ledger row. A reversal appends a credit that references the original debit's key, which is why it can be idempotent: the bank checks whether that key was already reversed. If the reversal arrives before a delayed debit, the bank stores a tombstone under the key so the late debit is refused rather than applied.</p>` },
        { type: "keypoints", items: [
          "Notes are removed from the cassette counts before dispensing. After a jam they sit in the reject bin, not the cassette, so the code does not add them back; an engineer counts the bin.",
          "The journal records REVERSED with the transaction id, so reconciliation can match the reject-bin count against reversed transactions and the bank's ledger.",
          "Every step before the debit only reads, and every step after it has a compensating action. That property, not a distributed transaction, is what makes the withdrawal all or nothing."
        ] }
      ]
    },
    {
      id: "concurrency",
      title: "Concurrency at the ATM and at the bank",
      kicker: "Thread safety",
      blocks: [
        { type: "text", html: `<p>There are two separate races with two separate guards. Mixing them up is the most common mistake: an ATM lock cannot stop two ATMs from overdrawing one account.</p>` },
        { type: "table", headers: ["Shared state", "Touched by", "Guard", "Why it is safe"], rows: [
          ["Session state, cassette counts, journal", "The customer's actions, operator refills, timers", "The Atm monitor (synchronized methods)", "Each action is one critical section; a refill can't land between plan and take"],
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
        Account a = account(card);
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
        { type: "text", html: `<p>The idempotency record lives inside the account and is written under the same lock as the balance, so "have I seen this key?", "is there enough money?" and "debit it" form one atomic step. A compare-and-set on an <code>AtomicLong</code> balance could make the debit lock-free, but the daily total and the idempotency record would then be separate updates; changing three things together needs a lock, or one immutable account snapshot swapped through an <code>AtomicReference</code>. With a database, the same step is <code>UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance &gt;= ?</code> plus an insert into a table with a unique key on the idempotency key, in one transaction. In production the idempotency records would also expire after a retention period.</p>` },
        { type: "compare", title: "The bank call and the ATM lock", items: [
          { title: "Hold the ATM lock across the call", tone: "ok", html: `<p>The solution's choice. Simple and correct: a single-customer machine has nobody else to serve, and an operator refill waits at most for the call's timeout. Lock order is always ATM then account, so it cannot deadlock.</p>` },
          { title: "Reserve, unlock, call, relock", tone: "info", html: `<p>Worth it if the call can be slow or status screens must stay live. Dispensing becomes a real, observable state that rejects customer actions while the call is in flight.</p>` }
        ] },
        { type: "steps", title: "Making Dispensing a real state", items: [
          "Under the lock: validate, plan, move the planned notes from available to reserved, and set the state to <code>Dispensing(card, plan, txnId)</code>.",
          "Release the lock and call the bank. Refills and status reads proceed; customer actions reach Dispensing and are rejected.",
          "Re-acquire the lock. On OK, dispense the reserved notes and return to Authenticated. On a decline, return the reserved notes to available. On a jam, reverse the debit and go OutOfService."
        ] }
      ]
    },
    {
      id: "security",
      title: "PIN attempts, card retention and what never gets logged",
      kicker: "Security",
      blocks: [
        { type: "keypoints", items: [
          "<strong>Two attempt counters, two purposes.</strong> The session's count in <code>CardInserted</code> decides when this machine retains the card. The bank's count per card spans every ATM, so a thief can't try two PINs at each of fifty machines. When the bank says BLOCKED, the ATM retains the card even on the first try.",
          "<strong>The PIN never exists in plain text outside the PIN pad.</strong> The pad's secure module encrypts it into a PIN block; the ATM forwards the block and the bank's hardware security module verifies it against a salted slow hash. The <code>String pin</code> in the solution stands in for that block.",
          "<strong>Inactivity ends the session.</strong> No input for a while in CardInserted or Authenticated returns the card; a card left in the slot is retained. A session number stops an old timer from ending a newer customer's session.",
          "<strong>Records are masked by construction.</strong> The journal stores <code>card.masked()</code>, and <code>Card.toString</code> masks too, so a careless log line can't leak a full number."
        ] },
        { type: "code", lang: "java", title: "Redacted PIN block and an inactivity timeout", code: `/** The encrypted PIN block from the PIN pad. The ATM forwards it and never sees the digits. */
record PinBlock(byte[] cipherText) {
    @Override public String toString() { return "PinBlock[redacted]"; }
}

// Inside Atm: an inactivity timer. The session number stops an old timer from ending a newer session.
private long session;                                  // guarded by the monitor; bumped on every insertCard

synchronized void onInactivity(long forSession) {
    if (forSession != session) return;                 // that session already ended
    if (state instanceof CardInserted || state instanceof Authenticated) endSession();
}` },
        { type: "table", title: "What may appear where", headers: ["Data", "Screen and receipt", "Journal", "Application logs"], rows: [
          ["PIN or PIN block", "Never", "Never", "Never"],
          ["Card number", "Masked (XXXX1234)", "Masked", "Masked"],
          ["Balance", "Yes, to the cardholder", "No", "No"],
          ["Transaction id, amount, status", "Yes", "Yes", "Yes"]
        ] },
        { type: "callout", tone: "mistake", html: `<p>Counting wrong PINs only in the ATM's memory. The count resets when the customer takes the card out and walks to the next machine, so the real limit has to live at the bank, keyed by card. The ATM's own count is a usability feature: it decides when to swallow the card.</p>` }
      ]
    }
  ],
  takeaways: [
    "Use the State pattern when states carry data and the list will grow; make states immutable records and swap them under one lock.",
    "A cash chain must plan against real counts: try the most notes first and back off, or use bounded dynamic programming.",
    "Plan before the debit, debit before the dispense, and reverse with the same key if the dispenser faults.",
    "Idempotency keys make retries safe; a tombstone stops a late debit that a reversal overtook.",
    "The ATM lock guards the machine; only the bank, with a per-account lock or conditional update, can guard the balance.",
    "PIN limits live at the bank as well as the ATM, PINs stay encrypted end to end, and logs only ever see masked card numbers."
  ]
};
