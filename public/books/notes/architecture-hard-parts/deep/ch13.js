// Deep dive: Chapter 13, Contracts. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch13 = {
  hook: `<p>The customer team at Basket renames <code>phone</code> to <code>mobile</code> in their API response, because the field only ever held mobile numbers. It's a one-line change, all their tests pass, and it ships on Tuesday. On Wednesday, drivers can't call customers who aren't answering the door: the delivery service had been reading <code>phone</code>, and now gets nothing.</p>
<p>Every interaction between services runs through a <strong>contract</strong>, and every contract is a form of coupling. The book looks at how strict contracts should be, how consumer-driven contracts make loose ones safe, and a subtle coupling called <strong>stamp coupling</strong>: sending far more data than a consumer needs. This deep dive works through each with Basket's customer API.</p>`,
  sections: [
    {
      id: "contracts-are-coupling",
      title: "Contracts are coupling",
      kicker: "The idea",
      blocks: [
        {
          type: "idea",
          html: `<p>A <strong>contract</strong> is whatever format two parts of a system agree on to exchange information: a REST response shape, an event payload, a gRPC message, even a database table used for integration. The question isn't whether to have one (you always do) but how tightly it binds the two sides: how much can the provider change without breaking consumers, and how early does anyone find out when it does?</p>`
        },
        {
          type: "diagram",
          title: "The strictness spectrum",
          caption: "From strict contracts checked by tools at build time to loose ones that consumers interpret at runtime. Strictness buys fidelity and tooling; looseness buys freedom to evolve.",
          svg: `<svg viewBox="0 0 640 170" role="img" aria-label="Spectrum of contract strictness">
<defs><linearGradient id="ahp13-grad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color: var(--dg-5)"/><stop offset="1" style="stop-color: var(--dg-1)"/></linearGradient></defs>
<rect x="30" y="60" width="580" height="12" rx="6" style="fill: url(#ahp13-grad)"/>
<g font-size="12" text-anchor="middle">
<text x="30" y="40" text-anchor="start" font-weight="700" style="fill: var(--dg-5)">strict</text>
<text x="610" y="40" text-anchor="end" font-weight="700" style="fill: var(--dg-1)">loose</text>
<circle cx="70" cy="66" r="7" style="fill: var(--dg-panel); stroke: var(--dg-5)" stroke-width="2"/><text x="70" y="98">RPC stubs</text><text x="70" y="114" font-size="11" style="fill: var(--dg-muted)">gRPC, Thrift</text>
<circle cx="200" cy="66" r="7" style="fill: var(--dg-panel); stroke: var(--dg-5)" stroke-width="2"/><text x="200" y="98">Schema-validated</text><text x="200" y="114" font-size="11" style="fill: var(--dg-muted)">XSD, closed JSON Schema</text>
<circle cx="330" cy="66" r="7" style="fill: var(--dg-panel); stroke: var(--dg-3)" stroke-width="2"/><text x="330" y="98">Typed query schema</text><text x="330" y="114" font-size="11" style="fill: var(--dg-muted)">GraphQL</text>
<circle cx="460" cy="66" r="7" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/><text x="460" y="98">JSON, read what you need</text><text x="460" y="114" font-size="11" style="fill: var(--dg-muted)">tolerant reader</text>
<circle cx="580" cy="66" r="7" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/><text x="580" y="98">Name-value maps</text><text x="580" y="114" font-size="11" style="fill: var(--dg-muted)">key/value pairs</text>
<text x="160" y="150" style="fill: var(--dg-muted)">build-time checking, generated code</text>
<text x="500" y="150" style="fill: var(--dg-muted)">runtime interpretation, free evolution</text>
</g>
</svg>`
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Where a technology sits depends on how it's used. Protocol Buffers ignore unknown fields, so adding a field is safe, but renaming or retyping one isn't. JSON with a closed schema (<code>additionalProperties: false</code>) validated by the consumer is stricter than plain JSON read leniently. Judge the contract by how consumers react to change, not by the format's name.</p>`
        }
      ]
    },
    {
      id: "strict-vs-loose",
      title: "Strict versus loose",
      kicker: "Trade-offs",
      blocks: [
        {
          type: "tradeoffs",
          title: "Strict contracts",
          pros: [
            `Guaranteed fidelity: both sides agree exactly on structure and types.`,
            `Build-time checking and generated client code.`,
            `Self-documenting; versions are explicit.`
          ],
          cons: [
            `Tight coupling: most changes break consumers.`,
            `Frequent versioning; old and new versions run side by side.`,
            `Coordinated releases between teams.`
          ]
        },
        {
          type: "tradeoffs",
          title: "Loose contracts",
          pros: [
            `Providers can add fields and evolve freely.`,
            `Consumers depend only on what they read.`,
            `Fewer versions to maintain.`
          ],
          cons: [
            `Less checking: breakage shows up at runtime unless tested otherwise.`,
            `Contract knowledge lives in consumers' code, not one schema.`,
            `Needs tests or fitness functions to stay safe.`
          ]
        },
        {
          type: "idea",
          html: `<p>The book's guidance follows from the quantum idea: use <strong>strict contracts inside a bounded context or quantum</strong>, where parts are released together anyway and fidelity matters, and <strong>loose contracts between quanta</strong>, where independent evolution is the whole point of the split.</p>`
        }
      ]
    },
    {
      id: "consumer-driven-contracts",
      title: "Consumer-driven contracts",
      kicker: "Making loose contracts safe",
      blocks: [
        {
          type: "text",
          html: `<p>Loose contracts move checking from the compiler to somewhere else. <strong>Consumer-driven contracts</strong> put it in the provider's build. Each consumer writes a small test describing exactly what it relies on: "the customer response has <code>id</code>, <code>phone</code> and <code>addresses[].postcode</code> as strings". The provider runs every consumer's tests on each change. Change something nobody depends on and the build passes; break a consumer and the build fails before release, naming the consumer.</p>`
        },
        {
          type: "code",
          title: "A consumer expectation (Pact-style, simplified)",
          lang: "javascript",
          code: `// In the delivery service's test suite
provider("customer-service")
  .uponReceiving("a request for customer 42")
  .withRequest({ method: "GET", path: "/customers/42" })
  .willRespondWith({
    status: 200,
    body: {
      id: like("42"),
      phone: like("+44 7700 900123"),
      addresses: eachLike({ line1: like("12 Elm St"), postcode: like("AB1 2CD") })
    }
  });
// Published to a broker; customer-service verifies it in its own CI.`
        },
        {
          type: "lab",
          id: "contractBreak",
          caption: "Rename phone under each contract style: strict breaks everyone, loose breaks two consumers in production, consumer-driven tests catch it in the provider's build."
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Pair consumer-driven contracts with an evolution rule: add new fields alongside old ones, mark the old ones deprecated, and remove them only when no consumer test references them. The rename that broke Basket's drivers becomes "add <code>mobile</code>, keep <code>phone</code> for now".</p>`
        }
      ]
    },
    {
      id: "stamp-coupling",
      title: "Stamp coupling",
      kicker: "Sending too much",
      blocks: [
        {
          type: "problem",
          html: `<p>Basket's customer API returns the whole customer document on every call: profile, addresses, preferences and the last two years of order history, about 40 KB. Delivery needs one address and a phone number. Every call ships 80 times more data than delivery uses, and every change to order history's structure is now, technically, a change to delivery's contract.</p>`
        },
        {
          type: "idea",
          html: `<p><strong>Stamp coupling</strong> is passing a large data structure to a consumer that uses only part of it. The name comes from structured design, where passing a whole record ("stamp") instead of the needed fields was recognised as a form of coupling. It causes two problems: consumers become coupled to fields they don't need, and bandwidth is wasted, which matters at high call volumes.</p>`
        },
        {
          type: "code",
          title: "Bandwidth adds up",
          lang: "text",
          code: `full customer document     40 KB x 500 calls/s = 20 MB/s  (~1.7 TB/day)
delivery's fields only     0.5 KB x 500 calls/s = 0.25 MB/s (~22 GB/day)

Options: a delivery-specific endpoint, field selection (?fields=phone,addresses),
GraphQL queries that request only needed fields, or events carrying just the change.`
        },
        {
          type: "text",
          html: `<p>Stamp coupling isn't always a mistake. Chapter 11 showed it as a deliberate technique for choreographed workflows: carrying accumulated workflow state in each event, so every step can see what happened before it without a central store. The difference is intent. Passing a larger structure on purpose, with a stable shape, to replace a state store is a design choice; passing the whole customer because it was the easiest thing to serialise is an accident.</p>`
        },
        {
          type: "quiz",
          q: "Basket's provider wants to rename a field that only two of its six consumers read. Which contract approach lets it make the change most safely without coordinating a release with all six teams?",
          options: ["Strict closed schemas validated by every consumer", "Loose contracts with consumer-driven contract tests in the provider's build", "Loose contracts with no tests, announced on a mailing list", "A shared library containing the response types"],
          answer: 1,
          explain: `<p>Consumer-driven tests show exactly which two consumers depend on the field, so the provider can add the new name alongside the old, coordinate only with those two, and remove the old field once their tests no longer reference it. Strict schemas or a shared types library would force all six to change.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Every contract is coupling; strictness decides how much the provider can change without breaking consumers.`,
    `Strict contracts give fidelity and tooling at the cost of versioning and coordination; loose contracts give free evolution at the cost of runtime breakage.`,
    `Use strict contracts inside a quantum and loose ones between quanta.`,
    `Consumer-driven contracts make loose contracts safe by running each consumer's expectations in the provider's build.`,
    `Stamp coupling (sending far more than consumers use) couples them to unused fields and wastes bandwidth, unless it's a deliberate way to carry workflow state.`
  ],
  furtherReading: [
    { title: "Pact", url: "https://pact.io/", note: "The most widely used consumer-driven contract testing tool." },
    { title: "Tolerant Reader (Martin Fowler)", url: "https://martinfowler.com/bliki/TolerantReader.html", note: "Consumers that read only what they need and ignore the rest." },
    { title: "Consumer-Driven Contracts (Ian Robinson)", url: "https://martinfowler.com/articles/consumerDrivenContracts.html", note: "The article that introduced the idea." }
  ]
};
