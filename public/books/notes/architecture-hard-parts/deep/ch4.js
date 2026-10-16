// Deep dive: Chapter 4, Architectural decomposition. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>Basket has its drivers and its business case. Now someone has to open the codebase and decide where to cut. The first surprise is that "the catalogue module" isn't a thing: catalogue classes import checkout classes, which import a giant <code>Utils</code> package that imports half of everything back. Before planning services, Basket needs to know whether its code <em>can</em> be cut along clean lines at all.</p>
<p>The book offers two things here. First, a quick, metric-based way to judge whether a codebase is decomposable. Second, two contrasting strategies: <strong>component-based decomposition</strong>, which carefully restructures and extracts, and <strong>tactical forking</strong>, which copies everything and deletes what each service doesn't need. Which one fits depends on what the metrics say.</p>`,
  sections: [
    {
      id: "is-it-decomposable",
      title: "Is the codebase decomposable?",
      kicker: "Before you cut",
      blocks: [
        {
          type: "problem",
          html: `<p>Some codebases have internal structure: packages that mostly depend in one direction, domain areas that are recognisably separate. Others are a <strong>big ball of mud</strong>, where any class may call any other and the dependency graph is one tangle. Planning a component-by-component extraction on the second kind of codebase means discovering, one painful step at a time, that nothing comes out cleanly.</p>`
        },
        {
          type: "idea",
          html: `<p>Use cheap, automatable structural metrics to get an early answer. They come from Robert C. Martin's work on package design and measure, per component (namespace or package), how much depends on it, how much it depends on, and how abstract it is. They can't tell you where domain boundaries should be, but they quickly show whether boundaries exist in the code today.</p>`
        }
      ]
    },
    {
      id: "the-metrics",
      title: "Coupling, abstractness, instability, distance",
      kicker: "The metrics",
      blocks: [
        {
          type: "table",
          headers: ["Metric", "Definition", "Reading it"],
          rows: [
            ["Afferent coupling, Ca", "Number of components that depend on this one", "High: many things break if it changes"],
            ["Efferent coupling, Ce", "Number of components this one depends on", "High: it breaks when many things change"],
            ["Abstractness, A", "Abstract types ÷ total types", "0 = all concrete, 1 = all interfaces/abstract"],
            ["Instability, I", "Ce ÷ (Ca + Ce)", "0 = stable (depended on), 1 = unstable (depends on others)"],
            ["Distance, D", "|A + I − 1|", "0 = on the main sequence; near 1 = in a problem zone"]
          ]
        },
        {
          type: "diagram",
          title: "The main sequence and the two zones",
          caption: "Plot abstractness against instability. Healthy components sit near the diagonal A + I = 1. Bottom left: concrete code many things depend on (zone of pain). Top right: abstractions nothing uses (zone of uselessness).",
          svg: `<svg viewBox="0 0 420 340" role="img" aria-label="Main sequence chart with zone of pain and zone of uselessness">
<rect x="60" y="20" width="300" height="270" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<path d="M60 290 L60 180 A110 110 0 0 0 170 290 Z" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<path d="M360 20 L360 130 A110 110 0 0 1 250 20 Z" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<line x1="60" y1="20" x2="360" y2="290" style="stroke: var(--dg-2)" stroke-width="2.5" stroke-dasharray="7 5"/>
<text x="72" y="276" font-size="12" style="fill: var(--dg-bad)">zone of pain</text>
<text x="348" y="40" text-anchor="end" font-size="12" style="fill: var(--dg-3)">zone of uselessness</text>
<text x="230" y="150" font-size="12" style="fill: var(--dg-2)" transform="rotate(42 230 150)">main sequence</text>
<circle cx="78" cy="282" r="6" style="fill: var(--dg-bad)"/><text x="90" y="252" font-size="11">common.util</text>
<circle cx="110" cy="60" r="6" style="fill: var(--dg-ok)"/><text x="122" y="64" font-size="11">payment.api</text>
<circle cx="360" cy="290" r="6" style="fill: var(--dg-ok)"/><text x="352" y="280" text-anchor="end" font-size="11">checkout.web</text>
<text x="210" y="315" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">instability I →</text>
<text x="30" y="155" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)" transform="rotate(-90 30 155)">abstractness A →</text>
<text x="60" y="305" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">0</text>
<text x="360" y="305" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">1</text>
<text x="50" y="25" text-anchor="end" font-size="11" style="fill: var(--dg-muted)">1</text>
</svg>`
        },
        {
          type: "text",
          html: `<p>Instability isn't a value judgement. A web controller package that depends on lots of things and that nothing depends on should be unstable (I near 1): it's a leaf and easy to change. A core interface package that many depend on should be stable (I near 0) <em>and</em> abstract, so implementations can change behind it. Problems appear off the diagonal:</p>
<ul><li><strong>Zone of pain</strong> (low A, low I): concrete code that much of the system depends on. Every change ripples out. Typical residents: a shared <code>Utils</code> package, the classes mapped to database tables, a "common domain model" used everywhere.</li>
<li><strong>Zone of uselessness</strong> (high A, high I): interfaces and abstract classes that nothing implements or depends on. Indirection with no beneficiary, often left over from speculative design.</li></ul>`
        },
        {
          type: "lab",
          id: "mainSequence",
          caption: "Compare Basket's components; then raise Ca on a concrete component and watch it slide into the zone of pain."
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Most static-analysis tools compute these metrics (NDepend for .NET, JDepend and SonarQube plug-ins for Java). Run them across the whole codebase and look at the distribution: a few components in the zone of pain is normal; most of them there signals a ball of mud.</p>`
        }
      ]
    },
    {
      id: "component-based",
      title: "Component-based decomposition",
      kicker: "Strategy 1: restructure, then extract",
      blocks: [
        {
          type: "text",
          html: `<p>If the codebase has usable structure, decompose it deliberately. First make the components explicit and well-shaped inside the monolith; then group them into domains; then move each domain into a separately deployed service. Chapter 5 breaks this into six patterns. The important property is that every intermediate step is a working system: you can ship, pause or reverse at any point.</p>`
        },
        {
          type: "diagram",
          title: "The usual path",
          caption: "Component-based decomposition typically goes through a service-based architecture: a few coarse domain services sharing the database. Finer splits, and splitting the data, come later and only where a driver calls for them.",
          svg: `<svg viewBox="0 0 640 170" role="img" aria-label="Monolith to components to domain services to finer services">
<defs><marker id="ahp4-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="12" text-anchor="middle">
<rect x="10" y="40" width="130" height="80" rx="10" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="1.5"/>
<text x="75" y="76" font-weight="700">Monolith</text><text x="75" y="94" style="fill: var(--dg-muted)">tangled</text>
<rect x="170" y="40" width="130" height="80" rx="10" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="235" y="76" font-weight="700">Modular monolith</text><text x="235" y="94" style="fill: var(--dg-muted)">clear components</text>
<rect x="330" y="40" width="130" height="80" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="395" y="76" font-weight="700">Service-based</text><text x="395" y="94" style="fill: var(--dg-muted)">4-12 domain services</text>
<rect x="490" y="40" width="140" height="80" rx="10" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="560" y="76" font-weight="700">Finer services</text><text x="560" y="94" style="fill: var(--dg-muted)">where drivers demand</text>
<line x1="140" y1="80" x2="168" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ahp4-arr)"/>
<line x1="300" y1="80" x2="328" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ahp4-arr)"/>
<line x1="460" y1="80" x2="488" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ahp4-arr)"/>
<text x="235" y="150" style="fill: var(--dg-muted)">patterns 1-5</text>
<text x="395" y="150" style="fill: var(--dg-muted)">pattern 6</text>
<text x="560" y="150" style="fill: var(--dg-muted)">Ch 6-7</text>
</g>
</svg>`
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Service-based architecture is an underrated destination, not just a waypoint. A handful of coarse domain services with one shared database gets most of the deployability and team-ownership gains with none of the distributed-data pain. Many systems never need to go further.</p>`
        }
      ]
    },
    {
      id: "tactical-forking",
      title: "Tactical forking",
      kicker: "Strategy 2: copy, then delete",
      blocks: [
        {
          type: "problem",
          html: `<p>Basket's metrics come back bad: 60% of components in the zone of pain, a dependency graph that's one strongly connected blob. Extracting the delivery domain would mean understanding and untangling thousands of cross-references first. That's months before anything ships.</p>`
        },
        {
          type: "idea",
          html: `<p><strong>Tactical forking</strong> flips the problem. Instead of extracting the delivery code from the monolith, give the delivery team a full copy of the monolith and let them <em>delete</em> everything delivery doesn't need, until only delivery is left. Deleting is easier than extracting: you don't need to understand a dependency to discover you can remove it; you remove code and see whether the tests still pass.</p>`
        },
        {
          type: "steps",
          title: "How it goes",
          items: [
            `Agree on the target services and assign a team to each.`,
            `Each team forks the whole monolith into its own repository.`,
            `Teams delete code their service doesn't use: screens, modules, tables, then dead paths that become visible.`,
            `What remains is deployed as the service, with its own data where possible.`,
            `Over time, teams clean up leftovers: shared code duplicated across forks, old names, unused tables.`
          ]
        },
        {
          type: "tradeoffs",
          title: "Tactical forking",
          pros: [
            `Fast start: teams work in parallel without untangling first.`,
            `Deleting is safer and easier to reason about than extracting.`,
            `Works on code too tangled for component-based decomposition.`
          ],
          cons: [
            `Each service carries dead code until someone removes it.`,
            `Shared code is duplicated in every fork and drifts apart.`,
            `Monolith names and abstractions linger in services that no longer fit them.`,
            `Less understanding of the domain is gained along the way.`
          ]
        },
        {
          type: "compare",
          title: "Choosing a strategy",
          items: [
            { title: "Component-based decomposition", tone: "ok", html: `<p>Code has recognisable structure; most components near the main sequence; you want clean boundaries and domain understanding; time is available.</p>` },
            { title: "Tactical forking", tone: "warn", html: `<p>Code is a ball of mud; extraction would take longer than the business can wait; teams can live with leftovers and clean up over time.</p>` }
          ]
        },
        {
          type: "quiz",
          q: "A component has Ca = 12, Ce = 3 and 1 abstract type out of 25. Where does it sit?",
          options: ["Near the main sequence", "In the zone of pain", "In the zone of uselessness", "It can't be determined from these numbers"],
          answer: 1,
          explain: `<p>I = 3 / 15 = 0.2 and A = 1 / 25 = 0.04, so D = |0.04 + 0.2 − 1| = 0.76. It's concrete and heavily depended upon: the zone of pain. Expect changes to ripple and extraction to be hard without introducing interfaces first.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Check decomposability before planning services: a ball of mud won't yield to component extraction.`,
    `Ca, Ce, A, I and D are cheap, automatable signals; D = |A + I − 1| shows components in the zone of pain or uselessness.`,
    `Component-based decomposition restructures first and extracts in steps, typically through a service-based architecture.`,
    `Tactical forking copies the whole codebase per service and deletes what isn't needed: fast on tangled code, at the cost of leftovers and duplication.`,
    `Service-based architecture is a valid destination, not just a stepping stone.`
  ],
  furtherReading: [
    { title: "Robert C. Martin: OO Design Quality Metrics (1994)", note: "The paper defining abstractness, instability and the main sequence; also covered in his book Agile Software Development." },
    { title: "Big Ball of Mud (Foote and Yoder)", url: "http://www.laputan.org/mud/", note: "The classic essay on why unstructured systems are so common." },
    { title: "Tactical forking (Fausto De La Torre)", note: "The technique's originator; the book credits the idea to him." }
  ]
};
