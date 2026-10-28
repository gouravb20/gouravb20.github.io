// Patterns labs, part 3: multi-step processes - crash recovery across designs, saga compensation, durable replay and versioning
(function () {
  "use strict";
  const { esc, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, fmtNum, pct } = window.LabKit;
  window.DEMOS = window.DEMOS || {};
  const D = window.DEMOS;
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;

  // =====================================================================
  // 1. Where does a crash leave the order? Four designs, same failures
  // =====================================================================
  const CR_AP = { naive: `one request, no retries`, retry: `one request + retries`, db: `state in DB + sweeper`, durable: `durable workflow engine` };
  const CR_N = 1000;

  // One run of CR_N orders through charge -> reserve -> courier -> email.
  // A failed call is sometimes ambiguous: it timed out but the side effect happened anyway.
  // A crash strikes right after a step's side effect, before the process records it.
  function crSim(ap, st, seed) {
    const r = mulberry32(seed);
    const pc = st.crash / 100, pf = st.fail / 100, oos = st.oos / 100, AMB = 0.3;
    const maxTry = ap === `naive` ? 1 : ap === `retry` ? 3 : ap === `db` ? 5 : 40;
    const persist = ap === `db` || ap === `durable`;
    const o = { ok: 0, undone: 0, partial: 0, dup: 0, resumed: 0, calls: 0 };
    for (let n = 0; n < CR_N; n++) {
      let done = 0, dup = false, resumed = false, res = null;
      for (let i = 0; i < 4 && !res; i++) {
        if (i === 1 && r() < oos) { res = `undone`; break; }        // out of stock: refund the charge (all designs try this)
        let effects = 0, okCall = false;
        for (let a = 0; a < maxTry; a++) {
          o.calls++;
          if (r() >= pf) { effects++; okCall = true; break; }
          if (r() < AMB) effects++;                                     // timed out, but it happened
        }
        if (effects > 1 && !st.keys) dup = true;
        if (!okCall) { res = effects > 0 ? `partial` : `undone`; break; } // gave up: undo earlier steps, but an ambiguous one lingers
        if (r() < pc) {
          if (!persist) { res = i === 3 ? `ok` : `partial`; if (i !== 3) break; }
          else { resumed = true; if (!st.keys) dup = true; }            // resume re-runs the unrecorded step
        }
        done++;
      }
      if (!res) res = `ok`;
      o[res]++;
      if (dup) o.dup++;
      if (resumed) o.resumed++;
    }
    return o;
  }

  D.msCrashRecovery = {
    title: `Where does a crash leave the order?`,
    blurb: `1,000 orders each run four steps: charge the card, reserve stock, book a courier, send an email. Calls fail now and then (some time out after actually succeeding), the process sometimes dies between steps, and some items are out of stock. Compare four designs on the same failures, with and without idempotency keys.`,
    mount(el) {
      const st = { ap: `retry`, fail: 5, crash: 1, oos: 3, keys: false };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`design`, seg(`ap`, Object.keys(CR_AP).map(k => [k, CR_AP[k]]), st.ap))}</div>
        <div class="ctl-row">${ctl(`calls that fail`, rng(`fail`, 0, 30, 1, st.fail))}${ctl(`crash after a step`, rng(`crash`, 0, 10, 0.5, st.crash))}${ctl(`out of stock`, rng(`oos`, 0, 10, 1, st.oos))}${ctl(`idempotency keys`, seg(`keys`, [[false, `off`], [true, `on`]], st.keys))}</div>
        <div class="ctl-row">${againBtn}</div>
        <div class="lab-panel"><h4>After 1,000 orders</h4><div class="stat-row" data-k="stats"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>All four designs, same run</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const META = {
        naive: { rec: `none: work in memory is lost`, build: `nothing extra` },
        retry: { rec: `none: work in memory is lost`, build: `a retry loop` },
        db: { rec: `next sweeper pass (minutes)`, build: `state table, sweeper, compensation code` },
        durable: { rec: `automatic, seconds`, build: `workflow code; run or buy the engine` }
      };
      const draw = () => {
        const R = {};
        Object.keys(CR_AP).forEach(k => { R[k] = crSim(k, st, seed * 97 + 13); });
        const s = R[st.ap];
        q(`stats`).innerHTML =
          stat(`completed`, fmtNum(s.ok), `good`) +
          stat(`failed cleanly (refunded)`, fmtNum(s.undone)) +
          stat(`left half-done, no record`, fmtNum(s.partial), s.partial ? `bad` : `good`) +
          stat(`duplicate side effects`, fmtNum(s.dup), s.dup ? `bad` : `good`) +
          stat(`resumed after a crash`, fmtNum(s.resumed)) +
          stat(`calls made`, fmtNum(s.calls));
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>design</th><th class="num">completed</th><th class="num">half-done</th><th class="num">duplicates</th><th>recovery after a crash</th><th>what you build</th></tr>${Object.keys(CR_AP).map(k => `<tr class="${k === st.ap ? `new` : ``}"><td>${CR_AP[k]}</td><td class="num">${fmtNum(R[k].ok)}</td><td class="num" style="${R[k].partial ? `color:var(--bad);font-weight:700` : ``}">${fmtNum(R[k].partial)}</td><td class="num" style="${R[k].dup ? `color:var(--bad);font-weight:700` : ``}">${fmtNum(R[k].dup)}</td><td>${META[k].rec}</td><td>${META[k].build}</td></tr>`).join(``)}</table></div>`;
        let msg, cls = `bad`;
        if (st.ap === `naive`) msg = `With no retries, every failed call ends the order. The catch block refunds what it knows about, but a timed-out call that really succeeded is not undone, and a crash between steps leaves ${fmtNum(s.partial)} orders charged with no shipment and no record that anything is owed.`;
        else if (st.ap === `retry`) msg = st.keys
          ? `Retries absorb most failed calls, and idempotency keys stop a retry after a hidden success from doing the work twice. But the plan lives in memory: ${fmtNum(s.partial)} orders were abandoned half-done by crashes, and nothing will ever finish or undo them.`
          : `Retries absorb most failed calls, but without idempotency keys a retry after a call that timed out yet succeeded does the work again: ${fmtNum(s.dup)} orders got a duplicate charge, hold, booking or email. Crashes still abandon ${fmtNum(s.partial)} orders.`;
        else if (st.ap === `db`) msg = st.keys
          ? `Each step's result is saved before the next starts, so after a crash a sweeper finds the order and carries on (${fmtNum(s.resumed)} resumed). With idempotency keys the re-run step is harmless. Orders only end half-done when a call fails five times in a row and its last timeout hid a success.`
          : `Saving progress means crashes no longer lose orders (${fmtNum(s.resumed)} resumed), but a crash after a step ran and before it was recorded makes the sweeper run it again. Without idempotency keys that gives ${fmtNum(s.dup)} duplicates. Persisting state and idempotent steps only work together.`;
        else msg = st.keys
          ? `The engine records every step result and timer in its history, retries steps with backoff for as long as you allow, and resumes crashed workflows on another worker in seconds. You get the database design's guarantees without writing the sweeper. Steps still run at least once, so the keys stay.`
          : `Even a workflow engine runs each step at least once: a worker can die after the charge succeeded and before the engine heard about it, and the engine then retries. ${fmtNum(s.dup)} orders got duplicates. Turn idempotency keys on.`;
        if ((st.ap === `db` || st.ap === `durable`) && st.keys) cls = s.partial ? `warn` : `good`;
        if (!st.fail && !st.crash) { msg = `With no failed calls and no crashes, every design looks perfect. Production never gives you both at zero; move the sliders.`; cls = `warn`; }
        q(`note`).innerHTML = note(msg, cls);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { fail: v => v + `%`, crash: v => v + `%`, oos: v => v + `%` }, draw);
      el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) { seed++; draw(); } });
      draw();
    }
  };

  // =====================================================================
  // 2. A saga, step by step: forward steps, a failure, compensations
  // =====================================================================
  const SG = [
    { name: `Create order`, svc: `Order`, ok: `OrderCreated`, fwd: `save order 991 as PENDING`, comp: `mark order CANCELLED`, compEvt: `OrderCancelled`, kind: `comp` },
    { name: `Charge card`, svc: `Payment`, ok: `PaymentCaptured`, fwd: `charge $80 with key order-991-charge`, comp: `refund $80`, compEvt: `PaymentRefunded`, kind: `comp`, failEvt: `PaymentDeclined`, failWhy: `card declined` },
    { name: `Reserve stock`, svc: `Inventory`, ok: `StockReserved`, fwd: `hold 1 standing desk`, comp: `release the hold`, compEvt: `StockReleased`, kind: `comp`, failEvt: `StockUnavailable`, failWhy: `out of stock` },
    { name: `Book courier`, svc: `Shipping`, ok: `CourierBooked`, fwd: `book a courier for Tuesday`, kind: `pivot`, failEvt: `NoCourierAvailable`, failWhy: `no courier slot this week` },
    { name: `Send email`, svc: `Notify`, ok: `ConfirmationSent`, fwd: `email the confirmation`, kind: `retry`, failWhy: `email provider down` }
  ];
  const SG_KIND = { comp: `compensatable`, pivot: `pivot`, retry: `retry until done` };

  function sgTrace(st) {
    const T = [], s = SG.map(() => `idle`), orch = st.mode === `orch`;
    let status = `none`;
    const push = (who, msg, kind) => T.push({ who, msg, kind, s: s.slice(), status });
    for (let i = 0; i < SG.length; i++) {
      const g = SG[i];
      if (i === st.fail && g.kind === `retry`) {
        s[i] = `retrying`;
        push(orch ? `Orchestrator` : `Notify`, `${g.failWhy}: retry with backoff (1 s, 2 s, 4 s...). Nothing is undone; the order is already confirmed.`, `retry`);
        s[i] = `done`;
        push(orch ? `Notify → Orchestrator` : `Notify publishes`, `${g.ok} on the fourth attempt`, `fwd`);
        continue;
      }
      if (i === st.fail) {
        s[i] = `failed`;
        push(orch ? `${g.svc} → Orchestrator` : `${g.svc} publishes`, `${g.failEvt} (${g.failWhy})`, `fail`);
        let prev = g.failEvt;
        for (let j = i - 1; j >= 0; j--) {
          const c = SG[j];
          if (st.compFail && j === 1) {
            s[j] = `retrying`;
            push(orch ? `Orchestrator → Payment` : `Payment hears ${prev}`, `refund call times out; the step retries it with the same idempotency key`, `retry`);
          }
          s[j] = `compensated`;
          if (j === 0) status = `CANCELLED`;
          push(orch ? `Orchestrator → ${c.svc}` : `${c.svc} hears ${prev}`, `${c.comp}${orch ? `` : `, publishes ${c.compEvt}`}`, `comp`);
          prev = c.compEvt;
        }
        push(orch ? `Orchestrator` : `(no coordinator)`, `saga finished: compensated. The customer sees "Order cancelled: ${g.failWhy}".`, `end`);
        return T;
      }
      s[i] = `done`;
      if (i === 0) status = `PENDING`;
      if (i === 3) status = `CONFIRMED`;
      push(orch ? `Orchestrator → ${g.svc}` : (i === 0 ? `Order service` : `${g.svc} hears ${SG[i - 1].ok}`), `${g.fwd}${orch ? `; replies ${g.ok}` : `, publishes ${g.ok}`}`, `fwd`);
    }
    push(orch ? `Orchestrator` : `(no coordinator)`, `saga finished: every step done. Order 991 is CONFIRMED.`, `end`);
    return T;
  }

  D.msSagaCompensation = {
    title: `A saga, step by step`,
    blurb: `Order 991 runs five local steps in four services. Pick which step fails and step through the saga: the forward steps, the failure, then the compensations in reverse order. Switch between an orchestrator that sends commands and choreography where services react to each other's events.`,
    mount(el) {
      const st = { mode: `orch`, fail: 2, compFail: false };
      let pos = 0, T = [];
      el.innerHTML = `
        <div class="ctl-row">${ctl(`coordination`, seg(`mode`, [[`orch`, `orchestration`], [`chor`, `choreography`]], st.mode))}${ctl(`failure`, seg(`fail`, [[-1, `none`], [1, `card declined`], [2, `out of stock`], [3, `no courier`], [4, `email down`]], st.fail))}${ctl(`refund call`, seg(`compFail`, [[false, `works`], [true, `times out once`]], st.compFail))}</div>
        <div class="ctl-row"><button class="lab-btn" data-act="next">Next event</button><button class="lab-btn ghost" data-act="all">Show all</button><button class="lab-btn ghost" data-act="reset">Reset</button></div>
        <div class="lab-panel"><h4>Steps</h4><div data-k="svg"></div><div class="legend"><span><i class="sw" style="background:var(--good)"></i>done</span><span><i class="sw" style="background:var(--bad)"></i>failed</span><span><i class="sw" style="background:var(--warn)"></i>retrying</span><span><i class="sw" style="background:var(--accent-2)"></i>compensated</span></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>Messages so far</h4><div data-k="log"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const COL = { idle: `var(--border)`, done: `var(--good)`, failed: `var(--bad)`, retrying: `var(--warn)`, compensated: `var(--accent-2)` };
      const build = () => { T = sgTrace(st); pos = 1; draw(); };
      const draw = () => {
        const cur = T[pos - 1];
        const W = 620, bw = 112, gap = 14;
        let s = ``;
        SG.forEach((g, i) => {
          const x = 4 + i * (bw + gap), state = cur.s[i];
          s += `<rect x="${x}" y="20" width="${bw}" height="78" rx="8" style="fill:var(--bg-3);stroke:${COL[state]};stroke-width:${state === `idle` ? 1 : 3}"/>`;
          s += `<text x="${x + bw / 2}" y="42" text-anchor="middle" style="fill:var(--text);font-size:13px;font-weight:700">${g.name}</text>`;
          s += `<text x="${x + bw / 2}" y="60" text-anchor="middle" style="fill:var(--text-muted);font-size:12px">${g.svc}</text>`;
          s += `<text x="${x + bw / 2}" y="84" text-anchor="middle" style="fill:${state === `idle` ? `var(--text-muted)` : COL[state]};font-size:12px;font-weight:700">${state}</text>`;
          s += `<text x="${x + bw / 2}" y="116" text-anchor="middle" style="fill:var(--text-muted);font-size:12px">${SG_KIND[g.kind]}</text>`;
          if (i < SG.length - 1) s += `<line x1="${x + bw + 2}" y1="59" x2="${x + bw + gap - 2}" y2="59" style="stroke:var(--text-muted);stroke-width:2"/>`;
        });
        s += `<text x="4" y="146" style="fill:var(--text);font-size:13px">Order status the customer sees: <tspan style="font-weight:700;fill:${cur.status === `CANCELLED` ? `var(--bad)` : cur.status === `CONFIRMED` ? `var(--good)` : `var(--warn)`}">${cur.status}</tspan></text>`;
        q(`svg`).innerHTML = svgWrap(W, 156, s);
        const KC = { fwd: `ok`, fail: `no`, comp: `final`, retry: `early`, end: `muted` };
        q(`log`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>#</th><th>who</th><th>what</th><th></th></tr>${T.slice(0, pos).map((t, i) => `<tr class="${i === pos - 1 ? `new` : ``}"><td class="num">${i + 1}</td><td>${esc(t.who)}</td><td style="white-space:normal">${esc(t.msg)}</td><td>${chip(t.kind === `fwd` ? `forward` : t.kind === `comp` ? `compensate` : t.kind, KC[t.kind])}</td></tr>`).join(``)}</table></div>`;
        let msg = `Event ${pos} of ${T.length}. Press "Next event".`, cls = ``;
        if (pos === T.length) {
          const f = st.fail;
          if (f === -1) { msg = `Every local step committed in its own service. No step ever held a lock on another service's data; the order sat in PENDING (a semantic lock) until the courier was booked.`; cls = `good`; }
          else if (f === 4) { msg = `A failure after the pivot step (booking the courier) is never compensated. The remaining step is designed to be retried until it succeeds, so the saga can only move forward. Order the steps so that anything that can fail for business reasons comes before the pivot.`; cls = `good`; }
          else if (f === 3) { msg = `The pivot step itself failed, so everything before it is undone in reverse order: release stock, refund, cancel. Compensation is a new business action (a refund shows up on the statement), not an invisible rollback.`; cls = `warn`; }
          else { msg = `Compensations run in reverse order and only for steps that completed. ${st.compFail ? `The refund timed out once and was retried with the same key, so the customer is refunded exactly once: compensations must be idempotent and retried until they succeed, because there is no compensation for a failed compensation.` : `Try making the refund call time out: compensations need retries and idempotency keys too.`}`; cls = `warn`; }
          if (st.mode === `chor`) msg += ` In choreography no service holds the whole picture: to know where order 991 is, you join the logs of four services.`;
          else msg += ` With an orchestrator, one place records the saga's state, so "where is order 991?" is one lookup.`;
        }
        q(`note`).innerHTML = note(msg, cls);
      };
      wireSegs(el, st, build);
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`);
        if (!b) return;
        if (b.dataset.act === `next`) pos = Math.min(T.length, pos + 1);
        if (b.dataset.act === `all`) pos = T.length;
        if (b.dataset.act === `reset`) pos = 1;
        draw();
      });
      build();
    }
  };

  // =====================================================================
  // 3. Durable execution: replay from history, and changing code in flight
  // =====================================================================
  const RP_OLD = [
    { call: `chargeCard(order)`, evt: `ActivityCompleted chargeCard → ch_8812` },
    { call: `reserveStock(order)`, evt: `ActivityCompleted reserveStock → hold_51` },
    { call: `sleep("2 days")`, evt: `TimerFired after 2 days` },
    { call: `bookCourier(order)`, evt: `ActivityCompleted bookCourier → lbl_7730` },
    { call: `sendEmail(order)`, evt: `ActivityCompleted sendEmail` }
  ];
  const RP_NEW = { call: `fraudCheck(order)`, evt: `ActivityCompleted fraudCheck → pass` };

  function rpRun(st) {
    const hist = RP_OLD.slice(0, st.crash).map(x => ({ ...x }));
    // The code the restarted worker runs
    let code;
    if (st.change === `none`) code = RP_OLD.map(x => ({ ...x }));
    else {
      code = RP_OLD.slice(0, 3).map(x => ({ ...x }));
      code.push({ ...RP_NEW, guarded: st.change === `patched` });
      code.push(...RP_OLD.slice(3).map(x => ({ ...x })));
    }
    const rows = [];
    let h = 0, stuck = false;
    for (const c of code) {
      if (stuck) { rows.push({ c, how: `blocked`, text: `not reached` }); continue; }
      if (c.guarded) {
        // patched(): false if the history already went past this point without the marker; true (and recorded) otherwise
        if (h < hist.length) { rows.push({ c, how: `skip`, text: `patched("fraud-check") is false: history passed this point on the old code, so the old path is kept` }); continue; }
        rows.push({ c, how: `live`, text: `patched("fraud-check") is true (marker recorded), so this instance runs the new step now` });
        continue;
      }
      if (h < hist.length) {
        if (hist[h].call === c.call) { rows.push({ c, how: `replay`, text: `replayed: result read from history, the call is not made again` }); h++; }
        else { rows.push({ c, how: `error`, text: `nondeterminism error: code asks for ${c.call} but history recorded ${hist[h].call}` }); stuck = true; }
      } else rows.push({ c, how: `live`, text: c.call.startsWith(`sleep`) ? `timer starts now` : `runs now and its result is appended to history` });
    }
    return { hist, rows, stuck };
  }

  D.msDurableReplay = {
    title: `Durable execution: replay and changing code in flight`,
    blurb: `An order workflow charges, reserves stock, sleeps two days, books a courier and emails. The worker crashes after some step. On restart it re-runs the workflow function from the top, feeding it recorded results instead of calling services again. Then ship a code change while this order is in flight and see what replay does with it.`,
    mount(el) {
      const st = { crash: 2, change: `none` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`worker crashes after step`, seg(`crash`, [[1, `1 charge`], [2, `2 reserve`], [3, `3 sleep`], [4, `4 courier`]], st.crash))}</div>
        <div class="ctl-row">${ctl(`deploy before the restart`, seg(`change`, [[`none`, `no change`], [`raw`, `add fraudCheck before bookCourier`], [`patched`, `same, behind patched()`]], st.change))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Workflow code on the restarted worker</h4><div data-k="code"></div></div>
          <div class="lab-panel"><h4>Event history saved before the crash</h4><div data-k="hist"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const HOW = { replay: [`replayed`, `ok`], live: [`runs now`, `final`], skip: [`skipped`, `muted`], error: [`error`, `no`], blocked: [`blocked`, `muted`] };
      const draw = () => {
        const { hist, rows, stuck } = rpRun(st);
        q(`code`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>line</th><th>on restart</th></tr>${rows.map(r => `<tr class="${r.how === `error` ? `undo` : ``}"><td style="white-space:normal"><code>${esc(r.c.guarded ? `if (patched("fraud-check")) ` + r.c.call : r.c.call)}</code><div style="color:var(--text-muted);font-size:11.5px;white-space:normal">${esc(r.text)}</div></td><td>${chip(HOW[r.how][0], HOW[r.how][1])}</td></tr>`).join(``)}</table></div>`;
        q(`hist`).innerHTML = `<table class="mini-table"><tr><th>#</th><th>event</th></tr><tr><td class="num">0</td><td>WorkflowStarted order 991</td></tr>${hist.map((x, i) => `<tr><td class="num">${i + 1}</td><td style="white-space:normal">${esc(x.evt)}</td></tr>`).join(``)}<tr class="dim"><td></td><td>worker crashed here</td></tr></table>`;
        let msg, cls = `good`;
        const replayed = rows.filter(r => r.how === `replay`).length;
        if (stuck) { msg = `The new code no longer matches what this workflow already did. Replay can't decide whether the recorded bookCourier result belongs to the new fraudCheck line, so the engine stops the workflow with a nondeterminism error instead of guessing. Every in-flight order past the sleep is now stuck until you roll back or redeploy with a version check.`; cls = `bad`; }
        else if (st.change === `patched`) msg = `With a version check, orders that already passed this point keep the old path and new or not-yet-there orders take the new one. Once no workflow started on the old code is still running, you can delete the old branch.`;
        else if (st.change === `raw`) { msg = `No error this time: the crash happened before the changed part of the code, so the recorded history still matches and the order simply picks up the new step. The same deploy breaks any order that had already booked its courier. Try crashing after step 4.`; cls = `warn`; }
        else msg = `${replayed} recorded step${replayed === 1 ? `` : `s`} replayed from history in milliseconds without charging or reserving again. ${st.crash >= 3 ? `The two-day sleep is a durable timer in the history too: the restarted worker does not wait again.` : `The rest of the workflow runs live and keeps appending to the history.`} This only works because the workflow code is deterministic: the same history always drives it down the same path.`;
        q(`note`).innerHTML = note(msg, cls);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };
})();
