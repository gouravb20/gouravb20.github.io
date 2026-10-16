// Deep dive: Chapter 1, Introduction to building AI applications with foundation models. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>In 2018, a team that wanted to auto-tag support tickets had a long road ahead. Export tens of thousands of old tickets, pay people to label them, engineer features, train a classifier, and hope the labels still matched reality by the time it shipped. Months of work for one narrow model that could do exactly one thing.</p>
<p>Today the same team writes a paragraph of instructions, sends it with each ticket to a model behind an API, and has a working demo by Friday. It tags tickets, drafts replies, and even summarizes angry threads for the on-call manager. Then real traffic arrives: tickets in Portuguese, refund questions the model answers confidently and wrongly, a bill that scales with every word. The demo took a week. Making it trustworthy takes the rest of the quarter.</p>
<p>That gap, between "the model can do it" and "the product reliably does it", is what <strong>AI engineering</strong> is about. This chapter explains where these general-purpose models came from, what they are actually doing under the hood, and how to decide what to build on top of them.</p>`,
  sections: [
    {
      id: "tokens",
      title: "Tokens: the unit everything is measured in",
      kicker: "The building block",
      blocks: [
        {
          type: "problem",
          html: `<p>A model cannot read text directly. It needs a fixed list of symbols it knows how to handle. Use whole words and the list is enormous and still breaks on every typo, new product name or rare word. Use single characters and the list is tiny, but sequences become very long and each unit carries almost no meaning.</p>`,
        },
        {
          type: "idea",
          html: `<p>Split text into <strong>tokens</strong>: pieces that sit between characters and words. Common words become one token, rare words are broken into reusable fragments. The set of all tokens a model knows is its <strong>vocabulary</strong>, and the component that does the splitting is the <strong>tokenizer</strong>.</p>`,
        },
        {
          type: "text",
          html: `<p>Subword tokens get the best of both extremes. The word <code>cooking</code> can be <code>cook</code> + <code>ing</code>, and the same <code>ing</code> piece shows up in thousands of other words. A word the model has never seen, say an invented brand name, still breaks down into known pieces, so nothing is ever truly "out of vocabulary". Vocabularies typically hold tens of thousands to a few hundred thousand tokens.</p>
