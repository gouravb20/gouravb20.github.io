// Deep dive: Chapter 2, Data models and query languages. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>You are building an online store. An order has a customer, a shipping address and a handful of line items, and your code holds it as one nested object. Storing it in PostgreSQL means splitting it across <code>orders</code>, <code>line_items</code> and <code>customers</code> and reassembling it with joins on every read. A teammate suggests MongoDB: store the order exactly as the code sees it, one document, one read. It works beautifully, until marketing asks "which customers in Lyon bought both a tent and a stove?" and product wants "people who bought what your friends bought".</p>
<p>The first request is easy in SQL and awkward in a document store. The second is awkward in both and natural in a graph database. The data did not change; the <em>questions</em> did. Chapter 2 is about how the shape of your data model decides which questions are cheap, which are painful, and what you give up when you choose.</p>`,
  sections: [
    {
      id: "why-models-matter",
      title: "Data models are layers, and each layer shapes your thinking",
      kicker: "Motivation",
      blocks: [
        {
          type: "text",
          html: `<p>Every application is built from layers of data models. You model the world as objects and data structures in your code. To store them you express them in a general-purpose model: tables, JSON documents or a graph. The database expresses that model as bytes in memory and on disk. The hardware represents those bytes as electrical charges and magnetic fields. Each layer hides the complexity of the one beneath it behind a clean model.</p>
