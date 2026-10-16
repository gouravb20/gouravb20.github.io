// Deep dive: Chapter 9, Data ownership and distributed transactions. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>Basket's <code>product</code> table has 30 columns. The catalogue service writes the name, description, images and category. The stock service writes quantity on hand and reorder level. The pricing service writes the base price. All three wrote to it happily in the monolith. Now each service is meant to have its own database, and the table can only live in one of them. Whose is it?</p>
<p>The book's rule for this is simple to state and hard to apply: <strong>the service that writes the data owns it</strong>. This deep dive works through the three ownership situations (one writer, many writers, a few related writers), the four techniques for the hard case, and then what happens to transactions once data is split: why ACID across services is impractical, what BASE means, and three ways to get eventual consistency.</p>`,
  sections: [
    {
      id: "ownership-rule",
      title: "Ownership follows writes",
      kicker: "The rule",
      blocks: [
        {
          type: "idea",
          html: `<p>Assign each table to the service that <strong>writes</strong> to it. That service enforces the data's rules, controls its schema and publishes it to everyone else through an API or events. Readers are a separate problem (Chapter 10); what matters for ownership is who changes the data.</p>`
        },
        {
          type: "table",
          headers: ["Situation", "Who writes", "Example in Basket", "Typical resolution"],
          rows: [
            ["Single ownership", "One service", "Driver shifts: only delivery writes", "That service owns the table"],
            ["Common ownership", "Most or all services", "Audit log: every service writes an entry", "A dedicated service owns it; others send writes, ideally async"],
            ["Joint ownership", "A few related services", "Product: catalogue, stock and pricing write different columns", "Table split, data domain, delegate or consolidation"]
          ]
        },
        {
          type: "text",
          html: `<p><strong>Single ownership</strong> is the easy case and, with good domain boundaries, the common one. <strong>Common ownership</strong> sounds hard but has a standard answer: don't let every service write to the shared table. Create one service that owns it (an audit service) and have the others send it writes, usually as asynchronous messages so a slow audit service doesn't slow everyone down. <strong>Joint ownership</strong> is where the real analysis is.</p>`
        }
      ]
    },
    {
      id: "joint-ownership",
      title: "Four techniques for joint ownership",
      kicker: "The hard case",
      blocks: [
        {
          type: "diagram",
          title: "Resolving Basket's jointly owned product table",
          caption: "Four ways to handle catalogue and stock both writing to product. Each restores clarity at a different cost: synchronisation, shared schema, remote writes, or a coarser service.",
          svg: `<svg viewBox="0 0 660 300" role="img" aria-label="Table split, data domain, delegate and consolidation techniques">
<defs><marker id="ahp9-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="11" text-anchor="middle">
<text x="82" y="18" font-weight="700" font-size="12">Table split</text>
<rect x="10" y="30" width="65" height="30" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="42" y="49">Catalogue</text>
<rect x="90" y="30" width="65" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="122" y="49">Stock</text>
<rect x="10" y="110" width="65" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="42" y="129">product</text>
<rect x="90" y="110" width="65" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="122" y="129">product_stock</text>
<line x1="42" y1="60" x2="42" y2="108" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp9-arr)"/>
<line x1="122" y1="60" x2="122" y2="108" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp9-arr)"/>
<line x1="75" y1="45" x2="88" y2="45" style="stroke: var(--dg-3)" stroke-width="1.5" stroke-dasharray="3 3"/>
<text x="82" y="165" style="fill: var(--dg-muted)">sync keys via events</text>
<text x="247" y="18" font-weight="700" font-size="12">Data domain</text>
<rect x="175" y="30" width="65" height="30" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="207" y="49">Catalogue</text>
<rect x="255" y="30" width="65" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="287" y="49">Stock</text>
<rect x="190" y="105" width="115" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="247" y="122">shared schema</text><text x="247" y="137">product</text>
<line x1="207" y1="60" x2="225" y2="103" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp9-arr)"/>
<line x1="287" y1="60" x2="270" y2="103" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp9-arr)"/>
<text x="247" y="165" style="fill: var(--dg-muted)">both write directly</text>
<text x="412" y="18" font-weight="700" font-size="12">Delegate</text>
<rect x="340" y="30" width="65" height="30" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="372" y="49">Catalogue</text>
<rect x="420" y="30" width="65" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="452" y="49">Stock</text>
<rect x="340" y="110" width="65" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="372" y="129">product</text>
<line x1="372" y1="60" x2="372" y2="108" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp9-arr)"/>
<line x1="420" y1="45" x2="407" y2="45" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp9-arr)"/>
<text x="412" y="165" style="fill: var(--dg-muted)">stock asks catalogue</text>
<text x="577" y="18" font-weight="700" font-size="12">Consolidation</text>
<rect x="520" y="30" width="115" height="30" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="577" y="49">Product service</text>
<rect x="545" y="110" width="65" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="577" y="129">product</text>
<line x1="577" y1="60" x2="577" y2="108" style="stroke: var(--dg-muted)" stroke-width="1.5" marker-end="url(#ahp9-arr)"/>
<text x="577" y="165" style="fill: var(--dg-muted)">one service, one owner</text>
</g>
<g font-size="12">
<text x="10" y="205" font-weight="700">Gain / cost</text>
<text x="10" y="228" style="fill: var(--dg-ok)">single owner each</text><text x="10" y="246" style="fill: var(--dg-bad)">eventual sync</text>
<text x="190" y="228" style="fill: var(--dg-ok)">atomic, fast</text><text x="190" y="246" style="fill: var(--dg-bad)">shared schema</text>
<text x="340" y="228" style="fill: var(--dg-ok)">one owner, no split</text><text x="340" y="246" style="fill: var(--dg-bad)">remote write, coupling</text>
<text x="520" y="228" style="fill: var(--dg-ok)">problem gone</text><text x="520" y="246" style="fill: var(--dg-bad)">coarser service</text>
</g>
</svg>`
        },
        {
          type: "text",
          html: `<p><strong>Table split.</strong> Divide the table along the lines of who writes what: catalogue keeps <code>product</code> (name, description, images), stock gets <code>product_stock</code> (product ID, quantity, reorder level). Each service now has single ownership. The cost is keeping the shared key in step: when catalogue creates or retires a product, stock must hear about it, usually through an event. For a while the two can disagree, for example stock holding a row for a product that catalogue has just retired.</p>
<p><strong>Data domain.</strong> Leave the table whole in a small schema that both services read and write directly. Writes stay atomic and reads fast, with no synchronisation. The price is a wider bounded context: catalogue and stock now share a schema, so changes to it need both teams, and their data can't be deployed independently. It's a reasonable choice for services that are closely related and owned by teams that work closely together.</p>`
        },
        {
          type: "text",
          html: `<p><strong>Delegate.</strong> Pick one service as the single owner and have the other ask it to make changes. Which one? The book describes two ways to choose. <em>Domain priority</em> gives ownership to the service whose core domain the data belongs to; product is catalogue's entity, so catalogue owns it and stock calls catalogue to update quantities. <em>Operational characteristics priority</em> gives ownership to the service that needs the fastest or most frequent writes, here stock, which updates quantities on every order while catalogue edits product details occasionally. Either way, the delegating service gains a remote call, and possibly an availability dependency, for every write.</p>
<p><strong>Service consolidation.</strong> Merge the joint owners into one service. The ownership problem disappears entirely. The cost is everything Chapter 7 warned about: one larger service, tested, deployed and scaled as a unit, with the combined change rate and load of both.</p>`
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>For Basket's product table, a table split is usually right: catalogue edits and stock levels change at wildly different rates and have different consumers, and a brief disagreement about a retired product is harmless. If stock and pricing needed to update in one atomic step, a data domain or consolidation would be worth considering.</p>`
        }
      ]
    },
    {
      id: "acid-vs-base",
      title: "From ACID to BASE",
      kicker: "What splitting does to transactions",
      blocks: [
        {
          type: "text",
          html: `<p>In the monolith, placing an order inserted the order, decremented stock and recorded the payment in one <strong>ACID</strong> transaction:</p>
<ul><li><strong>Atomic:</strong> all three happen or none do.</li>
<li><strong>Consistent:</strong> constraints hold before and after.</li>
<li><strong>Isolated:</strong> other transactions don't see the half-finished state.</li>
<li><strong>Durable:</strong> once committed, it survives crashes.</li></ul>
<p>Once orders, stock and payments live in different databases, there's no single transaction that spans them. Protocols like two-phase commit exist, but they hold locks across services while waiting for every participant, so one slow or failed participant blocks everyone. Most modern systems avoid them for exactly that reason.</p>`
        },
        {
          type: "idea",
          html: `<p>The alternative is <strong>BASE</strong>: <em>basically available</em> (the system keeps responding even when parts are down), <em>soft state</em> (data may be in flux and temporarily inconsistent) and <em>eventually consistent</em> (given time without new updates, all copies converge). Each service commits its own local transaction; the system as a whole becomes consistent a little later. The design work moves from "how do we lock everything?" to "how long can things disagree, what does the user see meanwhile, and what happens if a step fails?".</p>`
        },
        {
          type: "compare",
          items: [
            { title: "ACID, one database", tone: "info", html: `<p>Order, stock and payment commit together. Simple to reason about. Ties the three to one database, one quantum and one scaling unit.</p>` },
            { title: "BASE, three databases", tone: "warn", html: `<p>Each commits locally; the system converges over milliseconds to seconds. Services are independent, but the design must handle "order exists, stock not yet reserved" and failures midway.</p>` }
          ]
        }
      ]
    },
    {
      id: "eventual-consistency-patterns",
      title: "Three ways to reach eventual consistency",
      kicker: "Patterns",
      blocks: [
        {
          type: "text",
          html: `<p>Say a customer changes their delivery address in the account service, and delivery and billing each keep a copy. The book describes three patterns for bringing the copies into line.</p>`
        },
        {
          type: "text",
          html: `<p><strong>Background synchronisation.</strong> A separate job runs periodically (every hour, every night), compares the data stores and fixes differences. It doesn't slow down the user's request at all. But copies stay wrong for up to a full interval, and the job has to know the schema of every store it reconciles, so it reaches across every bounded context and must change whenever any of them change. It's often the leftover of a monolith's nightly batch.</p>
<p><strong>Orchestrated request-based.</strong> During the request itself, a service (the account service, or a dedicated orchestrator) updates every copy before replying to the user. Consistency is near-immediate if everything succeeds. But the user waits for all the calls, the update fails if any service is down, and the orchestrator must decide what to do when the second of three updates fails: retry, compensate the first, or report a partial success.</p>
<p><strong>Event-based.</strong> The account service commits its own change and publishes an <code>AddressChanged</code> event; delivery and billing subscribe and update their copies. The user gets a fast response, services are decoupled, and copies converge within seconds. The costs: you need reliable messaging (durable subscriptions, and publishing the event reliably with the database commit, often with an outbox table), and error handling moves to consumers, typically with retries and a dead-letter queue.</p>`
        },
        {
          type: "lab",
          id: "consistencyWindow",
          caption: "Lengthen the batch interval or increase updates per record: the stale-read share for background sync climbs while events stay low."
        },
        {
          type: "code",
          title: "Publishing reliably with an outbox (sketch)",
          lang: "sql",
          code: `BEGIN;
  UPDATE customer_address SET line1 = '12 Elm St', postcode = 'AB1 2CD' WHERE customer_id = 42;
  INSERT INTO outbox (id, type, payload)
       VALUES (gen_random_uuid(), 'AddressChanged', '{"customerId":42,"line1":"12 Elm St","postcode":"AB1 2CD"}');
COMMIT;
-- A relay process reads new outbox rows, publishes them to the broker, then marks them sent.
-- The event is published if and only if the address change committed.`
        },
        {
          type: "table",
          headers: ["", "Background sync", "Orchestrated request", "Event-based"],
          rows: [
            ["Time to consistency", "Up to one batch interval", "End of the request (if all succeed)", "Seconds"],
            ["User waits for", "Own service only", "Every update", "Own service only"],
            ["Coupling", "Job knows every schema", "Orchestrator knows every service", "Publisher knows only its event"],
            ["Failure handling", "Next run fixes it", "Orchestrator must decide", "Consumer retries, dead letters"],
            ["Good fit", "Legacy, low-value copies", "Small fan-out needing immediacy", "Most cross-service copies"]
          ]
        },
        {
          type: "quiz",
          q: "Basket's stock and catalogue services both write to the product table: catalogue edits details a few times a day; stock updates quantities thousands of times an hour. Using the delegate technique with operational characteristics priority, who owns the table?",
          options: ["Catalogue, because product is its core entity", "Stock, because it needs the fastest and most frequent writes", "Neither: a third service must own it", "Both, through a shared schema"],
          answer: 1,
          explain: `<p>Operational characteristics priority gives ownership to the service whose writes are most performance-critical, here stock. Domain priority would pick catalogue instead. The other service then delegates its writes through the owner's API.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `The service that writes a table owns it; readers are a separate problem.`,
    `Common ownership: give the table to a dedicated service and send it writes, ideally asynchronously.`,
    `Joint ownership: table split, data domain, delegate (by domain or operational priority) or consolidation, each with a different cost.`,
    `Split data means trading ACID for BASE: local commits, temporary inconsistency, and designed convergence.`,
    `Background sync, orchestrated request-based and event-based patterns trade time-to-consistency, user wait and coupling differently; events are usually the default.`
  ],
  furtherReading: [
    { title: "Transactional outbox pattern (microservices.io)", url: "https://microservices.io/patterns/data/transactional-outbox.html", note: "Publishing events reliably alongside a database commit." },
    { title: "Eventually Consistent (Werner Vogels)", url: "https://www.allthingsdistributed.com/2008/12/eventually_consistent.html", note: "A classic explanation of consistency models in distributed systems." }
  ]
};
