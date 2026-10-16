// Deep dive: Chapter 4, Evaluate AI systems. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>A team building a contract-review assistant picks the model at the top of a public leaderboard. Two months later they learn three things. The model's license forbids their use case at their scale. Its answers take 14 seconds on a typical contract because it writes long explanations. And on their own contracts it is no better than a model costing a fifth as much, because the leaderboard measured general chat, not clause extraction from scanned PDFs.</p>
<p>Chapter 3 gave you measuring instruments. This chapter is about using them on <em>your</em> application: deciding what to measure, choosing a model with evidence rather than reputation, deciding whether to call an API or host a model yourself, and building an evaluation pipeline you can trust enough to make shipping decisions with.</p>`,
  sections: [
    {
      id: "evaluation-driven",
      title: "Evaluation-driven development",
      kicker: "Start here",
      blocks: [
        {
          type: "problem",
          html: `<p>Many AI features ship with no way to measure whether they work or whether they pay for themselves. Then every change is an argument, regressions are found by customers, and nobody can say whether the feature should be expanded or switched off.</p>`,
        },
        {
          type: "idea",
          html: `<p>Decide how you will evaluate the application <strong>before</strong> you build it, the way test-driven development writes the tests first. If you cannot describe what a good output looks like and how you would measure it, you are not ready to build.</p>`,
        },
        {
          type: "text",
          html: `<p>This is why the applications that succeed first are often the ones with natural evaluation: a recommender has click-through rates, a fraud model has chargebacks, generated code has tests. For everything else you have to construct the evaluation yourself, and that work is worth doing early because it shapes every later decision: which model, which prompt, whether retrieval helps, whether finetuning is worth it.</p>
