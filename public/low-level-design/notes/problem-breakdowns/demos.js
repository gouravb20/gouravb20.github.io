// LLD problem breakdown labs: Rate Limiter. Time is simulated, so every run is repeatable.
(function () {
  "use strict";
  const { esc, sum, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, fmtNum, fmtBytes, pct } = window.LabKit;
  const D = (window.DEMOS = window.DEMOS || {});
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });
  const poisson = (r, lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };

  // The limiter algorithms, mirroring the Java on the Solution tab. now is in ms.
  function tokenBucket(cap, perSec) {
    const s = new Map();
    return { name: `Token bucket`, try(id, now) {
      let b = s.get(id); if (!b) { b = { tokens: cap, last: now }; s.set(id, b); }
      b.tokens = Math.min(cap, b.tokens + (now - b.last) * perSec / 1000); b.last = now;
      if (b.tokens >= 1) { b.tokens -= 1; return { allowed: true, remaining: Math.floor(b.tokens), retry: null }; }
      return { allowed: false, remaining: 0, retry: Math.ceil((1 - b.tokens) / (perSec / 1000)) };
    }, state: id => { const b = s.get(id); return b ? `${round(b.tokens, 2)} tokens` : `none yet`; }, mem: () => 2 };
  }
  function slidingLog(max, win) {
    const s = new Map(); let peak = 0;
    return { name: `Sliding window log`, try(id, now) {
      let q = s.get(id); if (!q) { q = []; s.set(id, q); }
      while (q.length && q[0] <= now - win) q.shift();
      if (q.length < max) { q.push(now); peak = Math.max(peak, q.length); return { allowed: true, remaining: max - q.length, retry: null }; }
      return { allowed: false, remaining: 0, retry: q[0] + win - now };
    }, state: id => { const q = s.get(id); return q ? `${q.length} timestamp${q.length === 1 ? `` : `s`} in window` : `none yet`; }, mem: () => peak };
  }
  function fixedWindow(max, win) {
    const s = new Map();
    return { name: `Fixed window`, try(id, now) {
      const start = now - (now % win);
      let w = s.get(id); if (!w) { w = { start, count: 0 }; s.set(id, w); }
      if (w.start !== start) { w.start = start; w.count = 0; }
      if (w.count < max) { w.count++; return { allowed: true, remaining: max - w.count, retry: null }; }
      return { allowed: false, remaining: 0, retry: start + win - now };
    }, state: id => { const w = s.get(id); return w ? `${w.count} in window starting ${(w.start / 1000).toFixed(0)} s` : `none yet`; }, mem: () => 2 };
  }
  function slidingCounter(max, win) {
    const s = new Map();
    return { name: `Sliding window counter`, try(id, now) {
      const start = now - (now % win);
      let w = s.get(id); if (!w) { w = { start, cur: 0, prev: 0 }; s.set(id, w); }
      if (w.start !== start) { w.prev = start - w.start === win ? w.cur : 0; w.cur = 0; w.start = start; }
      const est = w.prev * (1 - (now - start) / win) + w.cur;
      if (est + 1 <= max) { w.cur++; return { allowed: true, remaining: Math.max(0, Math.floor(max - est - 1)), retry: null }; }
      return { allowed: false, remaining: 0, retry: Math.max(1, Math.ceil(start + win - now)) };
    }, state: () => ``, mem: () => 3 };
  }

  // =====================================================================
  // Problem tab - same traffic through four algorithms
  // =====================================================================
  D.algoCompare = {
    title: `Four algorithms, same limit, same traffic`,
    blurb: `One client sends requests for 20 seconds. Each algorithm is configured for the same nominal limit of N requests per second (the token bucket gets capacity N and refills at N per second). Compare how many requests each lets through, the most it accepts in any one-second span, and how much state it keeps.`,
    mount(el) {
      const st = { N: 10, load: 15, shape: `edge`, seed: 3 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`traffic`, seg(`shape`, [[`steady`, `steady`], [`bursty`, `bursts`], [`edge`, `bursts at window edges`]], st.shape))}${againBtn}</div>
        <div class="ctl-row">${ctl(`limit N (requests per second)`, rng(`N`, 2, 40, 1, st.N))}${ctl(`average offered load (requests per second)`, rng(`load`, 2, 80, 1, st.load))}</div>
        <div class="lab-panel"><h4>Accepted requests per 100 ms (grey = rejected)</h4><div data-k="chart"></div></div>
        <div class="lab-panel" style="margin-top:12px"><h4>Results</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const r = mulberry32(st.seed), times = [];
        for (let i = 0; i < 200; i++) {
          let lam = st.load * 0.1;
          if (st.shape === `bursty`) lam = (i % 30 < 5) ? st.load * 0.6 : st.load * 0.02;
          if (st.shape === `edge`) { const ph = i % 10; lam = (ph === 9 || ph === 0) ? st.load * 0.5 : 0; }
          const k = poisson(r, lam);
          for (let j = 0; j < k; j++) times.push(i * 100 + Math.floor(((j + 0.5) / k) * 100));
        }
        const algos = [tokenBucket(st.N, st.N), slidingLog(st.N, 1000), slidingCounter(st.N, 1000), fixedWindow(st.N, 1000)];
        const rows = algos.map(a => {
          const acc = [], bins = Array(200).fill(0), rej = Array(200).fill(0);
          times.forEach(t => { const res = a.try(`c`, t); if (res.allowed) { acc.push(t); bins[Math.floor(t / 100)]++; } else rej[Math.floor(t / 100)]++; });
          let peak = 0, lo = 0;
          for (let hi = 0; hi < acc.length; hi++) { while (acc[hi] - acc[lo] >= 1000) lo++; peak = Math.max(peak, hi - lo + 1); }
          return { a, accepted: acc.length, rejected: times.length - acc.length, peak, bins, rej };
        });
        const yMax = Math.max(2, ...rows.flatMap(x => x.bins.map((b, i) => b + x.rej[i])));
        let s = ``;
        rows.forEach((x, ri) => {
          const y0 = 10 + ri * 52;
          s += `<text x="0" y="${y0 + 12}" style="fill:var(--text);font-size:11px">${x.a.name}</text>`;
          x.bins.forEach((b, i) => {
            const h1 = (b / yMax) * 34, h2 = (x.rej[i] / yMax) * 34, xx = 150 + i * 3;
            if (b) s += `<rect x="${xx}" y="${y0 + 40 - h1}" width="2.4" height="${h1}" style="fill:var(--accent)"/>`;
            if (x.rej[i]) s += `<rect x="${xx}" y="${y0 + 40 - h1 - h2}" width="2.4" height="${h2}" style="fill:var(--text-muted);opacity:.45"/>`;
          });
          for (let sec = 0; sec <= 20; sec += 5) s += `<line x1="${150 + sec * 30}" x2="${150 + sec * 30}" y1="${y0 + 4}" y2="${y0 + 42}" style="stroke:var(--border)"/>`;
        });
        for (let sec = 0; sec <= 20; sec += 5) s += `<text x="${150 + sec * 30}" y="222" text-anchor="middle" class="svg-label">${sec} s</text>`;
        q(`chart`).innerHTML = svgWrap(760, 230, s);
        const memTxt = x => x.a.name === `Sliding window log` ? `up to ${x.a.mem()} timestamps` : `${x.a.mem()} numbers`;
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>algorithm</th><th class="num">accepted</th><th class="num">rejected</th><th class="num">most in any 1 s</th><th>state per client</th></tr>${rows.map(x => `<tr><td>${x.a.name}</td><td class="num">${x.accepted}</td><td class="num">${x.rejected}</td><td class="num">${x.peak > st.N ? chip(x.peak, `no`) : chip(x.peak, `ok`)}</td><td>${memTxt(x)}</td></tr>`).join(``)}</table></div>`;
        const fw = rows[3], tb = rows[0];
        let n = `Offered: ${times.length} requests. `;
        if (st.shape === `edge` && fw.peak > st.N) n += `Bursts straddle the one-second boundaries, so the fixed window accepts ${fw.peak} within one real second: its count resets at the boundary even though the client just sent a full window's worth. The sliding log never exceeds ${st.N}; the counter stays close. `;
        else n += `The sliding log is the reference: never more than ${st.N} in any second. `;
        n += `The token bucket can accept up to capacity + rate = ${2 * st.N} in a second after an idle period (this run: ${tb.peak}); set the capacity below the rate if bursts must be smaller. The log pays for exactness with up to N timestamps per client.`;
        q(`note`).innerHTML = note(n, fw.peak > st.N ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { N: v => v + `/s`, load: v => v + `/s` }, draw);
      onAgain(el, () => { st.seed = (st.seed * 31 + 7) % 100003; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Solution tab - drive the designed RateLimiter
  // =====================================================================
  const RULES = [
    { endpoint: `/search`, algo: `TokenBucket`, params: `capacity 5, refill 1/s`, make: () => tokenBucket(5, 1) },
    { endpoint: `/orders`, algo: `SlidingWindowLog`, params: `3 per 10 s`, make: () => slidingLog(3, 10000) },
    { endpoint: `(default)`, algo: `FixedWindow`, params: `4 per 10 s`, make: () => fixedWindow(4, 10000) }
  ];
  D.limiterPlayground = {
    title: `Drive the rate limiter`,
    blurb: `A small configuration is loaded: <code>/search</code> uses a token bucket (capacity 5, refill 1 per second), <code>/orders</code> a sliding window log (3 per 10 s), and anything else falls back to a fixed window (4 per 10 s). Send requests as different clients, move the clock forward, and read what <code>check(clientId, endpoint)</code> returns.`,
    mount(el) {
      const st = { client: `alice`, ep: `/search` };
      let now, limiters, log;
      const reset = () => { now = 0; limiters = { "/search": RULES[0].make(), "/orders": RULES[1].make(), "(default)": RULES[2].make() }; log = []; };
      const route = ep => limiters[ep] ? ep : `(default)`;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`client`, seg(`client`, [[`alice`, `alice`], [`bob`, `bob`]], st.client))}${ctl(`endpoint`, seg(`ep`, [[`/search`, `/search`], [`/orders`, `/orders`], [`/reports`, `/reports (no rule)`]], st.ep))}</div>
        <div class="ctl-row" style="gap:8px">
          <button class="lab-btn" data-act="send">check(client, endpoint)</button>
          <button class="lab-btn ghost" data-act="burst">Send 5 at once</button>
          <button class="lab-btn ghost" data-act="t1">Clock +1 s</button>
          <button class="lab-btn ghost" data-act="t5">Clock +5 s</button>
          <button class="lab-btn ghost" data-act="reset">Reset</button>
        </div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Calls (latest at the bottom)</h4><div data-k="log"></div></div>
          <div class="lab-panel"><h4>Configuration and state</h4><div data-k="state"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const send = () => {
        const key = route(st.ep), res = limiters[key].try(st.client, now);
        log.push({ t: now, client: st.client, ep: st.ep, algo: RULES.find(x => x.endpoint === key).algo, res });
      };
      const draw = () => {
        const rows = log.slice(-10).map((e, i, a) => `<tr${i === a.length - 1 ? ` class="new"` : ``}><td class="num">${(e.t / 1000).toFixed(0)} s</td><td>${e.client}</td><td>${e.ep}</td><td>${e.res.allowed ? chip(`allowed`, `ok`) : chip(`denied`, `no`)}</td><td class="num">${e.res.remaining}</td><td class="num">${e.res.retry == null ? `null` : e.res.retry + ` ms`}</td></tr>`).join(``);
        q(`log`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th class="num">time</th><th>client</th><th>endpoint</th><th>allowed</th><th class="num">remaining</th><th class="num">retryAfterMs</th></tr>${rows || `<tr><td colspan="6">No calls yet. Press check(client, endpoint).</td></tr>`}</table></div>`;
        q(`state`).innerHTML = `<div style="font-size:13px;margin-bottom:8px">Clock: <b>${(now / 1000).toFixed(0)} s</b></div>` + RULES.map(r => `<div style="margin-bottom:8px;font-size:12.5px"><b>${r.endpoint}</b> &middot; ${r.algo} (${r.params})<br><span class="muted">alice: ${limiters[r.endpoint].state(`alice`)} &middot; bob: ${limiters[r.endpoint].state(`bob`)}</span></div>`).join(``);
        const last = log[log.length - 1];
        let n;
        if (!last) n = `Each endpoint has its own limiter, and each limiter keeps separate state per client. Start by sending a few /search requests as alice.`;
        else if (last.res.allowed) n = `${last.ep === `/reports` ? `/reports has no rule, so the default fixed window decided. ` : ``}Allowed, with ${last.res.remaining} left for ${last.client} on ${last.ep}. retryAfterMs is null because the request went through.`;
        else n = `Denied: ${last.client} has used up ${last.ep === `/reports` ? `the default rule's` : last.ep + `'s`} quota. Retrying after ${last.res.retry} ms is the earliest moment it could succeed (${last.algo === `TokenBucket` ? `time to earn the missing fraction of a token` : last.algo === `SlidingWindowLog` ? `when the oldest request in the window expires` : `when the current window ends`}). The other client is unaffected: switch to ${last.client === `alice` ? `bob` : `alice`} and try.`;
        q(`note`).innerHTML = note(n, last && !last.res.allowed ? `warn` : `good`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`);
        if (!b) return;
        const a = b.dataset.act;
        if (a === `send`) send();
        else if (a === `burst`) for (let i = 0; i < 5; i++) send();
        else if (a === `t1`) now += 1000;
        else if (a === `t5`) now += 5000;
        else if (a === `reset`) reset();
        else return;
        draw();
      });
      wireSegs(el, st, draw);
      reset(); draw();
    }
  };

  // =====================================================================
  // Deep dive - concurrent requests against one bucket
  // =====================================================================
  function overshootTrial(r, threads, tokens, mode) {
    let shared = tokens, allowed = 0, retries = 0;
    const th = Array.from({ length: threads }, () => ({ pc: 0, seen: 0, done: false }));
    let owner = -1, live = threads, guard = 0;
    while (live > 0 && guard++ < 10000) {
      const i = Math.floor(r() * threads), t = th[i];
      if (t.done) continue;
      if (mode === `lock`) {
        if (owner !== -1 && owner !== i) continue;
        if (t.pc === 0) { owner = i; t.pc = 1; }
        else if (t.pc === 1) { t.seen = shared; t.pc = 2; }
        else { if (t.seen >= 1) { shared = t.seen - 1; allowed++; } owner = -1; t.done = true; live--; }
      } else if (mode === `cas`) {
        if (t.pc === 0) { t.seen = shared; t.pc = 1; }
        else if (t.seen < 1) { t.done = true; live--; }
        else if (shared === t.seen) { shared = t.seen - 1; allowed++; t.done = true; live--; }
        else { retries++; t.pc = 0; }
      } else {
        if (t.pc === 0) { t.seen = shared; t.pc = 1; }
        else { if (t.seen >= 1) { shared = t.seen - 1; allowed++; } t.done = true; live--; }
      }
    }
    return { allowed, retries };
  }
  D.concurrentOvershoot = {
    title: `Concurrent requests against one client's bucket`,
    blurb: `Several threads handle requests from the same client at the same moment, and the bucket has only a few tokens left. Each thread reads the token count and then writes it back minus one. Compare the plain version, a lock on the client's bucket, and a compare-and-set loop over 1,000 random interleavings.`,
    mount(el) {
      const st = { threads: 8, tokens: 3, mode: `none`, seed: 11 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`update`, seg(`mode`, [[`none`, `plain read then write`], [`lock`, `synchronized (bucket)`], [`cas`, `AtomicReference CAS loop`]], st.mode))}${againBtn}</div>
        <div class="ctl-row">${ctl(`concurrent requests`, rng(`threads`, 2, 32, 1, st.threads))}${ctl(`tokens left`, rng(`tokens`, 0, 10, 1, st.tokens))}</div>
        <div class="lab-panel"><h4>How many requests were allowed, across 1,000 interleavings</h4><div data-k="chart"></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const r = mulberry32(st.seed), N = 1000, hist = Array(st.threads + 1).fill(0);
        let over = 0, retries = 0;
        for (let i = 0; i < N; i++) { const x = overshootTrial(r, st.threads, st.tokens, st.mode); hist[x.allowed]++; if (x.allowed > st.tokens) over++; retries += x.retries; }
        const max = Math.max(...hist), bw = 700 / hist.length;
        let s = ``;
        hist.forEach((h, k) => {
          const bh = (h / max) * 130, x = 40 + k * bw;
          s += `<rect x="${x + 2}" y="${150 - bh}" width="${Math.max(2, bw - 4)}" height="${bh}" rx="2" style="fill:${k > st.tokens ? `var(--bad)` : `var(--good)`}"/>`;
          if (hist.length <= 20 || k % 2 === 0) s += `<text x="${x + bw / 2}" y="166" text-anchor="middle" class="svg-label">${k}</text>`;
        });
        s += `<text x="40" y="184" class="svg-label">requests allowed in a trial (red = more than the ${st.tokens} tokens available)</text>`;
        q(`chart`).innerHTML = svgWrap(760, 192, s);
        const worst = hist.reduce((m, h, k) => (h ? k : m), 0);
        q(`stats`).innerHTML = stat(`trials that let through too many`, pct(over / N, 1), over ? `bad` : `good`) + stat(`worst trial: allowed`, `${worst} of ${st.tokens}`, worst > st.tokens ? `bad` : `good`) + (st.mode === `cas` ? stat(`CAS retries per trial`, round(retries / N, 2), `warn`) : ``);
        let n;
        if (st.mode === `none`) n = `Refill-and-spend is a read-modify-write. Threads that read the same token count all see "enough" and all decrement from that stale value, so up to ${worst} requests passed with only ${st.tokens} tokens: ${pct(over / N, 1)} of trials overshoot. Single-threaded tests never show this.`;
        else if (st.mode === `lock`) n = `With <code>synchronized (bucket)</code> around refill and spend, one request at a time updates this client's bucket, so exactly min(requests, tokens) are allowed in every trial. Because the lock is per client, other clients never wait on it.`;
        else n = `A CAS loop reads an immutable state, computes the next one and swaps it only if nobody changed it in between; losers retry (${round(retries / N, 2)} retries per trial here). Never more than ${st.tokens} allowed, and no thread ever blocks.`;
        q(`note`).innerHTML = note(n, over ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { threads: v => v, tokens: v => v }, draw);
      onAgain(el, () => { st.seed = (st.seed * 31 + 5) % 100003; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Deep dive - memory per client and idle eviction
  // =====================================================================
  const BYTES = { bucket: 120, fixed: 120, counter: 130, logBase: 140, logPer: 24 };
  D.memoryEstimator = {
    title: `How much memory does per-client state take?`,
    blurb: `Every client ever seen leaves state in every limiter it touched. Estimate the heap used for a number of distinct clients, with and without evicting idle ones. Assumed sizes include the map entry and object headers on a 64-bit JVM: ~120 bytes per bucket or window, ~130 per sliding counter, and for a sliding log ~140 bytes plus ~24 per stored timestamp (a boxed Long in a deque). Treat them as rough.`,
    mount(el) {
      const st = { clients: 6, eps: 5, algo: `bucket`, limit: 100, fill: 0.5, active: 0.05 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`algorithm`, seg(`algo`, [[`bucket`, `token bucket`], [`fixed`, `fixed window`], [`counter`, `sliding counter`], [`log`, `sliding log`]], st.algo))}</div>
        <div class="ctl-row">${ctl(`distinct clients seen`, rng(`clients`, 3, 8, 0.25, st.clients))}${ctl(`endpoints each client uses`, rng(`eps`, 1, 20, 1, st.eps))}</div>
        <div class="ctl-row">${ctl(`limit per window (sliding log)`, rng(`limit`, 5, 10000, 5, st.limit))}${ctl(`how full a typical log is`, rng(`fill`, 0.05, 1, 0.05, st.fill))}${ctl(`clients active within the idle TTL`, rng(`active`, 0.001, 1, 0.001, st.active))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const clients = Math.pow(10, st.clients), per = st.algo === `log` ? BYTES.logBase + BYTES.logPer * st.limit * st.fill : BYTES[st.algo];
        const total = clients * st.eps * per, kept = total * st.active;
        const heapWarn = b => b > 8e9 ? `bad` : b > 1e9 ? `warn` : `good`;
        q(`stats`).innerHTML = stat(`bytes per client per endpoint`, fmtBytes(Math.round(per))) + stat(`state entries`, fmtNum(clients * st.eps)) + stat(`without eviction`, fmtBytes(total), heapWarn(total)) + stat(`with idle eviction`, fmtBytes(kept), heapWarn(kept));
        let n = `${fmtNum(clients)} clients on ${st.eps} endpoint${st.eps > 1 ? `s` : ``} leave ${fmtNum(clients * st.eps)} state objects. Without eviction that is ${fmtBytes(total)}, and it only grows: every new client ID adds more. Evicting clients idle longer than a TTL keeps only the ${pct(st.active, 1)} recently active: ${fmtBytes(kept)}. `;
        if (st.algo === `log`) n += `The sliding log stores a timestamp per accepted request, so its cost scales with the limit: at ${st.limit} per window it is ${round(per / BYTES.bucket, 0)}&times; a token bucket per client. For large limits, prefer the sliding window counter.`;
        else n += `For a token bucket, a client idle long enough to refill completely can be dropped with no effect on behaviour: recreating it full is identical.`;
        q(`note`).innerHTML = note(n, heapWarn(total) === `good` ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { clients: v => fmtNum(Math.pow(10, v)), eps: v => v, limit: v => v, fill: v => pct(v), active: v => pct(v, 1) }, draw);
      draw();
    }
  };
})();
