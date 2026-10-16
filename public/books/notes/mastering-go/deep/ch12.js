// Deep dive: Chapter 12, Code testing and profiling. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch12 = {
  hook: `<p>After a release, an endpoint that used to answer in 20 ms takes 200 ms. The team is sure it is the new JSON library and spends two days swapping it back. Nothing changes. Then someone captures a 30-second CPU profile from the running server, and the top line points at <code>regexp.MustCompile</code>: a pattern that used to be compiled once at startup is now compiled inside the handler, on every request. The fix is moving one line.</p>
<p>Guessing is expensive; measuring is cheap. The same is true for correctness: a test suite that is green because a test is misnamed, cached, or never reaches the broken branch gives false comfort. This chapter covers the tools Go ships for both questions, <em>is it correct?</em> (<code>go test</code>, table-driven tests, coverage, <code>httptest</code>, <code>go vet</code>) and <em>where does the time go?</em> (pprof and the execution tracer), plus the build tooling around them.</p>`,
  sections: [
    {
      id: "testable-main",
      title: "Making code testable, and how go test really runs",
      kicker: "Foundations",
      blocks: [
        {
          type: "problem",
          html: `<p>A test can't call <code>main()</code>. Even if it could, <code>main</code> reads <code>os.Args</code>, writes to <code>os.Stdout</code> and can only report failure by exiting the process, which would end the test run too.</p>`,
        },
        {
          type: "idea",
          html: `<p>Keep <code>main()</code> to three lines and move everything else into <code>run(args []string, out io.Writer) error</code>. A test can then pass any arguments, capture output in a <code>bytes.Buffer</code>, and assert on the returned error.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "main delegates to run",
          code: `func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string, out io.Writer) error {
	if len(args) == 0 {
		return errors.New("usage: wc FILE...")
	}
	for _, name := range args {
		data, err := os.ReadFile(name)
		if err != nil {
			return err
		}
		fmt.Fprintf(out, "%s: %d words\\n", name, len(strings.Fields(string(data))))
	}
	return nil
}`,
        },
        {
          type: "code",
          lang: "go",
          title: "Testing run with a temporary directory",
          code: `func TestRun(t *testing.T) {
	path := filepath.Join(t.TempDir(), "in.txt")
	if err := os.WriteFile(path, []byte("one two three"), 0o644); err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := run([]string{path}, &out); err != nil {
		t.Fatalf("run: %v", err)
	}
	want := path + ": 3 words\\n"
	if got := out.String(); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}`,
          caption: "t.TempDir() returns a fresh directory per test and removes it afterwards. os.TempDir(), by contrast, is the shared system directory, which is how the book's test leaves a file behind that breaks the next run.",
        },
        {
          type: "text",
          html: `<p>The rules are strict and silent. Tests live in files ending in <code>_test.go</code>, and a test function is named <code>TestXxx</code> where the character after <code>Test</code> is not a lowercase letter. <code>Testparse</code> is not a test and never runs, with no warning. <code>go test</code> builds a temporary main package, runs the tests and reports PASS or FAIL; <code>-v</code> prints each test and <code>-run regexp</code> selects them. <code>t.Cleanup(fn)</code> registers teardown that runs after the test, in last-in-first-out order.</p>
<p>In package-list mode (<code>go test ./...</code> or <code>go test ./pkg</code>), successful results are <strong>cached</strong> and printed as <code>(cached)</code>. The cache key covers the test binary, the flags, and the files and environment variables the test read through the <code>os</code> package. It knows nothing about a database, the network or the clock. Use <code>-count=1</code> to force a real run, or <code>go clean -testcache</code> to wipe the cache. Plain <code>go test</code> in a directory, with no package arguments, never caches.</p>`,
        },
        {
          type: "text",
          html: `<h3>Testing signals</h3>
<p>The book tests a UNIX signal handler by starting it as a goroutine inside the test and sending signals to its own process with <code>syscall.Kill(syscall.Getpid(), syscall.SIGUSR1)</code>. The handler must call <code>signal.Notify</code> before the first signal arrives; otherwise the signal's default action applies, and for <code>SIGUSR1</code> that terminates the test binary.</p>`,
        },
        {
          type: "quiz",
          q: "A test reads a row from a local database. You fix the data, run go test ./... and see \"ok ... (cached)\". What is going on?",
          options: [
            "The test is broken and never runs",
            "go test reused a cached result because nothing it tracks (binary, flags, files and env vars read via os) changed; the database is invisible to it",
            "The database driver caches query results between runs",
            "Caching only happens with -v",
          ],
          answer: 1,
          explain: "The test cache can't see external state such as databases, network services or time. Run with -count=1 when a test depends on such state.",
        },
      ],
    },
    {
      id: "table-driven",
      title: "Table-driven tests, subtests and failing well",
      kicker: "The idiom",
      blocks: [
        {
          type: "text",
          html: `<p>Most functions need to be checked against many inputs: normal values, edge cases, empty input, invalid input. Copying a test body per case buries the cases in boilerplate. The Go idiom is a <strong>table</strong>: a slice of structs holding inputs and expected outputs, and one loop that checks them all. Adding a case is adding a line.</p>
<p>Wrapping each case in <code>t.Run(name, func(t *testing.T) {...})</code> turns it into a named <strong>subtest</strong>. Failures report which case broke, a failure in one case doesn't hide the others, and you can run a single case with <code>go test -run 'TestDivide/by_zero'</code> (spaces in names become underscores).</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func TestDivide(t *testing.T) {
	tests := []struct {
		name    string
		a, b    float64
		want    float64
		wantErr bool
	}{
		{"exact", 10, 2, 5, false},
		{"fraction", 5, 4, 1.25, false},
		{"negative", -9, 3, -3, false},
		{"by zero", 1, 0, 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := divide(tt.a, tt.b)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if math.Abs(got-tt.want) > 1e-9 {
				t.Errorf("divide(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
			}
		})
	}
}`,
          caption: "Floats are compared with a tolerance. The book's table expects 1.2 for 5/4 on purpose to show a failure; exact equality on computed floats is fragile even when the expectation is right.",
        },
        {
          type: "text",
          html: `<p><code>t.Error</code> and <code>t.Errorf</code> record a failure and keep going, which is right when later checks are still meaningful. <code>t.Fatal</code> and <code>t.Fatalf</code> record a failure and stop the current test (or subtest) at once by calling <code>runtime.Goexit</code>; deferred calls and cleanups still run. Use Fatal when continuing makes no sense, for example after failing to open a fixture. Fatal must be called from the test's own goroutine, never from a goroutine the test started.</p>
<p>Adding <code>t.Parallel()</code> at the top of a subtest lets cases run concurrently. Before Go 1.22, parallel subtests that captured the loop variable all saw the last case unless you wrote <code>tt := tt</code>; with per-iteration loop variables that line is no longer needed. <code>go test -shuffle=on</code> randomises test order and exposes tests that secretly depend on each other.</p>`,
        },
        {
          type: "lab",
          id: "c12TableTests",
          caption: "Edit the book's division table and watch go test -v re-run. Compare one loop with t.Run subtests, t.Errorf with t.Fatalf, and exact float comparison with a tolerance. Add a 7 / 0 case to see what a panic does.",
        },
        {
          type: "quiz",
          q: "A table has five cases, each in its own t.Run subtest. Case 2 calls t.Fatalf. What happens to cases 3, 4 and 5?",
          options: [
            "They are skipped, because Fatal stops the whole test function",
            "They still run; Fatal stops only the subtest that called it",
            "They run, but their results are discarded",
            "The test binary exits immediately",
          ],
          answer: 1,
          explain: "Each subtest has its own *testing.T. Fatalf ends subtest 2 via runtime.Goexit, the parent marks itself failed, and the loop goes on to the next case. Without subtests, a Fatalf would end the whole loop.",
        },
      ],
    },
    {
      id: "coverage-vet",
      title: "Coverage, unreachable code and property checks",
      kicker: "Seeing what tests miss",
      blocks: [
        {
          type: "text",
          html: `<p><code>go test -cover</code> reports the percentage of statements your tests executed. <code>-coverprofile=coverage.out</code> writes per-block counts, <code>go tool cover -func</code> summarises them per function, and <code>go tool cover -html</code> paints covered code green and uncovered code red. The red is the useful part: it shows branches no test ever reached.</p>`,
        },
        {
          type: "code",
          lang: "sh",
          code: `go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
go tool cover -html=coverage.out
go vet ./...`,
        },
        {
          type: "text",
          html: `<p>Some red can never turn green. In the snippet below, the <code>n == 0</code> branch is unreachable because <code>n &gt;= 0</code> already caught zero, so no test can cover it and 100% is impossible. That is a logic bug, and coverage is how you find it. The compiler also accepts statements after a <code>return</code>; <code>go vet</code> reports them as <em>unreachable code</em>. <code>go test</code> runs only a small, high-confidence subset of vet's checks automatically, so run <code>go vet ./...</code> (or staticcheck) explicitly in CI.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func sign(n int) string {
	if n >= 0 {
		return "non-negative"
	} else if n == 0 { // can never be true: coverage stays red
		return "zero"
	}
	return "negative"
}

func answer() int {
	return 42
	fmt.Println("never printed") // go vet: unreachable code
	return 0
}`,
        },
        {
          type: "lab",
          id: "c12Coverage",
          caption: "Choose which calls the tests make and watch the coverage percentage, the profile and the highlighting change. Try to reach 100% on the book's coverage.go, then see what go vet reports.",
        },
        {
          type: "text",
          html: `<h3>Property checks with testing/quick</h3>
<p><code>testing/quick</code> generates random arguments for a function that returns a bool and reports the first input for which the property is false: <code>quick.Check(func(a, b int) bool { return add(a, b) == add(b, a) }, nil)</code>. It is black-box property testing in the spirit of Haskell's QuickCheck. The package is frozen and no longer gets new features; native fuzzing, covered in the next chapter, is its modern, coverage-guided successor.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>100% statement coverage means every statement ran at least once, not that every behaviour is right. A function can be fully covered by tests that never check its output, and coverage says nothing about input combinations or missing code. Treat low coverage as a warning sign and high coverage as necessary, not sufficient.</p>`,
        },
        {
          type: "quiz",
          q: "Which statement about go test -cover is correct?",
          options: [
            "It reports the percentage of functions with at least one test",
            "It reports the percentage of statements executed by the tests, and a branch that can never run caps it below 100%",
            "100% coverage proves the code has no bugs",
            "It also runs every go vet analyzer",
          ],
          answer: 1,
          explain: "Coverage is statement-based: it counts which statements ran. Unreachable branches stay uncovered forever, which is a useful bug signal. It proves nothing about correctness, and go test runs only a small subset of vet checks.",
        },
      ],
    },
    {
      id: "httptest",
      title: "Testing HTTP handlers with httptest",
      kicker: "No server required",
      blocks: [
        {
          type: "text",
          html: `<p><code>net/http/httptest</code> lets you test handlers without opening a port. <code>httptest.NewRequest</code> builds a server-side request, <code>httptest.NewRecorder()</code> is an in-memory <code>ResponseWriter</code>, and after <code>handler.ServeHTTP(rr, req)</code> you assert on <code>rr.Code</code>, <code>rr.Header()</code> and <code>rr.Body</code>. Calling the <em>whole router</em> rather than a single handler also tests routing, path wildcards and the 404 and 405 behaviour.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func TestGetUser(t *testing.T) {
	a := &api{users: fakeStore{1: {ID: 1, Username: "ana"}}}
	h := a.routes()

	req := httptest.NewRequest(http.MethodGet, "/v1/users/1", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body %q", rr.Code, rr.Body)
	}
	var u userResponse
	if err := json.NewDecoder(rr.Body).Decode(&u); err != nil {
		t.Fatal(err)
	}
	if u.Username != "ana" {
		t.Errorf("username = %q, want ana", u.Username)
	}
}`,
          caption: "fakeStore is a map-backed implementation of the store interface, so the test owns its data and needs no database.",
        },
        {
          type: "text",
          html: `<p>For end-to-end tests of a client, <code>httptest.NewServer(handler)</code> starts a real server on a random loopback port and gives you its <code>URL</code>; <code>defer srv.Close()</code> stops it. With gorilla/mux, <code>mux.SetURLVars</code> injects path variables when you call a handler directly.</p>
<p>The book's REST tests talk to a live database that must already contain an admin user, and the logout test only passes after the login test. Tests like that are order-dependent and fail mysteriously when run alone or shuffled. Prefer tests that create their own fixtures: a fake store behind an interface, or a fresh temporary SQLite file per test.</p>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Write at least as many unhappy-path cases as happy ones: malformed JSON, wrong method, missing or non-numeric ID, unauthorised caller, duplicate create. A table of requests and expected status codes covers them compactly.</p>`,
        },
      ],
    },
    {
      id: "profiling",
      title: "Profiling with pprof: finding where the time goes",
      kicker: "Measure first",
      blocks: [
        {
          type: "idea",
          html: `<p>A CPU profile samples the call stack many times a second while the program runs. Functions that show up in many samples are where the time goes. Optimise only code that is already correct, and only what a profile points at.</p>`,
        },
        {
          type: "text",
          html: `<p>For a command-line program, <code>runtime/pprof</code> does the work: <code>pprof.StartCPUProfile(f)</code> and <code>defer pprof.StopCPUProfile()</code> record CPU samples, and <code>pprof.WriteHeapProfile(f)</code> writes a heap snapshot. For tests and benchmarks, <code>go test -cpuprofile cpu.out -memprofile mem.out</code> does the same without code changes. For a long-running server, the <code>net/http/pprof</code> package serves profiles over HTTP, so you can profile in place under real traffic.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Profiling endpoints on a private port",
          code: `import (
	"log"
	"net/http"
	"net/http/pprof"
)

func startDebugServer() {
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index) // heap, goroutine, block...
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	go func() { log.Println(http.ListenAndServe("localhost:6060", mux)) }()
}`,
          caption: "A blank import of net/http/pprof registers the same handlers on DefaultServeMux. Registering them yourself on a localhost-only listener keeps them off the public port.",
        },
        {
          type: "code",
          lang: "sh",
          code: `go tool pprof -http=localhost:8081 cpu.out
go tool pprof "http://localhost:6060/debug/pprof/profile?seconds=30"
go tool pprof http://localhost:6060/debug/pprof/heap
(pprof) top
(pprof) top10 -cum
(pprof) list parseLine`,
        },
        {
          type: "text",
          html: `<p>Every function in a profile has two numbers. <strong>flat</strong> is time spent in the function's own code. <strong>cum</strong> (cumulative) adds the time of everything it calls. <code>main.main</code> typically has almost no flat time and nearly all the cum time, because it does nothing itself but calls everything. High flat points at the code to optimise; high cum points at the subtree responsible. <code>top</code> sorts by flat, <code>top -cum</code> by cumulative, <code>list fn</code> annotates source lines, and the <code>-http</code> web UI adds a call graph and a flame graph.</p>`,
        },
        {
          type: "diagram",
          title: "flat versus cum in a call tree",
          caption: "handle has little flat time of its own, but its cum time includes parse and encode. parse is where the CPU actually burns, so it is the place to optimise.",
          svg: `<svg viewBox="0 0 640 240" role="img" aria-label="Call tree showing flat and cumulative times for main, handle, parse and encode">
<rect x="230" y="20" width="180" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="320" y="41" text-anchor="middle" font-size="12" font-weight="700">main.main</text>
<text x="320" y="59" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">flat 0 ms, cum 600 ms</text>
<rect x="230" y="100" width="180" height="50" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="320" y="121" text-anchor="middle" font-size="12" font-weight="700">handle</text>
<text x="320" y="139" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">flat 50 ms, cum 600 ms</text>
<rect x="80" y="180" width="180" height="50" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="170" y="201" text-anchor="middle" font-size="12" font-weight="700">parse</text>
<text x="170" y="219" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">flat 400 ms, cum 400 ms</text>
<rect x="380" y="180" width="180" height="50" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="470" y="201" text-anchor="middle" font-size="12" font-weight="700">encode</text>
<text x="470" y="219" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">flat 150 ms, cum 150 ms</text>
<line x1="320" y1="70" x2="320" y2="100" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="290" y1="150" x2="190" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="350" y1="150" x2="450" y2="180" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="430" y="40" font-size="12" style="fill: var(--dg-muted)">flat: own code only</text>
<text x="430" y="60" font-size="12" style="fill: var(--dg-muted)">cum: own code + callees</text>
</svg>`,
        },
        {
          type: "lab",
          id: "c12Pprof",
          caption: "Explore a CPU profile shaped like the book's session: switch between top, top10 -cum, the call tree and list, then optimise the hot function and watch the runtime itself rise to the top, the signal to stop.",
        },
        {
          type: "realworld",
          items: [
            { org: "Kubernetes and Prometheus", title: "pprof built in", html: "Kubernetes control-plane components and the Prometheus server expose the standard <code>/debug/pprof</code> endpoints, so operators can capture CPU, heap and goroutine profiles from a live process with <code>go tool pprof</code>." },
            { org: "Profile-guided optimisation", title: "Profiles feed the compiler", html: "Since Go 1.21, placing a CPU profile named <code>default.pgo</code> in the main package's directory lets <code>go build</code> optimise hot paths (for example, more aggressive inlining) using real production data." },
          ],
        },
        {
          type: "quiz",
          q: "In a CPU profile, main.main has flat 0.01 s and cum 9.8 s; compress has flat 6.1 s and cum 6.3 s. Where should you look first?",
          options: [
            "main.main, because it has the highest cum time",
            "compress, because most of the CPU time is spent in its own code",
            "Neither; flat and cum are unrelated to CPU time",
            "Whichever function was changed most recently",
          ],
          answer: 1,
          explain: "main.main's cum time only says that everything happens somewhere beneath it. compress spends 6.1 s in its own code, which is the concrete work you can make cheaper.",
        },
      ],
    },
    {
      id: "tracing-tooling",
      title: "Tracing, vulnerability checks and build tooling",
      kicker: "The rest of the toolbox",
      blocks: [
        {
          type: "text",
          html: `<p>pprof answers "where is the time spent?". The <strong>execution tracer</strong> answers "when, and why were goroutines waiting?". A trace records goroutine creation, blocking and unblocking, system calls, GC phases and how each logical processor (P) was used over time. Record one with <code>trace.Start(f)</code> and <code>trace.Stop()</code> from <code>runtime/trace</code>, from the <code>/debug/pprof/trace</code> endpoint, or with <code>go test -trace trace.out</code>, then open it with <code>go tool trace trace.out</code>. It is the tool for latency puzzles where the CPU is idle but requests are still slow.</p>
<p>On the client side, <code>net/http/httptrace</code> attaches callbacks to the phases of a single request: DNS, connect, TLS, getting a connection (and whether it was reused), writing the request and the first response byte.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func traceRequest(url string) error {
	trace := &httptrace.ClientTrace{
		DNSDone:     func(i httptrace.DNSDoneInfo) { log.Printf("DNS: %v", i.Addrs) },
		ConnectDone: func(_, addr string, err error) { log.Printf("connect %s: %v", addr, err) },
		GotConn:     func(i httptrace.GotConnInfo) { log.Printf("conn reused: %v", i.Reused) },
		GotFirstResponseByte: func() { log.Print("first byte") },
	}
	ctx := httptrace.WithClientTrace(context.Background(), trace)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, err = io.Copy(io.Discard, resp.Body)
	return err
}`,
          caption: "Call it twice with the same client and the second GotConn reports Reused: true, which is a quick check that your connection pooling works.",
        },
        {
          type: "list",
          items: [
            "<strong>govulncheck</strong> (<code>go install golang.org/x/vuln/cmd/govulncheck@latest</code>, then <code>govulncheck ./...</code>) matches your dependencies against the Go vulnerability database and analyses the call graph, so it separates vulnerabilities your code actually reaches from ones in packages you import but never call. <code>-json</code> suits CI.",
            "<strong>Cross-compilation</strong> needs only two variables: <code>GOOS=linux GOARCH=arm64 go build</code>. <code>go tool dist list</code> prints the valid pairs. cgo is disabled by default when cross-compiling, which keeps the output a self-contained static binary.",
            "<strong>go:generate</strong>: a <code>//go:generate stringer -type=Color</code> comment runs only when you invoke <code>go generate</code>, never during build or test. Commit the generated files so builds don't depend on the tools.",
            "<strong>Example functions</strong>: <code>func ExampleReverse()</code> in a test file, ending with an <code>// Output:</code> comment, is run by <code>go test</code>, compared with the printed output, and shown in the package documentation. Documentation that can't silently rot.",
          ],
        },
        {
          type: "code",
          lang: "go",
          code: `func ExampleReverse() {
	fmt.Println(Reverse("Go!"))
	// Output: !oG
}`,
          caption: "If the output doesn't match, go test fails with got and want. An example without an Output comment is compiled but not run.",
        },
      ],
    },
    {
      id: "interview",
      title: "Testing and profiling questions in interviews",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Interviewers ask about testing to see whether you have maintained a real codebase, and about profiling to see whether you measure before you optimise. Concrete commands and their pitfalls make the strongest answers.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>Testable design</strong>: a tiny <code>main</code> calling <code>run(args, out) error</code>; dependencies behind interfaces so tests can use fakes.</li>
<li><strong>Table-driven tests</strong>: a slice of cases, <code>t.Run</code> per case, Errorf vs Fatalf, tolerance for floats, <code>-run Test/case</code>.</li>
<li><strong>Test cache</strong>: <code>(cached)</code> results ignore external state; <code>-count=1</code> forces a run.</li>
<li><strong>Coverage</strong>: shows unreached code, including unreachable branches; 100% is not proof of correctness.</li>
<li><strong>Handlers</strong>: <code>httptest.NewRecorder</code> against the whole router; <code>NewServer</code> for client tests.</li>
<li><strong>Profiling</strong>: pprof for where (flat vs cum), the tracer for when and why goroutines wait, pprof endpoints on a private port in production.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "You need a CPU profile from a production server that is slow right now. Which approach fits best?",
          options: [
            "Rebuild it with runtime/pprof calls in main and redeploy",
            "Fetch /debug/pprof/profile?seconds=30 from a pprof endpoint on an internal-only port and open it with go tool pprof",
            "Run go test -cpuprofile on your laptop",
            "Add log lines with time.Since around every function",
          ],
          answer: 1,
          explain: "net/http/pprof captures a profile from the live process under real traffic, without a redeploy. Exposing it only on localhost or an internal port keeps profiling data and the ability to trigger profiles away from the public.",
        },
      ],
    },
  ],
  takeaways: [
    "Keep <code>main</code> tiny and put logic in <code>run(args, out) error</code> so tests can drive it.",
    "Test names must be <code>TestXxx</code> in <code>_test.go</code> files; cached results ignore databases, networks and clocks, so use <code>-count=1</code> when it matters.",
    "Table-driven tests with <code>t.Run</code> subtests are the idiom; Fatal stops only the current (sub)test and must be called from its goroutine.",
    "Coverage reveals code no test reaches, including unreachable branches, but 100% coverage is not correctness; run <code>go vet</code> explicitly.",
    "<code>httptest</code> tests handlers and whole routers in memory; prefer tests that own their fixtures.",
    "Profile before optimising: flat time finds the code to fix, cum time finds the responsible subtree; use the tracer for waiting and latency.",
    "govulncheck reports reachable vulnerabilities; GOOS/GOARCH cross-compile; Example functions are tested documentation.",
  ],
  furtherReading: [
    { title: "testing package documentation", url: "https://pkg.go.dev/testing", note: "Tests, subtests, benchmarks, examples, fuzzing, Cleanup and TempDir." },
    { title: "Profiling Go Programs (the Go blog)", url: "https://go.dev/blog/pprof", note: "A worked example of finding hot spots with pprof." },
    { title: "Diagnostics", url: "https://go.dev/doc/diagnostics", note: "Profiling, tracing, debugging and runtime statistics in one overview." },
    { title: "Using Subtests and Sub-benchmarks (the Go blog)", url: "https://go.dev/blog/subtests", note: "Why t.Run exists and how to use it with tables." },
  ],
};
