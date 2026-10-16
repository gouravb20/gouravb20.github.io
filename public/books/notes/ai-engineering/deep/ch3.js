// Deep dive: Chapter 3, Evaluation methodology. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>Your team changes one sentence in the system prompt of a summarization feature. Is the new version better? Someone reads ten summaries and says "seems fine". Someone else reads ten different ones and finds a summary that invents a meeting date. A third person runs a word-overlap metric against reference summaries and gets a lower score, even though the new summaries look clearer. Nobody can say whether to ship.</p>
<p>For a spam classifier, this argument would end in a minute: compare predictions with labels and count. For open-ended output there is no single right answer to compare against, the model is a black box, and the better the model gets, the harder it is for a person to spot its mistakes. This chapter is the toolbox for that problem: what each evaluation method actually measures, when it works, and how it can quietly mislead you.</p>`,
  sections: [
    {
      id: "why-hard",
      title: "Why evaluating foundation models is hard",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Without reliable evaluation you cannot tell whether a prompt change, a new model or a retrieval tweak helped. Teams end up shipping on gut feel, or not shipping at all because they cannot prove the risk is acceptable.</p>`,
        },
        {
          type: "text",
          html: `<p>Several things make evaluation harder than it was for classic ML:</p>
<ul>
<li><strong>Open-ended outputs.</strong> A question can have many correct answers worded in countless ways, so comparing against one reference misses most of them.</li>
<li><strong>Capability outruns checking.</strong> Verifying a high-school summary is easy; verifying a subtle legal argument or a long proof needs an expert, and even experts are slow.</li>
<li><strong>Black boxes.</strong> With API models you often know little about the architecture or training data, so you can only judge outputs.</li>
<li><strong>Saturation.</strong> Public benchmarks stop separating models once the best ones score near the top. GLUE (2018) saturated quickly enough that SuperGLUE followed in 2019, and the same cycle has repeated since.</li>
</ul>
<p>Evaluation is also chronically under-invested compared with model and application work, even though it is what makes the other work trustworthy.</p>`,
        },
        {
          type: "table",
          title: "The methods in this chapter",
          headers: ["Family", "Needs", "Best for"],
          rows: [
            ["Language-modeling metrics", "Token probabilities (logprobs)", "Comparing pre-trained models, data quality, contamination checks"],
            ["Exact evaluation", "Tests, executors or reference answers", "Code, SQL, math, short factual answers"],
            ["AI as a judge", "A judge model and a well-written prompt", "Open-ended quality criteria at scale"],
            ["Comparative evaluation", "Pairs of outputs and preference votes", "Ranking models or versions against each other"],
          ],
        },
      ],
    },
    {
      id: "lm-metrics",
      title: "Entropy, cross entropy and perplexity",
      kicker: "Language-modeling metrics",
      blocks: [
        {
          type: "idea",
          html: `<p>A language model is a probability machine, so measure it by how much probability it gives to the text that actually occurs. A model that puts high probability on the real next tokens is less <em>surprised</em> by the data, and surprise can be measured in bits.</p>`,
        },
        {
          type: "text",
          html: `<p>The <strong>surprise</strong> of an event with probability p is <span class="formula">&minus;log<sub>2</sub> p</span> bits. A fair coin flip carries 1 bit; one of four equally likely outcomes carries 2 bits. <strong>Entropy</strong> is the average surprise of the data under its own true distribution P:</p>
<p><span class="formula">H(P) = &minus;&Sigma; P(x) log<sub>2</sub> P(x)</span></p>
<p>It measures how unpredictable the data is in principle. No model can beat it on average.</p>
<p><strong>Cross entropy</strong> measures how surprised a <em>model</em> with distribution Q is by data drawn from P:</p>
<p><span class="formula">H(P, Q) = &minus;&Sigma; P(x) log<sub>2</sub> Q(x) = H(P) + KL(P &#8214; Q)</span></p>
<p>The KL divergence term is the extra cost of using the wrong distribution. Cross entropy is the training loss of language models, and minimizing it pushes Q towards P. A quick check: if the true coin is fair, P = (0.5, 0.5), and a model believes Q = (0.8, 0.2), the cross entropy is 0.5 &times; 0.32 + 0.5 &times; 2.32 &asymp; 1.32 bits. The entropy is 1 bit, so the model wastes 0.32 bits per flip.</p>`,
        },
        {
          type: "text",
          html: `<h3>Perplexity</h3>
<p><strong>Perplexity</strong> converts cross entropy back into a count: <span class="formula">PPL = 2<sup>H(P, Q)</sup></span> (or e<sup>H</sup> if H is in nats). It reads as the number of equally likely tokens the model is effectively choosing between at each step. A perplexity of 3 means the model is as uncertain as if it were picking uniformly among 3 tokens.</p>
<p>Worked example. A model reads "The cat sat on the mat" and, after "The cat", gives the true next tokens these probabilities: sat 0.25, on 0.5, the 0.5, mat 0.125. Their surprises are 2, 1, 1 and 3 bits, so the cross entropy is 7 / 4 = 1.75 bits per token and the perplexity is 2<sup>1.75</sup> &asymp; 3.36.</p>`,
        },
        {
          type: "diagram",
          title: "Surprise per token, averaged into perplexity",
          caption: "Each bar is one token's surprise, &minus;log<sub>2</sub> p. Cross entropy is the average (dashed line); perplexity is 2 raised to that average.",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="Bars showing the surprise in bits of four tokens with their average">
<text x="20" y="30" font-size="12" style="fill: var(--dg-muted)">Surprise = -log2 p, in bits</text>
<line x1="60" y1="200" x2="450" y2="200" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<rect x="80" y="120" width="60" height="80" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="180" y="160" width="60" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="280" y="160" width="60" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="380" y="80" width="60" height="120" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="110" y="112" text-anchor="middle" font-size="12">2 bits</text>
<text x="210" y="152" text-anchor="middle" font-size="12">1 bit</text>
<text x="310" y="152" text-anchor="middle" font-size="12">1 bit</text>
<text x="410" y="72" text-anchor="middle" font-size="12">3 bits</text>
<line x1="60" y1="130" x2="450" y2="130" stroke-width="2" stroke-dasharray="6 5" style="stroke: var(--dg-2)"/>
<text x="110" y="220" text-anchor="middle" font-size="13">sat</text>
<text x="210" y="220" text-anchor="middle" font-size="13">on</text>
<text x="310" y="220" text-anchor="middle" font-size="13">the</text>
<text x="410" y="220" text-anchor="middle" font-size="13">mat</text>
<text x="110" y="238" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">p = 0.25</text>
<text x="210" y="238" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">p = 0.5</text>
<text x="310" y="238" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">p = 0.5</text>
<text x="410" y="238" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">p = 0.125</text>
<text x="462" y="126" font-size="12" font-weight="700">Average: 1.75 bits</text>
<text x="462" y="144" font-size="12">Perplexity = 3.36</text>
</svg>`,
        },
        {
          type: "lab",
          id: "perplexity",
          caption: "Compare models on the same sentence. Watch which tokens dominate the cross entropy, and how one very surprised token can raise the perplexity of the whole sequence.",
        },
        {
          type: "text",
          html: `<h3>Reading perplexity correctly</h3>
<ul>
<li><strong>More structured data gives lower perplexity.</strong> Code and boilerplate HTML are more predictable than poetry.</li>
<li><strong>A bigger vocabulary gives higher perplexity</strong>, because there are more options per step. Perplexities from different tokenizers are not comparable. <strong>Bits-per-character</strong> or <strong>bits-per-byte</strong> fix this by normalizing by text length instead of token count: 1.75 bits per token with an average of 4 characters per token is about 0.44 bits per character.</li>
<li><strong>Longer context gives lower perplexity</strong>, since the model has more to go on.</li>
<li><strong>Post-training often raises perplexity.</strong> An assistant tuned to give preferred answers is no longer trying to predict raw web text, so its perplexity worsens even as it becomes more useful. Do not rank chat models by perplexity.</li>
</ul>
<p>Perplexity still earns its keep beyond training curves. It is cheap and needs no references. Unusually low perplexity on a benchmark suggests the benchmark leaked into training data. Very high perplexity flags gibberish or out-of-distribution text in a data pipeline, and near-duplicate text can be found the same way.</p>`,
        },
        {
          type: "quiz",
          q: "Model A has perplexity 8 and model B has perplexity 12 on the same test set, but they use different tokenizers. What can you conclude?",
          options: [
            "A is clearly the better language model",
            "B is better because its vocabulary must be bigger",
            "Nothing definite; normalize by characters or bytes before comparing",
            "Both are post-trained, so perplexity is meaningless",
          ],
          answer: 2,
          explain: "Perplexity is per token, and different tokenizers split the same text into different numbers of tokens. Bits-per-character or bits-per-byte normalizes by text length so the comparison is fair.",
        },
      ],
    },
    {
      id: "exact-evaluation",
      title: "Exact evaluation: run it, or compare it to a reference",
      kicker: "Exact evaluation",
      blocks: [
        {
          type: "text",
          html: `<p>"Exact" here means the score is computed without judgment: the same output always gets the same score. There are two flavors.</p>
<h3>Functional correctness</h3>
<p>Check whether the output <em>does</em> what it should. Run generated code against unit tests, execute generated SQL and compare the returned rows, plug a math answer into a checker. When a task allows it, this is the most trustworthy automatic metric, because it measures the outcome you care about rather than a proxy.</p>
<p>Code models are commonly reported with <strong>pass@k</strong>: the probability that at least one of k samples passes the tests. The Codex paper (2021), which introduced the HumanEval benchmark of 164 hand-written Python problems, gave an unbiased way to estimate it from n samples of which c pass:</p>
<p><span class="formula">pass@k = 1 &minus; C(n &minus; c, k) / C(n, k)</span></p>
<p>With n = 10 samples and c = 3 passing: pass@1 = 1 &minus; 7/10 = 0.30, and pass@5 = 1 &minus; C(7,5)/C(10,5) = 1 &minus; 21/252 &asymp; 0.92. Sampling more is exactly the test-time compute idea from Chapter 2, which is why pass@k rises so quickly with k.</p>`,
        },
        {
          type: "text",
          html: `<h3>Similarity to a reference</h3>
<p>When you cannot execute the output, compare it with reference answers. Three levels, from strictest to loosest:</p>
<ul>
<li><strong>Exact match</strong>: identical after normalization. Good for short answers like "Paris" or "42".</li>
<li><strong>Lexical similarity</strong>: overlap of characters or words. Edit distance counts the insertions, deletions and substitutions needed to turn one string into another; n-gram metrics such as BLEU (translation) and ROUGE (summarization) count shared word sequences.</li>
<li><strong>Semantic similarity</strong>: compare meaning. Embed both texts as vectors and take the cosine similarity, <span class="formula">cos(a, b) = a&middot;b / (|a| |b|)</span>. Methods like BERTScore refine this at the token level.</li>
</ul>`,
        },
        {
          type: "text",
          html: `<p>A worked example shows why lexical metrics mislead. Reference: <em>"The Eiffel Tower is located in Paris."</em> (7 words). Using word-level F1, the harmonic mean of precision and recall over shared words:</p>
<ul>
<li><em>"The tower is in Paris."</em> All 5 words appear in the reference: precision 5/5, recall 5/7, F1 &asymp; <span class="hl-good">0.83</span>.</li>
<li><em>"It stands in the French capital."</em> Only "in" and "the" overlap: precision 2/6, recall 2/7, F1 &asymp; <span class="hl-bad">0.31</span>.</li>
</ul>
<p>Both answers are correct, yet one scores nearly three times higher purely on wording. A wrong answer that copies the reference's words, <em>"The Eiffel Tower is located in Rome."</em>, would score higher than either. Embedding similarity handles the paraphrase much better, but it is only as good as the embedding model, and it can still rate a fluent wrong answer as close to the reference.</p>`,
        },
        {
          type: "lab",
          id: "similarity",
          caption: "Try paraphrases, partial answers and wrong answers that reuse the reference's words. Compare exact match, token F1, edit distance, n-gram precision and embedding cosine.",
        },
        {
          type: "tradeoffs",
          prosLabel: "Exact evaluation",
          consLabel: "Limits",
          pros: [
            "Deterministic and cheap: the same output always gets the same score",
            "Functional checks measure real outcomes, not wording",
            "Easy to run on every change in continuous integration",
          ],
          cons: [
            "Functional correctness only applies to verifiable tasks",
            "References are costly to write and never cover every valid answer",
            "Lexical metrics reward wording over meaning; semantic metrics inherit the embedder's blind spots",
          ],
        },
      ],
    },
    {
      id: "ai-judge",
      title: "AI as a judge",
      kicker: "Judgment at scale",
      blocks: [
        {
          type: "idea",
          html: `<p>If a model can write an answer, a model can also critique one. Give a judge model the output, the criteria and a scoring scheme, and it returns a score and an explanation, in seconds and for a fraction of the cost of human review.</p>`,
        },
        {
          type: "text",
          html: `<p>Judges are used in three main ways: <strong>score a single response</strong> against criteria ("Is this answer faithful to the provided context? 1 to 5"), <strong>compare a response with a reference</strong> ("Does this answer convey the same facts as the reference?"), and <strong>pick the better of two responses</strong>. Because the criteria live in a prompt, you can evaluate almost anything: relevance, tone, safety, faithfulness, adherence to a style guide. The book notes it has become one of the most common evaluation methods in production.</p>
<p>The research behind it is encouraging. The 2023 paper that introduced MT-Bench reported that a strong judge (GPT-4) agreed with human preferences more than 80% of the time, about the same rate at which humans agree with each other. The same paper documented the biases below, which is the other half of the story.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "A judge prompt with the essential parts",
          code: `You are evaluating an answer produced by a support assistant.

Criterion: FAITHFULNESS. Every factual claim in the answer must be
supported by the CONTEXT. Ignore style and length.

Scoring:
  1 = contains a claim that contradicts the context
  2 = contains a claim not found in the context
  3 = every claim is supported by the context

Example (score 2): Context says "refunds take 5 days". Answer says
"refunds take 5 days and are emailed to you". The email detail is unsupported.

CONTEXT: {context}
ANSWER: {answer}

First list each claim and whether the context supports it.
Then output the score on the last line as: SCORE: <1|2|3>`,
        },
        {
          type: "text",
          html: `<h3>Where judges go wrong</h3>
<ul>
<li><strong>Inconsistency.</strong> The judge is itself a sampled model, so the same input can get different scores across runs.</li>
<li><strong>Ambiguous criteria.</strong> "Faithfulness" in one tool and "groundedness" in another may be defined differently, so scores do not transfer.</li>
<li><strong>Cost and latency.</strong> Every evaluated output is another model call.</li>
<li><strong>Biases.</strong> <em>Self-bias</em>: favoring outputs from its own model family. <em>Position bias</em>: favoring whichever response comes first in a comparison. <em>Verbosity bias</em>: favoring longer answers even when they are not better.</li>
</ul>
<p>The most important rule follows from all four: the judge's model and its prompt are part of your metric. Change either and your scores are no longer comparable with earlier ones, exactly as if you had swapped the ruler.</p>`,
        },
        {
          type: "diagram",
          title: "Cancelling position bias by swapping order",
          caption: "Ask the judge twice with the responses in opposite orders. A consistent winner is kept; a winner that flips with position is recorded as a tie or sent for human review.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="A pairwise judge run in both orders, with results reconciled">
<defs><marker id="ai3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="80" width="140" height="70" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="90" y="110" text-anchor="middle" font-size="13" font-weight="700">Prompt +</text>
<text x="90" y="128" text-anchor="middle" font-size="13" font-weight="700">two responses</text>
<rect x="220" y="30" width="170" height="56" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="305" y="54" text-anchor="middle" font-size="13" font-weight="700">Judge run 1</text>
<text x="305" y="73" text-anchor="middle" font-size="12">order: A, then B</text>
<rect x="220" y="144" width="170" height="56" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="305" y="168" text-anchor="middle" font-size="13" font-weight="700">Judge run 2</text>
<text x="305" y="187" text-anchor="middle" font-size="12">order: B, then A</text>
<rect x="450" y="80" width="150" height="70" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="525" y="104" text-anchor="middle" font-size="13" font-weight="700">Same winner?</text>
<text x="525" y="122" text-anchor="middle" font-size="12">yes: keep it</text>
<text x="525" y="139" text-anchor="middle" font-size="12">no: tie or review</text>
<line x1="160" y1="102" x2="216" y2="62" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai3-arrow)"/>
<line x1="160" y1="128" x2="216" y2="168" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai3-arrow)"/>
<line x1="390" y1="62" x2="446" y2="100" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai3-arrow)"/>
<line x1="390" y1="168" x2="446" y2="130" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai3-arrow)"/>
<text x="20" y="222" font-size="12" style="fill: var(--dg-muted)">Twice the judge calls, but the order of presentation no longer decides the result.</text>
</svg>`,
        },
        {
          type: "list",
          title: "Making a judge trustworthy",
          items: [
            "Define each criterion precisely and score one criterion per prompt.",
            "Prefer classification or a small discrete scale (1 to 3, 1 to 5) over fine-grained or continuous scores.",
            "Include an example of each score, and ask for reasoning before the verdict.",
            "Randomize or swap the order in pairwise comparisons.",
            "Use a judge from a different model family than the system being judged, where practical.",
            "Pin the judge's model version and prompt version, and log both with every score.",
            "Check agreement with human labels on a sample before trusting the judge, and re-check periodically.",
          ],
        },
        {
          type: "quiz",
          q: "Your pairwise judge prefers response A 70% of the time. When you swap the order, it prefers the response shown first 70% of the time regardless of which one it is. What is happening?",
          options: [
            "A is genuinely better",
            "Verbosity bias",
            "Position bias: the judge favors whichever response comes first",
            "Self-bias towards its own model family",
          ],
          answer: 2,
          explain: "If the preference follows the slot rather than the content, the judge is favoring position. Evaluating both orders and reconciling the results removes it.",
        },
      ],
    },
    {
      id: "comparative",
      title: "Comparative evaluation and rating systems",
      kicker: "Ranking by preference",
      blocks: [
        {
          type: "problem",
          html: `<p>Ask ten people to score an answer from 1 to 10 and you will get several different numbers, each anchored to that person's private sense of what a 7 means. Ask them which of two answers is better and they agree far more often.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Comparative evaluation</strong> collects many pairwise preferences and turns them into a ranking with a rating model. The idea is borrowed from games. In the <strong>Bradley-Terry</strong> model, each model i has a strength s<sub>i</sub> and the chance it wins against j is <span class="formula">P(i beats j) = s<sub>i</sub> / (s<sub>i</sub> + s<sub>j</sub>)</span>. <strong>Elo</strong>, the chess rating system, is an online version of the same idea: after every match, ratings move by how surprising the result was.</p>
