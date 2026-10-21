// LLD problem breakdown: Splitwise. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `splitwise`, part: 2, number: 6, difficulty: `medium`,
    title: `Splitwise: splitting expenses and keeping balances`,
    references: [{ title: `awesome-low-level-design: Splitwise`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/splitwise.md` }],
    overview: `Users add expenses paid by one person and split equally, by exact amounts or by percentages; the app shows who owes whom. Two things are tested: <strong>money handling</strong> (store the smallest unit as <code>long</code>, distribute rounding remainders deliberately) and <strong>balance bookkeeping</strong> (net each pair so only one direction is stored). Splitting rules sit behind a <strong>Strategy</strong> interface.`,
    problem: [
      { id: `requirements`, title: `What we are building`, kicker: `Requirements`, blocks: [
        { type: `list`, title: `Requirements`, items: [
          `Add an expense paid by one user and split it equally, by exact amounts, or by percentages.`,
          `Show who owes whom.`,
          `Store money in the smallest unit (<code>long</code> cents or paise), never <code>double</code>.`
        ] },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] },
      { id: `clarifying`, title: `Questions worth asking`, kicker: `Clarifying`, blocks: [
        { type: `table`, headers: [`Ask`, `Assume`, `Decides`], rows: [
          [`One currency?`, `Yes to start`, `Plain long amounts`],
          [`Where does a rounding remainder go?`, `Spread one unit at a time from the first user`, `Split code`],
          [`Groups?`, `Not to start; one global ledger`, `Data structure scope`],
          [`Simplify debts?`, `A follow-up`, `Pairwise netting only`]
        ] }
      ] }
    ],
    solution: [
      { id: `design`, title: `Design`, kicker: `Entities and API`, blocks: [
        { type: `keypoints`, items: [
          `<code>SplitStrategy</code> computes each user's share (Strategy): <code>EqualSplit</code>, <code>ExactSplit</code>, <code>PercentSplit</code>.`,
          `<code>ExpenseService</code> keeps <code>owes[debtor][creditor]</code> and nets each pair so only one direction is stored.`,
          `Every split must add up exactly to the amount; rounding remainders are assigned explicitly.`
        ] },
        { type: `code`, lang: `java`, title: `Public API`, code: `void addExpense(String payer, long amount, SplitStrategy strategy, List<String> users, List<Long> values);
List<String> balances(String user);` }
      ] },
      { id: `code`, title: `Working code`, kicker: `Implementation`, blocks: [
        { type: `code`, lang: `java`, title: `Split strategies`, code: `interface SplitStrategy {
    Map<String, Long> split(long amount, List<String> users, List<Long> values);
}

class EqualSplit implements SplitStrategy {
    public Map<String, Long> split(long amount, List<String> users, List<Long> values) {
        if (users.isEmpty()) throw new IllegalArgumentException("No users to split between");
        Map<String, Long> out = new LinkedHashMap<>();
        long share = amount / users.size();
        long remainder = amount % users.size();
        for (int i = 0; i < users.size(); i++) {
            out.put(users.get(i), share + (i < remainder ? 1 : 0));   // spread leftover units
        }
        return out;
    }
}

class ExactSplit implements SplitStrategy {
    public Map<String, Long> split(long amount, List<String> users, List<Long> values) {
        if (values.size() != users.size()) throw new IllegalArgumentException("One amount per user");
        long sum = values.stream().mapToLong(Long::longValue).sum();
        if (sum != amount) throw new IllegalArgumentException("Amounts must add up to the total");
        Map<String, Long> out = new LinkedHashMap<>();
        for (int i = 0; i < users.size(); i++) out.put(users.get(i), values.get(i));
        return out;
    }
}

class PercentSplit implements SplitStrategy {
    public Map<String, Long> split(long amount, List<String> users, List<Long> values) {
        if (values.size() != users.size()) throw new IllegalArgumentException("One percentage per user");
        long total = values.stream().mapToLong(Long::longValue).sum();
        if (total != 100) throw new IllegalArgumentException("Percentages must add up to 100");
        Map<String, Long> out = new LinkedHashMap<>();
        long assigned = 0;
        for (int i = 0; i < users.size(); i++) {
            long share = amount * values.get(i) / 100;
            out.put(users.get(i), share);
            assigned += share;
        }
        out.merge(users.get(0), amount - assigned, Long::sum);   // rounding remainder
        return out;
    }
}` },
        { type: `code`, lang: `java`, title: `ExpenseService`, code: `class ExpenseService {
    // owes.get(a).get(b) = amount a owes b (always positive)
    private final Map<String, Map<String, Long>> owes = new HashMap<>();

    synchronized void addExpense(String payer, long amount, SplitStrategy strategy,
                                 List<String> users, List<Long> values) {
        for (Map.Entry<String, Long> e : strategy.split(amount, users, values).entrySet()) {
            if (e.getKey().equals(payer) || e.getValue() == 0) continue;
            adjust(e.getKey(), payer, e.getValue());
        }
    }

    private void adjust(String debtor, String creditor, long amt) {
        long reverse = get(creditor, debtor);              // does the creditor already owe the debtor?
        if (reverse >= amt) {
            set(creditor, debtor, reverse - amt);
        } else {
            set(creditor, debtor, 0);
            set(debtor, creditor, get(debtor, creditor) + amt - reverse);
        }
    }

    private long get(String a, String b) {
        return owes.getOrDefault(a, Map.of()).getOrDefault(b, 0L);
    }

    private void set(String a, String b, long v) {
        if (v == 0) {
            Map<String, Long> m = owes.get(a);
            if (m != null) m.remove(b);
        } else {
            owes.computeIfAbsent(a, k -> new HashMap<>()).put(b, v);
        }
    }

    synchronized List<String> balances(String user) {
        List<String> out = new ArrayList<>();
        owes.getOrDefault(user, Map.of()).forEach((c, v) -> out.add(user + " owes " + c + ": " + v));
        owes.forEach((d, m) -> {
            Long v = m.get(user);
            if (v != null) out.add(d + " owes " + user + ": " + v);
        });
        return out;
    }
}` }
      ] },
      { id: `walkthrough`, title: `Walking through it`, kicker: `Check it works`, blocks: [
        { type: `steps`, items: [
          `A pays 1000 for A, B, C split equally: shares 334, 333, 333. B owes A 333 and C owes A 333.`,
          `B pays 600 for A and B equally: A's share is 300. A owes B 300, but B already owes A 333, so netting leaves B owes A 33 and nothing in the other direction.`,
          `<code>balances("A")</code> lists B owes A: 33 and C owes A: 333.`,
          `A percent split of 30/30/40 on 1001: shares 300, 300, 400 = 1000, so the remaining 1 goes to the first user.`
        ] }
      ] }
    ],
    levels: levels(
      [`Split strategies that add up exactly and a pairwise owes structure.`, `Money as long in the smallest unit.`],
      [`Explicit remainder handling, validation, and pair netting.`, `Debt simplification with the greedy two-heap approach and its limits.`],
      [`Groups and per-group locking, multiple currencies with conversion at a recorded rate, an append-only expense ledger as the source of truth.`]
    ),
    concepts: [
      { term: `Money as long minor units`, def: `Store amounts as cents or paise in a <code>long</code>.`, why: `Exact arithmetic; <code>double</code> accumulates rounding errors.` },
      { term: `Remainder distribution`, def: `When a split doesn't divide evenly, assign the leftover units explicitly (one each from the first user, or all to one user).`, why: `Shares must always add up to the expense.` },
      { term: `Split strategy`, def: `One interface, one class per split rule: equal, exact, percent.`, why: `New rules (shares, by item) are new classes.` },
      { term: `Pair netting`, def: `Store only one direction per pair; a new debt first cancels any reverse debt.`, why: `Balances stay minimal and easy to read.` },
      { term: `Net balance`, def: `For each user, total owed to them minus total they owe.`, why: `The input to debt simplification.` },
      { term: `Greedy debt simplification`, def: `Match the largest debtor with the largest creditor repeatedly using two heaps; at most n-1 transfers.`, why: `The exact minimum is NP-hard, so greedy is the standard answer.` }
    ],
    interview: [
      { q: `Why not store money as double?`, a: `Binary floating point can't represent most decimal fractions exactly, so sums drift (0.1 + 0.2 is not 0.3) and splits stop adding up. Storing the smallest unit as a long makes all arithmetic exact, and rounding becomes an explicit decision about where leftover units go.`, diff: `easy` },
      { q: `How do you split 100 between three people?`, a: `33 each leaves a remainder of 1. Give the leftover units one at a time to the first users in the list: 34, 33, 33. Whatever the rule, the shares must add up to exactly 100, and it should be deterministic so tests and users see the same result.`, diff: `easy` },
      { q: `How does the netting in adjust() work?`, a: `When B owes A an amount, first check whether A already owes B. If that reverse debt covers it, reduce the reverse debt. Otherwise clear the reverse debt and record the remainder as B owing A. So each pair only ever has one non-zero direction.`, diff: `medium` },
      { q: `How would you minimise the number of transfers?`, a: `Compute every user's net balance. Put creditors in a max-heap and debtors in a max-heap by amount. Repeatedly pop the largest of each, transfer the smaller of the two amounts, and push back whoever has a remainder. This needs at most n-1 transfers. Finding the true minimum is NP-hard, so the greedy approach is the accepted answer.`, diff: `hard` },
      { q: `How would you add groups?`, a: `Give each group its own ExpenseService (its own ledger and lock), keyed by group id in a map. Locking per group lets different groups update concurrently. A user's overall balance is the sum across their groups.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Split rules`, type: `table`, headers: [`Strategy`, `Input`, `Validation`, `Remainder`], rows: [
        [`EqualSplit`, `users`, `At least one user`, `One unit each from the first user`],
        [`ExactSplit`, `amount per user`, `Sum equals total; one value per user`, `None (exact)`],
        [`PercentSplit`, `percent per user`, `Sum is 100; one value per user`, `All to the first user`]
      ] },
      { title: `Debt simplification sketch`, type: `code`, lang: `java`, body: `// net.get(u) > 0: u is owed money; < 0: u owes money
PriorityQueue<Map.Entry<String, Long>> creditors = new PriorityQueue<>((a, b) -> Long.compare(b.getValue(), a.getValue()));
PriorityQueue<Map.Entry<String, Long>> debtors   = new PriorityQueue<>((a, b) -> Long.compare(b.getValue(), a.getValue()));
// fill: creditors with (u, net), debtors with (u, -net)
while (!creditors.isEmpty() && !debtors.isEmpty()) {
    var c = creditors.poll(); var d = debtors.poll();
    long x = Math.min(c.getValue(), d.getValue());
    transfers.add(d.getKey() + " pays " + c.getKey() + " " + x);
    if (c.getValue() > x) creditors.add(Map.entry(c.getKey(), c.getValue() - x));
    if (d.getValue() > x) debtors.add(Map.entry(d.getKey(), d.getValue() - x));
}` }
    ],
    labs: []
  });
})();
