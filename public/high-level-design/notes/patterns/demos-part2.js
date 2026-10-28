// Patterns labs, part 2: dealing with contention (lost updates, optimistic vs pessimistic, fencing tokens, holds with expiry)
(function () {
  "use strict";
  const { round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, axes, path, fmtNum, pct } = window.LabKit;
  window.DEMOS = window.DEMOS || {};
  const D = window.DEMOS;
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });
  const quant = (arr, q) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
  const ms = v => v >= 1000 ? `${round(v / 1000, 2)} s` : `${round(v, v < 10 ? 1 : 0)} ms`;

  // Tiny binary min-heap on .t, for the event simulations.
  function heap() {
    const a = [];
    return {
      get size() { return a.length; },
      push(x) { a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].t <= a[i].t) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].t < a[m].t) m = l; if (r < a.length && a[r].t < a[m].t) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
        return top;
      }
    };
  }

  // =====================================================================
  // The last seats: four ways to decrement one stock row
  // =====================================================================
  const LU_AP = { naive: `read, then write`, lock: `SELECT ... FOR UPDATE`, occ: `version check + retry`, atomic: `UPDATE ... WHERE stock > 0` };
  const LU_MAX_RETRY = 8;
  function luSim(ap, st, seed) {
    const r = mulberry32(seed);
    const N = st.buyers, K = st.seats, W = st.window, app = st.app;
    const buyers = Array.from({ length: N }, (_, i) => ({ i, s: r() * W, d: app * (0.5 + r()) })).sort((a, b) => a.s - b.s);
    let stock = K, ver = 0, sold = 0, lost = 0, retries = 0, gaveUp = 0, soldOut = 0;
    const lat = [];
    if (ap === `lock` || ap === `atomic`) {
      // One row lock, granted in arrival order. FOR UPDATE holds it for the whole read-think-write;
      // the conditional UPDATE holds it for one statement.
      let free = 0;
      buyers.forEach(b => {
        const start = Math.max(b.s, free);
        let hold;
        if (ap === `lock`) hold = stock > 0 ? b.d + 1 : 1;
        else hold = 0.5;
        free = start + hold;
        if (stock > 0) { stock--; sold++; } else soldOut++;
        lat.push(free - b.s + (ap === `atomic` ? b.d : 0));
      });
    } else {
      const H = heap();
      buyers.forEach(b => H.push({ t: b.s, kind: `read`, b, tries: 0 }));
      while (H.size) {
        const ev = H.pop();
        const b = ev.b;
        if (ev.kind === `read`) {
          if (ap === `occ` && stock <= 0) { soldOut++; lat.push(ev.t - b.s + 0.5); continue; }
          H.push({ t: ev.t + b.d * (ev.tries ? 0.5 : 1), kind: `write`, b, seen: stock, v: ver, tries: ev.tries });
        } else if (ap === `naive`) {
          if (ev.seen <= 0) { soldOut++; lat.push(ev.t - b.s); continue; }
          if (ev.v !== ver) lost++;
          stock = ev.seen - 1; ver++; sold++;
          lat.push(ev.t - b.s);
        } else {
          if (ev.v === ver) { stock--; ver++; sold++; lat.push(ev.t - b.s); }
          else if (stock <= 0) { soldOut++; lat.push(ev.t - b.s); }
          else if (ev.tries >= LU_MAX_RETRY) { gaveUp++; lat.push(ev.t - b.s); }
          else { retries++; H.push({ t: ev.t + 0.5 + r() * 2, kind: `read`, b, tries: ev.tries + 1 }); }
        }
      }
    }
    return { sold, over: Math.max(0, sold - K), lost, retries, gaveUp, soldOut, p50: quant(lat, 0.5), p95: quant(lat, 0.95), stock: ap === `naive` ? stock : K - sold };
  }
  D.ctLostUpdate = {
    title: `The last seats: four ways to decrement one stock row`,
    blurb: `Buyers arrive within a short burst and each tries to take one of the last seats. Every request reads the stock, spends some time in the application (validation, pricing, a payment pre-check), then writes. The four strategies differ only in how the read and the write are protected. Watch the oversold count, the retries and the tail latency.`,
    mount(el) {
      const st = { ap: `naive`, buyers: 200, seats: 10, window: 200, app: 20 };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`strategy`, seg(`ap`, Object.keys(LU_AP).map(k => [k, LU_AP[k]]), st.ap))}</div>
        <div class="ctl-row">${ctl(`buyers`, seg(`buyers`, [[20, `20`], [200, `200`], [1000, `1,000`]], st.buyers))}${ctl(`seats left`, seg(`seats`, [[1, `1`], [10, `10`], [100, `100`]], st.seats))}${ctl(`app time between read and write`, seg(`app`, [[2, `2 ms`], [20, `20 ms`], [100, `100 ms`]], st.app))}</div>
        <div class="ctl-row">${ctl(`buyers arrive within`, rng(`window`, 20, 2000, 10, st.window))}${againBtn}</div>
        <div class="lab-panel"><h4>This strategy</h4><div class="stat-row" data-k="stats"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>All strategies, same buyers</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = {};
        Object.keys(LU_AP).forEach(k => { R[k] = luSim(k, st, seed * 97 + 13); });
        const s = R[st.ap];
        q(`stats`).innerHTML = stat(`seats sold (of ${st.seats})`, fmtNum(s.sold), s.over ? `bad` : `good`) + stat(`oversold`, fmtNum(s.over), s.over ? `bad` : `good`) + stat(`lost updates (write based on a stale read)`, fmtNum(s.lost), s.lost ? `bad` : ``) + stat(`retries`, fmtNum(s.retries), s.retries > st.buyers ? `warn` : ``) + stat(`gave up after ${LU_MAX_RETRY} retries`, fmtNum(s.gaveUp), s.gaveUp ? `warn` : ``) + stat(`p95 latency`, ms(s.p95), s.p95 > 1000 ? `bad` : s.p95 > 200 ? `warn` : ``);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>strategy</th><th class="num">sold</th><th class="num">oversold</th><th class="num">retries</th><th class="num">gave up</th><th class="num">p50</th><th class="num">p95</th></tr>${Object.keys(LU_AP).map(k => `<tr class="${k === st.ap ? `new` : ``}"><td>${LU_AP[k]}</td><td class="num">${fmtNum(R[k].sold)}</td><td class="num" style="${R[k].over ? `color:var(--bad);font-weight:700` : ``}">${fmtNum(R[k].over)}</td><td class="num">${fmtNum(R[k].retries)}</td><td class="num">${fmtNum(R[k].gaveUp)}</td><td class="num">${ms(R[k].p50)}</td><td class="num">${ms(R[k].p95)}</td></tr>`).join(``)}</table></div>`;
        const N = {
          naive: s.over ? `${fmtNum(s.sold)} buyers were told they got a seat, but only ${st.seats} exist. Many requests read the same stock value, each wrote "value minus one", and each write silently replaced the others (${fmtNum(s.lost)} lost updates). The longer the gap between read and write, the worse it gets.` : `No overselling this run because requests barely overlapped. Shorten the arrival window or lengthen the app time and the read-then-write race appears.`,
          lock: `Correct: each buyer locks the row, reads, thinks and writes while everyone else waits. The cost is queuing. The lock is held for the whole ${st.app} ms of app time, so the p95 wait grows with the number of buyers queued behind the row (${ms(s.p95)} here). Keep locked sections short and never hold a row lock across a user's think time.`,
          occ: `Correct: a write succeeds only if the version is unchanged since the read, so a stale write is rejected instead of applied. Under this much contention most attempts collide, giving ${fmtNum(s.retries)} retries${s.gaveUp ? ` and ${fmtNum(s.gaveUp)} buyers who gave up` : ``}. Optimistic concurrency shines when conflicts are rare and wastes work when everyone hits one row.`,
          atomic: `Correct and fast: one statement checks and decrements the stock under a row lock held for well under a millisecond, and the app work runs outside the lock. When the whole decision fits in a single conditional UPDATE, this is the simplest answer. It stops working once the check spans several rows or services.`
        };
        q(`note`).innerHTML = note(N[st.ap], s.over ? `bad` : s.gaveUp || s.p95 > 1000 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { window: v => ms(v) }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Optimistic vs pessimistic as contention grows
  // =====================================================================
  const OP_T = 10, OP_DUR = 1000, OP_RETRY = 5;
  function opSim(mode, C, R, seed, hold, dur) {
    dur = dur || OP_DUR;
    const r = mulberry32(seed);
    const H = heap();
    const ver = new Int32Array(R), lockFree = new Float64Array(R);
    let commits = 0, checks = 0, conflicts = 0, failed = 0;
    const lat = [];
    for (let c = 0; c < C; c++) H.push({ t: r() * OP_T, kind: `start`, c });
    while (H.size) {
      const ev = H.pop();
      if (ev.t > dur) break;
      const d = OP_T * (0.6 + 0.8 * r());
      if (ev.kind === `start` || ev.kind === `retry`) {
        const row = ev.kind === `start` ? Math.floor(r() * R) : ev.row;
        const t0 = ev.kind === `start` ? ev.t : ev.t0;
        const tries = ev.kind === `start` ? 0 : ev.tries;
        if (mode === `pess`) {
          const begin = Math.max(ev.t, lockFree[row]);
          lockFree[row] = begin + d + hold;
          H.push({ t: lockFree[row], kind: `done`, c: ev.c, t0 });
        } else {
          H.push({ t: ev.t + d, kind: `commit`, c: ev.c, row, v: ver[row], t0, tries });
        }
      } else if (ev.kind === `commit`) {
        checks++;
        if (ver[ev.row] !== ev.v) conflicts++;
        if (ver[ev.row] === ev.v) { ver[ev.row]++; commits++; lat.push(ev.t - ev.t0); H.push({ t: ev.t, kind: `start`, c: ev.c }); }
        else if (ev.tries >= OP_RETRY) { failed++; H.push({ t: ev.t, kind: `start`, c: ev.c }); }
        else H.push({ t: ev.t + r() * 2, kind: `retry`, c: ev.c, row: ev.row, t0: ev.t0, tries: ev.tries + 1 });
      } else if (ev.kind === `done`) {
        commits++; lat.push(ev.t - ev.t0); H.push({ t: ev.t, kind: `start`, c: ev.c });
      }
    }
    return { tput: commits * 1000 / dur, waste: checks ? conflicts / checks : 0, failed, p95: quant(lat, 0.95), p50: quant(lat, 0.5) };
  }
  const OP_ROWS = [1, 3, 10, 30, 100, 300, 1000];
  D.ctOptimisticVsPessimistic = {
    title: `Optimistic vs pessimistic as contention grows`,
    blurb: `A fixed group of clients run 10 ms read-modify-write transactions for one simulated second, each on a row picked at random from a pool. Few rows means heavy contention; many rows means conflicts are rare. Pessimistic transactions queue on a row lock. Optimistic ones run freely and retry (up to ${OP_RETRY} times) if the row's version changed underneath them.`,
    mount(el) {
      const st = { C: 50, rows: 1.3, hold: 1 };
      let seed = 1;
      let cache = null, cacheKey = ``;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`concurrent clients`, seg(`C`, [[10, `10`], [50, `50`], [200, `200`]], st.C))}${ctl(`rows they spread over`, rng(`rows`, 0, 3, 0.1, st.rows))}</div>
        <div class="ctl-row">${ctl(`extra lock overhead per transaction (round trips while holding the lock)`, seg(`hold`, [[0, `none`], [1, `1 ms`], [5, `5 ms`]], st.hold))}${againBtn}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>p95 latency of committed transactions vs number of rows</h4><div data-k="chart"></div><div class="legend"><span><i class="sw line" style="background:var(--accent)"></i>pessimistic</span><span><i class="sw line" style="background:var(--warn)"></i>optimistic</span><span><i class="sw line" style="background:var(--text-muted)"></i>your setting</span></div></div>
          <div class="lab-panel"><h4>At your setting</h4><div data-k="tbl"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = Math.max(1, Math.round(Math.pow(10, st.rows)));
        const key = `${st.C}|${st.hold}|${seed}`;
        if (key !== cacheKey) {
          cacheKey = key;
          const dur = Math.max(150, OP_DUR * 25 / st.C);
          cache = OP_ROWS.map(rows => ({ rows, p: opSim(`pess`, st.C, rows, seed * 7 + rows, st.hold, dur), o: opSim(`opt`, st.C, rows, seed * 7 + rows, st.hold, dur) }));
        }
        const p = opSim(`pess`, st.C, R, seed * 11 + R, st.hold), o = opSim(`opt`, st.C, R, seed * 11 + R, st.hold);
        const maxY = Math.max(50, ...cache.map(x => Math.max(x.p.p95, x.o.p95)), p.p95, o.p95);
        const yTop = maxY > 1000 ? 2000 : maxY > 500 ? 1000 : maxY > 200 ? 500 : maxY > 100 ? 200 : 100;
        const ax = axes({ x0: 46, x1: 370, y0: 180, y1: 12, dx0: 1, dx1: 1000, dy0: 0, dy1: yTop, xLog: true, xTicks: [1, 10, 100, 1000], yTicks: [0, yTop / 4, yTop / 2, 3 * yTop / 4, yTop], xFmt: v => fmtNum(v, 0), yFmt: v => ms(v), xLabel: `rows (log scale): fewer rows = more contention` });
        const Yc = v => ax.Y(Math.min(yTop, v));
        let s = ax.svg;
        s += `<path d="${path(cache.map(x => [ax.X(x.rows), Yc(x.p.p95)]))}" style="fill:none;stroke:var(--accent);stroke-width:2.2"/>`;
        s += `<path d="${path(cache.map(x => [ax.X(x.rows), Yc(x.o.p95)]))}" style="fill:none;stroke:var(--warn);stroke-width:2.2"/>`;
        s += `<line class="svg-now" x1="${ax.X(R)}" x2="${ax.X(R)}" y1="180" y2="12" style="opacity:.5"/>`;
        q(`chart`).innerHTML = svgWrap(390, 214, s);
        const row = (label, a, b, bad) => `<tr><td>${label}</td><td class="num">${a}</td><td class="num" style="${bad ? `color:var(--bad);font-weight:700` : ``}">${b}</td></tr>`;
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>${fmtNum(R)} row${R > 1 ? `s` : ``}, ${st.C} clients</th><th class="num">pessimistic</th><th class="num">optimistic</th></tr>
          ${row(`commits per second`, fmtNum(round(p.tput)), fmtNum(round(o.tput)))}
          ${row(`attempts thrown away`, pct(p.waste), pct(o.waste, 1), o.waste > 0.3)}
          ${row(`gave up after ${OP_RETRY} retries`, `0`, fmtNum(o.failed), o.failed > 0)}
          ${row(`p50 latency (committed)`, ms(p.p50), ms(o.p50))}
          ${row(`p95 latency (committed)`, ms(p.p95), ms(o.p95))}
        </table>`;
        const conflict = Math.min(1, st.C / R);
        let msg;
        if (R <= 3) msg = `With ${st.C} clients on ${R} row${R > 1 ? `s` : ``}, nearly every optimistic attempt loses the race: ${pct(o.waste, 0)} of attempts are thrown away and ${fmtNum(o.failed)} transactions gave up. Pessimistic locking queues the same clients in order and wastes nothing, though each one waits its turn. For a single hot row, lock it, use an atomic conditional update, or serialize through a queue.`;
        else if (conflict < 0.2) msg = `With ${fmtNum(R)} rows, collisions are rare, so optimistic transactions almost never retry and skip the lock round trips entirely. This is the common case for most tables: user profiles, carts, documents. Optimistic concurrency is the default here.`;
        else msg = `This is the middle ground: some optimistic attempts collide (${pct(o.waste, 0)} wasted), while pessimistic transactions sometimes wait for a lock. Move the slider left to see optimistic fall apart on hot rows, or right to see its retries vanish.`;
        if (st.hold === 5) msg += ` A 5 ms lock overhead stands for a lock held across extra network round trips; it inflates every pessimistic transaction, which is why locks should cover as little work as possible.`;
        q(`note`).innerHTML = note(msg, R <= 3 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { rows: v => fmtNum(Math.max(1, Math.round(Math.pow(10, v)))) }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Distributed lock: a paused holder and fencing tokens
  // =====================================================================
  D.ctFencing = {
    title: `A paused lock holder and fencing tokens`,
    blurb: `Client A takes a lease-based lock (token 33) to update a file in storage, then freezes: a long garbage-collection pause, a VM migration, a slow disk. If the pause outlasts the lease, the lock service hands the lock to client B (token 34). When A wakes up it still believes it holds the lock. Choose the lease length and the pause, and turn fencing on or off.`,
    mount(el) {
      const st = { ttl: 10, pause: 15, fence: `off` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`lease length`, rng(`ttl`, 2, 30, 1, st.ttl))}${ctl(`A's pause`, rng(`pause`, 0, 40, 1, st.pause))}${ctl(`storage checks fencing tokens`, seg(`fence`, [[`off`, `off`], [`on`, `on`]], st.fence))}</div>
        <div class="lab-panel"><h4>Timeline (seconds)</h4><div data-k="chart"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>What storage saw</h4><div data-k="log"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const L = st.ttl, P = st.pause, fence = st.fence === `on`;
        const readA = 0.5, pauseAt = 1, wake = pauseAt + P, writeA = wake + 0.5;
        const expired = wake > L;
        // B is waiting for the lock and gets it as soon as A's lease expires.
        const bGet = expired ? L + 0.3 : writeA + 0.8, bRead = bGet + 0.5, bWrite = bGet + 2;
        const events = [];
        events.push({ t: readA, who: `A`, op: `read`, tok: 33 });
        events.push({ t: bRead, who: `B`, op: `read`, tok: 34 });
        events.push({ t: bWrite, who: `B`, op: `write`, tok: 34 });
        events.push({ t: writeA, who: `A`, op: `write`, tok: 33 });
        events.sort((a, b) => a.t - b.t);
        let maxTok = 0, corrupt = false, rejected = false;
        const lines = events.map(e => {
          let res = `ok`;
          if (fence && e.tok < maxTok) { res = `rejected`; rejected = true; }
          else { maxTok = Math.max(maxTok, e.tok); }
          if (!fence && e.who === `A` && e.op === `write` && expired) corrupt = true;
          return { ...e, res };
        });
        const tMax = Math.max(bWrite, writeA) + 2;
        const X = t => 100 + (t / tMax) * 470;
        const lane = { A: 40, lock: 88, B: 136, S: 184 };
        let s = ``;
        [[`A`, `client A`], [`lock`, `lock service`], [`B`, `client B`], [`S`, `storage`]].forEach(([k, lbl]) => {
          s += `<text class="svg-label" x="4" y="${lane[k] + 4}" style="font-size:12px">${lbl}</text><line x1="100" x2="575" y1="${lane[k]}" y2="${lane[k]}" style="stroke:var(--border)"/>`;
        });
        // Lock ownership
        const aEnd = expired ? L : writeA + 0.3;
        s += `<rect x="${X(0)}" y="${lane.lock - 9}" width="${X(aEnd) - X(0)}" height="18" rx="4" style="fill:var(--accent);opacity:.35"/><text x="${X(0) + 4}" y="${lane.lock + 4}" style="fill:var(--text);font-size:12px">A holds (33)</text>`;
        s += `<rect x="${X(bGet)}" y="${lane.lock - 9}" width="${X(bWrite + 0.3) - X(bGet)}" height="18" rx="4" style="fill:var(--accent-2);opacity:.4"/><text x="${X(bGet) + 4}" y="${lane.lock + 4}" style="fill:var(--text);font-size:12px">B (34)</text>`;
        if (expired) s += `<line x1="${X(L)}" x2="${X(L)}" y1="20" y2="200" style="stroke:var(--bad);stroke-dasharray:3 3"/><text x="${X(L) + 3}" y="16" style="fill:var(--bad);font-size:12px">lease expires</text>`;
        // A's pause
        if (P > 0) s += `<rect x="${X(pauseAt)}" y="${lane.A - 8}" width="${X(wake) - X(pauseAt)}" height="16" rx="4" style="fill:var(--warn);opacity:.35"/><text x="${(X(pauseAt) + X(wake)) / 2}" y="${lane.A + 4}" text-anchor="middle" style="fill:var(--text);font-size:12px">paused ${P} s</text>`;
        lines.forEach(e => {
          const y0 = lane[e.who], col = e.res === `rejected` ? `var(--bad)` : e.who === `A` ? `var(--accent)` : `var(--accent-2)`;
          s += `<line x1="${X(e.t)}" x2="${X(e.t)}" y1="${y0}" y2="${lane.S - 6}" style="stroke:${col};stroke-width:1.6;${e.op === `read` ? `stroke-dasharray:2 2` : ``}"/><circle cx="${X(e.t)}" cy="${lane.S}" r="5" style="fill:${col}"/>`;
        });
        q(`chart`).innerHTML = svgWrap(580, 210, s);
        q(`log`).innerHTML = `<table class="mini-table"><tr><th class="num">time</th><th>request</th><th class="num">token</th><th>result</th></tr>${lines.map(e => `<tr><td class="num">${round(e.t, 1)} s</td><td>${e.who} ${e.op}s the file</td><td class="num">${fence ? e.tok : `not sent`}</td><td>${e.res === `rejected` ? chip(`rejected: saw 34 already`, `no`) : chip(`ok`, `ok`)}</td></tr>`).join(``)}</table>`;
        let msg, cls;
        if (!expired) { msg = `A woke up after ${P} s, inside its ${L} s lease, wrote, and released the lock; B went after it. No overlap. But the lease only worked because the pause was shorter than the lease, and no lease length can be longer than every possible pause. Drag the pause past the lease.`; cls = `good`; }
        else if (corrupt) { msg = `A's lease expired at ${L} s while it was frozen, so B legitimately took the lock, read the file and wrote it. Then A woke at ${round(wake, 1)} s and wrote its result, computed from data it read before the pause, over B's work. Both clients believed they held the lock. Renewing the lease from a background thread doesn't help, because the whole process was paused.`; cls = `bad`; }
        else { msg = `Same pause, but every request to storage carries the lock's token, and storage refuses any token lower than the highest it has seen. B's requests registered 34, so A's late write with 33 was rejected and B's work survives. The lock service makes the token increase on every grant (an etcd revision or a ZooKeeper zxid works); the protected resource has to check it.`; cls = `good`; }
        if (expired && fence && !rejected) msg += ` (A's write landed before B touched storage, so it was accepted.)`;
        q(`note`).innerHTML = note(msg, cls);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { ttl: v => v + ` s`, pause: v => v + ` s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Seat holds: how long should a reservation last?
  // =====================================================================
  const HE_SEATS = 100, HE_MIN = 120, HE_STEP = 5 / 60;
  function heSim(st, ttl, seed) {
    const r = mulberry32(seed);
    const seats = Array.from({ length: HE_SEATS }, () => ({ s: `free`, until: 0, who: null }));
    let sold = 0, turnedAway = 0, turnedAwayStuck = 0, expiredMid = 0, abandoned = 0;
    const active = [];
    const series = [];
    const rate = st.demand;
    for (let t = 0; t < HE_MIN; t += HE_STEP) {
      // Arrivals this step (Poisson by thinning)
      let n = 0; const lam = rate * HE_STEP; let L = Math.exp(-lam), p = r(); while (p > L) { n++; p *= r(); }
      for (let i = 0; i < n; i++) {
        const free = seats.findIndex(x => x.s === `free`);
        if (free < 0) { turnedAway++; if (seats.some(x => x.s === `held` && x.who.gone)) turnedAwayStuck++; continue; }
        const gone = r() < st.abandon / 100;
        // checkout time: median ~3 min, long tail
        const need = Math.exp(Math.log(3) + 0.6 * (r() + r() + r() - 1.5) * 1.6);
        const b = { gone, done: t + need, seat: free };
        seats[free] = { s: `held`, until: ttl ? t + ttl : Infinity, who: b };
        active.push(b);
        if (gone) abandoned++;
      }
      // Holds expire
      seats.forEach(x => { if (x.s === `held` && t >= x.until) { if (!x.who.gone && x.who.done > t) { expiredMid++; x.who.lost = true; } x.s = `free`; x.who = null; } });
      // Buyers finish paying
      for (let i = active.length - 1; i >= 0; i--) {
        const b = active[i];
        if (b.gone || b.lost) { active.splice(i, 1); continue; }
        if (t >= b.done) { const x = seats[b.seat]; if (x.s === `held` && x.who === b) { x.s = `sold`; sold++; } active.splice(i, 1); }
      }
      const held = seats.filter(x => x.s === `held`).length;
      const stuck = seats.filter(x => x.s === `held` && x.who.gone).length;
      series.push([t, sold, held, stuck]);
    }
    const stuckEnd = seats.filter(x => x.s === `held` && x.who.gone).length;
    return { sold, turnedAway, turnedAwayStuck, expiredMid, abandoned, stuckEnd, series };
  }
  const HE_TTL = [[0, `never expire`], [2, `2 min`], [5, `5 min`], [10, `10 min`], [30, `30 min`]];
  D.ctHoldExpiry = {
    title: `Seat holds: how long should a reservation last?`,
    blurb: `${HE_SEATS} seats, two hours of sale. Each buyer who finds a free seat gets a hold on it and starts checkout, which takes about 3 minutes (some take much longer). Some buyers abandon the tab and never come back. A hold that never expires strands seats; one that expires too soon yanks seats from people still typing their card number.`,
    mount(el) {
      const st = { ttl: 10, abandon: 30, demand: 2 };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`hold expires after`, seg(`ttl`, HE_TTL, st.ttl))}</div>
        <div class="ctl-row">${ctl(`buyers who abandon checkout`, rng(`abandon`, 0, 60, 5, st.abandon))}${ctl(`demand`, seg(`demand`, [[1, `1 buyer / min`], [2, `2 / min`], [6, `6 / min`]], st.demand))}${againBtn}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Seats over the sale</h4><div data-k="chart"></div><div class="legend"><span><i class="sw line" style="background:var(--good)"></i>sold</span><span><i class="sw line" style="background:var(--accent)"></i>held</span><span><i class="sw line" style="background:var(--bad)"></i>held by someone who left</span></div></div>
          <div class="lab-panel"><h4>Every expiry setting, same buyers</h4><div data-k="tbl"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const all = HE_TTL.map(([v]) => ({ v, R: heSim(st, v, seed * 31 + 5) }));
        const R = all.find(x => x.v === st.ttl).R;
        const ax = axes({ x0: 40, x1: 370, y0: 180, y1: 12, dx0: 0, dx1: HE_MIN, dy0: 0, dy1: HE_SEATS, xTicks: [0, 30, 60, 90, 120], yTicks: [0, 25, 50, 75, 100], xFmt: v => v + `m`, xLabel: `minutes into the sale` });
        let s = ax.svg;
        const pts = i => R.series.filter((_, j) => j % 3 === 0).map(x => [ax.X(x[0]), ax.Y(x[i])]);
        s += `<path d="${path(pts(1))}" style="fill:none;stroke:var(--good);stroke-width:2.2"/>`;
        s += `<path d="${path(pts(2))}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        s += `<path d="${path(pts(3))}" style="fill:none;stroke:var(--bad);stroke-width:2"/>`;
        q(`chart`).innerHTML = svgWrap(390, 214, s);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>expiry</th><th class="num">sold</th><th class="num">stranded at end</th><th class="num">turned away</th><th class="num">expired mid-checkout</th></tr>${all.map(({ v, R: x }) => `<tr class="${v === st.ttl ? `new` : ``}"><td>${HE_TTL.find(o => o[0] === v)[1]}</td><td class="num">${x.sold}</td><td class="num" style="${x.stuckEnd ? `color:var(--bad);font-weight:700` : ``}">${x.stuckEnd}</td><td class="num">${x.turnedAway}</td><td class="num" style="${x.expiredMid > 3 ? `color:var(--warn);font-weight:700` : ``}">${x.expiredMid}</td></tr>`).join(``)}</table></div>`;
        let msg;
        if (st.ttl === 0) msg = `Without expiry, every abandoned checkout keeps its seat forever: ${R.stuckEnd} seats are held by people who left, and ${R.turnedAwayStuck} buyers were turned away while those dead holds sat there. Holds need a deadline, enforced by the data itself (an expires_at column checked in the query, or a TTL key), not by a cleanup job you hope runs.`;
        else if (st.ttl <= 2) msg = `Two minutes is shorter than many real checkouts: ${R.expiredMid} buyers lost their seat while still paying. Abandoned seats come back quickly, but the people you most want to serve get punished. Short holds also need a clear countdown in the UI.`;
        else msg = `A ${st.ttl}-minute hold covers nearly every honest checkout (${R.expiredMid} expired mid-payment) and returns abandoned seats to the pool. Longer holds strand seats for longer when demand is high; compare the turned-away column at high demand. Ticketing sites usually pick a few minutes and show a timer.`;
        q(`note`).innerHTML = note(msg, st.ttl === 0 ? `bad` : R.expiredMid > 3 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { abandon: v => v + `%` }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };
})();
