// Deep dive: Chapter 2, Basic Go data types. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>A request handler builds search queries. It starts from a shared base slice of filters, <code>base := make([]string, 2, 10)</code>, and for each request does <code>q := append(base, userFilter)</code>. In testing, with one request at a time, everything works. In production, two requests arrive close together and both end up searching with the <em>second</em> user's filter.</p>
<p>The cause is not the network or a race in someone else's code. <code>base</code> had spare capacity, so both <code>append</code> calls wrote into the same slot of the same backing array. Nothing in the syntax warns you; you have to know what a slice is. The same is true of strings (why does slicing <code>"José"</code> to four bytes produce garbage?), integers (why does a counter suddenly go negative?) and random numbers (why is this "random" password the same every run?). This chapter is about knowing what the basic types really are.</p>`,
  sections: [
    {
      id: "errors-as-values",
      title: "The error type: failure as an ordinary value",
      kicker: "Errors",
      blocks: [
        {
          type: "idea",
          html: `<p><code>error</code> is a built-in interface with one method, <code>Error() string</code>. Any value with that method is an error, a <code>nil</code> error means success, and you inspect errors with ordinary code instead of special syntax.</p>`,
        },
        {
          type: "text",
          html: `<p>You create simple errors with <code>errors.New("disk full")</code> or, when you need formatting, <code>fmt.Errorf("open %s: %v", name, err)</code>. Return the error as the last result and let the caller decide what to do. The standard strategy is to <strong>handle an error once</strong>: either deal with it (retry, fall back, report it to the user) or add context and return it, but do not log it and also return it, or the same failure appears several times in your logs.</p>
<p>Since Go 1.13, <code>fmt.Errorf</code> with the <code>%w</code> verb wraps an error so that the original is still reachable. <code>errors.Is(err, target)</code> walks the chain looking for a specific value, and <code>errors.As(err, &amp;target)</code> looks for a specific type. Comparing error strings is fragile and should be a last resort.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var ErrNotFound = errors.New("not found") // a sentinel error

func loadUser(id int) (User, error) {
	u, err := db.find(id)
	if err != nil {
		return User{}, fmt.Errorf("load user %d: %w", id, err)
	}
	return u, nil
}

// The caller can still recognise the original error through the wrapping.
if _, err := loadUser(7); errors.Is(err, ErrNotFound) {
	fmt.Println("no such user")
}`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Error strings conventionally start with a lowercase letter and have no trailing punctuation, because they are usually embedded in longer messages: <code>load user 7: query: connection refused</code>.</p>`,
        },
      ],
    },
    {
      id: "numbers-and-overflow",
      title: "Numeric types, overflow and explicit conversions",
      kicker: "Numbers",
      blocks: [
        {
          type: "text",
          html: `<p>Go has sized signed integers (<code>int8</code> to <code>int64</code>), sized unsigned integers (<code>uint8</code> to <code>uint64</code>), <code>float32</code> and <code>float64</code>, and <code>complex64</code> and <code>complex128</code>. <code>byte</code> is an alias for <code>uint8</code> and <code>rune</code> an alias for <code>int32</code>. The plain <code>int</code> and <code>uint</code> are 32 or 64 bits wide depending on the platform; on every common 64-bit system they are 64 bits.</p>
<p>Use <code>int</code> by default: it is what <code>len</code> returns and what indexes are. Reach for a sized type when the size is part of the contract: a binary file format, a network protocol, a struct you store millions of times, or interoperation with C.</p>`,
        },
        {
          type: "problem",
          html: `<p>Integer arithmetic in Go <strong>wraps around silently</strong> at run time. <code>var x int8 = 127; x++</code> leaves <code>x</code> at -128, and <code>math.MaxInt + 1</code> computed in a variable becomes <code>math.MinInt</code>. There is no exception and no panic.</p>`,
        },
        {
          type: "text",
          html: `<p>Constants are different. The compiler evaluates constant expressions with arbitrary precision and checks the result when it is assigned to a type, so <code>var b int8 = 200</code> or <code>const big = math.MaxInt64 + 1; var n int64 = big</code> does not compile. That catches mistakes in literal values but not in computed ones.</p>
<p>Conversions are always explicit and are not range-checked. <code>int8(300)</code> with a variable keeps the low 8 bits (44); converting a negative <code>int</code> to <code>uint</code> gives a huge positive number; converting a <code>float64</code> to <code>int</code> truncates toward zero. A <code>float64</code> holds integers exactly only up to 2<sup>53</sup>, so very large <code>int64</code> values lose precision when converted to floating point.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var a int8 = 127
a++
fmt.Println(a) // -128: two's complement wrap-around

n := 300
fmt.Println(int8(n)) // 44: only the low 8 bits survive

big := int64(1<<53 + 1)
fmt.Println(int64(float64(big)) == big) // false: float64 cannot hold it exactly

// Detecting overflow before it happens:
func addInt64(x, y int64) (int64, bool) {
	s := x + y
	if (x > 0 && y > 0 && s < 0) || (x < 0 && y < 0 && s >= 0) {
		return 0, false
	}
	return s, true
}`,
        },
        {
          type: "lab",
          id: "c02Overflow",
          caption: "Pick a type, push the value past its limits and see the wrap-around. The table shows the same bits read as every other integer type.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Using <code>uint</code> for a quantity "because it can't be negative". Subtracting two unsigned values where the second is larger wraps to an enormous number instead of going negative, and loops like <code>for i := len(s) - 1; i >= 0; i--</code> never end if <code>i</code> is unsigned. Use <code>int</code> unless you need unsigned semantics.</p>`,
        },
      ],
    },
    {
      id: "strings-bytes-runes",
      title: "Strings, bytes and runes",
      kicker: "Text",
      blocks: [
        {
          type: "idea",
          html: `<p>A Go string is an <strong>immutable sequence of bytes</strong>, by convention UTF-8 text. Indexing and <code>len</code> work in bytes. Characters (Unicode code points) are <code>rune</code> values, and you get them by ranging over the string or converting it to <code>[]rune</code>.</p>`,
        },
        {
          type: "text",
          html: `<p>UTF-8 encodes ASCII characters in one byte and everything else in two to four. So <code>len("go")</code> is 2, but <code>len("€")</code> is 3, and <code>"€"[0]</code> is the byte 0xE2, not a character. Slicing a string by byte offsets can cut a character in half, which is how <code>"José"[:4]</code> ends up as <code>"Jos"</code> followed by an invalid byte.</p>
<p><code>for i, r := range s</code> decodes UTF-8 as it goes: <code>r</code> is a rune and <code>i</code> is the <em>byte offset</em> where it starts, so the indexes jump by 1, 2, 3 or 4. Invalid bytes decode as the replacement character U+FFFD. To count characters, use <code>utf8.RuneCountInString(s)</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `s := "a€b"
fmt.Println(len(s))                    // 5 bytes: 1 + 3 + 1
fmt.Println(utf8.RuneCountInString(s)) // 3 runes
for i, r := range s {
	fmt.Printf("%d:%c ", i, r) // 0:a 1:€ 4:b
}

fmt.Println(string(rune(65)))  // "A": the code point 65
fmt.Println(strconv.Itoa(65))  // "65": the decimal digits

var sb strings.Builder // efficient concatenation in a loop
for i := range 3 {
	fmt.Fprintf(&sb, "%d,", i)
}
fmt.Println(sb.String()) // 0,1,2,`,
        },
        {
          type: "text",
          html: `<p>Because strings are immutable, <code>[]byte(s)</code> and <code>string(b)</code> copy the data (the compiler can avoid the copy in a few special cases, such as map lookups with <code>m[string(b)]</code>). Building a long string with <code>+=</code> in a loop copies everything each time; <code>strings.Builder</code> or <code>bytes.Buffer</code> avoids that.</p>
<p>The <code>strings</code> package covers the usual operations (<code>Split</code>, <code>Fields</code>, <code>TrimSpace</code>, <code>HasPrefix</code>, <code>ReplaceAll</code>, <code>EqualFold</code> for case-insensitive comparison) and the <code>unicode</code> package classifies runes (<code>IsLetter</code>, <code>IsDigit</code>, <code>IsSpace</code>). Both understand UTF-8.</p>`,
        },
        {
          type: "lab",
          id: "c02Runes",
          caption: "Type any text and compare its bytes with its runes. Try indexing into the middle of a multi-byte character, and compare string(n) with strconv.Itoa(n).",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p><code>string(65)</code> where 65 is an <code>int</code> gives <code>"A"</code>, not <code>"65"</code>. This conversion is so often a bug that <code>go vet</code> flags it; write <code>string(rune(n))</code> when you really mean a code point and <code>strconv.Itoa(n)</code> when you mean digits.</p>`,
        },
        {
          type: "quiz",
          q: "What do <code>len(\"€\")</code> and the number of iterations of <code>for range \"€\"</code> give?",
          options: ["1 and 1", "3 and 3", "3 and 1", "1 and 3"],
          answer: 2,
          explain: "The euro sign takes 3 bytes in UTF-8, and <code>len</code> counts bytes. <code>range</code> over a string decodes runes, so it runs once, with index 0 and the rune U+20AC.",
        },
      ],
    },
    {
      id: "time-and-constants",
      title: "Time layouts, constants and iota",
      kicker: "Time and constants",
      blocks: [
        {
          type: "text",
          html: `<p><code>time.Time</code> is an instant with nanosecond precision and a location. <code>time.Duration</code> is an <code>int64</code> count of nanoseconds with handy constants: <code>2*time.Second</code>, <code>time.Since(start)</code>. Durations print nicely (<code>1.5s</code>) and parse with <code>time.ParseDuration("90m")</code>.</p>
<p>Formatting and parsing use an unusual idea: instead of codes like <code>%Y-%m-%d</code>, you write the <strong>reference time</strong> <code>Mon Jan 2 15:04:05 MST 2006</code> in the shape you want. Its parts count up: month 1, day 2, hour 3 (15 in 24-hour form), minute 4, second 5, year 6, zone -7. So <code>"2006-01-02"</code> means an ISO date, and <code>time.RFC3339</code> is a predefined layout.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `t := time.Date(2026, time.March, 9, 14, 30, 0, 0, time.UTC)
fmt.Println(t.Format("2006-01-02 15:04"))  // 2026-03-09 14:30
fmt.Println(t.Format("Jan 2, 3:04 PM"))    // Mar 9, 2:30 PM

d, err := time.Parse("02/01/2006", "25/12/2026") // day/month/year
if err != nil {
	log.Fatal(err)
}
fmt.Println(d.Weekday()) // Friday`,
        },
        {
          type: "text",
          html: `<h3>Constants and iota</h3>
<p>A constant is fixed at compile time and must be a boolean, string, rune or number. An <strong>untyped</strong> constant (<code>const timeout = 5</code>) has arbitrary precision and takes on whatever type its context requires, so it can be used as an <code>int</code>, a <code>float64</code> or a <code>time.Duration</code>. A <strong>typed</strong> constant (<code>const timeout int = 5</code>) behaves like a value of that type and needs explicit conversions.</p>
<p>Inside a <code>const ( ... )</code> block, <code>iota</code> is 0 on the first line and increases by one on each line. A line with no expression repeats the previous expression with the new <code>iota</code>, which makes enumerations and bit flags compact.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type Level int

const (
	Debug Level = iota // 0
	Info               // 1
	Warn               // 2
	Error              // 3
)

type Perm uint8

const (
	Read  Perm = 1 << iota // 1
	Write                  // 2
	Exec                   // 4
)

const (
	_  = iota             // skip 0
	KB = 1 << (10 * iota) // 1024
	MB                    // 1048576
)`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Give enumerations their own type (<code>type Level int</code>) so a plain integer cannot be passed by accident, and consider reserving 0 for "unknown" so that a zero-valued struct field is not silently a valid level.</p>`,
        },
      ],
    },
    {
      id: "slices",
      title: "Arrays and slices: headers, capacity and shared memory",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>An array is a fixed-size value; its length is part of its type and assigning it copies every element. A slice is a small <strong>header</strong> of three words (pointer, length, capacity) that describes a window onto a backing array. Copying a slice copies the header, not the elements.</p>`,
        },
        {
          type: "diagram",
          title: "Two slices sharing one backing array",
          caption: "a and b point into the same array. b := a[1:3] has length 2 and capacity 4 (from index 1 to the end of the array). Appending to b writes into index 3 in place, so a[:4] would show the new value.",
          svg: `<svg viewBox="0 0 600 270" role="img" aria-label="Two slice headers pointing into one backing array of five integers">
<defs><marker id="go2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="30" y="30" font-size="13" font-weight="700">slice a</text>
<rect x="30" y="40" width="70" height="34" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="100" y="40" width="70" height="34" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="170" y="40" width="70" height="34" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="65" y="62" text-anchor="middle" font-size="12">ptr</text>
<text x="135" y="62" text-anchor="middle" font-size="12">len 3</text>
<text x="205" y="62" text-anchor="middle" font-size="12">cap 5</text>
<text x="360" y="30" font-size="13" font-weight="700">slice b := a[1:3]</text>
<rect x="360" y="40" width="70" height="34" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="430" y="40" width="70" height="34" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="500" y="40" width="70" height="34" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="395" y="62" text-anchor="middle" font-size="12">ptr</text>
<text x="465" y="62" text-anchor="middle" font-size="12">len 2</text>
<text x="535" y="62" text-anchor="middle" font-size="12">cap 4</text>
<text x="30" y="160" font-size="13" font-weight="700">backing array</text>
<rect x="150" y="140" width="80" height="44" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="230" y="140" width="80" height="44" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="310" y="140" width="80" height="44" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="390" y="140" width="80" height="44" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="4 3"/>
<rect x="470" y="140" width="80" height="44" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="4 3"/>
<text x="190" y="167" text-anchor="middle" font-size="13">10</text>
<text x="270" y="167" text-anchor="middle" font-size="13">20</text>
<text x="350" y="167" text-anchor="middle" font-size="13">30</text>
<text x="430" y="167" text-anchor="middle" font-size="13" style="fill: var(--dg-muted)">0</text>
<text x="510" y="167" text-anchor="middle" font-size="13" style="fill: var(--dg-muted)">0</text>
<text x="190" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">[0]</text>
<text x="270" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">[1]</text>
<text x="350" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">[2]</text>
<text x="430" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">[3]</text>
<text x="510" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">[4]</text>
<line x1="65" y1="74" x2="185" y2="138" style="stroke: var(--dg-1)" stroke-width="2" marker-end="url(#go2-arrow)"/>
<line x1="395" y1="74" x2="275" y2="138" style="stroke: var(--dg-2)" stroke-width="2" marker-end="url(#go2-arrow)"/>
<text x="30" y="245" font-size="12" style="fill: var(--dg-muted)">solid: within a's length; dashed: spare capacity the next append fills in place</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p><code>len</code> is how many elements are in use; <code>cap</code> is how many fit before the backing array runs out. <code>make([]int, 3, 10)</code> sets both. <code>append</code> writes in place while there is room. When the slice is full, it allocates a bigger array, copies the elements and returns a header pointing at the new array. The old array (and any other slice still using it) is no longer connected.</p>
<p>That is why you must always write <code>s = append(s, x)</code>, and why a function that appends to a slice parameter does not change the caller's slice: it received a copy of the header, so the caller's length never changes, even when the write happened to land in the shared array. Return the new slice, or pass a pointer to it.</p>
<p>The growth factor is an implementation detail. Since Go 1.18 the runtime roughly doubles small slices and grows large ones by about 1.25x, with a smooth transition starting around 256 elements, and then rounds up to the allocator's size classes. If you know the final size, preallocate with <code>make([]T, 0, n)</code> and skip the regrowth entirely.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Slicing, the full slice expression, copy and delete",
          code: `a := []int{10, 20, 30, 40, 50}
b := a[1:3]        // [20 30], len 2, cap 4: shares a's array
b = append(b, 99)  // writes a[3]! a is now [10 20 30 99 50]

c := a[1:3:3]      // full slice expression: cap limited to 2
c = append(c, 77)  // no room, so append copies; a is untouched

dst := make([]int, 2)
n := copy(dst, a)  // copies min(len(dst), len(a)) = 2 elements

i := 1
a = append(a[:i], a[i+1:]...)  // delete index 1, keep the order
a = slices.Delete(a, 0, 1)     // Go 1.21: same idea, also zeroes the tail since 1.22
_, _ = n, c`,
        },
        {
          type: "lab",
          id: "c02Slices",
          caption: "Replay the shared-backing-array example step by step. Watch append write into spare capacity, then copy to a new array once the capacity runs out.",
        },
        {
          type: "text",
          html: `<h3>nil versus empty</h3>
<p>A nil slice (<code>var s []int</code>) and an empty slice (<code>s := []int{}</code>) both have length 0, and <code>append</code>, <code>len</code> and <code>range</code> treat them the same, so most code should not care. Two places do: <code>s == nil</code> differs, and <code>encoding/json</code> marshals a nil slice as <code>null</code> and an empty one as <code>[]</code>, which some API clients notice.</p>`,
        },
        {
          type: "quiz",
          q: "<code>func add(s []int) { s = append(s, 4) }</code> is called with <code>s := make([]int, 3, 10)</code>. What is <code>len(s)</code> in the caller afterwards, and is anything written to the shared array?",
          options: [
            "4; the element is written",
            "3; but the value 4 is written to index 3 of the shared array",
            "3; nothing is written because append always copies",
            "It does not compile",
          ],
          answer: 1,
          explain: "The function gets a copy of the header. There is spare capacity, so append writes 4 into index 3 of the shared array, but only the function's copy of the header gets length 4. The caller still sees length 3; a later <code>s[:4]</code> would reveal the hidden 4.",
        },
      ],
    },
    {
      id: "pointers-unsafe-random",
      title: "Pointers, slice-to-array conversions and random numbers",
      kicker: "Pointers and randomness",
      blocks: [
        {
          type: "text",
          html: `<p><code>&amp;x</code> takes the address of <code>x</code> and <code>*p</code> follows a pointer. The zero value of a pointer is <code>nil</code>, and dereferencing <code>nil</code> panics. There is no pointer arithmetic in ordinary Go. <code>new(T)</code> allocates a zeroed <code>T</code> and returns a <code>*T</code>, which is the same as <code>&amp;T{}</code> for structs.</p>
<p>Returning the address of a local variable is safe. The compiler's <strong>escape analysis</strong> sees that the value outlives the function and allocates it on the heap instead of the stack. You can see its decisions with <code>go build -gcflags=-m</code>. Use pointers when a function must modify its argument, when a value is large enough that copying matters, or when "no value" (<code>nil</code>) is a meaningful state.</p>`,
        },
        {
          type: "text",
          html: `<p>Go 1.17 added conversion from a slice to an array pointer, <code>(*[4]byte)(s)</code>, which shares memory with the slice. Go 1.20 added conversion to an array value, <code>[4]byte(s)</code>, which copies. Both panic if the slice is shorter than the array. They are handy for fixed-size keys such as hashes. The <code>unsafe</code> package can go further (reading raw memory, converting between pointer types), but it opts out of the type system and its rules; leave it to low-level libraries.</p>
<h3>Two kinds of random</h3>
<p><code>math/rand</code> is a fast pseudo-random generator: given the same seed, it produces the same sequence, which is great for simulations and tests and terrible for secrets. Since Go 1.20 the global generator is seeded randomly at startup and <code>rand.Seed</code> is deprecated; Go 1.22 added <code>math/rand/v2</code> with a cleaner API. For passwords, tokens, keys and session IDs, use <code>crypto/rand</code>, which reads from the operating system's secure source.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "A password generator that is safe to use",
          code: `func password(n int) (string, error) {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#%&*+-?@"
	limit := big.NewInt(int64(len(chars)))
	out := make([]byte, n)
	for i := range out {
		k, err := rand.Int(rand.Reader, limit) // crypto/rand: uniform in [0, limit)
		if err != nil {
			return "", err
		}
		out[i] = chars[k.Int64()]
	}
	return string(out), nil
}`,
          caption: "crypto/rand.Int picks uniformly, so there is no modulo bias. math/rand makes no promise of unpredictability, so it has no place in a password generator.",
        },
        {
          type: "compare",
          items: [
            { title: "math/rand", tone: "info", html: "Fast, with convenient helpers (<code>Intn</code>, <code>Shuffle</code>, <code>Float64</code>). Reproducible when you supply a fixed seed, which helps tests and simulations. Not designed to resist an attacker." },
            { title: "crypto/rand", tone: "ok", html: "Reads from the operating system's cryptographically secure source, so values cannot be predicted. Slower, and the API returns errors you must handle. The right choice for tokens, keys and passwords." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Generating API tokens or password-reset codes with <code>math/rand</code>. A seeded generator replays the same sequence, and none of its algorithms are meant to withstand someone trying to predict them. Anything an attacker must not guess comes from <code>crypto/rand</code>.</p>`,
        },
      ],
    },
    {
      id: "interview",
      title: "Interview angle: slices, strings and numbers",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Basic types are a favourite interview area because the questions are short and the wrong answers are revealing. Expect a code snippet with <code>append</code>, a string containing a non-ASCII character, or an integer near its limit, and a request to predict the output.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Points worth having ready:</p>
<ul>
<li><strong>Slice header:</strong> pointer, length, capacity. Copying a slice shares the backing array; <code>append</code> may or may not reallocate, so always use its result.</li>
<li><strong>Full slice expression</strong> <code>s[lo:hi:max]</code> caps the capacity so a later append cannot overwrite data beyond <code>hi</code>.</li>
<li><strong>Strings:</strong> immutable UTF-8 bytes; <code>len</code> counts bytes, <code>range</code> yields runes at byte offsets.</li>
<li><strong>Overflow:</strong> silent wrap-around at run time, compile error for constants.</li>
<li><strong>Errors:</strong> wrap with <code>%w</code>, inspect with <code>errors.Is</code> and <code>errors.As</code>.</li>
<li><strong>Randomness:</strong> <code>math/rand</code> for simulations, <code>crypto/rand</code> for secrets.</li>
</ul>`,
        },
        {
          type: "quiz",
          q: "Which change fixes the shared-filter bug from the introduction, where <code>q := append(base, userFilter)</code> ran for concurrent requests and <code>base</code> had spare capacity?",
          options: [
            "Use <code>q := append(base[:len(base):len(base)], userFilter)</code>",
            "Declare <code>base</code> as a global variable",
            "Use <code>copy(base, q)</code> after the append",
            "Replace <code>append</code> with <code>+</code>",
          ],
          answer: 0,
          explain: "Capping the capacity with a full slice expression leaves no spare room, so every append must allocate a fresh array and requests no longer share a slot. <code>slices.Clip(base)</code> or copying into a new slice works too.",
        },
      ],
    },
  ],
  takeaways: [
    "Errors are ordinary values: wrap them with <code>%w</code>, inspect them with <code>errors.Is</code> and <code>errors.As</code>, and handle each one once.",
    "Integer overflow wraps silently at run time, conversions are explicit and unchecked, and <code>float64</code> is exact only up to 2<sup>53</sup>.",
    "Strings are immutable UTF-8 bytes: <code>len</code> and indexing work in bytes, <code>range</code> decodes runes, and <code>string(n)</code> is not <code>strconv.Itoa(n)</code>.",
    "Time layouts are written with the reference time <code>Mon Jan 2 15:04:05 MST 2006</code>; <code>iota</code> builds enumerations and bit flags.",
    "A slice is a header over a backing array. Appends write in place while capacity lasts, so slices can share memory until one reallocates.",
    "Always use the result of <code>append</code>; use a full slice expression or a copy when a slice must not share its tail.",
    "Use <code>crypto/rand</code> for anything secret; <code>math/rand</code> is predictable by design.",
  ],
  furtherReading: [
    { title: "Go Slices: usage and internals (The Go Blog)", url: "https://go.dev/blog/slices-intro", note: "The original explanation of slice headers, append and capacity." },
    { title: "Strings, bytes, runes and characters in Go (The Go Blog)", url: "https://go.dev/blog/strings", note: "Why a string is bytes and how range decodes UTF-8." },
    { title: "Working with Errors in Go 1.13 (The Go Blog)", url: "https://go.dev/blog/go1.13-errors", note: "Wrapping with %w, errors.Is and errors.As." },
    { title: "Package time documentation", url: "https://pkg.go.dev/time", note: "Layouts, durations and the predefined formats." },
  ],
};
