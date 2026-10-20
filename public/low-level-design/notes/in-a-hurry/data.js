// Low-level design in a hurry - interactive notes data.
// Original study notes with Java examples. Topic outline follows Hello Interview's "Low-Level Design in a Hurry":
// https://www.hellointerview.com/learn/low-level-design/in-a-hurry/introduction
window.DATA = {
  book: {
    title: `Low-Level Design in a Hurry`,
    subtitle: `The essentials for a low-level design interview, in five chapters: what the <strong>interview</strong> tests, a <strong>delivery framework</strong> for the 45 minutes, the <strong>design principles</strong> that guide each decision, the <strong>OOP concepts</strong> you build classes from, and the <strong>design patterns</strong> worth knowing. Every example is Java 21. Topics follow Hello Interview's <a href="https://www.hellointerview.com/learn/low-level-design/in-a-hurry/introduction" target="_blank" rel="noopener" style="color:var(--accent)">Low-Level Design in a Hurry</a>; the notes, examples and labs are written independently.`,
    storageKey: `lld_in_a_hurry_notes_v1`,
    appId: `lld-in-a-hurry-notes`,
    exportPrefix: `lld-in-a-hurry-progress`,
    pillarsTitle: `Four habits of strong LLD answers`,
    takeawaysTitle: `Twenty things to remember`,
    labsIntro: `The labs are small drills: plan your interview clock, spot which principle a snippet breaks, decide between inheritance and composition, and match scenarios to patterns. Your answers aren't saved; labs reset when you leave the tab.`,
    mono: `LH`,
    shortTitle: `LLD in a Hurry`,
    tagline: `LLD interview prep`
  },
  parts: {
    1: `Part I &middot; The Interview`,
    2: `Part II &middot; Principles and OOP`,
    3: `Part III &middot; Patterns`
  },
  fourQuestions: [
    { cls: `what`, q: `Pin down the requirements first`, text: `Spend the first minutes turning a one-line prompt into a short list of features, constraints and explicit non-goals. Every later decision, from which classes exist to which pattern fits, should trace back to that list.`, answer: `Ch 1 (what is assessed), Ch 2 (requirements step).` },
    { cls: `where`, q: `Find the entities and give each one job`, text: `Nouns in the requirements become candidate classes; verbs become methods. Give every class a single clear responsibility and decide who owns which state before you write any method bodies.`, answer: `Ch 2 (entities, class design), Ch 3 (SRP, separation of concerns), Ch 4 (relationships).` },
    { cls: `when`, q: `Start simple, add structure when it pays`, text: `Write the most direct design that meets the requirements. Introduce an interface, a pattern or a hierarchy only when a requirement or a likely change needs it, and say which one.`, answer: `Ch 3 (KISS, YAGNI, OCP), Ch 5 (when each pattern earns its place).` },
    { cls: `how`, q: `Show where change lands`, text: `Close by walking through a new requirement: which class changes, which stay untouched. A design is good when common changes touch one place and don't ripple.`, answer: `Ch 2 (extensibility step), Ch 3 (OCP, DIP), Ch 5 (strategy, observer, state).` }
  ],
  takeaways: [
    `An LLD interview tests how you turn a vague prompt into <strong>clean classes, clear interfaces and working core logic</strong> in about 45 minutes, not how many patterns you can name.`,
    `It differs from system design: one process, one codebase, objects and methods, not services, databases and networks.`,
    `Use a repeatable flow: <strong>requirements</strong>, <strong>entities and relationships</strong>, <strong>class design</strong>, <strong>implementation</strong>, <strong>extensibility</strong>.`,
    `Write requirements down and agree on what is <strong>out of scope</strong>. It protects your time and stops scope creep.`,
    `Nouns become candidate classes, verbs become methods. Drop nouns that are just attributes (a color, a name).`,
    `For each class, list its <strong>state</strong> and its <strong>behaviour</strong>, and make the class that owns the data own the rules about it.`,
    `Implement the core flows end to end before edge cases, and talk through the code as you write it.`,
    `<strong>KISS</strong> is the most violated principle in LLD interviews. Over-engineering costs time and signals poor judgment.`,
    `<strong>DRY</strong> removes duplicated knowledge, not duplicated-looking lines. <strong>YAGNI</strong>: design for extension, build only what is needed.`,
    `<strong>Separation of concerns</strong> and the <strong>Law of Demeter</strong> keep classes from knowing too much about each other.`,
    `<strong>SRP</strong>: one reason to change. <strong>OCP</strong>: add behaviour with new classes, not by editing old ones.`,
    `<strong>LSP</strong>: a subclass must honour its parent's promises. A subclass that throws for an inherited method is a red flag.`,
    `<strong>ISP</strong>: small, focused interfaces. <strong>DIP</strong>: business logic depends on interfaces it defines; implementations are injected.`,
    `The four pillars: <strong>encapsulation</strong> (hide state behind methods), <strong>abstraction</strong> (expose what, hide how), <strong>inheritance</strong>, <strong>polymorphism</strong>.`,
    `<strong>Favour composition over inheritance</strong>. Inherit only for a true, stable is-a relationship.`,
    `Use <strong>enums</strong> for fixed sets of values and states, and <strong>records</strong> for immutable value objects.`,
    `Patterns are names for common solutions. Use one only when you can say what problem it solves in this design.`,
    `The most useful patterns in LLD interviews: <strong>Strategy</strong>, <strong>Observer</strong>, <strong>State</strong>, <strong>Factory</strong>, <strong>Builder</strong>, <strong>Decorator</strong>, <strong>Composite</strong> and <strong>Command</strong>.`,
    `<strong>Singleton</strong> is easy to overuse: it hides dependencies and complicates tests. Prefer one instance created at startup and injected.`,
    `Interviewers reward clear reasoning: name the trade-off, explain the choice briefly, and move on.`
  ],
  chapters: [
    // ------------------------------------------------------------------
    {
      id: `ch1`, part: 1, number: 1,
      source: { title: `Hello Interview: LLD Introduction`, url: `https://www.hellointerview.com/learn/low-level-design/in-a-hurry/introduction` },
      title: `Introduction: what a low-level design interview tests`,
      overview: `A low-level design (LLD) interview asks you to design the classes, interfaces and core logic for a small, self-contained system, such as a parking lot, an elevator controller or a rate limiter, and usually to write real code for the important parts. It sits between a coding interview and a system design interview: there is no algorithm trick to find and no fleet of servers to draw. What's assessed is <strong>judgment</strong>: clarifying a vague prompt, modelling it with sensible objects, writing readable code, and keeping the design easy to change.`,
      concepts: [
        { term: `Low-level design (LLD)`, def: `Designing the inside of one program: classes, their fields and methods, interfaces, relationships and the logic of the main operations.`, why: `It's how most day-to-day engineering decisions are made, which is why companies test it.`, ex: `"Design a parking lot": vehicles, spots, floors, tickets, payments, and the code that parks and unparks a car.` },
        { term: `LLD vs system design (HLD)`, def: `System design is about distributed components: services, databases, caches, queues and how data moves between them. LLD is about objects inside one service: who owns which data and which method enforces which rule.`, why: `Don't bring load balancers into an LLD interview, and don't skip class design in favour of boxes and arrows.` },
        { term: `LLD vs a coding interview`, def: `A coding interview has one right algorithm and is judged on correctness and complexity. An LLD problem has many acceptable designs and is judged on structure, clarity and trade-offs.`, why: `There is rarely a "gotcha"; the risk is a messy design, not a missed trick.` },
        { term: `Common interview formats`, def: `Formats vary: class diagrams and method signatures on a whiteboard, pseudo-code in a shared document, or runnable code in an IDE with tests. Many companies expect working code for the core flows.`, why: `Ask early which one it is. It decides how much time goes to diagrams versus code.` },
        { term: `What interviewers assess`, def: `Requirements gathering, entity modelling, class and interface design, code quality (naming, small methods, encapsulation), handling edge cases, extensibility and communication.`, why: `Every step of the delivery framework in the next chapter maps to one of these signals.` },
        { term: `Classic LLD problems`, def: `Parking lot, elevator, vending machine, movie ticket booking, library, chess or Connect Four, file system, logger, rate limiter, inventory, Amazon locker, splitwise.`, why: `They recur because each exercises a few core ideas: state machines, strategies, hierarchies, concurrency.` },
        { term: `Language choice`, def: `Use the object-oriented language you are fastest in; Java, Python, C++, C#, TypeScript and Go are all common. Java and C# make interfaces and access modifiers explicit, which helps you show intent.`, why: `Fluency matters more than the language. Don't learn a new one for the interview.` },
        { term: `Level expectations`, def: `Juniors are expected to produce a working, reasonably structured design with guidance. Seniors are expected to drive the conversation, make and justify trade-offs, handle edge cases and concurrency unprompted, and anticipate extensions.`, why: `At senior levels, how you decide counts as much as what you produce.` },
        { term: `Over-engineering`, def: `Adding layers, interfaces and patterns the requirements don't need: factories for one class, strategies for one algorithm, deep hierarchies for two types.`, why: `It is the most common way strong engineers fail LLD rounds: it burns time and suggests weak judgment.` },
        { term: `Under-engineering`, def: `One giant class with everything in it, public mutable fields, logic duplicated across methods, or long if/else chains on type codes.`, why: `The opposite failure: it works for the demo but every follow-up requirement means rewriting it.` },
        { term: `Thinking out loud`, def: `Narrating your reasoning: what you're considering, which option you chose and why, what you're deferring.`, why: `Interviewers can only score what they hear. Silent coding hides your best signal.` },
        { term: `Follow-up questions`, def: `"How would you add X?", "What if two users do Y at once?", "How would you test this?" They probe extensibility, concurrency and quality.`, why: `Leave time for them; they are often where seniority is decided.` }
      ],
      cheatsheet: [
        { title: `LLD vs HLD vs coding`, type: `table`, headers: [`Interview`, `Unit of design`, `Judged on`, `Typical output`], rows: [
          [`Coding (DSA)`, `A function`, `Correctness, complexity`, `One working algorithm`],
          [`Low-level design`, `Classes in one program`, `Modelling, clarity, extensibility, code quality`, `Classes, interfaces, core methods in code`],
          [`System design`, `Services and data stores`, `Scalability, reliability, trade-offs`, `Architecture diagram, data flow, estimates`]
        ] },
        { title: `Signals and how to show them`, type: `table`, headers: [`Signal`, `How you show it`], rows: [
          [`Requirements`, `Ask focused questions, write a short feature list, state what's out of scope`],
          [`Modelling`, `Few, well-named classes with clear ownership of data`],
          [`Design quality`, `Encapsulated state, small interfaces, no duplicated rules`],
          [`Code quality`, `Readable names, short methods, handled edge cases`],
          [`Extensibility`, `Show which class changes for a new requirement`],
          [`Communication`, `Explain choices and trade-offs as you go`]
        ] },
        { title: `Red flags interviewers note`, type: `list`, items: [
          `Coding before agreeing on requirements.`,
          `Patterns named before a problem calls for them.`,
          `God classes, public mutable fields, getters and setters for everything.`,
          `Type codes with long if/else or switch chains spread across the code.`,
          `No answer to "what happens if two users do this at once?"`,
          `Running out of time before the core flow works.`
        ] }
      ],
      interview: [
        { q: `How is a low-level design interview different from a system design interview?`, a: `System design is about distributed architecture: services, storage, caching, queues, scaling and failure across machines. Low-level design is about the code inside one component: which classes exist, what state and methods each has, how they relate, and how the main operations are implemented. LLD usually ends with real code; system design with a diagram and trade-off discussion.`, diff: `easy` },
        { q: `What do you do in the first five minutes of an LLD interview?`, a: `Clarify the prompt. Ask who the users are, which core operations must work, what constraints apply (sizes, types, rules), and what's explicitly out of scope. Write the agreed list down where the interviewer can see it. Also confirm the format: diagram only, pseudo-code or runnable code.`, diff: `easy` },
        { q: `The interviewer says "design a vending machine". What questions would you ask?`, a: `Which products and how are they priced? Which payment methods: coins, notes, cards? Does it give change, and what if it can't? Can a user cancel and get a refund? Is there an admin flow for restocking and collecting cash? One machine or a fleet? Do we need to handle concurrent users (probably not for one physical machine)? Then I'd state the scope I'll implement.`, diff: `medium` },
        { q: `How do you avoid over-engineering in an LLD interview?`, a: `Tie every class, interface and pattern to a stated requirement or a very likely change. Start with the simplest structure that works, and when tempted to add a pattern, say what problem it solves here. If I can't name one, I leave it out and mention it as a possible extension.`, diff: `medium` },
        { q: `What separates a senior answer from a mid-level one?`, a: `A senior candidate drives the process without prompting, scopes the problem quickly, makes trade-offs explicit, chooses the simplest adequate design, handles edge cases and concurrency without being asked, and can show precisely where a new requirement would land. Mid-level candidates often produce a working design but need guidance on scope and extensibility.`, diff: `medium` }
      ],
      labs: []
    },
    // ------------------------------------------------------------------
    {
      id: `ch2`, part: 1, number: 2,
      source: { title: `Hello Interview: Delivery Framework`, url: `https://www.hellointerview.com/learn/low-level-design/in-a-hurry/delivery` },
      title: `Delivery framework: a repeatable plan for 45 minutes`,
      overview: `Without a plan, LLD interviews drift: too long on requirements, a rushed class list, and no working code when time runs out. A simple five-step flow keeps you on track and shows the interviewer a structured engineer: <strong>requirements</strong>, <strong>entities and relationships</strong>, <strong>class design</strong>, <strong>implementation</strong> and <strong>extensibility</strong>. Each step produces something visible that the next step builds on, and each maps to a signal the interviewer is scoring.`,
      concepts: [
        { term: `Step 1: Requirements`, def: `Turn the prompt into a short written list of functional requirements (what the system must do), key constraints and rules, and explicit non-goals. Ask a few targeted questions rather than many vague ones.`, why: `Every later decision traces back to this list, and "out of scope" protects your time.`, demo: `timeBudget` },
        { term: `Functional vs non-functional`, def: `Functional: features and rules ("a car parks in the nearest free spot of its size"). Non-functional: qualities such as thread safety, extensibility or performance. In LLD, the non-functional ones that matter most are concurrency and ease of change.`, why: `Asking "do multiple users act at once?" up front sets up the concurrency discussion.` },
        { term: `Out of scope`, def: `Features you agree not to build: payments, persistence, UI, authentication, notifications. Say them out loud and write them down.`, why: `Interviewers respect a clear boundary, and it gives you natural extension topics for the end.` },
        { term: `Step 2: Entities and relationships`, def: `List the core nouns that have identity and behaviour (ParkingLot, Floor, Spot, Vehicle, Ticket), then how they relate: has-a, is-a, one-to-many.`, why: `It is the skeleton of the design and the quickest way to check you and the interviewer see the same system.` },
        { term: `Noun and verb analysis`, def: `Nouns in the requirements become candidate classes; verbs become methods on the class that owns the data the verb needs. Nouns that are just values (a colour, a licence plate string) become fields, not classes.`, why: `A fast, defensible way to get a first class list.` },
        { term: `Step 3: Class design`, def: `For each class, define its state (fields) and behaviour (public methods), choose interfaces and enums, and decide which class enforces each rule. A lightweight class diagram or a list of signatures is enough.`, why: `This is where design principles show: single responsibilities, encapsulated state and small interfaces.` },
        { term: `Ownership of rules`, def: `Put each rule in the class that owns the data it depends on: the Spot decides whether a vehicle fits; the Floor finds a free spot; the Lot picks a floor.`, why: `It avoids "manager" classes that pull data out of others (anaemic models) and keeps changes local.` },
        { term: `Step 4: Implementation`, def: `Write the code for the core flows end to end (for example park and unpark), then add validation and edge cases. Keep methods short, names clear, and narrate as you go.`, why: `Working core code is the strongest signal. A perfect diagram with no code usually isn't enough.` },
        { term: `Happy path first`, def: `Get the main success flow working before error handling, then add the important failures: lot full, invalid ticket, payment declined.`, why: `Guarantees something works if time runs short, and makes the edge cases easy to slot in.` },
        { term: `Step 5: Extensibility`, def: `Walk through likely changes, such as a new vehicle type, a new pricing rule, or a display board, and show which class changes and which stay untouched.`, why: `It demonstrates that the design will survive change, which is the whole point of design.` },
        { term: `Time management`, def: `A typical budget for 45 minutes of design: about 5 for requirements, 5 for entities, 10 for class design, 15 to 20 for implementation, 5 for extensions and questions. Adjust to the format.`, why: `Most candidates fail by running out of time, not by lacking knowledge.`, demo: `timeBudget` },
        { term: `Checkpointing with the interviewer`, def: `At the end of each step, summarise and ask "does this match what you had in mind?" before moving on.`, why: `Cheap course correction; it is far worse to discover a misunderstanding while coding.` }
      ],
      cheatsheet: [
        { title: `The five steps`, type: `table`, headers: [`Step`, `Output`, `Time (45 min)`, `Signal`], rows: [
          [`1. Requirements`, `Written feature list, constraints, out of scope`, `~5 min`, `Scoping, communication`],
          [`2. Entities and relationships`, `Core classes and how they relate`, `~5 min`, `Modelling`],
          [`3. Class design`, `Fields, method signatures, interfaces, enums`, `~10 min`, `Design principles`],
          [`4. Implementation`, `Code for the core flows, then edge cases`, `~15-20 min`, `Code quality, correctness`],
          [`5. Extensibility`, `Where new requirements land`, `~5 min`, `Design for change`]
        ] },
        { title: `Good clarifying questions`, type: `list`, items: [
          `Who are the actors (customer, admin, system) and what can each do?`,
          `What are the core operations that must work?`,
          `What types and sizes exist (vehicles, rooms, products)? Are they fixed or extensible?`,
          `What are the rules (pricing, eligibility, limits)?`,
          `Can several users act at the same time on the same thing?`,
          `What should I leave out: payments, persistence, UI, notifications?`
        ] },
        { title: `A class sketch at the end of step 3`, type: `code`, lang: `java`, body: `enum SpotSize { SMALL, MEDIUM, LARGE }

class ParkingLot  { List<Floor> floors;  Ticket park(Vehicle v);  Money unpark(Ticket t); }
class Floor       { int number; List<Spot> spots;  Optional<Spot> findSpotFor(Vehicle v); }
class Spot        { String id; SpotSize size; Vehicle occupant;  boolean fits(Vehicle v); }
class Ticket      { String id; Spot spot; Vehicle vehicle; Instant entry; }
interface PricingPolicy { Money priceFor(Ticket t, Instant exit); }` }
      ],
      interview: [
        { q: `Walk me through how you'd structure a 45-minute LLD interview.`, a: `Requirements first (about 5 minutes): ask focused questions, write the feature list and what's out of scope. Then entities and relationships (about 5): the core nouns and how they connect. Then class design (about 10): fields, key method signatures, interfaces and enums. Then implementation (15 to 20): code the main flows end to end, then edge cases. Finally extensibility (about 5): show where new requirements would land. I check in with the interviewer at each transition.`, diff: `easy` },
        { q: `How do you decide which nouns become classes?`, a: `A noun becomes a class if it has identity, its own state and behaviour, or rules attached to it (Spot, Ticket, Elevator). Nouns that are just values become fields or enums (colour, size, status). Nouns that only describe the system as a whole (the "system") usually don't need a class unless they coordinate others, like a ParkingLot that owns floors.`, diff: `medium` },
        { q: `The interviewer interrupts during implementation with a new requirement. What do you do?`, a: `Pause, restate the requirement, and decide whether it changes the core model or just adds to it. If the design is sound, show which class changes and make the minimal edit, or note it as an extension if time is short. Don't restart the design; adapting cleanly is the signal being tested.`, diff: `medium` },
        { q: `Why write requirements down instead of keeping them in your head?`, a: `It confirms you and the interviewer agree, prevents scope creep, gives you a checklist for implementation, and makes the out-of-scope items explicit, which become natural discussion points for extensibility at the end.`, diff: `easy` },
        { q: `How do you decide where a business rule lives?`, a: `In the class that owns the data the rule depends on. Whether a vehicle fits a spot depends on the spot's size, so Spot.fits(vehicle) owns it. Picking which spot depends on a floor's spots, so Floor owns it. This keeps rules next to their data, avoids manager classes that reach into other objects, and keeps future changes local.`, diff: `medium` }
      ],
      labs: [`timeBudget`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch3`, part: 2, number: 3,
      source: { title: `Hello Interview: Design Principles`, url: `https://www.hellointerview.com/learn/low-level-design/in-a-hurry/design-principles` },
      title: `Design principles: KISS, DRY, YAGNI, Demeter and SOLID`,
      overview: `Design principles are the reasons behind design decisions. In an interview you face constant small choices (a new class or a method? an interface or a concrete type? inherit or compose?), and principles let you make them quickly and explain them in one sentence. There are two groups: <strong>general principles</strong> (KISS, DRY, YAGNI, separation of concerns, Law of Demeter) that apply to any code, and the <strong>SOLID</strong> principles for designing classes and their relationships. Apply them with judgment: they often pull in different directions, and naming the tension is itself a strong signal.`,
      concepts: [
        { term: `KISS: keep it simple`, def: `Prefer the simplest design that meets the requirements. Add structure only when simplicity stops working: when a class grows too many responsibilities or a change has to be made in many places.`, why: `Over-engineering is the most common LLD interview failure. A plain class that works beats a pattern-laden one that's half done.`, demo: `principleSpotter` },
        { term: `DRY: don't repeat yourself`, def: `Every piece of knowledge (a rule, a formula, a validation) should live in one place. If the same rule appears in several places, extract it.`, why: `When the rule changes, you change it once. But code that only looks alike yet means different things should stay separate, or you couple unrelated features.`, demo: `principleSpotter` },
        { term: `YAGNI: you aren't gonna need it`, def: `Build what the current requirements need, not features you imagine might come. Design so extension is possible; don't implement the extension.`, why: `Speculative features cost time, add code to maintain and are usually not the change that actually arrives.`, demo: `principleSpotter` },
        { term: `Separation of concerns`, def: `Different responsibilities (domain rules, input/output, formatting, persistence) live in different classes that don't depend on each other's internals.`, why: `You can change the UI, the storage or a rule independently, and test each part on its own.`, demo: `principleSpotter` },
        { term: `Law of Demeter`, def: `A method should talk only to its immediate collaborators: its own fields, its parameters and objects it creates. Avoid chains like <code>ride.getDriver().getVehicle().getPlate()</code>.`, why: `Chains couple your code to the internal structure of several classes. Fluent builders that return the same object are fine.`, demo: `principleSpotter` },
        { term: `Tell, don't ask`, def: `Ask an object to do something rather than pulling its data out and deciding for it: <code>account.withdraw(50)</code> instead of checking <code>getBalance()</code> and calling <code>setBalance()</code>.`, why: `Keeps rules next to the data they protect; closely related to encapsulation and Demeter.` },
        { term: `SRP: single responsibility`, def: `A class should have one reason to change: it serves one actor or one concern.`, why: `Classes mixing pricing, persistence and formatting change for three different reasons and break in surprising ways.`, demo: `principleSpotter` },
        { term: `OCP: open/closed`, def: `Classes should be open for extension and closed for modification: add new behaviour by adding new classes behind an interface, not by editing a growing if/else chain.`, why: `New variants (vehicle types, pricing rules) don't risk breaking existing ones. Apply it where variation is expected, not everywhere.`, demo: `principleSpotter` },
        { term: `LSP: Liskov substitution`, def: `Anywhere code uses a base type, any subtype must work without the caller knowing which one it is. Subtypes may add behaviour but must not weaken the parent's promises.`, why: `A subclass that throws <code>UnsupportedOperationException</code> for an inherited method, or forces <code>instanceof</code> checks, means the hierarchy is wrong.`, demo: `principleSpotter` },
        { term: `ISP: interface segregation`, def: `Prefer several small, focused interfaces to one large one, so no class must implement methods it can't support.`, why: `Fat interfaces produce empty or throwing implementations, a sign the abstraction is wrong.`, demo: `principleSpotter` },
        { term: `DIP: dependency inversion`, def: `High-level business logic should depend on abstractions it defines (a <code>PaymentGateway</code> interface), and low-level details (a Stripe client) should implement them. Concrete implementations are passed in, usually through the constructor.`, why: `You can swap implementations and test with fakes without touching the business logic. Dependency injection is the technique; DIP is the principle.`, demo: `principleSpotter` },
        { term: `High cohesion, low coupling`, def: `Cohesion: how closely the parts of one class belong together. Coupling: how much one class depends on another's details. Aim for classes that do one thing well and know little about each other.`, why: `They are the goals that most other principles serve.` },
        { term: `Encapsulate what varies`, def: `Find the parts of the design most likely to change (pricing, matching rules, notification channels) and put them behind an interface, so the stable parts don't change with them.`, why: `The reasoning behind Strategy, State and many other patterns.` },
        { term: `Principles in tension`, def: `DRY can fight KISS (an abstraction to remove two duplicates may cost more than it saves); OCP can fight YAGNI (an interface for one implementation).`, why: `Saying "I'll keep it inline for now and extract it if it appears a third time" shows judgment, which is what interviewers look for.` }
      ],
      cheatsheet: [
        { title: `General principles`, type: `table`, headers: [`Principle`, `In one line`, `Smell it fixes`], rows: [
          [`KISS`, `Simplest design that works`, `Patterns and layers with no requirement behind them`],
          [`DRY`, `One home for each piece of knowledge`, `The same rule copied into several classes`],
          [`YAGNI`, `Build for today's requirements`, `Unused options, hooks and classes`],
          [`Separation of concerns`, `Different jobs in different classes`, `Domain logic mixed with I/O or formatting`],
          [`Law of Demeter`, `Talk to friends, not strangers`, `a.getB().getC().doD() chains`]
        ] },
        { title: `SOLID`, type: `table`, headers: [`Principle`, `In one line`, `Smell it fixes`], rows: [
          [`SRP`, `One reason to change`, `God classes`],
          [`OCP`, `Extend with new classes, not edits`, `Growing if/else or switch on a type code`],
          [`LSP`, `Subtypes keep the parent's promises`, `Overrides that throw, instanceof checks`],
          [`ISP`, `Small, focused interfaces`, `Empty or throwing implementations`],
          [`DIP`, `Depend on abstractions you own`, `new ConcreteService() inside business logic`]
        ] },
        { title: `OCP and DIP together: pluggable pricing`, type: `code`, lang: `java`, body: `interface PricingPolicy { Money price(Ticket ticket, Instant exit); }

final class HourlyPricing implements PricingPolicy { ... }
final class WeekendFlatPricing implements PricingPolicy { ... }

final class ExitGate {
    private final PricingPolicy pricing;               // abstraction, injected
    ExitGate(PricingPolicy pricing) { this.pricing = pricing; }

    Money checkout(Ticket t) { return pricing.price(t, Instant.now()); }
}
// New rule = new class. ExitGate never changes.` }
      ],
      interview: [
        { q: `Which design principle do candidates violate most often in LLD interviews, and why?`, a: `KISS. Candidates want to show pattern knowledge and add factories, strategies and abstract layers that the requirements don't need. It wastes limited time and signals that they can't tell when complexity is justified. The better approach is to start simple and introduce structure when a requirement or a clear likely change calls for it, saying so explicitly.`, diff: `easy` },
        { q: `Explain the Liskov Substitution Principle with an example that violates it.`, a: `Code that uses a base type must work with any subtype. Suppose Account has withdraw(), and FixedDepositAccount extends Account but throws on withdraw() because deposits are locked. Code that loops over accounts and withdraws fees now crashes for one subtype, or needs instanceof checks. The fix is to model capabilities separately: a WithdrawableAccount interface that only accounts allowing withdrawals implement.`, diff: `medium` },
        { q: `What is the difference between dependency inversion and dependency injection?`, a: `Dependency inversion is a principle: business logic depends on an abstraction it defines (an interface shaped by its needs), and low-level details implement that abstraction. Dependency injection is a technique: passing a dependency in, usually via the constructor, instead of creating it inside. Injection is the usual way to achieve inversion, but you can inject concrete classes without inverting anything.`, diff: `medium` },
        { q: `DRY says remove duplication, KISS says keep it simple. What do you do when they conflict?`, a: `Weigh the cost of the abstraction against the cost of the duplication. Two small, similar snippets that might evolve differently can stay duplicated; a business rule repeated in several places should be extracted because it will change together. In an interview I'd say: "I'll keep this inline for now; if it appears a third time I'll pull it into a shared validator."`, diff: `medium` },
        { q: `How does the Open/Closed Principle show up in a parking lot design?`, a: `Fees vary: hourly, flat weekend rates, discounts for members, surcharges for EV charging. Instead of a calculateFee method with a growing switch, define a PricingPolicy interface and one class per rule; the gate or ticket service depends on the interface. Adding a rule means adding a class, and existing pricing code isn't touched. I wouldn't add the interface if the prompt only has one pricing rule and no hint of more.`, diff: `medium` },
        { q: `What does the Law of Demeter say, and is method chaining always a violation?`, a: `A method should only call methods on its own fields, its parameters, objects it creates and itself, not reach through one object to another's internals, as in order.getCustomer().getAddress().getCity(). That couples the caller to three classes' structure. Fluent APIs that return the same object (builders, streams) aren't violations because they don't expose internal structure.`, diff: `easy` }
      ],
      labs: [`principleSpotter`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch4`, part: 2, number: 4,
      source: { title: `Hello Interview: OOP Concepts`, url: `https://www.hellointerview.com/learn/low-level-design/in-a-hurry/oop-concepts` },
      title: `OOP concepts: the building blocks of a class design`,
      overview: `Object-oriented design is the language most LLD interviews are conducted in. You need the four pillars (<strong>encapsulation</strong>, <strong>abstraction</strong>, <strong>inheritance</strong> and <strong>polymorphism</strong>) at the level of "when do I use this and what goes wrong if I misuse it", plus the practical tools around them: <strong>interfaces vs abstract classes</strong>, <strong>composition over inheritance</strong>, the kinds of <strong>relationships</strong> between classes, <strong>enums</strong> for fixed sets and states, and <strong>value objects</strong> with proper equality.`,
      concepts: [
        { term: `Class and object`, def: `A class defines state (fields) and behaviour (methods); an object is one instance with its own state. Identity (which object) is distinct from equality (same value).`, why: `Most LLD modelling is deciding which concepts deserve their own class.` },
        { term: `Encapsulation`, def: `Keep fields private and expose behaviour through methods that maintain the object's invariants. Callers can't put the object in an invalid state.`, why: `A <code>Spot</code> with a public <code>occupant</code> field can be double-assigned from anywhere; a <code>Spot.assign(vehicle)</code> method can refuse.` },
        { term: `Getters and setters are not encapsulation`, def: `A private field with a public getter and setter for every field is a public field with extra steps. Expose operations with meaning (<code>deposit</code>, <code>park</code>), not raw state.`, why: `Interviewers notice auto-generated setters everywhere; they signal an anaemic model.` },
        { term: `Abstraction`, def: `Expose what an object does and hide how. An interface or a small public API describes the capability; the implementation details stay private.`, why: `Callers depend on the capability, so the implementation can change freely.` },
        { term: `Inheritance`, def: `A subclass reuses and specialises a superclass (<code>class Truck extends Vehicle</code>). It models an "is-a" relationship and lets subclasses override behaviour.`, why: `Useful for genuinely shared behaviour in a stable hierarchy; harmful when used just to reuse code, because subclasses become tightly coupled to the parent's internals.`, demo: `isAOrHasA` },
        { term: `Polymorphism`, def: `One interface, many implementations: a call like <code>shape.area()</code> or <code>policy.price(ticket)</code> runs the right implementation for the actual object at run time (dynamic dispatch). Overloading (same name, different parameters) is the compile-time variant.`, why: `It replaces <code>switch (type)</code> chains with objects that know their own behaviour, which is the core of OCP.` },
        { term: `Interface vs abstract class`, def: `An interface declares a capability that unrelated classes can implement (a class can implement many). An abstract class shares state and partial implementation among closely related subclasses (a class extends only one). Java interfaces can also have default methods.`, why: `Default to interfaces for roles (<code>Payable</code>, <code>Notifier</code>); use an abstract class when subclasses truly share fields and code.` },
        { term: `Composition over inheritance`, def: `Build behaviour by holding references to other objects ("has-a") instead of extending classes ("is-a"). Swap the parts to change behaviour, even at run time.`, why: `Avoids brittle hierarchies and the explosion of subclasses (ElectricSportsCar, PetrolSportsCar...). An object with an <code>Engine</code> field is more flexible.`, demo: `isAOrHasA` },
        { term: `Association, aggregation, composition`, def: `<strong>Association</strong>: one object uses or knows another. <strong>Aggregation</strong>: a whole holds parts that can exist independently (a Team and its Players). <strong>Composition</strong>: the parts' lifetime is bound to the whole (a Building and its Floors).`, why: `It helps decide who creates and owns objects, and what happens to children when a parent is deleted.`, demo: `isAOrHasA` },
        { term: `Multiplicity`, def: `How many objects are on each side of a relationship: one-to-one, one-to-many, many-to-many.`, why: `A Floor has many Spots; a Spot has at most one Vehicle. Getting these right decides your collection types and lookups.` },
        { term: `Enums with behaviour`, def: `Java enums are full classes: they can have fields, constructors and methods, and each constant can override a method.`, why: `Ideal for fixed sets such as sizes, directions, piece types and statuses, and for simple state machines.` },
        { term: `Value objects and records`, def: `Small immutable objects defined by their values, not identity: <code>Money</code>, <code>Coordinate</code>, <code>DateRange</code>. Java <code>record</code>s give constructor, accessors, <code>equals</code>, <code>hashCode</code> and <code>toString</code> for free.`, why: `They make APIs self-explanatory (<code>Money</code> instead of <code>double</code>) and are safe to share between threads.` },
        { term: `equals and hashCode`, def: `If two objects are equal, they must have the same hash code. Override both together, based on the same fields, or objects misbehave in <code>HashMap</code> and <code>HashSet</code>.`, why: `Entities usually compare by id; value objects by all their fields.` },
        { term: `Access modifiers`, def: `<code>private</code> (this class), package-private (default), <code>protected</code> (package and subclasses), <code>public</code>. Start private and widen only when needed.`, why: `Visibility is how you show intent in code: what's API and what's internal.` },
        { term: `Static vs instance`, def: `Static members belong to the class, shared by all instances; instance members belong to one object.`, why: `Static mutable state is global state: hard to test and shared across threads. Keep statics for constants and pure helper functions.` }
      ],
      cheatsheet: [
        { title: `The four pillars`, type: `table`, headers: [`Pillar`, `Means`, `Misuse looks like`], rows: [
          [`Encapsulation`, `Private state, behaviour-rich methods`, `Public fields, setters for everything`],
          [`Abstraction`, `Expose what, hide how`, `Callers depending on implementation details`],
          [`Inheritance`, `Is-a reuse and specialisation`, `Extending just to reuse code; deep hierarchies`],
          [`Polymorphism`, `One interface, many behaviours`, `switch (type) chains spread through the code`]
        ] },
        { title: `Interface or abstract class?`, type: `table`, headers: [`Question`, `Interface`, `Abstract class`], rows: [
          [`Unrelated classes share a capability?`, `Yes`, `No`],
          [`Need shared fields or constructor logic?`, `No (constants only)`, `Yes`],
          [`Implement / extend more than one?`, `Many`, `One`],
          [`Typical use`, `Roles: Payable, Comparable, Notifier`, `Template with shared code: AbstractVehicle`]
        ] },
        { title: `Relationships at a glance`, type: `table`, headers: [`Relationship`, `Read as`, `Lifetime`, `Example`], rows: [
          [`Inheritance`, `is-a`, `-`, `Car is a Vehicle`],
          [`Realisation`, `can-do`, `-`, `CreditCard implements PaymentMethod`],
          [`Association`, `uses / knows`, `Independent`, `Driver uses a Car`],
          [`Aggregation`, `has-a (shared)`, `Parts outlive the whole`, `Team has Players`],
          [`Composition`, `owns-a`, `Parts die with the whole`, `ParkingLot owns Floors`]
        ] },
        { title: `Enum with behaviour and a value object`, type: `code`, lang: `java`, body: `enum VehicleSize {
    SMALL(1), MEDIUM(2), LARGE(3);
    private final int rank;
    VehicleSize(int rank) { this.rank = rank; }
    boolean fitsIn(VehicleSize spot) { return rank <= spot.rank; }
}

record Money(long cents, Currency currency) {
    Money {
        if (cents < 0) throw new IllegalArgumentException("negative amount");
    }
    Money plus(Money other) {
        if (!currency.equals(other.currency)) throw new IllegalArgumentException("currency mismatch");
        return new Money(cents + other.cents, currency);
    }
}` }
      ],
      interview: [
        { q: `What is encapsulation, and why aren't getters and setters for every field enough?`, a: `Encapsulation means an object controls its own state: fields are private and changes happen only through methods that keep the object valid. A public setter for every field lets any caller put the object into an invalid state, which is the same as a public field. Better to expose meaningful operations, like account.withdraw(amount), which can enforce rules such as no overdraft.`, diff: `easy` },
        { q: `When would you choose an abstract class over an interface?`, a: `When closely related classes share state and implementation, such as common fields and a constructor, plus some shared methods, and they form a true is-a hierarchy. For a capability that unrelated classes can have, or when a class may need several roles, use an interface. In modern Java, default methods cover some sharing in interfaces, but they can't hold instance state.`, diff: `medium` },
        { q: `Explain "favour composition over inheritance" with an example.`, a: `Suppose cars vary by engine (petrol, electric) and body (sedan, SUV). With inheritance you need a subclass per combination, and changing the engine means changing the class. With composition, Car has an Engine and a Body field; you combine them freely, can swap an engine at run time, and each part is tested on its own. Inheritance is still right for a genuine, stable is-a relationship.`, diff: `medium` },
        { q: `What is the difference between aggregation and composition?`, a: `Both are has-a relationships. In aggregation the parts can exist independently of the whole and may be shared: a Department has Employees who exist without it. In composition the parts belong to exactly one whole and live and die with it: a ParkingLot's Floors don't exist without the lot. It affects who creates the parts and what happens on deletion.`, diff: `easy` },
        { q: `How does polymorphism help you follow the Open/Closed Principle?`, a: `Instead of a method that switches on a type code to decide behaviour, each type implements a common interface and the caller just calls the method. Adding a new type means adding a class that implements the interface; the calling code doesn't change. Polymorphism is the mechanism that lets code be closed for modification but open for extension.`, diff: `medium` },
        { q: `Why use a Money value object instead of a double?`, a: `double can't represent many decimal amounts exactly, so rounding errors creep in. A Money type (cents as a long plus a currency) is exact, makes method signatures self-documenting, can enforce rules such as no negative amounts and no mixing currencies, and as an immutable record it is safe to share and compare by value.`, diff: `easy` }
      ],
      labs: [`isAOrHasA`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch5`, part: 3, number: 5,
      source: { title: `Hello Interview: Design Patterns`, url: `https://www.hellointerview.com/learn/low-level-design/in-a-hurry/patterns` },
      title: `Design patterns: the ones worth knowing and when to use them`,
      overview: `Design patterns are named, reusable solutions to recurring design problems. They are useful in interviews as shared vocabulary: saying "a Strategy for pricing" communicates a whole structure in three words. They are harmful when applied for their own sake. This chapter covers the patterns that actually come up in LLD problems, grouped as <strong>creational</strong> (how objects are made: Factory, Builder, Singleton), <strong>structural</strong> (how objects are composed: Adapter, Decorator, Facade, Composite) and <strong>behavioural</strong> (how objects interact: Strategy, Observer, State, Command, Template Method, Chain of Responsibility, Iterator). For each, the key is knowing the problem it solves.`,
      concepts: [
        { term: `Factory (simple factory / factory method)`, def: `Centralise object creation behind a method that picks the concrete class: <code>VehicleFactory.create(type)</code>. Callers depend on the interface, not on constructors.`, why: `Useful when creation logic is non-trivial or the concrete class depends on input or configuration. Unnecessary for one class created in one place.`, demo: `patternPicker` },
        { term: `Builder`, def: `Construct a complex object step by step with readable named calls, then <code>build()</code> validates and creates an immutable result.`, why: `Fits objects with many optional parameters (a search query, a pizza order, an HTTP request) and avoids long constructors.`, demo: `patternPicker` },
        { term: `Singleton`, def: `Ensure a class has exactly one instance with a global access point.`, why: `Legitimate for truly global resources, but it hides dependencies and makes testing hard. In interviews, prefer "one instance created at startup and passed in", and mention thread-safe initialisation (an enum or holder class) if you use it.`, demo: `patternPicker` },
        { term: `Adapter`, def: `Wrap an existing class so it matches the interface your code expects: <code>StripeAdapter implements PaymentGateway</code>.`, why: `Integrates third-party or legacy APIs without leaking their shape into your domain. Pairs naturally with DIP.`, demo: `patternPicker` },
        { term: `Decorator`, def: `Wrap an object in another that implements the same interface and adds behaviour before or after delegating. Decorators stack.`, why: `Adds optional features (toppings, logging, caching, retries, encryption) without a subclass per combination.`, demo: `patternPicker` },
        { term: `Facade`, def: `A simple front object that hides a complex subsystem behind a few high-level methods.`, why: `Gives clients one entry point (<code>BookingFacade.book(...)</code>) that coordinates seats, payment and notifications.`, demo: `patternPicker` },
        { term: `Composite`, def: `Treat individual objects and groups of objects through the same interface, forming a tree: a <code>Directory</code> and a <code>File</code> both implement <code>FileSystemNode</code>.`, why: `The natural model for file systems, org charts, menus and nested UI components.`, demo: `patternPicker` },
        { term: `Strategy`, def: `Define a family of interchangeable algorithms behind one interface and choose one at run time: pricing rules, spot-assignment rules, elevator scheduling.`, why: `The most used pattern in LLD interviews: it is OCP in practice. It replaces switch statements on an algorithm type.`, demo: `patternPicker` },
        { term: `Observer`, def: `Subjects keep a list of observers and notify them when something happens, without knowing what they do with it.`, why: `Decouples the source of an event from its reactions: a display board updates when spots change; subscribers hear about price drops.`, demo: `patternPicker` },
        { term: `State`, def: `An object delegates behaviour to a state object, and swaps that object when its state changes, instead of switching on a status field in every method.`, why: `Vending machines, elevators, orders and traffic lights have behaviour that depends on state. Small cases are fine with an enum and a switch; State pays off when there are many states and actions.`, demo: `patternPicker` },
        { term: `Command`, def: `Wrap a request as an object with an <code>execute()</code> (and often <code>undo()</code>) method so requests can be queued, logged, retried or undone.`, why: `Undo/redo in editors, queued elevator requests, macro recording and job queues.`, demo: `patternPicker` },
        { term: `Template Method`, def: `A base class defines the skeleton of an algorithm and lets subclasses fill in specific steps.`, why: `Fits fixed processes with variable steps (report generation, a game turn). Strategy is the composition-based alternative and is often more flexible.`, demo: `patternPicker` },
        { term: `Chain of Responsibility`, def: `Pass a request along a chain of handlers; each either handles it or forwards it to the next.`, why: `Approval workflows, request validation and filtering pipelines, logging levels, an ATM dispensing notes by denomination.`, demo: `patternPicker` },
        { term: `Iterator`, def: `Provide sequential access to a collection's elements without exposing its internal structure.`, why: `Built into Java (<code>Iterable</code>, enhanced for), but worth implementing for custom structures such as a game board or a playlist with shuffle.` },
        { term: `When not to use a pattern`, def: `If you can't name the problem the pattern solves in this design, or there is only one variant and no sign of more, leave it out and mention it as an extension point.`, why: `Pattern-dropping without need is a classic over-engineering red flag.` }
      ],
      cheatsheet: [
        { title: `Problem to pattern`, type: `table`, headers: [`If the problem is...`, `Consider`, `LLD example`], rows: [
          [`Several interchangeable algorithms or rules`, `Strategy`, `Pricing, spot assignment, elevator scheduling`],
          [`Behaviour depends heavily on the current state`, `State`, `Vending machine, order lifecycle, elevator`],
          [`Others must react when something changes`, `Observer`, `Display boards, notifications, price alerts`],
          [`Which class to create depends on input`, `Factory`, `Vehicle types, chess pieces, notification channels`],
          [`Object with many optional parts`, `Builder`, `Search filters, orders, configuration`],
          [`Add optional features in any combination`, `Decorator`, `Coffee add-ons, logging, caching`],
          [`Third-party API with the wrong shape`, `Adapter`, `Payment providers, legacy services`],
          [`Hide a complicated subsystem`, `Facade`, `Booking, checkout`],
          [`Part-whole tree treated uniformly`, `Composite`, `File system, menus, org chart`],
          [`Requests to queue, log or undo`, `Command`, `Text editor, job queue, elevator requests`],
          [`A request handled by one of several handlers`, `Chain of Responsibility`, `Approvals, ATM denominations, validation`],
          [`Same process, varying steps`, `Template Method`, `Report export, game turns`]
        ] },
        { title: `Strategy in a few lines`, type: `code`, lang: `java`, body: `interface SpotSelector { Optional<Spot> select(List<Spot> free, Vehicle v); }

final class NearestToEntrance implements SpotSelector { ... }
final class SpreadAcrossFloors implements SpotSelector { ... }

final class ParkingLot {
    private final SpotSelector selector;
    ParkingLot(SpotSelector selector) { this.selector = selector; }
    Ticket park(Vehicle v) {
        Spot spot = selector.select(freeSpotsFor(v), v).orElseThrow(LotFullException::new);
        return issueTicket(spot, v);
    }
}` },
        { title: `Decorator vs inheritance`, type: `code`, lang: `java`, body: `interface Beverage { Money cost(); String describe(); }

record Espresso() implements Beverage {
    public Money cost() { return Money.of(250); }
    public String describe() { return "espresso"; }
}

record WithMilk(Beverage inner) implements Beverage {
    public Money cost() { return inner.cost().plus(Money.of(50)); }
    public String describe() { return inner.describe() + ", milk"; }
}

Beverage order = new WithMilk(new WithMilk(new Espresso()));   // double milk, no new subclass` }
      ],
      interview: [
        { q: `What's the difference between Strategy and State?`, a: `Both delegate behaviour to an interchangeable object. In Strategy, the client chooses the algorithm (a pricing rule) and it usually doesn't change by itself. In State, the object's behaviour changes because its internal state changes, and the states themselves typically trigger the transitions (a vending machine moves from Idle to HasMoney to Dispensing). Strategy answers "how to do X"; State answers "what does X mean right now".`, diff: `medium` },
        { q: `Why is Singleton often considered an anti-pattern, and what would you do instead?`, a: `It is global mutable state in disguise: dependencies are hidden in method bodies instead of visible in constructors, tests can't substitute a fake easily, and tests can interfere with each other through shared state. Instead, create one instance at application startup and inject it where needed. If a true singleton is required, use an enum or a static holder class for thread-safe lazy initialisation.`, diff: `medium` },
        { q: `Which pattern would you use to model a file system with files and directories, and why?`, a: `Composite. Define a FileSystemNode interface with operations like name(), size() and delete(); File implements it directly, Directory implements it by holding child nodes and delegating (size is the sum of children's sizes). Clients treat a single file and a whole subtree the same way, and recursive operations fall out naturally.`, diff: `easy` },
        { q: `When does a Decorator beat subclassing?`, a: `When features are optional and combinable. With subclassing, coffee with milk, with sugar, with milk and sugar, and with double milk each need a class, and the count explodes. Decorators each add one feature by wrapping an object of the same interface, so any combination is built at run time by stacking wrappers. Subclassing is fine when there are few fixed variants.`, diff: `medium` },
        { q: `How would you use Observer in a parking lot, and what are its pitfalls?`, a: `The ParkingLot (subject) notifies registered observers, such as entrance display boards and a monitoring service, whenever a spot is taken or freed; they update their counts without the lot knowing about them. Pitfalls: observers that are never unregistered leak memory, slow observers block the notifier if called synchronously (use an executor or queue), and notification order shouldn't be relied on.`, diff: `medium` },
        { q: `The interviewer asks why you didn't use any design patterns. How do you respond?`, a: `Patterns should solve a problem in the design, not be a goal. I'd point to where variation could appear later, such as pricing rules or notification channels, and explain that I'd introduce a Strategy or Observer there when a second variant appears. If one is clearly needed now, I'd refactor to it and explain the reason. That shows judgment rather than a lack of knowledge.`, diff: `easy` }
      ],
      labs: [`patternPicker`]
    }
  ]
};
