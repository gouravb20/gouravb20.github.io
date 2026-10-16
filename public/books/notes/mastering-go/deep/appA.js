// Deep dive: Appendix A, The Go garbage collector. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.appA = {
  hook: `<p>A Go service runs in a container with a 1 GiB memory limit. Its live data, the objects it really needs, is about 600 MB. Most of the time it is fine. Then, during traffic bursts, the container is killed for exceeding its memory limit, even though the service never needs more than 600 MB. Nothing leaked. With default settings, the collector lets the heap grow to roughly <em>twice</em> the live data before it starts the next cycle, and twice 600 MB does not fit in 1 GiB.</p>
<p>The fix is one environment variable, <code>GOMEMLIMIT</code>, but choosing it well requires knowing how the collector decides when to run, what it costs, and what makes its job harder. This appendix explains what kind of collector Go has, how tri-color marking works while your program keeps running, how the pacer chooses when to collect, and why the shape of your data, especially pointers, matters as much as its size.</p>`,
  sections: [
    {
      id: "characteristics",
      title: "What kind of collector Go has, and why",
      kicker: "The big picture",
      blocks: [
        {
          type: "text",
          html: `<p>Garbage collection frees memory that the program can no longer reach, so you never call <code>free</code>. Collectors differ in <em>when</em> they run, whether they stop the program, and whether they move objects. Go's runtime documentation describes its collector precisely, and each word carries a design decision:</p>`,
        },
        {
          type: "table",
          headers: ["Property", "What it means for your program"],
          rows: [
            ["Concurrent", "Most collection work happens while your goroutines keep running; stop-the-world pauses are short"],
            ["Parallel", "Several GC worker threads mark at the same time on multi-core machines"],
            ["Precise (type-accurate)", "The runtime knows exactly which words are pointers, so an integer that looks like an address never keeps an object alive"],
            ["Mark and sweep, with a write barrier", "First mark everything reachable, then sweep the rest back into free lists; the barrier keeps marking correct while the program mutates pointers"],
            ["Non-generational", "No young or old generations: every cycle marks the whole live heap"],
            ["Non-compacting", "Objects never move, so pointers stay valid and interoperating with C is simpler"],
          ],
        },
        {
          type: "text",
          html: `<p>Many collectors in other runtimes are generational and moving, because most objects die young and copying survivors keeps the heap compact. Go chose differently. <strong>Escape analysis</strong> keeps many short-lived values on goroutine stacks, so they never become garbage at all, which removes much of the benefit generations would bring. Fragmentation is limited by the allocator, which hands out memory in <strong>size classes</strong> from per-processor caches, so similar-sized objects share pages and allocation rarely needs a lock. The design favours low, predictable pause times over maximum throughput, and offers few knobs: essentially two.</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>The appendix's own bullet list calls Go's collector "generational", with young and old generations. That contradicts the runtime documentation it quotes. Go's GC has no generations and never moves objects.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>The collector keeps evolving inside these properties. Go 1.25 shipped an experimental new marking implementation called Green Tea, enabled with <code>GOEXPERIMENT=greenteagc</code>, which scans memory in larger, more cache-friendly units. Check the release notes for its status in the version you use.</p>`,
        },
      ],
    },
    {
      id: "tri-color",
      title: "Tri-color marking: finding everything that is still alive",
      kicker: "The algorithm",
      blocks: [
        {
          type: "idea",
          html: `<p>Every heap object is <strong>white</strong> (not reached yet), <strong>gray</strong> (reached, but its pointers not yet scanned) or <strong>black</strong> (reached and fully scanned). Marking turns reachable objects from white to gray to black. When no gray objects remain, anything still white is unreachable and can be freed.</p>`,
        },
        {
          type: "steps",
          title: "One marking cycle",
          items: [
            "All objects start white.",
            "Shade the <strong>roots</strong> gray: everything pointed to by goroutine stacks, global variables and registers.",
            "Take any gray object, shade each white object it points to gray, then colour the object black.",
            "Repeat until the gray set is empty. Every reachable object is now black.",
            "<strong>Sweep</strong>: white objects are garbage, and their memory returns to the allocator.",
          ],
        },
        {
          type: "diagram",
          title: "Marking in progress",
          caption: "A and B were reached from the roots and scanned. C is reached but not yet scanned, so D is still white even though it is reachable; it will be shaded when C is scanned. E and F point to each other but nothing reaches them, so they stay white and are swept.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Tri-color marking with black, gray and white objects and an unreachable cluster">
<defs><marker id="goA-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="100" width="120" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="80" y="121" text-anchor="middle" font-size="12" font-weight="700">Roots</text>
<text x="80" y="139" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">stacks, globals</text>
<circle cx="220" cy="70" r="20" style="fill: var(--dg-ink); stroke: var(--dg-ink)"/>
<text x="220" y="75" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-panel)">A</text>
<circle cx="220" cy="180" r="20" style="fill: var(--dg-ink); stroke: var(--dg-ink)"/>
<text x="220" y="185" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-panel)">B</text>
<circle cx="340" cy="70" r="20" stroke-width="2" style="fill: var(--dg-line); stroke: var(--dg-muted)"/>
<text x="340" y="75" text-anchor="middle" font-size="13" font-weight="700">C</text>
<circle cx="460" cy="70" r="20" stroke-width="2" style="fill: var(--dg-panel); stroke: var(--dg-ink)"/>
<text x="460" y="75" text-anchor="middle" font-size="13" font-weight="700">D</text>
<circle cx="400" cy="170" r="20" stroke-width="2" style="fill: var(--dg-panel); stroke: var(--dg-ink)"/>
<text x="400" y="175" text-anchor="middle" font-size="13" font-weight="700">E</text>
<circle cx="520" cy="170" r="20" stroke-width="2" style="fill: var(--dg-panel); stroke: var(--dg-ink)"/>
<text x="520" y="175" text-anchor="middle" font-size="13" font-weight="700">F</text>
<line x1="140" y1="115" x2="201" y2="80" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#goA-arrow)"/>
<line x1="140" y1="135" x2="201" y2="171" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#goA-arrow)"/>
<line x1="240" y1="70" x2="318" y2="70" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#goA-arrow)"/>
<line x1="360" y1="70" x2="438" y2="70" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#goA-arrow)"/>
<line x1="420" y1="165" x2="498" y2="165" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#goA-arrow)"/>
<line x1="500" y1="177" x2="422" y2="177" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#goA-arrow)"/>
<text x="460" y="35" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">shaded when C is scanned</text>
<text x="460" y="215" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">unreachable cycle: swept</text>
<text x="20" y="248" font-size="12" style="fill: var(--dg-muted)">Black: scanned. Gray: reached, still to scan. White: not reached (garbage if still white at the end).</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The algorithm maintains one rule, the <strong>tri-color invariant</strong>: no black object may point to a white object. Black means "done, never looked at again", so a white object reachable only through a black one would be missed and wrongly freed. As long as the invariant holds, the gray set is the frontier between what is known to be live and what hasn't been examined, and an empty frontier means marking is complete.</p>
<p>Notice the cycle between E and F. Reference counting would never free it, because each keeps the other's count above zero. Tracing from the roots doesn't care about cycles: unreachable is unreachable. The idea goes back to the 1978 paper by Dijkstra, Lamport and colleagues, "On-the-Fly Garbage Collection: An Exercise in Cooperation".</p>`,
        },
        {
          type: "lab",
          id: "cAGC",
          caption: "Step through marking on a small heap like the appendix's figure, then let the mutator move a pointer behind the collector's back, with the write barrier on and off.",
        },
        {
          type: "quiz",
          q: "Marking has just finished: the gray set is empty. Object X is white, and white object Y points to X. What happens to X and Y?",
          options: [
            "Both survive, because Y points to X",
            "Both are freed: neither was reached from the roots, so the pointer between them doesn't matter",
            "X is freed and Y survives",
            "They are kept until the next cycle confirms it",
          ],
          answer: 1,
          explain: "Only reachability from the roots counts. A white object at the end of marking was never reached, and pointers among unreachable objects, including cycles, don't keep them alive.",
        },
      ],
    },
    {
      id: "write-barrier",
      title: "Collecting while the program runs: the write barrier",
      kicker: "Concurrency",
      blocks: [
        {
          type: "problem",
          html: `<p>Go marks concurrently with your goroutines, which the GC literature calls the <strong>mutator</strong> because it keeps changing pointers. Picture this: the collector has already scanned object A (black). The program then stores a pointer to white object W into A, and deletes the only other pointer to W from a gray object before the collector reaches it. Now W is reachable only through a black object the collector will never revisit. W stays white and is freed while still in use.</p>`,
        },
        {
          type: "text",
          html: `<p>The defence is a <strong>write barrier</strong>: while marking is active, every pointer write into the heap runs a few extra instructions that shade the objects involved gray, so the mutator can't hide a white object behind a black one. Since Go 1.8 the runtime uses a <em>hybrid</em> barrier that shades both the pointer being overwritten and the new pointer being written. That combination means goroutine stacks don't have to be re-scanned at the end of marking, which was the main source of long pauses in earlier versions.</p>
<p>Several other rules keep a concurrent cycle correct and bounded:</p>`,
        },
        {
          type: "list",
          items: [
            "<strong>New objects are allocated black</strong> during marking, so objects created mid-cycle are never freed by that cycle.",
            "<strong>Floating garbage</strong>: an object that becomes unreachable after it was shaded survives this cycle and is freed by the next. Unreachable objects can never become reachable again, so the delay is safe; it costs some memory.",
            "<strong>Mark assists</strong>: a goroutine that allocates quickly while marking is in progress is made to do some marking work in proportion to what it allocates, so allocation can't outrun the collector.",
            "<strong>Background workers</strong> aim to use about a quarter of the available CPU during marking, which is the main CPU cost of a cycle.",
            "<strong>Short stop-the-world phases</strong> remain at the start of marking (to enable the barrier) and at mark termination. Sweeping happens afterwards, incrementally, in the background and when goroutines allocate.",
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p><code>runtime.GC()</code> runs a complete collection and blocks the caller until it finishes; it may also block the whole program. It is useful in tests and benchmarks that need a known starting point, like the appendix's examples. In production code, forcing collections usually costs throughput and latency for no benefit, because the pacer already decides when a cycle is worthwhile.</p>`,
        },
        {
          type: "quiz",
          q: "Why does a concurrent collector need a write barrier, when a stop-the-world collector doesn't?",
          options: [
            "To make pointer writes atomic on multi-core machines",
            "Because the running program can store a pointer to a white object into an already-scanned black object; without the barrier that object would be freed while still in use",
            "To compact the heap while the program runs",
            "To count references for each object",
          ],
          answer: 1,
          explain: "A stop-the-world collector sees a frozen heap. A concurrent one must cope with the mutator rearranging pointers mid-mark, and the barrier preserves the no-black-to-white invariant by shading objects on pointer writes.",
        },
      ],
    },
    {
      id: "pacing",
      title: "When the GC runs: GOGC, GOMEMLIMIT and the pacer",
      kicker: "The two knobs",
      blocks: [
        {
          type: "text",
          html: `<p>The collector doesn't run on a timer. It runs when the heap reaches a <strong>goal</strong> computed at the end of the previous cycle. With <code>GOGC</code> (default 100), the goal is roughly <span class="formula">live heap &times; (1 + GOGC/100)</span>: with the default, a new cycle starts when the heap has grown to about twice what was live after the last one. (Since Go 1.18 the runtime also counts goroutine stacks and globals in this calculation, which the simple formula leaves out.)</p>
<p>That makes <code>GOGC</code> a straight trade between CPU and memory. <code>GOGC=200</code> lets the heap grow to about three times the live heap, so cycles happen less often and cost less CPU overall, at the price of more memory. <code>GOGC=50</code> collects at one and a half times, using less memory and more CPU. <code>GOGC=off</code> disables collection entirely.</p>`,
        },
        {
          type: "text",
          html: `<h3>GOMEMLIMIT: a ceiling, not a target</h3>
<p><code>GOGC</code> alone can't express "never use more than 900 MB", which is what the container in the opening story needed. Go 1.19 added <code>GOMEMLIMIT</code>, a <strong>soft memory limit</strong> on all memory the Go runtime manages (heap, stacks and runtime metadata, but not memory allocated by C code). As total memory approaches the limit, the GC runs more often regardless of <code>GOGC</code>. Values accept units such as <code>900MiB</code> or <code>2GiB</code>. Setting <code>GOGC=off</code> together with a limit means "collect only when nearing the limit", which suits programs that own a container's memory.</p>`,
        },
        {
          type: "code",
          lang: "sh",
          code: `GOGC=200 ./server                     # fewer cycles, more memory
GOMEMLIMIT=900MiB ./server            # GC works harder near 900 MiB
GOGC=off GOMEMLIMIT=900MiB ./server   # collect only near the limit`,
        },
        {
          type: "code",
          lang: "go",
          code: `import "runtime/debug"

func configureGC() {
	debug.SetGCPercent(200)        // same as GOGC=200; returns the old value
	debug.SetMemoryLimit(900 << 20) // same as GOMEMLIMIT=900MiB
}`,
        },
        {
          type: "lab",
          id: "cAPacer",
          caption: "Set the live heap, the allocation rate and GOGC, and watch the heap sawtooth, the number of cycles and the gctrace lines. Add a GOMEMLIMIT, then set it too low to see the GC run back to back.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>A memory limit below what the program actually needs live makes the GC run almost continuously. The runtime caps the CPU it gives the collector in that situation (at roughly half, over a time window) to avoid a total death spiral, but the program will be slow and may still run out of memory. Leave headroom above the live heap, and keep the limit somewhat below the container's hard limit so non-Go memory fits too.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Twitch", title: "The memory ballast", html: "In a 2019 engineering post, Twitch described allocating a large, never-touched byte slice (a \"ballast\") to inflate the live heap so the GOGC-based goal grew and collections happened less often. <code>GOMEMLIMIT</code> now covers that use case directly." },
            { org: "Kubernetes deployments", title: "Matching the container limit", html: "A common practice is to set <code>GOMEMLIMIT</code> from the pod's memory limit, either through the Downward API or a small library that reads the cgroup limit at startup. The runtime doesn't do this on its own; Go 1.25 made <code>GOMAXPROCS</code> respect container CPU limits, but the memory limit is still yours to set." },
          ],
        },
        {
          type: "quiz",
          q: "After a cycle, the live heap is 400 MB. With GOGC=50 and no memory limit, roughly when does the next cycle start?",
          options: [
            "When the heap reaches about 450 MB",
            "When the heap reaches about 600 MB",
            "When the heap reaches about 800 MB",
            "After two minutes, regardless of heap size",
          ],
          answer: 1,
          explain: "The goal is live heap times (1 + GOGC/100) = 400 MB times 1.5 = about 600 MB (a little more once stacks and globals are counted). GOGC=100 would give about 800 MB. The runtime does force a cycle if none has run for two minutes, but that is a backstop, not the pacing rule.",
        },
      ],
    },
    {
      id: "observing",
      title: "Watching the collector work",
      kicker: "Observability",
      blocks: [
        {
          type: "text",
          html: `<p>The appendix observes the GC with <code>runtime.ReadMemStats</code>. The fields to know: <code>HeapAlloc</code> (the same as <code>Alloc</code>) is bytes of heap objects currently allocated, live or not yet swept. <code>TotalAlloc</code> is the cumulative total ever allocated and never decreases. <code>NumGC</code> counts completed cycles, and <code>PauseTotalNs</code> sums stop-the-world pause time. <code>ReadMemStats</code> itself stops the world briefly, so call it for diagnostics, not in a hot loop; <code>runtime/metrics</code> (covered in Chapter 13) is the cheaper option for continuous monitoring.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func printMem(label string) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	fmt.Printf("%-10s HeapAlloc=%4d MiB  TotalAlloc=%5d MiB  NumGC=%d\\n",
		label, m.HeapAlloc>>20, m.TotalAlloc>>20, m.NumGC)
}

func main() {
	printMem("start")
	for i := range 8 {
		b := make([]byte, 64<<20) // garbage as soon as the next iteration starts
		b[0] = 1
		printMem(fmt.Sprintf("round %d", i))
	}
}`,
          caption: "TotalAlloc climbs by 64 MiB every round, while HeapAlloc stays near the size of one or two buffers and NumGC rises: garbage is being reclaimed continuously. The appendix's gColl.go shows the same pattern.",
        },
        {
          type: "text",
          html: `<h3>Reading gctrace</h3>
<p>Running with <code>GODEBUG=gctrace=1</code> prints one line per cycle to standard error. The fields that matter most are the cycle number, the time since the program started, the percentage of CPU spent in GC so far, then three heap sizes written <code>A-&gt;B-&gt;C MB</code>: the heap when the cycle started, when it ended, and the <strong>live heap</strong> found by marking. After that comes the goal for the next cycle and the number of Ps.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "The shape of a gctrace line",
          code: `gc <cycle> @<seconds>s <cpu%>: <phase times> ms clock, ... ms cpu, <start>-><end>-><live> MB, <goal> MB goal, ..., <P> P`,
        },
        {
          type: "keypoints",
          items: [
            "A <strong>live</strong> figure that keeps rising from cycle to cycle is the signature of a leak: something is holding on to data.",
            "A high and rising <strong>cycle count</strong> with a small live heap means the program allocates a lot of short-lived garbage; reduce allocations before tuning GOGC.",
            "A <strong>goal</strong> close to your container limit tells you it is time for <code>GOMEMLIMIT</code> or a smaller live heap.",
          ],
        },
      ],
    },
    {
      id: "pointers",
      title: "Data shape matters: pointers make the GC work harder",
      kicker: "Designing for the collector",
      blocks: [
        {
          type: "problem",
          html: `<p>Two programs hold the same number of entries in memory. One spends a little time in GC; the other spends many times more, with GC worker threads keeping extra cores busy. The difference is not the amount of data but how many pointers the collector has to follow to mark it.</p>`,
        },
        {
          type: "text",
          html: `<p>Marking cost is driven by how much memory might contain pointers and how many objects those pointers lead to. Because the collector is precise, the runtime knows which allocations contain no pointers at all and puts them in <strong>noscan</strong> spans: the marker notes that such an object is live but never looks inside it. A slice of structs made only of numbers, or a <code>map[int]int</code>, is cheap to mark however large it is.</p>
<p>A <code>map[int]*int</code> is the opposite. Every value is a separate heap object, and every map slot holds a pointer that must be followed and marked on every cycle. The appendix stores 80 million entries four ways and times them. In the book's measurements, the slice took about 1.2 s, <code>map[int]int</code> about 10.7 s, a sharded map of maps about 11.6 s, and <code>map[int]*int</code> about 14.1 s with CPU use above 100% from parallel GC workers. Maps are slower than slices because of hashing and scattered buckets; pointers add GC work on top.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type entry struct{ key, value int64 }

var (
	flat  []entry          // one noscan allocation: marked in O(1)
	plain map[int64]int64  // buckets contain no pointers: noscan
	boxed map[int64]*int64 // one heap object per value, all traced every cycle
)`,
        },
        {
          type: "lab",
          id: "cAMaps",
          caption: "Pick a structure and a size to see how many heap objects it creates, how much memory may contain pointers, and how many pointers the GC follows per cycle, next to the book's measured times.",
        },
        {
          type: "text",
          html: `<p>Practical consequences for large, long-lived data: prefer values over pointers when the values are small, store indexes into a slice instead of pointers between objects, and keep huge caches in pointer-free layouts (byte slices, arrays of numeric structs). Strings contain a pointer too, so a map with string keys is not noscan.</p>
<p>Experiments like the appendix's also need <code>runtime.KeepAlive(x)</code> or a later use such as <code>_ = data[0]</code>. Liveness is tracked precisely: a variable that is never used again may be collected before the function returns, and then the experiment measures nothing.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Discord", title: "A cautionary case study", html: "Discord's 2020 post on rewriting one service from Go in Rust attributed latency spikes to garbage collection over a very large in-memory cache, made worse by the runtime forcing a collection at least every two minutes. The service held millions of long-lived entries, exactly the pointer-heavy, mostly-unchanging heap that makes every full marking cycle expensive. The Go runtime has improved since then, but the lesson about data shape still applies." },
          ],
        },
        {
          type: "quiz",
          q: "Why was map[int]*int so much slower than map[int]int in the appendix's 80-million-entry benchmark?",
          options: [
            "Pointers are 16 bytes, so the map uses twice the memory",
            "Each value is a separate heap object and each slot holds a pointer, so every GC cycle must trace 80 million extra pointers; map[int]int's buckets are pointer-free and are never scanned",
            "Go maps can't store pointers efficiently because of hashing",
            "The compiler disables inlining for pointer maps",
          ],
          answer: 1,
          explain: "Taking the address of each value makes it escape to the heap, and the collector must follow every pointer on every cycle. A map of plain integers lives in noscan memory the marker skips.",
        },
      ],
    },
    {
      id: "interview",
      title: "Explaining the Go GC in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>A GC question is a chance to show depth quickly. Start with a one-sentence description, explain the algorithm and the invariant, then move to what you would actually tune or change in a real service.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>One breath</strong>: a concurrent, parallel, precise, tri-color mark-and-sweep collector with a hybrid write barrier; non-generational and non-compacting, relying on escape analysis and a size-class allocator.</li>
<li><strong>Tri-color</strong>: white, gray, black; roots start gray; the invariant is that no black object points to a white one; white at the end is garbage.</li>
<li><strong>Write barrier</strong>: needed because the mutator moves pointers during marking; new objects are allocated black; floating garbage waits one cycle.</li>
<li><strong>Tuning</strong>: GOGC trades CPU for memory via the heap goal; GOMEMLIMIT is a soft ceiling; leave headroom.</li>
<li><strong>Diagnosing</strong>: gctrace's live heap and goal, <code>MemStats.HeapAlloc</code> vs <code>TotalAlloc</code>, runtime/metrics.</li>
<li><strong>Design</strong>: fewer allocations and fewer pointers beat any knob; don't call <code>runtime.GC()</code> in production.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks: \"Is Go's garbage collector generational?\" Which answer is accurate?",
          options: [
            "Yes, with a young and an old generation, like most JVM collectors",
            "No. It marks the whole live heap each cycle and never moves objects; escape analysis keeps many short-lived values off the heap instead",
            "Yes, but only when GOGC is above 100",
            "No, because Go uses reference counting",
          ],
          answer: 1,
          explain: "Go's collector is non-generational and non-compacting by design. Generational collection usually relies on moving objects, and Go gets much of the same benefit by allocating short-lived values on the stack.",
        },
      ],
    },
  ],
  takeaways: [
    "Go's GC is concurrent, parallel, precise, tri-color mark-and-sweep with a write barrier; it is neither generational nor compacting.",
    "Marking shades roots gray, scans gray objects into black, and frees whatever is still white; no black object may point to a white one.",
    "The hybrid write barrier, black allocation and mark assists keep concurrent marking correct and bounded; floating garbage waits one cycle.",
    "<code>GOGC</code> sets the heap goal at about live &times; (1 + GOGC/100), trading CPU for memory; <code>GOMEMLIMIT</code> (Go 1.19+) is a soft ceiling.",
    "Watch the live heap and goal in <code>GODEBUG=gctrace=1</code>; <code>HeapAlloc</code> is current, <code>TotalAlloc</code> only grows.",
    "Pointer-free data lives in noscan memory the marker skips; pointer-heavy structures such as <code>map[int]*int</code> multiply GC work.",
    "Reduce allocations and pointers before reaching for knobs, and leave <code>runtime.GC()</code> to tests and benchmarks.",
  ],
  furtherReading: [
    { title: "A Guide to the Go Garbage Collector", url: "https://go.dev/doc/gc-guide", note: "The official guide to GOGC, GOMEMLIMIT, the cost model and optimisation." },
    { title: "Getting to Go: The Journey of Go's Garbage Collector (the Go blog)", url: "https://go.dev/blog/ismmkeynote", note: "Why the Go team chose a non-moving, non-generational design." },
    { title: "runtime package documentation", url: "https://pkg.go.dev/runtime", note: "MemStats fields, GODEBUG options such as gctrace, KeepAlive and GC." },
    { title: "On-the-Fly Garbage Collection: An Exercise in Cooperation (Dijkstra, Lamport et al., 1978)", note: "The paper that introduced tri-color concurrent marking." },
  ],
};
