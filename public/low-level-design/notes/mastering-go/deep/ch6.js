// Deep dive: Chapter 6, Go packages and functions. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch6 = {
  hook: `<p>A nightly job imports a directory of CSV files. It loops over the paths, opens each file, and writes <code>defer f.Close()</code> right after the open, exactly as every Go tutorial shows. It works for months. Then a customer uploads 20,000 files, and the job dies with <code>too many open files</code>.</p>
<p>Nothing was leaking in the usual sense. <code>defer</code> runs when the <em>surrounding function</em> returns, not at the end of a loop iteration, so every file stayed open until the whole import finished. Functions are where most Go code lives, and their details (deferred calls, closures, named results, initialization order) decide whether code is correct under load. This chapter covers those details, then zooms out to how functions are packaged, versioned and shipped: packages, modules, workspaces and build-time version stamps.</p>`,
  sections: [
    {
      id: "packages-and-visibility",
      title: "Packages, visibility and getting code",
      kicker: "Packages",
      blocks: [
        {
          type: "text",
          html: `<p>A package is a directory of <code>.go</code> files that all start with the same <code>package</code> clause. It is the unit of compilation, of namespacing and of encapsulation. Callers refer to its contents through the package name: <code>strings.Split</code>, <code>http.Get</code>.</p>
<p>Visibility follows one rule: identifiers that start with an uppercase letter are <strong>exported</strong> and visible to importers; everything else is private to the package. That applies to functions, types, variables, constants, struct fields and methods. There is no <code>protected</code> and no per-file privacy. Go adds one more boundary: a package inside a directory named <code>internal</code> can only be imported by code rooted at that directory's parent, which lets a module share code between its own packages without making it public API.</p>`,
        },
        {
          type: "list",
          title: "Package naming conventions",
          items: [
            "Short, lowercase, single word: <code>bufio</code>, <code>sqlite</code>, <code>auth</code>. No underscores or mixed caps.",
            "Name for what the package provides, not what it contains: avoid <code>util</code>, <code>common</code> and <code>helpers</code>.",
            "Avoid stutter: callers write <code>user.Store</code>, so do not name the type <code>user.UserStore</code>.",
          ],
        },
        {
          type: "text",
          html: `<p>Third-party code arrives through modules. In module mode, <code>go get example.com/lib@v1.4.0</code> adds or changes a dependency in <code>go.mod</code>, and <code>go install example.com/tool@latest</code> builds a command and puts the binary in <code>$GOPATH/bin</code> (usually <code>~/go/bin</code>). Since Go 1.18, <code>go get</code> only manages dependencies and no longer builds anything. Downloaded module sources live in a read-only cache under <code>~/go/pkg/mod</code>, and <code>go mod tidy</code> adds missing requirements and removes unused ones.</p>`,
        },
      ],
    },
    {
      id: "functions-and-closures",
      title: "Functions as values: closures, callbacks and variadics",
      kicker: "Functions",
      blocks: [
        {
          type: "text",
          html: `<p>Go functions can return several values, and the idiom <code>(result, error)</code> is everywhere. Results can also be named: <code>func split(n int) (q, r int)</code> declares <code>q</code> and <code>r</code> as variables initialized to zero, and a bare <code>return</code> returns their current values. Named results document what each value means and are needed when a deferred function must change a result, but bare returns in long functions hurt readability, so use them sparingly.</p>
<p>Functions are first-class values with types like <code>func(int, int) bool</code>. You can store them in variables and maps, pass them as arguments and return them. A <strong>function literal</strong> (an anonymous function) that refers to variables from its enclosing scope is a <strong>closure</strong>: it captures those variables themselves, not copies, and keeps them alive as long as the closure exists.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func counter() func() int {
	c := 0 // captured: lives on after counter returns
	return func() int {
		c++
		return c
	}
}

func sum(label string, nums ...float64) float64 { // nums is a []float64
	total := 0.0
	for _, n := range nums {
		total += n
	}
	fmt.Println(label, total)
	return total
}

func main() {
	a, b := counter(), counter()
	fmt.Println(a(), a(), b()) // 1 2 1: each closure has its own c

	people := []Person{{"Bo", 25}, {"Ana", 31}}
	sort.Slice(people, func(i, j int) bool { return people[i].Age < people[j].Age })

	sum("none")
	sum("three", 1, 2, 3)
	vals := []float64{4, 5}
	sum("slice", vals...) // unpack: passes the slice itself, not a copy
}`,
        },
        {
          type: "text",
          html: `<p>A <strong>variadic</strong> parameter, written <code>...T</code>, must be last and arrives in the function as a <code>[]T</code> (nil if the caller passed nothing). Callers can pass individual values or unpack an existing slice with <code>s...</code>; in the second case the function receives that same slice, so writes to its elements are visible to the caller. <code>append(dst, src...)</code> and <code>fmt.Println(args...)</code> are the variadics you use daily.</p>
<h3>Loop variables and closures since Go 1.22</h3>
<p>Before Go 1.22, a <code>for</code> loop declared its variable once and reused it, so closures created in the loop all saw the final value. Since Go 1.22 (for modules whose <code>go.mod</code> says <code>go 1.22</code> or later), every iteration gets its own variable, and closures capture the value from their own iteration. Old code often contains <code>i := i</code> inside loops; that line is now harmless but unnecessary.</p>`,
        },
        {
          type: "lab",
          id: "c06Closures",
          caption: "Pick which anonymous function funRet returns and call it, then create several counters and see that each closure keeps its own captured state.",
        },
        {
          type: "quiz",
          q: "<code>c1 := counter(); c2 := counter(); c1(); c1(); fmt.Println(c2())</code> prints what, given the counter function above?",
          options: ["0", "1", "3", "It depends on scheduling"],
          answer: 1,
          explain: "Every call to <code>counter</code> creates a new variable <code>c</code> captured by a new closure. <code>c1</code>'s calls do not touch <code>c2</code>'s variable, so <code>c2()</code> returns 1.",
        },
      ],
    },
    {
      id: "defer",
      title: "defer: LIFO order, early evaluation, late execution",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p><code>defer f(args)</code> schedules a call to run when the surrounding function returns, whether it returns normally or panics. Deferred calls run in <strong>last-in, first-out</strong> order, and their <strong>arguments are evaluated immediately</strong>, at the defer statement.</p>`,
        },
        {
          type: "diagram",
          title: "Deferred calls form a stack",
          caption: "Each defer statement pushes a call, with its arguments already evaluated. When the function returns, the calls pop off in reverse order.",
          svg: `<svg viewBox="0 0 600 240" role="img" aria-label="Three defer statements push calls onto a stack that runs in reverse order on return">
<defs><marker id="go6-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="28" font-size="13" font-weight="700">function body runs</text>
<rect x="20" y="44" width="150" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="20" y="92" width="150" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="20" y="140" width="150" height="36" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="95" y="67" text-anchor="middle" font-size="12">1. defer A()</text>
<text x="95" y="115" text-anchor="middle" font-size="12">2. defer B()</text>
<text x="95" y="163" text-anchor="middle" font-size="12">3. defer C()</text>
<text x="240" y="28" font-size="13" font-weight="700">defer stack</text>
<rect x="240" y="44" width="140" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="240" y="88" width="140" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="240" y="132" width="140" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="310" y="69" text-anchor="middle" font-size="12">C (top)</text>
<text x="310" y="113" text-anchor="middle" font-size="12">B</text>
<text x="310" y="157" text-anchor="middle" font-size="12">A (bottom)</text>
<line x1="176" y1="110" x2="234" y2="110" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go6-arrow)"/>
<text x="186" y="100" font-size="12" style="fill: var(--dg-muted)">push</text>
<text x="430" y="28" font-size="13" font-weight="700">on return (LIFO)</text>
<rect x="430" y="44" width="150" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="430" y="92" width="150" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="430" y="140" width="150" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="505" y="67" text-anchor="middle" font-size="12">C() runs first</text>
<text x="505" y="115" text-anchor="middle" font-size="12">then B()</text>
<text x="505" y="163" text-anchor="middle" font-size="12">A() runs last</text>
<line x1="386" y1="110" x2="424" y2="110" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go6-arrow)"/>
<text x="392" y="100" font-size="12" style="fill: var(--dg-muted)">pop</text>
<text x="20" y="208" font-size="12" style="fill: var(--dg-muted)">Arguments are evaluated when the defer statement runs;</text>
<text x="20" y="226" font-size="12" style="fill: var(--dg-muted)">the calls themselves run as the function returns or panics.</text>
</svg>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func demo() {
	x := 1
	defer fmt.Println("argument x =", x)            // x evaluated now: 1
	defer func() { fmt.Println("closure x =", x) }() // reads x at exit: 2
	x = 2
}
// Output:
// closure x = 2
// argument x = 1

