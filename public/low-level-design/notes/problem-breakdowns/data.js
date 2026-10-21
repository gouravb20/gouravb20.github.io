// Low-level design problem breakdowns - interactive notes data.
// Original study notes with Java examples. The problems follow Hello Interview's LLD breakdowns:
// https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/rate-limiter
// https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/file-system
window.DATA = {
  book: {
    title: `Low-Level Design Problem Breakdowns`,
    subtitle: `Classic low-level design interview problems, each worked through on one page: the <strong>problem</strong> and its requirements, a <strong>solution</strong> from entities to working Java code, the <strong>deep dives</strong> an interviewer pushes on, and what is expected at each level, with labs embedded where each decision comes up. Problems are grouped and ordered by difficulty, <strong style="color:var(--level-easy)">easy</strong>, <strong style="color:var(--level-medium)">medium</strong> and <strong style="color:var(--level-hard)">hard</strong>: Connect Four, Tic-Tac-Toe, Snake and Ladders, Vending Machine and Parking Lot to warm up; LRU Cache, File System, ATM, Splitwise, Circuit Breaker, Logging Service, Meeting Room Scheduler, Movie Ticket Booking and Pub-Sub in the middle; Rate Limiter, Elevator, Ride Sharing and Inventory Management at the top. To practise, read only a problem's requirements, build it yourself in 45 minutes (clarify 5, entities 5, public API 5, core code 20, follow-ups 10), compare with the solution, and redo it from a blank file a few days later. Several problems follow Hello Interview's <a href="https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/connect-four" target="_blank" rel="noopener" style="color:var(--accent)">LLD problem breakdowns</a> (each page links its original); these notes, code and labs are written independently, so read the original walkthroughs there.`,
    storageKey: `lld_problem_breakdowns_notes_v1`,
    appId: `lld-problem-breakdowns-notes`,
    exportPrefix: `lld-problem-breakdowns-progress`,
    pillarsTitle: `Four habits for any LLD breakdown`,
    takeawaysTitle: `Things to remember`,
    labsIntro: `Each lab models one decision in the design and sits in the section where that decision comes up. Time is simulated, so runs are repeatable; read the numbers as shapes, not benchmarks.`,
    mono: `LP`,
    shortTitle: `LLD Problem Breakdowns`,
    tagline: `LLD interview prep`
  },
  // Problems are grouped by difficulty. Each lives in chapters/<id>.js; chapterOrder lists them easiest first,
  // and the loader sorts and numbers the chapters in that order.
  parts: {
    1: `Easy`,
    2: `Medium`,
    3: `Hard`
  },
  fourQuestions: [
    { cls: `what`, q: `Turn the prompt into a contract`, text: `Find out exactly what goes in, what comes out and what fails. Rate limiter: a client ID and an endpoint in; allowed, remaining and retry-after out. File system: absolute paths in; nodes, listings and content out; a specific exception for every invalid request.`, answer: `Every problem: Problem tab.` },
    { cls: `where`, q: `Find the shape of the problem`, text: `Most LLD problems have one central idea. In the rate limiter it is an axis of variation (the algorithm) behind one interface. In the file system it is a recursive structure (folders containing folders) modelled as a Composite tree with parent pointers.`, answer: `Every problem: Solution tab (entities, class design).` },
    { cls: `when`, q: `Get the core flow working first`, text: `Build the single-threaded version end to end: limiters that decide, or a tree that resolves, creates, moves and deletes. Add thread safety, eviction, symlinks or search only when the interviewer asks.`, answer: `Every problem: Solution tab (implementation).` },
    { cls: `how`, q: `Answer the follow-ups with small changes`, text: `"Make it thread-safe", "add an algorithm", "support relative paths", "compute folder sizes". A good design absorbs each one in a single class or a few lines, and you can say which.`, answer: `Every problem: Deep Dives.` }
  ],
  takeaways: [
    `The rate limiter's contract: <strong>check(clientId, endpoint)</strong> returns <strong>allowed</strong>, <strong>remaining</strong> and <strong>retryAfterMs</strong> (null when allowed). Unknown endpoints use a <strong>default rule</strong>.`,
    `The axis of variation is the <strong>algorithm</strong>. One <code>Limiter</code> interface, one class per algorithm: the Strategy pattern.`,
    `Configuration is <strong>heterogeneous</strong>: model each algorithm's parameters as its own record behind a <strong>sealed interface</strong>, and build limiters in one <strong>factory</strong> with an exhaustive switch.`,
    `Create <strong>one limiter per endpoint</strong> at startup; each limiter keeps <strong>state per client</strong> in a map, created lazily on the first request.`,
    `<strong>Token bucket</strong> allows bursts up to capacity and holds the long-run rate; <strong>sliding window log</strong> is exact but stores a timestamp per request; <strong>fixed window</strong> is simplest but lets up to twice the limit through at window edges; <strong>sliding window counter</strong> approximates the log in constant space.`,
    `Refill lazily from elapsed time on each call; no background thread is needed. Read time from an injected <strong>clock</strong> so tests are deterministic.`,
    `<strong>Thread safety</strong>: refill-and-spend is a read-modify-write, so make it atomic per client (a lock on the client's state, or a CAS on an immutable state). Create state with <code>computeIfAbsent</code>. Never use one global lock.`,
    `<strong>Memory</strong> grows with every client ever seen. Evict idle client state (lazy expiry plus a periodic sweep), and beware the sliding log's per-request storage.`,
    `Adding an algorithm touches three places: a config record, a limiter class and one factory case; the sealed interface makes the compiler point at the missing case.`,
    `Distributed limiting (Redis, coordination across servers) is a system design question; in LLD, mention it as the next step and keep the in-process design clean.`,
    `The file system is a <strong>Composite</strong>: an abstract <code>Node</code> with <code>File</code> and <code>Directory</code> subclasses, where a directory holds child nodes.`,
    `Each directory keeps a <strong>map from name to child</strong>: unique names per folder and constant-time lookup at each step of a path.`,
    `<strong>Parent pointers</strong> make the full path of any node cost O(depth), and make move and rename O(1) because no descendant stores its path.`,
    `<strong>Resolve</strong> a path by splitting it and walking from the root one map lookup per segment; parse paths in one place and reject bad ones early.`,
    `<strong>Move</strong> must refuse to put a folder inside its own subtree (walk up from the destination looking for the source) and must check name conflicts <em>before</em> changing anything.`,
    `Use <strong>specific exceptions</strong> (not found, already exists, not a directory, not empty, invalid path, invalid operation) under one base type, so callers can handle each case.`,
    `The simplest correct concurrency story for the file system is one <strong>read-write lock</strong> around the tree; per-node locking is hard because a move touches two directories.`,
    `<strong>Interview checklist:</strong> clarify scope first (single process or distributed, which operations, what scale, in memory or persistent), then name the entities and the public API before writing code.`,
    `Put variable behaviour behind an interface: pricing, allocation, splitting, delivery, dispatch, limiting algorithms.`,
    `Say how it stays thread-safe: a lock per key or per object, atomic claim operations, concurrent collections.`,
    `Handle invalid input and edge cases explicitly, say what you would test, and keep follow-ups ready: a new rule type, persistence, scale, monitoring.`,
    `<strong>Next problems to practise:</strong> library management (search, holds and fines); a text editor with undo and redo (Command); a task scheduler with priorities and retries; a food delivery order flow (state machine plus matching); a chess game (piece moves as polymorphism, check detection).`
  ],
  chapterOrder: [
    `connect-four`, `tic-tac-toe`, `snake-and-ladders`, `vending-machine`, `parking-lot`,
    `lru-cache`, `file-system`, `atm`, `splitwise`, `circuit-breaker`, `logging-service`,
    `meeting-scheduler`, `movie-ticket-booking`, `pub-sub`,
    `rate-limiter`, `elevator`, `ride-sharing`, `inventory-management`
  ],
  chapters: []
};
