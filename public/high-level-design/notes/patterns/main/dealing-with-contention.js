// Main tab: Dealing with contention. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN["dealing-with-contention"] = [
  {
    id: `the-problem`,
    title: `Many requests, one seat`,
    kicker: `The problem`,
    blocks: [
      { type: `text`, html: `<p>Contention is what happens when many requests try to change the same piece of state at once and only some of them may succeed. The last seat for a concert, the final unit in a flash sale, the high bid in an auction's closing seconds, a hotel room for one night, a shared account balance. The requirement usually sounds innocent: "never double-book", "never oversell", "the highest bid wins".</p>` },
      { type: `text`, html: `<p>The bug is almost always the same <strong>read-modify-write race</strong>. Code reads the current state, decides in the application, then writes the result. Between the read and the write, another request does the same thing:</p>` },
      { type: `steps`, items: [
        `Request A reads the seat: available.`,
        `Request B reads the seat: available.`,
        `A writes "sold to A" and confirms.`,
        `B writes "sold to B" and confirms. A's sale has been silently overwritten: a <strong>lost update</strong>.`,
      ] },
      { type: `text`, html: `<p>Nothing errors. Both users get a confirmation email, and the problem surfaces at the venue door. Wrapping the code in a transaction doesn't fix it on its own: at the default isolation level of most databases (read committed in PostgreSQL), two transactions can still read the same value and both write. You need to make the check and the change happen as one indivisible step, or make the second writer notice that it lost.</p>` },
      { type: `lab`, id: `ctLostUpdate`, caption: `Start on "read, then write" and watch the oversold count. Then switch strategies: all three protected versions sell exactly the seats that exist, but they pay for it differently in retries and waiting.` },
    ],
  },
  {
    id: `single-database`,
    title: `Inside one database: three tools`,
    kicker: `Solutions`,
    blocks: [
      { type: `text`, html: `<p>When the contended data lives in one database, you have strong, cheap tools. Try them in this order.</p>` },
      { type: `compare`, items: [
        { title: `1. Atomic conditional update`, tone: `ok`, html: `<p>Put the check inside the write: <code>UPDATE seats SET status = 'sold', buyer = 42 WHERE id = 7 AND status = 'available'</code>. The database locks the row for that one statement, so exactly one request matches. Read the affected-row count: 1 means you won, 0 means someone beat you. Stock counters work the same way with <code>SET stock = stock - 1 WHERE id = 7 AND stock &gt; 0</code>.</p>` },
        { title: `2. Pessimistic locking`, tone: `info`, html: `<p>When the decision needs several rows or real logic, open a transaction and <code>SELECT ... FOR UPDATE</code> the rows first. Other writers queue on those rows until you commit. Nobody wastes work, but everyone waits in line, and two transactions that lock rows in different orders can deadlock. Keep the locked section short.</p>` },
        { title: `3. Optimistic concurrency`, tone: `info`, html: `<p>Read the row with a <code>version</code> number, do the work without locking, then write with <code>WHERE id = 7 AND version = 12</code> and bump the version. Zero rows updated means someone changed it first: re-read and retry, or show the user a conflict. No locks are held while you work, and it even works across separate HTTP requests.</p>` },
      ] },
      { type: `text`, html: `<p>Choosing between the last two comes down to <strong>how often conflicts happen</strong>. Optimistic concurrency pays nothing when conflicts are rare and a lot when they are common, because every collision throws away a whole attempt. Pessimistic locking pays a little waiting all the time and never wastes work.</p>` },
      { type: `lab`, id: `ctOptimisticVsPessimistic`, caption: `Drag the row count from 1000 down to 1. With many rows, optimistic transactions almost never retry. On one hot row nearly every attempt is thrown away while the locking version simply queues.` },
      { type: `callout`, tone: `tip`, title: `What about isolation levels?`, html: `<p>Raising the isolation level to serializable also prevents lost updates, because the database then aborts transactions that would conflict and you retry them. That is correct but blunt: every transaction pays, and under contention you get abort storms. Most designs keep the default level and protect the one contended operation explicitly. Consistency models are covered in <a href="../../core-concepts/ch17/">core concepts chapter 17</a>.</p>` },
    ],
  },
  {
    id: `holds`,
    title: `When a human sits between check and commit: holds`,
    kicker: `Solutions`,
    blocks: [
      { type: `text`, html: `<p>Checkout takes minutes: the user types a card number, the bank asks for a one-time code. You cannot hold a database lock for that long, and you shouldn't sell the seat to someone else while they pay. The answer is to split the purchase into two short writes with a <strong>reservation</strong> in between.</p>` },
      { type: `steps`, items: [
        `<strong>Hold:</strong> a conditional update marks the seat held by this user until now + 10 minutes. Only one hold can succeed.`,
        `<strong>Pay:</strong> no lock is held. The payment call carries an idempotency key so a retry never charges twice.`,
        `<strong>Confirm:</strong> a second conditional update flips held to sold, but only if the hold is still this user's and hasn't expired.`,
        `<strong>Expire:</strong> any query that looks for free seats treats an expired hold as free. A background sweeper can tidy rows, but correctness never depends on it.`,
      ] },
      { type: `lab`, id: `ctHoldExpiry`, caption: `Try "never expire" with 30% of buyers abandoning, then a 2-minute hold. One strands seats; the other takes seats away from people who are still paying.` },
    ],
  },
  {
    id: `multiple-nodes`,
    title: `Across databases and services`,
    kicker: `Solutions`,
    blocks: [
      { type: `text`, html: `<p>Once the seat inventory and the payment ledger live in different services, or the inventory is sharded so one purchase touches two shards, a single database transaction no longer covers the operation. Three options come up.</p>` },
      { type: `compare`, items: [
        { title: `Two-phase commit`, tone: `warn`, html: `<p>A coordinator asks every participant to prepare, then to commit. It gives an atomic commit across systems, but every participant must support it (payment providers don't), locks are held across network round trips, and if the coordinator dies after prepare, participants sit blocked holding locks. Name it, then explain why you'd avoid it. Cross-shard transactions are covered in <a href="../../core-concepts/ch15/">core concepts chapter 15</a>.</p>` },
        { title: `Holds plus a saga`, tone: `ok`, html: `<p>The usual answer. Hold the seat, charge the card, confirm the seat. If the charge fails, release the hold; if confirming fails after a charge, retry or refund. Each step is a local transaction with a compensating action, and the hold's expiry cleans up after crashes. Sagas get a full chapter: <a href="../multi-step-processes/">multi-step processes</a>.</p>` },
        { title: `Distributed lock`, tone: `info`, html: `<p>For protecting something that isn't a single database row (one worker per job, one editor per document), take a lock in Redis, etcd or ZooKeeper with an expiry. The expiry is essential and dangerous: a holder that pauses past it keeps acting while someone else holds the lock. Correctness needs <strong>fencing tokens</strong>.</p>` },
      ] },
      { type: `lab`, id: `ctFencing`, caption: `Make A's pause longer than the lease, with fencing off: A overwrites B's work. Turn fencing on and storage rejects A's stale token.` },
    ],
  },
  {
    id: `hot-items`,
    title: `One extremely hot item: stop fighting, form a line`,
    kicker: `Extreme scale`,
    blocks: [
      { type: `text`, html: `<p>Every strategy above serializes writes on one row. A row can take roughly one write per lock hold, typically somewhere in the hundreds to low thousands per second. A flash sale aiming millions of users at one product blows straight past that: the database spends its time managing waiters, timeouts cascade, and the rest of the site goes down with it. At this point, change the shape of the problem.</p>` },
      { type: `keypoints`, items: [
        `<strong>Virtual waiting room.</strong> Admit users to checkout at a rate the backend can handle; everyone else sees their place in line. Admitted users carry a short-lived token that checkout verifies. Fairness becomes a policy you choose.`,
        `<strong>Queue to a single writer.</strong> Route every purchase request for the item to one ordered queue partition keyed by item id. One consumer processes them in order, so there is no contention at all, only a line.`,
        `<strong>Split the stock.</strong> Store 10,000 units as 100 rows (buckets) of 100 units each; each request decrements a random bucket. Writes spread across rows. The cost is that "sold out" needs every bucket to be empty.`,
        `<strong>Reject early.</strong> Once stock reaches zero, answer "sold out" from a cache or the edge without touching the database.`,
      ] },
      { type: `callout`, tone: `insight`, html: `<p>The HLD problem breakdowns work through this end to end in the <a href="../../problem-breakdowns/flash-sale/">Flash Sale</a> problem.</p>` },
    ],
  },
  {
    id: `choosing`,
    title: `How to choose`,
    kicker: `Decision guide`,
    blocks: [
      { type: `table`, headers: [`If...`, `Use`, `Main risk`], rows: [
        [`The decision fits one row and one statement`, `Atomic conditional update`, `Forgetting to check the affected-row count`],
        [`It spans rows in one database and conflicts are common`, `Transaction + SELECT ... FOR UPDATE`, `Deadlocks, long lock waits`],
        [`It spans rows in one database and conflicts are rare`, `Optimistic concurrency (version column)`, `Retry storms if the row turns hot`],
        [`A slow step or a human sits in the middle`, `Hold with expiry, then confirm`, `Choosing the expiry`],
        [`It spans services`, `Saga with holds and idempotency keys`, `Compensation logic`],
        [`The protected thing isn't a database row`, `Distributed lock with fencing tokens`, `Zombie holders after lease expiry`],
        [`One item gets far more writes than a row can take`, `Waiting room, queue to one writer, split stock`, `Latency and fairness`],
      ] },
      { type: `callout`, tone: `mistake`, title: `Over-engineering`, html: `<p>The most common mistake is reaching for Redis locks or Kafka the moment you hear "concurrent". If one Postgres database holds the seats and a popular event sells a few hundred tickets a second, a conditional update is correct and fast. Start there, and add machinery only when a number forces it.</p>` },
    ],
  },
  {
    id: `in-the-interview`,
    title: `In the interview`,
    kicker: `Interview angle`,
    blocks: [
      { type: `text`, html: `<p>Contention appears in ticketing (Ticketmaster), booking (hotels, restaurants, rides), auctions (eBay), flash sales, inventory and payments. Flag it as soon as you see the requirement, then work through it:</p>` },
      { type: `steps`, items: [
        `Name the contended resource and the invariant: "a seat is sold at most once", "stock never goes below zero".`,
        `Show the race in one sentence, so the interviewer knows you see it.`,
        `Propose the simplest correct tool for a single database: usually a conditional update or a short locked transaction.`,
        `If there is a slow step, add holds with expiry. If the data spans services, describe the saga.`,
        `Do the arithmetic on the hottest item. Only if it exceeds what one row can take, add a waiting room, a queue or split stock.`,
      ] },
      { type: `callout`, tone: `interview`, title: `What to say`, html: `<p>"Seat purchase is the contended operation. I'll hold the seat with a conditional update that only succeeds if it's available or the previous hold has expired, setting a 10-minute expiry. Payment runs outside any lock with an idempotency key, then a second conditional update confirms the sale if the hold is still ours. For a stadium on-sale I'd put a waiting room in front so checkout only sees the rate it can handle."</p>` },
      { type: `keypoints`, title: `Deep dives interviewers push on`, items: [
        `<strong>Deadlocks:</strong> lock rows in a consistent order (by id), keep transactions short, retry the aborted one.`,
        `<strong>ABA:</strong> compare a version that only increases, not a business value that can change and change back.`,
        `<strong>A lock holder dies or pauses:</strong> the lease expiry frees the lock, and fencing tokens stop the old holder's late writes.`,
        `<strong>The 2PC coordinator crashes:</strong> participants block with locks held, which is why sagas are preferred.`,
        `<strong>Hot item:</strong> a row has a write ceiling; queue, split or admit at a controlled rate.`,
      ] },
    ],
  },
];
