// Deep dive: Chapter 9, Building web services. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch9 = {
  hook: `<p>A small Go service calls a partner API with <code>http.Get()</code>. It works for months. Then one afternoon the partner's load balancer starts accepting connections and never answering. Every incoming request to your service now parks a goroutine on a response that will never come. Goroutines pile up into the tens of thousands, memory climbs, and your service, which did nothing wrong, falls over with its partner.</p>
<p>The fix was one line: a client with a timeout. The same trap exists on the server side, where <code>http.ListenAndServe()</code> happily lets a slow client hold a connection open forever. <code>net/http</code> is good enough to run in production, but its convenience functions are tuned for demos. This chapter is about the handful of types you need to understand, and the settings you must change, to turn a demo into a service.</p>`,
  sections: [
    {
      id: "handlers",
      title: "Handlers: one interface runs the whole server",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>Everything that answers HTTP requests in Go is an <code>http.Handler</code>: a type with one method, <code>ServeHTTP(http.ResponseWriter, *http.Request)</code>. Routers, middleware, file servers and your own endpoints all satisfy that same interface, so they snap together like pipes.</p>`,
        },
        {
          type: "text",
          html: `<p>Writing a struct with a <code>ServeHTTP</code> method for every endpoint would be tedious, so the package defines <code>http.HandlerFunc</code>, a function type whose <code>ServeHTTP</code> method simply calls the function. Converting a plain function with the right signature to <code>http.HandlerFunc</code> turns it into a Handler. <code>mux.HandleFunc(pattern, f)</code> does that conversion for you; <code>mux.Handle(pattern, http.HandlerFunc(f))</code> is the long form.</p>
<p>The <code>*http.Request</code> carries the method, the parsed <code>URL</code>, headers, the body as a stream, and a <code>Context()</code> that is cancelled when the client goes away or the handler returns. The <code>http.ResponseWriter</code> is how you reply, and it has a strict order: set headers, then call <code>WriteHeader(code)</code>, then write the body. The first <code>Write()</code> sends a 200 if you never set a status, and after that the headers are already on the wire.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "A handler and a middleware",
          code: `package main

import (
	"log"
	"net/http"
	"time"
)

func hello(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("hello\\n"))
}

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/hello", hello)
	log.Fatal(http.ListenAndServe(":8080", logging(mux)))
}`,
          caption: "Middleware is just a function from Handler to Handler. The mux is a Handler too, so it can be wrapped as a whole. (This server has no timeouts yet; a later section fixes that.)",
        },
        {
          type: "text",
          html: `<p>Because <code>ResponseWriter</code> implements <code>io.Writer</code>, anything that writes to a writer works: <code>fmt.Fprintf(w, ...)</code>, <code>json.NewEncoder(w).Encode(v)</code>, <code>io.Copy(w, file)</code>. A common beginner surprise is the opposite direction: <code>fmt.Println()</code> inside a handler prints on the server's terminal, not to the client.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Setting a header after the first <code>Write()</code> does nothing, and calling <code>WriteHeader()</code> twice only logs <em>superfluous response.WriteHeader call</em>. <code>http.Error()</code> writes a status itself, so call it <em>instead</em> of writing a body, then <code>return</code>.</p>`,
        },
        {
          type: "quiz",
          q: "A handler runs fmt.Fprintln(w, \"checking...\") and then http.Error(w, \"bad input\", 400). What does the client receive?",
          options: [
            "400 Bad Request with the body \"bad input\"",
            "200 OK with both lines in the body, while the server logs a superfluous WriteHeader call",
            "500 Internal Server Error",
            "Nothing: the handler panics",
          ],
          answer: 1,
          explain: "The first Fprintln implicitly sent 200 and the headers. http.Error then tries to set a 400, which is too late and only produces a log line, and its message is appended to the body that is already streaming.",
        },
      ],
    },
    {
      id: "routing",
      title: "Routing with ServeMux, before and after Go 1.22",
      kicker: "Matching requests",
      blocks: [
        {
          type: "problem",
          html: `<p>A request for <code>/delete</code> comes back as <strong>301 Moved Permanently</strong>, a <code>PUT</code> to an endpoint you only meant for <code>GET</code> runs the handler anyway, and a typo like <code>/abuot</code> lands on your home page. All three come from how the router matches paths.</p>`,
        },
        {
          type: "text",
          html: `<p><code>http.ServeMux</code> is the standard router. Classic patterns are paths: one without a trailing slash matches exactly that path, and one ending in <code>/</code> is a <strong>subtree</strong> pattern that matches everything below it. <code>/</code> is therefore a catch-all. If only <code>/delete/</code> is registered, a request for <code>/delete</code> is redirected to the slash version, which is the 301 above. Among classic patterns, the longest match wins.</p>
<p>Go 1.22 extended the syntax. A pattern may start with a method (<code>GET /users/{id}</code>), and path segments may be wildcards: <code>{id}</code> matches one segment, <code>{path...}</code> matches the rest of the path, and <code>{$}</code> anchors the end so <code>/{$}</code> matches only the root. Handlers read wildcards with <code>r.PathValue("id")</code>. When a path matches but the method does not, the mux answers <strong>405 Method Not Allowed</strong> with an <code>Allow</code> header. A <code>GET</code> pattern also serves <code>HEAD</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Go 1.22+ patterns",
          code: `func routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /users/{id}", getUser)
	mux.HandleFunc("DELETE /users/{id}", deleteUser)
	mux.HandleFunc("GET /files/{path...}", serveFile)
	mux.HandleFunc("GET /{$}", home) // only "/", not a catch-all
	return mux
}

func getUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	fmt.Fprintf(w, "user %s\\n", id)
}`,
        },
        {
          type: "text",
          html: `<p>Precedence changed from "longest wins" to "<strong>most specific wins</strong>": a pattern beats another if it matches a strict subset of the requests the other matches. <code>GET /users/{id}</code> is more specific than <code>/users/</code>, and <code>/users/me</code> is more specific than <code>/users/{id}</code>. If two patterns overlap and neither is more specific, registration <em>panics</em> at startup, which is far better than discovering the ambiguity in production. Old patterns keep their meaning, and setting <code>GODEBUG=httpmuxgo121=1</code> restores the pre-1.22 matcher if an upgrade surprises you.</p>`,
        },
        {
          type: "lab",
          id: "c09MuxMatcher",
          caption: "Type paths against the book's route tables and a Go 1.22 table. Try /delete for the redirect, PUT /users/42 for a 405, and /about to see how {$} stops / from catching everything.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>The package-level <code>http.HandleFunc()</code> registers on <code>http.DefaultServeMux</code>, a global. Any imported package can add routes to it: importing <code>net/http/pprof</code> for its side effect, for example, publishes profiling endpoints under <code>/debug/pprof/</code>. Build your own mux with <code>http.NewServeMux()</code> so you know exactly what is exposed.</p>`,
        },
        {
          type: "quiz",
          q: "With Go 1.22 patterns \"GET /users/{id}\" and \"POST /users/{id}\" registered, what does PUT /users/7 return?",
          options: [
            "404 Not Found",
            "The GET handler's response",
            "405 Method Not Allowed, with an Allow header listing GET, HEAD and POST",
            "301 redirect to /users/7/",
          ],
          answer: 2,
          explain: "The path matches registered patterns, but no pattern accepts PUT. The 1.22 mux reports that as 405 and lists the methods that would work, including HEAD because GET patterns also serve HEAD.",
        },
      ],
    },
    {
      id: "server",
      title: "Running a server: http.Server, graceful shutdown and shared state",
      kicker: "From demo to service",
      blocks: [
        {
          type: "text",
          html: `<p><code>http.ListenAndServe(addr, handler)</code> is a shortcut that builds an <code>http.Server</code> with every field at its zero value. That means no limits on how long reading or writing may take and no way to stop it cleanly. A real service builds the struct itself: <code>Addr</code>, <code>Handler</code>, the timeout fields covered later in this chapter, and optionally <code>MaxHeaderBytes</code> and <code>TLSConfig</code>.</p>
<p>Stopping matters as much as starting. Container platforms send <code>SIGTERM</code> before they kill a process, and <code>Server.Shutdown(ctx)</code> turns that warning into a clean exit: it closes the listeners, closes idle connections, and waits for in-flight requests to finish, up to the context's deadline. <code>ListenAndServe</code> returns <code>http.ErrServerClosed</code> right away when shutdown begins, which is not an error to log.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Timeouts and graceful shutdown",
          code: `func main() {
	srv := &http.Server{
		Addr:              ":8080",
		Handler:           routes(),
		ReadHeaderTimeout: 2 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}`,
        },
        {
          type: "text",
          html: `<h3>Every request is a goroutine</h3>
<p>The server accepts each connection and serves it in its own goroutine, so two requests can run your handlers at the same moment. The book's statistics service keeps its datasets in a package-level slice and map with no locking. Two simultaneous <code>/insert</code> calls are a data race, and concurrent map writes can crash the whole process with a fatal error that <code>recover()</code> cannot catch. Guard shared state with a mutex (an <code>RWMutex</code> if reads dominate), or give it to a single goroutine and talk to it over channels. Run your tests with <code>-race</code> to prove it.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type store struct {
	mu   sync.RWMutex
	data map[string][]float64
}

func (s *store) get(name string) ([]float64, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.data[name]
	return v, ok
}

func (s *store) put(name string, v []float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[name] = v
}`,
        },
        {
          type: "text",
          html: `<h3>Shipping it</h3>
<p>The book packages the service with a <strong>multi-stage Dockerfile</strong>: a builder stage with the Go toolchain compiles the binary, and a second, minimal stage receives only that binary. The runtime image has no compiler and no source, so it is small and offers less to attack. Remember that anything the program writes inside the container (the book's JSON data file, for instance) disappears with the container unless you mount a volume. The book serves plain HTTP and expects a reverse proxy to terminate TLS, which is a common arrangement for containerized Go services.</p>`,
        },
        {
          type: "code",
          lang: "dockerfile",
          code: `FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server .

FROM alpine:3.20
COPY --from=builder /out/server /server
USER 65534
EXPOSE 8080
ENTRYPOINT ["/server"]`,
        },
        {
          type: "realworld",
          items: [
            { org: "Kubernetes", title: "Graceful termination", html: "When a pod is deleted, the kubelet sends <code>SIGTERM</code>, waits up to <code>terminationGracePeriodSeconds</code> (30 seconds by default) and then sends <code>SIGKILL</code>. A Go server that calls <code>Shutdown</code> on SIGTERM finishes its in-flight requests inside that window." },
            { org: "Caddy", title: "Built on net/http", html: "The Caddy web server is written in Go and serves HTTP with the standard library's server, which is a good sign of how far <code>net/http</code> goes before you need anything else." },
          ],
        },
      ],
    },
    {
      id: "client",
      title: "The client side: Client, Transport and the response body",
      kicker: "Calling other services",
      blocks: [
        {
          type: "text",
          html: `<p>There are two layers on the client. <code>http.Transport</code> is the low-level <code>RoundTripper</code>: it dials TCP, does the TLS handshake, speaks HTTP/1.1 or HTTP/2, and keeps a pool of idle keep-alive connections per host. <code>http.Client</code> sits on top and adds redirects, cookies and an overall <code>Timeout</code>. A Client with a nil <code>Transport</code> uses <code>http.DefaultTransport</code>.</p>
<p>Both are safe for concurrent use and meant to be <strong>created once and shared</strong>. The connection pool is where the performance lives: reusing a warm connection skips the TCP and TLS handshakes. A program that builds a new Transport per request throws the pool away each time and can exhaust local ports under load.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "A reusable client and a careful request",
          code: `var client = &http.Client{Timeout: 10 * time.Second}

func fetch(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		return nil, fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}`,
          caption: "Check err before touching resp, close the body, drain it when you don't need it, and cap how much you read.",
        },
        {
          type: "text",
          html: `<p><code>http.Get(url)</code> is the one-line version: it uses <code>http.DefaultClient</code>, which has <strong>no timeout</strong>, and it cannot set headers. <code>http.NewRequest</code> (or <code>NewRequestWithContext</code>) plus <code>client.Do</code> gives you the method, headers, body and context. For debugging, <code>httputil.DumpResponse(resp, false)</code> prints the raw status line and headers.</p>
<p>The response <code>Body</code> is a stream tied to a connection, not a byte slice. The Transport can put that connection back in its pool only after the body has been read to the end and closed. Forget <code>Close()</code> and you leak the connection and the goroutines serving it; close without draining and the connection may be discarded instead of reused.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Tuning the transport without losing defaults",
          code: `func newClient() *http.Client {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.MaxIdleConnsPerHost = 32 // the default is 2
	t.ResponseHeaderTimeout = 5 * time.Second
	return &http.Client{Transport: t, Timeout: 15 * time.Second}
}`,
          caption: "Cloning DefaultTransport keeps its proxy settings, dial and TLS timeouts and HTTP/2 support. A service that makes many concurrent calls to one host usually wants more than two idle connections per host.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p><code>resp, err := client.Do(req); defer resp.Body.Close(); if err != nil {...}</code> panics with a nil pointer dereference exactly when the request fails, because <code>resp</code> is nil. The <code>defer</code> goes <em>after</em> the error check.</p>`,
        },
      ],
    },
    {
      id: "timeouts",
      title: "Timeouts on both sides of the connection",
      kicker: "Failing on purpose",
      blocks: [
        {
          type: "problem",
          html: `<p>A network call without a deadline can wait forever. On the client that ties up a goroutine and whatever it holds. On the server, a client that sends one header byte every few seconds (a slow-loris attack) can hold a connection, and a file descriptor, indefinitely. The defaults for <code>http.DefaultClient</code> and <code>http.ListenAndServe</code> are zero, which means no limit at all.</p>`,
        },
        {
          type: "text",
          html: `<p>The client has three tools. <code>Client.Timeout</code> limits the whole exchange: dialing, sending, waiting for headers and reading the body. A <code>context.WithTimeout</code> attached with <code>NewRequestWithContext</code> limits one request and also carries cancellation from above, so when the incoming request that triggered the call is cancelled, the outgoing call stops too. The lowest-level tool is <code>net.Conn.SetDeadline(t)</code> on a raw connection, which the book plugs into a custom dial function.</p>
<p>A deadline is an <strong>absolute point in time</strong>, not an idle timer. Data flowing does not push it back. A slow but steady download still fails with <code>i/o timeout</code> when the deadline passes, unless you set a new deadline as you go.</p>`,
        },
        {
          type: "diagram",
          title: "What each server timeout covers",
          caption: "One request on a keep-alive connection. ReadHeaderTimeout and ReadTimeout start when the server begins reading the request, WriteTimeout starts once the headers have been read, and IdleTimeout covers the wait for the next request.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="Timeline of an HTTP request showing which phases each server timeout covers">
<rect x="20" y="30" width="120" height="36" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="80" y="53" text-anchor="middle" font-size="12">Read headers</text>
<rect x="140" y="30" width="120" height="36" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="200" y="53" text-anchor="middle" font-size="12">Read body</text>
<rect x="260" y="30" width="210" height="36" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="365" y="53" text-anchor="middle" font-size="12">Handler + write response</text>
<rect x="470" y="30" width="150" height="36" rx="4" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="545" y="53" text-anchor="middle" font-size="12">Idle (keep-alive)</text>
<line x1="140" y1="70" x2="140" y2="205" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="260" y1="70" x2="260" y2="205" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="470" y1="70" x2="470" y2="205" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<rect x="20" y="90" width="120" height="16" rx="3" style="fill: var(--dg-1)"/>
<text x="148" y="103" font-size="12">ReadHeaderTimeout</text>
<rect x="20" y="122" width="240" height="16" rx="3" style="fill: var(--dg-2)"/>
<text x="268" y="135" font-size="12">ReadTimeout</text>
<rect x="140" y="154" width="330" height="16" rx="3" style="fill: var(--dg-3)"/>
<text x="478" y="167" font-size="12">WriteTimeout</text>
<rect x="470" y="186" width="150" height="16" rx="3" style="fill: var(--dg-4)"/>
<text x="462" y="199" text-anchor="end" font-size="12">IdleTimeout</text>
<text x="20" y="234" font-size="12" style="fill: var(--dg-muted)">Zero means no limit, which is what http.ListenAndServe gives you.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p><code>ReadHeaderTimeout</code> is the slow-loris defence; if it is zero, <code>ReadTimeout</code> is used for headers too. <code>ReadTimeout</code> covers the whole request including the body, so it must be generous for upload endpoints. <code>IdleTimeout</code> falls back to <code>ReadTimeout</code> when zero. <code>WriteTimeout</code> is a deadline on the <em>connection</em>, not a cancellation of your handler: a handler that runs past it keeps running and burning CPU, its writes fail, and the client sees the connection close without a proper response. To bound the work itself, use <code>http.TimeoutHandler</code> (it replies 503) or pass <code>r.Context()</code> with a deadline down to the slow call.</p>`,
        },
        {
          type: "lab",
          id: "c09Timeouts",
          caption: "Set the client's limit (Client.Timeout, a context, or a SetDeadline dialer) and the server's ReadTimeout and WriteTimeout, then see which side gives up first and what each one reports.",
        },
        {
          type: "table",
          title: "Which error tells you which timeout fired",
          headers: ["Setting", "Side", "Typical error text"],
          rows: [
            ["<code>Client.Timeout</code>", "client", "<code>Client.Timeout exceeded while awaiting headers</code> (or while reading the body)"],
            ["<code>context.WithTimeout</code>", "client", "<code>context deadline exceeded</code>"],
            ["<code>conn.SetDeadline</code>", "either", "<code>i/o timeout</code>"],
            ["<code>Server.WriteTimeout</code>", "server", "Client sees EOF or an empty reply"],
          ],
        },
        {
          type: "quiz",
          q: "A server has WriteTimeout = 5s. A handler takes 8 seconds to compute its answer and then writes it. What happens?",
          options: [
            "The handler is stopped after 5 seconds and the client gets a 503",
            "The handler runs all 8 seconds, its write fails, and the client sees the connection close with no proper response",
            "The client receives the answer after 8 seconds, because the timeout only applies to idle connections",
            "The server returns 408 Request Timeout",
          ],
          answer: 1,
          explain: "WriteTimeout sets a write deadline on the connection. Nothing interrupts the handler, so it wastes the full 8 seconds, and by then writes fail. Use http.TimeoutHandler or a context deadline to actually bound the handler's work.",
        },
      ],
    },
    {
      id: "fan-out",
      title: "Fetching many URLs at once with errgroup",
      kicker: "Concurrent clients",
      blocks: [
        {
          type: "problem",
          html: `<p>Fetching twenty URLs one after another takes the sum of their latencies. Doing it concurrently with a <code>sync.WaitGroup</code> needs a goroutine per URL, a channel or mutex to collect errors, and extra code to stop the rest when one fails. That bookkeeping is easy to get subtly wrong.</p>`,
        },
        {
          type: "text",
          html: `<p><code>golang.org/x/sync/errgroup</code> packages the pattern. <code>g.Go(f)</code> starts <code>f</code> in a goroutine, and <code>g.Wait()</code> blocks until every function has returned, then returns the <strong>first non-nil error</strong>. <code>errgroup.WithContext(ctx)</code> also returns a derived context that is cancelled as soon as any function fails (or when <code>Wait</code> returns). <code>g.SetLimit(n)</code> caps how many functions run at once, so twenty thousand URLs don't open twenty thousand connections.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func fetchAll(ctx context.Context, urls []string) ([][]byte, error) {
	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(8)
	bodies := make([][]byte, len(urls))
	for i, u := range urls {
		g.Go(func() error {
			b, err := fetch(ctx, u)
			if err != nil {
				return fmt.Errorf("%s: %w", u, err)
			}
			bodies[i] = b
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}
	return bodies, nil
}`,
          caption: "Each goroutine writes only its own slot, so no mutex is needed. Since Go 1.22 each iteration has its own i and u, so the closure needs no copies.",
        },
        {
          type: "text",
          html: `<p>Cancellation is cooperative. The derived context is cancelled on the first error, but the other goroutines stop early only if they <em>use</em> it, here by passing it into <code>NewRequestWithContext</code> inside <code>fetch</code>. A plain <code>errgroup.Group</code> without a context lets every function run to completion, and <code>Wait</code> still waits for all of them before reporting the error.</p>`,
        },
        {
          type: "lab",
          id: "c09ErrGroup",
          caption: "Make one URL fail and compare a plain Group with WithContext, then add SetLimit. Watch when Wait returns and how much work runs after the error is already known.",
        },
        {
          type: "tradeoffs",
          pros: [
            "Waiting, first-error reporting and cancellation in a few lines",
            "SetLimit bounds concurrency without a hand-rolled semaphore",
            "Works with any context-aware code, not only HTTP",
          ],
          cons: [
            "Only the first error is returned; the rest are dropped unless you collect them",
            "Cancellation does nothing for code that ignores the context",
            "A panic in one function is not converted into an error",
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Talking about net/http in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Interviewers use <code>net/http</code> to check whether you have run Go in production. The questions rarely need exotic APIs; they probe whether you know where the defaults are unsafe and why the types are shaped the way they are.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Have crisp answers for these:</p>
<ol>
<li><strong>Handler vs HandlerFunc vs HandleFunc</strong>: an interface, a function type that implements it, and a registration helper. Middleware is <code>func(http.Handler) http.Handler</code>.</li>
<li><strong>Why not <code>http.Get</code> and <code>http.ListenAndServe</code> in production</strong>: no timeouts on either side, and the global <code>DefaultServeMux</code>.</li>
<li><strong>Server timeouts</strong>: ReadHeaderTimeout against slow-loris, ReadTimeout for the body, WriteTimeout as a connection deadline that does not stop the handler, IdleTimeout for keep-alives.</li>
<li><strong>Response bodies</strong>: check the error, then <code>defer Body.Close()</code>, and drain so the connection is reused.</li>
<li><strong>Concurrency</strong>: each request runs in its own goroutine, so shared state needs a lock.</li>
<li><strong>Go 1.22 routing</strong>: methods, <code>{wildcards}</code>, most-specific-wins precedence and automatic 405s.</li>
</ol>`,
        },
        {
          type: "text",
          html: `<p>A good follow-up to volunteer: how you would shut down without dropping requests (<code>Shutdown</code> with a deadline on SIGTERM, and treating <code>ErrServerClosed</code> as normal), and how a client call inherits the incoming request's context so work stops when the caller has gone away.</p>`,
        },
        {
          type: "quiz",
          q: "You use a plain errgroup.Group (no WithContext) to fetch three URLs. One fails after 100 ms; the other two take 5 seconds each. When does Wait return, and with what?",
          options: [
            "After 100 ms, with the error",
            "After 5 seconds, with the error from the failed fetch",
            "After 5 seconds, with nil, because two fetches succeeded",
            "After 100 ms, with nil",
          ],
          answer: 1,
          explain: "Wait always waits for every function to return. It then reports the first non-nil error. Without WithContext (and code that honours the context) nothing cancels the slow fetches.",
        },
      ],
    },
  ],
  takeaways: [
    "Everything is an <code>http.Handler</code>; <code>HandlerFunc</code> adapts plain functions, so middleware is just <code>func(http.Handler) http.Handler</code>.",
    "Set headers, then the status, then write the body. After the first write, headers and status are fixed.",
    "Go 1.22's <code>ServeMux</code> matches methods and wildcards, picks the most specific pattern, panics on ambiguous registrations and answers 405 on a method mismatch.",
    "Build your own <code>http.Server</code> with ReadHeader, Read, Write and Idle timeouts, and stop it with <code>Shutdown(ctx)</code> on SIGTERM.",
    "Create one <code>http.Client</code> with a timeout and reuse it; always check the error, then close and drain the response body.",
    "<code>WriteTimeout</code> and <code>SetDeadline</code> are connection deadlines, not handler cancellation; use contexts or <code>http.TimeoutHandler</code> to bound work.",
    "<code>errgroup</code> gives concurrent fan-out with the first error, cancellation through a context and a concurrency limit.",
  ],
  furtherReading: [
    { title: "net/http package documentation", url: "https://pkg.go.dev/net/http", note: "The reference for Server, Client, Transport and the ServeMux pattern syntax." },
    { title: "Routing Enhancements for Go 1.22 (the Go blog)", url: "https://go.dev/blog/routing-enhancements", note: "Methods, wildcards and the precedence rules in ServeMux." },
    { title: "errgroup package documentation", url: "https://pkg.go.dev/golang.org/x/sync/errgroup", note: "Go, Wait, WithContext, SetLimit and TryGo." },
  ],
};
