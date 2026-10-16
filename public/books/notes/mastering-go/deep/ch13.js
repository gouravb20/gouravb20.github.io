// Deep dive: Chapter 13, Fuzz testing and observability. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch13 = {
  hook: `<p>A string-reversing helper has a tidy table test: <code>"hello"</code>, <code>"Go"</code>, the empty string. All green. A fuzzer runs it for a few seconds and stops on a two-byte input that is one non-ASCII character. Reversing it byte by byte produced bytes that are no longer valid UTF-8, and reversing again didn't give the original back. Nobody wrote that case because nobody thought of it, which is exactly the kind of case fuzzing exists to find.</p>
<p>The second half of the chapter asks a different question about the same program once it is deployed: is it healthy right now, and how would you know? Tests check behaviour before release; <strong>observability</strong> tells you what the running system is doing. Go gives you both from the standard library, plus a few well-known libraries: native fuzzing in <code>go test</code>, runtime metrics, <code>expvar</code>, and the Prometheus client.</p>`,
  sections: [
    {
      id: "why-fuzz",
      title: "Why fuzz: finding the inputs nobody imagined",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Hand-written tests only cover the inputs their author imagined. Bugs live in the others: negative numbers where only positives were tried, multi-byte characters in a parser written for ASCII, the minimum integer that has no positive counterpart. Attackers run fuzzers against parsers of untrusted input; it is better if you run one first.</p>`,
        },
        {
          type: "idea",
          html: `<p>A fuzzer generates inputs automatically, runs your code on each, and watches for failures: failed checks, panics or hangs. Go's fuzzer is <strong>coverage-guided</strong>: inputs that reach new code are kept and mutated further, so it digs deeper over time instead of guessing at random. It has been built into <code>go test</code> since Go 1.18.</p>`,
        },
        {
          type: "diagram",
          title: "The coverage-guided fuzzing loop",
          caption: "The corpus starts with your seeds. Mutations that reach new code are added to it; a failing input is minimized and saved under testdata/fuzz, where it becomes a regression test.",
          svg: `<svg viewBox="0 0 640 260" role="img" aria-label="Fuzzing loop: corpus, mutate, run target, keep inputs with new coverage, save failures">
<defs><marker id="go13-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="100" width="140" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="90" y="121" text-anchor="middle" font-size="12" font-weight="700">Corpus</text>
<text x="90" y="139" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">seeds + generated</text>
<rect x="210" y="100" width="140" height="50" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="280" y="129" text-anchor="middle" font-size="12">Mutate an input</text>
<rect x="400" y="100" width="140" height="50" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="470" y="129" text-anchor="middle" font-size="12">Run fuzz target</text>
<rect x="400" y="20" width="160" height="40" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="480" y="45" text-anchor="middle" font-size="12">New code reached</text>
<rect x="380" y="200" width="240" height="44" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="500" y="227" text-anchor="middle" font-size="12">Minimize, write to testdata/fuzz</text>
<line x1="160" y1="125" x2="208" y2="125" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go13-arrow)"/>
<line x1="350" y1="125" x2="398" y2="125" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go13-arrow)"/>
<line x1="470" y1="100" x2="470" y2="62" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go13-arrow)"/>
<polyline points="400,40 90,40 90,98" fill="none" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go13-arrow)"/>
<text x="245" y="32" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">add to corpus</text>
<line x1="470" y1="150" x2="470" y2="198" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go13-arrow)"/>
<text x="478" y="180" font-size="12" style="fill: var(--dg-muted)">check fails</text>
<text x="20" y="227" font-size="12" style="fill: var(--dg-muted)">No new coverage: discard and mutate again.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>A fuzz target rarely knows the exact expected output for an arbitrary input, so it checks <strong>properties</strong> that must hold for every input. Round trips are the most productive: decode(encode(x)) == x, reverse(reverse(s)) == s. Invariants work too: the output of <code>Abs</code> is never negative (which fails for <code>math.MinInt</code>, whose negation overflows back to itself), and a function that accepts valid UTF-8 must return valid UTF-8. The book's <code>AddInt</code> example is the simplest form: compare the function against an obviously correct oracle, <code>x + y</code>, and the fuzzer quickly finds that negative <code>x</code> values are mishandled.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Fuzzing complements unit tests; it doesn't replace them. Unit tests pin down specific, known behaviour and run in milliseconds on every commit. Fuzzing explores the unknown and is most valuable on code that parses or transforms untrusted input.</p>`,
        },
      ],
    },
    {
      id: "fuzz-anatomy",
      title: "Anatomy of a Go fuzz test",
      kicker: "How it works",
      blocks: [
        {
          type: "text",
          html: `<p>A fuzz test lives in a <code>_test.go</code> file and is named <code>FuzzXxx</code>, taking <code>*testing.F</code>. <code>f.Add(...)</code> adds <strong>seed</strong> inputs, and <code>f.Fuzz(func(t *testing.T, ...))</code> registers the <strong>fuzz target</strong>, whose parameters after <code>t</code> must match the types passed to <code>f.Add</code>. Supported parameter types are <code>string</code>, <code>[]byte</code>, <code>bool</code>, <code>rune</code>, <code>byte</code>, and every signed and unsigned integer and float size. Inside the target you write an ordinary test body.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func FuzzReverse(f *testing.F) {
	for _, seed := range []string{"", "Go", "hello, world", "héllo"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, s string) {
		r, err := Reverse(s)
		if err != nil {
			return // invalid UTF-8 is rejected by design
		}
		if !utf8.ValidString(r) {
			t.Fatalf("Reverse(%q) = %q, not valid UTF-8", s, r)
		}
		back, err := Reverse(r)
		if err != nil || back != s {
			t.Fatalf("round trip: %q -> %q -> %q (%v)", s, r, back, err)
		}
	})
}`,
        },
        {
          type: "code",
          lang: "sh",
          code: `go test                                     # seeds and testdata/fuzz files run as normal tests
go test -fuzz=FuzzReverse -fuzztime=30s     # fuzz for 30 seconds
go test -fuzz=FuzzReverse -fuzztime=10000x  # or for a fixed number of executions
go test -run='FuzzReverse/<file name>'      # replay one saved failure`,
        },
        {
          type: "text",
          html: `<p>Without <code>-fuzz</code>, <code>go test</code> just runs the seed corpus as regular test cases, so fuzz tests cost almost nothing in a normal CI run. With <code>-fuzz</code>, the regexp must match exactly one fuzz target, and the fuzzer runs workers on all cores until it finds a failure, you stop it, or <code>-fuzztime</code> expires. Its output reports execs per second and how many "new interesting" inputs it has added to the corpus.</p>
<p>The <strong>seed corpus</strong> is your <code>f.Add</code> calls plus files in <code>testdata/fuzz/FuzzXxx/</code>. The <strong>generated corpus</strong>, the interesting inputs the fuzzer found on its own, lives in the build cache under <code>$GOCACHE/fuzz</code>. Seeds that look like real input help the mutator reach deep code sooner, but they are optional.</p>`,
        },
        {
          type: "lab",
          id: "c13Fuzz",
          caption: "Run a toy coverage-guided fuzzer on the book's AddInt and string reversers. Watch inputs join the corpus, a crasher get minimized and saved, and plain go test keep failing until the code is fixed.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Without <code>-fuzztime</code>, fuzzing runs until it finds a failure or you press Ctrl+C. Always set a limit in CI, or run long fuzzing sessions as a separate scheduled job.</p>`,
        },
        {
          type: "quiz",
          q: "A package has a FuzzParse test with three f.Add seeds. What does a plain go test (no -fuzz flag) do with it?",
          options: [
            "Skips it entirely",
            "Fuzzes it for the default 10 seconds",
            "Runs the fuzz target once for each seed and each file in testdata/fuzz/FuzzParse, like ordinary test cases",
            "Fails, because fuzz tests need -fuzz",
          ],
          answer: 2,
          explain: "Without -fuzz, the seed corpus is executed as a normal test. That keeps saved failures working as regression tests and keeps CI fast.",
        },
      ],
    },
    {
      id: "utf8-lesson",
      title: "The reverse bug: strings are bytes, not characters",
      kicker: "A worked failure",
      blocks: [
        {
          type: "text",
          html: `<p>The book's <code>R1</code> and <code>R2</code> reverse a string byte by byte. For ASCII that is fine. But a Go string is a sequence of <em>bytes</em>, usually holding UTF-8, where one character may take two to four bytes. Reverse the two bytes of a two-byte character and the result is not valid UTF-8 at all. The fuzzer found such an input almost immediately.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Buggy and fixed",
          code: `func reverseBytes(s string) string { // breaks multi-byte characters
	b := []byte(s)
	for i, j := 0, len(b)-1; i < j; i, j = i+1, j-1 {
		b[i], b[j] = b[j], b[i]
	}
	return string(b)
}

func Reverse(s string) (string, error) {
	if !utf8.ValidString(s) {
		return "", fmt.Errorf("input is not valid UTF-8: %q", s)
	}
	r := []rune(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return string(r), nil
}`,
        },
        {
          type: "text",
          html: `<p>The fix has two parts, and both matter. Reversing <code>[]rune(s)</code> swaps whole code points instead of bytes. The validity check matters because the fuzzer also generates strings that are not UTF-8 at all, and converting those to <code>[]rune</code> silently replaces each bad byte with U+FFFD, so the round trip would fail anyway. Rejecting invalid input with an error makes the contract explicit. (Rune reversal still moves combining accents to the wrong side of their letters; reversing user-visible characters properly needs grapheme segmentation, which is outside the standard library.)</p>
<h3>Failures become regression tests</h3>
<p>When the target fails, the fuzzer minimizes the input and writes it to <code>testdata/fuzz/FuzzReverse/&lt;hash&gt;</code>. That file is now part of the seed corpus, so plain <code>go test</code> fails until the bug is fixed, and passes forever after. Commit these files. This also explains a puzzle in the book: <code>FuzzR2</code> "failed" on its first run because it found the file <code>FuzzR1</code> had left behind.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "A saved corpus file",
          code: `go test fuzz v1
string("Ԕ")`,
          caption: "One line per fuzz argument, after a version header. The character here is two bytes in UTF-8, so byte-wise reversal turns it into an invalid sequence.",
        },
        {
          type: "realworld",
          items: [
            { org: "Go standard library", title: "Fuzz tests for parsers", html: "Several standard library packages that decode untrusted input carry native fuzz tests, so the toolchain's own parsers are exercised the same way." },
            { org: "OSS-Fuzz", title: "Continuous fuzzing", html: "Google's OSS-Fuzz service can run Go projects' native fuzz tests continuously and report the crashes it finds, which turns a local technique into ongoing coverage for open-source code." },
          ],
        },
        {
          type: "quiz",
          q: "Why does reversing a Go string byte by byte break the round-trip property for some inputs?",
          options: [
            "Go strings are immutable, so the bytes can't be swapped",
            "A character can be several UTF-8 bytes; reversing them produces invalid UTF-8, and invalid bytes don't survive conversions back to text intact",
            "len(s) counts characters, not bytes, so the loop stops early",
            "The garbage collector may move the bytes during the loop",
          ],
          answer: 1,
          explain: "len(s) counts bytes and s holds UTF-8. Swapping the bytes of a multi-byte character yields an invalid sequence. Reverse runes and validate input instead.",
        },
      ],
    },
    {
      id: "runtime-metrics",
      title: "Observability starts inside the process",
      kicker: "Metrics without dependencies",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Observability</strong> is the ability to understand a system's internal state from what it emits. The usual building blocks are <strong>logs</strong> (discrete events), <strong>metrics</strong> (numbers sampled over time), <strong>traces</strong> (the path of one request, across services in distributed tracing), and the <strong>monitoring</strong> and <strong>alerting</strong> built on top. The chapter focuses on metrics, and the author's first rule applies to all of them: decide what question you want answered before collecting data, or you will collect the wrong data.</p>
<p>The runtime already knows a lot about itself. <code>runtime/metrics</code> (Go 1.16+) exposes it through a stable, versioned API: each metric has a name such as <code>/sched/goroutines:goroutines</code>, you fill a slice of <code>metrics.Sample</code> with the names you want, and <code>metrics.Read</code> fills in the values. <code>metrics.All()</code> lists what your Go version supports. It is designed to be cheap to read, unlike <code>runtime.ReadMemStats</code>, which stops the world.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func printRuntimeMetrics() {
	samples := []metrics.Sample{
		{Name: "/sched/goroutines:goroutines"},
		{Name: "/memory/classes/heap/objects:bytes"},
		{Name: "/gc/cycles/total:gc-cycles"},
	}
	metrics.Read(samples)
	for _, s := range samples {
		switch s.Value.Kind() {
		case metrics.KindUint64:
			fmt.Printf("%s = %d\\n", s.Name, s.Value.Uint64())
		case metrics.KindFloat64:
			fmt.Printf("%s = %f\\n", s.Name, s.Value.Float64())
		case metrics.KindBad:
			fmt.Printf("%s: not supported by this Go version\\n", s.Name)
		}
	}
}`,
        },
        {
          type: "text",
          html: `<h3>Timing work and publishing counters</h3>
<p>The simplest application metric is elapsed time: <code>start := time.Now()</code>, do the work, then log <code>time.Since(start)</code>, for example with <code>log/slog</code> (Go 1.21+) as <code>logger.Info("import done", slog.Duration("elapsed", time.Since(start)))</code>. A single measurement on a busy machine is noisy because of the OS and Go schedulers; use benchmarks (next chapter) when you need to compare implementations.</p>
<p><code>expvar</code> publishes variables as JSON at <code>/debug/vars</code> on the default mux: <code>var hits = expvar.NewInt("hits")</code>, then <code>hits.Add(1)</code> in a handler. It also publishes <code>cmdline</code> and <code>memstats</code> automatically, values are safe for concurrent updates, and <code>expvar.Handler()</code> lets you mount it on your own mux. It is a zero-dependency option for a quick look; it has no metric types, labels or storage.</p>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>The book also prints CPU details with <code>github.com/klauspost/cpuid/v2</code>: brand name, core counts, cache sizes and feature flags such as AVX2. That is handy for labelling benchmark results or choosing a SIMD code path, but detection quality varies by platform, so treat missing values as "unknown", not zero.</p>`,
        },
      ],
    },
    {
      id: "prometheus",
      title: "Prometheus metric types and the Go client",
      kicker: "Metrics that scale",
      blocks: [
        {
          type: "text",
          html: `<p>Prometheus is a time-series database and monitoring system, itself written in Go. Your program exposes current metric values in a text format at <code>/metrics</code>, and Prometheus <strong>pulls</strong> (scrapes) that endpoint on a fixed interval. The Go client, <code>github.com/prometheus/client_golang</code>, provides four metric types:</p>`,
        },
        {
          type: "table",
          headers: ["Type", "What it is", "Use it for"],
          rows: [
            ["Counter", "A cumulative value that only goes up, resetting to 0 on restart", "Requests, errors, bytes sent; query with <code>rate()</code>"],
            ["Gauge", "A value that goes up and down", "In-flight requests, queue length, memory, goroutines"],
            ["Histogram", "Observations counted into cumulative <code>le</code> buckets, plus <code>_sum</code> and <code>_count</code>", "Latency and sizes; quantiles can be estimated and aggregated across instances"],
            ["Summary", "<code>_sum</code>, <code>_count</code> and optional quantiles computed in the client", "Accurate quantiles for a single process; cannot be aggregated"],
          ],
        },
        {
          type: "text",
          html: `<p>Why have a counter at all, when a gauge can also go up? Because a counter's meaning survives restarts and missed scrapes. If a process restarts, its counter drops to zero, and <code>rate()</code> recognises the drop as a reset rather than a negative rate. If a scrape is missed, the next value still contains everything that happened in between. A gauge of "requests in the last minute" would lose both.</p>
<p>Follow the naming conventions so dashboards and other engineers can guess what a metric means: base units (<code>_seconds</code>, <code>_bytes</code>), a <code>_total</code> suffix on counters, and a namespace prefix per application. The book's metrics combine a namespace and a name, such as <code>packt_n_goroutines</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Defining metrics",
          code: `var (
	requests = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "shop", Name: "http_requests_total",
		Help: "HTTP requests by route and status code.",
	}, []string{"route", "code"})

	inFlight = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "shop", Name: "http_in_flight_requests",
		Help: "Requests currently being served.",
	})

	latency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "shop", Name: "http_request_duration_seconds",
		Help: "Request latency.", Buckets: prometheus.DefBuckets,
	}, []string{"route"})
)`,
        },
        {
          type: "code",
          lang: "go",
          title: "Recording them in middleware and serving /metrics",
          code: `type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.code = code
	s.ResponseWriter.WriteHeader(code)
}

func instrument(route string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		inFlight.Inc()
		defer inFlight.Dec()
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, code: http.StatusOK}
		next(rec, r)
		latency.WithLabelValues(route).Observe(time.Since(start).Seconds())
		requests.WithLabelValues(route, strconv.Itoa(rec.code)).Inc()
	}
}

// In main: mux.Handle("GET /metrics", promhttp.Handler())`,
          caption: "promauto registers each metric with the default registry, which also includes the Go runtime and process collectors (go_goroutines, process_cpu_seconds_total and others).",
        },
        {
          type: "lab",
          id: "c13Prom",
          caption: "A live version of the book's samplePro.go: watch a counter, a gauge, a histogram and a summary change each tick, restart the process to see a counter reset, and compare the histogram's estimated p90 with the summary's exact one.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Every distinct combination of label values is a separate time series. A label holding a user ID, a raw URL path or an error message can create millions of series and overwhelm Prometheus. Use labels only for small, bounded sets such as route templates, methods and status codes.</p>`,
        },
        {
          type: "quiz",
          q: "Ten replicas of a service each expose request latency. You need the fleet-wide 95th percentile. Which metric type should they use?",
          options: [
            "Summary, because it computes exact quantiles",
            "Histogram, because bucket counts from all replicas can be summed and the quantile estimated from the total",
            "Gauge holding the latest latency",
            "Counter of total latency",
          ],
          answer: 1,
          explain: "Summary quantiles are computed inside each process and can't be meaningfully combined; averaging ten p95s is not a p95. Histogram buckets add up across instances, and histogram_quantile estimates the fleet-wide value.",
        },
      ],
    },
    {
      id: "pipeline",
      title: "Scrape, store, graph: Prometheus and Grafana in Docker",
      kicker: "Putting it together",
      blocks: [
        {
          type: "diagram",
          title: "The pull-based metrics pipeline",
          caption: "The Go program only serves its current values. Prometheus scrapes and stores them as time series, and Grafana queries Prometheus to draw dashboards.",
          svg: `<svg viewBox="0 0 640 150" role="img" aria-label="Prometheus scrapes the Go app's metrics endpoint, and Grafana queries Prometheus">
<defs><marker id="go13-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="40" width="160" height="56" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="100" y="63" text-anchor="middle" font-size="12" font-weight="700">Go app</text>
<text x="100" y="82" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">:1234/metrics</text>
<rect x="240" y="40" width="160" height="56" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="320" y="63" text-anchor="middle" font-size="12" font-weight="700">Prometheus</text>
<text x="320" y="82" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">scrapes, stores</text>
<rect x="460" y="40" width="160" height="56" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="540" y="63" text-anchor="middle" font-size="12" font-weight="700">Grafana</text>
<text x="540" y="82" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">dashboards</text>
<line x1="240" y1="68" x2="183" y2="68" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go13-arrow2)"/>
<line x1="460" y1="68" x2="403" y2="68" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go13-arrow2)"/>
<text x="210" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">scrape</text>
<text x="430" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">query</text>
<text x="20" y="130" font-size="12" style="fill: var(--dg-muted)">Arrows point from the side that initiates the request.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The book runs three containers on one docker-compose network: the Go program built with a multi-stage Dockerfile, Prometheus on port 9090, and Grafana on port 3000. Containers on a shared network reach each other by name, so Prometheus scrapes <code>goapp:1234</code> and Grafana adds <code>http://prometheus:9090</code> as a data source. Check <code>curl localhost:1234/metrics</code> first; if the metrics aren't there, nothing downstream will show them.</p>`,
        },
        {
          type: "code",
          lang: "yaml",
          title: "prometheus.yml",
          code: `global:
  scrape_interval: 15s
scrape_configs:
  - job_name: goapp
    static_configs:
      - targets: ["goapp:1234"]`,
        },
        {
          type: "code",
          lang: "text",
          title: "PromQL you will use daily",
          code: `rate(shop_http_requests_total[5m])
sum by (route) (rate(shop_http_requests_total{code=~"5.."}[5m]))
histogram_quantile(0.95, sum by (le, route) (rate(shop_http_request_duration_seconds_bucket[5m])))`,
          caption: "rate() turns an ever-growing counter into a per-second rate and handles counter resets after restarts automatically.",
        },
        {
          type: "text",
          html: `<p>Pull has practical advantages: Prometheus knows when a target is down (the scrape fails), targets need no knowledge of where metrics go, and you can curl any endpoint to see exactly what is exposed. The Prometheus web UI is meant for exploring and debugging queries; Grafana is where dashboards live. For traces, the common choice today is OpenTelemetry, which has an official Go SDK and can export to many backends.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Kubernetes", title: "Prometheus format everywhere", html: "Kubernetes components expose their own metrics at <code>/metrics</code> in the Prometheus text format, and so do most cloud-native projects, which is why a Prometheus server can monitor a whole cluster with little configuration." },
            { org: "Prometheus", title: "Dogfooding", html: "The Prometheus server is a Go program instrumented with client_golang, so it exposes Go runtime metrics about itself like any other target." },
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Fuzzing and observability in interviews",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>These topics separate engineers who ship from engineers who only build. Be ready to explain what fuzzing finds that unit tests don't, and how you would know a deployed Go service is in trouble before users tell you.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>Fuzz anatomy</strong>: <code>FuzzXxx(f *testing.F)</code>, seeds with <code>f.Add</code>, a target with <code>f.Fuzz</code> whose parameter types match, run with <code>-fuzz</code> and <code>-fuzztime</code>.</li>
<li><strong>Properties</strong>: round trips, invariants, comparison with an oracle.</li>
<li><strong>Corpus</strong>: seeds plus <code>testdata/fuzz</code> files are regression tests; generated inputs live in the build cache.</li>
<li><strong>UTF-8</strong>: strings are bytes; reverse runes and validate input.</li>
<li><strong>Metrics</strong>: <code>runtime/metrics</code> instead of stop-the-world <code>ReadMemStats</code>; <code>expvar</code> for a quick look; Prometheus for real monitoring.</li>
<li><strong>Prometheus types</strong>: counter with <code>rate()</code>, gauge, histogram (aggregatable), summary (per process); keep label cardinality bounded.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "After a fuzzing session found a crash, plain go test keeps failing on that package. Why, and is that desirable?",
          options: [
            "The fuzz cache is corrupted; delete $GOCACHE",
            "The minimized failing input was written to testdata/fuzz and is now part of the seed corpus; yes, it is a free regression test until the bug is fixed",
            "go test now fuzzes on every run",
            "The failure is random and will disappear on the next run",
          ],
          answer: 1,
          explain: "Saved failures are deterministic seed inputs. They keep the test red until the code is fixed and guard against the bug returning, so they should be committed.",
        },
      ],
    },
  ],
  takeaways: [
    "Fuzzing generates inputs you didn't imagine; Go's coverage-guided fuzzer is built into <code>go test</code> since 1.18.",
    "A fuzz test is <code>FuzzXxx(f *testing.F)</code> with <code>f.Add</code> seeds and an <code>f.Fuzz</code> target that checks properties such as round trips and invariants.",
    "Plain <code>go test</code> runs the seed corpus; failing inputs saved under <code>testdata/fuzz</code> become regression tests to commit.",
    "Go strings are bytes holding UTF-8: reverse runes, validate input, and remember that len counts bytes.",
    "<code>runtime/metrics</code> reads runtime statistics cheaply; <code>expvar</code> publishes simple JSON variables with no dependencies.",
    "Prometheus scrapes <code>/metrics</code>: counters with <code>rate()</code>, gauges, aggregatable histograms and per-process summaries.",
    "Keep label values bounded, or every new value becomes another time series.",
  ],
  furtherReading: [
    { title: "Go Fuzzing", url: "https://go.dev/doc/security/fuzz/", note: "The official reference for fuzz tests, the corpus and command-line flags." },
    { title: "Tutorial: Getting started with fuzzing", url: "https://go.dev/doc/tutorial/fuzz", note: "A step-by-step fuzzing session on a string reverse function." },
    { title: "Prometheus metric types", url: "https://prometheus.io/docs/concepts/metric_types/", note: "Counters, gauges, histograms and summaries." },
    { title: "Prometheus: histograms and summaries", url: "https://prometheus.io/docs/practices/histograms/", note: "When to choose each and how quantile estimation works." },
  ],
};
