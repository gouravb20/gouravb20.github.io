// Deep dive: Chapter 8, Go concurrency. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>An API gateway calls a slow downstream service with a two-second timeout. The code starts a goroutine that sends the response on an unbuffered channel, and a <code>select</code> waits for either the response or <code>time.After(2 * time.Second)</code>. Under normal load everything looks fine. During a downstream slowdown, memory climbs steadily, and a goroutine dump shows tens of thousands of goroutines all stuck on the same line: a channel send.</p>
<p>Every timed-out request left its goroutine behind, blocked forever trying to send a result that nobody would ever receive. Goroutines are cheap, which makes it easy to forget that each one needs a way to finish. This chapter covers how the runtime schedules goroutines, the synchronization tools Go gives you (channels, <code>select</code>, <code>WaitGroup</code>, mutexes, atomics and <code>context</code>), and the patterns that keep concurrent code correct and leak-free.</p>`,
  sections: [
    {
      id: "goroutines-and-scheduler",
      title: "Goroutines and the G-M-P scheduler",
      kicker: "How it runs",
      blocks: [
        {
          type: "text",
          html: `<p>A process owns memory and resources; a thread is an operating-system-scheduled flow of execution inside it, with a fixed-size stack (often a megabyte or more reserved) and a kernel-mediated context switch. A <strong>goroutine</strong> is much lighter: it starts with a stack of a few kilobytes that grows and shrinks as needed, and switching between goroutines happens in user space, inside the Go runtime. That is why a Go program can run hundreds of thousands of goroutines where the same number of threads would exhaust the machine.</p>
<p>The runtime uses <strong>m:n scheduling</strong>: many goroutines run on a few threads. It has three kinds of entity. A <strong>G</strong> is a goroutine. An <strong>M</strong> (machine) is an OS thread. A <strong>P</strong> (processor) is a scheduling context with a local run queue of runnable Gs; an M must hold a P to execute Go code. The number of Ps is <code>GOMAXPROCS</code>, which defaults to the number of logical CPUs.</p>`,
        },
        {
          type: "diagram",
          title: "Gs, Ms and Ps",
          caption: "Each P has a local run queue and runs one G at a time on its M. An idle P first checks the global queue, then steals half of another P's local queue.",
          svg: `<svg viewBox="0 0 640 300" role="img" aria-label="Two logical processors, each with an OS thread and a local run queue, plus a global run queue; an idle processor steals work">
