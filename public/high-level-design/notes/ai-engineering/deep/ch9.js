// Deep dive: Chapter 9, Inference optimization. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>You deploy a 13B model on a GPU rated at roughly 300 trillion floating-point operations per second. One user sends a prompt and watches the answer stream at about 60 tokens per second. You do the arithmetic: each token needs about 26 billion operations, so the GPU should manage thousands of tokens per second. Your monitoring says the chip's compute is more than 99% idle. Then ten users arrive at once, and the streaming speed for each of them barely changes.</p>
<p>Both surprises have the same cause. Generating a token is not limited by arithmetic but by how fast the weights can be streamed out of GPU memory, and that cost is shared by every request in the batch. Once you see where the bottleneck really is, the whole toolbox of inference optimization (batching, KV cache tricks, quantization, speculative decoding, prompt caching, disaggregation) stops looking like a grab bag and starts looking like a set of answers to two questions: what is the bottleneck, and how do I spend the resource that is sitting idle?</p>`,
  sections: [
    {
      id: "bottlenecks",
      title: "Prefill, decode and the two bottlenecks",
      kicker: "Where the time goes",
      blocks: [
        {
          type: "text",
          html: `<p>A workload is <strong>compute-bound</strong> when it is limited by how many operations per second the chip can do, and <strong>memory-bandwidth-bound</strong> when it is limited by how fast data moves from memory to the compute units. The ratio between the two (operations per byte moved, called <em>arithmetic intensity</em>) decides which one you hit.</p>
