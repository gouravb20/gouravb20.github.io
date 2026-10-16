// Deep dive: Chapter 8, Consistency under contention. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>The conditional update is correct but funnels every attempt through one row lock. This chapter measures that limit and compares the ways past it: locks, optimistic retries, a Redis gate, stock buckets, a unit token pool, and the sold-out flag that ends the burst.</p>`,
  sections: [
    {
      id: "hot-row",
      title: "The hot row",
      kicker: "Why one row caps throughput",
      blocks: [
        {
          type: "problem",
          html: `<p>A row lock lets one transaction change the row at a time, so throughput is about <span class="formula">1 ÷ lock hold time</span>: ~1,000 updates/s at 1 ms, regardless of machine size. Hundreds of thousands of attempts per second arrive, so a queue forms at once, requests time out while stock remains, and winning depends on queue position rather than arrival time.</p>`,
        },
        {
          type: "lab",
          id: "hotRow",
          caption: "On \"one row\", watch the queue explode and count the people who timed out with units still left. Turn on the sold-out flag to stop draining doomed attempts after the sell-out. Then try the Redis counter: no queue, and only winners write to the database.",
        },
      ],
    },
    {
      id: "locks",
      title: "Pessimistic and optimistic locking",
      kicker: "Both correct, neither enough",
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Pessimistic: SELECT ... FOR UPDATE", tone: "warn", html: "<p>Lock, read, decide, write. Correct and simple, but any work inside the lock (application logic, network hops) lengthens the hold time and the queue. If you use it, keep the locked section to a single round trip.</p>" },
            { title: "Optimistic: version check", tone: "bad", html: "<p>Read with a version, write <code>WHERE version = :v</code>, retry on conflict. Built for rare conflicts. Here almost every attempt conflicts, so retries multiply load and clients give up while stock remains: false \"sold out\".</p>" },
          ],
        },
        {
          type: "quiz",
          q: "Under a flash-sale burst, what is the characteristic failure of optimistic concurrency on the stock row?",
          options: [
            "It oversells",
            "Most writes conflict and retry; after a few retries clients give up and are told \"sold out\" while units remain",
            "It deadlocks",
            "It needs a distributed transaction",
          ],
          answer: 1,
          explain: "Version checks never oversell, but they assume conflicts are rare. With hundreds of writers per millisecond, nearly every write loses the race, retries pile up, and buyers give up with stock still available.",
        },
      ],
    },
    {
      id: "redis-gate",
      title: "Move the gate into Redis",
      kicker: "Decide in memory, record in the database",
      blocks: [
        {
          type: "idea",
          html: `<p>Keep the remaining count in Redis and claim with one atomic script. Redis runs commands one at a time on a single thread, so a script that checks and decrements can't interleave with another. It handles on the order of 100K simple operations per second, and only the ~20,000 winners go on to write their hold to the database, which stays the system of record.</p>`,
        },
        {
          type: "diagram",
          title: "Gate in Redis, record in Postgres",
          caption: "Every attempt runs the claim script in Redis. Losers are answered immediately. Winners insert a HELD reservation in Postgres. Expiries add the unit back to both. A reconciliation job compares the two.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Attempts go to a Redis claim script; losers get sold out immediately; winners write a reservation to Postgres; a reconcile job compares Redis and Postgres">
<defs><marker id="pb8-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="10" y="85" width="110" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="1.5"/>
<text x="65" y="108" text-anchor="middle" font-size="13" font-weight="700">Attempts</text>
<text x="65" y="125" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">~100K+/s</text>
<rect x="180" y="75" width="150" height="70" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="1.5"/>
<text x="255" y="100" text-anchor="middle" font-size="13" font-weight="700">Redis claim script</text>
<text x="255" y="117" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">limit 1, stock &gt; 0,</text>
<text x="255" y="132" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">decrement</text>
<rect x="400" y="20" width="200" height="44" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="1.5"/>
<text x="500" y="47" text-anchor="middle" font-size="13" font-weight="700">"Sold out" (losers)</text>
<rect x="400" y="110" width="200" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="1.5"/>
<text x="500" y="134" text-anchor="middle" font-size="13" font-weight="700">Postgres</text>
<text x="500" y="152" text-anchor="middle" font-size="11" style="fill: var(--dg-muted)">HELD reservation (~20K writes)</text>
<line x1="120" y1="110" x2="178" y2="110" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pb8-arrow)"/>
<line x1="330" y1="95" x2="398" y2="45" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb8-arrow)"/>
<line x1="330" y1="125" x2="398" y2="135" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#pb8-arrow)"/>
<path d="M500 166 C 500 210, 255 210, 255 147" style="fill: none; stroke: var(--dg-3)" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#pb8-arrow)"/>
<text x="380" y="215" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">reconcile; rebuild on failover</text>
</svg>`,
        },
        {
          type: "code",
          title: "Claim script (runs atomically)",
          lang: "lua",
          code: `-- KEYS[1] = stock:{sale}   KEYS[2] = holders:{sale}   ARGV[1] = userId
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -2 end  -- already holds one
local left = tonumber(redis.call('GET', KEYS[1]) or '0')
if left <= 0 then return -1 end                                        -- sold out
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
return left - 1                                                        -- winner`,
        },
        {
          type: "tradeoffs",
          prosLabel: "The Redis gate buys",
          consLabel: "It costs",
          pros: [
            "~100× the throughput of a locked row",
            "Database writes ≈ units, not attempts",
            "Per-customer limit in the same atomic step",
          ],
          cons: [
            "Two stores to keep consistent: reconcile against the database",
            "Asynchronous replication: a failover can lose recent decrements, so rebuild the count from the database before reopening",
            "A winner whose database write fails must give the unit back",
          ],
        },
      ],
    },
    {
      id: "spreading",
      title: "Spreading the stock: buckets and unit tokens",
      kicker: "When one key is still too hot",
      blocks: [
        {
          type: "compare",
          items: [
            { title: "N stock buckets", tone: "warn", html: "<p>Split 20,000 units into N counters and route each attempt to one. Throughput ≈ N × one counter. Buckets drain unevenly, so add a fallback: retry another bucket, or route only to buckets known to be non-empty. \"Sold out\" means every bucket is empty.</p>" },
            { title: "Unit token pool", tone: "ok", html: "<p>Pre-create one row or list entry per unit; a claim takes one. No single hot counter, and an empty pool is an unambiguous \"sold out\". In Postgres, <code>FOR UPDATE SKIP LOCKED</code> lets concurrent claimers skip rows another transaction holds.</p>" },
          ],
        },
        {
          type: "lab",
          id: "inventoryBuckets",
          caption: "With 16 buckets and \"say sold out\", see how much stock is left when the first bucket empties and how many false \"sold out\" answers follow. Then compare retries with routing to non-empty buckets only.",
        },
        {
          type: "code",
          title: "Claim one unit with SKIP LOCKED",
          lang: "sql",
          code: `UPDATE units SET status = 'HELD', user_id = :user, expires_at = now() + interval '10 minutes'
 WHERE id = (SELECT id FROM units
              WHERE sale_id = :sale AND status = 'FREE'
              ORDER BY id
              FOR UPDATE SKIP LOCKED
              LIMIT 1)
RETURNING id;   -- no row: sold out`,
        },
      ],
    },
    {
      id: "closing-the-gate",
      title: "Closing the gate, and choosing",
      kicker: "Sold-out flag and the progression",
      blocks: [
        {
          type: "text",
          html: `<p>After the last unit goes, every further attempt is guaranteed to fail. Set a <strong>sold-out flag</strong> that the edge, the gateway and the reservation service check first, so those attempts never reach Redis or the database. Clear it if expired holds return units.</p>`,
        },
        {
          type: "table",
          title: "Which guard, when",
          headers: ["Approach", "Throughput", "Use when"],
          rows: [
            ["Conditional UPDATE on one row", "~1 / lock time", "Modest demand"],
            ["Redis atomic gate + DB of record", "~100K ops/s per key", "Very high attempt rates"],
            ["Buckets or token pool", "Scales with N", "One key is still too hot"],
            ["Sold-out flag at the edge", "Effectively unlimited", "Always"],
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong answer: name the hot-row limit with a number; reject optimistic locking for this case; move the gate to an atomic Redis script with the database as the record; explain reconciliation and failover; mention buckets or a token pool for extra headroom; finish with a sold-out flag at the edge.</p>`,
        },
        {
          type: "quiz",
          q: "Redis fails over to a replica during the sale. What is the main risk, and the fix?",
          options: [
            "No risk; replicas are always in sync",
            "Recent decrements may be missing on the replica (replication is asynchronous), so it could oversell; pause claims and rebuild the count from the database before reopening",
            "The Lua script stops being atomic",
            "Reservations in the database are lost",
          ],
          answer: 1,
          explain: "Redis replicates asynchronously, so the promoted replica can be behind. Its counter may be higher than the true remaining stock. Treat the database as truth: recompute remaining = stock minus active holds and paid orders, then reopen.",
        },
      ],
    },
  ],
  takeaways: [
    "A locked row handles about <strong>1 / lock time</strong> updates per second; a burst beyond that queues, times out and becomes unfair.",
    "<strong>Optimistic locking</strong> collapses under constant conflict: retries and false \"sold out\".",
    "<strong>Redis atomic gate, database of record:</strong> ~100× throughput, database writes ≈ units; reconcile and rebuild after failover.",
    "<strong>Buckets</strong> and <strong>unit token pools</strong> remove the single hot key; buckets need a fallback for uneven drain.",
    "A <strong>sold-out flag</strong> at the edge turns millions of doomed attempts into instant answers.",
  ],
  furtherReading: [
    { title: "Hello Interview: Design a Flash Sale System", url: "https://www.hellointerview.com/learn/system-design/problem-breakdowns/flash-sale", note: "The original walkthrough of this problem." },
    { title: "PostgreSQL documentation: SELECT, the locking clause (FOR UPDATE, SKIP LOCKED)", url: "https://www.postgresql.org/docs/current/sql-select.html" },
    { title: "Redis documentation: EVAL (Lua scripting)", url: "https://redis.io/docs/latest/commands/eval/" },
  ],
};
