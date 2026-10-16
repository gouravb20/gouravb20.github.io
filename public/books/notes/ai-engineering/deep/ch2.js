// Deep dive: Chapter 2, Understanding foundation models. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>You ask a model the same question twice and get two different answers. You ask for JSON and get JSON wrapped in a friendly sentence that crashes your parser. You ask about a niche regulation and get a confident, well-formatted citation to a document that does not exist. You switch to a model with fewer parameters and it beats the bigger one on your task.</p>
<p>None of these are random quirks. Each one traces back to a design decision someone made when building the model: what data it saw, how big it is and how long it was trained, how it was taught to behave like an assistant, and how it picks each word it writes. Once you know those decisions, you can predict a model's behavior instead of being surprised by it, and you know which knobs you control.</p>`,
  sections: [
    {
      id: "training-data",
      title: "Training data decides what a model knows",
      kicker: "Data",
      blocks: [
        {
          type: "problem",
          html: `<p>A model can only be good at what it has seen enough of. Teams often discover this late: a model that is excellent in English is mediocre in Vietnamese, or fluent in general medicine and lost in a specific sub-specialty.</p>`,
        },
        {
          type: "text",
          html: `<p>Most foundation models are pre-trained largely on web crawls such as Common Crawl, filtered for quality. Web text is wildly uneven. English dominates it, a handful of other major languages have a solid share, and thousands of languages with millions of speakers each are barely present. Domains are uneven too: there is plenty of text about programming and popular culture, far less about, say, maritime insurance law.</p>
<p>The imbalance hurts twice for underrepresented languages. The model has learned less about them, <em>and</em> the tokenizer, trained on the same skewed data, splits them into more tokens. The same message can cost several times more tokens, which means higher cost, higher latency and less room in the context window, for a model that is also less capable in that language.</p>`,
        },
        {
          type: "text",
          html: `<p>The response to uneven coverage is specialization. Some teams curate data for a language or domain and train or finetune models on it: code models trained heavily on source code, biomedical models trained on papers and clinical text, and models built for specific languages. When you evaluate a model for your product, the first question is whether its training data plausibly covered your domain and languages, because no prompt can supply knowledge the model never learned.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Code Llama (Meta, 2023)", title: "Specializing by continued training", html: "Meta built Code Llama by taking Llama 2 and continuing to train it on a large corpus of code. The general model supplied language understanding; the extra data supplied depth in programming." },
            { org: "Med-PaLM (Google)", title: "Medical question answering", html: "Google adapted its PaLM models to medical question answering and evaluated them on medical licensing-style exam questions, an example of building a domain model on top of a general one." },
          ],
        },
      ],
    },
    {
      id: "transformer",
      title: "The transformer, attention, and the two phases of inference",
      kicker: "Architecture",
      blocks: [
        {
          type: "problem",
          html: `<p>Before transformers, sequence models such as RNNs read text one token at a time and squeezed everything they had read into a single running state. Long inputs lost detail, and the strictly sequential processing made training slow on parallel hardware.</p>`,
        },
        {
          type: "idea",
          html: `<p><strong>Attention</strong> lets every token look directly at every earlier token and decide how much each one matters. Nothing has to be squeezed into one state, and during training all positions can be computed in parallel. The transformer, introduced in "Attention Is All You Need" (2017), is built around this mechanism.</p>`,
        },
        {
          type: "text",
          html: `<p>Each token is turned into three vectors. Its <strong>query</strong> says what it is looking for, its <strong>key</strong> says what it offers, and its <strong>value</strong> is the information it passes on. A token's attention weights come from comparing its query with every key, and its output is the weighted mix of the values:</p>
<p><span class="formula">Attention(Q, K, V) = softmax(QK<sup>T</sup> / &radic;d) &middot; V</span></p>
<p>Here <code>d</code> is the key dimension; dividing by its square root keeps the scores from growing so large that softmax saturates. In a decoder-only language model a mask stops each token from attending to tokens after it, which is what makes the model autoregressive. Real models run many attention "heads" in parallel and stack dozens of such layers.</p>`,
        },
        {
          type: "text",
          html: `<h3>Prefill and decode</h3>
<p>Running a model has two very different phases. In <strong>prefill</strong>, the model reads the whole prompt. All prompt tokens are known, so it processes them in parallel and stores each layer's keys and values in the <strong>KV cache</strong>. In <strong>decode</strong>, it generates the answer one token at a time; each new token needs the previous one, so this part is inherently sequential.</p>
<p>A worked example: a 1,000-token prompt and a 200-token answer. Prefill is one big parallel pass over 1,000 tokens. Decode is 200 separate steps, and every step reads all of the model's weights plus the KV cache from memory to produce a single token. That is why long answers feel slow even when long prompts do not, and why doubling the output length roughly doubles generation time.</p>`,
        },
        {
          type: "diagram",
          title: "One request, two phases",
          caption: "Prefill processes the whole prompt at once and ends with the first token. Decode then produces one token per step. The first phase sets time to first token; the second sets time per output token.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="Timeline of prefill as one wide parallel block followed by many small sequential decode steps">
<rect x="40" y="60" width="140" height="80" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="110" y="92" text-anchor="middle" font-size="13" font-weight="700">Prefill</text>
<text x="110" y="112" text-anchor="middle" font-size="12">1,000 prompt</text>
<text x="110" y="128" text-anchor="middle" font-size="12">tokens at once</text>
<text x="190" y="70" font-size="12" style="fill: var(--dg-muted)">Decode: one token per step</text>
<rect x="190" y="80" width="40" height="40" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="238" y="80" width="40" height="40" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="286" y="80" width="40" height="40" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="334" y="80" width="40" height="40" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="382" y="80" width="40" height="40" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="430" y="80" width="40" height="40" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="478" y="80" width="40" height="40" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="526" y="80" width="40" height="40" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="210" y="105" text-anchor="middle" font-size="12">t1</text>
<text x="258" y="105" text-anchor="middle" font-size="12">t2</text>
<text x="306" y="105" text-anchor="middle" font-size="12">t3</text>
<text x="354" y="105" text-anchor="middle" font-size="12">t4</text>
<text x="402" y="105" text-anchor="middle" font-size="12">t5</text>
<text x="450" y="105" text-anchor="middle" font-size="12">t6</text>
<text x="498" y="105" text-anchor="middle" font-size="12">t7</text>
<text x="546" y="105" text-anchor="middle" font-size="12">t8</text>
<text x="590" y="105" text-anchor="middle" font-size="14">...</text>
<line x1="40" y1="158" x2="230" y2="158" stroke-width="2" style="stroke: var(--dg-2)"/>
<line x1="40" y1="151" x2="40" y2="165" stroke-width="2" style="stroke: var(--dg-2)"/>
<line x1="230" y1="151" x2="230" y2="165" stroke-width="2" style="stroke: var(--dg-2)"/>
<text x="135" y="182" text-anchor="middle" font-size="12">TTFT = prefill + first token</text>
<line x1="286" y1="158" x2="326" y2="158" stroke-width="2" style="stroke: var(--dg-1)"/>
<line x1="286" y1="151" x2="286" y2="165" stroke-width="2" style="stroke: var(--dg-1)"/>
<line x1="326" y1="151" x2="326" y2="165" stroke-width="2" style="stroke: var(--dg-1)"/>
<text x="306" y="182" text-anchor="middle" font-size="12">TPOT = one step</text>
<text x="40" y="216" font-size="12" style="fill: var(--dg-muted)">Prefill is limited by compute; decode is limited by memory bandwidth.</text>
</svg>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Keep the two phases in mind whenever you reason about latency. Long prompts mostly raise time to first token. Long outputs raise total time linearly. Chapter 9 builds its whole treatment of inference optimization on this split.</p>`,
        },
      ],
    },
    {
      id: "scaling",
      title: "Model size and the Chinchilla scaling law",
      kicker: "Scale",
      blocks: [
        {
          type: "text",
          html: `<p>A model's scale is described by three numbers, not one:</p>
<ul>
<li><strong>Parameters</strong> (N): how much the model can store. Memory is the immediate consequence: at 2 bytes per parameter (16-bit weights), a 7B model needs about 14 GB just to hold its weights.</li>
<li><strong>Training tokens</strong> (D): how much it has read.</li>
<li><strong>Training compute</strong> in FLOPs (floating-point operations), a total amount of work, not a speed. A widely used approximation is <span class="formula">C &asymp; 6 &times; N &times; D</span>.</li>
</ul>
<p>Parameter count alone can mislead. In a <strong>mixture-of-experts</strong> (MoE) model, each token is routed through only a few of many expert sub-networks. Mixtral 8x7B, for example, has about 46.7B parameters in total but uses about 12.9B for each token, so its per-token compute is closer to a 13B dense model while its memory footprint is that of a 47B one.</p>`,
        },
        {
          type: "idea",
          html: `<p>For a fixed compute budget, there is a best split between model size and data. DeepMind's Chinchilla paper (2022) found that compute-optimal training uses about <strong>20 training tokens per parameter</strong>, and that model size and data should grow together: double the parameters, double the tokens.</p>`,
        },
        {
          type: "text",
          html: `<p>The paper's namesake model made the point concrete. Chinchilla had 70B parameters trained on 1.4 trillion tokens, exactly 20 per parameter. Using the same compute as DeepMind's earlier 280B-parameter Gopher, it performed better, because Gopher had been trained on too few tokens for its size.</p>
<p>A worked example for a 7B model:</p>
<ul>
<li>Compute-optimal data: <span class="formula">D &asymp; 20 &times; 7&times;10<sup>9</sup> = 1.4&times;10<sup>11</sup></span> tokens (140B).</li>
<li>Training compute: <span class="formula">C &asymp; 6 &times; 7&times;10<sup>9</sup> &times; 1.4&times;10<sup>11</sup> &asymp; 5.9&times;10<sup>21</sup></span> FLOPs.</li>
<li>On hypothetical accelerators that each sustain 400 TFLOP/s (4&times;10<sup>14</sup> FLOP/s), that is about 1.5&times;10<sup>7</sup> chip-seconds: roughly 170 days on one chip, or about 4 hours on 1,000 chips.</li>
</ul>`,
        },
        {
          type: "lab",
          id: "scaling",
          caption: "Place a model by parameters and training tokens. Points on the 20-tokens-per-parameter line are compute-optimal; points above it are over-trained, which is cheaper to serve.",
        },
        {
          type: "text",
          html: `<h3>Why teams deliberately break the rule</h3>
<p>Chinchilla optimizes <em>training</em> cost. But a successful model is trained once and served billions of times, and serving cost scales with model size. So teams often train smaller models on far more data than "optimal". Meta's Llama 2 models were trained on 2 trillion tokens, and Llama 3 8B on over 15 trillion: more than 1,800 tokens per parameter. The extra training compute buys a small model that punches above its weight at inference, which is the cost that matters at scale.</p>`,
        },
        {
          type: "text",
          html: `<h3>Where scaling runs out</h3>
<p>Two bottlenecks loom. The first is <strong>data</strong>: models are consuming high-quality public text faster than people produce it, and a growing share of new web text is itself AI-generated, which is a poor substitute for human writing. The second is <strong>compute and electricity</strong>: training runs and data centers are now large enough that power supply is a planning constraint. Both push the field towards synthetic data, proprietary data, and more efficient architectures and training methods.</p>`,
        },
        {
          type: "quiz",
          q: "You plan to train a 3B-parameter model compute-optimally. About how many training tokens and how much compute do you need?",
          options: [
            "3B tokens and about 5&times;10<sup>19</sup> FLOPs",
            "60B tokens and about 1.1&times;10<sup>21</sup> FLOPs",
            "1.4T tokens and about 2.5&times;10<sup>22</sup> FLOPs",
            "600B tokens and about 1.1&times;10<sup>22</sup> FLOPs",
          ],
          answer: 1,
          explain: "D &asymp; 20 &times; 3B = 60B tokens. C &asymp; 6 &times; 3&times;10<sup>9</sup> &times; 6&times;10<sup>10</sup> &asymp; 1.1&times;10<sup>21</sup> FLOPs.",
        },
      ],
    },
    {
      id: "post-training",
      title: "Post-training: from text completer to assistant",
      kicker: "Alignment",
      blocks: [
        {
          type: "problem",
          html: `<p>A pre-trained model is a superb text completer and a poor assistant. Ask it "How do I reset my password?" and it may continue with three more questions, as if it were completing a forum page. It has learned the web, including the web's worst habits, and nothing has taught it to answer helpfully or decline harmful requests.</p>`,
        },
        {
          type: "diagram",
          title: "The three training stages",
          caption: "Each stage uses less data, but each example is more expensive to produce. Pre-training builds knowledge; post-training shapes behavior.",
          svg: `<svg viewBox="0 0 620 210" role="img" aria-label="Pipeline from pre-training to supervised finetuning to preference finetuning">
<defs><marker id="ai2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="15" y="40" width="180" height="130" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="27" y="64" font-size="13" font-weight="700">Pre-training</text>
<text x="27" y="88" font-size="12">Next-token prediction</text>
<text x="27" y="106" font-size="12">on trillions of tokens</text>
<text x="27" y="134" font-size="12" style="fill: var(--dg-muted)">Result:</text>
<text x="27" y="152" font-size="12" font-weight="700">a text completer</text>
<line x1="197" y1="105" x2="217" y2="105" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai2-arrow)"/>
<rect x="220" y="40" width="180" height="130" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="232" y="64" font-size="13" font-weight="700">Supervised finetuning</text>
<text x="232" y="88" font-size="12">(prompt, response)</text>
<text x="232" y="106" font-size="12">demonstrations</text>
<text x="232" y="134" font-size="12" style="fill: var(--dg-muted)">Result:</text>
<text x="232" y="152" font-size="12" font-weight="700">follows instructions</text>
<line x1="402" y1="105" x2="422" y2="105" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai2-arrow)"/>
<rect x="425" y="40" width="180" height="130" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="437" y="64" font-size="13" font-weight="700">Preference tuning</text>
<text x="437" y="88" font-size="12">Comparisons: A beats B</text>
<text x="437" y="106" font-size="12">RLHF or DPO</text>
<text x="437" y="134" font-size="12" style="fill: var(--dg-muted)">Result:</text>
<text x="437" y="152" font-size="12" font-weight="700">preferred responses</text>
<text x="15" y="198" font-size="12" style="fill: var(--dg-muted)">Less data at each stage, but each example costs more to produce.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p><strong>Supervised finetuning</strong> (SFT) continues training on demonstration data: prompts paired with high-quality responses written by skilled annotators. The model learns the shape of an assistant's turn: answer the question, follow the requested format, stop when done. Demonstrations are expensive, though. Writing a careful, correct answer to a hard question can take an expert a long time, and demonstrations can only show one good answer, not why it beats the alternatives.</p>
<p><strong>Preference finetuning</strong> fills that gap with comparisons. Labelers see two responses to the same prompt and pick the better one, which is faster and more consistent than writing an answer or giving an absolute score. In <strong>RLHF</strong>, these comparisons train a <strong>reward model</strong> that scores any response, and reinforcement learning then pushes the language model towards responses with higher scores. <strong>DPO</strong> (2023) reaches a similar goal without a separate reward model, optimizing the language model directly on the comparison pairs.</p>`,
        },
        {
          type: "text",
          html: `<h3>How a reward model learns from comparisons</h3>
<p>The reward model gives each response a score <code>r</code>. Training wants the preferred response's score to exceed the rejected one's, so for each pair it minimizes:</p>
<p><span class="formula">loss = &minus;log &sigma;(r<sub>preferred</sub> &minus; r<sub>rejected</sub>)</span></p>
<p>where &sigma; is the sigmoid function. If the model scores the preferred answer 2.0 and the rejected one 0.5, the gap is 1.5, &sigma;(1.5) &asymp; 0.82, and the loss is about 0.20. If it had the order backwards (0.5 vs 2.0), &sigma;(&minus;1.5) &asymp; 0.18 and the loss jumps to about 1.70. Only the difference matters, which is exactly what comparison data can tell you.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "OpenAI InstructGPT (2022)", title: "Post-training beats size", html: "In the InstructGPT paper, human labelers preferred outputs from a 1.3B-parameter model trained with SFT and RLHF over outputs from the 175B-parameter GPT-3, despite the hundredfold size gap. Behavior shaping mattered more than raw scale for helpfulness." },
          ],
        },
        {
          type: "quiz",
          q: "Why do teams collect comparison data (A is better than B) for preference finetuning rather than asking labelers to score each response from 1 to 10?",
          options: [
            "Comparison data needs no human labelers",
            "Comparisons are faster and more consistent across labelers than absolute scores",
            "Absolute scores cannot be used to train any model",
            "Comparisons replace the need for supervised finetuning",
          ],
          answer: 1,
          explain: "Two labelers may disagree on whether an answer is a 6 or an 8, but they agree much more often on which of two answers is better. Comparisons are a more reliable signal per unit of labeling effort. SFT still comes first to teach the basic format.",
        },
      ],
    },
    {
      id: "sampling",
      title: "Sampling: how the model picks each token",
      kicker: "Generation",
      blocks: [
        {
          type: "text",
          html: `<p>At each step the model outputs a <strong>logit</strong>, an unnormalized score, for every token in its vocabulary. <strong>Softmax</strong> turns logits into probabilities, and a <strong>sampling strategy</strong> picks one token. Always taking the top token (<strong>greedy decoding</strong>) is predictable but tends to produce bland, repetitive text that can loop. Sampling in proportion to probability adds variety. The knobs below control how much.</p>`,
        },
        {
          type: "text",
          html: `<h3>Temperature, worked through</h3>
<p>Temperature <code>T</code> divides every logit before softmax: <span class="formula">p<sub>i</sub> = exp(z<sub>i</sub>/T) / &Sigma;<sub>j</sub> exp(z<sub>j</sub>/T)</span>. Take the prompt "My favorite color is" and four candidate tokens with logits blue 2.0, green 1.0, red 0.5 and car &minus;1.0.</p>
<ul>
<li><strong>T = 1</strong>: exponentials 7.39, 2.72, 1.65, 0.37, summing to 12.12. Probabilities: blue 61%, green 22%, red 14%, car 3%.</li>
<li><strong>T = 0.5</strong>: logits become 4, 2, 1, &minus;2. Probabilities: blue 84%, green 11%, red 4%, car 0.2%. The favorite gets stronger.</li>
<li><strong>T = 2</strong>: logits become 1, 0.5, 0.25, &minus;0.5. Probabilities: blue 43%, green 26%, red 21%, car 10%. The distribution flattens and even "car" becomes plausible.</li>
</ul>
<p>As T approaches 0, sampling approaches greedy decoding. Low temperatures suit extraction, classification and code; higher ones suit brainstorming and creative writing.</p>`,
        },
        {
          type: "diagram",
          title: "Same logits, three temperatures",
          caption: "Lower temperature concentrates probability on the top token; higher temperature spreads it out. The logits are identical in all three panels; only T changes.",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="Bar charts of token probabilities at temperature 0.5, 1 and 2">
<text x="115" y="40" text-anchor="middle" font-size="13" font-weight="700">T = 0.5</text>
<text x="315" y="40" text-anchor="middle" font-size="13" font-weight="700">T = 1.0</text>
<text x="515" y="40" text-anchor="middle" font-size="13" font-weight="700">T = 2.0</text>
<rect x="40" y="75" width="30" height="135" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="80" y="192" width="30" height="18" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="120" y="203" width="30" height="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="160" y="209" width="30" height="1" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="55" y="69" text-anchor="middle" font-size="12">84%</text>
<text x="95" y="186" text-anchor="middle" font-size="12">11%</text>
<text x="135" y="197" text-anchor="middle" font-size="12">4%</text>
<text x="175" y="203" text-anchor="middle" font-size="12">0%</text>
<rect x="240" y="113" width="30" height="97" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="280" y="174" width="30" height="36" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="320" y="188" width="30" height="22" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="360" y="205" width="30" height="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="255" y="107" text-anchor="middle" font-size="12">61%</text>
<text x="295" y="168" text-anchor="middle" font-size="12">22%</text>
<text x="335" y="182" text-anchor="middle" font-size="12">14%</text>
<text x="375" y="199" text-anchor="middle" font-size="12">3%</text>
<rect x="440" y="141" width="30" height="69" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="480" y="168" width="30" height="42" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="520" y="177" width="30" height="33" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="560" y="194" width="30" height="16" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="455" y="135" text-anchor="middle" font-size="12">43%</text>
<text x="495" y="162" text-anchor="middle" font-size="12">26%</text>
<text x="535" y="171" text-anchor="middle" font-size="12">21%</text>
<text x="575" y="188" text-anchor="middle" font-size="12">10%</text>
<line x1="30" y1="210" x2="200" y2="210" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="230" y1="210" x2="400" y2="210" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="430" y1="210" x2="600" y2="210" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="55" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">blue</text>
<text x="95" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">green</text>
<text x="135" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">red</text>
<text x="175" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">car</text>
<text x="255" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">blue</text>
<text x="295" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">green</text>
<text x="335" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">red</text>
<text x="375" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">car</text>
<text x="455" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">blue</text>
<text x="495" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">green</text>
<text x="535" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">red</text>
<text x="575" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">car</text>
<text x="30" y="252" font-size="12" style="fill: var(--dg-muted)">Logits: blue 2.0, green 1.0, red 0.5, car -1.0</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Top-k and top-p: cutting off the tail</h3>
<p>Real vocabularies have tens of thousands of tokens, and even if each junk token has a tiny probability, together they add up, so a sampler will occasionally pick nonsense. Two filters remove the tail before sampling:</p>
<ul>
<li><strong>Top-k</strong> keeps only the k most likely tokens. With k = 2 above (at T = 1), only blue and green survive, renormalized to 73% and 27%.</li>
<li><strong>Top-p</strong> (nucleus sampling) keeps the smallest set whose cumulative probability reaches p. With p = 0.9, the running totals are 61%, 83%, 97%, so blue, green and red survive and car is dropped.</li>
</ul>
<p>Top-p adapts to the situation: when the model is confident, the nucleus may be one or two tokens; when many continuations are reasonable, it widens. Providers also let you cap output with a maximum token count or stop sequences, and many can return <strong>logprobs</strong>, the log-probabilities of chosen tokens, which are useful as confidence scores for classification and for evaluation.</p>`,
        },
        {
          type: "code",
          lang: "python",
          title: "A minimal sampler",
          code: `import math, random

def sample(logits, temperature=1.0, top_k=None, top_p=None):
    scaled = {tok: z / temperature for tok, z in logits.items()}
    m = max(scaled.values())                      # subtract max for numerical stability
    exps = {tok: math.exp(z - m) for tok, z in scaled.items()}
    total = sum(exps.values())
    ranked = sorted(((p / total, tok) for tok, p in exps.items()), reverse=True)
    if top_k:
        ranked = ranked[:top_k]
    if top_p:
        kept, cum = [], 0.0
        for p, tok in ranked:
            kept.append((p, tok))
            cum += p
            if cum >= top_p:
                break
        ranked = kept
    norm = sum(p for p, _ in ranked)
    return random.choices([t for _, t in ranked], [p / norm for p, _ in ranked])[0]

sample({"blue": 2.0, "green": 1.0, "red": 0.5, "car": -1.0}, temperature=0.7, top_p=0.9)`,
        },
        {
          type: "lab",
          id: "sampling",
          caption: "Change temperature, top-k and top-p for the prompt \"My favorite color is\" and watch which tokens survive and how their probabilities shift before one is sampled.",
        },
        {
          type: "text",
          html: `<h3>Test-time compute: sample more, then choose</h3>
<p>Sampling also enables a simple way to buy quality with compute: generate several answers and keep the best one. With a <strong>verifier</strong> (unit tests, a math checker, or a reward model) you pick a sample that passes. Without one, you can take a <strong>majority vote</strong> over final answers, which works well when wrong answers scatter and right ones agree.</p>
<p>The math is encouraging. If one sample is correct with probability <code>p</code>, the chance that at least one of <code>N</code> independent samples is correct is <span class="formula">1 &minus; (1 &minus; p)<sup>N</sup></span>. With p = 0.3 and N = 5, that is 1 &minus; 0.7<sup>5</sup> &asymp; 0.83. A perfect verifier turns that into 83% accuracy from a model that is right 30% of the time. The catch: you pay for five generations, and real verifiers are imperfect.</p>`,
        },
        {
          type: "lab",
          id: "bestOfN",
          caption: "Raise N and compare one sample, majority vote and a perfect verifier. Quality climbs with N, and so does cost.",
        },
        {
          type: "quiz",
          q: "At T = 1 the next-token probabilities are 50%, 30%, 15%, 5%. Which tokens survive top-p with p = 0.8?",
          options: ["Only the first", "The first two", "The first three", "All four"],
          answer: 1,
          explain: "Cumulative probabilities are 50%, 80%, 95%, 100%. The smallest set reaching 0.8 is the first two tokens, which are then renormalized to 62.5% and 37.5%.",
        },
      ],
    },
    {
      id: "structure-and-hallucination",
      title: "Structured outputs, inconsistency and hallucination",
      kicker: "Living with probabilities",
      blocks: [
        {
          type: "problem",
          html: `<p>Downstream code needs output it can parse: valid JSON, a label from a fixed list, a date in one format. A probabilistic generator gives you <em>likely</em> output, not <em>guaranteed</em> output, and one malformed response in a thousand is enough to page someone at night.</p>`,
        },
        {
          type: "table",
          title: "Four ways to get structured output",
          headers: ["Method", "How it works", "Guarantee", "Cost"],
          rows: [
            ["Prompting", "Describe the format and show examples", "None", "Free"],
            ["Post-processing", "Fix common mistakes: strip prose, close brackets", "Partial", "Cheap"],
            ["Constrained sampling", "Mask tokens that would break a grammar or schema", "Format guaranteed", "Engineering effort; can slow generation"],
            ["Finetuning", "Train on many examples in the format", "High, not absolute", "Training cost"],
          ],
        },
        {
          type: "text",
          html: `<p><strong>Constrained sampling</strong> is the interesting one. At each step, before sampling, the system checks which tokens could legally come next under a grammar (for example a JSON schema) and sets every other token's probability to zero. If the output so far is <code>{"status": "</code> and the schema allows only <code>"open"</code> or <code>"closed"</code>, then only tokens that continue one of those strings remain. The model still chooses, but only among valid continuations. Several providers expose this as a structured-output or JSON-schema mode, and open-source inference engines support grammar-based decoding.</p>
<p>Format is not correctness. A perfectly valid JSON object can still contain a wrong date or an invented field value. Validate the content, and retry or fall back on failure.</p>`,
        },
        {
          type: "text",
          html: `<h3>Inconsistency</h3>
<p>Because output is sampled, the same input can produce different answers, and tiny changes to the input (an extra space, a reordered sentence) can change the answer too. For users that feels unreliable. You can reduce it: set a low temperature, fix a random seed where the provider supports it, cache responses for repeated questions, and write tighter prompts. Even so, hosted APIs generally do not promise bit-identical output for identical requests, so design your product to tolerate variation.</p>
<h3>Hallucination</h3>
<p>Hallucination is fluent output not grounded in fact. Sampling guarantees that ungrounded continuations always have some probability, but two more specific hypotheses explain why models produce them so readily:</p>
<ul>
<li><strong>Self-delusion.</strong> The model cannot tell the tokens it generated from the tokens it was given. Once it writes a wrong claim, later tokens treat that claim as established fact and build on it, so an early error snowballs.</li>
<li><strong>Knowledge mismatch.</strong> During SFT, the model imitates labelers' answers. When a labeler's answer relies on knowledge the model does not have, the model learns to produce confident answers it cannot back up, which in effect teaches it to make things up.</li>
</ul>
<p>Practical mitigations follow from these: ground answers in retrieved context, ask the model to answer only from that context and to say when it does not know, keep answers short where precision matters, and verify claims in evaluation.</p>`,
        },
        {
          type: "quiz",
          q: "Your pipeline uses constrained sampling with a JSON schema, and every response parses. A reviewer still finds wrong values in some fields. Why?",
          options: [
            "Constrained sampling is broken and should be replaced with prompting",
            "Constraints guarantee the format, not that the content is factually right",
            "The temperature must be set to exactly 1",
            "JSON schemas cannot describe string fields",
          ],
          answer: 1,
          explain: "Masking invalid tokens ensures every output fits the schema, but the model can still choose a wrong value that fits. Content needs its own validation and evaluation.",
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
          html: `<p>Chapter 2 is where many "explain how LLMs work" questions come from. Interviewers want mechanisms, not buzzwords: what temperature actually does to the numbers, why a smaller model can win, why outputs vary, and what prefill and decode mean for latency.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Have a crisp answer ready for each of these:</p>
<ol>
<li><strong>Sampling:</strong> logits, softmax with temperature, then top-k or top-p to drop the tail. Low T for extraction and code, higher for creative work.</li>
<li><strong>Scaling:</strong> C &asymp; 6ND; Chinchilla says about 20 tokens per parameter for compute-optimal training; teams over-train small models because serving cost dominates.</li>
<li><strong>Post-training:</strong> SFT teaches format from demonstrations; preference tuning (RLHF with a reward model, or DPO) teaches which answers people prefer.</li>
<li><strong>Latency:</strong> prefill is parallel and sets TTFT; decode is sequential and sets TPOT.</li>
<li><strong>Reliability:</strong> structured outputs via constrained sampling; hallucination via self-delusion and knowledge mismatch; mitigate with grounding and verification.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Saying "temperature 0 makes the model accurate". It makes the model pick its most likely token, which makes output more repeatable, not more correct. A model that is confidently wrong is still wrong at temperature 0.</p>`,
        },
        {
          type: "quiz",
          q: "A product team says: \"Our 8B model answers are as good as the 70B one on our eval, so the 70B must have been undertrained.\" What is the better explanation?",
          options: [
            "Parameter count fully determines quality, so the eval must be wrong",
            "Quality depends on training data, tokens seen and post-training, not parameters alone; a heavily trained small model can match a larger one on a given task",
            "The 8B model is secretly a mixture of experts with 70B parameters",
            "Smaller models always beat larger models on narrow tasks",
          ],
          answer: 1,
          explain: "Small models trained on many more tokens per parameter, with strong post-training, can match larger models on specific tasks. That is the logic of over-training for cheap inference. It says nothing definite about the larger model being undertrained.",
        },
      ],
    },
  ],
  takeaways: [
    "Training data sets the ceiling: a model is weak in languages and domains it rarely saw, and those languages often cost more tokens too.",
    "Attention lets each token weigh all earlier tokens; inference splits into a parallel prefill (sets TTFT) and a sequential decode (sets TPOT).",
    "Scale is parameters, tokens and FLOPs. <span class=\"formula\">C &asymp; 6ND</span>; Chinchilla's compute-optimal ratio is about 20 tokens per parameter, but teams over-train small models because serving cost dominates.",
    "Post-training turns a text completer into an assistant: SFT on demonstrations, then preference tuning on comparisons (RLHF with a reward model, or DPO).",
    "Temperature reshapes the distribution; top-k and top-p cut off the unlikely tail. Low temperature gives repeatability, not correctness.",
    "Test-time compute (best-of-N with a verifier, majority vote) buys quality at the cost of more generations.",
    "Constrained sampling guarantees format, not content. Inconsistency and hallucination follow from the probabilistic design and must be managed, not assumed away.",
  ],
  furtherReading: [
    { title: "Attention Is All You Need (Vaswani et al., 2017)", url: "https://arxiv.org/abs/1706.03762", note: "The paper that introduced the transformer." },
    { title: "Training Compute-Optimal Large Language Models (Hoffmann et al., 2022)", url: "https://arxiv.org/abs/2203.15556", note: "The Chinchilla scaling law." },
    { title: "Training language models to follow instructions with human feedback (Ouyang et al., 2022)", url: "https://arxiv.org/abs/2203.02155", note: "InstructGPT: SFT plus RLHF in detail." },
    { title: "The Curious Case of Neural Text Degeneration (Holtzman et al., 2019)", url: "https://arxiv.org/abs/1904.09751", note: "Introduced nucleus (top-p) sampling and explains why greedy decoding degenerates." },
  ],
};
