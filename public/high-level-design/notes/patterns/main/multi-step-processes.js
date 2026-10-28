// Main tab: Multi-step processes. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN["multi-step-processes"] = [
  {
    id: `the-problem`,
    title: `One order, four services, and a lot that can go wrong`,
    kicker: `The problem`,
    blocks: [
      { type: `text`, html: `<p>A customer clicks "Place order". Behind that click, the system must charge the card (payment service, which calls a card network), reserve the item (inventory service), book a courier (shipping service, which calls a partner API) and send a confirmation (notification service). Each step is quick on a good day. On a bad day:</p>` },
      { type: `list`, items: [
        `<strong>A step fails after earlier steps succeeded.</strong> The card is charged, then the courier API says there are no slots this week. Someone has to refund the customer.`,
        `<strong>The process running the steps dies.</strong> A deploy or out-of-memory kill between "charged" and "reserved" leaves an order that nobody is working on and nobody remembers.`,
        `<strong>A call times out but actually succeeded.</strong> Retrying it charges the card twice.`,
        `<strong>Some steps take days.</strong> A large order waits for a fraud analyst; a ride waits for a driver to accept; a payout waits for the bank's settlement file. No request can stay open that long.`,
      ] },
      { type: `diagram`, title: `A failure halfway through`, caption: `Booking the courier fails after the card was charged and the stock was held. There is no transaction spanning the three services to roll back, so the system must run new actions, in reverse order, to undo the completed steps.`, svg: `<svg viewBox="0 0 620 200" role="img" aria-label="Four order steps; the third fails and the first two are compensated in reverse order">
<defs><marker id="pt3-arrow-main" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="24" font-size="12" style="fill: var(--dg-muted)">Courier booking fails after the card was charged and the stock was held.</text>
<rect x="20" y="40" width="130" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="85" y="61" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">1 Charge card</text>
<text x="85" y="79" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Payment</text>
<rect x="170" y="40" width="130" height="50" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="235" y="61" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">2 Reserve stock</text>
<text x="235" y="79" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Inventory</text>
<rect x="320" y="40" width="130" height="50" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="385" y="61" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">3 Book courier</text>
<text x="385" y="79" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">fails: no slots</text>
<rect x="470" y="40" width="130" height="50" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="4 3"/>
<text x="535" y="61" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-muted)">4 Send email</text>
<text x="535" y="79" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">never reached</text>
<line x1="150" y1="65" x2="168" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt3-arrow-main)"/>
<line x1="300" y1="65" x2="318" y2="65" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt3-arrow-main)"/>
<line x1="450" y1="65" x2="468" y2="65" stroke-width="2" style="stroke: var(--dg-line)" stroke-dasharray="4 3"/>
<path d="M385 90 V130 H255 V94" fill="none" stroke-width="2" style="stroke: var(--dg-2)" marker-end="url(#pt3-arrow-main)"/>
<text x="320" y="122" text-anchor="middle" font-size="12" style="fill: var(--dg-2)">a. release the hold</text>
<path d="M215 90 V170 H85 V94" fill="none" stroke-width="2" style="stroke: var(--dg-2)" marker-end="url(#pt3-arrow-main)"/>
<text x="150" y="162" text-anchor="middle" font-size="12" style="fill: var(--dg-2)">b. refund $80</text>
<text x="300" y="192" font-size="12" style="fill: var(--dg-muted)">Order status: PENDING, then CANCELLED</text>
</svg>` },
      { type: `text`, html: `<p>A database transaction can't help: each service owns its own database, and the card network and courier API don't join your transactions at all. The goal is weaker but achievable: <strong>every order eventually ends either fully done or cleanly undone</strong>, even if processes crash, calls fail and steps take days. The same shape appears in payment systems, ride lifecycles (request, match, pick up, pay), payouts, account onboarding with identity checks, and approval flows.</p>` },
    ],
  },
  {
    id: `persist-progress`,
    title: `Start in one process, then move progress out of it`,
    kicker: `The first rungs`,
    blocks: [
      { type: `text`, html: `<p><strong>Rung 1: one request does everything.</strong> The checkout handler calls each service in turn. Wrap flaky calls in retries with exponential backoff and jitter, give each call a timeout, and in the catch block undo what already happened (refund, release). Separate transient errors (timeout, 503: retry) from permanent ones (card declined, out of stock: undo and stop). For two or three fast steps this is the right answer, and it is where you should start in an interview.</p>` },
      { type: `text`, html: `<p>Its weakness is that the plan lives only in that process's memory. If the process dies mid-order, the try/catch dies with it, and the half-done order is invisible. And it can't wait: holding a request open for a two-day fraud review is not an option.</p>` },
      { type: `text`, html: `<p><strong>Rung 2: persist the state after every step.</strong> Make the order an explicit state machine in the database: <code>CREATED → RESERVED → CHARGED → SHIPPED → DONE</code>, plus <code>CANCELLING</code> and <code>CANCELLED</code>. A worker runs the next step, then advances the state with a conditional update. A sweeper looks for orders whose state hasn't changed for longer than expected and continues them. Progress now survives crashes, and waiting days is just a row sitting in a state.</p>` },
      { type: `callout`, tone: `warning`, title: `Persisting state forces idempotency`, html: `<p>A worker can call the payment service, succeed, and crash before saving <code>CHARGED</code>. The sweeper will run the charge again. The step is only safe if the payment service deduplicates it, by an <strong>idempotency key</strong> such as <code>order-991-charge</code> that it stores with the result and replays for repeats. Every side-effecting step needs one. The mechanics are in <a href="../../core-concepts/ch8/">core concepts chapter 8</a>; here, just remember that <em>every step runs at least once</em>.</p>` },
      { type: `lab`, id: `msCrashRecovery`, caption: `Run 1,000 orders through four designs with the same failure rates. Watch crashes leave orders half-done until progress is persisted, then watch duplicates appear until idempotency keys are switched on.` },
      { type: `text`, html: `<p>The cost of rung 2 is code you now own: the state table, the sweeper, timers ("cancel if unpaid in 30 minutes"), retry counters, compensation logic and dashboards for stuck rows. For one simple flow that is fine. For many flows it is a homemade workflow engine.</p>` },
    ],
  },
  {
    id: `sagas`,
    title: `Sagas: local steps, compensations, and who is in charge`,
    kicker: `Coordinating services`,
    blocks: [
      { type: `idea`, html: `<p>A <strong>saga</strong> breaks the process into local transactions, one per service, and pairs each with a <strong>compensating action</strong> that semantically undoes it. If step 3 fails, run the compensations for steps 2 and 1, in reverse order. The result is all-or-nothing at the business level, without locks or two-phase commit across services.</p>` },
      { type: `keypoints`, items: [
        `<strong>Compensation is not rollback.</strong> The charge happened and the customer may have seen it; the refund is a new transaction. Compensations must be idempotent and retried until they succeed, because there is nothing to undo a failed undo.`,
        `<strong>Order steps around a pivot.</strong> Put cheap, reversible and likely-to-fail steps first (validate, reserve stock, authorize the card), the point of no return in the middle (capture payment, book the courier), and steps that can simply be retried until done last (send the email).`,
        `<strong>No isolation.</strong> Other requests can see a saga's intermediate state. Mark records PENDING so other flows treat them carefully, and prefer reservations with an expiry over plain decrements; the <a href="../dealing-with-contention/">contention chapter</a> covers those.`,
      ] },
      { type: `compare`, title: `Two ways to coordinate a saga`, items: [
        { title: `Choreography: services react to events`, tone: `info`, html: `<p>Order publishes <code>OrderCreated</code>; Payment hears it, charges and publishes <code>PaymentCaptured</code>; Inventory hears that, and so on. Failures publish events that trigger compensations upstream. No coordinator and loose coupling, but the flow exists only across subscriptions: hard to see, hard to change, and "where is order 991?" means joining four services' logs. Good for two or three steps.</p>` },
        { title: `Orchestration: one coordinator sends commands`, tone: `ok`, html: `<p>An orchestrator holds the flow, sends <code>ChargeCard</code>, waits for the reply, sends <code>ReserveStock</code>, and on failure sends the compensations. The process is readable in one place, easy to version and monitor. The orchestrator itself must persist its state, or it becomes the place where work gets lost. The usual default for business-critical flows.</p>` },
      ] },
      { type: `lab`, id: `msSagaCompensation`, caption: `Step through order 991 with a failure at different points. Compare the messages an orchestrator sends with the events that flow in choreography, and see why a failure after the pivot is retried rather than compensated.` },
      { type: `callout`, tone: `tip`, title: `The dual write hiding in every step`, html: `<p>"Update my row, then publish the event" is two writes. Crash in between and the step is done but nobody downstream hears about it, so the saga stalls with no error. Write the event into an <strong>outbox</strong> table in the same transaction and let a relay publish it. Details in <a href="../../advanced-topics/ch10/">advanced topics chapter 10</a>.</p>` },
    ],
  },
  {
    id: `durable-execution`,
    title: `Durable execution: write the workflow as code, let the engine remember`,
    kicker: `Workflow engines`,
    blocks: [
      { type: `text`, html: `<p>Once you have retries, timers, persisted state, compensations and a sweeper, you have built a workflow engine. <strong>Durable execution</strong> engines such as <strong>Temporal</strong> (which grew out of Uber's Cadence) give you that as a platform. You write the order flow as ordinary code: charge, reserve, wait for approval up to 48 hours, book the courier, email. Each call to the outside world is an <strong>activity</strong> that the engine retries with backoff.</p>` },
      { type: `steps`, title: `How it survives a crash`, items: [
        `The engine records an <strong>event history</strong> for each workflow: started, each activity's result, each timer and signal.`,
        `A worker runs the workflow code. When the code calls an activity or sleeps, the engine schedules it and records the outcome.`,
        `If the worker dies, another worker runs the same function from the top. For every step already in the history it returns the recorded result instead of calling the service again.`,
        `When replay reaches the end of the history, execution continues live. A two-day sleep is a timer in the engine's store, not a thread.`,
      ] },
      { type: `callout`, tone: `warning`, title: `Two rules that come with replay`, html: `<p><strong>Workflow code must be deterministic:</strong> no direct network calls, random numbers or reading the clock outside the engine's APIs, because replay must take the same path every time. <strong>Activities run at least once:</strong> a worker can finish a charge and die before reporting it, so activities still need idempotency keys.</p>` },
      { type: `lab`, id: `msDurableReplay`, caption: `Crash the worker after different steps and watch replay skip what already happened. Then deploy a code change while the order is in flight, with and without a version check.` },
      { type: `text`, html: `<p><strong>Managed alternatives.</strong> AWS Step Functions describes the flow as a JSON state machine with retries, waits, parallel branches and callbacks; Standard workflows can run for up to a year, Express workflows up to five minutes at high volume. <strong>Airflow</strong> and similar DAG schedulers run scheduled batch pipelines (nightly ETL), not one workflow per customer request; reaching for one in a checkout design is a common mismatch.</p>` },
    ],
  },
  {
    id: `in-the-interview`,
    title: `Choosing an option in the interview`,
    kicker: `Decision guide`,
    blocks: [
      { type: `table`, title: `Which rung, when`, headers: [`Situation`, `Reach for`], rows: [
        [`Two or three fast steps, all idempotent`, `One request with retries and timeouts`],
        [`A side effect after a write (email, resize, index)`, `Outbox or queue plus an idempotent consumer`],
        [`One flow that must survive crashes, few waits`, `State machine in the database plus a sweeper`],
        [`Steps across services that may need undoing`, `Saga, orchestrated by default`],
        [`Waits on timers, humans or webhooks; many flows`, `Durable execution engine (Temporal, Step Functions)`],
        [`Scheduled batch pipeline`, `Airflow-style DAG scheduler`],
      ] },
      { type: `keypoints`, title: `Where it comes up`, items: [
        `<strong>E-commerce checkout and fulfilment:</strong> payment, inventory, shipping, notifications, with refunds on failure.`,
        `<strong>Ride sharing:</strong> request, offer to a driver with a timeout, re-offer to the next driver, trip, payment. The <a href="../../problem-breakdowns/uber/">Uber breakdown</a> has the matching flow.`,
        `<strong>Payment systems and payouts:</strong> provider webhooks that arrive late or twice, settlement that takes days.`,
        `<strong>Notification and onboarding flows:</strong> send, wait, remind after 24 hours, escalate.`,
      ] },
      { type: `callout`, tone: `mistake`, title: `When not to use it`, html: `<p>Don't draw a workflow engine for a single database write, a fire-and-forget notification, or a request that finishes in milliseconds. It adds a stateful system to run or pay for and rules for how code is written. Interviewers reward the smallest design that survives the failures you named, and a clear statement of the point at which you would move up a rung.</p>` },
    ],
  },
  {
    id: `common-deep-dives`,
    title: `The follow-up questions to expect`,
    kicker: `Common deep dives`,
    blocks: [
      { type: `list`, items: [
        `<strong>"What if the process running your saga crashes halfway?"</strong> Progress is persisted after each step (orchestrator table or engine history), so another worker resumes; the step that was in flight re-runs, and its idempotency key makes that harmless.`,
        `<strong>"How do you change the workflow while instances are running?"</strong> Replay must see the same steps in the same order, so put changes behind a version check (Temporal's <code>patched</code> or <code>GetVersion</code>) or start a new workflow type and let the old one drain. Test new code by replaying recorded histories.`,
        `<strong>"How do you keep workflow state small?"</strong> Store big payloads elsewhere and pass references; restart endless loops as fresh runs carrying only the current state (Temporal's Continue-As-New); split big fan-outs into child workflows.`,
        `<strong>"How do you handle external events?"</strong> Webhooks and human approvals become signals delivered to a workflow ID (or a task token in Step Functions), always paired with a timeout and a fallback such as polling the provider.`,
        `<strong>"How do you make sure step X runs exactly once?"</strong> You don't; you make it run at least once and make its effect happen once: idempotency keys, unique constraints, conditional updates.`,
        `<strong>"How do you find stuck workflows?"</strong> Time in current state per instance, alerts per step's expected duration, and a timeout on every wait.`,
      ] },
      { type: `callout`, tone: `interview`, title: `What to say`, html: `<p>"Checkout spans payment, inventory and shipping, so I can't use one transaction. I'll orchestrate it as a saga: reserve stock, authorize the card, book the courier as the pivot, then capture and notify. Each step has an idempotency key and each step before the pivot has a compensation. Because we wait for fraud review and courier webhooks, I'd run it on a durable execution engine like Temporal rather than hand-roll the state machine and sweeper. Workflow state is the source of truth for 'where is this order', and we alert on orders stuck in a state too long."</p>` },
    ],
  },
];