<p>The model you choose at the second layer matters most to application developers, because it decides what is easy to express. Some operations are fast and natural in one model and contorted in another. Since rewriting a data layer is expensive, the choice tends to outlive the reasons you made it.</p>`,
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>Edgar Codd proposed the relational model in 1970. Before it, the dominant database was IBM's IMS (released in 1968), which used a <strong>hierarchical</strong> model: every record had exactly one parent, forming a tree. Trees were great for one-to-many data and terrible for many-to-many. Two fixes were proposed in the 1970s: the <strong>network model</strong> (CODASYL), which let a record have many parents linked by pointers, and the relational model, which put everything in tables and let the database find paths through joins. The relational model won, and it dominated business data processing for decades. That old debate is worth remembering, because document databases revisit it.</p>`,
        },
        {
          type: "text",
          html: `<h3>Why NoSQL appeared</h3>
<p>Around 2009 "NoSQL" became the umbrella term for a wave of non-relational databases. The motivations were real: scaling writes and data volume beyond a single relational server, preferring free and open-source software, query patterns poorly served by SQL, and frustration with rigid schemas. The result is <strong>polyglot persistence</strong>: one application might use a relational database for orders, a document store for a product catalog and a graph database for recommendations, each chosen for its access pattern.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Each layer of a system hides the one below it behind a data model.",
            "The general-purpose model you choose (relational, document, graph) decides which queries are natural and which are contortions.",
            "The hierarchical versus relational debate of the 1970s maps closely onto the document versus relational debate today.",
          ],
        },
      ],
    },
    {
      id: "document-model",
      title: "The document model: storing the tree as a tree",
      kicker: "Document versus relational",
      blocks: [
        {
          type: "problem",
          html: `<p>Application code thinks in nested objects: an order <em>contains</em> line items. The relational model stores flat rows in separate tables. Translating between the two on every read and write, usually through an ORM, is called the <strong>object-relational impedance mismatch</strong>. ORMs reduce the boilerplate but cannot remove the mismatch, and they introduce their own hazards such as the N+1 query problem (one query for the order, then one more per line item).</p>`,
        },
        {
          type: "idea",
          html: `<p>When data is a <strong>one-to-many tree</strong> that is usually loaded as a whole, store the entire tree as one self-contained document, typically JSON. One read fetches everything; there is nothing to reassemble.</p>`,
        },
        {
          type: "diagram",
          title: "The same order, two ways",
          caption: "Left: the relational model splits the order across tables linked by IDs, so a full read needs joins. Right: the document model stores the order and its items as one nested record.",
          svg: `<svg viewBox="0 0 620 280" role="img" aria-label="An order stored as three relational tables versus one JSON document">
<defs><marker id="ddia2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="155" y="22" text-anchor="middle" font-size="13" font-weight="700">Relational: three tables</text>
<rect x="20" y="40" width="130" height="80" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="85" y="60" text-anchor="middle" font-size="12" font-weight="700">orders</text>
<text x="30" y="82" font-size="12">id: 1001</text>
<text x="30" y="102" font-size="12">customer_id: 7</text>
<rect x="175" y="40" width="115" height="80" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="232" y="60" text-anchor="middle" font-size="12" font-weight="700">customers</text>
<text x="185" y="82" font-size="12">id: 7</text>
<text x="185" y="102" font-size="12">name: Priya</text>
<rect x="20" y="160" width="270" height="90" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="155" y="180" text-anchor="middle" font-size="12" font-weight="700">line_items</text>
<text x="30" y="205" font-size="12">order_id 1001, sku A12, qty 2</text>
<text x="30" y="228" font-size="12">order_id 1001, sku B07, qty 1</text>
<line x1="135" y1="97" x2="171" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia2-arrow)"/>
<line x1="85" y1="160" x2="85" y2="124" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia2-arrow)"/>
<line x1="310" y1="10" x2="310" y2="270" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<text x="470" y="22" text-anchor="middle" font-size="13" font-weight="700">Document: one tree</text>
<rect x="330" y="40" width="280" height="210" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-4)" stroke-width="2"/>
<g font-family="monospace" font-size="12">
<text x="345" y="62">{</text>
<text x="359" y="78">"order_id": 1001,</text>
<text x="359" y="94">"customer": {</text>
<text x="373" y="110">"id": 7, "name": "Priya"</text>
<text x="359" y="126">},</text>
<text x="359" y="142">"items": [</text>
<text x="373" y="158">{"sku": "A12", "qty": 2},</text>
<text x="373" y="174">{"sku": "B07", "qty": 1}</text>
<text x="359" y="190">]</text>
<text x="345" y="206">}</text>
</g>
<text x="470" y="235" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">one read, no joins</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Document databases (MongoDB, Couchbase, CouchDB, and many uses of DynamoDB) offer three advantages for this kind of data.</p>
<p><strong>Locality.</strong> A document is usually stored as one contiguous encoded blob (MongoDB uses BSON). Loading the order is one disk lookup, while the relational version may touch several indexes and tables. The advantage only holds if you need most of the document at once; reading one field still loads the whole thing, and updating a document often rewrites all of it. So keep documents reasonably small and avoid ever-growing arrays. MongoDB caps a document at 16 MB.</p>
<p><strong>A closer match to code.</strong> The document mirrors the object, so there is less mapping code and no ORM gymnastics.</p>
<p><strong>Schema flexibility.</strong> You can add a field without a migration (covered in the next section but one).</p>
<p>The weaknesses are the mirror image. You cannot point directly at a nested item ("the second line item of order 1001") the way a foreign key points at a row, though in practice you refer to it with a path. And support for joins is weaker, which is fine for a tree and painful for anything that is not a tree.</p>`,
        },
        {
          type: "quiz",
          q: "A product catalog stores each product with 5 to 20 attributes that vary by category, plus its images. Pages always show one whole product. Which model fits best, and why?",
          options: [
            "Relational, because joins are always faster",
            "Document, because each product is a self-contained record read as a unit and its attributes vary by category",
            "Graph, because products are related to categories",
            "It does not matter; all models perform the same",
          ],
          answer: 1,
          explain: "The access pattern is 'load one product and all its parts', and attributes differ between categories. That is a tree read as a unit, which is the document model's sweet spot: one lookup and no need for a sparse table with hundreds of nullable columns.",
        },
      ],
    },
    {
      id: "relationships",
      title: "Many-to-one and many-to-many: where trees stop working",
      kicker: "Relationships",
      blocks: [
        {
          type: "problem",
          html: `<p>Data rarely stays a tree. An order references a product, and many orders reference the same product (many-to-one). Users belong to groups, and groups have many users (many-to-many). In a pure tree each of these relationships forces you either to copy data into every document that needs it or to store an ID and look it up separately.</p>`,
        },
        {
          type: "text",
          html: `<h3>Normalization: store each fact once</h3>
