// Deep dives: Splitwise (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["splitwise"] = {
  hook: `<p>The core service splits expenses exactly and nets each pair. Follow-ups ask for fewer transfers, groups, currencies, more split types and an audit trail, and each tests whether the money model and the bookkeeping were sound.</p>`,
  sections: [
    {
      id: "simplify-debts",
      title: "Simplifying debts",
      kicker: "Follow-up: fewer transfers",
      blocks: [
        { type: "problem", html: `<p>A owes B 10, B owes C 10. Pairwise netting keeps two debts, but one transfer (A pays C 10) settles everything. With many users, pairwise balances can need far more transfers than necessary.</p>` },
        { type: "steps", items: [
          "Compute each user's <strong>net balance</strong>: total owed to them minus total they owe.",
          "Put creditors (net &gt; 0) and debtors (net &lt; 0) in two max-heaps by amount.",
          "Repeatedly match the largest debtor with the largest creditor; transfer the smaller amount; push back whoever has a remainder.",
          "Each step settles at least one person, so there are at most n-1 transfers."
        ] },
        { type: "code", lang: "java", title: "Greedy settlement", code: `List<String> settle(Map<String, Long> net) {
    Comparator<Map.Entry<String, Long>> byAmount = (a, b) -> Long.compare(b.getValue(), a.getValue());
    PriorityQueue<Map.Entry<String, Long>> creditors = new PriorityQueue<>(byAmount);
    PriorityQueue<Map.Entry<String, Long>> debtors = new PriorityQueue<>(byAmount);
    net.forEach((u, v) -> {
        if (v > 0) creditors.add(Map.entry(u, v));
        else if (v < 0) debtors.add(Map.entry(u, -v));
    });
    List<String> transfers = new ArrayList<>();
    while (!creditors.isEmpty() && !debtors.isEmpty()) {
        var c = creditors.poll();
        var d = debtors.poll();
        long x = Math.min(c.getValue(), d.getValue());
        transfers.add(d.getKey() + " pays " + c.getKey() + " " + x);
        if (c.getValue() > x) creditors.add(Map.entry(c.getKey(), c.getValue() - x));
        if (d.getValue() > x) debtors.add(Map.entry(d.getKey(), d.getValue() - x));
    }
    return transfers;
}` },
        { type: "callout", tone: "insight", html: `<p>The true minimum number of transfers is NP-hard (it involves finding subsets of users whose balances sum to zero), so the greedy two-heap answer is the standard one. Say so; it shows you know why you stopped there.</p>` }
      ]
    },
    {
      id: "groups-and-locking",
      title: "Groups and locking per group",
      kicker: "Follow-up: structure",
      blocks: [
        { type: "code", lang: "java", title: "One ledger per group", code: `class GroupLedgers {
    private final ConcurrentHashMap<String, ExpenseService> groups = new ConcurrentHashMap<>();

    ExpenseService group(String groupId) {
        return groups.computeIfAbsent(groupId, id -> new ExpenseService());
    }
}
// Each ExpenseService synchronizes on itself, so expenses in different groups never contend.` },
        { type: "text", html: `<p>One global lock serialises every expense in the app. Balances only interact within a group, so the lock (and the data) can be per group. A user's overall position is the sum of their balances across groups.</p>` }
      ]
    },
    {
      id: "currencies-and-splits",
      title: "Currencies, item splits and shares",
      kicker: "Follow-up: richer money",
      blocks: [
        { type: "table", headers: ["Requirement", "Design change"], rows: [
          ["Multiple currencies", "Amounts carry a currency (a <code>Money(long minor, Currency c)</code> record); balances are kept per currency, or converted at a rate recorded with the expense"],
          ["Split by items", "A new <code>ItemSplit</code> strategy: each item has a price and the users who shared it; tax and tip spread proportionally"],
          ["Split by shares (2:1:1)", "A <code>ShareSplit</code> strategy, same remainder handling as percentages"],
          ["Settle up", "Record a payment as an expense from debtor to creditor with an exact split"]
        ] },
        { type: "callout", tone: "warning", html: `<p>Never convert currencies at read time with today's rate: balances would change by themselves. Record the rate used when the expense was added.</p>` }
      ]
    },
    {
      id: "ledger",
      title: "History and audit: an append-only ledger",
      kicker: "Follow-up: correctness over time",
      blocks: [
        { type: "text", html: `<p>The <code>owes</code> map is derived state. Make expenses the source of truth: store each expense (who paid, amount, split result, timestamp) in an append-only list, and rebuild or update balances from it. Editing or deleting an expense becomes a reversing entry, so history and audit stay intact.</p>` },
        { type: "code", lang: "java", title: "Expenses as records", code: `record Expense(String id, String payer, long amount, Map<String, Long> shares, Instant at) {
    Expense {
        long sum = shares.values().stream().mapToLong(Long::longValue).sum();
        if (sum != amount) throw new IllegalArgumentException("shares must add up to the amount");
        shares = Map.copyOf(shares);
    }
}` },
        { type: "quiz", q: "Split 1000 equally between 3 users with the EqualSplit code. What are the shares?", options: ["333, 333, 333", "334, 333, 333", "333.33 each", "334, 334, 332"], answer: 1, explain: `<p>1000 / 3 = 333 remainder 1. The first <code>remainder</code> users get one extra unit, so the shares are 334, 333, 333, which add up to exactly 1000.</p>` }
      ]
    }
  ],
  takeaways: [
    "Simplify debts from net balances with two max-heaps: at most n-1 transfers; the exact minimum is NP-hard.",
    "Lock and store per group; one global lock serialises the whole app.",
    "Carry currency with amounts and record the conversion rate at expense time.",
    "New split types are new strategies with explicit remainder handling.",
    "Keep an append-only expense ledger as the source of truth; balances are derived."
  ]
};
