// Deep dive: Chapter 11, Working with REST APIs. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch11 = {
  hook: `<p>A mobile app sends <code>POST /orders</code>. The server creates the order, but the response is slow, the app's 10-second timeout fires, and the app helpfully retries. The customer now has two orders and two charges. Elsewhere in the same API, a handler that hit a database error wrote a friendly message and returned <strong>200 OK</strong>, so the client cached the error page as if it were data.</p>
<p>Neither bug is about Go syntax. Both are about the contract between client and server: which methods may be repeated safely, and what each status code promises. A REST API is mostly that contract, written down and honoured consistently. This chapter builds one with the standard library, then with gorilla/mux, puts a database behind it, writes a client for it, and looks at how to evolve it without breaking the clients you already have.</p>`,
  sections: [
    {
      id: "rest-style",
      title: "What makes an API RESTful",
      kicker: "The style",
      blocks: [
        {
          type: "text",
          html: `<p>REST (REpresentational State Transfer) is an architectural style, not a protocol. It is a set of constraints that, in practice, almost everyone implements as JSON over HTTP: <strong>client-server</strong> separation, <strong>statelessness</strong> (every request carries everything the server needs, with no session memory between requests), <strong>cacheable</strong> responses that say whether they can be reused, a <strong>uniform interface</strong> in which resources are named by URLs and manipulated through standard methods, and a <strong>layered system</strong> in which proxies and caches can sit in between without the client noticing.</p>
<p>Statelessness is the constraint with the biggest operational payoff. If no request depends on memory kept by a particular server process, any replica can serve any request, and you scale by adding replicas behind a load balancer.</p>`,
        },
        {
          type: "compare",
          title: "RPC-style versus resource-style URLs",
          items: [
            { title: "The book's first server", tone: "warn", html: "<code>POST /add</code>, <code>GET /get</code>, <code>DELETE /delete</code>: the verb lives in the path, and the user to act on travels in the JSON body. It works, but it is closer to remote procedure calls than to REST." },
            { title: "Resource-oriented", tone: "ok", html: "<code>POST /users</code> creates, <code>GET /users/42</code> reads, <code>PUT /users/42</code> replaces, <code>DELETE /users/42</code> removes. The URL names the thing; the method says what to do with it." },
          ],
        },
        {
          type: "text",
          html: `<p>The resource style is not just tidier. Caches, proxies, logs and monitoring tools understand methods and URLs, so a <code>GET /users/42</code> can be cached and retried by infrastructure that knows nothing about your application. A <code>POST /get</code> with the ID hidden in the body can't be. The author also makes a practical point worth repeating: most of the code in a real service handles the data, so design the API first, prototype it, and only then polish the HTTP layer.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>"Stateless" refers to session state on the server between requests, not to the data. The users table is state, of course. What REST rules out is "the server remembers that this connection logged in five requests ago". That is why the book's server sends credentials with every request, and why real APIs send a token with every request instead.</p>`,
        },
      ],
    },
    {
      id: "methods-status",
      title: "Methods and status codes are the contract",
      kicker: "Semantics",
      blocks: [
        {
          type: "problem",
          html: `<p>Clients, proxies and retry libraries make decisions from the method and the status code alone. If your server returns 200 for an error, or treats <code>GET</code> as a write, every one of those layers makes the wrong decision on your behalf.</p>`,
        },
        {
          type: "table",
          headers: ["Method", "Purpose", "Safe", "Idempotent", "Typical success"],
          rows: [
            ["GET", "Read a resource or collection", "yes", "yes", "200"],
            ["POST", "Create a resource, or trigger processing", "no", "no", "201 with Location, or 202"],
            ["PUT", "Replace a resource with the full new version", "no", "yes", "200 or 204"],
            ["PATCH", "Apply a partial change", "no", "depends on the patch", "200 or 204"],
            ["DELETE", "Remove a resource", "no", "yes", "200 or 204"],
          ],
        },
        {
          type: "text",
          html: `<p><strong>Safe</strong> means the request should not change server state, so crawlers and prefetchers may send it freely. <strong>Idempotent</strong> means sending it twice has the same effect as sending it once, so a client may retry after a timeout. <code>PUT /users/42</code> with a full body is idempotent: the second call writes the same thing again. <code>POST /orders</code> is not, which is the duplicate order in the opening story. APIs that take payments solve it with an <em>idempotency key</em>: the client sends a unique key with the POST, and the server returns the stored result instead of acting again if it sees the key twice. Go defines constants for every method (<code>http.MethodGet</code>, <code>http.MethodPost</code>, and so on); use them instead of string literals.</p>
<h3>Status codes clients rely on</h3>
<p>2xx means success: <strong>200 OK</strong>, <strong>201 Created</strong> (with a <code>Location</code> header naming the new resource), <strong>202 Accepted</strong> for work that will finish later, <strong>204 No Content</strong>. 4xx means the client must change something: <strong>400</strong> for malformed input, <strong>401</strong> when credentials are missing or invalid, <strong>403</strong> when the caller is known but not allowed, <strong>404</strong> for a missing resource, <strong>405</strong> for a known path with the wrong method, <strong>409 Conflict</strong> for a duplicate or a lost update. 5xx means the server failed and a retry might work.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>The book's user server answers <strong>400</strong> both for a wrong password and for a valid user who isn't an admin. It works because it is documented, but a client can't tell "log in again" (401) from "you are not allowed to do that" (403). Whatever you choose, the status code is the API: document it and keep it consistent.</p>`,
        },
        {
          type: "quiz",
          q: "A client's PUT /users/42 times out and it can't tell whether the server applied it. A POST /users timed out the same way. Which can it safely retry without risking a duplicate effect?",
          options: [
            "Both",
            "Only the PUT, because replacing the same resource twice has the same effect as once",
            "Only the POST, because creation is atomic",
            "Neither; HTTP requests must never be retried",
          ],
          answer: 1,
          explain: "PUT is idempotent: repeating it leaves the same state. POST is not, so a retry may create a second user unless the API supports an idempotency key or another deduplication scheme.",
        },
      ],
    },
    {
      id: "json-handlers",
      title: "JSON handlers with the standard library",
      kicker: "How it works",
      blocks: [
        {
          type: "text",
          html: `<p><code>encoding/json</code> maps Go structs to JSON through <strong>struct tags</strong> such as <code>json:"username"</code>. Only exported fields are serialised. Decoding is forgiving in two ways that surprise people: field names match case-insensitively, which is why both <code>"Username"</code> and <code>"username"</code> work in the book's curl examples, and unknown fields are silently ignored unless you call <code>Decoder.DisallowUnknownFields()</code>.</p>
<p>The book's <code>rServer.go</code> shows what a router hides: each handler checks <code>r.Method</code> itself, reads the body with <code>io.ReadAll</code>, unmarshals it and updates a global map. That is a good way to learn the moving parts. For real handlers, separate the wire types from the storage types so that fields like password hashes can never leak into a response, and put the boring parts in small helpers.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Wire types and two helpers",
          code: `type createUserRequest struct {
	Username string \`json:"username"\`
	Password string \`json:"password"\`
}

type userResponse struct {
	ID       int    \`json:"id"\`
	Username string \`json:"username"\`
	Admin    bool   \`json:"admin"\`
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}`,
          caption: "MaxBytesReader caps the body so one client can't make you buffer gigabytes. The response type has no password field at all.",
        },
        {
          type: "code",
          lang: "go",
          title: "A create handler that speaks in status codes",
          code: `func (a *api) createUser(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := decodeJSON(w, r, &req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Username == "" || len(req.Password) < 8 {
		http.Error(w, "username and an 8+ character password are required", http.StatusUnprocessableEntity)
		return
	}
	u, err := a.users.Create(r.Context(), req.Username, req.Password)
	if errors.Is(err, ErrDuplicate) {
		http.Error(w, "username taken", http.StatusConflict)
		return
	}
	if err != nil {
		log.Printf("create user: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Location", fmt.Sprintf("/v1/users/%d", u.ID))
	writeJSON(w, http.StatusCreated, u)
}`,
        },
        {
          type: "text",
          html: `<p>Each failure maps to a distinct status, the internal error is logged in full but returned to the client as a generic message, and success returns 201 with a <code>Location</code> header. <code>http.Error</code> sets <code>Content-Type: text/plain</code>, writes the status and the message; nothing should be written before or after it. The book's <code>/add</code> also intends to return 201, but some of its handlers print text before calling <code>http.Error</code>, which sends 200 first and turns the intended error status into a "superfluous WriteHeader" log line.</p>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Pass <code>r.Context()</code> into the database and any outgoing calls. When the client disconnects, the context is cancelled and the work stops instead of finishing for nobody.</p>`,
        },
      ],
    },
    {
      id: "routing",
      title: "Routing: gorilla/mux subrouters and the Go 1.22 ServeMux",
      kicker: "Dispatch",
      blocks: [
        {
          type: "text",
          html: `<p>Checking <code>r.Method</code> and splitting <code>r.URL.Path</code> by hand in every handler gets old quickly. The book's functional server uses <strong>gorilla/mux</strong>, a router that matches on several conditions at once: path variables with optional regular expressions (<code>/username/{id:[0-9]+}</code>, read with <code>mux.Vars(r)["id"]</code>), methods, hosts, headers and query values. Its <strong>subrouters</strong> group routes that share a condition, and the book makes one subrouter per HTTP method so <code>main.go</code> reads like a table of the API.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "gorilla/mux: one subrouter per method, under a version prefix",
          code: `func gorillaRoutes(a *api) http.Handler {
	r := mux.NewRouter()
	r.NotFoundHandler = http.HandlerFunc(a.notFound)
	r.MethodNotAllowedHandler = http.HandlerFunc(a.notAllowed)

	v1 := r.PathPrefix("/v1").Subrouter()
	get := v1.Methods(http.MethodGet).Subrouter()
	get.HandleFunc("/users", a.listUsers)
	get.HandleFunc("/users/{id:[0-9]+}", a.getUser)

	post := v1.Methods(http.MethodPost).Subrouter()
	post.HandleFunc("/users", a.createUser)

	del := v1.Methods(http.MethodDelete).Subrouter()
	del.HandleFunc("/users/{id:[0-9]+}", a.deleteUser)
	return r
}`,
        },
        {
          type: "text",
          html: `<p>Routing happens before your handler runs. A known path with the wrong method goes to <code>MethodNotAllowedHandler</code>, so in the book <code>PUT /getall</code> answers "Method not allowed!" before any credential check. A path matching nothing goes to <code>NotFoundHandler</code>. Without a regex, a variable matches up to the next slash.</p>
<p>Since Go 1.22, the standard <code>ServeMux</code> covers the most common reasons people reached for gorilla/mux: methods in patterns, <code>{name}</code> wildcards read with <code>r.PathValue</code>, and automatic 405 responses. It has no regex constraints, so you validate the ID in the handler.</p>`,
        },
        {
          type: "diagram",
          title: "How the router dispatches a request",
          caption: "The router checks the path first, then the method, and only then calls your handler. That is why a wrong method gets a 405 before any authentication logic runs.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Router decision flow: path known, then method allowed, then handler; otherwise 404 or 405">
<defs><marker id="go11-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="40" font-size="12" style="fill: var(--dg-muted)">The router decides before your handler runs.</text>
<rect x="20" y="95" width="130" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="85" y="111" text-anchor="middle" font-size="12" font-weight="700">Request</text>
<text x="85" y="128" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">PUT /getall</text>
<rect x="190" y="95" width="140" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="260" y="120" text-anchor="middle" font-size="12">Path known?</text>
<rect x="370" y="95" width="140" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="440" y="120" text-anchor="middle" font-size="12">Method allowed?</text>
<rect x="550" y="95" width="80" height="40" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="590" y="111" text-anchor="middle" font-size="12" font-weight="700">Handler</text>
<text x="590" y="128" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">auth, DB</text>
<line x1="150" y1="115" x2="188" y2="115" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go11-arrow)"/>
<line x1="330" y1="115" x2="368" y2="115" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go11-arrow)"/>
<line x1="510" y1="115" x2="548" y2="115" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go11-arrow)"/>
<text x="349" y="105" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">yes</text>
<text x="529" y="105" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">yes</text>
<line x1="260" y1="135" x2="260" y2="173" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go11-arrow)"/>
<line x1="440" y1="135" x2="440" y2="173" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go11-arrow)"/>
<text x="268" y="158" font-size="12" style="fill: var(--dg-muted)">no</text>
<text x="448" y="158" font-size="12" style="fill: var(--dg-muted)">no</text>
<rect x="180" y="175" width="160" height="36" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="260" y="198" text-anchor="middle" font-size="12">NotFoundHandler (404)</text>
<rect x="350" y="175" width="220" height="36" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="460" y="198" text-anchor="middle" font-size="12">MethodNotAllowedHandler (405)</text>
</svg>`,
        },
        {
          type: "code",
          lang: "go",
          title: "The same API on the Go 1.22+ ServeMux",
          code: `func (a *api) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/users", a.listUsers)
	mux.HandleFunc("POST /v1/users", a.createUser)
	mux.HandleFunc("GET /v1/users/{id}", a.getUser)
	mux.HandleFunc("DELETE /v1/users/{id}", a.deleteUser)
	return mux
}

func (a *api) getUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		http.Error(w, "id must be a positive integer", http.StatusBadRequest)
		return
	}
	u, err := a.users.ByID(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		http.Error(w, "no such user", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, u)
}`,
        },
        {
          type: "lab",
          id: "c11RestExplorer",
          caption: "Send requests to a simulation of the book's gorilla/mux user server. See the curl command, how the subrouters dispatch it, the status code and JSON, and what changes in the database.",
        },
        {
          type: "compare",
          title: "Choosing a router",
          items: [
            { title: "net/http ServeMux (1.22+)", tone: "ok", html: "No dependency. Methods, wildcards, most-specific-wins precedence, 405 with <code>Allow</code>. Enough for many APIs." },
            { title: "gorilla/mux", tone: "info", html: "A router only: regex variables, host, header and query matchers, subrouters with shared conditions, router-level middleware, named routes that build URLs." },
            { title: "Gin", tone: "info", html: "A framework with a fast radix-tree router derived from httprouter, plus request binding and validation, JSON rendering, middleware chains and route groups, around its own context type." },
          ],
        },
        {
          type: "quiz",
          q: "In the book's gorilla/mux server, an admin sends PUT /getall with correct credentials. GET /getall is the only route for that path. What happens?",
          options: [
            "The handler runs and returns every user, because the credentials are valid",
            "405 from MethodNotAllowedHandler; the handler and its credential check never run",
            "404 from NotFoundHandler",
            "400, because the body is a PUT body",
          ],
          answer: 1,
          explain: "The router matches the path but no route on that path accepts PUT, so it calls MethodNotAllowedHandler before any handler code, including authentication, runs.",
        },
      ],
    },
    {
      id: "persistence-security",
      title: "Behind the handlers: the database layer and the security gaps",
      kicker: "Making it real",
      blocks: [
        {
          type: "text",
          html: `<p>The book keeps SQL out of the handlers: a separate <code>restdb.go</code> exposes functions such as <code>ListAllUsers</code>, <code>DeleteUser</code> and <code>IsUserAdmin</code>, backed by SQLite. That split is worth copying. Handlers deal with HTTP; the store deals with SQL; swapping SQLite for PostgreSQL touches one file, and handler tests can use a fake store.</p>
<p>Two refinements make the store production-shaped. First, <code>*sql.DB</code> is not a connection; it is a <strong>pool</strong>, safe for concurrent use, meant to be opened once at startup and shared. Opening and closing it in every function, as the book does, throws the pool away each time. Second, every query takes a context and uses placeholders, never string concatenation.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type UserStore struct{ db *sql.DB }

var ErrNotFound = errors.New("not found")

func (s *UserStore) ByID(ctx context.Context, id int) (userResponse, error) {
	var u userResponse
	err := s.db.QueryRowContext(ctx,
		"SELECT id, username, admin FROM users WHERE id = ?", id,
	).Scan(&u.ID, &u.Username, &u.Admin)
	if errors.Is(err, sql.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}`,
          caption: "Placeholders keep user input out of the SQL text, which prevents injection. The placeholder syntax depends on the driver: ? for SQLite and MySQL, $1 for PostgreSQL.",
        },
        {
          type: "text",
          html: `<h3>What the prototype gets away with</h3>
<p>The book's user server is a teaching prototype, and it says so. Before anything like it faces real users, these gaps must close:</p>`,
        },
        {
          type: "list",
          items: [
            "<strong>Plaintext passwords</strong> are stored in the database and returned by <code>/getall</code>. Store a slow, salted hash (bcrypt or argon2) and never put password fields in a response type.",
            "<strong>Credentials in every request body</strong>, even on GET. Log in once, issue a short-lived token, and send it in the <code>Authorization</code> header over TLS.",
            "<strong>A default admin/admin account</strong> and no rate limit on <code>/login</code> invite brute force.",
            "<strong>Logging whole user structs</strong> writes passwords to the logs.",
          ],
        },
        {
          type: "code",
          lang: "go",
          title: "Hashing passwords with golang.org/x/crypto/bcrypt",
          code: `func hashPassword(pw string) ([]byte, error) {
	return bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
}

func checkPassword(hash []byte, attempt string) bool {
	return bcrypt.CompareHashAndPassword(hash, []byte(attempt)) == nil
}`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Graceful shutdown from the previous chapter applies unchanged: run <code>ListenAndServe</code> in a goroutine, wait for a signal, and call <code>Shutdown</code> with a context that has a deadline. The book passes <code>nil</code>; a context with a deadline guarantees the process eventually exits even if a request hangs.</p>`,
        },
      ],
    },
    {
      id: "clients-versioning",
      title: "Clients, tests and evolving the API with versions",
      kicker: "Living with clients",
      blocks: [
        {
          type: "text",
          html: `<p>The book's second half writes a <strong>cobra</strong> command-line client for the server, with persistent flags for the username, password, server and port. A dedicated client beats raw curl because it can validate input before sending it, interpret status codes, and pretty-print results, which makes it usable in scripts and CI jobs. The core of every command is the same: build a request, send it with a Client that has a timeout, and branch on the status code.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func (c *Client) GetUser(ctx context.Context, id int) (*User, error) {
	url := fmt.Sprintf("%s/v1/users/%d", c.base, id)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
		var u User
		return &u, json.NewDecoder(resp.Body).Decode(&u)
	case http.StatusNotFound:
		return nil, ErrNotFound
	default:
		return nil, fmt.Errorf("get user %d: %s", id, resp.Status)
	}
}`,
        },
        {
          type: "text",
          html: `<p>The book tests the server by hand with <code>curl -X METHOD -H 'Content-Type: application/json' -d '{...}'</code>. The next chapter automates that with <code>net/http/httptest</code>: build a request, call the <em>whole router</em> with a <code>ResponseRecorder</code>, and assert the status and body. Spend as much effort on the unhappy paths (bad JSON, wrong method, non-admin, unknown ID, duplicate create) as on the happy ones, because that is where status-code contracts usually break.</p>
<h3>Versioning</h3>
<p>Once clients depend on your API, renaming a field or changing a status code breaks them. Versioning lets old and new contracts live side by side while clients migrate. There are five common places to put the version, and none is universally right. The author prefers a path prefix, and recommends above all choosing one and documenting it.</p>`,
        },
        {
          type: "table",
          headers: ["Strategy", "Example", "Strength", "Weakness"],
          rows: [
            ["Path prefix", "<code>/v1/users</code>", "Visible, cacheable, trivial to route", "The resource URL changes between versions"],
            ["Query parameter", "<code>/users?version=1</code>", "Easy to add", "Easy to forget; muddles cache keys"],
            ["Custom header", "<code>API-Version: 2</code>", "Clean URLs", "Invisible in browsers and logs; caches need <code>Vary</code>"],
            ["Content negotiation", "<code>Accept: application/vnd.app.v2+json</code>", "Versions the representation, not the resource", "Harder to test and document"],
            ["Subdomain", "<code>v2.api.example.com</code>", "Separate deployments per version", "DNS and certificates per version"],
          ],
        },
        {
          type: "lab",
          id: "c11Versioning",
          caption: "Pick a versioning strategy and the version a client asks for, then deprecate or remove v1 to see what old clients receive.",
        },
        {
          type: "realworld",
          items: [
            { org: "Kubernetes", title: "Versions in the path, per API group", html: "Resources live under paths such as <code>/api/v1/pods</code> and <code>/apis/apps/v1/deployments</code>. A resource can be served at several versions at once while clients migrate, and stability is encoded in the name (<code>v1alpha1</code>, <code>v1beta1</code>, <code>v1</code>)." },
            { org: "Docker Engine API", title: "Path prefix", html: "Clients call endpoints such as <code>/v1.43/containers/json</code>, and the daemon supports a range of API versions so older clients keep working." },
            { org: "GitHub and Stripe", title: "Header-based, date-named versions", html: "GitHub's REST API reads an <code>X-GitHub-Api-Version</code> header, and Stripe reads a <code>Stripe-Version</code> header; both name versions by date. Stripe also popularised the <code>Idempotency-Key</code> header for safely retrying POSTs." },
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "REST design in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>REST questions are design questions in disguise. The interviewer wants to see you think about the contract (methods, status codes, versions) and about failure (retries, partial writes, bad input), and then show that you can implement it cleanly in Go.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>Constraints</strong>: client-server, stateless, cacheable, uniform interface, layered. Statelessness is what lets you scale replicas behind a load balancer.</li>
<li><strong>Methods</strong>: GET and HEAD are safe; GET, PUT and DELETE are idempotent; POST is not, so retries need idempotency keys.</li>
<li><strong>Status codes</strong>: 201 plus <code>Location</code> on create, 400 vs 422 for bad input, 401 vs 403, 404, 405 with <code>Allow</code>, 409 for conflicts, generic 500 bodies.</li>
<li><strong>Go mechanics</strong>: separate request and response types, <code>MaxBytesReader</code>, set headers before the status, pass <code>r.Context()</code> down, one shared <code>*sql.DB</code>, parameterised queries.</li>
<li><strong>Routing</strong>: Go 1.22 ServeMux for most APIs; gorilla/mux for regex and matcher-rich routing; Gin when you want a framework.</li>
<li><strong>Versioning</strong>: pick one strategy, usually a path prefix, and document the deprecation policy.</li>
</ol>`,
        },
        {
          type: "text",
          html: `<p>If you are asked to critique the book's user server, the strongest answer names the design issue first (credentials in every body, RPC-style paths, issuer and target packed into a JSON array for <code>/add</code>) and then proposes the fix: <code>POST /v1/sessions</code> returns a token, every request carries <code>Authorization: Bearer ...</code>, and <code>POST /v1/users</code> takes only the new user and answers 201 with a <code>Location</code>.</p>`,
        },
        {
          type: "quiz",
          q: "A logged-in user without the admin role calls DELETE /v1/users/7, which only admins may do. Which response best follows HTTP semantics?",
          options: [
            "400 Bad Request",
            "401 Unauthorized",
            "403 Forbidden",
            "405 Method Not Allowed",
          ],
          answer: 2,
          explain: "The server knows who the caller is (so not 401) and the method is supported on that resource (so not 405). The caller simply lacks permission, which is 403. Some APIs return 404 instead to avoid revealing that the resource exists.",
        },
      ],
    },
  ],
  takeaways: [
    "REST is a set of constraints; statelessness is what lets any replica serve any request.",
    "Name resources in URLs and express actions with methods: <code>GET /users/42</code>, not <code>POST /get</code>.",
    "GET, PUT and DELETE are idempotent and may be retried; POST is not, so use idempotency keys where duplicates hurt.",
    "Status codes are the contract: 201 with <code>Location</code>, 400 or 422, 401 vs 403, 404, 405, 409, and generic 500 bodies.",
    "Separate request and response types, cap bodies with <code>MaxBytesReader</code>, and never return password fields.",
    "Go 1.22's ServeMux handles methods and wildcards; gorilla/mux adds regex and matcher-rich subrouters; Gin is a full framework.",
    "Share one <code>*sql.DB</code> pool, use placeholders, hash passwords, and version the API in one documented way.",
  ],
  furtherReading: [
    { title: "RFC 9110: HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110", note: "The authoritative definitions of methods, safety, idempotency and status codes." },
    { title: "encoding/json package documentation", url: "https://pkg.go.dev/encoding/json", note: "Struct tags, Decoder options and how field matching works." },
    { title: "database/sql package documentation", url: "https://pkg.go.dev/database/sql", note: "Why DB is a pool, and how contexts and placeholders are used." },
  ],
};
