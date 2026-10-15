// Deep dive: Chapter 3, Composite data types. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>A configuration tool writes its settings to a file by ranging over a <code>map[string]string</code>. The golden-file test passes on your laptop, then fails in CI, then passes again on a retry. Nobody changed the code. The test was comparing output whose line order depended on map iteration, and Go deliberately randomizes that order on every loop so that code like this breaks early instead of silently depending on an accident.</p>
<p>A month later the same service crashes in production with <code>fatal error: concurrent map writes</code>, which no <code>recover</code> can catch. Maps are the workhorse composite type in Go, together with structs, and both have a few rules that look like trivia until they take something down. This chapter covers maps and structs properly, then two everyday tools built on them: regular expressions and CSV files.</p>`,
  sections: [
    {
      id: "choosing-containers",
      title: "Slices, maps or structs?",
      kicker: "Choosing a type",
      blocks: [
        {
          type: "text",
          html: `<p>The three composite types answer different questions. A <strong>slice</strong> holds many values of one type in order, in contiguous memory, which makes iteration fast and indexing by position cheap. A <strong>map</strong> finds a value by key in (amortized) constant time, at the cost of extra memory and no meaningful order. A <strong>struct</strong> groups a fixed set of named fields, possibly of different types, into one value: a record.</p>
<p>Real programs combine them: a <code>[]Order</code> for a list, a <code>map[string]*Customer</code> to find customers by ID, and the <code>Order</code> and <code>Customer</code> structs themselves. The skill is picking the access pattern first. If you mostly iterate in order, use a slice even if you sometimes search it; if you mostly look things up by key, use a map; if the "keys" are fixed field names known at compile time, use a struct, not a <code>map[string]any</code>.</p>`,
        },
        {
          type: "table",
          headers: ["Need", "Reach for", "Why"],
          rows: [
            ["Ordered list, iterate often", "<code>[]T</code>", "Contiguous memory, cache-friendly, cheap append"],
            ["Look up by an arbitrary key", "<code>map[K]V</code>", "Constant-time average lookup, insert and delete"],
            ["Fixed set of named fields", "<code>struct</code>", "Type-checked field names and types, no lookup cost"],
            ["Set of unique values", "<code>map[K]struct{}</code>", "Empty struct values take no space"],
          ],
        },
      ],
    },
    {
      id: "maps",
      title: "Maps: lookups, nil maps and random order",
      kicker: "Maps",
      blocks: [
        {
          type: "idea",
          html: `<p>A <code>map[K]V</code> is a hash table managed by the runtime. Reading a missing key is not an error: it returns the zero value of <code>V</code>. The <strong>comma ok</strong> form, <code>v, ok := m[k]</code>, tells you whether the key was really there.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `ages := map[string]int{"ana": 31, "bo": 0}
fmt.Println(ages["zed"]) // 0: missing key, zero value

if v, ok := ages["bo"]; ok {
	fmt.Println("bo is present with", v) // present, value 0
}
delete(ages, "ana") // no-op if the key is missing

counts := map[string]int{}
for _, w := range strings.Fields("a b a") {
	counts[w]++ // works because a missing key reads as 0
}

var m map[string]int       // nil map
fmt.Println(m["x"], len(m)) // 0 0: reading a nil map is fine
m["x"] = 1                  // panic: assignment to entry in nil map`,
        },
        {
          type: "text",
          html: `<p>The zero value of a map type is <code>nil</code>. A nil map behaves like an empty, read-only map: lookups return zero values, <code>len</code> is 0, <code>range</code> does nothing and <code>delete</code> is a no-op. Writing to it panics. The usual cause is a struct with a map field that nobody initialized, so give such types a constructor that calls <code>make</code>.</p>
<p>Keys must be <strong>comparable</strong> with <code>==</code>: numbers, strings, booleans, pointers, channels, and arrays or structs made of comparable types. Slices, maps and functions cannot be keys. Interface-typed keys compile, but if a value's dynamic type is not comparable (say, a <code>[]int</code> stored in an <code>any</code>), the insert panics at run time.</p>
<h3>Iteration order is random on purpose</h3>
<p>Each <code>range</code> over a map starts at a randomly chosen position, so the order changes between loops and between runs. The Go team did this so that programs cannot come to depend on an order the implementation never promised. When you need a stable order, collect the keys and sort them. (The <code>fmt</code> package prints maps with sorted keys, which is why <code>fmt.Println(m)</code> looks stable while <code>range</code> does not.)</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Deterministic iteration",
          code: `keys := make([]string, 0, len(ages))
for k := range ages {
	keys = append(keys, k)
}
slices.Sort(keys)
for _, k := range keys {
	fmt.Println(k, ages[k])
}

// Go 1.23+: maps.Keys returns an iterator and slices.Sorted collects it.
for _, k := range slices.Sorted(maps.Keys(ages)) {
	fmt.Println(k, ages[k])
}`,
        },
        {
          type: "lab",
          id: "c03Maps",
          caption: "Look up missing keys, compare plain and comma-ok reads, write to a nil map, and run the same range loop several times to see the order change.",
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>The lab shows the classic map layout (buckets of 8 slots that grow at an average load of 6.5). Go 1.24 replaced the implementation with one based on Swiss tables. The language-level behaviour, including random iteration order and the lack of concurrency safety, did not change.</p>`,
        },
        {
          type: "text",
          html: `<h3>Maps and goroutines</h3>
<p>Maps are not safe for concurrent use. Two goroutines writing, or one writing while another reads, is a data race, and the runtime detects many such cases and aborts the whole process with <code>fatal error: concurrent map writes</code>. This is a fatal error, not a panic, so <code>recover</code> cannot stop it. Protect a shared map with a <code>sync.Mutex</code> or <code>sync.RWMutex</code>, or use <code>sync.Map</code>, which is tuned for two cases: keys written once and read many times, and goroutines working on disjoint sets of keys.</p>`,
        },
        {
          type: "quiz",
          q: "What happens when you run <code>var m map[string]int; m[\"a\"]++</code>?",
          options: [
            "m[\"a\"] becomes 1",
            "Compile error: m is not initialized",
            "Run-time panic: assignment to entry in nil map",
            "Nothing; writes to a nil map are ignored",
          ],
          answer: 2,
          explain: "Reading from a nil map is allowed, but <code>m[\"a\"]++</code> also writes, and any write to a nil map panics. Initialize it with <code>make(map[string]int)</code> or a literal first.",
        },
      ],
    },
    {
      id: "structs-and-types",
      title: "Defined types, structs and constructors",
      kicker: "Structs",
      blocks: [
        {
          type: "text",
          html: `<p>The <code>type</code> keyword creates a new <strong>defined type</strong>: <code>type Celsius float64</code> has the same underlying type as <code>float64</code> but is a distinct type, so you cannot add a <code>Celsius</code> to a <code>float64</code> without a conversion, and you can attach methods to it. An <strong>alias</strong>, <code>type Temp = float64</code>, is just another name for the same type; aliases exist mainly to move types between packages without breaking callers.</p>
<p>A struct type groups named fields. Fields you do not set get their zero values, which is why Go programmers try to make the zero value useful (a zero <code>bytes.Buffer</code> or <code>sync.Mutex</code> is ready to use). Prefer keyed literals, <code>User{Name: "ana", Age: 31}</code>, over positional ones: they survive new fields being added and say what each value means.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type User struct {
	Name  string
	Email string
	Age   int
	tags  map[string]bool // unexported: invisible outside the package
}

// NewUser validates input and initializes the map, so callers can't forget.
func NewUser(name, email string) (*User, error) {
	if name == "" {
		return nil, errors.New("name is required")
	}
	return &User{Name: name, Email: email, tags: map[string]bool{}}, nil
}

func examples() {
	u1 := User{Name: "ana"}  // value, other fields zeroed
	u2 := &User{Name: "bo"}  // pointer to a new struct
	u3 := new(User)          // pointer to a zeroed User, same as &User{}
	s := make([]User, 0, 10) // make is only for slices, maps and channels
	fmt.Println(u1, u2, u3, s)
}`,
        },
        {
          type: "text",
          html: `<p><code>new(T)</code> and <code>&amp;T{}</code> both allocate a zeroed value and return a pointer; the literal form is more common because it can set fields. <code>make</code> is different: it initializes the internal structure of slices, maps and channels and returns the value itself, not a pointer.</p>
<p>Should a constructor return a value or a pointer? Return a pointer when the struct is large, when it has methods with pointer receivers, or when it contains something that must not be copied (a mutex, for instance). Return a value for small, immutable records where copying is cheap and avoids sharing.</p>
<h3>Slices of structs and the range copy</h3>
<p>In <code>for _, u := range users</code>, <code>u</code> is a <em>copy</em> of each element. Assigning <code>u.Age = 40</code> changes the copy and is lost. Index into the slice instead (<code>users[i].Age = 40</code>) or store pointers. The same rule explains why <code>m["ana"].Age = 40</code> does not compile when the map holds struct values: a map element is not addressable, so you read it, change it and store it back.</p>`,
        },
        {
          type: "diagram",
          title: "Values inline versus pointers",
          caption: "In a []User the structs live inside the slice's array, and range hands you a copy. In a []*User the array holds pointers, so a copy of a pointer still reaches the shared struct.",
          svg: `<svg viewBox="0 0 600 240" role="img" aria-label="A slice of struct values compared with a slice of pointers to structs">
<defs><marker id="go3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="28" font-size="13" font-weight="700">[]User: structs stored inline</text>
<rect x="20" y="44" width="86" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="106" y="44" width="86" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="192" y="44" width="86" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="63" y="69" text-anchor="middle" font-size="12">{ana 31}</text>
<text x="149" y="69" text-anchor="middle" font-size="12">{bo 25}</text>
<text x="235" y="69" text-anchor="middle" font-size="12">{cy 40}</text>
<rect x="106" y="130" width="86" height="40" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="4 3"/>
<text x="149" y="155" text-anchor="middle" font-size="12">u: a copy</text>
<line x1="149" y1="84" x2="149" y2="127" style="stroke: var(--dg-muted)" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#go3-arrow)"/>
<text x="20" y="200" font-size="12" style="fill: var(--dg-muted)">u.Age = 40 changes only the copy;</text>
<text x="20" y="218" font-size="12" style="fill: var(--dg-muted)">users[i].Age = 40 changes the slice</text>
<text x="330" y="28" font-size="13" font-weight="700">[]*User: slice of pointers</text>
<rect x="330" y="44" width="80" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="410" y="44" width="80" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="490" y="44" width="80" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="370" y="69" text-anchor="middle" font-size="12">ptr</text>
<text x="450" y="69" text-anchor="middle" font-size="12">ptr</text>
<text x="530" y="69" text-anchor="middle" font-size="12">ptr</text>
<rect x="330" y="130" width="80" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="410" y="130" width="80" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<rect x="490" y="130" width="80" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="370" y="155" text-anchor="middle" font-size="12">{ana 31}</text>
<text x="450" y="155" text-anchor="middle" font-size="12">{bo 25}</text>
<text x="530" y="155" text-anchor="middle" font-size="12">{cy 40}</text>
<line x1="370" y1="84" x2="370" y2="127" style="stroke: var(--dg-2)" stroke-width="2" marker-end="url(#go3-arrow)"/>
<line x1="450" y1="84" x2="450" y2="127" style="stroke: var(--dg-2)" stroke-width="2" marker-end="url(#go3-arrow)"/>
<line x1="530" y1="84" x2="530" y2="127" style="stroke: var(--dg-2)" stroke-width="2" marker-end="url(#go3-arrow)"/>
<text x="330" y="200" font-size="12" style="fill: var(--dg-muted)">p.Age = 40 through a copied pointer</text>
<text x="330" y="218" font-size="12" style="fill: var(--dg-muted)">still changes the shared struct</text>
</svg>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Field order affects memory. On a 64-bit system, <code>struct{ a bool; b int64; c bool }</code> takes 24 bytes because of alignment padding, while <code>struct{ b int64; a, c bool }</code> takes 16. It rarely matters, but for a struct stored millions of times, grouping fields from largest to smallest is free memory.</p>`,
        },
      ],
    },
    {
      id: "regular-expressions",
      title: "Regular expressions with RE2 guarantees",
      kicker: "Pattern matching",
      blocks: [
        {
          type: "problem",
          html: `<p>Many regex engines (PCRE, Java's, JavaScript's) use backtracking. A pattern like <code>(a+)+$</code> against a long string of <code>a</code>s followed by one <code>b</code> can take exponential time, and an attacker who controls the input can stall a server with a single request. This class of bug is called ReDoS.</p>`,
        },
        {
          type: "idea",
          html: `<p>Go's <code>regexp</code> package implements the <strong>RE2</strong> syntax and compiles patterns to finite automata, which guarantees matching time linear in the size of the input. The price is that features which require backtracking, <strong>backreferences and lookaround</strong>, are not supported.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var (
	nameRE = regexp.MustCompile(\`^[A-Z][a-z]*$\`)
	dateRE = regexp.MustCompile(\`(\\d{4})-(\\d{2})-(\\d{2})\`)
)

func demo(userPattern string) error {
	fmt.Println(nameRE.MatchString("Mihalis"), nameRE.MatchString("ZA")) // true false

	m := dateRE.FindStringSubmatch("released 2024-08-13")
	fmt.Println(m[1], m[2], m[3]) // 2024 08 13

	fmt.Println(dateRE.FindAllString("2024-01-02, 2025-03-04", -1))

	re, err := regexp.Compile(userPattern) // input from users: handle the error
	if err != nil {
		return fmt.Errorf("bad pattern: %w", err)
	}
	fmt.Println(re.MatchString("test"))
	return nil
}`,
          caption: "Raw string literals (backquotes) mean a backslash is just a backslash, so \\d needs no extra escaping.",
        },
        {
          type: "text",
          html: `<p><code>regexp.Compile</code> returns an error for an invalid pattern; <code>regexp.MustCompile</code> panics instead. The convention follows from that: use <code>MustCompile</code> for constant patterns in package-level variables, where a typo should fail at startup (and in every test), and <code>Compile</code> for patterns that come from users or configuration. Compiling is relatively expensive, so do it once rather than inside a loop. A compiled <code>*regexp.Regexp</code> is safe for concurrent use by multiple goroutines.</p>
<p>Anchors matter. Without <code>^</code> and <code>$</code>, <code>MatchString</code> succeeds if the pattern matches <em>anywhere</em> in the input, so <code>[0-9]+</code> accepts <code>"abc123"</code>. And not every validation needs a regex: to check for an integer, <code>strconv.Atoi</code> is clearer, faster and also tells you whether the value fits in an <code>int</code>.</p>`,
        },
        {
          type: "lab",
          id: "c03Regexp",
          caption: "Run the chapter's name and integer patterns against many inputs at once, switch between Compile and MustCompile with a broken pattern, and compare the integer regex with strconv.Atoi.",
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>When you need a backreference (say, matching a repeated word), match a simpler pattern and finish the check in Go code. You keep the linear-time guarantee for the regex part and the extra logic is usually easier to read anyway.</p>`,
        },
        {
          type: "quiz",
          q: "Why does Go's <code>regexp</code> reject a pattern with a backreference such as <code>(\\w+) \\1</code>?",
          options: [
            "Backreferences are planned for a future release",
            "Supporting them would require backtracking, which breaks the linear-time guarantee",
            "Go only supports POSIX basic regular expressions",
            "Backreferences only work with MustCompile",
          ],
          answer: 1,
          explain: "RE2 promises time linear in the input. Backreferences make matching a much harder problem that needs backtracking in general, so RE2-style engines leave them out by design.",
        },
      ],
    },
    {
      id: "csv-files",
      title: "Reading and writing CSV with encoding/csv",
      kicker: "Files and records",
      blocks: [
        {
          type: "text",
          html: `<p>CSV looks too simple to need a library until a field contains a comma, a quote or a newline. <code>encoding/csv</code> implements the quoting rules of RFC 4180, so <code>"Smith, Jr."</code> stays one field. A <code>csv.Reader</code> wraps any <code>io.Reader</code>; <code>Read</code> returns one record (a <code>[]string</code>) at a time and <code>ReadAll</code> returns every record as a <code>[][]string</code>.</p>
<p>The reader has a few settings worth knowing. <code>Comma</code> changes the delimiter (for example <code>'\\t'</code>). <code>FieldsPerRecord</code> controls validation: 0 (the default) means every record must have as many fields as the first, a positive number fixes the count, and a negative number allows ragged lines. <code>LazyQuotes</code> tolerates stray quotes in sloppy files. Parse errors are <code>*csv.ParseError</code> values that include the line number.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "From CSV rows to structs",
          code: `type Record struct {
	Name, Surname string
	Year          int
}

func readRecords(r io.Reader) ([]Record, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = 3
	var out []Record
	for {
		row, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err // a *csv.ParseError says which line failed
		}
		year, err := strconv.Atoi(row[2])
		if err != nil {
			return nil, fmt.Errorf("bad year %q: %w", row[2], err)
		}
		out = append(out, Record{Name: row[0], Surname: row[1], Year: year})
	}
	return out, nil
}`,
          caption: "Taking an io.Reader instead of a file name makes the function easy to test with strings.NewReader.",
        },
        {
          type: "code",
          lang: "go",
          title: "Writing, and the Flush you must not forget",
          code: `w := csv.NewWriter(os.Stdout)
w.Comma = '\\t'
for _, r := range records {
	if err := w.Write([]string{r.Name, r.Surname, strconv.Itoa(r.Year)}); err != nil {
		return err
	}
}
w.Flush() // Write only buffers; Flush sends the data
if err := w.Error(); err != nil {
	return err
}`,
        },
        {
          type: "lab",
          id: "c03Csv",
          caption: "Edit the CSV input and run it through the record reader and the statistics program. Try a ragged line, a stray quote and a different delimiter.",
        },
        {
          type: "compare",
          items: [
            { title: "Read in a loop", tone: "ok", html: "Memory stays constant no matter how large the file is, and you can stop early or report progress as you go. The right default for files of unknown size." },
            { title: "ReadAll", tone: "warn", html: "Shorter code, but it loads the whole file into memory as a <code>[][]string</code>. Fine for small, trusted files; risky for uploads or logs." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Forgetting <code>w.Flush()</code> or ignoring <code>w.Error()</code>. <code>csv.Writer</code> buffers its output, so without a flush the last records never reach the file, and write errors surface only through <code>Error</code>.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Interview angle: maps and structs",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Map and struct questions test whether you know the defined behaviour at the edges: missing keys, nil maps, ordering, concurrency, and copying. They often come as "what does this print" snippets or as a follow-up to a design question ("you cache results in a map; what happens with many goroutines?").</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Have crisp answers to these:</p>
<ul>
<li><strong>Does a key exist?</strong> <code>v, ok := m[k]</code>; a plain read cannot distinguish "missing" from "zero".</li>
<li><strong>nil map:</strong> reads, <code>len</code>, <code>range</code> and <code>delete</code> work; writes panic.</li>
<li><strong>Order:</strong> randomized on purpose; sort the keys when you need determinism.</li>
<li><strong>Keys:</strong> any comparable type; not slices, maps or functions.</li>
<li><strong>Concurrency:</strong> not safe; use a mutex or <code>sync.Map</code>. Concurrent writes can kill the process with an unrecoverable fatal error.</li>
<li><strong>new vs &amp;T{} vs make:</strong> the first two return a pointer to a zeroed value; <code>make</code> initializes slices, maps and channels.</li>
<li><strong>Regex:</strong> <code>MustCompile</code> for constants, <code>Compile</code> for user input; RE2 means linear time and no backreferences.</li>
</ul>`,
        },
        {
          type: "quiz",
          q: "<code>users</code> is a <code>[]User</code>. After <code>for _, u := range users { u.Active = true }</code>, how many users are active?",
          options: [
            "All of them",
            "None of them; u is a copy of each element",
            "Only the last one",
            "It does not compile",
          ],
          answer: 1,
          explain: "The range variable holds a copy of each struct, so the assignment changes the copy. Use <code>for i := range users { users[i].Active = true }</code>, or store pointers in the slice.",
        },
      ],
    },
  ],
  takeaways: [
    "Pick the container by access pattern: slices for ordered iteration, maps for lookup by key, structs for a fixed set of named fields.",
    "A missing map key reads as the zero value; use <code>v, ok := m[k]</code> to tell absent from zero.",
    "A nil map is readable but panics on write; initialize maps in constructors.",
    "Map iteration order is deliberately random, and maps are not safe for concurrent use; concurrent writes can crash the process with an unrecoverable error.",
    "<code>type X Y</code> creates a distinct type, <code>type X = Y</code> an alias; prefer keyed struct literals and useful zero values.",
    "Range over a slice of structs copies each element; index the slice or store pointers to modify in place.",
    "Go's RE2-based <code>regexp</code> guarantees linear-time matching and therefore has no backreferences or lookaround; use <code>MustCompile</code> for constant patterns.",
  ],
  furtherReading: [
    { title: "Go maps in action (The Go Blog)", url: "https://go.dev/blog/maps", note: "Map basics, zero values, iteration order and concurrency." },
    { title: "Package regexp documentation", url: "https://pkg.go.dev/regexp", note: "The full API and a link to the RE2 syntax reference." },
    { title: "Package encoding/csv documentation", url: "https://pkg.go.dev/encoding/csv", note: "Reader and Writer settings, quoting rules and ParseError." },
  ],
};
