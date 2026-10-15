// Deep dive: Chapter 4, Go generics. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>A metrics library has <code>SumInts</code>, <code>SumInt64s</code> and <code>SumFloat64s</code>: three copies of the same five-line loop. Someone fixes an edge case in one and forgets the other two. Someone else "simplifies" them into a single <code>Sum(xs []interface{}) interface{}</code>, and now every caller writes type assertions, the compiler no longer catches a slice of strings, and a bad call panics at run time in production instead of failing the build.</p>
<p>Before Go 1.18 those were the choices: duplicate the code, give up type safety with <code>interface{}</code>, or generate code with a tool. Generics add a fourth: write the function once with a <strong>type parameter</strong>, say exactly which types it accepts, and let the compiler check every call. This chapter covers the syntax, constraints, generic types, the standard <code>slices</code>, <code>maps</code> and <code>cmp</code> packages, and the judgment call of when generics are worth it.</p>`,
  sections: [
    {
      id: "why-generics",
      title: "The problem generics solve",
      kicker: "Motivation",
      blocks: [
        {
          type: "problem",
          html: `<p>Some algorithms do not care about the element type: summing numbers, finding an item in a slice, reversing a list, a stack, a set. Without generics you either copy them per type or route values through <code>interface{}</code>, which moves type errors from compile time to run time and adds boxing and assertions to every call.</p>`,
        },
        {
          type: "idea",
          html: `<p>A generic function declares <strong>type parameters</strong> in square brackets, each with a <strong>constraint</strong> that says which types are allowed. Callers supply type arguments (usually inferred), and the compiler checks the body once against the constraint and every call against the body.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "One function instead of three",
          code: `type Number interface {
	~int | ~int64 | ~float64
}

func Sum[T Number](xs []T) T {
	var total T // zero value of whatever T is
	for _, x := range xs {
		total += x // allowed: every type in Number supports +
	}
	return total
}

type Celsius float64

func main() {
	fmt.Println(Sum([]int{1, 2, 3}))      // 6: T inferred as int
	fmt.Println(Sum([]Celsius{20.5, 21})) // 41.5: accepted thanks to ~float64
	fmt.Println(Sum[float64](nil))        // 0: explicit type argument
	// Sum([]string{"a"}) does not compile: string is not in Number
}`,
        },
        {
          type: "text",
          html: `<p>Using a generic function with specific types is called <strong>instantiation</strong>. You can write the type arguments explicitly (<code>Sum[float64]</code>), but the compiler usually infers them from the ordinary arguments; you only need them when there is nothing to infer from, such as a <code>nil</code> argument or a type parameter that appears only in the result.</p>
<p>The important shift is where errors appear. With <code>interface{}</code>, passing a slice of strings to a numeric function compiles and fails when it runs. With a constraint, it is a compile error that points at the call. Generics give you code reuse <em>without</em> giving up the static type checking that Go is built around.</p>`,
        },
      ],
    },
    {
      id: "constraints",
      title: "Constraints: any, comparable, unions and ~",
      kicker: "The key idea",
      blocks: [
        {
          type: "text",
          html: `<p>A constraint is an interface. Inside the function body you may only use operations that every type allowed by the constraint supports. That rule decides what you can write:</p>
<ul>
<li><code>any</code> (an alias for <code>interface{}</code>) allows every type, so the body can only do things that work for all types: assign values, pass them on, store them in slices or maps as values, take their address, print them.</li>
<li><code>comparable</code> allows types that support <code>==</code> and <code>!=</code>, which is what you need for map keys or searching. Slices, maps and functions are excluded.</li>
<li>A <strong>union</strong> such as <code>int | float64</code> restricts the type set to the listed types and permits the operations they all share, such as <code>+</code> and <code>&lt;</code>.</li>
<li><code>cmp.Ordered</code> (Go 1.21) is the standard union of every integer, float and string type: anything that supports <code>&lt;</code>.</li>
</ul>`,
        },
        {
          type: "text",
          html: `<h3>Exact types versus underlying types</h3>
<p>A plain term like <code>int</code> matches only <code>int</code>. The tilde form <code>~int</code> matches every type whose <em>underlying type</em> is <code>int</code>, including your own defined types such as <code>type UserID int</code>. Without the tilde, generic code would reject most domain types; that is why the standard constraints all use <code>~</code>.</p>
<p>Interfaces that contain unions or <code>~</code> terms can only be used as constraints. <code>var n Number</code> does not compile, because such an interface describes a set of types for the compiler, not a kind of run-time value.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func Index[T comparable](xs []T, v T) int {
	for i, x := range xs {
		if x == v {
			return i
		}
	}
	return -1
}

func Largest[T cmp.Ordered](xs ...T) (T, bool) {
	var best T
	if len(xs) == 0 {
		return best, false
	}
	best = xs[0]
	for _, x := range xs[1:] {
		best = max(best, x) // generic built-in since Go 1.21
	}
	return best, true
}

// Any slice type in, the same slice type out (keeps named types like IDs).
func Filter[S ~[]E, E any](s S, keep func(E) bool) S {
	var out S
	for _, v := range s {
		if keep(v) {
			out = append(out, v)
		}
	}
	return out
}`,
          caption: "Filter's signature is the standard trick for slice helpers: S is the slice type and E its element type, so a type IDs []int comes back as IDs, not []int.",
        },
        {
          type: "lab",
          id: "c04Constraints",
          caption: "Pick a type argument and a constraint and see whether the call compiles. Then toggle ~ in the Numeric union and watch named types such as Celsius become acceptable.",
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Since Go 1.20, interface types satisfy <code>comparable</code>. That makes <code>Index[any]</code> legal, but comparing two interface values whose dynamic type is a slice still panics at run time. The constraint guarantees that <code>==</code> compiles, not that it can never fail.</p>`,
        },
        {
          type: "quiz",
          q: "Given <code>type Celsius float64</code>, which constraint accepts <code>Celsius</code> as a type argument?",
          options: [
            "<code>interface{ float64 }</code>",
            "<code>interface{ ~float64 }</code>",
            "<code>comparable</code> but not <code>~float64</code>",
            "None: defined types can never be type arguments",
          ],
          answer: 1,
          explain: "A plain <code>float64</code> term matches exactly <code>float64</code>. The tilde term <code>~float64</code> matches every type whose underlying type is <code>float64</code>, which includes <code>Celsius</code>. (<code>comparable</code> would accept it too, but would not allow arithmetic.)",
        },
      ],
    },
    {
      id: "generic-types",
      title: "Generic types and data structures",
      kicker: "Generic types",
      blocks: [
        {
          type: "text",
          html: `<p>Types can have type parameters too. That is where generics pay off most clearly: containers such as stacks, queues, sets, linked lists, trees and caches can be written once and used with full type safety, instead of storing <code>interface{}</code> and asserting on every read.</p>
<p>A generic type must be instantiated before use: <code>Stack[int]</code> and <code>Stack[string]</code> are distinct types. Methods are declared on the generic receiver, <code>func (s *Stack[T]) Push(v T)</code>, and can use <code>T</code> freely. To return "nothing" of type <code>T</code>, declare <code>var zero T</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type Stack[T any] struct {
	items []T
}

func (s *Stack[T]) Push(v T) { s.items = append(s.items, v) }

func (s *Stack[T]) Pop() (T, bool) {
	var zero T
	if len(s.items) == 0 {
		return zero, false
	}
	v := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return v, true
}

type node[T any] struct {
	val  T
	next *node[T]
}

type List[T any] struct{ head *node[T] }

func (l *List[T]) PushFront(v T) { l.head = &node[T]{val: v, next: l.head} }`,
          caption: "The zero value of Stack[T] is ready to use: a nil slice appends fine. A pointer receiver is needed because Push and Pop modify the stack.",
        },
        {
          type: "text",
          html: `<h3>No type parameters on methods</h3>
<p>A method cannot declare its own type parameters; only the type can. You cannot write <code>func (s *Stack[T]) Map[U any](f func(T) U) *Stack[U]</code>. The reason is interfaces: Go checks interface satisfaction by method set, and a method with its own type parameters would need an unbounded number of instantiations that the compiler could not know in advance. The workaround is a top-level function, <code>func Map[T, U any](s *Stack[T], f func(T) U) *Stack[U]</code>.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Go standard library", title: "slices, maps, cmp, sync/atomic", html: "The generic packages added in Go 1.21, and the typed <code>atomic.Pointer[T]</code> added in Go 1.19, are the most widely used generic code in the ecosystem." },
            { org: "sync.OnceValue", title: "Generic helpers in older packages", html: "Go 1.21 added <code>sync.OnceValue[T]</code> and <code>sync.OnceValues</code>, which wrap a function so it runs once and every caller gets its typed result, with no <code>interface{}</code> in sight." },
          ],
        },
      ],
    },
    {
      id: "how-generics-compile",
      title: "How Go compiles generics, and what it costs",
      kicker: "Under the hood",
      blocks: [
        {
          type: "text",
          html: `<p>There are two classic ways to implement generics. <strong>Monomorphization</strong> (C++ templates, Rust) generates a separate copy of the code for every type argument: fast code, but slower builds and bigger binaries. <strong>Boxing</strong> (Java) uses one copy that works on pointers to values: small output, but extra indirection.</p>
<p>Go chose a middle path called <strong>GC shape stenciling with dictionaries</strong>. The compiler groups type arguments by their "GC shape", which is roughly their underlying type and memory layout, and generates one copy of the function per shape. Each call also passes a hidden dictionary describing the actual type arguments. All pointer types share a single shape, so <code>F[*User]</code> and <code>F[*Order]</code> use the same machine code.</p>`,
        },
        {
          type: "table",
          headers: ["Strategy", "Used by", "Build time and binary size", "Run-time speed"],
          rows: [
            ["Monomorphization", "C++, Rust", "Grows with every instantiation", "Fully specialized"],
            ["Boxing / type erasure", "Java", "One copy", "Indirection on every access"],
            ["GC shape stenciling + dictionaries", "Go", "One copy per shape", "Specialized for value shapes; method calls on pointer-shaped type parameters go through the dictionary"],
          ],
        },
        {
          type: "text",
          html: `<p>The practical consequence: generic code over plain values like <code>int</code> or <code>float64</code> is usually as fast as hand-written code, but calling methods on a type parameter whose arguments are pointers or interfaces involves an indirect lookup that the compiler often cannot inline. Generic code is not automatically faster than an interface version, and in some cases it is slower. The implementation is allowed to change between releases, so if a hot path matters, benchmark it rather than assuming.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Go's designers deliberately avoided full monomorphization to protect compile times, one of the language's original goals. Generics were added in a way that keeps builds fast even if it occasionally costs some run-time speed.</p>`,
        },
      ],
    },
    {
      id: "slices-maps-cmp",
      title: "The slices, maps and cmp packages",
      kicker: "Standard library",
      blocks: [
        {
          type: "text",
          html: `<p>Go 1.21 added three generic packages that replace a lot of hand-written loops. <code>slices</code> has searching (<code>Contains</code>, <code>Index</code>, <code>BinarySearch</code>), editing (<code>Insert</code>, <code>Delete</code>, <code>Replace</code>, <code>Compact</code>), ordering (<code>Sort</code>, <code>SortFunc</code>, <code>SortStableFunc</code>, <code>Reverse</code>) and housekeeping (<code>Clone</code>, <code>Clip</code>, <code>Grow</code>, <code>Equal</code>). <code>maps</code> has <code>Clone</code>, <code>Copy</code>, <code>Equal</code>, <code>EqualFunc</code> and <code>DeleteFunc</code>. <code>cmp</code> has <code>Compare</code>, <code>Less</code> and the <code>Ordered</code> constraint. The same release added the built-ins <code>min</code>, <code>max</code> and <code>clear</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `s := []int{3, 1, 3, 3, 2, 1}
slices.Sort(s)                         // [1 1 2 3 3 3]
s = slices.Compact(s)                  // [1 2 3]: reassign!
i, found := slices.BinarySearch(s, 2)  // 1 true
s = slices.Insert(s, 1, 10, 11)        // [1 10 11 2 3]
fmt.Println(i, found, slices.Index(s, 3), slices.Max(s)) // 1 true 4 11

type Person struct {
	Last string
	Age  int
}
people := []Person{{"Ng", 40}, {"Ali", 31}, {"Ng", 25}}
slices.SortFunc(people, func(a, b Person) int {
	return cmp.Or(cmp.Compare(a.Last, b.Last), cmp.Compare(a.Age, b.Age)) // cmp.Or: Go 1.22
})

m := map[string]int{"a": 1, "b": 2}
c := maps.Clone(m)
maps.DeleteFunc(c, func(k string, v int) bool { return v > 1 })
fmt.Println(maps.Equal(m, c)) // false
clear(m)                      // m is now empty`,
          caption: "cmp.Or returns its first non-zero argument, which makes multi-key comparisons read naturally: by last name, then by age.",
        },
        {
          type: "text",
          html: `<p>Functions that shrink or grow a slice, such as <code>Compact</code>, <code>Delete</code> and <code>Insert</code>, return the new slice, exactly like <code>append</code>. <code>Compact</code> moves the kept elements to the front of the <em>same</em> backing array and returns a shorter header; if you ignore the result, your variable still has the old length and now shows a scrambled tail. Since Go 1.22, these functions also zero the elements between the new and the old length, so leftover pointers do not keep memory alive.</p>`,
        },
        {
          type: "lab",
          id: "c04SlicesLab",
          caption: "Run Clone, Compact, Clip, Replace and Sort on a slice with spare capacity. Watch what happens to the original backing array, and switch between Go 1.21 and 1.22 to see the tail zeroing.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Writing <code>slices.Compact(s)</code> or <code>slices.Delete(s, i, j)</code> as a statement on its own. The call compiles, the backing array is modified, and <code>s</code> keeps its old length. Always assign the result: <code>s = slices.Compact(s)</code>.</p>`,
        },
      ],
    },
    {
      id: "shallow-vs-deep-copy",
      title: "Shallow and deep copies",
      kicker: "Copying",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>shallow copy</strong> creates a new container and copies each element with ordinary assignment. A <strong>deep copy</strong> also duplicates whatever the elements refer to. For a <code>[]int</code> there is no difference, because an <code>int</code> refers to nothing. For a <code>[][]int</code>, a <code>[]*User</code> or a <code>map[string][]string</code>, there is a big one: a shallow copy shares the inner data with the original.</p>
<p><code>slices.Clone</code> and <code>maps.Clone</code> are shallow. Cloning a <code>[][]int</code> gives you a new outer array whose elements are slice headers pointing at the <em>same</em> inner arrays. Replacing <code>t[0]</code> with a new slice does not affect the original, but writing <code>t[0][0] = 9</code> does.</p>`,
        },
        {
          type: "diagram",
          title: "slices.Clone on a [][]int",
          caption: "Clone copies the outer array of slice headers. Both outer arrays point at the same inner arrays, so writes to inner elements are visible through both.",
          svg: `<svg viewBox="0 0 600 280" role="img" aria-label="A shallow clone of a slice of slices shares the inner arrays">
<defs><marker id="go4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="40" y="32" font-size="13" font-weight="700">s (outer array)</text>
<rect x="40" y="40" width="80" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="120" y="40" width="80" height="40" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="80" y="65" text-anchor="middle" font-size="12">s[0]</text>
<text x="160" y="65" text-anchor="middle" font-size="12">s[1]</text>
<text x="40" y="182" font-size="13" font-weight="700">t = slices.Clone(s)</text>
<rect x="40" y="190" width="80" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="120" y="190" width="80" height="40" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="80" y="215" text-anchor="middle" font-size="12">t[0]</text>
<text x="160" y="215" text-anchor="middle" font-size="12">t[1]</text>
<text x="400" y="72" font-size="13" font-weight="700">inner arrays</text>
<rect x="400" y="80" width="70" height="40" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="470" y="80" width="70" height="40" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="435" y="105" text-anchor="middle" font-size="13">1</text>
<text x="505" y="105" text-anchor="middle" font-size="13">2</text>
<rect x="400" y="150" width="70" height="40" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="470" y="150" width="70" height="40" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="435" y="175" text-anchor="middle" font-size="13">3</text>
<text x="505" y="175" text-anchor="middle" font-size="13">4</text>
<line x1="80" y1="80" x2="397" y2="96" style="stroke: var(--dg-1)" stroke-width="2" marker-end="url(#go4-arrow)"/>
<line x1="160" y1="80" x2="397" y2="160" style="stroke: var(--dg-1)" stroke-width="2" marker-end="url(#go4-arrow)"/>
<line x1="80" y1="190" x2="397" y2="106" style="stroke: var(--dg-2)" stroke-width="2" marker-end="url(#go4-arrow)"/>
<line x1="160" y1="190" x2="397" y2="178" style="stroke: var(--dg-2)" stroke-width="2" marker-end="url(#go4-arrow)"/>
<text x="40" y="264" font-size="12" style="fill: var(--dg-muted)">shared inner arrays: t[0][0] = 9 is also visible as s[0][0]</text>
</svg>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func deepCopy(s [][]int) [][]int {
	out := make([][]int, len(s))
	for i, inner := range s {
		out[i] = slices.Clone(inner) // new inner array for every row
	}
	return out
}

s := [][]int{{1, 2}, {3, 4}}
shallow := slices.Clone(s)
deep := deepCopy(s)
shallow[0][0] = 9
fmt.Println(s[0][0], deep[0][0]) // 9 1`,
        },
        {
          type: "lab",
          id: "c04Copies",
          caption: "Copy s by assignment, with slices.Clone and with a deep-copy loop, then write through either variable. Same colour means shared memory; try the nested [][]int case.",
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>There is no generic deep copy in the standard library, because "deep" depends on the type: should a pointer be followed? Should a shared sub-object be copied once or twice? Write a small, explicit copy function for the types that need one, or design them as immutable so that sharing is harmless.</p>`,
        },
        {
          type: "quiz",
          q: "<code>s := [][]int{{1, 2}, {3, 4}}; t := slices.Clone(s); t[1] = []int{7, 8}; t[0][1] = 9</code>. What is <code>s</code> now?",
          options: [
            "<code>[[1 2] [3 4]]</code>",
            "<code>[[1 9] [3 4]]</code>",
            "<code>[[1 9] [7 8]]</code>",
            "<code>[[1 2] [7 8]]</code>",
          ],
          answer: 1,
          explain: "Replacing <code>t[1]</code> changes only t's own outer array, so <code>s[1]</code> is untouched. But <code>t[0]</code> and <code>s[0]</code> point at the same inner array, so writing <code>t[0][1]</code> is visible as <code>s[0][1]</code>.",
        },
      ],
    },
    {
      id: "interview",
      title: "Interview angle: when generics are worth it",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Interviewers rarely want you to show off clever type parameters. They want to know that you can tell when generics help. A useful rule: if you are about to write the same function for a second type, or you are reaching for <code>interface{}</code> plus type assertions, consider a generic function. If the types share <em>behaviour</em> (methods) rather than an algorithm, an ordinary interface is usually the better tool.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Use generics", tone: "ok", html: "Containers (stacks, sets, caches), algorithms over slices and maps, functions whose result type depends on the argument type, and replacing <code>interface{}</code> APIs that need assertions." },
            { title: "Use an interface", tone: "info", html: "Values with different implementations of the same behaviour, chosen at run time: <code>io.Reader</code>, <code>http.Handler</code>, <code>sort.Interface</code>. You want dynamic dispatch, not a different copy per type." },
            { title: "Neither", tone: "warn", html: "Code that only ever handles one type. Making it generic &quot;for later&quot; adds complexity without benefit; support the types you need, no more and no fewer." },
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Likely questions and the core of each answer:</p>
<ul>
<li><strong><code>int</code> vs <code>~int</code>:</strong> exact type versus any type whose underlying type is <code>int</code>.</li>
<li><strong>Can a union constraint be a variable type?</strong> No; type-set interfaces are constraints only.</li>
<li><strong>Why no method type parameters?</strong> Interface satisfaction is by method set, which must be finite and known.</li>
<li><strong>Implementation:</strong> GC shape stenciling with dictionaries; pointer types share code; benchmark hot paths.</li>
<li><strong>slices.Clone on <code>[][]int</code>:</strong> shallow; inner arrays are shared.</li>
<li><strong>Signature for any slice type:</strong> <code>func F[S ~[]E, E any](s S) S</code>.</li>
</ul>`,
        },
        {
          type: "quiz",
          q: "Why must you write <code>s = slices.Compact(s)</code> rather than just <code>slices.Compact(s)</code>?",
          options: [
            "Compact always allocates a new array, so the old one is unchanged",
            "Compact works in place but returns a shorter slice header; the caller's header still has the old length",
            "It does not matter; both forms are equivalent",
            "Without assignment the compiler reports an unused result error",
          ],
          answer: 1,
          explain: "Compact moves the kept elements to the front of the same backing array and returns a header with the new length. Ignoring it leaves your variable with the old length, exposing a tail of leftover (and since Go 1.22, zeroed) elements. The compiler does not force you to use the result.",
        },
      ],
    },
  ],
  takeaways: [
    "Generics (Go 1.18+) let one function or type work for many types while keeping compile-time type checking, unlike <code>interface{}</code> plus assertions.",
    "A constraint is an interface; the body may only use operations that every type in its type set supports.",
    "<code>~T</code> matches every type whose underlying type is <code>T</code>; use it so named domain types are accepted.",
    "Type-set interfaces are constraints only, and methods cannot declare their own type parameters.",
    "Go compiles generics with GC shape stenciling and dictionaries: fast builds, specialized code for value shapes, possible indirection for pointer shapes.",
    "Use the Go 1.21 <code>slices</code>, <code>maps</code> and <code>cmp</code> packages, and always reassign the result of functions like <code>Compact</code> and <code>Delete</code>.",
    "<code>slices.Clone</code> and <code>maps.Clone</code> are shallow; nested data needs an explicit deep copy.",
  ],
  furtherReading: [
    { title: "Tutorial: Getting started with generics", url: "https://go.dev/doc/tutorial/generics", note: "The official step-by-step introduction." },
    { title: "An Introduction To Generics (The Go Blog)", url: "https://go.dev/blog/intro-generics", note: "Type parameters, type sets and inference explained by the designers." },
    { title: "When To Use Generics (The Go Blog)", url: "https://go.dev/blog/when-generics", note: "Guidelines for choosing between generics, interfaces and plain code." },
    { title: "Package slices documentation", url: "https://pkg.go.dev/slices", note: "Every function, with notes on which ones modify their argument." },
  ],
};