<p>The Elo update in numbers. Model A is rated 1000 and model B 1100. A's expected score is</p>
<p><span class="formula">E<sub>A</sub> = 1 / (1 + 10<sup>(R<sub>B</sub> &minus; R<sub>A</sub>)/400</sup>) = 1 / (1 + 10<sup>0.25</sup>) &asymp; 0.36</span></p>
<p>If A wins (S<sub>A</sub> = 1) and K = 32, then <span class="formula">R<sub>A</sub>&prime; = 1000 + 32 &times; (1 &minus; 0.36) &asymp; 1020.5</span>, and B drops by the same 20.5 points. An upset moves ratings a lot; an expected win moves them a little.</p>`,
        },
        {
          type: "diagram",
          title: "Rating gap to expected win rate",
          caption: "Elo's expected score as a function of the rating difference. Equal ratings mean a coin flip; a 100-point lead means winning about 64% of the time; 400 points means about 91%.",
          svg: `<svg viewBox="0 0 620 275" role="img" aria-label="S-shaped curve of expected win rate against rating difference">
<line x1="80" y1="220" x2="480" y2="220" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="80" y1="220" x2="80" y2="40" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="80" y1="130" x2="480" y2="130" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="280" y1="40" x2="280" y2="220" stroke-width="1" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<polyline points="80,203.6 130,192.8 180,176.8 230,155.2 280,130 330,104.8 380,83.2 430,67.2 480,56.4" fill="none" stroke-width="3" style="stroke: var(--dg-1)"/>
<circle cx="330" cy="104.8" r="6" style="fill: var(--dg-2)"/>
<text x="342" y="124" font-size="12">+100 points: expected 64%</text>
<text x="72" y="224" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">0%</text>
<text x="72" y="134" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">50%</text>
<text x="72" y="44" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">100%</text>
<text x="80" y="240" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">-400</text>
<text x="280" y="240" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">0</text>
<text x="480" y="240" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">+400</text>
<text x="280" y="264" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Rating of A minus rating of B</text>
<text x="88" y="30" font-size="12" style="fill: var(--dg-muted)">Expected score for A</text>
</svg>`,
        },
        {
          type: "lab",
          id: "elo",
          caption: "Simulate votes between four models with hidden strengths. Watch how many votes it takes for the Elo ranking to settle, and what position bias does to it.",
        },
        {
          type: "realworld",
          items: [
            { org: "LMSYS Chatbot Arena", title: "Crowd-sourced pairwise votes", html: "Launched in 2023, the Arena shows a user two anonymous model responses to the user's own prompt and asks which is better. It began with Elo ratings and later moved to fitting a Bradley-Terry model over all votes, which gives more stable scores and confidence intervals than sequential Elo updates." },
          ],
        },
        {
          type: "text",
          html: `<h3>The limits of rankings</h3>