// A deferred closure can change a named result: here, report Close errors.
func writeFile(path string, data []byte) (err error) {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer func() {
		if cerr := f.Close(); cerr != nil && err == nil {
			err = cerr
		}
	}()
	_, err = f.Write(data)
	return err
}`,
          caption: "For files you write, Close can report the error that matters most (data not flushed to disk). The named result lets the deferred function surface it.",
        },
        {
          type: "lab",
          id: "c06Defer",
          caption: "Step through deferred calls as they pile onto the stack and unwind. Toggle the Go version to see why a loop of deferred closures printed 0 0 0 before Go 1.22 and prints 1 2 3 since.",
        },
        {
          type: "text",
          html: `<h3>Defer in loops, and recover</h3>
<p>Because deferred calls wait for the function to return, a <code>defer</code> inside a long loop accumulates: every file, lock or connection stays held until the end. The fix from the introduction is to move the body of the loop into its own function, so each iteration's <code>defer</code> runs when that small function returns.</p>
<p><code>recover()</code>, called directly inside a deferred function, stops a panic in progress and returns the panic value. It is how <code>net/http</code> keeps one failing handler from crashing the whole server. Use it at such boundaries, convert the panic into an error or a log entry, and do not use panic and recover as ordinary control flow.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func importAll(paths []string) error {
	for _, p := range paths {
		if err := importOne(p); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
	}
	return nil
}

