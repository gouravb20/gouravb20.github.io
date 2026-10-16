// Problem breakdown labs: Flash Sale (chapters 6-10)
(function () {
  "use strict";
  const { esc, clamp, sum, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, path, fmtNum, pct } = window.LabKit;
  const D = (window.DEMOS = window.DEMOS || {});
  const muted = s => `<span style="color:var(--text-muted)">${s}</span>`;
  const fmtT = s => !isFinite(s) ? `never` : s >= 3600 ? round(s / 3600, 1) + ` h` : s >= 60 ? round(s / 60, 1) + ` min` : s >= 1 ? round(s, 1) + ` s` : round(s * 1000, 0) + ` ms`;
  const gauss = r => { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pctl = (xs, p) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });

  // =====================================================================
  // Ch6 - Back-of-the-envelope estimator
  // =====================================================================
  D.flashEstimator = {
    title: `Back-of-the-envelope: how hard is the console launch?`,
    blurb: `Turn "10 million people want 20,000 consoles at 10:00" into the numbers that shape the design. Assumptions: the first seconds run at 3× the average rate over the arrival window; each user tries to reserve about 1.5 times; a locked row handles 1 / (lock time) updates per second; a Redis node handles the stated number of simple operations per second.`,
    mount(el) {
      const st = { users: 7, win: 60, rpu: 5, units: 4.3, lock: 1, redis: 100 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`users waiting`, rng(`users`, 5, 7.7, 0.05, st.users))}${ctl(`most arrive within`, rng(`win`, 5, 300, 5, st.win))}${ctl(`requests per user`, rng(`rpu`, 1, 20, 1, st.rpu))}</div>
        <div class="ctl-row">${ctl(`units in stock`, rng(`units`, 3, 5.3, 0.05, st.units))}${ctl(`row lock held for`, rng(`lock`, 0.2, 10, 0.1, st.lock))}${ctl(`Redis ops / s per node`, rng(`redis`, 20, 300, 10, st.redis))}</div>
        <div class="lab-panel"><h4>Peak rates vs what one row and one Redis node can take (log scale)</h4><div data-k="bars"></div><div class="stat-row" data-k="stats" style="margin-top:12px"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const U = Math.pow(10, st.users), N = Math.round(Math.pow(10, st.units));
        const avg = U * st.rpu / st.win, peak = avg * 3;
        const tries = U * 1.5 / st.win * 3;
        const rowCap = 1000 / st.lock, redisCap = st.redis * 1000;
        const sellRow = N / Math.min(rowCap, tries), sellRedis = N / Math.min(redisCap, tries);
        const backlog = Math.max(0, tries - rowCap) * sellRow;
        const lg = v => Math.log10(Math.max(1, v));
        q(`bars`).innerHTML = hbars([
          { label: `one locked row`, value: lg(rowCap), text: fmtNum(rowCap) + `/s`, cls: rowCap >= tries ? `good` : `bad` },
          { label: `one Redis node`, value: lg(redisCap), text: fmtNum(redisCap) + `/s`, cls: redisCap >= tries ? `good` : `warn` },
          { label: `reserve attempts, peak`, value: lg(tries), text: fmtNum(tries) + `/s`, cls: `warn` },
          { label: `all requests, peak`, value: lg(peak), text: fmtNum(peak) + `/s`, cls: `bad` }
        ], 8);
        const success = N / U;
        q(`stats`).innerHTML = stat(`average requests / s`, fmtNum(avg)) + stat(`peak requests / s`, fmtNum(peak), peak > 2e5 ? `bad` : `warn`) + stat(`users who get one`, pct(Math.min(1, success), success < 0.01 ? 2 : 1), success < 0.05 ? `warn` : `good`) + stat(`users told "no"`, fmtNum(Math.max(0, U - N))) + stat(`sell-out through one row`, fmtT(sellRow), sellRow > 10 ? `bad` : `warn`) + stat(`queued on the row at sell-out`, fmtNum(backlog), backlog > 1e4 ? `bad` : `good`) + stat(`sell-out through Redis`, fmtT(sellRedis), `good`);
        let n = `${fmtNum(U)} users making ${st.rpu} requests each over ${st.win} s is about ${fmtNum(avg)} requests per second, and ${fmtNum(peak)} at the start. That's CDN and cache territory: the servers behind them should only see the small share of requests that change state.`;
        n += success < 0.01 ? ` Only ${pct(success, 2)} of users can succeed, so the system's main job is saying "no" quickly.` : ` About ${pct(Math.min(1, success), 1)} of users can succeed.`;
        n += tries > rowCap ? ` Reserve attempts peak around ${fmtNum(tries)}/s against ${fmtNum(rowCap)}/s for one locked row: by the time the last unit goes, ~${fmtNum(backlog)} requests are queued behind it. A Redis gate at ${fmtNum(redisCap)}/s sells out in ${fmtT(sellRedis)}.` : ` At this scale one locked row keeps up with reserve attempts; the simple design is enough.`;
        q(`note`).innerHTML = note(n, tries > rowCap ? `warn` : `good`);
      };
      wireRanges(el, st, { users: v => fmtNum(Math.pow(10, v)), win: v => v + ` s`, rpu: v => v, units: v => fmtNum(Math.round(Math.pow(10, v))), lock: v => round(v, 1) + ` ms`, redis: v => v + `K` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - Oversell race: read-then-write vs atomic approaches
  // =====================================================================
  const RACE = { naive: `read, check, write`, cond: `conditional UPDATE`, lock: `SELECT ... FOR UPDATE`, opt: `optimistic version` };
  function raceRun(mode, st, seed) {
    const r = mulberry32(seed);
    const n = st.buyers;
    const arr = Array.from({ length: n }, () => r() * st.spread).sort((a, b) => a - b);
    const gaps = arr.map(() => st.gap * (0.5 + r()));
    let stock = st.stock, granted = 0, soldOut = 0, falseNo = 0, retries = 0, stmts = 0;
    const lat = [];
    const out = () => ({ granted, oversold: Math.max(0, granted - st.stock), soldOut, falseNo, retries, stmts, lat, final: stock });
    if (mode === `lock`) {
      let free = 0;
      for (let i = 0; i < n; i++) {
        const start = Math.max(arr[i], free);
        const has = stock > 0;
        stmts += has ? 3 : 2;
        if (has) { stock--; granted++; } else soldOut++;
        free = start + (has ? gaps[i] : gaps[i] * 0.5);
        lat.push(free - arr[i]);
      }
      return out();
    }
    if (mode === `cond`) {
      const ev = arr.map((a, i) => ({ t: a + gaps[i] * 0.5, i })).sort((x, y) => x.t - y.t);
      for (const e of ev) { stmts++; if (stock > 0) { stock--; granted++; } else soldOut++; lat.push(gaps[e.i]); }
      return out();
    }
    const q = arr.map((a, i) => ({ t: a, t0: a, i, kind: `read`, tries: 0, v: 0, ver: 0 }));
    let ver = 0;
    while (q.length) {
      let k = 0;
      for (let j = 1; j < q.length; j++) if (q[j].t < q[k].t) k = j;
      const e = q[k]; q[k] = q[q.length - 1]; q.pop();
      stmts++;
      if (e.kind === `read`) {
        e.v = stock; e.ver = ver;
        if (e.v <= 0) { soldOut++; lat.push(e.t - e.t0); continue; }
        e.kind = `write`; e.t += st.gap * (0.5 + r()); q.push(e);
      } else if (mode === `naive`) {
        stock = e.v - 1; granted++; lat.push(e.t - e.t0);
      } else if (e.ver === ver) {
        stock = e.v - 1; ver++; granted++; lat.push(e.t - e.t0);
      } else if (e.tries >= 3) {
        if (stock > 0) falseNo++; else soldOut++;
        lat.push(e.t - e.t0);
      } else {
        retries++; e.tries++; e.kind = `read`; e.t += 1 + r() * 2; q.push(e);
      }
    }
    return out();
  }
  D.oversellRace = {
    title: `The oversell race: four ways to take the last units`,
    blurb: `A burst of buyers tries to reserve a small stock at once. Each request reads, waits a few milliseconds (network and application time), then writes. Compare checking stock in application code with three database-safe approaches on the same random arrivals. The optimistic version retries up to 3 times after a conflict, then gives up.`,
    mount(el) {
      const st = { stock: 20, buyers: 200, gap: 10, spread: 100, mode: `naive` };
      let seed = 11;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`units in stock`, rng(`stock`, 5, 100, 5, st.stock))}${ctl(`buyers`, rng(`buyers`, 50, 500, 10, st.buyers))}</div>
        <div class="ctl-row">${ctl(`read-to-write gap`, rng(`gap`, 1, 50, 1, st.gap))}${ctl(`buyers arrive within`, rng(`spread`, 10, 2000, 10, st.spread))}${againBtn}</div>
        <div class="ctl-row">${ctl(`look closer at`, seg(`mode`, Object.entries(RACE), st.mode))}</div>
        <div class="lab-panel" style="overflow-x:auto"><h4>Same arrivals, four implementations</h4><div data-k="tbl"></div></div>
        <div class="lab-grid even" style="margin-top:14px">
          <div class="lab-panel"><h4>Holds granted vs stock</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>Selected approach</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = {}; for (const m of Object.keys(RACE)) R[m] = raceRun(m, st, seed);
        const row = (label, f) => `<tr><td>${label}</td>${Object.keys(RACE).map(m => `<td class="num" style="${m === st.mode ? `font-weight:700` : ``}">${f(R[m], m)}</td>`).join(``)}</tr>`;
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th></th>${Object.entries(RACE).map(([m, l]) => `<th class="num" style="${m === st.mode ? `color:var(--accent)` : ``}">${l}</th>`).join(``)}</tr>
          ${row(`holds granted`, x => x.granted)}
          ${row(`oversold`, x => x.oversold ? `<span class="chip no">${x.oversold}</span>` : `<span class="chip ok">0</span>`)}
          ${row(`told "sold out" correctly`, x => x.soldOut)}
          ${row(`told "sold out" with stock left`, x => x.falseNo ? `<span class="chip no">${x.falseNo}</span>` : `0`)}
          ${row(`retries`, x => x.retries)}
          ${row(`DB statements`, x => x.stmts)}
          ${row(`median latency`, x => fmtT(pctl(x.lat, 0.5) / 1000))}
          ${row(`p99 latency`, x => fmtT(pctl(x.lat, 0.99) / 1000))}</table>`;
        const x = R[st.mode];
        q(`bars`).innerHTML = hbars([
          { label: `units in stock`, value: st.stock, text: st.stock, cls: `muted` },
          { label: `holds granted`, value: x.granted, text: x.granted, cls: x.oversold ? `bad` : `good` },
          { label: `stock left`, value: Math.max(0, x.final), text: x.final, cls: x.final > 0 && x.oversold ? `bad` : `muted` }
        ], Math.max(st.stock, x.granted));
        q(`stats`).innerHTML = stat(`oversold`, x.oversold, x.oversold ? `bad` : `good`) + stat(`false "sold out"`, x.falseNo, x.falseNo ? `bad` : `good`) + stat(`p99 latency`, fmtT(pctl(x.lat, 0.99) / 1000), pctl(x.lat, 0.99) > 1000 ? `bad` : `good`) + stat(`statements per buyer`, round(x.stmts / st.buyers, 2));
        let n;
        if (st.mode === `naive`) n = x.oversold ? `Checking stock in application code granted <strong>${x.granted} holds for ${st.stock} units</strong>: many requests read the same value inside the same ${st.gap} ms gap and all decided there was stock. Worse, the counter ends at ${x.final}, so nothing looks wrong. Spread the arrivals over a few seconds and the race gets rarer, but it never goes away.` : `With arrivals this spread out, the race happened not to fire. Shrink the arrival window: a flash sale is exactly the case where everyone arrives together.`;
        else if (st.mode === `cond`) n = `The conditional update checks and decrements in one statement under the row lock, so exactly ${st.stock} holds are granted and everyone else gets a clean "sold out". One statement per buyer and low latency: the right baseline. Its limit is the row lock itself, which the next chapter measures.`;
        else if (st.mode === `lock`) n = `SELECT ... FOR UPDATE is also correct, but the lock is held across the read-to-write gap, so buyers queue: p99 latency is ${fmtT(pctl(x.lat, 0.99) / 1000)} against ${fmtT(pctl(R.cond.lat, 0.99) / 1000)} for the conditional update. Keep locked sections tiny.`;
        else n = `Optimistic concurrency never oversells, but under a burst almost every write conflicts: ${x.retries} retries, and ${x.falseNo} buyers gave up and were told "sold out" while units were still available. Conflicts aren't rare here, they're the norm, which is the opposite of what optimistic locking assumes.`;
        q(`note`).innerHTML = note(n, (st.mode === `naive` && x.oversold) || x.falseNo ? `bad` : st.mode === `lock` ? `warn` : `good`);
      };
      onAgain(el, () => { seed = (seed * 7 + 3) % 100000; draw(); });
      wireSegs(el, st, draw);
      wireRanges(el, st, { gap: v => v + ` ms`, spread: v => fmtT(v / 1000) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Hot row: queueing, timeouts and the Redis gate
  // =====================================================================
  function hotSim(st) {
    const lam = Math.pow(10, st.rate), rush = 30, dt = 0.05, T = 60;
    const mu = st.appr === `row` ? 1000 / st.lock : st.appr === `buckets` ? st.nb * 1000 / st.lock * 0.85 : 100000;
    let stock = st.units, q = [], wins = 0, doomed = 0, timedOut = 0, toStock = 0, edgeNo = 0, sellT = null, maxQ = 0, maxWait = 0;
    const series = [];
    for (let i = 0; i < T / dt; i++) {
      const t = i * dt;
      const arr = t < rush ? lam * dt : 0;
      if (st.flag === `on` && stock <= 1e-9) { edgeNo += arr + sum(q.map(c => c.n)); q = []; }
      else if (arr > 0) q.push({ t, n: arr });
      while (q.length && t - q[0].t > st.timeout) { const c = q.shift(); timedOut += c.n; if (stock > 1e-9) toStock += c.n; }
      let cap = mu * dt;
      while (cap > 1e-9 && q.length) {
        const c = q[0], take = Math.min(c.n, cap);
        cap -= take; c.n -= take;
        const w = Math.min(take, Math.max(0, stock));
        stock -= w; wins += w; doomed += take - w;
        maxWait = Math.max(maxWait, t - c.t);
        if (stock <= 1e-9 && sellT === null) sellT = t;
        if (c.n <= 1e-9) q.shift();
      }
      const ql = sum(q.map(c => c.n));
      maxQ = Math.max(maxQ, ql);
      series.push([t, ql, Math.max(0, stock)]);
    }
    return { mu, wins, doomed, timedOut, toStock, edgeNo, sellT, maxQ, maxWait, series, dbStmts: st.appr === `redis` ? wins : wins + doomed };
  }
  D.hotRow = {
    title: `The hot row: queues, timeouts and moving the gate`,
    blurb: `Reserve attempts arrive at a steady rate for the first 30 seconds of the sale. Each must pass through the gate one at a time. Compare one locked database row, the stock split into N bucket rows (85% efficient because buckets drain unevenly), and an atomic Redis counter at ~100K operations per second where only winners write to the database. Requests that wait longer than the client timeout give up.`,
    mount(el) {
      const st = { rate: 5.3, units: 20000, lock: 1, timeout: 5, appr: `row`, nb: 16, flag: `off` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`reserve attempts / s`, rng(`rate`, 3, 6.5, 0.05, st.rate))}${ctl(`units`, rng(`units`, 1000, 100000, 1000, st.units))}${ctl(`row lock held for`, rng(`lock`, 0.2, 5, 0.1, st.lock))}</div>
        <div class="ctl-row">${ctl(`gate`, seg(`appr`, [[`row`, `one row`], [`buckets`, `N bucket rows`], [`redis`, `Redis counter`]], st.appr))}${ctl(`buckets`, rng(`nb`, 2, 64, 1, st.nb))}</div>
        <div class="ctl-row">${ctl(`client timeout`, rng(`timeout`, 1, 30, 1, st.timeout))}${ctl(`sold-out flag at the edge`, seg(`flag`, [[`off`, `off`], [`on`, `on`]], st.flag))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Requests waiting at the gate</h4><div data-k="qchart"></div></div>
          <div class="lab-panel"><h4>Units left</h4><div data-k="schart"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><div class="stat-row" data-k="stats"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const chart = (pts, yMax, fmt, cls) => {
        const ax = axes({ x0: 52, x1: 370, y0: 150, y1: 12, dx0: 0, dx1: 60, dy0: 0, dy1: yMax, xTicks: [0, 15, 30, 45, 60], yTicks: [0, yMax / 2, yMax], xFmt: v => v + ` s`, yFmt: fmt });
        return svgWrap(390, 180, ax.svg + `<path d="${path(pts.map(([x, y]) => [ax.X(x), ax.Y(Math.min(yMax, y))]))}" style="fill:none;stroke:${cls};stroke-width:2"/>`);
      };
      const draw = () => {
        const R = hotSim(st);
        const lam = Math.pow(10, st.rate);
        const qMax = Math.max(10, R.maxQ);
        q(`qchart`).innerHTML = chart(R.series.map(s => [s[0], s[1]]), qMax, v => fmtNum(v, 0), `var(--bad, #f87171)`);
        q(`schart`).innerHTML = chart(R.series.map(s => [s[0], s[2]]), st.units, v => fmtNum(v, 0), `var(--accent)`);
        const total = lam * 30;
        q(`stats`).innerHTML = stat(`gate capacity`, fmtNum(R.mu) + `/s`, R.mu >= lam ? `good` : `bad`) + stat(`sold out after`, R.sellT === null ? `not in 60 s` : fmtT(R.sellT), R.sellT === null ? `bad` : R.sellT > 10 ? `warn` : `good`) + stat(`most requests queued`, fmtNum(R.maxQ, 0), R.maxQ > 1e4 ? `bad` : `good`) + stat(`longest wait`, fmtT(R.maxWait), R.maxWait > 2 ? `bad` : `good`) + stat(`timed out with units left`, fmtNum(R.toStock, 0), R.toStock > 0 ? `bad` : `good`) + stat(`timed out in total`, pct(R.timedOut / total, 1), R.timedOut / total > 0.2 ? `bad` : `good`) + stat(`answered at the edge`, pct(R.edgeNo / total, 1)) + stat(`database writes`, fmtNum(R.dbStmts, 0), R.dbStmts > 10 * st.units ? `warn` : `good`);
        let n;
        if (R.mu < lam) {
          n = `The gate takes ${fmtNum(R.mu)} attempts/s while ${fmtNum(lam)} arrive, so a queue builds from the first second (peak ${fmtNum(R.maxQ, 0)}). `;
          n += R.toStock > 0 ? `${fmtNum(R.toStock, 0)} people timed out <strong>while units were still available</strong>: whether you win depends on where you landed in the queue, not when you clicked.` : `Nobody timed out with units left, but waits reached ${fmtT(R.maxWait)}.`;
          if (st.flag === `off`) n += ` After the sell-out the queue keeps draining doomed attempts through the gate: ${fmtNum(R.doomed, 0)} wasted lock acquisitions. Turn on the sold-out flag to answer them at the edge.`;
        } else {
          n = `The gate (${fmtNum(R.mu)}/s) keeps up with ${fmtNum(lam)} attempts/s: no queue, no timeouts, sold out in ${fmtT(R.sellT ?? 0)}.`;
          n += st.appr === `redis` ? ` Only the ${fmtNum(R.wins, 0)} winners write to the database; ${fmtNum(R.doomed + R.edgeNo, 0)} losers never touch it.` : ``;
          if (st.appr === `buckets`) n += ` Buckets bought throughput, but the next lab shows the price: buckets empty at different times.`;
        }
        q(`note`).innerHTML = note(n, R.mu < lam ? (R.toStock > 0 ? `bad` : `warn`) : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { rate: v => fmtNum(Math.pow(10, v)) + `/s`, units: v => fmtNum(v), lock: v => round(v, 1) + ` ms`, timeout: v => v + ` s`, nb: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Stock buckets: uneven drain and false "sold out"
  // =====================================================================
  function bucketSim(st, seed) {
    const r = mulberry32(seed), N = st.nb, U = st.units;
    const b = Array.from({ length: N }, (_, i) => Math.floor(U / N) + (i < U % N ? 1 : 0));
    let left = U, attempts = 0, trips = 0, falseNo = 0, firstFalseLeft = null, snap = null;
    const live = b.map((_, i) => i), cap = U * 40;
    while (left > 0 && attempts < cap) {
      attempts++;
      if (st.pol === `route`) {
        const k = Math.floor(r() * live.length), i = live[k];
        trips++; b[i]--; left--;
        if (b[i] === 0) { if (!snap) snap = b.slice(); live[k] = live[live.length - 1]; live.pop(); }
        continue;
      }
      const tries = st.pol === `one` ? 1 : st.tries;
      let got = false;
      for (let j = 0; j < tries; j++) {
        const i = Math.floor(r() * N);
        trips++;
        if (b[i] > 0) { b[i]--; left--; got = true; if (b[i] === 0 && !snap) snap = b.slice(); break; }
      }
      if (!got) { falseNo++; if (firstFalseLeft === null) firstFalseLeft = left; }
    }
    return { attempts, trips, falseNo, firstFalseLeft, snap: snap || b.slice(), left, sold: U - left };
  }
  D.inventoryBuckets = {
    title: `Stock buckets: more throughput, uneven sell-out`,
    blurb: `Split the stock evenly across N buckets and send each reserve attempt to a random bucket. Each bucket handles ~1,000 claims per second (1 ms lock), so N buckets handle ~N × 1,000. But random routing drains buckets unevenly. Compare giving up on an empty bucket, retrying other random buckets, and routing only to buckets the router knows are non-empty.`,
    mount(el) {
      const st = { units: 20000, nb: 16, pol: `one`, tries: 3 };
      let seed = 5;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`units`, rng(`units`, 1000, 40000, 1000, st.units))}${ctl(`buckets`, rng(`nb`, 1, 64, 1, st.nb))}${againBtn}</div>
        <div class="ctl-row">${ctl(`when the chosen bucket is empty`, seg(`pol`, [[`one`, `say "sold out"`], [`retry`, `retry other buckets`], [`route`, `route to non-empty only`]], st.pol))}${ctl(`tries`, rng(`tries`, 2, 8, 1, st.tries))}</div>
        <div class="lab-panel"><h4>Units left in each bucket when the first one runs dry</h4><div data-k="cols"></div></div>
        <div class="lab-panel" style="margin-top:14px"><div class="stat-row" data-k="stats"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = bucketSim(st, seed);
        const N = st.nb, per = Math.ceil(st.units / N), W = 760, H = 150, bw = (W - 40) / N;
        let s = `<line x1="30" x2="${W - 10}" y1="${H}" y2="${H}" style="stroke:var(--border)"/>`;
        R.snap.forEach((v, i) => {
          const h = (v / per) * (H - 20), x = 30 + i * bw;
          s += `<rect x="${round(x + bw * 0.12, 1)}" y="${round(H - h, 1)}" width="${round(bw * 0.76, 1)}" height="${round(Math.max(h, 0.5), 1)}" rx="2" style="fill:${v === 0 ? `var(--bad, #f87171)` : `var(--accent)`};opacity:${v === 0 ? 1 : 0.8}"/>`;
          if (N <= 24) s += `<text class="svg-label" x="${round(x + bw / 2, 1)}" y="${round(H - h - 4, 1)}" text-anchor="middle">${fmtNum(v, 0)}</text>`;
        });
        s += `<text class="svg-label" x="30" y="12">each bucket started with ~${fmtNum(per, 0)}</text>`;
        q(`cols`).innerHTML = svgWrap(W, H + 10, s);
        const leftAtFirst = sum(R.snap);
        q(`stats`).innerHTML = stat(`throughput`, `~${fmtNum(N * 1000)}/s`, N > 1 ? `good` : `warn`) + stat(`units left when first bucket emptied`, `${fmtNum(leftAtFirst, 0)} (${pct(leftAtFirst / st.units, 0)})`) + stat(`false "sold out" answers`, fmtNum(R.falseNo, 0), R.falseNo ? `bad` : `good`) + stat(`first false "no" with units left`, R.firstFalseLeft === null ? `none` : fmtNum(R.firstFalseLeft, 0), R.firstFalseLeft ? `bad` : `good`) + stat(`round trips per unit sold`, round(R.trips / Math.max(1, R.sold), 2), R.trips / Math.max(1, R.sold) > 1.5 ? `warn` : `good`) + stat(`units never sold`, fmtNum(R.left, 0), R.left ? `bad` : `good`);
        let n;
        if (N === 1) n = `One bucket is just the single hot row: exact, no false "sold out", and about 1,000 claims per second. Add buckets to see the trade.`;
        else if (st.pol === `one`) n = `${N} buckets give ~${N}× the throughput, but the first bucket ran dry with ${pct(leftAtFirst / st.units, 0)} of the stock still elsewhere. From then on, anyone routed to an empty bucket hears "sold out": ${fmtNum(R.falseNo, 0)} false answers in this run, the first with ${fmtNum(R.firstFalseLeft ?? 0, 0)} units left.`;
        else if (st.pol === `retry`) n = `Retrying ${st.tries} random buckets cuts false "sold out" answers to ${fmtNum(R.falseNo, 0)}, at ${round(R.trips / Math.max(1, R.sold), 2)} round trips per sale. Near the end most buckets are empty, so retries get both more frequent and less effective.`;
        else n = `Routing only to buckets the router knows still have stock (a small bitmap, updated when a bucket empties) gives ${N}× throughput with no false "sold out" and exactly one round trip per sale. The price is keeping that bitmap correct, which is easy when it's in the same Redis as the buckets.`;
        q(`note`).innerHTML = note(n, R.falseNo ? (st.pol === `one` ? `bad` : `warn`) : `good`);
      };
      onAgain(el, () => { seed = (seed * 13 + 7) % 100000; draw(); });
      wireSegs(el, st, draw);
      wireRanges(el, st, { units: v => fmtNum(v), nb: v => v, tries: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch9 - Hold TTL, abandonment and expiry mechanism
  // =====================================================================
  function holdSim(st) {
    const r = mulberry32(17), M = 2000, ttl = st.ttl * 60, sig = 0.8;
    const delay = () => st.mech === `lazy` ? 0 : st.mech === `queue` ? 1 : r() * st.sweep;
    const times = [];
    let holds = 0, cut = 0, aband = 0, dead = 0;
    for (let u = 0; u < M; u++) {
      let t = 0;
      for (let k = 0; k < 300; k++) {
        holds++;
        if (r() < st.ab / 100) { aband++; const d = ttl + delay(); t += d; dead += d; continue; }
        const p = st.med * Math.exp(sig * gauss(r));
        if (p > ttl) { cut++; const d = ttl + delay(); t += d; dead += d; continue; }
        t += p; break;
      }
      times.push(t);
    }
    times.sort((a, b) => a - b);
    return { times, holds, cut, aband, dead, M, payers: holds - aband };
  }
  D.holdTimeout = {
    title: `Hold duration, abandonment and how holds expire`,
    blurb: `All 20,000 units are reserved the moment the sale opens, and a waitlist means a released unit is claimed again immediately. Each holder either abandons (never pays) or pays after a random time (lognormal around the median below; a few take much longer, e.g. 3-D Secure). Payers slower than the hold lose it. Compare releasing expired holds lazily, through a per-hold delayed message (~1 s) or with a sweeper job. Simulated on 2,000 units.`,
    mount(el) {
      const st = { ttl: 10, ab: 25, med: 90, mech: `sweep`, sweep: 60 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`hold lasts`, rng(`ttl`, 1, 20, 1, st.ttl))}${ctl(`holders who abandon`, rng(`ab`, 0, 70, 5, st.ab))}${ctl(`median time to pay`, rng(`med`, 20, 300, 10, st.med))}</div>
        <div class="ctl-row">${ctl(`expiry`, seg(`mech`, [[`lazy`, `lazy (on read)`], [`queue`, `delayed message`], [`sweep`, `sweeper job`]], st.mech))}${ctl(`sweep every`, rng(`sweep`, 5, 300, 5, st.sweep))}</div>
        <div class="lab-panel"><h4>Share of units sold over time</h4><div data-k="chart"></div></div>
        <div class="lab-panel" style="margin-top:14px"><div class="stat-row" data-k="stats"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = holdSim(st);
        const T = R.times, p50 = pctl(T, 0.5), p90 = pctl(T, 0.9), p99 = pctl(T, 0.99);
        const xMax = clamp(Math.ceil(p99 / 60 / 5) * 5 + 5, 10, 180);
        const ax = axes({ x0: 46, x1: 760, y0: 170, y1: 12, dx0: 0, dx1: xMax, dy0: 0, dy1: 1, xTicks: [0, xMax / 4, xMax / 2, (3 * xMax) / 4, xMax].map(v => round(v, 0)), yTicks: [0, 0.5, 0.9, 1], xFmt: v => v + ` min`, yFmt: v => pct(v) });
        const pts = [];
        for (let i = 0; i <= 200; i++) { const x = (xMax * i) / 200; let lo = 0, hi = T.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] <= x * 60) lo = m + 1; else hi = m; } pts.push([ax.X(x), ax.Y(lo / T.length)]); }
        let s = ax.svg + `<line x1="${ax.X(st.ttl)}" x2="${ax.X(st.ttl)}" y1="12" y2="170" style="stroke:var(--warn);stroke-dasharray:4 3"/><text class="svg-label" x="${ax.X(st.ttl) + 4}" y="26">hold length</text>`;
        s += `<path d="${path(pts)}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        q(`chart`).innerHTML = svgWrap(780, 200, s);
        const cutRate = R.cut / Math.max(1, R.payers);
        q(`stats`).innerHTML = stat(`genuine payers who ran out of time`, pct(cutRate, 1), cutRate > 0.05 ? `bad` : cutRate > 0.01 ? `warn` : `good`) + stat(`half the units sold by`, fmtT(p50)) + stat(`90% sold by`, fmtT(p90), p90 > 1800 ? `warn` : `good`) + stat(`99% sold by`, fmtT(p99), p99 > 3600 ? `bad` : `warn`) + stat(`holds per unit sold`, round(R.holds / R.M, 2), R.holds / R.M > 2 ? `warn` : `good`) + stat(`unit-minutes in dead holds, per unit`, round(R.dead / R.M / 60, 1));
        let n = `With a ${st.ttl}-minute hold and ${st.ab}% abandonment, each unit needs ${round(R.holds / R.M, 2)} holds on average before someone pays, so 10% of units are still unsold after ${fmtT(p90)}. Everyone told "sold out" at 10:00 could have bought those.`;
        if (cutRate > 0.05) n += ` The hold is too short for the payment-time distribution: ${pct(cutRate, 1)} of people who were going to pay lost their unit mid-checkout, the worst experience in the system.`;
        else if (st.ttl >= 15 && st.ab >= 20) n += ` The hold is generous: almost no genuine payer is cut off, but abandoned holds keep units hidden for ${st.ttl} minutes each. Reducing abandonment (limits, bot checks) helps more than tuning the TTL.`;
        if (st.mech === `sweep` && st.sweep >= 60) n += ` A ${st.sweep}-second sweep adds ~${round(st.sweep / 2, 0)} s on average to every recycle; try the delayed message.`;
        if (st.mech === `lazy`) n += ` Lazy expiry recycles instantly, but only because every claim checks expires_at; the displayed stock count is wrong until someone looks.`;
        q(`note`).innerHTML = note(n, cutRate > 0.05 ? `bad` : p90 > 1800 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { ttl: v => v + ` min`, ab: v => v + `%`, med: v => fmtT(v), sweep: v => v + ` s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch10 - Waiting room vs letting everyone in
  // =====================================================================
  function wrSim(st, room) {
    const U = Math.pow(10, st.users), m = st.arrive, cap = st.cap * 1000, units = Math.round(Math.pow(10, st.units)), buy = 0.6, T = 600;
    let stock = units, sellT = null, errors = 0, retry = 0, Q = 0, maxQ = 0, maxWait = 0, qAtSell = 0, peak = 0, reqs = 0;
    const load = [];
    for (let t = 0; t < T; t++) {
      const arr = U * (Math.exp(-t / m) - Math.exp(-(t + 1) / m));
      if (!room) {
        const off = stock > 0 ? arr + retry : arr * 0.05;
        reqs += off; peak = Math.max(peak, off / cap);
        const good = off <= cap ? off : cap * clamp(1.2 - 0.2 * off / cap, 0.3, 1);
        const fail = off - good;
        errors += fail;
        retry = st.retry === `on` && stock > 0 ? fail * 0.7 : 0;
        if (stock > 0) { const b = Math.min(stock, good * buy); stock -= b; if (stock <= 1e-9 && sellT === null) sellT = t + 1; }
        load.push(off / cap);
      } else {
        if (stock <= 1e-9) { load.push(0); continue; }
        Q += arr;
        const a = Math.min(Q, cap * 0.9);
        Q -= a; reqs += a;
        const b = Math.min(stock, a * buy); stock -= b;
        if (stock <= 1e-9 && sellT === null) { sellT = t + 1; qAtSell = Q; }
        maxQ = Math.max(maxQ, Q); maxWait = Math.max(maxWait, Q / (cap * 0.9));
        peak = Math.max(peak, a / cap);
        load.push(a / cap);
      }
    }
    return { sellT, errors, maxQ, maxWait, qAtSell, peak, load, reqs, units };
  }
  D.waitingRoom = {
    title: `Waiting room: admitting at capacity vs letting everyone in`,
    blurb: `Users arrive in a burst that decays over time (a mean arrival delay below). Without a waiting room every user hits the backend; above capacity, throughput collapses (to 30% at worst) as timeouts and overload pile up, and failed users retry. With a waiting room, users queue at the edge and are admitted at 90% of capacity. 60% of admitted users go on to reserve.`,
    mount(el) {
      const st = { users: 7, arrive: 20, cap: 20, units: 4.3, retry: `on` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`users`, rng(`users`, 5, 7.5, 0.05, st.users))}${ctl(`mean arrival delay after opening`, rng(`arrive`, 2, 120, 1, st.arrive))}</div>
        <div class="ctl-row">${ctl(`backend capacity, users / s`, rng(`cap`, 2, 200, 1, st.cap))}${ctl(`units`, rng(`units`, 3, 5.3, 0.05, st.units))}${ctl(`failed users retry`, seg(`retry`, [[`on`, `yes`], [`off`, `no`]], st.retry))}</div>
        <div class="lab-panel"><h4>Load offered to the backend, as a multiple of its capacity (first 60 s)</h4><div data-k="chart"></div>
          <div class="legend"><span><i class="sw line" style="background:var(--bad, #f87171)"></i>no waiting room</span><span><i class="sw line" style="background:var(--good, #4ade80)"></i>waiting room</span></div></div>
        <div class="lab-panel" style="overflow-x:auto;margin-top:14px"><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const A = wrSim(st, false), B = wrSim(st, true);
        const yMax = 10;
        const ax = axes({ x0: 46, x1: 760, y0: 170, y1: 12, dx0: 0, dx1: 60, dy0: 0, dy1: yMax, xTicks: [0, 10, 20, 30, 40, 50, 60], yTicks: [0, 1, 5, 10], xFmt: v => v + ` s`, yFmt: v => v + `×` });
        const line = (L, c) => `<path d="${path(L.slice(0, 61).map((v, i) => [ax.X(i), ax.Y(Math.min(yMax, v))]))}" style="fill:none;stroke:${c};stroke-width:2"/>`;
        let s = ax.svg + `<line x1="${ax.X(0)}" x2="${ax.X(60)}" y1="${ax.Y(1)}" y2="${ax.Y(1)}" style="stroke:var(--warn);stroke-dasharray:4 3"/><text class="svg-label" x="${ax.X(60) - 4}" y="${ax.Y(1) - 4}" text-anchor="end">capacity</text>`;
        s += line(A.load, `var(--bad, #f87171)`) + line(B.load, `var(--good, #4ade80)`);
        q(`chart`).innerHTML = svgWrap(780, 200, s);
        const r = (label, a, b) => `<tr><td>${label}</td><td class="num">${a}</td><td class="num">${b}</td></tr>`;
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th></th><th class="num">no waiting room</th><th class="num">waiting room</th></tr>
          ${r(`peak load on the backend`, `<span class="chip ${A.peak > 1 ? `no` : `ok`}">${round(A.peak, 1)}× capacity</span>`, `<span class="chip ok">${round(B.peak, 2)}× capacity</span>`)}
          ${r(`failed requests (errors, timeouts)`, fmtNum(A.errors, 1), `0`)}
          ${r(`sold out after`, A.sellT === null ? `not in 10 min` : fmtT(A.sellT), B.sellT === null ? `not in 10 min` : fmtT(B.sellT))}
          ${r(`longest wait in the queue`, muted(`n/a`), fmtT(B.maxWait))}
          ${r(`still queued at sell-out, told at once`, muted(`n/a`), fmtNum(B.qAtSell, 1))}
          ${r(`requests that reached the backend`, fmtNum(A.reqs, 1), fmtNum(B.reqs, 1))}</table>`;
        let n;
        if (A.peak <= 1) n = `Arrivals never exceed capacity here, so a waiting room adds little. Increase users or shorten the arrival delay to see the cliff.`;
        else {
          n = `Without a waiting room, the backend is offered ${round(A.peak, 0)}× its capacity at the start and fails ${fmtNum(A.errors, 1)} requests${st.retry === `on` ? `; retries keep the load high long after the arrival peak` : ``}. With one, the backend runs at 90% of capacity with no errors, the stock is gone in ${fmtT(B.sellT ?? 0)}, and ${fmtNum(B.qAtSell, 1)} queued users are told "sold out" immediately instead of hammering a dead sale.`;
          if (A.sellT !== null && B.sellT !== null && A.sellT > B.sellT) n += ` Note that the sale also finishes sooner with the waiting room (${fmtT(B.sellT)} vs ${fmtT(A.sellT)}): overload wastes capacity.`;
        }
        q(`note`).innerHTML = note(n, A.peak > 1 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { users: v => fmtNum(Math.pow(10, v)), arrive: v => v + ` s`, cap: v => v + `K/s`, units: v => fmtNum(Math.round(Math.pow(10, v))) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch10 - Fairness models vs bots
  // =====================================================================
  D.fairnessModes = {
    title: `Who gets the consoles? Fairness models against bots`,
    blurb: `Humans and bot-controlled accounts compete for the stock. Bots arrive in the first milliseconds. Without a per-account limit a bot account buys up to 4 units; a human buys 1. First come, first served admits in arrival order; a randomised start shuffles everyone who joined before the sale opened; a raffle draws from pre-registered entries after verification removes the share of bot accounts set below. Expected values, not a simulation.`,
    mount(el) {
      const st = { humans: 6.3, bots: 20000, units: 20000, limit: `on`, verify: 80 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`humans`, rng(`humans`, 4.5, 7, 0.05, st.humans))}${ctl(`bot accounts`, rng(`bots`, 0, 200000, 1000, st.bots))}${ctl(`units`, rng(`units`, 1000, 100000, 1000, st.units))}</div>
        <div class="ctl-row">${ctl(`one unit per account`, seg(`limit`, [[`on`, `on`], [`off`, `off (up to 4)`]], st.limit))}${ctl(`raffle verification catches`, rng(`verify`, 0, 99, 1, st.verify))}</div>
        <div class="lab-panel"><h4>Share of units that go to humans</h4><div data-k="bars"></div></div>
        <div class="lab-panel" style="overflow-x:auto;margin-top:14px"><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const H = Math.round(Math.pow(10, st.humans)), B = st.bots, U = st.units, m = st.limit === `on` ? 1 : 4;
        const bd = B * m;
        const fifoB = Math.min(U, bd);
        const randB = bd + H <= U ? bd : U * bd / (bd + H);
        const be = B * (1 - st.verify / 100);
        const rafB = be + H <= U ? be : U * be / (be + H);
        const M = [[`First come, first served`, fifoB], [`Randomised start`, randB], [`Pre-registered raffle`, rafB]].map(([l, b]) => { const h = Math.min(H, U - b); return { l, b, h, share: h / U, chance: h / H }; });
        q(`bars`).innerHTML = hbars(M.map(x => ({ label: x.l, value: x.share, text: pct(x.share, 1), cls: x.share > 0.9 ? `good` : x.share > 0.5 ? `warn` : `bad` })), 1);
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th></th><th class="num">units to bots</th><th class="num">units to humans</th><th class="num">a human's chance</th></tr>${M.map(x => `<tr><td>${x.l}</td><td class="num">${fmtNum(x.b, 1)}</td><td class="num">${fmtNum(x.h, 1)}</td><td class="num">${pct(x.chance, x.chance < 0.01 ? 2 : 1)}</td></tr>`).join(``)}</table>`;
        let n;
        if (B === 0) n = `With no bots, every model gives humans all ${fmtNum(U)} units; they differ only in who among the humans wins (fastest connection vs luck).`;
        else {
          n = `First come, first served hands bots ${pct(fifoB / U, 0)} of the stock because they're always first in line.`;
          n += ` A randomised start removes the speed advantage, so bots get roughly their share of entries: ${pct(randB / U, 1)}.`;
          n += ` A raffle with verification that removes ${st.verify}% of bot accounts cuts that to ${pct(rafB / U, 1)}.`;
          if (st.limit === `off`) n += ` Without a per-account limit each bot account takes up to 4 units, multiplying its share; turning the limit on is the cheapest fix of all.`;
        }
        q(`note`).innerHTML = note(n, M[0].share < 0.5 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { humans: v => fmtNum(Math.round(Math.pow(10, v))), bots: v => fmtNum(v), units: v => fmtNum(v), verify: v => v + `%` }, draw);
      draw();
    }
  };
})();