<ul>
<li><strong>Scalability.</strong> With n models there are n(n&minus;1)/2 pairs: 190 pairs for 20 models, each needing many votes. Smart matchmaking helps but does not remove the cost.</li>
<li><strong>Standardization.</strong> Crowd prompts and voters may look nothing like your users or your task. A model that wins on casual chat may lose on your contract-review workload.</li>
<li><strong>Transitivity can fail.</strong> A can beat B, B beat C, and C beat A, which no single ranking captures.</li>
<li><strong>Relative, not absolute.</strong> A ranking says A beats B. It does not say whether either is good enough for your application. For that you still need absolute evaluation against your own thresholds.</li>
</ul>`,
        },
        {
          type: "quiz",
          q: "Model X has a Bradley-Terry strength of 3 and model Y a strength of 1. In what fraction of comparisons should X win?",
          options: ["25%", "50%", "75%", "100%"],
          answer: 2,
          explain: "P(X beats Y) = 3 / (3 + 1) = 0.75. Stronger models win more often, but not always, which is why rankings need many votes to stabilize.",
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
          html: `<p>Evaluation questions separate people who have shipped AI features from people who have only prototyped them. Expect "how would you evaluate X?" in almost any AI system design round, and expect follow-ups on why a particular metric could mislead.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer picks methods by task, and names each method's failure mode:</p>