<defs><marker id="go8-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="210" y="16" width="220" height="40" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="320" y="41" text-anchor="middle" font-size="13">global run queue: G7 G8</text>
<rect x="30" y="80" width="260" height="160" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<text x="44" y="104" font-size="14" font-weight="700">P0</text>
<rect x="100" y="88" width="180" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="190" y="110" text-anchor="middle" font-size="12">M0 (thread) runs G1</text>
<text x="44" y="152" font-size="12" style="fill: var(--dg-muted)">local run queue</text>
<circle cx="70" cy="196" r="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<circle cx="120" cy="196" r="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<circle cx="170" cy="196" r="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-dasharray="4 3"/>
<circle cx="220" cy="196" r="18" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-dasharray="4 3"/>
<text x="70" y="201" text-anchor="middle" font-size="12">G2</text>
<text x="120" y="201" text-anchor="middle" font-size="12">G3</text>
<text x="170" y="201" text-anchor="middle" font-size="12">G4</text>
<text x="220" y="201" text-anchor="middle" font-size="12">G5</text>
<rect x="350" y="80" width="260" height="160" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-3)" stroke-width="2"/>
<text x="364" y="104" font-size="14" font-weight="700">P1</text>
<rect x="420" y="88" width="180" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="510" y="110" text-anchor="middle" font-size="12">M1 (thread) is idle</text>
<text x="364" y="152" font-size="12" style="fill: var(--dg-muted)">local run queue: empty</text>
<circle cx="420" cy="196" r="18" style="fill: none; stroke: var(--dg-2)" stroke-dasharray="4 3"/>
<circle cx="470" cy="196" r="18" style="fill: none; stroke: var(--dg-2)" stroke-dasharray="4 3"/>
<text x="420" y="201" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">G4</text>
<text x="470" y="201" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">G5</text>
<line x1="240" y1="196" x2="398" y2="196" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go8-arrow)"/>
<text x="320" y="186" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">steal</text>
<line x1="380" y1="56" x2="440" y2="86" style="stroke: var(--dg-muted)" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#go8-arrow)"/>
<text x="30" y="268" font-size="12" style="fill: var(--dg-muted)">GOMAXPROCS = number of Ps. An M must hold a P to run Go code.</text>
<text x="30" y="288" font-size="12" style="fill: var(--dg-muted)">A G in a blocking system call keeps its M; the P is handed to another M.</text>
</svg>`,
        },
        {
          type: "steps",
          title: "What the scheduler does",
          items: [
            "<code>go f()</code> creates a G and puts it on the current P's local run queue (up to 256 entries; overflow goes to the global queue).",
            "Each M with a P takes the next G from its local queue. For fairness, the global queue is also checked periodically.",
            "A P with nothing to do looks in the global queue, then at the network poller, then steals half of a random other P's local queue.",
            "A G that blocks on a channel or mutex is parked, and its M immediately runs another G. Network I/O also parks the G (via the netpoller) instead of blocking the thread.",
            "A G that enters a blocking system call takes its M with it; the runtime hands the P to another M (starting one if needed) so other goroutines keep running.",
            "Since Go 1.14, a G that runs for a long time without yielding (roughly 10ms) is preempted asynchronously, so a tight loop cannot starve the others.",
          ],
        },
        {
          type: "lab",
          id: "c08Scheduler",
          caption: "Spawn a batch of goroutines on P0 and watch the run queues, overflow into the global queue, work stealing, preemption and the hand-off when a G makes a blocking system call.",
        },
        {
          type: "text",
          html: `<p><strong>Concurrency is not parallelism.</strong> Concurrency is a way of structuring a program as independently executing parts; parallelism is actually running several of them at the same instant. A concurrent program runs correctly with <code>GOMAXPROCS=1</code>, just without parallel speed-up. You rarely need to change <code>GOMAXPROCS</code>; the classic exception was containers with CPU limits, where the default used to count the host's CPUs. Go 1.25 made the default respect container CPU limits on Linux.</p>`,
        },
      ],
    },
    {
      id: "waitgroups-and-channels",
      title: "WaitGroups and channels",
      kicker: "Coordination",
      blocks: [
        {
          type: "text",
          html: `<p><code>go f(x)</code> starts a goroutine and returns immediately; nothing about the order in which goroutines run is guaranteed. To wait for a group, use a <code>sync.WaitGroup</code>: call <code>wg.Add(1)</code> <em>before</em> the <code>go</code> statement, <code>defer wg.Done()</code> inside the goroutine, and <code>wg.Wait()</code> where you need them all finished. If <code>Add</code> ran inside the goroutine, <code>Wait</code> could run first, see a zero counter and return early. Too many <code>Done</code> calls make the counter negative and panic; too few leave <code>Wait</code> blocked forever. Go 1.25 added <code>wg.Go(f)</code>, which does the <code>Add</code> and <code>Done</code> for you.</p>
<p>A <strong>channel</strong> is a typed, synchronized queue between goroutines. <code>make(chan int)</code> is <strong>unbuffered</strong>: a send blocks until a receiver takes the value, so the two goroutines meet at that point. <code>make(chan int, 5)</code> is <strong>buffered</strong>: sends block only when the buffer is full, receives only when it is empty. The sender closes a channel to say "no more values", and receivers can <code>range</code> over it until then.</p>`,
        },
        {
          type: "table",
          title: "What each channel operation does",
          headers: ["Operation", "nil channel", "open channel", "closed channel"],
          rows: [
            ["<code>ch &lt;- v</code>", "Blocks forever", "Blocks until a receiver or buffer space", "<strong>Panics</strong>"],
            ["<code>v, ok := &lt;-ch</code>", "Blocks forever", "Blocks until a value arrives; <code>ok</code> is true", "Drains buffered values, then returns the zero value with <code>ok == false</code>, immediately"],
            ["<code>close(ch)</code>", "<strong>Panics</strong>", "Succeeds; wakes all waiting receivers", "<strong>Panics</strong>"],
          ],
          note: "In a select, a case on a nil channel is never chosen, which is a handy way to switch a case off.",
        },
        {
          type: "code",
          lang: "go",
          code: `func produce(n int) <-chan int { // receive-only result: callers can't send or close
	out := make(chan int)
	go func() {
		defer close(out) // only the sender closes
		for i := range n {
			out <- i * i
		}
	}()
	return out
}

func main() {
	for v := range produce(4) { // stops when the channel is closed
		fmt.Println(v) // 0 1 4 9
	}
}`,
          caption: "Directional types (chan&lt;- T for send-only, &lt;-chan T for receive-only) let the compiler enforce who may send and close.",
        },
        {
          type: "lab",
          id: "c08Channels",
          caption: "Start goroutines that send, receive and close on one channel. Watch unbuffered hand-offs, the buffer filling, what close does to blocked receivers and senders, and how a nil channel blocks forever.",
        },
        {
          type: "quiz",
          q: "A buffered channel of capacity 3 holds 2 values and is then closed. What do the next three receives return?",
          options: [
            "The two values, then a panic",
            "The two values, then the zero value with ok == false",
            "Zero values with ok == false immediately, because the channel is closed",
            "The two values, then the third receive blocks forever",
          ],
          answer: 1,
          explain: "Closing does not discard buffered data. Receivers get the remaining values first (with <code>ok == true</code>), and after that every receive returns the zero value and <code>ok == false</code> without blocking.",
        },
      ],
    },
    {
      id: "select-and-patterns",
      title: "select, timeouts and worker pools",
      kicker: "Patterns",
      blocks: [
        {
          type: "text",
          html: `<p><code>select</code> waits on several channel operations at once and runs whichever becomes ready. If several are ready, it picks one <strong>uniformly at random</strong>, so no case can starve another. A <code>default</code> case makes it non-blocking, and an empty <code>select {}</code> blocks forever. Combined with <code>time.After</code>, which returns a channel that receives a value after a duration, it gives you timeouts.</p>
<p>Now the bug from the introduction. If the worker sends on an unbuffered channel and the <code>select</code> has already returned through the timeout case, the send blocks forever and the goroutine leaks. The minimal fix is a buffer of one, so the send always succeeds and the goroutine exits; the better fix is to pass a <code>context</code> so the slow work itself stops.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func fetchWithTimeout(url string) (string, error) {
	ch := make(chan string, 1) // buffer of 1: the send never blocks, so no leak
	go func() { ch <- slowFetch(url) }()

	select {
	case body := <-ch:
		return body, nil
	case <-time.After(2 * time.Second):
		return "", errors.New("timeout") // the goroutine still finishes and exits
	}
}`,
        },
        {
          type: "text",
          html: `<h3>Worker pools</h3>
<p>Starting one goroutine per job is fine for a few hundred jobs, but unbounded concurrency can overwhelm a database or exhaust file descriptors. A <strong>worker pool</strong> runs a fixed number of goroutines that read jobs from a shared channel. Closing the jobs channel tells the workers to stop; a <code>WaitGroup</code> tells you when they have, so the results channel can be closed safely.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func runPool(jobs []Job, workers int) []Result {
	in, out := make(chan Job), make(chan Result)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range in { // ends when in is closed
				out <- handle(j)
			}
		}()
	}
	go func() { // feed the jobs, then close
		for _, j := range jobs {
			in <- j
		}
		close(in)
	}()
	go func() { wg.Wait(); close(out) }() // close out only after every worker is done

	var results []Result
	for r := range out {
		results = append(results, r)
	}
	return results
}`,
        },
        {
          type: "lab",
          id: "c08WorkerPool",
          caption: "Change the number of workers, jobs, time per job and buffer size and compare throughput. Switch to the semaphore version for the same concurrency bound with one goroutine per job.",
        },
        {
          type: "text",
          html: `<h3>Signal channels and OS signals</h3>
<p>A channel can carry an event instead of data. <code>chan struct{}</code> uses zero bytes per value, and closing it broadcasts to every receiver at once, which is how "start now" or "shut down" is usually signalled. Operating system signals arrive the same way: <code>signal.Notify</code> relays them onto a channel, and <code>signal.NotifyContext</code> (Go 1.16) turns them into a cancelled context.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()

srv := &http.Server{Addr: ":8080", Handler: mux}
go func() {
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}()

<-ctx.Done() // Ctrl+C locally, or SIGTERM when Kubernetes stops the pod
shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
_ = srv.Shutdown(shutdownCtx) // finish in-flight requests, then return`,
          caption: "Kubernetes sends SIGTERM and waits for a grace period before killing the container, so handling it lets in-flight requests complete.",
        },
      ],
    },
    {
      id: "shared-memory",
      title: "Data races, mutexes and atomics",
      kicker: "Shared memory",
      blocks: [
        {
          type: "problem",
          html: `<p>A <strong>data race</strong> happens when two goroutines access the same memory at the same time, at least one access is a write, and nothing orders them. <code>count++</code> looks like one step but is three: load, add, store. Two goroutines can both load 41 and both store 42, losing an update. Worse, Go's memory model gives racy programs no guarantees at all, so races cause corrupted maps and torn values, not just wrong counts.</p>`,
        },
        {
          type: "text",
          html: `<p>The <strong>race detector</strong> finds these. Build or test with <code>-race</code> (<code>go test -race ./...</code>) and the instrumented binary reports any race that actually happens while it runs, with both stack traces. It only sees code paths that execute, so pair it with tests that exercise concurrency, and expect it to use several times more memory and CPU; it belongs in CI and staging, not usually in production.</p>
<p>The fixes are synchronization. A <code>sync.Mutex</code> turns a block of code into a <strong>critical section</strong> that only one goroutine runs at a time; its zero value is unlocked and ready, it is not reentrant, and it must not be copied after use. A <code>sync.RWMutex</code> allows many concurrent readers or one writer; once a writer is waiting, new readers queue behind it so writers are not starved. <code>sync/atomic</code> performs single operations, like increment or compare-and-swap, indivisibly; since Go 1.19 it has typed values such as <code>atomic.Int64</code> and <code>atomic.Pointer[T]</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type Stats struct {
	mu     sync.Mutex
	byPath map[string]int // guarded by mu
	total  atomic.Int64   // no lock needed
}

func (s *Stats) Record(path string) {
	s.total.Add(1) // one indivisible operation

	s.mu.Lock()
	defer s.mu.Unlock()
	s.byPath[path]++ // read-modify-write on a map: needs the lock
}`,
          caption: "Methods use a pointer receiver because a copied Stats would copy the mutex; go vet's copylocks check catches that.",
        },
        {
          type: "lab",
          id: "c08Race",
          caption: "Run X goroutines that each increment a counter Y times with no synchronization, with a mutex and with an atomic add. Then see what wg.Wait() does when Add and Done do not match.",
        },
        {
          type: "text",
          html: `<h3>Share memory by communicating</h3>
<p>The alternative to locks is to give state a single owner. A <strong>monitor goroutine</strong> holds the data in local variables and is the only code that touches it; everyone else sends requests over channels. There is nothing to lock because there is no sharing. It fits state with complex invariants or a natural event loop; for a simple counter or cache, a mutex is shorter and faster.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func counter(ctx context.Context, inc <-chan int, read chan<- int) {
	value := 0 // owned by this goroutine alone
	for {
		select {
		case d := <-inc:
			value += d
		case read <- value: // offer the current value to any reader
		case <-ctx.Done():
			return
		}
	}
}`,
        },
        {
          type: "table",
          title: "Choosing a synchronization tool",
          headers: ["Situation", "Reach for"],
          rows: [
            ["Single counter or flag", "<code>atomic.Int64</code>, <code>atomic.Bool</code>"],
            ["Struct or map updated by several goroutines", "<code>sync.Mutex</code>"],
            ["Read-mostly data, rare writes", "<code>sync.RWMutex</code> (measure: plain Mutex is often just as fast)"],
            ["Handing work or results between goroutines", "Channels"],
            ["State with complex invariants or an event loop", "A monitor goroutine that owns it"],
            ["Waiting for a group to finish", "<code>sync.WaitGroup</code> or <code>errgroup</code>"],
          ],
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>Before Go 1.22, <code>for i := 0; i &lt; 3; i++ { go func() { fmt.Print(i) }() }</code> shared one <code>i</code> across all goroutines; they usually printed 3 3 3 and the race detector flagged it. Since Go 1.22, each iteration has its own <code>i</code>, so the goroutines print 0, 1 and 2 in some order.</p>`,
        },
        {
          type: "quiz",
          q: "Ten goroutines each run <code>count++</code> 1,000 times on a shared <code>int</code> with no synchronization. What can you say about the final value?",
          options: [
            "Always exactly 10,000",
            "At most 10,000 and often less, and the program has a data race",
            "Always less than 10,000",
            "Go detects the conflict at compile time",
          ],
          answer: 1,
          explain: "Concurrent load-add-store sequences can overwrite each other, so updates get lost and the result varies from run to run. It may even be correct sometimes, which is why passing once proves nothing. <code>go run -race</code> reports it.",
        },
      ],
    },
    {
      id: "context",
      title: "context: cancellation, deadlines and causes",
      kicker: "Cancellation",
      blocks: [
        {
          type: "idea",
          html: `<p>A <code>context.Context</code> carries a cancellation signal, an optional deadline and request-scoped values down a call tree. Cancelling a context cancels <strong>every context derived from it</strong>, never its parent, so one cancel at the top stops all the work below.</p>`,
        },
        {
          type: "text",
          html: `<p>You start from <code>context.Background()</code> (or <code>context.TODO()</code> as a placeholder) and derive children: <code>WithCancel</code>, <code>WithTimeout</code> and <code>WithDeadline</code> each return a new context and a <code>cancel</code> function. Work that respects the context watches <code>ctx.Done()</code>, a channel closed on cancellation, and returns <code>ctx.Err()</code>, which is <code>context.Canceled</code> or <code>context.DeadlineExceeded</code>. A child can never outlive its parent's deadline: asking for a longer timeout than the parent has left changes nothing.</p>
<p><strong>Always call <code>cancel</code></strong>, usually with <code>defer</code>, even if the work finishes normally. Until it is called (or the deadline passes), the context and its resources stay registered with the parent; <code>go vet</code> warns when a cancel function is lost.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func fetch(ctx context.Context, url string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel() // releases the timer even on success

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req) // aborts when ctx is done
	if err != nil {
		return nil, err // wraps context.DeadlineExceeded on timeout
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// Go 1.20: attach a reason to a cancellation.
func demoCause() {
	ctx, cancel := context.WithCancelCause(context.Background())
	cancel(errors.New("upstream quota exceeded"))
	fmt.Println(ctx.Err())          // context canceled
	fmt.Println(context.Cause(ctx)) // upstream quota exceeded
}`,
        },
        {
          type: "lab",
          id: "c08Context",
          caption: "Run a tree of contexts with workers, press cancel at different levels and watch cancellation flow down but never up. Check that a child's deadline is capped by its parent's and that context.Cause carries the reason.",
        },
        {
          type: "text",
          html: `<p>Go 1.21 rounded out the package with <code>WithTimeoutCause</code> and <code>WithDeadlineCause</code>, <code>AfterFunc</code> (run a function when a context is cancelled) and <code>WithoutCancel</code> (keep the values but detach from the parent's cancellation, for work that must finish even if the request is gone). Context values are for request-scoped data such as a trace ID, not for passing optional function parameters.</p>
<p>To bound concurrency with cancellation built in, the <code>golang.org/x/sync</code> module offers <code>semaphore.NewWeighted(n)</code>, whose <code>Acquire(ctx, 1)</code> gives up when the context ends, and <code>errgroup</code>, which runs goroutines, returns the first error, cancels the shared context for the rest, and can cap concurrency with <code>SetLimit</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `g, ctx := errgroup.WithContext(ctx)
g.SetLimit(4) // at most 4 fetches at a time
for _, u := range urls {
	g.Go(func() error {
		_, err := fetch(ctx, u) // u is per-iteration since Go 1.22
		return err
	})
}
if err := g.Wait(); err != nil { // first error; ctx was cancelled for the others
	return err
}`,
        },
        {
          type: "realworld",
          items: [
            { org: "net/http", title: "Request contexts", html: "Every incoming <code>*http.Request</code> has a context that is cancelled when the client disconnects, so handlers that pass <code>r.Context()</code> to database and HTTP calls stop wasted work automatically." },
            { org: "database/sql", title: "QueryContext", html: "The <code>...Context</code> methods cancel a running query when the context ends, which is how timeouts reach the database." },
          ],
        },
        {
          type: "quiz",
          q: "A parent context has 1 second left before its deadline. A function derives <code>context.WithTimeout(parent, 5*time.Second)</code>. When is the child cancelled?",
          options: [
            "After 5 seconds",
            "After about 1 second, when the parent's deadline passes",
            "Never, because the child's timeout is longer",
            "Immediately, because the timeouts conflict",
          ],
          answer: 1,
          explain: "Cancellation flows from parent to child. The child's own timer would fire at 5 seconds, but the parent is cancelled at 1 second and takes every descendant with it; <code>ctx.Deadline()</code> on the child reports the earlier time.",
        },
      ],
    },
    {
      id: "interview",
      title: "Interview angle: concurrency questions you will get",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Concurrency is the most interview-relevant Go topic. Expect conceptual questions about the scheduler, precise questions about channel behaviour, "what does this print" puzzles with goroutines and loops, and a design exercise such as building a rate-limited crawler or a worker pool with timeouts. In the design part, interviewers listen for one thing above all: how every goroutine you start eventually stops.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Answers to have ready:</p>
<ul>
<li><strong>Goroutine vs thread:</strong> small growable stack, user-space scheduling, cheap to create; many goroutines share few threads.</li>
<li><strong>G-M-P:</strong> Ps hold run queues, Ms are threads, an M needs a P; blocking syscalls hand the P to another M; idle Ps steal half a queue.</li>
<li><strong>Channels:</strong> send to closed panics; receive from closed drains then returns zero and false; nil blocks forever; close only from the sender.</li>
<li><strong>WaitGroup:</strong> <code>Add</code> before <code>go</code>; mismatches hang or panic.</li>
<li><strong>Choosing tools:</strong> atomics for counters, mutexes for shared structures, channels for passing ownership and signalling.</li>
<li><strong>select:</strong> random among ready cases; for priority, check the important channel first in its own non-blocking select.</li>
<li><strong>context:</strong> cancellation flows down; always <code>defer cancel()</code>; pass <code>ctx</code> as the first parameter.</li>
<li><strong>Leak-free timeouts:</strong> buffered result channel or, better, a context the worker honours.</li>
</ul>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Giving one channel priority in select",
          code: `for {
	select {
	case <-ctx.Done(): // check the high-priority channel on its own first
		return ctx.Err()
	default:
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case job := <-jobs:
		handle(job)
	}
}`,
        },
        {
          type: "quiz",
          q: "Which design guarantees that a goroutine computing a result does not leak when the caller gives up after a timeout?",
          options: [
            "Send the result on an unbuffered channel and use time.After in the caller",
            "Send on a channel with a buffer of 1, or have the worker watch the same context and return when it is done",
            "Call runtime.Gosched() in the worker",
            "Increase GOMAXPROCS so the goroutine finishes faster",
          ],
          answer: 1,
          explain: "With an unbuffered channel, a worker that finishes after the caller left blocks forever on its send. A buffer of one lets the send complete; a shared context lets the worker stop early. Scheduling tweaks change nothing about the blocked send.",
        },
      ],
    },
  ],
  takeaways: [
    "Goroutines are cheap, user-space scheduled tasks; the runtime multiplexes Gs onto Ms (threads) through GOMAXPROCS Ps with local run queues and work stealing.",
    "Concurrency is about structure, parallelism about simultaneous execution; correct concurrent code works with one P.",
    "Call <code>wg.Add</code> before <code>go</code>; know the channel table by heart: send on closed panics, receive on closed drains then returns zero and false, nil channels block forever.",
    "Every goroutine needs a way to finish: buffered result channels, closed job channels and contexts prevent leaks.",
    "Data races corrupt memory, not just counts; find them with <code>-race</code> and fix them with mutexes, atomics or a single owning goroutine.",
    "Cancellation flows down a context tree and never up; always <code>defer cancel()</code>, and use <code>WithCancelCause</code> to record why.",
    "Bound concurrency with worker pools, <code>semaphore.Weighted</code> or <code>errgroup.SetLimit</code>, and shut down gracefully on SIGTERM.",
  ],
  furtherReading: [
    { title: "The Go Memory Model", url: "https://go.dev/ref/mem", note: "What a data race is and which operations create happens-before ordering." },
    { title: "Data Race Detector", url: "https://go.dev/doc/articles/race_detector", note: "How to use -race, what it reports and its overhead." },
    { title: "Go Concurrency Patterns: Context (The Go Blog)", url: "https://go.dev/blog/context", note: "The original introduction to context and cancellation trees." },
    { title: "Go Concurrency Patterns: Pipelines and cancellation (The Go Blog)", url: "https://go.dev/blog/pipelines", note: "Fan-out, fan-in and stopping goroutines cleanly." },
  ],
};