<p>How are the pieces chosen? A common method is <strong>byte-pair encoding</strong> (BPE). Start with individual characters, count which adjacent pair appears most often in a big corpus, merge that pair into a new token, and repeat. After enough merges, frequent words are single tokens and rare words remain split. The lab below runs this process on a small corpus.</p>`,
        },
        {
          type: "diagram",
          title: "Three ways to split the same word",
          caption: "Characters keep the vocabulary tiny but make sequences long. Whole words are compact but fail on any word not in the list. Subword tokens sit in between, which is why every modern language model uses them.",
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="The word cooking split as characters, subword tokens and a whole word">
<text x="20" y="45" font-size="13" font-weight="700">Characters</text>
<rect x="150" y="24" width="34" height="32" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="188" y="24" width="34" height="32" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="226" y="24" width="34" height="32" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="264" y="24" width="34" height="32" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="302" y="24" width="34" height="32" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="340" y="24" width="34" height="32" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="378" y="24" width="34" height="32" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="167" y="45" text-anchor="middle" font-size="13">c</text>
<text x="205" y="45" text-anchor="middle" font-size="13">o</text>
<text x="243" y="45" text-anchor="middle" font-size="13">o</text>
<text x="281" y="45" text-anchor="middle" font-size="13">k</text>
<text x="319" y="45" text-anchor="middle" font-size="13">i</text>
<text x="357" y="45" text-anchor="middle" font-size="13">n</text>
<text x="395" y="45" text-anchor="middle" font-size="13">g</text>
<text x="440" y="38" font-size="12" style="fill: var(--dg-muted)">7 units per word,</text>
<text x="440" y="54" font-size="12" style="fill: var(--dg-muted)">tiny vocabulary</text>
<text x="20" y="105" font-size="13" font-weight="700">Subword tokens</text>
<rect x="150" y="84" width="110" height="32" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="264" y="84" width="72" height="32" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="205" y="105" text-anchor="middle" font-size="13">cook</text>
<text x="300" y="105" text-anchor="middle" font-size="13">ing</text>
<text x="440" y="98" font-size="12" style="fill: var(--dg-muted)">2 units, reusable pieces,</text>
<text x="440" y="114" font-size="12" style="fill: var(--dg-muted)">vocabulary ~10K to ~200K</text>
<text x="20" y="165" font-size="13" font-weight="700">Whole words</text>
<rect x="150" y="144" width="262" height="32" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="281" y="165" text-anchor="middle" font-size="13">cooking</text>
<text x="440" y="158" font-size="12" style="fill: var(--dg-muted)">1 unit, but unseen words</text>
<text x="440" y="174" font-size="12" style="fill: var(--dg-muted)">have no entry at all</text>
<text x="20" y="208" font-size="12" style="fill: var(--dg-muted)">Real tokenizers learn their own splits; this one is illustrative.</text>
</svg>`,
        },
        {
          type: "lab",
          id: "tokenizer",
          caption: "Run byte-pair encoding merge by merge. Watch the vocabulary grow while the number of tokens per word falls, and notice which words end up as a single token.",
        },
        {
          type: "text",
          html: `<h3>Why engineers care about token counts</h3>
<p>Tokens are the unit of almost every practical limit. Context windows, rate limits, prices and latency are all quoted in tokens, not words. For English text with GPT-4's tokenizer, a token averages about three quarters of a word, so a handy rule is <span class="formula">tokens &asymp; words &times; 4/3</span>.</p>
<p>A worked example: a 1,500-word policy document is roughly 2,000 tokens. Paste it into every request of a support bot that handles 50,000 conversations a day and you are sending about 100 million input tokens a day just for that document, before the user has typed anything. The same habit of converting words to tokens and multiplying by traffic will come back in every chapter on cost and latency.</p>
<p>The ratio is not universal. Tokenizers are learned mostly from English-heavy data, so many other languages are split into more, shorter pieces. The same sentence in a lower-resource language can take several times as many tokens, which makes it more expensive, slower to generate, and quicker to fill the context window.</p>`,
        },
        {
          type: "quiz",
          q: "Your prompt template is 600 English words and each user message adds about 150 words. Roughly how many input tokens does one request use with a tokenizer that averages 0.75 words per token?",
          options: ["About 560", "About 750", "About 1,000", "About 4,500"],
          answer: 2,
          explain: "750 words divided by 0.75 words per token is 1,000 tokens. Token counts are always a bit higher than word counts for English, and often much higher for other languages.",
        },
      ],
    },
    {
      id: "self-supervision",
      title: "Language models and self-supervision",
      kicker: "How they learn",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>language model</strong> captures statistics about language: given some context, how likely is each token in the vocabulary to come next? Asked to continue <em>"My favorite color is"</em>, a good model puts far more probability on <code>blue</code> than on <code>car</code>. That one skill, assigning probabilities to tokens in context, is the foundation of everything a text model does.</p>`,
        },
        {
          type: "compare",
          title: "Two ways to train a language model",
          items: [
            { title: "Masked language model", tone: "info", html: "Hide some tokens and predict them using context on <em>both</em> sides: <em>\"My favorite __ is blue\"</em>. BERT (Google, 2018) is the classic example. Seeing both sides makes these models strong at understanding tasks such as classification and producing embeddings." },
            { title: "Autoregressive language model", tone: "ok", html: "Predict the <em>next</em> token using only the tokens before it: <em>\"My favorite color is __\"</em>. Feed each prediction back in and the model can keep writing indefinitely. This is why generative AI is built on autoregressive models such as the GPT family." },
          ],
        },
        {
          type: "problem",
          html: `<p>Classic machine learning needs labels, and labels are expensive. Someone has to mark each image as "cat" or "dog", each email as "spam" or "not spam". That cost capped how much data, and therefore how big a model, most teams could afford.</p>`,
        },
        {
          type: "idea",
          html: `<p><strong>Self-supervision</strong>: let the data label itself. In any piece of text, every prefix is an input and the token that follows it is the correct answer. No human has to annotate anything, so the training set can be as large as the text you can collect.</p>`,
        },
        {
          type: "diagram",
          title: "One sentence becomes many training examples",
          caption: "The sentence \"I love street food\" yields five (context, next token) pairs once you add start and end markers. Scale this to trillions of tokens of web text and you have a training set no labeling budget could buy.",
          svg: `<svg viewBox="0 0 600 250" role="img" aria-label="A sentence turned into five context and next-token training pairs">
<defs><marker id="ai1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="40" y="30" font-size="13" font-weight="700">Input (context)</text>
<text x="490" y="30" text-anchor="middle" font-size="13" font-weight="700">Label (next token)</text>
<rect x="40" y="44" width="330" height="26" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="52" y="62" font-size="13">&lt;BOS&gt;</text>
<rect x="40" y="78" width="330" height="26" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="52" y="96" font-size="13">&lt;BOS&gt; I</text>
<rect x="40" y="112" width="330" height="26" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="52" y="130" font-size="13">&lt;BOS&gt; I love</text>
<rect x="40" y="146" width="330" height="26" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="52" y="164" font-size="13">&lt;BOS&gt; I love street</text>
<rect x="40" y="180" width="330" height="26" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="52" y="198" font-size="13">&lt;BOS&gt; I love street food</text>
<line x1="378" y1="57" x2="422" y2="57" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai1-arrow)"/>
<line x1="378" y1="91" x2="422" y2="91" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai1-arrow)"/>
<line x1="378" y1="125" x2="422" y2="125" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai1-arrow)"/>
<line x1="378" y1="159" x2="422" y2="159" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai1-arrow)"/>
<line x1="378" y1="193" x2="422" y2="193" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai1-arrow)"/>
<rect x="430" y="44" width="120" height="26" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="490" y="62" text-anchor="middle" font-size="13">I</text>
<rect x="430" y="78" width="120" height="26" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="490" y="96" text-anchor="middle" font-size="13">love</text>
<rect x="430" y="112" width="120" height="26" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="490" y="130" text-anchor="middle" font-size="13">street</text>
<rect x="430" y="146" width="120" height="26" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="490" y="164" text-anchor="middle" font-size="13">food</text>
<rect x="430" y="180" width="120" height="26" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="490" y="198" text-anchor="middle" font-size="13">&lt;EOS&gt;</text>
<text x="40" y="236" font-size="12" style="fill: var(--dg-muted)">Every prefix is a question and the next token is its answer: no annotators needed.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Training then means nudging the model so that, for each pair, the true next token gets a higher probability. The model starts out guessing almost uniformly over its whole vocabulary and, over billions of updates, learns grammar, facts, styles of reasoning and code patterns, simply because all of those make the next token more predictable.</p>
<p>Generation reverses the process. Give the model a prompt, get a probability for every possible next token, pick one, append it, and ask again. Each step is a small prediction, but chained together they produce paragraphs. How the model picks one token from that distribution is the subject of sampling in Chapter 2.</p>`,
        },
        {
          type: "lab",
          id: "nextToken",
          caption: "Turn a small corpus into (context, next token) pairs, count them into a tiny bigram model, then query it and sample from it. This is self-supervision at toy scale.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Self-supervision is not limited to text. CLIP (OpenAI, 2021) learned to connect images and language from about 400 million image-caption pairs collected from the web, with the captions serving as the supervision. No one hand-labeled those images, which is why the dataset could be that large.</p>`,
        },
        {
          type: "quiz",
          q: "You need a model that writes a first draft of a reply to a customer email. Which training objective fits best, and why?",
          options: [
            "Masked, because it sees context on both sides of each gap",
            "Autoregressive, because it predicts the next token and so can generate open-ended text",
            "Either; generation quality does not depend on the objective",
            "Neither; drafting replies requires a supervised classifier",
          ],
          answer: 1,
          explain: "Masked models are good at filling gaps and understanding text, but generating a whole reply means producing tokens one after another from left to right, which is exactly what autoregressive models are trained to do.",
        },
      ],
    },
    {
      id: "foundation-models",
      title: "From language models to foundation models",
      kicker: "Why scale changed everything",
      blocks: [
        {
          type: "text",
          html: `<p>Language models are decades old. What changed was scale. Because self-supervision removes the labeling bottleneck, models could be trained on far more data with far more parameters. OpenAI's GPT-2 (2019) had 1.5 billion parameters; GPT-3 (2020) had 175 billion. Along the way, models stopped being tools for one task and started handling translation, summarization, question answering and coding with nothing but a change of instructions.</p>
<p>The term <strong>foundation model</strong>, popularized by a 2021 Stanford report, captures that shift: a large model trained on broad data with self-supervision, used as the base for many applications. Many are also <strong>multimodal</strong>, accepting or producing images, audio or video as well as text. These are often called large multimodal models (LMMs).</p>`,
        },
        {
          type: "text",
          html: `<h3>Adapting one model to many tasks</h3>
<p>Instead of training a model per task, you start from a general model and adapt it. The book works through three techniques in increasing order of effort:</p>
<ul>
<li><strong>Prompt engineering</strong> (Chapter 5): describe the task and give examples in the input. No weights change.</li>
<li><strong>Retrieval-augmented generation</strong> (Chapter 6): fetch relevant documents and put them in the context, so the model answers from your data.</li>
<li><strong>Finetuning</strong> (Chapter 7): continue training the model on your own examples so the behavior is built into the weights.</li>
</ul>
<p>The order matters in practice. Prompting costs minutes and is reversible; finetuning costs data, compute and an evaluation cycle. Most teams should exhaust the cheaper options first.</p>`,
        },
        {
          type: "text",
          html: `<h3>Why AI engineering took off</h3>
<p><strong>AI engineering</strong> means building applications on top of these readily available models. Three forces made it grow so fast:</p>
<ol>
<li><strong>General-purpose capability.</strong> One model can serve many use cases, including ones that were not practical before.</li>
<li><strong>Investment.</strong> Visible capability attracted money and talent into both model providers and application builders.</li>
<li><strong>A low barrier to entry.</strong> With model-as-a-service APIs, you need neither a training cluster nor an ML research team to start. A developer who can write an HTTP request can build a prototype.</li>
</ol>`,
        },
        {
          type: "realworld",
          items: [
            { org: "GitHub Copilot", title: "Code completion", html: "Launched as a technical preview in 2021 on top of OpenAI's Codex model, Copilot made AI-assisted coding mainstream. Coding remains one of the most widely adopted use cases, partly because code can be checked by compiling and running it." },
            { org: "ChatGPT", title: "Chat as the interface", html: "Released in November 2022, ChatGPT put a post-trained foundation model behind a plain chat box. It showed a very broad audience what general-purpose models can do and kicked off much of the current wave of application building." },
          ],
        },
        {
          type: "keypoints",
          items: [
            "A foundation model is large, trained with self-supervision on broad data, and adaptable to many downstream tasks.",
            "Adaptation goes from cheap and reversible (prompting) to costly and durable (finetuning); RAG sits in between.",
            "The model-as-a-service API is what lowered the barrier enough for application developers to build on these models directly.",
          ],
        },
      ],
    },
    {
      id: "planning",
      title: "Deciding what to build and how to judge it",
      kicker: "Planning an application",
      blocks: [
        {
          type: "problem",
          html: `<p>Because a prototype is so cheap, teams can start building before they have asked whether they should. Weeks later they have a demo nobody needs, a feature a model provider ships for free next quarter, or no way to tell whether the thing works.</p>`,
        },
        {
          type: "text",
          html: `<p>Popular use cases fall into recognizable families: coding, image and video production, writing, education, conversational bots, information aggregation (summarizing what you would otherwise read), data organization (extracting structure from documents) and workflow automation. Internal-facing tools such as knowledge search and coding assistants are often deployed first, because a mistake reaches an employee who can catch it rather than a customer.</p>`,
        },
        {
          type: "steps",
          title: "Questions to answer before you build",
          items: [
            "<strong>Why build it?</strong> Is there an existential risk if a competitor does it first, a clear profit or productivity gain, or is it mostly fear of being left behind? The last reason justifies a small experiment, not a big bet.",
            "<strong>What role does AI play?</strong> <em>Critical or complementary</em>: can the product work without the model? <em>Reactive or proactive</em>: does it answer a request or offer something unprompted? <em>Dynamic or static</em>: is it updated per user, or periodically for everyone?",
            "<strong>What role do humans play?</strong> The model might draft and a person approves, or it handles easy cases and escalates hard ones. Humans in the loop let you ship earlier with lower risk.",
            "<strong>Is it defensible?</strong> If a model provider can add your feature with a prompt, your moat is thin. Lasting advantages come from technology, distribution, and especially data, such as user feedback that improves your product over time.",
            "<strong>How will you measure success?</strong> Pick a business metric and usefulness thresholds for quality, latency and cost.",
          ],
        },
        {
          type: "text",
          html: `<h3>Turning goals into numbers</h3>
<p>Suppose your support team handles 10,000 tickets a month. A useful goal is not "use AI for support" but "automatically resolve 30% of tickets with a factual error rate below 2%, a first response under 5 seconds, and a model cost under $0.05 per ticket". Each number is a threshold: below it, the feature is not worth shipping no matter how impressive the demo looked.</p>
<p>Those thresholds are what let you plan milestones. They also tell you when to stop polishing: if a cheaper model already clears every bar, a better model is wasted money.</p>`,
        },
        {
          type: "diagram",
          title: "The last mile dominates the schedule",
          caption: "Foundation models make the first 80% fast, so early progress is misleading. Closing the gap to production quality on the long tail of real inputs is where most of the time goes.",
          svg: `<svg viewBox="0 0 560 280" role="img" aria-label="Quality rises quickly to a demo level, then slowly towards the production bar">
<rect x="200" y="30" width="320" height="210" style="fill: var(--dg-5-soft)" opacity="0.6"/>
<line x1="60" y1="240" x2="530" y2="240" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="60" y1="240" x2="60" y2="30" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="60" y1="50" x2="520" y2="50" stroke-width="2" stroke-dasharray="6 5" style="stroke: var(--dg-ok)"/>
<text x="70" y="42" font-size="12" style="fill: var(--dg-muted)">Production quality bar</text>
<text x="52" y="84" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">80%</text>
<text x="52" y="54" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">95%</text>
<path d="M60 240 C 100 100, 140 84, 200 80 S 400 64, 510 56" fill="none" stroke-width="3" style="stroke: var(--dg-1)"/>
<circle cx="200" cy="80" r="6" style="fill: var(--dg-1)"/>
<text x="210" y="106" font-size="12">Demo: about 80% in weeks</text>
<text x="360" y="190" text-anchor="middle" font-size="13" font-weight="700">The last mile</text>
<text x="360" y="208" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">often takes most of the time</text>
<text x="295" y="266" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Time and effort</text>
<text x="60" y="22" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Quality</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Plan for maintenance, too. Models are updated and deprecated, prices change, new capabilities appear, and a prompt tuned for one model version can behave differently on the next. An AI feature is less like a shipped library and more like a dependency that keeps moving under you, so budget for re-evaluation as a recurring cost.</p>`,
        },
        {
          type: "quiz",
          q: "A note-taking app adds a button that summarizes the current page when clicked. The app works fine without the feature. How would you classify the AI's role?",
          options: [
            "Critical and proactive",
            "Complementary and reactive",
            "Critical and reactive",
            "Complementary and proactive",
          ],
          answer: 1,
          explain: "The app is useful without summaries, so AI is complementary. The summary appears only when the user asks for it, so it is reactive. Complementary features tolerate more errors, because a bad summary does not break the product.",
        },
      ],
    },
    {
      id: "ai-stack",
      title: "The AI stack and how the work has shifted",
      kicker: "Engineering view",
      blocks: [
        {
          type: "text",
          html: `<p>Building on foundation models still involves the full range of ML work, but the work has redistributed. The book describes three layers. Most new activity happens in the top one, while the lower two still matter as soon as you scale or start customizing models.</p>`,
        },
        {
          type: "diagram",
          title: "Three layers of the AI stack",
          caption: "Application development sits on top of model development, which sits on top of infrastructure. Traditional ML teams usually started in the middle; AI engineering teams usually start at the top and move down only when they need to.",
          svg: `<svg viewBox="0 0 600 250" role="img" aria-label="Three stacked layers: application development, model development and infrastructure">
<defs><marker id="ai1-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-1)"/></marker></defs>
<rect x="40" y="20" width="400" height="58" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="58" y="44" font-size="14" font-weight="700">Application development</text>
<text x="58" y="64" font-size="12" style="fill: var(--dg-muted)">Prompts, context construction, interfaces, evaluation</text>
<rect x="40" y="90" width="400" height="58" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="58" y="114" font-size="14" font-weight="700">Model development</text>
<text x="58" y="134" font-size="12" style="fill: var(--dg-muted)">Training, finetuning, datasets, inference optimization</text>
<rect x="40" y="160" width="400" height="58" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="58" y="184" font-size="14" font-weight="700">Infrastructure</text>
<text x="58" y="204" font-size="12" style="fill: var(--dg-muted)">Serving, compute and data management, monitoring</text>
<line x1="500" y1="49" x2="450" y2="49" stroke-width="2" style="stroke: var(--dg-1)" marker-end="url(#ai1-arrow2)"/>
<text x="508" y="44" font-size="12" font-weight="700">Most new</text>
<text x="508" y="60" font-size="12" font-weight="700">work here</text>
<text x="40" y="242" font-size="12" style="fill: var(--dg-muted)">Each layer depends on the ones below it.</text>
</svg>`,
        },
        {
          type: "table",
          title: "What changes from ML engineering to AI engineering",
          headers: ["Aspect", "ML engineering", "AI engineering"],
          rows: [
            ["Where the model comes from", "Train your own, often small", "Adapt an existing foundation model"],
            ["Model size", "Small to medium", "Large: more compute, higher latency, higher cost"],
            ["Outputs", "Mostly closed-ended: a class, a number", "Open-ended text, code, images"],
            ["Hardest part", "Features and modeling", "Evaluation, context construction, latency and cost"],
            ["How you adapt", "Feature engineering, retraining", "Prompting, RAG, finetuning"],
            ["Typical order", "Data, then model, then product", "Product first, then data and models as it proves itself"],
          ],
        },
        {
          type: "text",
          html: `<p>Three of those rows deserve emphasis. <strong>Open-ended outputs</strong> make evaluation the central problem: checking whether a fraud score is right is a comparison against a label, while checking whether a summary is faithful has no single right answer. That is why the book spends two full chapters on evaluation. <strong>Model size</strong> moves inference optimization from a nice-to-have to a core skill, because every request costs real money and real time. And the <strong>product-first order</strong> means interface design and user feedback matter earlier: you can learn from real users before investing in data or training.</p>
<p>None of this makes ML fundamentals obsolete. Knowing how models are trained explains why they hallucinate, why finetuning helps or fails, and why a quantized model behaves slightly differently. It simply means most teams reach for those skills later in a project's life.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Building on a foundation model",
          consLabel: "What you give up",
          pros: [
            "A working prototype in days instead of months",
            "One model covers many tasks, so new features are cheap to try",
            "No labeled dataset needed to start",
          ],
          cons: [
            "Per-request cost and latency are much higher than a small task-specific model",
            "Outputs are open-ended and hard to evaluate automatically",
            "You depend on a model you did not train and, with an API, cannot pin forever",
          ],
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
          html: `<p>Chapter 1 material shows up in two ways: as warm-up questions (what is a foundation model, why tokens, why self-supervision) and as the framing for a product or system design question ("design an AI assistant for X"). In the second case, interviewers want to see that you plan before you build: motivation, role of AI and humans, success metrics, and an honest view of the last mile.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>When asked to design an AI feature, open with a one-minute frame:</p>
<ol>
<li><strong>Why and who:</strong> the business goal, and whether AI is critical or complementary to it.</li>
<li><strong>Humans in the loop:</strong> who reviews or approves outputs, at least at launch.</li>
<li><strong>Success thresholds:</strong> a business metric plus minimum quality, a latency budget and a cost per request.</li>
<li><strong>Adaptation plan:</strong> start with prompting, add retrieval if the model needs your data, finetune only if evaluation shows a gap the cheaper methods cannot close.</li>
<li><strong>Evaluation and feedback:</strong> how you will know it works, and how user feedback becomes your data advantage.</li>
</ol>
<p>Back it with token math: words times 4/3, times requests per day, gives you a cost and capacity estimate in seconds.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Treating a good demo as evidence the product is nearly done. Say explicitly that early quality is easy and the last stretch on real, messy inputs is slow, and that you would set milestones against measured thresholds rather than impressions.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks why foundation models could be trained on so much more data than earlier supervised models. What is the core reason?",
          options: [
            "GPUs became cheap enough to label data automatically",
            "Self-supervision: the next token in raw text is the label, so no human annotation is needed",
            "Transformers do not need training data",
            "Masked language models need fewer examples than autoregressive ones",
          ],
          answer: 1,
          explain: "The bottleneck for supervised learning was labeling. Language modeling derives labels from the text itself, so any text you can collect becomes training data. Hardware and architecture made the scale affordable, but self-supervision made the data available.",
        },
      ],
    },
  ],
  takeaways: [
    "A language model assigns probabilities to the next token; autoregressive models chain those predictions to generate text, masked models fill gaps using both sides.",
    "Tokens sit between characters and words. Prices, context windows and latency are all in tokens: for English, roughly <span class=\"formula\">tokens &asymp; words &times; 4/3</span>, and other languages often need more.",
    "Self-supervision lets raw text label itself, which removed the labeling bottleneck and made foundation-model scale possible.",
    "Foundation models are general-purpose and adapted with prompting, then retrieval, then finetuning, from cheapest to most costly.",
    "Plan before building: why, the role of AI (critical or complementary, reactive or proactive, dynamic or static), the role of humans, defensibility, and measurable thresholds.",
    "The last mile from demo to production quality usually takes far longer than the first 80%.",
    "AI engineering shifts effort from training models to evaluation, context construction, interfaces and inference cost.",
  ],
  furtherReading: [
    { title: "On the Opportunities and Risks of Foundation Models (Bommasani et al., 2021)", url: "https://arxiv.org/abs/2108.07258", note: "The Stanford report that popularized the term foundation model." },
    { title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding (Devlin et al., 2018)", url: "https://arxiv.org/abs/1810.04805", note: "The canonical masked language model." },
    { title: "Language Models are Few-Shot Learners (Brown et al., 2020)", url: "https://arxiv.org/abs/2005.14165", note: "The GPT-3 paper, showing how scale turns a language model into a general task solver." },
  ],
};
