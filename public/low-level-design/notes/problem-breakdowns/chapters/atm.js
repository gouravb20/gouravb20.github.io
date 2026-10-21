// LLD problem breakdown: ATM. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `atm`, part: 2, number: 0, difficulty: `medium`,
    title: `ATM: session states, an inventory-aware cash chain and all-or-nothing withdrawals`,
    references: [{ title: `awesome-low-level-design: ATM`, url: `https://github.com/ashishps1/awesome-low-level-design/blob/main/problems/atm.md` }],
    overview: `An ATM lets a cardholder prove who they are with a PIN, check a balance and take out cash, while the bank, not the machine, owns the money. This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement the session, the note planning and the withdrawal (comparing a simple, a better and a strong option at each decision), verify with a trace, then handle follow-ups. The design lands on the <strong>State</strong> pattern for the session, with each state an immutable record; a <strong>Chain of Responsibility</strong> of note cassettes that plans against the notes actually loaded and backs off where a greedy pick would fail; and a <strong>plan-then-commit</strong> withdrawal: plan the notes, debit the bank with an idempotency key, dispense, and reverse the debit if the dispenser jams.`,
    problem: [
      { id: `understanding`, title: `What an ATM does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>A customer walks up, inserts a card and types a PIN. If the PIN is right they can see their balance and take out cash, as many times as they like, then take the card back. Behind the screen sit cassettes of banknotes, a dispenser that can jam, and a network link to the bank that holds the account. The machine has to keep the customer, the cassettes and the bank's ledger consistent with each other.</p>` },
        { type: `text`, html: `<p>The prompt is usually one line: <em>"Design the software for an ATM: card and PIN, balance enquiry and cash withdrawal."</em> That leaves the important questions open: who owns the money, what happens when the machine can't make an amount, and what happens when cash and ledger disagree. The first few minutes go into pinning those down.</p>` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the machine must do</strong>, <strong>what happens with bad input or a bad moment</strong> (a wrong PIN, an odd amount, a jam), <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`Who owns the balance and checks the PIN: the ATM or the bank?`, `The bank. The ATM asks it over a network`, `A <code>BankService</code> interface; no balances or PINs stored in the machine`],
          [`Which operations?`, `Balance and withdrawal. Deposits and transfers might come later`, `Two operations now; deposits are a follow-up that should fit without a rewrite`],
          [`Which notes, and can a cassette run out?`, `Rs 2000, 500, 200 and 100, each with a finite count`, `Notes are planned against real counts, not a fixed greedy rule`],
          [`What amounts are allowed?`, `Multiples of Rs 100, at most Rs 10,000 a time. The bank has a daily limit`, `Which rules the ATM checks and which the bank checks`],
          [`What happens on a wrong PIN?`, `Three tries per session, then the machine keeps the card`, `A wrong-PIN count that belongs to the session, not the machine`],
          [`What if the dispenser jams after the account is debited?`, `Undo the debit and take the machine out of service`, `A compensating reversal and an out-of-service state`],
          [`What about actions at the wrong moment, like withdrawing before a PIN?`, `Reject them and change nothing`, `Every action is checked against the session state`],
          [`Concurrency?`, `One customer per machine, but an operator can refill mid-session, and one account can be used from many ATMs at once`, `One lock per ATM; atomic per-account debits at the bank`]
        ] },
        { type: `callout`, tone: `insight`, title: `Who owns the money?`, html: `<p>Ask this first. The answer splits the problem in two: the ATM owns its notes, its session and its journal; the bank owns balances, PINs and limits. Because they are two systems that share no transaction, the order of steps in a withdrawal becomes the core of the design, and there are two separate locks: the machine's, which guards its notes and session, and the bank's per-account lock, which is the only thing that can stop two ATMs overdrawing one account. A candidate who keeps a balance field inside the ATM has lost this before writing any code.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. A customer inserts a card and enters a PIN; the bank checks the PIN.
     Three wrong PINs in one session retain the card.
  2. Once authenticated, the customer can check the balance, withdraw cash
     (more than once) and eject the card.
  3. Withdrawals are multiples of Rs 100, at most Rs 10,000 each. The bank
     enforces the balance and a daily limit.
  4. The ATM holds cassettes of Rs 2000, 500, 200 and 100 notes with finite
     counts, and pays any amount its loaded notes can make.
  5. A withdrawal is all or nothing: the customer gets the cash and is
     debited, or neither. A dispenser fault after the debit reverses it.
  6. An action that makes no sense in the current state (a PIN with no card,
     a withdrawal before the PIN) is rejected and changes nothing.
  7. Every withdrawal attempt (completed, declined, reversed) is journalled
     with a masked card number.
  8. An operator can refill cassettes, take the ATM out of service and
     restore it; a refill can arrive in the middle of a session.
  9. One account can be used from many ATMs at the same moment.

Out of scope
  - Deposits, transfers, PIN change, statements, other currencies
  - Letting the customer choose the note mix
  - The network protocol to the bank, the screen, keypad and receipt printer` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules, then test each one. In this problem several obvious nouns belong to the bank, not the ATM, and saying so out loud is part of the answer.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`Card`, `A record holding only the number`, `It identifies the account at the bank. It must not carry the PIN: the PIN is typed, sent to the bank and forgotten`],
          [`Account`, `Not in the ATM`, `Balance and limits live at the bank. An ATM-side account invites checking the balance locally, which is wrong the moment a second ATM exists`],
          [`PIN`, `A <code>String</code> passed straight to the bank`, `Never stored. In production it is an encrypted PIN block from the keypad`],
          [`Note, denomination`, `A <code>long</code> in paise, not a class`, `A value with no behaviour of its own`],
          [`Cassette`, `A class`, `Holds one note value and how many are left; one link in the dispense chain`],
          [`CashDispenser`, `A class`, `Owns the chain; plans notes for an amount and removes them all or nothing`],
          [`Session`, `A family of state records`, `What each action means depends on the session, and two states carry data (the card, the wrong-PIN count)`],
          [`Atm`, `A class`, `The entry point: holds the current state, the cash, the journal and the lock, and runs a withdrawal`],
          [`Bank`, `An interface, <code>BankService</code>`, `Another system. The ATM asks; it never decides about money`],
          [`Transaction`, `A record`, `An immutable journal entry`],
          [`Screen, keypad, receipt printer`, `Out of scope`, `UI. The public methods are what the UI would call`],
          [`OperationType`, `Not needed`, `One method per operation is type-safe and returns its own result; a <code>selectOperation(type, args...)</code> method is not`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`Atm`, `The facade. Receives customer and operator actions, hands customer actions to the current state, owns the lock, and runs the withdrawal: plan, debit, dispense, reverse on a fault.`],
          [`AtmState`, `What each action means right now. Four immutable records: <code>Idle</code>, <code>CardInserted(card, wrongPins)</code>, <code>Authenticated(card)</code>, <code>OutOfService(reason)</code>.`],
          [`CashDispenser, Cassette`, `A chain of cassettes from the largest note down. Plans a set of notes for an amount without touching counts, then removes them in one step.`],
          [`BankService`, `The bank's side: verify a PIN, read a balance, debit with an idempotency key, reverse a debit.`],
          [`CashHardware`, `The physical dispenser and card slot; dispensing can fail.`],
          [`Card, Transaction`, `Values: a card number that masks itself, and a journal entry.`]
        ] },
        { type: `callout`, tone: `tip`, html: `<p>Draw the boundary first: "The bank is a separate system; the ATM talks to it through an interface and stores no money." That one sentence removes <code>Account</code>, balances and PIN storage from your design, and it tells the interviewer you know where atomicity has to live.</p>` }
      ] },
      { id: `atm-design`, title: `Class design: Atm`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What the Atm remembers`], rows: [
          [`"Insert a card, enter a PIN, then operate"`, `The current session state`],
          [`"Cassettes of four notes with finite counts"`, `A <code>CashDispenser</code>`],
          [`"The bank checks PINs and owns balances"`, `A <code>BankService</code>, injected`],
          [`"The dispenser can fault; a card can be retained"`, `A <code>CashHardware</code>, injected`],
          [`"Every attempt is journalled"`, `A list of <code>Transaction</code>`],
          [`"A refill can arrive mid-session"`, `One lock (its own monitor) guarding all of the above`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Start a session`, `<code>void insertCard(Card card)</code>`],
          [`Prove identity`, `<code>PinResult enterPin(String pin)</code>: OK, WRONG_PIN or CARD_RETAINED`],
          [`Check the balance`, `<code>long balance()</code>, in paise`],
          [`Take cash`, `<code>Transaction withdraw(long amount)</code>: COMPLETED, DECLINED or REVERSED`],
          [`End the session`, `<code>void ejectCard()</code>`],
          [`Operator actions`, `<code>refill(long note, int count)</code>, <code>takeOutOfService()</code>, <code>restore()</code>, <code>journal()</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>One method per action.</strong> <code>withdraw(long)</code> returns a <code>Transaction</code> and <code>balance()</code> returns a number. A single <code>selectOperation(OperationType, int...)</code> loses both the argument types and the result types, and pushes a switch into every state.`,
          `<strong>Inject the bank and the hardware.</strong> A Singleton ATM is a common shortcut, but a bank has thousands of machines and tests need a fake bank and a dispenser that jams on demand. Pass the collaborators in through the constructor.`,
          `<strong>Outcomes are values; misuse is an exception.</strong> A declined withdrawal is a normal result, journalled and returned. Withdrawing with no card means the UI called the wrong thing, so the state throws <code>IllegalStateException</code> and nothing changes.`
        ] }
      ] },
      { id: `session-design`, title: `Class design: the session`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What the session remembers`], rows: [
          [`"A card is inserted"`, `Which card`],
          [`"Three wrong PINs retain the card"`, `Wrong PINs so far, in this session only`],
          [`"Once authenticated"`, `That the PIN was accepted, for which card`],
          [`"Out of service"`, `Why: out of cash, a fault, or maintenance`]
        ] },
        { type: `text`, html: `<p>Five customer actions times four situations is twenty decisions, and two of the situations carry data. <strong>How should the session be represented?</strong></p>` },
        { type: `compare`, items: [
          { title: `Good: a few booleans`, tone: `warn`, html: `<p><code>hasCard</code>, <code>authenticated</code> and <code>outOfService</code>, plus <code>card</code> and <code>wrongPins</code> fields. Quick to write, but three flags allow eight combinations and only four make sense; nothing stops <code>authenticated &amp;&amp; !hasCard</code>. Every method opens with a chain of ifs.</p>` },
          { title: `Better: an enum and a switch`, tone: `info`, html: `<p>One <code>Status</code> field makes impossible combinations unrepresentable. But each of the five actions switches over four states, so the rules are spread across five methods, and <code>card</code> and <code>wrongPins</code> still sit in fields every exit path must clear. Miss one reset and the next customer starts with two strikes.</p>` },
          { title: `Great: State objects as immutable records`, tone: `ok`, html: `<p>One record per state, holding only its own data: <code>CardInserted(card, wrongPins)</code>, <code>Authenticated(card)</code>. Each state implements the actions it allows; a default in the interface rejects the rest. Leaving a state drops its data, so there is nothing to reset, and a new state (Dispensing, DepositEscrow) is one more record.</p>` }
        ] },
        { type: `text`, html: `<p>We take the state records. An enum is the right call for two or three states with no data; here the session carries data that must not leak between customers, and the list of states is known to grow. Because the records are immutable, a transition is just the <code>Atm</code> swapping its <code>state</code> reference under its lock; the states themselves need no synchronisation.</p>` },
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
        { type: `table`, title: `Every action in every state`, headers: [`State`, `insertCard`, `enterPin`, `balance, withdraw`, `ejectCard`], rows: [
          [`Idle`, `Go to CardInserted`, `Reject`, `Reject`, `Reject`],
          [`CardInserted`, `Reject`, `OK: Authenticated. Wrong: count it. Third wrong or BLOCKED: retain the card`, `Reject`, `Return the card`],
          [`Authenticated`, `Reject`, `Reject`, `Run it and stay (a jam: OutOfService)`, `Return the card`],
          [`OutOfService`, `Reject`, `Reject`, `Reject`, `Reject (refill or restore leaves it)`]
        ] },
        { type: `keypoints`, items: [
          `<strong>The table is the spec.</strong> Each row becomes one record; each "Reject" is the interface default, so a state only writes the cells that do something.`,
          `<strong>Leaving a session picks the next state.</strong> Ejecting or retaining the card goes to Idle if there is cash left and to OutOfService(OUT_OF_CASH) otherwise, so the next customer never inserts a card into an empty machine.`,
          `<strong>Two wrong-PIN counters.</strong> The session's count decides when this machine keeps the card. The bank counts across every ATM and answers BLOCKED, which the session obeys on the first try.`
        ] }
      ] },
      { id: `cash-design`, title: `Class design: cassettes and the note plan`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a cassette remembers`], rows: [
          [`"Rs 2000, 500, 200 and 100 notes"`, `Its note value, in paise`],
          [`"Each with a finite count"`, `How many notes are left`],
          [`"Largest notes first"`, `The next smaller cassette: the link in the chain`]
        ] },
        { type: `text`, html: `<p>The question here is <strong>how to turn an amount into notes</strong> when every cassette has a limited count. Take a machine holding only Rs 500 and Rs 200 notes and a request for Rs 600.</p>` },
        { type: `compare`, items: [
          { title: `Good: a greedy loop in the Atm`, tone: `warn`, html: `<p>Loop over a hard-coded array of notes, taking as many of each as fit. Six lines. It takes one Rs 500 note, is left with Rs 100 that nothing can make, and declines, although three Rs 200 notes would do. The denominations are also baked into the <code>Atm</code>.</p>` },
          { title: `Better: a greedy Chain of Responsibility`, tone: `info`, html: `<p>Each cassette is a link: it handles its own note and passes the remainder on, so adding or retiring a note is one link. But the rule is still greedy, so Rs 600 still fails. A common version also checks with <code>canDispense</code> and then dispenses in a second pass that recomputes everything, so counts can change in between.</p>` },
          { title: `Great: an inventory-aware chain that backs off`, tone: `ok`, html: `<p>Same links. A link tries the most notes it can use, and if the rest of the chain can't make the remainder, tries one fewer, down to zero. Rs 600 becomes three Rs 200 notes. Planning only reads counts and returns a plan; removing the notes is a separate step taken after the bank says yes.</p>` }
        ] },
        { type: `text`, html: `<p>We take the backing-off chain. It keeps the pattern's shape (one class per link, the remainder passed along), finds the greedy answer in one pass when greedy works, and only searches when it must. One <code>Cassette</code> class parameterised by its note value replaces a subclass per denomination.</p>` },
        { type: `table`, headers: [`Need`, `Method on CashDispenser`], rows: [
          [`A plan for an amount, or "can't be made"`, `<code>Optional&lt;Map&lt;Long, Integer&gt;&gt; plan(long amount)</code>: reads counts only`],
          [`Remove exactly those notes`, `<code>void take(Map&lt;Long, Integer&gt; plan)</code>: all or nothing`],
          [`Operator refill`, `<code>void load(long note, int count)</code>`],
          [`Enough cash to keep serving?`, `<code>long total()</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Plan, then commit.</strong> A plan is a map of note to count. A decline anywhere between planning and the bank's answer leaves the cassettes exactly as they were.`,
          `<strong>Not thread-safe on its own, on purpose.</strong> The dispenser is only ever touched inside the <code>Atm</code>'s synchronized methods, so a second lock here would add nothing but a lock-ordering question.`
        ] }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `final class Atm {
    private final BankService bank;                          // injected: owns balances and PINs
    private final CashHardware hardware;                     // injected: dispenser and card slot
    private final CashDispenser cash;                        // guarded by this
    private final List<Transaction> journal;                 // guarded by this
    private AtmState state;                                  // guarded by this

    synchronized void insertCard(Card card);
    synchronized PinResult enterPin(String pin);
    synchronized long balance();                             // paise
    synchronized Transaction withdraw(long amount);          // paise
    synchronized void ejectCard();
    synchronized void refill(long note, int count);          // operator
    synchronized void takeOutOfService();
    synchronized void restore();
    synchronized List<Transaction> journal();
}

sealed interface AtmState permits Idle, CardInserted, Authenticated, OutOfService {
    void insertCard(Atm atm, Card card);                     // every action rejects by default
    PinResult enterPin(Atm atm, String pin);
    long balance(Atm atm);
    Transaction withdraw(Atm atm, long amount);
    void ejectCard(Atm atm);
}
record Idle() implements AtmState {}
record CardInserted(Card card, int wrongPins) implements AtmState {}
record Authenticated(Card card) implements AtmState {}
record OutOfService(Reason reason) implements AtmState {}

final class CashDispenser {
    private final Cassette head;                             // largest note first
    Optional<Map<Long, Integer>> plan(long amount);          // reads counts only
    void take(Map<Long, Integer> plan);                      // all or nothing
    void load(long note, int count);
    long total();
}
final class Cassette {
    final long note;
    final Cassette next;                                     // the next smaller note
    private int count;
    boolean plan(long amount, Map<Long, Integer> plan);      // most notes first, back off on failure
}

interface BankService {
    AuthResult verifyPin(String cardNumber, String pin);
    long balance(String cardNumber);
    DebitResult debit(String cardNumber, long amount, String idempotencyKey);
    void reverse(String cardNumber, String idempotencyKey);
}
interface CashHardware { void dispense(Map<Long, Integer> notes) throws DispenseException; void returnCard(); void retainCard(); }
record Card(String number) {}
record Transaction(String id, String atmId, String maskedCard, long amount, TxnStatus status, String reason, Instant at) {}` },
        { type: `text`, html: `<p>The <code>Atm</code> coordinates and holds the only lock. The states decide what an action means but never lock anything; the dispenser plans and counts but never talks to the bank; the bank owns money and never calls back into an ATM. Session behaviour is the <strong>State</strong> pattern because it changes with the session, and note planning is a <strong>Chain of Responsibility</strong> because denominations are a list that changes.</p>` }
      ] },
      { id: `session-impl`, title: `Implementation: values and session states`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. Start with the values and the boundary to the bank, because every state uses them. All money is a <code>long</code> in paise; <code>Atm.RS</code> (100) converts rupees, so a Rs 500 note is <code>500 * RS</code>.</p>` },
        { type: `code`, lang: `java`, title: `Values and the bank interface`, code: `record Card(String number) {
    Card {
        if (number == null || number.length() < 4) throw new IllegalArgumentException("Bad card number");
    }
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
        { type: `text`, html: `<p>Now the states. The normal path of a session is insert, PIN, operate, eject. The edge cases: a wrong PIN (count it), the third wrong PIN or a BLOCKED answer from the bank (retain the card), and any action the current state does not allow (reject it, change nothing).</p>` },
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
        atm.setState(new CardInserted(card, wrongPins + 1)); // a new record, not a mutated counter
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
        { type: `keypoints`, items: [
          `<strong>Sealed.</strong> The compiler knows the full list of states, so an <code>instanceof</code> check or a pattern switch over them can't silently miss one.`,
          `<strong>States call back into the Atm</strong> through package-private helpers (<code>setState</code>, <code>retainCard</code>, <code>endSession</code>, <code>runWithdrawal</code>). They are only ever called from inside the Atm's synchronized methods, so the lock is already held.`,
          `<strong>A rejected action throws before touching anything</strong>, so "changes nothing" holds by construction.`
        ] }
      ] },
      { id: `cash-impl`, title: `Implementation: planning the notes`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>The normal path: the largest-note cassette takes as many notes as fit and its count allows, and passes the rest down; the last link either finishes at zero or reports failure. The back-off only runs when a link downstream fails. Before coding, compare greedy and back-off on a few amounts (these were run through a small port of the code below).</p>` },
        { type: `table`, title: `Greedy vs the backing-off chain`, headers: [`Amount`, `Notes loaded`, `Greedy`, `Backing-off chain`], rows: [
          [`Rs 600`, `500 x 10, 200 x 10`, `500, then Rs 100 left: fails`, `200 x 3`],
          [`Rs 800`, `500 x 1, 200 x 10`, `500 + 200, then Rs 100 left: fails`, `200 x 4`],
          [`Rs 2600`, `2000 x 1, 500 x 1, 200 x 5`, `2000 + 500, then Rs 100 left: fails`, `2000 + 200 x 3`],
          [`Rs 1100`, `500 x 4, 200 x 5`, `500 x 2, then Rs 100 left: fails`, `500 + 200 x 3`],
          [`Rs 300`, `500 x 4, 200 x 5`, `200, then Rs 100 left: fails`, `Fails too: correctly declined before the bank is called`]
        ] },
        { type: `text`, html: `<p>Is the search ever slow? With 50 notes in each of the Rs 2000, 500 and 200 cassettes and no Rs 100 notes, the worst amount up to Rs 10,000 needs 10 link calls (Rs 2,300), and only Rs 100 and Rs 300 are impossible. Four links and a Rs 10,000 cap keep it tiny.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `Amount reachable only by skipping a large note: the link backs off to fewer notes.`,
          `Amount unreachable with the loaded notes: return empty, and the withdrawal is declined before the bank is called.`,
          `A failed search must leave no partial plan behind: a link writes to the plan only on its successful path.`,
          `Empty cassettes: a count of zero simply means the link takes none.`,
          `<code>take</code> with a stale plan: check every cassette first, then remove, so a removal is never partial.`,
          `A refill for a note the machine has no cassette for: reject it.`
        ] },
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
                if (use > 0) plan.put(note, use);            // only the successful path writes
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
        { type: `callout`, tone: `interview`, html: `<p>If time is short, write the greedy chain first, then name its gap yourself: "This declines Rs 600 when only 500s and 200s are loaded; letting each link back off fixes it without changing the chain's shape." The fix is three lines: the loop over <code>use</code> and the plan write moved inside the success branch.</p>` }
      ] },
      { id: `atm-impl`, title: `Implementation: the Atm and the withdrawal`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>The customer methods delegate to the current state; the operator methods change cash or state directly. The interesting method is <code>runWithdrawal</code>, which touches two systems that cannot share a transaction: the bank's ledger and the notes in the machine. Compare three orderings on one example: Rs 1,000 requested, the bank approves, and the dispenser jams.</p>` },
        { type: `compare`, items: [
          { title: `Weak: dispense, then debit`, tone: `bad`, html: `<p>The jam is harmless here, but in the common failure (the debit is declined or times out after the notes are out) the bank has handed over cash it cannot get back. There is no compensating action for money already in a customer's hand.</p>` },
          { title: `Good: debit, then dispense`, tone: `warn`, html: `<p>On the jam, reverse the debit with the same key: the worst case is a credit moments later. But if the machine discovers only after debiting that it can't make the amount from its notes, every such case needs a reversal too, and that is the most common decline.</p>` },
          { title: `Strong: plan, debit, dispense`, tone: `ok`, html: `<p>Validate and plan the notes first, reading counts only; debit; remove the planned notes; dispense; reverse only if the hardware faults. Everything before the debit only reads, and everything after it has a compensating action. That property, not a distributed transaction, is what makes it all or nothing.</p>` }
        ] },
        { type: `list`, title: `Edge cases in a withdrawal`, items: [
          `Amount zero, negative, not a multiple of Rs 100, or above Rs 10,000: decline before planning.`,
          `Notes can't make the amount: decline before calling the bank.`,
          `The bank declines (insufficient funds, daily limit): decline; no notes were removed.`,
          `The dispenser jams after the debit: reverse with the same key, return the card, go OutOfService(FAULT), journal REVERSED. The jammed notes sit in the reject bin, so they are not added back to the counts.`,
          `Cash runs low after a withdrawal: the session carries on; ending it moves the machine to OutOfService(OUT_OF_CASH).`,
          `A refill arrives mid-withdrawal: it waits for the lock and runs between two customer actions, never between the plan and the take.`
        ] },
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

    Atm(String id, BankService bank, CashHardware hardware) {
        this.id = Objects.requireNonNull(id);
        this.bank = Objects.requireNonNull(bank);
        this.hardware = Objects.requireNonNull(hardware);
    }

    // Customer actions: delegate to the current state.
    synchronized void insertCard(Card card)        { state.insertCard(this, Objects.requireNonNull(card)); }
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
        { type: `callout`, tone: `warning`, title: `Where thread safety lives`, html: `<p>The customer and the operator share the session state, the cassette counts and the journal, so every public <code>Atm</code> method is <code>synchronized</code> on one monitor: a refill that arrives mid-withdrawal waits, then runs whole, and can never land between the plan and the take. The state records are immutable, and <code>CashDispenser</code> is deliberately unsynchronized because it is only touched under that monitor. Balances never live here: the bank makes each debit atomic per account, which is the only thing that can stop two ATMs overdrawing one account.</p>` },
        { type: `callout`, tone: `tip`, title: `Holding the lock across the bank call`, html: `<p>It is a single-customer machine, so the only thing that waits is an operator action, for a bank call with a timeout of a few seconds. The lock order is always ATM then account, and the bank never calls back into an ATM, so no deadlock cycle can form. The Deep Dives show the variant that releases the lock during the call.</p>` },
        { type: `text`, html: `<p>The <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/atm" target="_blank" rel="noopener">awesome-low-level-design ATM solution</a> has the same skeleton: Idle, has-card and authenticated states, and a Chain of Responsibility of note dispensers with a debit that is undone if dispensing fails. The code here is written independently and changes several things: the ATM is constructed with its bank and hardware instead of being a lazily created Singleton (whose unsynchronized <code>getInstance</code> can build two instances); the card holds no PIN; money is a <code>long</code> in paise rather than a <code>double</code>; the chain backs off instead of greedily declining Rs 600; one plan is made and then committed, instead of a <code>canDispense</code> check followed by a separate dispense pass; the debit's result is checked and carries an idempotency key; and the session data lives in the state records rather than in fields on the ATM. Deposits are left out because no requirement needs them; they are a follow-up in the Deep Dives.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk a concrete session through the code, call by call, before the interviewer does. The account holds Rs 5,000 and its PIN is 4321; the card ends in 3456. The machine starts empty and out of service. Transaction keys are UUIDs in the code; here they are t1 to t5. This trace was produced by a small port of the code above.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `call                    result                                state after               cassettes 500 / 200
new Atm(...)            -                                     OutOfService(OUT_OF_CASH)  0 / 0
refill(500 * RS, 10)    ok                                    Idle                      10 / 0
refill(200 * RS, 10)    ok                                    Idle                      10 / 10
insertCard(card)        ok                                    CardInserted(card, 0)
enterPin("1111")        bank says WRONG_PIN: WRONG_PIN        CardInserted(card, 1)
enterPin("4321")        bank says OK: OK                      Authenticated(card)
balance()               Rs 5,000                              Authenticated(card)

withdraw(600 * RS)      key t1
  plan                  500 link tries 1 note: Rs 100 left; the 200 link takes none,
                        the 100 link is empty: fail. 500 link backs off to 0;
                        200 link takes 3. plan = {200: 3}
  bank.debit(t1)        OK, balance Rs 4,400
  take, dispense        COMPLETED                             Authenticated(card)       10 / 7

withdraw(250 * RS)      DECLINED: not a multiple of Rs 100 (bank not called)
withdraw(100 * RS)      DECLINED: no loaded note makes Rs 100 (bank not called)
withdraw(6000 * RS)     plan = {500: 10, 200: 5}
  bank.debit(t4)        INSUFFICIENT_FUNDS: DECLINED, nothing taken                     10 / 7

withdraw(1000 * RS)     plan = {500: 2}
  bank.debit(t5)        OK, balance Rs 3,400
  take                  two Rs 500 notes leave the cassette                             8 / 7
  dispense              DispenseException (jam)
  bank.reverse(t5)      balance back to Rs 4,400; card returned
                        REVERSED                              OutOfService(FAULT)

insertCard(card)        IllegalStateException: Cannot insert a card while OutOfService
restore()               Rs 5,400 left, at least Rs 100: ok    Idle

journal()               t1 COMPLETED 600, t2 DECLINED 250, t3 DECLINED 100,
                        t4 DECLINED 6000, t5 REVERSED 1000, all for XXXX3456` },
        { type: `keypoints`, items: [
          `Rs 600 needed the back-off: greedy would have declined it with plenty of Rs 200 notes in the machine.`,
          `Three declines changed nothing: two were stopped before the bank, and the bank's decline came before any note was removed.`,
          `After the jam the customer's balance is where it started, the two jammed notes are out of the counts (they are in the reject bin), and the journal says REVERSED with the key the bank used, so reconciliation can match all three.`,
          `The wrong PIN created a new <code>CardInserted(card, 1)</code> record rather than changing a counter, and the count vanished when the session moved on.`
        ] }
      ] }
    ],
    levels: levels(
      [`Clear session states (an enum is fine at first) with insert, PIN, balance, withdraw and eject, and invalid actions rejected.`, `The bank behind an interface, with the balance checked there rather than in the ATM.`, `A dispense chain over the denominations that respects how many notes each cassette holds, and amount validation (multiples of Rs 100, the per-transaction cap).`, `Money as integer paise, not a double.`],
      [`The State pattern with immutable records and a reason it beats an enum here: per-session data that must not leak between customers.`, `Inventory-aware planning that backs off, with the greedy counter-example (Rs 600 from 500s and 200s), and planning kept separate from removing notes.`, `Plan, debit, dispense, with a reversal on a jam and an idempotency key on the debit; can explain why the opposite order loses money.`, `One lock per ATM, with a clear account of what it protects and what it cannot (the account balance).`],
      [`Asks who owns the money before designing anything, and separates the machine's shared state from the account's.`, `Bank-side atomicity (a per-account lock or a conditional update) and unknown outcomes after timeouts: retries with the same key, queued reversals, tombstones and reconciliation against the reject bin.`, `Knows when to release the ATM lock during the bank call and what that costs: a real Dispensing state and reserved notes.`, `Security without prompting: bank-wide PIN attempt counts, encrypted PIN blocks, masked card numbers in every log, inactivity timeouts; and says where follow-ups such as deposits land.`]
    ),
    concepts: [
      { term: `State pattern for the session`, def: `The ATM hands each customer action to its current state object, which decides what the action means and which state comes next.`, why: `Twenty action and state combinations stay organised, and every invalid action gets one clear rejection.` },
      { term: `Immutable state records`, def: `Each state is a record holding only its own data (the card, the wrong-PIN count); a transition replaces the reference under the ATM's lock.`, why: `Nothing to reset when a session ends, and nothing to synchronise inside a state.` },
      { term: `Chain of Responsibility over cassettes`, def: `Cassettes are linked from the largest note down; each handles its own denomination and passes the remainder on.`, why: `Adding or retiring a denomination is one link, and no method hard-codes the list.` },
      { term: `Inventory-aware back-off`, def: `A link tries the most notes it can use, then one fewer each time the rest of the chain cannot finish.`, why: `Greedy declines Rs 600 when only 500s and 200s are loaded; the back-off finds 3 x Rs 200.`, ex: `Rs 2,600 from 1 x 2000, 1 x 500 and 5 x 200: greedy is stuck at Rs 100; the chain finds 2000 + 200 + 200 + 200.` },
      { term: `Plan, then commit`, def: `Compute the whole note plan without touching counts; remove notes only after the bank approves.`, why: `A decline at any step leaves the cassettes exactly as they were.` },
      { term: `Debit before dispense, reverse on fault`, def: `The bank is debited first; if the dispenser jams, a compensating reversal with the same key undoes the debit.`, why: `A debit can be undone; cash already handed out cannot.` },
      { term: `Idempotency key`, def: `Every debit carries the transaction id; the bank stores the outcome per key and returns it on a repeat.`, why: `Retrying after a timeout can never debit twice, and a reversal can name exactly which debit to undo.` },
      { term: `Atomic debit at the bank`, def: `The balance check, the daily-limit check and the debit happen under one per-account lock, or as one conditional database update.`, why: `ATM locks only protect one machine; one account used from two ATMs at once can't be overdrawn only because the bank checks and debits in one step.` }
    ],
    interview: [
      { q: `Who owns the balance, and why does that shape the design?`, a: `The bank. The ATM never stores a balance or a PIN; it asks through a BankService. That splits the rules: the ATM checks local facts (multiple of Rs 100, per-transaction cap, notes available), and the bank checks anything that depends on every channel the customer used today (balance, daily limit, PIN attempts across machines), atomically with the debit. It also means a withdrawal spans two systems with no shared transaction, so the order of steps carries the correctness.`, diff: `easy` },
      { q: `Why the State pattern rather than an enum and switch statements?`, a: `Five customer actions times four states is twenty decisions, and two states carry data: the card and the wrong-PIN count. With an enum, every method switches on the status, and the card and counter sit in loose fields that each exit path must reset; miss one and the next customer inherits someone else's strikes. With state records, each state's rules sit together, its data travels inside it and disappears on transition, and a new state such as Dispensing is a new record. For two states with no data I'd use an enum.`, diff: `medium` },
      { q: `Why can a greedy dispense chain fail, and how do you fix it?`, a: `A large note taken early can leave a remainder that the smaller cassettes can't make. With only 500s and 200s loaded, greedy takes a 500 for Rs 600 and is stuck with Rs 100, although three 200s work. Each link tries the most notes first and, if the rest of the chain fails, retries with one fewer. It still finds the greedy answer in one pass when that works and searches only when it must; with four links and a Rs 10,000 cap the search is a handful of calls. The plan reads counts only and notes are removed later.`, diff: `medium` },
      { q: `In what order do you debit the account and dispense the cash?`, a: `Validate, plan the notes, debit the bank, remove the notes, dispense. Planning before the debit means a customer is never charged for an amount the machine can't pay. Debiting before dispensing matters because a debit can be reversed but cash handed out can't be recalled. If the dispenser faults, reverse the debit with the same key, journal REVERSED, return the card and go out of service. Dispensing first and debiting after would turn a failed debit into free money.`, diff: `hard` },
      { q: `The same account withdraws at two ATMs at the same moment. What stops an overdraft?`, a: `Not the ATM locks: each one only protects its own machine. The bank makes check-and-debit one atomic step per account, under a per-account lock or as a conditional UPDATE ... WHERE balance >= amount. Both requests reach the bank; one passes the balance and daily-limit checks and debits, and the other sees the reduced balance and gets INSUFFICIENT_FUNDS. Different accounts never contend.`, diff: `medium` },
      { q: `The bank call times out during a debit. What do you do?`, a: `The outcome is unknown: the bank may have debited. Retry with the same idempotency key, so the bank returns the stored result instead of debiting again. If retries run out, dispense nothing, tell the customer, and queue a reversal with that key. The bank applies the reversal once, or, if the debit never arrived, stores a tombstone so a late debit with that key is refused. Reconciliation against the bank's ledger catches anything left over.`, diff: `hard` },
      { q: `Why not make the ATM a Singleton?`, a: `Nothing in the requirements says there is only one, and a bank runs thousands; a simulation or test wants several in one process, each with a fake bank and a dispenser that jams on demand. A lazily created Singleton with an unsynchronized getInstance can also build two instances under concurrency. Constructing the Atm with its BankService and CashHardware makes the dependencies explicit and testable.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `ATM in one screen`, type: `code`, lang: `java`, body: `sealed interface AtmState permits Idle, CardInserted, Authenticated, OutOfService {
    // insertCard, enterPin, balance, withdraw, ejectCard: reject by default
}
record CardInserted(Card card, int wrongPins) implements AtmState {}   // 3rd wrong PIN or BLOCKED: retain
record Authenticated(Card card) implements AtmState {}                 // balance, withdraw, eject

final class Cassette {                       // chain link, largest note first
    boolean plan(long amount, Map<Long, Integer> plan);   // most notes first, back off on failure
}
final class CashDispenser { Optional<Map<Long, Integer>> plan(long amount); void take(Map<Long, Integer> plan); }

final class Atm {                            // every public method synchronized: state, cash, journal
    Transaction runWithdrawal(Card card, long amount) {
        // validate, plan (reads only), bank.debit(key), take notes, dispense
        // dispense fails: bank.reverse(key), return card, OutOfService(FAULT)
    }
}
interface BankService {                      // owns balances and PINs
    AuthResult verifyPin(String card, String pin);
    DebitResult debit(String card, long amount, String key);   // atomic per account, idempotent
    void reverse(String card, String key);
}` },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Cash deposits`, `One default method on AtmState that Authenticated overrides, a credit on BankService, a note acceptor on CashHardware (Deep Dives)`],
        [`Fewest notes, or the customer picks the mix`, `A NotePlanner strategy behind CashDispenser.plan (Deep Dives)`],
        [`The bank call times out`, `Retry with the same key, then queue a reversal (Deep Dives)`],
        [`Two ATMs, one account`, `Only the bank: a per-account lock or conditional update (Deep Dives)`],
        [`Refills during a slow bank call`, `A Dispensing state and reserved notes; the lock is released for the call (Deep Dives)`],
        [`Customer walks away`, `An inactivity check on the Atm; retracted cash reverses the debit (Deep Dives)`],
        [`A new denomination`, `One more Cassette in the chain`]
      ] }
    ],
    labs: []
  });
})();
