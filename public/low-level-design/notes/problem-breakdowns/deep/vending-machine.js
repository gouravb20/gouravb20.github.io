// Deep dives: Vending Machine (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["vending-machine"] = {
  hook: `<p>Two states cover the happy path. The follow-ups check whether the State pattern pays off: adding states without touching existing ones, real change-making with a limited coin box, and payment methods beyond cash.</p>`,
  sections: [
    {
      id: "new-states",
      title: "Adding DispensingState and OutOfServiceState",
      kicker: "Follow-up: more states",
      blocks: [
        { type: "text", html: `<p>A new state is a new class. Existing states change only where they transition into it, and the machine doesn't change at all.</p>` },
        { type: "code", lang: "java", title: "Two new states", code: `class DispensingState implements VendingState {
    public void insertMoney(VendingMachine m, int amount) { throw new IllegalStateException("Dispensing, please wait"); }
    public void selectProduct(VendingMachine m, String code) { throw new IllegalStateException("Dispensing, please wait"); }
    public void cancel(VendingMachine m) { throw new IllegalStateException("Dispensing, cannot cancel"); }
}
// HasMoneyState.selectProduct: after the checks, m.setState(new DispensingState()) and start the motor;
// the machine calls m.setState(new IdleState()) when the hardware reports the item has dropped.

class OutOfServiceState implements VendingState {
    public void insertMoney(VendingMachine m, int amount) { throw new IllegalStateException("Out of service"); }
    public void selectProduct(VendingMachine m, String code) { throw new IllegalStateException("Out of service"); }
    public void cancel(VendingMachine m) { }
}
// Entered when every product is sold out or an admin disables the machine; an admin reset returns to Idle.` },
        { type: "callout", tone: "tip", html: `<p>If every state throws for most actions, give them a base class (an abstract <code>RejectingState</code>) that throws by default and override only what each state allows. It cuts repetition without changing the pattern.</p>` }
      ]
    },
    {
      id: "change-making",
      title: "Change-making with a limited coin inventory",
      kicker: "Follow-up: real money",
      blocks: [
        { type: "problem", html: `<p>The machine has a finite number of each coin. If it accepts 200 for a 130 item but has no coins to make 70, it must refuse the sale <em>before</em> dispensing, not after.</p>` },
        { type: "code", lang: "java", title: "Greedy change, refused if impossible", code: `class CoinBox {
    private final TreeMap<Integer, Integer> coins = new TreeMap<>(Comparator.reverseOrder());   // denomination -> count

    void add(int denomination, int count) { coins.merge(denomination, count, Integer::sum); }

    /** Coins for the amount, or empty if exact change isn't possible. Doesn't modify the box. */
    Optional<Map<Integer, Integer>> plan(int amount) {
        Map<Integer, Integer> out = new LinkedHashMap<>();
        int left = amount;
        for (var e : coins.entrySet()) {
            int use = Math.min(e.getValue(), left / e.getKey());
            if (use > 0) { out.put(e.getKey(), use); left -= use * e.getKey(); }
        }
        return left == 0 ? Optional.of(out) : Optional.empty();
    }

    void take(Map<Integer, Integer> plan) { plan.forEach((d, n) -> coins.merge(d, -n, Integer::sum)); }
}

// In HasMoneyState.selectProduct, before dispensing:
//   var change = m.coinBox().plan(m.balance() - p.price)
//                 .orElseThrow(() -> new IllegalStateException("Exact change only"));
//   ... dispense, then m.coinBox().take(change)` },
        { type: "callout", tone: "warning", html: `<p>Greedy is optimal for standard coin systems (1, 2, 5, 10, ...) but not for arbitrary ones: with coins 1, 3 and 4, greedy gives 6 as 4+1+1 (three coins) while 3+3 uses two. With a limited box, greedy can also fail where another combination succeeds. Use dynamic programming over the coin counts if denominations are unusual.</p>` }
      ]
    },
    {
      id: "payments-and-admin",
      title: "Card payments, restocking and reports",
      kicker: "Follow-up: features",
      blocks: [
        { type: "table", headers: ["Requirement", "Design change"], rows: [
          ["Card or wallet payment", "A <code>PaymentMethod</code> strategy; a card authorises the exact price, so no change is needed"],
          ["Admin restock", "An <code>AdminState</code> (or admin-only methods guarded by a key) to add stock and empty the coin box"],
          ["Sales reports", "Record each sale (code, price, time) in a list; an observer can push events to monitoring"]
        ] },
        { type: "quiz", q: "In HasMoneyState, the user selects a product that costs more than their balance. What should happen?", options: [
          "Dispense anyway and record a debt",
          "Throw \"Insufficient funds\", keep the balance and stay in HasMoneyState",
          "Refund automatically and return to Idle",
          "Switch to OutOfServiceState"
        ], answer: 1, explain: `<p>The checks run before anything changes. The machine reports the problem and keeps the credit, so the user can insert more money, pick something cheaper, or cancel for a refund.</p>` }
      ]
    }
  ],
  takeaways: [
    "New states are new classes; existing states only change where they transition.",
    "Plan change before dispensing and refuse the sale if exact change is impossible.",
    "Greedy change-making is optimal for standard coins, not for arbitrary denominations.",
    "Payment methods are strategies; admin and reporting fit as a state and an observer."
  ]
};