<ol>
<li><strong>Verifiable tasks</strong> (code, SQL, math): functional correctness first, reported as pass@k, run in a sandbox.</li>
<li><strong>Short factual answers:</strong> exact match after normalization, with semantic similarity to tolerate paraphrase.</li>
<li><strong>Open-ended quality:</strong> an AI judge with a precise rubric, discrete scores, reasoning before verdict, order swapping, and a pinned judge version validated against human labels.</li>
<li><strong>Choosing between versions or models:</strong> pairwise comparisons aggregated with Bradley-Terry or Elo, plus absolute thresholds so you know the winner is good enough.</li>
<li><strong>Pre-trained model and data work:</strong> perplexity and bits-per-byte, never for ranking chat models.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Reporting a BLEU or ROUGE score as the quality metric for a chat or RAG feature. Interviewers will ask what happens with a correct paraphrase or a wrong answer that reuses the reference's words. Have the Eiffel Tower example ready.</p>`,
        },
        {
          type: "quiz",
          q: "After post-training, your assistant's perplexity on a web-text test set went up, while human raters prefer its answers much more. What is the right interpretation?",
          options: [
            "Post-training broke the model; roll it back",
            "Expected: post-training optimizes for preferred answers, not for predicting raw web text, so perplexity is the wrong metric here",
            "The test set must be contaminated",
            "The tokenizer changed during post-training",
          ],
          answer: 1,
          explain: "Perplexity measures how well a model predicts a given text distribution. A post-trained assistant has moved away from raw web text by design, so rising perplexity alongside better human preference is normal. Use task-level evaluation for assistants.",
        },
      ],
    },
  ],
  takeaways: [
    "Open-ended outputs, black-box models and saturating benchmarks make evaluation the hardest part of AI engineering, and the most under-invested.",
    "Cross entropy = entropy + KL divergence; perplexity is 2 to the cross entropy (in bits). Lower is better, but only compare models on the same data and tokenizer, and never rank chat models by it.",
    "Functional correctness (pass@k) is the most reliable automatic metric when a task is verifiable.",
    "Lexical metrics reward wording; semantic similarity tolerates paraphrase but inherits the embedder's blind spots.",
    "AI judges scale well but are inconsistent and biased (self, position, verbosity). Treat the judge model and prompt as a pinned part of the metric and validate against humans.",
    "Pairwise preferences are more reliable than absolute scores; Bradley-Terry and Elo turn them into rankings, which still do not tell you whether a model is good enough.",
  ],
  furtherReading: [
    { title: "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (Zheng et al., 2023)", url: "https://arxiv.org/abs/2306.05685", note: "Agreement between AI and human judges, and the position, verbosity and self-enhancement biases." },
    { title: "Evaluating Large Language Models Trained on Code (Chen et al., 2021)", url: "https://arxiv.org/abs/2107.03374", note: "The Codex paper: HumanEval and the unbiased pass@k estimator." },
    { title: "BLEU: a Method for Automatic Evaluation of Machine Translation (Papineni et al., 2002)", note: "The original n-gram overlap metric, useful for understanding what lexical metrics can and cannot capture." },
  ],
};
