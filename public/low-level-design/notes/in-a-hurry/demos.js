// LLD in a hurry labs: an interview time planner and three short drills.
(function () {
  "use strict";
  const { esc, round, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note } = window.LabKit;
  const D = (window.DEMOS = window.DEMOS || {});
  const PAL = [`var(--accent)`, `var(--accent-2)`, `var(--accent-3)`, `#a78bfa`, `#f472b6`];

  // =====================================================================
  // Ch2 - Interview clock planner
  // =====================================================================
  const PHASES = [
    { k: `req`, label: `Requirements`, lo: 0.08, hi: 0.15, def: 5 },
    { k: `ent`, label: `Entities and relationships`, lo: 0.07, hi: 0.15, def: 5 },
    { k: `cls`, label: `Class design`, lo: 0.15, hi: 0.27, def: 10 },
    { k: `imp`, label: `Implementation`, lo: 0.35, hi: 0.55, def: 18 },
    { k: `ext`, label: `Extensibility and follow-ups`, lo: 0.07, hi: 0.18, def: 5 }
  ];
  D.timeBudget = {
    title: `Plan your interview clock`,
    blurb: `Split the design time between the five steps of the delivery framework. The bar shows where each step lands on the clock; each step is checked against a typical share of the time. The ranges are rules of thumb, not rules: a whiteboard-only round needs less implementation time, a runnable-code round needs more.`,
    mount(el) {
      const st = { len: 45, req: 5, ent: 5, cls: 10, imp: 18, ext: 5 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`time for the design problem`, seg(`len`, [[35, `35 min`], [45, `45 min`], [60, `60 min`]], st.len))}</div>
        ${PHASES.map(p => `<div class="ctl-row">${ctl(p.label, rng(p.k, 0, 30, 1, st[p.k]))}</div>`).join(``)}
        <div class="lab-panel"><h4>Your plan on the clock</h4><div data-k="bar"></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const total = PHASES.reduce((s, p) => s + st[p.k], 0), W = 720, scale = (W - 20) / Math.max(st.len, total);
        let x = 10, s = ``;
        PHASES.forEach((p, i) => {
          const w = st[p.k] * scale;
          if (w > 0) s += `<rect x="${x}" y="20" width="${w}" height="34" rx="4" style="fill:${PAL[i]};opacity:.85"/>` + (w > 34 ? `<text x="${x + w / 2}" y="42" text-anchor="middle" style="fill:#fff;font-size:12px;font-weight:700">${st[p.k]}m</text>` : ``);
          x += w;
        });
        const endX = 10 + st.len * scale;
        s += `<line x1="${endX}" x2="${endX}" y1="10" y2="66" style="stroke:var(--bad);stroke-width:2;stroke-dasharray:4 3"/><text x="${endX - 4}" y="80" text-anchor="end" class="svg-label">time's up (${st.len} min)</text>`;
        s += PHASES.map((p, i) => `<rect x="${10 + i * 142}" y="92" width="10" height="10" rx="2" style="fill:${PAL[i]}"/><text x="${24 + i * 142}" y="101" class="svg-label">${p.label.split(` `)[0]}</text>`).join(``);
        q(`bar`).innerHTML = svgWrap(W, 110, s);
        const verdicts = PHASES.map(p => { const share = st[p.k] / st.len; return { p, share, v: share < p.lo ? `low` : share > p.hi ? `high` : `ok` }; });
        q(`stats`).innerHTML = stat(`planned`, `${total} / ${st.len} min`, total > st.len ? `bad` : total < st.len - 5 ? `warn` : `good`) +
          verdicts.map(({ p, share, v }) => stat(`${p.label} (${round(p.lo * st.len, 0)}-${round(p.hi * st.len, 0)} typical)`, `${st[p.k]} min, ${Math.round(share * 100)}%`, v === `ok` ? `good` : `warn`)).join(``);
        const tips = [];
        if (total > st.len) tips.push(`The plan runs ${total - st.len} minutes over. Overruns almost always come out of implementation and extensibility, the two steps that carry the most signal.`);
        verdicts.forEach(({ p, v }) => {
          if (v === `ok`) return;
          if (p.k === `req`) tips.push(v === `low` ? `Very little time for requirements risks building the wrong thing; a few targeted questions pay for themselves.` : `Long requirement gathering eats implementation time. Ask the questions that change the design, write the list, and move on.`);
          if (p.k === `ent`) tips.push(v === `low` ? `Skipping entities makes class design slower; list the core nouns and relationships first.` : `Entities are a sketch, not a diagram to perfect. Keep it quick.`);
          if (p.k === `cls`) tips.push(v === `low` ? `Too little class design and the code becomes the design, which is harder to adjust.` : `A long class design phase often means over-engineering: interfaces and patterns no requirement needs.`);
          if (p.k === `imp`) tips.push(v === `low` ? `Too little implementation time: many rounds expect working core code, and a design with no code is hard to score highly.` : `Lots of implementation time is fine for runnable-code rounds; make sure extensions still get a few minutes.`);
          if (p.k === `ext`) tips.push(v === `low` ? `Leave a few minutes for "how would you add X?". It is where the design's flexibility is tested and often where seniority is judged.` : `Plenty of time for follow-ups; be sure the core flow works first.`);
        });
        q(`note`).innerHTML = note(tips.length ? tips.join(` `) : `A balanced plan: quick scoping, a short model, enough class design to guide the code, the largest block for implementation, and time left for follow-ups. Say the plan out loud at the start so the interviewer knows where you're going.`, total > st.len ? `bad` : tips.length ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, Object.fromEntries(PHASES.map(p => [p.k, v => v + ` min`])), draw);
      draw();
    }
  };

  // =====================================================================
  // Shared quiz drill
  // =====================================================================
  function drill(el, items, opts) {
    const st = { i: 0, score: 0, answered: false, order: items.map((_, i) => i) };
    const shuffle = () => { for (let i = st.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [st.order[i], st.order[j]] = [st.order[j], st.order[i]]; } };
    const draw = () => {
      if (st.i >= items.length) {
        el.innerHTML = `<div class="lab-panel"><h4>Done</h4><div style="font-size:28px;font-weight:800">${st.score} / ${items.length}</div><p class="muted" style="font-size:13px">${st.score === items.length ? `Perfect score.` : st.score >= items.length * 0.7 ? `Solid. Review the ones you missed in the chapter.` : `Worth another pass through the chapter's deep dive, then try again.`}</p><button class="lab-btn" data-act="restart">Try again (new order)</button></div>`;
        return;
      }
      const it = items[st.order[st.i]];
      el.innerHTML = `
        <div class="stat-row">${stat(`question`, `${st.i + 1} / ${items.length}`)}${stat(`score`, st.score, `good`)}</div>
        <div class="lab-panel">
          <h4>${opts.prompt}</h4>
          ${it.text ? `<p style="margin:0 0 10px">${it.text}</p>` : ``}
          ${it.code ? `<pre style="white-space:pre;overflow-x:auto;font-size:12.5px;line-height:1.45;background:var(--bg-3);border:1px solid var(--border);border-radius:8px;padding:10px;margin:0 0 12px"><code>${esc(it.code)}</code></pre>` : ``}
          <div class="ctl-row" style="gap:8px">${opts.choices.map((c, ci) => `<button class="lab-btn ghost" data-choice="${ci}" ${st.answered ? `disabled` : ``} style="${st.answered && ci === it.a ? `border-color:var(--good);color:var(--good)` : st.answered && ci === st.picked && ci !== it.a ? `border-color:var(--bad);color:var(--bad)` : ``}">${c}</button>`).join(``)}</div>
          <div data-k="fb"></div>
        </div>`;
      if (st.answered) {
        const ok = st.picked === it.a;
        el.querySelector(`[data-k="fb"]`).innerHTML = note(`<strong>${ok ? `Correct` : `Not quite: ${opts.choices[it.a]}`}.</strong> ${it.why}`, ok ? `good` : `warn`) + `<div style="margin-top:10px"><button class="lab-btn" data-act="next">${st.i + 1 < items.length ? `Next` : `See score`}</button></div>`;
      }
    };
    el.addEventListener(`click`, e => {
      const b = e.target.closest(`button`);
      if (!b) return;
      if (b.dataset.choice != null && !st.answered) { st.picked = +b.dataset.choice; st.answered = true; if (st.picked === items[st.order[st.i]].a) st.score++; draw(); }
      else if (b.dataset.act === `next`) { st.i++; st.answered = false; draw(); }
      else if (b.dataset.act === `restart`) { st.i = 0; st.score = 0; st.answered = false; shuffle(); draw(); }
    });
    draw();
  }

  // =====================================================================
  // Ch3 - Which principle does this break?
  // =====================================================================
  const PRINCIPLES = [`KISS`, `DRY`, `YAGNI`, `Separation of concerns`, `Law of Demeter`, `SRP`, `OCP`, `LSP`, `ISP`, `DIP`];
  const P = n => PRINCIPLES.indexOf(n);
  const SPOT = [
    { a: P(`OCP`), code: `double fee(Vehicle v, long hours) {
    switch (v.type()) {
        case CAR:        return hours * 2.0;
        case MOTORCYCLE: return hours * 1.0;
        case TRUCK:      return hours * 4.0;
        // every new vehicle type means editing this method
    }
    throw new IllegalArgumentException();
}`, why: `Each new vehicle type forces an edit to existing, working code. Put the rate behind polymorphism (a <code>rate()</code> on the vehicle type or a <code>PricingPolicy</code> per rule) so new types are new code, not edits.` },
    { a: P(`LSP`), code: `class Account {
    void withdraw(Money m) { balance = balance.minus(m); }
}

class FixedDepositAccount extends Account {
    @Override void withdraw(Money m) {
        throw new UnsupportedOperationException("locked until maturity");
    }
}`, why: `Code written against <code>Account</code> breaks when handed a <code>FixedDepositAccount</code>. The subclass weakens the parent's promise. Model the capability separately, for example a <code>Withdrawable</code> interface only some accounts implement.` },
    { a: P(`Law of Demeter`), code: `String plateFor(Ride ride) {
    return ride.getDriver().getVehicle().getRegistration().getPlate();
}`, why: `The caller reaches through four objects and now depends on how Ride, Driver, Vehicle and Registration are structured. Ask the nearest object: <code>ride.vehiclePlate()</code>.` },
    { a: P(`SRP`), code: `class Invoice {
    Money total() { ... }                 // pricing rules
    String toHtml() { ... }               // presentation
    void saveTo(Connection db) { ... }    // persistence
    void emailTo(String address) { ... }  // delivery
}`, why: `The class changes when pricing, layout, the database or email delivery changes: four reasons. Keep <code>Invoice</code> for the domain rules and move rendering, storage and delivery to their own classes.` },
    { a: P(`DIP`), code: `class CheckoutService {
    private final StripeHttpClient stripe = new StripeHttpClient("sk_live_...");

    Receipt checkout(Cart cart) {
        String chargeId = stripe.createCharge(cart.total().cents());
        return new Receipt(chargeId);
    }
}`, why: `Business logic creates and depends on a concrete vendor client, so you can't test without calling Stripe or switch providers without editing the service. Define a <code>PaymentGateway</code> interface shaped by checkout's needs and inject an implementation.` },
    { a: P(`ISP`), code: `interface OfficeDevice {
    void print(Document d);
    void scan(Document d);
    void fax(Document d);
}

class BasicPrinter implements OfficeDevice {
    public void print(Document d) { ... }
    public void scan(Document d) { throw new UnsupportedOperationException(); }
    public void fax(Document d)  { throw new UnsupportedOperationException(); }
}`, why: `<code>BasicPrinter</code> is forced to implement methods it can't support. Split into <code>Printer</code>, <code>Scanner</code> and <code>Fax</code> interfaces; a multifunction device implements all three.` },
    { a: P(`DRY`), code: `class SignupService {
    boolean valid(String email) { return email != null && email.contains("@") && email.length() < 255; }
}
class InviteService {
    boolean valid(String email) { return email != null && email.contains("@") && email.length() < 255; }
}
class ProfileService {
    boolean valid(String email) { return email != null && email.contains("@"); }   // already drifted
}`, why: `The same rule lives in three places and one copy has already drifted. Give the knowledge one home, such as an <code>EmailAddress</code> value object that validates in its constructor.` },
    { a: P(`YAGNI`), code: `class ParkingSpot {
    // Requirements: cars and motorcycles, hourly pricing.
    private DroneLandingPad dronePad;          // "in case we add drones"
    private ValetQueue valetQueue;             // "might need valet later"
    private Map<String, Object> pluginConfig;  // "for future extensions"
}`, why: `None of these features are in the requirements. They add code to read, test and maintain, and guess at changes that may never come. Build for today; mention them as possible extensions.` },
    { a: P(`KISS`), code: `// Requirement: return the first free spot that fits the vehicle.
SpotSelectionStrategyFactory factory = SpotSelectionStrategyFactoryProvider.getInstance().get();
SpotSelectionStrategy strategy = factory.create(SelectionMode.FIRST_FIT);
SpotSelectionContext ctx = new SpotSelectionContext.Builder().vehicle(v).spots(spots).build();
Spot spot = strategy.select(ctx);`, why: `Three layers of indirection for a single, fixed rule. A loop over spots (or one method on <code>Floor</code>) is clearer. Introduce a strategy when a second selection rule actually appears.` },
    { a: P(`Separation of concerns`), code: `class Elevator {
    void step() {
        if (!requests.isEmpty()) moveToward(requests.peek());
        System.out.println("Floor " + floor + " " + "#".repeat(floor));   // rendering
        String input = new Scanner(System.in).nextLine();                  // console input
        if (input.startsWith("call ")) requests.add(Integer.parseInt(input.substring(5)));
    }
}`, why: `Movement rules, console rendering and input parsing are tangled in one method, so you can't test the logic without a console or swap in a GUI. Keep <code>Elevator</code> for the rules and put display and input in their own classes.` }
  ];
  D.principleSpotter = {
    title: `Which principle does this code break?`,
    blurb: `Ten short Java snippets, each with one main design problem. Pick the principle it breaks and read why. Several principles overlap, so the answer is the one that best names the problem.`,
    mount(el) { drill(el, SPOT, { prompt: `Which principle is broken here?`, choices: PRINCIPLES }); }
  };

  // =====================================================================
  // Ch4 - Inheritance, interface or composition?
  // =====================================================================
  const REL = [`Inheritance (extends)`, `Interface (implements)`, `Composition (has-a field)`];
  const RELQ = [
    { a: 2, text: `A <code>Car</code> can run on a petrol, diesel or electric engine, and fleet managers may swap the engine type during a refit.`, why: `The engine is a part that varies and can change over time. Give <code>Car</code> an <code>Engine</code> field; a subclass per engine type couldn't change at run time and multiplies with other variations.` },
    { a: 1, text: `<code>CreditCard</code>, <code>UpiPayment</code> and <code>GiftCard</code> are unrelated classes, but checkout must be able to charge any of them.`, why: `They share a capability, not an identity or code. A <code>PaymentMethod</code> interface lets checkout treat them uniformly while each implements charging its own way.` },
    { a: 0, text: `<code>Knight</code>, <code>Bishop</code> and <code>Rook</code> share a colour, a position and a capture method, and differ only in how they move. The set of piece types is fixed by the rules of chess.`, why: `A stable is-a hierarchy with real shared state and code: an abstract <code>Piece</code> with an abstract <code>canMove</code> is a reasonable fit. (Composition with a <code>MoveRule</code> strategy is also defensible.)` },
    { a: 2, text: `A <code>Logger</code> should write to the console, a file, or both, chosen by configuration.`, why: `The destinations are pluggable parts. <code>Logger</code> holds a list of <code>LogSink</code>s (which are an interface); subclassing <code>ConsoleFileLogger</code> for each combination doesn't scale.` },
    { a: 1, text: `Many unrelated domain objects (<code>Ticket</code>, <code>Invoice</code>, <code>Report</code>) need to be exportable to PDF by the same exporter.`, why: `A role shared across unrelated types: <code>Exportable</code> as an interface. Inheriting from a common base would force an artificial hierarchy.` },
    { a: 2, text: `A <code>Stack</code> class is needed. A teammate suggests <code>class Stack extends ArrayList</code> to reuse its storage.`, why: `Inheriting exposes every <code>ArrayList</code> method, so callers can insert into the middle and break the stack's rules. Hold a list privately and expose only push, pop and peek. (Java's own <code>Stack extends Vector</code> is the classic cautionary example.)` },
    { a: 0, text: `<code>SavingsAccount</code> and <code>CurrentAccount</code> share an id, an owner, a balance and deposit logic; they differ in interest and overdraft rules. A future account type would share the same core.`, why: `Genuine is-a with shared fields and behaviour: an abstract <code>Account</code> base is appropriate. Keep overridable points narrow so subclasses can't break the shared invariants.` },
    { a: 2, text: `A <code>Robot</code> in a game needs to walk, and some robots can also fly or swim. Abilities can be upgraded during play.`, why: `Abilities vary independently and change at run time. Compose the robot from movement components rather than a <code>FlyingSwimmingRobot</code> class for each mix.` }
  ];
  D.isAOrHasA = {
    title: `Inheritance, interface or composition?`,
    blurb: `Eight modelling situations from typical LLD problems. Pick the relationship you'd use and compare with the reasoning. Some have a second defensible answer, noted in the explanation.`,
    mount(el) { drill(el, RELQ, { prompt: `How would you model this?`, choices: REL }); }
  };

  // =====================================================================
  // Ch5 - Match the scenario to a pattern
  // =====================================================================
  const PATS = [`Strategy`, `State`, `Observer`, `Factory`, `Builder`, `Singleton`, `Adapter`, `Decorator`, `Facade`, `Composite`, `Command`, `Chain of Responsibility`];
  const PT = n => PATS.indexOf(n);
  const PATQ = [
    { a: PT(`State`), text: `A vending machine behaves differently in Idle, HasMoney, Dispensing and OutOfStock: inserting a coin, pressing a button and cancelling each mean something different in each.`, why: `Behaviour depends on the current state, and states trigger transitions. A State object per mode keeps each mode's rules together instead of a switch in every method.` },
    { a: PT(`Strategy`), text: `A ride-hailing app matches riders to drivers by nearest driver, by highest rating, or by lowest fare estimate, configurable per city.`, why: `Interchangeable algorithms behind one interface, chosen by configuration: a <code>MatchingStrategy</code>.` },
    { a: PT(`Observer`), text: `When a parking spot is taken or freed, the entrance display boards and the occupancy dashboard must update, and more consumers may be added later.`, why: `One event source, many independent reactions that it shouldn't know about. The lot notifies registered observers.` },
    { a: PT(`Decorator`), text: `A coffee order can have any combination of milk, extra shot, syrup and whipped cream, each adding to the price and description.`, why: `Optional, stackable features over a common interface. Wrapping avoids a subclass per combination.` },
    { a: PT(`Composite`), text: `A file system has files and folders; folders contain files and other folders. You need total size and recursive delete on any node.`, why: `A part-whole tree where single items and groups share one interface: <code>FileSystemNode</code> with <code>File</code> and <code>Directory</code>.` },
    { a: PT(`Command`), text: `A text editor must support undo and redo of typing, deleting and formatting operations.`, why: `Each operation becomes an object with <code>execute</code> and <code>undo</code>; two stacks of commands give undo and redo.` },
    { a: PT(`Adapter`), text: `Your checkout depends on a <code>PaymentGateway</code> interface. You must integrate a vendor SDK whose methods and types look completely different.`, why: `Wrap the SDK in a class that implements your interface and translates calls. Your domain never sees the vendor's types.` },
    { a: PT(`Builder`), text: `A flight search request has origin and destination (required) and a dozen optional filters: dates, cabin, stops, airlines, price range, baggage.`, why: `Many optional parameters and validation at the end: a builder gives readable construction and an immutable request.` },
    { a: PT(`Chain of Responsibility`), text: `Expense claims are approved by a team lead up to $500, a manager up to $5,000, and a director above that; the thresholds and levels change from time to time.`, why: `A request passes along handlers until one can handle it; reordering or adding levels doesn't touch the others.` },
    { a: PT(`Factory`), text: `A notification service sends by email, SMS or push, depending on the user's preference stored as a string in their profile.`, why: `Which concrete class to create depends on input. A factory maps the preference to a <code>Notifier</code> implementation in one place.` },
    { a: PT(`Facade`), text: `Booking a movie ticket involves the seat map, a hold timer, the payment service, the ticket generator and notifications. The mobile app should call one method.`, why: `A simple front over a complex subsystem: <code>BookingFacade.book(showId, seats, payment)</code> coordinates the parts.` },
    { a: PT(`Singleton`), text: `The prompt says the system has exactly one physical lot controller and every component must use the same instance. (Assume the interviewer insists on a global access point.)`, why: `This is the narrow case Singleton exists for. Even then, mention the costs (hidden dependency, harder tests) and that creating one instance at startup and injecting it is usually better.` }
  ];
  D.patternPicker = {
    title: `Match the scenario to a pattern`,
    blurb: `Twelve scenarios drawn from classic LLD problems. Pick the pattern that fits best and read why. In real designs several patterns often combine; the answer is the one the scenario is really about.`,
    mount(el) { drill(el, PATQ, { prompt: `Which pattern fits best?`, choices: PATS }); }
  };
})();
