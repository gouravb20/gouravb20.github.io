// Deep dive: Chapter 5, Reflection and interfaces. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>A validation function returns <code>error</code>. Inside, it declares <code>var verr *ValidationError</code>, fills it in only when something is wrong, and ends with <code>return verr</code>. Tests that feed it bad input pass. Then the service goes live and every single request, valid or not, is rejected with the message <code>validation failed: &lt;nil&gt;</code>.</p>
<p>The function returned a nil <em>pointer</em>, but the caller received a non-nil <em>interface</em> that happens to contain a nil pointer, and <code>err != nil</code> is true. To understand why, you need to know what an interface value actually is. This chapter covers how Go expresses behaviour (methods, receivers, interfaces, type assertions), how it inspects types at run time (reflection), and how it gets object-oriented designs without classes or inheritance.</p>`,
  sections: [
    {
      id: "methods-and-receivers",
      title: "Methods, receivers and method sets",
      kicker: "Methods",
      blocks: [
        {
          type: "text",
          html: `<p>A method is a function with a <strong>receiver</strong>: <code>func (c *Counter) Inc()</code>. You can declare methods on any defined type in your own package, not just structs: <code>type Celsius float64</code> can have a <code>String()</code> method. Under the hood a method is an ordinary function whose first parameter is the receiver, which is why you can even write the method expression <code>(*Counter).Inc(&amp;c)</code>.</p>
<p>A <strong>value receiver</strong> gets a copy, so changes made inside the method are lost when it returns. A <strong>pointer receiver</strong> gets the address and can modify the original. When you call a method on an addressable variable, Go inserts the <code>&amp;</code> or <code>*</code> for you, so <code>c.Inc()</code> works whether <code>c</code> is a <code>Counter</code> or a <code>*Counter</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type Counter struct{ n int }

func (c Counter) Value() int { return c.n } // reads a copy
func (c *Counter) Inc()      { c.n++ }      // modifies the original

type Incrementer interface{ Inc() }

func main() {
	var c Counter
	c.Inc()                // fine: Go rewrites this as (&c).Inc()
	fmt.Println(c.Value()) // 1

	var i Incrementer = &c // OK: *Counter has Inc in its method set
	i.Inc()
	// var j Incrementer = c
	// error: Counter does not implement Incrementer (method Inc has pointer receiver)
	fmt.Println(c.Value()) // 2
}`,
        },
        {
          type: "text",
          html: `<h3>Method sets decide interface satisfaction</h3>
