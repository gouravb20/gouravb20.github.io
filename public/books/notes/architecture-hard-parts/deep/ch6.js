// Deep dive: Chapter 6, Pulling apart operational data. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>Basket now has six domain services, deployed separately, all pointing at the same 400-table database. Releases are faster, and most people would call the migration done. Then the delivery team wants to rename <code>orders.slot_ref</code>, and it takes three weeks to find out which services read that column. The catalogue team wants a search engine instead of <code>LIKE</code> queries, but the database is shared. A runaway reporting query locks a table checkout needs at lunchtime.</p>
<p>Splitting code was the easy half. Data is stateful, long-lived, full of relationships, and the business can't afford to lose or corrupt it, so the book gives it a separate analysis: forces that justify splitting a database, forces that argue for keeping it together, a stepwise process for doing it safely, and a way to choose database types once each domain can pick its own.</p>`,
  sections: [
    {
      id: "why-data-is-harder",
      title: "Why data is the hard half",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Code can be rolled back in minutes. A botched data migration can't: rows get written, read, acted on and emailed to customers before anyone notices. Data also encodes relationships the code takes for granted: foreign keys, joins in reports, triggers that update totals, stored procedures shared by several features. Every one of those becomes a problem the moment two tables live in different databases.</p>`
        },
        {
          type: "idea",
          html: `<p>Treat database decomposition as its own decision with its own forces. The book calls the forces that justify splitting <strong>data disintegrators</strong> and the forces that resist it <strong>data integrators</strong>. You split a particular group of tables only when the disintegrators acting on it outweigh the integrators, and you do it through small, reversible steps.</p>`
        }
      ]
    },
    {
      id: "disintegrators",
      title: "Data disintegrators: reasons to split",
      kicker: "Forces that push apart",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Change control.</strong> In a shared database, every schema change is a potential breaking change for unknown consumers. Teams either coordinate every change (slow) or stop changing the schema (worse). When each domain owns its tables privately, schema changes become local decisions again; other services see only the owner's API.</p>
<p><strong>Connection management.</strong> Every instance of every service holds a connection pool. Scale out enough and the database's connection limit becomes a hard ceiling that appears suddenly, during exactly the traffic spike you scaled out for.</p>`
        },
        {
          type: "lab",
          id: "connectionBudget",
          caption: "Add services and instances until the shared server runs out; then compare splitting the data with adding a pooler."
        },
        {
          type: "text",
          html: `<p><strong>Scalability.</strong> A shared database must absorb the combined load of every service. Catalogue browsing (read-heavy, spiky) and checkout (write-heavy, critical) compete for the same CPU, memory and locks. Separate databases scale with their own workloads.</p>
<p><strong>Fault tolerance.</strong> A shared database is a single point of failure for the whole system, however many services sit in front of it. Splitting limits a database outage to the domain that owns it.</p>
<p><strong>Architecture quantum.</strong> As Chapter 2 showed, services sharing a database form one quantum. If two domains need different operational characteristics, their data must separate too.</p>
<p><strong>Database-type optimisation.</strong> A relational database is a reasonable compromise for everything and the best fit for only some things. Once data is split, the cart can use a key-value store, search can use a search engine, and payments can stay relational.</p>`
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>A connection pooler (PgBouncer, ProxySQL, RDS Proxy) is a perfectly good answer to connection exhaustion alone. Split the database when several disintegrators apply together, not just to dodge a connection limit.</p>`
        }
      ]
    },
    {
      id: "integrators",
      title: "Data integrators: reasons to keep it together",
      kicker: "Forces that pull together",
      blocks: [
        {
          type: "text",
          html: `<p>Two forces resist splitting, and they can be strong enough to win.</p>
<p><strong>Data relationships.</strong> Foreign keys, views, triggers and stored procedures tie tables together. Split them across databases and referential integrity becomes an application concern, joins become service calls or copies, and views spanning domains stop working. The more tightly tables are related, the more work and risk a split carries.</p>
<p><strong>Database transactions.</strong> In one database, "create the order, decrement stock and record the payment" is one ACID transaction: it either all happens or none of it does. Across databases, there's no such thing without a distributed transaction protocol, which most modern systems avoid. The workflow must become eventually consistent with compensation or explicit states, as Chapters 9 and 12 explore.</p>`
        },
        {
          type: "compare",
          title: "Weighing it for two Basket table groups",
          items: [
            { title: "Catalogue tables", tone: "ok", html: `<p><strong>Disintegrators:</strong> search wants a different engine; read load dwarfs everything else; schema changes weekly.</p><p><strong>Integrators:</strong> orders reference product IDs, but only by key.</p><p><strong>Verdict:</strong> split.</p>` },
            { title: "Orders + order lines + payments", tone: "warn", html: `<p><strong>Disintegrators:</strong> payments want a separate audit scope.</p><p><strong>Integrators:</strong> created together in one transaction; heavily joined; foreign keys everywhere.</p><p><strong>Verdict:</strong> keep orders and lines together; split payments only with an explicit order state machine.</p>` }
          ]
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The question to take to the business is not "may we split the database?" but "does this workflow truly need to be all-or-nothing, or can it pass through visible intermediate states?". If the answer is all-or-nothing, the tables probably belong in one database.</p>`
        }
      ]
    },
    {
      id: "five-steps",
      title: "Five steps to split a monolithic database",
      kicker: "The process",
      blocks: [
        {
          type: "text",
          html: `<p>The book describes an incremental process designed so that the risky part, physically moving data, happens last, after the code no longer depends on cross-domain access.</p>`
        },
        {
          type: "diagram",
          title: "From one database to one per domain",
          caption: "Steps 1-3 happen inside the existing database server: tables move into domain schemas and each service is restricted to its own. Only then, in steps 4-5, do schemas move to separate servers.",
          svg: `<svg viewBox="0 0 660 240" role="img" aria-label="Five steps of database decomposition">
<defs><marker id="ahp6-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="11" text-anchor="middle">
<text x="65" y="18" font-weight="700" font-size="12">1. Analyse</text>
<rect x="15" y="30" width="100" height="120" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="65" y="60">400 tables</text><text x="65" y="80" style="fill: var(--dg-muted)">tag each with</text><text x="65" y="94" style="fill: var(--dg-muted)">a data domain</text>
<text x="195" y="18" font-weight="700" font-size="12">2. Assign</text>
<rect x="145" y="30" width="100" height="120" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="155" y="42" width="80" height="22" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="195" y="57">ordering</text>
<rect x="155" y="70" width="80" height="22" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="195" y="85">catalogue</text>
<rect x="155" y="98" width="80" height="22" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="195" y="113">delivery</text>
<text x="195" y="140" style="fill: var(--dg-muted)">schemas, 1 server</text>
<text x="325" y="18" font-weight="700" font-size="12">3. Separate connections</text>
<rect x="275" y="30" width="100" height="120" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="285" y="42" width="80" height="22" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="285" y="70" width="80" height="22" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="285" y="98" width="80" height="22" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="325" y="140" style="fill: var(--dg-muted)">each service: own schema</text>
<text x="455" y="18" font-weight="700" font-size="12">4. Move schemas</text>
<rect x="415" y="34" width="80" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="455" y="54">ordering DB</text>
<rect x="415" y="74" width="80" height="30" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="455" y="94">catalogue DB</text>
<rect x="415" y="114" width="80" height="30" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/><text x="455" y="134">delivery DB</text>
<text x="590" y="18" font-weight="700" font-size="12">5. Switch over</text>
<rect x="545" y="30" width="90" height="120" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="5 4"/>
<text x="590" y="80" style="fill: var(--dg-muted)">old server</text><text x="590" y="96" style="fill: var(--dg-muted)">retired</text>
<line x1="115" y1="90" x2="143" y2="90" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp6-arr)"/>
<line x1="245" y1="90" x2="273" y2="90" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp6-arr)"/>
<line x1="375" y1="90" x2="413" y2="90" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp6-arr)"/>
<line x1="495" y1="90" x2="543" y2="90" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp6-arr)"/>
<text x="195" y="190" font-size="12" style="fill: var(--dg-muted)">cross-schema joins become violations to fix</text>
<text x="525" y="190" font-size="12" style="fill: var(--dg-muted)">replicate, verify, cut over</text>
<line x1="20" y1="205" x2="380" y2="205" style="stroke: var(--dg-ok)" stroke-width="3"/>
<text x="200" y="225" font-size="12" style="fill: var(--dg-ok)">reversible, low risk</text>
<line x1="410" y1="205" x2="640" y2="205" style="stroke: var(--dg-3)" stroke-width="3"/>
<text x="525" y="225" font-size="12" style="fill: var(--dg-3)">data moves</text>
</g>
</svg>`
        },
        {
          type: "steps",
          items: [
            `<strong>Analyse the database and create data domains.</strong> Tag every table with the domain it belongs to. Tables that several domains write to are the interesting ones; note them for the ownership analysis in Chapter 9.`,
            `<strong>Assign tables to data domains.</strong> Move each table into a schema named for its domain (<code>ordering.orders</code>, <code>catalogue.products</code>). Code that joins across schemas is now visibly crossing a boundary; replace those joins with calls to the owning service or with a local copy of the needed columns (Chapter 10).`,
            `<strong>Separate database connections.</strong> Give each service credentials that can only access its own schema. Anything that still reaches across fails loudly in testing rather than silently in production.`,
            `<strong>Move schemas to separate database servers.</strong> Replicate a schema to a new server, verify the copy, then point the owning service at it. Repeat per domain.`,
            `<strong>Switch over.</strong> Remove the old connections and decommission the shared server once nothing uses it.`
          ]
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>The tempting shortcut is to jump straight to step 4: stand up new databases, copy tables, and fix whatever breaks. That combines discovering hidden dependencies with moving data, so every surprise happens during the riskiest operation. Steps 2 and 3 exist to surface surprises while they're still cheap.</p>`
        }
      ]
    },
    {
      id: "choosing-a-database",
      title: "Choosing a database type per domain",
      kicker: "Once you can choose",
      blocks: [
        {
          type: "text",
          html: `<p>With data split, each domain can use the database that fits it. The book compares types on a consistent set of characteristics: ease of learning, ease of data modelling, scalability and throughput, availability and partition tolerance, consistency, programming language support, product maturity, SQL support and community. The ratings shift as products evolve, so the useful part is the set of questions, not any fixed scores.</p>`
        },
        {
          type: "table",
          headers: ["Basket domain", "Access pattern", "Reasonable fit", "Why"],
          rows: [
            ["Cart", "Get/put whole cart by customer ID, high churn", "Key-value (Redis, DynamoDB)", "Single-key access, simple scaling, TTL for abandoned carts"],
            ["Catalogue search", "Full-text, facets, typo tolerance", "Search engine (OpenSearch)", "Relevance ranking and faceting built in"],
            ["Product details", "Nested attributes that vary by category", "Document (MongoDB, Postgres JSONB)", "Flexible schema per aggregate"],
            ["Orders and payments", "Multi-row transactions, audit, ad-hoc queries", "Relational (Postgres, SQL Server)", "ACID, constraints, mature tooling"],
            ["Driver locations", "Append every few seconds, query by time window", "Time series (TimescaleDB, InfluxDB)", "Compression and time-ranged queries"],
            ["Substitution suggestions", "\"Customers who bought X also bought\"", "Graph (Neo4j) or precomputed tables", "Relationship traversal"]
          ]
        },
        {
          type: "tradeoffs",
          title: "Polyglot persistence",
          pros: [
            `Each domain gets a database shaped for its access pattern.`,
            `Workloads can't interfere with each other.`,
            `Domains can scale storage independently.`
          ],
          cons: [
            `More technologies to operate, monitor, back up and secure.`,
            `Expertise spreads thin across many engines.`,
            `Cross-domain reporting needs a separate analytical path (Chapter 14).`
          ]
        },
        {
          type: "quiz",
          q: "Basket wants to move the catalogue tables to their own database. Which step should come first?",
          options: ["Provision a search engine and copy the data", "Move catalogue tables into their own schema and replace cross-schema joins", "Turn off the foreign keys from order lines to products", "Give every service read access to the new database"],
          answer: 1,
          explain: `<p>Assigning tables to a domain schema (step 2) exposes every query that crosses the boundary while the data is still on one server. Fixing those first means the later physical move has no surprises.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Data is the hard half of decomposition: stateful, long-lived, full of relationships and unforgiving of mistakes.`,
    `Disintegrators (change control, connections, scale, fault tolerance, quanta, database type) push data apart; integrators (relationships, transactions) hold it together.`,
    `Ask the business whether a workflow truly must be all-or-nothing; if so, its tables likely belong together.`,
    `Split in five steps: analyse, assign tables to domain schemas, separate connections, move schemas to servers, switch over.`,
    `Once split, choose database types per domain by access pattern, and budget for the operational cost of polyglot persistence.`
  ],
  furtherReading: [
    { title: "Refactoring Databases (Ambler, Sadalage)", note: "Co-authored by one of this book's authors; patterns for evolving schemas safely." },
    { title: "Monolith to Microservices (Sam Newman)", note: "Detailed database decomposition patterns such as the strangler and change data capture." },
    { title: "PgBouncer", url: "https://www.pgbouncer.org/", note: "A lightweight PostgreSQL connection pooler." }
  ]
};
