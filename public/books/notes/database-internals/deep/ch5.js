// Deep dive: Chapter 5, Transaction processing and recovery. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>A transfer moves 500 from account A to account B. The engine debits A, and in the microsecond before it credits B, the power fails. When the server comes back, one of three things is true: the money vanished, the money was duplicated, or the database quietly put everything back the way it was before the transfer started. Only the third is acceptable, and the database has to guarantee it even though the change to A may have reached disk while the change to B was still only in memory.</p>
<p>Meanwhile, a thousand other transactions were running. Some were reading A while it was half-updated. Two were trying to change the same row. One was walking the same B-Tree page that another was splitting. This chapter is about the machinery that keeps all of that correct: a page cache that decides what lives in memory, a log that makes crashes survivable, and concurrency control that makes simultaneous transactions behave as if they had taken turns.</p>`,
  sections: [
    {
      id: "buffer-pool",
      title: "The buffer pool: pages in memory",
      kicker: "Buffer manager",
      blocks: [
        {
          type: "text",
          html: `<p>A transaction must be <strong>atomic</strong> (all or nothing), leave the data <strong>consistent</strong> (the application's invariants hold), be <strong>isolated</strong> from concurrent transactions, and be <strong>durable</strong> once committed. Consistency is mostly the application's job; the other three fall to three engine components. The <strong>buffer manager</strong> decides which pages are in memory, the <strong>log manager</strong> makes atomicity and durability survive crashes, and <strong>concurrency control</strong> provides isolation. We start with the buffer manager, because the other two exist largely to work around what it does.</p>`,
        },
        {
          type: "text",
          html: `<p>The <strong>page cache</strong> (or buffer pool) is a fixed set of memory frames, each holding one disk page. A read checks the cache first; on a miss, the page is <strong>paged in</strong> from disk into a free frame. A write modifies the cached copy and marks the page <strong>dirty</strong>; it is written back (flushed) later. When the cache is full and a new page is needed, some page must be <strong>evicted</strong>, and if it is dirty, it must be flushed first.</p>
<p>This decoupling is the point: many changes to a hot page are absorbed in memory and reach disk as one write. It is also the danger. At any moment, the disk holds a mix of old and new page versions that corresponds to no single consistent state, which is why the log in the next sections is needed.</p>`,
        },
        {
          type: "text",
          html: `<h3>Pinning</h3>
<p>Some pages are worth keeping no matter what. Every B-Tree lookup touches the root and the top internal levels, and Chapter 2 showed those levels are a tiny fraction of the tree: for a billion-row table, about 10,000 pages, or 160 MB with 16 KB pages. <strong>Pinning</strong> keeps such pages resident. The term is also used for a shorter-lived guarantee: while an operation is using a page, it is pinned so it can't be evicted from under it.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          title: "Why not just use the operating system's page cache?",
          html: `<p>The kernel already caches file pages, so why build another cache? Because the database knows things the kernel doesn't: which pages are B-Tree roots, which reads belong to a one-off scan that shouldn't evict the working set, and above all which log records must be on disk before a given page may be written. Many engines therefore open files with <code>O_DIRECT</code> and manage memory themselves, which also avoids caching every page twice.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Shared buffers plus the OS cache", html: "PostgreSQL has its own buffer pool (<code>shared_buffers</code>, 128 MB by default, with about 25% of RAM a common starting point on a dedicated server) and deliberately relies on the operating system's page cache for the rest, accepting some double caching." },
            { org: "MySQL InnoDB", title: "A large private buffer pool", html: "InnoDB caches table and index pages in its own buffer pool, which the documentation suggests can be up to around 80% of memory on a dedicated server, and it can bypass the OS cache with <code>O_DIRECT</code>." },
          ],
        },
      ],
    },
    {
      id: "eviction-policies",
      title: "Choosing what to evict",
      kicker: "Page replacement",
      blocks: [
        {
          type: "problem",
          html: `<p>A cache is only as good as its eviction decisions. Evict a page that is needed again soon and you pay a disk read for nothing. The optimal policy, evicting the page whose next use is furthest in the future, needs to know the future. Every real policy is a guess based on the past.</p>`,
        },
        {
          type: "list",
          title: "The main policies",
          items: [
            "<strong>FIFO</strong>: evict the page that was paged in earliest, ignoring how often it has been used since. For a B-Tree this is disastrous: the root is loaded first, so FIFO evicts it first, even though nearly every lookup needs it.",
            "<strong>LRU</strong>: on each access, move the page to the most-recently-used end; evict from the other end. Much better, but relinking a shared list on every access is a contention point under concurrency.",
            "<strong>CLOCK</strong>: an LRU approximation. Frames form a circle, each with an access bit set on use. A hand sweeps around: a bit of 1 is cleared (a second chance), a bit of 0 means evict. Access only sets a bit, which is cheap and can be done with an atomic operation.",
            "<strong>LFU and TinyLFU</strong>: rank by frequency instead of recency. TinyLFU keeps a compact frequency sketch and admits a new page only if it has been used more often than the page it would replace.",
          ],
        },
        {
          type: "diagram",
          title: "CLOCK eviction",
          caption: "The hand points at P7, whose bit is 1: it is cleared and P7 survives this round. The hand moves on to P2, whose bit is 0, so P2 is evicted.",
          svg: `<svg viewBox="0 0 600 280" role="img" aria-label="CLOCK page replacement: frames in a circle with access bits and a sweeping hand">
<defs><marker id="di5-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<circle cx="170" cy="140" r="95" fill="none" stroke-width="2" style="stroke: var(--dg-line)"/>
<rect x="138" y="29" width="64" height="32" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="170" y="50" text-anchor="middle" font-size="12">root · 1</text>
<rect x="220" y="76" width="64" height="32" rx="5" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/><text x="252" y="97" text-anchor="middle" font-size="12">P7 · 1</text>
<rect x="220" y="171" width="64" height="32" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/><text x="252" y="192" text-anchor="middle" font-size="12">P2 · 0</text>
<rect x="138" y="219" width="64" height="32" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="170" y="240" text-anchor="middle" font-size="12">P9 · 1</text>
<rect x="56" y="171" width="64" height="32" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="88" y="192" text-anchor="middle" font-size="12">P5 · 0</text>
<rect x="56" y="76" width="64" height="32" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="88" y="97" text-anchor="middle" font-size="12">P3 · 1</text>
<line x1="170" y1="140" x2="214" y2="115" stroke-width="2.5" style="stroke: var(--dg-ink)" marker-end="url(#di5-arrow)"/>
<circle cx="170" cy="140" r="4" style="fill: var(--dg-ink)"/>
<text x="330" y="70" font-size="13" font-weight="700">The hand sweeps clockwise</text>
<text x="330" y="98" font-size="12">bit 1: clear it to 0, move on</text>
<text x="330" y="122" font-size="12">bit 0: evict this page</text>
<text x="330" y="146" font-size="12">on every access: set bit to 1</text>
<text x="330" y="182" font-size="12" style="fill: var(--dg-muted)">Pages used since the last sweep</text>
<text x="330" y="200" font-size="12" style="fill: var(--dg-muted)">survive; idle ones are evicted.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Recency alone has a famous weakness: <strong>scan pollution</strong>. A one-off full table scan touches every page exactly once, and under plain LRU each of those pages becomes "most recently used", pushing the genuinely hot working set out. Policies like 2Q, LRU-K and TinyLFU, and the midpoint-insertion trick below, exist mostly to make a page prove it is reused before it can displace established pages.</p>`,
        },
        {
          type: "lab",
          id: "pageCache",
          caption: "Replay reference strings through FIFO, LRU, CLOCK, LFU and the optimal policy. Try the B-Tree preset to see FIFO evict the root, the scan preset to see recency-based caches flushed, and pinning to protect a page.",
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Clock sweep", html: "PostgreSQL's buffer manager uses a clock-sweep algorithm with a small usage counter per buffer (capped at 5) rather than a single bit. Large sequential scans use a small ring of buffers so they don't evict the whole cache." },
            { org: "MySQL InnoDB", title: "Midpoint insertion LRU", html: "InnoDB's LRU list is split into a new sublist and an old sublist (37% of the pool by default). Newly read pages enter at the head of the old sublist and are promoted only if accessed again after a delay (<code>innodb_old_blocks_time</code>, 1 second by default), so a scan can't flush the hot pages." },
            { org: "Caffeine", title: "W-TinyLFU", html: "The Java caching library Caffeine uses Window TinyLFU: a small LRU admission window in front of a frequency-filtered main cache." },
          ],
        },
        {
          type: "quiz",
          q: "A cache holds 4 pages. A B-Tree workload touches the root on every lookup. Under FIFO, what happens to the root?",
          options: [
            "It stays forever because it is used most",
            "It is evicted as soon as 4 other pages have been loaded after it, then immediately read back in",
            "FIFO never evicts internal pages",
            "It is evicted only when it becomes dirty",
          ],
          answer: 1,
          explain: "FIFO evicts by load order alone. The root was loaded first, so it is the first to go once the cache fills, and the very next lookup reloads it. LRU or CLOCK would keep it, because it is accessed constantly.",
        },
      ],
    },
    {
      id: "write-ahead-log",
      title: "The write-ahead log",
      kicker: "Log manager",
      blocks: [
        {
          type: "problem",
          html: `<p>The buffer manager wants freedom: flush pages whenever it likes, in any order, and keep hot dirty pages in memory for a long time. Durability wants the opposite: once a transaction commits, its changes must survive a crash. And atomicity wants a crash in the middle of a transaction to leave no trace of it, even if some of its pages were already flushed.</p>`,
        },
        {
          type: "idea",
          html: `<p>Before any change to a page reaches disk, write a description of the change to an append-only <strong>write-ahead log</strong> (WAL) and make it durable. A transaction commits when its commit record is on disk. With the log as the source of truth, the pages themselves can be flushed lazily, and recovery can redo or undo whatever the pages are missing.</p>`,
        },
        {
          type: "text",
          html: `<p>Each log record gets a monotonically increasing <strong>log sequence number</strong> (LSN). Each page stores the LSN of the last record that changed it. The rule that makes it all work is simple: a dirty page may be flushed only after the log has been flushed at least up to that page's LSN. Commit, in turn, means forcing the log up to the commit record, typically with <code>fsync</code>. Because the log is sequential and many transactions' records sit next to each other, one flush can commit a whole batch of them, which is called <strong>group commit</strong>.</p>
<p>Log records can describe changes <strong>physically</strong> (these bytes at this offset changed from X to Y) or <strong>logically</strong> (insert key 42 into this index). Physical redo is fast and deterministic. Logical undo still works after other transactions have rearranged the page, for example by splitting it. Real systems often combine them: physical (or "physiological") redo with logical undo.</p>`,
        },
        {
          type: "table",
          title: "Steal and force: what recovery must do",
          headers: ["", "No force (pages may stay dirty after commit)", "Force (all pages flushed at commit)"],
          rows: [
            ["<strong>Steal</strong> (uncommitted pages may be flushed)", "Needs undo and redo. Most flexible; used by ARIES and most engines", "Needs undo only"],
            ["<strong>No steal</strong> (uncommitted pages stay in memory)", "Needs redo only", "Needs neither, but commits are slow and memory must hold every running transaction's pages"],
          ],
          note: "Steal means the disk can hold uncommitted changes, which recovery must undo. No force means the disk can lack committed changes, which recovery must redo.",
        },
        {
          type: "callout",
          tone: "warning",
          title: "Torn pages",
          html: `<p>A database page (8 or 16 KB) is usually larger than what the storage device writes atomically, so a crash mid-flush can leave a page half old and half new, and a byte-level redo record can't repair it. PostgreSQL handles this by logging a full image of each page the first time it changes after a checkpoint (<code>full_page_writes</code>). InnoDB writes pages to a doublewrite buffer first, so an intact copy always exists somewhere.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "SQLite", title: "Two journaling modes", html: "SQLite's default rollback journal copies original page contents aside before overwriting the database file, which is an undo log. In WAL mode it instead appends new page versions to a separate WAL file and later checkpoints them back into the database, which is a redo log." },
          ],
        },
        {
          type: "quiz",
          q: "Under a steal / no-force policy, which of these can be on disk right after a crash?",
          options: [
            "Only committed changes, all of them",
            "Uncommitted changes that must be undone, and missing committed changes that must be redone",
            "Nothing at all; pages are only written at shutdown",
            "Only changes from the last checkpoint",
          ],
          answer: 1,
          explain: "Steal lets the buffer manager flush a page with uncommitted changes, so recovery must undo them. No force lets a transaction commit before its pages are flushed, so recovery must redo committed changes from the log. That is exactly why ARIES has both a redo and an undo phase.",
        },
      ],
    },
    {
      id: "aries-recovery",
      title: "ARIES recovery and checkpoints",
      kicker: "Recovery manager",
      blocks: [
        {
          type: "text",
          html: `<p>ARIES is the recovery algorithm behind most steal / no-force engines, published by IBM researchers in 1992. Its central idea is counterintuitive: after a crash, first <strong>repeat history</strong> exactly, including the changes of transactions that never committed, and only then roll back the ones that didn't finish. Re-creating the exact pre-crash state first makes the undo step simple and correct, even with logical undo.</p>`,
        },
        {
          type: "steps",
          title: "The three phases",
          items: [
            "<strong>Analysis</strong>: scan the log forward from the last checkpoint. Rebuild the <em>dirty page table</em> (which pages might be stale on disk, and the earliest LSN that dirtied each, its recLSN) and the <em>transaction table</em> (which transactions were still active at the crash: the losers).",
            "<strong>Redo</strong>: start at the smallest recLSN and replay every logged change, from winners and losers alike, but only where the page on disk is older than the record (page LSN &lt; record LSN). Afterwards the database is in its exact state at the moment of the crash.",
            "<strong>Undo</strong>: roll back the losers, newest change first. For each undone change, write a <em>compensation log record</em> (CLR) describing the undo, with a pointer to the next record still to be undone.",
          ],
        },
        {
          type: "diagram",
          title: "Where each ARIES phase reads the log",
          caption: "Analysis starts at the checkpoint, redo starts at the oldest change that might be missing from disk, and undo walks backwards until the first change of the oldest unfinished transaction.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="ARIES phases over the log: analysis from checkpoint, redo from the smallest recLSN, undo backwards to the oldest loser record">
<defs><marker id="di5-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<line x1="20" y1="60" x2="580" y2="60" stroke-width="3" style="stroke: var(--dg-line)"/>
<line x1="80" y1="50" x2="80" y2="70" stroke-width="2" style="stroke: var(--dg-3)"/>
<text x="80" y="40" text-anchor="middle" font-size="12">loser's first update</text>
<line x1="170" y1="50" x2="170" y2="70" stroke-width="2" style="stroke: var(--dg-2)"/>
<text x="185" y="88" text-anchor="middle" font-size="12">min recLSN</text>
<line x1="300" y1="50" x2="300" y2="70" stroke-width="2" style="stroke: var(--dg-1)"/>
<text x="300" y="40" text-anchor="middle" font-size="12">last checkpoint</text>
<line x1="560" y1="46" x2="560" y2="74" stroke-width="3" style="stroke: var(--dg-bad)"/>
<text x="560" y="40" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">crash</text>
<line x1="300" y1="116" x2="556" y2="116" stroke-width="2" style="stroke: var(--dg-1)" marker-end="url(#di5-arrow2)"/>
<text x="292" y="120" text-anchor="end" font-size="12">1. Analysis</text>
<line x1="170" y1="150" x2="556" y2="150" stroke-width="2" style="stroke: var(--dg-2)" marker-end="url(#di5-arrow2)"/>
<text x="162" y="154" text-anchor="end" font-size="12">2. Redo</text>
<line x1="560" y1="190" x2="84" y2="190" stroke-width="2" style="stroke: var(--dg-3)" marker-end="url(#di5-arrow2)"/>
<text x="310" y="182" text-anchor="middle" font-size="12">3. Undo losers, newest first, writing CLRs</text>
<text x="20" y="220" font-size="12" style="fill: var(--dg-muted)">Redo repeats history for every transaction; undo then removes only the unfinished ones.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>CLRs solve a nasty problem: what if the system crashes again <em>during</em> recovery? Without them, the second recovery might undo an already-undone change, or lose track of where it was. CLRs are redo-only records. The second recovery's redo phase replays them like any other change, and its undo phase uses their "next to undo" pointer to skip what was already rolled back. Recovery can be interrupted any number of times and still converge.</p>`,
        },
        {
          type: "lab",
          id: "walRecovery",
          caption: "Run three transactions over pages P1 to P3, choose steal and force settings, pick a crash point, and step through analysis, redo and undo with compensation log records.",
        },
        {
          type: "text",
          html: `<h3>Checkpoints</h3>
<p>Without checkpoints, recovery would have to read the log from the very beginning, and the log could never be trimmed. A checkpoint marks a point after which older log records are no longer needed for recovery. A <strong>sync checkpoint</strong> flushes every dirty page and then records the fact, which is simple but stalls the system while it happens. A <strong>fuzzy checkpoint</strong> writes a begin record, then an end record containing the dirty page table and active transaction table, while dirty pages keep being flushed in the background. Recovery starts from the last complete checkpoint and uses its tables, and log trimming is limited only by the oldest recLSN and the oldest active transaction.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "MySQL InnoDB", title: "Fuzzy checkpointing", html: "InnoDB documents its checkpointing as fuzzy: modified pages are flushed in small batches in the background, and the checkpoint LSN advances as the oldest dirty pages reach disk." },
            { org: "PostgreSQL", title: "Spread checkpoints", html: "PostgreSQL spreads the writes of each checkpoint over a large fraction of the checkpoint interval (controlled by <code>checkpoint_completion_target</code>) to avoid an I/O spike, and recovery replays WAL from the last checkpoint's redo point." },
          ],
        },
        {
          type: "quiz",
          q: "Why does ARIES redo changes made by transactions that will be rolled back moments later in the undo phase?",
          options: [
            "It can't tell winners from losers during redo",
            "Repeating history restores the exact pre-crash state, so undo (including logical undo and CLRs) operates on the state those log records were written against",
            "To make recovery slower but safer",
            "Losers' changes are needed by winners",
          ],
          answer: 1,
          explain: "Analysis already knows who the losers are. Redoing everything anyway puts every page back into the state it was in at the crash, which is the state the undo records assume. Undo then works the same whether it runs during normal rollback or during recovery.",
        },
      ],
    },
    {
      id: "isolation",
      title: "Isolation levels and anomalies",
      kicker: "Concurrency control",
      blocks: [
        {
          type: "text",
          html: `<p>Isolation in ACID formally means <strong>serializability</strong>: the outcome of running transactions concurrently must be equivalent to running them one after another in <em>some</em> order. It doesn't promise any particular order, only that the result could have come from one. A <strong>schedule</strong> is an interleaving of the transactions' reads and writes; the engine's job is to allow only schedules that are serializable, or, at weaker isolation levels, to allow specific named anomalies in exchange for more concurrency.</p>`,
        },
        {
          type: "list",
          title: "The anomalies",
          items: [
            "<strong>Dirty read</strong>: reading a value another transaction wrote but has not committed (and might roll back).",
            "<strong>Nonrepeatable read</strong>: reading the same row twice and getting different values because another transaction committed a change in between.",
            "<strong>Phantom read</strong>: running the same range query twice and getting a different set of rows because another transaction inserted or deleted matching rows.",
            "<strong>Lost update</strong>: two transactions read a value, both compute a new one, and the second write silently overwrites the first.",
            "<strong>Dirty write</strong>: overwriting a value that another transaction has written but not committed.",
            "<strong>Write skew</strong>: two transactions read overlapping data, each makes a change that is safe on its own, they write different rows, and together they break an invariant.",
          ],
        },
        {
          type: "table",
          title: "Standard isolation levels",
          headers: ["Level", "Dirty read", "Nonrepeatable read", "Phantom read"],
          rows: [
            ["Read uncommitted", "possible", "possible", "possible"],
            ["Read committed", "prevented", "possible", "possible"],
            ["Repeatable read", "prevented", "prevented", "possible"],
            ["Serializable", "prevented", "prevented", "prevented"],
          ],
          note: "Snapshot isolation sits outside this ladder: each transaction reads from a snapshot taken at its start, and if two transactions write the same row, the first to commit wins. It prevents lost updates but still allows write skew.",
        },
        {
          type: "text",
          html: `<h3>Write skew, worked</h3>
<p>A service runs in two regions, and the rule is that at least one region must keep serving traffic. Two operators, under snapshot isolation, each decide to drain a region for maintenance at the same moment. Operator 1's transaction reads both regions, sees both active, and marks region East as drained. Operator 2's transaction reads the same snapshot, sees both active, and marks region West as drained. They wrote <em>different rows</em>, so there is no write-write conflict, and both commit. Now no region serves traffic.</p>
<p>Each transaction was correct in isolation; the problem is only visible when you consider the pair. Preventing it requires real serializability: locking what was read (as two-phase locking does), detecting the dangerous read/write pattern (as serializable snapshot isolation does), or explicitly locking the rows checked (<code>SELECT ... FOR UPDATE</code>).</p>`,
        },
        {
          type: "lab",
          id: "isolation",
          caption: "Pick an isolation level and step through five classic anomalies, including write skew, to see what each step observes, who waits and who gets aborted.",
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Snapshot-based levels", html: "PostgreSQL defaults to read committed. Its repeatable read is snapshot isolation, and its serializable level (since 9.1) is serializable snapshot isolation, which tracks read/write dependencies and aborts a transaction when a dangerous pattern such as write skew appears." },
            { org: "MySQL InnoDB", title: "Repeatable read by default", html: "InnoDB defaults to repeatable read: plain reads use a consistent MVCC snapshot, while locking reads and writes use next-key locks that also block inserts into the scanned range." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Level names are not portable. The same label can mean lock-based isolation in one product and snapshot isolation in another, with different anomalies allowed. When correctness depends on it, check what your database actually implements rather than trusting the name.</p>`,
        },
        {
          type: "quiz",
          q: "Under snapshot isolation, two transactions each read a counter value of 10 and try to write 11. What happens?",
          options: [
            "Both commit and the counter ends at 11 (a lost update)",
            "The first to commit wins; the second gets a write conflict and must retry",
            "Both commit and the counter ends at 12",
            "Both are aborted",
          ],
          answer: 1,
          explain: "Both transactions write the same row, which is a write-write conflict, and snapshot isolation applies first committer wins. So lost updates are prevented. Write skew slips through only when the transactions write different rows.",
        },
      ],
    },
    {
      id: "concurrency-control",
      title: "Optimistic, multiversion and lock-based control",
      kicker: "Concurrency control",
      blocks: [
        {
          type: "text",
          html: `<p>There are three broad ways to enforce isolation, and real engines mix them.</p>
<p><strong>Optimistic concurrency control</strong> (OCC) assumes conflicts are rare. A transaction runs in three phases: a <em>read</em> phase that executes against a private workspace and records what it read and wrote, a <em>validation</em> phase that checks those sets against transactions that committed in the meantime, and a <em>write</em> phase that applies the changes if validation passed. Nobody waits for locks, but under heavy contention many transactions fail validation and redo their work.</p>
<p><strong>Multiversion concurrency control</strong> (MVCC) keeps several timestamped versions of each record. A reader sees the latest version committed before its snapshot, so <strong>readers never block writers and writers never block readers</strong>. Writers still need a rule for conflicting writes (first committer wins, or locks). The cost is garbage: old versions pile up until no snapshot can see them and a background process reclaims them.</p>
<p><strong>Pessimistic schemes</strong> prevent conflicts up front. Timestamp ordering gives each transaction a timestamp and aborts any operation that would break timestamp order; the <strong>Thomas write rule</strong> lets an outdated write simply be skipped rather than aborting. The most common pessimistic scheme, though, is locking.</p>`,
        },
        {
          type: "text",
          html: `<h3>Two-phase locking and deadlocks</h3>
<p>Under <strong>two-phase locking</strong> (2PL), a transaction acquires locks during a <em>growing phase</em> and releases them during a <em>shrinking phase</em>; once it has released any lock, it may not acquire another. That rule alone guarantees serializable schedules. <strong>Strict 2PL</strong>, the usual variant, holds write locks until commit so nobody reads uncommitted data.</p>
<p>The price is waiting, and waiting can form cycles. T1 locks row A and wants B; T2 locks B and wants A. Neither can proceed: a <strong>deadlock</strong>. Engines handle it in one of four ways.</p>`,
        },
        {
          type: "table",
          title: "Deadlock handling",
          headers: ["Approach", "How it works", "Downside"],
          rows: [
            ["Timeout", "Abort a transaction that waits too long", "Slow to react; may abort transactions that were merely slow"],
            ["Conservative 2PL", "Acquire every lock up front before starting", "Must know all locks in advance; reduces concurrency"],
            ["Detection", "Maintain a waits-for graph; when it has a cycle, abort a victim", "Graph maintenance cost; deadlocks happen and are resolved after the fact"],
            ["Avoidance (wait-die, wound-wait)", "Use start timestamps: wait-die lets an older transaction wait and aborts a younger requester; wound-wait lets an older transaction abort the younger holder, and a younger requester waits", "May abort transactions that would never have deadlocked"],
          ],
        },
        {
          type: "lab",
          id: "deadlock",
          caption: "Let two transactions lock rows in opposite orders under strict 2PL, then compare resolving the deadlock with a waits-for graph, wait-die, wound-wait or a timeout.",
        },
        {
          type: "compare",
          items: [
            { title: "Optimistic", tone: "info", html: "No waiting; validation at commit. Great when conflicts are rare, wasteful when they are common. FoundationDB, for example, checks conflicts at commit time." },
            { title: "Multiversion", tone: "ok", html: "Readers see a snapshot and never block. The basis of snapshot isolation in PostgreSQL, InnoDB and Oracle. Old versions must be garbage-collected." },
            { title: "Two-phase locking", tone: "warn", html: "Serializable by construction. Transactions wait for each other, so throughput suffers under contention, and deadlocks must be handled." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Detection after a pause", html: "A PostgreSQL backend that waits on a lock for <code>deadlock_timeout</code> (1 second by default) runs deadlock detection; if it finds a cycle, one transaction is aborted with a deadlock error." },
            { org: "MySQL InnoDB", title: "Immediate detection", html: "InnoDB detects deadlocks as they form (<code>innodb_deadlock_detect</code>, on by default) and rolls back a victim; separately, <code>innodb_lock_wait_timeout</code> (50 seconds by default) bounds any lock wait." },
          ],
        },
        {
          type: "quiz",
          q: "Under wait-die, an older transaction T1 requests a lock held by a younger transaction T2. What happens?",
          options: ["T1 aborts", "T1 waits", "T2 is aborted (wounded)", "Both abort"],
          answer: 1,
          explain: "Wait-die only lets older transactions wait for younger ones; a younger requester dies instead. Because waits always go from older to younger, no cycle can form. Under wound-wait, the same request would abort T2 instead.",
        },
      ],
    },
    {
      id: "latches",
      title: "Latches, latch crabbing and Blink-Trees",
      kicker: "Protecting the structure",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Locks</strong> and <strong>latches</strong> protect different things. A lock protects logical data, such as a key or a range, for the duration of a transaction, and is managed by the lock manager with deadlock handling. A latch protects a physical structure, usually a page in the buffer pool, for the duration of a single operation, such as reading a node or splitting it. Even a single transaction's insert must not let another thread see a page halfway through a split; that is a latching problem, not a locking one. Latches are typically readers-writer: many readers can share one, a writer needs it exclusively.</p>`,
        },
        {
          type: "problem",
          html: `<p>The safe and simple approach, latching every page from root to leaf for the whole insert, means every writer holds an exclusive latch on the root. All writers in the system queue on one page.</p>`,
        },
        {
          type: "idea",
          html: `<p><strong>Latch crabbing</strong>: move down the tree like a crab, grabbing the child before letting go of the parent, and let go of everything above as soon as you reach a <strong>safe</strong> node, one that this operation can't split (an insert into a node with free space) or merge (a delete from a node comfortably above half full). A change below a safe node can't propagate past it, so its ancestors don't need protection.</p>`,
        },
        {
          type: "diagram",
          title: "Latch crabbing during an insert",
          caption: "B has room, so once B is latched the root is released. C is full and might split into B, so B stays latched. At the leaf, the insert holds B, C and the leaf; everything above B is free for other threads.",
          svg: `<svg viewBox="0 0 600 270" role="img" aria-label="Latch crabbing down a B-Tree path: root released, B, C and the leaf held">
<rect x="40" y="20" width="140" height="40" rx="6" stroke-dasharray="5 4" style="fill: var(--dg-panel); stroke: var(--dg-muted)" stroke-width="2"/>
<text x="110" y="45" text-anchor="middle" font-size="13">Root</text>
<line x1="110" y1="60" x2="110" y2="85" stroke-width="2" style="stroke: var(--dg-line)"/>
<rect x="40" y="85" width="140" height="40" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="110" y="110" text-anchor="middle" font-size="13">B (has room)</text>
<line x1="110" y1="125" x2="110" y2="150" stroke-width="2" style="stroke: var(--dg-line)"/>
<rect x="40" y="150" width="140" height="40" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="110" y="175" text-anchor="middle" font-size="13">C (full)</text>
<line x1="110" y1="190" x2="110" y2="215" stroke-width="2" style="stroke: var(--dg-line)"/>
<rect x="40" y="215" width="140" height="40" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="110" y="240" text-anchor="middle" font-size="13">Leaf (full)</text>
<text x="210" y="45" font-size="12" style="fill: var(--dg-muted)">released as soon as B was latched and found safe</text>
<text x="210" y="110" font-size="12">held: a split from below stops here</text>
<text x="210" y="175" font-size="12">held: C may split and insert into B</text>
<text x="210" y="240" font-size="12">held: the insert will split this leaf</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Reads are even simpler: they never modify the structure, so a reader releases the parent the moment it holds the child. An <strong>optimistic</strong> variant applies the same thinking to writers: since most inserts don't split anything, descend with shared latches like a reader, take an exclusive latch only on the leaf, and if the leaf turns out to be unsafe, release everything and restart the descent with exclusive latches. The common case is cheap; the rare case pays twice.</p>`,
        },
        {
          type: "lab",
          id: "latchCrabbing",
          caption: "Set how full each node on the path is and step through an insert or delete to see which latches are held at each step, with pessimistic and optimistic crabbing.",
        },
        {
          type: "text",
          html: `<h3>Blink-Trees: not holding the parent at all</h3>
<p>Blink-Trees (from Lehman and Yao) add a <strong>high key</strong> and a <strong>right sibling link</strong> to every node, and split in two steps: first create the new right node and link it from the old one, then, separately, insert the separator into the parent. Between the two steps the tree is still navigable. A reader who reaches the old node looking for a key that moved compares it with the high key, sees it is too large, and follows the sibling link. Splits no longer need to hold the parent latch while working on the child, and readers never block on a split in progress.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Lehman and Yao in production", html: "PostgreSQL's B-Tree implementation follows Lehman and Yao: high keys and right links let readers \"move right\" past concurrent splits, so a reader holds a latch on only one page at a time during descent." },
          ],
        },
        {
          type: "quiz",
          q: "During an insert with latch crabbing, the thread latches node C and sees that C has plenty of free space. What can it do?",
          options: [
            "Nothing yet; latches are released only at commit",
            "Release the latches on all of C's ancestors, because a split below C cannot propagate above it",
            "Release C's latch and keep the ancestors",
            "Upgrade every ancestor latch to exclusive",
          ],
          answer: 1,
          explain: "C is safe for this insert: even if its child splits and adds a separator, C has room for it and won't split. So no ancestor of C can be affected, and holding their latches would only block other threads. Latches are per operation; transaction-long protection is the lock manager's job.",
        },
      ],
    },
    {
      id: "interview",
      title: "Transactions and recovery in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>This chapter is a rich source of interview questions because it connects to things engineers see in production: commit latency tied to fsync, recovery time after a crash, isolation-level bugs, deadlock errors, and contention on hot pages. Interviewers look for mechanism, not vocabulary.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Be ready to explain, each in a few sentences:</p>
<ol>
<li><strong>Durability</strong>: log first, flush the log at commit (group commit amortizes the fsync), flush pages lazily; a page may be written only after the log covering it.</li>
<li><strong>Steal / no-force and ARIES</strong>: why recovery needs both undo and redo; analysis, redo (repeat history), undo with CLRs; checkpoints bound recovery time.</li>
<li><strong>Isolation</strong>: the anomaly ladder, snapshot isolation's first-committer-wins rule, and a concrete write skew example with how to prevent it (serializable, SSI or <code>SELECT ... FOR UPDATE</code>).</li>
<li><strong>Concurrency control</strong>: OCC vs MVCC vs 2PL, and deadlock detection vs avoidance.</li>
<li><strong>Locks vs latches</strong>: logical and transaction-long vs physical and operation-long; latch crabbing and Blink-Trees.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>A good systems-design connection: the WAL is not only for recovery. Replication streams it to followers, and change data capture tools read it to publish row changes. One sequential log of every change is a remarkably reusable artifact.</p>`,
        },
        {
          type: "quiz",
          q: "A team sets their database to flush every dirty page at each commit to \"make recovery faster\". What do they gain and lose?",
          options: [
            "They gain nothing and lose nothing",
            "They move to a force policy: recovery needs less redo, but every commit waits for many random page writes, so commit latency and write volume rise sharply",
            "They make the WAL unnecessary for atomicity",
            "They prevent write skew",
          ],
          answer: 1,
          explain: "Forcing pages at commit removes the need to redo committed work, but turns one sequential log flush into many scattered page writes per commit and repeatedly rewrites hot pages. With steal still allowed, undo (and hence the log) is still required. Most engines choose no-force and keep recovery time in check with checkpoints instead.",
        },
      ],
    },
  ],
  takeaways: [
    "The buffer pool caches pages, absorbs repeated writes to hot pages and flushes lazily; engines manage it themselves because they know about B-Tree structure, scans and log ordering.",
    "FIFO evicts the B-Tree root first; LRU, CLOCK and frequency-based policies like TinyLFU keep it, and scan-resistant tweaks (midpoint insertion, ring buffers) stop one-off scans from flushing the cache.",
    "Write-ahead logging: log the change before the page, commit by flushing the log, and never flush a page beyond the durable log. Group commit amortizes the fsync.",
    "Steal requires undo and no-force requires redo; ARIES supports both with analysis, redo (repeating history) and undo with compensation log records, while fuzzy checkpoints bound recovery time.",
    "Isolation means serializability; weaker levels allow named anomalies, and snapshot isolation prevents lost updates but not write skew.",
    "OCC validates at commit, MVCC lets readers and writers proceed without blocking each other, and 2PL is serializable but must handle deadlocks by timeouts, detection or wait-die / wound-wait avoidance.",
    "Locks protect logical data for a transaction; latches protect pages for an operation. Latch crabbing releases ancestors at the first safe node, and Blink-Trees let readers move right past splits.",
  ],
  furtherReading: [
    { title: "ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging (Mohan et al., 1992)", note: "The original ARIES paper, published in ACM Transactions on Database Systems." },
    { title: "A Critique of ANSI SQL Isolation Levels (Berenson et al., 1995)", note: "Shows why the standard's anomaly definitions are ambiguous and introduces snapshot isolation formally." },
    { title: "Efficient Locking for Concurrent Operations on B-Trees (Lehman and Yao, 1981)", note: "The Blink-Tree paper: high keys and right links for concurrent splits." },
    { title: "PostgreSQL documentation: Transaction Isolation", url: "https://www.postgresql.org/docs/current/transaction-iso.html", note: "How each isolation level behaves in PostgreSQL, including serializable snapshot isolation." },
  ],
};
