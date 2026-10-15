// Mastering Go - interactive notes data, part 4 (chapters 9-11)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch9`, part: 4, number: 9,
    title: `Building Web Services`,
    overview: `Everything here is built on <code>net/http</code>. The chapter starts with the three structs you meet everywhere (<strong>http.Request</strong>, <strong>http.Response</strong> and <strong>http.Transport</strong>), then builds a small web server (<code>wwwServer.go</code>) with handler functions and the default router. The statistics application from earlier chapters becomes a <strong>plain-text web service</strong> with its own <code>http.ServeMux</code> and an <code>http.Server</code> that sets timeouts. It is packaged as a <strong>multi-stage Docker image</strong> and driven by a <strong>cobra</strong> command-line client. On the client side the chapter goes from <code>http.Get()</code> to <code>http.NewRequest()</code> plus <code>Client.Do()</code>, and fetches URLs concurrently with <strong>errgroup</strong>. It ends with the three ways to <strong>time out</strong> HTTP connections: <code>SetDeadline()</code> on the raw connection, a client-side <code>context</code> or <code>Client.Timeout</code>, and the server's <code>ReadTimeout</code>/<code>WriteTimeout</code>.`,
    concepts: [
      { term: `The net/http package`, def: `The standard library's HTTP client and server. Clients use <code>http.Get()</code>, <code>http.NewRequest()</code> and <code>http.Client</code>. Servers use <code>http.HandleFunc()</code> / <code>ServeMux</code> to register endpoints and <code>http.ListenAndServe()</code> or <code>http.Server</code> to listen on a TCP address.`, why: `It is good enough for production servers. The book serves plain HTTP because Go services usually run in containers behind a reverse proxy (Nginx, Caddy) that handles TLS for the real domain name.` },
      { term: `http.Response`, def: `What a client gets back once the response headers arrive: <code>Status</code> ("200 OK"), <code>StatusCode</code> (200), <code>Proto</code>, <code>Header</code>, <code>Body io.ReadCloser</code>, <code>ContentLength</code> (-1 when unknown), <code>Trailer</code>, <code>Request</code>, <code>TLS</code>.`, why: `<code>Body</code> is a stream, not a byte slice. You must read it and <code>Close()</code> it. If you don't, the underlying TCP connection can't go back to the keep-alive pool and leaks.`, ex: `<code>wwwClient.go</code> prints <code>ContentLength is unknown!</code> for golang.org (chunked encoding) and counts the bytes itself by looping over <code>Body.Read()</code> into a 1 KB buffer until EOF.` },
      { term: `http.Request`, def: `Represents a request, both on the client (to send) and the server (received). Main fields: <code>Method</code>, <code>URL *url.URL</code>, <code>Header</code>, <code>Body</code>, <code>GetBody</code>, <code>ContentLength</code>, <code>Host</code>, <code>Form</code>/<code>PostForm</code>, <code>RemoteAddr</code>, <code>RequestURI</code>, <code>TLS</code>. Every request also carries a <code>Context()</code>.`, why: `Handlers read the path from <code>r.URL.Path</code> and the method from <code>r.Method</code>. On the server, <code>r.Context()</code> is cancelled when the client disconnects, so long handlers should watch it.` },
      { term: `http.Transport vs http.Client`, def: `<code>http.Transport</code> is the low-level <code>RoundTripper</code>. It dials, does TLS, sets proxies and keeps a pool of idle connections (<code>MaxIdleConns</code>, <code>MaxIdleConnsPerHost</code>, <code>IdleConnTimeout</code>, <code>ResponseHeaderTimeout</code>...). <code>http.Client</code> is the high-level API that adds redirects, cookies and an overall <code>Timeout</code>. If <code>Client.Transport</code> is nil, it uses <code>http.DefaultTransport</code>.`, why: `Create one Client (and one Transport) and reuse it. They are safe for concurrent use, and connection reuse is where the performance comes from. A new Transport per request means a new TCP and TLS handshake every time.` },
      { term: `Handlers, HandlerFunc and HandleFunc`, def: `Anything with <code>ServeHTTP(http.ResponseWriter, *http.Request)</code> is an <code>http.Handler</code>. <code>http.HandlerFunc</code> is a function type that adapts an ordinary function into a Handler. <code>mux.Handle("/time", http.HandlerFunc(timeHandler))</code> is equivalent to <code>mux.HandleFunc("/time", timeHandler)</code>. The package-level <code>http.HandleFunc()</code> registers on <code>DefaultServeMux</code>.`, why: `This is the classic interview "function type with a method" example. Because the adapter exists, middleware is just <code>func(http.Handler) http.Handler</code>.` },
      { term: `http.ResponseWriter`, def: `The interface a handler uses to reply. It implements <code>io.Writer</code>, so <code>fmt.Fprintf(w, ...)</code> works. Set headers with <code>w.Header().Set()</code> <em>before</em> calling <code>w.WriteHeader(code)</code>, and send the status before the first <code>Write()</code>. If you never call <code>WriteHeader()</code>, the first write sends 200.`, why: `Headers set after the first write are silently ignored, and a second <code>WriteHeader()</code> only logs "superfluous response.WriteHeader call". <code>fmt.Printf()</code> output goes to the server's terminal, not to the client.` },
      { term: `ServeMux and DefaultServeMux`, def: `<code>ServeMux</code> is the standard router. A pattern ending in <code>/</code> is a <strong>subtree</strong> pattern (it matches every path under it), and <code>/</code> catches everything not matched elsewhere. Without a trailing slash, a pattern matches only that exact path. Passing <code>nil</code> as the handler to <code>ListenAndServe</code> uses <code>DefaultServeMux</code>.`, why: `If only <code>/delete/</code> is registered, a request for <code>/delete</code> gets a <strong>301 Moved Permanently</strong> to <code>/delete/</code>, which is the reply the book shows. Since Go 1.22, patterns can also include a method and wildcards (<code>GET /users/{id}</code>), and the most specific pattern wins.`, demo: `c09MuxMatcher` },
      { term: `http.Server`, def: `A struct that holds the server configuration: <code>Addr</code> (":1234"), <code>Handler</code> (your mux), <code>ReadTimeout</code>, <code>WriteTimeout</code>, <code>IdleTimeout</code>, plus <code>ReadHeaderTimeout</code>, <code>MaxHeaderBytes</code>, <code>TLSConfig</code>. You start it with <code>s.ListenAndServe()</code> and stop it gracefully with <code>s.Shutdown(ctx)</code>.`, why: `<code>http.ListenAndServe(addr, h)</code> builds a Server with <strong>no timeouts</strong>. Production code should build its own Server. An address with no host (":8001") listens on all interfaces, and port 0 picks a random free port, which is handy in tests.` },
      { term: `The statistics web service`, def: `The book's API exchanges plain text: <code>/list</code>, <code>/insert/name/d1/d2/.../</code>, <code>/delete/name/</code>, <code>/search/name/</code>, <code>/status</code>. Handlers split <code>r.URL.Path</code> on "/" to get parameters and reply with status codes such as 200, 400 (not enough arguments), 404 (missing dataset) and 304 Not Modified (insert of an existing name).`, why: `It shows that the server's job is to send meaningful status codes and the client's job is to check them. The API is deliberately not RESTful (Chapter 11 fixes that), and it has no locking, so concurrent inserts can race. Adding a <code>sync.Mutex</code> is one of the chapter's exercises.` },
      { term: `Multi-stage Docker image`, def: `<code>buildDocker</code> compiles in a <code>golang:alpine</code> <em>builder</em> stage (go mod init/tidy, <code>go build -o /pro/server</code>), then copies only the binary into a fresh <code>alpine:latest</code> image with <code>EXPOSE 1234</code> and <code>CMD ["/pro/server"]</code>. <code>docker-compose.yml</code> runs the <code>goapp</code> image and maps port 1234:1234.`, why: `The runtime image holds no toolchain, so it is small and has less attack surface. Data kept inside the container is lost when the container goes away, so use a volume or an external database.` },
      { term: `http.Get() vs http.NewRequest() + Client.Do()`, def: `<code>http.Get(url)</code> is a one-liner on <code>DefaultClient</code>. It is convenient but you can't set a timeout or headers. <code>http.NewRequest(method, url, body)</code> builds a request you can customise (headers, method, body), and <code>c.Do(req)</code> sends it with a configured <code>http.Client{Timeout: 15 * time.Second}</code>.`, why: `<code>DefaultClient</code> has <strong>no timeout</strong>, so a stuck server can hang your program forever. <code>httputil.DumpResponse(resp, false)</code> (and <code>DumpRequest</code> on the server side) prints the raw headers for debugging.` },
      { term: `errgroup`, def: `<code>golang.org/x/sync/errgroup</code>: <code>g.Go(func() error)</code> starts a goroutine, and <code>g.Wait()</code> blocks until all of them finish and returns the <strong>first non-nil error</strong>. <code>errgroup.WithContext(ctx)</code> also cancels a derived context on the first error, and <code>g.SetLimit(n)</code> caps how many run at once.`, why: `It replaces a WaitGroup plus an error channel plus a mutex. The book's <code>eGroup.go</code> fetches every URL from the command line concurrently. A plain Group does <em>not</em> stop the other goroutines; only WithContext plus code that checks the context can.`, demo: `c09ErrGroup` },
      { term: `cobra client for the statistics service`, def: `<code>cobra init</code> plus <code>cobra add list|status|search|insert|delete</code> build the CLI. Persistent flags <code>--server/-S</code> and <code>--port/-P</code> are bound to viper. Each command builds a URL such as <code>"http://"+SERVER+":"+PORT+"/search/"+dataset</code>, calls <code>http.Get()</code>, checks <code>StatusCode == http.StatusOK</code> and prints <code>io.ReadAll(resp.Body)</code>.`, why: `The client validates input before sending it. <code>insert</code> parses each comma-separated value with <code>strconv.ParseFloat</code> and builds <code>/v1/v2/.../</code>. A wrong dataset name shows up only as <code>Status code: 404</code>.` },
      { term: `SetDeadline()`, def: `<code>net.Conn.SetDeadline(t)</code> sets an <em>absolute</em> time after which reads and writes fail with an i/o timeout. <code>withDeadline.go</code> plugs a custom dial function into <code>http.Transport{Dial: Timeout}</code>. It calls <code>net.DialTimeout()</code> and then <code>conn.SetDeadline(time.Now().Add(timeout))</code>.`, why: `A deadline is a point in time, not an idle timer, so it doesn't reset when data flows. A slow but steady response still dies when the deadline passes: <code>read tcp ...: i/o timeout</code>.`, demo: `c09Timeouts` },
      { term: `Client-side timeouts`, def: `Two idioms. <code>http.Client{Timeout: d}</code> limits the whole exchange (dial, request, waiting for headers, reading the body). <code>ctx, cancel := context.WithTimeout(...)</code> plus <code>http.NewRequestWithContext(ctx, ...)</code> limits one request and can also be cancelled by hand. <code>timeoutClient.go</code> fails with <code>context deadline exceeded</code>.`, why: `The context version composes with the rest of your program: a parent cancellation (shutdown, incoming request cancelled) propagates into the outgoing HTTP call. Always <code>defer cancel()</code>.`, demo: `c09Timeouts` },
      { term: `Server-side timeouts`, def: `<code>ReadTimeout</code> is the maximum time to read the whole request including the body. <code>WriteTimeout</code> is the maximum time from the end of reading the request headers until the response is written. <code>IdleTimeout</code> is how long a keep-alive connection may wait for the next request. <code>timeoutServer.go</code> uses 3 s each.`, why: `Server timeouts matter more than client ones. Without them, buggy clients or a slow-loris DoS can hold connections open until the server runs out of file descriptors. A handler that runs past <code>WriteTimeout</code> keeps running, but its writes fail and the client sees an empty reply.`, demo: `c09Timeouts` }
    ],
    cheatsheet: [
      { title: `Key net/http building blocks`, type: `table`, headers: [`Item`, `Role`, `Remember`], rows: [
        [`<code>http.Handler</code>`, `Interface: <code>ServeHTTP(w, r)</code>`, `Everything routable is a Handler`],
        [`<code>http.HandlerFunc</code>`, `Adapter type for plain functions`, `<code>mux.Handle(p, http.HandlerFunc(f))</code> == <code>mux.HandleFunc(p, f)</code>`],
        [`<code>http.NewServeMux()</code>`, `Your own router`, `Use instead of the global <code>DefaultServeMux</code>`],
        [`<code>http.Server</code>`, `Addr, Handler, timeouts`, `<code>ListenAndServe()</code>, <code>Shutdown(ctx)</code>`],
        [`<code>http.Client</code>`, `High-level client`, `Set <code>Timeout</code>; reuse it`],
        [`<code>http.Transport</code>`, `Dialing, TLS, connection pool`, `<code>DefaultTransport</code> when nil`],
        [`<code>http.Error(w, msg, code)</code>`, `Plain-text error reply`, `Don't write to <code>w</code> after it`],
        [`<code>httputil.DumpResponse</code>`, `Raw response for debugging`, `2nd arg: include body?`]
      ] },
      { title: `Which timeout covers what`, type: `table`, headers: [`Setting`, `Side`, `Covers`, `Failure looks like`], rows: [
        [`<code>Client.Timeout</code>`, `client`, `Dial + send + wait for headers + read body`, `<code>Client.Timeout exceeded</code>`],
        [`<code>context.WithTimeout</code>`, `client`, `Same, per request, cancellable`, `<code>context deadline exceeded</code>`],
        [`<code>conn.SetDeadline</code>`, `either`, `All reads/writes until an absolute time`, `<code>i/o timeout</code>`],
        [`<code>Server.ReadTimeout</code>`, `server`, `Reading the whole request (headers + body)`, `Connection closed while client uploads`],
        [`<code>Server.WriteTimeout</code>`, `server`, `End of header read to end of response write`, `Client gets EOF / empty reply`],
        [`<code>Server.IdleTimeout</code>`, `server`, `Keep-alive wait for the next request`, `Idle connection closed`],
        [`<code>Server.ReadHeaderTimeout</code>`, `server`, `Reading only the headers`, `Slow-loris protection`]
      ], note: `Defaults are zero (no timeout) for both <code>http.DefaultClient</code> and <code>http.ListenAndServe</code>.` },
      { title: `Server with its own mux and timeouts`, type: `code`, body: `func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/time", timeHandler)
    mux.HandleFunc("GET /search/{name}", searchHandler) // Go 1.22+ pattern
    mux.HandleFunc("/", defaultHandler)                 // catch-all

    s := &http.Server{
        Addr:              ":1234",
        Handler:           mux,
        ReadHeaderTimeout: 2 * time.Second,
        ReadTimeout:       3 * time.Second,
        WriteTimeout:      3 * time.Second,
        IdleTimeout:       10 * time.Second,
    }
    go func() {
        if err := s.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()
    sig := make(chan os.Signal, 1)
    signal.Notify(sig, os.Interrupt)
    <-sig
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    _ = s.Shutdown(ctx) // stop accepting, drain in-flight requests
}

func searchHandler(w http.ResponseWriter, r *http.Request) {
    name := r.PathValue("name")
    t := search(name)
    if t == nil {
        http.Error(w, "Could not be found: "+name, http.StatusNotFound)
        return
    }
    w.Header().Set("Content-Type", "text/plain")
    fmt.Fprintf(w, "%s %d %f %f\\n", t.Name, t.Len, t.Mean, t.StdDev)
}` },
      { title: `Client with a timeout and errgroup fan-out`, type: `code`, body: `var client = &http.Client{Timeout: 15 * time.Second} // reuse it

func fetchAll(ctx context.Context, urls []string) error {
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(4)
    for _, u := range urls { // Go 1.22+: u is per-iteration, no u := u needed
        g.Go(func() error {
            req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
            if err != nil {
                return err
            }
            resp, err := client.Do(req)
            if err != nil {
                return err // cancels ctx for the others
            }
            defer resp.Body.Close()
            if resp.StatusCode != http.StatusOK {
                return fmt.Errorf("%s: %s", u, resp.Status)
            }
            _, err = io.Copy(io.Discard, resp.Body) // drain so the conn is reused
            return err
        })
    }
    return g.Wait() // first error, after all goroutines return
}` },
      { title: `Gotchas`, type: `list`, items: [
        `Check <code>err</code> before touching <code>resp</code>, then <code>defer resp.Body.Close()</code>.`,
        `Set headers, then <code>WriteHeader()</code>, then <code>Write()</code>. Anything else is ignored or logged.`,
        `Register both <code>/delete</code> and <code>/delete/</code> (or use a 1.22 wildcard) if you don't want the 301 redirect.`,
        `<code>net/http</code> serves every request in its own goroutine, so shared maps need a mutex.`,
        `A port with no host (":1234") means all interfaces. Ports below 1024 need root, so avoid them.`,
        `<code>http.Get</code> and <code>http.ListenAndServe</code> have no timeouts. Build your own Client and Server.`
      ] }
    ],
    interview: [
      { q: `What is the difference between <code>http.Handler</code>, <code>http.HandlerFunc</code> and <code>http.HandleFunc</code>?`, a: `<p><code>http.Handler</code> is an interface with one method, <code>ServeHTTP(ResponseWriter, *Request)</code>. <code>http.HandlerFunc</code> is a <em>type</em> (<code>func(ResponseWriter, *Request)</code>) whose <code>ServeHTTP</code> method calls the function itself, so any function with the right signature can be converted into a Handler. <code>http.HandleFunc(pattern, f)</code> is a package-level <em>function</em> that registers <code>f</code> on <code>DefaultServeMux</code> and does that conversion for you.</p><p>With your own mux you write either <code>mux.Handle("/x", http.HandlerFunc(f))</code> or <code>mux.HandleFunc("/x", f)</code>.</p>`, diff: `easy` },
      { q: `Why should you avoid <code>http.Get()</code> and <code>http.ListenAndServe()</code> in production code?`, a: `<p>Both use zero-valued configuration, which means <strong>no timeouts</strong>. <code>http.Get</code> uses <code>http.DefaultClient</code>, which waits forever for a hung server. <code>http.ListenAndServe</code> builds an <code>http.Server</code> with no Read/Write/Idle timeouts, so slow or malicious clients can hold connections and file descriptors indefinitely (slow-loris).</p><p>Build an <code>http.Client{Timeout: ...}</code> (or use per-request contexts) and an <code>http.Server{ReadHeaderTimeout, ReadTimeout, WriteTimeout, IdleTimeout}</code>. Using your own mux also avoids <code>DefaultServeMux</code>, a global that any imported package (for example <code>net/http/pprof</code>) can register routes on.</p>`, diff: `med` },
      { q: `A request for <code>/delete</code> returns "301 Moved Permanently". Why?`, a: `<p>Only the subtree pattern <code>/delete/</code> was registered. When <code>ServeMux</code> gets a path without the trailing slash and the path plus "/" matches a registered subtree, it redirects the client to the slash version. The mux also redirects unclean paths (with <code>..</code> or <code>//</code>) to their cleaned form.</p><p>Fix it by registering <code>/delete</code> too, or (Go 1.22+) by using an exact wildcard pattern such as <code>DELETE /delete/{name}</code>.</p>`, diff: `easy` },
      { q: `How does pattern precedence work in <code>ServeMux</code> before and after Go 1.22?`, a: `<p><strong>Before 1.22:</strong> patterns were plain paths with an optional host. An exact match won, otherwise the <em>longest</em> matching subtree prefix won, and <code>/</code> matched everything.</p><p><strong>Go 1.22+:</strong> patterns are <code>[METHOD ][HOST]/path</code> with <code>{name}</code>, <code>{name...}</code> and <code>{$}</code> wildcards, read in a handler with <code>r.PathValue("name")</code>. The <em>most specific</em> pattern wins (the one that matches a strict subset of requests). Registering two patterns that overlap with neither more specific panics at registration time. <code>GET</code> also matches <code>HEAD</code>. If a path matches but the method doesn't, the mux replies <strong>405</strong> with an <code>Allow</code> header. Old-style patterns keep working.</p>`, diff: `med` },
      { q: `Explain <code>ReadTimeout</code>, <code>WriteTimeout</code>, <code>IdleTimeout</code> and <code>ReadHeaderTimeout</code>. What happens to a handler that exceeds <code>WriteTimeout</code>?`, a: `<ul><li><code>ReadHeaderTimeout</code>: time allowed to read the request headers.</li><li><code>ReadTimeout</code>: time to read the whole request, body included.</li><li><code>WriteTimeout</code>: deadline from the end of header reading until the response has been written.</li><li><code>IdleTimeout</code>: how long a keep-alive connection may sit idle between requests.</li></ul><p>WriteTimeout is a deadline on the connection, not a cancellation of the handler. The handler keeps running and burning CPU, and its writes fail once the deadline passes, so the client sees a closed connection or empty reply instead of a clean status code. To actually bound handler work, use <code>http.TimeoutHandler</code> (it replies 503) or check <code>r.Context()</code> with your own deadline.</p>`, diff: `hard` },
      { q: `What does <code>errgroup</code> give you over a <code>sync.WaitGroup</code>? Does the first error stop the other goroutines?`, a: `<p><code>errgroup.Group</code> combines waiting, error propagation and (with <code>WithContext</code>) cancellation. <code>g.Go(f)</code> starts <code>f</code>, and <code>g.Wait()</code> waits for all of them and returns the <strong>first</strong> non-nil error. <code>SetLimit(n)</code> bounds concurrency.</p><p>A plain <code>errgroup.Group</code> does <em>not</em> stop the others: they run to completion and <code>Wait</code> still waits for them. With <code>errgroup.WithContext</code>, the derived context is cancelled when the first function returns an error, but goroutines stop early only if they use that context (for example <code>http.NewRequestWithContext(ctx, ...)</code>). Before Go 1.22 the loop variable had to be copied (<code>url := url</code>), as the book does.</p>`, diff: `med` },
      { q: `Why must you close (and ideally drain) <code>resp.Body</code>?`, a: `<p>The body is a stream backed by a TCP connection. The Transport can return that connection to its idle pool only after the body has been read to EOF and closed. If you forget to close it, connections and goroutines leak. If you close without reading, the connection may be discarded instead of reused, so you pay new TCP and TLS handshakes.</p><p>Idiom: <code>if err != nil { return err }; defer resp.Body.Close()</code>, then <code>io.Copy(io.Discard, resp.Body)</code> if you don't need the content. The book's later clients call <code>defer resp.Body.Close()</code> <em>before</em> checking <code>err</code>, which panics with a nil pointer when the request fails.</p>`, diff: `med` },
      { q: `How do <code>conn.SetDeadline()</code>, <code>Client.Timeout</code> and <code>context.WithTimeout</code> differ?`, a: `<p><code>SetDeadline</code> works on a raw <code>net.Conn</code>. It sets an absolute point in time after which every read and write fails. It doesn't extend when data flows, so you call it again if you want a sliding timeout. The book installs it in a custom <code>Transport.Dial</code>.</p><p><code>Client.Timeout</code> is a per-Client limit on the whole exchange, including reading the body. A context timeout is per request, composes with parent cancellation (shutdown, an upstream request being cancelled) and can be cancelled by hand. Both of the latter fail with deadline errors. Use contexts when the call is part of a larger operation.</p>`, diff: `hard` },
      { q: `Why does the book build the server in a multi-stage Dockerfile, and what is its main operational weakness?`, a: `<p>Stage one (<code>golang:alpine</code>) has the compiler, git and module cache, and builds a static binary. Stage two (<code>alpine:latest</code>) only <code>COPY --from=builder</code> the binary, so the image is small and doesn't ship the toolchain. Port 1234 is exposed and mapped in docker-compose.</p><p>The weakness: the statistics service keeps its data in a JSON file inside the container, so the data disappears when the container is removed. Mount a volume or use an external database. The book also notes the service is HTTP-only and expects a TLS-terminating proxy in front of it.</p>`, diff: `easy` },
      { q: `The statistics service has no locks. What can go wrong under load, and how would you fix it?`, a: `<p><code>net/http</code> runs each request in its own goroutine, so concurrent <code>/insert</code> and <code>/delete</code> calls read and write the shared <code>data</code> slice and index map at the same time. That is a data race: Go maps can fault with "concurrent map writes", and duplicate checks can be lost.</p><p>Protect the data with a <code>sync.RWMutex</code> (RLock for list/search/status, Lock for insert/delete and the save to disk), or confine the state to one goroutine that receives commands over a channel. Run the tests with <code>-race</code> to confirm the fix.</p>`, diff: `med` }
    ],
    labs: [`c09MuxMatcher`, `c09Timeouts`, `c09ErrGroup`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch10`, part: 4, number: 10,
    title: `Working with TCP/IP and WebSocket`,
    overview: `This chapter goes one level below HTTP. After a refresher on <strong>TCP</strong> (reliable, connection-oriented), <strong>IP</strong> (IPv4 vs IPv6) and <strong>UDP</strong> (fast, unreliable datagrams), and the <code>nc(1)</code> tool, it uses the <code>net</code> package to write TCP clients two ways (<code>net.Dial</code> and <code>net.ResolveTCPAddr</code> + <code>net.DialTCP</code>), TCP servers two ways (<code>net.Listen</code> and <code>net.ListenTCP</code>), a UDP client and a random-number UDP server. Then comes the pattern behind real servers: a <strong>concurrent TCP server</strong> that runs each accepted connection in its own goroutine. The second half covers <strong>WebSocket</strong> (RFC 6455) with <code>gorilla/websocket</code>: an echo server built on <code>Upgrader.Upgrade</code>, testing with <code>websocat</code>, and a client that uses <code>select</code>, timeouts and signal handling. It finishes with <strong>RabbitMQ</strong> producers and consumers over AMQP.`,
    concepts: [
      { term: `TCP`, def: `Transmission Control Protocol. It sends data in <strong>segments</strong> over a connection, a full-duplex virtual circuit like a phone call. It is <strong>reliable</strong>: lost segments are retransmitted and bytes arrive in order. A connection is identified by source IP, source port, destination IP and destination port.`, why: `You get ordering and delivery without writing any code, at the cost of a handshake and head-of-line blocking. TCP is a <em>byte stream</em>, not a sequence of messages, so applications need framing (the book uses newline-delimited lines).`, demo: `c10TcpUdp` },
      { term: `IP, IPv4 and IPv6`, def: `IP routes packets from source to destination host by address and is unreliable by itself. IPv4 uses 32-bit addresses (about 4.3 billion, written like 10.20.32.245); IPv6 uses 128-bit addresses (eight colon-separated groups).`, why: `Go's network names reflect this: <code>tcp4</code>/<code>tcp6</code>, <code>udp4</code>/<code>udp6</code>, <code>ip4</code>/<code>ip6</code> restrict the address family, while <code>tcp</code>/<code>udp</code> accept both. <code>localhost</code> may resolve to <code>[::1]</code> first, as the book's "connection refused" output shows.` },
      { term: `UDP`, def: `User Datagram Protocol, built on IP and unreliable by design. Datagrams can be lost, duplicated or reordered, and nothing slows the sender down if the receiver can't keep up. There is no connection and no handshake.`, why: `Use it when latency matters more than reliability (DNS, games, metrics, streaming) or when the application does its own reliability. Each read returns exactly one datagram, so message boundaries are preserved, unlike TCP.`, demo: `c10TcpUdp` },
      { term: `nc(1) / netcat`, def: `A Swiss-army tool for TCP/UDP. <code>nc host port</code> is a TCP client, <code>nc -l port</code> is a TCP server, <code>-u</code> switches to UDP, and <code>-v</code>/<code>-vv</code> make it verbose.`, why: `It lets you test a client without writing the server (and the other way round). The book tests every program in the chapter against <code>nc -l 1234</code> or <code>nc -l -u 1234</code>.` },
      { term: `net.Dial and net.Listen`, def: `<code>net.Dial(network, address)</code> connects as a client. Networks: tcp, tcp4, tcp6, udp, udp4, udp6, ip, ip4, ip6, unix, unixgram, unixpacket. <code>net.Listen(network, address)</code> makes the program a server (tcp, tcp4, tcp6, unix, unixpacket). Dial returns a <code>net.Conn</code>; Listen returns a <code>net.Listener</code> whose <code>Accept()</code> returns a <code>net.Conn</code>.`, why: `<code>net.Conn</code> implements <code>io.Reader</code> and <code>io.Writer</code>, so <code>bufio</code>, <code>fmt.Fprintf</code>, <code>io.Copy</code> and other file-I/O code work over the network unchanged.` },
      { term: `TCP client (tcpC.go and otherTCPclient.go)`, def: `<code>tcpC.go</code>: <code>c, err := net.Dial("tcp", "host:port")</code>, then loop: read a line from stdin, <code>fmt.Fprintf(c, text+"\\n")</code>, read the reply with <code>bufio.NewReader(c).ReadString('\\n')</code>, and stop on <code>STOP</code>. <code>otherTCPclient.go</code> does the same with <code>net.ResolveTCPAddr("tcp4", addr)</code> + <code>net.DialTCP("tcp4", nil, tcpAddr)</code>, which returns a <code>*net.TCPConn</code>.`, why: `The typed variant gives access to TCP-specific knobs (<code>SetKeepAlive</code>, <code>SetNoDelay</code>, <code>CloseWrite</code>). The author prefers the generic <code>net.Dial</code>. The sample ignores <code>ReadString</code> errors for brevity, which real code must not do.` },
      { term: `TCP server (tcpS.go and otherTCPserver.go)`, def: `<code>l, _ := net.Listen("tcp", ":"+port)</code>, <code>defer l.Close()</code>, <code>c, _ := l.Accept()</code>, then a loop that reads lines and writes back the time in RFC 3339 format. <code>otherTCPserver.go</code> uses <code>net.ResolveTCPAddr</code> + <code>net.ListenTCP</code> and implements <strong>echo</strong> with <code>conn.Read(buffer)</code> / <code>conn.Write()</code>.`, why: `Both call <code>Accept()</code> only once, outside the loop, so they serve exactly <strong>one client</strong>. That is the bug the concurrent server fixes. The echo server also writes the whole 1024-byte buffer instead of <code>buffer[:n]</code>, a classic slip.`, demo: `c10ConcTcp` },
      { term: `UDP client (udpC.go)`, def: `<code>s, _ := net.ResolveUDPAddr("udp4", addr)</code>, <code>c, _ := net.DialUDP("udp4", nil, s)</code>. <code>c.RemoteAddr()</code> shows the server, <code>c.Write(data)</code> sends a datagram, and <code>c.ReadFromUDP(buffer)</code> returns the byte count, the sender's address and an error.`, why: `A "connected" UDP socket only fixes the default destination and filters incoming datagrams; no handshake takes place. If the reply datagram is lost, a blocking read waits forever, so real UDP clients set a read deadline.` },
      { term: `UDP server (udpS.go)`, def: `<code>net.ListenUDP("udp4", addr)</code> returns one <code>*net.UDPConn</code>. Loop: <code>n, addr, _ := conn.ReadFromUDP(buf)</code>, then <code>conn.WriteToUDP([]byte(strconv.Itoa(random(1, 1001))), addr)</code>.`, why: `There is no <code>Accept()</code>: a single socket serves every client because each datagram carries its sender address. The flip side: in the book's server, any client sending <code>STOP</code> shuts it down for everyone.` },
      { term: `Concurrent TCP server (concTCP.go)`, def: `<code>Accept()</code> runs inside an endless <code>for</code> loop, and each new connection is handed to <code>go handleConnection(c, count)</code>, then <code>count++</code>. The main goroutine goes straight back to accepting while each client gets its own goroutine.`, why: `This is how real Go servers work (net/http does the same internally). Goroutines are cheap, so one per connection scales to many thousands. Remember <code>defer c.Close()</code> at the <em>top</em> of the handler, plus a read deadline, so dead clients don't pin goroutines forever.`, demo: `c10ConcTcp` },
      { term: `The WebSocket protocol`, def: `RFC 6455: a <strong>full-duplex</strong>, long-lived channel over one TCP connection, started with an HTTP/1.1 <code>Upgrade: websocket</code> request and a <code>101 Switching Protocols</code> reply. URLs use <code>ws://</code> and <code>wss://</code>. Data travels in small frames (text, binary, ping, pong, close).`, why: `The server can push at any time without being asked, there is no per-message HTTP overhead, and every browser supports it, so it suits real-time apps. The author's advice: start with a plain TCP/IP service and move to WebSocket when you need it.`, demo: `c10WebSocket` },
      { term: `gorilla/websocket Upgrader`, def: `<code>websocket.Upgrader{ReadBufferSize, WriteBufferSize, CheckOrigin}</code>. In a normal handler, <code>ws, err := upgrader.Upgrade(w, r, nil)</code> hijacks the HTTP connection and returns a <code>*websocket.Conn</code>. The echo loop is <code>mt, msg, err := ws.ReadMessage()</code> then <code>ws.WriteMessage(mt, msg)</code>.`, why: `After the upgrade the connection is no longer HTTP. Writing to <code>w</code> with <code>fmt.Fprintf</code> breaks it, so use only Read/WriteMessage. The book's <code>CheckOrigin</code> returns <code>true</code> for everyone, which opens the door to cross-site WebSocket hijacking. Check the <code>Origin</code> header in real code.`, demo: `c10WebSocket` },
      { term: `WebSocket client`, def: `<code>websocket.DefaultDialer.Dial(url.URL{Scheme: "ws", Host, Path}.String(), nil)</code>. One goroutine loops on <code>ReadMessage()</code>. <code>main</code> runs a <code>select</code> over user input, <code>time.After(4s)</code> (after 5 idle periods it sends itself SIGINT with <code>syscall.Kill</code>), the reader's <code>done</code> channel and the <code>interrupt</code> channel.`, why: `On interrupt the client sends a proper close frame, <code>WriteMessage(websocket.CloseMessage, FormatCloseMessage(CloseNormalClosure, ""))</code>, then waits for <code>done</code> or 2 s. The server logs <code>close 1000 (normal)</code> instead of 1005 (no status).` },
      { term: `websocat`, def: `A command-line WebSocket client: <code>websocat ws://localhost:1234/ws</code>, with <code>-v</code> for verbose logs. Ctrl+D closes the connection.`, why: `It is the WebSocket equivalent of nc, useful for testing a server before a client exists.` },
      { term: `RabbitMQ and AMQP`, def: `RabbitMQ is an open-source message broker that speaks AMQP, a binary, frame-based protocol for queuing, routing and reliable delivery. Messages live in named FIFO <strong>queues</strong>. The Go module is <code>github.com/rabbitmq/amqp091-go</code>. The book runs <code>rabbitmq:3.12-management</code> with docker-compose (ports 5672 and 15672).`, why: `It decouples producers from consumers in time: messages are stored safely until someone reads them. Compared with Kafka, RabbitMQ is push-based, simpler and has no payload size limit, while Kafka is faster, pull-based and batches.` },
      { term: `Producer and consumer`, def: `Producer: <code>amqp.Dial("amqp://guest:guest@localhost:5672/")</code>, <code>conn.Channel()</code>, <code>ch.QueueDeclare("Go", ...)</code>, <code>ch.PublishWithContext(ctx, "", "Go", false, false, amqp.Publishing{ContentType: "text/plain", Body: ...})</code>. Consumer: <code>msgs, _ := ch.Consume("Go", "", true, ...)</code>, a goroutine ranging over <code>msgs</code>, and <code>&lt;-forever</code> to block.`, why: `<code>QueueDeclare</code> creates the queue if it is missing, so a typo silently creates a new queue. <code>autoAck=true</code> drops a message as soon as it is delivered, even if the consumer crashes, so use manual acks for at-least-once delivery. Load credentials from the environment, never hard-code them.` }
    ],
    cheatsheet: [
      { title: `net package: who calls what`, type: `table`, headers: [`Task`, `Generic`, `Typed`, `Returns`], rows: [
        [`TCP client`, `<code>net.Dial("tcp", "h:p")</code>`, `<code>net.ResolveTCPAddr</code> + <code>net.DialTCP</code>`, `<code>net.Conn</code> / <code>*net.TCPConn</code>`],
        [`TCP server`, `<code>net.Listen("tcp", ":p")</code>`, `<code>net.ListenTCP</code>`, `Listener; <code>Accept()</code> returns a Conn`],
        [`UDP client`, `<code>net.Dial("udp", ...)</code>`, `<code>net.ResolveUDPAddr</code> + <code>net.DialUDP</code>`, `<code>*net.UDPConn</code>`],
        [`UDP server`, `<code>net.ListenPacket("udp", ...)</code>`, `<code>net.ListenUDP</code>`, `<code>ReadFromUDP</code> / <code>WriteToUDP</code>`],
        [`Timeouts`, `<code>net.DialTimeout</code>`, `<code>conn.SetDeadline/SetReadDeadline</code>`, `<code>i/o timeout</code> error`]
      ] },
      { title: `TCP vs UDP vs WebSocket`, type: `table`, headers: [`Property`, `TCP`, `UDP`, `WebSocket`], rows: [
        [`Connection`, `3-way handshake`, `None`, `TCP handshake + HTTP Upgrade (101)`],
        [`Reliability / order`, `Yes / yes`, `No / no`, `Yes / yes (runs on TCP)`],
        [`Message boundaries`, `No (byte stream)`, `Yes (datagrams)`, `Yes (frames/messages)`],
        [`Server model in Go`, `Accept loop + goroutine per conn`, `One socket, sender address per datagram`, `HTTP handler + Upgrade + read loop`],
        [`Test tool`, `<code>nc host port</code>`, `<code>nc -u host port</code>`, `<code>websocat ws://...</code>`]
      ] },
      { title: `Concurrent TCP server template`, type: `code`, body: `func main() {
    l, err := net.Listen("tcp", ":1234")
    if err != nil {
        log.Fatal(err)
    }
    defer l.Close()
    for {
        c, err := l.Accept() // blocks until a client connects
        if err != nil {
            log.Println(err)
            continue
        }
        go handleConnection(c) // one goroutine per client
    }
}

func handleConnection(c net.Conn) {
    defer c.Close()
    r := bufio.NewReader(c)
    for {
        c.SetReadDeadline(time.Now().Add(30 * time.Second))
        line, err := r.ReadString('\\n')
        if err != nil {
            return // EOF, timeout or reset
        }
        if strings.TrimSpace(line) == "STOP" {
            return
        }
        fmt.Fprintf(c, "%s\\n", time.Now().Format(time.RFC3339))
    }
}` },
      { title: `WebSocket echo server (gorilla/websocket)`, type: `code`, body: `var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool {
        return r.Header.Get("Origin") == "https://app.example.com"
    },
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
    ws, err := upgrader.Upgrade(w, r, nil) // 101 Switching Protocols
    if err != nil {
        return // Upgrade already wrote an HTTP error
    }
    defer ws.Close()
    for {
        mt, msg, err := ws.ReadMessage()
        if err != nil {
            break // includes close frames: "close 1000 (normal)"
        }
        if err := ws.WriteMessage(mt, msg); err != nil {
            break
        }
    }
}` },
      { title: `Reminders`, type: `list`, items: [
        `<code>Accept()</code> belongs <em>inside</em> the loop. Outside it, you serve one client.`,
        `Write <code>buf[:n]</code>, not <code>buf</code>, after <code>Read</code>.`,
        `TCP has no message boundaries, so frame with newlines, length prefixes or an encoder.`,
        `Ports 0-1024 need root. Don't run servers as root.`,
        `gorilla/websocket allows one concurrent reader and one concurrent writer per connection.`,
        `<code>go get module@none</code> removes a dependency from go.mod; <code>go mod tidy</code> restores what the code needs.`
      ] }
    ],
    interview: [
      { q: `Compare TCP and UDP. When would you pick UDP?`, a: `<p><strong>TCP</strong> is connection-oriented (3-way handshake), reliable (acks and retransmission), ordered, flow- and congestion-controlled, and a <em>byte stream</em> with no message boundaries. <strong>UDP</strong> is connectionless, sends independent datagrams that may be lost, duplicated or reordered, preserves message boundaries and adds almost no overhead.</p><p>Pick UDP when low latency beats completeness (games, VoIP, live video, metrics), for small request/response protocols where retrying is cheap (DNS), for broadcast or multicast, or when you implement your own reliability on top (QUIC).</p>`, diff: `easy` },
      { q: `The book's <code>tcpS.go</code> can serve only one client. Why, and how do you fix it?`, a: `<p><code>l.Accept()</code> is called once, before the <code>for</code> loop, so after the first connection the program only talks to that client and never accepts another. Even with <code>Accept()</code> inside the loop, handling the client inline would make the server <em>sequential</em>: client two waits in the kernel backlog until client one sends STOP.</p><p>The fix, as in <code>concTCP.go</code>: <code>for { c, err := l.Accept(); ...; go handleConnection(c) }</code>. Each connection gets its own goroutine, and the main goroutine goes straight back to accepting.</p>`, diff: `easy` },
      { q: `Why is "TCP is a byte stream" important when you design a protocol on top of it?`, a: `<p>One <code>Write</code> of 100 bytes may arrive as two <code>Read</code>s of 60 and 40 bytes, and two writes may arrive in one read. TCP keeps the order of bytes, not the boundaries of your writes. Code that assumes one Read equals one message breaks under load or across slow networks.</p><p>You need <strong>framing</strong>: a delimiter (the book's newline plus <code>bufio.Reader.ReadString('\\n')</code>), a length prefix (<code>binary.Read</code> of a uint32, then <code>io.ReadFull</code>), or a self-delimiting encoding (<code>json.Decoder</code>, <code>gob</code>, protobuf with length).</p>`, diff: `med` },
      { q: `How does a single UDP socket serve many clients without <code>Accept()</code>?`, a: `<p>UDP has no connections. <code>ReadFromUDP(buf)</code> returns the datagram <em>and the sender's address</em>, and the server replies with <code>WriteToUDP(data, addr)</code>. The demultiplexing happens per datagram, so one goroutine (or a few reading the same socket) can serve every client.</p><p>Consequences: there is no per-client state unless you keep a map keyed by address, any client can affect global state (in the book, any client sending STOP kills the server), and source addresses can be spoofed, so UDP servers must be careful about amplification.</p>`, diff: `med` },
      { q: `Walk through a WebSocket upgrade. What does <code>Sec-WebSocket-Accept</code> prove?`, a: `<p>The client sends a normal HTTP/1.1 GET with <code>Connection: Upgrade</code>, <code>Upgrade: websocket</code>, <code>Sec-WebSocket-Version: 13</code> and a random 16-byte base64 <code>Sec-WebSocket-Key</code>, usually with an <code>Origin</code>. The server answers <code>101 Switching Protocols</code> with <code>Sec-WebSocket-Accept = base64(SHA-1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))</code>. From then on both sides exchange frames on the same TCP connection.</p><p>The accept value proves the server understood the WebSocket handshake (it isn't a cache or a plain HTTP server replaying a response). It is <em>not</em> authentication. Client-to-server frames are masked with a 4-byte key to stop cache-poisoning attacks on intermediaries.</p>`, diff: `hard` },
      { q: `What is <code>CheckOrigin</code> in gorilla/websocket and why is <code>return true</code> dangerous?`, a: `<p>Browsers attach the page's <code>Origin</code> to WebSocket handshakes but do <em>not</em> apply the same-origin policy or CORS to them. If your server authenticates with cookies and accepts any origin, a malicious page can open a socket to your server with the victim's cookies and read the data (cross-site WebSocket hijacking).</p><p>The default <code>CheckOrigin</code> (nil) rejects cross-origin requests when an Origin header is present. The book overrides it with <code>return true</code> for convenience. In production, compare the Origin against an allowlist and also authenticate the upgrade request.</p>`, diff: `med` },
      { q: `In the book's WebSocket client, why is reading done in a separate goroutine, and how does shutdown work?`, a: `<p><code>ReadMessage()</code> blocks. If <code>main</code> read inline, it couldn't react to user input, idle timeouts or Ctrl+C at the same time. A reader goroutine loops on <code>ReadMessage</code> and closes <code>done</code> on error, while <code>main</code> <code>select</code>s over <code>input</code>, <code>time.After(4s)</code>, <code>done</code> and <code>interrupt</code>.</p><p>On SIGINT (sent by hand or by the client itself after 5 idle periods) it writes a <code>CloseMessage</code> with <code>CloseNormalClosure</code> (1000), then waits for the server to close (<code>done</code>) or 2 s, so both sides log a clean <code>close 1000 (normal)</code>.</p>`, diff: `med` },
      { q: `When would you use WebSocket instead of plain HTTP, and when RabbitMQ instead of either?`, a: `<p><strong>WebSocket</strong>: when the server must push data at any time, or both sides talk often with low latency (chat, dashboards, collaborative editing, games). One long-lived connection avoids per-request HTTP overhead. Plain HTTP is simpler, cacheable and easier to load-balance for request/response traffic.</p><p><strong>RabbitMQ</strong> (or Kafka) is for <em>asynchronous</em>, decoupled communication. Producers and consumers needn't be online at the same time, messages are stored durably in queues, and work can be spread across consumers. It isn't a client-facing transport but a backbone between services.</p>`, diff: `easy` },
      { q: `What delivery guarantees does the book's RabbitMQ consumer have, and how would you harden it?`, a: `<p>It calls <code>ch.Consume("Go", "", true, ...)</code> with <strong>autoAck=true</strong>, so the broker considers a message done as soon as it is pushed. If the consumer crashes mid-processing, the message is lost (at-most-once). The queue is declared non-durable, so it doesn't survive a broker restart either, and the credentials are hard-coded.</p><p>Hardening: declare durable queues and publish persistent messages, use manual acks (<code>d.Ack(false)</code> after processing, <code>Nack</code>/requeue on failure) for at-least-once delivery with idempotent handlers, set <code>Qos(prefetch)</code>, watch connection close notifications to reconnect, and load credentials from the environment.</p>`, diff: `hard` }
    ],
    labs: [`c10TcpUdp`, `c10ConcTcp`, `c10WebSocket`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch11`, part: 4, number: 11,
    title: `Working with REST APIs`,
    overview: `REST (REpresentational State Transfer) is an architectural style, usually <strong>JSON over HTTP</strong>. The chapter covers the principles (client-server, stateless, cacheable, uniform interface, layered), the HTTP methods and the status codes clients rely on. It then builds a proof-of-concept <strong>RESTful server</strong> (<code>rServer.go</code>: <code>/add</code>, <code>/get</code>, <code>/delete</code>, <code>/time</code>) and a <strong>test client</strong> (<code>rClient.go</code>) using only the standard library. Next comes a functional <strong>login/user server</strong> backed by SQLite, routed with <strong>gorilla/mux</strong> using one <strong>subrouter per HTTP method</strong>, with path variables, <code>NotFoundHandler</code>, <code>MethodNotAllowedHandler</code> and graceful shutdown. It is tested with curl and compared with <strong>Gin</strong>. Finally, a <strong>cobra</strong> command-line client drives that server, and the chapter surveys <strong>API versioning</strong> strategies.`,
    concepts: [
      { term: `REST principles`, def: `REST is not a protocol. It is a set of constraints, usually implemented on HTTP(S): <strong>client-server</strong>, <strong>stateless</strong> (each request carries everything it needs), <strong>cacheable</strong>, <strong>uniform interface</strong> (resources identified by URLs and manipulated through standard methods) and <strong>layered system</strong>.`, why: `Statelessness is what lets you put any number of server replicas behind a load balancer. The author notes that in practice most of your code deals with the data, not with the HTTP plumbing.` },
      { term: `HTTP methods as CRUD`, def: `<code>POST</code> creates, <code>GET</code> reads, <code>PUT</code> replaces a resource with its full new version, <code>PATCH</code> applies a partial modification, and <code>DELETE</code> removes it. Go defines constants for them: <code>http.MethodGet</code>, <code>MethodPost</code>, <code>MethodPut</code>, <code>MethodPatch</code>, <code>MethodDelete</code>, <code>MethodHead</code>, <code>MethodOptions</code>...`, why: `GET, PUT and DELETE are <strong>idempotent</strong> (repeating them leaves the same state), POST is not, and GET and HEAD are <strong>safe</strong> (no side effects). Use the constants instead of string literals.`, demo: `c11RestExplorer` },
      { term: `Status codes clients rely on`, def: `200 OK, 201 Created, 202 Accepted (long-running work), 301 Moved Permanently (rare in APIs, versioning is used instead), 400 Bad Request, 401 Unauthorized (not authenticated), 403 Forbidden (authenticated but not allowed), 404 Not Found, 405 Method Not Allowed, 500 Internal Server Error.`, why: `Status codes <em>are</em> the API contract. The book's clients decide success only from <code>resp.StatusCode</code>. The book's user server answers 400 for "not an admin", where 401/403 would be more precise. Whatever you choose, document it.`, demo: `c11RestExplorer` },
      { term: `JSON struct tags`, def: `<code>type User struct { Username string \`json:"user"\`; Password string \`json:"password"\` }</code>. <code>json.Marshal</code> and <code>json.Unmarshal</code> (or <code>json.NewEncoder/NewDecoder</code> on streams) convert between Go structs and JSON using the tag names.`, why: `Only exported fields are serialised. Tags let the wire format differ from Go naming. Unknown JSON fields are ignored unless you call <code>Decoder.DisallowUnknownFields()</code>, and field-name matching on decode is case-insensitive, which is why <code>"Username"</code> and <code>"username"</code> both work in the book's curl examples.` },
      { term: `rServer.go: a stdlib RESTful server`, def: `Each handler checks <code>r.Method</code> (for example <code>if r.Method != http.MethodPost</code>, then <code>http.Error(w, "Error:", http.StatusMethodNotAllowed)</code>), reads the body with <code>io.ReadAll(r.Body)</code>, unmarshals it into a <code>User</code>, validates it and updates a global <code>DATA map[string]string</code>. <code>/add</code> calls <code>w.WriteHeader(http.StatusCreated)</code> on success, although the book's sample output shows 200.`, why: `It shows what routers hide from you. It also has deliberate shortcuts: a shared global <code>user</code> and an unlocked map (not concurrency-safe), a body on GET, re-adding the same user silently succeeds, and a delete with the wrong password returns an empty 200.` },
      { term: `http.Error()`, def: `<code>http.Error(w, msg, code)</code> sets <code>Content-Type: text/plain</code>, writes the status code and writes <code>msg</code> plus a newline.`, why: `It writes the header, so don't call <code>w.WriteHeader()</code> before it and don't write anything after it. The book calls <code>fmt.Fprintf</code> first in some handlers, which sends a 200 and makes the 405 a "superfluous WriteHeader".` },
      { term: `rClient.go: a test client`, def: `For each endpoint: <code>json.Marshal(user)</code>, then <code>http.NewRequest(http.MethodDelete, server+"/delete", bytes.NewReader(b))</code>, <code>req.Header.Set("Content-Type", "application/json")</code>, <code>(&http.Client{Timeout: 15 * time.Second}).Do(req)</code>, and return <code>resp.StatusCode</code>.`, why: `A client can test any server that implements the same endpoints, without knowing its internals. Watch the ordering bug in the sample: <code>defer resp.Body.Close()</code> runs before the <code>err</code>/<code>nil</code> check, so a failed request panics.` },
      { term: `The functional user server API`, def: `<code>/getall</code> (GET, admin), <code>/getid/{username}</code> (GET, admin), <code>/username/{id}</code> (GET returns the user, DELETE removes it, admin), <code>/logged</code> (GET), <code>/update</code> (PUT, admin, matched by username), <code>/login</code> and <code>/logout</code> (POST), <code>/add</code> (POST, admin, body is <code>[issuer, newUser]</code>), <code>/time</code> (any method, no JSON).`, why: `It shows designing the API first and implementing it second, and the author recommends building a prototype first. Credentials travel in the JSON body of every request instead of an <code>Authorization</code> header or token. The passwords are plaintext. Both are fine for a teaching prototype, but real systems need bcrypt or argon2 hashes and token-based auth.`, demo: `c11RestExplorer` },
      { term: `gorilla/mux matching`, def: `<code>mux.Router</code> can match on several conditions at once: <code>r.HandleFunc("/url", h).Methods(http.MethodPut)</code>, path variables with optional regexes <code>"/users/{id:[0-9]+}"</code> read with <code>mux.Vars(r)["id"]</code>, plus host, header, query and scheme matchers. <code>r.NotFoundHandler</code> catches unmatched paths and <code>r.MethodNotAllowedHandler</code> handles a known path with the wrong method.`, why: `Without a regex, a variable matches up to the next slash. A method mismatch on an existing route takes precedence over the handler's own checks: <code>PUT /getall</code> returns "Method not allowed!" before any credential check.`, demo: `c11RestExplorer` },
      { term: `Subrouters`, def: `<code>getMux := rMux.Methods(http.MethodGet).Subrouter()</code>, then <code>getMux.HandleFunc("/getall", GetAllHandler)</code>. A subrouter's routes are tried only if the parent condition (method, host, path prefix...) matches. The server has GET, PUT, POST and DELETE subrouters, and <code>/time</code> sits on the root router.`, why: `Shared conditions are written once, matching is pruned early, and <code>main.go</code> reads like a table of the API. <code>PathPrefix("/v1").Subrouter()</code> is also the usual way to version an API.` },
      { term: `Gin vs gorilla/mux`, def: `gorilla/mux is <em>only</em> a router. Gin is a framework built on the fast <code>httprouter</code> that adds JSON binding and rendering, validation, middleware, grouping and custom response writing.`, why: `The book's advice: start with gorilla/mux (or today the Go 1.22 ServeMux). Move to Gin when you need performance, middleware or batteries-included request binding.` },
      { term: `Database layer (restdb.go)`, def: `Handlers know nothing about SQL. <code>restdb.go</code> exposes <code>OpenConnection()</code> (<code>sql.Open("sqlite3", Filename)</code>), <code>DeleteUser(id)</code> (<code>db.Prepare("DELETE FROM users WHERE UserID = $1")</code> + <code>stmt.Exec(id)</code>), <code>ListAllUsers()</code> (<code>db.Query</code> + <code>rows.Next()</code>/<code>rows.Scan</code>), <code>IsUserValid</code>, <code>IsUserAdmin</code> and <code>InsertUser</code>.`, why: `Parameterised queries (<code>$1</code>) prevent SQL injection, and swapping SQLite for PostgreSQL touches only this file. One nit: <code>*sql.DB</code> is a connection <em>pool</em> meant to be opened once and shared, not opened and closed in every function, and <code>rows.Close()</code>/<code>rows.Err()</code> should be checked.` },
      { term: `Graceful shutdown`, def: `The server runs <code>s.ListenAndServe()</code> in a goroutine. <code>main</code> blocks on <code>signal.Notify(sigs, os.Interrupt)</code> and <code>&lt;-sigs</code>, then calls <code>s.Shutdown(...)</code>, which stops accepting and waits for in-flight requests.`, why: `Pass a context with a deadline (<code>context.WithTimeout(ctx, 5*time.Second)</code>) rather than <code>nil</code> as the book does, so shutdown can't hang forever. Treat <code>http.ErrServerClosed</code> from ListenAndServe as normal.` },
      { term: `Testing the server`, def: `The chapter exercises every endpoint with <code>curl -X METHOD -H 'Content-Type: application/json' -d '{...}' host:port/path</code>, with <code>-v</code> to see status codes, and checks the server's logs. Chapter 12 automates this with <code>net/http/httptest</code>: <code>httptest.NewRequest</code> + <code>httptest.NewRecorder()</code> to call handlers directly, or <code>httptest.NewServer</code> for end-to-end tests.`, why: `Test the unhappy paths (wrong method, bad JSON, non-admin, missing ID) as carefully as the happy ones. That is where status-code contracts usually break.` },
      { term: `cobra REST client`, def: `<code>cobra add add|delete|list|logged|login|logout|search|getid|time|update</code>. Persistent flags in <code>root.go</code>: <code>-u/--username</code>, <code>-p/--password</code>, <code>-d/--data</code> (a JSON record), <code>-s/--server</code>, <code>-P/--port</code>. Commands encode with <code>user.ToJSON(buf)</code> / <code>SliceToJSON</code> into a <code>bytes.Buffer</code>, send with <code>http.NewRequest</code> + <code>Client.Do</code>, check <code>StatusCode</code> and pretty-print the JSON.`, why: `A dedicated client can validate input, interpret status codes and format output, which makes it far better than raw curl for admin tasks, automation and CI/CD jobs. Example: <code>./rest-cli add -u admin -p admin --data '{"Username":"newUser","Password":"aPass"}'</code>.` },
      { term: `API versioning`, def: `Options: a custom header (<code>version-used</code>), a subdomain per version (<code>v1.server</code>), content negotiation (<code>Accept</code>/<code>Content-Type</code> media types), a path prefix (<code>/v1/...</code>, <code>/v2/...</code>) or a query parameter (<code>?version=v1</code>).`, why: `None is "correct". Be consistent and document it. The author prefers path prefixes because they are visible, cacheable and trivially routed with a subrouter per version.`, demo: `c11Versioning` }
    ],
    cheatsheet: [
      { title: `Methods and status codes`, type: `table`, headers: [`Method`, `Meaning`, `Idempotent`, `Typical success`, `Typical errors`], rows: [
        [`GET`, `Read a resource or collection`, `yes (safe)`, `200`, `404, 401/403`],
        [`POST`, `Create (or trigger an action)`, `no`, `201 + Location, or 200/202`, `400, 409`],
        [`PUT`, `Replace with the full representation`, `yes`, `200 / 204`, `400, 404`],
        [`PATCH`, `Partial update`, `not necessarily`, `200 / 204`, `400, 404, 422`],
        [`DELETE`, `Remove`, `yes`, `200 / 204`, `404`],
        [`any`, `Known path, wrong method`, `-`, `-`, `405 + Allow`]
      ] },
      { title: `The book's SQLite user server (gorilla/mux)`, type: `table`, headers: [`Subrouter`, `Path`, `Handler`, `Needs admin`], rows: [
        [`GET`, `<code>/getall</code>`, `GetAllHandler`, `yes`],
        [`GET`, `<code>/getid/{username}</code>`, `GetIDHandler`, `yes`],
        [`GET`, `<code>/logged</code>`, `LoggedUsersHandler`, `valid user`],
        [`GET`, `<code>/username/{id:[0-9]+}</code>`, `GetUserDataHandler`, `yes`],
        [`PUT`, `<code>/update</code>`, `UpdateHandler`, `yes`],
        [`POST`, `<code>/add</code>, <code>/login</code>, <code>/logout</code>`, `AddHandler, LoginHandler, LogoutHandler`, `add: yes`],
        [`DELETE`, `<code>/username/{id:[0-9]+}</code>`, `DeleteHandler`, `yes`],
        [`(root)`, `<code>/time</code>`, `TimeHandler (all methods)`, `no`]
      ], note: `<code>NotFoundHandler</code> answers "/x is not supported. Thanks for visiting!" and <code>MethodNotAllowedHandler</code> answers "Method not allowed!".` },
      { title: `gorilla/mux router with subrouters`, type: `code`, body: `rMux := mux.NewRouter()
rMux.NotFoundHandler = http.HandlerFunc(DefaultHandler)
rMux.MethodNotAllowedHandler = notAllowedHandler{}
rMux.HandleFunc("/time", TimeHandler) // every method

getMux := rMux.Methods(http.MethodGet).Subrouter()
getMux.HandleFunc("/getall", GetAllHandler)
getMux.HandleFunc("/getid/{username}", GetIDHandler)
getMux.HandleFunc("/username/{id:[0-9]+}", GetUserDataHandler)

postMux := rMux.Methods(http.MethodPost).Subrouter()
postMux.HandleFunc("/add", AddHandler)
postMux.HandleFunc("/login", LoginHandler)

deleteMux := rMux.Methods(http.MethodDelete).Subrouter()
deleteMux.HandleFunc("/username/{id:[0-9]+}", DeleteHandler)

func GetUserDataHandler(rw http.ResponseWriter, r *http.Request) {
    id, err := strconv.Atoi(mux.Vars(r)["id"])
    if err != nil {
        rw.WriteHeader(http.StatusBadRequest)
        return
    }
    u := FindUserID(id)
    if u.ID == 0 {
        rw.WriteHeader(http.StatusNotFound)
        return
    }
    rw.Header().Set("Content-Type", "application/json")
    json.NewEncoder(rw).Encode(u)
}` },
      { title: `JSON client request`, type: `code`, body: `type User struct {
    ID       int    \`json:"id"\`
    Username string \`json:"username"\`
    Password string \`json:"password"\`
    Admin    int    \`json:"admin"\`
}

func getAll(server string, issuer User) ([]User, error) {
    buf := new(bytes.Buffer)
    if err := json.NewEncoder(buf).Encode(issuer); err != nil {
        return nil, err
    }
    req, err := http.NewRequest(http.MethodGet, server+"/getall", buf)
    if err != nil {
        return nil, err
    }
    req.Header.Set("Content-Type", "application/json")
    c := &http.Client{Timeout: 15 * time.Second}
    resp, err := c.Do(req)
    if err != nil {
        return nil, err // check before touching resp
    }
    defer resp.Body.Close()
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("getall: %s", resp.Status)
    }
    var users []User
    err = json.NewDecoder(resp.Body).Decode(&users)
    return users, err
}` },
      { title: `Versioning strategies`, type: `table`, headers: [`Strategy`, `Example`, `Pros`, `Cons`], rows: [
        [`Path`, `<code>/v1/users</code>`, `Visible, cacheable, easy to route and test`, `URLs change between versions`],
        [`Query`, `<code>/users?version=1</code>`, `Easy to add`, `Easy to forget; caching keys get messy`],
        [`Custom header`, `<code>version-used: 2</code>`, `Clean URLs`, `Invisible in browser/logs; needs <code>Vary</code>`],
        [`Content negotiation`, `<code>Accept: application/vnd.app.v2+json</code>`, `Most "RESTful"; versions representations`, `Hardest to test and document`],
        [`Subdomain`, `<code>v2.api.example.com</code>`, `Separate deployments per version`, `DNS and TLS certificates per version`]
      ] }
    ],
    interview: [
      { q: `What makes an API RESTful? Name the constraints.`, a: `<p>REST is an architectural style: <strong>client-server</strong> separation, <strong>statelessness</strong> (no session state on the server between requests), <strong>cacheability</strong> (responses say whether they can be cached), a <strong>uniform interface</strong> (resources identified by URIs, manipulated through representations with standard methods, self-descriptive messages) and a <strong>layered system</strong> (proxies, gateways and caches are transparent). Code-on-demand is optional.</p><p>In practice "REST" usually means JSON over HTTP with resource URLs (<code>/users/42</code>), HTTP verbs as operations and meaningful status codes. The book's first server (<code>/add</code>, <code>/get</code>, <code>/delete</code>) is RPC-style. It suggests <code>/users/{id}</code> with GET, PUT/PATCH and DELETE as the more RESTful design.</p>`, diff: `easy` },
      { q: `PUT vs PATCH vs POST: what are the differences, and which are idempotent?`, a: `<p><strong>POST</strong> creates a subordinate resource or triggers processing. Repeating it can create duplicates, so it isn't idempotent (use idempotency keys for things like payments). <strong>PUT</strong> replaces the resource at a known URI with the full representation in the body. Doing it twice has the same effect as once, so it is idempotent. <strong>PATCH</strong> sends only the changes. It is idempotent only if the patch format is (a JSON Merge Patch setting fields is; "increment counter" isn't).</p><p>GET, HEAD, OPTIONS, PUT and DELETE are idempotent, and GET and HEAD are also safe. Retries by proxies and clients rely on this.</p>`, diff: `med` },
      { q: `401 vs 403 vs 404 vs 405: when do you use each? What does the book's user server do?`, a: `<ul><li><strong>401 Unauthorized</strong>: no valid credentials. The client should authenticate (send <code>WWW-Authenticate</code>).</li><li><strong>403 Forbidden</strong>: authenticated, but not allowed to do this.</li><li><strong>404 Not Found</strong>: no such resource. It is sometimes used instead of 403 to avoid revealing that a resource exists.</li><li><strong>405 Method Not Allowed</strong>: the resource exists but doesn't support this method. Include an <code>Allow</code> header.</li></ul><p>The book's server answers <strong>400</strong> for both wrong passwords and non-admin issuers, 404 for unknown IDs, and 405 through gorilla's <code>MethodNotAllowedHandler</code>. It works because it is documented, but 401/403 would let clients tell "log in again" apart from "you can't do that".</p>`, diff: `med` },
      { q: `How do gorilla/mux subrouters work, and why does the book group routes by HTTP method?`, a: `<p><code>sub := r.Methods(http.MethodGet).Subrouter()</code> creates a nested router that is consulted only if the parent's matchers succeed (method here; it could also be host, scheme, headers or <code>PathPrefix</code>). Routes registered on <code>sub</code> inherit that condition.</p><p>Grouping by method writes the method check once instead of in every handler, lets the same path (<code>/username/{id}</code>) map to different handlers for GET and DELETE, and makes the route table read like the API spec. Because routes are matched before handlers run, a wrong method gets 405 from <code>MethodNotAllowedHandler</code> before any authentication logic, as <code>PUT /getall</code> shows in the book.</p>`, diff: `med` },
      { q: `Spot the bugs in this client snippet: <code>resp, err := c.Do(req); if err != nil { fmt.Println(err) }; defer resp.Body.Close(); if resp == nil { return resp.StatusCode }</code>`, a: `<p>Three problems, all from the book's <code>rClient.go</code>:</p><ol><li>After printing <code>err</code> it keeps going. When <code>Do</code> fails, <code>resp</code> is nil, so <code>resp.Body</code> panics.</li><li><code>defer resp.Body.Close()</code> comes before the nil check, so the check is useless.</li><li>Inside <code>if resp == nil</code> it reads <code>resp.StatusCode</code>, a guaranteed nil dereference.</li></ol><p>Correct pattern: <code>if err != nil { return 0, err }</code>, then <code>defer resp.Body.Close()</code>, then use <code>resp.StatusCode</code> and read the body.</p>`, diff: `easy` },
      { q: `gorilla/mux vs Gin vs the Go 1.22 ServeMux: how do you choose?`, a: `<p><strong>Go 1.22+ ServeMux</strong> now supports method matching, <code>{wildcards}</code>, <code>{rest...}</code> and automatic 405s. For many APIs it is enough, with no dependency. <strong>gorilla/mux</strong> adds regex variables, host, header and query matchers, subrouters with shared conditions, middleware on routers and named routes with URL building. It is <em>only</em> a router. <strong>Gin</strong> is a framework on top of the fast <code>httprouter</code>: binding and validation, JSON rendering, middleware chains, route groups and its own context type.</p><p>The book suggests trying gorilla/mux first and reaching for Gin when you need raw performance, middleware or batteries included. Because they all speak <code>net/http</code> (Gin via adapters), handlers and tests (httptest) carry over.</p>`, diff: `med` },
      { q: `What security problems does the book's user server have that you must fix before production?`, a: `<ul><li><strong>Plaintext passwords</strong> in SQLite and in JSON responses (<code>/getall</code> returns them). Hash with bcrypt or argon2 and never return password fields.</li><li><strong>Credentials in every request body</strong>, even on GET. Use a login that issues a short-lived token (or session) and send it in <code>Authorization</code>, over TLS.</li><li>A default <strong>admin/admin</strong> account.</li><li>No rate limiting on <code>/login</code>, and 400 responses that don't distinguish auth failures.</li><li>No authorization on <code>/logged</code>, plus verbose logging of user structs (including passwords).</li></ul><p>The SQL itself is parameterised (<code>$1</code>), so there is no injection. The author's remark that regular users would normally go through a web UI is about workflow, not a security control.</p>`, diff: `hard` },
      { q: `How would you test REST handlers without starting a real server?`, a: `<p>Use <code>net/http/httptest</code>. <code>req := httptest.NewRequest(http.MethodGet, "/username/3", body)</code> and <code>rr := httptest.NewRecorder()</code>, then call the handler, or better the whole router (<code>router.ServeHTTP(rr, req)</code>) so routing, path variables and 404/405 behaviour are covered. Assert <code>rr.Code</code>, headers and the decoded JSON.</p><p>Use <code>httptest.NewServer(router)</code> for real-network tests of clients. Isolate the database behind an interface or use a temporary SQLite file per test, and cover the unhappy paths: bad JSON, wrong method, non-admin, unknown ID, duplicate add.</p>`, diff: `med` },
      { q: `Compare API versioning strategies. Which does the author prefer?`, a: `<p><strong>Path</strong> (<code>/v1/...</code>): explicit, cacheable, easy to route (<code>r.PathPrefix("/v1").Subrouter()</code>) and to test in a browser, but the resource URI changes. <strong>Query parameter</strong>: easy, but optional parameters get forgotten and complicate caching. <strong>Custom header</strong>: clean URLs, but invisible and needs <code>Vary</code> for caches. <strong>Content negotiation</strong> (<code>Accept: application/vnd.x.v2+json</code>): purist, versions the representation rather than the resource, but harder for clients and tools. <strong>Subdomain</strong>: allows separate deployments, but costs DNS and certificates.</p><p>The author says there is no single right answer, consistency matters most, and he prefers <code>/v1</code>, <code>/v2</code> path prefixes.</p>`, diff: `easy` },
      { q: `Why does the user server read the issuer and the target as a JSON array for <code>/add</code> and <code>/update</code>? What would a cleaner design look like?`, a: `<p>The server is stateless and has no token mechanism, so every privileged request must carry the issuer's credentials. For <code>/add</code> the body is <code>[{issuer}, {newUser}]</code>, and the handler unmarshals into <code>[]User</code>, checks <code>IsUserAdmin(users[0])</code> and inserts <code>users[1]</code>. Order matters, and that is documented only by convention.</p><p>Cleaner: authenticate once (<code>POST /login</code> returns a token), send <code>Authorization: Bearer ...</code> with every request, and make the body just the resource: <code>POST /v1/users</code> with <code>{username, password}</code> answers <code>201 Created</code> with a <code>Location: /v1/users/5</code> header, and authorization comes from the token's claims.</p>`, diff: `hard` }
    ],
    labs: [`c11RestExplorer`, `c11Versioning`]
  }
);
