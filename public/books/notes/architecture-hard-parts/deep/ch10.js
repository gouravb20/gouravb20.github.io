// Deep dive: Chapter 10, Distributed data access. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch10 = {
  hook: `<p>Ownership is settled: the customer service owns customer addresses. But Basket's delivery service plans routes for 40,000 drops every night and needs every one of those addresses. In the monolith that was a join. Now it's a question with four possible answers, and the first one most teams reach for, calling the customer service 40,000 times, turns the nightly route planner into a load test.</p>
<p>The book describes four patterns for reading data another service owns: <strong>interservice communication</strong>, <strong>column schema replication</strong>, <strong>replicated caching</strong> and the <strong>data domain</strong> pattern. They differ in latency, freshness, fault tolerance, scalability and how much they blur ownership. This deep dive explains each and gives a way to choose.</p>`,
  sections: [
    {
      id: "the-read-problem",
      title: "Reading data you don't own",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Splitting data by owner solves writes but creates a read problem. Most features need some data from another domain: delivery needs addresses, checkout needs prices, the picking app needs product images. Each pattern for getting that data is a trade between asking the owner every time (fresh but coupled) and keeping a local copy (fast and independent but stale and harder to govern).</p>`
        },
        {
          type: "keypoints",
          title: "Questions that pick the pattern",
          items: [
            `<strong>How much data?</strong> Fifty delivery zones or ten million customers.`,
            `<strong>How often does it change?</strong> Reference data that changes monthly or stock levels that change every second.`,
            `<strong>How fresh must reads be?</strong> Is a few seconds out of date acceptable?`,
            `<strong>How often is it read?</strong> Once a night or thousands of times a second.`,
            `<strong>Must the reader work when the owner is down?</strong>`
          ]
        }
      ]
    },
    {
      id: "four-patterns",
      title: "The four patterns",
      kicker: "Options",
      blocks: [
        {
          type: "diagram",
          title: "How delivery reads customer addresses under each pattern",
          caption: "Interservice call: ask the owner each time. Column replication: keep a local copy updated by events. Replicated cache: an in-memory copy kept in sync by a caching product. Data domain: share the tables directly.",
          svg: `<svg viewBox="0 0 660 260" role="img" aria-label="Four distributed data access patterns">
<defs><marker id="ahp10-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="11" text-anchor="middle">
<text x="80" y="18" font-weight="700" font-size="12">Interservice call</text>
<rect x="15" y="34" width="60" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="45" y="53">Delivery</text>
<rect x="95" y="34" width="60" height="30" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="125" y="53">Customer</text>
<rect x="100" y="110" width="50" height="26" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="125" y="127">DB</text>
<line x1="75" y1="49" x2="93" y2="49" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp10-arr)"/>
<line x1="125" y1="64" x2="125" y2="108" style="stroke: var(--dg-muted)" stroke-width="1.5"/>
<text x="80" y="170" style="fill: var(--dg-muted)">every read: a call</text>
<text x="245" y="18" font-weight="700" font-size="12">Column replication</text>
<rect x="180" y="34" width="60" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="210" y="53">Delivery</text>
<rect x="260" y="34" width="60" height="30" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="290" y="53">Customer</text>
<rect x="180" y="110" width="60" height="26" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="210" y="122">address</text><text x="210" y="133">copy</text>
<rect x="265" y="110" width="50" height="26" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="290" y="127">DB</text>
<line x1="210" y1="64" x2="210" y2="108" style="stroke: var(--dg-muted)" stroke-width="1.5"/>
<line x1="260" y1="58" x2="226" y2="106" style="stroke: var(--dg-3)" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ahp10-arr)"/>
<text x="245" y="170" style="fill: var(--dg-muted)">events keep copy fresh</text>
<text x="410" y="18" font-weight="700" font-size="12">Replicated cache</text>
<rect x="345" y="34" width="60" height="46" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="375" y="50">Delivery</text>
<rect x="352" y="56" width="46" height="18" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="375" y="69">cache</text>
<rect x="425" y="34" width="60" height="46" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="455" y="50">Customer</text>
<rect x="432" y="56" width="46" height="18" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="455" y="69">cache</text>
<line x1="430" y1="65" x2="400" y2="65" style="stroke: var(--dg-4)" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ahp10-arr)"/>
<rect x="430" y="110" width="50" height="26" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="455" y="127">DB</text>
<line x1="455" y1="80" x2="455" y2="108" style="stroke: var(--dg-muted)" stroke-width="1.5"/>
<text x="410" y="170" style="fill: var(--dg-muted)">in-memory replica</text>
<text x="580" y="18" font-weight="700" font-size="12">Data domain</text>
<rect x="515" y="34" width="60" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="545" y="53">Delivery</text>
<rect x="590" y="34" width="60" height="30" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="620" y="53">Customer</text>
<rect x="535" y="105" width="95" height="36" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="582" y="120">shared schema</text><text x="582" y="134">addresses</text>
<line x1="545" y1="64" x2="560" y2="103" style="stroke: var(--dg-muted)" stroke-width="1.5"/>
<line x1="620" y1="64" x2="605" y2="103" style="stroke: var(--dg-muted)" stroke-width="1.5"/>
<text x="580" y="170" style="fill: var(--dg-muted)">both use the tables</text>
</g>
<g font-size="12" text-anchor="middle">
<text x="80" y="205" style="fill: var(--dg-ok)">always fresh</text><text x="80" y="225" style="fill: var(--dg-bad)">latency, coupling</text>
<text x="245" y="205" style="fill: var(--dg-ok)">local, available</text><text x="245" y="225" style="fill: var(--dg-bad)">lag, sync to build</text>
<text x="410" y="205" style="fill: var(--dg-ok)">fastest reads</text><text x="410" y="225" style="fill: var(--dg-bad)">size and update limits</text>
<text x="580" y="205" style="fill: var(--dg-ok)">fresh and fast</text><text x="580" y="225" style="fill: var(--dg-bad)">wider bounded context</text>
</g>
</svg>`
        },
        {
          type: "text",
          html: `<p><strong>Interservice communication.</strong> Delivery calls the customer service's API whenever it needs an address. It's the simplest pattern and the only one where reads are always current, with no question of who owns what. But each read pays a network round trip; delivery is only available when customer is; and the customer service must scale for delivery's read load on top of its own. For the nightly route planner that's 40,000 calls in a burst, unless the API supports bulk reads.</p>
