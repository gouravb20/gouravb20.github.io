// AI Engineering - interactive notes data, part 2 (chapters 6-10)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch6`, part: 3, number: 6,
    title: `RAG and Agents`,
    overview: `Two patterns for giving models the right context. <strong>RAG</strong> retrieves relevant information from external memory: term-based retrieval (BM25), embedding-based retrieval (vector search) and hybrids, plus chunking, reranking, query rewriting and contextual retrieval. <strong>Agents</strong> perceive an environment and act on it with <strong>tools</strong>, using <strong>planning</strong>, reflection and error correction. The chapter ends with agent failure modes and <strong>memory</strong> systems.`,
    concepts: [
      { term: `RAG`, def: `Retrieval-augmented generation: a <strong>retriever</strong> fetches relevant information from external memory, and a <strong>generator</strong> (the model) answers using it. Retrieval has two phases: <strong>indexing</strong> (processing data for later lookup) and <strong>querying</strong>.`, why: `Each query gets only the context it needs, which reduces hallucinations and makes private or up-to-date knowledge usable.` },
      { term: `Term-based retrieval`, def: `Lexical matching on keywords: TF-IDF, and <strong>BM25</strong>, which normalizes term frequency by document length and saturates repeated terms. Usually served by an inverted index (Elasticsearch).`, why: `Fast, cheap and strong out of the box. It handles exact names, IDs and error codes that embeddings often miss.`, demo: `retrieval` },
      { term: `Embedding-based retrieval`, def: `Embed chunks and queries into vectors and return the nearest neighbors (cosine similarity) from a vector database, typically using approximate nearest neighbor indexes (HNSW, IVF, LSH, product quantization).`, why: `It captures meaning, so paraphrases and synonyms match, but it costs embedding compute and can miss exact terms.`, demo: `retrieval` },
      { term: `Hybrid search & RRF`, def: `Combine retrievers either sequentially (cheap term-based search first, then a reranker) or in parallel, merging rankings with <strong>reciprocal rank fusion</strong>: score = Σ 1 / (k + rank), with k = 60 as a common choice.`, why: `RRF uses only ranks, so it needs no score normalization between very different retrievers.`, demo: `retrieval` },
      { term: `Retrieval evaluation`, def: `<strong>Context precision</strong>: what fraction of retrieved documents are relevant. <strong>Context recall</strong>: what fraction of the relevant documents were retrieved. Ranking metrics include NDCG, MAP and MRR. Also measure the quality of the final RAG output.`, why: `Recall needs annotation of all relevant documents, which is expensive, so many teams track precision with an AI judge.` },
      { term: `Chunking strategy`, def: `Split documents by characters, words, sentences, paragraphs, tokens or semantic boundaries, often with overlap.`, why: `Small chunks are precise and let more items fit in context, but lose surrounding information. Large chunks keep context but waste tokens and dilute embeddings.` },
      { term: `Reranking, query rewriting, contextual retrieval`, def: `Rerank candidates with a stronger (cross-encoder) model or by recency. Rewrite ambiguous queries using the conversation ("How about Emily Doe?" becomes a self-contained question). Augment each chunk with context such as titles, tags or an LLM-written summary of where it fits.`, why: `These are cheap fixes for most of the common reasons retrieval misses.` },
      { term: `Agent`, def: `Anything that perceives its <strong>environment</strong> and acts on it. An AI agent is a model plus <strong>tools</strong> (actions) plus <strong>planning</strong>. The environment and the tool inventory define what it can do.`, why: `Agents can do multi-step tasks, but errors compound: 95% per-step accuracy over 10 steps is only about 60% end to end.`, demo: `react` },
      { term: `Tools`, def: `Three kinds: <strong>knowledge augmentation</strong> (retrievers, search, SQL), <strong>capability extension</strong> (calculator, code interpreter, translator) and <strong>write actions</strong> (send email, update a database, place an order).`, why: `Write actions make agents far more useful and far more dangerous. Gate them.` },
      { term: `Planning, reflection, ReAct`, def: `The model generates a plan (a sequence of tool calls) through function calling. <strong>ReAct</strong> interleaves Thought, Action and Observation. <strong>Reflection</strong> evaluates results and corrects errors (for example, Reflexion).`, why: `Decoupling plan generation, validation and execution lets you check plans before running expensive or irreversible actions.`, demo: `react` },
      { term: `Agent failure modes`, def: `<strong>Planning failures</strong>: invalid tool, valid tool with invalid parameters, valid tool with incorrect parameter values, goal failure (including time constraints), and reflection errors (claiming success when the task isn't done). <strong>Tool failures</strong>: the tool returns wrong output, or a needed tool is missing. <strong>Efficiency</strong>: too many steps, too much cost or time.`, why: `Evaluate with a planning dataset: the percentage of valid plans, valid tool calls and invalid parameter values, plus steps, cost and time per task.`, demo: `react` },
      { term: `Memory`, def: `Three mechanisms: <strong>internal knowledge</strong> (in the weights), <strong>short-term memory</strong> (the context window) and <strong>long-term memory</strong> (external storage retrieved like RAG).`, why: `Memory management (FIFO, summarization, reflection on what to keep, handling contradictions) keeps the context within limits while preserving what matters.` }
    ],
    cheatsheet: [
      { title: `Term-based vs embedding-based retrieval`, type: `table`, headers: [`Aspect`, `Term-based (BM25)`, `Embedding-based`], rows: [
        [`Matches`, `Exact keywords`, `Meaning, including paraphrases`],
        [`Speed and cost`, `Very fast, cheap`, `Embedding plus vector search cost`],
        [`Out of the box`, `Strong baseline`, `Depends on the embedder and domain`],
        [`Fails on`, `Synonyms, paraphrases`, `Exact IDs, names, rare terms`],
        [`Tuning`, `k1, b parameters`, `Embedding model, chunking, ANN index`]
      ] },
      { title: `Key formulas`, type: `code`, body: `BM25(q,d) = Σ_t IDF(t) · f(t,d)·(k1+1) / ( f(t,d) + k1·(1 − b + b·|d|/avgdl) )
RRF(d)    = Σ_retrievers 1 / (k + rank_r(d))      k ≈ 60
Context precision = relevant retrieved / retrieved
Context recall    = relevant retrieved / all relevant` },
      { title: `Agent evaluation metrics`, type: `list`, items: [
        `% of generated plans that are valid, and the average number of attempts to get a valid plan`,
        `% of tool calls that are valid, and how often invalid tools are called`,
        `How often valid tools get invalid parameters or incorrect values`,
        `Goal success, including constraints such as budget and deadline`,
        `Efficiency: steps, cost and time per task compared with a baseline (another agent or a human)`
      ] },
      { title: `Memory types`, type: `table`, headers: [`Memory`, `Where`, `Persistence`], rows: [
        [`Internal knowledge`, `Model weights`, `Until the model is updated`],
        [`Short-term`, `Context window`, `The current session or task`],
        [`Long-term`, `External store (vector DB, etc.)`, `Across sessions, can be edited or deleted`]
      ] }
    ],
    interview: [
      { q: `When would you pick BM25 over embedding retrieval?`, a: `When queries rely on exact terms (product codes, error messages, names), when you need a cheap and fast baseline, or when you lack a good embedding model for your domain. The book suggests starting RAG with term-based retrieval. In practice, hybrid search (BM25 plus embeddings with RRF or reranking) usually beats either alone.`, diff: `med` },
      { q: `Explain reciprocal rank fusion.`, a: `Each retriever produces a ranking. A document's fused score is the sum over retrievers of 1/(k + rank), with k around 60. Documents ranked high by several retrievers win. RRF uses only ranks, so you don't need to normalize incomparable scores like BM25 and cosine similarity.`, diff: `med` },
      { q: `How do you choose chunk size?`, a: `It's a trade-off. Smaller chunks give more precise matches and fit more items into context, but they lose context and inflate the index. Larger chunks keep context but dilute embeddings and waste tokens. Respect natural boundaries, add overlap, consider the embedding model's token limit, and choose by measuring retrieval and answer quality.`, diff: `med` },
      { q: `Your RAG system's answers are wrong. How do you debug it?`, a: `Separate retrieval from generation. Check whether the needed information was retrieved (context recall and precision on labeled queries). If not, look at chunking, query rewriting, hybrid search, reranking and contextual retrieval. If it was retrieved but the answer is wrong, look at the prompt (instructions, the position of key context), the amount of context, model choice, and faithfulness checks.`, diff: `hard` },
      { q: `What are the main ways agents fail?`, a: `Planning failures: calling a tool that doesn't exist, passing invalid parameters, passing incorrect values, failing the goal or its constraints, and reflection errors where the agent claims to be done when it isn't. Tool failures: wrong outputs, translation errors, or missing tools. Inefficiency: too many steps or too much cost and time.`, diff: `med` },
      { q: `Why are agents risky, and how do you contain the risk?`, a: `Errors compound over steps, costs and latency grow, and write actions can do real damage, including through prompt injection. Containment: least-privilege tools, human approval for impactful writes, validating plans before execution, step and budget limits, sandboxed execution, and logging every tool call and output for evaluation.`, diff: `hard` },
      { q: `What is ReAct?`, a: `A prompting pattern that interleaves reasoning and acting: the model writes a Thought, chooses an Action (a tool call), receives an Observation (the tool result), and repeats until it can give a final answer. It makes plans adaptive to observations and leaves an inspectable trace.`, diff: `easy` },
      { q: `How do RAG and long-term memory relate?`, a: `Long-term memory is external storage that the agent writes to and reads from with retrieval, the same machinery as RAG. Short-term memory is the context window. Memory management decides what overflows from short-term to long-term memory, what to summarize, and how to resolve contradictory memories.`, diff: `med` }
    ],
    labs: [`retrieval`, `react`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch7`, part: 3, number: 7,
    title: `Finetuning`,
    overview: `Finetuning adapts a model by updating its weights. The chapter covers <strong>when to finetune</strong> (and when not to), <strong>finetuning vs RAG</strong>, why finetuning is <strong>memory-bound</strong> (memory math, numerical formats, quantization), <strong>parameter-efficient finetuning</strong> (LoRA and friends), <strong>model merging</strong> and multi-task finetuning, and practical tactics such as frameworks and hyperparameters.`,
    concepts: [
      { term: `Why finetune`, def: `To improve domain-specific capability, enforce output formats and styles, improve instruction following, reduce bias, or <strong>distill</strong> a large model's behavior into a smaller, cheaper one.`, why: `It is often the best way to get a small model to do one task very well.` },
      { term: `Why not finetune`, def: `It needs high-quality data, ML expertise and infrastructure for training and serving. It can hurt other capabilities. You have to maintain it as better base models come out. Prompting may be enough.`, why: `Try prompting (with versioned prompts and an eval pipeline) first.` },
      { term: `Finetuning vs RAG`, def: `<strong>Information-based failures</strong> (missing or outdated facts) call for RAG. <strong>Behavior-based failures</strong> (wrong format, irrelevant or unsafe output) call for finetuning. In the book's words: <em>finetuning is for form, and RAG is for facts</em>.`, why: `They combine well: RAG supplies facts and finetuning teaches the model how to use them.` },
      { term: `The adaptation workflow`, def: `(1) Prompting alone. (2) Add more examples (1 to 50). (3) Add RAG, starting with term-based retrieval. (4a) If information failures persist, use more advanced RAG. (4b) If behavior failures persist, finetune. (5) Combine RAG and finetuning.`, why: `Each step adds cost and complexity. Your evals decide when to climb.` },
      { term: `Backprop & trainable parameters`, def: `Training does a forward pass and a backward pass. For every <strong>trainable</strong> parameter you store a gradient and the optimizer state.`, why: `Memory scales with the number of trainable parameters, which is why freezing most of the model (PEFT) helps so much.`, demo: `memoryCalc` },
      { term: `Inference memory math`, def: `Weights = N × M (parameters × bytes per parameter). Activations and KV vectors are roughly 20% more, giving <strong>N × M × 1.2</strong>.`, why: `A 13B model in 2-byte precision needs 26 GB for weights and about 31.2 GB in total, so a 24 GB GPU isn't enough.`, demo: `memoryCalc` },
      { term: `Training memory math`, def: `Training memory = weights + activations + gradients + optimizer states. Per trainable parameter: 1 gradient plus 0 (SGD), 1 (momentum) or 2 (Adam) optimizer values.`, why: `Full finetuning of 13B with Adam in 2 bytes: 13B × 3 × 2 bytes = 78 GB for gradients and optimizer alone. With 1B trainable parameters it's 6 GB. Activations can dwarf this; gradient checkpointing trades compute for memory.`, demo: `memoryCalc` },
      { term: `Numerical formats`, def: `FP32 (4 bytes), FP16 and BF16 (2 bytes), INT8 (1 byte), INT4 (0.5 bytes). Each float has sign, range (exponent) and precision (mantissa) bits. BF16 keeps FP32's range with less precision. FP16 has more precision but a smaller range, so it can overflow.`, why: `Halving bytes per parameter halves memory and bandwidth. Mixing formats incorrectly can quietly hurt quality.`, demo: `quantize` },
      { term: `Quantization`, def: `Reducing the precision of weights and/or activations. <strong>Post-training quantization</strong> (PTQ) is the most common. <strong>Quantization-aware training</strong> simulates low precision during training. <strong>Mixed precision</strong> keeps sensitive parts in higher precision.`, why: `Inference is routinely done in 16, 8 or even 4 bits. QLoRA finetunes on top of a 4-bit base model.`, demo: `quantize` },
      { term: `PEFT & LoRA`, def: `Parameter-efficient finetuning updates a small number of parameters. <strong>LoRA</strong> freezes W (n × m) and learns A (n × r) and B (r × m). Their product is added to W, scaled by α/r. The rank r is small (often 4 to 64).`, why: `It cuts trainable parameters and memory dramatically. Because AB can be merged into W, there's no extra inference latency, or adapters can be kept separate to serve many customers from one base model.`, demo: `memoryCalc` },
      { term: `Model merging`, def: `Combine several finetuned models into one: <strong>summing</strong> (linear combination, SLERP, task arithmetic, with pruning methods like TIES and DARE), <strong>layer stacking</strong> (frankenmerging, depth upscaling) and <strong>concatenation</strong>.`, why: `It gives multi-task models without joint training, and can be done without GPUs for training.` },
      { term: `Finetuning tactics`, def: `Choose a framework and base model, start with a strong model to test feasibility, then distill into smaller ones. Key hyperparameters: <strong>learning rate</strong>, batch size, number of epochs, and <strong>prompt loss weight</strong> (how much the prompt tokens count in the loss).`, why: `Too high a learning rate causes instability or forgetting. Too few epochs underfits and too many overfits.` }
    ],
    cheatsheet: [
      { title: `Memory formulas`, type: `code`, body: `Inference:  memory ≈ N × M × 1.2         (N params, M bytes/param)
Training:   weights + activations + gradients + optimizer states
            grads+opt ≈ N_trainable × (1 + k) × M_opt
            k = 0 (SGD), 1 (momentum), 2 (Adam)
Examples:   13B @2B  → 26 GB weights, 31.2 GB to serve
            13B Adam full finetune → 13B × 3 × 2 B = 78 GB grads+opt
            1B trainable           →  1B × 3 × 2 B =  6 GB` },
      { title: `Numerical formats`, type: `table`, headers: [`Format`, `Bytes`, `Note`], rows: [
        [`FP32`, `4`, `Full precision for training`],
        [`TF32`, `~4 (19 bits used)`, `NVIDIA tensor cores`],
        [`BF16`, `2`, `FP32 range, less precision, popular for training`],
        [`FP16`, `2`, `More precision, smaller range, can overflow`],
        [`INT8`, `1`, `Common inference quantization`],
        [`INT4 / NF4`, `0.5`, `Aggressive, used in QLoRA`]
      ] },
      { title: `PEFT families`, type: `table`, headers: [`Family`, `Examples`, `Idea`], rows: [
        [`Adapter-based`, `LoRA, BitFit, IA3, QLoRA`, `Add or modify a few weights`],
        [`Soft-prompt-based`, `Prefix tuning, P-tuning, prompt tuning`, `Learn trainable prompt embeddings`]
      ] },
      { title: `RAG or finetune?`, type: `table`, headers: [`Symptom`, `Use`], rows: [
        [`Missing, private or outdated facts`, `RAG`],
        [`Wrong format, style or tone`, `Finetune`],
        [`Unsafe or irrelevant behavior`, `Finetune (plus guardrails)`],
        [`Need a cheap, small, specialized model`, `Distillation finetune`],
        [`Both`, `RAG + finetune`]
      ] }
    ],
    interview: [
      { q: `How do you decide between RAG and finetuning?`, a: `Diagnose the failure mode. If the model lacks information (private, recent or niche facts), that's an information failure: use RAG. If it has the facts but behaves wrongly (format, style, safety, irrelevance), that's a behavior failure: finetune. Finetuning is for form, RAG is for facts. Often you combine them.`, diff: `easy` },
      { q: `Estimate the GPU memory needed to serve a 70B model in FP16.`, a: `Weights: 70B × 2 bytes = 140 GB. Add about 20% for activations and the KV cache (more with long contexts or large batches), so roughly 168 GB. That needs multiple 80 GB GPUs, or quantization: INT8 is about 84 GB and INT4 about 42 GB.`, diff: `med` },
      { q: `Why does full finetuning need so much more memory than inference?`, a: `Besides weights and activations, every trainable parameter needs a gradient plus optimizer state: Adam keeps two values (first and second moments). So you store about 3 extra values per parameter, and activations must be kept for the backward pass. For 13B with Adam in 2 bytes, that's 78 GB of gradients and optimizer state on top of the weights.`, diff: `med` },
      { q: `Explain LoRA.`, a: `For a weight matrix W (n × m), LoRA freezes W and learns two small matrices, A (n × r) and B (r × m), with r much smaller than n and m. The update AB, scaled by α/r, is added to W. Only A and B are trained, so trainable parameters fall from n·m to r(n + m). After training, AB can be merged into W for zero extra latency, or kept separate to hot-swap adapters on one base model.`, diff: `med` },
      { q: `What's the difference between BF16 and FP16?`, a: `Both use 16 bits. BF16 has 8 exponent bits (the same range as FP32) and 7 mantissa bits. FP16 has 5 exponent bits and 10 mantissa bits. BF16 rarely overflows, which makes it popular for training. FP16 is more precise but can overflow or underflow, and loading a BF16-trained model in FP16 can degrade it.`, diff: `hard` },
      { q: `What is QLoRA?`, a: `LoRA finetuning on top of a base model quantized to 4 bits (NF4), with tricks such as double quantization and paged optimizers. It made finetuning large models (for example 65B) feasible on a single high-memory GPU while keeping quality close to 16-bit finetuning.`, diff: `med` },
      { q: `What is model merging, and why would you use it?`, a: `Combining multiple models (often finetunes of the same base) into one by summing weights (linear, SLERP, task vectors with TIES or DARE), stacking layers, or concatenating parameters. It gives a multi-task model without joint training, avoids catastrophic forgetting from sequential finetuning, and suits on-device deployment where you can ship only one model.`, diff: `hard` },
      { q: `What are signs of a bad learning rate when finetuning?`, a: `Too high: loss spikes or diverges, or the model forgets general capabilities. Too low: loss decreases very slowly and the model underfits. Start from the framework's recommended range, use warmup and a schedule, and watch both training and validation loss.`, diff: `easy` }
    ],
    labs: [`memoryCalc`, `quantize`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch8`, part: 3, number: 8,
    title: `Dataset Engineering`,
    overview: `Models are only as good as their data. This chapter covers <strong>data curation</strong> (quality, coverage, quantity, acquisition and annotation), <strong>data augmentation and synthesis</strong> (traditional and AI-powered, plus model distillation) and <strong>data processing</strong> (inspection, deduplication, cleaning and filtering, formatting). Throughout, the amount and kind of data depends on the finetuning technique and how far the task is from what the base model already does.`,
    concepts: [
      { term: `Data-centric AI`, def: `Improving performance by improving data instead of models. As models become commodities, data becomes the differentiator.`, why: `For most AI engineers, dataset engineering is where finetuning effort goes.` },
      { term: `Data quality`, def: `Six traits of high-quality data: <strong>relevant</strong>, <strong>aligned with task requirements</strong>, <strong>consistent</strong> (across annotators), <strong>correctly formatted</strong>, <strong>sufficiently unique</strong> (few duplicates) and <strong>compliant</strong> (policies, privacy, licenses).`, why: `A small amount of high-quality data can beat a large amount of noisy data. LIMA aligned a 65B model with 1,000 carefully curated examples.` },
      { term: `Data coverage (diversity)`, def: `Training data should cover the range of problems users bring: topics, task types, lengths, languages, formats and edge cases.`, why: `Models fail on what they've never seen. Llama 3's data mix, for example, deliberately balanced domains such as code, math and multilingual text.` },
      { term: `Data quantity`, def: `How much data you need depends on the finetuning technique (PEFT needs less than full finetuning), task complexity, and the base model's starting performance.`, why: `Run small experiments (50 to 100 examples) to see if finetuning helps, then plot performance against dataset size to estimate the return on more data.` },
      { term: `Acquisition & annotation`, def: `Sources: your application's data (the best, since it matches your distribution), public datasets, purchased data, and annotation by humans or AI. Annotation needs clear guidelines, the same way evaluation does.`, why: `User data and feedback create a data flywheel that competitors can't copy.` },
      { term: `Traditional augmentation & synthesis`, def: `Rule-based transforms (templates, replacing words with synonyms, perturbations) and simulation (game engines and simulators for robotics or self-driving).`, why: `Cheap and controllable, but limited diversity.` },
      { term: `AI-powered synthesis`, def: `Use models to generate data: paraphrasing and translation (including back-translation), self-instruct (generating instructions from seed examples), <strong>reverse instruction</strong> (generating the prompt for existing high-quality text), and simulating users or agents.`, why: `It scales and can fill coverage gaps (rare cases, safety examples), but needs verification.` },
      { term: `Synthetic data limitations`, def: `Quality control is hard. There's a risk of <strong>superficial imitation</strong> (copying style without capability), potential <strong>model collapse</strong> when models train recursively on AI-generated data, and obscure data lineage (license and contamination risk).`, why: `Verify synthetic data with functional checks (does the code run?), AI judges, or heuristics, and mix it with real data.` },
      { term: `Model distillation`, def: `Train a small student model to imitate a larger teacher, often using teacher-generated data.`, why: `Much cheaper inference at close to the teacher's quality on the target task. Check the teacher model's license.` },
      { term: `Inspect data`, def: `Look at the data: token and length distributions, topic distributions, annotator agreement, and samples read by hand.`, why: `The book stresses that manually inspecting data is one of the highest-value activities, and that few people do it.` },
      { term: `Deduplication`, def: `Remove exact and near duplicates at the document, paragraph or sentence level, using hashing, n-gram overlap, <strong>MinHash/LSH</strong> or embedding similarity.`, why: `Duplicates skew the distribution, waste compute, cause memorization and can contaminate test sets.`, demo: `dedup` },
      { term: `Clean, filter, format`, def: `Remove extra formatting tokens, PII and toxic or low-quality samples (heuristics, quality classifiers, perplexity). Then format the data to match the model's <strong>chat template</strong> and the expected prompt structure.`, why: `A template mismatch between training and inference silently hurts quality.` }
    ],
    cheatsheet: [
      { title: `Quality checklist`, type: `list`, items: [
        `Relevant to the task`,
        `Aligned with task requirements (for example, factually correct and in the right style)`,
        `Consistent across annotators (measure agreement)`,
        `Correctly formatted (chat template, no stray HTML or tokens)`,
        `Sufficiently unique (deduplicated)`,
        `Compliant (PII, licenses, policy)`
      ] },
      { title: `Synthesis techniques`, type: `table`, headers: [`Technique`, `How`, `Good for`], rows: [
        [`Rule-based`, `Templates, synonym replacement, perturbation`, `Formats, robustness`],
        [`Simulation`, `Simulators and game engines`, `Robotics, rare events`],
        [`Paraphrase / translate`, `LLM rewrites, back-translation`, `Diversity, multilingual data`],
        [`Self-instruct`, `LLM generates new tasks from seeds`, `Instruction data`],
        [`Reverse instruction`, `LLM writes a prompt for existing good text`, `High-quality responses`],
        [`Distillation`, `Teacher outputs train a student`, `Small, cheap models`]
      ] },
      { title: `Deduplication methods`, type: `table`, headers: [`Method`, `Catches`, `Cost`], rows: [
        [`Exact hash`, `Identical text`, `Very cheap`],
        [`n-gram / Jaccard`, `Near-identical text`, `Medium`],
        [`MinHash + LSH`, `Near duplicates at scale`, `Scales to billions`],
        [`Embedding similarity`, `Semantic duplicates`, `Expensive`]
      ] },
      { title: `Data processing order (typical)`, type: `list`, items: [
        `Inspect: stats, distributions, read samples`,
        `Deduplicate: exact first, then near duplicates`,
        `Clean and filter: PII, toxicity, low quality, formatting junk`,
        `Format: chat template, prompt and response structure, prompt loss weighting`,
        `Hold out eval data and check contamination against it`
      ] }
    ],
    interview: [
      { q: `What makes training data "high quality"?`, a: `Relevant to the task, aligned with the task's requirements (correct, in the right style), consistent across annotators, correctly formatted, sufficiently unique, and compliant with privacy and licensing. A small, carefully curated set (like LIMA's 1,000 examples) can beat a large noisy one.`, diff: `easy` },
      { q: `How do you decide how much finetuning data you need?`, a: `Run small experiments: finetune on 50 to 100 good examples to see whether finetuning helps at all. Then train on increasing subsets and plot performance against size. The slope tells you whether more data is worth buying. PEFT methods and strong base models need less data, and complex tasks need more.`, diff: `med` },
      { q: `What are the risks of synthetic data?`, a: `Quality is hard to control, models may learn superficial style without the underlying capability, recursive training on AI-generated data can cause model collapse (losing the tails of the distribution), and lineage is unclear (licenses, possible benchmark contamination). Mitigate with verification (functional tests, AI judges), mixing in real data, and tracking provenance.`, diff: `med` },
      { q: `How would you deduplicate a large text corpus?`, a: `Normalize the text, remove exact duplicates with hashing, then remove near duplicates with MinHash signatures over word shingles plus LSH buckets to find candidate pairs above a Jaccard threshold. Optionally remove semantic duplicates with embeddings. Choose the granularity (document, paragraph, line) and also deduplicate training data against eval sets.`, diff: `hard` },
      { q: `What is model distillation, and when is it appropriate?`, a: `Training a smaller student model to mimic a larger teacher, usually using the teacher's outputs as training data. It's appropriate when you need lower latency or cost for a well-defined task and a strong teacher exists. Check the teacher's terms of use, since some providers forbid using outputs to train competing models.`, diff: `easy` },
      { q: `Why does formatting matter when finetuning?`, a: `The model learns the exact token patterns it's trained on. If training data doesn't use the same chat template, special tokens and prompt structure as inference, quality drops silently. Also decide the prompt loss weight, that is, how much the prompt tokens contribute to the loss compared with the response tokens.`, diff: `med` },
      { q: `What is reverse instruction?`, a: `Taking existing high-quality content (such as well-written articles or code) and asking an LLM to generate the prompt that would produce it. The responses are then human-quality, avoiding the main weakness of AI-generated responses, and only the prompts are synthetic.`, diff: `med` }
    ],
    labs: [`dedup`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch9`, part: 4, number: 9,
    title: `Inference Optimization`,
    overview: `Making models faster and cheaper to run. The chapter covers <strong>bottlenecks</strong> (compute-bound vs memory-bandwidth-bound: prefill vs decode), online and batch APIs, <strong>metrics</strong> (TTFT, TPOT, throughput, goodput, MFU, MBU), <strong>AI accelerators</strong> and the memory hierarchy, <strong>model-level optimizations</strong> (quantization, distillation, pruning, speculative decoding, inference with reference, parallel decoding, KV cache and attention optimizations, kernels) and <strong>service-level optimizations</strong> (batching, decoupling prefill and decode, prompt caching, parallelism).`,
    concepts: [
      { term: `Compute-bound vs memory-bandwidth-bound`, def: `A workload is compute-bound if it's limited by FLOP/s, and bandwidth-bound if it's limited by how fast data moves from memory. <strong>Prefill</strong> (many tokens in parallel) is compute-bound. <strong>Decode</strong> (one token at a time, reading all weights each step) is bandwidth-bound.`, why: `Different bottlenecks need different fixes. Batching helps decode because it amortizes weight reads.`, demo: `batching` },
      { term: `Online vs batch inference APIs`, def: `Online APIs optimize latency. Batch APIs optimize cost: providers offer them at a large discount (for example 50%) with a longer turnaround, such as hours.`, why: `Use batch APIs for evals, data synthesis and offline tasks.` },
      { term: `TTFT & TPOT`, def: `<strong>Time to first token</strong> depends on prefill. <strong>Time per output token</strong> depends on decode. Total latency = TTFT + TPOT × output tokens. Related metrics: time between tokens and inter-token latency.`, why: `A TPOT of about 120 ms (6 to 8 tokens/s) already matches fast human reading in streaming mode. Users may prefer a fast first token over fast streaming, or the reverse.`, demo: `batching` },
      { term: `Throughput & goodput`, def: `<strong>Throughput</strong> is output tokens per second across all users. <strong>Goodput</strong> counts only requests that meet the latency SLOs (for example TTFT ≤ 200 ms and TPOT ≤ 100 ms).`, why: `Raising batch size raises throughput but can blow the latency SLO. Goodput captures that trade-off.`, demo: `batching` },
      { term: `MFU & MBU`, def: `<strong>Model FLOP/s utilization</strong> = observed FLOP/s divided by the hardware's peak. <strong>Model bandwidth utilization</strong> = bandwidth used divided by peak bandwidth.`, why: `Compute-bound workloads show high MFU and bandwidth-bound workloads show high MBU. Prefill MFU is higher than decode MFU, and an MFU above 50% is considered good for training.` },
      { term: `AI accelerators & memory hierarchy`, def: `GPUs, TPUs and other chips are judged by FLOP/s, memory size, memory bandwidth and power. Memory is hierarchical: CPU DRAM, then GPU HBM, then on-chip SRAM, faster and smaller at each level.`, why: `Inference is often limited by memory size and bandwidth rather than FLOP/s. Kernels like FlashAttention win by keeping data in SRAM.` },
      { term: `Model compression`, def: `<strong>Quantization</strong> (fewer bits per weight, the most popular), <strong>distillation</strong> (a smaller student) and <strong>pruning</strong> (removing weights or structure).`, why: `Smaller models fit on fewer GPUs and decode faster, because there are fewer bytes to read per token.` },
      { term: `Speculative decoding`, def: `A cheap <strong>draft model</strong> proposes K tokens. The big target model verifies them in one parallel forward pass, accepts the longest agreeing prefix, and adds one token of its own.`, why: `It uses spare compute in bandwidth-bound decoding. With acceptance rate α, each target pass yields (1 − α^(K+1)) / (1 − α) tokens on average, and the output distribution stays the same as the target model's.`, demo: `speculative` },
      { term: `Inference with reference & parallel decoding`, def: `<strong>Inference with reference</strong> copies spans from the input instead of generating them (useful when outputs repeat context, as in code edits). <strong>Parallel decoding</strong> (Lookahead, Medusa) generates several future tokens at once and verifies them.`, why: `Both break the one-token-per-pass autoregressive bottleneck.` },
      { term: `KV cache`, def: `Store the key and value vectors of previous tokens so each decode step computes K and V only for the new token. Size = <strong>2 × B × S × L × H × M</strong> (batch, sequence, layers, model dimension, bytes).`, why: `It grows linearly with context and batch size. Llama 2 13B (40 layers, d = 5,120) at batch 32 and 2,048 tokens in FP16 needs 54 GB. Fixes: local windowed attention, multi-query and grouped-query attention, cross-layer attention, PagedAttention, KV quantization.`, demo: `kvCache` },
      { term: `Batching: static, dynamic, continuous`, def: `<strong>Static</strong> waits for a full batch. <strong>Dynamic</strong> sends when the batch is full or a time window expires. <strong>Continuous</strong> (in-flight) batching returns finished requests immediately and slots in new ones each step.`, why: `Continuous batching avoids short requests waiting on long ones, which greatly improves throughput and latency.`, demo: `batching` },
      { term: `Decoupling prefill/decode, prompt caching, parallelism`, def: `Run prefill and decode on separate instances (for example 2 to 4 prefill instances per decode instance, depending on workload). <strong>Prompt caching</strong> reuses the processed state of shared prefixes (system prompts, long documents). Parallelism: replica, tensor, pipeline, context and sequence.`, why: `Prompt caching can cut cost and TTFT for long shared prefixes. Tensor parallelism reduces latency, and pipeline parallelism mostly improves throughput.` }
    ],
    cheatsheet: [
      { title: `Latency & utilization formulas`, type: `code`, body: `total latency  = TTFT + TPOT × output_tokens
throughput     = output tokens / s (all users)
goodput        = requests/s that meet the SLO (e.g. TTFT ≤ 200ms, TPOT ≤ 100ms)
MFU            = achieved FLOP/s ÷ peak FLOP/s
MBU            = (param bytes + KV bytes) × tokens/s ÷ peak bandwidth
KV cache bytes = 2 × B × S × L × H × M
Speculative:     E[tokens per target pass] = (1 − α^(K+1)) / (1 − α)` },
      { title: `Prefill vs decode`, type: `table`, headers: [`Phase`, `Work`, `Bottleneck`, `Drives`], rows: [
        [`Prefill`, `All input tokens in parallel`, `Compute (FLOP/s)`, `TTFT`],
        [`Decode`, `One token per step`, `Memory bandwidth`, `TPOT`]
      ] },
      { title: `Optimization menu`, type: `table`, headers: [`Level`, `Technique`, `Helps`], rows: [
        [`Model`, `Quantization, distillation, pruning`, `Memory, speed`],
        [`Model`, `Speculative decoding, inference with reference, parallel decoding`, `TPOT`],
        [`Model`, `KV cache, GQA/MQA, local attention, PagedAttention, FlashAttention`, `Memory, long context`],
        [`Service`, `Continuous batching`, `Throughput and latency`],
        [`Service`, `Prefill/decode disaggregation`, `TTFT vs TPOT interference`],
        [`Service`, `Prompt caching`, `Cost, TTFT`],
        [`Service`, `Tensor / pipeline / replica parallelism`, `Latency / throughput`]
      ] },
      { title: `Batching strategies`, type: `table`, headers: [`Strategy`, `Sends a batch when`, `Downside`], rows: [
        [`Static`, `The batch is full`, `Early requests wait indefinitely`],
        [`Dynamic`, `Full, or the time window expires`, `Batches may run partly empty`],
        [`Continuous`, `Every decode step; finished requests leave`, `Engineering complexity`]
      ] }
    ],
    interview: [
      { q: `Why is LLM decoding memory-bandwidth-bound?`, a: `Each decode step generates one token per sequence but must read all model weights (and the KV cache) from HBM. The arithmetic per byte read is tiny, so the GPU waits on memory rather than compute. Batching many sequences reuses each weight read for more tokens, which raises arithmetic intensity.`, diff: `med` },
      { q: `Compute the KV cache for Llama 2 13B at batch 32, 2,048 tokens, FP16.`, a: `KV = 2 × B × S × L × H × M = 2 × 32 × 2,048 × 40 × 5,120 × 2 bytes ≈ 54 GB, more than the 26 GB of weights. That's why long context and big batches are limited by KV memory, and why GQA/MQA, KV quantization and PagedAttention matter.`, diff: `med` },
      { q: `Explain continuous batching and why it helps.`, a: `Instead of fixing a batch until all its sequences finish, the scheduler works at each decode step: finished sequences leave immediately and waiting requests join. Short requests no longer wait for long ones, GPU slots don't sit idle, and throughput and tail latency both improve. vLLM and TGI popularized it.`, diff: `med` },
      { q: `How does speculative decoding speed things up without changing outputs?`, a: `A small draft model cheaply proposes K tokens. The target model scores all K in one forward pass (parallel, like prefill), accepts tokens while they agree, and samples a corrected token at the first disagreement, using rejection sampling that preserves the target distribution. Decode is bandwidth-bound, so verifying K tokens costs about the same as generating one. Speedup depends on the acceptance rate.`, diff: `hard` },
      { q: `What is goodput, and why use it instead of throughput?`, a: `Goodput is the rate of requests that meet the latency SLOs (TTFT and TPOT targets). Pushing batch size up increases raw throughput but can make many requests violate the SLO. Goodput measures useful capacity.`, diff: `med` },
      { q: `What is prompt caching?`, a: `Caching the processed attention state (KV) of a repeated prompt prefix, such as a long system prompt, a document, or the conversation so far, so later requests skip recomputing it. It reduces TTFT and cost (providers discount cached input tokens), and works best when shared content comes first in the prompt.`, diff: `easy` },
      { q: `Why separate prefill and decode onto different machines?`, a: `They compete: a long prefill stalls the decode steps of other requests (hurting TPOT), and their bottlenecks differ (compute vs bandwidth). Disaggregating them lets each pool be sized and optimized separately. The ratio of prefill to decode instances depends on input and output lengths and the latency targets.`, diff: `hard` },
      { q: `List three ways to reduce TTFT and three to reduce TPOT.`, a: `TTFT: shorter prompts, prompt caching, more prefill compute (tensor parallelism, prefill instances), a smaller or quantized model. TPOT: quantization (fewer bytes per token), speculative decoding or parallel decoding, KV cache optimizations (GQA, KV quantization), a smaller model or distillation, and keeping batch size within the SLO.`, diff: `med` }
    ],
    labs: [`batching`, `kvCache`, `speculative`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch10`, part: 4, number: 10,
    title: `AI Engineering Architecture and User Feedback`,
    overview: `Putting it all together. The book builds a production architecture in five steps: <strong>enhance context</strong>, <strong>put in guardrails</strong>, <strong>add a model router and gateway</strong>, <strong>reduce latency with caches</strong>, and <strong>add agent patterns</strong>. Then it covers <strong>monitoring and observability</strong> (metrics, logs, traces, drift), <strong>orchestration</strong>, and how to design, collect and use <strong>user feedback</strong>, including its biases and the degenerate feedback loop.`,
    concepts: [
      { term: `Step 1: Enhance context`, def: `Give the model what it needs to answer: retrieval (RAG), tools such as web search, and query rewriting.`, why: `Context construction is to foundation models what feature engineering was to classic ML.` },
      { term: `Step 2: Guardrails`, def: `<strong>Input guardrails</strong> protect against leaking private information to external APIs and against malicious prompts. <strong>Output guardrails</strong> catch failures: empty, malformatted, toxic, factually inconsistent, sensitive or brand-risky responses.`, why: `Failure handling: retry (sampling is random), make parallel calls and pick the best, or fall back to a human. Guardrails add latency, so streaming mode makes output checks harder.`, demo: `gateway` },
      { term: `Step 3: Router & gateway`, def: `A <strong>router</strong> (intent classifier, next-action predictor) sends each query to the right model or pipeline: cheap models for simple queries, specialized ones for others, or a canned answer for out-of-scope requests. A <strong>gateway</strong> gives a unified interface to many models, with access control, cost management, rate limits, logging and <strong>fallbacks</strong>.`, why: `Routing cuts cost and improves quality. A gateway centralizes keys, budgets and failover.`, demo: `gateway` },
      { term: `Step 4: Caches`, def: `<strong>Exact caching</strong> returns stored responses for identical queries (with eviction such as LRU and a TTL). <strong>Semantic caching</strong> returns a stored response when a new query's embedding is similar enough. <strong>Prompt caching</strong> is a model-level KV reuse (Chapter 9).`, why: `Semantic caching depends on a similarity threshold. Too low returns wrong answers, too high rarely hits, and the embedding lookup adds cost. Never cache user-specific or time-sensitive answers across users.`, demo: `semanticCache` },
      { term: `Step 5: Agent patterns`, def: `Loops (output feeds back into retrieval), parallel calls, and write actions (email, orders), turning the pipeline into an agentic system.`, why: `Write actions dramatically raise both capability and risk. Pair them with guardrails and human approval.` },
      { term: `Monitoring vs observability`, def: `<strong>Monitoring</strong> tracks metrics to detect problems. <strong>Observability</strong> means the system exposes enough (metrics, logs, traces) to work out <em>why</em> without shipping new code.`, why: `Track MTTD (mean time to detection), MTTR (mean time to response) and CFR (change failure rate).` },
      { term: `What to monitor`, def: `Format failures, factual consistency, toxicity, latency (TTFT, TPOT), cost and tokens per request, retrieval quality, guardrail trigger rates, user signals such as regeneration and early termination, all sliced by user, release and prompt version.`, why: `Log everything (prompts, model versions, retrieved context, outputs, latencies) and keep end-to-end traces for each request.` },
      { term: `Drift detection`, def: `Watch for system prompt changes, changes in user behavior, and <strong>underlying model changes</strong>: API providers may update models behind the same name.`, why: `Pinned evals on a schedule catch silent regressions.` },
      { term: `Orchestration`, def: `Tools (LangChain, LlamaIndex, Flowise, Haystack, etc.) that define components and chain them into pipelines.`, why: `Start without an orchestrator if you can. Evaluate integrations, support for complex pipelines, ease of use and performance before adopting one.` },
      { term: `Conversational feedback`, def: `Implicit signals in conversations: <strong>natural language feedback</strong> (early termination, error correction, complaints, sentiment) and behavioral feedback (<strong>regeneration</strong>, conversation organization such as deleting or renaming, conversation length, dialogue diversity).`, why: `It is free, plentiful and close to real satisfaction, though noisy and hard to interpret (is a long conversation engaged or stuck?).` },
      { term: `Feedback design`, def: `<strong>When</strong>: at the start (calibration), when something bad happens, and when the model has low confidence (for example, show two options and let the user pick). <strong>How</strong>: integrate it into the workflow without friction (thumbs, comparisons, edits) and explain how it's used.`, why: `Feedback is used for evaluation, development (training data) and personalization.` },
      { term: `Feedback limitations`, def: `Biases: leniency bias (users rate kindly), randomness, position bias (the first option gets picked), preference bias (longer answers). Also the <strong>degenerate feedback loop</strong>: optimizing for feedback amplifies what users already click, which can lead to sycophancy.`, why: `Treat feedback as a signal to analyze, not ground truth, and mix in evaluation that doesn't depend on it.` }
    ],
    cheatsheet: [
      { title: `The five-step architecture`, type: `table`, headers: [`Step`, `Adds`, `Why`], rows: [
        [`1. Enhance context`, `RAG, tools, query rewriting`, `Relevant knowledge for every query`],
        [`2. Guardrails`, `Input (PII, injection) and output (format, toxicity, facts)`, `Safety and reliability`],
        [`3. Router + gateway`, `Intent routing, a unified model API, fallbacks, budgets`, `Cost, quality, resilience`],
        [`4. Caches`, `Exact, semantic, prompt cache`, `Latency and cost`],
        [`5. Agent patterns`, `Loops, parallelism, write actions`, `Complex tasks`]
      ] },
      { title: `Output failure handling`, type: `list`, items: [
        `Retry: sampling is probabilistic, so a second try often succeeds (costs latency)`,
        `Parallel calls: make several calls at once and pick the best (costs money)`,
        `Fallback to a model or a human (for example, after N turns or on negative sentiment)`,
        `Stream with care: output guardrails need the full response, so balance latency against checks`
      ] },
      { title: `Feedback signals`, type: `table`, headers: [`Type`, `Examples`], rows: [
        [`Explicit`, `Thumbs up or down, stars, A/B choice, written comments`],
        [`Natural language`, `"No, I meant...", "that's wrong", stopping generation early, sentiment`],
        [`Behavioral`, `Regenerate, copy, edit, delete or rename the conversation, conversation length`]
      ], note: `Watch for leniency, position and preference biases, and degenerate feedback loops.` },
      { title: `Ops metrics`, type: `list`, items: [
        `MTTD: mean time to detection`,
        `MTTR: mean time to response`,
        `CFR: change failure rate`,
        `Per-request traces: query, rewritten query, retrieved docs, prompt version, model, tokens, latency, guardrail decisions, output, user feedback`
      ] }
    ],
    interview: [
      { q: `Design the architecture for a customer-support assistant.`, a: `Query, then input guardrails (PII redaction, injection checks), then a router (intent: FAQ, account action, out of scope, or escalate to a human), then context construction (RAG over the help center plus tools for account lookups). Next, a cache check (exact, then semantic for generic FAQs), then a model behind a gateway (fallback models, budgets, logging), then output guardrails (format, factual consistency with the retrieved docs, toxicity), with a human fallback. Write actions require confirmation. Observability covers it all (traces, metrics, drift), and user feedback (thumbs, regenerations, escalations) feeds evaluation and training data.`, diff: `hard` },
      { q: `What's the risk of semantic caching, and how do you tune it?`, a: `A similar-but-different query can get a cached answer that's wrong ("cancel my order" vs "don't cancel my order"), and personalized or time-sensitive answers can leak across users. Tune the similarity threshold on labeled pairs of queries that should and shouldn't share an answer, measuring hit rate against wrong-hit rate. Exclude user-specific or volatile intents, and use a TTL.`, diff: `med` },
      { q: `What does a model gateway give you?`, a: `One interface to many model providers, centralized access control and key management, cost tracking and budgets, rate limiting, fallbacks when a provider fails or rate-limits, and a single place to log requests and responses. It can also host guardrails and caching.`, diff: `easy` },
      { q: `Monitoring vs observability for LLM apps?`, a: `Monitoring watches known metrics (latency, cost, error and format failure rates, guardrail triggers) to detect problems. Observability means that, from the logs, traces and metrics the system emits, you can diagnose new, unforeseen issues without shipping code. For LLM apps that means logging prompts, model and prompt versions, retrieved context, outputs and user feedback per request.`, diff: `med` },
      { q: `How can user feedback mislead you?`, a: `Users are lenient, random and biased (position, length). Silent users are underrepresented. Optimizing for clicks or thumbs can create a degenerate feedback loop: the model learns to flatter (sycophancy) or show only popular content. Treat feedback as a noisy signal, analyze it in slices, and pair it with independent evaluation.`, diff: `med` },
      { q: `What are output guardrails, and what do you do when one trips?`, a: `Checks on generated responses for empty or malformatted output, toxicity, factual inconsistency, sensitive information and brand risk. When one trips: retry (perhaps with a different prompt or model), run parallel calls and choose a passing one, return a safe fallback message, or hand off to a human. Guardrails add latency and complicate streaming.`, diff: `med` },
      { q: `Why can a provider-hosted model "drift" even if you never changed anything?`, a: `Providers may update or replace the model behind the same API name, change safety layers, or change the tokenizer and system defaults. Pin model versions where possible, run scheduled regression evals on fixed prompts, and monitor production metrics for sudden shifts.`, diff: `easy` },
      { q: `When should you ask users for feedback?`, a: `At onboarding (to calibrate preferences), when something goes wrong (make reporting easy, and offer an alternative or a human), and when the model is uncertain (for example, show two candidates and let the user choose, which also gives comparison data). Keep it low-friction and part of the workflow.`, diff: `easy` }
    ],
    labs: [`gateway`, `semanticCache`]
  }
);