<p>LLM inference has two phases with opposite profiles. <strong>Prefill</strong> processes the whole prompt at once: every weight read from memory is used for hundreds or thousands of tokens in parallel, so arithmetic dominates and prefill is compute-bound. <strong>Decode</strong> generates output one token at a time: each step reads every weight (and the KV cache) to produce a single token per sequence, so data movement dominates and decode is bandwidth-bound.</p>`,
        },
        {
          type: "diagram",
          title: "Same weights, very different work per read",
          caption: "Prefill reads the weights once and does a lot of math with them. Decode re-reads all the weights for every output token and does very little math each time. Not to scale.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="Timeline comparing prefill, one weight read followed by long computation, with decode, repeated weight reads each followed by tiny computation">
<text x="20" y="40" font-size="13" font-weight="700">Prefill: one pass over 1,000 prompt tokens</text>
<rect x="20" y="52" width="60" height="34" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<rect x="80" y="52" width="480" height="34" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="320" y="74" text-anchor="middle" font-size="12">compute for 1,000 tokens in parallel</text>
<text x="590" y="74" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">TTFT</text>
<text x="20" y="122" font-size="13" font-weight="700">Decode: one pass per output token</text>
<rect x="20" y="134" width="60" height="34" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<rect x="80" y="134" width="6" height="34" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="92" y="134" width="60" height="34" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<rect x="152" y="134" width="6" height="34" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="164" y="134" width="60" height="34" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<rect x="224" y="134" width="6" height="34" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<rect x="236" y="134" width="60" height="34" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<rect x="296" y="134" width="6" height="34" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="318" y="156" font-size="14" style="fill: var(--dg-muted)">...</text>
<text x="360" y="148" font-size="12">each step reads all weights</text>
<text x="360" y="165" font-size="12">for one token per sequence</text>
<text x="590" y="156" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">TPOT</text>
<rect x="20" y="198" width="14" height="14" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="40" y="210" font-size="12">read weights from GPU memory (HBM)</text>
<rect x="300" y="198" width="14" height="14" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="320" y="210" font-size="12">arithmetic</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Worked example: why the GPU sits idle</h3>
<p>Take a 13B model in FP16: 26 GB of weights. Assume a GPU with about 2 TB/s of memory bandwidth and about 300 TFLOP/s of 16-bit compute. At batch size 1, each decode step must stream all 26 GB, so the floor is 26 GB &divide; 2 TB/s = 13 ms per token, at most about 77 tokens per second. The math per token is roughly 2 operations per parameter, 26 GFLOP, which the compute units finish in under 0.1 ms. More than 99% of the compute capacity waits on memory.</p>
<p>Now batch 32 sequences. The 26 GB are read once per step and used for 32 tokens, so throughput rises almost 32-fold while the step time barely changes. In FP16 each weight byte supports about one operation per sequence in the batch, and this hypothetical GPU can do about 150 operations per byte it reads (300 T &divide; 2 T), so decode only starts to become compute-bound at batch sizes in the low hundreds. In practice the KV cache, which grows with every sequence, usually runs out of memory first.</p>`,
        },
        {
          type: "text",
          html: `<h3>Accelerators and the memory hierarchy</h3>
<p>AI accelerators (GPUs, TPUs and others) are compared on compute (FLOP/s at each precision), memory size, memory bandwidth and power. Memory is a hierarchy: CPU DRAM is large and slow to reach, GPU high-bandwidth memory (HBM) holds the weights and KV cache, and on-chip SRAM is tiny but much faster. For inference, memory size decides what fits and bandwidth decides decode speed, which is why fewer bytes per token is the theme of most optimizations. Kernels such as <strong>FlashAttention</strong> win by computing attention in tiles that stay in SRAM instead of writing large intermediate matrices back to HBM.</p>`,
        },
        {
          type: "quiz",
          q: "Decoding a model at batch size 1 is too slow. Which change most directly raises tokens per second for that single stream?",
          options: ["A GPU with twice the FLOP/s and the same memory bandwidth", "Quantizing weights from FP16 to INT8", "Doubling the batch size", "A longer system prompt"],
          answer: 1,
          explain: "Single-stream decode is bandwidth-bound: time per token is about bytes read divided by bandwidth. INT8 halves the bytes, so it can nearly halve the time per token. More FLOP/s sits idle, and a bigger batch raises total throughput, not this stream's speed.",
        },
      ],
    },
    {
      id: "metrics",
      title: "Measuring inference: latency, throughput and utilization",
      kicker: "Metrics",
      blocks: [
        {
          type: "text",
          html: `<p>Because prefill and decode behave differently, a single latency number hides what users feel. Split it:</p>
<p><span class="formula">total latency = TTFT + TPOT &times; (output tokens)</span></p>
<p><strong>Time to first token</strong> (TTFT) is driven by prefill plus any queueing. <strong>Time per output token</strong> (TPOT) is driven by decode. With TTFT = 400 ms and TPOT = 30 ms, a 500-token answer takes 0.4 + 15 = 15.4 seconds, and only the first 0.4 seconds are spent waiting for anything to appear. A chat app streaming text cares a lot about TTFT; a batch job that parses the whole output only cares about the total.</p>`,
        },
        {
          type: "text",
          html: `<h3>Throughput and goodput</h3>
<p><strong>Throughput</strong> is output tokens per second across all users, and it is what drives cost per token. But throughput can be bought with latency: a huge batch produces many tokens per second while every individual user waits longer. <strong>Goodput</strong> counts only the requests that meet your latency targets, for example TTFT &le; 200 ms and TPOT &le; 100 ms. If raising the batch size from 32 to 64 adds 40% throughput but pushes half the requests past the TPOT target, goodput falls even though throughput rose.</p>
<h3>Utilization: MFU and MBU</h3>
<p><strong>Model FLOP/s utilization</strong> (MFU) is achieved FLOP/s divided by the chip's peak. <strong>Model bandwidth utilization</strong> (MBU) is achieved bytes per second divided by peak bandwidth, where bytes per second is roughly (weight bytes + KV bytes read) &times; decode steps per second. In the example above, 26 GB per step at 60 steps per second is 1.56 TB/s, an MBU of 78% on a 2 TB/s chip, while MFU is around 1%. Compute-bound phases show high MFU, bandwidth-bound phases show high MBU, and comparing your numbers with the peak tells you how much headroom an optimization could unlock.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Online inference APIs", tone: "info", html: "Optimized for latency: requests are answered as they arrive. Needed for chat, autocomplete and anything a user is waiting on." },
            { title: "Batch inference APIs", tone: "ok", html: "Optimized for cost: you submit many requests and collect results later. OpenAI and Anthropic both offer batch APIs at about half the normal price, with results within 24 hours. Good for evaluations, data synthesis and offline enrichment." },
          ],
        },
        {
          type: "quiz",
          q: "A chat product's users complain that the assistant \"takes forever to start answering\", but once text appears it streams quickly. Which metric should you focus on?",
          options: ["TPOT", "TTFT", "MBU", "Batch API turnaround"],
          answer: 1,
          explain: "The delay before the first token is TTFT, driven by queueing and prefill. Fixes include shorter prompts, prompt caching, more prefill capacity, and keeping long prefills from queueing behind each other.",
        },
      ],
    },
    {
      id: "model-level",
      title: "Model-level speedups: compression and speculative decoding",
      kicker: "Making the model cheaper",
      blocks: [
        {
          type: "text",
          html: `<p>Model-level optimizations change the model or how it generates. The first family is <strong>compression</strong>. <strong>Quantization</strong> stores weights (and sometimes activations and the KV cache) in fewer bits; it is the most widely used, because INT8 halves and 4-bit quarters the bytes read per decode step. <strong>Distillation</strong> trains a smaller student model on a larger teacher's outputs. <strong>Pruning</strong> removes weights or whole structures (heads, layers) that contribute little. All three make the model fit on fewer GPUs and decode faster, at some risk to quality that you must measure.</p>
<p>The second family attacks the one-token-per-pass rule of autoregressive decoding. If a pass is bandwidth-bound, checking several candidate tokens in that pass costs almost the same as producing one. The question is where the candidates come from.</p>`,
        },
        {
          type: "idea",
          html: `<p><strong>Speculative decoding:</strong> a small, fast <em>draft</em> model guesses the next K tokens. The large <em>target</em> model scores all K positions in a single forward pass, keeps the longest prefix it agrees with, and adds one token of its own at the first disagreement. With the right acceptance rule, the output follows exactly the target model's distribution.</p>`,
        },
        {
          type: "diagram",
          title: "One verification pass, three tokens",
          caption: "The draft proposes four tokens. The target accepts the first two, rejects the third and substitutes its own choice. The fourth draft token is discarded because it followed a rejected one.",
          svg: `<svg viewBox="0 0 620 270" role="img" aria-label="Speculative decoding: the draft proposes sat on a mat; the target accepts sat and on, rejects a and emits the; output is sat on the">
<text x="20" y="30" font-size="13" font-weight="700">Draft proposes K = 4 (cheap, one at a time)</text>
<rect x="20" y="40" width="80" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="60" y="63" text-anchor="middle" font-size="13">sat</text>
<rect x="110" y="40" width="80" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="150" y="63" text-anchor="middle" font-size="13">on</text>
<rect x="200" y="40" width="80" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="240" y="63" text-anchor="middle" font-size="13">a</text>
<rect x="290" y="40" width="80" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="330" y="63" text-anchor="middle" font-size="13">mat</text>
<text x="20" y="110" font-size="13" font-weight="700">Target checks all 4 in one forward pass</text>
<rect x="20" y="120" width="80" height="36" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="60" y="143" text-anchor="middle" font-size="13">sat</text>
<rect x="110" y="120" width="80" height="36" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="150" y="143" text-anchor="middle" font-size="13">on</text>
<rect x="200" y="120" width="80" height="36" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="240" y="143" text-anchor="middle" font-size="13">a</text>
<rect x="290" y="120" width="80" height="36" rx="6" stroke-dasharray="5 4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="330" y="143" text-anchor="middle" font-size="13" style="fill: var(--dg-muted)">mat</text>
<text x="60" y="174" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">accept</text>
<text x="150" y="174" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">accept</text>
<text x="240" y="174" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">reject</text>
<text x="330" y="174" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">dropped</text>
<text x="20" y="206" font-size="13" font-weight="700">Output of this pass</text>
<rect x="20" y="216" width="80" height="36" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="60" y="239" text-anchor="middle" font-size="13">sat</text>
<rect x="110" y="216" width="80" height="36" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="150" y="239" text-anchor="middle" font-size="13">on</text>
<rect x="200" y="216" width="80" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="240" y="239" text-anchor="middle" font-size="13">the</text>
<text x="420" y="130" font-size="12">Prompt: "The cat ..."</text>
<text x="420" y="160" font-size="12">One target pass</text>
<text x="420" y="178" font-size="12">emitted 3 tokens</text>
<text x="420" y="196" font-size="12">instead of 1.</text>
<text x="420" y="239" font-size="12" style="fill: var(--dg-muted)">"the" comes from the target</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>If each draft token is accepted with probability &alpha; (independently, as a simplification), the expected number of tokens per target pass is</p>
<p><span class="formula">E[tokens per target pass] = (1 &minus; &alpha;<sup>K+1</sup>) / (1 &minus; &alpha;)</span></p>
<p>With &alpha; = 0.8 and K = 4 that is (1 &minus; 0.8<sup>5</sup>) / 0.2 = (1 &minus; 0.328) / 0.2 &asymp; 3.36 tokens. The draft passes are not free: if each costs a tenth of a target pass, four of them add 0.4, so one round costs about 1.4 target passes and yields 3.36 tokens, an idealized speedup of about 2.4&times;. With &alpha; = 0.5 the same setup yields about 1.94 tokens per round and a speedup closer to 1.4&times;. Acceptance rate is everything, and it is highest when the draft model is similar to the target and the text is predictable (code, structured output).</p>`,
        },
        {
          type: "lab",
          id: "speculative",
          caption: "Vary the acceptance rate and the draft length K to see how many tokens each target pass produces, and where a longer draft stops paying for itself.",
        },
        {
          type: "text",
          html: `<p>Two related ideas avoid the separate draft model. <strong>Inference with reference</strong> copies spans directly from the input when the output is likely to repeat it, as in code editing or document revision, then verifies them like draft tokens. <strong>Parallel decoding</strong> methods such as Lookahead decoding and Medusa make the model itself propose several future tokens at once (Medusa adds extra prediction heads), then verify them in the same way.</p>`,
        },
        {
          type: "quiz",
          q: "Speculative decoding with a well-matched draft model gives a 2&times; speedup on a code-completion service. On creative-writing prompts with high sampling temperature, the speedup nearly disappears. Why?",
          options: ["The target model is compute-bound on creative text", "The acceptance rate drops, so most draft tokens are rejected", "Speculative decoding changes the output distribution at high temperature", "Creative prompts are longer"],
          answer: 1,
          explain: "Unpredictable, high-temperature text makes the draft's guesses agree with the target less often. With a low acceptance rate each round yields little more than one token, while still paying for the draft passes.",
        },
      ],
    },
    {
      id: "kv-cache",
      title: "The KV cache and attention optimizations",
      kicker: "Memory for context",
      blocks: [
        {
          type: "problem",
          html: `<p>Attention lets each new token look at every previous token's key and value vectors. Recomputing those for the whole history at every step would make decoding quadratic. Instead servers store them in a <strong>KV cache</strong>, so each step only computes keys and values for the new token. The cache is fast, but it is big, and it grows with every token of every sequence.</p>`,
        },
        {
          type: "text",
          html: `<p><span class="formula">KV cache bytes = 2 &times; B &times; S &times; L &times; H &times; M</span></p>
<p>The 2 is for keys and values; B is batch size, S sequence length, L the number of layers, H the model (hidden) dimension, and M bytes per value. For Llama 2 13B (40 layers, H = 5,120) in FP16, one token costs 2 &times; 40 &times; 5,120 &times; 2 bytes = 819,200 bytes, about 0.8 MB. A 2,048-token sequence needs about 1.7 GB, and a batch of 32 such sequences needs 2 &times; 32 &times; 2,048 &times; 40 &times; 5,120 &times; 2 &asymp; 54 GB, more than double the 26 GB of weights.</p>
<p>That is why long contexts and large batches are limited by KV memory rather than by the weights, and why so many optimizations target it.</p>`,
        },
        {
          type: "lab",
          id: "kvCache",
          caption: "Change batch size, context length and the attention variant. Watch the cache pass the size of the weights, then see how grouped-query and multi-query attention, or a local window, shrink it.",
        },
        {
          type: "table",
          title: "Ways to shrink the KV cache",
          headers: ["Technique", "Idea", "Effect"],
          rows: [
            ["Multi-query attention (MQA)", "All query heads share one key/value head", "KV shrinks by the number of heads; some quality risk"],
            ["Grouped-query attention (GQA)", "Groups of query heads share a key/value head", "Llama 2 70B uses 8 KV heads for 64 query heads: one eighth of the cache"],
            ["Local (windowed) attention", "Attend only to the last W tokens in some or all layers", "Cache stops growing past W tokens in those layers"],
            ["Cross-layer attention", "Adjacent layers share KV vectors", "Fewer layers store their own cache"],
            ["KV quantization", "Store keys and values in 8 bits or fewer", "Halves (or better) the bytes per token"],
          ],
        },
        {
          type: "text",
          html: `<h3>PagedAttention: managing the cache like virtual memory</h3>
<p>Early serving systems reserved one contiguous chunk of memory per request, sized for the maximum possible output length. Most requests finish far shorter, so much of that reservation sat unused, and the gaps between reservations fragmented memory. <strong>PagedAttention</strong>, introduced with the vLLM system in 2023, splits each sequence's cache into fixed-size blocks that can live anywhere in GPU memory, tracked by a per-request block table, just as an operating system maps virtual pages to physical frames.</p>`,
        },
        {
          type: "diagram",
          title: "PagedAttention maps logical blocks to scattered physical blocks",
          caption: "Each request's cache is a list of logical blocks. A block table maps them to whatever physical blocks are free, so memory is allocated as sequences grow and no large contiguous reservation is needed.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Two requests with logical KV blocks mapped through a block table to non-contiguous physical blocks in GPU memory">
<defs><marker id="ai9-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="48" font-size="13" font-weight="700">Request A</text>
<rect x="20" y="58" width="50" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="45" y="80" text-anchor="middle" font-size="12">A0</text>
<rect x="75" y="58" width="50" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="100" y="80" text-anchor="middle" font-size="12">A1</text>
<rect x="130" y="58" width="50" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="155" y="80" text-anchor="middle" font-size="12">A2</text>
<text x="20" y="128" font-size="13" font-weight="700">Request B</text>
<rect x="20" y="138" width="50" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="45" y="160" text-anchor="middle" font-size="12">B0</text>
<rect x="75" y="138" width="50" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="100" y="160" text-anchor="middle" font-size="12">B1</text>
<rect x="215" y="58" width="140" height="114" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="285" y="80" text-anchor="middle" font-size="13" font-weight="700">Block table</text>
<text x="285" y="102" text-anchor="middle" font-size="12">A0 → 3</text>
<text x="285" y="120" text-anchor="middle" font-size="12">A1 → 6, A2 → 1</text>
<text x="285" y="138" text-anchor="middle" font-size="12">B0 → 4</text>
<text x="285" y="156" text-anchor="middle" font-size="12">B1 → 7</text>
<line x1="185" y1="115" x2="213" y2="115" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai9-arrow)"/>
<line x1="355" y1="115" x2="393" y2="115" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ai9-arrow)"/>
<text x="400" y="44" font-size="13" font-weight="700">GPU memory blocks</text>
<rect x="400" y="58" width="48" height="48" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="424" y="98" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">0</text>
<rect x="452" y="58" width="48" height="48" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="476" y="80" text-anchor="middle" font-size="12">A2</text>
<text x="476" y="98" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">1</text>
<rect x="504" y="58" width="48" height="48" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="528" y="98" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2</text>
<rect x="556" y="58" width="48" height="48" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="580" y="80" text-anchor="middle" font-size="12">A0</text>
<text x="580" y="98" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">3</text>
<rect x="400" y="124" width="48" height="48" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="424" y="146" text-anchor="middle" font-size="12">B0</text>
<text x="424" y="164" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">4</text>
<rect x="452" y="124" width="48" height="48" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="476" y="164" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">5</text>
<rect x="504" y="124" width="48" height="48" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="528" y="146" text-anchor="middle" font-size="12">A1</text>
<text x="528" y="164" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">6</text>
<rect x="556" y="124" width="48" height="48" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="1.5"/>
<text x="580" y="146" text-anchor="middle" font-size="12">B1</text>
<text x="580" y="164" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">7</text>
<text x="20" y="212" font-size="12" style="fill: var(--dg-muted)">Blocks are allocated only as a sequence grows, so each request wastes at most</text>
<text x="20" y="230" font-size="12" style="fill: var(--dg-muted)">part of its last block. Free blocks (0, 2, 5) can go to any request.</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "vLLM", title: "PagedAttention, 2023", html: "The vLLM paper reported that earlier systems lost a large share of KV cache memory to over-reservation and fragmentation, and that paging let it fit more concurrent sequences and raise throughput substantially. Blocks can also be shared between sequences with a common prefix." },
            { org: "FlashAttention", title: "Dao et al., 2022", html: "An exact attention kernel that tiles the computation so intermediate results stay in on-chip SRAM, cutting HBM reads and writes. It speeds up both training and prefill and is integrated into common serving and training stacks." },
          ],
        },
      ],
    },
    {
      id: "service-level",
      title: "Service-level optimizations: batching, disaggregation, caching and parallelism",
      kicker: "Running the fleet",
      blocks: [
        {
          type: "text",
          html: `<p>Service-level optimizations leave the model alone and change how requests are scheduled onto hardware. The biggest lever is batching, because decode's cost per step is dominated by reading weights that every sequence in the batch shares.</p>
<p>A worked example with the same cost model as the lab: suppose a decode step costs 15 ms plus 1 ms per sequence in the batch. At batch 1, a step takes 16 ms: 62.5 tokens per second in total. At batch 32, a step takes 47 ms and produces 32 tokens: about 680 tokens per second, almost 11 times the throughput, while each user's TPOT rises from 16 ms to 47 ms. Batch size is a dial between cost per token and per-user speed.</p>`,
        },
        {
          type: "table",
          title: "Batching strategies",
          headers: ["Strategy", "Starts a batch when", "Problem it leaves"],
          rows: [
            ["Static", "The batch is full", "Early requests wait for the batch to fill; finished sequences hold slots until the longest one ends"],
            ["Dynamic", "The batch is full or a time window expires", "Batches can run partly empty; slots are still held until the whole batch finishes"],
            ["Continuous (in-flight)", "Every decode step: finished sequences leave, waiting ones join", "Scheduler complexity, and new prefills interrupt running decodes"],
          ],
        },
        {
          type: "lab",
          id: "batching",
          caption: "Send the same 24 requests through static, dynamic and continuous batching. Compare how long short requests wait behind long ones, how many slots sit idle, and the resulting throughput and latency.",
        },
        {
          type: "text",
          html: `<p>Continuous batching schedules at the granularity of a single decode step. The Orca paper (2022) introduced this iteration-level scheduling, and engines such as vLLM and Hugging Face's TGI made it standard. Short requests no longer wait for long ones, and a slot freed by a finished sequence is refilled on the next step.</p>
<h3>Decoupling prefill and decode</h3>
<p>Even with continuous batching, prefill and decode interfere: a long prompt's prefill occupies the GPU and stalls the decode steps of every running request, which spikes their TPOT. Their bottlenecks also differ (compute versus bandwidth). <strong>Disaggregated serving</strong> runs prefill and decode on separate instances and transfers the KV cache between them, so each pool can be sized and tuned for its own bottleneck. The right ratio of prefill to decode instances depends on prompt lengths, output lengths and latency targets; research systems such as DistServe and Splitwise (both 2024) studied this design.</p>
<h3>Prompt caching</h3>
<p>Many requests share a prefix: the same system prompt, the same long document, the conversation so far. <strong>Prompt caching</strong> stores the KV cache of that prefix and reuses it, so later requests skip its prefill. That cuts TTFT and cost; API providers bill cached input tokens at a discount. It only works if the shared content comes first and is byte-for-byte identical, so put static instructions and documents before anything that varies per request.</p>`,
        },
        {
          type: "table",
          title: "Parallelism strategies",
          headers: ["Strategy", "How it splits the work", "Mainly improves"],
          rows: [
            ["Replica", "Full copies of the model behind a load balancer", "Throughput; simplest"],
            ["Tensor", "Each layer's matrices are split across GPUs that compute together", "Latency, and fits models too big for one GPU; needs fast interconnect"],
            ["Pipeline", "Consecutive groups of layers on different GPUs, with micro-batches flowing through", "Throughput and memory; adds per-request latency"],
            ["Context / sequence", "Split a long input, or sequence-wise operations, across GPUs", "Very long contexts"],
          ],
        },
        {
          type: "quiz",
          q: "A service runs static batching. Most requests need about 50 output tokens, but one in ten needs about 1,000. What is the main benefit of switching to continuous batching?",
          options: ["Each token is computed with fewer FLOPs", "Short requests no longer wait for the long ones in their batch, and freed slots are refilled immediately", "The KV cache becomes smaller", "Prefill becomes bandwidth-bound"],
          answer: 1,
          explain: "Under static batching a batch holds its slots until its longest sequence finishes, so the 50-token requests sit idle while one 1,000-token request completes. Continuous batching releases finished sequences and admits new ones every step.",
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
          html: `<p>Inference optimization comes up when you design an LLM serving platform, discuss the cost of an AI feature, or are asked "how would you make this faster or cheaper?". Interviewers listen for whether you identify the bottleneck before naming techniques.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer covers:</p>
<ol>
<li>The two phases: prefill is compute-bound and drives TTFT; decode is bandwidth-bound and drives TPOT.</li>
<li>Metrics: TTFT, TPOT, throughput, goodput under an SLO, and MFU/MBU for headroom.</li>
<li>Memory math: weights N &times; M, KV cache 2 &times; B &times; S &times; L &times; H &times; M, and why the cache limits batch size and context.</li>
<li>Model-level levers: quantization, distillation, GQA/MQA, KV quantization, speculative decoding.</li>
<li>Service-level levers: continuous batching, PagedAttention, prompt caching, prefill/decode disaggregation, and the right parallelism (tensor for latency, replicas or pipeline for throughput).</li>
</ol>
<p>Then tie the choice to the product: a chat app trades throughput for TTFT and TPOT; an offline pipeline maximizes throughput and uses batch APIs.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks you to serve a 13B FP16 model with 2,048-token contexts at batch 32 on one 80 GB GPU. Using the chapter's numbers, what is the main problem?",
          options: [
            "The weights alone do not fit",
            "Weights (26 GB) plus KV cache (about 54 GB) exceed 80 GB once activations are included, so you need GQA-style sharing, KV quantization, a smaller batch or shorter contexts",
            "Prefill will be bandwidth-bound",
            "The GPU lacks the FLOP/s for decode",
          ],
          answer: 1,
          explain: "26 GB of weights fit easily, but the cache at that batch and length is about 54 GB, which leaves almost nothing for activations and overhead. Shrinking the cache (KV quantization; GQA is a model architecture choice) or reducing batch or context is the fix. Compute is not the constraint for decode.",
        },
      ],
    },
  ],
  takeaways: [
    "Prefill is compute-bound and sets TTFT; decode is memory-bandwidth-bound and sets TPOT. Identify which one you are fighting before choosing a fix.",
    "At small batch sizes the GPU's compute is mostly idle during decode; batching reuses each weight read for many sequences and multiplies throughput.",
    "Track TTFT, TPOT, throughput and goodput (requests within the SLO), and use MFU and MBU to see how much headroom is left.",
    "The KV cache, 2 &times; B &times; S &times; L &times; H &times; M, can exceed the weights. GQA/MQA, local attention, KV quantization and PagedAttention keep it in check.",
    "Speculative decoding spends idle compute to verify K draft tokens per pass, yielding (1 &minus; &alpha;<sup>K+1</sup>)/(1 &minus; &alpha;) tokens on average without changing the output distribution.",
    "Continuous batching, prefill/decode disaggregation and prompt caching are the main service-level wins; tensor parallelism cuts latency, replicas and pipelines add throughput.",
  ],
  furtherReading: [
    { title: "Efficient Memory Management for Large Language Model Serving with PagedAttention (Kwon et al., 2023)", url: "https://arxiv.org/abs/2309.06180", note: "The vLLM paper: paged KV cache blocks and prefix sharing." },
    { title: "Fast Inference from Transformers via Speculative Decoding (Leviathan, Kalman and Matias, 2022)", url: "https://arxiv.org/abs/2211.17192", note: "Draft-and-verify decoding with an exact acceptance rule." },
    { title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness (Dao et al., 2022)", url: "https://arxiv.org/abs/2205.14135", note: "Why keeping attention in SRAM matters." },
    { title: "Orca: A Distributed Serving System for Transformer-Based Generative Models (Yu et al., OSDI 2022)", note: "Iteration-level scheduling, the idea behind continuous batching." },
  ],
};