<p>The <strong>method set</strong> of a type <code>T</code> contains only its value-receiver methods. The method set of <code>*T</code> contains both value- and pointer-receiver methods. A type implements an interface only if every interface method is in its method set. So a <code>Counter</code> value does not satisfy <code>Incrementer</code>, even though <code>c.Inc()</code> compiles: that call works only because <code>c</code> is an addressable variable, and a value stored inside an interface is not addressable.</p>
<p>When should you use a pointer receiver? When the method modifies the receiver; when the struct is large enough that copying matters; when it contains a field that must not be copied, such as a <code>sync.Mutex</code>; and, for consistency, on all methods of a type once any of them needs one. Value receivers suit small, immutable types like <code>time.Time</code>.</p>`,
        },
        {
          type: "lab",
          id: "c05MethodSets",
          caption: "Choose each method's receiver and the operand you call it on. See which calls compile, how Go rewrites them, whether Inc really changes the counter and which interfaces each operand satisfies.",
        },
        {
          type: "quiz",
          q: "<code>Inc</code> has a pointer receiver. Why does <code>var i Incrementer = c</code> fail when <code>c.Inc()</code> compiles?",
          options: [
            "Interfaces can only hold pointers",
            "c.Inc() works because c is addressable and Go takes its address; the method set of the value type Counter does not include Inc",
            "Because Inc is not exported",
            "It is a bug in older Go versions; it compiles today",
          ],
          answer: 1,
          explain: "Method calls on addressable variables get an automatic <code>&amp;</code>. Interface satisfaction uses method sets, and only <code>*Counter</code>'s method set contains pointer-receiver methods. Assign <code>&amp;c</code> instead.",
        },
      ],
    },
    {
      id: "interfaces",
      title: "Interfaces: implicit, small and composable",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>An interface is a set of method signatures. A type satisfies it <strong>implicitly</strong>, just by having the methods; there is no <code>implements</code> keyword. That lets a consumer define the small interface it needs, after the fact, and have existing types satisfy it without changing them.</p>`,
        },
        {
          type: "text",
          html: `<p>The most important interfaces in Go are tiny. <code>io.Reader</code> and <code>io.Writer</code> have one method each, <code>error</code> has one, <code>fmt.Stringer</code> has one. Small interfaces are easy to satisfy and easy to fake in tests. Larger ones are built by embedding: <code>io.ReadWriter</code> is just <code>interface{ Reader; Writer }</code>, and anything that satisfies both satisfies it.</p>
<p>A common Go guideline is "accept interfaces, return concrete types". A function that takes an <code>io.Reader</code> works with files, network connections, buffers and compressed streams; a constructor that returns a concrete <code>*Server</code> lets callers use every method without assertions.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `// upperWriter satisfies io.Writer without declaring it.
type upperWriter struct{ w io.Writer }

func (u upperWriter) Write(p []byte) (int, error) {
	return u.w.Write(bytes.ToUpper(p))
}

// A compile-time check that the type still satisfies the interface.
var _ io.Writer = upperWriter{}

type byAge []Person

func (a byAge) Len() int           { return len(a) }
func (a byAge) Less(i, j int) bool { return a[i].Age < a[j].Age }
func (a byAge) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }

func main() {
	fmt.Fprintln(upperWriter{os.Stdout}, "hello") // HELLO
	people := []Person{{"Ana", 31}, {"Bo", 25}}
	sort.Sort(byAge(people)) // sort.Interface: Len, Less, Swap
}`,
          caption: "Since Go 1.21, slices.SortFunc(people, func(a, b Person) int { return cmp.Compare(a.Age, b.Age) }) does the same without a helper type.",
        },
        {
          type: "diagram",
          title: "An interface value is a (type, value) pair",
          caption: "An interface value holds its dynamic type and a pointer to (or copy of) the dynamic value. It equals nil only when both are empty. Storing a nil pointer fills in the type, so the interface is no longer nil.",
          svg: `<svg viewBox="0 0 600 260" role="img" aria-label="Three interface values: a nil interface, an interface holding a typed nil pointer, and an interface holding a real pointer">
