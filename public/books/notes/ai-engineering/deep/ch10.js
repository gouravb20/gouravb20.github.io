// Deep dive: Chapter 10, AI engineering architecture and user feedback. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch10 = {
  hook: `<p>The prototype was one function: take the user's message, send it to a model API, return the text. It demoed beautifully. Three months after launch the same app has a list of incidents. A customer pasted a credit card number, and it went to a third-party API. A user got a cached answer meant for someone else. Costs tripled because every "thanks!" went to the most expensive model. The provider had an outage and the whole product went down with it. And when quality dropped one Tuesday, nobody could say whether the prompt, the retriever or the model had changed.</p>
<p>None of these are model problems. They are architecture problems, and each one has a standard component that addresses it: guardrails, a router, a gateway, caches, observability and a feedback loop. This chapter assembles them one at a time, so that every box in the final diagram is there because a specific failure made it necessary.</p>`,
  sections: [
    {
      id: "five-steps",
      title: "Building the architecture one step at a time",
      kicker: "The big picture",
      blocks: [
        {
          type: "idea",
          html: `<p>Start from the simplest pipeline (query in, model, response out) and add components only as needs appear: <strong>(1)</strong> enhance context, <strong>(2)</strong> put in guardrails, <strong>(3)</strong> add a router and a gateway, <strong>(4)</strong> reduce latency with caches, <strong>(5)</strong> add agent patterns. Observability and feedback wrap around all of it.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Step 1, enhance context.</strong> Give the model what it needs for each query: retrieval over your documents (Chapter 6), tools such as web search or account lookups, and query rewriting. Context construction plays the role for foundation models that feature engineering played for classical ML: it is where much of the quality comes from.</p>
<p><strong>Steps 2 to 4</strong> protect the system and make it affordable, and get their own sections below. <strong>Step 5, agent patterns,</strong> turns the pipeline into a loop: the output can trigger more retrieval, several calls can run in parallel, and the system can take <em>write actions</em> such as sending an email or placing an order. Write actions sharply raise both what the system can do and what can go wrong, so they arrive last, behind guardrails and usually behind human approval.</p>`,
        },
        {
          type: "diagram",
          title: "A production request path",
          caption: "A request passes input guardrails, gets routed, may be answered from cache, gets context, reaches a model through the gateway and passes output guardrails. Every stage reports into observability, and user feedback flows back into evaluation.",
          svg: `<svg viewBox="0 0 640 285" role="img" aria-label="Architecture: query, input guardrails, router, cache, context, model gateway, models, output guardrails, response, with observability underneath">
<defs><marker id="ai10-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="50" width="80" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="60" y="80" text-anchor="middle" font-size="13" font-weight="700">Query</text>
<rect x="125" y="50" width="110" height="50" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="180" y="71" text-anchor="middle" font-size="13" font-weight="700">Input</text>
<text x="180" y="89" text-anchor="middle" font-size="12">guardrails</text>
<rect x="260" y="50" width="85" height="50" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="302" y="71" text-anchor="middle" font-size="13" font-weight="700">Router</text>
<text x="302" y="89" text-anchor="middle" font-size="12">intent</text>
<rect x="370" y="50" width="100" height="50" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="420" y="71" text-anchor="middle" font-size="13" font-weight="700">Cache</text>
<text x="420" y="89" text-anchor="middle" font-size="12">exact, semantic</text>
<rect x="495" y="50" width="125" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="557" y="71" text-anchor="middle" font-size="13" font-weight="700">Context</text>
<text x="557" y="89" text-anchor="middle" font-size="12">RAG, tools</text>
<line x1="100" y1="75" x2="123" y2="75" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-arrow)"/>
<line x1="235" y1="75" x2="258" y2="75" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-arrow)"/>
<line x1="345" y1="75" x2="368" y2="75" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-arrow)"/>
<line x1="470" y1="75" x2="493" y2="75" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-arrow)"/>
<text x="482" y="66" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">miss</text>
<rect x="470" y="150" width="150" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="545" y="171" text-anchor="middle" font-size="13" font-weight="700">Model gateway</text>
<text x="545" y="189" text-anchor="middle" font-size="12">fallbacks, budgets</text>
<rect x="335" y="150" width="105" height="50" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="387" y="171" text-anchor="middle" font-size="13" font-weight="700">Model(s)</text>
<text x="387" y="189" text-anchor="middle" font-size="12">cheap or strong</text>
<rect x="180" y="150" width="125" height="50" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="242" y="171" text-anchor="middle" font-size="13" font-weight="700">Output</text>
<text x="242" y="189" text-anchor="middle" font-size="12">guardrails</text>
<rect x="20" y="150" width="130" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="85" y="180" text-anchor="middle" font-size="13" font-weight="700">Response</text>
<line x1="557" y1="100" x2="557" y2="148" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-arrow)"/>
<line x1="470" y1="175" x2="442" y2="175" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-arrow)"/>
<line x1="335" y1="175" x2="307" y2="175" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-arrow)"/>
<line x1="180" y1="175" x2="152" y2="175" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-arrow)"/>
<line x1="400" y1="100" x2="110" y2="148" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-4)" marker-end="url(#ai10-arrow)"/>
<text x="140" y="122" font-size="12" style="fill: var(--dg-4)">cache hit</text>
<rect x="20" y="232" width="600" height="38" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2" stroke-dasharray="6 4"/>
<text x="320" y="256" text-anchor="middle" font-size="12">Observability and feedback: metrics, logs, per-request traces, user signals</text>
</svg>`,
        },
        {
          type: "lab",
          id: "gateway",
          caption: "Pick a query and switch components on and off. Watch which path it takes, what each stage adds in latency and cost, and which failure appears when a component is missing. The numbers are illustrative.",
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Orchestration frameworks (LangChain, LlamaIndex, Haystack, Flowise and others) let you declare these components and chain them. The book's advice is to start without one if you can, so you understand each step, and to judge a framework by its integrations, support for the pipeline shapes you need, ease of use and performance before adopting it.</p>`,
        },
      ],
    },
    {
      id: "guardrails",
      title: "Guardrails on the way in and on the way out",
      kicker: "Step 2",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Input guardrails</strong> protect against two risks. The first is leaking private information to external APIs: users paste customer records, credentials and personal identifiers into chat boxes. Detect sensitive data (with pattern matching and entity detectors) and either block the request, mask the data before it leaves your network, or route it to a model you host yourself. The second is malicious input such as prompt injection and jailbreak attempts, which classifiers and strict separation of instructions from user content help to catch.</p>
<p><strong>Output guardrails</strong> catch bad responses before users see them: empty or malformatted output (invalid JSON, missing fields), toxic content, statements inconsistent with the retrieved context, leaked sensitive information, and brand risk such as recommending a competitor or making promises the business cannot keep.</p>`,
        },
        {
          type: "steps",
          title: "What to do when an output guardrail trips",
          items: [
            "<strong>Retry.</strong> Sampling is random, so a second attempt often passes. If a response fails a check 10% of the time and attempts are independent, one retry cuts the failure rate to about 1%, at the cost of extra latency for that 10% of requests.",
            "<strong>Parallel calls.</strong> Send the request several times at once and return the first response that passes. Latency stays low, cost multiplies.",
            "<strong>Fallback.</strong> Switch to another model, return a safe canned message, or hand the conversation to a human, for example after repeated failures or when the user's sentiment turns negative.",
          ],
        },
        {
          type: "tradeoffs",
          title: "Guardrails are not free",
          prosLabel: "They buy",
          consLabel: "They cost",
          pros: [
            "Fewer privacy leaks, unsafe outputs and broken formats reaching users",
            "A clear place to enforce policy that does not depend on the prompt",
            "Signals (trigger rates) that reveal attacks and regressions",
          ],
          cons: [
            "Added latency for every check, especially model-based ones",
            "False positives that block legitimate requests",
            "Conflict with streaming: an output check needs text that has not been generated yet",
          ],
        },
        {
          type: "text",
          html: `<p>Streaming deserves its own note. Users like seeing tokens appear immediately, but a guardrail that judges the whole response cannot run until the response is complete. Teams compromise: check chunks as they stream and cut off the response if one fails, stream only for low-risk intents, or accept the latency of buffering for high-risk ones.</p>`,
        },
        {
          type: "quiz",
          q: "Your JSON output fails schema validation on 5% of requests. Latency matters, cost matters less. Which failure-handling strategy fits best?",
          options: ["Retry sequentially up to three times", "Make two or three parallel calls and return the first valid one", "Always fall back to a human", "Disable the schema check"],
          answer: 1,
          explain: "Parallel calls keep latency close to a single call while making it very likely that at least one response is valid. Sequential retries are cheaper but add a full round-trip of latency for every failure.",
        },
      ],
    },
    {
      id: "router-gateway",
      title: "Routers and gateways",
      kicker: "Step 3",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>router</strong> decides which model or pipeline should handle each query. Usually it is a small, fast classifier: an <em>intent classifier</em> (billing question, technical issue, small talk, out of scope) or a <em>next-action predictor</em> (answer directly, search first, ask a clarifying question, escalate). Routing lets you send simple queries to a cheap model, specialized ones to a specialized pipeline, and out-of-scope ones to a canned reply without calling a model at all.</p>
<p>The savings can be large. Suppose 70% of traffic is simple and a small model handles it at a tenth of the cost of the strong model. Routing costs 0.7 &times; 0.1 + 0.3 &times; 1 = 0.37 of sending everything to the strong model, a 63% saving, minus the router's own small cost. The risk is misrouting: a hard question sent to the weak model. Measure the router's accuracy like any other model, and bias it toward the strong model when unsure.</p>`,
        },
        {
          type: "text",
          html: `<p>A <strong>model gateway</strong> sits between your application and every model it uses, whether it is a commercial API or a model you host. It gives the application one interface and centralizes the concerns that otherwise get copied into every service:</p>
<ul>
<li><strong>Access control and keys:</strong> applications never hold provider keys directly.</li>
<li><strong>Cost management:</strong> per-team budgets, usage tracking, alerts.</li>
<li><strong>Rate limiting</strong> on your side, before providers throttle you.</li>
<li><strong>Fallbacks:</strong> if a provider fails or rate-limits, retry on another model.</li>
<li><strong>Logging:</strong> one place to record every request and response.</li>
</ul>
<p>Because every call passes through it, the gateway is also a natural home for guardrails and caches.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Router", tone: "info", html: "Decides <em>which</em> model or pipeline handles a query, based on its content. Improves cost and quality." },
            { title: "Gateway", tone: "ok", html: "Decides <em>how</em> calls reach models: auth, budgets, rate limits, fallbacks, logging. Improves control and resilience." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>The gateway is on every request path, so it becomes a single point of failure and a latency tax. Run it redundantly, keep it thin, and make sure a fallback to a second provider has actually been tested, since prompts tuned for one model may behave differently on another.</p>`,
        },
      ],
    },
    {
      id: "caching",
      title: "Caches: exact, semantic and prompt",
      kicker: "Step 4",
      blocks: [
        {
          type: "text",
          html: `<p>Model calls are slow and paid per token, so serving a stored answer is the fastest and cheapest response there is. Three kinds of caching apply at different layers.</p>
<p><strong>Exact caching</strong> stores responses keyed on the exact query (often normalized), plus anything else that affects the answer, such as the prompt version and model. It needs an eviction policy (LRU is common) and a TTL so answers do not outlive the facts behind them. It is safe and simple but only hits on identical repeats.</p>
<p><strong>Semantic caching</strong> embeds each query and returns a stored answer when a new query is similar enough to a cached one: "how do I reset my password" and "password reset steps?" share an answer. Every lookup costs an embedding and a vector search, and correctness rests entirely on one number, the similarity threshold.</p>
<p><strong>Prompt caching</strong> is different: it reuses the model's processed KV state for a repeated prompt prefix (Chapter 9). It does not skip the model call; it makes the call cheaper and faster.</p>`,
        },
        {
          type: "text",
          html: `<h3>Choosing the threshold</h3>
<p>Picture three candidate thresholds on cosine similarity. At 0.80, "cancel my order" and "don't cancel my order" can look similar enough to share an answer, which is a disaster. At 0.98, only near-identical phrasings hit and the cache rarely helps. Somewhere in between is a threshold that maximizes hits while keeping wrong hits acceptable, and the only way to find it is to label pairs of real queries as "should share an answer" or "should not" and measure both rates at each threshold.</p>`,
        },
        {
          type: "lab",
          id: "semanticCache",
          caption: "Move the similarity threshold and watch the hit rate and the wrong-hit rate change. Find the near-miss queries (negation, a different product, a holiday exception) that should never share an answer.",
        },
        {
          type: "tradeoffs",
          title: "Semantic caching",
          pros: [
            "Large latency and cost savings on repetitive traffic such as FAQs",
            "Catches paraphrases that exact caching misses",
          ],
          cons: [
            "Wrong hits return a confident, wrong answer with no model involved",
            "Embedding and vector search add latency to every request, including misses",
            "Personalized or time-sensitive answers must never be shared across users",
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Caching user-specific answers in a shared cache. "What's my balance?" has the same text for every user and a different answer for each. Scope cache keys by user where answers are personal, and exclude volatile intents (balances, order status, anything with "today") from caching entirely.</p>`,
        },
        {
          type: "quiz",
          q: "After enabling a semantic cache, the hit rate is 45% but support tickets about wrong answers rise. What is the most likely fix?",
          options: ["Lower the similarity threshold to raise the hit rate further", "Raise the threshold and exclude intents whose answers depend on negation, user or time", "Switch from cosine similarity to exact matching for everything", "Increase the cache's TTL"],
          answer: 1,
          explain: "Rising wrong answers with a high hit rate means the threshold is too permissive or the cache covers intents it should not. Tune the threshold on labeled pairs and exclude risky intents; lowering it would make things worse.",
        },
      ],
    },
    {
      id: "observability",
      title: "Monitoring, observability and drift",
      kicker: "Knowing what happened",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Monitoring</strong> tracks known metrics so you notice when something goes wrong. <strong>Observability</strong> is a property of the system: it emits enough metrics, logs and traces that you can work out <em>why</em> something went wrong, including problems nobody anticipated, without shipping new code to investigate. Classic operational goals carry over: shorten <strong>MTTD</strong> (mean time to detection) and <strong>MTTR</strong> (mean time to response), and keep the <strong>CFR</strong> (change failure rate, the share of deployments that cause failures) low.</p>`,
        },
        {
          type: "table",
          title: "What to monitor in an LLM application",
          headers: ["Category", "Examples"],
          rows: [
            ["Quality", "Format failure rate, factual consistency with retrieved context, toxicity, AI-judge scores on sampled traffic"],
            ["Latency", "TTFT, TPOT, total latency, per stage (retrieval, guardrails, model)"],
            ["Cost", "Input and output tokens per request, cost per request, cache hit rates"],
            ["Retrieval", "Context precision on sampled queries, empty-retrieval rate"],
            ["Guardrails", "Trigger rates for each input and output check"],
            ["User signals", "Regenerations, early stops, thumbs, escalations to humans"],
          ],
        },
        {
          type: "text",
          html: `<p>Slice every metric by user segment, release, prompt version and model, because averages hide regressions in one slice. And log everything needed to reconstruct a request: the original and rewritten query, retrieved documents, prompt template version, model and parameters, token counts, latency per stage, guardrail decisions, the output and any feedback, all tied together in one <strong>trace</strong>.</p>`,
        },
        {
          type: "code",
          title: "One request's trace (simplified)",
          lang: "json",
          code: "{\n  \"trace_id\": \"t-8f21\",\n  \"query\": \"how about the premium plan?\",\n  \"rewritten_query\": \"What is the refund policy for the premium plan?\",\n  \"route\": \"billing_faq\",\n  \"cache\": \"miss\",\n  \"retrieved\": [\"refunds.md#premium\", \"plans.md#premium\"],\n  \"prompt_version\": \"billing-v14\",\n  \"model\": \"provider-model-2024-xx\",\n  \"tokens\": { \"input\": 1840, \"output\": 212 },\n  \"latency_ms\": { \"retrieval\": 48, \"ttft\": 410, \"total\": 3120 },\n  \"guardrails\": { \"pii_input\": \"pass\", \"format\": \"pass\", \"consistency\": \"pass\" },\n  \"feedback\": \"regenerated\"\n}",
          caption: "With this, \"why did this answer go wrong?\" becomes a lookup: was the rewrite wrong, the retrieval empty, the prompt version new, or the model different?",
        },
        {
          type: "text",
          html: `<h3>Drift</h3>
<p>Quality can change even if you deploy nothing. Three sources are worth watching: changes to the system prompt (often edited outside the normal release process), changes in user behavior (new kinds of questions after a marketing campaign), and changes to the <strong>underlying model</strong>, because API providers can update the model behind a name. Pin dated model versions where the provider offers them, and run a fixed evaluation set on a schedule so that a silent change shows up as a score change rather than a wave of complaints.</p>`,
        },
      ],
    },
    {
      id: "user-feedback",
      title: "Designing, collecting and using user feedback",
      kicker: "The feedback loop",
      blocks: [
        {
          type: "text",
          html: `<p>User feedback serves three purposes: <strong>evaluation</strong> (is the product getting better?), <strong>development</strong> (training data for finetuning and preference tuning) and <strong>personalization</strong> (adapting to each user). It also feeds the data flywheel from Chapter 8: proprietary interaction data that competitors cannot copy.</p>
<p>Explicit feedback (thumbs, stars, written comments) is clear but rare; most users never click. Conversational interfaces produce much richer <strong>implicit</strong> feedback. In natural language, users stop a generation early, correct the model ("No, I meant the 2023 report"), complain, or express sentiment. In behavior, they <em>regenerate</em> a response, copy or edit it, delete or rename conversations, and vary in conversation length and in how diverse their questions are.</p>
<p>Implicit signals are plentiful but ambiguous. A long conversation might mean the user is engaged, or stuck. A regeneration might mean the answer was bad, or that the user wanted another option to compare. Interpret them in context and in aggregate, not one by one.</p>`,
        },
        {
          type: "keypoints",
          title: "When and how to ask",
          items: [
            "<strong>At the start</strong>, to calibrate: preferences, expertise level, goals.",
            "<strong>When something goes wrong</strong>: make it easy to flag a bad answer, and offer an alternative or a human.",
            "<strong>When the model is unsure</strong>: show two candidate responses and let the user pick, which also yields comparison data for preference tuning.",
            "<strong>How</strong>: build feedback into the workflow with minimal friction (one click, an edit, a choice), and tell users how it will be used.",
          ],
        },
        {
          type: "text",
          html: `<h3>Feedback is biased</h3>
<p>Users are lenient (they rate kindly, especially when asked directly), random (they click without reading), and biased by presentation: <strong>position bias</strong> makes the first option more likely to be picked, and <strong>preference bias</strong> often favors longer answers whether or not they are better. Users who leave feedback are not a random sample of all users. Treat feedback as a signal to analyze in slices, never as ground truth on its own.</p>
<p>The subtlest risk is the <strong>degenerate feedback loop</strong>. A system that optimizes for its own feedback shows users more of what they already reward, which produces more of that feedback, which pushes the system further in the same direction. In recommendations this narrows content toward what is already popular. In assistants it can produce <strong>sycophancy</strong>: a model tuned on approval learns that agreeing and flattering earns more thumbs than correcting.</p>`,
        },
        {
          type: "diagram",
          title: "The degenerate feedback loop",
          caption: "Feedback only exists for what the system chose to show, and optimizing on it reinforces those choices. Independent evaluation and some deliberate exploration break the cycle.",
          svg: `<svg viewBox="0 0 600 230" role="img" aria-label="Cycle: model shows answers, users react to what is shown, feedback is logged, model is optimized toward that feedback, which changes what the model shows">
<defs><marker id="ai10-loop" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="40" y="25" width="200" height="54" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="140" y="48" text-anchor="middle" font-size="13" font-weight="700">Model shows</text>
<text x="140" y="66" text-anchor="middle" font-size="12">answers or items</text>
<rect x="360" y="25" width="200" height="54" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="460" y="48" text-anchor="middle" font-size="13" font-weight="700">Users react</text>
<text x="460" y="66" text-anchor="middle" font-size="12">only to what is shown</text>
<rect x="360" y="150" width="200" height="54" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="460" y="173" text-anchor="middle" font-size="13" font-weight="700">Feedback logged</text>
<text x="460" y="191" text-anchor="middle" font-size="12">clicks, thumbs, edits</text>
<rect x="40" y="150" width="200" height="54" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="140" y="173" text-anchor="middle" font-size="13" font-weight="700">Model optimized</text>
<text x="140" y="191" text-anchor="middle" font-size="12">toward that feedback</text>
<line x1="240" y1="52" x2="358" y2="52" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-loop)"/>
<line x1="460" y1="79" x2="460" y2="148" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-loop)"/>
<line x1="360" y1="177" x2="242" y2="177" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-loop)"/>
<line x1="140" y1="150" x2="140" y2="81" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai10-loop)"/>
<text x="300" y="108" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">each lap amplifies</text>
<text x="300" y="126" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">what already wins</text>
</svg>`,
        },
        {
          type: "quiz",
          q: "After finetuning on thumbs-up data, your assistant's approval rate rises, but expert reviewers find it now agrees with users' incorrect claims more often. What happened, and what is the fix?",
          options: [
            "The model overfit; train for fewer epochs and keep using thumbs as the sole signal",
            "A degenerate feedback loop toward sycophancy; add evaluation that does not depend on user approval and weight feedback accordingly",
            "Position bias; shuffle the order of answers",
            "The thumbs-up button was broken",
          ],
          answer: 1,
          explain: "Optimizing on approval rewarded agreement over correctness, a classic degenerate loop. The fix is an independent quality signal (expert or AI-judge evaluation on correctness) that the optimization cannot game, with user feedback treated as one noisy input.",
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
          html: `<p>"Design a customer-support assistant" or "design an AI feature for product X" is a common prompt, and this chapter is the skeleton of a good answer. The trick is to justify each component by the failure it prevents rather than listing boxes.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer walks the request path:</p>
<ol>
<li>Input guardrails: PII detection and masking before external APIs, injection checks.</li>
<li>Router: intents such as FAQ, account action, out of scope, escalate; cheap model for simple traffic.</li>
<li>Cache: exact, then semantic for generic FAQs only, never for personal or time-sensitive answers.</li>
<li>Context: RAG over the help center, tools for account lookups, query rewriting.</li>
<li>Gateway: unified API, keys, budgets, rate limits, fallbacks, logging.</li>
<li>Output guardrails: format, consistency with retrieved docs, toxicity; retry, parallel calls or human fallback.</li>
<li>Write actions behind confirmation; observability with per-request traces and drift checks; feedback that feeds evaluation, with its biases accounted for.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "In a support-assistant design, the interviewer asks where PII masking should happen. What is the best answer?",
          options: [
            "In the output guardrail, after the model responds",
            "In the input guardrail, before the request leaves for any external model API, with output checks as a second line",
            "In the semantic cache",
            "Nowhere; providers handle it",
          ],
          answer: 1,
          explain: "Once sensitive data reaches a third-party API it has already left your control, so masking must happen on the way in. Output checks still help catch the model echoing sensitive data from retrieved context.",
        },
      ],
    },
  ],
  takeaways: [
    "Grow the architecture in steps (context, guardrails, router and gateway, caches, agent patterns) and justify each component by the failure it prevents.",
    "Input guardrails keep sensitive data and malicious prompts out; output guardrails catch bad responses. Handle trips with retries, parallel calls or fallbacks, and plan for the tension with streaming.",
    "A router picks the right model per query to save cost; a gateway centralizes keys, budgets, rate limits, fallbacks and logging.",
    "Exact caches are safe; semantic caches live or die by their similarity threshold and must never share personal or time-sensitive answers.",
    "Observability means per-request traces that let you explain failures without new code. Watch for drift from prompts, users and silent model updates.",
    "User feedback, explicit and conversational, powers evaluation, training data and personalization, but it is biased and can create degenerate loops such as sycophancy.",
  ],
  furtherReading: [
    { title: "AI Engineering (Chip Huyen, 2025), Chapter 10", note: "The five-step architecture and the user feedback discussion this deep dive follows." },
    { title: "DORA research program: software delivery metrics", note: "The origin of change failure rate and related delivery metrics used in operations." },
  ],
};
