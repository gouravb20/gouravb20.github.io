// Deep dive: Multi-step processes. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["multi-step-processes"] = {
  hook: `<p>Inside one database, "do these four things or none of them" is a single <code>BEGIN ... COMMIT</code>. Spread the four things over a payment provider, an inventory service, a courier API and an email service, let some of them take days, and that guarantee is gone. What remains is a set of techniques for making a process <em>finish or undo itself</em> anyway: persisted progress, idempotent steps, compensations, and engines that remember where every workflow is.</p><p>This deep dive works through the mechanics of each: how to build a state machine that survives crashes, how sagas compensate and what they don't protect you from, how durable execution replays code from a history, and the operational questions (versioning, external events, history size, stuck workflows) that decide whether the design survives production.</p>`,
  sections: [
    {
      id: `why-not-one-transaction`,
      title: `Why one transaction can't cover the process`,
      kicker: `The problem`,
      blocks: [
        { type: `text`, html: `<p>An ACID transaction works because one system controls every write: it can hold locks, log the changes, and on failure discard them all. A multi-step process breaks each of those assumptions:</p>` },
        { type: `keypoints`, items: [
          `<strong>Different owners.</strong> Payment, inventory and shipping each own a database. Nobody can hold a lock in all three, and external APIs (card networks, couriers, banks) never take part in your transactions.`,
          `<strong>Long durations.</strong> A step may wait minutes for a webhook or days for a human. Locks held that long would stall everything else.`,
          `<strong>Visible effects.</strong> Some steps can't be hidden until "commit": an email is read, a card statement shows a pending charge, a courier turns up.`,
        ] },
        { type: `text`, html: `<p><strong>Two-phase commit</strong> is the textbook answer for atomicity across databases: a coordinator asks every participant to prepare, then tells all of them to commit. It needs every participant to support the protocol, holds locks across the slowest participant's round trip, and if the coordinator fails after "prepare", participants can be left blocked holding locks until it recovers. For services you own it is rarely worth it; for third-party APIs it is impossible. So the industry settled on a different contract: each step commits locally and immediately, and the <em>process</em> guarantees it will eventually reach a consistent end state.</p>` },
        { type: `callout`, tone: `insight`, title: `The guarantee you are actually building`, html: `<p>Not "atomic and isolated", but "<strong>eventually complete or eventually compensated</strong>, with each effect applied once". Every technique below serves one of three needs: remembering progress outside a process, making repeated steps harmless, and undoing completed steps when the process can't finish.</p>` },
        { type: `quiz`, q: `A team proposes two-phase commit across their order, payment (backed by a third-party card processor) and shipping services. What is the most fundamental problem?`, options: [
          `2PC is too slow for any production use`,
          `The card processor and courier APIs won't participate in your 2PC protocol, so the steps that matter most can't be prepared and rolled back`,
          `2PC only works with two participants`,
          `2PC does not guarantee durability`,
        ], answer: 1, explain: `2PC can work between databases that support it, at a cost in latency and blocking. But the riskiest steps call external systems that expose only "do it" APIs, not prepare/commit. Those steps need idempotent calls and compensations, which is what sagas provide.` },
      ],
    },
    {
      id: `state-machine`,
      title: `A state machine that survives crashes`,
      kicker: `Persisting progress`,
      blocks: [
        { type: `idea`, html: `<p>Move the process's memory from a thread into a row. The order's <strong>state column</strong> says what has been done; workers read the state, perform the next step, and advance it. Any worker can pick up any order, so a crash loses nothing but time.</p>` },
        { type: `diagram`, title: `An order as a state machine`, caption: `Forward transitions run along the top. A permanent failure moves the order into CANCELLING, where compensations run until it reaches CANCELLED. A sweeper resumes any order that stays in one state longer than that step should take.`, svg: `<svg viewBox="0 0 620 200" role="img" aria-label="Order state machine with forward states and a cancelling branch">
<defs><marker id="pt3-arrow-sm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="12" font-weight="700" text-anchor="middle" style="fill: var(--dg-ink)">
<rect x="10" y="30" width="100" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="60" y="55">CREATED</text>
<rect x="132" y="30" width="100" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="182" y="55">RESERVED</text>
<rect x="254" y="30" width="100" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="304" y="55">CHARGED</text>
<rect x="376" y="30" width="100" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="426" y="55">SHIPPED</text>
<rect x="498" y="30" width="100" height="40" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/><text x="548" y="55">DONE</text>
<rect x="200" y="130" width="120" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="260" y="155">CANCELLING</text>
<rect x="478" y="130" width="120" height="40" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/><text x="538" y="155">CANCELLED</text>
</g>
<g stroke-width="2" style="stroke: var(--dg-muted)">
<line x1="110" y1="50" x2="130" y2="50" marker-end="url(#pt3-arrow-sm)"/>
<line x1="232" y1="50" x2="252" y2="50" marker-end="url(#pt3-arrow-sm)"/>
<line x1="354" y1="50" x2="374" y2="50" marker-end="url(#pt3-arrow-sm)"/>
<line x1="476" y1="50" x2="496" y2="50" marker-end="url(#pt3-arrow-sm)"/>
</g>
<g stroke-width="2" style="stroke: var(--dg-2)">
<line x1="182" y1="70" x2="235" y2="128" marker-end="url(#pt3-arrow-sm)"/>
<line x1="304" y1="70" x2="285" y2="128" marker-end="url(#pt3-arrow-sm)"/>
<line x1="320" y1="150" x2="476" y2="150" marker-end="url(#pt3-arrow-sm)"/>
</g>
<text x="20" y="104" font-size="12" style="fill: var(--dg-2)">step fails permanently</text>
<text x="398" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-2)">compensations done</text>
<text x="10" y="192" font-size="12" style="fill: var(--dg-muted)">Sweeper: resume any order whose state hasn't changed within that step's timeout.</text>
</svg>` },
        { type: `code`, lang: `sql`, title: `Advance the state only from the expected state`, code: `-- The worker charged the card for order 991 (with key 'order-991-charge').
UPDATE orders
   SET state = 'CHARGED', charge_id = 'ch_8812', updated_at = now(), attempts = 0
 WHERE id = 991 AND state = 'RESERVED';
-- 0 rows updated: another worker already moved it on, so do nothing.

-- Sweeper: orders stuck longer than their step allows
SELECT id, state FROM orders
 WHERE state NOT IN ('DONE', 'CANCELLED')
   AND updated_at < now() - interval '10 minutes'
 ORDER BY updated_at
 LIMIT 100
 FOR UPDATE SKIP LOCKED;` },
        { type: `keypoints`, title: `What the hand-rolled version must handle`, items: [
          `<strong>Conditional transitions</strong> (<code>WHERE state = 'RESERVED'</code>) so two workers can't both advance an order or move it backwards.`,
          `<strong>Leases:</strong> a worker claims an order with a <code>locked_until</code> timestamp; if it dies, the lease expires and another worker takes over. <code>SKIP LOCKED</code> lets many sweepers share the table.`,
          `<strong>Timers:</strong> a <code>due_at</code> column with an index, polled by a scheduler, for "cancel if unpaid after 30 minutes" or "remind after 24 hours".`,
          `<strong>Retry bookkeeping:</strong> attempt counters, next-attempt times with backoff, and a terminal FAILED state that pages a human.`,
          `<strong>Messages:</strong> if steps are triggered through a queue, the state change and the outgoing command go through an outbox, or a crash between them stalls the order.`,
        ] },
        { type: `callout`, tone: `tip`, title: `When this is the right answer`, html: `<p>One or two flows, a team that already runs Postgres and a queue, and no appetite for a new platform. Once you have many flows with timers and compensations, the sweeper, scheduler and retry code become a workflow engine you maintain alone.</p>` },
      ],
    },
    {
      id: `steps-at-least-once`,
      title: `Every step runs at least once: retries, timeouts and idempotency`,
      kicker: `Making repetition harmless`,
      blocks: [
        { type: `text`, html: `<p>Any call across a network has three outcomes, not two: it succeeded, it failed, or <strong>you don't know</strong>. A timeout is the third case: the payment may have gone through just before the connection dropped. Every recovery mechanism (client retries, queue redelivery, sweepers, workflow engines) responds to "don't know" by doing the step again. So design every step to be safe to repeat.</p>` },
        { type: `table`, title: `Classify errors before retrying`, headers: [`Error`, `Kind`, `Response`], rows: [
          [`Timeout, connection reset`, `Unknown outcome`, `Retry with the same idempotency key`],
          [`503, 429, broker unavailable`, `Transient`, `Retry with backoff and jitter, honour Retry-After`],
          [`Card declined, out of stock, invalid address`, `Permanent, business`, `Don't retry; compensate earlier steps`],
          [`400 from a bug in your request`, `Permanent, technical`, `Don't retry; fail the workflow and alert`],
        ] },
        { type: `code`, lang: `python`, title: `Capped exponential backoff with full jitter`, code: `import random, time

def call_with_retries(step, key, max_attempts=6, base=0.5, cap=30.0):
    for attempt in range(max_attempts):
        try:
            return step(idempotency_key=key, timeout=5.0)
        except PermanentError:
            raise                                   # compensate, don't retry
        except TransientError:
            if attempt == max_attempts - 1:
                raise
            delay = random.uniform(0, min(cap, base * 2 ** attempt))
            time.sleep(delay)                       # jitter spreads retries out` },
        { type: `text`, html: `<p>The receiving side makes repeats harmless. The payment service stores each idempotency key with its result, and a second request with the same key returns the stored result instead of charging again. Where you control the database, a <strong>unique constraint</strong> (one shipment per order ID) or a <strong>conditional update</strong> (only from the expected state) does the same job. The full treatment of keys, their storage and expiry is in <a href="../../core-concepts/ch8/">core concepts chapter 8</a>.</p>` },
        { type: `callout`, tone: `mistake`, title: `Generating the key inside the retry loop`, html: `<p>A key created fresh on each attempt (<code>uuid4()</code> per call) protects nothing: every retry looks like a new payment. Derive the key from the workflow and step (<code>order-991-charge</code>), or generate it once and persist it before the first attempt.</p>` },
        { type: `quiz`, q: `A worker sends a charge with idempotency key order-991-charge, the payment service charges the card, and the worker crashes before saving CHARGED. The sweeper re-runs the step with the same key. What happens?`, options: [
          `The card is charged twice`,
          `The payment service returns the original result and the order advances to CHARGED; the card is charged once`,
          `The payment service rejects the request and the order is stuck`,
          `The sweeper skips the step because it is already done`,
        ], answer: 1, explain: `The sweeper can't know the charge happened, so it repeats the step. Because the key is the same, the payment service recognizes the repeat and replays its stored response. That is the whole point of deriving keys from the step rather than the attempt.` },
      ],
    },
    {
      id: `saga-mechanics`,
      title: `Sagas in detail: compensation, ordering and missing isolation`,
      kicker: `Undoing work`,
      blocks: [
        { type: `text`, html: `<p>The saga idea comes from Hector Garcia-Molina and Kenneth Salem's 1987 paper on long-lived transactions: split a long transaction into a sequence of shorter ones, T1 to Tn, each with a compensating transaction C1 to Cn. The system guarantees that either T1...Tn all run, or T1...Tk run followed by Ck...C1. Microservices adopted the same structure, with each Ti a local transaction in one service.</p>` },
        { type: `table`, title: `Three kinds of step`, headers: [`Kind`, `Meaning`, `Order examples`], rows: [
          [`Compensatable`, `Can be semantically undone later`, `Reserve stock (release it), authorize a card (void it), create a PENDING order (cancel it)`],
          [`Pivot`, `The go/no-go point; after it the saga only moves forward`, `Capture payment, book the courier`],
          [`Retriable`, `Comes after the pivot and is retried until it succeeds; must never fail for business reasons`, `Send the confirmation, update the loyalty points`],
        ] },
        { type: `keypoints`, title: `Writing good compensations`, items: [
          `<strong>Semantic, not physical.</strong> Refund rather than delete the charge record; the history of what happened is kept.`,
          `<strong>Idempotent and retried forever</strong> (with alerts). There is no compensation for a failed compensation; a refund that keeps failing goes to a human queue, not into silence.`,
          `<strong>Commutative with a late forward step.</strong> If "release stock" runs before a delayed "reserve stock" arrives, the reserve must see the cancellation and do nothing. Record compensations by step key so late arrivals are rejected.`,
          `<strong>Some effects can't be undone.</strong> An email was read and goods left the warehouse. Push them past the pivot or compensate with a business action (an apology email, a return label).`,
        ] },
        { type: `text`, html: `<p><strong>Missing isolation.</strong> Each local transaction commits immediately, so other requests see intermediate states. Two classic anomalies: a <em>dirty read</em> (a report counts revenue from an order that is about to be refunded) and a <em>lost update</em> (one saga overwrites a field another saga changed in between). The standard countermeasures:</p>` },
        { type: `list`, items: [
          `<strong>Semantic lock:</strong> a status such as PENDING that other flows check, for example refusing to modify an order while its saga runs.`,
          `<strong>Reservations with expiry</strong> instead of decrements, so abandoned sagas release resources on their own; see the <a href="../dealing-with-contention/">contention chapter</a>.`,
          `<strong>Commutative updates:</strong> design operations (credit and debit entries) so their order doesn't matter.`,
          `<strong>Re-read before acting:</strong> check that the value is still what the saga assumed before the pivot.`,
        ] },
        { type: `diagram`, title: `Orchestration and choreography`, caption: `Left: one orchestrator sends commands and receives replies, so the saga's state lives in one place. Right: services publish events to a bus and subscribe to each other's, so the flow is the sum of their subscriptions.`, svg: `<svg viewBox="0 0 620 230" role="img" aria-label="An orchestrator commanding three services compared with services exchanging events through a bus">
<defs><marker id="pt3-arrow-oc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="150" y="20" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">Orchestration</text>
<text x="470" y="20" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">Choreography</text>
<line x1="310" y1="10" x2="310" y2="220" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<rect x="85" y="36" width="130" height="38" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="150" y="53" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-ink)">Orchestrator</text>
<text x="150" y="68" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">saga state</text>
<g style="fill: var(--dg-1-soft); stroke: var(--dg-1)"><rect x="10" y="150" width="88" height="36" rx="8"/><rect x="106" y="150" width="88" height="36" rx="8"/><rect x="202" y="150" width="88" height="36" rx="8"/></g>
<g font-size="12" text-anchor="middle" style="fill: var(--dg-ink)"><text x="54" y="173">Payment</text><text x="150" y="173">Inventory</text><text x="246" y="173">Shipping</text></g>
<g stroke-width="2" style="stroke: var(--dg-muted)">
<line x1="130" y1="76" x2="58" y2="147" marker-start="url(#pt3-arrow-oc)" marker-end="url(#pt3-arrow-oc)"/>
<line x1="150" y1="76" x2="150" y2="147" marker-start="url(#pt3-arrow-oc)" marker-end="url(#pt3-arrow-oc)"/>
<line x1="170" y1="76" x2="242" y2="147" marker-start="url(#pt3-arrow-oc)" marker-end="url(#pt3-arrow-oc)"/>
</g>
<text x="150" y="208" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">commands down, replies up</text>
<g style="fill: var(--dg-1-soft); stroke: var(--dg-1)"><rect x="330" y="36" width="84" height="36" rx="8"/><rect x="428" y="36" width="84" height="36" rx="8"/><rect x="526" y="36" width="84" height="36" rx="8"/><rect x="379" y="160" width="84" height="36" rx="8"/><rect x="477" y="160" width="84" height="36" rx="8"/></g>
<g font-size="12" text-anchor="middle" style="fill: var(--dg-ink)"><text x="372" y="59">Order</text><text x="470" y="59">Payment</text><text x="568" y="59">Inventory</text><text x="421" y="183">Shipping</text><text x="519" y="183">Notify</text></g>
<rect x="330" y="102" width="280" height="30" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="470" y="122" text-anchor="middle" font-size="12" style="fill: var(--dg-ink)">event bus: OrderCreated, PaymentCaptured...</text>
<g stroke-width="2" style="stroke: var(--dg-muted)">
<line x1="372" y1="74" x2="372" y2="100" marker-start="url(#pt3-arrow-oc)" marker-end="url(#pt3-arrow-oc)"/>
<line x1="470" y1="74" x2="470" y2="100" marker-start="url(#pt3-arrow-oc)" marker-end="url(#pt3-arrow-oc)"/>
<line x1="568" y1="74" x2="568" y2="100" marker-start="url(#pt3-arrow-oc)" marker-end="url(#pt3-arrow-oc)"/>
<line x1="421" y1="134" x2="421" y2="158" marker-start="url(#pt3-arrow-oc)" marker-end="url(#pt3-arrow-oc)"/>
<line x1="519" y1="134" x2="519" y2="158" marker-start="url(#pt3-arrow-oc)" marker-end="url(#pt3-arrow-oc)"/>
</g>
<text x="470" y="216" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">publish and subscribe; no one owns the flow</text>
</svg>` },
        { type: `tradeoffs`, title: `Choreography`, prosLabel: `Works well`, consLabel: `Hurts`, pros: [
          `No coordinator to build, scale or keep durable`,
          `Teams add consumers without touching the producer`,
          `Natural fit when a few services already exchange domain events`,
        ], cons: [
          `The flow is implicit: no single place shows the steps or an instance's state`,
          `Changing the order of steps means coordinated changes across teams`,
          `Cyclic dependencies and event storms creep in as flows grow`,
          `Timeouts ("nobody replied in 10 minutes") have no natural owner`,
        ] },
        { type: `callout`, tone: `interview`, title: `A safe default`, html: `<p>Say you would use choreography for loosely related reactions (order placed, so update recommendations and analytics) and orchestration for the transactional core that needs compensations and timeouts. Many real systems mix both: an orchestrated checkout publishes <code>OrderConfirmed</code> for everyone else to react to.</p>` },
      ],
    },
    {
      id: `durable-execution-internals`,
      title: `How durable execution works`,
      kicker: `Workflow engines`,
      blocks: [
        { type: `text`, html: `<p>A durable execution engine splits your code into two kinds of function. <strong>Workflows</strong> describe the process: the order of steps, branches, waits and compensations. They must be deterministic. <strong>Activities</strong> do the real work (call the payment API, write to a database). They can do anything, are retried by the engine with a configurable policy, and run at least once. The engine stores, per workflow, an append-only <strong>event history</strong>.</p>` },
        { type: `diagram`, title: `Replaying a workflow from its history`, caption: `After a crash, a new worker runs the workflow function again. The first three calls match recorded events, so their results are taken from history and no service is called. The fourth call has no recorded event, so it is scheduled for real and its result is appended.`, svg: `<svg viewBox="0 0 620 236" role="img" aria-label="Workflow code lines matched against recorded history events during replay">
<defs><marker id="pt3-arrow-replay" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="22" font-size="13" font-weight="700" style="fill: var(--dg-ink)">Event history (engine store)</text>
<text x="360" y="22" font-size="13" font-weight="700" style="fill: var(--dg-ink)">Workflow code (new worker)</text>
<g style="fill: var(--dg-4-soft); stroke: var(--dg-4)"><rect x="20" y="36" width="250" height="30" rx="6"/><rect x="20" y="76" width="250" height="30" rx="6"/><rect x="20" y="116" width="250" height="30" rx="6"/></g>
<rect x="20" y="156" width="250" height="30" rx="6" stroke-dasharray="4 3" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<g font-size="12" style="fill: var(--dg-ink)"><text x="30" y="56">chargeCard completed: ch_8812</text><text x="30" y="96">reserveStock completed: hold_51</text><text x="30" y="136">timer fired after 2 days</text></g>
<text x="30" y="176" font-size="12" style="fill: var(--dg-muted)">end of history (crash)</text>
<g style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"><rect x="360" y="36" width="240" height="30" rx="6"/><rect x="360" y="76" width="240" height="30" rx="6"/><rect x="360" y="116" width="240" height="30" rx="6"/></g>
<rect x="360" y="156" width="240" height="30" rx="6" stroke-width="2" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<g font-size="12" style="fill: var(--dg-ink)"><text x="370" y="56">await chargeCard(order)</text><text x="370" y="96">await reserveStock(order)</text><text x="370" y="136">await sleep("2 days")</text><text x="370" y="176">await bookCourier(order)</text></g>
<g stroke-width="2" style="stroke: var(--dg-ok)">
<line x1="358" y1="51" x2="274" y2="51" marker-end="url(#pt3-arrow-replay)"/>
<line x1="358" y1="91" x2="274" y2="91" marker-end="url(#pt3-arrow-replay)"/>
<line x1="358" y1="131" x2="274" y2="131" marker-end="url(#pt3-arrow-replay)"/>
</g>
<text x="316" y="44" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">replayed</text>
<text x="20" y="208" font-size="12" style="fill: var(--dg-3)">bookCourier has no recorded event, so it runs live</text><text x="20" y="226" font-size="12" style="fill: var(--dg-3)">and its result is appended to the history.</text>
</svg>` },
        { type: `keypoints`, title: `Determinism rules for workflow code`, items: [
          `No direct I/O: network calls, database queries and file reads go in activities.`,
          `No wall clock or random numbers: use the engine's time and side-effect APIs, which record their values in the history.`,
          `No threads or unordered iteration that could change the order of commands between runs.`,
          `Waiting is free: a sleep of 30 days is a durable timer, and the workflow is not in memory while it waits.`,
        ] },
        { type: `code`, lang: `json`, title: `The same ideas in AWS Step Functions (Amazon States Language excerpt)`, code: `{
  "StartAt": "ChargeCard",
  "States": {
    "ChargeCard": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": { "FunctionName": "charge-card", "Payload.$": "$" },
      "Retry": [{ "ErrorEquals": ["States.Timeout", "Lambda.ServiceException"],
                  "IntervalSeconds": 2, "MaxAttempts": 5, "BackoffRate": 2.0 }],
      "Catch": [{ "ErrorEquals": ["CardDeclined"], "Next": "CancelOrder" }],
      "Next": "WaitForApproval"
    },
    "WaitForApproval": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke.waitForTaskToken",
      "Parameters": { "FunctionName": "request-approval",
                      "Payload": { "order.$": "$", "token.$": "$$.Task.Token" } },
      "TimeoutSeconds": 172800,
      "Catch": [{ "ErrorEquals": ["States.Timeout"], "Next": "RefundCard" }],
      "Next": "BookCourier"
    }
  }
}` },
        { type: `realworld`, items: [
          { org: `Uber`, title: `Cadence`, html: `Uber built and open-sourced Cadence to run long-lived business workflows as code. Its creators later started Temporal, which keeps the same model of workflows, activities and replay from event history.` },
          { org: `AWS`, title: `Step Functions`, html: `A managed state machine service. Standard workflows run for up to a year with exactly-once state transitions; Express workflows run for up to five minutes at high throughput (at-least-once when started asynchronously, at-most-once when started synchronously). Callbacks use task tokens.` },
          { org: `Netflix`, title: `Conductor`, html: `Netflix built and open-sourced Conductor, an orchestration engine where workflows are defined as JSON and tasks are run by workers polling for work.` },
          { org: `Microsoft`, title: `Azure Durable Functions`, html: `Orchestrator functions written as code are replayed from an event-sourced history, with the same requirement that orchestrator code be deterministic.` },
        ] },
        { type: `callout`, tone: `warning`, title: `Airflow is not a checkout engine`, html: `<p>Airflow and similar schedulers run DAGs of batch tasks on a schedule: extract, transform, load, train a model. They are built for thousands of pipeline runs a day, not a separate workflow per customer order with sub-second steps, signals and per-instance compensation.</p>` },
      ],
    },
    {
      id: `external-events`,
      title: `Waiting on the outside world: signals, timers and callbacks`,
      kicker: `External events`,
      blocks: [
        { type: `text`, html: `<p>Many steps don't finish when a call returns. A payment provider confirms by webhook; a fraud analyst approves in a dashboard; a driver accepts on a phone. The workflow must park, then wake on either the event or a deadline. Engines give you two primitives: a <strong>durable timer</strong> and a <strong>signal</strong> (an external message delivered to a running workflow by ID). Step Functions uses <strong>task tokens</strong>: the state hands a token to an outside system and pauses until something calls back with it.</p>` },
        { type: `steps`, title: `Handling a payment webhook`, items: [
          `The workflow calls the provider with an idempotency key derived from the workflow ID, and stores the provider's payment reference.`,
          `It waits for a <code>paymentResult</code> signal, with a timeout of, say, 15 minutes.`,
          `The webhook endpoint verifies the provider's signature, deduplicates on the provider's event ID, maps the payment reference to the workflow ID, and sends the signal. It returns 200 quickly; the workflow does the work.`,
          `If the timeout fires first, the workflow polls the provider's status API instead of assuming failure: "no webhook" is not "declined".`,
          `Succeeded, declined and still-unknown are three branches; unknown keeps polling with backoff and eventually goes to a human.`,
        ] },
        { type: `callout`, tone: `tip`, title: `Human approval is just a long wait`, html: `<p>Send the request, wait for an <code>approve</code> or <code>reject</code> signal with a 48-hour timer, and on timeout escalate or auto-reject. The approval UI calls an API that signals the workflow ID. Make the handler idempotent so a double click or a retried request does nothing extra.</p>` },
        { type: `quiz`, q: `An order workflow waits for a payment provider's webhook. The webhook never arrives within the timeout. What should the workflow do?`, options: [
          `Mark the payment as failed and cancel the order`,
          `Charge the card again with a new idempotency key`,
          `Query the provider's API for the status of that payment reference, and branch on the real answer`,
          `Wait forever; the webhook will arrive eventually`,
        ], answer: 2, explain: `A missing webhook means the outcome is unknown, not negative. The payment may have succeeded and the notification been lost. Ask the provider directly, keep the same idempotency key for any retry, and escalate if the status stays unknown.` },
      ],
    },
    {
      id: `versioning-and-size`,
      title: `Changing code in flight and keeping histories small`,
      kicker: `Living with long workflows`,
      blocks: [
        { type: `problem`, html: `<p>A workflow started today may still be running next month, across many deploys. Replay feeds the recorded history into whatever code is deployed now. If the new code makes different calls in a different order, history and code disagree, and the engine stops the workflow with a <strong>nondeterminism error</strong> rather than guess.</p>` },
        { type: `compare`, title: `Ways to ship a workflow change`, items: [
          { title: `Version markers in code`, tone: `ok`, html: `<p>Wrap the change in a version check: <code>patched("fraud-check")</code> in Temporal's TypeScript SDK, <code>workflow.GetVersion</code> in Go. Instances that already passed that point keep the old branch; others take the new one. Remove the old branch once no old instances remain.</p>` },
          { title: `New workflow type or task queue`, tone: `info`, html: `<p>Deploy the new code as a new workflow name (or route new starts to workers on a new queue). Old instances finish on old workers; new ones start on the new version. Simple to reason about, but you run two versions until the old ones drain.</p>` },
          { title: `Migrate in-flight instances`, tone: `warn`, html: `<p>For workflows that run for months, sometimes the only option is to end old instances at a safe point and start new ones carrying their state. Do it deliberately, with a script and a checklist, not by deploying and hoping.</p>` },
        ] },
        { type: `callout`, tone: `tip`, title: `Test with real histories`, html: `<p>Engines can replay a recorded history against new code without running activities. Export a sample of production histories and replay them in CI; any nondeterminism shows up before the deploy does.</p>` },
        { type: `text`, html: `<p><strong>History size.</strong> Every activity, timer and signal adds events, and engines enforce a hard limit on history size; replay also gets slower as histories grow. Three habits keep histories small:</p>` },
        { type: `list`, items: [
          `<strong>Pass references, not payloads.</strong> Store the PDF, the image or the 5 MB JSON in object storage or a database and pass its key through the workflow.`,
          `<strong>Restart long loops.</strong> A subscription that bills monthly forever, or a poller, should periodically complete and start a fresh run with only its current state. Temporal calls this Continue-As-New.`,
          `<strong>Fan out with child workflows.</strong> Processing 100,000 items in one workflow makes one enormous history; split into child workflows that each own a slice.`,
        ] },
        { type: `quiz`, q: `You add a new activity call in the middle of a workflow and deploy. Which in-flight instances fail on replay?`, options: [
          `All of them`,
          `Only instances whose history already went past the point where the new call was inserted`,
          `Only instances started after the deploy`,
          `None; engines ignore extra calls during replay`,
        ], answer: 1, explain: `Replay compares the commands the code issues with the events already recorded. Instances that haven't reached the change yet replay a prefix that still matches, then run the new call live. Instances past it find a recorded event where the code now issues a different command, which is a nondeterminism error.` },
      ],
    },
    {
      id: `observability`,
      title: `Finding stuck and failed workflows`,
      kicker: `Operations`,
      blocks: [
        { type: `text`, html: `<p>The worst failure in a multi-step system is silent: an order that stopped moving and nobody noticed until the customer complained. Make "where is every instance, and for how long" a first-class question.</p>` },
        { type: `keypoints`, items: [
          `<strong>One source of truth for state:</strong> the orchestrator's table or the engine's history. Choreographed flows need a separate tracker that consumes every event, or a correlation ID in every log line.`,
          `<strong>Time in state:</strong> alert when an instance exceeds its step's expected duration, per step, not one global threshold.`,
          `<strong>Counts per state and per failure reason:</strong> a growing number of orders in CANCELLING is a refund pipeline in trouble.`,
          `<strong>Timeouts on every wait</strong>, so "stuck" turns into an explicit, handled state instead of a forever wait.`,
          `<strong>Operator actions:</strong> retry a failed step after fixing the dependency, send a signal, or terminate and compensate. Engines' UIs and CLIs list running workflows by type and status and show each history.`,
        ] },
        { type: `callout`, tone: `mistake`, title: `Retrying forever without telling anyone`, html: `<p>Infinite retries are fine for the engine and terrible for the business if nobody sees them. Pair long retry policies with an alert after N attempts or M minutes, and a dashboard of the oldest in-flight instances.</p>` },
      ],
    },
    {
      id: `interview`,
      title: `Using the pattern in a design interview`,
      kicker: `Interview angle`,
      blocks: [
        { type: `callout`, tone: `interview`, html: `<p>Raise the pattern when a requirement spans services or external systems and can fail halfway: checkout, payments, ride lifecycle, onboarding, approvals. A strong answer covers:</p><ul><li>why one transaction doesn't work, in one sentence;</li><li>the smallest design that survives the failures you list, and the rung above it;</li><li>idempotency keys for every side effect and compensations before the pivot;</li><li>orchestration versus choreography, and which you chose;</li><li>how long waits, timers and webhooks are handled;</li><li>what an operator sees when an instance is stuck.</li></ul>` },
        { type: `tradeoffs`, title: `Bringing in a durable execution engine`, prosLabel: `You gain`, consLabel: `You pay`, pros: [
          `Crash recovery, retries, timers and signals without writing a sweeper or scheduler`,
          `The process as readable code with compensations in one place`,
          `Per-instance history for debugging and audit`,
        ], cons: [
          `Another stateful system to run, or a vendor to pay`,
          `Determinism rules and versioning discipline for workflow code`,
          `Activities are still at least once; idempotency is still your job`,
          `Overkill for one or two fast steps`,
        ] },
        { type: `quiz`, q: `An interviewer asks you to design sending a welcome email after sign-up. Which design fits best?`, options: [
          `A Temporal workflow with compensations`,
          `A saga orchestrated across the user and email services`,
          `Write the user and an outbox event in one transaction; an idempotent consumer sends the email`,
          `Two-phase commit between the user database and the email provider`,
        ], answer: 2, explain: `One side effect that can be retried until it succeeds needs reliable delivery and idempotency, not a workflow engine or compensation. Reaching for a heavy tool where a queue and an outbox suffice is a common way to lose points.` },
      ],
    },
  ],
  takeaways: [
    `A multi-step process can't be one transaction; the guarantee you build is "eventually complete or eventually compensated, with each effect once".`,
    `Every step runs at least once, under every design. Derive an idempotency key per step and make receivers deduplicate.`,
    `Persist progress outside the process (a state machine row or an engine history) so a crash costs time, not orders.`,
    `Sagas undo with compensations in reverse order; put reversible, likely-to-fail steps before the pivot and retriable ones after it.`,
    `Sagas have no isolation: use semantic locks, reservations with expiry and commutative updates.`,
    `Orchestrate the transactional core; use choreography for loose reactions. Make the orchestrator durable.`,
    `Durable execution replays deterministic workflow code from an event history; version changes and keep histories small.`,
    `Every wait gets a timeout, every instance has a visible state, and stuck ones raise an alert.`,
  ],
  furtherReading: [
    { title: `Sagas (Garcia-Molina and Salem, SIGMOD 1987)`, note: `The original paper on splitting long-lived transactions into steps with compensating transactions.` },
    { title: `Pattern: Saga (microservices.io)`, url: `https://microservices.io/patterns/data/saga.html`, note: `Chris Richardson's description of orchestrated and choreographed sagas.` },
    { title: `Pattern: Transactional outbox (microservices.io)`, url: `https://microservices.io/patterns/data/transactional-outbox.html`, note: `Publishing messages atomically with a database change.` },
    { title: `Temporal documentation`, url: `https://docs.temporal.io/`, note: `Workflows, activities, signals, versioning and Continue-As-New.` },
    { title: `AWS Step Functions developer guide`, url: `https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html`, note: `States, retries and catchers, Standard vs Express workflows, and callback task tokens.` },
  ],
};
