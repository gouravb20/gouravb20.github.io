// Deep dive: Chapter 2, Delivery framework. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>Most LLD interviews aren't lost on knowledge; they're lost on time. Candidates spend fifteen minutes debating requirements, sketch twelve classes, and have nothing running when the interviewer asks about extensions. A fixed plan solves this. This chapter walks through a five-step framework using one running example, an <strong>Amazon-style package locker</strong>, so you can see what each step produces.</p>`,
  sections: [
    {
      id: "the-flow",
      title: "Five steps, each with a visible output",
      kicker: "The plan",
      blocks: [
        { type: "diagram", title: "The delivery framework", caption: "Each step produces something the interviewer can see, and the next step builds on it. Check in briefly at each arrow.", svg: `<svg viewBox="0 0 620 150" role="img" aria-label="Five steps from requirements to extensibility">
<defs><marker id="lh2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="30" width="104" height="60" rx="10" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/><text x="62" y="56" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">Requirements</text><text x="62" y="76" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">~5 min</text>
<rect x="134" y="30" width="104" height="60" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/><text x="186" y="56" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">Entities</text><text x="186" y="76" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">~5 min</text>
<rect x="258" y="30" width="104" height="60" rx="10" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/><text x="310" y="56" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">Class design</text><text x="310" y="76" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">~10 min</text>
<rect x="382" y="30" width="104" height="60" rx="10" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/><text x="434" y="56" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">Implement</text><text x="434" y="76" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">~15-20 min</text>
<rect x="506" y="30" width="104" height="60" rx="10" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2"/><text x="558" y="56" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">Extend</text><text x="558" y="76" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">~5 min</text>
<line x1="114" y1="60" x2="131" y2="60" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lh2-arrow)"/>
<line x1="238" y1="60" x2="255" y2="60" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lh2-arrow)"/>
<line x1="362" y1="60" x2="379" y2="60" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lh2-arrow)"/>
<line x1="486" y1="60" x2="503" y2="60" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lh2-arrow)"/>
<text x="62" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">feature list</text>
<text x="186" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">nouns + links</text>
<text x="310" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">fields, methods</text>
<text x="434" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">working core</text>
<text x="558" y="118" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">where change lands</text>
</svg>` },
        { type: "lab", id: "timeBudget", caption: "Try a plan with a long requirements phase, then one with no extensibility time, and read what each costs you." }
      ]
    },
    {
      id: "requirements",
      title: "Step 1: Requirements",
      kicker: "Scope it",
      blocks: [
        { type: "text", html: `<p>The prompt: "Design a package locker system like Amazon Locker." Ask only questions whose answers change the design, then write the result down.</p>` },
        { type: "table", title: "Questions that change the design", headers: ["Question", "Why it matters"], rows: [
          ["What sizes of locker and package exist?", "Decides size modelling and the fit rule"],
          ["How does a customer open a locker?", "A one-time code means a code generator and validation"],
          ["What happens if a package isn't collected?", "Expiry and return-to-sender flow, maybe a scheduler"],
          ["One locker station or many?", "Whether a station-selection component is needed"],
          ["Can two couriers deposit at the same station at once?", "Whether locker assignment must be thread-safe"]
        ] },
        { type: "code", lang: "text", title: "What goes on the board", code: `Functional
  1. Courier deposits a package: system assigns the smallest free locker that fits.
  2. Customer gets a 6-digit code; entering it opens that locker once.
  3. Uncollected packages expire after 3 days and are flagged for return.
  4. Sizes: SMALL, MEDIUM, LARGE (lockers and packages).

Non-functional
  - Several couriers may deposit at one station concurrently.

Out of scope
  - Payments, notifications delivery, station selection across a city, hardware.` },
        { type: "callout", tone: "tip", html: `<p>The out-of-scope list is as valuable as the feature list. It protects your time now and gives you ready-made extension topics for the end.</p>` }
      ]
    },
    {
      id: "entities",
      title: "Step 2: Entities and relationships",
      kicker: "Model it",
      blocks: [
        { type: "text", html: `<p>Underline the nouns in the requirements: courier, package, locker, size, customer, code, station. Keep the ones with identity and behaviour as classes; turn plain values into fields or enums; drop actors the system doesn't need to model.</p>` },
        { type: "table", headers: ["Noun", "Decision", "Reason"], rows: [
          ["LockerStation", "Class", "Owns lockers, assigns them, validates codes"],
          ["Locker", "Class", "Has identity, a size and an occupancy state"],
          ["Package", "Class (or record)", "Has id and size; what goes in a locker"],
          ["Size", "Enum", "Fixed set of values with a fit rule"],
          ["Code / Assignment", "Class", "Links a code, a locker, a package and an expiry"],
          ["Courier, Customer", "Not modelled", "They are callers of the API, not state we track"]
        ] },
        { type: "list", title: "Relationships", items: [
          "A <code>LockerStation</code> <strong>owns</strong> many <code>Locker</code>s (composition).",
          "A <code>Locker</code> holds <strong>at most one</strong> <code>Package</code> at a time.",
          "An <code>Assignment</code> <strong>references</strong> one locker and one package, plus the code and expiry."
        ] }
      ]
    },
    {
      id: "class-design",
      title: "Step 3: Class design",
      kicker: "Shape it",
      blocks: [
        { type: "text", html: `<p>For each class, write its state and its public behaviour. Put each rule where its data lives: the size enum knows what fits, the locker knows whether it's free, the station chooses a locker and checks codes.</p>` },
        { type: "code", lang: "java", title: "Signatures before bodies", code: `enum Size {
    SMALL, MEDIUM, LARGE;
    boolean fits(Size pkg) { return pkg.ordinal() <= ordinal(); }
}

record Package(String id, Size size) {}

final class Locker {
    private final String id;
    private final Size size;
    private Package content;
    boolean canHold(Package p);
    void store(Package p);
    Package empty();
}

record Assignment(String code, Locker locker, Package pkg, Instant expiresAt) {}

final class LockerStation {
    private final List<Locker> lockers;
    private final Map<String, Assignment> byCode;
    private final CodeGenerator codes;
    private final Clock clock;

    String deposit(Package p);           // returns the pickup code
    Package pickUp(String code);
    List<Assignment> expired();
}` },
        { type: "callout", tone: "insight", html: `<p><code>CodeGenerator</code> and <code>Clock</code> are injected so tests can control codes and time. This is dependency inversion at its most practical, and costs one constructor parameter each.</p>` }
      ]
    },
    {
      id: "implementation",
      title: "Step 4: Implementation",
      kicker: "Build it",
      blocks: [
        { type: "text", html: `<p>Implement the core flows end to end, happy path first, then the important failures. Narrate as you go: what each method guarantees and what it rejects.</p>` },
        { type: "code", lang: "java", title: "The two core flows", code: `final class LockerStation {
    private final List<Locker> lockers;                       // sorted smallest first
    private final Map<String, Assignment> byCode = new HashMap<>();
    private final CodeGenerator codes;
    private final Clock clock;
    private final Duration holdFor = Duration.ofDays(3);

    LockerStation(List<Locker> lockers, CodeGenerator codes, Clock clock) {
        this.lockers = lockers.stream().sorted(Comparator.comparing(Locker::size)).toList();
        this.codes = codes;
        this.clock = clock;
    }

    synchronized String deposit(Package p) {
        Locker locker = lockers.stream()
                .filter(l -> l.canHold(p))
                .findFirst()
                .orElseThrow(() -> new NoLockerAvailableException(p.size()));
        locker.store(p);
        String code = codes.next();
        byCode.put(code, new Assignment(code, locker, p, clock.instant().plus(holdFor)));
        return code;
    }

    synchronized Package pickUp(String code) {
        Assignment a = byCode.remove(code);
        if (a == null) throw new InvalidCodeException();
        if (clock.instant().isAfter(a.expiresAt())) throw new CodeExpiredException();
        return a.locker().empty();
    }
}` },
        { type: "callout", tone: "interview", html: `<p>The requirements said couriers deposit concurrently, so <code>deposit</code> and <code>pickUp</code> are <code>synchronized</code>: choosing a locker and storing the package must be one atomic step. Say so in one sentence; go finer-grained only if asked.</p>` }
      ]
    },
    {
      id: "extensibility",
      title: "Step 5: Extensibility",
      kicker: "Stretch it",
      blocks: [
        { type: "text", html: `<p>Finish by showing how the design absorbs likely changes. For each, name the class that changes and the ones that don't.</p>` },
        { type: "table", headers: ["New requirement", "Change", "Untouched"], rows: [
          ["Extra-large lockers", "Add <code>XLARGE</code> to <code>Size</code>", "Station, Locker, Assignment"],
          ["Choose the locker nearest the screen, not the smallest", "Extract a <code>LockerSelector</code> strategy; inject it", "Deposit and pickup flows"],
          ["Text the code to the customer", "Station publishes a <code>PackageDeposited</code> event; a notifier observes it", "Locker logic"],
          ["Many stations across a city", "A <code>StationDirectory</code> picks a station, then calls its <code>deposit</code>", "Each station's internals"]
        ] },
        { type: "quiz", q: "You're 30 minutes into a 45-minute round. Class design is done, but you haven't written any implementation. What should you do next?", options: [
          "Refine the class diagram until it's perfect",
          "Implement the core flows end to end now, skipping minor edge cases, and keep a few minutes for extensions",
          "Discuss every possible extension first",
          "Start over with a simpler design"
        ], answer: 1, explain: `<p>Working core code is the strongest signal in most LLD rounds. Implement the main flows now, add the most important error cases if time allows, and keep a few minutes for extension questions.</p>` }
      ]
    }
  ],
  takeaways: [
    "Use the same five steps every time: requirements, entities, class design, implementation, extensibility.",
    "Ask only questions that change the design, and write down the scope including what's out.",
    "Nouns with identity and behaviour become classes; plain values become fields or enums.",
    "Write signatures before bodies, and put each rule in the class that owns its data.",
    "Implement the happy path end to end first; then add the important failure cases.",
    "End by showing which class changes for each likely new requirement."
  ],
  furtherReading: [
    { title: "Hello Interview: Delivery framework", url: "https://www.hellointerview.com/learn/low-level-design/in-a-hurry/delivery", note: "The page this chapter follows." }
  ]
};
