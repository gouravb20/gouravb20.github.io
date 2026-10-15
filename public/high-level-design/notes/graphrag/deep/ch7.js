// Deep dive: Chapter 7, Microsoft's GraphRAG implementation. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>You index all 24 books of <em>The Odyssey</em> into a solid vector RAG system and ask, "What is this story about?" The retriever returns the five chunks most similar to that question, which turn out to be a speech about wandering, a description of a feast and a passage where someone asks a stranger who he is. The model writes a vague summary of those five scenes. It cannot mention the suitors, the return to Ithaca or the gods' feud, because none of that was in the five chunks.</p>
<p>The question is not looking for a passage. It is asking about the whole corpus, and no top-k retrieval can see the whole corpus. Microsoft's GraphRAG answers this kind of question by doing the reading in advance: it builds a knowledge graph of entities and relationships with an LLM, groups related entities into <strong>communities</strong>, and writes a summary report for each one. At query time, those reports stand in for the entire text.</p>`,
  sections: [
    {
      id: "global-questions",
      title: "Questions no single chunk can answer",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Vector RAG is built for questions whose answer sits in a few passages. "Who is Telemachus?" works. "What are the main themes?", "Which factions are in conflict?" or "Summarize what happens to the crew" need information spread across hundreds of chunks. Retrieving more chunks only goes so far: the prompt overflows long before the corpus is covered.</p>`,
        },
        {
          type: "text",
          html: `<p>The 2024 Microsoft Research paper behind GraphRAG, "From Local to Global" by Edge and colleagues, frames this as <strong>query-focused summarization</strong> over an entire dataset. Its answer is to move most of the work to indexing time, in two stages.</p>
<p><strong>Stage 1</strong> extracts entities and relationships from every chunk with an LLM, then merges the many partial descriptions of each entity into one summary. <strong>Stage 2</strong> detects communities of densely connected entities and has an LLM write a report about each community. The book reproduces this pipeline on <em>The Odyssey</em> with Neo4j, using Louvain for community detection where the paper uses Leiden.</p>`,
        },
        {
          type: "diagram",
          title: "GraphRAG indexing in two stages",
          caption: "Three of the five steps are LLM calls, repeated per chunk, per entity or relationship, and per community. That is where GraphRAG's cost lives.",
          svg: `<svg viewBox="0 0 640 175" role="img" aria-label="GraphRAG indexing: chunks, extract, summarize, communities, reports; stage 1 covers extract and summarize, stage 2 covers communities and reports">
<defs><marker id="gr7-arr-idx" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<line x1="140" y1="34" x2="372" y2="34" stroke-width="2" style="stroke: var(--dg-2)"/>
<text x="256" y="24" text-anchor="middle" font-size="12" font-weight="700">Stage 1: entity graph</text>
<line x1="396" y1="34" x2="628" y2="34" stroke-width="2" style="stroke: var(--dg-4)"/>
<text x="512" y="24" text-anchor="middle" font-size="12" font-weight="700">Stage 2: communities</text>
<rect x="12" y="50" width="104" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="64" y="74" text-anchor="middle" font-size="13" font-weight="700">Chunks</text>
<text x="64" y="92" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">source text</text>
<rect x="140" y="50" width="104" height="56" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="192" y="74" text-anchor="middle" font-size="13" font-weight="700">Extract</text>
<text x="192" y="92" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">entities, rels</text>
<rect x="268" y="50" width="104" height="56" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="320" y="74" text-anchor="middle" font-size="13" font-weight="700">Summarize</text>
<text x="320" y="92" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">descriptions</text>
<rect x="396" y="50" width="104" height="56" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="448" y="74" text-anchor="middle" font-size="13" font-weight="700">Detect</text>
<text x="448" y="92" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">communities</text>
<rect x="524" y="50" width="104" height="56" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="576" y="74" text-anchor="middle" font-size="13" font-weight="700">Reports</text>
<text x="576" y="92" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">per community</text>
<line x1="116" y1="78" x2="138" y2="78" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-idx)"/>
<line x1="244" y1="78" x2="266" y2="78" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-idx)"/>
<line x1="372" y1="78" x2="394" y2="78" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-idx)"/>
<line x1="500" y1="78" x2="522" y2="78" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-idx)"/>
<text x="192" y="128" text-anchor="middle" font-size="12" style="fill: var(--dg-3)">LLM per chunk</text>
<text x="320" y="128" text-anchor="middle" font-size="12" style="fill: var(--dg-3)">LLM per entity</text>
<text x="448" y="128" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">graph algorithm</text>
<text x="576" y="128" text-anchor="middle" font-size="12" style="fill: var(--dg-3)">LLM per community</text>
<text x="320" y="162" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Query time: global search reads the reports; local search starts from entities.</text>
</svg>`,
        },
      ],
    },
    {
      id: "extraction",
      title: "Stage 1: extracting entities and relationships",
      kicker: "Building the entity graph",
      blocks: [
        {
          type: "text",
          html: `<p>Each chunk goes to an LLM with a prompt that lists the allowed <strong>entity types</strong> and asks for two kinds of records. For each entity: a name, a type and a description. For each relationship: source, target, a description of how they are related, and a numeric <strong>strength</strong>. The output comes back as delimited tuples that are easy to parse.</p>
