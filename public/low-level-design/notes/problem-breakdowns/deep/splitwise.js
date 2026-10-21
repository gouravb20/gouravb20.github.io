// Deep dives: Splitwise (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["splitwise"] = {
  hook: `<p>Once expenses split exactly and balances stay consistent, interviewers add twists to see whether the design bends without breaking. You rarely implement them in full; you show which class changes and why the rest doesn't. Mid-level candidates may get one, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "share-and-item-splits",
      title: "\"Can people split by shares, or item by item?\"",
      kicker: "Follow-up: new split rules",
      blocks: [
        { type: "text", html: `<p>Two common asks: split 2:1:1 because one person brought a partner, and split a restaurant bill by who ate what, with tax and tip on top. Both are new <code>SplitStrategy</code> classes. <code>SplitwiseService</code>, <code>Group</code> and <code>BalanceSheet</code> don't change, because they only ever see a map of shares that adds up.</p>` },
        { type: "code", lang: "java", title: "ShareSplit and ItemSplit", code: `/** 2:1:1 and the like: the same largest-remainder rule as percentages, with any positive weights. */
final class ShareSplit implements SplitStrategy {
    private final Map<String, Long> shares;

    ShareSplit(Map<String, Long> shares) {
        if (shares.isEmpty() || shares.values().stream().anyMatch(s -> s <= 0))
            throw new IllegalArgumentException("every share must be positive");
        this.shares = Map.copyOf(shares);
    }

    public Map<String, Long> shares(long amount) { return Allocation.byWeight(amount, this.shares); }
}

record Item(long price, List<String> sharedBy) {
    Item {
        if (price <= 0 || sharedBy.isEmpty()) throw new IllegalArgumentException("an item needs a price and someone who had it");
        sharedBy = List.copyOf(sharedBy);
    }
}

/** Each item is split equally among the people who had it; whatever the bill adds on top
 *  (tax, tip) is split in proportion to what each person had. */
final class ItemSplit implements SplitStrategy {
    private final List<Item> items;

    ItemSplit(List<Item> items) {
        if (items.isEmpty()) throw new IllegalArgumentException("no items");
        this.items = List.copyOf(items);
    }

    public Map<String, Long> shares(long amount) {
        Map<String, Long> had = new TreeMap<>();
        for (Item item : items) {
            new EqualSplit(item.sharedBy()).shares(item.price()).forEach((u, x) -> had.merge(u, x, Long::sum));
        }
        long subtotal = had.values().stream().mapToLong(Long::longValue).sum();
        if (amount < subtotal) throw new IllegalArgumentException("the bill is less than its items");
        Map<String, Long> out = new TreeMap<>(had);
        Allocation.byWeight(amount - subtotal, had).forEach((u, x) -> out.merge(u, x, Long::sum));
        return out;
    }
}` },
        { type: "keypoints", items: [
          "The <code>Allocation.byWeight</code> helper pays for itself here: shares, percentages, equal splits and the tax-and-tip top-up are all the same rounding rule.",
          "<code>ItemSplit</code> composes <code>EqualSplit</code> per item, so the leftover paisa on a shared starter follows the same rule as everywhere else.",
          "The <code>Expense</code> record still checks that the shares add up, so a bug in a new rule is caught before it reaches a balance."
        ] },
        { type: "quiz", q: "ShareSplit with Asha 2, Bilal 1, Chen 1 on 1001 paise. What are the shares?", options: [
          "500, 250, 251",
          "501, 250, 250",
          "500, 251, 250",
          "500.5, 250.25, 250.25"
        ], answer: 1, explain: `<p>Floors are 2002/4 = 500 (remainder 2), 1001/4 = 250 (remainder 1) and 250 (remainder 1), totalling 1000. The single leftover paisa goes to the largest remainder, Asha's, giving 501, 250, 250.</p>` }
      ]
    },
    {
      id: "edit-and-delete",
      title: "\"Can someone edit or delete an expense?\"",
      kicker: "Follow-up: changing the past",
      blocks: [
        { type: "text", html: `<p>The tempting answer is to find the expense in the list, change it, and recompute. That destroys the audit trail ("who changed the hotel from ₹900 to ₹600?") and, with incremental balances, means undoing the old effect by hand anyway. Instead, never rewrite history: a delete appends a <strong>reversal</strong> that records the same debts the other way, and an edit is a reversal plus a new expense. The change lands in <code>Group</code>, plus one method on the service.</p>` },
        { type: "code", lang: "java", title: "Reversing an expense", code: `// In Group: an expense is never removed from history; a reversal undoes its effect on balances.
private final Set<Long> reversed = new HashSet<>();          // guarded by this

synchronized void reverse(long expenseId) {
    Expense e = history.stream().filter(x -> x.id() == expenseId).findFirst()
        .orElseThrow(() -> new IllegalArgumentException("no expense " + expenseId));
    if (!reversed.add(expenseId)) throw new IllegalStateException("already reversed: " + expenseId);
    e.shares().forEach((user, share) -> sheet.record(e.payerId(), user, share));   // the same debts, the other way
}

// In SplitwiseService: an edit is a reversal plus a new expense, applied as one step.
Expense editExpense(String groupId, long expenseId, String payerId, long amount, SplitStrategy split, String description) {
    Group g = group(groupId);
    Expense replacement = buildExpense(g, payerId, amount, split, description);   // the validation half of addExpense
    synchronized (g) {                       // the same monitor Group's methods use, so nothing slips in between
        g.reverse(expenseId);
        g.apply(replacement);
    }
    return replacement;
}` },
        { type: "keypoints", items: [
          "The replacement is fully validated before the lock is taken; if it is invalid, nothing is reversed.",
          "<code>synchronized</code> is re-entrant, so holding the group's monitor while calling its synchronized methods is safe, and no other expense lands between the reversal and the replacement.",
          "Reversing after people have settled up can flip a debt's direction (the creditor now owes money back). That is correct, and it is why the reversal is recorded rather than the old expense silently disappearing."
        ] },
        { type: "callout", tone: "insight", html: `<p>This is the step towards an append-only ledger: if every expense, reversal and settle-up is an entry, balances become a cache you can rebuild from the log at any time, and a mismatch between the two is a bug you can detect.</p>` }
      ]
    },
    {
      id: "currencies",
      title: "\"What if a trip mixes rupees and dollars?\"",
      kicker: "Follow-up: richer money",
      blocks: [
        { type: "text", html: `<p>A balance of "300" means nothing without a currency, and you can't add paise to cents. Now <code>long</code> is no longer enough: an amount needs its currency. Keep balances <strong>per currency</strong>: <code>Group</code> holds one <code>BalanceSheet</code> per currency, and <code>BalanceSheet</code> itself doesn't change. Converting happens only when users ask to settle everything in one currency, at a rate recorded at that moment.</p>` },
        { type: "code", lang: "java", title: "Balances per currency", code: `record Money(long minor, Currency currency) {                // minor units: paise, cents; yen has none
    Money {
        if (minor <= 0) throw new IllegalArgumentException("amount must be positive");
    }
}

// Expense gains a currency field. In Group, one sheet per currency, created on first use; guarded by the group's lock.
private final Map<Currency, BalanceSheet> sheets = new HashMap<>();

synchronized void apply(Expense e) {
    BalanceSheet sheet = sheets.computeIfAbsent(e.currency(), c -> new BalanceSheet());
    e.shares().forEach((user, share) -> sheet.record(user, e.payerId(), share));
    history.add(e);
}

/** A rate fixed when someone converts a balance, kept with the conversion so it never changes afterwards.
 *  rateMicros is minor units of 'to' per minor unit of 'from', times one million. */
record Conversion(Currency from, Currency to, long rateMicros, Instant at) {
    long convert(long minor) {
        long scaled = Math.multiplyExact(minor, rateMicros);
        long q = scaled / 1_000_000, r = scaled % 1_000_000;
        if (r > 500_000 || (r == 500_000 && q % 2 != 0)) q++;   // half-even, for positive amounts
        return q;
    }
}` },
        { type: "callout", tone: "warning", html: `<p>Never convert at read time with today's rate: balances would change by themselves overnight, and nets in one currency would stop summing to zero. Record the rate and the rounding rule (here half-even) with the conversion, and express the rate in minor units, since a rupee has 100 paise but a yen has no subunit.</p>` }
      ]
    },
    {
      id: "busy-groups",
      title: "\"A huge group gets thousands of expenses a minute. What breaks?\"",
      kicker: "Follow-up: concurrency and scale",
      blocks: [
        { type: "text", html: `<p>Nothing breaks for correctness: the group's lock serialises its expenses, and the splitting work happens before the lock. What suffers is throughput inside that one group, since every expense waits for the one before it. The question is which finer grain is safe.</p>` },
        { type: "compare", items: [
          { title: "One global lock", tone: "bad", html: "<p>Every expense in the app waits for every other. Correct and simple, but a busy group slows down everyone.</p>" },
          { title: "Lock per group (the solution)", tone: "ok", html: "<p>Groups never contend; within a group, expenses apply one at a time. Each holds the lock only for a few map updates, so this goes a long way.</p>" },
          { title: "Lock per pair", tone: "warn", html: "<p>Tempting, but an expense touches many pairs and every participant's net, so it must take several locks in a fixed order to avoid deadlock, and readers can still see half an expense across pairs. Rarely worth it.</p>" },
          { title: "A single writer per group", tone: "info", html: "<p>Callers put expenses on the group's queue and one thread applies them in order; readers get a snapshot published after each batch. No lock contention, at the price of reads lagging slightly behind writes.</p>" }
        ] },
        { type: "text", html: `<p>A related ask: "show my total across all groups". That is a read on the service that visits each group, under each group's own lock.</p>` },
        { type: "code", lang: "java", title: "Totals across groups", code: `// In SplitwiseService. Each group is read under its own lock, so the total is a sum of consistent
// per-group values, not one snapshot across groups (an expense may land in group B while group A is read).
long totalBalance(String userId) {
    return groups.values().stream()
        .filter(g -> g.isMember(userId))
        .mapToLong(g -> g.net(userId))
        .sum();
}` },
        { type: "keypoints", items: [
          "Scanning every group is fine for an interview; at scale, keep an index from user id to the groups they belong to.",
          "Never take two groups' locks at once for a read like this; there is no business need for a cross-group snapshot, and it would create a lock ordering problem.",
          "With several currencies, return one total per currency rather than converting."
        ] }
      ]
    },
    {
      id: "minimum-transfers",
      title: "\"Is your simplified plan really the fewest payments?\"",
      kicker: "Follow-up: optimality",
      blocks: [
        { type: "text", html: `<p>Not always. Greedy guarantees at most n-1 payments, but it can miss a pair that cancels exactly. Take nets of Asha +400, Bilal +300, Chen -300, Dev -200 and Esha -200 (paise). Greedy matches the largest of each side first. These plans come from running both methods on the example:</p>` },
        { type: "table", headers: ["Method", "Payments", "Plan"], rows: [
          ["Greedy (largest with largest)", "4", "Chen pays Asha 300, Dev pays Bilal 200, Esha pays Asha 100, Esha pays Bilal 100"],
          ["Optimal", "3", "Chen pays Bilal 300, Dev pays Asha 200, Esha pays Asha 200"]
        ] },
        { type: "text", html: `<p>The minimum number of payments is n minus the largest number of disjoint groups of people whose nets sum to zero, since each such group of k people settles in k-1 payments. Finding that partition is NP-hard in general (it contains subset sum), so the exact answer needs dynamic programming over all 2<sup>n</sup> subsets of people: fine for a dinner of 10, hopeless for a group of 60.</p>` },
        { type: "keypoints", items: [
          "A cheap improvement keeps greedy's speed: before matching largest with largest, settle any debtor and creditor whose amounts are exactly equal. That fixes this example.",
          "Only <code>BalanceSheet.simplify()</code> changes; it can choose exact search below some group size and greedy above it.",
          "Fewest payments isn't the only goal: people may prefer paying someone they already owe. Say which objective you are optimising."
        ] }
      ]
    }
  ],
  takeaways: [
    "New split rules are new SplitStrategy classes; a shared largest-remainder helper keeps every rule's rounding the same.",
    "Edits and deletes are reversing entries appended to history, never rewrites; the replacement is validated before the lock is taken.",
    "Several currencies mean one BalanceSheet per currency and conversions at a rate recorded with them, never today's rate at read time.",
    "A lock per group is the right grain; finer locks risk deadlock and half-visible expenses, and a single writer per group is the next step for very busy groups.",
    "Greedy simplify gives at most n-1 payments but not always the minimum, which is NP-hard; settle exact matches first as a cheap improvement."
  ]
};
