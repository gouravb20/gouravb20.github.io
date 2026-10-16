// Problem breakdowns, part 2: Flash Sale (chapters 6-10).
// Original study notes. The problem follows Hello Interview's Flash Sale breakdown:
// https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale
window.DATA.parts[2] = `Part II &middot; Flash Sale`;
window.DATA.chapters.push(
  // ------------------------------------------------------------------
  {
    id: `ch6`, part: 2, number: 6,
    title: `Scoping a flash sale: holds, fairness and the numbers`,
    overview: `A flash sale sells a small, fixed stock to a crowd that is hundreds or thousands of times larger, all within a few seconds of a published start time. The running example here is a games-console launch: 20,000 consoles go on sale at 10:00 and around 10 million people are waiting. The product surface is tiny (view the item, grab a unit, pay for it), so the interview is about the qualities: <strong>never sell more units than exist</strong>, survive a traffic cliff that arrives all at once, and give real people a fair chance against bots. The key functional insight is the <strong>reservation</strong>: taking a unit off the shelf for a few minutes, so the slow, external payment step happens after the scarce resource is already secured.`,
    concepts: [
      { term: `Flash sale`, def: `A sale of limited inventory that opens at a known moment and is expected to sell out in seconds or minutes because demand vastly exceeds supply.`, why: `The defining property is the ratio: with 10 million buyers for 20,000 units, 99.8% of people must be told "no". Most of the system's work is saying no quickly, cheaply and fairly.`, demo: `flashEstimator` },
      { term: `The three core actions`, def: `Users can view the sale item, reserve (secure) one unit for a limited time while the sale is live, and pay for a reserved unit to complete the purchase.`, why: `Keeping the scope this narrow lets you spend the interview on contention, expiry, load and fairness, which is where the problem actually lives. Catalogue search, shipping and refunds are explicitly out of scope.` },
      { term: `Why a reservation step`, def: `Reserving decrements available stock and records a hold with an expiry time. Payment happens afterwards against that hold.`, why: `Card payments go through a third party and take seconds, sometimes minutes with 3-D Secure. You can't keep a database transaction or lock open that long under heavy contention, so you split "claim the unit" (fast, local, atomic) from "settle the money" (slow, external).` },
      { term: `No overselling`, def: `The number of units reserved or sold must never exceed the stock. This is the one hard correctness requirement.`, why: `Overselling means cancelling orders people believe they won, which is worse for the business than a slow page. It tells you the reservation path needs strong consistency, even if everything else is eventually consistent.`, demo: `flashEstimator` },
      { term: `Consistency where it counts`, def: `Split the system by what each path needs: the product page and the "units left" indicator can be stale by seconds; the reserve and pay paths must be strongly consistent.`, why: `This split is what makes the design scalable. The read path goes to a CDN and caches; only the small write path touches the source of truth.` },
      { term: `The traffic cliff`, def: `Load goes from near zero to its peak in the seconds after the sale opens, then falls once the item sells out. Users also refresh and retry, multiplying requests.`, why: `Autoscaling reacts in minutes; this spike lasts seconds. Capacity has to be provisioned ahead of time or the excess load must be held back before it reaches the backend.`, demo: `flashEstimator` },
      { term: `Fairness as a requirement`, def: `State what fair means: first come, first served by arrival, a random draw among everyone who showed up on time, or a pre-registered raffle; plus limits such as one unit per customer.`, why: `Without a definition, "fair" quietly becomes "fastest network and best bot". Each definition leads to a different mechanism, so it's worth agreeing on early.`, demo: `fairnessModes` },
      { term: `Hold duration`, def: `How long a reservation lasts before the unit returns to the pool, typically a few minutes (say 5 to 10).`, why: `Too short and genuine buyers lose their unit while typing card details; too long and units sit in abandoned holds while other people are told "sold out". It's a business parameter you should name and defend.`, demo: `holdTimeout` },
      { term: `Back-of-the-envelope numbers`, def: `10 million users arriving over about a minute, each making a handful of requests, is on the order of a million requests per second at the peak, against a stock of 20,000. One row lock held for ~1 ms allows ~1,000 updates per second on that row.`, why: `The numbers show where the trouble is: reads need a CDN and caches, and the stock counter is a single hot key that must absorb an enormous burst of attempts.`, demo: `flashEstimator` },
      { term: `Out of scope, said out loud`, def: `Product catalogue and search, shipping, returns, refunds, order history and the admin tools that configure sales.`, why: `Naming what you won't design keeps the interview focused and signals that you know where the hard part is.` }
    ],
    cheatsheet: [
      { title: `Requirements`, type: `table`, headers: [`Kind`, `Requirement`, `Design consequence`], rows: [
        [`Functional`, `View the sale item`, `Static page, served from a CDN`],
        [`Functional`, `Reserve one unit for a limited time`, `Atomic decrement plus a hold with an expiry`],
        [`Functional`, `Pay for a reserved unit`, `Payment provider, idempotent order creation`],
        [`Non-functional`, `Never oversell`, `Strong consistency on the stock counter`],
        [`Non-functional`, `Survive ~1M req/s for seconds`, `CDN, admission control, waiting room`],
        [`Non-functional`, `Fair access, bots resisted`, `Defined fairness model, per-account limits`],
        [`Non-functional`, `Fast "no"`, `Sold-out flag checked at the edge`]
      ] },
      { title: `Numbers for the console launch`, type: `code`, body: `stock:       20,000 consoles, sale opens 10:00:00
users:       ~10M waiting, most arrive within ~60 s
requests:    ~5 per user (page, polls, reserve, retry)
average:     10M * 5 / 60 s          ~ 830K req/s
peak:        a few x average in the first seconds
success:     20K / 10M               = 0.2% of users get one
hot row:     1 ms lock -> ~1,000 reserves/s on one row
sell-out:    20K / 1K per s          ~ 20 s if every attempt queues on the row` },
      { title: `Questions to ask first`, type: `list`, items: [
        `How many units, how many expected users, and how fast do they arrive?`,
        `How long may a reservation last? What happens to abandoned holds?`,
        `What does fair mean here: first come, random draw or raffle? One per customer?`,
        `Is it acceptable to show stale stock levels? (Usually yes.)`,
        `Single item or several SKUs and sizes? (Each SKU is its own counter.)`
      ] }
    ],
    interview: [
      { q: `Why not let users go straight from the product page to paying?`, a: `Payment is slow and external; it can take seconds or minutes. If stock is only decremented when payment succeeds, thousands of people can be paying for the last unit at once and most must be refunded. If stock is locked for the duration of payment, every other buyer waits on that lock. A reservation decrements stock immediately and atomically, gives the buyer a few minutes to pay, and returns the unit if they don't.`, diff: `easy` },
      { q: `Which parts of a flash sale need strong consistency?`, a: `Only the stock counter and the reservation and order records: reserving must never exceed stock, and a paid order must refer to a valid hold. The product page, the "units left" badge and the waiting-room position can all be eventually consistent and served from caches or a CDN.`, diff: `medium` },
      { q: `Estimate the load at the start of the sale.`, a: `Say 10 million users arrive over about a minute and each makes around five requests between loading the page, polling and trying to reserve. That's roughly 800K requests per second on average over the minute and a few times that in the first seconds. Stock is 20,000, so about 0.2% of users succeed. A single database row can take about a thousand locked updates per second, so the counter is the obvious bottleneck.`, diff: `medium` },
      { q: `How would you choose the hold duration?`, a: `From how long genuine buyers take to pay: look at the payment-time distribution (or assume a median of a minute or two with a long tail for 3-D Secure) and pick a TTL that covers most of it, say 5 to 10 minutes. Then weigh the cost: every abandoned hold keeps a unit off the shelf for the full TTL. Show a countdown, and consider a short extension if payment is already in progress.`, diff: `medium` },
      { q: `What would you clarify about fairness?`, a: `Whether the business wants first come, first served by arrival time, a random order among everyone who arrived before the start, or a pre-registered raffle; whether there's a per-customer limit; and how much bot traffic to expect. FCFS rewards speed, which bots win; randomisation and raffles reward showing up, which is easier to defend.`, diff: `easy` }
    ],
    labs: [`flashEstimator`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch7`, part: 2, number: 7,
    title: `A first working design: entities, API and reserve-then-pay`,
    overview: `Start with a design that is correct before it is fast. The sale page is static and served from a CDN. A reservation service holds the stock counter in a relational database and reserves a unit with one <strong>conditional update</strong> (decrement only if stock remains) plus an insert into a reservations table with an expiry time, inside one transaction. An order service takes the payment through a provider using an <strong>idempotency key</strong>, and a webhook marks the order paid. The tempting shortcut, reading the stock and then writing it back, oversells under concurrency, which is the first thing to show and fix. With the flow in place, name the bottlenecks: the hot stock row, holds that never get paid, and the crowd hitting everything at once.`,
    concepts: [
      { term: `Core entities`, def: `<strong>Sale</strong> (item, start time, stock, per-user limit), <strong>Inventory</strong> (units remaining), <strong>Reservation</strong> (user, sale, status, expires_at), <strong>Order</strong> (reservation, amount, payment status).`, why: `Separating the reservation from the order mirrors the two steps of the flow and gives each its own lifecycle and failure handling.` },
      { term: `API surface`, def: `GET /sales/{id} for the page and status; POST /sales/{id}/reservations to reserve; POST /reservations/{id}/order (with an Idempotency-Key) to pay; a provider webhook to confirm payment.`, why: `Small and explicit. The reserve call is the only one that touches the contended counter; everything else is per-user and partitions naturally.` },
      { term: `Static sale page on a CDN`, def: `The product page, images and countdown are static files cached at the edge. Live state (open, sold out) comes from a tiny, short-TTL status endpoint.`, why: `Most of the traffic is people loading and refreshing this page. Serving it from the edge removes the largest share of the load before it reaches your servers.` },
      { term: `Read-then-write race`, def: `Code that reads stock, checks it is above zero in the application, then writes stock - 1. Two requests can read the same value and both succeed.`, why: `This is how systems oversell. Under a flash-sale burst, hundreds of requests read the same value within a millisecond, so the race isn't rare; it's the common case.`, demo: `oversellRace` },
      { term: `Conditional (atomic) decrement`, def: `UPDATE inventory SET remaining = remaining - 1 WHERE sale_id = ? AND remaining > 0, then check that one row was affected.`, why: `The check and the write happen as one atomic statement under the row lock, so the counter can never go below zero. It's the simplest correct baseline.`, demo: `oversellRace` },
      { term: `Reserve in one transaction`, def: `In the same transaction as the decrement, insert the reservation (status HELD, expires_at = now + TTL). Commit both or neither.`, why: `A decrement without a reservation leaks a unit forever; a reservation without a decrement oversells. One transaction keeps them in step.` },
      { term: `Reservation state machine`, def: `HELD moves to PAID (payment confirmed), EXPIRED (TTL passed, unit returned) or CANCELLED (user gave up, unit returned). Transitions are conditional updates from the expected state.`, why: `Making every transition conditional (UPDATE ... WHERE status = 'HELD') means a late payment and an expiry job can't both win; exactly one transition applies.` },
      { term: `Idempotency key for payment`, def: `The client sends a unique key with the pay request; the server stores it with the result, and a retry with the same key returns the original result instead of charging again.`, why: `Networks fail after the charge but before the response. Without idempotency, a retry double-charges; with it, retries are safe at every layer.` },
      { term: `Webhook confirmation`, def: `The payment provider calls your endpoint when a payment succeeds or fails; you mark the order and reservation accordingly. Poll the provider as a backstop if the webhook doesn't arrive.`, why: `The browser can close mid-payment. The provider is the source of truth for money, so the order state must follow its events, not the client's.` },
      { term: `Bottlenecks to name`, def: `Every reserve attempt serialises on one inventory row; abandoned holds keep units off the shelf; and a million requests per second arrive at once.`, why: `These three become the deep dives: contention (Chapter 8), expiry and payment (Chapter 9), and load and fairness (Chapter 10).` }
    ],
    cheatsheet: [
      { title: `Schema and the reserve transaction`, type: `code`, body: `CREATE TABLE inventory   (sale_id text PRIMARY KEY, remaining int NOT NULL CHECK (remaining >= 0));
CREATE TABLE reservations(id uuid PRIMARY KEY, sale_id text, user_id text,
                          status text, expires_at timestamptz,
                          UNIQUE (sale_id, user_id));          -- one per customer

BEGIN;
UPDATE inventory SET remaining = remaining - 1
 WHERE sale_id = :sale AND remaining > 0;      -- 0 rows -> sold out, ROLLBACK
INSERT INTO reservations VALUES (:id, :sale, :user, 'HELD', now() + interval '10 minutes');
COMMIT;                                        -- unique violation -> already holds one` },
      { title: `API`, type: `table`, headers: [`Call`, `Purpose`, `Contended?`], rows: [
        [`GET /sales/{id}`, `Page data and status (open, sold out)`, `No: CDN plus short-TTL status`],
        [`POST /sales/{id}/reservations`, `Reserve one unit, returns hold and expiry`, `Yes: the stock counter`],
        [`POST /reservations/{id}/order`, `Start payment, Idempotency-Key header`, `No: per reservation`],
        [`POST /webhooks/payments`, `Provider confirms success or failure`, `No`]
      ] },
      { title: `Reservation states`, type: `list`, items: [
        `HELD: unit removed from stock, expires_at set.`,
        `HELD to PAID: webhook confirms payment (conditional on status = HELD).`,
        `HELD to EXPIRED: TTL passed; increment stock in the same transaction.`,
        `HELD to CANCELLED: user releases; increment stock in the same transaction.`
      ] }
    ],
    interview: [
      { q: `Show how a naive implementation oversells.`, a: `Two requests run SELECT remaining (both see 1), both check remaining > 0 in application code, and both run UPDATE SET remaining = 0 and insert a reservation. Two holds exist for one unit. Under a burst, hundreds of requests read the same value, so the oversell is large, not occasional. The fix is to make the check part of the write: UPDATE ... SET remaining = remaining - 1 WHERE remaining > 0, and treat zero affected rows as sold out.`, diff: `easy` },
      { q: `Why put the decrement and the reservation insert in one transaction?`, a: `They must stay in step. If the decrement commits and the insert fails, a unit disappears with no hold to expire, and nobody can ever buy it. If the insert commits without the decrement, you oversell. A single transaction makes both happen or neither, and a unique constraint on (sale, user) enforces one hold per customer in the same step.`, diff: `easy` },
      { q: `How do you prevent a double charge if the client retries payment?`, a: `Require an idempotency key on the pay request (generated by the client per attempt, or derived from the reservation ID). Store the key with the outcome in the same transaction that creates the order, and pass it to the payment provider too. A retry with the same key returns the stored result instead of creating a second charge.`, diff: `medium` },
      { q: `The user closes the browser after paying. How does the order complete?`, a: `The payment provider sends a webhook when the charge succeeds; the handler verifies the signature and moves the reservation from HELD to PAID with a conditional update. Webhooks are retried by the provider, so the handler must be idempotent. As a backstop, a job polls the provider for orders stuck in "payment pending".`, diff: `medium` },
      { q: `What are the bottlenecks of this baseline?`, a: `Every reserve attempt, including the millions that will fail, takes a lock on the same inventory row, which caps throughput at roughly 1/lock-hold-time and builds a queue; holds that are never paid keep stock unavailable until something expires them; and the overall request rate at the start far exceeds what the services and database can accept. Those are the three deep dives.`, diff: `easy` }
    ],
    labs: [`oversellRace`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch8`, part: 2, number: 8,
    title: `Consistency under extreme contention`,
    overview: `The conditional update is correct, but it funnels every attempt through one row. With a lock held for about a millisecond, that row handles roughly a thousand reservations a second while hundreds of thousands arrive; queues build, requests time out and early arrivals lose to late ones. There are several ways out, each with a cost. <strong>Pessimistic locks</strong> serialise; <strong>optimistic</strong> version checks collapse into retry storms. Keeping the counter in <strong>Redis</strong> and decrementing it atomically (a single command or a Lua script) moves the gate to an in-memory, single-threaded store that handles about a hundred thousand operations a second, and only winners go on to write to the database. <strong>Splitting the stock into buckets</strong> multiplies throughput at the price of uneven sell-out. A <strong>pre-generated pool of unit tokens</strong> makes each claim a pop from a list. Whatever gate you choose, close it hard once stock is gone: a sold-out flag at the edge turns the remaining millions of attempts into cheap, immediate "no"s.`,
    concepts: [
      { term: `Hot row`, def: `A single database row that a large share of all writes must update. Each write takes the row lock, so writes to it execute one at a time.`, why: `Throughput on that row is about 1 / (lock hold time), whatever the size of the machine. At 1 ms that's ~1,000 per second; adding replicas or CPUs doesn't help writes.`, demo: `hotRow` },
      { term: `Pessimistic locking`, def: `SELECT ... FOR UPDATE takes the row lock before reading, so concurrent transactions queue until it's released.`, why: `Correct and easy to reason about, but holding the lock across application logic or network round trips makes the hold time, and so the queue, worse. Keep transactions tiny if you use it.`, demo: `oversellRace` },
      { term: `Optimistic concurrency`, def: `Read the row with a version number, then UPDATE ... WHERE version = :read_version. If another writer got there first, zero rows change and you retry.`, why: `Great when conflicts are rare. In a flash sale they're the norm: almost every attempt conflicts, retries multiply load, and users fail with stock still available.`, demo: `oversellRace` },
      { term: `Atomic counter in Redis`, def: `Keep remaining stock in a Redis key and claim with DECR (check the result is ≥ 0, else INCR back) or, better, a Lua script that checks and decrements in one step.`, why: `Redis executes commands one at a time on a single thread, so each command or script is atomic. It sustains on the order of 100K simple operations per second per node, two orders of magnitude more than a locked row.`, demo: `hotRow` },
      { term: `Gate in Redis, record in the database`, def: `Redis decides who gets a unit; only winners proceed to insert the reservation in the database. The database remains the system of record.`, why: `The database sees roughly as many writes as there are units (20,000) rather than as many attempts (millions). You must then reconcile if Redis loses data or a winner's database write fails.`, demo: `hotRow` },
      { term: `Stock buckets (sharded counter)`, def: `Split the stock into N rows or keys (e.g. 16 buckets of 1,250) and send each attempt to one bucket at random or by user hash.`, why: `Throughput scales roughly with N. The catch is uneven drain: one bucket can be empty while others still have units, so you need a fallback (try another bucket, or route away from empty ones).`, demo: `inventoryBuckets` },
      { term: `Unit token pool`, def: `Pre-create one token per unit (unit IDs) in a list or queue; a claim pops one token. In Postgres, SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1 over a units table does the same thing.`, why: `Each claim touches a different item, so there's no single hot counter, and the list being empty is an unambiguous "sold out". SKIP LOCKED lets concurrent claimers skip rows another transaction is holding instead of waiting.` },
      { term: `Sold-out short circuit`, def: `As soon as stock reaches zero, set a flag that the edge, the API gateway and the reservation service check before doing any work.`, why: `After the sell-out, every remaining attempt is guaranteed to fail; answering it at the edge in microseconds protects everything behind it. Clear the flag if expired holds return units.` },
      { term: `Reconciling the gate and the record`, def: `Periodically compare Redis's count with the database (stock minus active holds and paid orders) and repair the cache; on Redis failover, rebuild the counter from the database before reopening.`, why: `Redis replication is asynchronous, so a failover can lose recent decrements and oversell. Treat the database as truth, and prefer under-selling briefly to overselling.` },
      { term: `Choosing a strategy`, def: `Single conditional update for modest demand; Redis gate for very high attempt rates; buckets or a token pool when one key is still too hot; always a sold-out flag.`, why: `Interviewers want the progression and the trade-offs, not one magic answer. Start with the simplest correct option and add machinery only as the numbers demand.` }
    ],
    cheatsheet: [
      { title: `Ways to guard the stock`, type: `table`, headers: [`Approach`, `Correct?`, `Throughput`, `Main cost`], rows: [
        [`Read, check in app, write`, `No: oversells`, `High`, `Broken under concurrency`],
        [`SELECT ... FOR UPDATE`, `Yes`, `~1 / lock time`, `Queueing, timeouts`],
        [`Conditional UPDATE ... WHERE remaining > 0`, `Yes`, `~1 / lock time`, `Hot row`],
        [`Optimistic version check`, `Yes`, `Collapses under conflict`, `Retry storms, false "sold out"`],
        [`Redis DECR / Lua gate`, `Yes (single node)`, `~100K ops/s per key`, `Reconciliation, failover risk`],
        [`N stock buckets`, `Yes`, `~N × one row`, `Uneven drain, fallback logic`],
        [`Unit token pool / SKIP LOCKED`, `Yes`, `High, no single hot counter`, `Pre-creating units`]
      ] },
      { title: `Redis claim script`, type: `code`, body: `-- KEYS[1] = stock:{sale}   KEYS[2] = holders:{sale}   ARGV[1] = userId
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -2 end  -- already has one
local left = tonumber(redis.call('GET', KEYS[1]) or '0')
if left <= 0 then return -1 end                                        -- sold out
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
return left - 1                                                        -- winner` },
      { title: `Claim from a units table`, type: `code`, body: `UPDATE units SET status = 'HELD', user_id = :user, expires_at = now() + interval '10 minutes'
 WHERE id = (SELECT id FROM units
              WHERE sale_id = :sale AND status = 'FREE'
              ORDER BY id
              FOR UPDATE SKIP LOCKED
              LIMIT 1)
RETURNING id;          -- no row -> sold out` }
    ],
    interview: [
      { q: `Why is a single inventory row a bottleneck, and how bad is it?`, a: `Every reservation updates the same row, and a row lock lets only one transaction modify it at a time. If the lock is held for about a millisecond including the commit, the row does about a thousand updates per second. With hundreds of thousands of attempts per second at the start, a queue builds immediately, requests time out, and the order in which people win depends on queueing luck rather than arrival.`, diff: `medium` },
      { q: `Why does optimistic concurrency do badly here?`, a: `Optimistic locking assumes conflicts are rare: read a version, write if it hasn't changed, retry otherwise. In a flash sale nearly every attempt conflicts with another, so most writes fail and retry, multiplying load on the row. After a few retries clients give up, so people are told "sold out" while units remain. It's the wrong tool for a single heavily contended counter.`, diff: `medium` },
      { q: `Walk through using Redis to gate reservations.`, a: `Load the stock into a Redis key before the sale. Each reserve request runs a Lua script that checks the user hasn't already claimed, checks stock > 0 and decrements, atomically, because Redis runs scripts one at a time. Winners then insert their reservation into the database, which remains the source of truth; losers get an immediate "sold out". Expired holds increment the key again. Reconcile Redis against the database periodically, and on failover rebuild the counter from the database before reopening, since asynchronous replication can lose recent decrements.`, diff: `hard` },
      { q: `How do stock buckets work, and what goes wrong?`, a: `Split 20,000 units across N keys or rows and route each attempt to one bucket, so N claims proceed in parallel. Throughput rises roughly N-fold. But buckets drain unevenly, so some users hit an empty bucket while others still hold stock. You fix it by retrying a different bucket, keeping a small bitmap of non-empty buckets to route around empty ones, or rebalancing leftovers at the end; and "sold out" is only true when every bucket is empty.`, diff: `hard` },
      { q: `After 20,000 units are gone, millions of attempts keep coming. What do you do?`, a: `Short-circuit them. When stock reaches zero, set a sold-out flag that the CDN edge or gateway and the reservation service check first, so further attempts never reach Redis or the database. Push the status to clients (or let their polling see it) so they stop retrying. If expired holds return units, clear the flag and reopen briefly, ideally serving people still in the waiting room first.`, diff: `easy` }
    ],
    labs: [`hotRow`, `inventoryBuckets`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch9`, part: 2, number: 9,
    title: `Expiring reservations and taking payment safely`,
    overview: `Reservations are what make the flow work, and also what leak stock. A share of people who win a hold never pay: they get distracted, their card fails or a bot grabbed the unit to resell. Every such hold keeps a unit off the shelf until it expires, so how holds expire matters as much as how long they last. You can expire <strong>lazily</strong> (treat a hold past its expires_at as free whenever stock is read), with a <strong>sweeper</strong> job that releases expired holds every few seconds, or with a <strong>delayed message</strong> scheduled for each hold's expiry. Payment brings its own races: a webhook can arrive after the hold expired, the client can retry, the provider can deliver an event twice. Conditional state transitions and idempotency keys make each of those safe.`,
    concepts: [
      { term: `Abandoned holds`, def: `Reservations whose owner never completes payment, through distraction, a declined card or deliberate hoarding.`, why: `Each one hides a unit for the whole TTL. With a high abandonment rate, a sale that "sold out" in 20 seconds can keep releasing units for many minutes afterwards.`, demo: `holdTimeout` },
      { term: `Lazy expiry`, def: `Don't actively release anything. Count a unit as available if its hold is past expires_at, and let the next claimer take it over with a conditional update.`, why: `No background job, and release is effectively instant. The cost is that every read must filter on time, and Redis-style counters can't express "available unless expired" without extra work.`, demo: `holdTimeout` },
      { term: `Sweeper job`, def: `A scheduled job runs every few seconds, finds holds with status HELD and expires_at < now, marks them EXPIRED and returns the units, in small batches.`, why: `Simple and robust; an index on (status, expires_at) makes each run cheap. Units wait up to one sweep interval after expiry, and the job itself must be monitored.`, demo: `holdTimeout` },
      { term: `Delayed message per hold`, def: `When a hold is created, schedule a message for its expiry time (a delay queue, a scheduler such as a workflow engine's timer, or a sorted set scored by expiry). The handler expires the hold if it's still HELD.`, why: `Release happens close to the exact expiry time with no table scans. It adds infrastructure, and you still want a sweeper as a safety net for lost messages.`, demo: `holdTimeout` },
      { term: `Redis key expiry is not a timer`, def: `Redis TTLs delete keys, but expired-key notifications fire when Redis notices the expiry (on access or by background sampling), which can lag, and they're fire-and-forget pub/sub.`, why: `A tempting shortcut is "set a TTL on the hold key and listen for the expiry event". It works most of the time, which is the dangerous kind of working; don't make it the only release path.` },
      { term: `Release must be conditional`, def: `Expire with UPDATE reservations SET status = 'EXPIRED' WHERE id = ? AND status = 'HELD', and increment stock only if that row changed, in the same transaction.`, why: `The sweeper, a delayed message and a cancel request may all try to release the same hold. Conditional transitions guarantee the unit is returned exactly once.` },
      { term: `Payment after expiry`, def: `A payment can succeed at the provider just after the hold expired and the unit went to someone else.`, why: `Decide the policy up front: either authorise the card first and capture only if the hold is still valid, or refund automatically when the webhook finds an expired hold. Never mark both buyers as owners.` },
      { term: `Authorise, then capture`, def: `Card networks let you authorise (reserve funds) and capture later. Authorise when the user pays; capture only after atomically moving the hold to PAID.`, why: `If the hold has expired, you void the authorisation instead of refunding a captured charge, which is cheaper and less alarming for the customer.` },
      { term: `Idempotent webhook handling`, def: `Providers retry webhooks until acknowledged, so the same event can arrive more than once and out of order. Record processed event IDs and make transitions conditional.`, why: `Duplicate delivery is normal behaviour, not an edge case. The handler must produce the same end state however many times it runs.` },
      { term: `Hold extensions and countdowns`, def: `Show the remaining hold time; optionally extend it once if the user has started payment (for example during a 3-D Secure challenge).`, why: `It reduces the worst outcome, losing a unit mid-payment, without letting idle holds linger. The extension itself is a conditional update on a HELD reservation.` }
    ],
    cheatsheet: [
      { title: `Expiry mechanisms`, type: `table`, headers: [`Mechanism`, `Release delay`, `Moving parts`, `Watch out for`], rows: [
        [`Lazy (check expires_at on read)`, `~0`, `None`, `Every read filters by time; awkward with counters`],
        [`Sweeper every S seconds`, `≤ S (avg S/2)`, `Scheduled job, index`, `Job lag; batch size`],
        [`Delayed message per hold`, `~seconds`, `Delay queue or timer service`, `Lost messages: keep a sweeper`],
        [`Redis key TTL + notification`, `Unbounded lag`, `Pub/sub listener`, `Not guaranteed; never the only path`]
      ] },
      { title: `Expire and pay, safely`, type: `code`, body: `-- sweeper / delayed handler: release exactly once
BEGIN;
UPDATE reservations SET status = 'EXPIRED'
 WHERE id = :id AND status = 'HELD' AND expires_at < now();
-- if 1 row changed:
UPDATE inventory SET remaining = remaining + 1 WHERE sale_id = :sale;
COMMIT;

-- webhook: payment authorised for reservation :id
UPDATE reservations SET status = 'PAID' WHERE id = :id AND status = 'HELD';
-- 1 row  -> capture the authorisation, create the order
-- 0 rows -> hold expired or already handled: void the authorisation` },
      { title: `Payment checklist`, type: `list`, items: [
        `Idempotency key on every pay request, also sent to the provider.`,
        `Authorise first; capture only after HELD becomes PAID.`,
        `Webhook handler verifies signatures, dedupes event IDs, uses conditional updates.`,
        `Backstop job polls the provider for orders stuck in pending.`,
        `Late success on an expired hold: void or refund automatically, and tell the user.`
      ] }
    ],
    interview: [
      { q: `How do reservations get released when people don't pay?`, a: `Each hold has expires_at. Something must return expired units to stock: lazily, by treating holds past expiry as free when someone claims; with a sweeper job that releases expired holds every few seconds using an index on (status, expires_at); or with a delayed message per hold that fires at expiry. I'd use delayed messages or a frequent sweeper for timeliness, keep a sweeper as a safety net, and make every release a conditional update so a unit is returned exactly once.`, diff: `medium` },
      { q: `Why not rely on Redis key expiry events?`, a: `Redis deletes an expired key when it's accessed or found by background sampling, so the notification can be delayed, and keyspace notifications are pub/sub messages that are lost if no listener is connected at that moment. It's fine as a fast path, but stock would leak whenever an event is missed. A sweeper over the database is still required.`, diff: `medium` },
      { q: `Payment succeeds just after the hold expired and the unit was resold. What happens?`, a: `The webhook handler tries to move the reservation from HELD to PAID with a conditional update; zero rows change because it's EXPIRED. With authorise-then-capture, we void the authorisation, so the customer is never charged. Without it, we issue an automatic refund. Either way the user is told clearly. Only one person can own the unit because transitions are conditional.`, diff: `hard` },
      { q: `How would you make the webhook handler safe?`, a: `Verify the provider's signature, store each event ID and skip ones already processed, and apply state changes as conditional updates from the expected prior state, so duplicates and out-of-order deliveries are harmless. Return 2xx only after the change commits, so the provider retries on failure, and run a reconciliation job that queries the provider for anything left pending.`, diff: `medium` },
      { q: `How do the TTL and abandonment rate affect the sale?`, a: `Every abandoned hold takes a unit out of circulation for the TTL plus the release delay. With 30% abandonment and a 10-minute TTL, a third of the stock cycles back roughly every ten minutes, so the sale drags on and people who were told "sold out" could have bought. A shorter TTL recycles faster but cuts off slow, genuine payers. Pick the TTL from the payment-time distribution and reduce abandonment with per-account limits and bot controls.`, diff: `medium` }
    ],
    labs: [`holdTimeout`]
  },
  // ------------------------------------------------------------------
  {
    id: `ch10`, part: 2, number: 10,
    title: `Millions at the door: admission, fairness and the final design`,
    overview: `Even with a fast gate, letting ten million people hit the backend at 10:00:00 is a bad idea: services and databases fall over, clients retry, and the retries make it worse. The answer is to <strong>control admission</strong>. Serve everything static from the CDN, then put a <strong>virtual waiting room</strong> in front of the purchase flow: users join a queue, are let in at a rate the backend can handle, and carry a signed token proving they were admitted. The waiting room is also where <strong>fairness</strong> is decided: by arrival order, by a random order among everyone who arrived before the start, or by a raffle among pre-registered accounts. Add per-account limits, rate limits and bot defences, tell queued users the moment stock is gone, and you have the final design.`,
    concepts: [
      { term: `Admission control`, def: `Deliberately limit how many users enter the purchase flow per second to what the backend can serve, holding the rest outside.`, why: `An overloaded system serves fewer requests than its capacity because of timeouts and retries. Admitting at capacity keeps throughput at its maximum and errors near zero.`, demo: `waitingRoom` },
      { term: `Virtual waiting room`, def: `A queue page served from the edge. Users get a position, the page polls cheaply, and when admitted they receive a short-lived signed token that the purchase API requires.`, why: `It converts a spike into a steady stream. The queue itself is cheap to run because it's static pages plus a counter, and it gives users an honest progress indicator instead of errors.`, demo: `waitingRoom` },
      { term: `Signed admission token`, def: `When admitted, the user gets a token (e.g. a JWT or HMAC-signed cookie) carrying user ID, sale ID and an expiry. The reservation API rejects requests without a valid token.`, why: `It stops people bypassing the queue by calling the API directly, and it can be verified at the edge without a database lookup.` },
      { term: `Retry amplification`, def: `When requests fail, clients and users retry, so offered load grows exactly when the system is weakest.`, why: `This feedback loop is why an unprotected flash sale often fails completely rather than degrading. Queueing, backoff with jitter and clear "sold out" responses break the loop.`, demo: `waitingRoom` },
      { term: `First come, first served`, def: `Admit users strictly in arrival order.`, why: `Feels fair but rewards the fastest connection and automated scripts, which arrive in the first milliseconds. Arrival-time differences of milliseconds decide who wins.`, demo: `fairnessModes` },
      { term: `Randomised start`, def: `Everyone who joins before the sale opens gets a random position; people arriving after the start join the back in arrival order.`, why: `Removes the advantage of hammering refresh at 09:59:59.9, since being early enough is all that matters. Bots with many sessions still get more lottery tickets unless sessions are tied to verified accounts.`, demo: `fairnessModes` },
      { term: `Pre-registered raffle`, def: `People register for the sale in advance; accounts are verified, duplicates and suspicious entries removed, and winners drawn and given a purchase window.`, why: `Turns a stampede into a scheduled, low-load process and gives the most control over bots. The trade-off is friction and less of the "event" feeling some brands want.`, demo: `fairnessModes` },
      { term: `Per-account limits and bot defences`, def: `One unit per account (enforced by a unique constraint or the Redis holders set), rate limits per account, device and IP, CAPTCHA or proof-of-work at queue entry, and risk signals like account age and payment history.`, why: `Limits cap what any one bot can take; friction at queue entry raises the cost of running thousands of sessions. None is perfect alone, so they're layered.` },
      { term: `Tell people early`, def: `When stock (including what's held) runs out, update the waiting room immediately: show "sold out" and offer a waitlist for units that come back from expired holds.`, why: `Keeping a million people waiting for something that's gone wastes their time and your capacity. A waitlist turns released holds into sales without reopening the stampede.` },
      { term: `Final design`, def: `CDN for the page and queue; waiting room with randomised start and signed tokens; reservation service with a Redis gate and a database of record; expiry via delayed messages plus a sweeper; payment with idempotency, authorise-then-capture and webhooks; sold-out flag at the edge; metrics and a load test before launch.`, why: `Every component maps to a requirement: correctness on the counter, survivability under the spike, and fairness at the door.` }
    ],
    cheatsheet: [
      { title: `Final design`, type: `code`, body: `user ──► CDN: sale page, countdown, waiting-room page (static)
          │ join queue (CAPTCHA, 1 entry per account)
          ▼
   waiting room: random order for pre-start arrivals, admit A users/s
          │ signed token {user, sale, exp}
          ▼
   API gateway: verify token, rate limits, sold-out flag ──► "sold out" (fast)
          ▼
   reservation service ──► Redis gate (Lua: limit 1, stock > 0, decr)
          │ winners only
          ▼
   Postgres: reservations (HELD, expires_at), inventory of record
          │                       ▲
          │ delayed msg + sweeper ┘ (EXPIRED -> stock + 1, Redis + 1)
          ▼
   order service ──► payment provider (Idempotency-Key, authorise)
          ▲ webhook: HELD -> PAID, then capture; else void` },
      { title: `Fairness options`, type: `table`, headers: [`Model`, `Who wins`, `Bot resistance`, `Load shape`], rows: [
        [`First come, first served`, `Fastest arrivals`, `Weak: bots are fastest`, `Huge spike at open`],
        [`Randomised start`, `Random among on-time arrivals`, `Medium: more sessions, more tickets`, `Spike absorbed by the queue`],
        [`Pre-registered raffle`, `Random among verified entrants`, `Strong: verify before the draw`, `Scheduled, low`]
      ] },
      { title: `Launch-day checklist`, type: `list`, items: [
        `Load test the full path at the expected peak, including retries.`,
        `Pre-warm caches, connection pools and the Redis counter; pre-scale servers.`,
        `Dashboards: admission rate, reserve success and latency, stock, holds, payment errors.`,
        `Kill switches: pause admission, extend holds, close the sale.`,
        `Reconcile Redis, holds and orders before declaring the sale finished.`
      ] }
    ],
    interview: [
      { q: `Why use a waiting room instead of just scaling the backend?`, a: `The spike lasts seconds and is many times normal peak; autoscaling takes minutes, and pre-scaling everything to the full spike is expensive and still leaves the hot counter as a limit. A waiting room admits users at the rate the backend can serve, so it runs at full throughput with few errors, users get a position rather than failures, and the queue is a natural place to enforce fairness and bot checks.`, diff: `medium` },
      { q: `How do you stop people bypassing the waiting room?`, a: `Issue a short-lived signed token on admission containing the user ID, sale ID and expiry, and require it on the reservation API. The gateway verifies the signature without a database call, rejects missing or expired tokens, and the reservation service checks the token's user matches the authenticated user so tokens can't be shared.`, diff: `medium` },
      { q: `What does fair mean, and how would you implement it?`, a: `It's a product decision. First come, first served rewards the fastest clients, mostly bots. A randomised start gives everyone who arrived before opening a random place in the queue, so refresh-hammering doesn't help. A pre-registered raffle verifies accounts first and draws winners, the strongest against bots. In all cases add one unit per account and rate limits, and tie queue entries to verified accounts so extra sessions don't buy extra chances.`, diff: `hard` },
      { q: `Stock is gone but 2 million people are still in the queue. What now?`, a: `Tell them immediately: the waiting room reads the sold-out flag and replaces the queue with a sold-out message, which also stops their polling load. Offer a waitlist: when expired holds return units, admit people from the waitlist in order rather than reopening to everyone. Keep the flag at the edge so no further requests reach the backend.`, diff: `easy` },
      { q: `Summarise your final design in a minute.`, a: `Static page and waiting room on the CDN. The waiting room randomises pre-start arrivals and admits users at backend capacity with a signed token. The gateway checks the token, rate limits and a sold-out flag. The reservation service claims a unit with an atomic Lua script in Redis (one per user, stock > 0), and winners write a HELD reservation with an expiry to Postgres, the system of record. Delayed messages and a sweeper expire holds conditionally and return stock. Payment uses an idempotency key, authorises first and captures only when the hold becomes PAID via webhook. Reconciliation jobs keep Redis, holds and orders consistent.`, diff: `medium` }
    ],
    labs: [`waitingRoom`, `fairnessModes`]
  }
);
