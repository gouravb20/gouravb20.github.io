// Concurrency labs. Threads are simulated with a seeded random scheduler, so runs are repeatable.
(function () {
  "use strict";
  const { esc, clamp, sum, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, axes, path, pct } = window.LabKit;
  const D = (window.DEMOS = window.DEMOS || {});
  const TC = [`var(--accent)`, `var(--accent-2)`, `var(--accent-3)`];
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const pctl = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const expRand = (r, mean) => -Math.log(1 - r()) * mean;
  const poisson = (r, lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };

  // =====================================================================
  // Ch1 / Ch2 - Two threads incrementing one counter
  // =====================================================================
  function raceTrace(mode, n, sw, seed) {
    const r = mulberry32(seed);
    const th = [0, 1].map(() => ({ done: 0, pc: 0, reg: 0, nw: 0, waiting: false }));
    let c = 0, owner = -1, cur = 0, lost = 0, retries = 0, waits = 0;
    const log = [];
    const prog = { none: [`read`, `add`, `write`], lock: [`lock`, `read`, `add`, `write`, `unlock`], cas: [`read`, `add`, `cas`] }[mode];
    const live = i => th[i].done < n;
    const blocked = i => mode === `lock` && prog[th[i].pc] === `lock` && owner !== -1 && owner !== i;
    let guard = 0;
    while ((live(0) || live(1)) && guard++ < 2000) {
      if (!live(cur) || r() < sw) cur = 1 - cur;
      if (!live(cur)) cur = 1 - cur;
      if (blocked(cur)) {
        if (!th[cur].waiting) { th[cur].waiting = true; waits++; log.push({ t: cur, text: `tries to lock, blocked (T${owner + 1} holds it)`, c, cls: `warn` }); }
        cur = 1 - cur;
        if (!live(cur) || blocked(cur)) continue;
      }
      const t = th[cur], op = prog[t.pc];
      let text = ``, cls = ``;
      if (op === `lock`) { owner = cur; t.waiting = false; text = `acquires the lock`; }
      else if (op === `unlock`) { owner = -1; text = `releases the lock`; }
      else if (op === `read`) { t.reg = c; text = `reads counter = ${c}`; }
      else if (op === `add`) { t.nw = t.reg + 1; text = `computes ${t.reg} + 1 = ${t.nw}`; }
      else if (op === `write`) {
        if (c !== t.reg) { lost++; cls = `bad`; text = `writes ${t.nw}, overwriting ${c}: an increment is lost`; } else text = `writes counter = ${t.nw}`;
        c = t.nw;
      } else if (op === `cas`) {
        if (c === t.reg) { c = t.nw; text = `compareAndSet(${t.reg}, ${t.nw}) succeeds`; }
        else { retries++; cls = `warn`; text = `compareAndSet(${t.reg}, ${t.nw}) fails (counter is ${c}), retries`; t.pc = 0; log.push({ t: cur, text, c, cls }); continue; }
      }
      t.pc++;
      if (t.pc === prog.length) { t.pc = 0; t.done++; }
      log.push({ t: cur, text, c, cls });
    }
    return { log, final: c, lost: 2 * n - c, retries, waits };
  }
  D.raceInterleaving = {
    title: `Two threads, one counter: lost updates`,
    blurb: `Two threads each increment a shared counter several times. Without protection each <code>count++</code> is three steps (read, add, write) and the scheduler may switch threads between any two of them. Compare a plain field, a <code>synchronized</code> block and an <code>AtomicInteger</code> compare-and-set loop, then step through the interleaving.`,
    mount(el) {
      const st = { mode: `none`, n: 4, sw: 0.3, seed: 7, pos: 0 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`counter`, seg(`mode`, [[`none`, `int count (count++)`], [`lock`, `synchronized`], [`cas`, `AtomicInteger`]], st.mode))}${againBtn}</div>
        <div class="ctl-row">${ctl(`increments per thread`, rng(`n`, 1, 8, 1, st.n))}${ctl(`chance the scheduler switches threads after each step`, rng(`sw`, 0, 1, 0.05, st.sw))}</div>
        <div class="ctl-row">${ctl(`step through the run`, `<span class="range-wrap"><input type="range" data-k="pos" min="0" max="1" step="1" value="0"><span class="range-val" data-k="posv"></span></span>`)}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Interleaving so far (latest at the bottom)</h4><div data-k="log"></div></div>
          <div class="lab-panel"><h4>State</h4><div data-k="state"></div><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const posIn = q(`pos`);
      let tr = null, bad = 0;
      const sim = () => {
        tr = raceTrace(st.mode, st.n, st.sw, st.seed); posIn.max = tr.log.length; st.pos = tr.log.length; posIn.value = st.pos;
        bad = 0;
        for (let s = 1; s <= 300; s++) if (raceTrace(st.mode, st.n, st.sw, s * 7919).lost > 0) bad++;
      };
      const draw = () => {
        const shown = tr.log.slice(0, st.pos);
        const c = shown.length ? shown[shown.length - 1].c : 0;
        q(`posv`).textContent = `${st.pos} / ${tr.log.length}`;
        const rows = shown.slice(-10).map((e, i, a) => `<tr${i === a.length - 1 ? ` class="new"` : ``}><td><b style="color:${TC[e.t]}">T${e.t + 1}</b></td><td style="white-space:normal">${e.cls ? chip(e.cls === `bad` ? `lost` : e.cls === `warn` ? `wait/retry` : ``, e.cls === `bad` ? `no` : `muted`) + ` ` : ``}${e.text}</td><td class="num">${e.c}</td></tr>`).join(``);
        q(`log`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>thread</th><th>step</th><th class="num">counter</th></tr>${rows || `<tr><td colspan="3">Drag the slider to replay the run.</td></tr>`}</table></div>`;
        const lostSoFar = shown.filter(e => e.cls === `bad`).length;
        q(`state`).innerHTML = `<div style="font-size:32px;font-weight:800">${c}</div><div class="muted" style="font-size:12px">counter now (expected ${2 * st.n} at the end)</div>`;
        q(`stats`).innerHTML = stat(`final value`, tr.final, tr.final === 2 * st.n ? `good` : `bad`) + stat(`lost updates`, tr.lost, tr.lost ? `bad` : `good`) +
          (st.mode === `lock` ? stat(`times a thread blocked`, tr.waits) : ``) + (st.mode === `cas` ? stat(`CAS retries`, tr.retries, tr.retries ? `warn` : ``) : ``) +
          stat(`runs with lost updates (300 seeds)`, pct(bad / 300), bad ? `bad` : `good`);
        let n;
        if (st.mode === `none`) n = tr.lost ? `This run lost ${tr.lost} of ${2 * st.n} increments (${lostSoFar} so far at this step). Each loss is a thread writing a value it computed from a stale read. Across 300 schedules, ${pct(bad / 300)} lose at least one update. ${st.sw === 0 ? `` : `Set the switch chance to 0 and every run is correct, which is why single-threaded tests never catch this.`}` : `This schedule happened to be safe, but ${pct(bad / 300)} of 300 schedules lose updates. Correct for one interleaving is not correct.`;
        else if (st.mode === `lock`) n = `The lock makes read, add, write one critical section: the other thread blocks at <code>lock</code> until it is released, so no update is lost in any schedule. The cost is waiting: threads blocked ${tr.waits} times in this run.`;
        else n = `Compare-and-set never blocks: a thread that read a stale value fails its CAS and retries (${tr.retries} retries here). Every increment lands exactly once. Under heavy contention the retries add up, which is why <code>LongAdder</code> exists for hot counters.`;
        q(`note`).innerHTML = note(n, st.mode === `none` && bad ? `bad` : `good`);
      };
      posIn.addEventListener(`input`, () => { st.pos = +posIn.value; draw(); });
      wireSegs(el, st, () => { sim(); draw(); });
      wireRanges(el, st, { n: v => v, sw: v => pct(v) }, () => { sim(); draw(); });
      onAgain(el, () => { st.seed = (st.seed * 31 + 17) % 100003; sim(); draw(); });
      sim(); draw();
    }
  };

  // =====================================================================
  // Ch2 - Check-then-act: booking one seat
  // =====================================================================
  function bookTrial(r, buyers, gap, mode) {
    const t = Array.from({ length: buyers }, () => r() * 200).sort((a, b) => a - b);
    if (mode === `unsafe`) {
      const firstWrite = t[0] + gap;
      return { t, win: t.map(x => x < firstWrite), wait: t.map(() => 0) };
    }
    if (mode === `sync`) {
      let free = 0; const wait = [];
      t.forEach((x, i) => { const start = Math.max(x, free); wait.push(start - x); free = start + (i === 0 ? gap : 1); });
      return { t, win: t.map((_, i) => i === 0), wait };
    }
    return { t, win: t.map((_, i) => i === 0), wait: t.map(() => 0) };
  }
  D.checkThenAct = {
    title: `Check-then-act: who gets the last seat?`,
    blurb: `Several buyers try to book the same free seat at random moments in a 200 ms window. Each one checks <code>if (!booked)</code> and then writes the booking a few milliseconds later. Compare the unprotected version with a <code>synchronized</code> method and an atomic <code>putIfAbsent</code>.`,
    mount(el) {
      const st = { mode: `unsafe`, buyers: 4, gap: 10, seed: 3 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`booking code`, seg(`mode`, [[`unsafe`, `if (free) book()`], [`sync`, `synchronized book()`], [`atomic`, `putIfAbsent`]], st.mode))}${againBtn}</div>
        <div class="ctl-row">${ctl(`concurrent buyers`, rng(`buyers`, 2, 12, 1, st.buyers))}${ctl(`time between check and write`, rng(`gap`, 1, 60, 1, st.gap))}</div>
        <div class="lab-panel"><h4>One run: when each buyer checks (dot) and writes (bar end)</h4><div data-k="chart"></div><div class="legend"><span><i class="sw" style="background:var(--good)"></i>booked</span><span><i class="sw" style="background:var(--bad)"></i>also "booked" (double booking)</span><span><i class="sw" style="background:var(--text-muted)"></i>told the seat is taken</span><span><i class="sw" style="background:var(--warn)"></i>waiting for the lock</span></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const one = bookTrial(mulberry32(st.seed), st.buyers, st.gap, st.mode);
        const ax = axes({ x0: 70, x1: 700, y0: 30 + st.buyers * 22, y1: 14, dx0: 0, dx1: 260, dy0: 0, dy1: 1, xTicks: [0, 50, 100, 150, 200, 250], xFmt: v => v + ` ms` });
        let s = ax.svg;
        const firstWrite = one.t[0] + st.gap;
        one.t.forEach((x, i) => {
          const y = 22 + i * 22, start = x + one.wait[i], end = st.mode === `atomic` ? x + 1 : start + (st.mode === `unsafe` || one.win[i] ? st.gap : 1);
          const col = one.win[i] ? (i === 0 ? `var(--good)` : `var(--bad)`) : `var(--text-muted)`;
          s += `<text x="62" y="${y + 4}" text-anchor="end" style="fill:var(--text);font-size:11px">buyer ${i + 1}</text>`;
          if (one.wait[i] > 0) s += `<rect x="${ax.X(x)}" y="${y - 4}" width="${ax.X(start) - ax.X(x)}" height="8" rx="2" style="fill:var(--warn);opacity:.6"/>`;
          s += `<rect x="${ax.X(start)}" y="${y - 4}" width="${Math.max(2, ax.X(end) - ax.X(start))}" height="8" rx="2" style="fill:${col}"/><circle cx="${ax.X(start)}" cy="${y}" r="4" style="fill:${col}"/>`;
        });
        if (st.mode === `unsafe`) s += `<line x1="${ax.X(firstWrite)}" x2="${ax.X(firstWrite)}" y1="10" y2="${ax.Y(0)}" style="stroke:var(--bad);stroke-dasharray:4 3"/><text class="svg-label" x="${ax.X(firstWrite) + 4}" y="12">first write lands</text>`;
        q(`chart`).innerHTML = svgWrap(720, 50 + st.buyers * 22, s);
        const r = mulberry32(st.seed * 13 + 1), N = 2000;
        let dbl = 0, extra = 0, maxW = 0; const waits = [];
        for (let i = 0; i < N; i++) {
          const tr = bookTrial(r, st.buyers, st.gap, st.mode); const w = tr.win.filter(Boolean).length;
          if (w > 1) dbl++; extra += w - 1; maxW = Math.max(maxW, w); waits.push(...tr.wait);
        }
        const avgWait = sum(waits) / waits.length;
        q(`stats`).innerHTML = stat(`runs with a double booking (of ${N})`, pct(dbl / N, 1), dbl ? `bad` : `good`) + stat(`extra bookings per run`, round(extra / N, 2), extra ? `bad` : `good`) + stat(`most buyers holding one seat`, maxW, maxW > 1 ? `bad` : `good`) + stat(`average wait for the lock`, round(avgWait, 1) + ` ms`, avgWait > 5 ? `warn` : ``);
        const winners = one.win.filter(Boolean).length;
        let n;
        if (st.mode === `unsafe`) n = `Every buyer who checks before the first write lands sees a free seat. ${winners > 1 ? `In this run ${winners} buyers were told they booked it.` : `This run was lucky.`} Over ${N} runs, ${pct(dbl / N, 1)} double-book. A wider gap between check and write (a slow payment call, a database round trip) or more buyers makes it worse.`;
        else if (st.mode === `sync`) n = `One buyer at a time runs check-and-write, so exactly one wins in every run. Anyone arriving while the winner holds the lock for its ${st.gap} ms waits (${round(avgWait, 1)} ms on average across all buyers). The longer the critical section, the longer the queue, so keep slow work such as payment calls and I/O out of it.`;
        else n = `<code>putIfAbsent(seat, user)</code> checks and writes in one atomic step, so exactly one caller gets <code>null</code> back and wins. Nobody waits on a lock; losers get an immediate "taken". The database equivalent is a unique constraint or <code>UPDATE ... WHERE status = 'FREE'</code>.`;
        q(`note`).innerHTML = note(n, st.mode === `unsafe` && dbl ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { buyers: v => v, gap: v => v + ` ms` }, draw);
      onAgain(el, () => { st.seed = (st.seed * 31 + 7) % 100003; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch2 - Deadlock: transfers in a cycle
  // =====================================================================
  function deadlockRun(k, mode, rounds, seed) {
    const r = mulberry32(seed);
    const owner = Array(k).fill(-1);
    const th = Array.from({ length: k }, (_, i) => {
      const a = i, b = (i + 1) % k;
      const order = mode === `ordered` ? [Math.min(a, b), Math.max(a, b)] : [a, b];
      return { order, pc: 0, done: 0, tries: 0, backoff: 0, from: a, to: b };
    });
    let retries = 0, ticks = 0; const log = [];
    const waitingOn = i => { const t = th[i]; if (t.done >= rounds || t.backoff > 0) return -1; if (t.pc === 0 || t.pc === 1) { const l = t.order[t.pc]; return owner[l] !== -1 && owner[l] !== i ? l : -1; } return -1; };
    while (ticks++ < 400) {
      const live = th.map((t, i) => i).filter(i => th[i].done < rounds);
      if (!live.length) return { deadlock: false, retries, ticks, log, owner, th };
      const runnable = live.filter(i => waitingOn(i) === -1 || mode === `trylock`);
      if (!runnable.length) { log.push({ t: -1, text: `every thread is waiting for a lock another thread holds: deadlock` }); return { deadlock: true, retries, ticks, log, owner, th }; }
      const i = runnable[Math.floor(r() * runnable.length)], t = th[i];
      if (t.backoff > 0) { t.backoff--; continue; }
      if (t.pc < 2) {
        const l = t.order[t.pc];
        if (owner[l] === -1) { owner[l] = i; t.pc++; t.tries = 0; log.push({ t: i, text: `locks account ${String.fromCharCode(65 + l)}` }); }
        else if (mode === `trylock` && t.pc === 1) {
          t.tries++;
          if (t.tries > 2) { const held = t.order[0]; owner[held] = -1; t.pc = 0; t.tries = 0; t.backoff = 1 + Math.floor(r() * 4); retries++; log.push({ t: i, text: `tryLock(${String.fromCharCode(65 + l)}) timed out: releases ${String.fromCharCode(65 + held)}, backs off`, cls: `warn` }); }
        } else if (log.length && log[log.length - 1].text.indexOf(`waits`) < 0) log.push({ t: i, text: `waits for account ${String.fromCharCode(65 + l)} (held by T${owner[l] + 1})`, cls: `warn` });
      } else if (t.pc === 2) { t.pc++; log.push({ t: i, text: `moves money ${String.fromCharCode(65 + t.from)} to ${String.fromCharCode(65 + t.to)}` }); }
      else { owner[t.order[0]] = -1; owner[t.order[1]] = -1; t.pc = 0; t.done++; log.push({ t: i, text: `releases both locks (transfer ${t.done} of ${rounds} done)` }); }
    }
    return { deadlock: false, retries, ticks, log, owner, th, stuck: true };
  }
  D.deadlockSim = {
    title: `Deadlock: transfers that lock two accounts`,
    blurb: `Each thread transfers money between two accounts in a cycle (T1: A to B, T2: B to A, and with three threads B to C and C to A too). A transfer locks its "from" account, then its "to" account. Run it naively, with a global lock order, or with <code>tryLock</code> and back-off, and watch the wait-for graph.`,
    mount(el) {
      const st = { k: 2, mode: `naive`, rounds: 3, seed: 5 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`threads`, seg(`k`, [[2, `2 (A&harr;B)`], [3, `3 (A&rarr;B&rarr;C&rarr;A)`]], st.k))}${ctl(`locking`, seg(`mode`, [[`naive`, `lock from, then to`], [`ordered`, `lock lower id first`], [`trylock`, `tryLock + back-off`]], st.mode))}${againBtn}</div>
        <div class="ctl-row">${ctl(`transfers per thread`, rng(`rounds`, 1, 6, 1, st.rounds))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Wait-for graph at the end of this run</h4><div data-k="graph"></div></div>
          <div class="lab-panel"><h4>Last steps of this run</h4><div data-k="log"></div></div>
        </div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const run = deadlockRun(st.k, st.mode, st.rounds, st.seed);
        const cx = 170, cy = 120, R = 80, k = st.k;
        const pos = (i, off, rad) => { const a = -Math.PI / 2 + (2 * Math.PI * (i + off)) / k; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; };
        let s = `<defs><marker id="cx-dl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--text-muted)"/></marker><marker id="cx-dl-arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--bad)"/></marker></defs>`;
        const line = (a, b, cls, dashed) => { const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, sx = a[0] + dx / d * 20, sy = a[1] + dy / d * 20, ex = b[0] - dx / d * 22, ey = b[1] - dy / d * 22; return `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" style="stroke:${cls};stroke-width:2${dashed ? `;stroke-dasharray:5 4` : ``}" marker-end="url(#${cls.indexOf(`bad`) > 0 ? `cx-dl-arrow-bad` : `cx-dl-arrow`})"/>`; };
        for (let i = 0; i < k; i++) {
          const t = run.th[i], tp = pos(i, 0, R);
          for (let l = 0; l < k; l++) if (run.owner[l] === i) s += line(pos(l, 0.5, R * 1.25), tp, run.deadlock ? `var(--bad)` : `var(--text-muted)`, false);
          if (t.done < st.rounds && t.pc < 2) { const l = t.order[t.pc]; if (run.owner[l] !== -1 && run.owner[l] !== i) s += line(tp, pos(l, 0.5, R * 1.25), run.deadlock ? `var(--bad)` : `var(--warn)`, true); }
        }
        for (let l = 0; l < k; l++) { const [x, y] = pos(l, 0.5, R * 1.25); s += `<rect x="${x - 18}" y="${y - 14}" width="36" height="28" rx="5" style="fill:var(--bg-3);stroke:var(--border)"/><text x="${x}" y="${y + 5}" text-anchor="middle" style="fill:var(--text);font-size:13px;font-weight:700">${String.fromCharCode(65 + l)}</text>`; }
        for (let i = 0; i < k; i++) { const [x, y] = pos(i, 0, R); s += `<circle cx="${x}" cy="${y}" r="18" style="fill:var(--bg-2);stroke:${TC[i]};stroke-width:2.5"/><text x="${x}" y="${y + 5}" text-anchor="middle" style="fill:var(--text);font-size:13px;font-weight:700">T${i + 1}</text>`; }
        s += `<text x="340" y="30" style="fill:var(--text);font-size:12px;font-weight:700">How to read it</text><text x="340" y="52" class="svg-label">solid: account &rarr; thread holding it</text><text x="340" y="70" class="svg-label">dashed: thread &rarr; account it waits for</text><text x="340" y="100" style="fill:${run.deadlock ? `var(--bad)` : `var(--good)`};font-size:13px;font-weight:700">${run.deadlock ? `Cycle: deadlock` : `No cycle: all transfers done`}</text>`;
        q(`graph`).innerHTML = svgWrap(560, 240, s);
        q(`log`).innerHTML = `<div class="scroll-x"><table class="mini-table">${run.log.slice(-9).map(e => `<tr><td>${e.t < 0 ? chip(`stuck`, `no`) : `<b style="color:${TC[e.t]}">T${e.t + 1}</b>`}</td><td style="white-space:normal">${e.cls ? chip(`wait`, `muted`) + ` ` : ``}${e.text}</td></tr>`).join(``)}</table></div>`;
        let dl = 0, rt = 0; const N = 600;
        for (let s2 = 1; s2 <= N; s2++) { const x = deadlockRun(st.k, st.mode, st.rounds, s2 * 104729 + st.seed); if (x.deadlock) dl++; rt += x.retries; }
        q(`stats`).innerHTML = stat(`runs that deadlock (of ${N})`, pct(dl / N, 1), dl ? `bad` : `good`) + (st.mode === `trylock` ? stat(`tryLock retries per run`, round(rt / N, 2), rt ? `warn` : ``) : ``) + stat(`this run`, run.deadlock ? `deadlocked` : `finished`, run.deadlock ? `bad` : `good`);
        let n;
        if (st.mode === `naive`) n = `Each thread grabs its "from" account and then waits for its "to" account. If every thread gets its first lock before any gets its second, the waits form a cycle and nobody can move: ${pct(dl / N, 1)} of runs deadlock. This scheduler switches threads after almost every step, so the bad timing is common here. In a real service the window is tiny, so the deadlock shows up rarely, under load, in production, which makes it much harder to catch.`;
        else if (st.mode === `ordered`) n = `Every thread locks the account with the lower id first. A thread that holds a lock only ever waits for a <em>higher</em> id, so a cycle is impossible and 0 of ${N} runs deadlock. This is the standard answer: sort the locks.`;
        else n = `A thread that can't get its second lock within the timeout releases the first, backs off for a random time and retries. Hold-and-wait is broken, so nothing deadlocks, at the cost of ${round(rt / N, 2)} retries per run. Without the random back-off, threads can retry in lockstep forever (livelock).`;
        q(`note`).innerHTML = note(n, dl ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { rounds: v => v }, draw);
      onAgain(el, () => { st.seed = (st.seed * 31 + 11) % 100003; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch3 - Producer-consumer with a bounded buffer
  // =====================================================================
  D.boundedBuffer = {
    title: `Producer-consumer: bounded, dropping or unbounded buffer`,
    blurb: `Producers create items at random; consumers take items from a shared queue and spend a fixed time on each. Choose what a producer does when the queue is full: block on <code>put</code>, drop on <code>offer</code>, or use an unbounded queue that never says no. Watch the queue depth over 300 ticks.`,
    mount(el) {
      const st = { P: 2, p: 0.5, C: 2, S: 4, cap: 10, pol: `block`, seed: 9 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`when the queue is full`, seg(`pol`, [[`block`, `put() blocks`], [`drop`, `offer() drops`], [`unbounded`, `unbounded queue`]], st.pol))}${againBtn}</div>
        <div class="ctl-row">${ctl(`producers`, rng(`P`, 1, 6, 1, st.P))}${ctl(`items per producer per tick`, rng(`p`, 0.05, 1, 0.05, st.p))}</div>
        <div class="ctl-row">${ctl(`consumers`, rng(`C`, 1, 6, 1, st.C))}${ctl(`ticks to process one item`, rng(`S`, 1, 12, 1, st.S))}${ctl(`queue capacity`, rng(`cap`, 1, 50, 1, st.cap))}</div>
        <div class="lab-panel"><h4>Queue depth over time</h4><div data-k="chart"></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const r = mulberry32(st.seed), T = 300, cap = st.pol === `unbounded` ? Infinity : st.cap;
        const queue = [], busy = Array(st.C).fill(0), holding = Array(st.P).fill(-1);
        let produced = 0, consumed = 0, dropped = 0, blockedTicks = 0, busyTicks = 0, maxQ = 0; const depth = [], waits = [];
        for (let t = 0; t < T; t++) {
          for (let i = 0; i < st.P; i++) {
            if (holding[i] < 0 && r() < st.p) { holding[i] = t; produced++; }
            if (holding[i] >= 0) {
              if (queue.length < cap) { queue.push(holding[i]); holding[i] = -1; }
              else if (st.pol === `drop`) { dropped++; holding[i] = -1; }
              else blockedTicks++;
            }
          }
          for (let c = 0; c < st.C; c++) {
            if (busy[c] > 0) { busy[c]--; busyTicks++; if (busy[c] === 0) consumed++; }
            if (busy[c] === 0 && queue.length) { waits.push(t - queue.shift()); busy[c] = st.S; }
          }
          maxQ = Math.max(maxQ, queue.length); depth.push(queue.length);
        }
        const yMax = Math.max(5, st.pol === `unbounded` ? maxQ : st.cap, maxQ);
        const ax = axes({ x0: 44, x1: 740, y0: 180, y1: 12, dx0: 0, dx1: T, dy0: 0, dy1: yMax, xTicks: [0, 50, 100, 150, 200, 250, 300], yTicks: [0, Math.round(yMax / 2), yMax], xLabel: `tick` });
        let s = ax.svg;
        if (st.pol !== `unbounded`) s += `<line x1="44" x2="740" y1="${ax.Y(st.cap)}" y2="${ax.Y(st.cap)}" style="stroke:var(--bad);stroke-dasharray:5 4"/><text class="svg-label" x="48" y="${ax.Y(st.cap) - 4}">capacity ${st.cap}</text>`;
        s += `<path d="${path(depth.map((v, i) => [ax.X(i), ax.Y(v)]))}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        q(`chart`).innerHTML = svgWrap(760, 210, s);
        const inRate = st.P * st.p, outRate = st.C / st.S, util = busyTicks / (T * st.C);
        q(`stats`).innerHTML = stat(`arrival rate (items/tick)`, round(inRate, 2), inRate > outRate ? `bad` : `good`) + stat(`service capacity (items/tick)`, round(outRate, 2)) + stat(`produced`, produced) + stat(`consumed`, consumed) +
          (st.pol === `drop` ? stat(`dropped`, dropped, dropped ? `bad` : `good`) : ``) + (st.pol === `block` ? stat(`producer time spent blocked`, pct(blockedTicks / (T * st.P)), blockedTicks ? `warn` : `good`) : ``) +
          stat(`max queue depth`, maxQ, st.pol === `unbounded` && maxQ > 50 ? `bad` : ``) + stat(`avg wait in queue`, round(sum(waits) / Math.max(1, waits.length), 1) + ` ticks`) + stat(`consumer utilization`, pct(util));
        let n = inRate > outRate
          ? `Producers offer ${round(inRate, 2)} items per tick but consumers can finish only ${round(outRate, 2)}. No buffer fixes that; it only decides who feels it. `
          : `Consumers can keep up on average (${round(outRate, 2)} vs ${round(inRate, 2)} items per tick), so the queue only absorbs random bursts. `;
        if (st.pol === `block`) n += `With a bounded queue and <code>put()</code>, a full queue makes producers wait (${pct(blockedTicks / (T * st.P))} of their time): backpressure. Memory stays bounded at ${st.cap} items.`;
        else if (st.pol === `drop`) n += `With <code>offer()</code>, a full queue rejects items immediately: ${dropped} dropped. Producers never stall, which suits telemetry or debug logs where loss is acceptable. Count drops so they're visible.`;
        else n += `The unbounded queue never pushes back. It reached ${maxQ} items${inRate > outRate ? ` and keeps growing: in a real service that is rising latency followed by an OutOfMemoryError` : ``}. This is what <code>Executors.newFixedThreadPool</code> does by default.`;
        q(`note`).innerHTML = note(n, inRate > outRate ? (st.pol === `unbounded` ? `bad` : `warn`) : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { P: v => v, p: v => round(v, 2), C: v => v, S: v => v, cap: v => v }, draw);
      onAgain(el, () => { st.seed = (st.seed * 31 + 3) % 100003; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch4 - Semaphore-guarded pool
  // =====================================================================
  D.semaphorePool = {
    title: `A pool of N permits: block, time out or fail fast`,
    blurb: `Requests arrive at random and each needs one permit (a connection, an inference slot) for a random hold time. Choose the pool size and what a request does when no permit is free: wait forever on <code>acquire()</code>, wait up to a timeout on <code>tryAcquire(t)</code>, or give up at once on <code>tryAcquire()</code>.`,
    mount(el) {
      const st = { N: 8, lam: 1.5, H: 5, pol: `timeout`, to: 6, seed: 21 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`no permit free`, seg(`pol`, [[`block`, `acquire() waits`], [`timeout`, `tryAcquire(timeout)`], [`fast`, `tryAcquire() fails fast`]], st.pol))}${againBtn}</div>
        <div class="ctl-row">${ctl(`permits (pool size)`, rng(`N`, 1, 30, 1, st.N))}${ctl(`arrivals per tick`, rng(`lam`, 0.1, 6, 0.1, st.lam))}</div>
        <div class="ctl-row">${ctl(`average hold time (ticks)`, rng(`H`, 1, 20, 1, st.H))}${ctl(`timeout (ticks)`, rng(`to`, 1, 30, 1, st.to))}</div>
        <div class="lab-panel"><h4>Permits in use and requests waiting</h4><div data-k="chart"></div><div class="legend"><span><i class="sw" style="background:var(--accent)"></i>in use</span><span><i class="sw" style="background:var(--warn)"></i>waiting</span></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const r = mulberry32(st.seed), T = 400;
        let free = st.N; const holds = [], waitQ = [], waits = [], inUse = [], waiting = [];
        let served = 0, rejected = 0, timedOut = 0, arrived = 0;
        for (let t = 0; t < T; t++) {
          for (let i = holds.length - 1; i >= 0; i--) if (holds[i] <= t) { holds.splice(i, 1); free++; }
          if (st.pol === `timeout`) while (waitQ.length && t - waitQ[0] > st.to) { waitQ.shift(); timedOut++; }
          while (free > 0 && waitQ.length) { const a = waitQ.shift(); waits.push(t - a); free--; served++; holds.push(t + Math.max(1, Math.round(expRand(r, st.H)))); }
          const k = poisson(r, st.lam); arrived += k;
          for (let j = 0; j < k; j++) {
            if (free > 0 && !waitQ.length) { free--; served++; waits.push(0); holds.push(t + Math.max(1, Math.round(expRand(r, st.H)))); }
            else if (st.pol === `fast`) rejected++;
            else waitQ.push(t);
          }
          inUse.push(st.N - free); waiting.push(waitQ.length);
        }
        const yMax = Math.max(st.N + 2, ...waiting.map(w => w + 0), 5);
        const top = Math.min(yMax, st.N * 6 + 10);
        const ax = axes({ x0: 44, x1: 740, y0: 190, y1: 12, dx0: 0, dx1: T, dy0: 0, dy1: top, xTicks: [0, 100, 200, 300, 400], yTicks: [0, st.N, top], xLabel: `tick` });
        let s = ax.svg + `<path d="${path([[ax.X(0), ax.Y(0)], ...inUse.map((v, i) => [ax.X(i), ax.Y(v)]), [ax.X(T - 1), ax.Y(0)]])}" style="fill:var(--accent);opacity:.35;stroke:var(--accent)"/>`;
        s += `<path d="${path(waiting.map((v, i) => [ax.X(i), ax.Y(Math.min(top, v))]))}" style="fill:none;stroke:var(--warn);stroke-width:2"/>`;
        s += `<line x1="44" x2="740" y1="${ax.Y(st.N)}" y2="${ax.Y(st.N)}" style="stroke:var(--text-muted);stroke-dasharray:4 4"/><text class="svg-label" x="48" y="${ax.Y(st.N) - 4}">${st.N} permits</text>`;
        q(`chart`).innerHTML = svgWrap(760, 220, s);
        const capRate = st.N / st.H, offered = st.lam, util = sum(inUse) / (T * st.N);
        const failed = rejected + timedOut;
        q(`stats`).innerHTML = stat(`offered load (req/tick)`, round(offered, 2), offered > capRate ? `bad` : `good`) + stat(`capacity N / hold time`, round(capRate, 2)) + stat(`served`, served) +
          (st.pol !== `block` ? stat(st.pol === `fast` ? `rejected at once` : `timed out`, `${failed} (${pct(failed / Math.max(1, arrived))})`, failed ? `warn` : `good`) : stat(`still waiting at the end`, waitQ.length, waitQ.length > st.N ? `bad` : ``)) +
          stat(`avg wait`, round(sum(waits) / Math.max(1, waits.length), 1) + ` ticks`) + stat(`p95 wait`, pctl(waits, 0.95) + ` ticks`, pctl(waits, 0.95) > st.H * 2 ? `warn` : ``) + stat(`utilization`, pct(util));
        let n = `By Little's law, ${st.N} permits held ${st.H} ticks each can serve about ${round(capRate, 2)} requests per tick; ${round(offered, 2)} arrive. `;
        if (offered > capRate) {
          n += st.pol === `block` ? `Demand is higher than capacity, so with a plain <code>acquire()</code> the wait line grows for the whole run and so does latency: nobody is told no, everybody is late.` :
            st.pol === `timeout` ? `Demand is higher than capacity, so some requests must fail. The timeout caps how long a caller can wait (${st.to} ticks) and turns the excess into errors you can handle.` :
              `Demand is higher than capacity. Failing fast rejects the excess right away, with no waiting at all: good for interactive calls that have a fallback.`;
        } else n += `Capacity covers the average demand, so waits come only from bursts. ${st.pol === `fast` ? `Even so, failing fast rejects requests during bursts that a short wait would have served.` : `A short wait absorbs them.`}`;
        q(`note`).innerHTML = note(n, offered > capRate ? (st.pol === `block` ? `bad` : `warn`) : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { N: v => v, lam: v => round(v, 1), H: v => v, to: v => v }, draw);
      onAgain(el, () => { st.seed = (st.seed * 31 + 5) % 100003; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch4 - Token bucket vs fixed window
  // =====================================================================
  D.tokenBucket = {
    title: `Rate limiting: token bucket vs fixed window`,
    blurb: `A client sends requests over 20 seconds. A <strong>token bucket</strong> refills at the limit rate up to a burst capacity; a <strong>fixed window</strong> allows the limit per calendar second. Pick a traffic shape and see how much each lets through, and how many requests it accepts within any one-second span.`,
    mount(el) {
      const st = { alg: `bucket`, rate: 10, cap: 10, load: 15, shape: `bursty`, seed: 4 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`limiter`, seg(`alg`, [[`bucket`, `token bucket`], [`window`, `fixed 1 s window`]], st.alg))}${ctl(`traffic`, seg(`shape`, [[`steady`, `steady`], [`bursty`, `bursts`], [`edge`, `bursts at window edges`]], st.shape))}${againBtn}</div>
        <div class="ctl-row">${ctl(`limit (requests / s)`, rng(`rate`, 1, 30, 1, st.rate))}${ctl(`bucket capacity (burst)`, rng(`cap`, 1, 60, 1, st.cap))}${ctl(`average offered load (req / s)`, rng(`load`, 1, 60, 1, st.load))}</div>
        <div class="lab-panel"><h4>Accepted and rejected per 100 ms; line = tokens left</h4><div data-k="chart"></div><div class="legend"><span><i class="sw" style="background:var(--good)"></i>accepted</span><span><i class="sw" style="background:var(--bad)"></i>rejected</span><span><i class="sw line" style="background:var(--accent-2)"></i>tokens</span></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const r = mulberry32(st.seed), slots = 200, dt = 0.1;
        let tokens = st.cap, winCount = 0, win = -1; const acc = [], rej = [], tok = [], accTimes = [];
        for (let i = 0; i < slots; i++) {
          const t = i * dt;
          let lam = st.load * dt;
          if (st.shape === `bursty`) lam = (i % 30 < 5) ? st.load * dt * 6 : st.load * dt * 0.2;
          if (st.shape === `edge`) { const ph = i % 10; lam = (ph === 9 || ph === 0) ? st.load * dt * 5 : 0; }
          const k = poisson(r, lam);
          let a = 0, b = 0;
          for (let j = 0; j < k; j++) {
            const tj = t + (j + 0.5) * dt / Math.max(1, k);
            if (st.alg === `bucket`) { if (tokens >= 1) { tokens -= 1; a++; accTimes.push(tj); } else b++; }
            else { const w = Math.floor(tj + 1e-9); if (w !== win) { win = w; winCount = 0; } if (winCount < st.rate) { winCount++; a++; accTimes.push(tj); } else b++; }
          }
          if (st.alg === `bucket`) tokens = Math.min(st.cap, tokens + st.rate * dt);
          acc.push(a); rej.push(b); tok.push(st.alg === `bucket` ? tokens : Math.max(0, st.rate - winCount));
        }
        let maxSpan = 0, lo = 0;
        for (let hi = 0; hi < accTimes.length; hi++) { while (accTimes[hi] - accTimes[lo] >= 1) lo++; maxSpan = Math.max(maxSpan, hi - lo + 1); }
        const yMax = Math.max(4, ...acc.map((a, i) => a + rej[i]));
        const ax = axes({ x0: 40, x1: 740, y0: 180, y1: 12, dx0: 0, dx1: slots, dy0: 0, dy1: yMax, xTicks: [0, 50, 100, 150, 200], yTicks: [0, yMax], xFmt: v => v / 10 + ` s` });
        let s = ax.svg; const bw = (700 / slots) * 0.8;
        acc.forEach((a, i) => { const x = ax.X(i); s += `<rect x="${x}" y="${ax.Y(a)}" width="${bw}" height="${ax.Y(0) - ax.Y(a)}" style="fill:var(--good)"/><rect x="${x}" y="${ax.Y(a + rej[i])}" width="${bw}" height="${ax.Y(a) - ax.Y(a + rej[i])}" style="fill:var(--bad);opacity:.75"/>`; });
        const tMax = Math.max(st.cap, st.rate);
        s += `<path d="${path(tok.map((v, i) => [ax.X(i) + bw / 2, 180 - (v / tMax) * 168]))}" style="fill:none;stroke:var(--accent-2);stroke-width:1.6"/>`;
        q(`chart`).innerHTML = svgWrap(760, 205, s);
        const A = sum(acc), B = sum(rej), bound = st.alg === `bucket` ? st.cap + st.rate : 2 * st.rate;
        q(`stats`).innerHTML = stat(`accepted`, A) + stat(`rejected`, B, B ? `warn` : `good`) + stat(`accepted share`, pct(A / Math.max(1, A + B))) + stat(`most accepted in any 1 s span`, maxSpan, maxSpan > st.rate ? `warn` : `good`) + stat(`worst case for this limiter`, bound);
        let n = st.alg === `bucket`
          ? `The bucket allows bursts up to its capacity (${st.cap}) and then exactly the refill rate (${st.rate}/s). In any one-second span it can accept at most capacity + rate = ${st.cap + st.rate}; this run peaked at ${maxSpan}. Set capacity equal to the rate for a strict limit, or larger to tolerate bursty but well-behaved clients.`
          : `The fixed window resets its counter every calendar second. ${st.shape === `edge` ? `Bursts straddling a boundary get the full limit at the end of one window and again at the start of the next: up to ${2 * st.rate} in one real second (this run: ${maxSpan}).` : `Try "bursts at window edges" to see its weak spot.`} It is the simplest limiter but the least smooth.`;
        n += ` Either way, the check and the update must be one atomic step (a synchronized method or a CAS loop); otherwise concurrent callers overshoot the limit.`;
        q(`note`).innerHTML = note(n, maxSpan > st.rate * 1.5 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { rate: v => v + `/s`, cap: v => v, load: v => v + `/s` }, draw);
      onAgain(el, () => { st.seed = (st.seed * 31 + 9) % 100003; draw(); });
      draw();
    }
  };
})();
