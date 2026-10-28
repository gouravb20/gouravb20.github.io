// Deep dive: Dealing with contention. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["dealing-with-contention"] = {
  hook: `<p>Ten thousand people press "buy" on the same seat within a second. Exactly one should get it, the rest should hear "sorry" quickly, and nobody should be charged for a seat they don't have. This deep dive goes through the mechanics behind each tool for that job: what a conditional update really guarantees, how row locks and version checks behave under load, why two-phase commit is avoided, what goes wrong with distributed locks, and how systems survive a single item that everyone wants.</p>`,
  sections: [
    {
      id: "anatomy-of-a-race",
      title: "Anatomy of a lost update",
      kicker: "The problem",
      blocks: [
        {
          type: "text",
          html: `<p>Almost every contention bug is a <strong>read-modify-write</strong> sequence that isn't atomic. The application reads state, makes a decision in its own memory, and writes the result back. The decision is only valid if nothing changed between the read and the write, and under concurrency something often did.</p>`,
        },
        {
          type: "diagram",
          title: "Two buyers, one seat",
          caption: "Both requests read stock = 1 before either writes. Each decides the purchase is fine and writes stock = 0. The database ends in a plausible state, but two orders exist for one seat and no error was raised.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="Timeline of two requests both reading stock 1 and both writing stock 0">
<defs><marker id="pt2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="54" font-size="13" font-weight="700">Request A</text>
<text x="20" y="114" font-size="13" font-weight="700">Database</text>
<text x="20" y="174" font-size="13" font-weight="700">Request B</text>
<line x1="120" y1="50" x2="600" y2="50" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="120" y1="110" x2="600" y2="110" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="120" y1="170" x2="600" y2="170" stroke-width="2" style="stroke: var(--dg-line)"/>
<rect x="125" y="96" width="70" height="28" rx="5" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="160" y="115" text-anchor="middle" font-size="12">stock = 1</text>
<line x1="210" y1="104" x2="210" y2="60" stroke-width="2" style="stroke: var(--dg-1)" marker-end="url(#pt2-arrow)"/>
<text x="216" y="80" font-size="12" style="fill: var(--dg-1)">reads 1</text>
<line x1="270" y1="116" x2="270" y2="160" stroke-width="2" style="stroke: var(--dg-2)" marker-end="url(#pt2-arrow)"/>
<text x="276" y="146" font-size="12" style="fill: var(--dg-2)">reads 1</text>
<line x1="380" y1="60" x2="380" y2="102" stroke-width="2" style="stroke: var(--dg-1)" marker-end="url(#pt2-arrow)"/>
<text x="386" y="80" font-size="12" style="fill: var(--dg-1)">writes 0</text>
<line x1="460" y1="160" x2="460" y2="118" stroke-width="2" style="stroke: var(--dg-2)" marker-end="url(#pt2-arrow)"/>
<text x="466" y="146" font-size="12" style="fill: var(--dg-2)">writes 0</text>
<rect x="510" y="36" width="90" height="28" rx="5" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="555" y="55" text-anchor="middle" font-size="12">order #1</text>
<rect x="510" y="156" width="90" height="28" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="555" y="175" text-anchor="middle" font-size="12">order #2</text>
<line x1="120" y1="212" x2="590" y2="212" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pt2-arrow)"/>
<text x="120" y="228" font-size="12" style="fill: var(--dg-muted)">time</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Variants of the same bug: a counter incremented as <code>x = read(); write(x + 1)</code>, a balance check followed by a debit, "is this username taken?" followed by an insert, an auction that reads the high bid and then writes a higher one. The fix always has one of two shapes: make the check and the write one atomic step, or make the losing writer <em>detect</em> that it lost and back off.</p>`,
        },
        {
          type: "quiz",
          q: "A team wraps their read-then-write seat purchase in BEGIN ... COMMIT on PostgreSQL at the default isolation level. Is overselling now impossible?",
          options: [
            "Yes, a transaction makes the whole block atomic and isolated",
            "No; at read committed, two transactions can both read 'available' and both write 'sold'",
            "Yes, but only if the transaction is shorter than one second",
            "No, because PostgreSQL doesn't support transactions on UPDATE",
          ],
          answer: 1,
          explain: "Atomicity means all-or-nothing, not one-at-a-time. Under read committed, each statement sees data committed before it began, so both transactions see the seat as available. Something must serialize the decision: a conditional WHERE clause, a FOR UPDATE lock, a version check, or a stricter isolation level with retries.",
        },
      ],
    },
    {
      id: "atomic-updates",
      title: "Atomic conditional updates",
      kicker: "The first tool",
      blocks: [
        {
          type: "idea",
          html: `<p>Move the check into the write. A single <code>UPDATE ... WHERE &lt;condition&gt;</code> is executed atomically: the database locks the row, re-evaluates the condition against the latest committed version, and either changes it or doesn't. The affected-row count tells you which.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Conditional updates for common contention problems",
          code: `-- Claim a specific seat
UPDATE seats SET status = 'sold', buyer_id = :user
WHERE id = :seat AND status = 'available';

-- Decrement a stock counter without going below zero
UPDATE items SET stock = stock - :qty
WHERE id = :item AND stock >= :qty;

-- Accept a bid only if it beats the current one and the auction is open
UPDATE auctions SET high_bid = :bid, high_bidder = :user
WHERE id = :auction AND high_bid < :bid AND ends_at > now();

-- Unique constraint as a contention guard: the second insert fails
INSERT INTO bookings (room_id, night, guest_id) VALUES (:room, :night, :guest);
-- with UNIQUE (room_id, night)`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Always read the row count.</strong> Most drivers return it; an ORM's save() may hide it. Zero rows means you lost, and the user should hear that immediately.",
            "<strong>Write the delta, not the value.</strong> <code>stock = stock - 1</code> is computed by the database from the current row; <code>stock = 4</code> is computed by your application from an old read.",
            "<strong>Unique constraints are contention tools too.</strong> One row per (room, night) makes double-booking a constraint violation instead of a race.",
            "<strong>Other stores have the same primitive:</strong> DynamoDB condition expressions, Redis <code>DECR</code> or a Lua script that checks then decrements, MongoDB <code>findOneAndUpdate</code> with a filter on the current value.",
          ],
        },
        {
          type: "lab",
          id: "ctLostUpdate",
          caption: "Compare the naive read-then-write with the conditional update at 1,000 buyers. The conditional update sells exactly the seats that exist and keeps latency low, because the row is locked for one statement, not for the application's work.",
        },
      ],
    },
    {
      id: "locks-and-isolation",
      title: "Pessimistic locking and isolation levels",
      kicker: "Mechanics",
      blocks: [
        {
          type: "text",
          html: `<p>When the decision needs more than one statement (check the seat and the user's ticket limit, then insert an order, then update the seat), take locks up front. <code>SELECT ... FOR UPDATE</code> inside a transaction locks the selected rows until commit or rollback. Other transactions that try to lock or modify them wait; plain reads are not blocked in databases that use multiversion concurrency control, such as PostgreSQL and MySQL InnoDB.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Locking variants",
          code: `BEGIN;
-- Wait for the lock (default)
SELECT * FROM seats WHERE id = :seat FOR UPDATE;

-- Fail immediately if someone else holds it
SELECT * FROM seats WHERE id = :seat FOR UPDATE NOWAIT;

-- "Give me any 2 free seats in this section", skipping ones being bought right now
SELECT id FROM seats
WHERE section = 'B' AND status = 'available'
ORDER BY id LIMIT 2
FOR UPDATE SKIP LOCKED;
COMMIT;`,
        },
        {
          type: "table",
          title: "Isolation levels, briefly",
          headers: ["Level", "What a transaction sees", "Lost updates on read-modify-write?"],
          rows: [
            ["Read committed (PostgreSQL default)", "Each statement sees data committed before it started", "Possible; protect explicitly"],
            ["Repeatable read / snapshot (MySQL InnoDB default)", "One snapshot for the whole transaction", "Depends on the database; don't rely on it"],
            ["Serializable", "As if transactions ran one at a time", "Prevented, but conflicting transactions abort and must be retried"],
          ],
          note: "Behaviour at each level differs between databases. The safe habit is to protect the contended operation explicitly whatever the level.",
        },
        {
          type: "keypoints",
          items: [
            "<strong>Deadlocks</strong> come from locking the same rows in different orders. Sort the ids and lock them in one statement, keep transactions short, and retry when the database picks you as the victim.",
            "<strong>Never hold a lock across user think time or a network call to another service.</strong> A slow payment provider would hold the row for seconds and queue everyone behind it.",
            "<strong>Lock waits are the cost.</strong> On a hot row the queue length times the hold time is your latency. Keep the locked section to the minimum statements.",
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Database-backed job queues", html: `<p>Libraries such as Rails' Solid Queue and Elixir's Oban use <code>FOR UPDATE SKIP LOCKED</code> so many workers can each claim different jobs from one table without blocking each other. Seat selection ("any two seats in section B") is the same shape.</p>` },
          ],
        },
      ],
    },
    {
      id: "optimistic",
      title: "Optimistic concurrency and the ABA problem",
      kicker: "Mechanics",
      blocks: [
        {
          type: "text",
          html: `<p>Optimistic concurrency control assumes conflicts are rare and checks for them only at write time. Each row carries a <code>version</code> that every successful write increments. A writer remembers the version it read and makes its write conditional on that version being unchanged.</p>`,
        },
        {
          type: "code",
          lang: "sql",
          title: "Version check at write time",
          code: `-- Read (any time earlier, even in a different request)
SELECT id, title, body, version FROM documents WHERE id = 9;   -- version = 41

-- Write only if nobody else wrote in between
UPDATE documents
SET body = :new_body, version = version + 1
WHERE id = 9 AND version = 41;
-- 1 row: saved. 0 rows: conflict; reload and merge, retry, or tell the user.`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Works across requests.</strong> HTTP expresses it with <code>ETag</code> and <code>If-Match</code>: the server answers 412 Precondition Failed if the resource changed since the client fetched it.",
            "<strong>No locks, no deadlocks.</strong> Readers and writers never wait for each other; the loser just retries.",
            "<strong>Retries need limits and jitter.</strong> Back off randomly and cap attempts, or a hot row turns into a retry storm where everyone keeps losing.",
            "<strong>Use a version, not a value.</strong> Comparing on the business value (\"stock is still 1\") can pass after the value changed and changed back: the <strong>ABA problem</strong>. A counter that only increases cannot repeat, and it catches changes to any column.",
          ],
        },
        {
          type: "lab",
          id: "ctOptimisticVsPessimistic",
          caption: "Fifty clients, ten-millisecond transactions. Find the row count where optimistic transactions start throwing away most of their attempts. That is the point to switch the hot rows to locking or a conditional update.",
        },
        {
          type: "quiz",
          q: "An inventory service uses CAS on the stock value: 'set stock = 4 if stock is still 5'. A return adds a unit (5 to 6) and a sale removes one (6 to 5) while a slow request is in flight. What happens to the slow request?",
          options: [
            "Its write is rejected because the row was modified",
            "Its write succeeds, because the value it compares against is 5 again, even though two other changes happened",
            "The database detects the ABA sequence and raises an error",
            "It deadlocks with the return",
          ],
          answer: 1,
          explain: "Comparing on a value only checks equality, so A to B to A looks unchanged. Here the result may even be correct, but the request's decision was based on a stale view (for example a reservation it computed). Comparing on a version that increments on every write rejects the slow request, which is what you want.",
        },
      ],
    },
    {
      id: "holds-and-expiry",
      title: "Reservations with expiry",
      kicker: "Slow steps",
      blocks: [
        {
          type: "text",
          html: `<p>Locks must be short; checkout is long. A reservation splits the purchase so that the contended write takes milliseconds and the slow part runs with nothing locked. The trick is that the reservation <strong>expires by itself</strong>: the expiry is a column or a TTL that every query respects, so a user who closes the tab, or a server that crashes, can't strand inventory.</p>`,
        },
        {
          type: "diagram",
          title: "Seat lifecycle with holds",
          caption: "A conditional update moves a seat from available to held, with an expiry. Confirming after payment moves it to sold. An expired hold is treated as available by every query, so no cleanup job is needed for correctness.",
          svg: `<svg viewBox="0 0 620 210" role="img" aria-label="State machine: available to held to sold, with expiry returning held to available">
<defs><marker id="pt2-state" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="30" y="70" width="130" height="50" rx="10" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="95" y="100" text-anchor="middle" font-size="14" font-weight="700">available</text>
<rect x="245" y="70" width="130" height="50" rx="10" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="310" y="93" text-anchor="middle" font-size="14" font-weight="700">held</text>
<text x="310" y="110" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">holder, held_until</text>
<rect x="460" y="70" width="130" height="50" rx="10" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="525" y="100" text-anchor="middle" font-size="14" font-weight="700">sold</text>
<line x1="160" y1="88" x2="243" y2="88" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt2-state)"/>
<text x="202" y="60" text-anchor="middle" font-size="12">hold</text>
<text x="202" y="76" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(if free)</text>
<line x1="375" y1="95" x2="458" y2="95" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt2-state)"/>
<text x="417" y="60" text-anchor="middle" font-size="12">confirm</text>
<text x="417" y="76" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">(paid, in time)</text>
<path d="M 300 120 C 280 175, 130 175, 100 122" fill="none" stroke-width="2" style="stroke: var(--dg-bad)" marker-end="url(#pt2-state)"/>
<text x="200" y="185" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">expired or payment failed</text>
<text x="310" y="30" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">payment runs here, with no lock held</text>
<line x1="310" y1="38" x2="310" y2="66" stroke-width="1.5" stroke-dasharray="3 3" style="stroke: var(--dg-muted)"/>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Enforce expiry in the query.</strong> The hold statement claims a seat if it is available <em>or</em> held with <code>held_until &lt; now()</code>. A sweeper can reset old rows for tidiness, but if it stops, nothing breaks.",
            "<strong>Confirm conditionally.</strong> Flip held to sold only if the holder is still you and the hold hasn't expired. If it has, the seat may already belong to someone else; refund or re-hold.",
            "<strong>Idempotency keys on payment.</strong> The hold makes the seat safe; the key makes a retried charge safe.",
            "<strong>Pick the expiry from real checkout times.</strong> Too short and paying customers lose seats mid-payment; too long and abandoned carts lock out buyers during a rush. Show a countdown.",
            "<strong>Redis works too:</strong> <code>SET hold:seat:7 user42 NX EX 600</code> creates a hold that disappears on its own, with the database recording the final sale.",
          ],
        },
        {
          type: "lab",
          id: "ctHoldExpiry",
          caption: "Set demand to 6 buyers a minute and compare a 5-minute hold with a 30-minute hold: longer holds turn away more buyers while abandoned seats sit reserved.",
        },
      ],
    },
    {
      id: "two-phase-commit",
      title: "Two-phase commit and why it's avoided",
      kicker: "Across nodes",
      blocks: [
        {
          type: "text",
          html: `<p>Two-phase commit makes one transaction atomic across several databases. In the <strong>prepare</strong> phase the coordinator asks each participant to get ready; a participant that votes yes has written enough to disk to guarantee it can commit, and holds its locks. In the <strong>commit</strong> phase the coordinator records the decision and tells everyone to commit, or to abort if anyone voted no.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "What it gives you",
          consLabel: "What it costs",
          pros: [
            "True atomicity across databases: all commit or none do",
            "Application code looks like a normal transaction",
            "Supported by many relational databases and transaction managers (XA)",
          ],
          cons: [
            "<strong>Blocking:</strong> a participant that voted yes cannot decide alone; if the coordinator is lost, it waits with locks held",
            "Extra round trips and forced disk writes on every transaction; locks are held for longer",
            "Every participant must support prepare; payment providers, caches and most message brokers don't",
            "Availability is that of the weakest participant: one slow node slows every transaction",
          ],
        },
        {
          type: "text",
          html: `<p>Inside a single distributed database (Spanner, CockroachDB), a commit protocol of this family runs under the hood, on replicated participants so a lost node doesn't block. That is a fine thing to rely on. Building 2PC yourself across independent services is what interviews expect you to avoid, replacing it with holds and a saga. Cross-shard transactions are covered in <a href="../../core-concepts/ch15/">core concepts chapter 15</a>; sagas in the <a href="../multi-step-processes/">multi-step processes chapter</a>.</p>`,
        },
      ],
    },
    {
      id: "distributed-locks",
      title: "Distributed locks and fencing tokens",
      kicker: "Across nodes",
      blocks: [
        {
          type: "text",
          html: `<p>A distributed lock gives mutual exclusion across machines for something that isn't a single database row: only one worker should process this video, only one scheduler should run tonight's job, only one user may edit this document. Every practical distributed lock is a <strong>lease</strong>: it expires, because otherwise a crashed holder would block everyone forever.</p>`,
        },
        {
          type: "table",
          headers: ["Lock service", "Acquire", "Expiry", "Fencing token"],
          rows: [
            ["Redis (single node)", "SET key token NX PX 30000", "Key TTL", "None built in"],
            ["etcd", "Create a key bound to a lease, in a transaction", "Lease TTL, kept alive by the client", "The key's revision increases on every change"],
            ["ZooKeeper", "Create an ephemeral sequential node; lowest number wins", "Session timeout", "The node's zxid or sequence number"],
            ["Database row", "Conditional UPDATE on a locks table with an expiry", "Expiry column", "A counter column incremented on every grant"],
          ],
        },
        {
          type: "code",
          lang: "lua",
          title: "Releasing a Redis lock safely: delete only if it's still yours",
          code: `-- KEYS[1] = lock key, ARGV[1] = the random token this client set on acquire
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end`,
        },
        {
          type: "problem",
          title: "The lease can run out while you still act",
          html: `<p>A client takes the lock and then stops running for a while: a stop-the-world garbage collection, a VM live migration, swapping, a network partition. Its lease expires, the lock service gives the lock to someone else, and the first client resumes in the middle of its critical section, still believing it holds the lock. Checking the lease before writing doesn't help, since the pause can happen right after the check.</p>`,
        },
        {
          type: "diagram",
          title: "Fencing tokens stop the zombie write",
          caption: "Client A gets token 33 and pauses. Its lease expires and B gets token 34, which storage records on B's first request. When A wakes and writes with 33, storage rejects it because it has already seen a higher token.",
          svg: `<svg viewBox="0 0 620 220" role="img" aria-label="Fencing token timeline with client A token 33 rejected after client B token 34">
<defs><marker id="pt2-fence" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="16" y="44" font-size="13" font-weight="700">Client A</text>
<text x="16" y="104" font-size="13" font-weight="700">Client B</text>
<text x="16" y="174" font-size="13" font-weight="700">Storage</text>
<line x1="110" y1="40" x2="600" y2="40" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="110" y1="100" x2="600" y2="100" stroke-width="2" style="stroke: var(--dg-line)"/>
<line x1="110" y1="170" x2="600" y2="170" stroke-width="2" style="stroke: var(--dg-line)"/>
<rect x="115" y="28" width="80" height="24" rx="5" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="155" y="45" text-anchor="middle" font-size="12">lock, 33</text>
<rect x="205" y="28" width="230" height="24" rx="5" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="320" y="45" text-anchor="middle" font-size="12">paused (GC), lease expires</text>
<rect x="290" y="88" width="80" height="24" rx="5" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="330" y="105" text-anchor="middle" font-size="12">lock, 34</text>
<line x1="390" y1="112" x2="390" y2="160" stroke-width="2" style="stroke: var(--dg-2)" marker-end="url(#pt2-fence)"/>
<text x="396" y="140" font-size="12" style="fill: var(--dg-2)">write, 34: ok</text>
<line x1="500" y1="52" x2="500" y2="160" stroke-width="2" style="stroke: var(--dg-bad)" marker-end="url(#pt2-fence)"/>
<text x="506" y="80" font-size="12" style="fill: var(--dg-bad)">write, 33</text>
<rect x="455" y="182" width="140" height="26" rx="5" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="525" y="200" text-anchor="middle" font-size="12">rejected: 33 &lt; 34</text>
<text x="120" y="200" font-size="12" style="fill: var(--dg-muted)">storage keeps the highest token seen</text>
</svg>`,
        },
        {
          type: "lab",
          id: "ctFencing",
          caption: "Set the pause shorter than the lease, then longer. With fencing off, the second case loses B's work; with fencing on, A's stale write bounces.",
        },
        {
          type: "callout",
          tone: "history",
          title: "The Redlock debate",
          html: `<p>Redis's documentation describes Redlock, an algorithm that takes a lock on a majority of independent Redis nodes. In 2016 Martin Kleppmann argued that it is unsafe for correctness because it relies on timing assumptions (bounded pauses, network delays and clock drift) and produces no fencing token; Salvatore Sanfilippo, Redis's creator, published a rebuttal. The practical lesson most engineers take: use Redis locks to avoid duplicate work, and when correctness matters, use a lock that issues fencing tokens and a resource that checks them, or lean on the database's own guarantees.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Google Chubby", html: `<p>Google's Chubby lock service paper (2006) describes <em>sequencers</em>: opaque tokens describing the lock and its generation that clients pass to servers, which check them before acting. It is the fencing-token idea in a production system.</p>` },
            { org: "Kubernetes", html: `<p>Controllers that must run as a single active instance use leader election built on Lease objects stored through the API server (and so in etcd). Only the current leaseholder acts; others wait for the lease to lapse.</p>` },
          ],
        },
        {
          type: "quiz",
          q: "A worker holds a Redis lock with a 30-second TTL and renews it every 10 seconds from a background thread. Does renewal make the lock safe against a 45-second GC pause?",
          options: [
            "Yes, renewal keeps the lease alive",
            "No; the renewal thread is paused too, so the lease expires and another worker can take the lock while this one still thinks it holds it",
            "Yes, as long as clocks are synchronized",
            "No, because Redis doesn't support TTLs on locks",
          ],
          answer: 1,
          explain: "A stop-the-world pause freezes every thread in the process, including the one doing renewals. When the worker resumes, it has no idea time passed. Only a check at the protected resource, such as a fencing token, catches the stale holder.",
        },
      ],
    },
    {
      id: "hot-items",
      title: "Extreme contention on one item",
      kicker: "Scale",
      blocks: [
        {
          type: "text",
          html: `<p>Every technique so far funnels writes for one item through one row. If each locked update holds the row for about 1 ms, that row tops out near 1,000 writes per second no matter how big the server is. A flash sale or a stadium on-sale can send a thousand times that. Past the ceiling, requests pile up waiting for the lock, connection pools fill, timeouts trigger retries, and the retries make it worse.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Virtual waiting room", tone: "ok", html: `<p>Hold users at the edge and admit them at the rate checkout can sustain, each with a signed, short-lived admission token. Excess load never reaches the inventory database, users see a position instead of errors, and fairness is a policy (arrival order, or a randomized lottery at opening time to remove the advantage of bots refreshing fastest).</p>` },
            { title: "Queue to a single writer", tone: "ok", html: `<p>Publish purchase requests to a log partition keyed by item id. One consumer per partition applies them in order against local state and writes results back. There is no contention because there is one writer; throughput is limited only by how fast that consumer runs, often far beyond a locked row. Clients poll or get pushed the outcome.</p>` },
            { title: "Split the inventory", tone: "info", html: `<p>Store 10,000 units as 100 rows of 100 and have each request decrement a random row with a conditional update, trying another if it's empty. Writes spread out, but "how many are left" and "sold out" need all rows, and the last units get hard to find. Pre-generating one token per unit and handing them out has the same idea.</p>` },
            { title: "Reject early, cheaply", tone: "info", html: `<p>Keep an approximate stock count in a cache or at the edge. When it hits zero, answer "sold out" without touching the database. It can be slightly stale in the safe direction, because the database still makes the final decision.</p>` },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The <a href="../../problem-breakdowns/flash-sale/">Flash Sale problem breakdown</a> works through these numbers for a console launch end to end.</p>`,
        },
      ],
    },
    {
      id: "failure-deep-dives",
      title: "Failure modes interviewers probe",
      kicker: "Deep dives",
      blocks: [
        {
          type: "table",
          headers: ["What fails", "What happens", "How you handle it"],
          rows: [
            ["Two transactions lock rows in opposite orders", "Deadlock; the database aborts one", "Lock in a consistent order, keep transactions short, retry the victim"],
            ["A CAS compares a value that changed and changed back", "ABA: a stale write passes the check", "Compare a monotonically increasing version"],
            ["A lock holder crashes", "Lock stays held until the lease expires", "Short leases with keep-alives; make the work idempotent so a new holder can redo it"],
            ["A lock holder pauses past its lease", "Two holders act at once", "Fencing tokens checked by the resource"],
            ["The 2PC coordinator dies after prepare", "Participants block holding locks", "Avoid 2PC across services; use holds and sagas"],
            ["The user abandons checkout", "Hold blocks the seat", "Expiry enforced in queries"],
            ["Payment succeeds but confirming the seat fails", "Charged with no seat", "Retry confirm (idempotent); if the hold expired and the seat is gone, refund"],
            ["Optimistic retries on a hot row", "Retry storm, rising latency, give-ups", "Jittered backoff with a cap; switch the hot path to locks, a conditional update or a queue"],
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          title: "Locks in the cache, truth in the database",
          html: `<p>A common flawed design: check and set a Redis key to "lock" a seat, then write the sale to the database, assuming the Redis key prevents duplicates. If the key expires or Redis fails over and loses it, two requests reach the database. Keep the final guard in the database (a conditional update or unique constraint) even when a cache or lock sits in front.</p>`,
        },
      ],
    },
    {
      id: "interview-angle",
      title: "Putting it together in an interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "steps",
          items: [
            "<strong>Name the invariant:</strong> each seat sold at most once; stock never negative; the highest valid bid wins.",
            "<strong>Show the race</strong> in one sentence: two requests read 'available' and both write 'sold'.",
            "<strong>Single database first:</strong> a conditional update, or a short transaction with FOR UPDATE when several rows are involved; optimistic versions for low-contention edits.",
            "<strong>Slow steps:</strong> hold with expiry, pay with an idempotency key, confirm conditionally.",
            "<strong>Across services:</strong> a saga with compensation; say why not 2PC.",
            "<strong>Check the hottest item's numbers.</strong> If it exceeds a row's write ceiling, add a waiting room, a single-writer queue or split inventory.",
            "<strong>Close with failures:</strong> deadlocks, expired holds, a paused lock holder, payment-then-confirm failures.",
          ],
        },
        {
          type: "callout",
          tone: "interview",
          title: "Calibrate to the scale",
          html: `<p>Interviewers reward answers that match the numbers. A restaurant booking system with a few writes per second per restaurant needs a conditional update and nothing else; proposing ZooKeeper there signals pattern-matching rather than judgment. A sneaker drop to millions of users needs the waiting room. Saying "this is enough until X, and here is what I'd add past X" is the strongest form.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "Contention bugs are <strong>read-modify-write races</strong>: two requests decide from the same old read. A transaction alone doesn't stop them at default isolation levels.",
    "Start with an <strong>atomic conditional update</strong> and check the affected-row count; it covers most single-row cases with no locks or retries.",
    "Use <strong>SELECT ... FOR UPDATE</strong> when conflicts are common and the decision spans rows; use <strong>version checks</strong> when conflicts are rare or the read and write are in separate requests.",
    "Compare <strong>versions, not values</strong>, to avoid ABA; lock rows in a <strong>consistent order</strong> to avoid deadlocks.",
    "When a human or slow call sits between check and commit, use a <strong>hold with an expiry enforced in the query</strong>, then confirm conditionally.",
    "Across services prefer <strong>holds and sagas</strong> to two-phase commit, which blocks when its coordinator fails.",
    "Every distributed lock is a lease that can expire under a paused holder; only <strong>fencing tokens checked by the resource</strong> make it safe for correctness.",
    "A single hot row has a write ceiling. Past it, <strong>admit at a controlled rate, queue to one writer, or split the inventory</strong>.",
  ],
  furtherReading: [
    { title: "How to do distributed locking (Martin Kleppmann, 2016)", url: "https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html", note: "The argument for fencing tokens and against relying on Redlock for correctness." },
    { title: "PostgreSQL documentation: Explicit Locking", url: "https://www.postgresql.org/docs/current/explicit-locking.html", note: "Row-level lock modes, FOR UPDATE and deadlocks." },
    { title: "PostgreSQL documentation: Transaction Isolation", url: "https://www.postgresql.org/docs/current/transaction-iso.html", note: "What each isolation level guarantees and when serializable transactions must be retried." },
    { title: "Designing Data-Intensive Applications, chapters 7 to 9 of the 1st edition (Martin Kleppmann)", note: "Transactions and isolation anomalies, the trouble with distributed systems (including process pauses and fencing), and distributed transactions." },
    { title: "The Chubby lock service for loosely-coupled distributed systems (Mike Burrows, OSDI 2006)", note: "Lock service design, leases and sequencers." },
  ],
};