<p>Suppose every customer document contains <code>"city": "Lyon"</code> as free text. Renaming or correcting it means finding and updating every copy, and copies that are missed drift out of sync. Store a <code>city_id</code> instead, pointing to one row that holds the name, and the fact lives in one place. That is <strong>normalization</strong>: anything meaningful to humans is stored once and referenced by an ID that has no meaning in itself, so it never needs to change.</p>
<p>Normalization creates many-to-one relationships, and those need joins. Relational databases do joins natively and the query optimizer chooses how. Document databases traditionally did not, so the application issues a second query and joins in code (MongoDB later added the <code>$lookup</code> aggregation stage, which helps but is not as general as SQL joins).</p>
<h3>Denormalization: copy on purpose</h3>
<p>The alternative is to duplicate data where it is read, trading write complexity for read speed. Sometimes a copy is actually the correct model: an order should record the customer's name and shipping address <em>as they were when the order was placed</em>, not as they are today. That is a snapshot, not a stale copy. The danger is copies that are supposed to stay in sync and do not.</p>`,
        },
        {
          type: "diagram",
          title: "Trees versus graphs",
          caption: "One-to-many data forms a tree and fits a document. Many-to-many data forms a graph, and a document store can represent it only through references or duplicated data.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Left: an order with three children forms a tree. Right: users and groups connected many-to-many form a graph">
<rect x="90" y="30" width="120" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="55" text-anchor="middle" font-size="12" font-weight="700">Order 1001</text>
<rect x="15" y="150" width="85" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="57" y="175" text-anchor="middle" font-size="12">Item A12</text>
<rect x="108" y="150" width="85" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="150" y="175" text-anchor="middle" font-size="12">Item B07</text>
<rect x="201" y="150" width="85" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="243" y="175" text-anchor="middle" font-size="12">Address</text>
<line x1="150" y1="70" x2="57" y2="150" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="150" y1="70" x2="150" y2="150" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="150" y1="70" x2="243" y2="150" stroke-width="2" style="stroke: var(--dg-muted)"/>
<text x="150" y="225" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">One-to-many: a tree</text>
<line x1="310" y1="10" x2="310" y2="240" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<rect x="340" y="30" width="90" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="385" y="53" text-anchor="middle" font-size="12">Ana</text>
<rect x="340" y="95" width="90" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="385" y="118" text-anchor="middle" font-size="12">Ben</text>
<rect x="340" y="160" width="90" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="385" y="183" text-anchor="middle" font-size="12">Chen</text>
<rect x="510" y="30" width="90" height="36" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="555" y="53" text-anchor="middle" font-size="12">Hiking</text>
<rect x="510" y="95" width="90" height="36" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="555" y="118" text-anchor="middle" font-size="12">Chess</text>
<rect x="510" y="160" width="90" height="36" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="555" y="183" text-anchor="middle" font-size="12">Jazz</text>
<line x1="430" y1="48" x2="510" y2="48" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="430" y1="48" x2="510" y2="113" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="430" y1="113" x2="510" y2="113" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="430" y1="113" x2="510" y2="178" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="430" y1="178" x2="510" y2="48" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="430" y1="178" x2="510" y2="178" stroke-width="2" style="stroke: var(--dg-muted)"/>
<text x="470" y="225" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Many-to-many: a graph</text>
</svg>`,
        },
        {
          type: "compare",
          title: "Three ways a document store handles users and groups",
          items: [
            { title: "Embed on both sides", tone: "warn", html: "Each user lists its group IDs and each group lists its user IDs. Reads are fast, but every membership change updates two documents, and without multi-document transactions they can disagree." },
            { title: "References and application joins", tone: "info", html: "Users store group IDs; the app fetches the groups with a second query. Consistent, but every page pays extra round trips and the N+1 pattern creeps in." },
            { title: "A membership collection", tone: "ok", html: "One document per (user, group) pair. Clean and consistent, and it is exactly a relational join table, which is a hint that the data wanted to be relational." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The network model of the 1970s let records have several parents, linked by pointers. To reach a record you had to follow an <em>access path</em> by hand, and changing the access paths meant rewriting application code. The relational model's real breakthrough was the query optimizer: you declare what you want and the database picks the path, so adding an index never requires changing queries. When a document database encourages you to embed IDs and follow them in code, you are partway back to hand-written access paths.</p>`,
        },
        {
          type: "quiz",
          q: "Your document-based app embeds each author's display name in every comment they write. Authors can rename themselves. What is the core problem, and the standard fix?",
          options: [
            "Documents are too big; split comments into a separate database",
            "The name is denormalized, so a rename must update every comment; store an author ID and look up the name, or accept a background job that rewrites copies",
            "Comments should be stored in a graph database",
            "The name should be stored as an array",
          ],
          answer: 1,
          explain: "The display name is a fact about the author that is duplicated into many places, a many-to-one relationship stored as copies. Normalizing (store author_id and join or cache the name) keeps one source of truth. If reads are hot, a cached copy updated asynchronously is a deliberate denormalization with a staleness window.",
        },
      ],
    },
    {
      id: "schema-flexibility",
      title: "Schema-on-read versus schema-on-write",
      kicker: "Schemas",
      blocks: [
        {
          type: "text",
          html: `<p>Document databases are often called <em>schemaless</em>, which is misleading. The code that reads the data always assumes some structure: it expects a field called <code>email</code> containing a string. The real difference is <em>where</em> the schema is enforced.</p>
<p><strong>Schema-on-write</strong> (relational): the database has an explicit schema and rejects writes that do not conform. <strong>Schema-on-read</strong> (document): the database accepts any structure, and the structure is interpreted when the data is read. It is a lot like static versus dynamic type checking in programming languages, and it attracts similarly heated opinions.</p>`,
        },
        {
          type: "code",
          title: "Adding a currency to orders: two approaches",
          lang: "text",
          code: `-- Schema-on-write: change the schema, and every existing row gets the default
ALTER TABLE orders ADD COLUMN currency char(3) NOT NULL DEFAULT 'USD';

// Schema-on-read: new code writes the field and copes with old documents
const currency = order.currency ?? "USD";   // orders placed before multi-currency launch`,
          caption: "Both work. The relational version gives all rows the same shape at once; the document version leaves old and new shapes side by side, and every reader, in every service, must remember the fallback.",
        },
        {
          type: "tradeoffs",
          prosLabel: "Schema-on-read helps when",
          consLabel: "Schema-on-write helps when",
          pros: [
            "Records are heterogeneous: many types of object that do not justify a table each",
            "The structure is controlled by an external system you do not own and that may change at any time",
            "You iterate fast and want to add fields without coordinating a migration",
          ],
          cons: [
            "All records are expected to have the same structure, and you want the database to guarantee it",
            "Many applications read the same data, so a documented, enforced schema prevents each from guessing",
            "You prefer errors at write time over discovering malformed records in production months later",
          ],
        },
        {
          type: "text",
          html: `<p>A common worry about schema-on-write is that migrations are slow. That depends on the database and the change. Adding a nullable column has long been cheap in most relational databases. Rewriting every row (to fill a new column with computed values, for example) is slow on any large table in any model, and online schema change tools exist precisely to do it gradually.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>The two camps have converged since 2017. PostgreSQL 11 (2018) made adding a column with a constant default nearly instant instead of rewriting the table, and MySQL 8.0 added instant column additions for InnoDB. Meanwhile document databases added optional enforcement: MongoDB supports <code>$jsonSchema</code> validation rules on collections, and PostgreSQL's <code>jsonb</code> type plus GIN indexes lets a relational table hold flexible documents. Many teams now use a relational database with a few JSON columns rather than choosing one model exclusively.</p>`,
        },
        {
          type: "quiz",
          q: "A team says 'we chose MongoDB so we don't need a schema.' Six months later, a service crashes on records missing a field. What does this illustrate?",
          options: [
            "MongoDB has a bug",
            "Schema-on-read moves the schema into every reader; without discipline, old and malformed shapes surface at read time",
            "They should have used a graph database",
            "Documents should never have optional fields",
          ],
          answer: 1,
          explain: "There was always a schema: the assumptions in the reading code. Schema-on-read just stops the database from enforcing it, so every reader must handle every historical shape. Validation rules, versioned documents or background migrations are the usual remedies.",
        },
      ],
    },
    {
      id: "query-languages",
      title: "Declarative queries and why SQL won",
      kicker: "Query languages",
      blocks: [
        {
          type: "problem",
          html: `<p>Old databases such as IMS and CODASYL were queried <strong>imperatively</strong>: your code walked records and pointers step by step. That ties the program to the physical layout. If the database adds an index or changes storage order, imperative code cannot benefit unless someone rewrites it, and it cannot be parallelized without the programmer reasoning about every step.</p>`,
        },
        {
          type: "idea",
          html: `<p>A <strong>declarative</strong> language states the <em>result</em> you want (which rows, which conditions, what sort order), not the algorithm. The database's query optimizer chooses indexes, join order and join algorithms, and can change its choice as data grows, without any change to your query.</p>`,
        },
        {
          type: "code",
          title: "Same question, two styles",
          lang: "text",
          code: `-- Declarative (SQL): what you want
SELECT name FROM products WHERE category = 'tents' AND price < 200;

// Imperative: how to get it
const result = [];
for (const p of products) {
  if (p.category === "tents" && p.price < 200) result.push(p.name);
}`,
          caption: "The loop fixes an order of evaluation and a full scan. The SQL leaves the database free to use an index on category, scan in parallel, or read a precomputed result.",
        },
        {
          type: "text",
          html: `<p>The same lesson shows up outside databases. A Kubernetes manifest declares the desired state ("three replicas of this container") and controllers work out the steps to get there and keep it there; a shell script that starts three containers is imperative and does nothing when one of them dies later.</p>
<h3>MapReduce querying</h3>
<p>MapReduce, popularized by Google, sits between the two styles. You write two functions in a general-purpose language: a <em>map</em> function that emits key-value pairs for each record, and a <em>reduce</em> function that combines all values for one key. The framework handles distribution and parallelism, but the functions must be pure (no side effects, no extra database queries) so they can run anywhere and be retried. Several NoSQL databases offered MapReduce as a query interface, including MongoDB and CouchDB.</p>
<p>It turned out that writing two coordinated functions is harder than writing one query, so declarative layers kept appearing on top: Hive and later Spark SQL for Hadoop-style processing, and MongoDB's <strong>aggregation pipeline</strong>, a JSON-shaped query language similar in spirit to SQL.</p>`,
        },
        {
          type: "table",
          headers: ["", "Imperative", "Declarative"],
          rows: [
            ["You specify", "The algorithm, step by step", "The result you want"],
            ["Optimization", "Your job, and frozen in code", "The engine's job, and improves over time"],
            ["Parallelism", "Hard: code fixes the order of operations", "Easier: the engine can split work"],
            ["Examples", "Loops over records, CODASYL navigation, DOM APIs", "SQL, Cypher, SPARQL, Datalog, CSS selectors"],
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>MongoDB deprecated its <code>mapReduce</code> command in version 5.0 (2021) and recommends the aggregation pipeline instead. Across the industry, SQL has become the common interface even for systems that are not relational underneath: Spark, Flink, Kafka-based stream processors and most cloud data warehouses all accept SQL.</p>`,
        },
      ],
    },
    {
      id: "graph-models",
      title: "Graph models: when everything connects to everything",
      kicker: "Graphs",
      blocks: [
        {
          type: "problem",
          html: `<p>When many-to-many relationships are the norm rather than the exception, and the interesting questions involve following chains of relationships of unknown length ("anyone within three hops of Ana who lives in Lyon"), tables become awkward. In SQL each hop is another join, and a variable number of hops needs a recursive common table expression (<code>WITH RECURSIVE</code>), which is verbose and harder to optimize.</p>`,
        },
        {
          type: "text",
          html: `<p>A graph has <strong>vertices</strong> (nodes) and <strong>edges</strong> (relationships). Social networks, road networks, citation networks, fraud rings and knowledge bases are naturally graphs. Graphs are also flexible: one graph can hold people, companies, cities and products, with edges of many types between them, and new kinds of relationship can be added without changing a schema.</p>
<h3>Property graphs</h3>
<p>In the property graph model (Neo4j, Amazon Neptune, JanusGraph, Memgraph), every vertex and every edge has a label and a set of key-value properties, and each edge has a direction. You can think of it as two relational tables, one of vertices and one of edges with a tail vertex, a head vertex and a label, but with query languages and storage designed to follow edges quickly in both directions.</p>`,
        },
        {
          type: "diagram",
          title: "A small property graph",
          caption: "People, a company and a city, connected by labeled, directed edges. Any vertex can connect to any other, and new edge types can be added freely.",
          svg: `<svg viewBox="0 0 600 280" role="img" aria-label="Property graph: Ana knows Ben, Ben knows Chen, Ana and Ben work at Acme, Acme is located in Lyon, Chen lives in Lyon">
<defs><marker id="ddia2-garrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="15" y="22" width="90" height="36" rx="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="60" y="45" text-anchor="middle" font-size="13" font-weight="700">Ana</text>
<rect x="255" y="22" width="90" height="36" rx="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="300" y="45" text-anchor="middle" font-size="13" font-weight="700">Ben</text>
<rect x="495" y="22" width="90" height="36" rx="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="540" y="45" text-anchor="middle" font-size="13" font-weight="700">Chen</text>
<rect x="135" y="182" width="90" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="180" y="205" text-anchor="middle" font-size="13" font-weight="700">Acme</text>
<rect x="435" y="182" width="90" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="480" y="205" text-anchor="middle" font-size="13" font-weight="700">Lyon</text>
<line x1="105" y1="40" x2="251" y2="40" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia2-garrow)"/>
<text x="180" y="32" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">KNOWS</text>
<line x1="345" y1="40" x2="491" y2="40" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia2-garrow)"/>
<text x="420" y="32" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">KNOWS</text>
<line x1="60" y1="58" x2="162" y2="179" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia2-garrow)"/>
<text x="98" y="125" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">WORKS_AT</text>
<line x1="300" y1="58" x2="198" y2="179" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia2-garrow)"/>
<text x="262" y="125" font-size="12" style="fill: var(--dg-muted)">WORKS_AT</text>
<line x1="540" y1="58" x2="497" y2="179" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia2-garrow)"/>
<text x="530" y="125" font-size="12" style="fill: var(--dg-muted)">LIVES_IN</text>
<line x1="225" y1="200" x2="431" y2="200" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia2-garrow)"/>
<text x="328" y="192" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">LOCATED_IN</text>
<circle cx="150" cy="258" r="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="164" y="262" font-size="12">Person</text>
<rect x="260" y="251" width="14" height="14" rx="3" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="281" y="262" font-size="12">Company</text>
<rect x="380" y="251" width="14" height="14" rx="3" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="401" y="262" font-size="12">City</text>
</svg>`,
        },
        {
          type: "code",
          title: "Cypher: people within two hops of Ana who live where her employer is located",
          lang: "text",
          code: `MATCH (ana:Person {name: 'Ana'})-[:KNOWS*1..2]->(p:Person),
      (p)-[:LIVES_IN]->(city:City),
      (ana)-[:WORKS_AT]->(:Company)-[:LOCATED_IN]->(city)
