// Deep dive: Chapter 15, Changes in recent Go versions. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch15 = {
  hook: `<p>For years, one of the first lessons every Go programmer learned the hard way looked like this: start a goroutine inside a <code>for</code> loop, print the loop variable, and watch every goroutine print the <em>last</em> value. Code reviews were full of the cure, a mysterious <code>v := v</code> line at the top of loop bodies. Go 1.22 changed the language so that line is no longer needed, and made the change depend on a single line in <code>go.mod</code>.</p>
<p>Go is famous for stability, so changes like this are rare and carefully gated. But Go 1.20 to 1.22 added a surprising amount: per-iteration loop variables, <code>range</code> over integers, the <code>clear</code> built-in, <code>sync.OnceFunc</code>, zeroing in the <code>slices</code> package, a new <code>math/rand/v2</code>, and method-aware HTTP routing. This chapter explains each change, the problem it fixes, and the edge cases that still bite.</p>`,
  sections: [
    {
      id: "loop-variables",
      title: "Per-iteration loop variables in Go 1.22",
      kicker: "The headline change",
      blocks: [
        {
          type: "problem",
          html: `<p>Before Go 1.22, a <code>for</code> loop declared its variables <strong>once</strong> and overwrote them on every iteration. A closure, goroutine or pointer that captured the variable captured that single shared variable, so by the time it ran it usually saw the final value, and goroutines reading it while the loop wrote it were a data race.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func main() {
	var wg sync.WaitGroup
	for _, name := range []string{"a", "b", "c"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fmt.Println(name) // Go 1.22+: a, b and c, in scheduler order
		}()
	}
	wg.Wait()

	var ptrs []*int
	for i := 0; i < 3; i++ {
		ptrs = append(ptrs, &i)
	}
	fmt.Println(*ptrs[0], *ptrs[1], *ptrs[2]) // 1.22+: 0 1 2; before: 3 3 3
}`,
        },
        {
          type: "text",
          html: `<p>Since Go 1.22, each iteration of a range loop and of a three-clause loop gets a <strong>fresh copy</strong> of its loop variables. For three-clause loops, the new variable is initialised from the previous iteration's value just before the post statement runs, so <code>i++</code> and conditions behave exactly as before; only capture changes. The book's <code>changesForLoops.go</code> prints its values in scheduler order rather than the last value repeated, and <code>&amp;v</code> differs on every iteration.</p>
<p>The new semantics apply according to the <strong><code>go</code> line in the module's <code>go.mod</code></strong>, not the toolchain you compile with. A module that says <code>go 1.21</code> keeps the old behaviour even when built with a newer toolchain, so upgrading the compiler alone never changes what existing code means. Go 1.21 offered a preview behind <code>GOEXPERIMENT=loopvar</code>, and <code>go vet</code>'s loopclosure check flagged the classic mistake before the fix.</p>`,
        },
        {
          type: "lab",
          id: "c15LoopVar",
          caption: "Run the book's changesForLoops.go under Go 1.21 and Go 1.22 semantics, slow the loop down to expose the old data race, and try range over an integer.",
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>After raising the <code>go</code> line to 1.22 or later, the old <code>v := v</code> copies are harmless but redundant, and you can delete them. The change also fixes a quieter class of bug: parallel subtests (<code>t.Parallel()</code>) in table-driven tests that all ran with the last table entry.</p>`,
        },
        {
          type: "quiz",
          q: "A module's go.mod says go 1.21. You build it with the Go 1.23 toolchain. Goroutines launched in a range loop print the loop variable. Which semantics apply?",
          options: [
            "Per-iteration, because the toolchain is 1.23",
            "Per-loop (the old behaviour), because the go line in go.mod selects the language version",
            "It refuses to compile until go.mod is updated",
            "It depends on GOMAXPROCS",
          ],
          answer: 1,
          explain: "The loop-variable change is keyed to the module's declared language version, so old code keeps its meaning when the toolchain is upgraded. Raise the go line to 1.22 or later to opt in.",
        },
      ],
    },
    {
      id: "range-int-iterators",
      title: "range over integers, and where it led",
      kicker: "Loops get simpler",
      blocks: [
        {
          type: "text",
          html: `<p>Go 1.22 also lets <code>range</code> take an integer. <code>for i := range n</code> iterates <code>i = 0, 1, ..., n-1</code>, and <code>for range n</code> simply repeats <code>n</code> times without a variable. The loop variable has the type of <code>n</code>, and <code>n</code> is evaluated once. It replaces the most common three-clause loop with something that can't get an off-by-one condition wrong.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `for i := range 3 {
	fmt.Println(i) // 0, 1, 2
}

for range 3 {
	fmt.Println("retry") // three times, no variable
}`,
        },
        {
          type: "text",
          html: `<p>Go 1.23 went further with <strong>range-over-function iterators</strong>. A function of type <code>iter.Seq[V]</code>, that is <code>func(yield func(V) bool)</code>, can be ranged over directly: the loop body becomes <code>yield</code>, and <code>yield</code> returns false when the loop exits early with <code>break</code> or <code>return</code>. The standard library adopted it at once: <code>maps.Keys</code> and <code>maps.Values</code> return iterators, and <code>slices.Collect</code> and <code>slices.Sorted</code> consume them.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func Evens(limit int) iter.Seq[int] {
	return func(yield func(int) bool) {
		for n := 0; n < limit; n += 2 {
			if !yield(n) {
				return // the loop body broke out early
			}
		}
	}
}

func main() {
	for n := range Evens(10) {
		fmt.Println(n) // 0 2 4 6 8
	}
	ages := map[string]int{"bo": 31, "al": 27}
	fmt.Println(slices.Sorted(maps.Keys(ages))) // [al bo] (Go 1.23+)
}`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>An iterator must stop when <code>yield</code> returns false. Ignoring the result and calling <code>yield</code> again after the loop has broken out makes the program panic at run time.</p>`,
        },
        {
          type: "text",
          html: `<p>Go 1.21 had already added two small built-ins in the same spirit, <code>min</code> and <code>max</code>, which work on any ordered type and any number of arguments, alongside the generic <code>slices</code> and <code>maps</code> packages. Together these changes remove a lot of hand-written helper code that every Go codebase used to carry.</p>`,
        },
      ],
    },
    {
      id: "clear-and-slices",
      title: "clear() and the slices package's zeroed tail",
      kicker: "Memory hygiene",
      blocks: [
        {
          type: "text",
          html: `<p>The <code>clear</code> built-in (Go 1.21) does different things to maps and slices. On a <strong>map</strong> it deletes every entry, leaving length 0. On a <strong>slice</strong> it sets every element up to <code>len</code> to its zero value but keeps the length and capacity. That is not the same as <code>s = s[:0]</code>, which keeps the old values in the backing array and only shrinks the window onto it.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `s := []int{0, 1, 2, 3, 4}
s = append(make([]int, 0, 10), s...) // len 5, cap 10
clear(s)    // [0 0 0 0 0], len 5, cap 10
s = s[:0]   // [], len 0, cap 10: the array still holds whatever was there

m := map[string]int{"a": 1, "b": 2}
clear(m)    // len(m) == 0, but the map keeps its allocated buckets

v1 := []int{-1, 1, 2, 3, 4}
v2 := slices.Delete(v1, 1, 3)
fmt.Println(v2) // [-1 3 4]
fmt.Println(v1) // [-1 3 4 0 0] since Go 1.22

all := slices.Concat([]int{1}, []int{2, 3}, []int{4}) // [1 2 3 4], Go 1.22+`,
        },
        {
          type: "text",
          html: `<p><code>clear(m)</code> also solves an old corner case: a map with NaN keys can't be emptied with a <code>delete</code> loop, because NaN never equals itself, but <code>clear</code> removes them. Like <code>delete</code>, it keeps the map's buckets, so it doesn't give memory back.</p>
<p>Since Go 1.22, the functions that shrink a slice, <code>slices.Delete</code>, <code>DeleteFunc</code>, <code>Compact</code>, <code>CompactFunc</code> and <code>Replace</code>, <strong>zero the elements</strong> between the new length and the old one. Two reasons. If the elements are pointers, the stale copies in the tail kept their targets reachable, which is a leak the GC can't see through. And code that kept using the old slice by mistake now sees zeros instead of plausible-looking stale data, which makes the bug visible.</p>`,
        },
        {
          type: "diagram",
          title: "slices.Delete shares the backing array",
          caption: "v2 is a shorter window onto the same array as v1. Since Go 1.22 the two cells v2 no longer covers are zeroed, so v1 shows zeros there and pointers in those cells no longer keep objects alive.",
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="Backing array before and after slices.Delete, with the vacated tail zeroed">
<text x="20" y="60" font-size="12" font-weight="700">before</text>
<rect x="140" y="35" width="60" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="200" y="35" width="60" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="260" y="35" width="60" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="320" y="35" width="60" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="380" y="35" width="60" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="170" y="60" text-anchor="middle" font-size="13">-1</text>
<text x="230" y="60" text-anchor="middle" font-size="13">1</text>
<text x="290" y="60" text-anchor="middle" font-size="13">2</text>
<text x="350" y="60" text-anchor="middle" font-size="13">3</text>
<text x="410" y="60" text-anchor="middle" font-size="13">4</text>
<text x="460" y="60" font-size="12" style="fill: var(--dg-muted)">v1: len 5</text>
<text x="20" y="150" font-size="12" font-weight="700">after</text>
<rect x="136" y="119" width="188" height="52" rx="4" fill="none" stroke-width="2" style="stroke: var(--dg-ok)"/>
<rect x="140" y="125" width="60" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="200" y="125" width="60" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="260" y="125" width="60" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="320" y="125" width="60" height="40" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="380" y="125" width="60" height="40" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="170" y="150" text-anchor="middle" font-size="13">-1</text>
<text x="230" y="150" text-anchor="middle" font-size="13">3</text>
<text x="290" y="150" text-anchor="middle" font-size="13">4</text>
<text x="350" y="150" text-anchor="middle" font-size="13">0</text>
<text x="410" y="150" text-anchor="middle" font-size="13">0</text>
<text x="460" y="143" font-size="12" style="fill: var(--dg-muted)">zeroed tail (1.22+)</text>
<text x="460" y="161" font-size="12" style="fill: var(--dg-muted)">v1 still has len 5</text>
<text x="140" y="198" font-size="12" style="fill: var(--dg-muted)">v2 := slices.Delete(v1, 1, 3) is the green window: len 3</text>
</svg>`,
        },
        {
          type: "lab",
          id: "c15Slices",
          caption: "See exactly which backing-array cells clear(s), s = s[:0], slices.Delete and slices.Compact touch, and how Go 1.22 started zeroing the cells that shrinking functions leave behind.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Always use the slice that <code>slices.Delete</code> returns, and treat the original as invalid afterwards. The functions modify the shared backing array in place; only the returned header has the right length.</p>`,
        },
        {
          type: "quiz",
          q: "s has length 5 and capacity 10, holding pointers to large objects. Which operation makes those objects unreachable through s's backing array while keeping len(s) == 5?",
          options: [
            "s = s[:0]",
            "clear(s)",
            "s = s[:5]",
            "slices.Clip(s)",
          ],
          answer: 1,
          explain: "clear(s) writes nil into each of the five elements, so the objects are no longer referenced from the array, and the length stays 5. s = s[:0] only changes the slice header; the pointers remain in the array and keep their objects alive.",
        },
      ],
    },
    {
      id: "once-func",
      title: "sync.OnceFunc, OnceValue and OnceValues",
      kicker: "Lazy initialisation, tidied",
      blocks: [
        {
          type: "problem",
          html: `<p>Lazy initialisation with <code>sync.Once</code> works, but it needs three package-level variables (the Once, the value, the error) and a wrapper function that every caller must remember to use. It is boilerplate that is easy to get slightly wrong, for example by reading the value without going through the Once.</p>`,
        },
        {
          type: "text",
          html: `<p>Go 1.21 added three helpers. <code>sync.OnceFunc(f)</code> returns a function that runs <code>f</code> only on its first call, no matter how many goroutines call it. <code>sync.OnceValue(f)</code> does the same for a function returning one value and caches that value. <code>sync.OnceValues(f)</code> caches two results, which fits the common <code>(T, error)</code> shape. In the book, ten goroutines call a OnceFunc-wrapped initialiser repeatedly, and it still sets the variable exactly once.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var loadConfig = sync.OnceValues(func() (*Config, error) {
	data, err := os.ReadFile("config.json")
	if err != nil {
		return nil, err
	}
	var c Config
	return &c, json.Unmarshal(data, &c)
})

var closeDone = sync.OnceFunc(func() { close(done) })

func handler(w http.ResponseWriter, r *http.Request) {
	cfg, err := loadConfig() // the file is read once; later calls reuse the result
	if err != nil {
		http.Error(w, "config unavailable", http.StatusInternalServerError)
		return
	}
	fmt.Fprintln(w, cfg.Name)
}`,
          caption: "closeDone can be called from any number of goroutines, and the channel is closed exactly once, so there is no \"close of closed channel\" panic.",
        },
        {
          type: "text",
          html: `<p>Two details matter. The result is cached <em>including errors</em>: if the first call fails, every later call returns the same error, with no retry. If you need retries, keep your own state. And if <code>f</code> panics, every call to the returned function panics with the same value, whereas a plain <code>sync.Once</code> treats a panicking function as done and later calls simply return.</p>`,
        },
        {
          type: "quiz",
          q: "loadConfig is built with sync.OnceValues. The first call happens before the config file exists and returns an error. The file is then created. What does the next call return?",
          options: [
            "The parsed config, because the function runs again",
            "The same error as the first call, because the result is cached",
            "A panic",
            "nil, nil",
          ],
          answer: 1,
          explain: "OnceValues runs the function once and caches both results, errors included. Retrying needs explicit logic, not a Once helper.",
        },
      ],
    },
    {
      id: "randomness",
      title: "Random numbers: seeding, reproducibility and math/rand/v2",
      kicker: "Randomness",
      blocks: [
        {
          type: "text",
          html: `<p>Before Go 1.20, the global <code>math/rand</code> generator started from the same fixed seed in every run, so programs called <code>rand.Seed(time.Now().UnixNano())</code> at startup to get different numbers. Since Go 1.20 the global generator is <strong>seeded randomly</strong> at startup and <code>rand.Seed</code> is deprecated. Go 1.24 went a step further: calling the top-level <code>Seed</code> no longer has any effect unless you set <code>GODEBUG=randseednop=0</code>.</p>
<p>If you <em>want</em> the same sequence every time, for a reproducible simulation or a test, create your own generator from a fixed seed. The same seed always produces the same values, and a private generator also avoids sharing state with the rest of the program.</p>`,
        },
        {
          type: "text",
          html: `<h3>math/rand/v2</h3>
<p>Go 1.22 shipped <code>math/rand/v2</code>, the standard library's first "v2" package, which cleans up the API instead of breaking the old one. It has no <code>Seed</code> function and no top-level <code>Read</code>. Methods were renamed for consistency (<code>Intn</code> became <code>IntN</code>, <code>Int63n</code> became <code>Int64N</code>). It adds better generators, <code>PCG</code> and <code>ChaCha8</code>, and a generic <code>rand.N</code> that works for any integer type, including <code>time.Duration</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `import (
	crand "crypto/rand"
	"encoding/hex"
	"math/rand/v2"
	"time"
)

func examples() (int, time.Duration, string, error) {
	r := rand.New(rand.NewPCG(42, 1024)) // reproducible: same seeds, same sequence
	roll := r.IntN(6) + 1

	jitter := rand.N(250 * time.Millisecond) // random Duration in [0, 250ms)

	b := make([]byte, 32) // secrets come from crypto/rand, never math/rand
	if _, err := crand.Read(b); err != nil {
		return 0, 0, "", err
	}
	return roll, jitter, hex.EncodeToString(b), nil
}`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Neither <code>math/rand</code> nor <code>math/rand/v2</code> is suitable for tokens, keys, passwords or session IDs, even though v2's ChaCha8 is a cryptographically strong algorithm: the package makes no security promises and its generators can be seeded predictably. Use <code>crypto/rand</code> for anything an attacker must not guess. The book rebuilds the removed <code>Read</code> from <code>Uint64()</code> as an exercise; for real random bytes, use <code>crypto/rand</code>.</p>`,
        },
      ],
    },
    {
      id: "routing-and-toolchains",
      title: "Method-aware routing, and how Go versions are selected",
      kicker: "The ecosystem around the language",
      blocks: [
        {
          type: "text",
          html: `<p>Go 1.22 also extended <code>net/http.ServeMux</code> patterns with methods and wildcards: <code>mux.HandleFunc("GET /users/{id}", h)</code>, read with <code>r.PathValue("id")</code>, plus <code>{path...}</code> for the rest of a path and <code>{$}</code> to anchor the end. The most specific pattern wins, overlapping patterns with no clear winner panic at registration, and a method mismatch returns 405 with an <code>Allow</code> header. Chapter 9 covers it in depth; the headline is that many services which imported a third-party router only for methods and path variables no longer need one.</p>
<h3>The go line and the toolchain line</h3>
<p>All of these changes are gated by versions, so it helps to know how Go picks one. Since Go 1.21, the <code>go</code> line in <code>go.mod</code> is a hard minimum: a toolchain older than it refuses to build the module (or, with the default <code>GOTOOLCHAIN=auto</code>, downloads a newer toolchain). The optional <code>toolchain</code> line suggests a specific toolchain. The <code>go</code> line also sets the language semantics, as with loop variables, and the default <code>GODEBUG</code> settings, which is how behaviour changes such as the new ServeMux matcher can be rolled back per program (<code>GODEBUG=httpmuxgo121=1</code>).</p>`,
        },
        {
          type: "table",
          title: "Changes worth knowing, by release",
          headers: ["Release", "Highlights"],
          rows: [
            ["Go 1.18", "Generics; native fuzzing in <code>go test</code>"],
            ["Go 1.19", "<code>GOMEMLIMIT</code> soft memory limit"],
            ["Go 1.20", "Global <code>math/rand</code> auto-seeded, <code>rand.Seed</code> deprecated; <code>errors.Join</code>"],
            ["Go 1.21", "<code>min</code>, <code>max</code>, <code>clear</code>; <code>slices</code>, <code>maps</code>, <code>log/slog</code>; <code>sync.OnceFunc</code>; toolchain management; PGO generally available"],
            ["Go 1.22", "Per-iteration loop variables; <code>range</code> over int; ServeMux methods and wildcards; <code>math/rand/v2</code>; <code>slices</code> zeroing and <code>Concat</code>"],
            ["Go 1.23", "Range-over-function iterators and the <code>iter</code> package; <code>unique</code>"],
            ["Go 1.24", "<code>testing.B.Loop</code>; Swiss-table map implementation; top-level <code>rand.Seed</code> becomes a no-op"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "The Go team", title: "Compatibility by GODEBUG", html: "Behaviour changes that could break existing programs ship with a GODEBUG setting, and the default for each program follows its <code>go</code> line. Upgrading the toolchain keeps old programs working; raising the <code>go</code> line opts them in to new behaviour." },
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Recent Go versions in interviews",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Questions about recent versions check whether your Go knowledge is current. Interviewers often start with the loop-variable change because it reveals whether you understand closures and capture, then move to a "what's the difference between X and Y" question about <code>clear</code> or randomness.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>Loop variables</strong>: per-iteration since 1.22, selected by the <code>go</code> line in go.mod; it fixes captured variables in goroutines, closures, pointers and parallel subtests.</li>
<li><strong><code>clear(s)</code> vs <code>s = s[:0]</code></strong>: zero the elements and keep the length, versus shrink the window and keep stale values; <code>clear(m)</code> empties a map but keeps its buckets.</li>
<li><strong>slices zeroing</strong>: shrinking functions zero the tail since 1.22 so stale pointers don't leak; always use the returned slice.</li>
<li><strong>Randomness</strong>: no more <code>rand.Seed</code>; use a private generator for reproducibility and <code>crypto/rand</code> for secrets; know what v2 renamed and removed.</li>
<li><strong>Once helpers</strong>: OnceFunc, OnceValue, OnceValues; results and errors are cached, and panics repeat.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "You need a test that shuffles a slice the same way on every run. What is the right approach in current Go?",
          options: [
            "Call rand.Seed(1) at the start of the test",
            "Create a private generator from a fixed seed, for example rand.New(rand.NewPCG(1, 2)) from math/rand/v2, and shuffle with it",
            "Use crypto/rand with a fixed seed",
            "Nothing: math/rand is deterministic by default",
          ],
          answer: 1,
          explain: "The global generator is seeded randomly since Go 1.20, and top-level Seed is a no-op by default since Go 1.24. A private generator with fixed seeds is reproducible and doesn't affect the rest of the program. crypto/rand can't be seeded at all.",
        },
      ],
    },
  ],
  takeaways: [
    "Since Go 1.22 each loop iteration has its own variables, so closures, goroutines and pointers capture the value you expect; the <code>go</code> line in go.mod opts a module in.",
    "<code>for i := range n</code> counts from 0 to n-1; Go 1.23 extended <code>range</code> to iterator functions (<code>iter.Seq</code>).",
    "<code>clear(s)</code> zeroes elements and keeps the length; <code>s[:0]</code> only shrinks the window; <code>clear(m)</code> empties a map but keeps its buckets.",
    "Shrinking functions in <code>slices</code> zero the vacated tail since 1.22; always use the slice they return.",
    "<code>sync.OnceFunc</code>, <code>OnceValue</code> and <code>OnceValues</code> replace Once boilerplate; they cache errors and repeat panics.",
    "<code>rand.Seed</code> is obsolete; use a private generator for reproducible sequences, <code>math/rand/v2</code> for new code, and <code>crypto/rand</code> for secrets.",
    "The <code>go</code> line sets the minimum toolchain, the language semantics and the default GODEBUG settings.",
  ],
  furtherReading: [
    { title: "Fixing For Loops in Go 1.22 (the Go blog)", url: "https://go.dev/blog/loopvar-preview", note: "Why the loop-variable change was made and how it is gated." },
    { title: "Go 1.22 release notes", url: "https://go.dev/doc/go1.22", note: "Loop variables, range over int, math/rand/v2, slices changes and routing." },
    { title: "Go 1.21 release notes", url: "https://go.dev/doc/go1.21", note: "min, max, clear, slices, maps, slog, the Once helpers and toolchain management." },
    { title: "Routing Enhancements for Go 1.22 (the Go blog)", url: "https://go.dev/blog/routing-enhancements", note: "The new ServeMux pattern syntax and precedence." },
  ],
};
