// Deep dive: Appendix, The Neo4j environment. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.appx = {
  hook: `<p>Your extraction pipeline from chapter 6 times out halfway through a batch, so the scheduler retries it. The next morning the dashboard says you have twice as many contracts as last week. Nothing failed loudly: the import ran twice, and each run created its own copy of every contract it touched.</p>
<p>Every chapter of the book stores its data in Neo4j, and most of the subtle bugs in graph-backed RAG come from a handful of database basics: how nodes and relationships are modeled, how Cypher patterns match, the difference between <code>CREATE</code> and <code>MERGE</code>, and which plugins provide schema inference and community detection. This appendix covers exactly those basics.</p>`,
  sections: [
    {
      id: "native-graph",
      title: "What a native graph database stores",
      kicker: "The model",
      blocks: [
        {
          type: "text",
          html: `<p>Neo4j stores two kinds of first-class elements. <strong>Nodes</strong> represent things and carry one or more <strong>labels</strong> (<code>Person</code>, <code>Movie</code>) plus key-value <strong>properties</strong>. <strong>Relationships</strong> connect exactly two nodes, always have one <strong>type</strong> (<code>ACTED_IN</code>) and a direction, and can carry properties too. This is called the <em>labeled property graph</em> model.</p>
<p>"Native" means relationships are stored as records that point directly at the nodes they connect, rather than being reconstructed from foreign keys at query time. Following a relationship is a pointer hop, which is why multi-hop traversals stay cheap; Neo4j calls this index-free adjacency. Neo4j is implemented in Java, supports ACID transactions, and is queried with Cypher over its binary Bolt protocol (default port 7687) or HTTP (default port 7474).</p>`,
        },
        {
          type: "diagram",
          title: "The labeled property graph",
          caption: "Two nodes with labels and properties, connected by a typed, directed relationship that has its own property.",
          svg: `<svg viewBox="0 0 640 245" role="img" aria-label="A Person node for Tom Hanks connected by an ACTED_IN relationship with a roles property to a Movie node for Apollo 13">
<defs><marker id="grA-arr-pg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<circle cx="130" cy="115" r="70" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="130" y="98" text-anchor="middle" font-size="14" font-weight="700">:Person</text>
<text x="130" y="122" text-anchor="middle" font-size="12">name: Tom Hanks</text>
<text x="130" y="140" text-anchor="middle" font-size="12">born: 1956</text>
<circle cx="510" cy="115" r="70" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="510" y="98" text-anchor="middle" font-size="14" font-weight="700">:Movie</text>
<text x="510" y="122" text-anchor="middle" font-size="12">title: Apollo 13</text>
<text x="510" y="140" text-anchor="middle" font-size="12">released: 1995</text>
<line x1="200" y1="115" x2="438" y2="115" stroke-width="3" style="stroke: var(--dg-muted)" marker-end="url(#grA-arr-pg)"/>
<text x="320" y="104" text-anchor="middle" font-size="13" font-weight="700">ACTED_IN</text>
<text x="320" y="136" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">roles: ["Jim Lovell"]</text>
<text x="130" y="210" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">node: labels + properties</text>
<text x="320" y="170" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">relationship: type, direction, properties</text>
<text x="510" y="210" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">node: labels + properties</text>
</svg>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>For RAG, one property graph can hold everything the book builds: chunks with text and embeddings, entities with summaries, communities with reports, and typed business data like contracts, all linked. Vector and full-text indexes live in the same database, so a search hit can be the starting point of a traversal.</p>`,
        },
      ],
    },
    {
      id: "cypher",
      title: "Cypher in a few patterns",
      kicker: "The query language",
      blocks: [
        {
          type: "text",
          html: `<p>Cypher is declarative: you draw the pattern you are looking for in ASCII art and the database finds every match. Nodes are in parentheses, relationships in square brackets with an arrow: <code>(p:Person)-[:ACTED_IN]-&gt;(m:Movie)</code>. Because patterns read almost like the sentence "a person acted in a movie", they are easy for people, and for LLMs, to write.</p>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "The patterns used throughout the book",
          code: `// match and filter, with a parameter instead of string concatenation
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
WHERE m.released >= $since
RETURN p.name, m.title;

// aggregate: implicit grouping by the non-aggregated columns
MATCH (p:Person)-[:DIRECTED]->(m:Movie)
RETURN p.name AS director, count(m) AS movies
ORDER BY movies DESC LIMIT 5;

// optional parts and lists
MATCH (m:Movie {title: $title})
OPTIONAL MATCH (m)<-[:ACTED_IN]-(a:Person)
RETURN m.title, collect(a.name) AS cast;

// two hops in one pattern
MATCH (a:Person {name: $name})-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(coActor:Person)
RETURN DISTINCT coActor.name;`,
          caption: "Always pass user values as parameters (<code>$title</code>). They are never parsed as Cypher, which prevents injection and lets Neo4j reuse query plans.",
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>Cypher began at Neo4j. The openCypher project (2015) opened the language for other vendors, and implementations exist in several other graph databases. In 2024 ISO published GQL (ISO/IEC 39075), the first standard graph query language, which draws heavily on Cypher. Skills learned with Cypher largely transfer.</p>`,
        },
      ],
    },
    {
      id: "merge-vs-create",
      title: "MERGE vs CREATE: writing imports you can re-run",
      kicker: "Idempotency",
      blocks: [
        {
          type: "problem",
          html: `<p>Pipelines get re-run: retries after timeouts, backfills, re-extraction after a prompt fix. If running an import twice produces a different graph than running it once, every retry corrupts your data.</p>`,
        },
        {
          type: "text",
          html: `<p><code>CREATE</code> always creates new nodes and relationships. <code>MERGE</code> first tries to match the <em>entire</em> pattern and creates it only if no match exists. That makes <code>MERGE</code> the tool for idempotent imports, but only if the properties it matches on are stable. <code>MERGE (c:Contract {id: randomUUID()})</code> generates a fresh id each run, can never match, and behaves exactly like <code>CREATE</code>. The book points out that its own contract import has this flaw.</p>`,
        },
        {
          type: "diagram",
          title: "The same import, run twice",
          caption: "Only a MERGE on a key derived from the source document, such as a hash of the file, leaves one contract after two runs.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="After two runs, CREATE and MERGE on randomUUID each leave two contract nodes; MERGE on a document hash leaves one">
<rect x="10" y="10" width="200" height="190" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="110" y="36" text-anchor="middle" font-size="13" font-weight="700">CREATE</text>
<text x="110" y="56" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">after two runs</text>
<rect x="30" y="85" width="74" height="40" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="67" y="110" text-anchor="middle" font-size="12">Contract</text>
<rect x="116" y="85" width="74" height="40" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="153" y="110" text-anchor="middle" font-size="12">Contract</text>
<text x="110" y="170" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-bad)">duplicate</text>
<rect x="220" y="10" width="200" height="190" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="320" y="36" text-anchor="middle" font-size="13" font-weight="700">MERGE on randomUUID()</text>
<text x="320" y="56" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">after two runs</text>
<rect x="240" y="85" width="74" height="40" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="277" y="110" text-anchor="middle" font-size="12">Contract</text>
<rect x="326" y="85" width="74" height="40" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="363" y="110" text-anchor="middle" font-size="12">Contract</text>
<text x="320" y="170" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-bad)">duplicate</text>
<rect x="430" y="10" width="200" height="190" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="530" y="36" text-anchor="middle" font-size="13" font-weight="700">MERGE on file hash</text>
<text x="530" y="56" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">after two runs</text>
<rect x="493" y="85" width="74" height="40" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="530" y="110" text-anchor="middle" font-size="12">Contract</text>
<text x="530" y="170" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ok)">idempotent</text>
</svg>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Idempotent by construction",
          code: `CREATE CONSTRAINT org_name IF NOT EXISTS
FOR (o:Organization) REQUIRE o.name IS UNIQUE;

// merge each node on its own key, then merge the relationship between them
MERGE (o:Organization {name: $org})
MERGE (c:Contract {id: $doc_hash})
MERGE (o)-[r:HAS_PARTY]->(c)
SET r.role = $role;`,
          caption: "The unique constraint also creates an index, so each MERGE lookup is fast, and it makes a duplicate an error instead of a silent second node.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Merging a long pattern in one go: <code>MERGE (p:Person {name: $n})-[:ACTED_IN]-&gt;(m:Movie {title: $t})</code>. If both nodes exist but the relationship does not, the whole pattern does not match, so MERGE creates the <em>whole pattern</em>, including new copies of the person and the movie (or fails on a constraint). Merge nodes separately, then the relationship.</p>`,
        },
        {
          type: "lab",
          id: "mergeCreate",
          caption: "Import the same contract several times with three variants of the import statement, with or without a unique constraint on Organization.name, and count the nodes after each run.",
        },
        {
          type: "quiz",
          q: "An import runs MERGE (c:Contract {id: randomUUID()}) followed by MERGE (o:Organization {name: $org}). After three runs on the same file, how many Contract and Organization nodes exist for that file?",
          options: ["1 contract, 1 organization", "3 contracts, 1 organization", "3 contracts, 3 organizations", "1 contract, 3 organizations"],
          answer: 1,
          explain: "The organization is merged on a stable name, so it matches after the first run. The contract is merged on a new random id each time, which never matches, so each run creates another contract.",
        },
      ],
    },
    {
      id: "plugins-and-setup",
      title: "APOC, Graph Data Science and getting a database running",
      kicker: "Environment",
      blocks: [
        {
          type: "table",
          headers: ["Component", "What it provides", "Where the book uses it"],
          rows: [
            ["APOC", "Utility procedures: import and export, text and date functions, refactoring, metadata such as <code>apoc.meta.data()</code>", "Schema inference for text2cypher (chapter 4)"],
            ["Graph Data Science (GDS)", "Parallel graph algorithms on in-memory projections: community detection (Louvain, Leiden), PageRank, shortest paths, node embeddings", "Community detection for GraphRAG (chapter 7)"],
            ["Vector index", "Approximate nearest neighbor search over embedding properties", "Chunks, child chunks and entity summaries (chapters 2, 3, 7)"],
            ["Full-text index", "Lucene-based keyword search", "Hybrid search (chapter 2)"],
            ["Unique constraints", "Integrity plus an index for fast MERGE", "Contract graph (chapter 6)"],
          ],
        },
        {
          type: "text",
          html: `<p>There are three easy ways to get a database. <strong>Neo4j Desktop</strong> is a local application in which you create a database and install APOC and GDS from its plugins tab. The official <strong>Docker</strong> image can install both plugins at startup. <strong>Neo4j Aura</strong> is the managed cloud service, with a free tier for experiments. The book's notebooks work with any of them; the Movies dataset used in chapters 4, 5 and 8 can be loaded from Neo4j Browser's built-in guide.</p>`,
        },
        {
          type: "code",
          lang: "bash",
          title: "Neo4j with APOC and GDS in Docker",
          code: `docker run --name neo4j-rag \\
  -p 7474:7474 -p 7687:7687 \\
  -e NEO4J_AUTH="neo4j/$NEO4J_PASSWORD" \\
  -e NEO4J_PLUGINS='["apoc", "graph-data-science"]' \\
  neo4j:5`,
          caption: "Read the password from an environment variable rather than hard-coding it. Browse to port 7474; drivers connect to bolt://localhost:7687.",
        },
      ],
    },
    {
      id: "interview",
      title: "Neo4j questions in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>Expect short conceptual questions rather than syntax drills:</p>
<ul>
<li><strong>Why a graph database?</strong> Relationships are stored, not computed, so multi-hop traversals are cheap, and one store holds structure, text and vectors.</li>
<li><strong>MERGE vs CREATE?</strong> MERGE matches the whole pattern or creates it; with a stable key and a unique constraint, imports become idempotent.</li>
<li><strong>Why APOC and GDS?</strong> Schema inference for text2cypher; community detection and other algorithms for GraphRAG.</li>
<li><strong>Why does Cypher suit LLMs?</strong> ASCII-art patterns mirror language, and Cypher is well represented in training data.</li>
<li><strong>Safety:</strong> parameters for user values, read-only credentials for generated queries.</li>
</ul>`,
        },
        {
          type: "quiz",
          q: "Why should an application pass user input to Cypher as parameters ($title) rather than formatting it into the query string?",
          options: [
            "Parameters make results sorted",
            "Parameter values are never parsed as Cypher, which prevents injection, and the database can cache and reuse the query plan",
            "Neo4j cannot read string literals",
            "Parameters are required for MERGE",
          ],
          answer: 1,
          explain: "A formatted string lets a crafted value change the query's structure, the classic injection attack. Parameters are passed separately as data, and because the query text stays the same across calls, Neo4j can reuse its plan.",
        },
      ],
    },
  ],
  takeaways: [
    "Neo4j stores <strong>nodes</strong> (labels + properties) and <strong>relationships</strong> (one type, a direction, properties) as first-class records, so traversals are pointer hops.",
    "Cypher describes patterns in ASCII art; pass user values as <strong>parameters</strong>, never by string formatting.",
    "<code>CREATE</code> always creates; <code>MERGE</code> matches the whole pattern or creates it. MERGE on a <strong>stable key</strong> with a <strong>unique constraint</strong> makes imports idempotent; MERGE on <code>randomUUID()</code> does not.",
    "Merge nodes individually, then the relationship, to avoid duplicating existing nodes.",
    "<strong>APOC</strong> supplies schema inference for text2cypher; <strong>GDS</strong> supplies community detection for GraphRAG.",
    "Desktop, Docker or Aura all work; openCypher and the ISO GQL standard make Cypher skills portable.",
  ],
  furtherReading: [
    { title: "Neo4j Cypher Manual", url: "https://neo4j.com/docs/cypher-manual/current/", note: "Clauses, MERGE semantics, constraints and indexes." },
    { title: "Neo4j Graph Data Science documentation", note: "Graph projections and the community detection algorithms used in chapter 7." },
    { title: "ISO/IEC 39075:2024, GQL", note: "The international standard graph query language, influenced by Cypher." },
  ],
};