RETURN p.name`,
          caption: "On the graph above this returns Chen. The variable-length pattern KNOWS*1..2 replaces what would be a recursive query in SQL; the engine decides where to start the search.",
        },
        {
          type: "text",
          html: `<h3>Triple stores and Datalog</h3>
<p>A <strong>triple store</strong> represents everything as (subject, predicate, object) statements, such as <code>(ana, knows, ben)</code> or <code>(ana, age, 34)</code>. When the object is another entity, the triple is an edge; when it is a value, it is a property. RDF is the standard data format, from the semantic web effort, and <strong>SPARQL</strong> is its query language. Wikidata, for example, exposes a public SPARQL endpoint.</p>
<p><strong>Datalog</strong> is older still, a subset of Prolog from the 1980s research world. You define <em>rules</em> that derive new facts from existing ones, and rules can refer to themselves, which makes recursive queries like "everyone reachable from Ana" natural. Datomic uses Datalog as its query language. Cypher and SPARQL are more convenient for one-off queries; Datalog shines when you build complex queries from small, reusable rules.</p>`,
        },
        {
          type: "table",
          title: "Choosing a model",
          headers: ["", "Relational", "Document", "Graph"],
          rows: [
            ["Shape", "Tables joined by keys", "Self-contained trees", "Vertices and edges"],
            ["Many-to-many", "Natural via join tables", "Awkward (references or copies)", "Natural, and multi-hop is cheap"],
            ["Schema", "Enforced on write", "Interpreted on read", "Flexible labels and properties"],
            ["Typical queries", "Ad hoc filters, joins, aggregates", "Load or update one record", "Traversals of unknown depth"],
            ["Examples", "PostgreSQL, MySQL, SQL Server", "MongoDB, Couchbase, CouchDB", "Neo4j, Neptune, JanusGraph"],
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Graph querying has been standardized since the book was written. SQL:2023 added SQL/PGQ, which lets you define a property graph over ordinary relational tables and query it with graph patterns, and ISO published GQL, a standalone graph query language heavily influenced by Cypher, in 2024. The distinction between "relational database" and "graph database" is becoming a matter of storage and performance rather than of query language.</p>`,
        },
        {
          type: "quiz",
          q: "A bank wants to flag accounts that are connected to a known fraudulent account through any chain of up to four shared phone numbers, devices or addresses. Which model makes this query most natural?",
          options: [
            "Document, embedding each account's devices",
            "Relational with one join per hop, written out by hand",
            "Graph, using a variable-length path pattern",
            "Key-value, keyed by account ID",
          ],
          answer: 2,
          explain: "The question is a traversal of unknown depth across several relationship types, which is exactly what graph pattern languages express directly. SQL can do it with recursive queries, but they are verbose and harder to optimize, and a document model would require the application to follow references one hop at a time.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Data modeling comes up whenever you pick a database or sketch a schema, which is in every design interview. The weak answer is a brand name ("let's use MongoDB, it scales"). The strong answer starts from the shape of the data and the queries: what is read together, what refers to what, and which relationships are many-to-many.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A good way to justify a data model in under a minute:</p>
<ol>
<li>Describe the access pattern: "an order is always loaded with its items" (tree, document-friendly) or "we filter and aggregate across customers and products" (relational).</li>
<li>Name the relationships: one-to-many fits a document; many-to-one and many-to-many push toward relational, and deep multi-hop traversals toward a graph.</li>
<li>Say where the schema is enforced and how you will evolve it.</li>
<li>Admit the cost: denormalized copies need a plan to stay in sync; joins need indexes.</li>
</ol>
<p>Ending with "use each model where it fits, and keep them in sync with change data capture" shows you know polyglot persistence and its price.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Relational with documents inside", html: "The <code>jsonb</code> type stores binary JSON that can be indexed with GIN indexes and queried with operators, so one table can mix enforced columns with a flexible document column. It is a common middle path between the models." },
            { org: "MongoDB", title: "Documents that learned joins and transactions", html: "MongoDB added the <code>$lookup</code> stage for joins in 3.2 and multi-document ACID transactions in 4.0 (2018), extended to sharded clusters in 4.2. It narrowed the gap with relational databases, though modeling guidance still favors embedding data that is read together." },
            { org: "Neo4j", title: "Native property graph", html: "Neo4j stores relationships as direct references between records, so following an edge does not require an index lookup. Its Cypher language was opened up as openCypher and influenced the ISO GQL standard." },
          ],
        },
        {
          type: "quiz",
          q: "You are designing a recipe site. Recipes have steps and ingredients, users save favorites, and users follow other users. Which modeling choice is most defensible?",
          options: [
            "Store everything, including follows and favorites, embedded in one giant document per user",
            "Use a graph database for everything, because recipes are connected to ingredients",
            "Store each recipe (steps and ingredients) as a document or a JSON column, and keep users, favorites and follows in relational tables or a separate graph",
            "Use a key-value store with no secondary indexes",
          ],
          answer: 2,
          explain: "A recipe with its steps is a tree read as a unit, so a document fits. Favorites and follows are many-to-many relationships between entities that are queried in both directions, which is relational (or graph) territory. Mixing models where each fits is normal; embedding everything per user would make 'who favorited this recipe?' painful.",
        },
      ],
    },
  ],
  takeaways: [
    "Your data model decides which questions are cheap. Choose it from the access patterns and relationships, not from fashion.",
    "Documents fit one-to-many trees that are read as a unit: better locality and less mapping code, at the cost of weak joins and whole-document rewrites.",
    "Many-to-one and many-to-many relationships push toward normalization and joins, which is relational territory; deep traversals of unknown length push toward graphs.",
    "Schemaless really means schema-on-read: the schema lives in every reader instead of the database. It suits heterogeneous data; schema-on-write suits uniform data shared by many readers.",
    "Declarative languages (SQL, Cypher, SPARQL) let the engine choose the execution plan and improve it over time; imperative access ties code to the physical layout.",
    "The models are converging: relational databases store JSON and speak graph queries (SQL/PGQ), document databases offer joins, transactions and validation.",
  ],
  furtherReading: [
    { title: "A Relational Model of Data for Large Shared Data Banks (E. F. Codd, 1970)", note: "The paper that introduced the relational model and the idea of separating logical data from physical access paths." },
    { title: "MongoDB data modeling documentation", url: "https://www.mongodb.com/docs/manual/data-modeling/", note: "Official guidance on when to embed and when to reference." },
    { title: "Neo4j Cypher Manual", url: "https://neo4j.com/docs/cypher-manual/current/", note: "Pattern matching, variable-length paths and how Cypher queries are planned." },
  ],
};
