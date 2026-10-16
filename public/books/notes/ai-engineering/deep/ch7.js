// Deep dive: Chapter 7, Finetuning. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>Your team's prompt for extracting invoice fields has grown to 2,000 tokens of instructions and examples. It works most of the time, but one invoice in twenty still comes back as prose instead of JSON, every call pays for those 2,000 tokens, and latency creeps up as the prompt grows. Someone says, "Let's just finetune." Someone else replies, "We have one 24 GB GPU. A 13B model doesn't even <em>load</em> in 16-bit on that."</p>
<p>Both are right. Finetuning can bake a format and a behavior into the weights so the prompt shrinks and the failures go away. But training is far hungrier for memory than serving, and finetuning brings its own costs: data, expertise and a model you now have to maintain. This chapter is about deciding <em>whether</em> to finetune, and then making it fit: the memory math, numerical formats, quantization, LoRA, and merging finetuned models together.</p>`,
  sections: [
    {
      id: "when-to-finetune",
      title: "When finetuning is the right tool",
      kicker: "The decision",
      blocks: [
        {
          type: "problem",
          html: `<p>Prompting is cheap to try and easy to change, but some problems resist it: a model that keeps breaking a strict output format, a tone that drifts, a small model that is not quite good enough at one task. Finetuning updates the weights to fix this, at the price of data collection, training infrastructure and ongoing maintenance.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Reasons to finetune", tone: "ok", html: "Improve a domain-specific skill, enforce a format or style, improve instruction following, reduce a bias, or <strong>distill</strong> a large model's behavior on one task into a smaller, cheaper model." },
            { title: "Reasons not to (yet)", tone: "warn", html: "It needs high-quality data, ML expertise and training plus serving infrastructure. It can degrade abilities you did not train on. A newer base model may make your finetune obsolete. A better prompt might be enough." },
          ],
        },
        {
          type: "idea",
          html: `<p>Diagnose the failure first. If the model <strong>lacks information</strong> (private, recent or niche facts), that is an information failure, and retrieval is the fix. If it <strong>has the information but behaves wrongly</strong> (wrong format, irrelevant, unsafe, off-tone), that is a behavior failure, and finetuning is the fix. The book's shorthand: finetuning is for form, RAG is for facts.</p>`,
        },
        {
          type: "steps",
          title: "A sensible order of escalation",
          items: [
            "Prompt only, with versioned prompts and an evaluation pipeline so you can measure each change.",
            "Add more examples to the prompt (from one up to a few dozen).",
            "Add retrieval, starting with simple term-based search.",
            "If information failures persist, invest in better RAG (embeddings, hybrid search, reranking). If behavior failures persist, finetune.",
            "Combine both: RAG supplies the facts, and a finetuned model is better at using them in the required form.",
          ],
        },
        {
          type: "text",
          html: `<p>Each step costs more than the last, so climb only when your evaluations show the current step has plateaued. Finetuning also pays off in a less obvious way: once a behavior lives in the weights, the long instructions and examples can leave the prompt, which cuts input tokens and latency on every single call.</p>`,
        },
        {
          type: "quiz",
          q: "A support bot answers with the right facts from retrieved documents, but often ignores the required three-part response structure and drifts into a casual tone. What is the most appropriate next step after prompt engineering has plateaued?",
          options: ["Improve the retriever with a reranker", "Finetune on examples with the required structure and tone", "Increase the number of retrieved chunks", "Switch to a vector database"],
          answer: 1,
          explain: "The facts are already correct, so this is not an information failure. Structure and tone are behavior, which is what finetuning is good at changing.",
        },
      ],
    },
    {
      id: "memory-math",
      title: "Why finetuning is memory-bound",
      kicker: "The memory math",
      blocks: [
        {
          type: "text",
          html: `<p>Inference is a forward pass: input goes in, activations flow through the layers, a token comes out. Training adds a <strong>backward pass</strong>: the loss is propagated back through the network to compute a gradient for every <em>trainable</em> parameter, and an optimizer uses those gradients to update the weights. Each trainable parameter therefore drags along extra numbers that inference never needs.</p>
<h3>Inference</h3>
<p><span class="formula">memory &asymp; N &times; M &times; 1.2</span> where N is the parameter count and M the bytes per parameter. The 1.2 is a rule of thumb for activations and the KV cache on top of the weights; long contexts and big batches push it higher.</p>
<p>A 13B model in a 2-byte format needs 13 &times; 10<sup>9</sup> &times; 2 = 26 GB for weights and about 31.2 GB in total. That does not fit a 24 GB card. A 70B model in FP16 is 140 GB of weights and roughly 168 GB to serve, which means several 80 GB GPUs or quantization.</p>`,
        },
        {
          type: "text",
          html: `<h3>Training</h3>
<p><span class="formula">training memory = weights + activations + gradients + optimizer states</span></p>
<p>Each trainable parameter needs one gradient, plus optimizer state: zero values for plain SGD, one for SGD with momentum, two for Adam (its running averages of the gradient and the squared gradient). With Adam, that is three extra values per trainable parameter.</p>
<p>Full finetuning of 13B with Adam, everything in 2 bytes: gradients and optimizer states take 13B &times; 3 &times; 2 bytes = 78 GB, on top of 26 GB of weights, so 104 GB before a single activation is stored. If only 1B parameters are trainable, the extra drops to 1B &times; 3 &times; 2 bytes = 6 GB, and the total to about 32 GB. That gap is the whole argument for parameter-efficient finetuning.</p>`,
        },
        {
          type: "diagram",
          title: "Where the memory goes for a 13B model (2 bytes per value)",
          caption: "Inference needs weights plus about 20%. Full finetuning with Adam adds a gradient and two optimizer values per parameter. Training only 1B parameters shrinks those extras to 6 GB. Activations for training are not drawn: they depend on batch size and sequence length and can be the largest item.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="Stacked bars comparing memory for inference, full finetuning and finetuning 1B trainable parameters of a 13B model">
<text x="150" y="52" text-anchor="end" font-size="13" font-weight="700">Inference</text>
<text x="150" y="68" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">N × M × 1.2</text>
<rect x="160" y="40" width="94" height="32" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<rect x="254" y="40" width="19" height="32" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="281" y="61" font-size="12">31.2 GB</text>
<text x="150" y="112" text-anchor="end" font-size="13" font-weight="700">Full finetune</text>
<text x="150" y="128" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">Adam, 13B trainable</text>
<rect x="160" y="100" width="94" height="32" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<rect x="254" y="100" width="94" height="32" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="348" y="100" width="187" height="32" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="543" y="121" font-size="12">104 GB +</text>
<text x="150" y="172" text-anchor="end" font-size="13" font-weight="700">PEFT</text>
<text x="150" y="188" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">Adam, 1B trainable</text>
<rect x="160" y="160" width="94" height="32" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<rect x="254" y="160" width="7" height="32" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="261" y="160" width="14" height="32" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="283" y="181" font-size="12">32 GB +</text>
<rect x="160" y="218" width="14" height="14" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="180" y="230" font-size="12">weights 26 GB</text>
<rect x="290" y="218" width="14" height="14" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="310" y="230" font-size="12">gradients</text>
<rect x="390" y="218" width="14" height="14" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="410" y="230" font-size="12">optimizer</text>
<rect x="490" y="218" width="14" height="14" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="510" y="230" font-size="12">activations, KV</text>
</svg>`,
        },
        {
          type: "lab",
          id: "memoryCalc",
          caption: "Plug in a model size, a numerical format and an optimizer, then switch between inference, full finetuning and LoRA to see which term dominates the memory bill.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>The simple formula assumes every value is stored in 2 bytes. Real mixed-precision training usually keeps an FP32 master copy of the weights and FP32 optimizer states next to the 16-bit weights and gradients. The ZeRO paper's accounting for that setup is 16 bytes per parameter (2 + 2 + 4 + 4 + 4), which is about 208 GB for 13B before activations. Use the simple formula for intuition and the detailed one for capacity planning.</p>`,
        },
        {
          type: "text",
          html: `<p>Activations can dwarf everything else, because the backward pass needs the intermediate outputs of every layer for every token in the batch. <strong>Gradient checkpointing</strong> (activation recomputation) stores only some of them and recomputes the rest during the backward pass: less memory, more compute.</p>`,
        },
        {
          type: "quiz",
          q: "Using the simple formula (everything in 2 bytes), how much memory do gradients and Adam optimizer states need when finetuning 7B parameters?",
          options: ["14 GB", "28 GB", "42 GB", "56 GB"],
          answer: 2,
          explain: "Adam keeps two values and there is one gradient, so three values per trainable parameter: 7B &times; 3 &times; 2 bytes = 42 GB. Add 14 GB of weights and the activations on top.",
        },
      ],
    },
    {
      id: "numerical-formats",
      title: "Numerical formats and quantization",
      kicker: "Fewer bytes per number",
      blocks: [
        {
          type: "text",
          html: `<p>Every term in the memory formula is multiplied by M, the bytes per value, so the cheapest way to save memory is to use smaller numbers. A floating-point number has three parts: a <strong>sign</strong> bit, <strong>exponent</strong> bits that set the range (how large or small a value can be), and <strong>mantissa</strong> bits that set the precision (how finely values are spaced).</p>`,
        },
        {
          type: "table",
          headers: ["Format", "Bits (sign / exponent / mantissa)", "Bytes", "Character"],
          rows: [
            ["FP32", "1 / 8 / 23", "4", "Full precision; the reference"],
            ["TF32", "1 / 8 / 10 (19 bits used)", "4 in memory", "NVIDIA tensor-core math format: FP32 range, FP16 precision"],
            ["BF16", "1 / 8 / 7", "2", "Same range as FP32, coarse precision; popular for training"],
            ["FP16", "1 / 5 / 10", "2", "Finer precision but small range; largest value 65,504"],
            ["INT8", "integer", "1", "Common for quantized inference"],
            ["INT4 / NF4", "integer or 4-bit code", "0.5", "Aggressive; NF4 is used by QLoRA"],
          ],
        },
        {
          type: "text",
          html: `<p>The BF16 versus FP16 choice is a range-versus-precision trade. Training produces occasional very large or very small values; FP16 overflows to infinity above 65,504 and loses tiny values to zero, while BF16 rarely does. A model trained in BF16 can therefore misbehave if loaded in FP16, because some of its values do not fit.</p>
<h3>Quantization</h3>
<p>Quantization maps values to a lower-precision format. The simplest scheme for INT8 is <strong>absmax</strong>: scale by <code>127 / max|w|</code> and round. Take weights [0.3, &minus;0.7, 0.1, 1.5]. The scale is 127 / 1.5 &asymp; 84.7, giving integers [25, &minus;59, 8, 127]. Dividing back gives [0.295, &minus;0.697, 0.094, 1.5]: small errors.</p>
<p>Now make the last weight an outlier, 15. The scale drops to about 8.47, the integers become [3, &minus;6, 1, 127], and the dequantized values are [0.354, &minus;0.709, 0.118, 15]. The 0.1 weight is now off by 18%. One outlier stretched the grid and wasted most of the 256 levels on empty range. Practical methods fight this by quantizing in small blocks with their own scales, or by keeping outlier values in higher precision.</p>`,
        },
        {
          type: "lab",
          id: "quantize",
          caption: "Convert values between FP32, FP16, BF16 and TF32 to see overflow and rounding, then quantize a weight vector to INT8 and INT4 and add an outlier to watch the error grow.",
        },
        {
          type: "compare",
          items: [
            { title: "Post-training quantization (PTQ)", tone: "ok", html: "Quantize a finished model. Cheap, needs no training, and by far the most common way models are served in 8 or 4 bits." },
            { title: "Quantization-aware training (QAT)", tone: "info", html: "Simulate low precision during training so the model learns to tolerate it. Better quality at very low bit widths, but costs a training run." },
            { title: "Mixed precision", tone: "warn", html: "Keep sensitive parts (some layers, outliers, optimizer states) in higher precision and the rest in lower. Most real training and many inference setups do this." },
          ],
        },
        {
          type: "quiz",
          q: "A model was trained in BF16. You load it in FP16 to run on older hardware and some outputs become NaN. What is the most likely reason?",
          options: ["FP16 has less precision than BF16", "Some values exceed FP16's much smaller range and overflow", "FP16 uses more memory", "BF16 and FP16 use different byte orders"],
          answer: 1,
          explain: "FP16 actually has more mantissa bits than BF16. The problem is range: FP16 has 5 exponent bits versus BF16's 8, so values above 65,504 become infinity and propagate into NaNs.",
        },
      ],
    },
    {
      id: "lora",
      title: "Parameter-efficient finetuning and LoRA",
      kicker: "Training a tiny slice",
      blocks: [
        {
          type: "idea",
          html: `<p>Memory scales with the number of <em>trainable</em> parameters, so freeze almost all of them. <strong>Parameter-efficient finetuning</strong> (PEFT) updates a small number of new or existing parameters and keeps the base model untouched.</p>`,
        },
        {
          type: "text",
          html: `<p>PEFT methods come in two families. <strong>Adapter-based</strong> methods add or modify a few weights inside the model: LoRA, BitFit (train only the biases), IA3, and QLoRA. <strong>Soft-prompt-based</strong> methods learn trainable embedding vectors that are prepended to the input: prefix tuning, P-tuning, prompt tuning. LoRA became the default because it is simple, effective and adds no inference latency.</p>
<h3>How LoRA works</h3>
<p>Take a weight matrix W of shape n &times; m. LoRA freezes W and learns two small matrices, A (n &times; r) and B (r &times; m), whose product has the same shape as W. The layer computes with <span class="formula">W' = W + (&alpha;/r) &middot; AB</span>. The rank r is small, often between 4 and 64, and one of the two matrices starts at zero so training begins exactly at the base model.</p>
<p>Worked example: a 4,096 &times; 4,096 attention projection has 16.8 million parameters. With r = 8, A and B together have 8 &times; (4,096 + 4,096) = 65,536 parameters, about 0.4% of the original. The bet behind LoRA is that the change finetuning needs is low-rank, even if the weights themselves are not.</p>`,
        },
        {
          type: "diagram",
          title: "LoRA: a frozen matrix plus a trainable low-rank path",
          caption: "The input goes through the frozen W and, in parallel, through the small matrices A and B. Their scaled product is added to W's output. Only A and B receive gradients.",
          svg: `<svg viewBox="0 0 640 270" role="img" aria-label="LoRA diagram: input x passes through frozen W and through trainable A then B; outputs are summed into h">
<defs><marker id="ai7-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="112" width="50" height="40" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="45" y="137" text-anchor="middle" font-size="14" font-weight="700">x</text>
<rect x="130" y="30" width="150" height="90" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="205" y="70" text-anchor="middle" font-size="14" font-weight="700">W</text>
<text x="205" y="92" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">n × m, frozen</text>
<rect x="130" y="150" width="36" height="90" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="148" y="200" text-anchor="middle" font-size="14" font-weight="700">A</text>
<text x="148" y="258" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">n × r</text>
<rect x="200" y="180" width="90" height="30" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="245" y="200" text-anchor="middle" font-size="14" font-weight="700">B</text>
<text x="245" y="230" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">r × m</text>
<circle cx="370" cy="135" r="16" style="fill: var(--dg-panel); stroke: var(--dg-ink)" stroke-width="2"/>
<text x="370" y="141" text-anchor="middle" font-size="18" font-weight="700">+</text>
<rect x="420" y="115" width="50" height="40" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="445" y="140" text-anchor="middle" font-size="14" font-weight="700">h</text>
<line x1="70" y1="125" x2="128" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai7-arrow)"/>
<line x1="70" y1="140" x2="128" y2="185" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai7-arrow)"/>
<line x1="166" y1="195" x2="198" y2="195" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai7-arrow)"/>
<line x1="280" y1="80" x2="356" y2="126" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai7-arrow)"/>
<line x1="290" y1="190" x2="357" y2="146" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai7-arrow)"/>
<text x="330" y="196" font-size="12" style="fill: var(--dg-muted)">× α/r</text>
<line x1="386" y1="135" x2="418" y2="135" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai7-arrow)"/>
<text x="490" y="100" font-size="13" font-weight="700">Trainable</text>
<text x="490" y="120" font-size="12">r(n + m) values</text>
<text x="490" y="138" font-size="12">instead of n·m</text>
<text x="490" y="172" font-size="12" style="fill: var(--dg-muted)">n = m = 4,096, r = 8:</text>
<text x="490" y="190" font-size="12" style="fill: var(--dg-muted)">65,536 vs 16.8M</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Two serving options fall out of this design. You can <strong>merge</strong> the update into W after training (W' is just a matrix of the original shape), so inference has zero extra latency. Or you can keep adapters <strong>separate</strong> and load many of them on one shared base model, switching per request. An adapter for a 7B model is typically megabytes to tens of megabytes, so a single GPU can hold a base model plus hundreds of customer- or task-specific adapters.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "LoRA paper", title: "Hu et al., 2021", html: "On GPT-3 175B the authors reported about 10,000 times fewer trainable parameters and about a third of the GPU memory of full finetuning, with comparable quality on their benchmarks." },
            { org: "QLoRA", title: "Dettmers et al., 2023", html: "LoRA on top of a base model quantized to 4-bit NormalFloat (NF4), with double quantization of the scale constants and paged optimizers to absorb memory spikes. It made finetuning a 65B model possible on a single 48 GB GPU, with quality close to 16-bit finetuning." },
            { org: "Multi-adapter serving", title: "vLLM, S-LoRA", html: "Serving engines such as vLLM can load several LoRA adapters on one base model and batch requests that use different adapters together. The S-LoRA paper (2023) studied serving thousands of adapters this way." },
          ],
        },
        {
          type: "tradeoffs",
          pros: [
            "Trainable parameters and optimizer memory drop by orders of magnitude",
            "Merging gives zero added inference latency",
            "Adapters are small, cheap to store and can be hot-swapped per tenant",
          ],
          cons: [
            "The full frozen weights must still fit in memory (QLoRA's 4-bit base addresses this)",
            "Very large behavior changes may need higher ranks or full finetuning",
            "Rank, alpha and which layers to adapt are extra hyperparameters to tune",
          ],
        },
        {
          type: "quiz",
          q: "You apply LoRA with r = 16 to a 5,120 &times; 5,120 matrix. How many trainable parameters does that adapter add?",
          options: ["32,768", "81,920", "163,840", "26.2 million"],
          answer: 2,
          explain: "r(n + m) = 16 &times; (5,120 + 5,120) = 163,840, versus 26.2 million for the full matrix (about 0.6%).",
        },
      ],
    },
    {
      id: "model-merging",
      title: "Model merging and multi-task finetuning",
      kicker: "Combining finetunes",
      blocks: [
        {
          type: "problem",
          html: `<p>You have one finetune that is good at SQL and another that is good at summarizing contracts. Finetuning a single model on both tasks one after the other risks <strong>catastrophic forgetting</strong>: the second task overwrites the first. Training on both at once needs all the data in one place and a fresh training run every time a task is added.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Model merging</strong> combines several already-finetuned models into one, usually without any further training. It works best when the models share a base, so their weights live in the same "coordinate system". There are three broad approaches.</p>
<p><strong>Summing.</strong> Combine the weights arithmetically. The simplest is a weighted average. SLERP interpolates along the arc between two weight vectors instead of the straight line. <strong>Task arithmetic</strong> computes a <em>task vector</em> for each finetune (finetuned weights minus base weights) and adds the task vectors to the base. Methods such as TIES and DARE first prune small or conflicting entries from the task vectors so the tasks interfere less.</p>
<p><strong>Layer stacking.</strong> Take layers from different models (or duplicate layers of one model) and stack them into a deeper network, sometimes called frankenmerging. Depth upscaling is a structured version: Upstage's SOLAR 10.7B was built by stacking two trimmed copies of a smaller model and then continuing pretraining. <strong>Concatenation</strong> joins parameters side by side (for example, LoRA adapters of different tasks), which grows the model rather than keeping its size.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Merge", tone: "ok", html: "No joint training run and no need to pool datasets. Can be done on CPUs. Ships one model, which suits on-device deployment. Quality is not guaranteed and must be evaluated per task." },
            { title: "Multi-task finetune", tone: "info", html: "One training run on mixed data. More predictable quality, but needs all the data at once and a rerun when tasks change." },
            { title: "Separate models or adapters", tone: "warn", html: "Best per-task quality and easiest to update, but you serve and route between several models or adapters." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Open-source tools such as mergekit implement linear, SLERP, TIES and DARE merges with a configuration file. Treat a merge like any other model change: run your evaluation suite on every task the source models were good at before shipping it.</p>`,
        },
      ],
    },
    {
      id: "tactics",
      title: "Finetuning tactics: models, frameworks and hyperparameters",
      kicker: "Doing it in practice",
      blocks: [
        {
          type: "text",
          html: `<p>Start by proving the task is feasible. Finetune the strongest model you can afford on a small, high-quality dataset; if even that fails, more data or a smaller model will not save you. Once it works, try cheaper models, or use the strong finetuned model to generate training data and <strong>distill</strong> into a small one. Choose a framework that supports your method (full, LoRA, QLoRA), your hardware and your model family; many teams use an API provider's finetuning service first and move to their own stack only when they need more control.</p>`,
        },
        {
          type: "table",
          title: "Key hyperparameters and their failure signs",
          headers: ["Hyperparameter", "Too high", "Too low"],
          rows: [
            ["Learning rate", "Loss spikes or diverges; the model forgets general abilities", "Loss falls very slowly; the model underfits"],
            ["Batch size", "Needs more memory; fewer updates per epoch", "Noisy, unstable updates; poor hardware use (gradient accumulation helps)"],
            ["Epochs", "Validation loss rises while training loss falls: overfitting", "Both losses still falling: underfitting"],
            ["Prompt loss weight", "The model spends capacity learning to reproduce prompts", "The model learns only from responses (often what you want)"],
          ],
        },
        {
          type: "text",
          html: `<p>The <strong>prompt loss weight</strong> is specific to instruction finetuning. Each example has prompt tokens and response tokens; the weight controls how much the prompt tokens count in the loss. At 100% the model is trained to predict the prompt as much as the answer; at 0% it learns only to produce responses given prompts. Small datasets usually need more epochs than large ones, and a warmup period plus a decaying learning-rate schedule makes training more stable.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Watching only training loss. Training loss almost always goes down. Track validation loss and, more importantly, your task evaluation on held-out data, and also re-run a few general-capability checks to catch forgetting.</p>`,
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
          html: `<p>Finetuning questions usually come in two flavors: "should we finetune?" and "how would we fit it?". The first tests judgment, the second tests whether you can do the arithmetic on a whiteboard.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li>Diagnosis: information failures go to RAG, behavior failures go to finetuning, and the two combine well.</li>
<li>Memory: inference &asymp; N &times; M &times; 1.2; training adds a gradient and optimizer state per trainable parameter (three extra values with Adam) plus activations.</li>
<li>Making it fit: lower precision (BF16, INT8, 4-bit), LoRA to cut trainable parameters to r(n + m) per matrix, QLoRA to quantize the frozen base, gradient checkpointing for activations.</li>
<li>Serving: merge adapters for zero latency, or keep them separate to serve many tenants from one base.</li>
</ol>
<p>Bonus points: the BF16 versus FP16 range trade, model merging as an alternative to multi-task training, and distilling a strong finetune into a small model.</p>`,
        },
        {
          type: "quiz",
          q: "You must serve a 70B model and have GPUs with 80 GB each. Using the N &times; M &times; 1.2 rule, which option fits on a single GPU?",
          options: ["FP16", "INT8", "INT4", "None of them"],
          answer: 2,
          explain: "FP16: 140 GB &times; 1.2 &asymp; 168 GB. INT8: 70 GB &times; 1.2 &asymp; 84 GB, just over 80. INT4: 35 GB &times; 1.2 &asymp; 42 GB, which fits with room for a larger KV cache.",
        },
      ],
    },
  ],
  takeaways: [
    "Finetuning is for form, RAG is for facts: diagnose whether a failure is about missing information or wrong behavior before choosing.",
    "Climb the ladder: prompting, more examples, RAG, then finetuning, measuring at each step.",
    "Inference needs about N &times; M &times; 1.2. Training adds gradients and optimizer states per trainable parameter (three extra values with Adam), plus activations.",
    "Bytes per value multiply everything. BF16 keeps FP32's range, FP16 keeps more precision but overflows above 65,504, and quantization to 8 or 4 bits is routine for inference.",
    "LoRA freezes W and trains A and B of rank r, cutting trainable parameters to r(n + m). Merge for zero latency or keep adapters separate for multi-tenant serving. QLoRA adds a 4-bit frozen base.",
    "Model merging (summing, task arithmetic, TIES, DARE, layer stacking) combines finetunes without joint training, but must be evaluated per task.",
    "Prove feasibility with the strongest model first, then distill; watch validation metrics, not just training loss.",
  ],
  furtherReading: [
    { title: "LoRA: Low-Rank Adaptation of Large Language Models (Hu et al., 2021)", url: "https://arxiv.org/abs/2106.09685", note: "The original method and its GPT-3 experiments." },
    { title: "QLoRA: Efficient Finetuning of Quantized LLMs (Dettmers et al., 2023)", url: "https://arxiv.org/abs/2305.14314", note: "NF4, double quantization and paged optimizers." },
    { title: "ZeRO: Memory Optimizations Toward Training Trillion Parameter Models (Rajbhandari et al., 2019)", note: "The 16-bytes-per-parameter accounting for mixed-precision Adam, and how to shard it." },
    { title: "Editing Models with Task Arithmetic (Ilharco et al., 2022)", note: "Task vectors: adding and subtracting finetuning deltas." },
  ],
};