<p>Unlike the contract schema in chapter 6, this extraction is deliberately open. The schema is just a list of types; the knowledge lives in the free-text <strong>descriptions</strong>, which later feed the summaries and reports. Plain subject-predicate-object triples would lose most of that nuance.</p>`,
        },
        {
          type: "text",
          html: `<h3>Choosing entity types</h3>
<p>The types are fixed before extraction and shape everything downstream. For <em>The Odyssey</em> the book uses PERSON, ORGANIZATION, LOCATION, GOD, EVENT, CREATURE and WEAPON_OR_TOOL. Some are crisp: a god is a god. Others are fuzzy: is "the feast in the hall" an EVENT? Is "the ship" a WEAPON_OR_TOOL? Fuzzy types produce inconsistent extractions across chunks, which then make entity linking and summaries noisier.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "What one chunk's extraction might look like (illustrative)",
          code: `("entity" | TELEMACHUS | PERSON | Son of Ulysses, frustrated by the suitors occupying his home)
("entity" | MINERVA | GOD | Goddess who visits Telemachus in disguise and urges him to act)
("entity" | ITHACA | LOCATION | Island kingdom of Ulysses, where his household waits)
("relationship" | MINERVA | TELEMACHUS | Minerva advises Telemachus to seek news of his father | 9)
("relationship" | TELEMACHUS | ITHACA | Telemachus lives in the palace on Ithaca | 7)`,
          caption: "The translation used in the book gives the gods Roman names, hence Minerva rather than Athena. The final number is the relationship strength.",
        },
        {
          type: "text",
          html: `<h3>Chunk size and gleaning</h3>
<p>How much text the LLM reads at once changes how much it finds. The paper's comparison shows that smaller chunks (600 tokens) yield more extracted entity references than 1,200 or 2,400 tokens: when a model reads less, it notices more. It also uses <strong>self-reflection</strong>, or "gleaning": after an extraction, ask the model whether it missed entities, and if so, extract again from the same chunk. Each extra pass adds references at every chunk size. Both levers cost more LLM calls. The book chunks the books at 1,000 words with 40 words of overlap; Book 1 alone yields 66 entities and 182 relationships.</p>`,
        },
        {
          type: "lab",
          id: "chunkEntities",
          caption: "A simple model of why smaller chunks and extra gleaning passes extract more entity references from The Odyssey's 24 books. The curves are illustrative, not the paper's numbers.",
        },
        {
          type: "text",
          html: `<p>The parsed records are imported as <code>(:__Entity__)</code> nodes, keyed by name, with <code>[:RELATIONSHIP]</code> edges between them, and each entity is linked to the <code>(:__Chunk__)</code> nodes it was extracted from. Those links are what local search later uses to bring source text back.</p>`,
        },
      ],
    },
    {
      id: "summarization",
      title: "Merging many descriptions into one summary",
      kicker: "Consolidation",
      blocks: [
        {
          type: "problem",
          html: `<p>A major character appears in dozens of chunks, and each chunk's extraction describes them a little differently. After import, one entity node carries a list of overlapping, partial and occasionally contradictory descriptions. The same happens to pairs: the book finds 14 separate relationships between Telemachus and Minerva.</p>`,
        },
        {
          type: "text",
          html: `<p>GraphRAG fixes this with another LLM pass. For every entity with more than one description, the model writes a single, comprehensive, third-person summary, resolving contradictions where it can. Relationships between the same pair are merged the same way into one summarized relationship. The book stores these as a <code>summary</code> property and a <code>[:SUMMARIZED_RELATIONSHIP]</code> edge. Even a minor character benefits: Orestes ends up with six overlapping descriptions that collapse into one paragraph.</p>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Finding what needs summarizing",
          code: `// entities with several descriptions, biggest first
MATCH (e:__Entity__)
WHERE size(e.description) > 1
RETURN e.name, size(e.description) AS descriptions
ORDER BY descriptions DESC LIMIT 10;

// pairs connected by several extracted relationships
MATCH (a:__Entity__)-[r:RELATIONSHIP]-(b:__Entity__)
WHERE elementId(a) < elementId(b)
WITH a, b, count(r) AS rels WHERE rels > 1
RETURN a.name, b.name, rels ORDER BY rels DESC LIMIT 10;`,
          caption: "Assumes the import appends each chunk's description to a list property on the entity.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>Super nodes.</strong> Some entities appear nearly everywhere (imagine "Athens" in a corpus on Greek history). Their descriptions may not fit in one prompt. Rank or filter them first, for example by the importance of the source chunk or by recency, or summarize in batches and then summarize the summaries.</p>`,
        },
        {
          type: "quiz",
          q: "Why does GraphRAG summarize an entity's descriptions instead of keeping all of them for retrieval?",
          options: [
            "Neo4j cannot store lists of strings",
            "Many descriptions overlap or conflict; one coherent summary is shorter, nonredundant and what reports and local search can use directly",
            "Summaries are required to compute embeddings",
            "It removes the need for community detection",
          ],
          answer: 1,
          explain: "Keeping every fragment would flood prompts with repetition and leave contradictions unresolved. One merged summary per entity (and per related pair) is compact and consistent, which matters when many of them must fit into a report prompt or a local-search context.",
        },
      ],
    },
    {
      id: "communities",
      title: "Stage 2: communities and community reports",
      kicker: "Seeing the big picture",
      blocks: [
        {
          type: "idea",
          html: `<p>A <strong>community</strong> is a group of entities more densely connected to each other than to the rest of the graph. In a story, communities tend to match storylines: the household in Ithaca, the gods on Olympus, a particular voyage. Summarize each community and you have a set of reports that, together, describe the whole corpus at a chosen level of detail.</p>`,
        },
        {
          type: "text",
          html: `<p>Community detection algorithms optimize <strong>modularity</strong>: roughly, how many more edges fall inside communities than you would expect by chance. <strong>Louvain</strong> does it greedily: each node moves to the neighboring community that improves modularity most, then communities are collapsed into single nodes and the process repeats, producing a hierarchy. It is fast but nondeterministic, so results can change between runs, and it can produce communities that are internally disconnected. <strong>Leiden</strong>, which the paper uses, adds a refinement step that guarantees well-connected communities.</p>
<p>Edge weights matter: weight each entity pair by how many relationships were extracted between them, so that Telemachus and Minerva's 14 relationships bind them more strongly than a single passing mention. On Book 1, the book's Louvain run produces 9 communities of 2 to 13 entities.</p>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Communities with Neo4j Graph Data Science",
          code: `// project entities and weighted, undirected relationships into memory
CALL gds.graph.project('entities', '__Entity__',
  {SUMMARIZED_RELATIONSHIP: {orientation: 'UNDIRECTED', properties: 'weight'}});

// run Louvain and store one community node per id
CALL gds.louvain.stream('entities', {relationshipWeightProperty: 'weight'})
YIELD nodeId, communityId
WITH gds.util.asNode(nodeId) AS entity, communityId
MERGE (c:__Community__ {id: communityId})
MERGE (entity)-[:IN_COMMUNITY]->(c);`,
        },
        {
          type: "lab",
          id: "communities",
          caption: "Run Louvain on an entity graph like the one extracted from Book 1. Re-run with a new seed to see nondeterminism, and turn the resolution knob to trade fewer, larger communities for more, smaller ones.",
        },
        {
          type: "text",
          html: `<p>For each community, an LLM receives the summaries of its entities and relationships and writes a structured <strong>community report</strong>: a title, a summary, an impact severity rating from 0 to 10 with an explanation, and five to ten detailed findings. Large communities face the same context limit as super nodes, so their members and relationships are ranked and capped before prompting.</p>
<p>In the paper, the hierarchy produced by repeated community detection is used at several levels, from a few broad communities at the top to many specific ones at the bottom. Reports at a higher level are more abstract; reports at a lower level are more detailed and more numerous.</p>`,
        },
      ],
    },
    {
      id: "global-and-local",
      title: "Retrieval: global search and local search",
      kicker: "Query time",
      blocks: [
        {
          type: "diagram",
          title: "Two retrievers over the same index",
          caption: "Global search sends every sufficiently rated report through a map call, then reduces the best points into one answer. Local search starts at a few entities found by vector search and gathers their neighborhood into a single prompt.",
          svg: `<svg viewBox="0 0 640 265" role="img" aria-label="Global search fans a question out to four community reports and reduces their points; local search finds entities and gathers chunks, relationships, reports and summaries into one LLM call">
<defs><marker id="gr7-arr-gl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="160" y="20" text-anchor="middle" font-size="13" font-weight="700">Global: map-reduce over reports</text>
<text x="480" y="20" text-anchor="middle" font-size="13" font-weight="700">Local: expand from entities</text>
<line x1="320" y1="8" x2="320" y2="258" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<rect x="110" y="34" width="100" height="28" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="160" y="53" text-anchor="middle" font-size="12">Question</text>
<rect x="22" y="90" width="60" height="40" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="52" y="106" text-anchor="middle" font-size="12">R1</text>
<text x="52" y="122" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">map</text>
<rect x="92" y="90" width="60" height="40" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="122" y="106" text-anchor="middle" font-size="12">R2</text>
<text x="122" y="122" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">map</text>
<rect x="162" y="90" width="60" height="40" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="192" y="106" text-anchor="middle" font-size="12">R3</text>
<text x="192" y="122" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">map</text>
<rect x="232" y="90" width="60" height="40" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="262" y="106" text-anchor="middle" font-size="12">R4</text>
<text x="262" y="122" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">map</text>
<line x1="160" y1="62" x2="54" y2="88" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="160" y1="62" x2="122" y2="88" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="160" y1="62" x2="192" y2="88" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="160" y1="62" x2="260" y2="88" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<rect x="85" y="170" width="150" height="32" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="160" y="191" text-anchor="middle" font-size="12">reduce: top points</text>
<line x1="52" y1="130" x2="110" y2="168" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="122" y1="130" x2="145" y2="168" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="192" y1="130" x2="175" y2="168" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="262" y1="130" x2="210" y2="168" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<rect x="110" y="225" width="100" height="28" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="160" y="244" text-anchor="middle" font-size="12">Answer</text>
<line x1="160" y1="202" x2="160" y2="223" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<rect x="430" y="34" width="100" height="28" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="480" y="53" text-anchor="middle" font-size="12">Question</text>
<rect x="395" y="78" width="170" height="28" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="480" y="97" text-anchor="middle" font-size="12">top-k entities (vector)</text>
<line x1="480" y1="62" x2="480" y2="76" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<rect x="338" y="130" width="68" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="372" y="150" text-anchor="middle" font-size="12">chunks</text>
<rect x="408" y="130" width="68" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="442" y="150" text-anchor="middle" font-size="12">relations</text>
<rect x="478" y="130" width="68" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="512" y="150" text-anchor="middle" font-size="12">reports</text>
<rect x="548" y="130" width="78" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="587" y="150" text-anchor="middle" font-size="12">summaries</text>
<line x1="480" y1="106" x2="374" y2="128" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="480" y1="106" x2="444" y2="128" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="480" y1="106" x2="512" y2="128" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="480" y1="106" x2="585" y2="128" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<rect x="410" y="180" width="140" height="28" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="480" y="199" text-anchor="middle" font-size="12">one LLM call</text>
<line x1="372" y1="160" x2="440" y2="178" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="442" y1="160" x2="465" y2="178" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="512" y1="160" x2="495" y2="178" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<line x1="587" y1="160" x2="522" y2="178" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
<rect x="430" y="225" width="100" height="28" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="1.5"/>
<text x="480" y="244" text-anchor="middle" font-size="12">Answer</text>
<line x1="480" y1="208" x2="480" y2="223" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#gr7-arr-gl)"/>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Global search: map-reduce over community reports</h3>
<p>Take every community report whose rating is at or above a threshold (the book uses 5). In the <strong>map</strong> step, send each report with the question to the LLM and ask for the key points relevant to the question, each with an importance score from 0 to 100. In the <strong>reduce</strong> step, keep the highest-scoring points and ask the LLM to write the final answer from them. Every report gets a say, so the answer can cover the whole corpus. The map calls are independent and can run in parallel.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Global search, compactly",
          code: `def global_search(question: str, min_rating: float = 5, top_points: int = 30) -> str:
    reports, _, _ = driver.execute_query(
        "MATCH (c:__Community__) WHERE c.rating >= $r RETURN c.summary AS text",
        r=min_rating)
    points = []
    for report in reports:                                   # map: one call per report
        reply = chat_json(MAP_PROMPT.format(report=report["text"]), question)
        points += [p for p in reply["points"] if p["score"] > 0]  # [{"text", "score"}]
    best = sorted(points, key=lambda p: p["score"], reverse=True)[:top_points]
    return chat(REDUCE_PROMPT.format(points=best), question)     # reduce: one call`,
        },
        {
          type: "text",
          html: `<h3>Local search: start from entities, gather their neighborhood</h3>
<p>For questions about specific entities ("Who is Ulysses?"), reading every report is wasteful. Local search embeds the question, finds the top-k entities by vector similarity over their summaries, and then uses Cypher to gather a context: the chunks that mention those entities (ranked by how many of the entry entities each chunk mentions), the reports of their communities, the summarized relationships among them, and the entity summaries themselves. Every list is ranked and capped so the context fits the prompt, and one LLM call answers.</p>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Local search context, simplified",
          code: `CALL db.index.vector.queryNodes('entity_summaries', $k, $embedding) YIELD node
WITH collect(node) AS entities
RETURN [e IN entities | e.summary] AS entitySummaries,
  COLLECT { UNWIND entities AS e
            MATCH (ch:__Chunk__)-[:HAS_ENTITY]->(e)
            WITH ch, count(DISTINCT e) AS hits
            RETURN ch.text ORDER BY hits DESC LIMIT $topChunks } AS chunks,
  COLLECT { UNWIND entities AS e
            MATCH (e)-[:IN_COMMUNITY]->(c:__Community__)
            WITH DISTINCT c RETURN c.summary ORDER BY c.rating DESC LIMIT $topReports } AS reports,
  COLLECT { UNWIND entities AS e
            MATCH (e)-[r:SUMMARIZED_RELATIONSHIP]-(m) WHERE m IN entities
            RETURN DISTINCT r.summary LIMIT $topRels } AS relationships;`,
        },
        {
          type: "lab",
          id: "globalLocal",
          caption: "Run both retrievers over the Odyssey index. Change the rating threshold for global search and watch the number of map calls; switch to local search and see which chunks, relationships and reports make it into the single prompt.",
        },
        {
          type: "table",
          headers: ["", "Global search", "Local search"],
          rows: [
            ["Best for", "Broad, thematic questions about the whole corpus", "Questions about specific entities"],
            ["Entry point", "All reports at or above a rating", "Top-k entities by vector similarity"],
            ["Context", "Community reports only", "Chunks, relationships, reports, entity summaries"],
            ["LLM calls", "One per report (map) plus one (reduce)", "One"],
            ["Example", "\"What is this story about?\"", "\"Who is Ulysses?\""],
          ],
        },
        {
          type: "quiz",
          q: "Global search over the lowest, most detailed community level gives the most thorough answers. What is the main cost of using it?",
          options: [
            "It needs a second vector index",
            "Many more communities means many more map-step LLM calls, so more time and money per query",
            "It cannot use community ratings",
            "It requires re-running entity extraction",
          ],
          answer: 1,
          explain: "Lower levels contain many small communities, and global search makes one map call per qualifying report. Higher levels have fewer, broader reports: cheaper, but more abstract. The rating threshold is the other knob for limiting map calls.",
        },
      ],
    },
    {
      id: "costs-and-variants",
      title: "Costs, knobs and what came after",
      kicker: "Trade-offs and real-world usage",
      blocks: [
        {
          type: "tradeoffs",
          pros: [
            "Answers whole-corpus questions that top-k retrieval cannot",
            "Entity summaries and reports are reusable, human-readable artifacts",
            "Local search combines text, relationships and community context in one prompt",
            "Works on raw text with no hand-built schema",
          ],
          cons: [
            "Heavy LLM usage at indexing: per chunk (plus gleaning), per entity and relationship, per community",
            "Global search makes many LLM calls per query",
            "Entity types must be chosen in advance; fuzzy types add noise",
            "Results depend on chunking, community algorithm and its randomness; Louvain is nondeterministic",
            "Re-indexing after data changes is expensive",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Microsoft", title: "The graphrag library", html: "Microsoft open-sourced its implementation in 2024 as the <code>graphrag</code> Python package. It builds the index into files (entities, relationships, communities, reports) and provides global and local search." },
            { org: "Microsoft Research", title: "DRIFT and LazyGraphRAG", html: "Later in 2024 Microsoft described DRIFT search, which blends local search with community information, and LazyGraphRAG, which postpones most LLM summarization to query time to cut indexing cost." },
            { org: "Neo4j", title: "GraphRAG in a graph database", html: "Storing the index in Neo4j, as the book does, lets you query entities, communities and chunks with Cypher, combine them with vector indexes, and run community detection with the Graph Data Science library." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Fix sources of randomness when you need reproducible indexes: set seeds for community detection where the algorithm allows it, use temperature 0 for extraction and summarization, and record model versions. Otherwise two indexing runs on the same text can produce different communities, reports and therefore answers.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Explaining GraphRAG in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>"GraphRAG" is a common buzzword in interviews about LLM systems. Strong candidates can say exactly what problem it solves (whole-corpus questions), what it costs (indexing-time LLM calls), and when plain vector RAG is the better choice.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>Problem:</strong> top-k retrieval cannot answer questions about the whole dataset.</li>
<li><strong>Stage 1:</strong> LLM extracts typed entities and relationships with descriptions and strengths per chunk; smaller chunks and gleaning find more; descriptions are merged into summaries.</li>
<li><strong>Stage 2:</strong> community detection (Leiden in the paper, Louvain in the book) on a weighted entity graph; an LLM writes a rated report per community, at several hierarchy levels.</li>
<li><strong>Query:</strong> global search maps over reports and reduces the top points; local search expands from vector-matched entities to chunks, relationships and reports.</li>
<li><strong>Costs:</strong> indexing LLM calls, many calls for global queries, nondeterminism, expensive re-indexing. Use it when broad questions matter.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "A team wants GraphRAG for a support bot whose users mostly ask \"how do I reset my password on device X?\" and whose docs change daily. What would you advise?",
          options: [
            "Use global search for every question",
            "GraphRAG is a poor fit: questions are local lookups that vector or hybrid RAG handles cheaply, and daily changes would force costly re-indexing",
            "Use Louvain instead of Leiden to save cost",
            "Increase gleaning passes to keep up with changes",
          ],
          answer: 1,
          explain: "GraphRAG's strength is whole-corpus, thematic questions, paid for with heavy indexing. Specific how-to questions are answered by a few passages, which plain retrieval finds well, and frequently changing docs make the expensive index stale quickly.",
        },
      ],
    },
  ],
  takeaways: [
    "Top-k retrieval cannot answer questions about a whole corpus; GraphRAG precomputes summaries so it can.",
    "<strong>Stage 1</strong>: an LLM extracts typed entities and relationships with descriptions and strengths per chunk, then merges each entity's and pair's descriptions into one summary.",
    "Smaller chunks and extra <strong>gleaning</strong> passes extract more entities, at the cost of more LLM calls.",
    "<strong>Stage 2</strong>: community detection (Leiden in the paper, nondeterministic Louvain in the book) groups entities; an LLM writes a rated report per community.",
    "<strong>Global search</strong> maps the question over reports and reduces the top-scored points; <strong>local search</strong> expands from vector-matched entities to chunks, relationships and reports, in one call.",
    "Every retrieved list is ranked and capped to fit the context window.",
    "The price is heavy indexing cost, many calls for global queries and nondeterminism. Use it when broad questions matter.",
  ],
  furtherReading: [
    { title: "From Local to Global: A Graph RAG Approach to Query-Focused Summarization (Edge et al., 2024)", url: "https://arxiv.org/abs/2404.16130", note: "The paper that defines the pipeline, community levels and global search." },
    { title: "Microsoft GraphRAG on GitHub", url: "https://github.com/microsoft/graphrag", note: "The open-source implementation and its documentation." },
    { title: "From Louvain to Leiden: guaranteeing well-connected communities (Traag, Waltman and van Eck, 2019)", note: "Why Leiden fixes Louvain's disconnected communities." },
  ],
};
