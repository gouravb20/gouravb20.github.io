// Deep dive: Chapter 14, Efficiency and performance. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch14 = {
  hook: `<p>A pull request says "2x faster parsing" and shows one benchmark run before and one after. A reviewer reruns both ten times and feeds them to <code>benchstat</code>: the difference is inside the noise. Meanwhile, the real problem on that service is memory. After every traffic spike, resident memory climbs and never comes back down, although the cache map is emptied with <code>delete</code> each night. Nobody has measured that.</p>
<p>Performance work goes wrong in two predictable ways: measuring badly, and not knowing where memory actually lives. This chapter fixes both. It shows how Go benchmarks work and how they lie, how to cut allocations once a benchmark proves they matter, how the compiler decides between stack and heap, how a garbage-collected program can still leak, and, at the end, how eBPF lets you look below your program into the kernel.</p>`,
  sections: [
    {
      id: "benchmarks",
      title: "How Go benchmarks work",
      kicker: "Measure, don't guess",
      blocks: [
        {
          type: "text",
          html: `<p>A benchmark is a function <code>BenchmarkXxx(b *testing.B)</code> in a <code>_test.go</code> file. Classic benchmarks run the code under test inside <code>for i := 0; i &lt; b.N; i++</code>. You run them with <code>go test -bench=regexp</code>; without <code>-bench</code>, no benchmarks run at all. <code>-benchmem</code> (or <code>b.ReportAllocs()</code> inside the function) adds bytes and allocations per operation.</p>
<p>You never choose <code>b.N</code>. The framework first runs your function with <code>b.N = 1</code>, measures it, predicts how many iterations would fill the target time (<code>-benchtime</code>, one second by default), and runs again with a larger <code>b.N</code>, repeating until a run is long enough. The book describes the older 1, 2, 5, 10, 20, 50 progression; current Go predicts the next value from the measured time per operation, with a cap on how fast it grows. Fast functions end up running millions of times, slow ones a handful, and the reported ns/op is total time divided by the final <code>b.N</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var sink string

func BenchmarkJoin(b *testing.B) {
	parts := make([]string, 100)
	for i := range parts {
		parts[i] = strconv.Itoa(i)
	}
	b.ReportAllocs()
	b.ResetTimer() // don't count the setup above
	for i := 0; i < b.N; i++ {
		sink = strings.Join(parts, ",")
	}
}`,
        },
        {
          type: "code",
          lang: "text",
          title: "Reading the output",
          code: `$ go test -bench=Join -benchmem
BenchmarkJoin-8   <iterations>   <ns/op>   320 B/op   1 allocs/op`,
          caption: "The -8 suffix is GOMAXPROCS. Then come the final b.N, the average time per operation, and with -benchmem the bytes and allocations per operation. strings.Join builds its result with a single allocation, here rounded up to the 320-byte size class.",
        },
        {
          type: "lab",
          id: "c14BenchN",
          caption: "Watch the framework ramp b.N for a correct benchmark, for the book's slice initializers with -benchmem, and for Fibonacci benchmarks whose work grows with i or b.N and never converges.",
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Go 1.24 added <code>for b.Loop() { ... }</code> as the preferred benchmark loop. The function body runs once, setup before the loop is excluded from timing automatically, and the compiler keeps the loop body's calls alive, so you no longer need <code>ResetTimer</code> or a package-level sink for the common case.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func BenchmarkJoinLoop(b *testing.B) { // Go 1.24+
	parts := makeParts(100)
	for b.Loop() {
		strings.Join(parts, ",")
	}
}`,
        },
      ],
    },
    {
      id: "benchmark-pitfalls",
      title: "How benchmarks lie, and how benchstat keeps them honest",
      kicker: "Pitfalls",
      blocks: [
        {
          type: "problem",
          html: `<p>A benchmark can report numbers that are precise, repeatable and meaningless. The three classic causes are work that changes with <code>b.N</code>, work the compiler deletes, and a machine that is busy doing something else.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Work that grows with the loop.</strong> If each iteration's cost depends on <code>i</code> or <code>b.N</code>, as in <code>fib(i)</code> inside the loop, every larger <code>b.N</code> makes each operation more expensive, ns/op never settles, and the benchmark can run for a very long time. Benchmark a fixed input such as <code>fib(20)</code>, and use sub-benchmarks for several sizes. The book points out its Fibonacci examples are wrong on purpose; note that its slice-initialisation benchmarks also pass <code>i</code> as the size, which has the same flaw in milder form.</p>
<p><strong>Work the compiler removes.</strong> If a result is never used and the call has no side effects, the compiler may inline it and delete it, and you measure an empty loop at a fraction of a nanosecond. Assign results to a package-level variable, or use <code>b.Loop</code>. <strong>Setup inside the timed region</strong> inflates the number; do it before the loop, or bracket it with <code>b.StopTimer()</code> and <code>b.StartTimer()</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var sinkInt int

func BenchmarkFibWrong(b *testing.B) {
	for i := 0; i < b.N; i++ {
		fib(i) // cost grows with i, and the result is unused
	}
}

func BenchmarkFib20(b *testing.B) {
	for i := 0; i < b.N; i++ {
		sinkInt = fib(20) // fixed work, result kept alive
	}
}`,
        },
        {
          type: "text",
          html: `<p><strong>Noise.</strong> Benchmarks share the CPU with your browser, your editor and the OS. Run them on an idle machine, and never compare single runs. Run each version several times with <code>-count</code> and compare them with <code>benchstat</code> (<code>golang.org/x/perf/cmd/benchstat</code>), which reports the median, a confidence interval, the percentage change and whether the difference is statistically significant. A <code>~</code> in its output means "no significant difference". It needs enough samples to say anything, which is why <code>-count=10</code> is a common choice.</p>`,
        },
        {
          type: "code",
          lang: "sh",
          code: `go test -bench=Parse -count=10 > old.txt
# change the code
go test -bench=Parse -count=10 > new.txt
benchstat old.txt new.txt`,
        },
        {
          type: "quiz",
          q: "A benchmark of a small pure function reports 0.3 ns/op, faster than a single memory access. What is the most likely explanation?",
          options: [
            "The function is extremely well optimised",
            "The compiler inlined the call and removed it because its result was never used",
            "b.N was too small",
            "-benchmem was missing",
          ],
          answer: 1,
          explain: "Times far below a nanosecond usually mean the loop body is empty after optimisation. Keep the result alive with a package-level sink, or use b.Loop in Go 1.24+.",
        },
      ],
    },
    {
      id: "allocations",
      title: "Cutting allocations once a benchmark says they matter",
      kicker: "Optimisation",
      blocks: [
        {
          type: "text",
          html: `<p>Allocation counts explain many speed differences. Each heap allocation costs allocator time now and garbage-collector work later. The book's first example compares filling a slice created with its final length against growing one with <code>append</code>: the appending version is slower because every time it runs out of capacity it allocates a larger array and copies everything over. When you know or can estimate the size, say so up front.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `out := make([]Result, 0, len(in)) // one allocation
for _, x := range in {
	out = append(out, convert(x))
}

counts := make(map[string]int, len(words)) // fewer rehashes while filling`,
        },
        {
          type: "text",
          html: `<h3>Reusing a buffer</h3>
<p>The book's second example writes messages through a helper that creates a new <code>bytes.Buffer</code> on every call. Passing a buffer <em>by value</em> doesn't help, because the struct is copied and the copy's storage is allocated again. Passing a <strong>pointer</strong> drops allocations to zero, but the buffer keeps growing with every message. Adding <code>buf.Reset()</code>, which sets the length to zero but keeps the underlying byte slice, makes the memory genuinely reused: no allocations, no growth, and in the book a several-fold speed-up.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func writeLine(w io.Writer, buf *bytes.Buffer, name string, n int) error {
	buf.Reset() // keep the capacity, drop the contents
	buf.WriteString(name)
	buf.WriteString(" has ")
	buf.WriteString(strconv.Itoa(n))
	buf.WriteString(" items\\n")
	_, err := w.Write(buf.Bytes())
	return err
}

var bufPool = sync.Pool{New: func() any { return new(bytes.Buffer) }}

func handle(w http.ResponseWriter, r *http.Request) {
	buf := bufPool.Get().(*bytes.Buffer)
	defer bufPool.Put(buf)
	writeLine(w, buf, r.URL.Path, 3)
}`,
          caption: "When one owner can't hold the buffer, sync.Pool shares reusable objects between goroutines. The pool may drop objects at any garbage collection, so it is a cache, never storage.",
        },
        {
          type: "text",
          html: `<h3>One benchmark, many sizes</h3>
<p><code>b.Run(name, func(b *testing.B) {...})</code> creates named sub-benchmarks, so a table of parameters replaces a pile of near-identical functions. The book uses it to compare buffer sizes for file I/O, and the result is striking: reading a file one byte at a time is orders of magnitude slower than using even a modest buffer, because every read is a system call.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func BenchmarkCopyBuffer(b *testing.B) {
	data := bytes.Repeat([]byte("x"), 1<<20)
	for _, size := range []int{1, 64, 4096, 65536} {
		b.Run(fmt.Sprintf("buf=%d", size), func(b *testing.B) {
			buf := make([]byte, size)
			b.SetBytes(int64(len(data)))
			for i := 0; i < b.N; i++ {
				src := struct{ io.Reader }{bytes.NewReader(data)}
				dst := struct{ io.Writer }{io.Discard}
				io.CopyBuffer(dst, src, buf)
			}
		})
	}
}`,
          caption: "The anonymous struct wrappers hide WriterTo and ReaderFrom, which io.CopyBuffer would otherwise use instead of your buffer. SetBytes makes the output include throughput in MB/s.",
        },
        {
          type: "quiz",
          q: "A helper takes a bytes.Buffer by value, appends a message, and writes it out. Benchmarks show it allocates on every call. Which change removes the allocations without the buffer growing forever?",
          options: [
            "Pass the buffer by value but call Reset first",
            "Pass a *bytes.Buffer and call Reset at the start of each call",
            "Pass a *bytes.Buffer and never reset it",
            "Create a new buffer with make([]byte, 0) each time",
          ],
          answer: 1,
          explain: "By value, the struct is copied and its storage reallocated. A pointer shares one buffer, and Reset sets its length to zero while keeping the capacity, so the same memory is reused for every message.",
        },
      ],
    },
    {
      id: "stack-heap",
      title: "Stack or heap: escape analysis",
      kicker: "Where memory lives",
      blocks: [
        {
          type: "text",
          html: `<p>Every goroutine has its own <strong>stack</strong>, which starts small and grows as needed. Locals whose lifetime the compiler can prove ends with the function live there; allocating them is nearly free and they vanish when the function returns, creating no garbage. The <strong>heap</strong> is shared by all goroutines and is what the garbage collector manages. Unlike C++, Go doesn't let you choose: <code>new</code> and <code>make</code> don't decide placement, the compiler does. That is why returning a pointer to a local variable is perfectly safe in Go.</p>`,
        },
        {
          type: "diagram",
          title: "A value escapes when it outlives its function",
          caption: "sum's copy of p dies with its stack frame. newPoint returns a pointer to its local, so the compiler moves that value to the heap, where only the GC can free it.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="A goroutine stack with two frames and a heap object referenced from the stack">
<defs><marker id="go14-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="120" y="28" text-anchor="middle" font-size="12" font-weight="700">Goroutine stack</text>
<rect x="20" y="40" width="200" height="160" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="30" y="58" width="180" height="40" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="120" y="83" text-anchor="middle" font-size="12">main: q := newPoint(1, 2)</text>
<rect x="30" y="110" width="180" height="40" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="120" y="135" text-anchor="middle" font-size="12">sum(p): p is a local copy</text>
<text x="120" y="176" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">popped on return</text>
<text x="490" y="28" text-anchor="middle" font-size="12" font-weight="700">Heap (GC-managed)</text>
<rect x="360" y="40" width="260" height="160" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="400" y="62" width="180" height="40" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="490" y="87" text-anchor="middle" font-size="12">point{x: 1, y: 2}</text>
<text x="490" y="128" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">freed only by the GC,</text>
<text x="490" y="146" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">once nothing points to it</text>
<line x1="210" y1="78" x2="398" y2="82" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go14-arrow)"/>
<text x="304" y="70" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">*point</text>
<text x="20" y="222" font-size="12" style="fill: var(--dg-muted)">Stack frames vanish on return at no cost; heap objects wait for the GC.</text>
</svg>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type point struct{ x, y int }

func sum(p point) int { return p.x + p.y } // p stays on the stack

func newPoint(x, y int) *point {
	p := point{x, y}
	return &p // "moved to heap: p": it outlives the call
}

func counter() func() int {
	n := 0
	return func() int { n++; return n } // n is captured by an escaping closure
}

func show(n int) {
	fmt.Println(n) // n is converted to an interface for Println and escapes
}`,
        },
        {
          type: "text",
          html: `<p>Ask the compiler with <code>go build -gcflags='-m'</code>. It prints decisions such as <em>can inline</em>, <em>moved to heap: p</em>, <em>... escapes to heap</em>, <em>does not escape</em> and <em>leaking param: s to result</em>. <code>-m -m</code> explains the reasoning, and <code>-l</code> disables inlining, which changes the answers because inlining often lets a value stay on the caller's stack. Values typically escape when they are returned by pointer, stored in a global or in another heap object, captured by a closure that outlives the function, too large for the stack, or passed as an interface to code the compiler can't see through, such as <code>fmt.Println</code>.</p>`,
        },
        {
          type: "lab",
          id: "c14Escape",
          caption: "For each snippet, predict what go build -gcflags '-m' reports, then check the compiler's message. Several snippets come from the book's examples.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Escaping is not a bug. Go chose a non-moving, non-generational collector and relies on escape analysis to keep short-lived values off the heap instead. Use <code>-m</code> on hot paths that a profile has flagged, not on every function.</p>`,
        },
        {
          type: "quiz",
          q: "Which of these values is guaranteed to stay on the stack, according to the compiler's usual escape rules?",
          options: [
            "A local struct whose address is returned to the caller",
            "A local int captured and modified by a closure that the function returns",
            "A local struct passed by value to a small function that only reads its fields",
            "A local int passed to fmt.Println",
          ],
          answer: 2,
          explain: "Passing a copy to a function that only reads it lets the value die with the frame. Returned addresses, captured variables of escaping closures and interface conversions for fmt.Println all make the value outlive the frame, so it moves to the heap.",
        },
      ],
    },
    {
      id: "leaks",
      title: "Memory leaks in a garbage-collected language",
      kicker: "Reachable but useless",
      blocks: [
        {
          type: "problem",
          html: `<p>The garbage collector frees objects nothing can reach. It can't free objects that are still reachable but that you no longer need. In Go, a "memory leak" almost always means a reference that lives longer than the data deserves.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>Subslices.</strong> <code>s[:3]</code> is a new slice header pointing into the <em>same</em> backing array. Keep the three-element result, and the whole array stays alive: in the book, three ints pin a million-int, 8 MB array. <code>-gcflags='-m -l'</code> flags it as <em>leaking param: s to result</em>. Copy what you keep with <code>slices.Clone</code> (Go 1.21+) or <code>make</code> plus <code>copy</code>. Substrings behave the same way, and <code>strings.Clone</code> is the fix. A related trap: removing elements from the front of a slice of pointers leaves the old pointers in the array, still reachable, unless you set them to nil.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func firstThree(all []int) []int {
	return all[:3] // pins the whole backing array
}

func firstThreeCopy(all []int) []int {
	return slices.Clone(all[:3]) // the big array can now be freed
}

func token(line string, i, j int) string {
	return strings.Clone(line[i:j]) // don't keep the whole line alive
}`,
        },
        {
          type: "text",
          html: `<p><strong>Maps don't shrink.</strong> Deleting keys frees the values' memory only if nothing else refers to them, and the map keeps all the buckets it grew. In the book, a two-million-entry <code>map[int][128]byte</code> still held hundreds of megabytes after every key was deleted and a GC ran; only setting the map to <code>nil</code> released it. The built-in <code>clear(m)</code> empties a map but also keeps its buckets. A long-lived cache that once absorbed a burst holds that memory until you <strong>rebuild</strong> it by copying the surviving entries into a new map. Storing pointers or smaller values reduces how much the empty buckets cost.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func compact(m map[string]*Session) map[string]*Session {
	fresh := make(map[string]*Session, len(m))
	for k, v := range m {
		fresh[k] = v
	}
	return fresh // the old map becomes garbage
}`,
        },
        {
          type: "lab",
          id: "c14Leaks",
          caption: "See how a 3-element subslice keeps an 8 MB array alive until you copy it, and how a map keeps its buckets after every key is deleted until you set it to nil or rebuild it.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Goroutines leak too. Starting one goroutine per URL that sends its result on an <em>unbuffered</em> channel, then returning after the first answer, leaves every other goroutine blocked on its send forever, along with everything it references. Give the channel a buffer of <code>len(urls)</code>, or cancel the losers with a context. A steadily climbing goroutine count in your metrics is the tell-tale sign.</p>`,
        },
      ],
    },
    {
      id: "ebpf",
      title: "Looking below the program: eBPF",
      kicker: "Kernel-level observability",
      blocks: [
        {
          type: "text",
          html: `<p>Profilers see your process. Some questions are about the system around it: which processes call a particular system call, how long disk I/O takes, where packets are dropped. <strong>eBPF</strong> (extended Berkeley Packet Filter) answers them. It is a small, sandboxed virtual machine inside the Linux kernel that runs programs you load from user space, attached to hooks such as kprobes (kernel functions), uprobes (functions in user-space binaries and libraries), tracepoints and network events.</p>
<p>Before a program is allowed to run, the kernel's <strong>verifier</strong> checks that it terminates and only touches memory it is allowed to, which is what makes eBPF safe enough for production. Programs share data with user space through maps, such as a hash map from user ID to call count, and the user-space side reads and prints them.</p>`,
        },
        {
          type: "text",
          html: `<p>The book's <code>uid.go</code> uses <code>github.com/iovisor/gobpf/bcc</code> to attach a uprobe to the C library's <code>getuid</code> function and count calls per user ID in a <code>BPF_HASH</code>. That library wraps BCC, which compiles C at run time and needs cgo. The pure-Go <code>github.com/cilium/ebpf</code> library is a widely used alternative for loading and managing eBPF programs from Go. The book's advice is sound: try existing tools such as <code>bpftrace</code> and the BCC tool collection first, and write your own program only when they can't answer your question.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Cilium", title: "Networking on eBPF", html: "Cilium, a Kubernetes networking and security project written largely in Go, implements its data path in eBPF and maintains the <code>cilium/ebpf</code> library." },
            { org: "Parca", title: "Continuous profiling", html: "The Parca Agent uses eBPF to sample stacks across every process on a host with low overhead, turning profiling into an always-on service rather than a one-off investigation." },
          ],
        },
        {
          type: "tradeoffs",
          pros: [
            "Production-safe, low-overhead visibility without kernel modules or restarts",
            "Sees every process and the kernel, not just your program",
          ],
          cons: [
            "Linux only, and features depend on the kernel version",
            "Needs elevated privileges to load programs",
            "A steep learning curve compared with pprof and metrics",
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Performance questions in interviews",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Performance questions reward method more than tricks. Interviewers want to hear that you measure first, that you know how measurements mislead, and that you can explain where memory lives and why it is or isn't freed.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>b.N</strong>: chosen by the framework, grown until a run fills <code>-benchtime</code>; ns/op is total time over the final b.N.</li>
<li><strong>Broken benchmarks</strong>: work that depends on i or b.N, results the compiler can delete, setup inside the timer, a noisy machine.</li>
<li><strong>benchstat</strong>: several runs with <code>-count</code>, medians, confidence intervals and a significance test.</li>
<li><strong>Allocations</strong>: pre-size slices and maps, reuse buffers through pointers with <code>Reset</code>, pool short-lived objects.</li>
<li><strong>Escape analysis</strong>: the compiler places values; <code>-gcflags='-m'</code> shows why something moved to the heap.</li>
<li><strong>Leaks</strong>: subslices pinning big arrays, maps that keep their buckets, goroutines blocked forever.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "A service's cache map held 5 million entries during a spike. Every entry has since been deleted, yet memory stays high after several GCs. What is the best fix?",
          options: [
            "Call runtime.GC() in a loop",
            "Call clear(m) to release the buckets",
            "Replace the map with a new one (copy any live entries) so the old map and its buckets become garbage",
            "Increase GOGC",
          ],
          answer: 2,
          explain: "Maps keep the buckets they grew, and clear keeps them too. Only dropping the old map, by rebuilding it or setting it to nil, lets the GC reclaim that memory.",
        },
      ],
    },
  ],
  takeaways: [
    "Benchmarks are <code>BenchmarkXxx(b *testing.B)</code>; the framework grows <code>b.N</code> until a run fills <code>-benchtime</code>, and <code>-benchmem</code> shows B/op and allocs/op.",
    "Keep per-iteration work fixed, keep results alive (or use Go 1.24's <code>b.Loop</code>), exclude setup, and run on an idle machine.",
    "Compare versions with several runs and <code>benchstat</code>; a single before-and-after pair proves nothing.",
    "Pre-size slices and maps, and reuse buffers through a pointer with <code>Reset()</code> or a <code>sync.Pool</code>.",
    "The compiler, not <code>new</code> or <code>make</code>, decides stack or heap; <code>-gcflags='-m'</code> shows what escapes and why.",
    "GC languages leak through reachability: subslices and substrings pin big arrays, maps never shrink, blocked goroutines never exit.",
    "eBPF gives safe, low-overhead kernel-level visibility on Linux; reach for existing tools before writing your own.",
  ],
  furtherReading: [
    { title: "testing package documentation: Benchmarks", url: "https://pkg.go.dev/testing", note: "b.N, b.Loop, sub-benchmarks, timers and ReportAllocs." },
    { title: "benchstat", url: "https://pkg.go.dev/golang.org/x/perf/cmd/benchstat", note: "How to collect samples and read the comparison output." },
    { title: "A Guide to the Go Garbage Collector", url: "https://go.dev/doc/gc-guide", note: "Includes a practical section on escape analysis and reducing heap allocations." },
    { title: "ebpf.io", url: "https://ebpf.io/", note: "An introduction to eBPF concepts, tools and projects." },
  ],
};
