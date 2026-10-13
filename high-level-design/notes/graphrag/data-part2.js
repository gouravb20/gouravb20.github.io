// Essential GraphRAG - interactive notes data, part 2 (chapters 5-8 + Neo4j appendix)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch5`, part: 2, number: 5,
    title: `Agentic RAG`,
    overview: `A single retriever rarely fits every question. <strong>Agentic RAG</strong> offers several <strong>retriever agents</strong> (generic ones like vector search and text2cypher, plus narrow specialized ones), a <strong>retriever router</strong> that picks the right one(s) per question using LLM tool calling, and an <strong>answer critic</strong> that checks whether the question was fully answered. The implementation adds a <strong>query updater</strong> that rewrites follow-up sub-questions using earlier answers.`,
    concepts: [
      { term: `Agentic RAG`, def: `A system where a variety of retrieval agents are available and the system decides which to use to retrieve the data needed for the user's question.`, why: `Different questions need different data sources and query types; one generic retriever cannot serve them all well.`, demo: `agenticRouter` },
      { term: `Retriever agents`, def: `The actual retrievers: broad ones (vector similarity search, text2cypher) and specialized ones (parameterized Cypher templates).`, why: `Generic retrievers rarely meet production expectations on their own. Specialized ones are narrow but reliable and are added over time as weak spots appear.`, demo: `agenticRouter` },
      { term: `Retriever router`, def: `A function, usually an LLM with tool/function calling, that takes the question and returns the best retriever(s) and their arguments.`, why: `It is the main interface of the system.`, ex: `"What is the capital of France?" → capital_by_country("France"), not country_by_capital.`, demo: `agenticRouter` },
      { term: `Answer critic`, def: `A blocking check that compares retrieved answers with the original question. If something is missing, it returns new atomic questions to retrieve; otherwise an empty list.`, why: `LLMs can err when rewriting and routing. There must be an exit criterion: the book critiques once, then answers with what it has and says what is missing.`, demo: `agenticRouter` },
      { term: `Tool descriptions`, def: `Each retriever is described to the LLM with a name, a description and JSON-schema parameters (OpenAI tools format).`, why: `The router can only choose well if descriptions and parameters are clear. text2cypher's description says: "When other tools don't fit, fallback to use this one."` },
      { term: `Handling tool calls`, def: `The LLM only decides which tool and which arguments; your code executes the function and collects results.`, why: `The LLM cannot call your retrievers itself. It may request several tool calls for one question.` },
      { term: `Query updater`, def: `Before routing each question, an LLM fills in missing information from previous answers so the question becomes atomic and specific, without asking for more than the original.`, why: `Follow-ups depend on earlier answers: "Who won the most Oscars, and is that person alive?" → "Is <em>[that person]</em> alive?".`, demo: `agenticRouter` },
      { term: `answer_given tool`, def: `A generic tool used when the answer is already in the question or conversation; it just returns the extracted answer.`, why: `Avoids pointless database calls, e.g. "What's Dave Smith's last name?".`, demo: `agenticRouter` },
      { term: `Specialized vs catch-all`, def: `Build specialized retrievers (movie_info_by_title, movies_info_by_actor) for frequent or hard question types and keep text2cypher as the catch-all.`, why: `Specialized templates are faster (no Cypher-generation LLM call) and more reliable.` },
      { term: `Grounded final answer`, def: `The main prompt: use only the provided information; if information is missing, say so; do not make anything up or use external information.`, why: `Keeps the system consistent and trustworthy.` }
    ],
    cheatsheet: [
      { title: `The three parts`, type: `table`, headers: [`Part`, `Input`, `Output`], rows: [
        [`Retriever router`, `User question (+ previous answers)`, `Tool name(s) + arguments`],
        [`Retriever agents`, `Arguments`, `Data (rows, chunks, text)`],
        [`Answer critic`, `Original question + all answers`, `[] if complete, else new atomic questions`]
      ] },
      { title: `Book's tools (Movies graph)`, type: `table`, headers: [`Tool`, `Parameters`, `What it does`], rows: [
        [`movie_info_by_title`, `title`, `Cypher template: movie, cast, directors by title (case-insensitive CONTAINS)`],
        [`movies_info_by_actor`, `actor`, `Cypher template: movies an actor appeared in`],
        [`text2cypher`, `question`, `Generates and runs Cypher; fallback when other tools don't fit`],
        [`answer_given`, `answer`, `Extracts an answer already present in the conversation`]
      ] },
      { title: `Main loop`, type: `code`, body: `def handle_user_input(input, answers=[]):
    updated_question = query_update(input, answers)        # fill in from prior answers
    response = route_question(updated_question, tools, answers)  # LLM picks tool, we execute
    answers.append({"role": "assistant",
        "content": f"For the question: '{updated_question}', we have the answer: '{json.dumps(response)}'"})
    return answers

def main(input):
    answers = handle_user_input(input)
    critique = critique_answers(input, answers)            # [] or new questions
    if critique:                                           # critique only once
        answers = handle_user_input(" ".join(critique), answers)
    return chat([{"role": "system", "content": main_prompt}, *answers,
                 {"role": "user", "content": f"The user question to answer: {input}"}])` },
      { title: `Design tips`, type: `list`, items: [
        `Write tool descriptions and parameter descriptions for the LLM, not for humans.`,
        `Send sub-questions one at a time so each can be routed and updated with earlier answers.`,
        `Ask for JSON output (response_format json_object) for the updater and critic.`,
        `Always include an exit criterion for critique loops.`,
        `Add specialized retrievers as you discover questions that text2cypher gets wrong.`
      ] }
    ],
    interview: [
      { q: `What are the foundational parts of an agentic RAG system?`, a: `Retriever agents (the actual retrievers, generic and specialized), a retriever router that selects the best retriever(s) and arguments for each question (usually an LLM with tool calling), and an answer critic that checks whether the original question was fully answered and generates follow-up questions if not.`, diff: `easy` },
      { q: `Why do we need agentic RAG instead of one retriever?`, a: `Data sources vary (unstructured text, graph data) and question types vary (similarity, lookup, aggregation). Generic retrievers like text2cypher can struggle on complex data, so narrow specialized retrievers handle common cases reliably and the router picks the best one, with text2cypher as a catch-all.`, diff: `med` },
      { q: `Does the LLM execute the retriever when it makes a tool call?`, a: `No. The LLM only returns the chosen tool name and JSON arguments. Your code maps the name to a function, parses the arguments, executes it and feeds the result back. The LLM may request multiple calls for one question.`, diff: `easy` },
      { q: `What does the query updater do and why process questions sequentially?`, a: `It rewrites the next question using previous answers so it is atomic and complete, e.g. turning "Is that person alive?" into "Is Walt Disney alive?" after the first sub-question is answered. Sequential processing makes routing simpler and enables these dependent rewrites.`, diff: `med` },
      { q: `How should an answer critic avoid infinite loops?`, a: `Bound it: the book critiques once; if answers are still incomplete it returns what it has and the final LLM says what is missing. In general, cap iterations, stop when no new information is retrieved, and allow "the answer is not available" as a valid outcome.`, diff: `med` },
      { q: `Why include an answer_given tool?`, a: `Some questions already contain their answer or it is already in the conversation ("What's Dave Smith's last name?"). Routing to a tool that just extracts it avoids unnecessary database calls and wrong retrievals.`, diff: `easy` },
      { q: `What are the costs of agentic RAG?`, a: `More LLM calls per question (updater, router, possibly text2cypher, critic, final answer), so higher latency and cost, plus more non-determinism and more components to evaluate. Specialized templates reduce calls; evaluation (Ch 8) checks tool selection.`, diff: `hard` },
      { q: `How do you decide when to add a new specialized retriever?`, a: `Monitor and benchmark: when a frequent question type is answered wrongly or slowly by text2cypher or vector search, wrap a correct parameterized query as a new tool with a clear description, and verify the router selects it.`, diff: `med` }
    ],
    labs: [`agenticRouter`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch6`, part: 3, number: 6,
    title: `Constructing knowledge graphs with LLMs`,
    overview: `Chunking legal contracts and retrieving top-k chunks can mix clauses from different contracts, and embeddings cannot answer "How many active contracts do we have with ACME Inc.?". The fix is to <strong>extract structured data</strong> from text with LLMs using <strong>Structured Outputs</strong> and a carefully designed <strong>data model</strong>, import it into a <strong>contract graph</strong>, run <strong>entity resolution</strong>, and keep the original <strong>chunks</strong> linked to the structured nodes.`,
    concepts: [
      { term: `Why chunking fails for contracts`, def: `Top-k similar chunks may come from different contracts, so payment terms from unrelated agreements get mixed together.`, why: `Document boundaries matter in legal and similar domains; the LLM then synthesizes a misleading answer.`, demo: `extraction` },
      { term: `Structured questions need structured data`, def: `Filtering, sorting, counting and aggregating ("How many active contracts with ACME Inc.?") require fields, not similar text.`, why: `Text embeddings retrieve similar content; they do not compute.` },
      { term: `LLM-based information extraction`, def: `Prompt an LLM to pull specific data points from unstructured text into a structured format (JSON, tables, key-value pairs).`, why: `Previously this required expensive multi-model systems; now the barrier is low.` },
      { term: `Structured Outputs`, def: `An API feature where you pass a schema (e.g. a Pydantic model) and the model's response is guaranteed to conform to it.`, why: `Type safety and consistent formatting with less post-processing and fewer prompt tricks. Supported types: string, number, boolean, integer, object, array, enum, anyOf.`, demo: `extraction` },
      { term: `Field descriptions`, def: `Each attribute gets a description, even if it seems obvious, e.g. "The date of the event. Use yyyy-MM-dd format".`, why: `There is no native date type, so the description defines the format. Names and descriptions steer the model.`, demo: `extraction` },
      { term: `Optional fields`, def: `Mark attributes Optional when they may be absent (end_date, total_amount).`, why: `Otherwise some LLMs hallucinate values to fill the gap. effective_date stays mandatory because every contract has one.`, demo: `extraction` },
      { term: `Enums vs examples`, def: `Use an enum when the full set of allowed values is known (contract_type). Put examples in the description when it is not (role: "provider", "client", "supplier").`, why: `Enums make values consistent and queryable; examples guide without over-restricting.`, demo: `extraction` },
      { term: `Nested objects & standards`, def: `Contract → parties: List[Organization] → location: Location. Ask for standards the LLM knows, like two-letter ISO country codes.`, why: `Nesting captures structure, but avoid too many levels. Standards make values consistent ("US", not "United States"/"USA").`, demo: `extraction` },
      { term: `Contract graph model`, def: `(:Organization)-[:HAS_PARTY {role}]->(:Contract), (:Organization)-[:LOCATED_AT]->(:Location), with unique constraints on Contract.id, Organization.name, Location.fullAddress.`, why: `Locations are separate nodes because an organization may have several addresses. Constraints ensure integrity and speed.` },
      { term: `Idempotent imports`, def: `MERGE on a stable key makes re-running an import safe. MERGE on randomUUID() creates a new node every run.`, why: `The book's contract import uses randomUUID(), so running it twice duplicates contracts.`, demo: `mergeCreate` },
      { term: `Entity resolution`, def: `Identifying and merging different representations of the same real-world entity.`, why: `"UTI Asset Management Company", "... Company Limited" and "... Company Ltd" should be one node. It is highly domain-specific: use string matching, clustering, ML, ontologies and expert feedback.`, demo: `entityResolution` },
      { term: `Structured + unstructured together`, def: `Store the chunked contract text as (:Contract)-[:HAS_CHUNK]->(:Chunk) alongside the extracted fields.`, why: `Keeps the richness of the source while enabling precise queries. For contracts, chunk by clause rather than by token count.` }
    ],
    cheatsheet: [
      { title: `Contract data model (Pydantic)`, type: `code`, body: `class Location(BaseModel):
    address: Optional[str] = Field(..., description="The street address of the location.")
    city: Optional[str] = Field(..., description="The city of the location.")
    state: Optional[str] = Field(..., description="The state or region of the location.")
    country: str = Field(..., description="The country of the location. Use the two-letter ISO standard.")

class Organization(BaseModel):
    name: str = Field(..., description="The name of the organization.")
    location: Location = Field(..., description="The primary location of the organization.")
    role: str = Field(..., description="The role of the organization in the contract, such as 'provider', 'client', 'supplier', etc.")

class Contract(BaseModel):
    """Represents the key details of the contract."""
    contract_type: str = Field(..., description="The type of contract being entered into.", enum=contract_types)
    parties: List[Organization] = Field(..., description="List of parties involved in the contract, with details of each party's role.")
    effective_date: str = Field(..., description="The date when the contract becomes effective. Use yyyy-MM-dd format.")
    term: str = Field(..., description="The duration of the agreement, including provisions for renewal or termination.")
    contract_scope: str = Field(..., description="Description of the scope of the contract, including rights, duties, and any limitations.")
    end_date: Optional[str] = Field(..., description="The date when the contract becomes expires. Use yyyy-MM-dd format.")
    total_amount: Optional[float] = Field(..., description="Total value of the contract.")
    governing_law: Optional[Location] = Field(..., description="The jurisdiction's laws governing the contract.")` },
      { title: `Extraction call`, type: `code`, body: `def extract(document, model="gpt-4o-2024-08-06", temperature=0):
    response = client.beta.chat.completions.parse(
        model=model, temperature=temperature,
        messages=[{"role": "system", "content": system_message},
                  {"role": "user", "content": document}],
        response_format=Contract,
    )
    return json.loads(response.choices[0].message.content)` },
      { title: `Schema design rules`, type: `list`, items: [
        `Talk to domain experts and end users to decide what to extract.`,
        `Give the class a docstring and every field a description.`,
        `Optional for fields that may be missing; mandatory only when always present.`,
        `Enum when values are a known closed set; examples in the description otherwise.`,
        `Specify formats (yyyy-MM-dd) and standards (ISO country codes).`,
        `Avoid deep nesting.`,
        `System message: define the domain and how the output will be used.`
      ] },
      { title: `Import + constraints`, type: `code`, body: `CREATE CONSTRAINT IF NOT EXISTS FOR (c:Contract) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (o:Organization) REQUIRE o.name IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (l:Location) REQUIRE l.fullAddress IS UNIQUE;

WITH $data AS contract_data
MERGE (contract:Contract {id: randomUUID()})   // not idempotent!
SET contract += { contract_type: contract_data.contract_type, ... }
WITH contract, contract_data
UNWIND contract_data.parties AS party
MERGE (p:Organization {name: party.name})
MERGE (loc:Location {fullAddress: party.location.address + ' ' + ...})
MERGE (p)-[:LOCATED_AT]->(loc)
MERGE (p)-[r:HAS_PARTY]->(contract)
SET r.role = party.role` }
    ],
    interview: [
      { q: `Why is plain chunk retrieval risky for legal documents?`, a: `Top-k chunks are chosen by similarity, not by document, so chunks sharing words like "payment terms" can come from different contracts. The LLM then blends terms from unrelated agreements. Also, questions like "how many active contracts with ACME" need filtering and counting, which embeddings cannot do.`, diff: `easy` },
      { q: `What is Structured Outputs and why use it for extraction?`, a: `An API capability where you supply a schema (e.g. Pydantic) and the model's response is guaranteed to match it. It gives type-safe, consistently formatted JSON with less post-processing and validation, and simpler prompts.`, diff: `easy` },
      { q: `Why mark some schema fields as Optional?`, a: `If a field is required but the information is absent, some LLMs hallucinate a value to satisfy the schema. Making end_date or total_amount optional lets the model return null for contracts that have no end date or amount.`, diff: `med` },
      { q: `When would you use an enum vs examples in a description?`, a: `Enum when the complete set of allowed values is known and you want consistent, queryable values (contract_type). Examples in the description when values are open-ended and you do not want to restrict them (party role: provider, client, supplier...).`, diff: `med` },
      { q: `What is entity resolution and why is it domain-specific?`, a: `Merging different representations of the same real-world entity (e.g. "UTI Asset Management Company Ltd" vs "Limited"). Naming conventions, abbreviations and what counts as "the same" differ per domain, so thresholds and rules that work for companies may fail for genes. Use domain rules/ontologies, experts and feedback loops.`, diff: `med` },
      { q: `Why is the book's contract import not idempotent and how would you fix it?`, a: `It MERGEs the Contract on randomUUID(), which never matches an existing node, so each run creates a duplicate. Use a deterministic key instead: a document ID or a hash of the source file, with a unique constraint.`, diff: `hard` },
      { q: `Why keep unstructured chunks in the graph after extraction?`, a: `Extraction captures selected fields; the original text holds details the schema did not anticipate. Linking chunks to the Contract node lets you combine precise structured queries with context from the source text, and scope chunk retrieval to the right contract.`, diff: `med` },
      { q: `How would you design the extraction schema for a new domain?`, a: `Interview domain experts and end users about questions to answer, define a typed model with docstrings and field descriptions, mark optional fields, use enums for closed sets and standards for formats, keep nesting shallow, test on sample documents and iterate.`, diff: `med` }
    ],
    labs: [`extraction`, `entityResolution`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch7`, part: 3, number: 7,
    title: `Microsoft's GraphRAG implementation`,
    overview: `MS GraphRAG builds a knowledge graph in two stages. First, an LLM <strong>extracts entities and relationships</strong> (with descriptions and strength scores) from each chunk, and multiple descriptions are <strong>summarized</strong> into one. Second, <strong>communities</strong> of densely connected entities are detected (Louvain here, Leiden in the paper) and <strong>community reports</strong> are generated. Retrieval uses <strong>global search</strong> (map-reduce over community reports for broad questions) and <strong>local search</strong> (vector-matched entities expanded to chunks, relationships and communities). The dataset is <em>The Odyssey</em>.`,
    concepts: [
      { term: `Two-stage indexing`, def: `Stage 1: extract and summarize entities and relationships. Stage 2: detect communities and summarize them.`, why: `Turns fragments spread over many chunks into cohesive entity-level and community-level knowledge.` },
      { term: `Entity types`, def: `A predefined list passed to the extraction prompt. For The Odyssey: PERSON, ORGANIZATION, LOCATION, GOD, EVENT, CREATURE, WEAPON_OR_TOOL.`, why: `The choice shapes extraction, linking and summaries. PERSON and GOD are unambiguous; EVENT and LOCATION are fuzzy.` },
      { term: `Chunk size vs entities`, def: `Smaller chunks yield more extracted entity references (600 > 1,200 > 2,400 tokens in the paper's comparison).`, why: `The LLM detects more when it reads less at once, at the cost of more LLM calls. The book chunks books at 1,000 words with 40 overlap.`, demo: `chunkEntities` },
      { term: `Self-reflection (gleaning)`, def: `Extra extraction passes over the same chunk to catch missed entities.`, why: `Each additional pass finds more entity references for every chunk size.`, demo: `chunkEntities` },
      { term: `Extraction output`, def: `Entities: name, type, description. Relationships: source, target, description, numeric strength. Returned in a delimited tuple format.`, why: `Descriptions, not just triples, carry the knowledge used for summaries. Book 1 alone gave 66 entities and 182 relationships.` },
      { term: `Description summarization`, def: `When an entity (or entity pair) has several descriptions from different chunks, an LLM merges them into one comprehensive third-person summary, resolving contradictions.`, why: `Removes redundancy (ORESTES had six overlapping descriptions) and fragmentation. Telemachus-Minerva had 14 relationships to merge.` },
      { term: `Super nodes`, def: `Entities that appear in many chunks with an overwhelming number of relationships (e.g. Athens across all of Greek history).`, why: `Their descriptions may not fit in a prompt: rank or filter descriptions before summarizing.` },
      { term: `Community detection`, def: `Finding groups of entities more densely connected to each other than to the rest of the graph. The book uses Louvain (nondeterministic): 9 communities of 2-13 nodes.`, why: `Communities capture higher-level themes beyond individual connections. The paper uses the hierarchy at multiple levels.`, demo: `communities` },
      { term: `Community report`, def: `An LLM-written report: TITLE, SUMMARY, IMPACT SEVERITY RATING (0-10), RATING EXPLANATION, and 5-10 DETAILED FINDINGS.`, why: `These precomputed summaries make whole-dataset questions answerable.` },
      { term: `Global search`, def: `Map-reduce: for each community report with rating ≥ threshold (5 in the book), an LLM produces key points with importance scores 0-100 (map); the top points are combined into a final answer (reduce).`, why: `Answers broad questions like "What is this story about?" that no single chunk can. Lower hierarchy levels are more detailed but need more LLM calls.`, demo: `globalLocal` },
      { term: `Local search`, def: `Vector search over entity embeddings finds entry entities; Cypher expands to related chunks (ranked by how many entry entities they mention), community reports, relationships among the entities, and entity summaries, each capped, then one LLM call answers.`, why: `Best for entity-focused questions ("Who is Ulysses?").`, demo: `globalLocal` },
      { term: `Ranking to fit context`, def: `Every retrieved object type is ranked and limited (topChunks, topCommunities, topInsideRels).`, why: `Keeps the prompt within the context window while preserving the most relevant information. The same applies to large communities during summarization.` }
    ],
    cheatsheet: [
      { title: `Pipeline`, type: `list`, items: [
        `Chunk source text (books → 1,000-word chunks, 40 overlap).`,
        `LLM extracts entities (name, type, description) and relationships (description, strength) per chunk.`,
        `Import as (:__Entity__) nodes, [:RELATIONSHIP] edges, linked to (:__Chunk__).`,
        `LLM summarizes multi-description entities and relationships ([:SUMMARIZED_RELATIONSHIP]).`,
        `Detect communities (Louvain/Leiden) → (:__Community__) via [:IN_COMMUNITY].`,
        `LLM writes a report per community (title, summary, rating, findings).`,
        `Embed entity summaries + vector index for local search.`
      ] },
      { title: `Global vs local search`, type: `table`, headers: [`Aspect`, `Global search`, `Local search`], rows: [
        [`Best for`, `Broad, thematic questions`, `Entity-focused questions`],
        [`Entry point`, `All community reports above a rating`, `Top-k entities by vector similarity`],
        [`Context`, `Community reports only`, `Chunks, relationships, community reports, entity summaries`],
        [`LLM calls`, `One per community (map) + one (reduce)`, `One`],
        [`Book example`, `"What is this story about?"`, `"Who is Ulysses?"`]
      ] },
      { title: `Global search (map-reduce)`, type: `code`, body: `def global_retriever(query: str, rating_threshold: float = 5) -> str:
    community_data, _, _ = neo4j_driver.execute_query("""
        MATCH (c:__Community__) WHERE c.rating >= $rating
        RETURN c.summary AS summary""", rating=rating_threshold)
    intermediate_results = []
    for community in community_data:                       # map
        intermediate_results.append(chat([
            {"role": "system", "content": get_map_system_prompt(community["summary"])},
            {"role": "user", "content": query}]))           # -> points with score 0-100
    return chat([                                           # reduce
        {"role": "system", "content": get_reduce_system_prompt(intermediate_results)},
        {"role": "user", "content": query}])` },
      { title: `Local search context query (abridged)`, type: `code`, body: `CALL db.index.vector.queryNodes('entities', $k, $embedding) YIELD node, score
WITH collect(node) AS nodes
WITH collect { UNWIND nodes AS n MATCH (n)<-[:HAS_ENTITY]->(c:__Chunk__)
               WITH c, count(distinct n) AS freq
               RETURN c.text ORDER BY freq DESC LIMIT $topChunks } AS text_mapping,
     collect { UNWIND nodes AS n MATCH (n)-[:IN_COMMUNITY]->(c:__Community__)
               RETURN c.summary ORDER BY c.rank, c.weight DESC LIMIT $topCommunities } AS report_mapping,
     collect { UNWIND nodes AS n MATCH (n)-[r:SUMMARIZED_RELATIONSHIP]-(m) WHERE m IN nodes
               RETURN r.summary ORDER BY r.rank, r.weight DESC LIMIT $topInsideRels } AS insideRels,
     collect { UNWIND nodes AS n RETURN n.summary } AS entities
RETURN {Chunks: text_mapping, Reports: report_mapping,
        Relationships: insideRels, Entities: entities} AS text` }
    ],
    interview: [
      { q: `Describe MS GraphRAG's two indexing stages.`, a: `Stage 1: an LLM extracts typed entities and relationships with descriptions and strength scores from each chunk, then merges multiple descriptions per entity/relationship into summaries. Stage 2: community detection (Louvain/Leiden) groups densely connected entities and an LLM writes a report for each community.`, diff: `easy` },
      { q: `Why summarize entity descriptions instead of keeping them all?`, a: `The same entity is described in many chunks with overlapping or contradictory statements. An LLM merges them into one coherent, nonredundant summary, which is what local search and community reports use. Super nodes need ranking/filtering first so descriptions fit in the prompt.`, diff: `med` },
      { q: `How does chunk size affect MS GraphRAG extraction?`, a: `Smaller chunks produce more extracted entity references (600-token chunks beat 1,200 and 2,400 in the paper), and extra self-reflection passes add more. The trade-off is more LLM calls and cost for indexing.`, diff: `med` },
      { q: `How does global search work and when is it appropriate?`, a: `Map-reduce over community reports: filter communities by rating, ask the LLM for key points with importance scores (0-100) for each report, then combine the most important points into a final answer. It suits broad questions about the whole dataset that no single chunk answers.`, diff: `med` },
      { q: `How does local search work?`, a: `Embed the query, find the top-k entities by vector similarity on entity summaries, then expand via Cypher to linked chunks (ranked by how many entry entities they mention), their community reports, relationships among them and their summaries, each capped, and answer with one LLM call.`, diff: `med` },
      { q: `What does the community hierarchy level trade off in global search?`, a: `Lower-level (smaller) communities give more detailed reports and more thorough answers but require more map-step LLM calls and time. Higher-level communities are cheaper but more abstract and lose granularity.`, diff: `hard` },
      { q: `What is a drawback of Louvain for this pipeline?`, a: `It is nondeterministic: communities (and therefore reports and answers) can change between runs. Leiden, used in the paper, guarantees well-connected communities; fixing seeds helps reproducibility.`, diff: `hard` },
      { q: `What are the costs of MS GraphRAG?`, a: `Heavy LLM usage at indexing (extraction per chunk, possibly gleaning passes, summarization per entity, relationship and community) and many calls for global search queries. Entity types must be chosen in advance, and results depend on chunking and community parameters.`, diff: `med` }
    ],
    labs: [`chunkEntities`, `communities`, `globalLocal`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch8`, part: 4, number: 8,
    title: `RAG application evaluation`,
    overview: `A growing RAG agent needs a benchmark. Evaluate each stage, <strong>tool selection</strong>, <strong>retrieved context</strong>, <strong>answer generation</strong>, and the end-to-end system. The chapter designs a benchmark dataset for the Chapter 5 movies agent (greetings, irrelevant questions, tool usage and value mapping, aggregations, missing data), uses <strong>Cypher queries as ground truth</strong>, and scores it with <strong>RAGAS</strong>: <strong>context recall</strong>, <strong>faithfulness</strong> and <strong>answer correctness</strong>.`,
    concepts: [
      { term: `Stage-wise evaluation`, def: `Evaluate tool selection, relevance of retrieved context, answer generation, and the whole pipeline.`, why: `Failures at different stages need different fixes. Checking whether the LLM answers correctly <em>given correct context</em> separates reasoning from retrieval.` },
      { term: `Benchmark coverage`, def: `Include questions for tool selection, entity and value mapping, multistep retrieval, edge cases and functional coverage, and conversational usability (greetings, "what can you do?").`, why: `The benchmark defines and scopes what the agent should do.`, demo: `benchmark` },
      { term: `Cypher as ground truth`, def: `Store a Cypher query instead of a static answer; run it at evaluation time to get the expected answer.`, why: `The benchmark stays valid when the data changes.`, ex: `"How many movies did Tom Hanks appear in?" → MATCH (p:Person {name:"Tom Hanks"})-[:ACTED_IN]->(m:Movie) RETURN count(m)`, demo: `benchmark` },
      { term: `Static answers via RETURN`, def: `For greetings, capability questions and irrelevant or missing-data questions, the "ground truth" is a RETURN of a fixed string.`, why: `"What is the weather like in Spain?" → RETURN "irrelevant question..."; "Which movie has the most Oscars?" → RETURN "This information is missing".` },
      { term: `Value mapping`, def: `Mapping user input to database values ("top gun" → "Top Gun", "tom Hanks" → "Tom Hanks").`, why: `Works out of the box for famous entities thanks to pretraining; private datasets need a dedicated mapping system.` },
      { term: `RAGAS`, def: `A framework for evaluating RAG systems with LLM-judged metrics.`, why: `Gives repeatable, per-example and aggregate scores.` },
      { term: `Context recall`, def: `How much of the needed information was retrieved: each sentence of the reference answer is classified as attributable to the retrieved context (1) or not (0).`, why: `Low recall means the retriever is missing information.`, demo: `ragas` },
      { term: `Faithfulness`, def: `Break the answer into atomic statements (no pronouns), then judge each as inferable from the context (1) or not (0). Score = supported / total.`, why: `Measures hallucination relative to the retrieved context.`, demo: `ragas` },
      { term: `Answer correctness`, def: `Classify answer statements against the ground truth as TP (in both), FP (in answer only) or FN (in ground truth only), and compute a factual F1 = TP / (TP + ½(FP + FN)). RAGAS by default also blends in semantic similarity.`, why: `Measures whether the response fully and accurately answers the question.`, demo: `ragas` },
      { term: `Book's results`, def: `answer_correctness 0.7774, context_recall 0.7941, faithfulness 0.9657.`, why: `The model rarely makes things up, but retrieval misses information, which caps correctness. Improve retrieval coverage and entity mapping.`, demo: `ragas` },
      { term: `Observations from per-example scores`, def: `Latency is much lower when text2cypher is not needed (one fewer LLM call); LLM-judge scores can be inconsistent (e.g. "Hello"); "Who has the longest name among all actors?" failed.`, why: `Fix with a few-shot example or a dedicated tool, and grow the benchmark as the system evolves.` }
    ],
    cheatsheet: [
      { title: `RAGAS metrics`, type: `table`, headers: [`Metric`, `Compares`, `How`, `Low score means`], rows: [
        [`Context recall`, `Reference answer vs retrieved context`, `Share of reference sentences attributable to the context`, `Retriever missed information`],
        [`Faithfulness`, `Answer vs retrieved context`, `Atomic answer statements supported / total`, `Model added unsupported claims`],
        [`Answer correctness`, `Answer vs ground truth`, `TP/FP/FN statements → F1 (+ semantic similarity)`, `Wrong or incomplete answer`]
      ] },
      { title: `Benchmark examples`, type: `table`, headers: [`Category`, `Question`, `Ground truth`], rows: [
        [`Greeting`, `Hello`, `RETURN "greeting and reminder it can only answer questions related to movies."`],
        [`Capabilities`, `What can you do?`, `RETURN "answer questions related to movies and their cast."`],
        [`Irrelevant`, `What is the weather like in Spain?`, `RETURN "irrelevant question ..."`],
        [`Tool + value mapping`, `Who acted in top gun?`, `MATCH (p:Person)-[:ACTED_IN]->(m:Movie {title:"Top Gun"}) RETURN p.name`],
        [`Aggregation (text2cypher)`, `Who acted in the most movies?`, `MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p.name, COUNT(m) AS movieCount ORDER BY movieCount DESC LIMIT 1`],
        [`Filtering (text2cypher)`, `List people born before 1940.`, `MATCH (p:Person) WHERE p.born &lt; 1940 RETURN p.name`],
        [`Missing data`, `Which movie has the most Oscars?`, `RETURN "This information is missing"`]
      ], note: `The book's benchmark has 17 examples in total.` },
      { title: `Running the evaluation`, type: `code`, body: `for i, row in test_data.iterrows():
    ground_truth, _, _ = neo4j_driver.execute_query(row["cypher"])   # live ground truth
    start = datetime.now()
    try:
        answer, context = get_answer(row["question"])
    except Exception:
        answer, context = None, []
    latencies.append((datetime.now() - start).total_seconds())
    ...
dataset = Dataset.from_pandas(test_data.fillna("I don't know"))   # RAGAS needs non-null
result = evaluate(dataset, metrics=[answer_correctness, context_recall, faithfulness])` },
      { title: `Book's summary scores`, type: `table`, headers: [`answer_correctness`, `context_recall`, `faithfulness`], rows: [[`0.7774`, `0.7941`, `0.9657`]], note: `High faithfulness + lower recall → improve retrieval coverage, query reformulation and entity mapping.` }
    ],
    interview: [
      { q: `Which stages of a RAG agent should you evaluate?`, a: `Tool/retriever selection, relevance and completeness of retrieved context, answer generation (including whether the model answers correctly given the correct context), and the end-to-end pipeline. Stage-level metrics tell you where to fix.`, diff: `easy` },
      { q: `Why use Cypher queries as ground truth?`, a: `A static expected answer goes stale when the data changes (e.g. a new Tom Hanks movie). Running the stored Cypher at evaluation time recomputes the correct answer from current data, so the benchmark stays valid.`, diff: `med` },
      { q: `What should a benchmark dataset for a RAG agent include?`, a: `Questions that test tool selection, entity/value mapping (including casing variants), multistep retrieval, aggregations and filters, edge cases like missing data, out-of-scope questions, and conversational ones (greetings, capability questions). Cover every functionality and grow it over time.`, diff: `med` },
      { q: `Explain context recall, faithfulness and answer correctness.`, a: `Context recall: share of the reference answer's sentences supported by the retrieved context (did we retrieve what's needed?). Faithfulness: share of the answer's atomic statements inferable from the context (did the model make things up?). Answer correctness: TP/FP/FN of answer statements vs ground truth combined into an F1-style score (is the answer right and complete?).`, diff: `med` },
      { q: `The book got faithfulness 0.97 but context recall 0.79. What do you conclude?`, a: `The generator is grounded and rarely hallucinates, but the retriever often misses information, which caps answer correctness (0.78). Focus on retrieval: better tool selection, query reformulation, entity mapping, few-shot examples or new specialized tools.`, diff: `med` },
      { q: `What are pitfalls of LLM-as-judge metrics like RAGAS?`, a: `Scores can be inconsistent or odd on edge cases (the book notes the "Hello" example), depend on the judge model and prompt, and cost LLM calls. Inspect per-example results, keep a human review sample, and fix the judge model version.`, diff: `hard` },
      { q: `Why record latency in the benchmark?`, a: `Quality is not the only requirement. The book saw much lower latency for questions not needing text2cypher (one fewer LLM call), which informs decisions like adding specialized tools.`, diff: `easy` },
      { q: `How do you act on a failed benchmark question like "Who has the longest name among all actors?"`, a: `Diagnose the stage: here text2cypher couldn't generate the right query. Add a few-shot example (e.g. using size(p.name)) or a dedicated tool, re-run the benchmark, and keep the question as a regression test.`, diff: `med` }
    ],
    labs: [`ragas`, `benchmark`]
  },
  // ------------------------------------------------------------------
  {
    id: `appx`, part: 4, number: `A`,
    title: `Appendix: The Neo4j environment`,
    overview: `<strong>Neo4j</strong> is a native graph database where nodes and relationships are first-class citizens with properties, queried with <strong>Cypher</strong>. The book relies on two plugins: <strong>APOC</strong> (utility procedures, used for schema inference) and <strong>Graph Data Science</strong> (algorithms like community detection). Setup options are Neo4j Desktop, Docker and Aura; the Movies dataset is used in chapters 4, 5 and 8.`,
    concepts: [
      { term: `Native graph database`, def: `Neo4j stores data as nodes and relationships, both first-class, both carrying key-value properties. Implemented in Java, accessed via Cypher over HTTP or the binary Bolt protocol, with ACID transactions.`, why: `Traversing relationships is cheap, which suits multi-hop RAG retrieval.` },
      { term: `Cypher`, def: `A declarative graph query language with ASCII-art patterns: (a:Person)-[:FOLLOWS]->(b:Person).`, why: `Readable patterns make it easier for both humans and LLMs to write graph queries.` },
      { term: `openCypher & GQL`, def: `openCypher opens the Cypher spec to other vendors (Amazon, Memgraph, SAP HANA, and others). GQL is the ISO graph query language standard, influenced by Cypher.`, why: `Learning Cypher transfers to other graph databases.` },
      { term: `APOC`, def: `Awesome Procedures on Cypher: import/export, transformation, date-time, text processing and more.`, why: `apoc.meta.data() powers schema inference for text2cypher (Ch 4).` },
      { term: `Graph Data Science (GDS)`, def: `Parallel graph algorithms (shortest path, PageRank, community detection such as Louvain and Leiden), node embeddings and ML pipelines.`, why: `Community detection for MS GraphRAG (Ch 7).` },
      { term: `MERGE vs CREATE`, def: `CREATE always makes new elements. MERGE matches an existing pattern or creates it if absent.`, why: `MERGE on a stable key makes imports idempotent; MERGE on a random value does not.`, demo: `mergeCreate` },
      { term: `Constraints & indexes`, def: `Unique constraints (REQUIRE x.id IS UNIQUE), vector indexes and full-text indexes.`, why: `Integrity, faster MERGE lookups, and the search capabilities RAG needs.` },
      { term: `Setup options`, def: `Neo4j Desktop (local app, version 5.9.0 or later, install APOC and GDS from the Plugins tab), Neo4j Docker, or Neo4j Aura (cloud).`, why: `Any of them works for the book's notebooks.` }
    ],
    cheatsheet: [
      { title: `Cypher essentials`, type: `code`, body: `// match a pattern
MATCH (a:Person)-[:FOLLOWS]->(b:Person)
WHERE a.name = "Alice"
RETURN b.name

// create vs merge
CREATE (p:Person {name: "Alice"})           // always new
MERGE  (p:Person {name: "Alice"})           // match or create
MERGE  (p)-[:ACTED_IN]->(m:Movie {title: "Top Gun"})

// aggregate
MATCH (p:Person)-[:DIRECTED]->(m:Movie)
RETURN p.name, count(m) AS movies ORDER BY movies DESC LIMIT 5

// optional patterns + collect
MATCH (m:Movie {title: "The Matrix"})
OPTIONAL MATCH (m)<-[:ACTED_IN]-(a:Person)
RETURN m.title, collect(a.name) AS cast` },
      { title: `Indexes used in the book`, type: `table`, headers: [`Index`, `Statement`, `Used in`], rows: [
        [`Vector`, `CREATE VECTOR INDEX pdf IF NOT EXISTS FOR (c:Chunk) ON c.embedding`, `Ch 2, 3, 7`],
        [`Full-text`, `CREATE FULLTEXT INDEX PdfChunkFulltext FOR (c:Chunk) ON EACH [c.text]`, `Ch 2`],
        [`Unique constraint`, `CREATE CONSTRAINT IF NOT EXISTS FOR (c:Contract) REQUIRE c.id IS UNIQUE`, `Ch 6`]
      ] },
      { title: `Book node labels by chapter`, type: `table`, headers: [`Chapter`, `Graph`], rows: [
        [`2`, `(:Chunk {index, text, embedding})`],
        [`3`, `(:PDF)-[:HAS_PARENT]->(:Parent)-[:HAS_CHILD]->(:Child {embedding})`],
        [`4, 5, 8`, `Movies: (:Person)-[:ACTED_IN|DIRECTED|PRODUCED|WROTE|REVIEWED]->(:Movie), (:Person)-[:FOLLOWS]->(:Person)`],
        [`6`, `(:Organization)-[:HAS_PARTY]->(:Contract), (:Organization)-[:LOCATED_AT]->(:Location), (:Contract)-[:HAS_CHUNK]->(:Chunk)`],
        [`7`, `(:__Entity__)-[:RELATIONSHIP|SUMMARIZED_RELATIONSHIP]-(:__Entity__), -[:IN_COMMUNITY]->(:__Community__), (:__Chunk__)`]
      ] }
    ],
    interview: [
      { q: `What makes Neo4j a native graph database?`, a: `It stores nodes and relationships as first-class elements (not join tables), both with properties, so traversals follow stored pointers instead of computing joins. It offers ACID transactions and Cypher over HTTP or Bolt.`, diff: `easy` },
      { q: `What is the difference between MERGE and CREATE?`, a: `CREATE always creates new nodes/relationships. MERGE first tries to match the whole pattern and creates it only if it doesn't exist. MERGE on a stable unique key (with a constraint) makes imports idempotent.`, diff: `easy` },
      { q: `Why does the book need APOC and GDS?`, a: `APOC's apoc.meta.data() is used to infer the graph schema for text2cypher prompts. GDS provides community detection (Louvain/Leiden) for MS GraphRAG, plus other algorithms like PageRank and node embeddings.`, diff: `easy` },
      { q: `Why does Cypher's pattern syntax suit LLM query generation?`, a: `ASCII-art patterns closely mirror how relationships are described in language ("person acted in movie" → (p:Person)-[:ACTED_IN]->(m:Movie)), and Cypher is widely represented in training data, so LLMs already know its syntax.`, diff: `med` }
    ],
    labs: [`mergeCreate`]
  }
);
