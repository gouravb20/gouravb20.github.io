// Deep dive: Chapter 1, A quick introduction to Go. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>Your team wants to replace a 400-line Bash deployment script with one binary that you can copy onto any Linux box and run. You pick Go, write a first version in an afternoon, and open a pull request. CI rejects it three times: once for an import you no longer use, once because you put the opening brace of <code>main</code> on its own line, and once because you passed an <code>int</code> to <code>math.Sqrt</code>.</p>
<p>None of those are bugs in the usual sense, and every one of them is deliberate. Go's designers decided that a compiler that refuses sloppy code is cheaper than a team that argues about it in review. This chapter is about that bargain: what Go is for, the handful of rules it enforces, the basic syntax you will write every day, and three small programs (a <code>which(1)</code> clone, a logger and a statistics tool) that show the style in practice.</p>`,
  sections: [
    {
      id: "why-go",
      title: "What Go is for, and what it trades away",
      kicker: "Motivation",
      blocks: [
        {
          type: "problem",
          html: `<p>By the late 2000s, building large server software at Google meant choosing between C++ (fast, but slow to compile and hard to keep safe) and languages like Python or Java (productive, but with heavier runtimes or weaker performance). Build times of many minutes and sprawling dependency graphs were a daily tax on engineers.</p>`,
        },
        {
          type: "idea",
          html: `<p>Go is a small, statically typed, compiled language with garbage collection and built-in concurrency. It aims for <strong>fast builds, readable code and simple deployment</strong>, and it is willing to leave out features (inheritance, exceptions, implicit conversions) to get there.</p>`,
        },
        {
          type: "text",
          html: `<p>Robert Griesemer, Rob Pike and Ken Thompson started Go inside Google in 2007; it was released as open source in November 2009 and reached Go 1.0 in 2012. The syntax will look familiar to C programmers, but the feel is different: there are no header files, packages are the unit of compilation, and the toolchain (formatter, test runner, documentation viewer, dependency manager) ships as a single <code>go</code> command.</p>
<p>The most practical consequence is deployment. <code>go build</code> produces a single native binary that usually has no runtime dependencies besides the operating system. That binary can go into a minimal container image, onto a server with <code>scp</code>, or into a release on GitHub. Cross-compiling is a matter of setting <code>GOOS</code> and <code>GOARCH</code>.</p>
<p>The other headline feature is concurrency. A goroutine is a function that the Go runtime schedules on a small pool of operating system threads, and channels let goroutines pass values to each other. That makes it natural to write servers that handle thousands of connections at once.</p>`,
        },
        {
          type: "compare",
          title: "When Go fits, and when to think twice",
          items: [
            { title: "Good fit", tone: "ok", html: "Network services and APIs, command-line tools, infrastructure and DevOps software, proxies, databases and data pipelines: anything that benefits from easy deployment, good concurrency and predictable performance." },
            { title: "Think twice", tone: "warn", html: "Hard real-time systems where garbage collection pauses are unacceptable, code that needs manual control over every allocation, and areas where Go's library ecosystem is thinner than other languages' (desktop GUIs, scientific computing, some machine learning work)." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Kubernetes and Docker", title: "Container infrastructure", html: "Both are written in Go. Their command-line tools (<code>kubectl</code>, <code>docker</code>) and their server components are ordinary Go binaries." },
            { org: "etcd and CockroachDB", title: "Distributed databases", html: "etcd, the key-value store that holds Kubernetes cluster state, and the CockroachDB SQL database are both Go projects." },
            { org: "Hugo and Terraform", title: "Developer tools", html: "The Hugo static site generator and HashiCorp's Terraform show Go's strength for single-binary tools that people download and run." },
          ],
        },
      ],
    },
    {
      id: "go-tool-and-rules",
      title: "The go tool and the rules the compiler enforces",
      kicker: "Tooling",
      blocks: [
        {
          type: "text",
          html: `<p>Every Go source file starts with a <code>package</code> clause. A program you can run lives in <code>package main</code> and starts executing at <code>func main()</code>. Other packages are imported by path: standard library packages by short name (<code>"fmt"</code>, <code>"os"</code>), third-party ones by a module path such as <code>"github.com/spf13/cobra"</code>.</p>
<p>Visibility is decided by the first letter of a name. <code>fmt.Println</code> is usable from other packages because it starts with an uppercase letter; a function called <code>helper</code> is private to its package. There are no <code>public</code> or <code>private</code> keywords.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "A minimal program",
          code: `package main

import (
	"fmt"
	"os"
)

func main() {
	name := "world"
	if len(os.Args) > 1 {
		name = os.Args[1]
	}
	fmt.Println("hello,", name)
}`,
        },
        {
          type: "table",
          title: "The go commands you will use first",
          headers: ["Command", "What it does"],
          rows: [
            ["<code>go run hello.go</code>", "Compiles into a temporary directory, runs the result, then throws the binary away. Good for quick experiments."],
            ["<code>go build hello.go</code>", "Compiles and leaves an executable named after the file (or the module) in the current directory. Use <code>-o name</code> to rename it."],
            ["<code>go doc fmt.Printf</code>", "Prints the documentation of a package or symbol in the terminal, like a man page."],
            ["<code>gofmt -w .</code> / <code>go fmt ./...</code>", "Rewrites source files in the one standard layout. Most editors run it on save."],
            ["<code>go vet ./...</code>", "Reports suspicious code that compiles but is probably wrong, such as a <code>Printf</code> verb that does not match its argument."],
          ],
        },
        {
          type: "text",
          html: `<h3>Rules that are compile errors, not style advice</h3>
<p>An unused local variable is an error (<code>declared and not used</code>), and so is an unused import. The reasoning is that dead code is usually a mistake or a leftover, and an unused import slows down every build that includes it. When you need an import only for its side effects, you write a blank import: <code>import _ "some/driver"</code>.</p>
<p>The brace rule surprises people more. Go's grammar uses semicolons, but you almost never type them: the lexer inserts one automatically at the end of a line whose last token is an identifier, a literal, a closing bracket or one of a few keywords such as <code>return</code>. A line ending in <code>func main()</code> therefore gets a semicolon after the <code>)</code>, and a <code>{</code> on the next line no longer belongs to the function. That is why there is exactly one brace style, and why <code>gofmt</code> never has to argue about it.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>These rules exist to make large codebases uniform. Any Go file you open, written by anyone, is formatted the same way and has no dead imports. That uniformity is a big part of why reading other people's Go code is usually easy.</p>`,
        },
        {
          type: "quiz",
          q: "Why does <code>func main()</code> followed by <code>{</code> on the next line fail to compile?",
          options: [
            "gofmt rejects the file before the compiler runs",
            "The lexer inserts a semicolon after the closing parenthesis, so the brace starts a new statement",
            "Go requires all function bodies to fit on one line",
            "Braces are optional in Go, so a brace on its own line is ambiguous",
          ],
          answer: 1,
          explain: "Automatic semicolon insertion adds a semicolon after a line ending in <code>)</code>. The declaration ends there, and the lone <code>{</code> on the next line is a syntax error. gofmt is a separate tool and does not gate compilation.",
        },
      ],
    },
    {
      id: "variables-and-control-flow",
      title: "Variables, types and control flow",
      kicker: "Everyday syntax",
      blocks: [
        {
          type: "text",
          html: `<p>There are three common ways to declare a variable. <code>var count int</code> declares it with its <strong>zero value</strong>; <code>var count = 10</code> infers the type; and <code>count := 10</code>, the short form, works only inside functions. Zero values are always defined: <code>0</code> for numbers, <code>""</code> for strings, <code>false</code> for booleans and <code>nil</code> for pointers, slices, maps, channels, functions and interfaces. There is no such thing as an uninitialized variable in Go.</p>
<p>Go also never converts between types for you. Adding an <code>int</code> to a <code>float64</code>, or passing an <code>int</code> variable to <code>math.Sqrt</code>, is a compile error; you write <code>float64(n)</code>. Untyped constants are the exception that makes this bearable: <code>math.Sqrt(16)</code> compiles because the literal 16 takes whatever numeric type its context needs.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Declarations, conversions and the three for forms",
          code: `var total float64 // zero value 0
n := 3            // int, inferred
total = float64(n) * 1.5

for i := 0; i < n; i++ { // classic three-part loop
	fmt.Println(i)
}
for total > 1 { // a while loop is just for with a condition
	total /= 2
}
for i, word := range []string{"a", "b"} { // range over a slice
	fmt.Println(i, word)
}
for i := range 3 { // Go 1.22+: range over an integer, i = 0, 1, 2
	fmt.Println(i)
}`,
        },
        {
          type: "text",
          html: `<p><code>for</code> is the only loop keyword. With no condition at all (<code>for { }</code>) it loops until a <code>break</code> or <code>return</code>. <code>range</code> works on arrays, slices, strings, maps and channels, and since Go 1.22 on integers. Also since Go 1.22, each iteration of a <code>for</code> loop gets a fresh copy of the loop variable, which fixed a long-standing bug with closures and goroutines that capture it; Chapter 8 returns to that.</p>
<h3>switch without the fall-through trap</h3>
<p>A Go <code>switch</code> case ends at the next case; there is no implicit fall-through and no need for <code>break</code>. One case can list several values (<code>case "sat", "sun":</code>). A switch with no expression is a cleaner <code>if</code>-<code>else</code> chain: each case is a boolean condition, and the first true one wins. If you really want to continue into the next case's body, the <code>fallthrough</code> keyword does it, without testing that case's condition.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func classify(x int) string {
	switch {
	case x < 0:
		return "negative"
	case x == 0:
		return "zero"
	case x%2 == 0:
		return "even"
	default:
		return "odd"
	}
}`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p><strong>Shadowing with <code>:=</code>.</strong> Inside an <code>if</code> or <code>for</code> block, <code>x, err := f()</code> declares a <em>new</em> <code>err</code> that hides the outer one. Code after the block then checks the outer <code>err</code>, which is still <code>nil</code>. Use plain <code>=</code> when you mean to assign to an existing variable, and let <code>go vet</code> (or a linter with its shadow check) catch the rest.</p>`,
        },
        {
          type: "quiz",
          q: "What does this print? <code>switch 2 { case 1: fmt.Print(\"a\"); case 2: fmt.Print(\"b\"); fallthrough; case 3: fmt.Print(\"c\"); case 4: fmt.Print(\"d\") }</code>",
          options: ["b", "bc", "bcd", "abcd"],
          answer: 1,
          explain: "Case 2 matches and prints b. <code>fallthrough</code> runs the body of case 3 without checking it, printing c. Case 3 has no <code>fallthrough</code>, so the switch ends there.",
        },
      ],
    },
    {
      id: "reading-input",
      title: "Reading input and checking errors",
      kicker: "Input and errors",
      blocks: [
        {
          type: "text",
          html: `<p>Command-line arguments arrive in <code>os.Args</code>, a <code>[]string</code>. Element 0 is the path of the program itself (a temporary path under <code>go run</code>), so the real arguments are <code>os.Args[1:]</code>. For anything beyond a couple of positional arguments, the standard <code>flag</code> package parses options for you.</p>
<p>Standard input is an <code>*os.File</code> called <code>os.Stdin</code>. The usual way to read it line by line is a <code>bufio.Scanner</code>, which handles buffering and strips the newline. <code>fmt.Scanln</code> also works for a quick prompt, but a scanner is easier to reason about for real input.</p>`,
        },
        {
          type: "text",
          html: `<h3>Errors are values</h3>
<p>Functions that can fail return an <code>error</code> as their last result, and a <code>nil</code> error means success. You check it immediately with <code>if err != nil</code> and either handle it, add context and return it, or (in <code>main</code> only) report it and exit. There are no exceptions to forget to catch; the failure path is visible on the page.</p>
<p>Parsing is where you meet this first. <code>strconv.Atoi("12")</code> and <code>strconv.ParseFloat("3.5", 64)</code> return a value and an error, so a statistics tool can simply skip arguments that are not numbers instead of crashing.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "A first statistics tool",
          code: `func main() {
	var values []float64
	for _, arg := range os.Args[1:] {
		v, err := strconv.ParseFloat(arg, 64)
		if err != nil {
			fmt.Fprintln(os.Stderr, "skipping", arg)
			continue
		}
		values = append(values, v)
	}
	if len(values) == 0 {
		fmt.Fprintln(os.Stderr, "no valid numbers")
		os.Exit(1)
	}
	sum, lo, hi := 0.0, values[0], values[0]
	for _, v := range values {
		sum += v
		lo, hi = min(lo, v), max(hi, v) // built-ins since Go 1.21
	}
	mean := sum / float64(len(values))
	var sq float64
	for _, v := range values {
		sq += (v - mean) * (v - mean)
	}
	fmt.Printf("n=%d min=%g max=%g mean=%.3f sd=%.3f\\n",
		len(values), lo, hi, mean, math.Sqrt(sq/float64(len(values))))
}`,
          caption: "The standard deviation is the population version (divide by n). It takes two passes: one for the mean, one for the squared distances from it.",
        },
        {
          type: "lab",
          id: "c01Stats",
          caption: "Type arguments, including a few that are not numbers, and watch which ones are skipped. Compare version 1 with the version 2 behaviour from Chapter 2, which falls back to random data and normalizes it.",
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Write diagnostics to <code>os.Stderr</code> and results to <code>os.Stdout</code>. Then <code>stats 1 2 x 3 > out.txt</code> still shows the warning on the terminal while the file contains only the result, which is exactly what UNIX pipelines expect.</p>`,
        },
      ],
    },
    {
      id: "which-walkthrough",
      title: "A real tool: which(1) in a few dozen lines",
      kicker: "Putting it together",
      blocks: [
        {
          type: "text",
          html: `<p>The UNIX <code>which</code> command answers "if I type this name, which file will the shell run?" It looks through each directory in <code>$PATH</code>, in order, for an executable regular file with that name. Writing it in Go uses most of what this chapter covers: arguments, environment variables, loops, error checks and the standard library's portable path helpers.</p>`,
        },
        {
          type: "diagram",
          title: "How which decides that a file is a match",
          caption: "Each directory from PATH is tried in order. Any failed check skips to the next directory; the first candidate that passes all three checks is the answer.",
          svg: `<svg viewBox="0 0 600 430" role="img" aria-label="Flowchart of the which algorithm: split PATH, join each directory with the name, then check stat, regular file and execute bits">
<defs><marker id="go1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="30" y="20" width="280" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="170" y="47" text-anchor="middle" font-size="13">for each dir in SplitList($PATH)</text>
<rect x="30" y="90" width="280" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="170" y="117" text-anchor="middle" font-size="13">path = filepath.Join(dir, name)</text>
<rect x="30" y="160" width="280" height="44" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="170" y="187" text-anchor="middle" font-size="13">os.Stat(path) returns no error?</text>
<rect x="30" y="230" width="280" height="44" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="170" y="257" text-anchor="middle" font-size="13">info.Mode().IsRegular()?</text>
<rect x="30" y="300" width="280" height="44" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="170" y="327" text-anchor="middle" font-size="13">mode &amp; 0111 != 0 (executable)?</text>
<rect x="30" y="370" width="280" height="44" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="170" y="397" text-anchor="middle" font-size="13" font-weight="700">match: print path</text>
<line x1="170" y1="64" x2="170" y2="88" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go1-arrow)"/>
<line x1="170" y1="134" x2="170" y2="158" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go1-arrow)"/>
<line x1="170" y1="204" x2="170" y2="228" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go1-arrow)"/>
<line x1="170" y1="274" x2="170" y2="298" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go1-arrow)"/>
<line x1="170" y1="344" x2="170" y2="368" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go1-arrow)"/>
<text x="180" y="221" font-size="12" style="fill: var(--dg-muted)">yes</text>
<text x="180" y="291" font-size="12" style="fill: var(--dg-muted)">yes</text>
<text x="180" y="361" font-size="12" style="fill: var(--dg-muted)">yes</text>
<rect x="390" y="160" width="190" height="184" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="485" y="244" text-anchor="middle" font-size="13">skip this one,</text>
<text x="485" y="264" text-anchor="middle" font-size="13">try the next dir</text>
<line x1="310" y1="182" x2="388" y2="182" style="stroke: var(--dg-bad)" stroke-width="2" marker-end="url(#go1-arrow)"/>
<line x1="310" y1="252" x2="388" y2="252" style="stroke: var(--dg-bad)" stroke-width="2" marker-end="url(#go1-arrow)"/>
<line x1="310" y1="322" x2="388" y2="322" style="stroke: var(--dg-bad)" stroke-width="2" marker-end="url(#go1-arrow)"/>
<text x="340" y="176" font-size="12" style="fill: var(--dg-muted)">no</text>
<text x="340" y="246" font-size="12" style="fill: var(--dg-muted)">no</text>
<text x="340" y="316" font-size="12" style="fill: var(--dg-muted)">no</text>
<polyline points="485,160 485,42 312,42" fill="none" style="stroke: var(--dg-muted)" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#go1-arrow)"/>
</svg>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func which(name string) (string, bool) {
	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		if dir == "" {
			dir = "." // an empty PATH entry means the current directory
		}
		path := filepath.Join(dir, name)
		info, err := os.Stat(path)
		if err != nil {
			continue // missing file or unreadable directory
		}
		mode := info.Mode()
		if mode.IsRegular() && mode&0111 != 0 {
			return path, true
		}
	}
	return "", false
}`,
          caption: "Returning a boolean (or an error) instead of printing keeps the function reusable; main decides what to print and which exit code to use.",
        },
        {
          type: "text",
          html: `<p><code>filepath.SplitList</code> splits on the platform's list separator (<code>:</code> on UNIX, <code>;</code> on Windows), and <code>filepath.Join</code> uses the right path separator and cleans up doubled slashes. The <code>IsRegular</code> check matters because a directory can share the command's name, and directories usually have execute bits set. The <code>mode&amp;0111</code> test checks whether any of the owner, group or other execute bits are set; it does not check whether <em>you</em> may execute the file, which a stricter version could verify with <code>golang.org/x/sys/unix.Access</code>.</p>
<p>A polished version would also exit with status 1 when nothing matches (so shell scripts can test it) and offer a flag to print every match instead of stopping at the first. On Windows the rules differ again: executability comes from extensions listed in <code>PATHEXT</code>, which is why the standard library's <code>exec.LookPath</code> exists and is what real programs should call.</p>`,
        },
        {
          type: "lab",
          id: "c01Which",
          caption: "Search a small fake filesystem with a messy PATH. Note which candidates are rejected for being a directory, for lacking execute bits or for not existing.",
        },
      ],
    },
    {
      id: "logging",
      title: "Logging: destinations, flags, Fatal and Panic",
      kicker: "Observability basics",
      blocks: [
        {
          type: "text",
          html: `<p>The <code>log</code> package is Go's original logger. <code>log.Println</code> and friends write to standard error with a date and time prefix. Three knobs change its behaviour: <code>log.SetOutput(w)</code> picks the destination (any <code>io.Writer</code>), <code>log.SetPrefix</code> adds a tag, and <code>log.SetFlags</code> chooses what goes in front of each line, for example <code>log.Lshortfile</code> for the file name and line number of the call.</p>
<p>Because the destination is just an <code>io.Writer</code>, combining destinations is one line: <code>io.MultiWriter(os.Stderr, file)</code> writes every entry to both. You can also create independent loggers with <code>log.New(w, prefix, flags)</code>, for instance one for audit events and one for debugging. On UNIX systems, <code>log/syslog</code> gives you a writer that sends entries to the system logger; that package is not available on Windows.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `f, err := os.OpenFile(filepath.Join(os.TempDir(), "app.log"),
	os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
if err != nil {
	log.Fatal(err)
}
defer f.Close()

logger := log.New(io.MultiWriter(os.Stderr, f), "app: ", log.LstdFlags|log.Lshortfile)
logger.Println("started")`,
        },
        {
          type: "text",
          html: `<h3>Fatal is not a gentler Panic</h3>
<p><code>log.Fatal</code> logs the message and then calls <code>os.Exit(1)</code>. The process ends immediately: deferred functions do <em>not</em> run, so buffered output may be lost and files may not be flushed. <code>log.Panic</code> logs and then calls <code>panic</code>. The stack unwinds, deferred functions run, a <code>recover</code> higher up could stop it, and if nothing does, the program prints a stack trace and exits with status 2.</p>`,
        },
        {
          type: "table",
          headers: ["", "log.Fatal", "log.Panic", "return err"],
          rows: [
            ["Deferred calls run", "No", "Yes", "Yes"],
            ["Caller can handle it", "No", "Only with recover", "Yes"],
            ["Exit status if unhandled", "1", "2, with stack trace", "Whatever main decides"],
            ["Good for", "Startup failures in main", "Truly impossible states", "Everything in library code"],
          ],
        },
        {
          type: "lab",
          id: "c01Logging",
          caption: "Choose a destination, prefix and flags, then switch to log.Fatal and log.Panic and compare the exit status and whether the deferred call runs.",
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Go 1.21 added <code>log/slog</code>, a structured logger with levels and key-value attributes and both text and JSON output. In a container, the convention is to write logs to standard output or standard error and let the platform collect them, rather than managing log files or syslog yourself. Chapter 7 covers <code>slog</code>.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Calling <code>log.Fatal</code> inside a library function. It takes the decision away from the caller and skips their cleanup. Libraries should return errors; only <code>main</code> (or the top of a goroutine that owns the process) should decide to exit.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Interview angle: the fundamentals people trip on",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Introductory Go questions are rarely about syntax trivia. Interviewers use them to check that you understand <em>why</em> the language behaves as it does: why the compiler is strict, why conversions are explicit, and what happens to goroutines when a program ends.</p>
<h3>Goroutines and the end of main</h3>
<p><code>go f()</code> starts <code>f</code> concurrently and returns at once. When <code>main</code> returns, the program exits, and every other goroutine is stopped mid-flight with no chance to finish or clean up. A <code>time.Sleep</code> at the end of <code>main</code> appears to fix this, but it only guesses how long the work takes. The right tool is <code>sync.WaitGroup</code> (or a channel).</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var wg sync.WaitGroup
for _, url := range urls {
	wg.Add(1) // before the go statement, never inside the goroutine
	go func() {
		defer wg.Done()
		fetch(url) // url is per-iteration since Go 1.22
	}()
}
wg.Wait() // blocks until every Done has been called`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Common questions and the points a good answer hits:</p>
<ul>
<li><strong>go run vs go build:</strong> run compiles to a temporary location and executes; build leaves a binary you can ship.</li>
<li><strong>var vs :=:</strong> <code>:=</code> declares and infers, inside functions only; watch for shadowing in nested blocks.</li>
<li><strong>Why <code>math.Abs(x)</code> fails for an int:</strong> no implicit conversions; write <code>math.Abs(float64(x))</code>. A literal works because untyped constants adapt.</li>
<li><strong>switch:</strong> no implicit fall-through; <code>fallthrough</code> runs the next body unconditionally.</li>
<li><strong>Fatal vs Panic vs returning an error:</strong> exit without defers, unwind with defers, or let the caller decide.</li>
</ul>`,
        },
        {
          type: "quiz",
          q: "A program starts 10 goroutines that each print a line, and <code>main</code> returns right after starting them. What is the most likely output?",
          options: [
            "All 10 lines, in order",
            "All 10 lines, in random order",
            "Anywhere from none to a few lines, because the process exits when main returns",
            "A deadlock error",
          ],
          answer: 2,
          explain: "Returning from <code>main</code> ends the program without waiting for other goroutines. Depending on scheduling, some may run before the exit and most may not. Use a <code>sync.WaitGroup</code> to wait for them.",
        },
      ],
    },
  ],
  takeaways: [
    "Go trades features for simplicity: fast builds, one formatting style, single static binaries and built-in concurrency.",
    "Unused variables and imports, and a brace on its own line, are compile errors by design; automatic semicolon insertion explains the brace rule.",
    "Every variable has a well-defined zero value, and Go never converts between types implicitly, except that untyped constants adapt to their context.",
    "<code>for</code> is the only loop, <code>switch</code> cases do not fall through, and since Go 1.22 loop variables are per iteration and you can range over an integer.",
    "Errors are ordinary return values checked with <code>if err != nil</code>; write diagnostics to stderr and results to stdout.",
    "<code>log.Fatal</code> exits without running defers, <code>log.Panic</code> unwinds and runs them, and library code should return errors instead of doing either.",
    "When <code>main</code> returns, all goroutines die; wait for them with a <code>sync.WaitGroup</code>, never with <code>time.Sleep</code>.",
  ],
  furtherReading: [
    { title: "A Tour of Go", url: "https://go.dev/tour/", note: "Interactive introduction to the syntax covered in this chapter." },
    { title: "Effective Go", url: "https://go.dev/doc/effective_go", note: "The classic guide to idiomatic Go, including semicolons, control structures and naming." },
    { title: "The Go Programming Language Specification", url: "https://go.dev/ref/spec", note: "The authoritative rules for semicolon insertion, switch and for statements." },
  ],
};
