// Deep dive: Chapter 6, Constructing knowledge graphs with LLMs. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>The legal team loads three hundred supplier contracts into a chunk-based RAG system and asks, "What are the payment terms in our agreement with Brightline Logistics?" The retriever returns the four chunks most similar to "payment terms". Two come from the Brightline contract, one from a different supplier, and one from a licensing deal. The LLM blends them into a single tidy answer: net 45 days, a late fee from someone else's contract, and a currency from a third. It reads perfectly and is wrong.</p>
<p>The next question is worse: "How many active contracts do we have with ACME?" No similar chunk contains that number; it has to be computed across documents. Both failures have the same cure. Pull the important facts out of each contract into <strong>structured data</strong>, keep track of which contract each fact came from, and store it in a graph next to the original text. This chapter shows how to do that extraction with LLMs, and how to clean up the result.</p>`,
  sections: [
    {
      id: "why-chunks-fail",
      title: "Why chunk retrieval fails on documents like contracts",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Top-k retrieval picks chunks by similarity, not by document. In a corpus of contracts, every agreement has payment terms, termination clauses and governing law, all written in similar language. So the top chunks for any clause type will often come from several different contracts, and the model has no reliable way to tell them apart.</p>`,
        },
        {
          type: "text",
          html: `<p>In legal, financial and medical documents, document boundaries matter: a clause only means something within its own agreement. Mixing them produces answers that are plausible and dangerous.</p>
<p>The second failure is structural. Questions like "How many active contracts with ACME?", "Which licenses expire this quarter?" or "Which suppliers are governed by German law?" need <strong>filtering, counting and sorting</strong> over fields: party names, dates, contract types. Embeddings retrieve similar content; they do not compute. Chapter 4 showed how to query structured data; this chapter shows how to create it when all you have is text.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Chunks only", tone: "bad", html: "Retrieval can mix clauses from different contracts. Counts and date filters are impossible. Each answer depends on what happened to land in the top k." },
            { title: "Extracted fields + linked chunks", tone: "ok", html: "Each contract is a node with typed fields and links to its parties. Counting and filtering are queries. Chunk search can be scoped to one contract." },
          ],
        },
      ],
    },
    {
      id: "structured-extraction",
      title: "LLM extraction with Structured Outputs",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Define the fields you care about as a typed schema, give the LLM the document and the schema, and get back JSON that is <strong>guaranteed to match</strong> the schema. Each document becomes a structured record you can import into a graph.</p>`,
        },
        {
          type: "text",
          html: `<p>Information extraction used to require a pipeline of specialized models: named-entity recognition, relation classification, custom training data. Large language models collapse that into a prompt. The remaining problem was reliability: models would sometimes return malformed JSON, rename fields or add commentary.</p>
<p><strong>Structured Outputs</strong>, introduced by OpenAI in August 2024 together with the <code>gpt-4o-2024-08-06</code> model, removes that problem: you pass a JSON Schema (in Python, typically generated from a Pydantic model), and the response is constrained to conform to it. The supported building blocks are strings, numbers, integers, booleans, objects, arrays, enums and <code>anyOf</code>, which is enough for most extraction schemas. Other providers offer similar schema-constrained modes.</p>`,
        },
        {
          type: "diagram",
          title: "From contract text to graph",
          caption: "The schema does double duty: it constrains the LLM's output and defines what the graph import can rely on.",
          svg: `<svg viewBox="0 0 640 190" role="img" aria-label="Pipeline: contract text, LLM with schema, validated JSON, Cypher import, contract graph">
<defs><marker id="gr6-arr-ext" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="12" y="50" width="104" height="60" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="64" y="76" text-anchor="middle" font-size="13" font-weight="700">Contract</text>
<text x="64" y="94" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">raw text</text>
<rect x="140" y="50" width="104" height="60" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="192" y="76" text-anchor="middle" font-size="13" font-weight="700">LLM</text>
<text x="192" y="94" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">+ schema</text>
<rect x="268" y="50" width="104" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="320" y="76" text-anchor="middle" font-size="13" font-weight="700">JSON</text>
<text x="320" y="94" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">matches schema</text>
<rect x="396" y="50" width="104" height="60" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="448" y="76" text-anchor="middle" font-size="13" font-weight="700">Import</text>
<text x="448" y="94" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Cypher MERGE</text>
<rect x="524" y="50" width="104" height="60" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="576" y="76" text-anchor="middle" font-size="13" font-weight="700">Graph</text>
<text x="576" y="94" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">fields + chunks</text>
<line x1="116" y1="80" x2="138" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr6-arr-ext)"/>
<line x1="244" y1="80" x2="266" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr6-arr-ext)"/>
<line x1="372" y1="80" x2="394" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr6-arr-ext)"/>
<line x1="500" y1="80" x2="522" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr6-arr-ext)"/>
<rect x="140" y="130" width="232" height="40" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="1.5" stroke-dasharray="5 4"/>
<text x="256" y="155" text-anchor="middle" font-size="12">Pydantic model → JSON Schema</text>
<line x1="192" y1="130" x2="192" y2="112" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#gr6-arr-ext)"/>
<line x1="320" y1="130" x2="320" y2="112" stroke-width="1.5" style="stroke: var(--dg-1)" marker-end="url(#gr6-arr-ext)"/>
<text x="64" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">one call per document</text>
</svg>`,
        },
        {
          type: "code",
          lang: "python",
          title: "A contract schema and the extraction call",
          code: `from typing import Literal, Optional
from pydantic import BaseModel, Field

class Address(BaseModel):
    city: Optional[str] = Field(..., description="City, if stated.")
    country: str = Field(..., description="Two-letter ISO 3166 country code, e.g. US, DE, IN.")

class Party(BaseModel):
    name: str = Field(..., description="Legal name of the organization exactly as written.")
    role: str = Field(..., description="Role in the agreement, e.g. 'licensor', 'licensee', 'supplier', 'client'.")
    address: Address = Field(..., description="The party's main address in the contract.")

class Agreement(BaseModel):
    """Key terms of one commercial contract, used for reporting and search."""
    contract_type: Literal["License", "Services", "Supply", "Distribution", "Other"]
    parties: list[Party]
    effective_date: str = Field(..., description="Date the contract takes effect, yyyy-MM-dd.")
    end_date: Optional[str] = Field(..., description="Expiry date, yyyy-MM-dd, or null if none is stated.")
    total_value: Optional[str] = Field(..., description="Total contract value with currency, as written, or null.")

completion = client.beta.chat.completions.parse(
    model="gpt-4o-2024-08-06", temperature=0,
    messages=[{"role": "system", "content": SYSTEM_MESSAGE},
              {"role": "user", "content": contract_text}],
    response_format=Agreement)
agreement = completion.choices[0].message.parsed      # an Agreement instance`,
          caption: "<code>Optional[...] = Field(...)</code> means the key is always present but may be null, which is the shape strict schema modes expect.",
        },
      ],
    },
    {
      id: "schema-design",
      title: "Designing the schema decides the quality",
      kicker: "How to do it well",
      blocks: [
        {
          type: "text",
          html: `<p>Structured Outputs guarantees the <em>shape</em> of the answer, not its <em>content</em>. Whether the values are correct, consistent and queryable depends almost entirely on the schema. The book's rules, with the reason behind each:</p>`,
        },
        {
          type: "table",
          headers: ["Rule", "Why it matters", "Example"],
          rows: [
            ["Start from the questions", "You extract what users will filter and count on, not everything", "Talk to lawyers and contract managers first"],
            ["Describe every field", "Names and descriptions are the model's only instructions per field", "\"Date the contract takes effect\""],
            ["Specify formats", "There is no date type in JSON Schema; the description defines it", "yyyy-MM-dd"],
            ["Make absent things Optional", "A required field with no source value invites an invented one", "end_date, total_value"],
            ["Enum for closed sets", "Consistent values you can group and filter by", "contract_type"],
            ["Examples for open sets", "Guide without forbidding legitimate new values", "role: licensor, supplier, ..."],
            ["Ask for known standards", "One spelling per value", "ISO country codes: \"US\", not \"USA\" or \"United States\""],
            ["Keep nesting shallow", "Deep structures are harder for the model and for the import", "Agreement → Party → Address"],
          ],
        },
        {
          type: "text",
          html: `<p>The <strong>system message</strong> matters too. Tell the model what domain it is working in and how the output will be used ("you extract terms from commercial contracts for a contract-management database"). That context helps it resolve ambiguous phrases the way your users would.</p>
<p>Money deserves a special note. A floating-point number is a poor container for contract values: it loses precision and drops the currency. Extract the value as written, or as an integer amount in minor units plus an ISO currency code, and convert deliberately during import.</p>`,
        },
        {
          type: "lab",
          id: "extraction",
          caption: "Extract an abridged license agreement with a Contract model, then turn individual schema rules off. Watch the JSON drift (invented end dates, inconsistent country spellings, free-text contract types) and the downstream Cypher answers go wrong.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Making every field required "for completeness". The model must then fill <code>end_date</code> for an evergreen contract, and it will: with a plausible date. Required should mean "every document truly has this", like <code>effective_date</code>.</p>`,
        },
        {
          type: "quiz",
          q: "Extracted party countries come back as \"US\", \"USA\", \"United States\" and \"U.S.\" across documents. Which schema change fixes this most directly?",
          options: [
            "Make the country field Optional",
            "Describe the field as a two-letter ISO country code",
            "Raise the model temperature",
            "Nest the country inside another object",
          ],
          answer: 1,
          explain: "Asking for a well-known standard gives the model one canonical spelling to aim for, and makes the values groupable. Optional would only allow nulls; temperature would add variation, not remove it. An enum of codes would also work, at the cost of a long list.",
        },
      ],
    },
    {
      id: "contract-graph",
      title: "From JSON to a contract graph",
      kicker: "Import",
      blocks: [
        {
          type: "diagram",
          title: "The contract graph model",
          caption: "Organizations link to contracts with their role on the relationship. Locations are separate nodes because one organization can have several addresses. Chunks of the original text hang off each contract.",
          svg: `<svg viewBox="0 0 640 265" role="img" aria-label="Organization HAS_PARTY Contract, Organization LOCATED_AT Location, Contract HAS_CHUNK Chunk">
<defs><marker id="gr6-arr-model" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="40" y="30" width="170" height="70" rx="10" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="125" y="58" text-anchor="middle" font-size="14" font-weight="700">Organization</text>
<text x="125" y="80" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">name (unique)</text>
<rect x="390" y="30" width="200" height="70" rx="10" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="490" y="54" text-anchor="middle" font-size="14" font-weight="700">Contract</text>
<text x="490" y="72" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">id (unique), contract_type,</text>
<text x="490" y="88" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">effective_date, end_date</text>
<rect x="40" y="170" width="170" height="60" rx="10" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="125" y="196" text-anchor="middle" font-size="14" font-weight="700">Location</text>
<text x="125" y="216" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">fullAddress (unique)</text>
<rect x="390" y="170" width="200" height="60" rx="10" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="490" y="196" text-anchor="middle" font-size="14" font-weight="700">Chunk</text>
<text x="490" y="216" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">clause text, embedding</text>
<line x1="210" y1="65" x2="388" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr6-arr-model)"/>
<text x="299" y="57" text-anchor="middle" font-size="12">HAS_PARTY {role}</text>
<line x1="125" y1="100" x2="125" y2="168" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr6-arr-model)"/>
<text x="133" y="139" font-size="12">LOCATED_AT</text>
<line x1="490" y1="100" x2="490" y2="168" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#gr6-arr-model)"/>
<text x="498" y="139" font-size="12">HAS_CHUNK</text>
<text x="320" y="256" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Unique constraints keep MERGE lookups fast and block duplicates.</text>
</svg>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Constraints and an idempotent import",
          code: `CREATE CONSTRAINT contract_id IF NOT EXISTS FOR (c:Contract) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT org_name IF NOT EXISTS FOR (o:Organization) REQUIRE o.name IS UNIQUE;
CREATE CONSTRAINT location_addr IF NOT EXISTS FOR (l:Location) REQUIRE l.fullAddress IS UNIQUE;

// $doc_id is deterministic, e.g. a SHA-256 of the source file
MERGE (c:Contract {id: $doc_id})
SET c.contract_type = $data.contract_type,
    c.effective_date = date($data.effective_date),
    c.end_date = date($data.end_date)              // null stays null
WITH c
UNWIND $data.parties AS party
MERGE (o:Organization {name: party.name})
MERGE (o)-[r:HAS_PARTY]->(c)
SET r.role = party.role
MERGE (l:Location {fullAddress: coalesce(party.address.city, '') + ', ' + party.address.country})
MERGE (o)-[:LOCATED_AT]->(l);`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>MERGE is only idempotent on a stable key.</strong> The book's own import merges the contract on <code>randomUUID()</code>, which never matches an existing node, so running the import twice creates every contract twice. Pipelines are re-run all the time (retries, backfills, a prompt fix), so derive the key from the source document instead. The appendix has a lab that re-runs an import with each variant.</p>`,
        },
        {
          type: "text",
          html: `<p>Do not throw the text away. Extraction captures only the fields you anticipated; the original clauses hold everything else. Store them as <code>(:Contract)-[:HAS_CHUNK]-&gt;(:Chunk)</code>, and for contracts chunk <strong>by clause</strong> rather than by token count, since a clause is the unit lawyers reason about. Now the hook's questions become straightforward: count with a query, and when you do need text, search only the chunks of the right contract.</p>`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "The questions that chunks could not answer",
          code: `// How many active contracts with ACME?
MATCH (:Organization {name: "ACME Inc."})-[:HAS_PARTY]->(c:Contract)
WHERE c.end_date IS NULL OR c.end_date >= date()
RETURN count(c) AS active;

// Payment terms, but only from the Brightline contract's own clauses
MATCH (:Organization {name: "Brightline Logistics"})-[:HAS_PARTY]->(:Contract)-[:HAS_CHUNK]->(ch:Chunk)
WITH ch, vector.similarity.cosine(ch.embedding, $question_embedding) AS score
RETURN ch.text ORDER BY score DESC LIMIT 3;`,
          caption: "The second query scores only one contract's chunks, so clauses from other agreements cannot leak in.",
        },
      ],
    },
    {
      id: "entity-resolution",
      title: "Entity resolution: one company, many spellings",
      kicker: "Cleaning the graph",
      blocks: [
        {
          type: "problem",
          html: `<p>Each contract is extracted independently, so the same company arrives under different names: "UTI Asset Management Company", "UTI Asset Management Company Limited", "UTI Asset Management Company Ltd". MERGE on name treats them as three organizations, and "how many contracts with UTI?" undercounts.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Entity resolution</strong> is the task of finding and merging different representations of the same real-world entity. The pieces are familiar: normalize names (case, punctuation, legal suffixes), compare candidates with a similarity measure, merge pairs above a threshold, and treat merges as transitive so that A~B and B~C put all three in one group.</p>
<p>The hard part is that every setting is <strong>domain-specific</strong>. Stripping "Ltd" is safe for companies; stripping words from gene names is not. A threshold loose enough to join the UTI variants may also join "ACME Industries" and "Acme Insurance", two different companies. Transitivity amplifies mistakes: one bad pair can chain two large groups together. That is why real systems combine rules, similarity, sometimes an LLM judge or an ontology, and human review of uncertain cases.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Normalize, compare, group",
          code: `import re
from difflib import SequenceMatcher

LEGAL_SUFFIXES = {"inc", "incorporated", "ltd", "limited", "llc", "corp", "corporation", "co", "company"}

def normalize(name: str) -> str:
    words = re.sub(r"[^\\w\\s]", " ", name.lower()).split()
    return " ".join(w for w in words if w not in LEGAL_SUFFIXES)

def same_entity(a: str, b: str, threshold: float = 0.92) -> bool:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio() >= threshold

normalize("UTI Asset Management Company Ltd")   # 'uti asset management'
same_entity("ACME Industries", "Acme Insurance")  # False: ratio is about 0.69, merged only below that`,
        },
        {
          type: "code",
          lang: "cypher",
          title: "Merging a confirmed group in Neo4j",
          code: `// $names lists one group, canonical name first
MATCH (o:Organization) WHERE o.name IN $names
WITH o ORDER BY CASE WHEN o.name = $names[0] THEN 0 ELSE 1 END
WITH collect(o) AS nodes
CALL apoc.refactor.mergeNodes(nodes, {properties: "discard", mergeRels: true})
YIELD node
RETURN node.name AS kept;`,
          caption: "APOC moves every relationship onto the first node and deletes the rest, so contract links survive the merge.",
        },
        {
          type: "lab",
          id: "entityResolution",
          caption: "Choose normalization steps, a similarity function and a threshold for organization names from many contracts. Watch the three UTI variants merge, and watch the traps (ACME Industries vs Acme Insurance, UTI Infrastructure Technology) merge too when the settings get loose.",
        },
        {
          type: "compare",
          title: "Where to set the threshold",
          items: [
            { title: "Merge aggressively", tone: "warn", html: "Fewer duplicates, so counts and traversals are complete and the graph is simpler. But false merges join different companies, and splitting a merged node later is hard." },
            { title: "Merge cautiously", tone: "info", html: "Few false merges, so the graph stays trustworthy. But duplicates remain and split counts and relationships, so uncertain pairs need a review queue." },
          ],
        },
        {
          type: "quiz",
          q: "After lowering the similarity threshold, \"UTI Asset Management\" and \"UTI Infrastructure Technology\" end up in one group, although no single pair of the two scored above the threshold. What is the most likely mechanism?",
          options: [
            "The vector index merged them",
            "Transitive grouping: each was similar enough to some intermediate name, which chained the groups",
            "MERGE on name matched them",
            "Structured Outputs normalized the names",
          ],
          answer: 1,
          explain: "Grouping by connected pairs is transitive. If A~X and X~B both pass the threshold, A and B land together even though A and B are not similar. Guard against chaining with stricter thresholds, cluster-level checks or human review for large groups.",
        },
      ],
    },
    {
      id: "tools-and-tradeoffs",
      title: "Tools and trade-offs for LLM-built graphs",
      kicker: "Real-world usage",
      blocks: [
        {
          type: "realworld",
          items: [
            { org: "LangChain", title: "LLMGraphTransformer", html: "Turns documents into graph documents (nodes and relationships) with an LLM. You can restrict the allowed node and relationship types, which is the schema-guided approach of this chapter." },
            { org: "Neo4j", title: "LLM Graph Builder and neo4j-graphrag", html: "Neo4j's LLM Graph Builder is an application that extracts graphs from PDFs and web pages into Neo4j. The <code>neo4j-graphrag</code> Python package includes a knowledge-graph construction pipeline with a configurable schema." },
            { org: "The Atticus Project", title: "CUAD", html: "The Contract Understanding Atticus Dataset is a public set of commercial contracts annotated by lawyers for clause types. The book uses one of its license agreements as the extraction example." },
          ],
        },
        {
          type: "compare",
          items: [
            { title: "Schema-guided extraction (this chapter)", tone: "ok", html: "You decide the fields in advance. Values are consistent and queryable, and the graph answers known question types precisely. New kinds of facts need a schema change and re-extraction." },
            { title: "Open extraction (chapter 7)", tone: "info", html: "The LLM extracts whatever entities and relationships it finds, within broad types. Good for exploring unknown corpora and for summarization; values are less consistent and harder to filter on." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Extraction is a batch job with a real cost per document. Keep each document's raw extraction JSON with the prompt and model version that produced it. When you improve the schema or switch models, you can re-extract a sample, compare, and only then re-run everything.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Explaining graph construction in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>"We have thousands of contracts (or invoices, or medical reports) and want to ask questions across them" is a classic prompt. Interviewers want to see that you recognize when chunk retrieval is unsafe, and that you treat extraction as a data pipeline with schema design, idempotency and data quality, not as a single prompt.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>Diagnose:</strong> chunk retrieval mixes documents and cannot count or filter.</li>
<li><strong>Extract:</strong> typed schema from user questions; Structured Outputs; descriptions, formats, Optional fields, enums vs examples, ISO standards, shallow nesting.</li>
<li><strong>Model and import:</strong> organizations, contracts, locations, with unique constraints and a deterministic document key so re-runs are idempotent.</li>
<li><strong>Clean:</strong> entity resolution with normalization, similarity thresholds, transitive grouping, and review for uncertain merges.</li>
<li><strong>Keep the text:</strong> clause chunks linked to each contract, so text search can be scoped to one document.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why you would keep the contract text in the graph once the fields are extracted. Which answer is strongest?",
          options: [
            "Neo4j requires a text property on every node",
            "Extraction captures only anticipated fields; linked chunks keep the rest available, and searches can be scoped to the right contract",
            "It makes the import faster",
            "Text is needed to build unique constraints",
          ],
          answer: 1,
          explain: "Structured fields answer the questions you planned for. Users will ask about clauses you did not extract, and the linked chunks answer those, filtered to one contract so clauses from other agreements cannot mix in.",
        },
      ],
    },
  ],
  takeaways: [
    "Chunk retrieval picks by similarity, not by document, so it can mix clauses from different contracts, and it cannot count or filter.",
    "LLMs can extract structured records from text; <strong>Structured Outputs</strong> guarantees the response matches your schema's shape.",
    "The schema decides quality: describe every field, specify formats, make absent fields <strong>Optional</strong>, use <strong>enums</strong> for closed sets and examples for open ones, ask for standards like ISO codes, keep nesting shallow.",
    "Model the result as a graph (Organization, Contract, Location, Chunk) with unique constraints; MERGE on a <strong>deterministic key</strong> so re-runs are idempotent.",
    "<strong>Entity resolution</strong> merges name variants; it is domain-specific, and transitive grouping can chain false merges.",
    "Keep the original text linked to its structured node, chunked by clause, to answer unanticipated questions within the right document.",
  ],
  furtherReading: [
    { title: "OpenAI: Introducing Structured Outputs in the API (August 2024)", note: "The announcement describing schema-constrained responses and supported types." },
    { title: "CUAD: An Expert-Annotated NLP Dataset for Legal Contract Review (Hendrycks et al., 2021)", note: "The contract dataset behind the chapter's example." },
    { title: "APOC documentation: apoc.refactor.mergeNodes", note: "Merging duplicate nodes while preserving relationships." },
  ],
};
