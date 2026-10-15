// Deep dive: Chapter 8, Dataset engineering. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>Two teams finetune the same open model to answer insurance questions. Team A scrapes 200,000 question-answer pairs from forums and old tickets and trains for a week. Team B spends that week writing annotation guidelines, curating 3,000 examples that cover every policy type and the awkward edge cases, removing duplicates, and reading a few hundred samples by hand. Team B's model wins on every evaluation.</p>
<p>That outcome is not unusual. Once everyone can download similar base models and run the same finetuning scripts, the model stops being the difference between teams. The data is. Team A's corpus was big, but it was full of near-copies of the same ten questions, outdated answers, and replies in three different formats. This chapter is about building datasets on purpose: deciding what good data looks like, getting it, creating more of it with AI, and cleaning it so the model learns what you meant to teach.</p>`,
  sections: [
    {
      id: "data-centric",
      title: "Why data is the differentiator",
      kicker: "Motivation",
      blocks: [
        {
          type: "idea",
          html: `<p><strong>Data-centric AI</strong> improves results by improving the data rather than the model architecture or training algorithm. When base models are commodities, your dataset, built from your users, your domain and your judgment about quality, is what competitors cannot download.</p>`,
        },
        {
          type: "text",
          html: `<p>What data you need depends first on <em>how</em> you will train. Continued pretraining on a domain uses raw text and self-supervision: the model just predicts the next token. Supervised (instruction) finetuning needs pairs of a prompt and an ideal response. Preference finetuning needs a prompt with a preferred and a rejected response. Each format is more expensive to produce than the one before, because it encodes more human judgment per example.</p>
<p>The second factor is distance: how far the target behavior is from what the base model already does. Teaching a strong model to answer in your JSON schema may take a few hundred examples. Teaching it a new language or a specialized reasoning skill may take orders of magnitude more. Parameter-efficient methods such as LoRA usually need less data than full finetuning, because they change less.</p>`,
        },
        {
          type: "table",
          headers: ["Training stage", "One example looks like", "Relative cost to collect"],
          rows: [
            ["Continued pretraining", "Raw domain text (manuals, papers, code)", "Low: often already exists"],
            ["Instruction finetuning", "(prompt, ideal response)", "Medium: someone must write or verify the response"],
            ["Preference finetuning", "(prompt, preferred response, rejected response)", "High: needs comparative human judgment"],
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Dataset engineering is where most finetuning effort actually goes. The training run itself is often a few commands; deciding what goes into the data, and verifying it, is the work.</p>`,
        },
      ],
    },
    {
      id: "curation",
      title: "Curation: quality, coverage and quantity",
      kicker: "What good data looks like",
      blocks: [
        {
          type: "text",
          html: `<p>Curation asks three questions. Is each example good (<strong>quality</strong>)? Do the examples span what users will actually ask (<strong>coverage</strong>)? Are there enough of them (<strong>quantity</strong>)? They pull against each other under a fixed budget, and quality usually deserves the first dollar.</p>`,
        },
        {
          type: "keypoints",
          title: "Six traits of high-quality data",
          items: [
            "<strong>Relevant</strong> to the task: legal contracts for a contract model, not legal news.",
            "<strong>Aligned with task requirements</strong>: factually correct if the task needs facts, in the right style and length if it needs a style.",
            "<strong>Consistent</strong>: two annotators labeling the same example should agree; one example should not contradict another.",
            "<strong>Correctly formatted</strong>: no stray HTML, broken encodings or leftover template tokens.",
            "<strong>Sufficiently unique</strong>: few exact or near duplicates.",
            "<strong>Compliant</strong>: respects privacy rules, licenses and internal policy.",
          ],
        },
        {
          type: "text",
          html: `<p>The strongest public evidence for quality over quantity is LIMA (2023), which aligned a 65B model using only 1,000 carefully curated prompt-response pairs and reported results competitive with models trained on far more data. The lesson is not "1,000 is enough for everything" but that noise is expensive: every bad example teaches the model something you then have to un-teach.</p>
<p><strong>Coverage</strong> (diversity) matters because models fail on what they have never seen. Cover the range of topics, task types, input lengths, languages, formats and edge cases your users bring. Large model builders treat the domain mix as a deliberate design choice; Meta's Llama 3 report, for example, describes tuning the proportions of general text, math and reasoning, code and multilingual data.</p>`,
        },
        {
          type: "text",
          html: `<h3>How much data is enough?</h3>
<p>Do not guess; measure. First run a small experiment with 50 to 100 good examples. If performance does not move at all, more of the same data is unlikely to help, and you should rethink the task, the format or the base model. If it does move, train on increasing subsets (say 25%, 50%, 100% of what you have) and plot the evaluation score against dataset size. The slope of that curve tells you what the next 1,000 examples are worth.</p>`,
        },
        {
          type: "diagram",
          title: "Reading a data scaling curve (illustrative)",
          caption: "Scores usually rise quickly at first and then flatten on a log scale of examples. The slope near your current size estimates the return on buying or labeling more data. The shape here is illustrative, not measured.",
          svg: `<svg viewBox="0 0 600 270" role="img" aria-label="Illustrative curve of evaluation score versus number of training examples on a log scale, rising steeply then flattening">
<line x1="80" y1="220" x2="570" y2="220" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="80" y1="220" x2="80" y2="30" stroke-width="2" style="stroke: var(--dg-line)"/>
<text x="325" y="262" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">training examples (log scale)</text>
<text x="24" y="125" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)" transform="rotate(-90 24 125)">eval score</text>
<text x="120" y="240" text-anchor="middle" font-size="12">100</text>
<text x="260" y="240" text-anchor="middle" font-size="12">1k</text>
<text x="400" y="240" text-anchor="middle" font-size="12">10k</text>
<text x="540" y="240" text-anchor="middle" font-size="12">100k</text>
<line x1="120" y1="220" x2="120" y2="226" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="260" y1="220" x2="260" y2="226" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="400" y1="220" x2="400" y2="226" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="540" y1="220" x2="540" y2="226" stroke-width="2" style="stroke: var(--dg-line)"/>
<path d="M90 205 C 170 190, 220 110, 300 85 S 450 62, 560 58" fill="none" stroke-width="3" style="stroke: var(--dg-2)"/>
<circle cx="124" cy="194" r="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="138" y="212" font-size="12">small pilot: does it move?</text>
<line x1="215" y1="140" x2="285" y2="92" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-ok)"/>
<text x="120" y="70" font-size="12" style="fill: var(--dg-ok)">steep: more data pays</text>
<line x1="440" y1="66" x2="540" y2="59" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-bad)"/>
<text x="420" y="100" font-size="12" style="fill: var(--dg-bad)">flat: improve quality</text>
<text x="420" y="116" font-size="12" style="fill: var(--dg-bad)">or coverage instead</text>
</svg>`,
        },
        {
          type: "quiz",
          q: "Doubling your dataset from 5,000 to 10,000 examples improved the eval score by 0.3 points, while the previous doubling improved it by 4 points. What is the most sensible next move?",
          options: ["Buy 20,000 more examples of the same kind", "Look for quality and coverage gaps (error analysis) instead of adding more of the same", "Train for many more epochs", "Stop evaluating; the model is done"],
          answer: 1,
          explain: "The curve has flattened, so more of the same data has a low return. Error analysis usually reveals missing categories, inconsistent labels or formatting problems, which targeted data can fix.",
        },
      ],
    },
    {
      id: "acquisition",
      title: "Acquiring and annotating data",
      kicker: "Getting it",
      blocks: [
        {
          type: "text",
          html: `<p>The best data usually comes from <strong>your own application</strong>: real user inputs match the distribution your model will face, which no public dataset can. Other sources are public datasets (check licenses and whether they overlap your evaluation sets), purchased data, and annotation, by people or by models.</p>
<p>Application data also creates a <strong>data flywheel</strong>. More users produce more interactions and feedback, which improve the model, which attracts more users. A competitor can copy your architecture but not your users' history with your product. Collecting it requires consent, clear privacy terms and a way to remove personal data.</p>`,
        },
        {
          type: "text",
          html: `<h3>Annotation needs guidelines</h3>
<p>Annotation is evaluation in disguise: someone is deciding what a good response looks like. Write guidelines that define the task, show good and bad examples, and say what to do with ambiguous cases ("If the policy document is silent, the response must say so rather than guess"). Without them, each annotator invents their own standard and the model learns the average of several contradictory ones.</p>
<p>Measure consistency. Give the same subset to two annotators and compare. If they agree on 85 of 100 labels, raw agreement is 85%; a statistic such as Cohen's kappa adjusts that figure for the agreement you would expect by chance. Low agreement usually means the guidelines are unclear, not that the annotators are careless, so fix the guidelines and re-label before training.</p>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Ask annotators to flag examples they found hard or ambiguous. Those flags are a cheap map of where your guidelines, and probably your model, will struggle.</p>`,
        },
      ],
    },
    {
      id: "synthesis",
      title: "Augmentation, synthesis and distillation",
      kicker: "Making more data",
      blocks: [
        {
          type: "problem",
          html: `<p>Human-written data is slow and expensive, and rare cases (a refund request in Portuguese about a discontinued product) may never appear in your logs at all. You need more examples, and more varied ones, than people can write.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Traditional augmentation</strong> is rule-based: fill templates with different values, replace words with synonyms, add typos or perturbations. For physical tasks, <strong>simulation</strong> (game engines, robotics and driving simulators) generates scenarios that are too rare or dangerous to collect. These methods are cheap and controllable, but their diversity is limited by the rules you write.</p>
<p><strong>AI-powered synthesis</strong> uses models to generate data. A model can <em>paraphrase</em> existing prompts, <em>translate</em> them (back-translation, translating to another language and back, is a classic way to get varied phrasings), or, as in <strong>self-instruct</strong>, generate new instructions from a small set of seed tasks. Stanford's Alpaca (2023) used a self-instruct-style pipeline to produce 52,000 instruction examples from an OpenAI model. Models can also simulate users or agents to produce whole conversations.</p>
<p><strong>Reverse instruction</strong> flips the direction. Start from high-quality text that already exists, such as well-written articles, documentation or code, and ask a model to write the prompt that would produce it. The response is human-quality and only the prompt is synthetic, which avoids the main weakness of model-written answers. Meta's instruction backtranslation work (2023) applied this idea to web documents.</p>`,
        },
        {
          type: "diagram",
          title: "A synthetic data pipeline needs a verification gate",
          caption: "Generated examples pass through checks before they reach the training set, and rejected ones feed back into better generation prompts. Real data is mixed in at the end.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Pipeline: seed examples to model generation to verification, which either keeps examples for the training set mixed with real data, or rejects them with feedback to generation">
<defs><marker id="ai8-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="15" y="60" width="105" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="67" y="84" text-anchor="middle" font-size="13" font-weight="700">Seeds</text>
<text x="67" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">examples, docs</text>
<rect x="155" y="60" width="115" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="212" y="84" text-anchor="middle" font-size="13" font-weight="700">Generate</text>
<text x="212" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">model prompts</text>
<rect x="305" y="50" width="135" height="76" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="372" y="74" text-anchor="middle" font-size="13" font-weight="700">Verify</text>
<text x="372" y="92" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">tests, AI judge,</text>
<text x="372" y="109" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">heuristics, dedup</text>
<rect x="485" y="60" width="140" height="56" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="555" y="84" text-anchor="middle" font-size="13" font-weight="700">Training set</text>
<text x="555" y="102" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">synthetic + real</text>
<rect x="485" y="160" width="140" height="44" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="555" y="187" text-anchor="middle" font-size="13">Real data</text>
<rect x="305" y="160" width="135" height="44" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="372" y="187" text-anchor="middle" font-size="13">Rejected</text>
<line x1="120" y1="88" x2="153" y2="88" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai8-arrow)"/>
<line x1="270" y1="88" x2="303" y2="88" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai8-arrow)"/>
<line x1="440" y1="88" x2="483" y2="88" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai8-arrow)"/>
<text x="462" y="78" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">pass</text>
<line x1="372" y1="126" x2="372" y2="158" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai8-arrow)"/>
<text x="380" y="147" font-size="12" style="fill: var(--dg-bad)">fail</text>
<line x1="555" y1="160" x2="555" y2="118" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai8-arrow)"/>
<path d="M305 182 L212 182 L212 118" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-muted)" marker-end="url(#ai8-arrow)"/>
<text x="222" y="174" font-size="12" style="fill: var(--dg-muted)">fix prompts</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Why synthetic data needs care</h3>
<p>Quality control is the hard part: a model generating thousands of examples will also generate confident mistakes. Verify with whatever is objective first (does the generated code run and pass tests, does the SQL execute, does the answer match a known value), then with AI judges and heuristics such as length and format checks. Three deeper risks remain.</p>
<ul>
<li><strong>Superficial imitation.</strong> A small model trained on a strong model's outputs can copy its style without its capability. A 2023 study, "The False Promise of Imitating Proprietary LLMs", found imitation models looked convincing to human raters while closing little of the gap on factual and reasoning benchmarks.</li>
<li><strong>Model collapse.</strong> Training models recursively on model-generated data can make them lose the rare, tail parts of the original distribution over generations, as shown by Shumailov et al. (published in Nature in 2024). Mixing in real data mitigates it.</li>
<li><strong>Obscure lineage.</strong> Synthetic data inherits the licenses and terms of the model that generated it, and may contain benchmark content the generator memorized, which contaminates your evaluations.</li>
</ul>`,
        },
        {
          type: "text",
          html: `<h3>Distillation</h3>
<p><strong>Model distillation</strong> trains a small student model to imitate a large teacher, usually by training on teacher-generated outputs for your task. Done well, the student approaches the teacher's quality on that narrow task at a fraction of the inference cost and latency. Check the teacher's terms of use first: some providers prohibit using their outputs to train competing models.</p>`,
        },
        {
          type: "quiz",
          q: "You want instruction data for a technical-writing assistant and have 5,000 excellent, human-written API docs. Which technique best preserves human-quality responses?",
          options: ["Self-instruct from 20 seed prompts", "Reverse instruction: have a model write the prompt each doc would answer", "Synonym replacement on the docs", "Back-translate the docs through French"],
          answer: 1,
          explain: "Reverse instruction keeps the human-written docs as the responses and only synthesizes the prompts, so the part the model learns to produce stays high quality.",
        },
      ],
    },
    {
      id: "deduplication",
      title: "Deduplication at scale",
      kicker: "Removing copies",
      blocks: [
        {
          type: "problem",
          html: `<p>Duplicates distort training. A support answer that appears 400 times gets 400 times the weight of a rare one, which skews the distribution, wastes compute, and encourages the model to memorize text verbatim. Duplicates that cross from training into evaluation data inflate your scores: the model is graded on questions it has already seen.</p>`,
        },
        {
          type: "text",
          html: `<p>Deduplication works at different granularities (whole documents, paragraphs, sentences or lines) and at different strengths. <strong>Exact</strong> duplicates are easy: hash each item and drop repeated hashes. Normalizing first (lowercasing, collapsing whitespace, stripping punctuation) catches copies that differ only in formatting.</p>
<p><strong>Near duplicates</strong> differ by a few words: a templated email with a different name, a page with a new footer. Compare them with <strong>Jaccard similarity</strong> over shingles (overlapping runs of words): <span class="formula">J(A, B) = |A &cap; B| / |A &cup; B|</span>. For "the cat sat on the mat" and "the cat sat on a mat", the 2-word shingle sets share 3 of 7 distinct shingles, so J &asymp; 0.43. In long documents, a one-word edit barely moves J, which is exactly what you want.</p>`,
        },
        {
          type: "lab",
          id: "dedup",
          caption: "Run exact hashing, normalization, Jaccard on shingles and MinHash over eight documents, and see which duplicates each method catches and which slip through.",
        },
        {
          type: "text",
          html: `<h3>MinHash and LSH: making it scale</h3>
<p>Comparing every pair of documents is quadratic and impossible at billions of documents. <strong>MinHash</strong> compresses each document's shingle set into a short signature: apply many hash functions and keep the minimum hash value for each. For any one hash function, the chance that two documents share the same minimum equals their Jaccard similarity, so the fraction of matching signature entries estimates J.</p>
<p><strong>Locality-sensitive hashing</strong> (LSH) avoids comparing all signatures. Split each signature into <em>b</em> bands of <em>r</em> rows and hash each band into buckets. Two documents become candidates if any band matches exactly. The probability of that is <span class="formula">P(candidate) = 1 &minus; (1 &minus; s<sup>r</sup>)<sup>b</sup></span> for Jaccard similarity s, an S-shaped curve you tune with b and r.</p>`,
        },
        {
          type: "table",
          title: "LSH with b = 20 bands of r = 5 rows (100 hash functions)",
          headers: ["Jaccard similarity s", "Chance of becoming a candidate pair"],
          rows: [
            ["0.3", "about 5%"],
            ["0.5", "about 47%"],
            ["0.8", "about 99.96%"],
          ],
          note: "Pairs near the threshold are then checked with the exact Jaccard score. Shift the curve by changing b and r.",
        },
        {
          type: "realworld",
          items: [
            { org: "Deduplication research", title: "Lee et al., 2021", html: "\"Deduplicating Training Data Makes Language Models Better\" found substantial near-duplicate content in common training corpora and showed that removing it reduced how often models emit memorized training text." },
            { org: "Contamination checks", title: "GPT-3 paper, 2020", html: "OpenAI looked for overlaps of 13-word sequences between the training data and benchmark test sets to measure contamination. The same n-gram overlap idea works for checking your finetuning data against your own eval set." },
          ],
        },
        {
          type: "quiz",
          q: "Your LSH setup flags too many dissimilar pairs as candidates, overwhelming the exact-check step. Which change raises the similarity needed to become a candidate?",
          options: ["More bands with fewer rows each", "Fewer bands with more rows each", "Fewer hash functions overall, same bands", "Shorter shingles"],
          answer: 1,
          explain: "With more rows per band, s<sup>r</sup> falls quickly for moderate s, so a band match requires higher similarity. Fewer bands also give fewer chances to match. Both push the S-curve to the right.",
        },
      ],
    },
    {
      id: "processing",
      title: "Inspect, clean, filter and format",
      kicker: "Data processing",
      blocks: [
        {
          type: "text",
          html: `<h3>Inspect first</h3>
<p>Before any script touches the data, look at it. Plot token-length distributions for prompts and responses, the distribution of topics or sources, and annotator agreement. Then read samples by hand, a few dozen at least. The book makes the point that manual inspection is one of the highest-value activities in the whole workflow and one of the least practiced. It is how you find the response field full of HTML, or the 30% of "answers" that are actually "Please contact support."</p>`,
        },
        {
          type: "steps",
          title: "A typical processing order",
          items: [
            "<strong>Inspect:</strong> statistics, distributions and hand-read samples.",
            "<strong>Deduplicate:</strong> exact first (cheap), then near duplicates.",
            "<strong>Clean and filter:</strong> remove leftover formatting tokens and markup, redact or drop PII, filter toxic or low-quality samples with heuristics, quality classifiers or perplexity scores.",
            "<strong>Format:</strong> convert to the model's chat template and prompt structure; decide the prompt loss weight.",
            "<strong>Hold out and check:</strong> split off evaluation data and check it for overlap with training data.",
          ],
        },
        {
          type: "text",
          html: `<p>Quality filters come in a few flavors. Heuristics are rules such as minimum length, ratio of symbols to words, or banned phrases. A quality classifier is a small model trained to tell reference-quality text from junk. Perplexity filtering scores text with a language model and drops samples that are wildly unlikely, which often means garbled text, or suspiciously predictable, which often means boilerplate. Each filter removes some good data along with the bad, so check what it throws away.</p>
<h3>Format to match inference</h3>
<p>A model learns the exact token patterns it is trained on. Chat models expect a <strong>chat template</strong>: special tokens and markers around the system prompt, user turns and assistant turns. If training data uses a different template than inference, quality drops without any error message.</p>`,
        },
        {
          type: "code",
          title: "Same example, two templates",
          lang: "text",
          code: "Llama 2 chat format (what the model saw during its own finetuning):\n<s>[INST] Summarize this claim in one sentence: ... [/INST] The customer reports water damage ... </s>\n\nAd-hoc format (a common mistake):\nUser: Summarize this claim in one sentence: ...\nAssistant: The customer reports water damage ...",
          caption: "Finetuning a Llama 2 chat model on the second format, then serving it with the first (or the reverse), teaches patterns it will never see at inference. Use the tokenizer's built-in chat template where one exists.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Splitting train and eval sets <em>before</em> deduplicating. Near-copies of the same ticket end up on both sides, and your evaluation score measures memorization. Deduplicate across the whole pool first, then split.</p>`,
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
          html: `<p>Data questions appear whenever a design includes finetuning ("How would you build the training set?") and in ML-focused interviews as standalone questions about quality, synthetic data and deduplication. Interviewers want a process, not a single trick.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer walks through:</p>
<ol>
<li>The data format the training method needs (raw text, instruction pairs, preference pairs).</li>
<li>Quality traits and guidelines, with annotator agreement as the consistency check; coverage of real user distributions.</li>
<li>Quantity by experiment: a 50 to 100 example pilot, then a scaling curve.</li>
<li>Sources: application data and the flywheel first, then synthesis (self-instruct, reverse instruction, distillation) with verification and real-data mixing.</li>
<li>Processing: inspect, deduplicate (hashing, MinHash with LSH), clean and filter, format to the chat template, then hold out eval data and check contamination.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks how you would know whether synthetic data is helping your finetune. What is the best answer?",
          options: [
            "Check that the synthetic data reads fluently",
            "Train with and without it and compare on a held-out, human-verified eval set that the generator could not have seen",
            "Count how many examples were generated",
            "Ask the generating model to rate its own data",
          ],
          answer: 1,
          explain: "Fluency is exactly what synthetic data is good at faking. An ablation on an independent eval set, checked for contamination, measures whether the data adds capability rather than style.",
        },
      ],
    },
  ],
  takeaways: [
    "When base models are commodities, curated data is the differentiator; most finetuning effort is dataset engineering.",
    "High-quality data is relevant, aligned, consistent, well formatted, unique and compliant. LIMA showed 1,000 curated examples can go a long way.",
    "Decide quantity by experiment: a small pilot, then a performance-versus-size curve whose slope prices more data.",
    "Annotation needs written guidelines and an agreement check; disagreement usually means unclear guidelines.",
    "Synthetic data (self-instruct, reverse instruction, distillation) scales coverage but needs verification, real-data mixing and attention to imitation, model collapse and licensing.",
    "Deduplicate exact copies with hashes and near copies with MinHash and LSH, before splitting train and eval sets.",
    "Format training data with the same chat template used at inference; a mismatch silently degrades quality.",
  ],
  furtherReading: [
    { title: "LIMA: Less Is More for Alignment (Zhou et al., 2023)", note: "Aligning a 65B model with 1,000 curated examples." },
    { title: "Self-Instruct: Aligning Language Models with Self-Generated Instructions (Wang et al., 2022)", note: "Bootstrapping instruction data from a small seed set." },
    { title: "Deduplicating Training Data Makes Language Models Better (Lee et al., 2021)", note: "Near-duplicate detection at corpus scale and its effect on memorization." },
    { title: "AI models collapse when trained on recursively generated data (Shumailov et al., Nature, 2024)", note: "Why tails of the distribution vanish over generations of synthetic training." },
  ],
};
