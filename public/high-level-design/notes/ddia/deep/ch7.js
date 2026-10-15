// Deep dive: DDIA Chapter 7, Transactions. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>A hospital scheduling app has one rule: at least one doctor must be on call for every shift. Alice and Bob are both on call tonight, both feel ill, and both press "go off call" within the same second. Each request checks the rule ("is anyone else on call? yes, one other doctor"), each passes, each commits. Tonight nobody is on call, and the database never raised an error.</p>
<p>The code was correct when run alone. The database was running a respected isolation level, the default "Repeatable Read" or "Snapshot" mode that most teams never question. The bug lives in the gap between what developers assume a transaction protects them from and what the database actually promises. This chapter is about closing that gap: what transactions guarantee, which anomalies each isolation level lets through, and the three ways to get the full guarantee when you need it.</p>`,
  sections: [
    {
      id: "what-acid-means",
      title: "What a transaction actually promises",
      kicker: "Untangling ACID",
      blocks: [
        {
          type: "problem",
          html: `<p>Real applications fail halfway. The process crashes after debiting one account but before crediting the other; the network drops after the order row is written but before the inventory row is. Two users edit the same record at once. Without help from the database, every piece of application code would need its own recovery and concurrency logic, and most would get it wrong.</p>`,
        },
        {
          type: "idea",
          html: `<p>A <strong>transaction</strong> groups several reads and writes into one logical unit that either takes effect completely or not at all, and that is protected (to some degree) from other transactions running at the same time. It moves a whole class of failure handling out of the application and into the database.</p>`,
        },
        {
          type: "text",
          html: `<p>The four letters of ACID are not equally precise, so it pays to read each one carefully.</p>
