// Deep dive: Chapter 1, Introduction to LLD interviews. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>"Design a parking lot." The prompt is one line, the interview is 45 minutes, and there is no single right answer. Low-level design interviews feel vague because they test judgment rather than recall: can you turn a fuzzy problem into a small set of well-shaped classes and working code, explaining your choices as you go? This chapter explains what the interview is, what is scored, and the most common ways good engineers lose points.</p>`,
  sections: [
    {
      id: "what-it-is",
      title: "What a low-level design interview is",
      kicker: "The format",
      blocks: [
        { type: "text", html: `<p>You get a small, self-contained system: a parking lot, an elevator, a vending machine, a chess game, a rate limiter. You clarify what it must do, decide which classes exist and how they relate, define their state and methods, and implement the important operations. Depending on the company you'll draw a class diagram, write pseudo-code, or write real code in an editor, sometimes with tests.</p>` },
        { type: "table", title: "Three interviews, three units of design", headers: ["", "Coding (DSA)", "Low-level design", "System design"], rows: [
          ["You design", "A function", "Classes inside one program", "Services, stores and their connections"],
          ["Right answers", "Usually one optimal algorithm", "Many good designs", "Many good architectures"],
          ["Judged on", "Correctness, complexity", "Modelling, clarity, extensibility, code quality", "Scale, reliability, trade-offs"],
          ["You produce", "Working code", "Classes, interfaces and core code", "Diagram and discussion"]
        ] },
        { type: "callout", tone: "warning", html: `<p>Don't bring system design into an LLD round. Databases, load balancers and microservices are almost never what the interviewer wants here; they want to see how you structure code.</p>` }
      ]
    },
    {
      id: "what-is-scored",
      title: "What the interviewer is scoring",
      kicker: "The signals",
      blocks: [
        { type: "list", items: [
          "<strong>Requirements:</strong> do you clarify scope, ask the questions that change the design, and state what's out of scope?",
          "<strong>Modelling:</strong> are the classes the natural concepts of the problem, with clear ownership of data?",
          "<strong>Design quality:</strong> encapsulated state, focused classes, small interfaces, no duplicated rules, sensible relationships.",
          "<strong>Code quality:</strong> readable names, short methods, correct core logic, important edge cases handled.",
          "<strong>Extensibility:</strong> can you show where a new requirement lands without rewriting?",
          "<strong>Communication:</strong> do you explain choices, trade-offs and what you are deferring?"
        ] },
        { type: "callout", tone: "insight", html: `<p>Notice what's missing: memorising patterns or SOLID definitions. Interviewers care that you <em>apply</em> the ideas. Use a principle's name briefly when it helps explain a choice, not as a recitation.</p>` }
      ]
    },
    {
      id: "good-vs-weak",
      title: "A weak answer and a strong one",
      kicker: "The contrast",
      blocks: [
        { type: "compare", items: [
          { title: "Weak", tone: "bad", html: `<p>Starts coding immediately. One <code>ParkingSystem</code> class with lists of everything and public fields. Vehicle types as strings compared in <code>if</code> chains. A factory, a singleton and an observer added "for good design". Out of time before unparking works. No answer to "two cars arrive at once".</p>` },
          { title: "Strong", tone: "ok", html: `<p>Five minutes of questions, a written scope. A short list of entities: <code>ParkingLot</code>, <code>Floor</code>, <code>Spot</code>, <code>Vehicle</code>, <code>Ticket</code>. Enums for sizes. Each rule in the class that owns the data. Park and unpark work end to end. A pricing interface introduced because two pricing rules were mentioned. A sentence on making spot assignment atomic.</p>` }
        ] },
        { type: "code", lang: "java", title: "The difference in one class", code: `// Weak: data bag, rules live somewhere else
class Spot {
    public String size;          // "small", "medium"...
    public Vehicle vehicle;      // anyone can overwrite
}

// Strong: the spot owns its rules
final class Spot {
    private final String id;
    private final SpotSize size;
    private Vehicle occupant;

    Spot(String id, SpotSize size) { this.id = id; this.size = size; }

    boolean fits(Vehicle v) { return occupant == null && v.size().fitsIn(size); }

    void assign(Vehicle v) {
        if (!fits(v)) throw new IllegalStateException("spot " + id + " can't take " + v);
        occupant = v;
    }

    Vehicle release() { Vehicle v = occupant; occupant = null; return v; }
}` }
      ]
    },
    {
      id: "pitfalls",
      title: "The two classic failure modes",
      kicker: "What goes wrong",
      blocks: [
        { type: "compare", items: [
          { title: "Over-engineering", tone: "warn", html: `<p>Interfaces with one implementation, factories that create one class, abstract base classes for two types, patterns chosen before problems. It burns time and suggests you can't tell when complexity is warranted.</p><p><strong>Fix:</strong> tie every abstraction to a requirement or a clearly likely change, and say which.</p>` },
          { title: "Under-engineering", tone: "warn", html: `<p>A god class, public mutable fields, type codes with switch statements everywhere, the same rule copied in three places. It works for the demo and collapses at the first follow-up.</p><p><strong>Fix:</strong> give each class one job, keep state private behind meaningful methods, and use polymorphism where variants exist.</p>` }
        ] },
        { type: "callout", tone: "interview", html: `<p>When you're unsure whether to add structure, say both options in a sentence and pick one: "Pricing could be a strategy, but there's only one rule so far, so I'll keep it as a method on <code>Ticket</code> and extract an interface if a second rule appears." That sentence scores better than either choice made silently.</p>` }
      ]
    },
    {
      id: "levels-and-prep",
      title: "Expectations by level, and how to prepare",
      kicker: "Calibrating",
      blocks: [
        { type: "table", headers: ["Level", "Expected to"], rows: [
          ["Junior / new grad", "Produce a working, reasonably structured design; take hints well; write clean core code"],
          ["Mid-level", "Drive most of the process; good class boundaries; handle main edge cases; discuss one or two extensions"],
          ["Senior and above", "Scope fast and precisely; make and justify trade-offs; bring up concurrency and failure cases unprompted; show how the design absorbs change"]
        ] },
        { type: "steps", title: "A preparation plan", items: [
          "Learn the delivery framework (next chapter) until it is automatic.",
          "Refresh design principles and OOP concepts: know what problem each one solves.",
          "Learn the handful of patterns that recur: Strategy, State, Observer, Factory, Builder, Decorator, Composite, Command.",
          "Practise classic problems end to end, on a timer, in the language you'll use, out loud.",
          "For each practice problem, write down two extension questions and one concurrency question, and answer them."
        ] },
        { type: "quiz", q: "Ten minutes in, you have a clear scope and five entities. You're tempted to add an abstract factory so new vehicle types are \"easy to add\". The requirements list three fixed vehicle types. What is the best move?", options: [
          "Add the abstract factory: it shows pattern knowledge",
          "Use an enum for the three types, mention that a factory or polymorphic classes could be introduced if types became extensible, and move on",
          "Skip vehicle types entirely",
          "Ask the interviewer whether they like factories"
        ], answer: 1, explain: `<p>Three fixed types fit an enum. Naming the extension point shows you've thought about change without paying for it now (YAGNI and KISS). Pattern knowledge is shown best by knowing when not to use a pattern.</p>` }
      ]
    }
  ],
  takeaways: [
    "An LLD interview tests turning a vague prompt into clean classes and working core code in about 45 minutes.",
    "It is not system design: think objects and methods, not services and databases.",
    "Interviewers score requirements, modelling, design quality, code quality, extensibility and communication.",
    "Put rules in the class that owns the data; avoid public mutable fields and data-bag classes.",
    "Avoid both over-engineering and god classes; justify every abstraction with a requirement.",
    "Senior candidates drive the process, make trade-offs explicit and raise concurrency and change unprompted."
  ],
  furtherReading: [
    { title: "Hello Interview: Low-Level Design introduction", url: "https://www.hellointerview.com/learn/low-level-design/in-a-hurry/introduction", note: "The page this chapter follows." }
  ]
};