func importOne(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close() // runs when importOne returns: one open file at a time
	return parse(f)
}`,
        },
        {
          type: "quiz",
          q: "What does <code>for i := 0; i &lt; 3; i++ { defer fmt.Print(i, \" \") }</code> print?",
          options: ["0 1 2", "2 1 0", "3 3 3", "0 0 0"],
          answer: 1,
          explain: "Each defer evaluates its arguments immediately, capturing 0, 1 and 2, and the calls run in LIFO order, so the output is 2 1 0. This is true in every Go version, because the value is passed as an argument rather than captured by a closure.",
        },
      ],
    },
    {
      id: "initialization-order",
      title: "init() and package initialization order",
      kicker: "Program start-up",
      blocks: [
        {
          type: "text",
          html: `<p>Before <code>main</code> runs, every package in the program is initialized exactly once, and a package is always initialized after the packages it imports. Within a package, two things happen in order: first all package-level variables are initialized, then all <code>init()</code> functions run.</p>
<p>Package-level variables are initialized in <strong>dependency order</strong>, not source order: <code>var a = b + 1</code> written above <code>var b = f()</code> still initializes <code>b</code> first. Variables with no dependency between them go in declaration order. <code>init</code> functions take no arguments, return nothing and cannot be called by your code; a package may have several, even in one file, and they run in the order they appear (the go command presents files to the compiler sorted by name).</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `package main

import (
	"fmt"

	_ "github.com/mattn/go-sqlite3" // imported only for its init(): registers "sqlite3"
)

var a = b + 1 // initialized second, because it depends on b
var b = f()   // initialized first

func f() int {
	fmt.Println("initializing b")
	return 1
}

func init() { fmt.Println("init: a =", a) }

func main() { fmt.Println("main") }

// Output (after the driver package has initialized silently):
// initializing b
// init: a = 2
// main`,
        },
        {
          type: "text",
          html: `<p>The <strong>blank import</strong> (<code>import _ "path"</code>) exists for exactly this: you need a package's side effects, usually registration in an <code>init</code> function, without using any of its names. Database drivers register themselves with <code>database/sql</code>, image decoders with <code>image</code>, and <code>net/http/pprof</code> adds its profiling handlers to the default HTTP mux.</p>`,
        },
        {
          type: "lab",
          id: "c06InitOrder",
          caption: "Main imports A, which imports B. Add a direct import of B, a second init() or a blank driver import, then step through everything the runtime does before main().",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Doing real work in <code>init</code>: opening network connections, reading configuration files or calling <code>log.Fatal</code>. It runs on every import (including in tests), cannot return an error and makes start-up order hard to reason about. Keep <code>init</code> for cheap, infallible setup such as registrations, and do the rest explicitly from <code>main</code>.</p>`,
        },
        {
          type: "quiz",
          q: "<code>main</code> imports package A, and A imports package B. In which order do their <code>init</code> functions run?",
          options: ["main, A, B", "B, A, main", "A, B, main", "The order is unspecified"],
          answer: 1,
          explain: "A package is initialized only after everything it imports. B has no dependencies here, so it goes first, then A, then main's variables and init functions, and finally <code>main()</code>.",
        },
      ],
    },
    {
      id: "building-a-package",
      title: "Designing a package: a small database layer",
      kicker: "Putting it together",
      blocks: [
        {
          type: "text",
          html: `<p><code>database/sql</code> is a generic database API; each database supplies a driver that registers itself under a name. You blank-import the driver, then call <code>sql.Open("sqlite3", "app.db")</code>. <code>Open</code> validates its arguments but does not connect: the returned <code>*sql.DB</code> is a pool of connections that are created lazily, so call <code>PingContext</code> if you want to fail fast at start-up. Create one <code>*sql.DB</code> and share it; it is safe for concurrent use.</p>
<p>A good package wraps that in a small, purpose-built API: exported functions such as <code>AddUser</code>, <code>DeleteUser</code> and <code>ListUsers</code>, one exported struct for the data, and everything else unexported. It returns errors instead of printing or exiting, takes a <code>context.Context</code> so callers can cancel slow queries, and hides SQL details from callers.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type User struct {
	ID       int64
	Username string
}

type Store struct{ db *sql.DB }

func (s *Store) AddUser(ctx context.Context, name string) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		"INSERT INTO users(username) VALUES(?)", name) // placeholder, never Sprintf
	if err != nil {
		return 0, fmt.Errorf("add user %q: %w", name, err)
	}
	return res.LastInsertId()
}