<p><strong>Column schema replication.</strong> Delivery keeps its own table with just the columns it needs (customer ID, address lines, postcode, delivery notes), updated asynchronously from events the customer service publishes. Reads become local queries; delivery keeps working when customer is down. The costs: the copy can lag by the event delivery time; someone must build and monitor the synchronisation; and there's a governance risk. It's tempting for delivery to start correcting addresses in its copy, at which point there are two sources of truth.</p>`
        },
        {
          type: "text",
          html: `<p><strong>Replicated caching.</strong> The customer service keeps addresses in an in-memory cache managed by a distributed caching product (Hazelcast, Apache Ignite, Oracle Coherence and similar). The product replicates the cache into each delivery instance's memory. The customer service is the only writer; delivery reads from local memory in microseconds and keeps reading if the customer service goes down. The limits are physical: the whole dataset must fit in every reader instance's memory, a high update rate means a lot of replication traffic, and a delivery instance that starts while the customer service is down may have nothing to read until it's back.</p>
<p><strong>Data domain.</strong> The address tables live in a schema shared by customer and delivery, and both use them directly. Reads are fast, data is always current, and there's no synchronisation. The cost is ownership: the bounded context now spans both services, schema changes need both teams to agree, and neither can move its data independently. It's Chapter 9's data domain technique applied to reads.</p>`
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Distinguish a <em>replicated</em> cache from a <em>distributed</em> (partitioned) cache like a Redis cluster. A distributed cache spreads data across cache nodes, so each read is still a network call. A replicated cache puts a full copy in each reader's process, which is what makes reads local and lets readers survive owner outages.</p>`
        }
      ]
    },
    {
      id: "choosing",
      title: "Choosing for each read",
      kicker: "Decision",
      blocks: [
        {
          type: "text",
          html: `<p>The right pattern varies per piece of data, even within one service. Delivery might call the customer service for a single address while a driver is on the doorstep (rare, must be current), keep a replicated copy of all addresses for nightly planning (bulk, a few minutes stale is fine), and hold delivery zones in a replicated cache (tiny, changes monthly, read on every request).</p>`
        },
        {
          type: "lab",
          id: "dataAccess",
          caption: "Push rows past a few million and the replicated cache stops fitting; require current data and both copy-based patterns drop out."
        },
        {
          type: "table",
          headers: ["Basket read", "Volume", "Change rate", "Freshness", "Pattern"],
          rows: [
            ["Delivery zones by postcode", "~2,000 rows", "Monthly", "Minutes OK", "Replicated cache"],
            ["Addresses for route planning", "~4M rows", "~1,000/hour", "Minutes OK", "Column schema replication"],
            ["Customer's current payment method at checkout", "1 row", "Rare", "Must be current", "Interservice call"],
            ["Product images for the picking app", "~80K rows", "Daily", "Hours OK", "Column replication, or a CDN"],
            ["Order and order lines for the order history page", "Large", "Constant", "Current", "Owner's API, or merge into one data domain"]
          ]
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Whatever pattern keeps a copy, make the copy <strong>read-only</strong> for the reader and say so in a fitness function: only the replication consumer may write to <code>delivery.customer_address</code>. That keeps ownership with the customer service even though the bytes live elsewhere.</p>`
        },
        {
          type: "quiz",
          q: "Basket's checkout reads a list of ~300 active promotion codes on every request. The list changes a few times a day, a minute of staleness is fine, and checkout must keep working if the promotions service is down. Which pattern fits best?",
          options: ["Interservice call on every request", "Replicated cache owned by the promotions service", "A shared data domain between checkout and promotions", "Background batch job copying codes nightly"],
          answer: 1,
          explain: `<p>Small, read-heavy, slowly changing reference data that must survive owner outages is the textbook case for a replicated cache: microsecond local reads, and only the owner writes. A nightly batch would be too stale; an interservice call would tie checkout's availability to promotions.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Reading another service's data trades freshness and simplicity (ask the owner) against speed and independence (keep a copy).`,
    `Interservice calls are current but add latency, runtime coupling and load on the owner.`,
    `Column schema replication gives local, available reads with a lag and a sync mechanism to run; keep the copy read-only.`,
    `Replicated caching gives the fastest reads for small, slowly changing data that fits in every reader's memory.`,
    `The data domain pattern keeps data fresh and fast by sharing the schema, at the cost of a wider bounded context. Choose per read, not per service.`
  ],
  furtherReading: [
    { title: "Hazelcast: replicated map", url: "https://docs.hazelcast.com/hazelcast/latest/data-structures/replicated-map", note: "An example of the replicated cache structure described here." },
    { title: "Change data capture with Debezium", url: "https://debezium.io/", note: "A common way to feed column replication from the owner's database log." }
  ]
};
