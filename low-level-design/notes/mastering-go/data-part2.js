// Mastering Go - interactive notes data, part 2 (chapters 4-6)
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch4`, part: 2, number: 4,
    title: `Go Generics`,
    overview: `Generics (Go 1.18+) let you write a function or type once and have the compiler check and specialize it for every type argument it is used with. The chapter covers the <strong>type parameter syntax</strong> (<code>[T any]</code>), <strong>constraints</strong> (<code>any</code>, <code>comparable</code>, custom unions, and the <code>~</code> operator for underlying types), <strong>generic types</strong> (a generic slice type and a generic linked list), and the three standard packages built on generics since Go 1.21: <strong>cmp</strong>, <strong>slices</strong> and <strong>maps</strong>, together with the difference between shallow and deep copies. It ends with advice on when generics are worth it. You can write excellent Go without them, generic code can compile and run slower, and you should support the types you need, no more and no fewer.`,
    concepts: [
      { term: `Type parameters`, def: `A function or type can declare type parameters in square brackets before its regular parameters: <code>func PrintSlice[T any](s []T)</code>. <code>T</code> is a placeholder that the compiler resolves at <strong>compile time</strong> from the calling code. Several can be declared at once: <code>[T, U, W any]</code>.`, why: `One implementation replaces a family of copy-pasted functions (one for <code>[]int</code>, one for <code>[]string</code>...) while keeping full static type checking. Unlike <code>interface{}</code>, the function body doesn't need to find out the type at run time.`, ex: `<code>PrintSlice([]int{1, 2, 3})</code>, <code>PrintSlice([]string{"a", "b"})</code> and <code>PrintSlice([]float64{1.2, -2.33})</code> all call the same generic function (the book's <code>hw.go</code>).` },
      { term: `Instantiation and type inference`, def: `Using a generic function with concrete types <strong>instantiates</strong> it. You can pass type arguments explicitly (<code>PrintSlice[int](s)</code>) but usually the compiler <strong>infers</strong> them from the argument types.`, why: `Inference only works from arguments. If a type parameter only appears in the result, or the call is ambiguous, you must write the type arguments yourself. All arguments bound to the same <code>T</code> must have the same type.`, ex: `The book shows <code>Add(4.1, 3)</code> failing with <em>default type int of 3 does not match inferred type float64 for T</em>. That was Go 1.18-1.20. Since Go 1.21, mixed untyped constants are inferred like operands of an operator, so it compiles with <code>T = float64</code>. Typed variables of different types (<code>Add(f, i)</code>) are still an error.` },
      { term: `any`, def: `<code>any</code> is a predeclared alias for <code>interface{}</code>. As a constraint it allows every type, so the body may only do operations that are valid for all types: assign, pass along, take the address, print with <code>fmt</code>.`, why: `<code>[T any]</code> is right for containers and plumbing (print, store, move). You can't write <code>a + b</code> or <code>a == b</code> on an <code>any</code>-constrained T, because not every type supports them.` },
      { term: `comparable`, def: `A predeclared constraint satisfied by every type that supports <code>==</code> and <code>!=</code>: booleans, numbers, strings, pointers, channels, arrays and structs whose elements are comparable, and (since Go 1.20) interface types.`, why: `Use it for map keys, sets, <code>Same(a, b)</code>, <code>slices.Index</code>. Slices, maps and functions are not comparable, so <code>Same([]int{1,2}, []int{1,3})</code> fails with <em>[]int does not satisfy comparable</em>, while two arrays can be compared. Interface type arguments compile, but <code>==</code> can panic at run time if the dynamic values are not comparable.`, demo: `c04Constraints` },
      { term: `Custom constraints (type sets)`, def: `A constraint is an interface. Besides methods it may list a <strong>union</strong> of types: <code>type Numeric interface { int | int8 | int16 | int32 | int64 | float64 }</code>. Only the types in the set are allowed, and the operations allowed in the body are the ones every member supports (here <code>+</code>).`, why: `Unions make arithmetic generic: <code>func Add[T Numeric](a, b T) T { return a + b }</code>. An interface that contains a union (or <code>comparable</code>) can only be used as a constraint, never as the type of an ordinary variable.`, demo: `c04Constraints` },
      { term: `~T: underlying-type terms`, def: `A plain term like <code>int</code> matches exactly <code>int</code>. The <strong>tilde</strong> form <code>~int</code> matches every type whose <strong>underlying type</strong> is int, such as <code>type AnotherInt int</code>. The book calls this a <em>supertype</em>; the spec calls it an approximation element.`, why: `Without <code>~</code>, named types like <code>time.Duration</code> or <code>type Celsius float64</code> are rejected, and the compiler hints <em>possibly missing ~ for int in Numeric</em>. Library constraints such as <code>cmp.Ordered</code> use <code>~</code> on every term.`, ex: `<code>type AllInts interface { ~int }</code> lets <code>AddElements([]AnotherInt{0, 1, 2})</code> return 3. Note the zero value is built with <code>sum := T(0)</code>.`, demo: `c04Constraints` },
      { term: `Constraining to slice types`, def: `<code>func f[S ~[]E, E any](x S) int</code> accepts any slice type, including named ones like <code>type IDs []int</code>, and also gives you the element type <code>E</code>. The long form is <code>[S interface{ ~[]E }, E interface{}]</code>; Go lets you drop the <code>interface{ }</code> wrapper in constraint position.`, why: `This is the signature pattern used throughout the <code>slices</code> package. Returning <code>S</code> rather than <code>[]E</code> keeps the caller's named type.` },
      { term: `Generic types`, def: `Types can have type parameters too: <code>type TreeLast[T any] []T</code>. Methods are declared on the instantiated receiver, <code>func (t TreeLast[T]) replaceLast(e T) (TreeLast[T], error)</code>, and the type is used as <code>TreeLast[string]{"aa", "bb"}</code>.`, why: `Methods can use the type's parameters but <strong>cannot declare new type parameters of their own</strong>. If you need that, write a top-level generic function instead.` },
      { term: `Generic data structures`, def: `The book's linked list: <code>type node[T any] struct { Data T; next *node[T] }</code> and <code>type list[T any] struct { start *node[T] }</code>, with an <code>add(data T)</code> method on <code>*list[T]</code>.`, why: `Write the structure once and get a <code>list[int]</code>, a <code>list[string]</code> or a list of JSON records for free. Each list is still homogeneous: a <code>node[int]</code> can only point to another <code>node[int]</code>. Replace <code>any</code> with a narrower constraint to restrict the element types.` },
      { term: `The cmp package`, def: `Go 1.21. <code>cmp.Compare(x, y)</code> returns -1, 0 or +1; <code>cmp.Less(x, y)</code> returns a bool; <code>cmp.Ordered</code> is the constraint for types that support <code>&lt; &lt;= &gt; &gt;=</code> (integers, floats, strings, all with <code>~</code>). Go 1.22 added <code>cmp.Or</code>, which returns the first non-zero argument.`, why: `<code>slices</code> and <code>maps</code> build on it, and <code>cmp.Compare</code> is the usual building block for <code>slices.SortFunc</code> comparators. It orders NaN before every other float, consistently.`, ex: `<code>cmp.Compare(5, 4)</code> = 1, <code>cmp.Compare(4, 5)</code> = -1, <code>cmp.Less(4, 5.1)</code> = true. Both untyped constants become float64.` },
      { term: `Shallow vs deep copy`, def: `A <strong>shallow copy</strong> creates a new container and assigns each element with ordinary assignment. A <strong>deep copy</strong> copies recursively, so nested slices, maps and pointed-to values are duplicated too.`, why: `<code>slices.Clone</code> and <code>maps.Clone</code> are shallow. For <code>[]int</code> that is a full copy, but for <code>[][]int</code> or <code>[]*User</code> the clone shares the inner data, so a write through one is visible through the other. Deep copies must handle cycles and are rarely generic.`, demo: `c04Copies` },
      { term: `The slices package`, def: `Go 1.21 generic helpers for slices of any type: <code>Clone</code>, <code>Compact</code> (collapse runs of equal neighbours), <code>Contains</code>, <code>Index</code>, <code>Clip</code> (drop spare capacity), <code>Min</code>/<code>Max</code>, <code>Replace</code>, <code>Insert</code>, <code>Delete</code>, <code>Sort</code>, <code>SortFunc</code>, <code>BinarySearch</code>, <code>Equal</code>, <code>Reverse</code>.`, why: `They replace hand-written loops and most uses of <code>sort.Slice</code>, and they are type-safe. Functions that change the length return the new slice, so always reassign: <code>s = slices.Compact(s)</code>.`, ex: `<code>slices.Compact([]int{1, 2, 0, 0})</code> gives <code>[1 2 0]</code>; <code>slices.Clip</code> turns len 10 / cap 100 into len 10 / cap 10; <code>slices.Replace(s, 1, 3, 100, 200)</code> replaces <code>s[1:3]</code>.`, demo: `c04SlicesLab` },
      { term: `The maps package`, def: `Go 1.21 helpers for any map type: <code>Clone</code> (shallow), <code>Copy(dst, src)</code> (src wins on duplicate keys), <code>Equal</code>, <code>EqualFunc</code> (compare values with your function, so the value types may differ), <code>DeleteFunc</code> (delete the pairs where your predicate returns true). Go 1.23 added the iterator functions <code>Keys</code>, <code>Values</code>, <code>All</code>.`, why: `The book deletes odd values with <code>maps.DeleteFunc(m, func(k string, v int) bool { return v%2 != 0 })</code> and compares a <code>map[string]int</code> with a <code>map[string]float64</code> through <code>EqualFunc</code>.` },
      { term: `clear, min and max built-ins`, def: `Go 1.21 also added <code>clear(x)</code>, which deletes every entry of a map or zeroes every element of a slice (the length stays the same), and the generic built-ins <code>min</code> and <code>max</code> for ordered values.`, why: `<code>clear</code> on a slice does <em>not</em> shrink it. Use <code>s = s[:0]</code> to reuse the backing array with length 0.` },
      { term: `When (not) to use generics`, def: `Use them when the same logic must work on several types, when interface/reflection code would be harder to read, or when you expect more types later. Don't use them to show off, and don't widen a function to every type just because you can.`, why: `There are costs. Go compiles generics with <strong>GC-shape stenciling plus dictionaries</strong>: types with the same memory shape (for example, all pointer types) share one instantiation, and method calls through a constraint go through a dictionary. Generic code can therefore be slower than hand-specialized code and compiles more slowly. Measure before you assume.` }
    ],
    cheatsheet: [
      { title: `Constraints at a glance`, type: `table`, headers: [`Constraint`, `Allows`, `Body may use`, `Rejects`], rows: [
        [`<code>any</code>`, `Every type`, `Assignment, passing, <code>fmt</code>`, `Nothing (but no <code>+</code>, no <code>==</code>)`],
        [`<code>comparable</code>`, `Types with <code>==</code>`, `<code>==</code>, <code>!=</code>, map keys`, `Slices, maps, funcs`],
        [`<code>int | float64</code>`, `Exactly those types`, `Ops common to all (<code>+ - * /</code> ...)`, `<code>type MyInt int</code> (needs <code>~</code>)`],
        [`<code>~int</code>`, `Every type with underlying int`, `Integer ops`, `<code>int64</code>, <code>float64</code>`],
        [`<code>cmp.Ordered</code>`, `~ints, ~uints, ~floats, ~string`, `<code>&lt; &lt;= &gt; &gt;=</code>, <code>==</code>`, `bool, structs, slices`],
        [`<code>interface{ String() string }</code>`, `Types with that method`, `Calling <code>String()</code>`, `Types without it`]
      ], note: `Interfaces that contain a union or <code>comparable</code> are constraint-only; you can't declare a variable of that type.` },
      { title: `slices and maps (Go 1.21+)`, type: `table`, headers: [`Call`, `Effect`], rows: [
        [`<code>slices.Clone(s)</code>`, `New backing array, elements assigned (shallow)`],
        [`<code>s = slices.Compact(s)</code>`, `Collapse runs of equal neighbours; sort first to dedupe`],
        [`<code>s = slices.Clip(s)</code>`, `cap becomes len`],
        [`<code>s = slices.Replace(s, i, j, v...)</code>`, `Replace <code>s[i:j]</code> with <code>v...</code>`],
        [`<code>slices.Sort(s)</code> / <code>SortFunc(s, cmp)</code>`, `In-place ascending sort / custom comparator returning int`],
        [`<code>slices.Contains</code>, <code>Index</code>, <code>Min</code>, <code>Max</code>`, `Search and aggregate (Min/Max panic on empty)`],
        [`<code>maps.Clone(m)</code>, <code>maps.Copy(dst, src)</code>`, `Shallow clone; copy pairs, src overwrites dst`],
        [`<code>maps.Equal</code>, <code>maps.EqualFunc</code>`, `Same keys and values; custom value comparison`],
        [`<code>maps.DeleteFunc(m, pred)</code>`, `Delete pairs where <code>pred(k, v)</code> is true`]
      ] },
      { title: `Generic function and generic type`, type: `code`, body: `type Number interface {
    ~int | ~int64 | ~float64
}

// Sum works for []int, []float64 and named types like []Celsius.
func Sum[S ~[]E, E Number](s S) E {
    var total E
    for _, v := range s {
        total += v
    }
    return total
}

// A generic linked list (the book's structures.go, tidied up).
type node[T any] struct {
    Data T
    next *node[T]
}

type List[T any] struct {
    head, tail *node[T]
}

func (l *List[T]) Add(v T) {
    n := &node[T]{Data: v}
    if l.tail == nil {
        l.head, l.tail = n, n
        return
    }
    l.tail.next = n
    l.tail = n
}

func (l *List[T]) Each(f func(T)) {
    for n := l.head; n != nil; n = n.next {
        f(n.Data)
    }
}

// Methods cannot add type parameters; write a function instead.
func Map[T, U any](l *List[T], f func(T) U) *List[U] {
    out := &List[U]{}
    l.Each(func(v T) { out.Add(f(v)) })
    return out
}` },
      { title: `When to reach for generics`, type: `list`, items: [
        `Same algorithm, many element types: containers, <code>Map</code>/<code>Filter</code>, sorting, sets, caches.`,
        `When the <code>interface{}</code> + type switch version needs one case per type, or the reflection version hides errors until run time.`,
        `Prefer an <strong>interface</strong> when you want to describe <em>behaviour</em> (<code>io.Reader</code>, <code>io.Writer</code>, <code>sort.Interface</code>).`,
        `Support the types you need. A narrow constraint documents intent and keeps errors at compile time.`,
        `Expect slightly slower builds, and possibly slower code when methods are called through constraints. Benchmark hot paths.`
      ] }
    ],
    interview: [
      { q: `What problem do generics solve that <code>interface{}</code> didn't?`, a: `With <code>interface{}</code> a function accepts anything, so the signature documents nothing. The body must recover the concrete type with type assertions or a type switch (one case per supported type), and mistakes become run-time panics. With type parameters the compiler knows the concrete type at each call site: it rejects unsupported types at compile time, the body can use operators the constraint permits, and results come back with the right static type with no assertion needed.`, diff: `easy` },
      { q: `What's the difference between <code>int</code> and <code>~int</code> in a constraint?`, a: `<code>int</code> matches only the type <code>int</code>. <code>~int</code> matches every type whose underlying type is int, for example <code>type AnotherInt int</code>. Without the tilde, calling <code>Add[AnotherInt]</code> fails with "AnotherInt does not satisfy Numeric (possibly missing ~ for int in Numeric)". Library constraints such as <code>cmp.Ordered</code> use <code>~</code> on every term so that named types like <code>time.Duration</code> work.`, diff: `easy` },
      { q: `Which types satisfy <code>comparable</code>? Can you compare two slices with <code>Same[T comparable]</code>?`, a: `Booleans, numbers, strings, pointers, channels, interface types, and arrays and structs whose fields are all comparable. Slices, maps and functions are not, so <code>Same([]int{1,2}, []int{1,3})</code> fails to compile with "[]int does not satisfy comparable". Use <code>slices.Equal</code> instead. Arrays such as <code>[2]int</code> are comparable. Since Go 1.20 interface types satisfy comparable too, but <code>==</code> on them can panic at run time if the dynamic values are slices or maps.`, diff: `med` },
      { q: `Can you use <code>type Numeric interface{ int | float64 }</code> as a variable type?`, a: `No. An interface with a union (or one that embeds <code>comparable</code>) describes a type set for constraints only. <code>var x Numeric</code> is a compile error ("cannot use type Numeric outside a type constraint: interface contains type constraints"). Only basic interfaces, the ones made of methods alone, can be used as ordinary types.`, diff: `med` },
      { q: `Why can't a method have its own type parameters?`, a: `Methods may use the type parameters of their receiver type (<code>func (l *List[T]) Add(v T)</code>), but they can't declare new ones (<code>func (l *List[T]) Map[U any](...)</code> is illegal). Methods take part in interface satisfaction, and a parameterized method would need an unbounded set of instantiations that the compiler can't know when it builds method tables. The workaround is a top-level function, <code>func Map[T, U any](l *List[T], f func(T) U) *List[U]</code>.`, diff: `hard` },
      { q: `Explain shallow vs deep copy using <code>slices.Clone</code> on a <code>[][]int</code>.`, a: `<code>slices.Clone</code> allocates a new outer backing array and assigns each element. The elements of a <code>[][]int</code> are slice headers that point to inner arrays, so the clone's rows share memory with the original's rows. <code>t[0][0] = 99</code> is visible in both, but <code>t[0] = []int{7}</code> only changes the clone. A deep copy also clones every inner slice: <code>for i := range s { t[i] = slices.Clone(s[i]) }</code>. For <code>[]int</code>, a shallow copy is already a full copy.`, diff: `med` },
      { q: `How does Go implement generics, and what does that mean for performance?`, a: `Go uses a hybrid called <strong>GC-shape stenciling with dictionaries</strong>. The compiler generates one copy of the function per <em>GC shape</em> (types with the same underlying memory layout share one; all pointer types share one), and passes a hidden dictionary with type information for operations that differ between types. Code over basic value types is often as fast as hand-written code. Calling methods on a type parameter, especially pointer-shaped ones, goes through the dictionary and may be slower and harder to inline than direct calls. Compile times also grow. As the book says, flexibility has a cost, so benchmark.`, diff: `hard` },
      { q: `What does <code>slices.Compact</code> do, and why must you reassign its result?`, a: `It replaces each run of consecutive equal elements with a single copy and returns the shortened slice: <code>[1 2 0 0]</code> becomes <code>[1 2 0]</code>, while <code>-1 0 -1</code> is unchanged. To remove all duplicates, sort first. It works in place on the backing array and returns a slice with a smaller length, but your variable's length doesn't change, so you must write <code>s = slices.Compact(s)</code>. The same applies to <code>Delete</code>, <code>Insert</code>, <code>Replace</code> and <code>Clip</code>. (Since Go 1.22 the obsolete tail elements are zeroed.)`, diff: `med` },
      { q: `Write the signature of a generic function that works for any slice type and returns the same named type.`, a: `<code>func Filter[S ~[]E, E any](s S, keep func(E) bool) S</code>. <code>S ~[]E</code> accepts <code>[]int</code> as well as <code>type IDs []int</code>, and returning <code>S</code> keeps <code>IDs</code> for the caller (returning <code>[]E</code> would lose the named type and its methods). The book shows the long form <code>[S interface{ ~[]E }, E interface{}]</code> and the short form <code>[S ~[]E, E any]</code>; they are equivalent.`, diff: `hard` },
      { q: `When would you choose an interface over a generic function?`, a: `When you are abstracting <strong>behaviour</strong> rather than data types: <code>io.Reader</code>, <code>io.Writer</code>, <code>sort.Interface</code>, <code>error</code>. Interfaces allow heterogeneous values in one collection (a <code>[]Shape</code> holding circles and squares) and dynamic dispatch, which generics don't (a <code>List[T]</code> holds one T). Choose generics when the code is the same for many types and needs operators or static result types: containers, numeric helpers, <code>Map</code>/<code>Filter</code>.`, diff: `easy` }
    ],
    labs: [`c04Constraints`, `c04Copies`, `c04SlicesLab`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch5`, part: 2, number: 5,
    title: `Reflection and Interfaces`,
    overview: `How Go handles types at run time and how it expresses behaviour. The chapter starts with <strong>reflection</strong> (<code>reflect.TypeOf</code>, <code>reflect.ValueOf</code>, <code>Kind</code>, walking and modifying struct fields) and its three drawbacks. It then covers <strong>type methods</strong> with value and pointer receivers (the 2x2 matrix example), <strong>interfaces</strong> (implicit satisfaction, composition, <code>sort.Interface</code>, the empty interface), <strong>type assertions and type switches</strong>, <code>map[string]interface{}</code> for JSON of unknown schema, and custom <code>error</code> types. It finishes with how Go mimics <strong>object-oriented programming</strong> through embedding and composition, compares <strong>interfaces vs generics</strong> and <strong>reflection vs generics</strong>, and extends the statistics app to sort datasets by mean.`,
    concepts: [
      { term: `Reflection and its three drawbacks`, def: `The <code>reflect</code> package lets a program inspect (and sometimes modify) the type and structure of a value at <strong>run time</strong>: field names, types, kinds, tags and methods. It is how <code>fmt.Println</code>, <code>encoding/json</code>, <code>encoding/xml</code> and ORMs work with types they have never seen.`, why: `The book lists three drawbacks. 1) It makes code <strong>hard to read and maintain</strong>. 2) It is <strong>slower</strong> than code for a concrete type and harder for tools to analyze. 3) Errors appear as <strong>run-time panics</strong>, possibly long after release, instead of at build time. Reserve it for serialization, mapping structs to database tables and code generation; generics now cover many of the old "work with any type" cases.` },
      { term: `reflect.Type, reflect.Value and Kind`, def: `<code>reflect.TypeOf(x)</code> returns a <code>reflect.Type</code> (the static type, such as <code>main.Record</code>). <code>reflect.ValueOf(x)</code> returns a <code>reflect.Value</code> that holds the value. <code>Kind()</code> reports the underlying category: <code>reflect.Struct</code>, <code>Int</code>, <code>Slice</code>, <code>Ptr</code>...`, why: `Type and Kind are different: <code>type Celsius float64</code> has Type <code>main.Celsius</code> but Kind <code>float64</code>. Code usually switches on Kind. For structs, <code>NumField()</code>, <code>Field(i)</code> and <code>Type().Field(i).Name</code> let you walk the fields.`, demo: `c05Reflect` },
      { term: `Modifying values with reflection`, def: `To change a value you need an <strong>addressable, settable</strong> <code>reflect.Value</code>: pass a pointer and call <code>Elem()</code>: <code>r := reflect.ValueOf(&amp;A).Elem()</code>. Then <code>r.Field(i).SetInt(-100)</code> or <code>SetString("Changed!")</code> works.`, why: `<code>reflect.ValueOf(A)</code> holds a copy, so <code>CanSet()</code> is false and setting panics with <em>using unaddressable value</em>. Unexported fields can be read but never set. Calling the wrong setter for the Kind also panics.`, demo: `c05Reflect` },
      { term: `Type methods`, def: `A method is a function with a <strong>receiver</strong>: <code>func (a *ar2x2) Add(b ar2x2)</code>. It is called with selector syntax, <code>a.Add(b)</code>. Under the hood the compiler turns it into a regular function whose first parameter is the receiver.`, why: `Methods give Go its object-like feel and are required for interfaces. Method names on a struct must not clash with its field names.`, ex: `The book's 2x2 matrix type <code>type ar2x2 [2][2]int</code> has a regular <code>Add(a, b) ar2x2</code> function and pointer methods <code>Add</code>, <code>Subtract</code> and <code>Multiply</code> that store the result in the receiver. Inputs <code>[[1 2] [0 0]]</code> and <code>[[2 1] [1 1]]</code> give <code>a*b = [[4 6] [0 0]]</code> and <code>b*a = [[2 4] [1 2]]</code>, so matrix multiplication is not commutative. (The book's in-place Multiply also overwrites <code>a[0][0]</code> before reusing it, a subtle aliasing bug worth spotting.)` },
      { term: `Value vs pointer receivers`, def: `A <strong>value receiver</strong> works on a copy, so changes are lost. A <strong>pointer receiver</strong> works on the original value. Go adds <code>&amp;</code> or <code>*</code> automatically when you call a method on an addressable variable.`, why: `Use pointer receivers to mutate state, for large structs (to avoid copying), and when the type contains a mutex. Use value receivers for small, immutable types. Keep receivers consistent within a type.`, demo: `c05MethodSets` },
      { term: `Method sets`, def: `The method set of <code>T</code> contains its value-receiver methods. The method set of <code>*T</code> contains <strong>both</strong> value- and pointer-receiver methods. A type satisfies an interface only if the interface's methods are all in its method set.`, why: `This is the source of the classic error <em>Counter does not implement Incrementer (method Inc has pointer receiver)</em>: store <code>&amp;c</code> in the interface, not <code>c</code>. A value held inside an interface or a map isn't addressable, so Go can't take its address for you.`, demo: `c05MethodSets` },
      { term: `Interfaces`, def: `An interface type is a set of method signatures. A type satisfies it <strong>implicitly</strong>, just by having the methods; there is no <code>implements</code> keyword. An interface value stores a (dynamic type, dynamic value) pair.`, why: `Implicit satisfaction decouples packages: you can define a small interface next to the code that consumes it. Small interfaces (<code>io.Reader</code> has one method) are the most reusable. Don't design interfaces up front; extract them once a shared behaviour appears.`, ex: `<code>type Shape2D interface { Perimeter() float64 }</code>. <code>circle</code> satisfies it by defining <code>Perimeter()</code>. <code>_, ok := interface{}(a).(Shape2D)</code> checks it at run time.` },
      { term: `Interface composition`, def: `Interfaces can embed other interfaces: <code>type IntC interface { IntA; IntB }</code>. A type that satisfies IntA and IntB automatically satisfies IntC, and an IntC value can be used wherever an IntA or IntB is expected.`, why: `This is how the standard library builds <code>io.ReadWriter</code>, <code>io.ReadCloser</code> and others. Avoid combining interfaces that declare methods with the same name and different signatures.` },
      { term: `sort.Interface`, def: `Implement <code>Len() int</code>, <code>Less(i, j int) bool</code> and <code>Swap(i, j int)</code> on a slice type (for example <code>type Personslice []Person</code>), then call <code>sort.Sort(Personslice(data))</code>.`, why: `Once implemented, <code>sort.Sort(sort.Reverse(x))</code> works with no extra code, because Reverse wraps your Less. The stats app sorts <code>DFslice</code> by mean value. New code often uses <code>slices.SortFunc(s, func(a, b T) int { return cmp.Compare(a.X, b.X) })</code> instead.` },
      { term: `The empty interface (any)`, def: `<code>interface{}</code> (alias <code>any</code>) has no methods, so every type satisfies it. <code>func Print(s interface{})</code> accepts an S1, an S2, an int or a string.`, why: `It gives up compile-time guarantees. Before you do anything type-specific with the value (multiply it, use <code>%d</code> with it), find out its dynamic type with an assertion or type switch, or use generics with a constraint.` },
      { term: `Type assertions`, def: `<code>x.(T)</code> extracts the concrete value of type T from interface value x. The comma-ok form <code>v, ok := x.(T)</code> never panics; the single-value form panics if x doesn't hold a T: <em>interface conversion: interface {} is int, not bool</em>.`, why: `If T is an interface type, the assertion checks whether x's dynamic type implements T (this is how <code>isFileEmpty</code> recovers an <code>emptyFile</code> from an <code>error</code>). Asserting on a nil interface fails as well.`, demo: `c05TypeSwitch` },
      { term: `Type switches`, def: `<code>switch v := x.(type) { case Secret: ... case Entry: ... default: ... }</code> picks a branch by x's dynamic type. In a single-type case, v has that type; in <code>default</code> or multi-type cases, v keeps the interface type.`, why: `<strong>Order matters</strong>: the first matching case wins, so put concrete types and narrow interfaces before broad interfaces such as <code>error</code>. <code>case nil</code> matches a nil interface.`, demo: `c05TypeSwitch` },
      { term: `map[string]interface{} and JSON`, def: `When JSON arrives with an unknown schema, <code>json.Unmarshal</code> into a <code>map[string]interface{}</code> keeps every value with its JSON type: objects become <code>map[string]interface{}</code>, arrays <code>[]interface{}</code>, numbers <code>float64</code>, plus string, bool and nil.`, why: `You keep the original data types, unlike <code>map[string]string</code>. Walk the map recursively with a type switch, as the book's <code>exploreMap</code> and <code>typeSwitch</code> do. Remember that all JSON numbers decode as float64 (-456 becomes float64) and that map iteration order is random.` },
      { term: `Custom error types`, def: `<code>error</code> is just <code>interface { Error() string }</code>. Any type with that method is an error, such as the book's <code>emptyFile{Ended bool; Read int}</code>, which tells an empty file apart from a fully read one.`, why: `Use a custom type when callers need more context than a string. Recover it with a type assertion, or better, <code>errors.As(err, &amp;target)</code>, which also unwraps wrapped errors. Check the specific case before the generic <code>err != nil</code>.` },
      { term: `OOP in Go`, def: `Go isn't object-oriented, but it can mimic it: structs with methods act like objects, interfaces give polymorphism, uppercase/lowercase names give package-level encapsulation, and <strong>embedding</strong> gives composition. <code>type compose struct { field1 int; a }</code> promotes a's fields, so <code>iComp.XX</code> works.`, why: `There is no inheritance and no subtype relation: a <code>compose</code> is not an <code>a</code>. Promoted methods are called on the embedded value. Prefer composing small types and interfaces over building hierarchies.` },
      { term: `Interfaces vs generics vs reflection`, def: `<strong>Interfaces</strong> describe behaviour and dispatch at run time. <strong>Generics</strong> let one algorithm work on many types, checked at compile time. <strong>Reflection</strong> explores arbitrary types at run time with no compile-time checks.`, why: `The book's comparison: incrementing via <code>interface{}</code> needs a type switch case per type and accepts anything; <code>PrintNumeric[T Numeric]</code> needs no per-type code. Printing a slice with reflection needs a Kind check and an index loop; <code>PrintSlice[T any]</code> is shorter and the compiler enforces "slice only". Reflection still wins for serialization and fully dynamic types.` }
    ],
    cheatsheet: [
      { title: `Method sets and interface satisfaction`, type: `table`, headers: [`Receiver of M`, `Call on addressable <code>v</code> (T)`, `Call on <code>p</code> (*T)`, `T satisfies I{M}?`, `*T satisfies I{M}?`], rows: [
        [`<code>func (t T) M()</code>`, `Yes, on a copy`, `Yes, <code>(*p).M()</code>, still a copy`, `Yes`, `Yes`],
        [`<code>func (t *T) M()</code>`, `Yes, Go uses <code>(&amp;v).M()</code>`, `Yes, mutates`, `<strong>No</strong>`, `Yes`]
      ], note: `Non-addressable operands (composite literals, map elements, values stored in interfaces) can't call pointer methods: <em>cannot call pointer method M on T</em>.` },
      { title: `Reflection essentials`, type: `table`, headers: [`Call`, `Returns / does`], rows: [
        [`<code>reflect.TypeOf(x)</code>`, `reflect.Type, e.g. <code>main.Record</code>`],
        [`<code>reflect.ValueOf(x)</code>`, `reflect.Value holding a <em>copy</em> of x`],
        [`<code>reflect.ValueOf(&amp;x).Elem()</code>`, `Addressable Value: fields become settable`],
        [`<code>v.Kind()</code>`, `<code>reflect.Struct</code>, <code>Int</code>, <code>String</code>, <code>Slice</code>, <code>Ptr</code> ...`],
        [`<code>v.NumField()</code>, <code>v.Field(i)</code>`, `Struct fields (panics if Kind isn't Struct)`],
        [`<code>v.Type().Field(i).Name</code> / <code>.Tag</code>`, `Field name and struct tag`],
        [`<code>v.Field(i).Interface()</code>`, `Back to an <code>interface{}</code> (panics for unexported fields)`],
        [`<code>v.CanSet()</code>, <code>SetInt</code>, <code>SetString</code>`, `Modify; panics if not settable or the Kind is wrong`],
        [`<code>v.Len()</code>, <code>v.Index(i)</code>`, `Slices, arrays and strings`]
      ] },
      { title: `Assertions, switches, sort.Interface and errors`, type: `code`, body: `// Comma-ok assertion never panics
if n, ok := x.(int); ok {
    fmt.Println("int:", n+1)
}

// Type switch: first match wins, so narrow cases go first
switch v := x.(type) {
case nil:
    fmt.Println("nil interface")
case emptyFile: // concrete error type before the error interface
    fmt.Println("empty file, read", v.Read)
case error:
    fmt.Println("error:", v)
case int, int64:
    fmt.Printf("integer %v (v is still interface{})\n", v)
default:
    fmt.Printf("unsupported %T\n", v)
}

// sort.Interface on a named slice type
type ByMean []DataFile

func (a ByMean) Len() int           { return len(a) }
func (a ByMean) Less(i, j int) bool { return a[i].Mean < a[j].Mean }
func (a ByMean) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }

sort.Sort(ByMean(files))
sort.Sort(sort.Reverse(ByMean(files)))

// Compile-time check that *Counter implements Incrementer
var _ Incrementer = (*Counter)(nil)

// Custom error, recovered with errors.As (works through wrapping)
var ef emptyFile
if errors.As(err, &ef) && ef.Read == 0 {
    fmt.Println("file is empty")
}` },
      { title: `Interfaces vs generics vs reflection`, type: `table`, headers: [``, `Interfaces`, `Generics`, `Reflection`], rows: [
        [`Checked`, `Compile time (method set)`, `Compile time (constraint)`, `Run time only`],
        [`Best for`, `Behaviour: Reader, Writer, Shape`, `Same algorithm over many types`, `Unknown types: JSON, ORMs, fmt`],
        [`Mixed types in one slice`, `Yes (<code>[]Shape</code>)`, `No (one T per instance)`, `Yes`],
        [`Cost`, `Dynamic dispatch, boxing`, `Longer builds; dictionary calls`, `Slow, verbose, panics`],
        [`Book example`, `<code>Print(s interface{})</code> + type switch`, `<code>PrintNumeric[T Numeric]</code>`, `<code>PrintReflection</code> with <code>reflect.Slice</code>`]
      ] }
    ],
    interview: [
      { q: `How does Go decide that a type implements an interface?`, a: `Implicitly and statically: if the type's <strong>method set</strong> contains every method of the interface with matching signatures, it implements the interface. There is no <code>implements</code> declaration. The check happens at compile time wherever a value is assigned to an interface type, and at run time for type assertions. To force a compile-time check, write <code>var _ io.Writer = (*MyWriter)(nil)</code>.`, diff: `easy` },
      { q: `Why does <code>var i Incrementer = c</code> fail when <code>Inc</code> has a pointer receiver, even though <code>c.Inc()</code> compiles?`, a: `<code>c.Inc()</code> is shorthand: c is an addressable variable, so the compiler rewrites it to <code>(&amp;c).Inc()</code>. Interface satisfaction uses method sets, and the method set of <code>Counter</code> contains only value-receiver methods. Pointer methods belong to <code>*Counter</code>. A value copied into an interface isn't addressable, so Go can't take its address for you. Fix it with <code>var i Incrementer = &amp;c</code>. The error reads "Counter does not implement Incrementer (method Inc has pointer receiver)".`, diff: `med` },
      { q: `When do you choose a pointer receiver?`, a: `When the method must modify the receiver; when the struct is large and copying it on every call is wasteful; when the type contains something that must not be copied (<code>sync.Mutex</code>, a buffer); and for consistency, because if some methods need pointers, make them all pointers. Value receivers suit small immutable values (a 2D point, <code>time.Time</code>) and are safe to call concurrently on copies.`, diff: `easy` },
      { q: `What is the nil interface gotcha?`, a: `An interface value is nil only if both its dynamic type and its value are nil. If a function returns <code>error</code> but internally returns a nil <code>*MyErr</code>, the interface holds (type *MyErr, value nil) and <code>err != nil</code> is <strong>true</strong>. Return a literal <code>nil</code> for "no error", not a typed nil pointer.`, diff: `hard` },
      { q: `Single-value vs comma-ok type assertion: what happens on failure?`, a: `<code>v := x.(T)</code> panics with "interface conversion: interface {} is int, not bool" if x doesn't hold a T (or is nil). <code>v, ok := x.(T)</code> never panics: on failure ok is false and v is T's zero value. Use the single-value form only when a failure is a programming error. The book's <code>assertions.go</code> shows both, including the panic on <code>anInt.(bool)</code>.`, diff: `easy` },
      { q: `In a type switch, why does case order matter? Give an example.`, a: `The first case that matches wins. Interface cases match any dynamic type that implements them. If <code>case error:</code> comes before <code>case emptyFile:</code>, an <code>emptyFile</code> value is handled by the generic error branch and the specific branch is unreachable. The compiler doesn't warn about this because the types are different. Order cases from most specific to most general, as the book advises for its <code>isFileEmpty</code> checks.`, diff: `med` },
      { q: `How do you modify a struct field with reflection, and what can go wrong?`, a: `Pass a pointer and dereference it: <code>v := reflect.ValueOf(&amp;A).Elem()</code>, then <code>v.Field(i).SetInt(-100)</code>. Failure modes, all run-time panics: using <code>reflect.ValueOf(A)</code> (a copy, so not settable: "using unaddressable value"), setting an unexported field ("using value obtained using unexported field"), calling a setter that doesn't match the Kind (SetInt on a string field), or calling <code>NumField</code> on a pointer Value without <code>Elem()</code>. Check <code>CanSet()</code> and <code>Kind()</code> first.`, diff: `med` },
      { q: `What are reflect.Type and reflect.Kind, and how do they differ?`, a: `<code>Type</code> is the full static type, including its name and package (<code>main.Record</code>, <code>main.Celsius</code>, <code>[]int</code>). <code>Kind</code> is the category of the underlying type (<code>reflect.Struct</code>, <code>reflect.Float64</code>, <code>reflect.Slice</code>). <code>type Celsius float64</code> has Type main.Celsius and Kind Float64. Generic reflective code (an encoder, a walker) usually switches on Kind; type-specific handling compares Types.`, diff: `med` },
      { q: `How does Go do OOP without classes or inheritance?`, a: `Structs plus methods act as objects; interfaces give polymorphism (any type with the methods can be used); exported vs unexported identifiers give encapsulation at the package level; and <strong>embedding</strong> gives composition: an embedded struct's fields and methods are promoted, as with <code>iComp.XX</code> in the book's <code>objO.go</code>. There is no subtype relation, so a struct that embeds <code>a</code> is not an <code>a</code> and can't be passed where an <code>a</code> is required. Only interfaces give substitutability.`, diff: `med` },
      { q: `Reflection vs generics: when is reflection still the right tool?`, a: `Generics cover algorithms over types known at compile time, with less code and compile-time checks (compare the book's <code>PrintSlice[T any]</code> with <code>PrintReflection</code>). Reflection is still needed when the structure itself is only known at run time: JSON, XML and protobuf (un)marshaling, reading struct tags, mapping structs to database columns, generic deep-equal or deep-copy, dependency-injection containers, and tools like <code>fmt</code>. Expect slower code, more verbose code and run-time panics instead of compile errors.`, diff: `hard` }
    ],
    labs: [`c05MethodSets`, `c05TypeSwitch`, `c05Reflect`]
  },

  // ------------------------------------------------------------------
  {
    id: `ch6`, part: 2, number: 6,
    title: `Go Packages and Functions`,
    overview: `How Go code is organized and shipped, and what functions can do. The chapter covers <strong>packages</strong> and the uppercase/lowercase visibility rule, <code>go get</code> vs <code>go install</code>, and then functions in depth: multiple and <strong>named return values</strong>, <strong>anonymous functions and closures</strong>, functions as parameters (<code>sort.Slice</code>) and return values, <strong>variadic functions</strong>, and <strong>defer</strong> with its LIFO order and closure pitfalls. After a short Big O detour it builds a real package, <strong>sqlite06</strong>, on <code>database/sql</code> and go-sqlite3, explaining <code>init()</code> and <strong>package initialization order</strong> along the way. It closes with <strong>modules</strong> and semantic versioning, rules for good packages, <strong>documentation</strong> with <code>go doc</code>, multi-module <strong>workspaces</strong> (<code>go.work</code>), and stamping binaries with a Git commit through <code>-ldflags -X</code>.`,
    concepts: [
      { term: `Packages and visibility`, def: `Every Go file starts with <code>package name</code>. Identifiers that start with an <strong>uppercase</strong> letter (functions, types, variables, constants, struct fields) are exported; lowercase ones are private to the package. Package names themselves are conventionally lowercase.`, why: `This is Go's only access modifier, which is why it's <code>fmt.Println</code>, not <code>fmt.println</code>. A struct can mix public and private fields. Only <code>package main</code> builds an executable; <code>go run aPackage.go</code> on a library fails with "cannot run non-main package".` },
      { term: `go get, go install and ~/go`, def: `In module mode, <code>go get pkg@version</code> adds or upgrades a dependency in <code>go.mod</code>, and <code>go install pkg@version</code> builds and installs a binary into <code>~/go/bin</code>. Module sources are cached under <code>~/go/pkg/mod</code>. Most projects simply run <code>go mod init</code> and <code>go mod tidy</code>.`, why: `Since Go 1.16, <code>go install</code> is the way to install tools; using <code>go get</code> to build binaries is deprecated. The old GOPATH layout (<code>~/go/src</code>, <code>pkg</code>, <code>bin</code>) is still referenced, but modules can live anywhere. <code>go get -u</code> upgrades and <code>-v</code> shows details.` },
      { term: `Multiple and named return values`, def: `Functions can return several values, <code>func doubleSquare(x int) (int, int)</code>, and can <strong>name</strong> them: <code>func minMax(x, y int) (min, max int)</code>. Named results are variables initialized to their zero values, and a bare <code>return</code> returns their current values.`, why: `More than about three results is a sign you should return a struct. Named results document the meaning of each value and let <code>defer</code> change what is returned. Bare returns hurt readability in long functions.` },
      { term: `Anonymous functions and closures`, def: `A function literal (<code>func(param int) int { return param * param }</code>) can be assigned to a variable, passed or returned. A <strong>closure</strong> is a function literal that captures variables from its surrounding scope by reference, so it can keep and update state.`, why: `Keep them short and local; anything bigger should be a named function. Captured variables are shared, not copied, which is the root of the loop-variable bug the defer section shows.`, demo: `c06Closures` },
      { term: `First-class functions: parameters and results`, def: `Functions are values with types like <code>func(i, j int) bool</code>. They can be passed in, as with <code>sort.Slice(data, func(i, j int) bool { return data[i].Grade &lt; data[j].Grade })</code> (and <code>sort.SliceIsSorted</code> to check the order), or returned, as with <code>func funRet(i int) func(int) int</code>, which hands back a different anonymous function depending on i.`, why: `This enables comparators, factories, middleware (<code>func(http.Handler) http.Handler</code>), generators and memoization. <code>%T</code> prints the function type <code>func(int) int</code>. <code>sort.Slice</code> isn't stable; use <code>sort.SliceStable</code> or <code>slices.SortStableFunc</code> when equal elements must keep their order.`, ex: `<code>i := funRet(10)</code>, <code>j := funRet(-4)</code>: <code>i(10)</code> = 100 and <code>j(10)</code> = -20. Same input, different functions.`, demo: `c06Closures` },
      { term: `Variadic functions`, def: `The <strong>pack operator</strong> <code>...T</code> on the last parameter accepts zero or more T values, which the function sees as a <code>[]T</code>. A caller can pass a slice with the <strong>unpack operator</strong>: <code>addFloats("msg", s...)</code>.`, why: `Only one variadic parameter is allowed, and it must be last. With <code>s...</code> the function receives the caller's slice itself, not a copy: the book's <code>s[0] = -1000</code> changes the caller's slice. You can't pass a <code>[]string</code> as <code>...interface{}</code>; you must convert it into a <code>[]interface{}</code> first.` },
      { term: `defer`, def: `<code>defer f(args)</code> schedules f to run when the surrounding function returns, whether it returns normally or panics. Deferred calls run in <strong>LIFO</strong> order, and their <strong>arguments are evaluated at the defer statement</strong>, not when the call runs.`, why: `It keeps cleanup next to acquisition (<code>defer f.Close()</code>, <code>defer mu.Unlock()</code>, <code>defer rows.Close()</code>). Deferred closures can read and change <strong>named results</strong>, which is how <code>recover</code> turns a panic into an error. Don't defer inside a long loop: nothing runs until the function returns.`, demo: `c06Defer` },
      { term: `Loop variables, closures and defer (Go 1.22)`, def: `The book's <code>d2()</code> defers <code>func() { fmt.Print(i, " ") }()</code> inside <code>for i := 3; i &gt; 0; i--</code>. Before Go 1.22 all three closures share one <code>i</code>, which is 0 when they run, so the output is <code>0 0 0</code>. Since Go 1.22 (with <code>go 1.22</code> in go.mod) each iteration has its own <code>i</code>, so the output is <code>1 2 3</code>.`, why: `The clearest style is the book's <code>d3()</code>: pass the value as an argument, <code>defer func(n int) { ... }(i)</code>, because arguments are evaluated immediately and it works the same in every Go version.`, demo: `c06Defer` },
      { term: `init() functions`, def: `Each package may define any number of <code>init()</code> functions (no parameters, no results, can't be called by your code). They run automatically, once per package, after the package-level variables are initialized and before <code>main()</code>. Several per file run in source order.`, why: `Reasonable uses: checking that required resources exist, registering drivers or codecs, preparing files and directories. Avoid heavy work or hidden global side effects in libraries, because importers can't control or skip them.`, demo: `c06InitOrder` },
      { term: `Initialization order`, def: `Dependencies are initialized before the packages that import them: for main &rarr; A &rarr; B, B's variables and init()s run first, then A's, then main's, then <code>main()</code>. Each package is initialized exactly once, even if main also imports B directly. Within a package, variables are initialized in dependency order.`, why: `It explains why a driver's init() has already run when your main starts. Since Go 1.21 the spec fixes the order between independent packages: repeatedly initialize the first package, sorted by import path, whose imports are all done.`, demo: `c06InitOrder` },
      { term: `database/sql, drivers and the blank import`, def: `<code>database/sql</code> is a generic database API; each database needs a driver. <code>import _ "github.com/mattn/go-sqlite3"</code> imports the driver only for its <code>init()</code>, which calls <code>sql.Register("sqlite3", ...)</code>. Then <code>sql.Open("sqlite3", "test.db")</code> works.`, why: `<code>QueryRow(...).Scan(&amp;v)</code> reads at most one row, <code>Query</code> returns <code>*sql.Rows</code> to iterate with <code>Next()</code>, and <code>Exec</code> runs INSERT, UPDATE and DELETE. Always <code>defer rows.Close()</code>, but only after checking the error. go-sqlite3 uses cgo, so it needs a C compiler.` },
      { term: `Designing the sqlite06 package`, def: `The package wraps a two-table schema (Users: ID, Username; Userdata: UserID, Name, Surname, Description) behind exported <code>AddUser</code>, <code>DeleteUser</code>, <code>UpdateUser</code>, <code>ListUsers</code>, a single <code>Userdata</code> struct and an exported <code>Filename</code> variable. The helpers <code>openConnection</code> and <code>exists</code> are private.`, why: `A package gives the team one documented way to use the database, hides schema changes, and avoids handing out full database access. Use <code>?</code> placeholders for all values. The book's <code>exists()</code> and <code>DeleteUser()</code> build SQL with <code>fmt.Sprintf</code>, which allows <strong>SQL injection</strong>; pass the values as arguments to Query/Exec instead. Multi-table writes belong in a transaction (<code>db.Begin</code>).` },
      { term: `Modules and semantic versioning`, def: `A <strong>module</strong> is a versioned collection of one or more packages, defined by <code>go.mod</code> (module path, Go version, requirements) and locked by <code>go.sum</code>. Versions follow SemVer <code>vMAJOR.MINOR.PATCH</code>: major for breaking changes, minor for compatible features, patch for fixes.`, why: `Starting with v2, the major version is part of the import path (<code>example.com/mod/v2</code>), so v1 and v2 can coexist in one build. Untagged commits get pseudo-versions such as <code>v0.0.0-20230817125241-55d77b17637d</code>. Modules arrived in Go 1.11 and were finalized in 1.13.` },
      { term: `Documentation and go doc`, def: `A comment placed directly before a declaration, with no blank line, is its documentation. Start with the identifier's name; put a package comment before the <code>package</code> clause. Indented lines render as code, and <code>BUG(who):</code> notes are collected separately. Read the result with <code>go doc pkg</code> or <code>go doc pkg.Func</code>.`, why: `Only exported identifiers appear in the generated documentation. Good docs plus examples and tests are what make a package trustworthy (see the book's "creating better packages" rules).` },
      { term: `Workspaces (go.work)`, def: `<code>go work init</code> and <code>go work use ./util ./sqlite06</code> create a <code>go.work</code> file that builds several local modules together, so <code>./util</code> uses your local copy of sqlite06 instead of the published version. A <code>replace</code> directive in go.work can redirect a module path explicitly.`, why: `You can develop a library and its consumer side by side without editing go.mod <code>replace</code> lines that you might accidentally commit. go.work is usually kept out of version control.` },
      { term: `Versioning binaries with -ldflags`, def: `Declare <code>var VERSION string</code> in main, then build with <code>go build -ldflags "-X main.VERSION=$(git rev-list -1 HEAD)"</code>. The linker overwrites the variable at build time, so <code>./gitVersion version</code> prints the commit hash.`, why: `This is how docker and kubectl report their Git commit. <code>-X</code> only works on package-level <strong>string variables</strong> (not constants, not variables initialized by a function call), and you must use the full import path for packages other than main. Go 1.18+ also embeds VCS info that <code>debug.ReadBuildInfo()</code> can read.` }
    ],
    cheatsheet: [
      { title: `Package initialization order`, type: `list`, items: [
        `Start from <code>main</code> and initialize its imports first, recursively (depth first).`,
        `For each package: package-level <strong>variables</strong> (in dependency order), then every <code>init()</code> (in file order, then source order).`,
        `Each package is initialized <strong>once</strong>, even if many packages import it.`,
        `main's variables, then main's <code>init()</code>s, then <code>main()</code>.`,
        `<code>import _ "pkg"</code> runs pkg's init() only (driver registration).`,
        `Go 1.21+: between independent packages, the one with the lowest import path goes first.`
      ] },
      { title: `defer rules`, type: `table`, headers: [`Code`, `Prints / returns`, `Why`], rows: [
        [`<code>for i := 3; i &gt; 0; i-- { defer fmt.Print(i) }</code>`, `1 2 3`, `Args evaluated at defer time; run LIFO`],
        [`<code>defer func() { fmt.Print(i) }()</code> in that loop`, `0 0 0 (Go &le; 1.21) / 1 2 3 (Go 1.22+)`, `Closure captures the variable, not the value`],
        [`<code>defer func(n int) { fmt.Print(n) }(i)</code>`, `1 2 3`, `Value passed explicitly; always safe`],
        [`<code>func f() (n int) { defer func() { n *= 2 }(); return 4 }</code>`, `8`, `return sets n, then defers run`],
        [`<code>func g() int { n := 4; defer func() { n *= 2 }(); return n }</code>`, `4`, `Result already copied; defer edits a local`]
      ] },
      { title: `Functions, closures, variadics and defer`, type: `code`, body: `// Named results + defer: annotate any returned error
func readConfig(path string) (cfg Config, err error) {
    f, err := os.Open(path)
    if err != nil {
        return cfg, err
    }
    defer func() {
        if cerr := f.Close(); cerr != nil && err == nil {
            err = cerr
        }
    }()
    err = json.NewDecoder(f).Decode(&cfg)
    return
}

// A closure keeps private state
func counter() func() int {
    c := 0
    return func() int { c++; return c }
}

// Variadic: pack ...float64, unpack with s...
func addFloats(msg string, s ...float64) float64 {
    sum := 0.0
    for _, v := range s {
        sum += v
    }
    return sum
}

// Parameterized SQL: never fmt.Sprintf values into a query
func exists(db *sql.DB, username string) (int, error) {
    var id int
    err := db.QueryRow("SELECT ID FROM Users WHERE Username = ?",
        strings.ToLower(username)).Scan(&id)
    if errors.Is(err, sql.ErrNoRows) {
        return -1, nil
    }
    return id, err
}

func main() {
    next := counter()
    next(); next()
    fmt.Println(next())                     // 3
    fmt.Println(addFloats("sum", 1, 2, 3))  // 6
    s := []float64{1.1, 2.12}
    fmt.Println(addFloats("sum", s...))
}` },
      { title: `Modules, workspaces, docs and versioning`, type: `table`, headers: [`Command`, `Purpose`], rows: [
        [`<code>go mod init example.com/app</code>`, `Create go.mod for a new module`],
        [`<code>go mod tidy</code>`, `Add missing and remove unused requirements, update go.sum`],
        [`<code>go get example.com/lib@v1.4.2</code>`, `Add or upgrade a dependency (<code>-u</code> to update)`],
        [`<code>go install example.com/tool@latest</code>`, `Build and install a binary into ~/go/bin`],
        [`<code>go work init</code>, <code>go work use ./a ./b</code>`, `Multi-module workspace in go.work`],
        [`<code>go doc pkg</code>, <code>go doc pkg.Func</code>`, `Show documentation for exported identifiers`],
        [`<code>go build -ldflags "-X main.VERSION=$V"</code>`, `Stamp a string variable at link time`],
        [`<code>go build -o x.a pkg.go</code>`, `Compile a non-main package to check it (ar archive)`]
      ], note: `SemVer: v1.2.3 = major.minor.patch. From v2 on, the major version is part of the import path: <code>example.com/lib/v2</code>.` }
    ],
    interview: [
      { q: `How does Go handle visibility? Is there public/private/protected?`, a: `There is one rule: an identifier that starts with an uppercase letter is exported from its package; anything else is visible only inside the package (all files of the package share access). It applies to functions, types, variables, constants, methods and struct fields, so a struct can have mixed visibility. There is no protected and no per-type privacy. Package names are lowercase by convention. Additionally, packages under an <code>internal/</code> directory can only be imported by code rooted at the parent of that directory.`, diff: `easy` },
      { q: `In what order are deferred calls executed, and when are their arguments evaluated?`, a: `LIFO: the last <code>defer</code> registered runs first, when the surrounding function returns (normally or by panicking). The function value and its arguments are evaluated <strong>when the defer statement executes</strong>. So <code>for i := 3; i &gt; 0; i-- { defer fmt.Print(i) }</code> prints 1 2 3, because the values 3, 2, 1 are captured and then run in reverse. A deferred closure with no parameters reads variables when it runs, which is why the book's d2 printed 0 0 0 before Go 1.22.`, diff: `easy` },
      { q: `Can a deferred function change a function's return value?`, a: `Only through <strong>named result parameters</strong>. <code>return x</code> first assigns x to the result variables, then runs deferred calls, then returns. A deferred closure that modifies a named result changes what the caller receives: <code>func f() (n int) { defer func() { n *= 2 }(); return 4 }</code> returns 8. With an unnamed result, the value is already copied out, so changing a local has no effect. This is the mechanism behind <code>defer func() { if r := recover(); r != nil { err = fmt.Errorf(...) } }()</code>.`, diff: `med` },
      { q: `What changed about loop variables in Go 1.22, and how does it affect closures?`, a: `Before 1.22, a <code>for</code> loop declared its variable once, and every iteration reused it. Closures and goroutines that captured it all saw its final value (the book's d2 printed 0 0 0). Since Go 1.22, modules that declare <code>go 1.22</code> or later get a new variable per iteration, so each closure captures its own copy (1 2 3). The fix that works in every version is to pass the value as an argument, as in d3, or to copy it (<code>i := i</code>).`, diff: `med` },
      { q: `Describe Go's package initialization order.`, a: `Imported packages are initialized before the packages that import them. Within a package, package-level variables are initialized first (in dependency order, not necessarily textual order), then all <code>init()</code> functions in the order the files are presented to the compiler and in source order within each file. Each package is initialized exactly once, no matter how many importers it has. After all imports, main's variables and init()s run, then <code>main()</code>. For main &rarr; A &rarr; B: B vars, B init, A vars, A init, main vars, main init, main().`, diff: `med` },
      { q: `Why does code import a database driver with <code>_</code>?`, a: `The blank identifier imports a package only for its side effects, which means its <code>init()</code>. go-sqlite3's init calls <code>sql.Register("sqlite3", &amp;SQLiteDriver{})</code>, so <code>sql.Open("sqlite3", ...)</code> can find it, while your code only uses the generic <code>database/sql</code> API. Without the underscore, the compiler would reject the unused import. The same pattern registers image decoders (<code>_ "image/png"</code>) and pprof handlers (<code>_ "net/http/pprof"</code>).`, diff: `easy` },
      { q: `What's wrong with building SQL using <code>fmt.Sprintf("... WHERE Username = '%s'", username)</code>?`, a: `It is vulnerable to <strong>SQL injection</strong>: a username like <code>x' OR '1'='1</code> changes the query's meaning. It also breaks on legitimate quotes and stops the database from reusing query plans. Use placeholders and pass the values separately: <code>db.QueryRow("SELECT ID FROM Users WHERE Username = ?", username)</code> (<code>$1</code> on Postgres). The driver sends values as data, never as SQL. The book's <code>exists()</code> and <code>DeleteUser()</code> use Sprintf and should be rewritten this way. Also check the error before <code>defer rows.Close()</code>, and wrap the two-table insert or delete in a transaction.`, diff: `med` },
      { q: `Explain modules, semantic versioning and the major-version rule.`, a: `A module is a tree of packages with a <code>go.mod</code> that declares its path and its versioned requirements; <code>go.sum</code> records checksums. Versions are <code>vMAJOR.MINOR.PATCH</code>: patch releases fix bugs, minor releases add backward-compatible features, and major releases may break things. Go's <strong>import compatibility rule</strong> says that a package with the same import path must stay backward compatible, so v2+ modules put the major version in the path (<code>module example.com/lib/v2</code>). Go uses <strong>minimal version selection</strong>: it builds with the highest of the minimum versions required, not the newest available.`, diff: `hard` },
      { q: `When would you use a go.work workspace instead of a replace directive in go.mod?`, a: `When you are developing several modules together locally, for example changing the sqlite06 library and a utility that uses it. <code>go work use ./sqlite06 ./util</code> makes the build use the local copies without touching either go.mod, so you can't accidentally commit a <code>replace ../sqlite06</code> that breaks everyone else's builds. go.work is a local developer file and is normally not committed. A <code>replace</code> in go.mod is for permanent redirects that every consumer must get, such as a fork.`, diff: `hard` },
      { q: `How do you embed a version string or Git commit into a Go binary?`, a: `Declare <code>var VERSION string</code> (a package-level string variable, not a constant), then build with <code>go build -ldflags "-X main.VERSION=$(git rev-list -1 HEAD)"</code>. The linker overwrites the variable's initial value. For packages other than main, use the full path: <code>-X example.com/app/internal/build.Version=...</code>. Since Go 1.18 the toolchain also embeds VCS revision, time and dirty flag automatically, readable with <code>debug.ReadBuildInfo()</code> or <code>go version -m binary</code>.`, diff: `med` }
    ],
    labs: [`c06Defer`, `c06InitOrder`, `c06Closures`]
  }
);
