// Go versions of chapter 1's code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["ch1"] = { go: {
"The same counter, three ways": `// 1. Not shared: each request counts its own items
func countItems(items []Item) int { return len(items) }

// 2. Not mutated: an immutable value, replaced instead of changed
type Stats struct{ Hits, Misses int64 }

func (s Stats) WithHit() Stats { return Stats{s.Hits + 1, s.Misses} } // value receiver: returns a copy

// 3. Shared and mutated, so access is synchronized
type HitCounter struct{ hits atomic.Int64 }

func (c *HitCounter) Hit()        { c.hits.Add(1) }
func (c *HitCounter) Hits() int64 { return c.hits.Load() }`,

"A worker that may never stop": `type Worker struct {
	running bool // BUG: written by one goroutine, read by another, no synchronization
}

func (w *Worker) Run() {
	for w.running { // a data race: may never see the update (go test -race reports it)
		doWork()
	}
}

func (w *Worker) Stop() { w.running = false } // called from another goroutine

// Fix: make it an atomic.Bool, or better, the Go idiom: a context or a done channel.
func run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done(): // cancel() from any goroutine stops the loop
			return
		default:
			doWork()
		}
	}
}`,

"Executors in Java 21": `// CPU-bound work: a fixed number of workers, about one per core
results := make(chan Report, len(jobs))
var wg sync.WaitGroup
sem := make(chan struct{}, runtime.NumCPU()) // at most NumCPU goroutines computing at once
for _, job := range jobs {
	wg.Add(1)
	go func() {
		defer wg.Done()
		sem <- struct{}{}
		defer func() { <-sem }()
		results <- buildReport(job)
	}()
}
wg.Wait()
close(results)

// Blocking I/O: goroutines are already cheap (like virtual threads), so start one per task
var g errgroup.Group // golang.org/x/sync/errgroup
for _, o := range orders {
	g.Go(func() error { return notifyCustomer(o) })
}
err := g.Wait() // waits for every task; returns the first error`
} };