<p>The evaluation also needs a bridge to the business. "Factual consistency of 92%" means nothing to a product owner. "At 92% factual consistency we can auto-send replies for the 30% of tickets in the simplest categories" is a decision. Build that mapping as part of the evaluation plan, even if the first version is a rough estimate.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "The smallest useful evaluation harness",
          code: `# Each case: an input, what "good" means, and tags for slicing later.
cases = [
    {"id": "t-001", "input": "Can I get a refund after 45 days?",
     "expect": {"must_mention": ["30-day"], "must_not": ["yes, anytime"]},
     "tags": {"topic": "refunds", "lang": "en", "length": "short"}},
    # ... hundreds more, drawn from real traffic
]

def run_eval(app, cases, scorers):
    rows = []
    for c in cases:
        out = app(c["input"])                     # the whole pipeline, not just the model
        scores = {name: fn(out, c) for name, fn in scorers.items()}
        rows.append({"id": c["id"], **c["tags"], **scores,
                     "latency_s": out.latency_s, "cost_usd": out.cost_usd})
    return rows                                   # aggregate overall and per tag`,
        },
        {
          type: "keypoints",
          items: [
            "Write the evaluation before the feature, and rerun it on every prompt, model or pipeline change.",
            "Draw cases from real or realistic traffic, and tag them so results can be sliced.",
            "Record latency and cost per case alongside quality: they are criteria too.",
          ],
        },
      ],
    },
    {
      id: "criteria",
      title: "What to measure: the four groups of criteria",
      kicker: "Criteria",
      blocks: [
        {
          type: "text",
          html: `<h3>1. Domain-specific capability</h3>
<p>Can the model do the task at all? A model that does not know contract law or a given programming language cannot be prompted into knowing it. Measure with domain benchmarks, functional correctness where outputs are verifiable, or multiple-choice questions built from your domain. This is the first filter because nothing downstream can compensate for it.</p>
<h3>2. Generation capability</h3>
<p>Quality of open-ended output. Fluency and coherence matter less than they used to, because strong models rarely produce broken prose. The two that matter most now are:</p>
<ul>
<li><strong>Factual consistency.</strong> <em>Local</em> consistency checks the output against the context you provided, which is the key metric for summarization and RAG. <em>Global</em> consistency checks it against world knowledge.</li>
<li><strong>Safety.</strong> Toxicity, bias, harmful instructions, and content that is inappropriate for your audience.</li>
</ul>`,
        },
        {
          type: "steps",
          title: "Checking factual consistency claim by claim",
          items: [
            "Split the output into atomic claims: \"The refund window is 30 days.\" \"Refunds go to the original card.\"",
            "For local consistency, check each claim against the provided context, using an AI judge (\"is this claim supported by the context?\") or a textual entailment model that labels each pair as entailment, contradiction or neutral.",
            "For global consistency, retrieve evidence for each claim, for example with web search, and judge it against that evidence. DeepMind's SAFE method (2024) automates this loop.",
            "Score the output as the fraction of supported claims, and flag any contradiction as a hard failure.",
          ],
        },
        {
          type: "text",
          html: `<h3>3. Instruction-following capability</h3>
<p>Does the model respect constraints on format, length, style and content? Pipelines break when a model wraps JSON in prose or ignores "answer in under 50 words". Benchmarks such as IFEval (2023) use instructions whose compliance can be checked by code, like "use exactly three bullet points" or "do not use commas". For your app, measure the rate of valid outputs against your own schemas and constraints.</p>
<h3>4. Cost and latency</h3>
<p>A better model that is too slow or too expensive fails the bar. Latency has two parts from Chapter 2:</p>
<p><span class="formula">total latency = TTFT + TPOT &times; output tokens</span></p>
<p>With a time to first token of 0.4 s, 20 ms per output token and a 500-token answer, total latency is 0.4 + 0.02 &times; 500 = 10.4 s. Halving the answer length saves 5 s; halving TTFT saves 0.2 s. Cost is <span class="formula">input tokens &times; input price + output tokens &times; output price</span>. At illustrative prices of $1 per million input tokens and $4 per million output tokens, a request with 2,000 input and 500 output tokens costs $0.002 + $0.002 = $0.004, or $4,000 per million requests.</p>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Decide which criteria are <strong>hard constraints</strong> (latency under 3 s at the 90th percentile, cost under $0.01 per request, zero safety violations on the red-team set) and which you <strong>optimize</strong> (quality). Then pick the cheapest option that clears every constraint, not the one with the highest score.</p>`,
        },
        {
          type: "quiz",
          q: "An answer takes 0.5 s to the first token and 25 ms per output token, and averages 800 output tokens. Users complain it is slow. Which change helps most?",
          options: [
            "Cut TTFT in half with a shorter prompt",
            "Cut the average answer to 300 tokens with a length instruction",
            "Raise the temperature",
            "Add two few-shot examples",
          ],
          answer: 1,
          explain: "Total latency is 0.5 + 0.025 &times; 800 = 20.5 s, and 20 s of that is decode. Shortening answers to 300 tokens brings it to 8 s. Halving TTFT only saves 0.25 s.",
        },
      ],
    },
    {
      id: "model-selection",
      title: "Selecting a model with evidence",
      kicker: "Model selection",
      blocks: [
        {
          type: "text",
          html: `<p>Model selection is a funnel. Each step is cheaper than the next, so you use the cheap steps to throw away candidates before spending effort on the expensive ones.</p>`,
        },
        {
          type: "diagram",
          title: "The model selection funnel",
          caption: "Hard attributes remove candidates outright; benchmarks give a coarse shortlist; your own evaluation decides; monitoring catches changes after launch.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="A four-step funnel from hard attributes to benchmarks to your own evaluation to monitoring">
<rect x="30" y="20" width="400" height="44" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="230" y="47" text-anchor="middle" font-size="13" font-weight="700">1. Filter on hard attributes</text>
<rect x="70" y="74" width="320" height="44" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="230" y="101" text-anchor="middle" font-size="13" font-weight="700">2. Shortlist with benchmarks</text>
<rect x="110" y="128" width="240" height="44" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="230" y="155" text-anchor="middle" font-size="13" font-weight="700">3. Run your own evals</text>
<rect x="150" y="182" width="160" height="44" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="230" y="209" text-anchor="middle" font-size="13" font-weight="700">4. Monitor</text>
<text x="450" y="38" font-size="12" style="fill: var(--dg-muted)">license, privacy,</text>
<text x="450" y="54" font-size="12" style="fill: var(--dg-muted)">deployment, context length</text>
<text x="450" y="92" font-size="12" style="fill: var(--dg-muted)">coarse shortlist;</text>
<text x="450" y="108" font-size="12" style="fill: var(--dg-muted)">beware contamination</text>
<text x="450" y="146" font-size="12" style="fill: var(--dg-muted)">your data: quality,</text>
<text x="450" y="162" font-size="12" style="fill: var(--dg-muted)">latency and cost</text>
<text x="450" y="200" font-size="12" style="fill: var(--dg-muted)">models and prices</text>
<text x="450" y="216" font-size="12" style="fill: var(--dg-muted)">keep changing</text>
<text x="30" y="250" font-size="12" style="fill: var(--dg-muted)">Candidates shrink at each step; the last step never ends.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Hard and soft attributes</h3>
<p><strong>Hard attributes</strong> are things you cannot change: the license, whether data may leave your network, where the model can run, the provider's maximum context length, whether it supports the features you need. They are pass/fail filters. <strong>Soft attributes</strong> are things you can improve with work, like accuracy on your task (better prompts, retrieval, finetuning). Do not discard a model for a soft weakness you could fix cheaply, and do not keep one that fails a hard requirement however good it looks.</p>
<h3>Reading public benchmarks</h3>
<p>Benchmarks are useful for narrowing dozens of candidates to a handful, but read them with suspicion. They saturate. They may not resemble your task. Aggregated leaderboards depend on which benchmarks the maintainer picked and how they are weighted, and those choices change; Hugging Face's Open LLM Leaderboard, for instance, swapped in a harder set of benchmarks in 2024 because the old ones had stopped separating models. And benchmarks leak.</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>Contamination</strong> happens when benchmark questions end up in a model's training data, usually because they were posted on the web. The model then scores well by recall rather than skill. Two common checks: <strong>n-gram overlap</strong> between benchmark items and the training corpus (if you have access to it), and <strong>perplexity</strong>, which is suspiciously low on text the model has seen. Treat a leaderboard number as a hint, never as the answer.</p>`,
        },
        {
          type: "lab",
          id: "modelSelect",
          caption: "Set your workload and thresholds, filter out candidates that fail hard constraints, then find the cheapest model that is still good enough on your evaluation.",
        },
        {
          type: "quiz",
          q: "A model tops a public leaderboard, but your evaluation shows it scoring no better than a much cheaper model on your task. What should you do?",
          options: [
            "Pick the leaderboard leader; public benchmarks are more rigorous",
            "Pick the cheaper model if it clears all your thresholds",
            "Average the two scores and decide",
            "Rerun the public benchmark yourself",
          ],
          answer: 1,
          explain: "Your own evaluation on representative data is the deciding step. Public benchmarks may not resemble your task and may be contaminated. If the cheaper model meets every quality, latency and cost threshold, it is the better choice.",
        },
      ],
    },
    {
      id: "build-vs-buy",
      title: "Model APIs or self-hosted open models",
      kicker: "Build vs buy",
      blocks: [
        {
          type: "text",
          html: `<p>Once you know what the model must do, the next question is how you will get it: call a commercial model through an API, or run an open-weight model on infrastructure you control (your own GPUs or a cloud provider's). Neither choice is right in general. The factors below decide it for your case.</p>`,
        },
        {
          type: "table",
          headers: ["Factor", "Model API", "Self-hosted open model"],
          rows: [
            ["Data privacy", "Prompts leave your organization (contracts can limit retention and use)", "Data stays on infrastructure you control"],
            ["Data lineage and copyright", "Training data usually undisclosed", "Varies; some open models document their data, many do not"],
            ["Performance", "Often the strongest models available", "Gap has been narrowing, varies by task"],
            ["Functionality", "Function calling, structured outputs, logprobs often built in", "You build or assemble these yourself"],
            ["Cost", "Per token, no infrastructure to run", "GPUs plus engineers; can be cheaper at high, steady volume"],
            ["Control", "Provider can update, rate-limit or deprecate the model", "Pin exact versions; finetune freely"],
            ["On-device or air-gapped", "Not possible", "Possible with small enough models"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Samsung (2023)", title: "Privacy as a hard attribute", html: "After employees pasted internal source code into ChatGPT in 2023, Samsung restricted staff use of generative AI tools on company devices. Incidents like this are why many companies treat \"data must not leave our network\" as a hard filter in model selection." },
          ],
        },
        {
          type: "text",
          html: `<p>Two factors are easy to underestimate. First, <strong>engineering cost</strong>: self-hosting means owning inference optimization, scaling, GPU procurement, upgrades and on-call. Per-token API pricing that looks expensive can be cheap compared with a team's salary. Second, <strong>control</strong>: with an API, the model you evaluated may be updated or retired on the provider's schedule, and your carefully tuned prompts may behave differently afterwards. Pin model versions where the provider allows it, and keep your evaluation ready to rerun.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Start with an API when",
          consLabel: "Consider self-hosting when",
          pros: [
            "You need to ship fast and learn what users want",
            "You need top-end quality or built-in tools and structured outputs",
            "Volume is low or unpredictable",
          ],
          cons: [
            "Data cannot leave your environment, or must run on-device",
            "You need pinned versions and deep finetuning",
            "Volume is high and steady enough that owned GPUs beat per-token prices, and you have the team to run them",
          ],
        },
      ],
    },
    {
      id: "pipeline",
      title: "Designing the evaluation pipeline",
      kicker: "Three steps",
      blocks: [
        {
          type: "text",
          html: `<h3>Step 1: evaluate every component</h3>
<p>Real applications are pipelines: retrieve documents, generate an answer, format it, maybe call a tool. An end-to-end score tells you <em>that</em> quality dropped; per-component scores tell you <em>where</em>. If answer quality falls and retrieval recall fell at the same time, you fix retrieval, not the prompt. For conversational products, evaluate both per turn (was this reply good?) and per task (did the user get their problem solved, and in how many turns?).</p>`,
        },
        {
          type: "diagram",
          title: "Component metrics plus an end-to-end metric",
          caption: "Each stage gets its own metric so failures can be attributed. The end-to-end metric says whether the user's task succeeded.",
          svg: `<svg viewBox="0 0 620 210" role="img" aria-label="A pipeline of retrieval, generation and formatting, each with its own metric, under an end-to-end metric">
<defs><marker id="ai4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="40" width="120" height="50" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="80" y="70" text-anchor="middle" font-size="13" font-weight="700">User query</text>
<rect x="170" y="40" width="120" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="230" y="70" text-anchor="middle" font-size="13" font-weight="700">Retrieve</text>
<rect x="320" y="40" width="120" height="50" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="380" y="70" text-anchor="middle" font-size="13" font-weight="700">Generate</text>
<rect x="470" y="40" width="120" height="50" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="530" y="70" text-anchor="middle" font-size="13" font-weight="700">Format</text>
<line x1="140" y1="65" x2="166" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai4-arrow)"/>
<line x1="290" y1="65" x2="316" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai4-arrow)"/>
<line x1="440" y1="65" x2="466" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai4-arrow)"/>
<line x1="230" y1="92" x2="230" y2="106" stroke-width="1.5" stroke-dasharray="3 3" style="stroke: var(--dg-1)"/>
<line x1="380" y1="92" x2="380" y2="106" stroke-width="1.5" stroke-dasharray="3 3" style="stroke: var(--dg-2)"/>
<line x1="530" y1="92" x2="530" y2="106" stroke-width="1.5" stroke-dasharray="3 3" style="stroke: var(--dg-3)"/>
<text x="230" y="122" text-anchor="middle" font-size="12">recall of the</text>
<text x="230" y="138" text-anchor="middle" font-size="12">right documents</text>
<text x="380" y="122" text-anchor="middle" font-size="12">faithfulness</text>
<text x="380" y="138" text-anchor="middle" font-size="12">to the context</text>
<text x="530" y="122" text-anchor="middle" font-size="12">valid output</text>
<text x="530" y="138" text-anchor="middle" font-size="12">rate</text>
<line x1="20" y1="162" x2="590" y2="162" stroke-width="2" style="stroke: var(--dg-ok)"/>
<line x1="20" y1="155" x2="20" y2="169" stroke-width="2" style="stroke: var(--dg-ok)"/>
<line x1="590" y1="155" x2="590" y2="169" stroke-width="2" style="stroke: var(--dg-ok)"/>
<text x="305" y="188" text-anchor="middle" font-size="12" font-weight="700">End to end: did the user's task succeed? Per turn and per task.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Step 2: write an evaluation guideline</h3>
<p>The guideline defines "good" so that different people, and AI judges, score the same way. It says what the application should and should not do (a support bot should not give legal advice, even correctly), lists the criteria, and gives each one a rubric with an example for every score. It also records how evaluation scores map to business metrics. Without it, two reviewers will disagree on half the borderline cases and your scores will drift.</p>
<h3>Step 3: choose methods and data, then slice</h3>
<p>Pick a method per criterion (functional checks where possible, judges for open-ended criteria, humans to calibrate the judges), and build an annotated evaluation set from realistic inputs. Then <strong>slice</strong> the results by user segment, topic, language, input length and anything else that matters, because aggregates hide problems.</p>`,
        },
        {
          type: "table",
          title: "Simpson's paradox: better overall, worse in every slice",
          headers: ["Slice", "Model A", "Model B"],
          rows: [
            ["Easy questions", "95 / 100 = 95%", "270 / 300 = 90%"],
            ["Hard questions", "120 / 300 = 40%", "30 / 100 = 30%"],
            ["Overall", "215 / 400 = 54%", "300 / 400 = 75%"],
          ],
          note: "Model A wins both slices, yet B looks far better overall because B was tested mostly on easy questions. Illustrative numbers.",
        },
        {
          type: "text",
          html: `<h3>How many examples do you need?</h3>
<p>Evaluation sets are samples, so scores are noisy. For an accuracy p measured on n examples, the standard error is <span class="formula">&radic;(p(1 &minus; p) / n)</span>. At p = 0.8 and n = 100 that is 0.04, so the 95% interval is about &plusmn;8 percentage points. At n = 1,000 it shrinks to about &plusmn;2.5 points. A 3-point improvement is invisible with 100 examples.</p>
<p>Because noise shrinks with the square root of n, detecting a difference 3 times smaller needs about 9, roughly 10, times more examples. That matches OpenAI's rough guide quoted in the book for 95% confidence: about 10 samples to detect a 30% difference, 100 for 10%, 1,000 for 3%, and 10,000 for 1%.</p>
<p>To check whether your own set is big enough, <strong>bootstrap</strong> it: resample the per-example scores with replacement many times and look at how much the average moves. If the spread is wider than the improvements you care about, you need more data.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "Bootstrapping an evaluation score",
          code: `import random, statistics

def bootstrap(scores, rounds=1000):
    means = []
    for _ in range(rounds):
        sample = random.choices(scores, k=len(scores))   # resample with replacement
        means.append(sum(sample) / len(sample))
    means.sort()
    return means[int(0.025 * rounds)], means[int(0.975 * rounds)]

scores = [1] * 80 + [0] * 20          # 100 examples, 80% correct
print(bootstrap(scores))              # roughly (0.72, 0.88): too wide to see a 3-point gain`,
        },
        {
          type: "lab",
          id: "sampleSize",
          caption: "System B is truly better than A. Shrink the evaluation set and count how often noise makes A look better, then compare with the 3x-smaller-difference, 10x-more-samples rule.",
        },
        {
          type: "quiz",
          q: "Your new prompt scores 2 points higher than the old one on a 200-example evaluation set. What should you conclude?",
          options: [
            "The new prompt is better; ship it",
            "The difference is well within the noise for 200 examples; you need a much larger set or a paired comparison to tell",
            "The old prompt is better, because small sets favor the baseline",
            "Evaluation sets should never exceed 100 examples",
          ],
          answer: 1,
          explain: "At around 80% accuracy, 200 examples give a 95% interval of roughly &plusmn;5.5 points on each score, so a 2-point gap is noise. By the rule of thumb, detecting a difference of a few points needs on the order of 1,000 or more examples.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>"How would you choose a model for this?" and "How would you know it is working?" come up in nearly every AI system design interview. The strongest answers are structured, mention cost and latency alongside quality, and show statistical awareness.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A two-minute answer to "pick and evaluate a model for feature X":</p>
<ol>
<li><strong>Criteria first:</strong> domain capability, factual consistency and safety, instruction following, and latency and cost budgets, with hard constraints named.</li>
<li><strong>Funnel:</strong> filter on hard attributes (license, privacy, deployment, context), shortlist with relevant benchmarks while noting contamination, decide with my own evaluation set, monitor after launch.</li>
<li><strong>API or self-host:</strong> decided by privacy, control, functionality, and volume versus engineering cost.</li>
<li><strong>Pipeline:</strong> component metrics plus end-to-end task success, a written guideline with rubrics, results sliced by segment.</li>
<li><strong>Statistics:</strong> enough examples for the difference I need to detect (about 1,000 for a few points), bootstrapped confidence intervals.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Choosing "the best model" from a leaderboard and stopping there. Interviewers want to hear that you would pick the <em>cheapest model that clears your thresholds on your own data</em>, and that you would re-evaluate when models or prices change.</p>`,
        },
        {
          type: "quiz",
          q: "Overall task success improved after a pipeline change, but complaints from enterprise customers increased. What is the first thing to check?",
          options: [
            "Whether the judge model changed",
            "Results sliced by customer segment, since an aggregate gain can hide a regression in an important slice",
            "Whether temperature is set to zero",
            "The public leaderboard ranking of the model",
          ],
          answer: 1,
          explain: "Aggregates can improve while a specific segment gets worse, especially if that segment is a small share of the evaluation set. Slicing by segment is how you find it.",
        },
      ],
    },
  ],
  takeaways: [
    "Design the evaluation before the feature, and connect evaluation scores to a business metric.",
    "Measure four groups of criteria: domain capability, generation quality (factual consistency and safety), instruction following, and cost and latency.",
    "Total latency is <span class=\"formula\">TTFT + TPOT &times; output tokens</span>; for long answers, output length dominates.",
    "Select models with a funnel: hard attributes, then benchmarks (with contamination in mind), then your own evaluation, then ongoing monitoring. Choose the cheapest model that clears every threshold.",
    "API vs self-hosting turns on privacy, control, functionality, and volume versus engineering cost.",
    "Evaluate each component and the end-to-end task, write a guideline with rubrics, and slice results: aggregates can hide regressions (Simpson's paradox).",
    "Small evaluation sets cannot detect small gains: each 3x smaller difference needs about 10x more examples. Bootstrap to check.",
  ],
  furtherReading: [
    { title: "Instruction-Following Evaluation for Large Language Models (Zhou et al., 2023)", url: "https://arxiv.org/abs/2311.07911", note: "IFEval: instruction following measured with automatically verifiable constraints." },
    { title: "Long-form factuality in large language models (Wei et al., 2024)", url: "https://arxiv.org/abs/2403.18802", note: "Introduces SAFE, search-augmented claim-by-claim fact checking." },
    { title: "OpenAI's evaluation guides", note: "Provider documentation on building evaluation sets and grading outputs. The book attributes its sample-size rule of thumb to OpenAI." },
  ],
};