<ul>
<li><strong>Atomicity</strong> is not about concurrency at all. It means that if a transaction fails partway, the database discards every write it made. "Abortability" would be a more honest name: the useful property is that you can safely retry after an error, because nothing half-applied is left behind.</li>
<li><strong>Consistency</strong> means your data satisfies certain invariants, such as "debits equal credits". The database can enforce a few of these (foreign keys, uniqueness, check constraints), but most invariants live in application logic. The C is really the application's job; the database only supplies the tools.</li>
<li><strong>Isolation</strong> is about concurrency: transactions running at the same time should not trip over each other. The textbook ideal is serializability, where the result equals some one-at-a-time ordering. In practice most databases default to something weaker, which is where the rest of this chapter lives.</li>
<li><strong>Durability</strong> means committed data is not lost. On one machine that means a write-ahead log flushed to disk with <code>fsync</code>; in a replicated system it means the write reached several nodes. Neither is absolute: disks fail, firmware lies about flushes, and a whole datacenter can lose power.</li>
</ul>`,
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>The term ACID was coined by Theo H&auml;rder and Andreas Reuter in 1983. BASE (basically available, soft state, eventually consistent) came later as a deliberate counterpoint from the NoSQL world. Neither acronym tells you exactly what a given product guarantees, which is why you should always ask "which isolation level, and what does it prevent?"</p>`,
        },
        {
          type: "table",
          title: "Who is responsible for each letter",
          headers: ["Letter", "Really about", "Mechanism", "Who owns it"],
          rows: [
            ["Atomicity", "Undoing partial work on failure", "Undo log, or MVCC versions that are simply never made visible", "Database"],
            ["Consistency", "Application invariants", "Constraints plus application checks inside transactions", "Mostly the application"],
            ["Isolation", "Concurrent transactions not interfering", "Locks, MVCC snapshots, conflict detection", "Database, at the level you choose"],
            ["Durability", "Committed data surviving crashes", "Write-ahead log, fsync, replication", "Database plus hardware"],
          ],
        },
        {
          type: "text",
          html: `<p>Transactions can touch one object or many. Almost every storage engine gives you single-object atomicity and isolation (a crash mid-write will not leave half a JSON document, and an increment will not be torn). The hard part, and the part distributed databases often drop, is <strong>multi-object</strong> transactions: updating a row and its secondary index, or two rows in different tables, as one unit. Many NoSQL systems launched without them, arguing they did not scale; several have since added them back.</p>`,
        },
        {
          type: "quiz",
          q: "A payment service retries a transfer after a timeout, and the transfer is applied twice. Which ACID property would have prevented this?",
          options: ["Atomicity", "Isolation", "Durability", "None of them on its own"],
          answer: 3,
          explain: "Atomicity guarantees an aborted transaction leaves no trace, but here the first attempt may have committed and only the reply was lost. The database cannot tell a retry from a new request. You need an idempotency key (a unique request ID checked inside the transaction) so the second attempt is recognised and skipped.",
        },
      ],
    },
    {
      id: "read-committed-and-snapshots",
      title: "Read committed and snapshot isolation",
      kicker: "Weak isolation, part 1",
      blocks: [
        {
          type: "text",
          html: `<p>Serializable isolation costs throughput, so databases offer weaker levels that block the most common problems cheaply. The two you will meet most are read committed and snapshot isolation.</p>
<h3>Read committed</h3>
<p>Read committed makes two promises. <strong>No dirty reads</strong>: you never see another transaction's uncommitted writes, so you never act on data that might be rolled back. <strong>No dirty writes</strong>: you never overwrite another transaction's uncommitted write; the second writer waits for the first to commit or abort. Dirty writes are prevented with row-level write locks. Dirty reads are usually prevented not with read locks (one slow writer would stall every reader) but by remembering the last committed value and handing that to readers until the new value commits.</p>
<p>Read committed is the default in PostgreSQL, Oracle and SQL Server. It still allows <strong>read skew</strong> (also called a non-repeatable read): within one transaction you can read account A, someone transfers $100 from A to B and commits, and you then read B. Your two reads come from different moments and the total appears $100 short. For a short web request that is often fine. For a backup, an analytics query or an integrity check that runs for minutes, it produces nonsense.</p>
<h3>Snapshot isolation</h3>
<p>Snapshot isolation fixes read skew: every transaction reads from a consistent snapshot of the database as of the moment it started. Writes committed after that moment are invisible to it, no matter how long it runs. The guiding rule is that <em>readers never block writers and writers never block readers</em>.</p>`,
        },
        {
          type: "text",
          html: `<h3>How MVCC makes snapshots cheap</h3>
<p>Copying the database per transaction is obviously impossible. Instead, engines use <strong>multi-version concurrency control (MVCC)</strong>: an update does not overwrite a row in place, it writes a new version and marks the old one as superseded. Each version records which transaction created it and which deleted it. In PostgreSQL these are the hidden <code>xmin</code> and <code>xmax</code> columns on every row.</p>
<p>When a transaction starts, it records which transactions had committed at that point. A row version is visible to it if the creator had committed by then, and the deleter (if any) had not. Old versions that no transaction can see any more are reclaimed later, by <code>VACUUM</code> in PostgreSQL or by the purge thread in InnoDB, which keeps old versions in its undo log.</p>`,
        },
        {
          type: "diagram",
          title: "Two transactions, two snapshots, one row",
          caption: "Transaction 130 updates a balance from 500 to 400 by writing a new version. Transaction 120 started before 130 committed, so it keeps seeing 500; transaction 140 started after, so it sees 400.",
          svg: `<svg viewBox="0 0 640 240" role="img" aria-label="MVCC: an old row version with balance 500 and a new version with balance 400, each visible to a different transaction">
<defs><marker id="ddia7-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="40" y="40" width="230" height="80" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="155" y="66" text-anchor="middle" font-size="14" font-weight="700">balance = 500</text>
<text x="155" y="88" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">xmin = 100 (created)</text>
<text x="155" y="108" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">xmax = 130 (superseded)</text>
<rect x="370" y="40" width="230" height="80" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="485" y="66" text-anchor="middle" font-size="14" font-weight="700">balance = 400</text>
<text x="485" y="88" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">xmin = 130 (created)</text>
<text x="485" y="108" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">xmax = none (current)</text>
<line x1="272" y1="80" x2="366" y2="80" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia7-arrow)"/>
<text x="320" y="72" text-anchor="middle" font-size="12">update</text>
<text x="320" y="98" text-anchor="middle" font-size="12">by tx 130</text>
<rect x="40" y="168" width="230" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="155" y="191" text-anchor="middle" font-size="13" font-weight="700">Tx 120 (older snapshot)</text>
<text x="155" y="211" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">reads balance = 500</text>
<rect x="370" y="168" width="230" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="485" y="191" text-anchor="middle" font-size="13" font-weight="700">Tx 140 (newer snapshot)</text>
<text x="485" y="211" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">reads balance = 400</text>
<line x1="155" y1="166" x2="155" y2="124" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia7-arrow)"/>
<line x1="485" y1="166" x2="485" y2="124" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia7-arrow)"/>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "Repeatable Read is snapshot isolation", html: "Its <code>REPEATABLE READ</code> level is true snapshot isolation, and its default <code>READ COMMITTED</code> takes a fresh snapshot per statement rather than per transaction." },
            { org: "MySQL InnoDB", title: "Repeatable Read by default", html: "Plain <code>SELECT</code>s read from a transaction-wide snapshot, but <code>UPDATE</code> and locking reads operate on the latest committed row. That mix is why InnoDB does not detect lost updates the way PostgreSQL does." },
            { org: "Oracle", title: "Misleading names", html: "Oracle's level called <code>SERIALIZABLE</code> is actually snapshot isolation, so it permits write skew. The SQL standard's level names predate snapshot isolation and fit it poorly, so vendors label it differently." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Isolation level names are not portable. "Repeatable Read" means snapshot isolation in PostgreSQL, a snapshot-plus-locking hybrid in MySQL, and something closer to locking reads in the SQL standard. Read your database's documentation for the actual anomalies it prevents, or test it: Kleppmann's open-source Hermitage project runs the same anomaly scenarios against many databases.</p>`,
        },
      ],
    },
    {
      id: "lost-updates",
      title: "Lost updates: when two writers read the same value",
      kicker: "Weak isolation, part 2",
      blocks: [
        {
          type: "problem",
          html: `<p>Read committed and snapshot isolation are about what a transaction <em>sees</em>. They say little about two transactions that both <em>write</em> based on what they saw. The classic case is the read-modify-write cycle: read a value, compute a new one in application code, write it back.</p>`,
        },
        {
          type: "diagram",
          title: "A lost update",
          caption: "Both transactions read 42, both add one, both write 43. One increment silently disappears, and no isolation level below serializable is guaranteed to stop it on its own.",
          svg: `<svg viewBox="0 0 640 270" role="img" aria-label="Two transactions read a counter of 42, each write 43, and one increment is lost">
<defs><marker id="ddia7-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="64" font-size="13" font-weight="700">Tx 1</text>
<text x="20" y="146" font-size="13" font-weight="700">counter</text>
<text x="20" y="224" font-size="13" font-weight="700">Tx 2</text>
<line x1="100" y1="60" x2="620" y2="60" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="100" y1="141" x2="620" y2="141" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="100" y1="220" x2="620" y2="220" stroke-width="1" style="stroke: var(--dg-line)"/>
<rect x="120" y="43" width="110" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="175" y="65" text-anchor="middle" font-size="12">read: 42</text>
<rect x="320" y="43" width="140" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="390" y="65" text-anchor="middle" font-size="12">write 42+1 = 43</text>
<rect x="200" y="203" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="255" y="225" text-anchor="middle" font-size="12">read: 42</text>
<rect x="470" y="203" width="140" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="540" y="225" text-anchor="middle" font-size="12">write 42+1 = 43</text>
<rect x="110" y="126" width="60" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="140" y="146" text-anchor="middle" font-size="13" font-weight="700">42</text>
<rect x="380" y="126" width="60" height="30" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="410" y="146" text-anchor="middle" font-size="13" font-weight="700">43</text>
<rect x="520" y="126" width="60" height="30" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="550" y="146" text-anchor="middle" font-size="13" font-weight="700">43</text>
<text x="550" y="114" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">should be 44</text>
<line x1="146" y1="124" x2="166" y2="81" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia7-arrow2)"/>
<line x1="400" y1="79" x2="408" y2="122" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia7-arrow2)"/>
<line x1="160" y1="158" x2="240" y2="199" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia7-arrow2)"/>
<line x1="545" y1="201" x2="550" y2="160" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia7-arrow2)"/>
<line x1="100" y1="256" x2="620" y2="256" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ddia7-arrow2)"/>
<text x="56" y="260" font-size="12" style="fill: var(--dg-muted)">time</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The same shape appears everywhere: incrementing a like counter, appending to a JSON list stored in one column, two people editing the same wiki page. There are four standard defences, roughly in order of preference.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Four ways to avoid a lost update",
          code: `-- 1. Atomic operation: the database does the read-modify-write under a lock
UPDATE counters SET value = value + 1 WHERE id = 7;

-- 2. Explicit lock: hold the row until commit
BEGIN;
SELECT value FROM counters WHERE id = 7 FOR UPDATE;
-- ... compute in application code ...
UPDATE counters SET value = 43 WHERE id = 7;
COMMIT;

-- 3. Compare-and-set: only write if nobody changed it since we read it
UPDATE docs SET body = 'new text', version = 8
WHERE id = 7 AND version = 7;   -- 0 rows updated means retry

-- 4. Automatic detection (PostgreSQL REPEATABLE READ):
-- the second writer fails with "could not serialize access
-- due to concurrent update" and the application retries`,
        },
        {
          type: "compare",
          items: [
            { title: "Atomic operations", tone: "ok", html: "Simplest and fastest when the change can be expressed in the database (<code>value + 1</code>, <code>$push</code> in MongoDB, <code>INCR</code> in Redis). Not possible when the new value depends on complex application logic." },
            { title: "Explicit locks", tone: "info", html: "<code>SELECT ... FOR UPDATE</code> works for any logic but is easy to forget in one code path, and long-held locks hurt throughput and can deadlock." },
            { title: "Compare-and-set", tone: "info", html: "Optimistic: no locks, just a version check at write time. Great for rare conflicts. Be careful on snapshot engines: the <code>WHERE</code> must check the current row, not your stale snapshot." },
            { title: "Automatic detection", tone: "warn", html: "Least code, but only some engines do it (PostgreSQL Repeatable Read, Oracle Serializable, SQL Server Snapshot). InnoDB Repeatable Read does not, so code that relies on it is not portable." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Replicated databases make this harder. With multi-leader or leaderless replication, two replicas can accept conflicting writes at the same time, so locks and compare-and-set on one node do not help. Those systems instead keep concurrent versions as siblings for the application to merge, use commutative operations such as counters and CRDTs, or fall back to last-write-wins, which loses updates by design.</p>`,
        },
        {
          type: "quiz",
          q: "Two web servers run <code>SELECT stock FROM items WHERE id=1</code>, see 5, and each run <code>UPDATE items SET stock = 4 WHERE id=1</code> under snapshot isolation in MySQL InnoDB. What is the final stock?",
          options: ["3, because snapshot isolation serializes the writes", "4: one decrement is lost", "The second transaction aborts with a serialization error", "Undefined: the row is corrupted"],
          answer: 1,
          explain: "Both computed 4 from the same snapshot and wrote a constant. InnoDB's Repeatable Read does not detect lost updates, so the second write simply overwrites the first. Writing <code>stock = stock - 1</code>, locking with FOR UPDATE, or adding <code>AND stock = 5</code> would all fix it. PostgreSQL's Repeatable Read would instead abort the second transaction.",
        },
      ],
    },
    {
      id: "write-skew-and-phantoms",
      title: "Write skew and phantoms",
      kicker: "The anomaly snapshots miss",
      blocks: [
        {
          type: "problem",
          html: `<p>A lost update has two transactions writing the <em>same</em> row, so the database can at least notice the collision. Write skew is sneakier: two transactions read the same data, then each writes a <em>different</em> row. No row is written twice, so no lock or version check fires, yet together they break a rule that each one checked.</p>`,
        },
        {
          type: "diagram",
          title: "Write skew: the on-call doctors",
          caption: "Both transactions count two doctors on call in their own snapshot, then each updates only its own row. The writes never touch the same row, so snapshot isolation commits both.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="Alice and Bob each see two doctors on call, each go off call, and nobody is left on call">
<text x="20" y="64" font-size="13" font-weight="700">Alice</text>
<text x="20" y="134" font-size="13" font-weight="700">table</text>
<text x="20" y="204" font-size="13" font-weight="700">Bob</text>
<line x1="90" y1="60" x2="620" y2="60" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="90" y1="200" x2="620" y2="200" stroke-width="1" style="stroke: var(--dg-line)"/>
<rect x="100" y="43" width="160" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="180" y="65" text-anchor="middle" font-size="12">count on call: 2</text>
<rect x="300" y="43" width="150" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="375" y="65" text-anchor="middle" font-size="12">set Alice off call</text>
<rect x="490" y="43" width="90" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="535" y="65" text-anchor="middle" font-size="12">commit</text>
<rect x="130" y="183" width="160" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="210" y="205" text-anchor="middle" font-size="12">count on call: 2</text>
<rect x="330" y="183" width="150" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="405" y="205" text-anchor="middle" font-size="12">set Bob off call</text>
<rect x="510" y="183" width="90" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="555" y="205" text-anchor="middle" font-size="12">commit</text>
<rect x="100" y="113" width="170" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="185" y="135" text-anchor="middle" font-size="12">on call: Alice, Bob</text>
<text x="375" y="135" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">each snapshot still shows 2</text>
<rect x="480" y="113" width="140" height="34" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="550" y="135" text-anchor="middle" font-size="12" font-weight="700">on call: nobody</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The pattern always has three steps: a <code>SELECT</code> checks a condition, the application decides based on the result, and a write changes the data so that the condition no longer holds. Other examples: two users claim the same username when uniqueness is checked in code, two bookings for the same meeting room at overlapping times, two withdrawals that each leave the balance non-negative on their own but negative together, two players moving pieces onto the same square.</p>
<p>When the check is about rows that <em>already exist</em> (the doctors' rows), you can fix it by locking them: <code>SELECT ... FROM doctors WHERE on_call AND shift_id = 1234 FOR UPDATE</code> forces the second transaction to wait, and when it resumes it sees the first one's change.</p>
<h3>Phantoms</h3>
<p>When the check is about the <em>absence</em> of rows ("no booking overlaps 2 to 3pm in room 101"), there is nothing to lock. A write in one transaction that changes the result of a search query in another is called a <strong>phantom</strong>. Snapshot isolation hides phantoms from read-only queries, but in a read-then-write transaction they cause exactly this kind of write skew.</p>`,
        },
        {
          type: "steps",
          title: "Workarounds short of serializable isolation",
          items: [
            "<strong>Use a constraint the database can enforce.</strong> A unique index stops duplicate usernames. PostgreSQL exclusion constraints (<code>EXCLUDE USING gist (room_id WITH =, during WITH &amp;&amp;)</code>) reject overlapping time ranges outright.",
            "<strong>Lock the rows you read</strong> with <code>FOR UPDATE</code>, when the condition depends on rows that exist.",
            "<strong>Materialize the conflict.</strong> Pre-create one row per room per 15-minute slot and lock those rows. It works, but it leaks concurrency control into the data model, so treat it as a last resort.",
            "<strong>Switch to serializable isolation</strong>, which catches the general case. The next three sections are the three ways to implement it.",
          ],
        },
        {
          type: "quiz",
          q: "Which of these is write skew rather than a lost update?",
          options: [
            "Two transactions both increment the same view counter",
            "Two transactions both overwrite the same wiki page",
            "Two transactions each insert a booking after checking that no overlapping booking exists",
            "One transaction reads a row that another has written but not committed",
          ],
          answer: 2,
          explain: "The bookings are different rows; the conflict is between each transaction's check and the other's insert, a phantom-driven write skew. The first two write the same row (lost updates), and the last is a dirty read.",
        },
      ],
    },
    {
      id: "serial-execution",
      title: "Serializability option 1: just run one at a time",
      kicker: "Actual serial execution",
      blocks: [
        {
          type: "idea",
          html: `<p>The simplest way to avoid concurrency anomalies is to remove concurrency: execute transactions one after another on a single thread. The result is serializable by definition, with no locks to take and no conflicts to detect.</p>`,
        },
        {
          type: "text",
          html: `<p>For decades this was considered absurd, because a transaction waiting on a disk read would stall everyone. Two changes made it reasonable around the late 2000s. RAM became cheap enough to hold many OLTP datasets entirely in memory, so a transaction never waits for disk. And it became clear that OLTP transactions are usually short and touch few rows; the long-running analytical queries can run against a snapshot, outside the serial loop.</p>
<p>The catch is that the loop cannot wait for anything, including the application. An interactive transaction (begin, query, think in application code, query again, commit) spends most of its time on network round-trips, during which a single-threaded engine would sit idle. So serial engines require the whole transaction to be submitted up front, as a <strong>stored procedure</strong> or script that runs start to finish without talking to the client.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "VoltDB", title: "Partitioned serial execution", html: "Grew out of the H-Store research project. Transactions are Java stored procedures; each partition has its own single-threaded executor, and a transaction that touches several partitions needs cross-partition coordination, which is far slower." },
            { org: "Redis", title: "One thread executes commands", html: "Commands run one at a time, so <code>MULTI</code>/<code>EXEC</code> blocks and Lua scripts execute atomically with nothing interleaved. A slow script blocks every other client for its whole duration." },
            { org: "Datomic", title: "A single transactor", html: "All writes go through one transactor process that applies them in order, while reads scale out across peers that work from immutable snapshots." },
          ],
        },
        {
          type: "tradeoffs",
          pros: [
            "Serializable with no locking or conflict-detection overhead",
            "No deadlocks and no aborts caused by concurrency",
            "Very predictable latency for short transactions",
          ],
          cons: [
            "Throughput is capped at what one CPU core can do per partition",
            "Every transaction must be small, fast and submitted whole (stored procedures)",
            "The active dataset must fit in memory, or one disk wait stalls everyone",
            "Transactions spanning partitions need coordination and lose most of the speed",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Stored procedures earned a bad reputation because of vendor-specific languages (PL/SQL, T-SQL) that were hard to version, test and debug. Modern serial engines let you write them in general-purpose languages (Java in VoltDB, Lua in Redis), which removes much of that pain, but deploying code into the database is still a different workflow from deploying a service.</p>`,
        },
      ],
    },
    {
      id: "two-phase-locking",
      title: "Serializability option 2: two-phase locking",
      kicker: "The pessimistic classic",
      blocks: [
        {
          type: "text",
          html: `<p>For about thirty years, two-phase locking (2PL) was <em>the</em> way databases implemented serializability. It strengthens the write locks you already have under read committed: <strong>readers also take locks, and writers wait for readers</strong>.</p>
<ul>
<li>To read an object, take a <strong>shared</strong> lock. Many transactions can share it at once.</li>
<li>To write an object, take an <strong>exclusive</strong> lock. Nobody else can hold any lock on it, shared or exclusive.</li>
<li>Hold every lock until the transaction commits or aborts.</li>
</ul>
<p>The "two phases" are acquiring locks while the transaction runs, then releasing them all at the end. Notice the contrast with snapshot isolation: there, readers and writers never block each other; under 2PL they always do. That blocking is exactly what prevents lost updates and write skew, because the second transaction cannot act on data the first one has read until the first finishes.</p>`,
        },
        {
          type: "table",
          title: "Lock compatibility under 2PL",
          headers: ["Held \\ Requested", "Shared (read)", "Exclusive (write)"],
          rows: [
            ["None", "Granted", "Granted"],
            ["Shared", "Granted", "Wait"],
            ["Exclusive", "Wait", "Wait"],
          ],
        },
        {
          type: "text",
          html: `<h3>Locking things that do not exist yet</h3>
<p>Row locks cannot stop phantoms, because the row that would conflict has not been inserted. The theoretical fix is a <strong>predicate lock</strong>: lock every row, present or future, that matches a condition such as <code>room_id = 101 AND time overlaps 14:00-15:00</code>. Checking every new write against every active predicate is too slow, so real engines use <strong>index-range locks</strong> (called next-key or gap locks in InnoDB): they lock a range of an index that covers the predicate, perhaps all bookings for room 101, accepting that they lock more than strictly necessary. Without a suitable index, the engine may fall back to locking the whole table.</p>
<h3>Deadlocks and tail latency</h3>
<p>Because transactions wait on each other, two of them can each wait for a lock the other holds. The engine detects the cycle and aborts one, which the application must retry. InnoDB checks for deadlocks immediately; PostgreSQL waits for <code>deadlock_timeout</code> (one second by default) before looking.</p>
<p>The deeper cost is unpredictability. One slow transaction holding locks can stall a queue of others behind it, so 2PL databases often have fine median latency and terrible high percentiles under contention.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "MySQL InnoDB", title: "SERIALIZABLE", html: "Turns plain <code>SELECT</code>s into shared-locking reads (when autocommit is off) and uses next-key locks to cover gaps in indexes." },
            { org: "SQL Server", title: "SERIALIZABLE", html: "Uses key-range locks on indexes to block phantom inserts." },
            { org: "Google Spanner", title: "Read-write transactions", html: "Uses pessimistic locking with a wound-wait scheme to avoid deadlocks, while read-only transactions run lock-free at a snapshot timestamp." },
          ],
        },
        {
          type: "quiz",
          q: "Under 2PL, a long analytics query reads every row of the orders table. What happens to checkout transactions that try to insert or update orders while it runs?",
          options: [
            "They proceed normally, because readers never block writers",
            "They wait until the analytics query commits",
            "They abort immediately with a serialization error",
            "They write to a new row version that the query ignores",
          ],
          answer: 1,
          explain: "The query holds shared locks (or a range or table lock) until it finishes, and writers need exclusive locks, so they queue behind it. That is why long reads and 2PL mix badly, and why MVCC snapshots, where readers never block writers, became so popular.",
        },
      ],
    },
    {
      id: "serializable-snapshot-isolation",
      title: "Serializability option 3: serializable snapshot isolation",
      kicker: "The optimistic modern default",
      blocks: [
        {
          type: "idea",
          html: `<p>Let every transaction run on a snapshot, without blocking, as in snapshot isolation. Meanwhile, track what each one read. At commit time, if something it read has since been changed by a transaction that committed first, the premise of its decisions is stale, so abort it and let the application retry.</p>`,
        },
        {
          type: "text",
          html: `<p>Serializable snapshot isolation (SSI) was described by Michael Cahill, Uwe R&ouml;hm and Alan Fekete in 2008 and shipped as PostgreSQL's <code>SERIALIZABLE</code> level in version 9.1 (2011). It is optimistic concurrency control layered on MVCC, and it targets exactly the write-skew pattern: a transaction acted on a premise, and the premise changed under it.</p>
<p>The engine watches for two situations:</p>
<ul>
<li><strong>Reading a version that was already stale.</strong> When a transaction reads a row, MVCC may skip a newer version written by a transaction that has not committed yet. The engine remembers that it ignored that write. If the writer commits first, the reader's view was out of date, so the reader is aborted when it tries to commit.</li>
<li><strong>Writing data that someone else read.</strong> When a transaction writes, the engine checks which concurrent transactions recently read that data (PostgreSQL records this with non-blocking <code>SIREAD</code> locks, often at index-range granularity) and flags them. The flag does not block anyone; it is checked at commit.</li>
</ul>
<p>In the doctors example, Alice's transaction read the on-call rows that Bob's transaction later wrote, and vice versa. Whichever commits second finds that its read set was changed by a committed transaction, and gets <code>ERROR: could not serialize access due to read/write dependencies among transactions</code> (SQLSTATE 40001). On retry, it sees only one doctor on call and refuses.</p>`,
        },
        {
          type: "diagram",
          title: "SSI catches the doctors' write skew at commit",
          caption: "Both transactions run on snapshots with no blocking. Each reads rows the other writes. The first to commit wins; the second finds its premise was invalidated and aborts.",
          svg: `<svg viewBox="0 0 640 250" role="img" aria-label="Serializable snapshot isolation lets two transactions run, then aborts the second to commit because its reads were changed">
<defs><marker id="ddia7-arrow3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-bad)"/></marker></defs>
<text x="20" y="64" font-size="13" font-weight="700">Alice</text>
<text x="20" y="204" font-size="13" font-weight="700">Bob</text>
<line x1="90" y1="60" x2="620" y2="60" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="90" y1="200" x2="620" y2="200" stroke-width="1" style="stroke: var(--dg-line)"/>
<rect x="100" y="43" width="150" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="175" y="65" text-anchor="middle" font-size="12">read on-call rows</text>
<rect x="270" y="43" width="150" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="345" y="65" text-anchor="middle" font-size="12">write Alice's row</text>
<rect x="440" y="43" width="110" height="34" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="495" y="65" text-anchor="middle" font-size="12" font-weight="700">commit: OK</text>
<rect x="120" y="183" width="150" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="195" y="205" text-anchor="middle" font-size="12">read on-call rows</text>
<rect x="290" y="183" width="150" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="365" y="205" text-anchor="middle" font-size="12">write Bob's row</text>
<rect x="470" y="183" width="140" height="34" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="540" y="205" text-anchor="middle" font-size="12" font-weight="700">commit: ABORT</text>
<line x1="495" y1="79" x2="535" y2="179" stroke-width="2" style="stroke: var(--dg-bad)" stroke-dasharray="5 4" marker-end="url(#ddia7-arrow3)"/>
<text x="300" y="120" font-size="12" style="fill: var(--dg-muted)">Alice committed a write</text>
<text x="300" y="138" font-size="12" style="fill: var(--dg-muted)">to rows Bob had read,</text>
<text x="300" y="156" font-size="12" style="fill: var(--dg-muted)">so Bob's premise is stale</text>
</svg>`,
        },
        {
          type: "table",
          title: "The three routes to serializability",
          headers: ["", "Serial execution", "Two-phase locking", "SSI"],
          rows: [
            ["Approach", "No concurrency at all", "Pessimistic: lock before acting", "Optimistic: detect at commit"],
            ["Readers block writers?", "Not applicable", "Yes", "No"],
            ["Deadlocks", "None", "Yes, detected and aborted", "None (aborts instead)"],
            ["Fails how under contention", "Queue builds up behind one thread", "Lock waits, latency spikes", "Many aborts and retries"],
            ["Best fit", "Tiny in-memory transactions", "High contention on a few hot rows", "Read-heavy OLTP, rare conflicts"],
            ["Examples", "VoltDB, Redis, Datomic", "InnoDB and SQL Server SERIALIZABLE, Spanner", "PostgreSQL SERIALIZABLE, CockroachDB, FoundationDB (optimistic)"],
          ],
        },
        {
          type: "text",
          html: `<p>SSI's performance depends on keeping transactions short and conflicts rare. A long read-write transaction has a large read set and a long window in which someone can invalidate it, so it is likely to abort, possibly repeatedly. Under heavy contention on hot rows, a pessimistic scheme that makes transactions wait can do less wasted work than one that lets them run and then throws the work away.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Since 2017, serializable-by-default has spread among distributed SQL databases. CockroachDB launched with <code>SERIALIZABLE</code> as its only level and added <code>READ COMMITTED</code> later (around 2024), mainly to ease migrations from PostgreSQL. FoundationDB, open-sourced by Apple in 2018, is serializable through optimistic conflict checks and caps transactions at five seconds to keep read sets small. Meanwhile Kyle Kingsbury's Jepsen analyses keep finding databases whose isolation does not match their documentation, which is a good reason to test rather than trust a label.</p>`,
        },
        {
          type: "quiz",
          q: "Your PostgreSQL service switches to SERIALIZABLE and starts seeing occasional errors with SQLSTATE 40001. What is the correct response?",
          options: [
            "Switch back to READ COMMITTED; the errors mean SERIALIZABLE is broken",
            "Retry the whole transaction from the start, ideally with a capped number of attempts",
            "Retry only the statement that failed",
            "Add FOR UPDATE to every SELECT so the errors disappear",
          ],
          answer: 1,
          explain: "40001 is SSI working as designed: it detected that committing would break serializability. The whole transaction must be re-run because its earlier reads, and the decisions based on them, are stale. Retrying just the last statement would keep the stale premise. Keep transactions short to make these aborts rare.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Transactions come up whenever a design has money, inventory, bookings or uniqueness rules: a payment system, a ticketing or hotel-booking system, a username service, a counter. The interviewer wants to hear that you know which anomalies your chosen database lets through by default, and what you would add to stop them.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer to "how do you prevent double-booking?" covers these points:</p>
<ol>
<li>Name the anomaly: two concurrent check-then-insert transactions is write skew via a phantom, which snapshot isolation (the default in many databases) does not prevent.</li>
<li>Prefer a constraint the database enforces: a unique index on (seat, show) or an exclusion constraint on overlapping time ranges.</li>
<li>Otherwise lock what you read (<code>SELECT ... FOR UPDATE</code>) or run at <code>SERIALIZABLE</code> and retry on serialization failures.</li>
<li>Make the request idempotent with a client-supplied key so retries after timeouts do not double-charge.</li>
</ol>
<p>Bonus points: mention that isolation level names differ by vendor, and that SSI aborts mean retry logic is part of the application.</p>`,
        },
        {
          type: "table",
          title: "Quick reference: anomalies by isolation level",
          headers: ["Level", "Dirty read", "Dirty write", "Read skew", "Lost update", "Write skew / phantom"],
          rows: [
            ["Read uncommitted", "Possible", "Prevented", "Possible", "Possible", "Possible"],
            ["Read committed", "Prevented", "Prevented", "Possible", "Possible", "Possible"],
            ["Snapshot isolation", "Prevented", "Prevented", "Prevented", "Engine-dependent", "Possible"],
            ["Serializable", "Prevented", "Prevented", "Prevented", "Prevented", "Prevented"],
          ],
          note: "\"Engine-dependent\": PostgreSQL Repeatable Read detects lost updates and aborts; MySQL InnoDB Repeatable Read does not.",
        },
        {
          type: "quiz",
          q: "An interviewer asks how to keep a bank balance from going negative when two withdrawals of $80 hit a $100 account at once, using PostgreSQL at its default isolation level. Which answer is safest?",
          options: [
            "Read the balance, check it in application code, then UPDATE",
            "Run <code>UPDATE accounts SET balance = balance - 80 WHERE id = 1 AND balance &gt;= 80</code> and check the row count",
            "Rely on snapshot isolation, since each withdrawal sees a consistent balance",
            "Use a cache with a TTL to remember recent withdrawals",
          ],
          answer: 1,
          explain: "The conditional atomic update does the check and the write as one step under a row lock, so the second withdrawal re-evaluates the condition against the committed balance of 20 and updates 0 rows. A read-then-write in application code at Read Committed is a classic lost update or write skew.",
        },
      ],
    },
  ],
  takeaways: [
    "Atomicity is about <strong>aborting</strong> cleanly on failure, not concurrency; consistency is mostly the application's job; isolation is the letter with the most variation between databases.",
    "Read committed blocks dirty reads and writes; snapshot isolation (via MVCC row versions) also blocks read skew, and its readers and writers never block each other.",
    "Lost updates come from read-modify-write cycles. Fix them with atomic updates, <code>FOR UPDATE</code>, compare-and-set, or an engine that detects them.",
    "Write skew is a check-then-write on <em>different</em> rows, and snapshot isolation allows it. Phantoms make it worse because there is no existing row to lock.",
    "Serializability has three implementations: serial execution (small in-memory transactions), two-phase locking (pessimistic, deadlocks, tail latency) and SSI (optimistic, aborts on conflict).",
    "Isolation level names are not portable: always check what your database's \"Repeatable Read\" or \"Serializable\" actually prevents.",
    "Under SERIALIZABLE, serialization failures are expected; the application must retry the whole transaction.",
  ],
  furtherReading: [
    { title: "PostgreSQL documentation: Transaction Isolation", url: "https://www.postgresql.org/docs/current/transaction-iso.html", note: "Precise description of what each level prevents in PostgreSQL, including SSI." },
    { title: "A Critique of ANSI SQL Isolation Levels (Berenson et al., 1995)", note: "Shows why the standard's anomaly-based definitions are ambiguous and introduces snapshot isolation formally." },
    { title: "Serializable Isolation for Snapshot Databases (Cahill, R\u00f6hm, Fekete, 2008)", note: "The paper behind serializable snapshot isolation." },
    { title: "Hermitage", url: "https://github.com/ept/hermitage", note: "Martin Kleppmann's test suite of isolation anomalies run against many databases." },
  ],
};
