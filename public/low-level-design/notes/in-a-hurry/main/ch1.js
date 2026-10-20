// Main tab: Chapter 1, Introduction to LLD interviews. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch1 = [
  {
    id: "the-job",
    title: "What you are actually being asked to do",
    kicker: "Mental model",
    blocks: [
      { type: "text", html: `<p>A low-level design round gives you a one-line prompt, such as "design a vending machine" or "design a rate limiter", and about 45 minutes. By the end, the interviewer wants to have watched you produce three things: a short scope you both agree on, a handful of classes that each own their data and rules, and working code for the operations that matter most. Everything else, including design patterns and SOLID, only matters when it makes one of those three outputs better.</p><p>Picture yourself leading a small design review that ends with a pull request. You ask the questions a sensible teammate would ask, sketch the shape of the code, then write its core while explaining each choice. There is no hidden trick to spot. The interviewer is judging how you think about structure, not whether you remember a model answer.</p>` },
      { type: "keypoints", title: "Three outputs to aim for", items: [
        "<strong>A written scope:</strong> the features you will build, the rules that constrain them, and what you are deliberately leaving out.",
        "<strong>A small model:</strong> roughly five to eight classes with clear names, private state, and methods that enforce their own rules.",
        "<strong>Running core logic:</strong> the main flow implemented end to end, with the most important failure cases handled."
      ] },
      { type: "callout", tone: "insight", html: `<p>LLD sits between a coding round and a system design round. Unlike a coding round, many designs are acceptable, so your score comes from how you reason. Unlike system design, everything lives in one process: you talk about classes, methods and objects, not services, databases and load balancers.</p>` }
    ]
  },
  {
    id: "how-you-are-scored",
    title: "How the interviewer scores you",
    kicker: "The rubric",
    blocks: [
      { type: "text", html: `<p>Most companies score against five or six signals. You don't need to memorise the list, but you should know what evidence moves each one, because the interviewer can only write down what they see and hear.</p>` },
      { type: "table", headers: ["Signal", "Evidence that scores well", "Evidence that hurts"], rows: [
        ["Scoping", "A few targeted questions, a written feature list, explicit non-goals", "Coding immediately, or ten minutes of open-ended questions"],
        ["Modelling", "Classes that match the problem's real concepts; each rule lives with its data", "One god class, or a manager class that pulls data out of passive objects"],
        ["Design quality", "Private fields, small interfaces, enums for fixed sets, no copied rules", "Public mutable fields, setters for everything, switches on type codes"],
        ["Code quality", "Clear names, short methods, the happy path working before edge cases", "Half-finished methods everywhere and nothing that runs"],
        ["Extensibility", "Showing exactly which class changes for a new requirement", `"We'd refactor it" with no specifics`],
        ["Communication", "Narrating choices, naming trade-offs, checking in between steps", "Long silences, then a finished answer"]
      ] },
      { type: "text", html: `<p>None of these rows says "used design patterns". A pattern helps only when it strengthens a row, for example a Strategy that lets a new pricing rule arrive as one new class. Seniority raises the bar rather than changing the rubric. A junior candidate can pass with some guidance. A senior candidate is expected to drive the steps without prompting, raise edge cases and concurrent users on their own, and justify each trade-off in a sentence.</p>` }
    ]
  },
  {
    id: "one-good-class",
    title: "What a strong class looks like",
    kicker: "Worked example",
    blocks: [
      { type: "text", html: `<p>Take a movie-ticket prompt. A weak answer models a seat as a data holder with a public <code>status</code> field, and puts all the logic in a <code>BookingManager</code> that reads and writes it. A strong answer gives the seat its own rules: only a free seat can be held, only the customer holding it can confirm it, and a hold can be released but a confirmed booking cannot. Because many customers can click the same seat at the same moment, the strong answer also makes those rules hold under concurrent calls.</p>` },
      { type: "code", lang: "java", title: "A seat that enforces its own rules, safely", code: `final class Seat {
    enum Status { FREE, HELD, BOOKED }

    private final String id;
    private Status status = Status.FREE;   // guarded by this
    private String holder;                 // guarded by this

    Seat(String id) { this.id = id; }

    synchronized boolean hold(String customerId) {
        if (status != Status.FREE) return false;
        status = Status.HELD;
        holder = customerId;
        return true;
    }

    synchronized boolean confirm(String customerId) {
        if (status != Status.HELD || !holder.equals(customerId)) return false;
        status = Status.BOOKED;
        return true;
    }

    synchronized void release(String customerId) {
        if (status == Status.HELD && holder.equals(customerId)) {
            status = Status.FREE;
            holder = null;
        }
    }

    String id() { return id; }
}` },
      { type: "keypoints", title: "Why this scores well", items: [
        "<strong>The rule lives with the data.</strong> Nothing outside <code>Seat</code> decides whether a seat can be held, so the rule exists in exactly one place.",
        "<strong>State changes only through domain verbs.</strong> There is no <code>setStatus</code>; callers can hold, confirm or release, and each verb refuses an invalid move.",
        "<strong>It is safe under concurrent use.</strong> <code>status</code> and <code>holder</code> must change together, so every method that reads or writes them is <code>synchronized</code> on the same seat. Two customers racing for one seat can't both see it as free, and a reader never sees a status without its matching holder.",
        "<strong>It is easy to test.</strong> You can check every transition with plain unit tests, with no manager, database or UI involved."
      ] }
    ]
  },
  {
    id: "mistakes-and-phrases",
    title: "Common mistakes, and what to say instead",
    kicker: "Interview",
    blocks: [
      { type: "list", items: [
        "<strong>Coding before the scope is agreed.</strong> Spend the first few minutes on questions that change the design, and write the answers where the interviewer can see them.",
        "<strong>Reaching for patterns to look senior.</strong> Add a pattern only when you can name the problem it solves in this design. Otherwise, mention it as a possible extension.",
        "<strong>Modelling data without behaviour.</strong> If a class has only getters and setters, its rules have leaked somewhere else. Move them back.",
        "<strong>Running out of time with nothing working.</strong> Get one flow running end to end before you polish class diagrams or handle rare cases.",
        "<strong>Ignoring concurrent users.</strong> Ask early whether several users can act at once. If they can, name the operation that has to be atomic and say how you will protect it.",
        "<strong>Going quiet.</strong> The interviewer scores your reasoning, and silent reasoning earns nothing. Say what you are weighing and why you chose."
      ] },
      { type: "callout", tone: "interview", title: "Sentences worth having ready", html: `<p><em>"Before I design anything, let me confirm what's in scope and what we're leaving out."</em></p><p><em>"Pricing has one rule today, so I'll keep it as a method. If a second rule shows up, I'd extract a pricing interface and this is the only class that would change."</em></p><p><em>"Two customers can pick the same seat at once, so holding a seat has to be atomic. I'll let the seat guard its own state."</em></p>` }
    ]
  }
];