<defs><marker id="go5-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="15" y="28" font-size="13" font-weight="700">var e error</text>
<text x="15" y="46" font-size="12" style="fill: var(--dg-muted)">nil interface</text>
<rect x="15" y="60" width="170" height="38" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="15" y="98" width="170" height="38" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="100" y="84" text-anchor="middle" font-size="12">type: nil</text>
<text x="100" y="122" text-anchor="middle" font-size="12">value: nil</text>
<text x="15" y="240" font-size="13" font-weight="700" style="fill: var(--dg-ok)">e == nil is true</text>
<text x="215" y="28" font-size="13" font-weight="700">e = (*MyErr)(nil)</text>
<text x="215" y="46" font-size="12" style="fill: var(--dg-muted)">typed nil inside</text>
<rect x="215" y="60" width="170" height="38" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="215" y="98" width="170" height="38" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="300" y="84" text-anchor="middle" font-size="12">type: *MyErr</text>
<text x="300" y="122" text-anchor="middle" font-size="12">value: nil</text>
<text x="215" y="240" font-size="13" font-weight="700" style="fill: var(--dg-bad)">e == nil is false</text>
<text x="415" y="28" font-size="13" font-weight="700">e = &amp;MyErr{42}</text>
<text x="415" y="46" font-size="12" style="fill: var(--dg-muted)">ordinary error</text>
<rect x="415" y="60" width="170" height="38" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="415" y="98" width="170" height="38" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="500" y="84" text-anchor="middle" font-size="12">type: *MyErr</text>
<text x="500" y="122" text-anchor="middle" font-size="12">value: pointer</text>
<rect x="430" y="168" width="140" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="500" y="191" text-anchor="middle" font-size="12">MyErr{Code: 42}</text>
<line x1="500" y1="136" x2="500" y2="165" style="stroke: var(--dg-3)" stroke-width="2" marker-end="url(#go5-arrow)"/>
<text x="415" y="240" font-size="13" font-weight="700">e == nil is false</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "io package", title: "Reader and Writer", html: "Files, sockets, <code>bytes.Buffer</code>, <code>gzip.Writer</code>, HTTP bodies and hashes all meet at <code>io.Reader</code>/<code>io.Writer</code>, so <code>io.Copy</code> works between any two of them." },
            { org: "net/http", title: "http.Handler", html: "Every HTTP handler, router and middleware in the Go ecosystem is something with a <code>ServeHTTP(ResponseWriter, *Request)</code> method." },
            { org: "fmt", title: "fmt.Stringer", html: "If a value has a <code>String() string</code> method, <code>fmt.Println</code> uses it. That is how <code>time.Duration</code> prints as <code>1.5s</code>." },
          ],
        },
      ],
    },
    {
      id: "type-assertions-and-switches",
      title: "Type assertions, type switches and unknown JSON",
      kicker: "Getting the concrete type back",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>type assertion</strong> <code>x.(T)</code> extracts the concrete value of type <code>T</code> from an interface value <code>x</code>, or checks whether <code>x</code>'s dynamic type satisfies an interface <code>T</code>. The single-result form panics if the assertion fails (<code>interface conversion: interface {} is int, not string</code>). The comma-ok form, <code>v, ok := x.(T)</code>, never panics; on failure <code>ok</code> is false and <code>v</code> is the zero value of <code>T</code>.</p>
<p>A <strong>type switch</strong> tests several types at once. In a case that names one type, the switch variable has that type; in a case that lists several types, and in <code>default</code>, it keeps the interface type. Cases are tried <strong>in order</strong>, and the first match wins, which matters when a case names an interface that several types satisfy.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func describe(x any) string {
	switch v := x.(type) {
	case nil:
		return "nil"
	case int, int64:
		return fmt.Sprintf("integer %v", v) // v is still any here
	case string:
		return "string of length " + strconv.Itoa(len(v)) // v is a string
	case error:
		return "error: " + v.Error()
	case fmt.Stringer:
		return "stringer: " + v.String()
	default:
		return fmt.Sprintf("something else: %T", v)
	}
}`,
          caption: "A type that is both an error and a Stringer takes the error branch, because that case comes first. Swap the two cases and the same value takes the Stringer branch.",
        },
        {
          type: "lab",
          id: "c05TypeSwitch",
          caption: "Store different values in an interface{} and dispatch them. Reorder the cases to see the first match win, then compare comma-ok and single-value assertions.",
        },
        {
          type: "text",
          html: `<h3>JSON with an unknown shape</h3>
<p>When you cannot define a struct for incoming JSON, <code>json.Unmarshal</code> into a <code>map[string]any</code> keeps everything: objects become <code>map[string]any</code>, arrays become <code>[]any</code>, strings, booleans and <code>nil</code> map naturally, and <strong>every number becomes a <code>float64</code></strong>. You then walk the data with type assertions. If you need exact large integers, use a <code>json.Decoder</code> with <code>UseNumber()</code>, which keeps numbers as <code>json.Number</code> strings.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var doc map[string]any
data := []byte(\`{"name": "gopher", "stars": 120, "tags": ["go", "cli"]}\`)
if err := json.Unmarshal(data, &doc); err != nil {
	log.Fatal(err)
}
stars, ok := doc["stars"].(float64) // not int!
tags, _ := doc["tags"].([]any)
fmt.Println(stars, ok, len(tags)) // 120 true 2`,
        },
        {
          type: "quiz",
          q: "A type switch has <code>case fmt.Stringer:</code> before <code>case time.Duration:</code>. What happens when it receives a <code>time.Duration</code>?",
          options: [
            "The time.Duration case runs because it is more specific",
            "The fmt.Stringer case runs because Duration has a String method and cases are tried in order",
            "Both cases run",
            "It does not compile because the cases overlap",
          ],
          answer: 1,
          explain: "Type switch cases are evaluated top to bottom and the first match wins. <code>time.Duration</code> satisfies <code>fmt.Stringer</code>, so it never reaches its own case. Put concrete types before interfaces. (The compiler rejects duplicate types, not overlapping interfaces.)",
        },
      ],
    },
    {
      id: "custom-errors",
      title: "Custom error types and the nil interface trap",
      kicker: "Errors as interfaces",
      blocks: [
        {
          type: "text",
          html: `<p>Because <code>error</code> is just <code>interface{ Error() string }</code>, any type with that method is an error. A custom type can carry structured details, such as which field failed validation or which key was missing, and callers can recover those details with <code>errors.As</code>, which also looks through wrapped errors.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type NotFoundError struct{ Key string }

func (e *NotFoundError) Error() string { return "not found: " + e.Key }

func lookup(key string) (string, error) {
	return "", fmt.Errorf("lookup: %w", &NotFoundError{Key: key})
}

func main() {
	_, err := lookup("user:7")
	var nf *NotFoundError
	if errors.As(err, &nf) { // finds it through the %w wrapping
		fmt.Println("missing key", nf.Key)
	}
}`,
        },
        {
          type: "problem",
          title: "The trap from the introduction",
          html: `<p>Returning a typed nil pointer through an <code>error</code> result produces an interface whose type is set and whose value is nil. As the diagram above shows, that interface is <strong>not</strong> equal to <code>nil</code>, so callers treat it as a failure.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func validate(name string) error {
	var verr *ValidationError
	if name == "" {
		verr = &ValidationError{Field: "name"}
	}
	return verr // BUG: always a non-nil error, even when verr is nil
}

func validateFixed(name string) error {
	if name == "" {
		return &ValidationError{Field: "name"}
	}
	return nil // an untyped nil: the interface itself is nil
}`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Declaring a variable of a concrete error type (<code>var err *MyErr</code>) and returning it as <code>error</code>. Keep error variables typed as <code>error</code>, and write <code>return nil</code> explicitly on the success path.</p>`,
        },
        {
          type: "quiz",
          q: "A function's signature is <code>func f() error</code> and its body is <code>var p *MyErr; return p</code>. What does <code>f() == nil</code> evaluate to?",
          options: ["true", "false", "It panics", "It does not compile"],
          answer: 1,
          explain: "The returned interface holds dynamic type <code>*MyErr</code> and a nil value. An interface is nil only when both its type and value are unset, so the comparison is false.",
        },
      ],
    },
    {
      id: "reflection",
      title: "Reflection: inspecting types at run time",
      kicker: "Reflection",
      blocks: [
        {
          type: "text",
          html: `<p>Some code must handle types it has never seen: <code>fmt.Println</code> prints any value, <code>encoding/json</code> marshals any struct, an ORM maps any struct to a table. The <code>reflect</code> package makes that possible by exposing a value's type and structure at run time.</p>
<p><code>reflect.TypeOf(x)</code> returns a <code>reflect.Type</code>: the exact type, such as <code>main.Celsius</code>, with its name, fields, tags and methods. <code>reflect.ValueOf(x)</code> returns a <code>reflect.Value</code> holding the value itself. Both have a <code>Kind()</code>, the broad category of the underlying type: <code>reflect.Float64</code> for <code>Celsius</code>, <code>reflect.Struct</code> for any struct. Code usually switches on <code>Kind</code>, because there are endless types but only a fixed set of kinds.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type Config struct {
	Host  string \`env:"HOST"\`
	Port  int    \`env:"PORT"\`
	debug bool
}

// setDefaults fills empty fields. p must be a pointer to a struct.
func setDefaults(p any) {
	v := reflect.ValueOf(p).Elem() // Elem: the struct the pointer points to
	t := v.Type()
	for i := 0; i < v.NumField(); i++ {
		f, info := v.Field(i), t.Field(i)
		if !f.CanSet() { // unexported fields cannot be set
			continue
		}
		fmt.Printf("%s kind=%s tag=%q\\n", info.Name, f.Kind(), info.Tag.Get("env"))
		switch f.Kind() {
		case reflect.String:
			if f.String() == "" {
				f.SetString("localhost")
			}
		case reflect.Int:
			if f.Int() == 0 {
				f.SetInt(8080)
			}
		}
	}
}`,
          caption: "Calling setDefaults(&cfg) works. Calling setDefaults(cfg) panics: ValueOf receives a copy of a struct, not a pointer, so Elem() is not valid on it.",
        },
        {
          type: "text",
          html: `<p>Modifying a value requires a <strong>settable</strong> <code>reflect.Value</code>. <code>reflect.ValueOf(cfg)</code> holds a copy, so setting its fields would be meaningless and panics instead. You must pass a pointer and call <code>Elem()</code> to reach the original. Unexported fields can be read in limited ways but never set, which preserves package encapsulation even under reflection.</p>`,
        },
        {
          type: "lab",
          id: "c05Reflect",
          caption: "Pick a struct and how you obtain its reflect.Value, then walk its fields. Press Set fields and see that only ValueOf(&amp;A).Elem() works, and that unexported fields refuse to change.",
        },
        {
          type: "tradeoffs",
          pros: [
            "Handles arbitrary types: serializers, printers, validators, dependency injection",
            "Struct tags let users configure behaviour declaratively",
          ],
          cons: [
            "Harder to read and review than ordinary code",
            "Slower: every operation goes through run-time type checks and often allocates",
            "Mistakes are run-time panics, not compile errors",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "encoding/json", title: "Struct tags", html: "<code>json.Marshal</code> uses reflection to walk struct fields and reads tags like <code>json:\"name,omitempty\"</code> to decide key names and what to skip." },
            { org: "fmt", title: "%v and %+v", html: "The print functions use reflection to format values of any type, including field names with <code>%+v</code>." },
          ],
        },
      ],
    },
    {
      id: "oop-and-choosing",
      title: "OOP without classes, and choosing the right tool",
      kicker: "Design",
      blocks: [
        {
          type: "text",
          html: `<p>Go has no classes and no inheritance, but it covers the useful parts of object-oriented design. Types with methods play the role of objects. Interfaces provide polymorphism. Exported and unexported names give encapsulation at the package level. And <strong>embedding</strong> gives composition: put a type inside a struct without a field name, and its fields and methods are <em>promoted</em> so you can call them directly on the outer struct.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type Logger struct{ prefix string }

func (l Logger) Log(msg string) { fmt.Println(l.prefix + msg) }

type Server struct {
	Logger // embedded: Server gets a promoted Log method
	addr   string
}

func main() {
	s := Server{Logger: Logger{prefix: "[srv] "}, addr: ":8080"}
	s.Log("listening on " + s.addr) // same as s.Logger.Log(...)
}`,
        },
        {
          type: "text",
          html: `<p>Embedding is not inheritance. A <code>Server</code> is not a <code>Logger</code> (you cannot pass a <code>Server</code> where a <code>Logger</code> is expected), and a promoted method always runs with the embedded value as its receiver. If <code>Logger.Log</code> called another <code>Logger</code> method, defining a method of the same name on <code>Server</code> would not change which one runs: there is no virtual dispatch through embedding. Polymorphism in Go comes from interfaces; a <code>Server</code> does satisfy any interface that <code>Log</code> satisfies, because promoted methods join its method set.</p>`,
        },
        {
          type: "table",
          title: "Interfaces, generics and reflection",
          headers: ["Tool", "Checked", "Use it when"],
          rows: [
            ["Interfaces", "Compile time, dispatched at run time", "Different types share a behaviour, chosen at run time (readers, handlers, stores)"],
            ["Generics", "Compile time", "One algorithm or container must work for many types with the same operations"],
            ["Reflection", "Run time only", "You must handle types unknown when the code was written (encoders, ORMs, config loaders)"],
          ],
          note: "Prefer them roughly in this order of safety: concrete code, interfaces or generics, and reflection only when nothing else fits.",
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Embedding an interface in a struct is a handy testing trick: <code>type fakeStore struct{ Store }</code> satisfies the whole <code>Store</code> interface, and you override only the methods the test needs. Calling one you did not override panics on the nil embedded interface, which tells you exactly what the code under test used.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Interview angle: interfaces under pressure",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Interface questions separate people who have used Go from people who have read about it. Expect the nil interface trap, method sets, a type switch with an ordering twist, and a design question about when you would reach for reflection.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Answers worth rehearsing:</p>
<ul>
<li><strong>How does a type implement an interface?</strong> Implicitly, if the interface's methods are all in its method set.</li>
<li><strong>Method sets:</strong> <code>T</code> has value-receiver methods; <code>*T</code> has both. A value in an interface is not addressable, so no automatic <code>&amp;</code>.</li>
<li><strong>Nil interface gotcha:</strong> an interface is nil only if its type and value are both nil; return a literal <code>nil</code> for "no error".</li>
<li><strong>Assertions:</strong> single-value form panics on failure, comma-ok form does not.</li>
<li><strong>Type vs Kind:</strong> <code>main.Celsius</code> versus <code>float64</code>; switch on <code>Kind</code> in generic reflection code.</li>
<li><strong>Setting with reflection:</strong> pass a pointer, call <code>Elem()</code>, check <code>CanSet()</code>; unexported fields are never settable.</li>
<li><strong>OOP:</strong> methods, interfaces, package-level encapsulation and embedding; composition instead of inheritance.</li>
</ul>`,
        },
        {
          type: "quiz",
          q: "<code>Server</code> embeds <code>Logger</code>. Which statement is true?",
          options: [
            "A Server value can be passed to a function that takes a Logger",
            "Server satisfies any interface whose methods Logger's value-receiver methods provide, because promoted methods join its method set",
            "Defining Server.Prefix overrides Logger.Prefix inside Logger's own methods",
            "Embedding copies Logger's source code into Server",
          ],
          answer: 1,
          explain: "Promoted methods become part of the outer type's method set, so interface satisfaction works. But Server is not a Logger, and Logger's methods keep calling Logger's own methods: there is no virtual dispatch through embedding.",
        },
      ],
    },
  ],
  takeaways: [
    "Value receivers work on a copy, pointer receivers on the original; Go inserts <code>&amp;</code> or <code>*</code> automatically when calling methods on addressable variables.",
    "Interface satisfaction is implicit and uses method sets: <code>*T</code> includes pointer-receiver methods, <code>T</code> does not.",
    "Keep interfaces small and define them where they are consumed; accept interfaces, return concrete types.",
    "An interface value is a (type, value) pair and is nil only when both are nil; return a literal <code>nil</code> for success.",
    "Use comma-ok assertions to avoid panics, and order type switch cases from concrete types to interfaces.",
    "Reflection (<code>TypeOf</code>, <code>ValueOf</code>, <code>Kind</code>) powers encoders and printers, but it is slower, harder to read and fails at run time; setting values needs a pointer and <code>Elem()</code>.",
    "Go replaces inheritance with embedding and interfaces: promoted methods give reuse, interfaces give polymorphism.",
  ],
  furtherReading: [
    { title: "The Laws of Reflection (The Go Blog)", url: "https://go.dev/blog/laws-of-reflection", note: "Interface values, reflect.Type and reflect.Value, and settability." },
    { title: "Effective Go: Interfaces and embedding", url: "https://go.dev/doc/effective_go", note: "Idiomatic interface design, type switches and embedding." },
    { title: "Go FAQ: Why is my nil error value not equal to nil?", url: "https://go.dev/doc/faq", note: "The official explanation of the nil interface trap." },
  ],
};