func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT id, username FROM users")
	if err != nil {
		return nil, err
	}
	defer rows.Close() // returns the connection to the pool
	var out []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err() // errors that ended the loop early
}`,
          caption: "Placeholder syntax depends on the driver: ? for SQLite and MySQL, $1, $2 for PostgreSQL.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Building SQL with <code>fmt.Sprintf("... WHERE username = '%s'", name)</code>. A name like <code>x' OR '1'='1</code> changes the meaning of the query: SQL injection. Placeholders send the value separately from the statement, so it can never be parsed as SQL.</p>`,
        },
        {
          type: "keypoints",
          title: "Rules for packages people enjoy using",
          items: [
            "Keep the exported surface small; every exported name is a promise you must keep.",
            "Return errors with context; never call <code>log.Fatal</code> or <code>os.Exit</code> from library code.",
            "Accept interfaces (<code>io.Reader</code>, a small store interface) and return concrete types.",
            "Make the zero value useful, or provide a constructor that sets everything up.",
            "Always close what you open: <code>rows.Close()</code>, and check <code>rows.Err()</code> after the loop.",
          ],
        },
      ],
    },
    {
      id: "modules-and-versioning",
      title: "Modules, versions, workspaces and docs",
      kicker: "Shipping code",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>module</strong> is a versioned collection of packages, defined by a <code>go.mod</code> file that records the module path, the Go version and the required dependencies. <code>go.sum</code> stores cryptographic hashes of every dependency so builds are verifiable. Versions follow <strong>semantic versioning</strong>, <code>vMAJOR.MINOR.PATCH</code>: a patch fixes bugs, a minor adds features compatibly, and a major may break compatibility.</p>
<p>Go adds two rules on top. The <strong>import compatibility rule</strong> says that from v2 onward the major version is part of the module path (<code>example.com/lib/v2</code>), so v1 and v2 are different modules that can even coexist in one build. And <strong>minimal version selection</strong> picks, for each dependency, the lowest version that satisfies every requirement in the build, rather than the newest available, which makes builds reproducible without a separate lock file.</p>`,
        },
        {
          type: "table",
          headers: ["Tool", "What it is for"],
          rows: [
            ["<code>go.work</code> (Go 1.18+)", "Build several local modules together while developing: <code>go work init</code>, then <code>go work use ./app ./lib</code>. Usually not committed."],
            ["<code>replace</code> in go.mod", "Point one dependency at a fork or local path. It is part of the module, so it affects everyone who builds the module itself (replace directives in dependencies are ignored)."],
            ["Doc comments", "A comment directly above a declaration, starting with its name. <code>go doc</code> and pkg.go.dev render it; Go 1.19 added headings, lists and links."],
            ["<code>-ldflags \"-X main.version=...\"</code>", "Set a string variable at link time, for example to a Git commit or release tag."],
          ],
        },
        {
          type: "code",
          lang: "go",
          code: `package main

import (
	"fmt"
	"runtime/debug"
)

// version is overwritten at build time:
//   go build -ldflags "-X main.version=$(git describe --tags)"
var version = "dev"

func main() {
	fmt.Println("version:", version)
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, s := range info.Settings {
			if s.Key == "vcs.revision" { // stamped automatically since Go 1.18
				fmt.Println("commit:", s.Value)
			}
		}
	}
}`,
          caption: "-X works only on package-level string variables that are uninitialized or initialized to a constant string, not on constants.",
        },
        {
          type: "realworld",
          items: [
            { org: "Kubernetes", title: "Many modules, one repository", html: "Libraries such as <code>k8s.io/client-go</code> are developed inside the main Kubernetes repository and published as separate modules, which is the kind of multi-module setup that workspaces and replace directives are designed for." },
            { org: "pkg.go.dev", title: "Documentation from comments", html: "The public Go package site renders documentation straight from doc comments, so writing them well is how a package documents itself for every user." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Breaking an exported API in a minor or patch release. Go tooling trusts semantic versions: <code>go get -u</code> will happily move users to your new minor version. Breaking changes need a new major version and a <code>/v2</code> module path.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Interview angle: defer, closures and modules",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>This chapter's material shows up as short "what does this print" puzzles (defer order, closures in loops), as design questions ("how would you structure this package?") and as practical ones ("how do you know which commit is running in production?").</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Key points for the common questions:</p>
<ul>
<li><strong>Visibility:</strong> uppercase is exported, lowercase is package-private; <code>internal/</code> limits importers.</li>
<li><strong>defer:</strong> LIFO; arguments evaluated at the defer statement; can modify named results; do not defer inside long loops.</li>
<li><strong>Go 1.22 loop variables:</strong> one variable per iteration, so closures and goroutines see their own value.</li>
<li><strong>Initialization:</strong> imported packages first; variables in dependency order; then <code>init</code> functions; then <code>main</code>.</li>
<li><strong>Blank import:</strong> for side effects such as driver registration.</li>
<li><strong>SQL:</strong> placeholders, never string formatting; close rows and check <code>rows.Err()</code>.</li>
<li><strong>Modules:</strong> SemVer, <code>/v2</code> paths for breaking changes, minimal version selection, <code>go.work</code> for local multi-module work.</li>
</ul>`,
        },
        {
          type: "quiz",
          q: "A function has named result <code>(n int)</code> and body <code>defer func() { n *= 2 }(); return 5</code>. What does it return?",
          options: ["5", "10", "0", "It does not compile"],
          answer: 1,
          explain: "<code>return 5</code> first assigns 5 to the named result <code>n</code>, then deferred functions run before the function actually returns. The closure doubles <code>n</code>, so the caller receives 10.",
        },
      ],
    },
  ],
  takeaways: [
    "Uppercase names are exported, lowercase names are private to the package, and <code>internal/</code> directories restrict who may import.",
    "Functions are values; closures capture variables (not copies), and since Go 1.22 each loop iteration has its own loop variable.",
    "<code>defer</code> runs calls in LIFO order when the function returns, with arguments evaluated at the defer statement; a deferred closure can change named results.",
    "Never let defers pile up in a long loop; move the loop body into its own function.",
    "Packages initialize after their imports: variables in dependency order, then <code>init</code> functions, then <code>main</code>; keep <code>init</code> cheap and infallible.",
    "Use placeholders for SQL, share one <code>*sql.DB</code>, close rows and check <code>rows.Err()</code>; libraries return errors instead of exiting.",
    "Modules use semantic versioning with <code>/v2</code> paths for breaking changes and minimal version selection; stamp binaries with <code>-ldflags -X</code> or read VCS info from <code>debug.ReadBuildInfo</code>.",
  ],
  furtherReading: [
    { title: "Defer, Panic, and Recover (The Go Blog)", url: "https://go.dev/blog/defer-panic-and-recover", note: "The three rules of defer and how recover works." },
    { title: "Go Modules Reference", url: "https://go.dev/ref/mod", note: "go.mod, go.sum, minimal version selection, workspaces and the major version rule." },
    { title: "Go Doc Comments", url: "https://go.dev/doc/comment", note: "How to write documentation that go doc and pkg.go.dev render well." },
    { title: "Fixing For Loops in Go 1.22 (The Go Blog)", url: "https://go.dev/blog/loopvar-preview", note: "Why the loop variable semantics changed and how the transition works." },
  ],
};
