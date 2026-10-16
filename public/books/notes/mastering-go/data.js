// Mastering Go, 4th edition (Mihalis Tsoukalos, Packt 2024) - interactive notes data: book info.
// Chapters are pushed by data-part1.js ... data-part5.js.
window.DATA = {
  book: {
    title: `Mastering Go`,
    subtitle: `Chapter-wise interactive notes on Mihalis Tsoukalos' <em>Mastering Go, 4th edition</em> (Go 1.21 / 1.22). Every chapter has core concepts, hands-on labs (slice growth, iota, map iteration, generics constraints, method sets, defer order, the Go scheduler, channels and select, worker pools, mutexes vs atomics, context cancellation, HTTP timeouts, REST routing, table-driven tests, fuzzing, benchmarks, escape analysis, the tri-color GC...), a cheatsheet and interview Q&amp;A.`,
    storageKey: `mastering_go_notes_v1`,
    appId: `mastering-go-notes`,
    exportPrefix: `mastering-go-progress`,
    pillarsTitle: `Four ideas that run through the whole book`,
    takeawaysTitle: `Twelve takeaways to remember`,
    labsIntro: `Each lab is a small, self-contained simulator of an idea from the chapter, modelled on the book's own examples where it has them (the statistics application, which(1), the worker pool, the RESTful user server, the fuzzed string reverser). They mimic Go's behaviour in the browser, so sizes are toy-scale, but the rules are Go's. Labs reset when you leave the tab.`
  },
  parts: {
    1: `Language foundations`,
    2: `Types, abstractions and packages`,
    3: `Systems programming and concurrency`,
    4: `Networking and services`,
    5: `Quality, performance and the runtime`
  },
  fourQuestions: [
    { cls: `what`, q: `Simplicity`, text: `Go has a small, orthogonal feature set: one loop keyword, no inheritance, explicit errors, gofmt for style. Code is meant to be read and maintained by teams.`, answer: `Ch 1-3: variables, control flow, error values, slices, maps and structs.` },
    { cls: `where`, q: `Composition`, text: `Behaviour is attached to types with methods and abstracted with implicitly satisfied interfaces. Structs embed other types instead of inheriting from them; generics add type parameters where interfaces are not enough.`, answer: `Ch 4-6: generics and constraints, reflection, interfaces, packages and modules.` },
    { cls: `when`, q: `Concurrency`, text: `Goroutines are cheap, scheduler-managed functions. Share memory by communicating over channels, and fall back to mutexes, atomics and context when that fits better.`, answer: `Ch 8-11: the scheduler, channels, select, worker pools, context, servers and clients.` },
    { cls: `how`, q: `Tooling`, text: `The go command ships testing, benchmarking, fuzzing, profiling, tracing, vulnerability checks and cross-compilation. Measure before you optimize.`, answer: `Ch 12-15 and the appendix: tests, fuzzing, observability, benchmarks, memory and the GC.` }
  ],
  takeaways: [
    `Go is a <strong>compiled, statically typed, garbage-collected</strong> language. The <strong>go</strong> tool builds, runs, formats, tests and documents code; <strong>gofmt</strong> settles style debates.`,
    `Errors are <strong>values</strong>. Functions return <code>(result, error)</code>, callers check <code>err != nil</code>, and <code>errors.Is</code> / <code>errors.As</code> inspect wrapped errors.`,
    `A <strong>slice</strong> is a view over a backing array: pointer, length and capacity. <code>append</code> reuses the array until capacity runs out, then allocates a bigger one, so two slices may or may not share memory.`,
    `<strong>Maps</strong> are unordered hash tables. Reading a missing key returns the zero value; use the <em>comma ok</em> idiom to tell absent from zero. Writing to a <strong>nil map</strong> panics.`,
    `<strong>Generics</strong> (Go 1.18+) add type parameters with <strong>constraints</strong>; <code>~int</code> matches any type whose underlying type is int. Use generics for algorithms over many types, interfaces for behaviour.`,
    `Interfaces are satisfied <strong>implicitly</strong>. A type with a <strong>pointer receiver</strong> method only satisfies an interface through a pointer. Type assertions and type switches recover the concrete type.`,
    `<strong>defer</strong> runs in LIFO order when the function returns; its arguments are evaluated immediately. <code>init()</code> runs after package-level variables and before <code>main()</code>.`,
    `Everything is a file in UNIX: <strong>io.Reader</strong> and <strong>io.Writer</strong> are the universal interfaces, and <strong>bufio</strong> batches small reads and writes.`,
    `The Go scheduler multiplexes many <strong>goroutines (G)</strong> onto OS threads <strong>(M)</strong> through logical processors <strong>(P)</strong>, with GOMAXPROCS Ps and work stealing. Concurrency is not parallelism.`,
    `Channels synchronize: unbuffered sends block until received, <strong>select</strong> waits on many channels, closing signals completion, and a <strong>nil channel</strong> blocks forever. Use <strong>context</strong> for cancellation and deadlines.`,
    `Always set <strong>timeouts</strong> on HTTP servers and clients. REST maps resources to URLs and HTTP methods; handlers are tested with <strong>httptest</strong>.`,
    `Test with <strong>table-driven tests</strong>, fuzz with <code>go test -fuzz</code>, benchmark with <code>testing.B</code> and benchstat, profile with pprof, and remember that values escaping to the <strong>heap</strong> cost GC work.`
  ],
  chapters: []
};
