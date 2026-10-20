// Mastering Go - interactive notes data, part 5 (chapters 12-15 and the appendix)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch12`, part: 5, number: 12,
    title: `Code Testing and Profiling`,
    overview: `Make it correct first, then make it fast. The chapter opens with the <strong>run()</strong> trick that makes <code>main()</code> testable, then shows how to <strong>profile</strong> CLI programs (<code>runtime/pprof</code>) and HTTP servers (<code>net/http/pprof</code>), how to <strong>trace</strong> the runtime with <code>go tool trace</code> and a single HTTP request with <code>net/http/httptrace</code>, and how to walk all <strong>gorilla/mux</strong> routes. Most of the chapter is about <strong>go test</strong>: test naming rules, testing UNIX signals, disabling the test cache, <code>t.TempDir()</code> and <code>t.Cleanup()</code>, <code>testing/quick</code>, <code>-timeout</code>, <code>t.Fatal</code> vs <code>t.Error</code>, <strong>table-driven tests</strong>, <strong>coverage</strong>, unreachable code with <strong>go vet</strong>, and <strong>httptest</strong> against a REST server with a real database. It ends with <strong>govulncheck</strong>, <strong>cross-compilation</strong> with GOOS/GOARCH, <strong>go:generate</strong> and <strong>Example</strong> functions.`,
    concepts: [
      { term: `Rewriting main() as run()`, def: `Keep <code>main()</code> tiny: it calls <code>run(os.Args, os.Stdout)</code> and prints the returned error. All real logic lives in <code>run(args []string, stdout io.Writer) error</code>.`, why: `Tests cannot call <code>main()</code>, and <code>main()</code> can only exit with a status code. <code>run()</code> can be called from tests with any arguments and any writer (for example a <code>bytes.Buffer</code>), and it returns an <code>error</code> you can assert on.`, ex: `<code>err := run([]string{"prog"}, &amp;buf)</code> should return the "No input!" error.` },
      { term: `Profiling with pprof (CLIs and servers)`, def: `In a CLI, <code>runtime/pprof</code>: <code>pprof.StartCPUProfile(f)</code> / <code>defer pprof.StopCPUProfile()</code> sample the CPU and <code>pprof.WriteHeapProfile(f)</code> writes a heap snapshot. In a server, importing <code>net/http/pprof</code> registers handlers under <code>/debug/pprof/</code> (on the default mux; with a custom mux you register <code>pprof.Index</code>, <code>pprof.Profile</code> and friends yourself). Analyze with <code>go tool pprof file.out</code> or <code>go tool pprof http://host:port/debug/pprof/profile</code>.`, why: `Profiling is dynamic analysis of a real run: it finds hot functions, can reveal endless loops, and is the main tool for memory leaks. Long-running servers can be profiled in place. Since Go 1.10, <code>go tool pprof -http=127.0.0.1:1234 file.out</code> opens a web UI with graphs and flame graphs. Optimize only after the code is correct and a profile shows the bottleneck.`, ex: `The book's profileCla.go counts primes with N1 and N2 and computes Fibonacci numbers; <code>top</code> shows <code>main.N2</code> at 46% flat.`, demo: `c12Pprof` },
      { term: `flat vs cum in pprof`, def: `<strong>flat</strong> is time spent in the function's own code; <strong>cum</strong> (cumulative) also includes the functions it calls. <code>top</code> sorts by flat, <code>top10 -cum</code> by cumulative, <code>list fn</code> annotates source lines, <code>pdf</code> / <code>web</code> draw the call graph.`, why: `<code>main.main</code> has tiny flat time but huge cum time: it does nothing itself but calls everything. Look for high <em>flat</em> to find the code to optimize, high <em>cum</em> to find the subtree responsible.`, ex: `<code>list main.N1</code> showed that all 120 ms were on the line <code>if (n % i) == 0</code>.`, demo: `c12Pprof` },
      { term: `Tracing: go tool trace and httptrace`, def: `Trace files record goroutine lifetimes, GC activity, logical processor (P) usage and OS threads. Generate them with <code>runtime/trace</code> (<code>trace.Start(f)</code> / <code>trace.Stop()</code>), via <code>/debug/pprof/trace</code>, or with <code>go test -trace</code>, and view them with <code>go tool trace file</code>. On the client side, an <code>httptrace.ClientTrace</code> with callbacks such as <code>DNSDone</code>, <code>ConnectStart</code>, <code>GotConn</code>, <code>WroteHeaders</code> and <code>GotFirstResponseByte</code> is attached with <code>httptrace.WithClientTrace(ctx, trace)</code>.`, why: `Trace answers <em>when</em> and <em>why</em> goroutines were blocked or idle, which pprof cannot; pprof is still better for "where is the time spent". httptrace shows each phase of a single <code>http.Transport.RoundTrip</code>, including connection reuse (<code>Reused:true</code> on the second request).` },
      { term: `go test basics and the test cache`, def: `Tests live in <code>*_test.go</code> files, are named <code>TestXxx</code> (Test followed by an uppercase letter or underscore), take <code>t *testing.T</code> and return nothing. <code>go test</code> builds a temporary main package, runs them and reports PASS/FAIL; <code>-v</code> is verbose, <code>-run regexp</code> selects tests. Successful package results are cached and shown as <code>(cached)</code>; bypass with <code>-count=1</code> or wipe with <code>go clean -testcache</code>.`, why: `<code>Testfoo</code> is silently not a test. Testing shows the presence of bugs, never their absence, so test expected, unexpected and empty input and edge cases. Tests that depend on state the cache doesn't track (signals, a database, the clock) can pass from cache while really failing.` },
      { term: `Testing UNIX signals`, def: `Run the signal handler (<code>Listener()</code>) as a goroutine inside a test, then send signals to the own process with <code>syscall.Kill(syscall.Getpid(), syscall.SIGUSR1)</code>, sleeping between sends.`, why: `Signals are hard to send to a process by hand, and a signal with a default "terminate" action can kill the test run. The handler must run as a goroutine, otherwise the test blocks forever.` },
      { term: `t.TempDir() and t.Cleanup()`, def: `<code>t.TempDir()</code> returns a fresh, unique directory that is deleted automatically when the test (and its subtests) finish. <code>t.Cleanup(fn)</code> registers a function to run after the test; cleanups run in LIFO order. Both also exist on <code>testing.B</code>.`, why: `The book's TestFoo creates test02 under <code>os.TempDir()</code> and never removes it, so the second run with <code>-count=1</code> fails with "file exists". Don't confuse <code>t.TempDir()</code> (per-test) with <code>os.TempDir()</code> (the system temp directory).` },
      { term: `testing/quick`, def: `<code>quick.Check(f, &amp;quick.Config{MaxCount: N})</code> generates random arguments matching the signature of the property function <code>f</code> and reports the first input for which it returns false.`, why: `Black-box property testing in the spirit of Haskell's QuickCheck: commutativity <code>Add(a,b) == Add(b,a)</code> holds, the deliberately wrong <code>Add(Add(a,b),c) == Add(a,b)</code> fails and prints the offending Point2D values. The package is frozen; fuzzing is its modern successor.` },
      { term: `t.Error vs t.Fatal`, def: `<code>t.Error</code> / <code>t.Errorf</code> mark the test failed and keep going. <code>t.Fatal</code> / <code>t.Fatalf</code> mark it failed and stop it immediately (via <code>runtime.Goexit</code>), so deferred functions and cleanups still run.`, why: `Use Fatal when later checks make no sense after this failure: a missing DB connection, a missing map key that later code needs. Call it only from the test goroutine, not from goroutines the test started.`, demo: `c12TableTests` },
      { term: `Table-driven tests`, def: `Put the cases in a slice of structs (inputs plus expected outputs) and loop over them. Adding a case is adding one line. Wrapping each case in <code>t.Run(name, ...)</code> gives named, individually runnable subtests.`, why: `The book tests <code>intDiv</code> and <code>floatDiv</code> with six cases; the last one expects 1.2 for 5/4 on purpose and fails with "Expected 1.200000, got 1.250000". Exact float comparison is fragile; compare with a tolerance.`, demo: `c12TableTests` },
      { term: `Code coverage and unreachable code`, def: `<code>go test -cover</code> prints the percentage of statements executed; <code>-coverprofile=coverage.out</code> writes per-block data (<code>file:line.col,line.col numStmts count</code>), and <code>go tool cover -html=coverage.out</code> colors covered code green and uncovered red. <code>go vet</code> separately reports statements after a <code>return</code> as "unreachable code", as in the book's S1 and S2.`, why: `Coverage reveals dead branches and weak tests. In the book's f1 the <code>else</code> after <code>if true</code> never runs, and in f2 the <code>n == 1</code> branch is unreachable because <code>n &gt;= 0</code> catches it first. Coverage complements tests, but 100% coverage does not mean correct. The compiler accepts unreachable code because it is a logic error; vet (a subset runs during <code>go test</code>) and staticcheck catch it.`, demo: `c12Coverage` },
      { term: `httptest`, def: `<code>httptest.NewRecorder()</code> is an in-memory <code>http.ResponseWriter</code>. Build a request with <code>http.NewRequest</code>, call <code>handler.ServeHTTP(rr, req)</code>, then check <code>rr.Code</code> and <code>rr.Body</code>. <code>mux.SetURLVars</code> injects gorilla/mux path variables.`, why: `No server or port is needed, so handler tests are fast. The book's tests still need a live database with an admin user, which makes them order-dependent (login before logout); ideally tests own their fixtures or use a dedicated test DB.` },
      { term: `govulncheck`, def: `<code>go install golang.org/x/vuln/cmd/govulncheck@latest</code>, then <code>govulncheck ./...</code>. It checks dependencies against the Go vulnerability database and analyzes call graphs, separating vulnerabilities you actually call from ones in imported packages you never reach.`, why: `Downgrading <code>golang.org/x/text</code> to v0.3.5 surfaced GO-2022-1059 and GO-2021-0113 as informational (no call stack reaches them). The fix is <code>go get golang.org/x/text@latest</code>. Supports <code>-json</code> for CI.` },
      { term: `Cross-compilation`, def: `Set <code>GOOS</code> and <code>GOARCH</code>: <code>env GOOS=linux GOARCH=amd64 go build crossCompile.go</code>. <code>go tool dist list</code> lists valid pairs.`, why: `One machine builds binaries for every platform, which is ideal for CI/CD. <code>runtime.Version()</code> in the binary reports the Go version of the <em>build</em> machine, since the target may not have Go at all.` },
      { term: `go:generate`, def: `<code>//go:generate command args</code> comments are executed only when you run <code>go generate</code> explicitly (never by build or test). Special variables: <code>$GOFILE</code>, <code>$GOLINE</code>, <code>$GOPACKAGE</code>, <code>$GOOS</code>, <code>$GOARCH</code>, <code>$DOLLAR</code>. Flags: <code>-n</code> (print only), <code>-x</code> (print and run), <code>-v</code>.`, why: `Typical uses: stringer, mocks, protobuf, embedding version data or fetching sample data. The author warns it hides steps from developers; check generated files into the repository.` },
      { term: `Example functions`, def: `<code>func ExampleLengthRange()</code> in a <code>_test.go</code> file, no parameters and no results, ending with an <code>// Output:</code> comment. <code>go test</code> runs it and compares stdout with the comment; the example also appears in the package documentation.`, why: `Executable documentation that cannot rot. The book's example expects 7 and 7, but <code>LengthRange("Mastering Go, 4th edition!")</code> is 26, so the example fails with got/want output. <code>// Unordered output:</code> ignores line order.` }
    ],
    cheatsheet: [
      { title: `go test flags`, type: `table`, headers: [`Flag`, `Effect`], rows: [
        [`-v`, `Verbose: print every test name and t.Log output`],
        [`-run 'Re'`, `Run only tests/examples matching the regexp (subtests: Parent/child)`],
        [`-count=1`, `Bypass the test cache; -count=N repeats tests N times`],
        [`-timeout 1s`, `Panic if the whole test binary runs longer (default 10m)`],
        [`-cover / -coverprofile=c.out`, `Statement coverage; write a profile for go tool cover -html=c.out`],
        [`-race`, `Enable the data race detector`],
        [`-shuffle=on`, `Randomize test and benchmark order (Go 1.17+)`],
        [`-trace / -cpuprofile / -memprofile`, `Write execution trace or profiles while testing`]
      ], note: `go clean -testcache wipes all cached results.` },
      { title: `Profiling and tracing`, type: `table`, headers: [`Goal`, `Tool`], rows: [
        [`CPU / heap profile of a CLI`, `runtime/pprof: StartCPUProfile, StopCPUProfile, WriteHeapProfile`],
        [`Profile a running server`, `import _ "net/http/pprof"; go tool pprof http://host/debug/pprof/profile`],
        [`Inspect a profile`, `go tool pprof f.out then top, top10 -cum, list fn, pdf; or -http=:1234 for the web UI`],
        [`Goroutines, GC, Ps over time`, `runtime/trace + go tool trace f.out`],
        [`Phases of one HTTP request`, `net/http/httptrace.ClientTrace`],
        [`Check all router paths`, `gorilla/mux Router.Walk()`]
      ] },
      { title: `Table-driven test with subtests`, type: `code`, lang: `go`, body: `func TestDiv(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        resInt   int
        resFloat float64
    }{
        {"half", 1, 2, 0, 0.5},
        {"exact", 4, 2, 2, 2.0},
        {"quarter", 5, 4, 1, 1.25},
    }
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()
            if got := intDiv(tc.a, tc.b); got != tc.resInt {
                t.Errorf("intDiv(%d,%d) = %d, want %d", tc.a, tc.b, got, tc.resInt)
            }
            if got := floatDiv(tc.a, tc.b); math.Abs(got-tc.resFloat) > 1e-9 {
                t.Errorf("floatDiv(%d,%d) = %f, want %f", tc.a, tc.b, got, tc.resFloat)
            }
        })
    }
}

func ExampleLengthRange() {
    fmt.Println(LengthRange("Mihalis"))
    // Output: 7
}` },
      { title: `Testing helpers on *testing.T`, type: `list`, items: [
        `<code>t.Error/Errorf</code>: fail and continue. <code>t.Fatal/Fatalf</code>: fail and stop this test.`,
        `<code>t.Log</code>: printed with <code>-v</code> or when the test fails. <code>t.Skip</code>: mark as skipped.`,
        `<code>t.Run(name, fn)</code>: subtest. <code>t.Parallel()</code>: run alongside other parallel tests.`,
        `<code>t.TempDir()</code>: auto-removed directory. <code>t.Cleanup(fn)</code>: LIFO teardown. <code>t.Helper()</code>: report the caller's line.`,
        `<code>t.Setenv(k, v)</code>: set an env var for the test only.`,
        `Prefixes: <code>Test</code> (testing.T), <code>Benchmark</code> (testing.B), <code>Fuzz</code> (testing.F), <code>Example</code> (no args).`
      ] },
      { title: `Ship it`, type: `list`, items: [
        `<code>go vet ./...</code> then <code>staticcheck ./...</code> for suspicious code.`,
        `<code>govulncheck ./...</code> for known vulnerabilities that your code actually reaches.`,
        `<code>GOOS=linux GOARCH=arm64 go build</code>; list targets with <code>go tool dist list</code>.`,
        `<code>go generate ./...</code> before building if the repo uses <code>//go:generate</code>; try <code>-n</code> first.`
      ] }
    ],
    interview: [
      { q: `Why would you move the body of main() into a run() function?`, a: `main() takes no arguments, returns nothing and cannot be called from tests. A run(args []string, stdout io.Writer) error function can be called from a test with any argument list and an in-memory writer, and returns an error instead of calling os.Exit. main() shrinks to calling run(os.Args, os.Stdout) and handling the error, so nearly all code is testable. The extra stack frame costs nothing in practice.`, diff: `easy` },
      { q: `What is the difference between flat and cum in pprof output?`, a: `flat is the time (or allocation) attributed to the function's own instructions; cum adds everything spent in functions it calls. A dispatcher like main.main has near-zero flat and nearly 100% cum. To decide what to optimize, look at high-flat functions and use list fn to see the hot lines; to understand which subtree dominates, sort with top -cum or look at the graph.`, diff: `med` },
      { q: `How do you profile a production HTTP server in Go?`, a: `Import net/http/pprof (for side effects on DefaultServeMux, or register its handlers on your own mux), preferably on a separate internal-only port. Then run go tool pprof http://host:port/debug/pprof/profile?seconds=30 for CPU, /debug/pprof/heap for memory, /debug/pprof/goroutine for stacks, and /debug/pprof/trace for an execution trace. Use go tool pprof -http=:8080 to browse graphs and flame graphs. Don't expose these endpoints publicly: they leak internals and can be used for DoS.`, diff: `med` },
      { q: `When do you use go tool trace instead of pprof?`, a: `pprof samples where CPU time or allocations go. trace records events over time: goroutine creation, blocking on channels or syscalls, scheduler latency, GC phases and which P ran what. Use trace for latency problems, poor parallelism, goroutines waiting on each other or GC pauses; use pprof for hot code and memory usage.`, diff: `med` },
      { q: `Your test passes locally from cache but the code is broken. What happened and how do you avoid it?`, a: `go test caches results for a package when the source, flags and env/files it tracks have not changed, and prints (cached). If a test depends on something the cache does not track, like an external database, a signal, or a file outside the module, the stale PASS is replayed. Run with -count=1 (the idiomatic way to disable caching for a run) or go clean -testcache. Better, make tests hermetic.`, diff: `easy` },
      { q: `t.Error vs t.Fatal: when do you use which, and what is a gotcha with Fatal?`, a: `t.Error records a failure and continues, useful when checks are independent so you see all failures at once. t.Fatal records the failure and stops the test by calling runtime.Goexit, appropriate when continuing would only produce noise or panics (no DB connection, missing required key). Gotcha: Fatal must be called from the goroutine running the test; calling it from a spawned goroutine does not stop the test properly. Deferred calls and t.Cleanup functions still run after Fatal.`, diff: `med` },
      { q: `What makes table-driven tests idiomatic, and how do you improve the book's version?`, a: `All cases live in one slice of structs and one loop executes them, so adding a case is adding a line. Improvements: give each case a name and run it with t.Run so failures are labelled and can be selected with -run TestDiv/quarter; use t.Parallel inside subtests when safe; compare floats with a tolerance instead of !=; include the inputs in the failure message, not just expected vs got. Before Go 1.22 you also had to copy the loop variable (tc := tc) when using t.Parallel in subtests.`, diff: `med` },
      { q: `Does 100% statement coverage mean the code is correct? Use the book's f2 as an example.`, a: `No. Coverage only tells you which statements ran, not whether the results were checked or whether the logic is right. In f2, n >= 0 returns 0 for every non-negative number, so the n == 1 branch is unreachable and coverage shows it red; but f2 is also wrong for negative numbers (it recurses forever), and coverage can't tell you that. Tests need assertions and edge cases; coverage just points at untested code.`, diff: `med` },
      { q: `How do you test an HTTP handler without starting a server?`, a: `Create a request with http.NewRequest (or httptest.NewRequest), create a recorder with httptest.NewRecorder(), and call handler.ServeHTTP(rr, req) directly. Then assert on rr.Code, rr.Header() and rr.Body. For routers that read path variables (gorilla/mux) inject them with mux.SetURLVars, or route the request through the real router. For end-to-end tests httptest.NewServer starts a real server on a random localhost port.`, diff: `easy` },
      { q: `What does govulncheck do differently from a plain dependency version scanner?`, a: `It matches your module versions against the Go vulnerability database and then uses static analysis of the call graph (symbol-level scanning) to see whether your code actually reaches the vulnerable functions. Reachable issues are reported as actionable; vulnerabilities in imported modules you never call are listed as informational. That cuts noise compared with version-only scanners. It can also scan compiled binaries and output JSON for CI.`, diff: `hard` }
    ],
    labs: [`c12TableTests`, `c12Coverage`, `c12Pprof`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch13`, part: 5, number: 13,
    title: `Fuzz Testing and Observability`,
    overview: `Two ways to see what normal tests miss. <strong>Fuzzing</strong> (<code>testing.F</code>, <code>f.Add</code>, <code>f.Fuzz</code>, <code>go test -fuzz</code>) generates inputs nobody thought of: it finds the negative-x bug in <code>AddInt()</code> and the UTF-8 bug in the byte-reversing string functions R1/R2, saves the failing input under <code>testdata/fuzz</code>, and then the code gets fixed. <strong>Observability</strong> covers logs, metrics, traces, monitoring and alerting; the chapter focuses on metrics: <code>runtime/metrics</code>, timing a function with <code>time.Since</code> and <code>log/slog</code>, <code>expvar</code>, CPU details with <code>cpuid</code>, and exposing <strong>Prometheus</strong> counters, gauges, histograms and summaries that are scraped by Prometheus and plotted in <strong>Grafana</strong>, all running in Docker.`,
    concepts: [
      { term: `Fuzz testing`, def: `A technique that feeds generated, unexpected or invalid input into code and watches for failures (failed checks, panics, hangs). Built into <code>go test</code> since Go 1.18.`, why: `Hand-written cases only cover what you imagined. Fuzzing shines on code that parses untrusted input and finds security bugs that attackers would find with their own fuzzers. It complements unit tests; it does not replace them.`, demo: `c13Fuzz` },
      { term: `testing.F, f.Add and f.Fuzz`, def: `A fuzz test is <code>func FuzzXxx(f *testing.F)</code>. <code>f.Add(args...)</code> adds seed inputs; <code>f.Fuzz(func(t *testing.T, args...))</code> is the fuzz target, whose parameter types must match the <code>f.Add</code> calls.`, why: `Inside the target you write a normal test body. Supported argument types are strings, []byte, bool, all int/uint/float sizes, and rune/byte. Without <code>-fuzz</code>, <code>go test</code> just runs the seed corpus as regular tests.`, ex: `<code>f.Add(0, 1); f.Fuzz(func(t *testing.T, x, y int) { if AddInt(x, y) != x+y { t.Errorf(...) } })</code>` },
      { term: `Seed corpus vs generated corpus`, def: `The corpus guides fuzzing. The <strong>seed corpus</strong> comes from <code>f.Add</code> calls and files in <code>testdata/fuzz/FuzzXxx</code>; the <strong>generated corpus</strong> is produced by the fuzzer (cached under <code>$GOCACHE/fuzz</code>) when a mutation reaches new code ("new interesting").`, why: `Good seeds that look like real input help the coverage-guided mutator reach deep code faster. A seed corpus is optional.`, demo: `c13Fuzz` },
      { term: `Failing input files`, def: `On failure the fuzzer minimizes the input and writes it to <code>testdata/fuzz/FuzzXxx/&lt;hash&gt;</code> in the <code>go test fuzz v1</code> format, for example <code>int(-63)</code> / <code>int(32)</code>. Re-run with <code>go test -run=FuzzXxx/&lt;hash&gt;</code>.`, why: `The file becomes part of the seed corpus, so plain <code>go test</code> fails until the bug is fixed: a free regression test. That is also why FuzzR2 "failed" in the book: it hit the testdata file left by FuzzR1. Commit these files.` },
      { term: `Running the fuzzer`, def: `<code>go test -fuzz=FuzzR1</code> (only one fuzz target per run), optionally with <code>-fuzztime 10s</code> or <code>-fuzztime 1000x</code>. Output shows baseline coverage, execs/sec, and "new interesting" corpus entries; it runs on all cores (workers) until failure or timeout.`, why: `Without <code>-fuzztime</code> fuzzing runs until it finds a failure or you press Ctrl+C, so set a limit in CI.` },
      { term: `Property-based checks`, def: `A fuzz target rarely knows the exact expected output, so it checks properties: reversing twice gives the original string; a valid UTF-8 input stays valid after reversing; <code>AddInt(x, y) == x + y</code>.`, why: `Round-trip properties (encode/decode, marshal/unmarshal, reverse/reverse) and invariants are the most productive fuzz checks.`, demo: `c13Fuzz` },
      { term: `The R1/R2 reverse bug and its fix`, def: `R1 and R2 reversed a string <strong>byte by byte</strong>. For a multi-byte character such as <code>"Ԕ"</code> (bytes <code>d4 94</code>) the result <code>"\\x94\\xd4"</code> is invalid UTF-8. The fix checks <code>utf8.ValidString</code> and returns an error for invalid input, and R2 reverses <code>[]rune(s)</code> instead of bytes.`, why: `Go strings are byte sequences, not character sequences. Converting invalid UTF-8 to []rune replaces bad bytes with U+FFFD, so a rune-based reverse without the validity check fails the round-trip property instead. Note that the "corrected" R1 in the book still swaps bytes, so for valid multi-byte input it still produces invalid UTF-8; the rune-based R2 is the robust version.`, demo: `c13Fuzz` },
      { term: `Observability`, def: `Understanding a system's internal state from its external outputs. Components: <strong>logs</strong>, <strong>metrics</strong>, <strong>traces</strong>, <strong>monitoring</strong>, <strong>alerting</strong> and <strong>distributed tracing</strong>.`, why: `The first rule: know what you are looking for, or you'll collect the wrong data. Metrics without storage and visualization are of little use.` },
      { term: `runtime/metrics`, def: `Runtime metrics are named by paths such as <code>/sched/goroutines:goroutines</code> or <code>/memory/classes/heap/free:bytes</code>. Fill a <code>[]metrics.Sample</code> with names, call <code>metrics.Read(samples)</code>, check <code>Value.Kind()</code> (<code>KindBad</code> = unsupported) and read <code>Value.Uint64()</code> or <code>Float64()</code>. <code>metrics.All()</code> lists every supported metric.`, why: `A stable, cheap, versioned API for runtime internals that replaces many uses of <code>runtime.ReadMemStats</code>, which stops the world. In the book's metrics.go, three goroutines plus main give a maximum of 4 and 1 before exiting.` },
      { term: `Measuring execution time`, def: `Wrap the work with <code>now := time.Now()</code> and <code>elapsed := time.Since(now)</code>, then log it, for example <code>logger.Info("Observability", slog.Int64("time_taken", int64(elapsed)))</code>.`, why: `<code>time.Duration</code> is an int64 count of nanoseconds. Single measurements are noisy on a busy machine because of the OS and Go schedulers; use benchmarks (Chapter 14) for comparisons and use an efficient logger so the measurement doesn't add load.` },
      { term: `expvar`, def: `Publishes variables as JSON at <code>/debug/vars</code> on the default mux: <code>expvar.NewInt("intVar")</code>, <code>.Set</code>, <code>.Add</code>, and <code>expvar.Publish(name, expvar.Func(...))</code>. <code>expvar.Handler()</code> can be mounted elsewhere, such as <code>/debug/expvars</code>.`, why: `Zero-dependency custom metrics; <code>cmdline</code> and <code>memstats</code> are published automatically. Values are safe for concurrent updates.` },
      { term: `CPU characteristics (cpuid)`, def: `<code>github.com/klauspost/cpuid/v2</code> exposes <code>CPU.BrandName</code>, physical and logical cores, threads per core, feature flags (AVX2, AESNI, ASIMD...), cache line and L1/L2/L3 sizes and frequency.`, why: `Useful for labelling metrics, picking SIMD code paths or sizing worker pools. Detection quality varies: on Apple M1 it reports frequency 0 and L3 -1, while on Intel Linux everything is filled in.` },
      { term: `Prometheus metric types`, def: `<strong>Counter</strong>: cumulative and only goes up (or resets to 0 on restart). <strong>Gauge</strong>: a value that goes up and down. <strong>Histogram</strong>: observations counted into cumulative <code>le</code> buckets plus <code>_sum</code> and <code>_count</code>. <strong>Summary</strong>: <code>_sum</code>, <code>_count</code> and optional client-side quantiles.`, why: `Use counters for requests or errors (query them with <code>rate()</code>), gauges for in-flight requests, memory or goroutines, histograms for latency (aggregatable across instances), summaries when you need exact quantiles from one process.`, demo: `c13Prom` },
      { term: `Exposing metrics with client_golang`, def: `Define metrics with <code>prometheus.NewCounter(prometheus.CounterOpts{Namespace, Name, Help})</code> and friends, register them with <code>prometheus.MustRegister</code>, update them from your code, and serve <code>promhttp.Handler()</code> at <code>/metrics</code>.`, why: `Prometheus <em>pulls</em> (scrapes) the text format on an interval set by <code>scrape_interval</code> in <code>prometheus.yml</code>. Names combine namespace and name: <code>packt_n_goroutines</code>. Verify with <code>curl localhost:1234/metrics</code> before configuring Prometheus.`, demo: `c13Prom` },
      { term: `Docker, Prometheus and Grafana`, def: `A multi-stage Dockerfile builds the binary in <code>golang:alpine</code> and copies it into <code>alpine:latest</code>. docker-compose runs goapp (:1234), Prometheus (:9090, scraping <code>goapp:1234</code>) and Grafana (:3000) on one network; Grafana adds Prometheus as a data source at <code>http://prometheus:9090</code>.`, why: `Containers on a shared network reach each other by <code>container_name</code>. Prometheus stores the time series; Grafana visualizes them, since the Prometheus UI is meant for debugging, not dashboards.` }
    ],
    cheatsheet: [
      { title: `Fuzz test skeleton`, type: `code`, lang: `go`, body: `func FuzzReverse(f *testing.F) {
    for _, seed := range []string{"Hello, world", " ", "!12345"} {
        f.Add(seed) // seed corpus
    }
    f.Fuzz(func(t *testing.T, orig string) {
        rev, err := Reverse(orig)
        if err != nil {
            return // invalid input is rejected, not a bug
        }
        doubleRev, _ := Reverse(rev)
        if orig != doubleRev {
            t.Errorf("Before: %q, after: %q", orig, doubleRev)
        }
        if utf8.ValidString(orig) && !utf8.ValidString(rev) {
            t.Errorf("Reverse produced invalid UTF-8 %q", rev)
        }
    })
}

func Reverse(s string) (string, error) {
    if !utf8.ValidString(s) {
        return s, errors.New("invalid UTF-8")
    }
    r := []rune(s)
    for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
        r[i], r[j] = r[j], r[i]
    }
    return string(r), nil
}

// go test -fuzz=FuzzReverse -fuzztime 10s
// go test -run=FuzzReverse/<hash>   (replay a crasher)` },
      { title: `Fuzzing facts`, type: `list`, items: [
        `Function name starts with <code>Fuzz</code>, takes <code>*testing.F</code>, lives in <code>_test.go</code>.`,
        `<code>f.Add</code> arguments must match the types of the <code>f.Fuzz</code> target after <code>*testing.T</code>.`,
        `Only one target per <code>-fuzz</code> run; the regexp must match exactly one function.`,
        `Crashers go to <code>testdata/fuzz/FuzzXxx/</code> and are replayed by plain <code>go test</code>.`,
        `Generated corpus is cached in <code>$GOCACHE/fuzz</code>; <code>go clean -fuzzcache</code> clears it.`,
        `Best for parsers, decoders and anything that handles untrusted input.`
      ] },
      { title: `Prometheus metric types`, type: `table`, headers: [`Type`, `Goes down?`, `Exposed as`, `Typical use`], rows: [
        [`Counter`, `No (resets to 0 on restart)`, `name 19.94`, `Requests served, errors, bytes written; query with rate()`],
        [`Gauge`, `Yes`, `name 29.33`, `Goroutines, memory, queue length, in-flight requests`],
        [`Histogram`, `n/a`, `name_bucket{le="..."}, name_sum, name_count`, `Latency/size distributions; quantiles computed server-side, aggregatable`],
        [`Summary`, `n/a`, `name{quantile="0.9"}, name_sum, name_count`, `Client-side quantiles for one instance; not aggregatable`]
      ], note: `client_golang summaries have no quantile objectives by default, which is why the book's output shows only _sum and _count.` },
      { title: `Observability toolbox`, type: `table`, headers: [`Need`, `Go tool`], rows: [
        [`Runtime internals (goroutines, heap, GC)`, `runtime/metrics: metrics.Read([]metrics.Sample)`],
        [`Time one operation`, `time.Now() + time.Since(), logged with log/slog`],
        [`Quick JSON metrics endpoint`, `expvar: NewInt, NewMap, Publish, served at /debug/vars`],
        [`Hardware details`, `github.com/klauspost/cpuid/v2`],
        [`Time-series storage and alerting`, `Prometheus + client_golang + promhttp.Handler()`],
        [`Dashboards`, `Grafana with a Prometheus data source`]
      ] }
    ],
    interview: [
      { q: `What kinds of bugs is fuzzing good at finding, and what can't it replace?`, a: `Fuzzing finds crashes, panics, infinite loops, out-of-range indexing, encoding errors and violated invariants on inputs no one thought of, especially in parsers, decoders and input validation, which is where security bugs live. It cannot replace unit tests that check specific business results, because a fuzz target usually only checks properties, and it won't find bugs in code paths its inputs cannot reach. Use both.`, diff: `easy` },
      { q: `Walk through the anatomy of a Go fuzz test.`, a: `func FuzzXxx(f *testing.F) in a _test.go file. Optionally call f.Add with seed values. Then call f.Fuzz with a function whose first parameter is *testing.T and whose remaining parameters match the f.Add argument types. The body calls the code under test and checks properties with t.Error/t.Fatal; a panic also counts as a failure. go test runs only the seeds; go test -fuzz=FuzzXxx mutates inputs with coverage guidance until a failure or -fuzztime expires.`, diff: `easy` },
      { q: `Why did reversing a string byte-by-byte fail the fuzz test, and what is the right fix?`, a: `Go strings are UTF-8 byte sequences. Reversing bytes reverses the bytes inside multi-byte characters too: "Ԕ" is d4 94 and becomes 94 d4, which is invalid UTF-8. The double reverse still returns the original, so only the "valid input stays valid" property catches it. The fix is to reverse runes ([]rune(s)), and to reject invalid UTF-8 up front, because converting invalid bytes to runes yields U+FFFD and breaks the round trip. Reversing grapheme clusters (combining accents, emoji with modifiers) would need even more care.`, diff: `med` },
      { q: `After a fuzz failure, plain go test keeps failing. Why, and is that good?`, a: `The minimized failing input is written to testdata/fuzz/FuzzXxx/<hash>, and files there are part of the seed corpus, which plain go test runs as regular subtests. So the test fails until you fix the bug. That's intended: the crasher becomes a permanent regression test and should be committed. Deleting testdata just hides the bug.`, diff: `med` },
      { q: `What are the pillars of observability, and which one does the chapter focus on?`, a: `Logs (discrete events), metrics (numeric measurements over time), traces (the path of a request through components), plus monitoring, alerting and distributed tracing. The chapter focuses on metrics: Go runtime metrics, custom timings, expvar and Prometheus. Profiling and tracing are covered in Chapter 12, and logging in Chapters 1 and 7.`, diff: `easy` },
      { q: `How do you read Go runtime metrics without stopping the world?`, a: `Use runtime/metrics. Create a []metrics.Sample with Name set to supported metric paths (from metrics.All()), call metrics.Read(samples), check Value.Kind() for KindBad, and extract Uint64/Float64/Float64Histogram. Unlike runtime.ReadMemStats, which stops the world, metrics.Read is designed to be cheap enough to call regularly, for example on each Prometheus scrape. The Prometheus Go collector uses it internally.`, diff: `med` },
      { q: `Counter or gauge? Give examples and explain how a counter reset is handled.`, a: `Counter: monotonically increasing totals such as requests served, errors, bytes sent. You almost always query it with rate() or increase(). Gauge: a current value that can go down, such as goroutines, heap in use, queue depth or temperature. If the process restarts, a counter goes back to 0; Prometheus's rate() detects the decrease and treats it as a reset, so the rate stays correct. Never use a counter for something that can legitimately decrease.`, diff: `med` },
      { q: `Histogram vs summary in Prometheus?`, a: `A histogram counts observations into fixed cumulative buckets (le="0.1", le="1", ..., le="+Inf") plus _sum and _count; quantiles are estimated at query time with histogram_quantile(), and buckets from many instances can be summed, so you can compute a fleet-wide p99. A summary computes quantiles inside the process over a sliding window; they're accurate for that instance but cannot be aggregated across instances, and they cost more CPU per observation. Prefer histograms with buckets chosen around your SLOs.`, diff: `hard` },
      { q: `How does the book's Prometheus setup fit together?`, a: `The Go app registers gauges (packt_n_goroutines, packt_n_memory) and serves promhttp.Handler() on :1234/metrics. A goroutine periodically reads runtime/metrics and calls Set. The app runs in a container built with a multi-stage Dockerfile. docker-compose starts goapp, Prometheus (:9090, scrape_interval 5s, target goapp:1234 via prometheus.yml) and Grafana (:3000) on one bridge network. Grafana uses http://prometheus:9090 as its data source, and dashboards plot the metrics.`, diff: `med` },
      { q: `What is expvar and when would you use it over Prometheus?`, a: `expvar is a standard-library package that publishes variables (Int, Float, String, Map, Func) as JSON at /debug/vars, including cmdline and memstats automatically. It needs no dependency or server-side setup, which makes it good for debugging, internal tools or simple health pages. Prometheus adds a typed metrics model, labels, histograms, long-term storage, queries and alerting, which you need for production monitoring.`, diff: `easy` }
    ],
    labs: [`c13Fuzz`, `c13Prom`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch14`, part: 5, number: 14,
    title: `Efficiency and Performance`,
    overview: `Prove it, don't guess it. The chapter shows how to write <strong>benchmarks</strong> (<code>testing.B</code>, <code>b.N</code>, <code>-bench</code>, <code>-benchmem</code>, <code>b.Run</code> sub-benchmarks, <code>-shuffle</code>), compares pre-allocated vs appended slices, cuts allocations by reusing a <code>bytes.Buffer</code> passed by pointer and <code>Reset()</code>, compares buffer sizes for file I/O, and compares runs with <strong>benchstat</strong>. It warns about <strong>wrongly defined benchmarks</strong> whose work grows with <code>b.N</code>. Then it looks at <strong>memory management</strong>: heap vs stack, <strong>escape analysis</strong> with <code>-gcflags '-m'</code>, the elements of the memory layout, <strong>memory leaks</strong> from subslices and from maps that never shrink, and <strong>pre-allocation</strong>. It ends with tracing <code>getuid(2)</code> through <strong>eBPF</strong> from Go.`,
    concepts: [
      { term: `Benchmark functions`, def: `<code>func BenchmarkXxx(b *testing.B)</code> in a <code>_test.go</code> file runs the measured code inside <code>for i := 0; i &lt; b.N; i++</code>. Run with <code>go test -bench=.</code> (a regexp); without <code>-bench</code>, no benchmarks run.`, why: `Thinking one version is faster is not enough; benchmarks prove it. Benchmark on an idle machine: the author's four parallel Java runs took a day, while one alone took 1.7 hours.`, demo: `c14BenchN` },
      { term: `How b.N grows`, def: `The framework runs the function with b.N = 1, measures, then reruns with larger b.N until the total time reaches <code>-benchtime</code> (1s by default). The book describes the sequence 1, 2, 5, 10, 20, 50...; current Go predicts the next b.N from the measured ns/op (growing at most 100x per step, capped at 1e9).`, why: `Fast functions run millions of times, slow ones a few times, and the reported ns/op is total time / b.N. <code>-benchtime=100x</code> fixes the iteration count; <code>-count=10</code> repeats the whole benchmark for statistics.`, demo: `c14BenchN` },
      { term: `Reading benchmark output`, def: `<code>BenchmarkNew-10   255704   79712 ns/op</code>: the suffix is GOMAXPROCS, then the final b.N, then the average time per op. With <code>-benchmem</code> (or <code>b.ReportAllocs()</code>), B/op and allocs/op follow.`, why: `Allocations usually explain speed differences: the slice built with append was about 1.8x slower than the pre-allocated one because it reallocates and copies as its capacity grows.` },
      { term: `Defeating the optimizer`, def: `Store results in a package-level variable (<code>t = InitSliceNew(i)</code>, <code>ERR = err</code>) so the compiler cannot prove the call is useless and remove it. Do setup before the loop; use <code>b.ResetTimer()</code>, <code>b.StopTimer()</code> / <code>b.StartTimer()</code> to exclude setup.`, why: `A benchmark of eliminated code reports impossibly low numbers such as 0.3 ns/op. Go 1.24 added <code>for b.Loop() { ... }</code>, which handles timing and keeps results alive automatically.` },
      { term: `Wrongly defined benchmarks`, def: `If the work per iteration depends on <code>i</code> or <code>b.N</code>, as in <code>fibo1(i)</code> or <code>fibo1(b.N)</code> inside the loop, ns/op never converges, because every larger b.N makes each op more expensive. <code>fibo1(10)</code> in the loop is correct.`, why: `Such benchmarks run for a very long time or report meaningless numbers. Note that the book's own BenchmarkNew/BenchmarkAppend pass <code>i</code> as the slice size, so their ns/op also depends on b.N; a fixed size is the cleaner design.`, demo: `c14BenchN` },
      { term: `Reducing allocations`, def: `<code>writeMessage</code> allocates a new <code>bytes.Buffer</code> per call: 50 allocs/op. Passing the buffer <em>by value</em> still copies it (50 allocs/op). Passing a pointer drops to 0 allocs/op but 2,120 B/op as the buffer keeps growing; adding <code>buffer.Reset()</code> gives 0 B/op and about 150 ns/op, roughly 7x faster.`, why: `<code>Reset()</code> keeps the underlying byte slice and sets the length to zero, so memory is reused, the allocator does less work and the GC has fewer short-lived objects. The same idea leads to <code>sync.Pool</code>.`, demo: `c14BenchN` },
      { term: `Sub-benchmarks with b.Run`, def: `<code>b.Run(name, func(b *testing.B) {...})</code> creates named sub-benchmarks, so one table of buffer sizes x files (3x3) replaces nine functions. A helper like <code>benchmarkCreate(b, buffer, filesize)</code> is not itself a benchmark.`, why: `The I/O results show reading a 5k-line file with a 1-byte buffer at about 1.3 ms vs 33 µs with a 96-byte buffer: buffer size matters far more than anything else here.` },
      { term: `benchstat`, def: `<code>go install golang.org/x/perf/cmd/benchstat@latest</code>; save runs with <code>go test -bench=. -count=10 &gt; old.txt</code>, then <code>benchstat old.txt new.txt</code>. It reports medians, confidence intervals, the delta, and a p-value; <code>~</code> means no statistically significant difference.`, why: `Single runs are noisy. benchstat needs several samples (it warns: need &gt;= 6 samples for a confidence interval, &gt;= 4 to detect a difference), which is why <code>-count</code> matters. It replaces benchcmp.` },
      { term: `Heap vs stack`, def: `Each goroutine has its own growable stack for automatic allocations (locals whose lifetime the compiler can prove). The heap is shared and holds dynamic allocations; it is what the GC manages.`, why: `Stack allocation is nearly free and creates no GC work. In Go, unlike C++ <code>new</code>, <code>new()</code> and <code>make()</code> don't decide placement: the compiler does, so returning a pointer to a local variable is perfectly safe.` },
      { term: `Escape analysis (-gcflags '-m')`, def: `<code>go build -gcflags '-m'</code> (or <code>go run</code>) prints the compiler's decisions: <em>can inline</em>, <em>escapes to heap</em>, <em>moved to heap</em>, <em>does not escape</em>, <em>leaking param</em>. <code>-m -m</code> shows the reasoning flow; <code>-l</code> disables inlining.`, why: `Values escape when they outlive the function (returned pointers, stored in globals or heap objects, captured by escaping closures), when their size is unknown or too big for the stack, or when converted to an interface and passed to something like <code>fmt.Println</code>. Don't ship binaries built with debug gcflags.`, demo: `c14Escape` },
      { term: `Memory layout elements`, def: `Program code and global (read-only) data are memory-mapped by the OS; uninitialized data (package globals) is allocated once and never freed; then there is the GC-managed heap and the goroutine stacks. The Go allocator hands out heap memory in size classes from per-P caches to avoid fragmentation and locking.`, why: `Problems come from keeping heap objects reachable longer than needed, because then the GC cannot free them. That is what "memory leak" means in a garbage-collected language.` },
      { term: `Slice memory leaks`, def: `<code>val := s[:3]</code> shares the backing array of <code>s</code>. Keeping the 3-element slice keeps the whole 1,000,000-int array (8 MB) alive. <code>-gcflags '-m -l'</code> flags it as <em>leaking param: s to result</em>. Fix: <code>make</code> a small slice and <code>copy</code> into it (or <code>slices.Clone</code>).`, why: `Common in parsers that keep a small token out of a big buffer. Similarly, slicing off the front of a slice of pointers leaves the old pointers reachable unless you nil them out.`, demo: `c14Leaks` },
      { term: `Maps don't shrink`, def: `Deleting every key keeps the map's buckets: the book's 2,000,000-entry <code>map[int][128]byte</code> went from about 928 MB to about 601 MB after deleting everything and running GC, and only dropped to 119 KB after <code>m = nil</code>.`, why: `A long-lived cache map that once held a burst of entries holds that memory forever. Recreate the map (copy live entries into a new one) or set it to nil. <code>clear(m)</code> also keeps the buckets. Storing pointers or smaller values reduces the cost.`, demo: `c14Leaks` },
      { term: `Pre-allocation`, def: `<code>make([]int, 0, 100)</code> and <code>make(map[string]int, 10)</code> reserve capacity up front, so appends and inserts don't trigger repeated growth and copying.`, why: `Worth it when you know or can estimate the size and expect many insertions, especially for large data. Over-allocating wastes memory, so use real estimates.`, demo: `c14BenchN` },
      { term: `eBPF`, def: `Extended Berkeley Packet Filter: a sandboxed virtual machine inside the Linux kernel that runs verified user-supplied programs attached to hooks (kprobes, uprobes, tracepoints, network). Used for networking, security and observability.`, why: `Production-safe, low-overhead visibility into syscalls and kernel behavior without kernel modules. The book's uid.go uses <code>github.com/iovisor/gobpf/bcc</code> to attach a uprobe to libc's <code>getuid</code> and count calls per user ID in a <code>BPF_HASH</code>. Try existing tools (bpftrace, BCC) before writing your own.` }
    ],
    cheatsheet: [
      { title: `Benchmark commands`, type: `table`, headers: [`Command`, `Meaning`], rows: [
        [`go test -bench=.`, `Run all benchmarks (plus tests); -run=^$ skips the tests`],
        [`-benchmem`, `Add B/op and allocs/op columns`],
        [`-benchtime=3s / -benchtime=1000x`, `Target duration, or an exact b.N`],
        [`-count=10`, `Repeat each benchmark (feed to benchstat)`],
        [`-cpu=1,2,4`, `Run with several GOMAXPROCS values`],
        [`-cpuprofile=c.out -memprofile=m.out`, `Profile while benchmarking`],
        [`benchstat old.txt new.txt`, `Statistical comparison; ~ means no significant change`]
      ] },
      { title: `Benchmark patterns`, type: `code`, lang: `go`, body: `var sink []int // package-level: keeps results alive

func BenchmarkInitNew(b *testing.B) {
    b.ReportAllocs()
    for i := 0; i < b.N; i++ {
        sink = InitSliceNew(1000) // fixed size, not i or b.N
    }
}

func BenchmarkRead(b *testing.B) {
    for _, size := range []int{1, 16, 96} {
        b.Run(fmt.Sprintf("buf-%d", size), func(b *testing.B) {
            data := setup()  // not timed...
            b.ResetTimer()   // ...because the timer restarts here
            for i := 0; i < b.N; i++ {
                countChars = CountChars(data, size)
            }
        })
    }
}

// Go 1.24+: for b.Loop() { InitSliceNew(1000) }` },
      { title: `Escape analysis messages`, type: `table`, headers: [`Message`, `Meaning`], rows: [
        [`can inline f`, `f is cheap enough (cost &lt;= 80) to be inlined`],
        [`x does not escape`, `x stays on the stack`],
        [`x escapes to heap`, `the value flows somewhere outliving the frame (often interface args to fmt)`],
        [`moved to heap: x`, `a local variable whose address escapes is heap-allocated`],
        [`leaking param: s to result`, `the result aliases the parameter, e.g. returning s[:3]`],
        [`leaking param content`, `what s points to escapes, but not s itself`]
      ], note: `go build -gcflags='-m' ./... ; add -m -m for reasons and -l to disable inlining.` },
      { title: `Memory hygiene`, type: `list`, items: [
        `Pre-allocate: <code>make([]T, 0, n)</code>, <code>make(map[K]V, n)</code>, <code>strings.Builder.Grow</code>.`,
        `Reuse buffers: pass <code>*bytes.Buffer</code> and <code>Reset()</code>, or use <code>sync.Pool</code>.`,
        `Copy small pieces out of big slices: <code>slices.Clone(s[:3])</code> or <code>make</code> + <code>copy</code>.`,
        `Recreate or nil out maps that shrank a lot; buckets are never released.`,
        `Prefer values to pointers in big collections: fewer heap objects and less GC scanning.`,
        `Measure with <code>-benchmem</code>, pprof heap profiles and <code>runtime.ReadMemStats</code>.`
      ] }
    ],
    interview: [
      { q: `How does the benchmark framework decide how many iterations to run?`, a: `It calls the benchmark function repeatedly with increasing b.N. It starts at 1, measures the elapsed time, and estimates how many iterations would fill -benchtime (1s by default), growing b.N each round (at most 100x per round, capped at 1e9) until a run lasts at least benchtime. The final b.N and total time / b.N are reported. That's why the loop must do the same amount of work each iteration: the framework assumes the cost per op is constant.`, diff: `med` },
      { q: `What is wrong with "for i := 0; i < b.N; i++ { _ = fibo1(i) }"?`, a: `The work per iteration grows with i, so the average cost per op grows with b.N. Each time the framework raises b.N to reach the time target, the ops get more expensive, so ns/op never converges, the run can take extremely long, and the result means nothing. The same applies to fibo1(b.N) inside the loop. Benchmark a fixed input (fibo1(10)) or use sub-benchmarks for several sizes. Also assign the result to a package-level sink so the call can't be optimized away.`, diff: `med` },
      { q: `Why was InitSliceAppend slower than InitSliceNew?`, a: `InitSliceNew does make([]int, n) once and fills by index: one allocation. InitSliceAppend starts with an empty slice; whenever length reaches capacity, append allocates a bigger array (about 2x for small slices, about 1.25x plus a constant for large ones, rounded up to allocator size classes) and copies the old elements. That means about log(n) allocations plus copying and more GC garbage. make([]int, 0, n) + append gets the same single allocation while keeping append's convenience.`, diff: `easy` },
      { q: `Explain the bytes.Buffer benchmark results: by value, by pointer, pointer + Reset.`, a: `By value: every call copies the Buffer struct, and its internal slice grows inside the copy, so the 50 writes per op still allocate 50 times; no gain. By pointer: one shared buffer, so 0 allocs/op, but it keeps growing (2,120 B/op on average as it occasionally reallocates bigger arrays) and copying grows with it. Pointer + Reset(): length goes back to 0 and the same backing array is reused, so 0 B/op and 0 allocs/op at about 150 ns/op versus about 1,050 ns/op. Lessons: avoid copying structs that own buffers, and reuse memory.`, diff: `hard` },
      { q: `How do you know whether a variable is on the heap or the stack?`, a: `You don't decide it; the compiler does with escape analysis. Inspect it with go build -gcflags='-m' (or -m -m for the reasoning). A variable is heap-allocated if it may outlive its function (its address is returned or stored in a heap object or global, captured by a closure that escapes, sent on a channel), if its size isn't known at compile time or is very large, or if it's converted to an interface in a way the compiler can't see through. new() and make() don't force heap allocation.`, diff: `med` },
      { q: `Can a garbage-collected Go program leak memory? Give two examples from the chapter.`, a: `Yes: a leak is memory that stays reachable but is no longer needed. First, subslicing: returning s[:3] from a 1,000,000-element slice keeps the whole backing array alive (escape analysis reports "leaking param: s to result"); copy the three elements into a new slice instead. Second, maps: after deleting all 2,000,000 entries the map keeps its buckets (about 600 MB in the book) until you set it to nil or replace it. Other classic causes: goroutines blocked forever, unstopped tickers, and global caches without eviction.`, diff: `med` },
      { q: `What does benchstat give you that a single go test -bench run doesn't?`, a: `Statistics. With multiple samples per benchmark (-count=10) it reports the median and a confidence interval for each, the percentage change between two files, and a p-value from a significance test. If the difference isn't significant it prints ~ instead of a misleading delta. With too few samples it warns that it can't compute an interval. A geometric mean summarizes all benchmarks.`, diff: `med` },
      { q: `When is pre-allocation worth it, and when is it harmful?`, a: `It helps when you know or can estimate the final size and will insert many elements: appending into make([]T, 0, n), or make(map[K]V, n) before a bulk load. That avoids repeated grow-and-copy and rehashing, and creates less garbage. It hurts when estimates are wildly high (wasted memory held for the object's lifetime) or for tiny collections where it adds complexity for nothing. Measure with -benchmem.`, diff: `easy` },
      { q: `What is eBPF and why is it attractive for observability?`, a: `eBPF is a sandboxed bytecode VM inside the Linux kernel. Small programs are verified for safety and attached to hooks such as kprobes, uprobes, tracepoints, sockets or XDP, and share data with user space through maps. For observability it lets you trace syscalls and kernel events in production with low overhead, without kernel modules or restarting apps. From Go you can use libbpfgo, cilium/ebpf, or gobpf/bcc (which the book uses to count getuid calls per UID).`, diff: `hard` }
    ],
    labs: [`c14BenchN`, `c14Escape`, `c14Leaks`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch15`, part: 5, number: 15,
    title: `Changes in Recent Go Versions`,
    overview: `A short tour of what changed in Go 1.20-1.22. <code>rand.Seed()</code> is no longer needed because the global generator is seeded randomly; use <code>rand.New(rand.NewSource(seed))</code> when you want a reproducible sequence. Go 1.21 added <strong>sync.OnceFunc</strong> and the built-in <strong>clear</strong>. Go 1.22 made <strong>loop variables per-iteration</strong>, allowed <strong>range over integers</strong>, made the slice-shrinking functions in <code>slices</code> <strong>zero the vacated tail</strong> and added <code>slices.Concat</code>, introduced <strong>math/rand/v2</strong> with the generic <code>rand.N</code>, and enhanced <code>net/http.ServeMux</code> patterns with methods and wildcards.`,
    concepts: [
      { term: `rand.Seed() is obsolete`, def: `Since Go 1.20 the global <code>math/rand</code> generator is seeded randomly at startup, so <code>rand.Seed(time.Now().UnixNano())</code> is unnecessary, and <code>rand.Seed</code> is deprecated. Existing calls still work.`, why: `For a reproducible sequence create your own generator: <code>r := rand.New(rand.NewSource(seed))</code>. The same seed always gives the same values (seed 1 starts with 5577006791947779410). Never use math/rand for secrets; use crypto/rand.` },
      { term: `sync.OnceFunc`, def: `<code>func OnceFunc(f func()) func()</code> (Go 1.21) returns a function that calls <code>f</code> only on its first invocation, however many goroutines call it. Siblings <code>sync.OnceValue</code> and <code>sync.OnceValues</code> also cache results.`, why: `A tidier alternative to a <code>sync.Once</code> plus a wrapper for lazy initialization of config, connections or files. In the book, 10 goroutines call it twice over; <code>x</code> is set to 5 once, then incremented to 15 and stays 15. If <code>f</code> panics, every call re-panics with the same value.` },
      { term: `clear()`, def: `Built-in in Go 1.21. On a <strong>map</strong> it deletes all entries (length 0). On a <strong>slice</strong> it sets every element up to <code>len</code> to its zero value, keeping length and capacity. It also works on type parameters whose type set is maps or slices.`, why: `<code>clear(s)</code> on <code>[0 1 2 3 4]</code> (len 5, cap 10) gives <code>[0 0 0 0 0]</code> with len 5 and cap 10, which is not the same as <code>s = s[:0]</code>. <code>clear(m)</code> can delete NaN keys, which a delete loop cannot, but like delete it keeps the map's buckets allocated.`, demo: `c15Slices` },
      { term: `slices changes in Go 1.22`, def: `<code>slices.Delete</code>, <code>DeleteFunc</code>, <code>Compact</code>, <code>CompactFunc</code> and <code>Replace</code> now zero the elements between the new length and the old length. <code>slices.Concat(s1, s2, s3)</code> concatenates slices into a new one.`, why: `<code>v2 := slices.Delete(v1, 1, 3)</code> on <code>[-1 1 2 3 4]</code> returns <code>[-1 3 4]</code> and leaves <code>v1</code> as <code>[-1 3 4 0 0]</code>. Zeroing the tail lets the GC free objects that the old tail pointed to, and makes accidental use of the stale slice obvious. Always use the returned slice.`, demo: `c15Slices` },
      { term: `Per-iteration loop variables (Go 1.22)`, def: `In modules declaring <code>go 1.22</code> or later, each iteration of a 3-clause or range <code>for</code> loop gets a fresh copy of its loop variables.`, why: `Closures and goroutines that capture <code>val</code> now see that iteration's value (the book prints <code>5 3 4 1 2</code>, in scheduler order), and <code>&amp;v</code> differs per iteration. Before 1.22 all of them shared one variable and usually printed the last value, the most common Go gotcha, fixed with <code>v := v</code>. The behaviour depends on the go line in go.mod, not on the toolchain version.`, demo: `c15LoopVar` },
      { term: `range over int (Go 1.22)`, def: `<code>for x := range 5 { ... }</code> iterates x = 0, 1, 2, 3, 4. <code>for range n</code> repeats n times without a variable.`, why: `A cleaner replacement for <code>for i := 0; i &lt; n; i++</code>. Go 1.23 went further with range-over-function iterators (<code>iter.Seq</code>).`, demo: `c15LoopVar` },
      { term: `math/rand/v2`, def: `The first v2 package in the standard library (Go 1.22). It has generic <code>rand.N[T intType](n T) T</code> (works for int, uint, and even <code>time.Duration</code>), <code>IntN</code>/<code>UintN</code> instead of <code>Intn</code>, better generators (ChaCha8 by default, PCG), and no <code>Seed</code> and no <code>Read</code> function.`, why: `<code>rand.N(uint(100))</code> returns a uint and <code>rand.N(10*time.Second)</code> a random Duration. The removed <code>Read</code> can be rebuilt from <code>Uint64()</code> as the book shows, but use crypto/rand for random bytes that must be unpredictable.` },
      { term: `Enhanced ServeMux patterns (Go 1.22)`, def: `<code>net/http.ServeMux</code> patterns can include a method and wildcards: <code>mux.HandleFunc("GET /users/{id}", h)</code>, read with <code>r.PathValue("id")</code>; <code>{path...}</code> matches the rest and <code>{$}</code> anchors the end.`, why: `Many services that used gorilla/mux only for methods and path variables can now use the standard library. The most specific pattern wins, and a method mismatch returns 405 with an Allow header.` }
    ],
    cheatsheet: [
      { title: `Go 1.20-1.22 at a glance`, type: `table`, headers: [`Version`, `Change`, `What to do`], rows: [
        [`1.20`, `Global math/rand seeded automatically; rand.Seed deprecated`, `Remove Seed calls; use rand.New(rand.NewSource(seed)) for repeatability`],
        [`1.21`, `sync.OnceFunc / OnceValue / OnceValues`, `Lazy one-time init without boilerplate`],
        [`1.21`, `clear(map) and clear(slice) built-in`, `Empty a map; zero a slice in place`],
        [`1.21`, `slices, maps, cmp packages; min / max built-ins; log/slog`, `Replace hand-written helpers`],
        [`1.22`, `Per-iteration loop variables; range over int`, `Drop v := v; write for i := range n`],
        [`1.22`, `slices.Delete and friends zero the tail; slices.Concat`, `Use only the returned slice`],
        [`1.22`, `math/rand/v2 (rand.N, IntN, ChaCha8, PCG)`, `Prefer it for new code`],
        [`1.22`, `ServeMux: "GET /path/{id}", r.PathValue`, `Fewer third-party routers needed`]
      ] },
      { title: `Recent-features snippets`, type: `code`, lang: `go`, body: `// Reproducible random numbers (Go 1.20+)
r := rand.New(rand.NewSource(1))
fmt.Println(r.Uint64()) // same value for the same seed

// One-time initialization (Go 1.21)
initDB := sync.OnceFunc(func() { db = connect() })
for range 10 {
    go initDB() // connect() runs exactly once
}

// clear (Go 1.21)
m := map[string]int{"One": 1, "Two": 2}
clear(m)        // map[]
s := []int{0, 1, 2, 3, 4}
clear(s)        // [0 0 0 0 0], same len and cap

// slices (Go 1.22)
v1 := []int{-1, 1, 2, 3, 4}
v2 := slices.Delete(v1, 1, 3) // v2=[-1 3 4], v1=[-1 3 4 0 0]
all := slices.Concat([]int{1, 2}, []int{-1, -2})

// math/rand/v2 (Go 1.22)
n := randv2.N(100)                 // int
d := randv2.N(5 * time.Second)     // time.Duration` },
      { title: `Loop variable rules`, type: `list`, items: [
        `The semantics follow the <code>go</code> directive in <code>go.mod</code>: <code>go 1.22</code> or later gives per-iteration variables.`,
        `Applies to <code>for i := 0; i &lt; n; i++</code> and <code>for k, v := range x</code> loops.`,
        `Goroutines capturing the loop variable no longer race on a shared variable.`,
        `<code>&amp;v</code> inside a range loop now points to a different variable each iteration.`,
        `<code>go vet</code>'s loopclosure check is no longer needed for 1.22+ modules.`
      ] }
    ],
    interview: [
      { q: `What changed about loop variables in Go 1.22 and why did it matter?`, a: `Before 1.22 a for loop declared its variables once and updated them each iteration, so closures, goroutines and &v captured the same variable and typically all saw the final value: a top source of bugs, fixed by writing v := v. From Go 1.22, in modules with go 1.22 or later in go.mod, each iteration has its own copy, so capturing is safe. The change is gated on the module's go version so old code keeps its meaning until it opts in.`, diff: `easy` },
      { q: `Is clear(s) the same as s = s[:0]? What about clear on a map?`, a: `No. clear(s) zeroes every element in s[0:len(s)] and keeps the length and capacity, so the slice still has len elements, all zero. s = s[:0] keeps the elements in the backing array but makes the length 0. clear(m) deletes all entries so len(m) == 0; unlike a delete loop it can also remove NaN keys. Neither releases the underlying memory: the slice's array and the map's buckets stay allocated.`, diff: `med` },
      { q: `Why does slices.Delete zero the tail since Go 1.22?`, a: `Delete shifts the remaining elements left and returns a shorter slice that shares the original backing array. Before 1.22 the elements past the new length kept their old values: stale pointers kept objects alive (a memory leak), and code that kept using the original slice saw duplicates. Zeroing obsolete elements lets the GC reclaim what they referenced and makes misuse visible ([-1 3 4 0 0]). Always use the returned slice.`, diff: `med` },
      { q: `Do you still need rand.Seed? How do you get a deterministic sequence?`, a: `No. Since Go 1.20 the top-level math/rand functions use a randomly seeded source, and rand.Seed is deprecated. For reproducible tests or simulations create a private generator: r := rand.New(rand.NewSource(seed)), and use r's methods. In math/rand/v2 use rand.New(rand.NewPCG(s1, s2)) or NewChaCha8(seed). For keys, tokens or IDs that must be unpredictable, use crypto/rand.`, diff: `easy` },
      { q: `How does sync.OnceFunc compare with sync.Once?`, a: `sync.Once has a Do(f) method, and you need to keep the Once and call once.Do(f) at every call site. sync.OnceFunc(f) wraps that into a func() you can call anywhere; the first call runs f and later or concurrent calls wait for it to finish and then return. OnceValue/OnceValues also return cached results, which is perfect for lazy loading config. One difference: if f panics, the OnceFunc wrapper re-panics on every later call, whereas with sync.Once later Do calls just return without running f.`, diff: `hard` },
      { q: `What's new in math/rand/v2 compared with math/rand?`, a: `It is a new major version of the package (Go 1.22): generic rand.N for any integer type (including time.Duration), IntN/UintN/Int64N naming, faster and better generators (ChaCha8 is the default global source, PCG is available), the top-level functions are always randomly seeded, and Seed and Read were removed. The book shows how to rebuild Read with Uint64 if you need it.`, diff: `med` }
    ],
    labs: [`c15LoopVar`, `c15Slices`]
  },

  // ------------------------------------------------------------------
  {
    id: `appA`, part: 5, number: `A`,
    title: `Appendix: The Go Garbage Collector`,
    overview: `How Go frees memory you no longer reference. The Go GC is a <strong>concurrent, parallel, precise (type-accurate) tri-color mark-and-sweep</strong> collector with a <strong>write barrier</strong>; it is <strong>non-generational and non-compacting</strong>, and allocates from size-segregated per-P areas. The appendix shows how to observe it with <code>runtime.ReadMemStats</code> (Alloc, TotalAlloc, HeapAlloc, NumGC) and <code>GODEBUG=gctrace=1</code>, explains the white/gray/black sets, roots, the mutator and the write barrier, why <code>runtime.GC()</code> blocks, and compares a slice, a map with pointers, a map without pointers and a sharded map holding 80 million entries, where the pointer map is by far the slowest.`,
    concepts: [
      { term: `Key characteristics`, def: `From the runtime docs: the GC runs <strong>concurrently</strong> with mutator threads, is <strong>type accurate</strong> (precise), lets several GC threads run in <strong>parallel</strong>, is a concurrent <strong>mark and sweep</strong> with a <strong>write barrier</strong>, and is <strong>non-generational</strong> and <strong>non-compacting</strong>.`, why: `The appendix's own bullet list calls the GC "generational" with young and old generations; that contradicts the runtime documentation it quotes. Go's GC has no generations and never moves objects; it relies on escape analysis to keep short-lived values off the heap instead.` },
      { term: `Observing the GC`, def: `<code>runtime.ReadMemStats(&amp;m)</code>: <code>Alloc</code>/<code>HeapAlloc</code> = bytes of live (not yet freed) heap objects, <code>TotalAlloc</code> = cumulative bytes ever allocated (never decreases), <code>NumGC</code> = completed cycles. <code>GODEBUG=gctrace=1</code> prints a line per cycle.`, why: `In gColl.go, 10 slices of 50 MB give TotalAlloc ≈ 500 MB but Alloc ≈ 50 MB after 9 cycles: garbage is reclaimed continuously. A high NumGC suggests the code allocates too much.`, demo: `cAPacer` },
      { term: `Reading a gctrace line`, def: `<code>gc 20 @45.111s 0%: ... 95-&gt;95-&gt;0 MB, 95 MB goal, ... 10 P</code>: cycle number, time since start, share of CPU used by GC, then heap size at GC start, heap size at GC end, and <strong>live heap</strong> after marking, followed by the heap goal for the next cycle and the number of Ps.`, why: `The live heap and the goal tell you how GOGC is pacing collections; growing live heap across cycles is the signature of a leak.`, demo: `cAPacer` },
      { term: `Tri-color mark and sweep`, def: `Objects are <strong>white</strong> (not yet seen: candidates for collection), <strong>gray</strong> (reachable, children not yet scanned) or <strong>black</strong> (reachable and fully scanned). Marking starts by graying the roots (globals, goroutine stacks, registers), then repeatedly takes a gray object, grays its white children and blackens it. When no gray objects remain, white objects are garbage and are swept.`, why: `The invariant is that <strong>no black object points to a white object</strong>. The idea comes from Dijkstra, Lamport and colleagues, "On-the-Fly Garbage Collection: An Exercise in Cooperation".`, demo: `cAGC` },
      { term: `Mutator and write barrier`, def: `The running program is the <strong>mutator</strong>. While marking is active, every pointer write in the heap goes through a small <strong>write barrier</strong> function that shades (grays) the objects involved, so the mutator cannot hide a white object behind an already-black one.`, why: `Without it, a concurrent collector could free a live object. Go uses a hybrid barrier (Go 1.8+) that shades both the overwritten and the new pointer target, which avoids re-scanning stacks. Objects allocated during marking are treated as already marked. The barrier's cost is the price of running the GC concurrently.`, demo: `cAGC` },
      { term: `Unreachable gray objects`, def: `If an object becomes unreachable after it was grayed during a cycle, it survives that cycle and is collected in the next one. Unreachable objects can never become reachable again, so this is safe ("floating garbage").`, why: `Concurrent collectors trade a bit of extra memory for short pauses. Channels are collected like any other object once unreachable, even if never closed.`, demo: `cAGC` },
      { term: `runtime.GC() and STW phases`, def: `<code>runtime.GC()</code> runs a full collection and blocks the caller until it completes. Even the concurrent GC has short stop-the-world moments, at the start of marking (enabling the write barrier) and at mark termination.`, why: `Forcing GC in a busy program costs throughput and latency; it is useful in tests and benchmarks (and in the book's examples), rarely in production code.` },
      { term: `GOGC and GOMEMLIMIT`, def: `<code>GOGC</code> (default 100) sets the heap goal: the next GC starts when the heap reaches live heap x (1 + GOGC/100), so 100 means "collect when the heap has doubled". <code>GOGC=off</code> disables it. <code>GOMEMLIMIT</code> (Go 1.19+) is a soft memory limit that makes the GC run more often as total memory approaches it. Both can be set at runtime with <code>debug.SetGCPercent</code> and <code>debug.SetMemoryLimit</code>.`, why: `Higher GOGC means fewer GC cycles and less CPU, but more memory; lower means the opposite. These are the "knobs" the appendix mentions, as opposed to Java's many collectors. Not covered in detail by the book.`, demo: `cAPacer` },
      { term: `Pointers make the GC work harder`, def: `The GC only scans memory that may contain pointers. A <code>[]data</code> of structs of ints or a <code>map[int]int</code> is "noscan": marking skips its contents. A <code>map[int]*int</code> has 80 million pointers to 80 million separate heap ints, all of which must be traced.`, why: `The book's timings for 80M entries: slice 1.2 s, <code>map[int]int</code> 10.7 s, sharded map of maps 11.6 s, <code>map[int]*int</code> 14.1 s with 176% CPU (GC workers). Maps are slower than slices because of hashing and non-contiguous buckets, and pointers add GC load, since <code>&amp;value</code> makes each value escape to the heap.`, demo: `cAMaps` },
      { term: `Keeping data alive in tests`, def: `<code>_ = structure[0]</code> after <code>runtime.GC()</code>, or <code>runtime.KeepAlive(x)</code>, keeps a variable reachable up to that point so the GC cannot collect it early.`, why: `The compiler tracks liveness precisely: a variable that is never used again can be collected before the function returns, which would make the experiment measure nothing.` }
    ],
    cheatsheet: [
      { title: `GC at a glance`, type: `table`, headers: [`Property`, `Go's GC`], rows: [
        [`Algorithm`, `Tri-color concurrent mark and sweep`],
        [`Concurrency`, `Runs alongside goroutines; mark work spread over GC workers plus assists`],
        [`Precision`, `Type-accurate: knows exactly which words are pointers`],
        [`Generational?`, `No (despite the appendix's bullet list)`],
        [`Compacting / moving?`, `No; size-segregated per-P allocation limits fragmentation`],
        [`Barrier`, `Hybrid write barrier, enabled only while marking`],
        [`Pacing`, `GOGC (default 100) heap growth target; GOMEMLIMIT soft limit`],
        [`STW pauses`, `Short: mark setup and mark termination, typically well under 1 ms`]
      ] },
      { title: `Inspecting the GC`, type: `code`, lang: `go`, body: `func printStats() {
    var m runtime.MemStats
    runtime.ReadMemStats(&m) // note: stops the world briefly
    fmt.Println("Alloc:", m.Alloc)           // live heap bytes
    fmt.Println("TotalAlloc:", m.TotalAlloc) // cumulative, never shrinks
    fmt.Println("HeapAlloc:", m.HeapAlloc)   // same as Alloc
    fmt.Println("NumGC:", m.NumGC)           // completed cycles
}

// $ GODEBUG=gctrace=1 go run gColl.go
// gc 20 @45.111s 0%: 0.095+0.26+0.009 ms clock, ... 95->95->0 MB, 95 MB goal, 10 P
//                                             start->end->live    next target

// Tuning at runtime
debug.SetGCPercent(200)       // like GOGC=200
debug.SetMemoryLimit(1 << 30) // like GOMEMLIMIT=1GiB` },
      { title: `Tri-color rules`, type: `list`, items: [
        `Start: everything white; roots (globals, stacks) become gray.`,
        `Step: pick a gray object, gray its white children, make it black.`,
        `Invariant: a black object never points to a white object.`,
        `Write barrier: pointer writes during marking shade the objects involved.`,
        `End: no gray left; white objects are unreachable and swept.`,
        `Objects that die mid-cycle are freed next cycle.`
      ] },
      { title: `GC-friendly data structures`, type: `table`, headers: [`Structure (80M entries)`, `Book timing`, `Why`], rows: [
        [`[]data{i, j int}`, `1.2 s`, `Contiguous, no pointers, nothing to scan`],
        [`map[int]int`, `10.7 s`, `Hashing and buckets, but noscan`],
        [`[]map[int]int (2000 shards)`, `11.6 s`, `Same work split across maps; no GC win`],
        [`map[int]*int`, `14.1 s`, `80M escaped heap ints, each must be marked`]
      ], note: `Times are from the book (zsh time on a MacBook); they show relative cost, not absolute performance.` }
    ],
    interview: [
      { q: `Describe Go's garbage collector in one breath.`, a: `A concurrent, parallel, precise, non-generational, non-compacting tri-color mark-and-sweep collector with a hybrid write barrier, paced by GOGC (and GOMEMLIMIT), designed for low latency with sub-millisecond stop-the-world pauses at mark start and mark termination. Allocation uses size classes with per-P caches, and escape analysis keeps many short-lived values off the heap, which is part of why Go can do without generations.`, diff: `med` },
      { q: `Explain the tri-color algorithm and its invariant.`, a: `White = not yet reached (presumed garbage), gray = reached but its references are not scanned yet, black = reached and scanned. Initially all objects are white; roots are grayed. The collector repeatedly picks a gray object, grays every white object it references and blackens it. When the gray set is empty, every reachable object is black and white objects are freed. Invariant: no black object points directly to a white one, because the collector won't revisit black objects, so a white object referenced only from black would be wrongly freed.`, diff: `med` },
      { q: `Why does a concurrent collector need a write barrier? Give the failure scenario.`, a: `The mutator keeps changing pointers while marking runs. Scenario: object A is already black; the program copies the only pointer to white object C from gray object B into A, then deletes B's pointer. The collector scans B, finds nothing, finishes, and frees C even though A still points to it: a dangling pointer and memory corruption. The write barrier runs on pointer writes during marking and shades the objects involved (Go's hybrid barrier shades both the old and new target) so C is grayed and survives.`, diff: `hard` },
      { q: `What does GOGC do? What would GOGC=50 or GOGC=200 change?`, a: `GOGC sets how much the heap may grow over the live heap left by the last cycle before the next cycle starts: goal = live x (1 + GOGC/100). With a 100 MB live heap, GOGC=100 triggers at about 200 MB, GOGC=50 at about 150 MB (more frequent GC, more CPU, less memory) and GOGC=200 at about 300 MB (fewer cycles, less CPU, more memory). GOGC=off disables collection. Since Go 1.19 GOMEMLIMIT adds a soft cap that makes the GC work harder near the limit, which suits containers.`, diff: `med` },
      { q: `What is the difference between MemStats.Alloc and TotalAlloc?`, a: `Alloc (same as HeapAlloc) is the number of bytes in heap objects that are currently allocated, both live objects and garbage that hasn't been swept yet; it rises and falls. TotalAlloc is the cumulative number of bytes ever allocated and only grows. A high TotalAlloc with low Alloc means lots of short-lived garbage (GC churn); steadily rising Alloc after GCs suggests a leak. NumGC counts completed cycles.`, diff: `easy` },
      { q: `Why was map[int]*int so much slower than map[int]int in the appendix's benchmark?`, a: `In mapStar.go, &value makes each value escape, so 80 million ints are allocated individually on the heap, and the map's buckets now contain pointers, so the GC must scan every bucket and trace 80 million pointers on every cycle. map[int]int has no pointers, so the runtime marks its buckets noscan and the GC skips their contents. The slice version is fastest of all: contiguous, no hashing, no pointers. Rule: avoid pointers in large long-lived collections.`, diff: `med` },
      { q: `Is Go's GC generational? Why or why not?`, a: `No. The runtime documentation says it is non-generational and non-compacting (the appendix's bullet saying otherwise is mistaken). Generational collectors rely on moving young objects, which requires compaction or copying and write barriers that are always on. Go doesn't move objects (pointers into objects, unsafe and cgo would make that hard), and escape analysis already keeps many short-lived values on goroutine stacks, so the Go team chose a non-moving concurrent collector tuned for low latency.`, diff: `hard` },
      { q: `Should you call runtime.GC() in production code?`, a: `Rarely. It performs a full blocking collection: the caller waits for the whole cycle and the program pays the CPU cost at that moment, which can hurt latency in a busy service. The pacer usually makes better decisions. Legitimate uses are tests, benchmarks, measuring live heap (as in the book's examples) or right after releasing a huge structure in a batch job. debug.FreeOSMemory additionally returns memory to the OS.`, diff: `easy` }
    ],
    labs: [`cAGC`, `cAPacer`, `cAMaps`]
  }
);
