// Deep dive: Chapter 14, Managing analytical data. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch14 = {
  hook: `<p>Basket's finance team runs a weekly report on gross margin by product category and region. In the monolith it was one SQL query. Now orders live in the ordering database, costs in the catalogue database, regions in the delivery database, and refunds in the payment database. The report breaks every time one of those teams changes a schema, and the analytics team spends more time repairing pipelines than answering questions.</p>
<p>Everything so far has been about <em>operational</em> data. This chapter turns to <em>analytical</em> data, used to understand the business rather than run it, and to what happens when operational data has been carefully split into services. The book reviews the data warehouse and the data lake, explains why both strain in a distributed architecture, and presents <strong>data mesh</strong>, Zhamak Dehghani's approach, as a way to apply the same domain ownership to analytics.</p>`,
  sections: [
    {
      id: "two-worlds",
      title: "Operational versus analytical data",
      kicker: "Two different jobs",
      blocks: [
        {
          type: "table",
          headers: ["", "Operational (OLTP)", "Analytical (OLAP)"],
          rows: [
            ["Purpose", "Run the business transaction by transaction", "Understand trends, plan, forecast"],
            ["Typical query", "Fetch order 4711; decrement stock", "Margin by category by region per week"],
            ["Shape", "Normalised, current state", "Denormalised, historical, aggregated"],
            ["Freshness", "Now", "Minutes to a day behind is usually fine"],
            ["Users", "Services, customers, staff", "Analysts, data scientists, finance"]
          ]
        },
        {
          type: "text",
          html: `<p>Mixing the two is a classic source of pain: a heavy report scanning the orders table slows checkout at lunchtime. So analytical data has long been copied into separate systems. The question is who does the copying, who owns the result, and what happens when the operational side is split across dozens of services owned by different teams.</p>`
        }
      ]
    },
    {
      id: "warehouse-and-lake",
      title: "The data warehouse and the data lake",
      kicker: "Previous approaches",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>data warehouse</strong> extracts data from operational systems, transforms it into a carefully designed analytical model, typically a star schema of fact tables (sales, deliveries) surrounded by dimension tables (product, region, date), and loads it into a central store: <em>ETL</em>. A central data team owns the pipelines and the model.</p>
<p>A <strong>data lake</strong> reverses the order: load raw data from everywhere into cheap central storage as-is, and transform it when someone needs it: <em>ELT</em>. Ingestion is fast and nothing is thrown away, but the data arrives without its domain context.</p>`
        },
        {
          type: "compare",
          items: [
            { title: "Warehouse strengths", tone: "ok", html: `<p>Consistent, curated, well-modelled data; one place for reporting; strong tooling.</p>` },
            { title: "Warehouse weaknesses", tone: "bad", html: `<p>The central team is a bottleneck; transformations lose domain meaning; every upstream schema change risks breaking ETL; the people who understand the data aren't the ones modelling it.</p>` },
            { title: "Lake strengths", tone: "ok", html: `<p>Fast, cheap ingestion; raw data preserved for future questions; flexible for data science.</p>` },
            { title: "Lake weaknesses", tone: "bad", html: `<p>Hard to discover, interpret or trust; no ownership of quality; easily becomes a "data swamp" where nobody knows what a table means or whether it's current.</p>` }
          ]
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Both share the same structural trait: a <strong>central</strong> team ingesting data from <strong>decentralised</strong> producers. That's exactly the technical partitioning that the rest of the book moves away from for operational systems. Every time a domain team changes its service, a different team's pipeline breaks.</p>`
        }
      ]
    },
    {
      id: "data-mesh",
      title: "Data mesh",
      kicker: "Domain ownership for analytics",
      blocks: [
        {
          type: "idea",
          html: `<p><strong>Data mesh</strong> applies the microservices idea of domain ownership to analytical data. Instead of a central team pulling data out of domains, each domain team publishes its analytical data as a product that others can discover and use. It rests on four principles.</p>`
        },
        {
          type: "steps",
          items: [
            `<strong>Domain ownership.</strong> The team that owns an operational domain also owns the analytical data derived from it, and is accountable for its quality. Basket's ordering team publishes order analytics; delivery publishes delivery performance.`,
            `<strong>Data as a product.</strong> Analytical data is treated with product discipline: discoverable (listed in a catalogue), addressable (a stable location), self-describing (documented schema and semantics), trustworthy (quality and freshness guarantees), interoperable (shared identifiers and formats) and secure.`,
            `<strong>Self-serve data platform.</strong> A platform team provides the infrastructure (storage, pipelines, catalogue, access control) so domain teams can build and run data products without each becoming data engineering experts.`,
            `<strong>Federated computational governance.</strong> Global rules (privacy, retention, interoperability standards, quality metrics) are agreed by representatives of domains and the platform, and enforced automatically by the platform rather than by a central approval board.`
          ]
        },
        {
          type: "diagram",
          title: "Data product quanta beside operational services",
          caption: "Each domain runs its operational service and, next to it, a data product quantum it also owns, fed asynchronously. Consumers like finance compose products from several domains through the self-serve platform.",
          svg: `<svg viewBox="0 0 660 270" role="img" aria-label="Operational services each paired with a data product quantum">
<defs><marker id="ahp14-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="12" text-anchor="middle">
<rect x="20" y="20" width="180" height="140" rx="12" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="5 4"/><text x="110" y="40" font-weight="700">Ordering domain</text>
<rect x="35" y="55" width="70" height="40" rx="7" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="70" y="79">Order svc</text>
<rect x="120" y="55" width="70" height="40" rx="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="155" y="73">Orders</text><text x="155" y="88" font-size="11">DPQ</text>
<line x1="105" y1="75" x2="118" y2="75" style="stroke: var(--dg-muted)" stroke-width="1.5" stroke-dasharray="3 3" marker-end="url(#ahp14-arr)"/>
<text x="110" y="125" font-size="11" style="fill: var(--dg-muted)">one team owns both</text>
<rect x="240" y="20" width="180" height="140" rx="12" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="5 4"/><text x="330" y="40" font-weight="700">Catalogue domain</text>
<rect x="255" y="55" width="70" height="40" rx="7" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="290" y="79">Catalogue</text>
<rect x="340" y="55" width="70" height="40" rx="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="375" y="73">Costs</text><text x="375" y="88" font-size="11">DPQ</text>
<line x1="325" y1="75" x2="338" y2="75" style="stroke: var(--dg-muted)" stroke-width="1.5" stroke-dasharray="3 3" marker-end="url(#ahp14-arr)"/>
<rect x="460" y="20" width="180" height="140" rx="12" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="5 4"/><text x="550" y="40" font-weight="700">Delivery domain</text>
<rect x="475" y="55" width="70" height="40" rx="7" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="510" y="79">Delivery</text>
<rect x="560" y="55" width="70" height="40" rx="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="595" y="73">Regions</text><text x="595" y="88" font-size="11">DPQ</text>
<line x1="545" y1="75" x2="558" y2="75" style="stroke: var(--dg-muted)" stroke-width="1.5" stroke-dasharray="3 3" marker-end="url(#ahp14-arr)"/>
<rect x="230" y="200" width="200" height="44" rx="9" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/><text x="330" y="219" font-weight="700">Margin by region</text><text x="330" y="235" font-size="11">aggregate product (finance)</text>
<g style="stroke: var(--dg-muted)" stroke-width="1.5"><line x1="155" y1="95" x2="280" y2="198" marker-end="url(#ahp14-arr)"/><line x1="375" y1="95" x2="340" y2="198" marker-end="url(#ahp14-arr)"/><line x1="595" y1="95" x2="390" y2="198" marker-end="url(#ahp14-arr)"/></g>
<rect x="20" y="250" width="620" height="14" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="330" y="261" font-size="11">self-serve data platform · catalogue · governance policies</text>
</g>
</svg>`
        }
      ]
    },
    {
      id: "data-product-quantum",
      title: "The data product quantum",
      kicker: "Where the two worlds meet",
      blocks: [
        {
          type: "text",
          html: `<p>The book connects data mesh to its architecture vocabulary through the <strong>data product quantum</strong> (DPQ): an independently deployable unit that serves a domain's analytical data, deployed alongside the operational service and owned by the same team. The operational service feeds it asynchronously, so the relationship is eventually consistent and the analytical workload never slows the operational one. In quantum terms, the two are separate quanta that cooperate, which is what keeps analytics from coupling back into the transactional path.</p>
<p>Data products come in a few kinds, which clarifies who owns what:</p>`
        },
        {
          type: "table",
          headers: ["Kind", "What it is", "Basket example", "Owner"],
          rows: [
            ["Source-aligned (native)", "The domain's own facts, shaped for analysis", "Order lines with timestamps, items, prices", "The producing domain (ordering)"],
            ["Aggregate", "Combines several sources into a broader view", "Customer 360: orders, deliveries, support contacts", "A team that needs and curates it"],
            ["Fit-for-purpose", "Built for one specific use", "Features for the demand forecasting model", "The consuming team (data science)"]
          ]
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Data mesh is as much an organisational change as a technical one. Domain teams take on new responsibilities (data quality, documentation, support for consumers), and the platform must exist before they can. For a company with a handful of domains and one capable data team, a well-run warehouse may be simpler. The mesh pays off when the central team has become the bottleneck.</p>`
        },
        {
          type: "quiz",
          q: "Basket's finance report breaks whenever any operational team changes its schema, because a central team's ETL reads those databases directly. Which data mesh principle most directly addresses this?",
          options: ["Self-serve data platform", "Domain ownership with data published as a product through a stable interface", "Federated computational governance", "Moving everything into a data lake"],
          answer: 1,
          explain: `<p>When the producing domain owns and publishes its analytical data as a product, its internal schema can change freely; consumers depend on the product's stable, documented interface instead of the operational tables. The platform and governance principles support this but don't by themselves stop the breakage.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Analytical data serves understanding, not transactions, and has a different shape, freshness and set of users.`,
    `Warehouses (ETL into a curated model) and lakes (raw data, transform later) both centralise ownership, which strains when operational data is split across many teams.`,
    `Data mesh has four principles: domain ownership, data as a product, a self-serve platform and federated computational governance.`,
    `A data product quantum sits beside each operational service, owned by the same team and fed asynchronously, keeping analytics decoupled from transactions.`,
    `Data mesh is an organisational shift; it pays off when the central data team is the bottleneck.`
  ],
  furtherReading: [
    { title: "Data Mesh Principles and Logical Architecture (Zhamak Dehghani)", url: "https://martinfowler.com/articles/data-mesh-principles.html", note: "The article laying out the four principles." },
    { title: "Data Mesh (Zhamak Dehghani, O'Reilly, 2022)", note: "The full book by the co-author who wrote this chapter's approach." }
  ]
};
