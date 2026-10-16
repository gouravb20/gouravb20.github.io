// Deep dive: Chapter 3, Architectural modularity. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>Basket's CTO has a slide titled "Move to microservices". The CFO's first question is "why?", and "it's how modern companies build software" doesn't survive it. The migration will cost two years of partial attention from every team, add new kinds of failures and require tooling Basket doesn't have. Something concrete has to be bought with that money.</p>
<p>The book calls those concrete things <strong>modularity drivers</strong>: the specific qualities that get better when a system is broken into independently deployable parts. This deep dive goes through each driver, shows what modularity does for it (and what it doesn't), and ends with how to turn drivers into a business case that names its costs.</p>`,
  sections: [
    {
      id: "change-is-the-driver",
      title: "Why modularity at all",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Monoliths aren't bad by nature. Early on, one deployable with one database is the fastest way to build: no network between features, one transaction for everything, one thing to run. The pain arrives with growth. More teams commit to the same codebase, releases bundle more unrelated changes, a fault in one corner takes everything down, and the whole application must be scaled for the busiest feature.</p>`
        },
        {
          type: "idea",
          html: `<p>Modularity is a response to <strong>change and load that are unevenly distributed</strong>. If every part of the system changed at the same rate, carried the same load and had the same failure cost, there'd be little reason to separate them. Because they don't, splitting lets each part change, scale and fail on its own terms. Each modularity driver names one of those unevennesses.</p>`
        },
        {
          type: "analogy",
          html: `<p>Think of a restaurant run from one big kitchen. When the dessert station catches fire, everyone evacuates. When the lunch rush hits the grill, you can't add capacity without building a second full kitchen. Splitting into stations with their own equipment lets the grill expand at lunch and keeps a dessert fire from closing the bar, but now orders must move between stations, and someone has to make sure the main course and its side arrive together.</p>`
        }
      ]
    },
    {
      id: "the-drivers",
      title: "The drivers one by one",
      kicker: "What modularity buys",
      blocks: [
        {
          type: "table",
          headers: ["Driver", "What it means", "How modularity helps", "Basket symptom"],
          rows: [
            ["Maintainability", "Ease of adding, changing, removing features", "A change touches one cohesive unit, not every layer", "Delivery fee change touched 7 packages and 3 teams"],
            ["Testability", "Ease and completeness of testing a change", "Test scope shrinks to the unit changed", "Full regression takes 4 hours, so it's skipped"],
            ["Deployability", "Frequency, risk and ceremony of releases", "Small units ship alone; less risk per release", "Monthly release train with a 2-hour freeze"],
            ["Scalability", "Handling more load as it grows", "Scale only the busy parts", "Whole app scaled for catalogue browsing"],
            ["Elasticity", "Handling sudden spikes fast", "Small units start quickly", "6 am slot release overwhelms the site"],
            ["Fault tolerance", "Rest keeps working when a part fails", "Failures contained within a quantum", "Promotions bug took checkout down"]
          ]
        },
        {
          type: "text",
          html: `<p><strong>Maintainability</strong> depends heavily on how the code is partitioned. In a <em>technically partitioned</em> monolith (presentation, business, persistence layers), a domain change like "add a delivery fee" cuts through every layer, each shared by every domain. In a <em>domain partitioned</em> system, the same change lands inside the delivery part. Modularity tends to force domain partitioning, which is where much of the maintainability gain comes from.</p>
<p><strong>Testability</strong> improves because a smaller deployable has a smaller blast radius for a change. If the delivery service is deployed alone, testing a delivery change thoroughly means testing the delivery service, plus its contracts with others, not regression-testing the whole of Basket.</p>
<p><strong>Deployability</strong> combines three things: how often you can deploy, how risky each deployment is, and how much ceremony surrounds it. Big releases bundle unrelated changes, so the riskiest change sets the pace for all of them. Smaller units let low-risk changes go out alone, often several times a day.</p>`
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Maintainability, testability and deployability together produce what the business actually wants: <strong>speed to market</strong>, sometimes called agility. When pitching a migration, translate the technical drivers into that outcome: "pricing changes go live the same day, not at the next monthly release".</p>`
        }
      ]
    },
    {
      id: "scale-vs-elasticity",
      title: "Scalability is not elasticity",
      kicker: "A distinction that changes designs",
      blocks: [
        {
          type: "text",
          html: `<p>The two words get used interchangeably but describe different abilities. <strong>Scalability</strong> is about handling load that grows over weeks and months while response times stay acceptable: more customers, more orders. <strong>Elasticity</strong> is about handling bursts that arrive in seconds or minutes: a flash sale, a TV advert, slots opening at 6 am.</p>
<p>A monolith can scale reasonably well: put more copies behind a load balancer and grow the database. It's rarely elastic, for two reasons. Each copy is large and slow to start, often minutes for a big application to boot and warm its caches. And each copy scales <em>everything</em>, so you pay to replicate checkout, reporting and admin screens in order to absorb a spike in slot search.</p>`
        },
        {
          type: "lab",
          id: "elasticitySpike",
          caption: "Raise the spike and the monolith's boot time: both designs eventually catch up, but only the small service does it before customers notice."
        },
        {
          type: "keypoints",
          title: "What elasticity depends on",
          items: [
            `<strong>Size of the scaled unit:</strong> smaller units mean less wasted capacity per added instance.`,
            `<strong>Mean time to start:</strong> a 15-second container start versus a 3-minute application server.`,
            `<strong>Statelessness:</strong> new instances must serve immediately without long cache warm-up or session migration.`,
            `<strong>Shared bottlenecks:</strong> scaling the service is pointless if every instance hits the same database at its limit.`
          ]
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Elasticity is only as good as the least elastic synchronous dependency. If the slot service scales to 20 instances but each request calls a customer service that can't, you've moved the bottleneck, not removed it. Elastic paths need asynchronous or cached access to their dependencies.</p>`
        }
      ]
    },
    {
      id: "fault-tolerance",
      title: "Fault tolerance needs more than separate services",
      kicker: "Availability",
      blocks: [
        {
          type: "problem",
          html: `<p>Basket splits promotions into its own service, expecting a promotions bug never to take checkout down again. Then the promotions service deadlocks during a sale, checkout's synchronous call to it waits 30 seconds per order, checkout's thread pool fills, and checkout goes down anyway. The code was split; the failure path wasn't.</p>`
        },
        {
          type: "idea",
          html: `<p>Fault tolerance requires two things together: <strong>separate quanta</strong>, so a failing part doesn't share a process or database with the rest, and <strong>interactions that tolerate the failure</strong>, so callers don't wait on it indefinitely. The second part is where most of the work is: asynchronous messaging, timeouts with sensible fallbacks, circuit breakers, cached defaults.</p>`
        },
        {
          type: "compare",
          items: [
            { title: "Split, but still entangled", tone: "bad", html: `<p>Checkout calls promotions synchronously with a long timeout. A promotions outage becomes a checkout outage, plus the overhead of a network call.</p>` },
            { title: "Split and isolated", tone: "ok", html: `<p>Checkout calls promotions with a 200 ms timeout and a circuit breaker; on failure it charges full price and flags the order for a later discount. Promotions can fail without stopping orders.</p>` }
          ]
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Ask the business what degraded behaviour is acceptable for each dependency before designing the fallback. "Checkout continues without discounts, which are applied as refunds later" is a business decision, not a technical one.</p>`
        }
      ]
    },
    {
      id: "business-case",
      title: "Making the business case",
      kicker: "From drivers to decisions",
      blocks: [
        {
          type: "text",
          html: `<p>A migration pitched on fashion stalls when the first hard quarter arrives. A migration tied to drivers survives, because each step can show progress against a problem people already feel. The structure is simple: name the pain, map it to a driver, propose the slice that addresses it, state the cost honestly, and say how you'll measure success.</p>`
        },
        {
          type: "code",
          title: "Basket's case for the first slice",
          lang: "text",
          code: `Pain       6 am slot release: 12% of requests fail for ~4 minutes, weekly.
           Holiday promotions bug took checkout down for 50 minutes.
Drivers    Elasticity (slot search), fault tolerance (promotions).
Slice      1. Extract slot search as a small stateless service with a
              read replica of slot data.
           2. Put promotions behind a timeout + fallback (no discount).
Cost       ~1 quarter for two engineers; new deployment pipeline;
           slot data can be ~seconds stale in search.
Measure    Failed requests during slot release < 0.5%.
           Checkout availability unaffected by promotions incidents.`
        },
        {
          type: "tradeoffs",
          title: "What breaking apart costs",
          pros: [
            `Changes ship independently and faster.`,
            `Hot paths scale and burst on their own.`,
            `Failures can be contained to one part.`,
            `Teams own a clear piece end to end.`
          ],
          cons: [
            `Network calls replace in-process calls: latency and new failure modes.`,
            `Transactions across parts become distributed workflows.`,
            `Observability, deployment and contract tooling become mandatory.`,
            `Data has to be split, which is the hardest part (Chapter 6).`
          ]
        },
        {
          type: "quiz",
          q: "Basket's main complaint is that the whole site slows down every morning when slots open. Which driver should lead the decision, and what does it imply?",
          options: ["Maintainability: refactor the codebase into layers", "Elasticity: extract a small, fast-starting slot search unit that scales on its own", "Testability: add more unit tests to the slot module", "Deployability: release more often"],
          answer: 1,
          explain: `<p>A sudden, predictable spike in one feature is an elasticity problem. The fix is a small unit for that feature that can start quickly and scale without dragging the rest of the application, and that doesn't synchronously depend on anything less elastic.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Break a system apart to fix uneven change, load or failure cost, not because it's fashionable.`,
    `Maintainability, testability and deployability add up to speed to market, the outcome the business cares about.`,
    `Scalability handles growth; elasticity handles spikes, and depends on small, fast-starting units without inelastic synchronous dependencies.`,
    `Fault tolerance needs separate quanta and interactions that tolerate failure (timeouts, fallbacks, async).`,
    `Pitch migrations as pain → driver → slice → cost → measure, and record the case in an ADR.`
  ],
  furtherReading: [
    { title: "Monolith First (Martin Fowler)", url: "https://martinfowler.com/bliki/MonolithFirst.html", note: "The argument for starting with a monolith and splitting when drivers appear." },
    { title: "Release It! (Michael Nygard)", note: "Stability patterns (timeouts, circuit breakers, bulkheads) that make fault isolation real." },
    { title: "Fundamentals of Software Architecture (Richards, Ford)", note: "The companion book that defines architecture characteristics in detail." }
  ]
};
