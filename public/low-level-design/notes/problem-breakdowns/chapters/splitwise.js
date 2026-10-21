// LLD problem breakdown: Splitwise. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `splitwise`, part: 2, number: 6, difficulty: `medium`,
    title: `Splitwise: splitting expenses and keeping balances`,
    references: [{ title: `awesome-low-level-design: Splitwise`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/splitwise.md` }],
    overview: `Friends in a group add expenses: one person pays, and the cost is split equally, by exact amounts or by percentages. The app shows each person's balance, who owes whom, lets people settle up, and can simplify the debts into fewer payments. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement splitting and bookkeeping (comparing a weak, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The key ideas: money is a <code>long</code> count of paise, never a <code>double</code>; every split adds up to the amount exactly because leftover paise go to the <strong>largest remainders</strong>; split rules are a <strong>Strategy</strong> built with their own inputs; each group keeps a <strong>net balance per user plus one signed entry per pair</strong>, both updated under the group's lock; and simplifying debts is a greedy match of the biggest debtor with the biggest creditor.`,
    problem: [
      { id: `understanding`, title: `What Splitwise does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Four friends go on a trip. Asha pays for the hotel, Bilal buys snacks, Chen pays for a taxi. Each bill is shared differently: some equally, some by exact amounts, some by percentage. At the end, everyone wants to know one number (am I up or down?) and one list (whom do I pay, and how much?), ideally with as few payments as possible.</p>` },
        { type: `text`, html: `<p>The prompt is usually one line: <em>"Design an expense-sharing app like Splitwise: users add expenses, split them in different ways, and see who owes whom."</em> It sounds like bookkeeping, and it is, but two things trip candidates up: money arithmetic that silently loses a paisa, and balances that drift when two expenses land at once. The first few minutes go into pinning those down.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the system must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; each answer removes something you would otherwise have to design.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Do expenses belong to a group, or can any two users share one?`, `Every expense belongs to a group of registered users`, `Group is an entity, and balances are kept per group`],
          [`One currency? Down to the paisa?`, `Rupees only, exact to the paisa`, `Amounts are <code>long</code> paise; no Money class yet`],
          [`Which ways of splitting?`, `Equally, by exact amounts, by percentages`, `Three split rules behind one interface`],
          [`When a split doesn't divide evenly, who pays the extra paisa?`, `Shares must add up exactly; be fair and deterministic`, `An explicit remainder rule inside the split code`],
          [`What if exact amounts don't add up, or percentages aren't 100?`, `Reject the expense; nothing changes`, `Validate fully before touching any balance`],
          [`What does "show balances" mean?`, `Each person's net position in the group, plus who owes whom`, `Store a net per user and a debt per pair`],
          [`Can people settle up, and can the app suggest fewer payments?`, `Yes to both; a payment can't exceed what is owed`, `<code>settleUp</code> checks the pair's debt; a simplify operation`],
          [`Editing expenses, several currencies, adding members later?`, `Out of scope; maybe as follow-ups`, `Expenses are immutable records; members fixed at creation`]
        ] },
        { type: `callout`, tone: `insight`, title: `Where does the extra paisa go?`, html: `<p>₹10.00 split three ways is 333.33 paise each, which cannot be paid. Asking this question out loud forces two decisions that shape the whole design: money is stored as a whole number of paise (a <code>double</code> would hide the problem rather than solve it), and every split must hand out the leftover paise by an explicit, deterministic rule so the shares add up to exactly the amount paid. Candidates who skip it usually write <code>amount / n</code>, and their balances are off by a paisa from the first expense.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. Users are registered with an id and a name.
  2. A group has two or more registered users; every expense belongs
     to exactly one group.
  3. An expense has one payer, an amount in paise, and a split among
     group members: equal, exact amounts, or percentages.
  4. Shares always add up to the amount exactly. Leftover paise from
     rounding go one each to the largest fractional remainders
     (ties go to the user id that sorts first).
  5. Invalid expenses are rejected and change nothing: amount not
     positive, payer or participant outside the group, exact amounts
     that don't add up, percentages that don't total 100.
  6. Show each user's net balance in a group, and who owes whom.
  7. Settle up: record a payment from a debtor to a creditor, up to
     what the debtor owes.
  8. Simplify debts: replace who-owes-whom with at most n-1 payments
     that leave every net balance unchanged.
  9. Many people may add expenses to the same group at once; no
     update may be lost.

Out of scope
  - Multiple currencies
  - Editing or deleting an expense
  - Adding or removing group members after creation
  - Notifications, persistence, login and UI` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce a rule. There are many here, and several of them are better as plain values than as classes. Test each one.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`User`, `A record`, `An id and a name. It holds no balance: a balance only means something inside a group`],
          [`Group`, `A class`, `Owns its members, its expense history and its balances, and is the unit of locking`],
          [`Expense`, `A record`, `Immutable facts: payer, amount, each person's share. Checks that the shares add up`],
          [`Split (one person's share)`, `A map entry, not a class`, `User to paise. A <code>Map&lt;String, Long&gt;</code> says the same thing and guarantees one share per person`],
          [`Split type (equal, exact, percent)`, `An interface and three classes`, `Each rule validates and rounds differently; new rules should not edit old ones`],
          [`Balance`, `A number, not a class`, `Derived from expenses; a <code>long</code> per user`],
          [`BalanceSheet`, `A class`, `Who owes whom and each user's net, with the rule that a debt one way cancels a debt the other way`],
          [`Money / Amount`, `A <code>long</code>, not a class (yet)`, `One currency, so a count of paise is enough; a Money record arrives with currencies`],
          [`Payment, Settlement, Transaction`, `One record: Transfer`, `"From, to, amount" is both a settle-up and one step of a simplified plan`],
          [`SplitwiseService`, `A class`, `The entry point: registers users and groups, validates input, routes to the right group`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`SplitwiseService`, `The entry point. Knows users and groups by id, validates every request, builds expenses and hands them to the group. Holds no balances itself.`],
          [`Group`, `One group's members, append-only expense history and balance sheet. Every change happens under the group's lock.`],
          [`BalanceSheet`, `Net balance per user and one signed debt per pair. Records debts, answers "how much does A owe B?", simplifies.`],
          [`SplitStrategy`, `Turns an amount into shares that add up exactly: <code>EqualSplit</code>, <code>ExactSplit</code>, <code>PercentSplit</code>.`],
          [`Expense, User, Transfer`, `Immutable records passed between the classes above.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>A common first sketch puts a balance sheet on each <code>User</code>. Push back on it out loud: an expense then has to update two users' sheets as two separate writes, and "Bilal's balance" mixes the trip with the flat. Keeping balances on the group makes one expense one update to one object.</p>` }
      ] },
      { id: `service-design`, title: `Class design: SplitwiseService`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code calls, and derive its state and methods from the requirements. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What the service remembers`], rows: [
          [`"Users are registered with an id and a name"`, `Users by id`],
          [`"Every expense belongs to exactly one group"`, `Groups by id`],
          [`"An expense has ..."`, `A counter for expense ids; nothing else per expense (the group keeps it)`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Register a user`, `<code>User addUser(String id, String name)</code>`],
          [`Create a group`, `<code>Group createGroup(String id, Set&lt;String&gt; memberIds)</code>`],
          [`Add an expense`, `<code>Expense addExpense(String groupId, String payerId, long amount, SplitStrategy split, String description)</code>`],
          [`Settle up`, `<code>void settleUp(String groupId, String fromId, String toId, long amount)</code>`],
          [`A user's net balance`, `<code>long balance(String groupId, String userId)</code>`],
          [`Who owes whom`, `<code>List&lt;Transfer&gt; whoOwesWhom(String groupId)</code>`],
          [`Fewer payments`, `<code>List&lt;Transfer&gt; simplifyDebts(String groupId)</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Ids in, not objects.</strong> Callers pass user and group ids, so they can't hand in a <code>User</code> the service has never seen. The service looks everything up and rejects unknown ids.`,
          `<strong>The split arrives as an object.</strong> <code>addExpense</code> takes a <code>SplitStrategy</code> already holding its inputs, rather than a split type plus a list of numbers whose meaning depends on the type.`,
          `<strong>No balances here.</strong> The service validates and routes; the group owns balances and the lock. That keeps the service free of locks, so expenses in different groups never wait for each other.`,
          `<strong>One instance, passed in.</strong> Create the service once at startup and inject it. A Singleton adds global state and makes tests share balances, and nothing in the requirements needs it.`
        ] }
      ] },
      { id: `split-design`, title: `Class design: SplitStrategy and Expense`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a split rule remembers`], rows: [
          [`"Split equally"`, `The participants`],
          [`"Split by exact amounts"`, `Paise per participant`],
          [`"Split by percentages"`, `Percentage per participant, in basis points (33.33% is 3333) so it stays a whole number`]
        ] },
        { type: `text`, html: `<p>Every rule needs different inputs. The question is <strong>how a rule gets them</strong>, because that decides whether inputs can be mismatched and whether adding a rule touches existing code.</p>` },
        { type: `compare`, items: [
          { title: `Good: a split type and a list of values`, tone: `warn`, html: `<p><code>addExpense(..., SplitType type, List&lt;Long&gt; values)</code> and a <code>switch</code> inside. Quick to write. But <code>values</code> means amounts for one type, percentages for another and nothing for the third, and every new rule edits the switch.</p>` },
          { title: `Better: a strategy with a shared signature`, tone: `info`, html: `<p><code>calculateSplits(amount, payer, users, values)</code> on each strategy. New rules are new classes. But equal split ignores <code>values</code>, and <code>users</code> and <code>values</code> are parallel lists that can be misaligned or of different lengths.</p>` },
          { title: `Great: each strategy built with its own inputs`, tone: `ok`, html: `<p><code>new PercentSplit(Map.of("asha", 1000L, ...))</code>; the interface is just <code>shares(long amount)</code>. Users and values are paired in one map, so they can't drift apart; validation that doesn't need the amount happens in the constructor; strategies are immutable, so threads can share them.</p>` }
        ] },
        { type: `text`, html: `<p>We take the third. The <code>Expense</code> record checks the one invariant every rule must keep, that the shares add up to the amount, so a buggy future rule can't corrupt balances. A settle-up and a step of a simplified plan are both "from, to, amount", so one <code>Transfer</code> record serves both.</p>` },
        { type: `table`, headers: [`Need`, `Method or type`], rows: [
          [`Turn an amount into shares`, `<code>Map&lt;String, Long&gt; shares(long amount)</code> on <code>SplitStrategy</code>`],
          [`Freeze an expense and check its shares`, `<code>record Expense(...)</code> with a compact constructor`],
          [`A payment between two users`, `<code>record Transfer(String from, String to, long amount)</code>`]
        ] },
        { type: `code`, lang: `java`, title: `Records: User, Expense, Transfer`, code: `record User(String id, String name) {}

/** One expense, frozen once recorded. shares maps every participant (payer included, if they took part) to paise. */
record Expense(long id, String groupId, String payerId, long amount, Map<String, Long> shares, String description) {
    Expense {
        if (amount <= 0) throw new IllegalArgumentException("amount must be positive");
        long sum = shares.values().stream().mapToLong(Long::longValue).sum();
        if (sum != amount) throw new IllegalArgumentException("shares add up to " + sum + ", not " + amount);
        shares = Map.copyOf(shares);                         // nobody can change it after the check
    }
}

/** A payment from one user to another: a settle-up, or one step of a simplified plan. */
record Transfer(String from, String to, long amount) {}` }
      ] },
      { id: `balance-design`, title: `Class design: Group and BalanceSheet`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a group remembers`], rows: [
          [`"Every expense belongs to one group"`, `Its members, fixed at creation`],
          [`"Show each user's net balance"`, `A net amount per user`],
          [`"Show who owes whom"`, `A debt per pair of users`],
          [`"No update may be lost"`, `One lock that covers all of the above`],
          [`Audit and later follow-ups (edit, delete)`, `The expenses themselves, in an append-only list`]
        ] },
        { type: `text`, html: `<p>The central decision is <strong>how balances are stored</strong>. It decides how fast the two read questions are answered and how much can go wrong on a write.</p>` },
        { type: `compare`, items: [
          { title: `Good: keep only the expenses, recompute on read`, tone: `warn`, html: `<p>Store the list; to show balances, replay every expense. One source of truth, nothing to keep in sync, and edits are trivial. But every read is O(number of expenses), settle-ups must be stored as expenses too, and "who owes whom" is rebuilt from scratch each time someone opens the app.</p>` },
          { title: `Better: a pairwise matrix, netted on write`, tone: `info`, html: `<p><code>owes[a][b]</code>, and a new debt first cancels any debt the other way. "Does Bilal owe Asha?" is O(1). But a user's net balance means summing a row and a column, simplify needs those nets for everyone, and the netting code has a branch for each direction that is easy to get wrong.</p>` },
          { title: `Great: net per user plus one signed entry per pair`, tone: `ok`, html: `<p>A map of nets, and a map keyed by the pair in sorted order (<code>("asha", "bilal")</code>) whose value is positive when the first owes the second and negative the other way. Both reads are O(1), netting is a single addition with no branch, and the nets feed simplify directly. Both maps change together under the group's lock. Keep the expense list too, as history.</p>` }
        ] },
        { type: `text`, html: `<p>We take the third. The sorted pair key means a pair has exactly one entry, so "Asha owes Bilal 5" and "Bilal owes Asha 3" can never both be stored; they are one entry of +2. Nets always sum to zero across the group, which is a cheap invariant to assert in tests.</p>` },
        { type: `table`, headers: [`Need`, `Method on Group (locks) and BalanceSheet (doesn't)`], rows: [
          [`Apply an expense`, `<code>Group.apply(Expense)</code> calls <code>BalanceSheet.record(debtor, creditor, paise)</code> per share`],
          [`Settle up`, `<code>Group.settle(Transfer)</code>: check <code>owes(from, to)</code>, then record the reverse debt`],
          [`Read balances`, `<code>net(user)</code>, <code>debts()</code>`],
          [`Fewer payments`, `<code>Group.simplifyDebts()</code> calls <code>BalanceSheet.simplify()</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>BalanceSheet has no lock of its own.</strong> It is only ever touched by its group, under the group's lock. Two locks for one group's state would invite an expense that updates the nets but not the pairs.`,
          `<strong>Paying a debt is a debt the other way.</strong> If Bilal pays Asha 100, record "Asha owes Bilal 100"; the signed pair entry and both nets come out right with no special code.`,
          `<strong>Simplify rewrites the pairs, never the nets.</strong> It changes who pays whom, not how much anyone is up or down, so settle-ups afterwards check against the new plan.`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `record User(String id, String name) {}
record Expense(long id, String groupId, String payerId, long amount, Map<String, Long> shares, String description) {}
record Transfer(String from, String to, long amount) {}

final class SplitwiseService {
    private final Map<String, User> users;                   // ConcurrentHashMap
    private final Map<String, Group> groups;                 // ConcurrentHashMap

    User addUser(String id, String name);
    Group createGroup(String id, Set<String> memberIds);
    Expense addExpense(String groupId, String payerId, long amount, SplitStrategy split, String description);
    void settleUp(String groupId, String fromId, String toId, long amount);
    long balance(String groupId, String userId);             // > 0: is owed money; < 0: owes money
    List<Transfer> whoOwesWhom(String groupId);
    List<Transfer> simplifyDebts(String groupId);
}

final class Group {                                          // every mutating or reading method holds the group's lock
    final Set<String> members;                               // immutable
    private final BalanceSheet sheet;
    private final List<Expense> history;                     // append-only

    synchronized void apply(Expense e);
    synchronized void settle(Transfer t);
    synchronized long net(String userId);
    synchronized List<Transfer> debts();
    synchronized List<Transfer> simplifyDebts();
}

final class BalanceSheet {                                   // not thread-safe; used only by its Group
    private final Map<Pair, Long> pairs;                     // sorted pair; > 0: first owes second
    private final Map<String, Long> net;

    void record(String debtor, String creditor, long amount);
    long owes(String debtor, String creditor);
    long net(String user);
    List<Transfer> debts();
    List<Transfer> simplify();
}

interface SplitStrategy { Map<String, Long> shares(long amount); }
final class EqualSplit implements SplitStrategy   { EqualSplit(List<String> users); }
final class ExactSplit implements SplitStrategy   { ExactSplit(Map<String, Long> paise); }
final class PercentSplit implements SplitStrategy { PercentSplit(Map<String, Long> basisPoints); }` },
        { type: `text`, html: `<p>The service validates and routes; the group owns state and the lock; the balance sheet owns the arithmetic; strategies own the rounding. Splitting rules are a <strong>Strategy</strong> because "a new way to split" is the most likely change. There is no Builder for <code>Expense</code>: the service constructs it in one place, and a record's constructor already validates it.</p>` }
      ] },
      { id: `split-impl`, title: `Implementation: splitting an amount`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method, write the normal path first, then the edge cases. The normal path is short: equal split gives everyone <code>amount / n</code>; exact split returns the amounts it was given; percent split gives each person <code>amount * basisPoints / 10000</code>. All three break the moment the division isn't exact.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `Equal split that doesn't divide: ₹10.00 among three is 333 each with 1 paisa left over.`,
          `Percentages that each produce a fraction of a paisa, whose leftovers add up to one or more whole paise.`,
          `Percentages that don't total 100%, or a zero or negative percentage: reject when the strategy is built.`,
          `Exact amounts that don't add up to the expense: reject when the amount is known.`,
          `The same person listed twice, or nobody at all: reject.`,
          `Large amounts: <code>amount * basisPoints</code> must not overflow silently; use <code>Math.multiplyExact</code>.`
        ] },
        { type: `text`, html: `<p>The rounding rule is the interesting part. Compare options on one example: <strong>₹9.99 (999 paise) split 10% / 45% / 45%</strong> between Asha, Bilal and Chen. The exact shares are 99.9, 449.55 and 449.55 paise.</p>` },
        { type: `table`, headers: [`Rule`, `Asha`, `Bilal`, `Chen`, `Total`, `What goes wrong`], rows: [
          [`Round each share to the nearest paisa`, `100`, `450`, `450`, `1000`, `Charges a paisa that was never spent`],
          [`Floor each, leftover to the first person`, `101`, `449`, `449`, `999`, `Asha, at 10%, absorbs both leftover paise`],
          [`Floor each, leftover to the largest remainders`, `100`, `450`, `449`, `999`, `Nothing: each person is within one paisa of their exact share`]
        ] },
        { type: `compare`, items: [
          { title: `Weak: round each share`, tone: `bad`, html: `<p>Compute in <code>double</code>, round each share. Shares can total more or less than the bill, so the payer is over- or under-paid and the group's nets no longer sum to zero.</p>` },
          { title: `Good: floor, then give the rest to one person`, tone: `warn`, html: `<p>The total is always right. But with many people, one person can carry several extra paise that have nothing to do with their share. Acceptable if you say so.</p>` },
          { title: `Strong: largest remainder`, tone: `ok`, html: `<p>Floor each share, then hand the leftover paise out one at a time to the people whose shares lost the most in flooring; ties go to the user id that sorts first. Totals are exact, nobody is off by more than a paisa, and the result doesn't depend on input order. Equal split is the same rule with every weight 1, so one helper serves both.</p>` }
        ] },
        { type: `code`, lang: `java`, title: `Split strategies`, code: `interface SplitStrategy {
    /** Each participant's share in paise. The shares add up to amount exactly. */
    Map<String, Long> shares(long amount);
}

final class Allocation {
    private Allocation() {}

    /** Splits amount in proportion to weights: floor every share, then give the leftover paise, one each,
     *  to the largest remainders. Ties go to the user id that sorts first, so input order never matters. */
    static Map<String, Long> byWeight(long amount, Map<String, Long> weights) {
        long total = weights.values().stream().mapToLong(Long::longValue).sum();
        if (total <= 0) throw new IllegalArgumentException("weights must be positive");
        record Part(String user, long share, long remainder) {}
        List<Part> parts = new ArrayList<>();
        long assigned = 0;
        for (String user : new TreeSet<>(weights.keySet())) {
            long scaled = Math.multiplyExact(amount, weights.get(user));
            parts.add(new Part(user, scaled / total, scaled % total));
            assigned += scaled / total;
        }
        parts.sort(Comparator.comparingLong(Part::remainder).reversed());   // stable: equal remainders keep id order
        long leftover = amount - assigned;                                 // always fewer than parts.size()
        Map<String, Long> out = new TreeMap<>();
        for (int i = 0; i < parts.size(); i++) {
            out.put(parts.get(i).user(), parts.get(i).share() + (i < leftover ? 1 : 0));
        }
        return out;
    }
}

final class EqualSplit implements SplitStrategy {
    private final Map<String, Long> weights;

    EqualSplit(List<String> users) {
        if (users.isEmpty()) throw new IllegalArgumentException("no one to split between");
        Map<String, Long> w = new HashMap<>();
        for (String u : users) {
            if (w.put(u, 1L) != null) throw new IllegalArgumentException("listed twice: " + u);
        }
        this.weights = Map.copyOf(w);
    }

    public Map<String, Long> shares(long amount) { return Allocation.byWeight(amount, weights); }
}

final class ExactSplit implements SplitStrategy {
    private final Map<String, Long> paise;

    ExactSplit(Map<String, Long> paise) {
        if (paise.isEmpty() || paise.values().stream().anyMatch(p -> p < 0))
            throw new IllegalArgumentException("exact amounts must be zero or more");
        this.paise = Map.copyOf(paise);
    }

    public Map<String, Long> shares(long amount) {
        long sum = paise.values().stream().mapToLong(Long::longValue).sum();
        if (sum != amount) throw new IllegalArgumentException("exact amounts add up to " + sum + ", not " + amount);
        return paise;
    }
}

final class PercentSplit implements SplitStrategy {
    static final long WHOLE = 10_000;                        // basis points: 33.33% is 3333
    private final Map<String, Long> basisPoints;

    PercentSplit(Map<String, Long> basisPoints) {
        if (basisPoints.isEmpty() || basisPoints.values().stream().anyMatch(b -> b <= 0))
            throw new IllegalArgumentException("every percentage must be positive");
        long sum = basisPoints.values().stream().mapToLong(Long::longValue).sum();
        if (sum != WHOLE) throw new IllegalArgumentException("percentages add up to " + sum + " basis points, not " + WHOLE);
        this.basisPoints = Map.copyOf(basisPoints);
    }

    public Map<String, Long> shares(long amount) { return Allocation.byWeight(amount, basisPoints); }
}` },
        { type: `keypoints`, items: [
          `<strong>Why fewer than n leftover paise.</strong> Each share loses less than one paisa to flooring, so the leftover is always smaller than the number of people and each gets at most one extra.`,
          `<strong>Checked results, from a JS port of this code:</strong> ₹10.00 equally among three gives 334 / 333 / 333; ₹100.01 at 33.33% / 33.33% / 33.34% gives 3333 / 3333 / 3335, because the 33.34% share had the largest remainder.`,
          `<strong>Validate early.</strong> Percentages are checked when the strategy is built, before any expense exists; exact amounts can only be checked once the amount is known.`,
          `<strong>Immutable strategies.</strong> All fields are final copies, so a strategy can be built on one thread and used on another, or reused for many expenses.`
        ] }
      ] },
      { id: `ledger-impl`, title: `Implementation: recording debts and simplifying`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Normal path: for each share, the participant owes the payer that much. The payer's own share is a debt to themselves and moves nothing. Edge cases: a debt that cancels an existing debt the other way, a pair that nets to zero (remove the entry, so <code>debts()</code> stays clean), a settle-up larger than the debt, and simplifying when everyone is already square.</p>` },
        { type: `code`, lang: `java`, title: `BalanceSheet`, code: `/** Who owes whom inside one group. Not thread-safe: only its Group calls it, while holding the group's lock. */
final class BalanceSheet {
    private record Pair(String lo, String hi) {}             // lo sorts before hi: one key per pair of users
    private record Owed(String user, long amount) {}

    private final Map<Pair, Long> pairs = new HashMap<>();   // > 0: lo owes hi; < 0: hi owes lo
    private final Map<String, Long> net = new HashMap<>();   // > 0: is owed money; < 0: owes money

    /** debtor owes creditor amount more; a debt the other way shrinks first, with no special case. */
    void record(String debtor, String creditor, long amount) {
        if (debtor.equals(creditor) || amount == 0) return;   // the payer's own share moves nothing
        addToPair(debtor, creditor, amount);
        net.merge(debtor, -amount, Long::sum);
        net.merge(creditor, amount, Long::sum);
    }

    long owes(String debtor, String creditor) {
        long v = debtor.compareTo(creditor) < 0
            ? pairs.getOrDefault(new Pair(debtor, creditor), 0L)
            : -pairs.getOrDefault(new Pair(creditor, debtor), 0L);
        return Math.max(0, v);
    }

    long net(String user) { return net.getOrDefault(user, 0L); }

    List<Transfer> debts() {
        List<Transfer> out = new ArrayList<>();
        pairs.forEach((p, v) -> out.add(v > 0 ? new Transfer(p.lo(), p.hi(), v) : new Transfer(p.hi(), p.lo(), -v)));
        out.sort(Comparator.comparing(Transfer::from).thenComparing(Transfer::to));
        return out;
    }

    /** Replaces the pairwise debts with at most n-1 transfers; every net balance stays the same. */
    List<Transfer> simplify() {
        Comparator<Owed> largestFirst = Comparator.comparingLong(Owed::amount).reversed().thenComparing(Owed::user);
        PriorityQueue<Owed> creditors = new PriorityQueue<>(largestFirst);
        PriorityQueue<Owed> debtors = new PriorityQueue<>(largestFirst);
        net.forEach((user, v) -> {
            if (v > 0) creditors.add(new Owed(user, v));
            else if (v < 0) debtors.add(new Owed(user, -v));
        });
        List<Transfer> plan = new ArrayList<>();
        while (!creditors.isEmpty()) {                       // nets sum to zero, so both heaps empty together
            Owed c = creditors.poll(), d = debtors.poll();
            long x = Math.min(c.amount(), d.amount());
            plan.add(new Transfer(d.user(), c.user(), x));
            if (c.amount() > x) creditors.add(new Owed(c.user(), c.amount() - x));
            if (d.amount() > x) debtors.add(new Owed(d.user(), d.amount() - x));
        }
        pairs.clear();
        plan.forEach(t -> addToPair(t.from(), t.to(), t.amount()));   // nets are untouched
        return plan;
    }

    private void addToPair(String debtor, String creditor, long amount) {
        boolean ordered = debtor.compareTo(creditor) < 0;
        Pair key = ordered ? new Pair(debtor, creditor) : new Pair(creditor, debtor);
        long v = pairs.merge(key, ordered ? amount : -amount, Long::sum);
        if (v == 0) pairs.remove(key);                        // a settled pair leaves no entry
    }
}` },
        { type: `code`, lang: `java`, title: `Group`, code: `/** One group's members, history and balances. Every method holds the group's lock, so an expense updates
 *  the pairs and the nets as one step, and different groups never wait for each other. */
final class Group {
    final String id;
    final Set<String> members;                               // fixed at creation, immutable
    private final BalanceSheet sheet = new BalanceSheet();
    private final List<Expense> history = new ArrayList<>(); // append-only

    Group(String id, Set<String> members) {
        this.id = id;
        this.members = Set.copyOf(members);
    }

    boolean isMember(String userId) { return members.contains(userId); }   // immutable set: no lock needed

    synchronized void apply(Expense e) {
        e.shares().forEach((user, share) -> sheet.record(user, e.payerId(), share));
        history.add(e);
    }

    synchronized void settle(Transfer t) {
        long owed = sheet.owes(t.from(), t.to());
        if (t.amount() > owed) throw new IllegalArgumentException(t.from() + " owes " + t.to() + " only " + owed);
        sheet.record(t.to(), t.from(), t.amount());          // paying a debt is a debt in the other direction
    }

    synchronized long net(String userId)       { return sheet.net(userId); }
    synchronized List<Transfer> debts()         { return sheet.debts(); }
    synchronized List<Transfer> simplifyDebts() { return sheet.simplify(); }
    synchronized List<Expense> history()        { return List.copyOf(history); }
}` },
        { type: `keypoints`, items: [
          `<strong>The signed pair replaces the netting branch.</strong> The usual "if the reverse debt covers it, reduce it, else clear it and record the rest" is one <code>merge</code> on a signed value.`,
          `<strong>Greedy simplify.</strong> Match the largest debtor with the largest creditor; each step settles at least one of them, so there are at most n-1 transfers. The exact minimum is NP-hard (see Deep Dives).`,
          `<strong>Check, then act, inside one lock.</strong> <code>settle</code> reads the debt and records the payment in one synchronized method, so two concurrent settle-ups can't both pass the check and overpay.`,
          `<strong>History holds expenses only.</strong> Settle-ups could be logged too, as an expense paid by the debtor with an exact split to the creditor; that is what the edit and audit follow-ups build on.`
        ] }
      ] },
      { id: `service-impl`, title: `Implementation: the service`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p><code>addExpense</code> does everything that can fail before it touches a balance: look up the group, check the payer, compute the shares, check that every participant is a member, build the record (which checks the total). Only then does it call <code>apply</code>. A rejected expense leaves no trace.</p>` },
        { type: `code`, lang: `java`, title: `SplitwiseService`, code: `/** The entry point. Create one at startup and pass it to whoever needs it. */
final class SplitwiseService {
    private final Map<String, User> users = new ConcurrentHashMap<>();
    private final Map<String, Group> groups = new ConcurrentHashMap<>();
    private final AtomicLong nextExpenseId = new AtomicLong(1);

    User addUser(String id, String name) {
        User u = new User(id, name);
        if (users.putIfAbsent(id, u) != null) throw new IllegalArgumentException("user exists: " + id);
        return u;
    }

    Group createGroup(String id, Set<String> memberIds) {
        if (memberIds.size() < 2 || !users.keySet().containsAll(memberIds))
            throw new IllegalArgumentException("a group needs two or more registered users");
        Group g = new Group(id, memberIds);
        if (groups.putIfAbsent(id, g) != null) throw new IllegalArgumentException("group exists: " + id);
        return g;
    }

    Expense addExpense(String groupId, String payerId, long amount, SplitStrategy split, String description) {
        Group g = group(groupId);
        requireMember(g, payerId);
        if (amount <= 0) throw new IllegalArgumentException("amount must be positive");
        Map<String, Long> shares = split.shares(amount);     // pure computation: no lock held
        shares.keySet().forEach(u -> requireMember(g, u));
        Expense e = new Expense(nextExpenseId.getAndIncrement(), groupId, payerId, amount, shares, description);
        g.apply(e);                                          // the only step that changes state
        return e;
    }

    void settleUp(String groupId, String fromId, String toId, long amount) {
        Group g = group(groupId);
        requireMember(g, fromId);
        requireMember(g, toId);
        if (amount <= 0 || fromId.equals(toId)) throw new IllegalArgumentException("a settle-up needs two people and a positive amount");
        g.settle(new Transfer(fromId, toId, amount));
    }

    long balance(String groupId, String userId) { return group(groupId).net(userId); }
    List<Transfer> whoOwesWhom(String groupId)   { return group(groupId).debts(); }
    List<Transfer> simplifyDebts(String groupId) { return group(groupId).simplifyDebts(); }

    private Group group(String id) {
        Group g = groups.get(id);
        if (g == null) throw new IllegalArgumentException("no group " + id);
        return g;
    }

    private static void requireMember(Group g, String userId) {
        if (!g.isMember(userId)) throw new IllegalArgumentException(userId + " is not in group " + g.id);
    }
}` },
        { type: `callout`, tone: `warning`, html: `<p>Thread safety: an expense changes several pair entries and several nets, and a reader must never see half of it. All of a group's state changes inside that group's <code>synchronized</code> methods, so concurrent expenses in one group apply one after another and none is lost, while groups have separate locks and run in parallel. The service's maps are <code>ConcurrentHashMap</code>s with <code>putIfAbsent</code>, so two registrations of the same id can't both succeed. Strategies, <code>Expense</code> and the member sets are immutable and need no lock. Splitting happens before the lock is taken, so the lock is held only for the cheap map updates.</p>` },
        { type: `text`, html: `<p>The <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/splitwise" target="_blank" rel="noopener">awesome-low-level-design Splitwise solution</a> has the same core shapes, which we kept: a <code>SplitStrategy</code> per split type, an <code>Expense</code> holding its computed splits, a <code>Transaction</code>-style result for simplified debts, and greedy creditor/debtor matching. The code here is written independently, with these changes: money is <code>long</code> paise instead of <code>double</code> (so no 0.01 tolerance checks), equal and percent splits hand out leftover paise explicitly, balances live on the group rather than on each user so one expense is one locked update instead of two separately locked sheets, the service is injected rather than a Singleton, strategies carry their own inputs instead of a shared values list, and the Expense builder is replaced by a validating record.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk a concrete scenario call by call before the interviewer does. Group <code>trip</code> has Asha, Bilal, Chen and Dev. Amounts are paise; a net above zero means the group owes that person. This trace is the output of a JS port of the code above.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `addExpense(trip, asha, 90000, EqualSplit[asha, bilal, chen], "hotel")
   shares   asha 30000, bilal 30000, chen 30000
   debts    bilal->asha 30000, chen->asha 30000
   net      asha +60000, bilal -30000, chen -30000, dev 0

addExpense(trip, bilal, 1000, EqualSplit[asha, bilal, chen], "snacks")
   shares   asha 334, bilal 333, chen 333      leftover paisa to asha (remainders tie; asha sorts first)
   debts    bilal->asha 29666, chen->asha 30000, chen->bilal 333
   net      asha +59666, bilal -29333, chen -30333, dev 0

addExpense(trip, chen, 999, PercentSplit{asha 10%, bilal 45%, chen 45%}, "taxi")
   shares   asha 100, bilal 450, chen 449      2 leftover paise: asha (.9), then bilal (.55, tie with chen)
   debts    bilal->asha 29666, bilal->chen 117, chen->asha 29900
            (chen owed bilal 333; bilal now owes chen 450, so the pair flips to bilal->chen 117)
   net      asha +59566, bilal -29783, chen -29783, dev 0

addExpense(trip, asha, 5000, ExactSplit{bilal 2000, dev 3000}, "museum")
   debts    bilal->asha 31666, bilal->chen 117, chen->asha 29900, dev->asha 3000
   net      asha +64566, bilal -31783, chen -29783, dev -3000      (sum is 0)

new PercentSplit{asha 50%, bilal 40%}           rejected: percentages add up to 9000 basis points, not 10000
addExpense(..., ExactSplit{bilal 1000, chen 1500}) for 3000   rejected: exact amounts add up to 2500, not 3000
addExpense(..., EqualSplit[asha, zara])         rejected: zara is not in the group
   balances unchanged after all three

simplifyDebts(trip)
   plan     bilal->asha 31783, chen->asha 29783, dev->asha 3000    4 debts become 3 payments
   net      unchanged; the bilal->chen 117 hop is gone

settleUp(trip, dev, asha, 3000)     debts  bilal->asha 31783, chen->asha 29783      dev 0
settleUp(trip, bilal, asha, 10000)  debts  bilal->asha 21783, chen->asha 29783      partial payment
settleUp(trip, chen, asha, 30000)   rejected: chen owes asha only 29783
settleUp(trip, bilal, chen, 117)    rejected: bilal owes chen only 0 (simplify removed that debt)` },
        { type: `keypoints`, items: [
          `Every split added up to the amount: 1000 became 334 + 333 + 333, and 999 became 100 + 450 + 449, with the leftovers going where the remainders were largest.`,
          `The taxi flipped a pair's direction: Chen owed Bilal 333, Bilal's taxi share added 450 the other way, and one signed addition left Bilal owing Chen 117, with no special case.`,
          `Nets summed to zero after every call, and simplify changed who pays whom without changing any net.`,
          `Rejected calls changed nothing, and a settle-up after simplify is checked against the simplified plan, not the old debts.`
        ] }
      ] }
    ],
    levels: levels(
      [`Money as whole paise in a <code>long</code>, and splits whose shares add up to the amount, even if the remainder rule is "the first person pays the extra".`, `A split interface with equal, exact and percent implementations, and validation that rejects bad totals.`, `Some way to show who owes whom, and a trace that shows it working on two or three expenses.`],
      [`Balances kept per group with a net per user and a netted debt per pair, and the reason for each.`, `Explicit, deterministic remainder handling, and can explain why rounding each share in <code>double</code> breaks the total.`, `Settle-up that can't overpay, and greedy simplify with its n-1 bound, written or sketched quickly.`, `One lock per group covering every balance change, and splitting done outside it.`],
      [`Asks where the extra paisa goes unprompted, and picks largest remainder with a tie rule that doesn't depend on input order.`, `Argues for strategies built with their own inputs, balances on the group rather than the user, and no Singleton, each with the trade-off.`, `Knows the exact minimum number of transfers is NP-hard, gives a case where greedy loses, and says when it matters.`, `Sketches edits as reversing entries, currencies as one balance sheet per currency with recorded rates, and cross-group totals, naming which class changes for each.`]
    ),
    concepts: [
      { term: `Money as long paise`, def: `Every amount is a whole number of the smallest unit in a <code>long</code>.`, why: `Exact arithmetic; a <code>double</code> can't represent most decimal amounts and its errors accumulate.` },
      { term: `Largest remainder`, def: `Floor every share, then give the leftover units one each to the shares that lost the most; ties by sorted user id.`, why: `Shares add up exactly, nobody is more than one unit from their true share, and input order doesn't matter.` },
      { term: `Basis points`, def: `Percentages as whole hundredths of a percent: 100% is 10000, 33.33% is 3333.`, why: `Percent splits stay in integer arithmetic and can still express two decimal places.` },
      { term: `Strategy with its own inputs`, def: `Each split rule is built with exactly the data it needs; the interface is <code>shares(long amount)</code>.`, why: `Inputs can't be mismatched, new rules don't touch old ones, and immutable strategies are safe to share.` },
      { term: `Signed pair entry`, def: `One map entry per pair of users, keyed in sorted order, positive when the first owes the second.`, why: `Netting is a single addition, and a pair can never hold debts in both directions.` },
      { term: `Net balance invariant`, def: `Each user's net is what the group owes them minus what they owe; the nets always sum to zero.`, why: `The input to simplify, and a one-line correctness check in tests.` },
      { term: `Greedy debt simplification`, def: `Repeatedly match the largest debtor with the largest creditor and transfer the smaller amount.`, why: `At most n-1 payments, fast; the true minimum is NP-hard.` },
      { term: `Lock per group`, def: `Every change to a group's balances happens inside that group's synchronized methods.`, why: `No lost or half-applied expenses within a group, while different groups proceed in parallel.` }
    ],
    interview: [
      { q: `Why not store money as a double?`, a: `Binary floating point can't represent most decimal amounts exactly, so 0.1 + 0.2 isn't 0.3, sums drift over many expenses, and shares stop adding up to the bill. A long count of paise makes every operation exact, and rounding becomes a visible decision about where leftover paise go instead of an accident.`, diff: `easy` },
      { q: `How do you split ₹9.99 as 10%, 45%, 45%?`, a: `The exact shares are 99.9, 449.55 and 449.55 paise. Floor them to 99, 449, 449, which leaves 2 paise. Give them one each to the largest remainders: the 10% share (.9) and then one of the 45% shares (.55, tie broken by user id). Result 100, 450, 449, total 999. Rounding each share would give 100, 450, 450, a paisa more than was spent.`, diff: `medium` },
      { q: `Why are balances on the group and not on each user?`, a: `A balance only means something within a group: what Bilal owes on the trip is separate from what he owes in the flat. Per-user sheets also turn one expense into two updates on two objects (the payer's sheet and the participant's), which need a lock across both. On the group, one expense is one update to one object under one lock.`, diff: `medium` },
      { q: `What does storing a signed amount per sorted pair buy you?`, a: `A pair has exactly one entry, so it can't hold "A owes B" and "B owes A" at once. Recording a new debt is one addition: positive if the debtor sorts first, negative otherwise. The usual netting code with a branch for "does the reverse debt cover it" disappears, and an entry that reaches zero is removed.`, diff: `medium` },
      { q: `Two people add expenses to the same group at the same moment. What can go wrong, and how do you prevent it?`, a: `Each expense updates several pair entries and nets. Without a lock, two read-modify-write updates of the same entry can lose one of them, and a reader can see the pairs updated but not the nets. All changes go through the group's synchronized methods, so expenses in one group apply one at a time. Splitting is done before taking the lock, and different groups have different locks, so contention is limited to one busy group.`, diff: `hard` },
      { q: `How does simplify work, and is it optimal?`, a: `Compute each user's net. Put creditors and debtors in two max-heaps, repeatedly match the largest of each, transfer the smaller amount and push back the remainder. Each step settles at least one person, so at most n-1 payments. It isn't always minimal: with nets +4, +3, -3, -2, -2, greedy makes 4 payments but 3 suffice (the -3 pays the +3, both -2s pay the +4). Finding the minimum means finding the most disjoint zero-sum groups, which is NP-hard.`, diff: `hard` },
      { q: `After simplifying, Bilal tries to settle a debt to Chen that existed before. What happens?`, a: `It's rejected. Simplify rewrites the pairwise debts to the new plan (Bilal now pays Asha, not Chen) while leaving every net unchanged, and settleUp checks the current pairwise debt. That is deliberate: once people agree to the simplified plan, payments should follow it.`, diff: `medium` }
    ],
    cheatsheet: [
      { title: `Splitwise in one screen`, type: `code`, lang: `java`, body: `record Expense(long id, String groupId, String payerId, long amount, Map<String, Long> shares, String description) {}
record Transfer(String from, String to, long amount) {}          // settle-up, or a step of a simplified plan

interface SplitStrategy { Map<String, Long> shares(long amount); }   // shares add up to amount exactly
// EqualSplit(users), ExactSplit(paise), PercentSplit(basisPoints, 10000 = 100%)
// Allocation.byWeight: floor each share, leftover paise to the largest remainders, ties by user id

final class BalanceSheet {                         // used only under its Group's lock
    Map<Pair, Long> pairs;                         // sorted pair; > 0 first owes second; zero entries removed
    Map<String, Long> net;                         // sums to zero across the group
    void record(String debtor, String creditor, long amount);
    List<Transfer> simplify();                     // two max-heaps, at most n-1 payments, nets unchanged
}

final class Group {                                // one lock per group
    synchronized void apply(Expense e);            // record(participant, payer, share) for each share
    synchronized void settle(Transfer t);          // reject if more than owed; record(to, from, amount)
}

final class SplitwiseService {                     // injected; ConcurrentHashMap of users and groups
    Expense addExpense(String groupId, String payerId, long amount, SplitStrategy split, String description);
    void settleUp(String groupId, String fromId, String toId, long amount);
}` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Split by shares or by items`, `A new SplitStrategy; nothing else changes (Deep Dives)`],
        [`Edit or delete an expense`, `Group appends a reversing entry; history is never rewritten (Deep Dives)`],
        [`Several currencies`, `Expense carries a currency; Group keeps one BalanceSheet per currency (Deep Dives)`],
        [`Busy groups, totals across groups`, `Lock per group stays; the service sums per-group nets (Deep Dives)`],
        [`Fewest possible payments`, `Exact search only for small groups; greedy otherwise (Deep Dives)`],
        [`Settle-up history`, `Log each settle-up as an exact-split expense in Group.history`]
      ] }
    ],
    labs: []
  });
})();
