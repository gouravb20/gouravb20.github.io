// Core concepts labs, part 3: caching, sharding, consistent hashing, CAP, numbers (chapters 12-18)
(function () {
  "use strict";
  const { esc, clamp, sum, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, path, fmtNum, fmtBytes, pct } = window.LabKit;
  const D = window.DEMOS;
  const PAL = [`var(--accent)`, `var(--accent-2)`, `var(--accent-3)`, `#a78bfa`, `#f472b6`, `#4ade80`, `#f87171`, `#facc15`];
  const ms = v => v >= 1000 ? round(v / 1000, 2) + ` s` : v >= 10 ? Math.round(v) + ` ms` : round(v, 2) + ` ms`;
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const h32 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; };
  const zipfCdf = (n, s) => { const c = new Float64Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc += 1 / Math.pow(i + 1, s); c[i] = acc; } for (let i = 0; i < n; i++) c[i] /= acc; return c; };
  const zipfPick = (cdf, u) => { let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } return lo; };

  // =====================================================================
  // Ch12 - Cache-aside: hit ratio, latency and database load
  // =====================================================================
  const CA_KEYS = 100000, CA_DB = 30, CA_CACHE = 1, CA_DB_CAP = 5000;
  const caCdfs = {};
  const caCdf = s => caCdfs[s] || (caCdfs[s] = zipfCdf(CA_KEYS, s));
  D.cacheAside = {
    title: `Cache-aside: how much cache do you need?`,
    blurb: `${fmtNum(CA_KEYS)} user profiles, read with a skewed popularity (Zipf: a few profiles are read far more than the rest). With cache-aside, a hit costs ~${CA_CACHE} ms from Redis and a miss costs a ${CA_DB} ms database query plus filling the cache. Choose how much of the data the cache holds and how skewed traffic is; the cache is assumed to keep the most popular keys (what LRU and LFU approximate).`,
    mount(el) {
      const st = { size: 1, skew: 1, qps: 20000 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`cache holds (% of keys)`, rng(`size`, -1, 1.7, 0.1, 0))}${ctl(`popularity skew`, seg(`skew`, [[0.6, `mild`], [0.8, `moderate`], [1, `typical (Zipf 1.0)`], [1.2, `extreme`]], st.skew))}${ctl(`profile reads / s`, rng(`qps`, 1000, 100000, 1000, st.qps))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Hit ratio vs cache size</h4><div data-k="chart"></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const cdf = caCdf(st.skew);
        const frac = Math.pow(10, st.size) / 100;
        const k = Math.max(1, Math.round(CA_KEYS * frac));
        const hit = cdf[k - 1];
        const lat = hit * CA_CACHE + (1 - hit) * (CA_CACHE + CA_DB);
        const dbq = st.qps * (1 - hit);
        const a = axes({ x0: 46, x1: 500, y0: 190, y1: 12, dx0: 0.1, dx1: 50, dy0: 0, dy1: 1, xLog: true, xTicks: [0.1, 1, 10, 50], yTicks: [0, 0.25, 0.5, 0.75, 1], xFmt: v => v + `%`, yFmt: v => pct(v), xLabel: `cache size (% of keys)` });
        let s = a.svg;
        const pts = [];
        for (let e = -1; e <= Math.log10(50) + 1e-9; e += 0.05) { const f = Math.pow(10, e); pts.push([a.X(f), a.Y(cdf[Math.max(1, Math.round(CA_KEYS * f / 100)) - 1])]); }
        s += `<path d="${path(pts)}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        s += `<circle cx="${a.X(frac * 100)}" cy="${a.Y(hit)}" r="5" style="fill:var(--accent-3)"/>`;
        q(`chart`).innerHTML = svgWrap(520, 220, s);
        q(`stats`).innerHTML = stat(`keys cached`, fmtNum(k)) + stat(`memory (1 KB values)`, fmtBytes(k * 1000)) + stat(`hit ratio`, pct(hit, 1), hit > 0.9 ? `good` : hit < 0.6 ? `bad` : ``) + stat(`average read latency`, ms(lat)) + stat(`database queries / s`, fmtNum(dbq), dbq > CA_DB_CAP ? `bad` : `good`) + stat(`database load vs no cache`, pct(1 - hit, 1));
        let n = `Holding ${pct(frac, frac < 0.01 ? 1 : 0)} of the profiles serves ${pct(hit, 1)} of reads from memory, because popular keys dominate traffic. The database only sees the ${pct(1 - hit, 1)} that miss: ${fmtNum(dbq)} queries per second instead of ${fmtNum(st.qps)}.`;
        if (dbq > CA_DB_CAP) n += ` That's still above the ~${fmtNum(CA_DB_CAP)} queries per second this database handles comfortably, so grow the cache, add read replicas, or reduce misses.`;
        if (st.skew < 0.8) n += ` With mild skew, popularity is spread out, so a small cache helps much less; caching pays off most when a few keys are hot.`;
        q(`note`).innerHTML = note(n, dbq > CA_DB_CAP ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { size: v => { const f = Math.pow(10, v); return (f < 1 ? round(f, 2) : round(f, 1)) + `%`; }, qps: v => fmtNum(v) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch12 - Cache write patterns compared
  // =====================================================================
  const CP_PAT = { asideDel: `cache-aside, delete on write`, asideTtl: `cache-aside, TTL only`, through: `write-through`, behind: `write-behind` };
  function cpModel(st, p) {
    const DB_W = 10, DB_R = 30, C = 1, hit = 0.9, ttl = 60;
    const w = st.wph / 3600;
    const staleTtl = w > 0 ? clamp(1 - (1 - Math.exp(-w * ttl)) / (w * ttl), 0, 1) : 0;
    const writesPerSec = st.ops * st.wshare / 100;
    const keysPerFlush = st.flush * writesPerSec * Math.exp(-w * st.flush);
    return {
      asideDel: { wlat: DB_W + C, rlat: hit * C + (1 - hit) * (C + DB_R), stale: `~0% (race window)`, staleV: 0.001, lost: 0, dbw: writesPerSec, cold: `data that was read` },
      asideTtl: { wlat: DB_W, rlat: hit * C + (1 - hit) * (C + DB_R), stale: pct(staleTtl, 1), staleV: staleTtl, lost: 0, dbw: writesPerSec, cold: `data that was read` },
      through: { wlat: C + DB_W, rlat: 0.97 * C + 0.03 * (C + DB_R), stale: `~0%`, staleV: 0.001, lost: 0, dbw: writesPerSec, cold: `every written key` },
      behind: { wlat: C, rlat: 0.97 * C + 0.03 * (C + DB_R), stale: `DB lags ${st.flush} s`, staleV: 0, lost: writesPerSec * st.flush, dbw: Math.min(writesPerSec, keysPerFlush / st.flush || writesPerSec), cold: `every written key` }
    }[p];
  }
  D.cachePatterns = {
    title: `Cache patterns: write latency, freshness and durability`,
    blurb: `A service handles a mix of reads and writes on cached data. Compare how each pattern behaves: what a write costs, how often readers see stale data, how much is lost if the cache node crashes, and what lands in the cache. Assumed: database write 10 ms, database read 30 ms, cache 1 ms, 90% hit ratio for cache-aside, 60 s TTL.`,
    mount(el) {
      const st = { pat: `asideDel`, wph: 6, wshare: 10, ops: 10000, flush: 2 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`pattern`, seg(`pat`, Object.keys(CP_PAT).map(k => [k, CP_PAT[k]]), st.pat))}</div>
        <div class="ctl-row">${ctl(`writes per key per hour`, rng(`wph`, 0, 120, 1, st.wph))}${ctl(`share of ops that are writes`, rng(`wshare`, 1, 50, 1, st.wshare))}${ctl(`write-behind flush interval`, rng(`flush`, 0.5, 30, 0.5, st.flush))}</div>
        <div class="lab-panel"><h4>Comparison</h4><div data-k="tbl"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>How the selected pattern flows</h4><div data-k="flow"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const FLOW = {
        asideDel: [`Read: GET cache; on miss SELECT from DB, SET cache with TTL, return.`, `Write: UPDATE DB, then DELETE the cache key. Next read reloads it.`],
        asideTtl: [`Read: GET cache; on miss SELECT from DB, SET cache with TTL.`, `Write: UPDATE DB only. The cached copy stays until its TTL expires.`],
        through: [`Write: SET cache, and the cache layer synchronously writes the DB before acknowledging.`, `Read: GET cache (almost always warm).`],
        behind: [`Write: SET cache and acknowledge immediately; the cache queues the change.`, `Every flush interval, queued changes are written to the DB in a batch (repeated writes to a key are coalesced).`]
      };
      const draw = () => {
        const keys = Object.keys(CP_PAT);
        const M = keys.map(k => ({ k, m: cpModel(st, k) }));
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>pattern</th><th class="num">write</th><th class="num">read (avg)</th><th>stale reads</th><th class="num">lost if cache dies</th><th>cache holds</th></tr>${M.map(({ k, m }) => `<tr class="${k === st.pat ? `new` : ``}"><td>${CP_PAT[k]}</td><td class="num">${ms(m.wlat)}</td><td class="num">${ms(m.rlat)}</td><td>${m.stale}</td><td class="num" style="${m.lost ? `color:var(--bad);font-weight:700` : ``}">${m.lost ? fmtNum(m.lost) + ` writes` : `0`}</td><td>${m.cold}</td></tr>`).join(``)}</table></div><div class="cs-note">${fmtNum(st.ops)} ops/s, so ${fmtNum(st.ops * st.wshare / 100)} writes per second.</div>`;
        q(`flow`).innerHTML = `<ol style="margin:0 0 0 18px">${FLOW[st.pat].map(f => `<li>${f}</li>`).join(``)}</ol>`;
        const m = cpModel(st, st.pat);
        const N = {
          asideDel: `The default. Writes pay the database plus a cache delete, reads are fast on hits, and a cache crash loses nothing because the database is the source of truth. Staleness is limited to a brief race between the database write and the delete.`,
          asideTtl: `Skipping invalidation and relying on the TTL is simpler, but with ${st.wph} writes per key per hour about ${pct(m.staleV, 1)} of reads return an outdated value. Fine for view counts or recommendations; not for anything a user just edited.`,
          through: `Every write updates both, so reads are warm and fresh, but writes wait for the database and the cache fills with keys that may never be read. It's still two writes: if one fails, they disagree until repaired.`,
          behind: `Writes are as fast as the cache (${ms(m.wlat)}) and repeated writes to a key are coalesced before reaching the database, but if the cache node crashes, up to ${fmtNum(m.lost)} acknowledged writes (${st.flush} s worth) are gone. Use it for metrics and counters, never for payments.`
        };
        q(`note`).innerHTML = note(N[st.pat], st.pat === `behind` || (st.pat === `asideTtl` && m.staleV > 0.05) ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { wph: v => v, wshare: v => v + `%`, flush: v => v + ` s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch13 - Eviction policies on different access patterns
  // =====================================================================
  const EV_KEYS = 2000, EV_LEN = 20000;
  const EV_POL = { lru: `LRU`, lfu: `LFU`, fifo: `FIFO` };
  function evTrace(wl, seed) {
    const r = mulberry32(seed * 7 + (wl === `shift` ? 1 : wl === `scan` ? 2 : 0));
    const cdf = zipfCdf(EV_KEYS, 1);
    const tr = new Int32Array(EV_LEN);
    let scanPos = 0;
    for (let i = 0; i < EV_LEN; i++) {
      let k = zipfPick(cdf, r());
      if (wl === `shift` && i >= EV_LEN / 2) k = (k + 1000) % EV_KEYS;
      if (wl === `scan` && (i % 4000) >= 3000) k = EV_KEYS + (scanPos++);
      tr[i] = k;
    }
    return tr;
  }
  function evRun(tr, cap, pol) {
    const hitsAt = new Uint8Array(tr.length);
    let hits = 0;
    if (pol === `lru` || pol === `fifo`) {
      const m = new Map();
      for (let i = 0; i < tr.length; i++) {
        const k = tr[i];
        if (m.has(k)) { hits++; hitsAt[i] = 1; if (pol === `lru`) { m.delete(k); m.set(k, 1); } }
        else { if (m.size >= cap) m.delete(m.keys().next().value); m.set(k, 1); }
      }
    } else {
      const cnt = new Map(), freq = new Map();
      for (let i = 0; i < tr.length; i++) {
        const k = tr[i];
        freq.set(k, (freq.get(k) || 0) + 1);
        if (cnt.has(k)) { hits++; hitsAt[i] = 1; cnt.set(k, freq.get(k)); }
        else {
          if (cnt.size >= cap) { let mk = null, mv = Infinity; for (const [kk, v] of cnt) if (v < mv) { mv = v; mk = kk; } cnt.delete(mk); }
          cnt.set(k, freq.get(k));
        }
      }
    }
    const roll = [];
    const W = 1000;
    for (let i = W; i <= tr.length; i += 250) { let h = 0; for (let j = i - W; j < i; j++) h += hitsAt[j]; roll.push([i, h / W]); }
    return { rate: hits / tr.length, roll };
  }
  D.evictionPolicies = {
    title: `Eviction policies: LRU vs LFU vs FIFO`,
    blurb: `A cache with room for a fraction of ${fmtNum(EV_KEYS)} keys replays ${fmtNum(EV_LEN)} requests. Try a <strong>steady</strong> skewed workload, one where the popular set <strong>shifts</strong> halfway through (yesterday's trending posts go cold), and one with periodic <strong>scans</strong> that touch many keys once (a batch job or crawler). The chart shows the hit ratio over the last 1,000 requests.`,
    mount(el) {
      const st = { wl: `steady`, cap: 10 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`workload`, seg(`wl`, [[`steady`, `steady popularity`], [`shift`, `popularity shifts`], [`scan`, `periodic scans`]], st.wl))}${ctl(`cache size (% of keys)`, rng(`cap`, 1, 40, 1, st.cap))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Rolling hit ratio</h4><div data-k="chart"></div><div class="legend">${Object.keys(EV_POL).map((p, i) => `<span><i class="sw line" style="background:${PAL[i]}"></i>${EV_POL[p]}</span>`).join(``)}</div></div>
          <div class="lab-panel"><h4>Overall hit ratio</h4><div data-k="bars"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const tr = evTrace(st.wl, 1);
        const cap = Math.round(EV_KEYS * st.cap / 100);
        const res = Object.keys(EV_POL).map(p => ({ p, r: evRun(tr, cap, p) }));
        const a = axes({ x0: 40, x1: 500, y0: 190, y1: 12, dx0: 0, dx1: EV_LEN, dy0: 0, dy1: 1, xTicks: [0, 5000, 10000, 15000, 20000], yTicks: [0, 0.5, 1], xFmt: v => fmtNum(v), yFmt: v => pct(v) });
        let s = a.svg;
        if (st.wl === `shift`) s += `<line x1="${a.X(EV_LEN / 2)}" x2="${a.X(EV_LEN / 2)}" y1="12" y2="190" style="stroke:var(--bad);stroke-dasharray:4 3"/><text class="svg-label" x="${a.X(EV_LEN / 2) + 4}" y="24">popular set changes</text>`;
        res.forEach((x, i) => { s += `<path d="${path(x.r.roll.map(([t, v]) => [a.X(t), a.Y(v)]))}" style="fill:none;stroke:${PAL[i]};stroke-width:2"/>`; });
        q(`chart`).innerHTML = svgWrap(520, 215, s);
        const best = res.reduce((b, x) => x.r.rate > b.r.rate ? x : b, res[0]);
        q(`bars`).innerHTML = hbars(res.map((x, i) => ({ label: EV_POL[x.p], value: x.r.rate, max: 1, text: pct(x.r.rate, 1), cls: x === best ? `good` : `muted` })), 1);
        const get = p => res.find(x => x.p === p).r.rate;
        const lfu = get(`lfu`), lru = get(`lru`), fifo = get(`fifo`);
        const N = {
          steady: lfu > lru ? `With stable popularity, LFU leads (${pct(lfu, 1)}) because it keeps the keys that are consistently hot; LRU (${pct(lru, 1)}) is close behind and simpler. FIFO (${pct(fifo, 1)}) evicts popular keys just because they were inserted long ago.` : `With stable popularity and this much room, the policies converge (LRU ${pct(lru, 1)}, LFU ${pct(lfu, 1)}, FIFO ${pct(fifo, 1)}): the hot set fits whatever you evict.`,
          shift: lru > lfu ? `When the popular set changes, LRU recovers within a few hundred requests, but LFU's old counters keep yesterday's keys pinned and its hit ratio stays low (${pct(lfu, 1)} overall vs LRU's ${pct(lru, 1)}). Real LFU implementations decay counts over time to fix this.` : `Watch the second half of the chart: LRU adapts to the new popular set quickly while LFU's old counters keep yesterday's keys pinned for a while. Real LFU implementations decay counts over time to fix this.`,
          scan: lfu > lru ? `Each scan touches 1,000 keys once. LRU treats them as recently used and evicts the hot set, so its hit ratio dips after every scan; LFU ignores one-hit keys and keeps the hot set (${pct(lfu, 1)} vs ${pct(lru, 1)}). This is why databases use scan-resistant variants like LRU-K or 2Q.` : `Each scan touches 1,000 keys once and pushes hot keys out of LRU and FIFO, visible as dips in the chart. Scan-resistant variants like LRU-K or 2Q only admit keys to the main cache after a second access.`
        };
        q(`note`).innerHTML = note(N[st.wl] + ` Size matters as much as policy: with skewed traffic, a cache of ${st.cap}% of keys already catches most requests.`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { cap: v => v + `%` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch13 - Cache stampede on a hot key
  // =====================================================================
  const CS_TICK = 10, CS_DUR = 30000, CS_TTL = 10000;
  function csSim(st, mode) {
    const per = st.qps * CS_TICK / 1000;
    let acc = 0, validUntil = 1000, rebuildingUntil = -1, refreshAt = validUntil - 1500;
    const inflight = [];
    const series = [];
    let dbq = 0, peak = 0, expiries = 0;
    const lat = new Map();
    const addLat = (v, c) => { const b = Math.round(v); lat.set(b, (lat.get(b) || 0) + c); };
    for (let t = 0; t < CS_DUR; t += CS_TICK) {
      for (let i = inflight.length - 1; i >= 0; i--) if (inflight[i].end <= t) inflight.splice(i, 1);
      const cur = sum(inflight.map(x => x.n));
      const dur = st.rebuild * (1 + cur / 200);
      acc += per;
      const n = Math.floor(acc); acc -= n;
      if (mode === `early` && t >= refreshAt && rebuildingUntil < t) { inflight.push({ end: t + dur, n: 1 }); dbq++; rebuildingUntil = t + dur; validUntil = t + dur + CS_TTL; refreshAt = validUntil - 1500 - Math.random() * 500; }
      if (t < validUntil) addLat(1, n);
      else if (mode === `none`) {
        if (n) { inflight.push({ end: t + dur, n }); dbq += n; addLat(dur, n); }
        if (rebuildingUntil < t) { rebuildingUntil = t + dur; expiries++; }
        if (t + CS_TICK >= rebuildingUntil && rebuildingUntil > 0 && inflight.length) { validUntil = rebuildingUntil + CS_TTL; }
      } else {
        if (rebuildingUntil < t) { inflight.push({ end: t + dur, n: 1 }); dbq++; rebuildingUntil = t + dur; expiries++; }
        addLat(rebuildingUntil - t, n);
        if (t + CS_TICK >= rebuildingUntil) validUntil = rebuildingUntil + CS_TTL;
      }
      const now = sum(inflight.map(x => x.n));
      peak = Math.max(peak, now);
      if (t % 100 === 0) series.push([t, now]);
    }
    const tot = sum([...lat.values()]);
    const sorted = [...lat.entries()].sort((a, b) => a[0] - b[0]);
    const pc = p => { let c = 0; for (const [v, k] of sorted) { c += k; if (c >= p * tot) return v; } return 0; };
    return { series, dbq, peak, expiries: Math.max(1, expiries), p99: pc(0.99), p999: pc(0.999) };
  }
  D.cacheStampede = {
    title: `Cache stampede: one hot key expires`,
    blurb: `A hot key (say, the home page feed) is cached with a ${CS_TTL / 1000} s TTL. Rebuilding it takes a database query, which gets slower the more queries are running at once. When it expires, what happens to the requests that arrive before it's rebuilt? Compare doing nothing, <strong>request coalescing</strong> (one rebuild, everyone else waits for it) and <strong>early refresh</strong> (a background rebuild shortly before expiry, with a little jitter).`,
    mount(el) {
      const st = { mode: `none`, qps: 5000, rebuild: 200 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`strategy`, seg(`mode`, [[`none`, `nothing (every miss queries the DB)`], [`coalesce`, `request coalescing`], [`early`, `early refresh`]], st.mode))}</div>
        <div class="ctl-row">${ctl(`requests / s for this key`, rng(`qps`, 100, 20000, 100, st.qps))}${ctl(`rebuild query time`, rng(`rebuild`, 20, 1000, 10, st.rebuild))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Database queries in flight for this key</h4><div data-k="chart"></div></div>
          <div class="lab-panel"><h4>Result (30 s)</h4><div class="stat-row" data-k="stats"></div><h4 style="margin-top:10px">DB queries by strategy</h4><div data-k="cmp"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const LBL = { none: `nothing`, coalesce: `coalescing`, early: `early refresh` };
      const draw = () => {
        const R = csSim(st, st.mode);
        const yMax = Math.max(4, R.peak) * 1.1;
        const a = axes({ x0: 46, x1: 500, y0: 190, y1: 12, dx0: 0, dx1: CS_DUR, dy0: 0, dy1: yMax, xTicks: [0, 10000, 20000, 30000], yTicks: [0, Math.round(yMax / 2), Math.round(yMax)], xFmt: v => v / 1000 + `s`, yFmt: v => fmtNum(v, 0) });
        let s = a.svg + `<path d="${path(R.series.map(([t, v]) => [a.X(t), a.Y(v)]))}" style="fill:none;stroke:var(--accent-3);stroke-width:1.8"/>`;
        q(`chart`).innerHTML = svgWrap(520, 215, s);
        q(`stats`).innerHTML = stat(`DB queries for this key`, fmtNum(R.dbq), R.dbq > 20 ? `bad` : `good`) + stat(`peak concurrent DB queries`, fmtNum(R.peak), R.peak > 50 ? `bad` : ``) + stat(`p99 user latency`, ms(R.p99)) + stat(`p99.9 user latency`, ms(R.p999));
        const all = Object.keys(LBL).map(m => ({ m, r: csSim(st, m) }));
        const lg = v => Math.log10(1 + v);
        const mx = Math.max(...all.map(x => lg(x.r.dbq)));
        q(`cmp`).innerHTML = hbars(all.map(x => ({ label: LBL[x.m], value: lg(x.r.dbq), max: mx, text: fmtNum(x.r.dbq), cls: x.m === st.mode ? `alt` : `muted` })), mx);
        const N = {
          none: R.dbq / R.expiries <= 3 ? `At this traffic only ${fmtNum(Math.round(R.dbq / R.expiries))} request${R.dbq / R.expiries < 1.5 ? `` : `s`} per expiry land${R.dbq / R.expiries < 1.5 ? `s` : ``} in the rebuild window, so the stampede is mild. Turn up the traffic or the rebuild time: the window fills with misses, and each one is another query for the same row.` : `Each expiry turns into ${fmtNum(Math.round(R.dbq / R.expiries))} database queries for the same row, because every request arriving during the rebuild misses too, and the pile-up makes each query slower, which widens the window further. Across many hot keys this is how a cache expiry takes a database down.`,
          coalesce: `Only one request rebuilds the key; everyone else waits for that result, so the database sees one query per expiry (${R.dbq} in 30 s). Users who arrive during a rebuild wait for it (up to ${ms(st.rebuild)})${R.p999 > 2 ? `, which shows up at p99.9 (${ms(R.p999)})` : `, too rare to show even at p99.9 here`}; serving the stale value while rebuilding removes even that wait.`,
          early: `A background refresh runs shortly before each expiry, so the key never actually goes missing: no user waits on the database at all, and the database sees one query per TTL. Jitter keeps many keys from refreshing at the same instant. It only helps with TTL expiry; keys deleted on writes still need coalescing.`
        };
        q(`note`).innerHTML = note(N[st.mode], st.mode === `none` ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { qps: v => fmtNum(v), rebuild: v => v + ` ms` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch14 - Shard key and strategy
  // =====================================================================
  const SK_USERS = 20000, SK_COUNTRIES = 50;
  const SK_KEYS = { user_id: `user_id`, country: `country`, is_premium: `is_premium`, created_at: `created_at` };
  function skData(seed) {
    const r = mulberry32(seed);
    const ccdf = zipfCdf(SK_COUNTRIES, 1.1);
    return Array.from({ length: SK_USERS }, (_, i) => ({ id: i + 1, country: zipfPick(ccdf, r()), premium: r() < 0.1 ? 1 : 0, created: i }));
  }
  function skShard(st, u, N) {
    const v = st.key === `user_id` ? u.id : st.key === `country` ? u.country : st.key === `is_premium` ? u.premium : u.created;
    if (st.strat === `hash`) return h32(st.key + `:` + v) % N;
    const max = st.key === `user_id` ? SK_USERS + 1 : st.key === `country` ? SK_COUNTRIES : st.key === `is_premium` ? 2 : SK_USERS;
    return Math.min(N - 1, Math.floor((st.key === `user_id` ? v - 1 : v) / max * N));
  }
  D.shardKey = {
    title: `Choosing a shard key: distribution, hot spots and query fit`,
    blurb: `${fmtNum(SK_USERS)} users (a sample) are spread over N shards. Countries are skewed (a few countries hold most users), 10% of users are premium, and new users sign up continuously. Pick a shard key and a strategy, then compare how evenly the <strong>data</strong>, the <strong>incoming writes</strong> (new signups) and the <strong>reads</strong> (optionally with one celebrity getting 20% of all reads) land on the shards.`,
    mount(el) {
      const st = { key: `user_id`, strat: `hash`, n: 8, celeb: `off` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`shard key`, seg(`key`, Object.keys(SK_KEYS).map(k => [k, SK_KEYS[k]]), st.key))}${ctl(`strategy`, seg(`strat`, [[`hash`, `hash`], [`range`, `range`]], st.strat))}</div>
        <div class="ctl-row">${ctl(`shards`, rng(`n`, 2, 16, 1, st.n))}${ctl(`celebrity (20% of reads)`, seg(`celeb`, [[`off`, `off`], [`on`, `on`]], st.celeb))}</div>
        <div class="lab-grid three">
          <div class="lab-panel"><h4>Data per shard</h4><div data-k="data"></div></div>
          <div class="lab-panel"><h4>New writes per shard</h4><div data-k="writes"></div></div>
          <div class="lab-panel"><h4>Reads per shard</h4><div data-k="reads"></div></div>
        </div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const users = skData(7);
      const draw = () => {
        const N = st.n;
        const data = new Array(N).fill(0), writes = new Array(N).fill(0), reads = new Array(N).fill(0);
        users.forEach(u => { const s = skShard(st, u, N); data[s]++; reads[s] += 1; });
        const newest = users.slice(-Math.round(SK_USERS * 0.02)).map(u => ({ ...u, id: u.id, created: SK_USERS - 1 }));
        newest.forEach(u => { writes[skShard(st, u, N)]++; });
        if (st.celeb === `on`) { const c = users[123]; reads[skShard(st, c, N)] += SK_USERS * 0.25; }
        const bars = (arr, cls) => { const mx = Math.max(...arr, 1); return hbars(arr.map((v, i) => ({ label: `shard ${i + 1}`, value: v, max: mx, text: pct(v / sum(arr)), cls: v / (sum(arr) / N) > 1.5 ? `bad` : cls })), mx); };
        q(`data`).innerHTML = bars(data, `alt`);
        q(`writes`).innerHTML = bars(writes, `warn`);
        q(`reads`).innerHTML = bars(reads, ``);
        const ratio = arr => Math.max(...arr) / (sum(arr) / N);
        const used = data.filter(v => v > 0).length;
        q(`stats`).innerHTML = stat(`shards with data`, `${used} / ${N}`, used < N ? `bad` : `good`) + stat(`busiest / average (data)`, round(ratio(data), 2) + `x`, ratio(data) > 1.5 ? `bad` : `good`) + stat(`busiest / average (writes)`, round(ratio(writes), 2) + `x`, ratio(writes) > 1.5 ? `bad` : `good`) + stat(`busiest / average (reads)`, round(ratio(reads), 2) + `x`, ratio(reads) > 1.5 ? `bad` : `good`) + stat(`"get user 123" touches`, st.key === `user_id` ? `1 shard` : `all ${N} (or a lookup)`, st.key === `user_id` ? `good` : `bad`);
        let n;
        if (st.key === `is_premium`) n = `A boolean has two values, so at most two shards ever get data, whatever N is, and the free-user shard holds about 90% of everything. Cardinality caps the shard count.`;
        else if (st.key === `country`) n = `Fifty countries sounds like plenty, but the distribution is skewed: the busiest shard holds ${round(ratio(data), 1)}x its fair share. Low cardinality plus skew means hot shards, and user lookups can't be routed without knowing the country.`;
        else if (st.key === `created_at` && st.strat === `range`) n = `Ranges over signup time spread existing data evenly, but every new signup has the newest timestamp, so all writes land on the last shard (${round(ratio(writes), 1)}x average). Time-ordered keys create write hot spots.`;
        else if (st.key === `user_id` && st.strat === `range`) n = `Range sharding on an auto-increment ID has the same problem as time: new users get the highest IDs, so the last shard takes every new write while the others sit idle. Hashing the ID fixes it.`;
        else if (st.key === `created_at`) n = `Hashing the timestamp spreads data and writes evenly, but a user's rows end up on random shards, so "get this user's data" touches every shard. Even distribution isn't enough; the key must match the queries.`;
        else n = `user_id with hash distribution is the classic good key: high cardinality, data and writes spread evenly (busiest shard ${round(ratio(data), 2)}x average), and user-scoped queries hit exactly one shard.`;
        if (st.celeb === `on`) n += ` The celebrity's shard serves ${round(ratio(reads), 1)}x the average reads, whichever key you choose, because one key is hot. That needs caching and replicas, not a different shard key.`;
        q(`note`).innerHTML = note(n, st.key === `user_id` && st.strat === `hash` && st.celeb === `off` ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch15 - Scatter-gather tail latency
  // =====================================================================
  function sgLat(r, pSlow) { return r() < pSlow ? 80 + r() * 120 : 3 + r() * 4 + (r() < 0.5 ? r() * 2 : 0); }
  function sgRun(N, pSlow, hedge, trials, seed) {
    const r = mulberry32(seed + N * 13);
    const out = [];
    for (let t = 0; t < trials; t++) {
      let mx = 0;
      for (let i = 0; i < N; i++) {
        let l = sgLat(r, pSlow);
        if (hedge && l > 15) l = Math.min(l, 15 + sgLat(r, pSlow));
        if (l > mx) mx = l;
      }
      out.push(mx + 1 + N * 0.02);
    }
    out.sort((a, b) => a - b);
    return { p50: out[Math.floor(trials * 0.5)], p99: out[Math.floor(trials * 0.99)] };
  }
  D.scatterGather = {
    title: `Scatter-gather: why fan-out queries get slow`,
    blurb: `A query that doesn't include the shard key must ask every shard and wait for all of them. Each shard usually answers in ~5 ms but is occasionally slow (a GC pause, a busy disk). The response time is the <strong>slowest</strong> shard's, so rare slowness on one shard becomes common slowness for fan-out queries. <strong>Hedged requests</strong> send a backup copy to another replica if the first hasn't answered within 15 ms.`,
    mount(el) {
      const st = { n: 2, slow: 1, hedge: `off` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`shards queried`, rng(`n`, 0, 8, 1, st.n))}${ctl(`chance a shard is slow`, rng(`slow`, 0.1, 5, 0.1, st.slow))}${ctl(`hedged requests`, seg(`hedge`, [[`off`, `off`], [`on`, `on`]], st.hedge))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Query latency vs shards queried</h4><div data-k="chart"></div><div class="legend"><span><i class="sw line" style="background:var(--accent)"></i>median</span><span><i class="sw line" style="background:var(--bad)"></i>p99</span></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const N = Math.pow(2, st.n), p = st.slow / 100, hedge = st.hedge === `on`;
        const xs = [1, 2, 4, 8, 16, 32, 64, 128, 256];
        const curve = xs.map(x => ({ x, r: sgRun(x, p, hedge, 400, 3) }));
        const cur = sgRun(N, p, hedge, 2000, 9), one = sgRun(1, p, hedge, 2000, 9);
        const yMax = Math.max(50, ...curve.map(c => c.r.p99)) * 1.1;
        const a = axes({ x0: 46, x1: 500, y0: 190, y1: 12, dx0: 1, dx1: 256, dy0: 0, dy1: yMax, xLog: true, xTicks: xs, yTicks: [0, Math.round(yMax / 2), Math.round(yMax)], xFmt: v => v, yFmt: v => v + `ms`, xLabel: `shards queried` });
        let s = a.svg;
        s += `<path d="${path(curve.map(c => [a.X(c.x), a.Y(c.r.p50)]))}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        s += `<path d="${path(curve.map(c => [a.X(c.x), a.Y(c.r.p99)]))}" style="fill:none;stroke:var(--bad);stroke-width:2"/>`;
        s += `<line x1="${a.X(N)}" x2="${a.X(N)}" y1="12" y2="190" style="stroke:var(--text);stroke-dasharray:4 3"/>`;
        q(`chart`).innerHTML = svgWrap(520, 225, s);
        const pAny = 1 - Math.pow(1 - p, N);
        q(`stats`).innerHTML = stat(`shards`, N) + stat(`chance at least one is slow`, pct(pAny, 1), pAny > 0.3 ? `bad` : ``) + stat(`median latency`, ms(cur.p50)) + stat(`p99 latency`, ms(cur.p99), cur.p99 > 50 ? `bad` : `good`) + stat(`single-shard query p99`, ms(one.p99));
        let n = N === 1 ? `A query that includes the shard key goes to one shard: fast, and slow only when that one shard is (${st.slow}% of the time).` : pAny < 0.01 ? `With ${N} shards each slow ${st.slow}% of the time, under 1% of queries hit a slow shard, so even the p99 is barely affected. Push the shard count up and watch that change.` : `Each shard is slow only ${st.slow}% of the time, but a query touching ${N} shards hits at least one slow shard ${pct(pAny, pAny < 0.1 ? 1 : 0)} of the time, so ${pAny > 0.5 ? `even the median query` : `the p99`} pays the slow shard's latency. That's tail latency amplification.`;
        n += hedge ? ` Hedged requests cut the tail sharply by racing a backup against the slow replica, at the cost of a little extra load.` : ` Keep common queries on one shard by choosing the shard key well; for unavoidable fan-outs, use timeouts, hedged requests or precomputed results.`;
        q(`note`).innerHTML = note(n, N > 8 && !hedge ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => Math.pow(2, v), slow: v => v + `%` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch15 - Cross-shard transfer: naive, 2PC, saga
  // =====================================================================
  const SA_APPROACH = { naive: `two independent writes`, tpc: `two-phase commit`, saga: `saga with compensation` };
  const SA_FAIL = { none: `no failure`, credit: `credit fails (B's account frozen)`, crash: `coordinator crashes after step 1`, timeout: `credit times out, then retried` };
  function saRun(ap, fail) {
    const s = { A: 500, B: 100 };
    const log = [];
    const add = (t, shard, action, res, cls) => log.push({ t, shard, action, res, cls });
    let blocked = 0, window = 0;
    if (ap === `naive`) {
      s.A -= 200; add(0, `1`, `debit A $200`, `ok`, `ok`);
      if (fail === `credit`) add(20, `2`, `credit B $200`, `failed`, `bad`);
      else if (fail === `crash`) add(20, `-`, `coordinator crashes`, `nobody resumes`, `bad`);
      else if (fail === `timeout`) { s.B += 200; add(20, `2`, `credit B $200`, `applied, response lost`, `dup`); s.B += 200; add(1020, `2`, `retry credit B $200`, `applied again`, `bad`); }
      else { s.B += 200; add(20, `2`, `credit B $200`, `ok`, `ok`); }
    } else if (ap === `tpc`) {
      add(0, `1`, `PREPARE debit A (lock A)`, `yes`, `info`);
      if (fail === `credit`) { add(10, `2`, `PREPARE credit B`, `no (frozen)`, `bad`); add(20, `1,2`, `ABORT`, `rolled back, locks released`, `ok`); }
      else if (fail === `crash`) { add(10, `2`, `PREPARE credit B (lock B)`, `yes`, `info`); add(20, `-`, `coordinator crashes before COMMIT`, `A and B stay locked`, `bad`); blocked = 30000; add(30020, `-`, `coordinator recovers, sends COMMIT`, `committed`, `ok`); s.A -= 200; s.B += 200; }
      else { add(10, `2`, `PREPARE credit B (lock B)`, `yes`, `info`); s.A -= 200; s.B += 200; add(20, `1,2`, `COMMIT`, fail === `timeout` ? `B's ack lost; COMMIT resent, applied once` : `committed`, `ok`); blocked = 20; }
    } else {
      s.A -= 200; add(0, `1`, `T1: debit A $200 (transfer #77)`, `ok`, `ok`);
      if (fail === `credit`) { add(20, `2`, `T2: credit B (transfer #77)`, `failed`, `bad`); s.A += 200; add(40, `1`, `C1: refund A $200 (compensate)`, `ok`, `ok`); window = 40; }
      else if (fail === `crash`) { add(20, `-`, `orchestrator crashes`, `saga state saved after T1`, `dup`); add(5020, `-`, `orchestrator restarts, reads saga log`, `resumes at T2`, `info`); s.B += 200; add(5040, `2`, `T2: credit B (transfer #77)`, `ok`, `ok`); window = 5040; }
      else if (fail === `timeout`) { s.B += 200; add(20, `2`, `T2: credit B (transfer #77)`, `applied, response lost`, `dup`); add(1020, `2`, `retry T2 (transfer #77)`, `already applied: no-op`, `ok`); window = 1020; }
      else { s.B += 200; add(20, `2`, `T2: credit B (transfer #77)`, `ok`, `ok`); window = 20; }
    }
    const total = s.A + s.B;
    return { s, log, total, ok: total === 600, blocked, window };
  }
  D.saga = {
    title: `Moving money across shards: independent writes, 2PC or a saga`,
    blurb: `Transfer $200 from A (on shard 1, balance $500) to B (on shard 2, balance $100). No single database transaction spans both shards. Inject a failure and compare doing two independent writes, a <strong>two-phase commit</strong>, and a <strong>saga</strong>: local transactions with idempotent steps (keyed by a transfer ID), a durable saga log and compensating actions.`,
    mount(el) {
      const st = { ap: `naive`, fail: `credit` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`approach`, seg(`ap`, Object.keys(SA_APPROACH).map(k => [k, SA_APPROACH[k]]), st.ap))}</div>
        <div class="ctl-row">${ctl(`failure`, seg(`fail`, Object.keys(SA_FAIL).map(k => [k, SA_FAIL[k]]), st.fail))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>What happened</h4><div data-k="log"></div></div>
          <div class="lab-panel"><h4>Outcome</h4><div class="stat-row" data-k="stats"></div><div data-k="cmp"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = saRun(st.ap, st.fail);
        q(`log`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th class="num">t</th><th>shard</th><th>step</th><th>result</th></tr>${R.log.map(l => `<tr><td class="num">${ms(l.t)}</td><td>${l.shard}</td><td style="white-space:normal">${esc(l.action)}</td><td><span class="log"><span class="${l.cls}">${esc(l.res)}</span></span></td></tr>`).join(``)}</table></div>`;
        q(`stats`).innerHTML = stat(`A`, `$${R.s.A}`) + stat(`B`, `$${R.s.B}`) + stat(`total (should be $600)`, `$${R.total}`, R.ok ? `good` : `bad`) + (R.blocked > 1000 ? stat(`rows locked`, ms(R.blocked), `bad`) : ``) + (R.window ? stat(`visible in-between state`, ms(R.window)) : ``);
        const rows = Object.keys(SA_APPROACH).map(a => { const x = saRun(a, st.fail); return `<tr><td>${SA_APPROACH[a]}</td><td>${x.ok ? chip(`money conserved`, `ok`) : chip(`$${x.total - 600 > 0 ? `+` : ``}${x.total - 600}`, `no`)}</td><td>${x.blocked > 1000 ? chip(`blocked ${ms(x.blocked)}`, `no`) : `-`}</td></tr>`; }).join(``);
        q(`cmp`).innerHTML = `<h4 style="margin-top:12px">Same failure, each approach</h4><table class="mini-table">${rows}</table>`;
        const key = st.ap + `.` + st.fail;
        const N = {
          naive: R.ok ? `With no failure two separate writes work, which is exactly why this bug survives testing.` : st.fail === `timeout` ? `The credit was applied but its response was lost, so the retry credited B twice: $200 created from nothing. Without an idempotency key per transfer, retries duplicate effects.` : `A was debited but B was never credited and nothing undoes it: $200 vanished. Independent writes across shards need a protocol.`,
          tpc: st.fail === `crash` ? `2PC kept the money consistent, but after both shards voted yes the coordinator died, and they had to keep A and B locked, unable to commit or abort on their own, until it came back. That blocking is why production systems avoid 2PC.` : `2PC is atomic: both shards prepare (lock and vote), then commit or abort together. ${st.fail === `credit` ? `B voted no, so everything rolled back cleanly.` : `It costs extra round trips and holds locks for the duration.`}`,
          saga: st.fail === `credit` ? `The credit failed, so the saga ran the compensating step and refunded A. Money is conserved, but for ${ms(R.window)} A's balance showed the debit: sagas give eventual consistency, so design for visible intermediate states (e.g. "transfer pending").` : st.fail === `crash` ? `Because the saga log was saved after step 1, the restarted orchestrator resumed with step 2. Nothing stays locked; the transfer just completes late.` : st.fail === `timeout` ? `The retried credit carried the same transfer ID, so shard 2 recognized it and did nothing: idempotent steps make retries safe.` : `Each step is a fast local transaction; no locks are held across shards.`
        };
        q(`note`).innerHTML = note(N[st.ap] + (st.ap === `saga` || key === `tpc.none` ? `` : ` Best of all: choose the shard key so both accounts' data rarely needs to change together.`), R.ok && R.blocked < 1000 ? `good` : `bad`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch16 - Modulo vs consistent hashing: keys moved
  // =====================================================================
  const MR_KEYS = 10000;
  function ringOf(nodes, V) { const r = []; nodes.forEach(n => { for (let i = 0; i < V; i++) r.push([h32(`${n}#vn${i}`), n]); }); r.sort((a, b) => a[0] - b[0]); return r; }
  function ringOwner(ring, h) { let lo = 0, hi = ring.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ring[m][0] < h) lo = m + 1; else hi = m; } return ring[lo % ring.length][1]; }
  function mrAssign(method, nodes, V) {
    const ring = method === `mod` ? null : ringOf(nodes, method === `ring1` ? 1 : V);
    const out = new Array(MR_KEYS);
    for (let k = 0; k < MR_KEYS; k++) { const h = h32(`key:` + k); out[k] = method === `mod` ? nodes[h % nodes.length] : ringOwner(ring, h); }
    return out;
  }
  D.modVsRing = {
    title: `Adding or removing a node: modulo vs consistent hashing`,
    blurb: `${fmtNum(MR_KEYS)} keys are spread over N nodes. Change the cluster by one node and count how many keys must move to a different node: with <code>hash(key) mod N</code>, with a hash ring (one position per node), and with a ring using virtual nodes. Every moved key is a cache miss or a row to copy.`,
    mount(el) {
      const st = { n: 4, act: `add`, v: 100, method: `ringv` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`nodes`, rng(`n`, 2, 20, 1, st.n))}${ctl(`change`, seg(`act`, [[`add`, `add a node`], [`remove`, `remove a node`]], st.act))}${ctl(`virtual nodes per node`, rng(`v`, 10, 300, 10, st.v))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Share of keys that move</h4><div data-k="moved"></div></div>
          <div class="lab-panel"><h4>Keys per node after the change</h4><div class="ctl-row">${ctl(`method`, seg(`method`, [[`mod`, `mod N`], [`ring1`, `ring`], [`ringv`, `ring + vnodes`]], st.method))}</div><div data-k="load"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const LBL = { mod: `hash mod N`, ring1: `ring`, ringv: `ring + vnodes` };
      const draw = () => {
        const before = Array.from({ length: st.n }, (_, i) => `node${i + 1}`);
        const after = st.act === `add` ? before.concat([`node${st.n + 1}`]) : before.filter((_, i) => i !== 1);
        const res = Object.keys(LBL).map(m => {
          const a = mrAssign(m, before, st.v), b = mrAssign(m, after, st.v);
          let moved = 0; for (let k = 0; k < MR_KEYS; k++) if (a[k] !== b[k]) moved++;
          const load = {}; after.forEach(n => { load[n] = 0; }); b.forEach(n => { load[n]++; });
          return { m, moved: moved / MR_KEYS, load };
        });
        const ideal = st.act === `add` ? 1 / (st.n + 1) : 1 / st.n;
        q(`moved`).innerHTML = hbars(res.map(x => ({ label: LBL[x.m], value: x.moved, max: 1, text: pct(x.moved, 1), cls: x.moved > ideal * 2 ? `bad` : `good` })).concat([{ label: `minimum`, value: ideal, max: 1, text: pct(ideal, 1), cls: `muted` }]), 1);
        const sel = res.find(x => x.m === st.method);
        const names = Object.keys(sel.load), vals = names.map(n => sel.load[n]), mx = Math.max(...vals), avg = MR_KEYS / names.length;
        q(`load`).innerHTML = hbars(names.map(n => ({ label: n, value: sel.load[n], max: mx, text: fmtNum(sel.load[n]), cls: sel.load[n] > avg * 1.5 ? `bad` : n === `node${st.n + 1}` && st.act === `add` ? `good` : `alt` })), mx) + `<div class="cs-note">Busiest node holds ${round(mx / avg, 2)}x the average.</div>`;
        const mod = res[0].moved, r1 = res[1], rv = res[2];
        let n = `${st.act === `add` ? `Adding` : `Removing`} one node changes N from ${st.n} to ${after.length}, and <code>hash mod N</code> sends ${pct(mod, 0)} of keys to a different node, almost everything. The ring moves only the keys in the affected arc: ${pct(rv.moved, 1)} with virtual nodes, close to the minimum of ${pct(ideal, 1)}.`;
        const r1max = Math.max(...Object.values(r1.load)) / (MR_KEYS / after.length);
        n += ` Without virtual nodes the arcs are uneven by chance (busiest node ${round(r1max, 1)}x average) and ${st.act === `remove` ? `the removed node's keys all go to one neighbour` : `the new node takes load from just one neighbour`}; with ${st.v} virtual nodes each, load evens out and the change is shared by every node.`;
        q(`note`).innerHTML = note(n, `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => v, v: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch16 - Hash ring with virtual nodes (visual)
  // =====================================================================
  const HR_KEYS = 3000;
  D.hashRing = {
    title: `The hash ring and virtual nodes, visualized`,
    blurb: `Nodes are placed on a ring at hash(node + virtual node number); each key belongs to the first node clockwise from hash(key). Colored arcs show which node owns which part of the ring. Increase the virtual nodes to see the arcs interleave and the load even out; remove a node to see where its keys go.`,
    mount(el) {
      const st = { n: 4, v: 1, act: `none` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`nodes`, rng(`n`, 3, 8, 1, st.n))}${ctl(`virtual nodes per node`, rng(`v`, 1, 64, 1, st.v))}${ctl(`event`, seg(`act`, [[`none`, `none`], [`remove`, `node B fails`], [`add`, `add a node`]], st.act))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Ring</h4><div data-k="ring"></div></div>
          <div class="lab-panel"><h4>Keys per node</h4><div data-k="load"></div><div class="stat-row" data-k="stats"></div><div data-k="moved"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const name = i => String.fromCharCode(65 + i);
      const draw = () => {
        const base = Array.from({ length: st.n }, (_, i) => name(i));
        const nodes = st.act === `remove` ? base.filter(x => x !== `B`) : st.act === `add` ? base.concat([name(st.n)]) : base;
        const ring = ringOf(nodes, st.v), ring0 = ringOf(base, st.v);
        const load = {}; nodes.forEach(n => { load[n] = 0; });
        const recv = {};
        for (let k = 0; k < HR_KEYS; k++) {
          const h = h32(`key:` + k), o = ringOwner(ring, h), o0 = ringOwner(ring0, h);
          load[o]++;
          if (o !== o0) { const kk = st.act === `remove` ? o : o0; recv[kk] = (recv[kk] || 0) + 1; }
        }
        const W = 300, C = 150, R = 115, TAU = Math.PI * 2, MAXH = 4294967296;
        const ang = h => h / MAXH * TAU - Math.PI / 2;
        const col = n => n.charCodeAt(0) - 65 < PAL.length ? PAL[n.charCodeAt(0) - 65] : `#22d3ee`;
        let s = `<circle cx="${C}" cy="${C}" r="${R}" style="fill:none;stroke:var(--border);stroke-width:14"/>`;
        for (let i = 0; i < ring.length; i++) {
          const prev = ring[(i - 1 + ring.length) % ring.length][0], cur = ring[i][0];
          let a0 = ang(prev), a1 = ang(cur);
          if (a1 <= a0) a1 += TAU;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          s += `<path d="M ${C + R * Math.cos(a0)} ${C + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)}" style="fill:none;stroke:${col(ring[i][1])};stroke-width:14"/>`;
        }
        if (ring.length <= 64) ring.forEach(([h, n]) => { const a = ang(h); s += `<circle cx="${C + R * Math.cos(a)}" cy="${C + R * Math.sin(a)}" r="4" style="fill:var(--bg);stroke:${col(n)};stroke-width:2"/>`; if (st.v <= 2) s += `<text class="svg-label" x="${C + (R + 20) * Math.cos(a)}" y="${C + (R + 20) * Math.sin(a) + 4}" text-anchor="middle" style="fill:${col(n)};font-weight:700">${n}</text>`; });
        s += `<text class="svg-label" x="${C}" y="${C - 4}" text-anchor="middle">${ring.length} positions</text><text class="svg-label" x="${C}" y="${C + 12}" text-anchor="middle">clockwise ownership</text>`;
        q(`ring`).innerHTML = svgWrap(W, W, s);
        const vals = nodes.map(n => load[n]), avg = HR_KEYS / nodes.length, mx = Math.max(...vals);
        const sd = Math.sqrt(sum(vals.map(v => (v - avg) ** 2)) / vals.length);
        q(`load`).innerHTML = hbars(nodes.map(n => ({ label: `node ${n}`, value: load[n], max: mx, text: fmtNum(load[n]), cls: load[n] > avg * 1.4 ? `bad` : `` })), mx);
        q(`stats`).innerHTML = stat(`busiest / average`, round(mx / avg, 2) + `x`, mx / avg > 1.4 ? `bad` : `good`) + stat(`spread (std dev)`, pct(sd / avg, 0));
        const rk = Object.keys(recv);
        q(`moved`).innerHTML = st.act === `none` ? `` : `<h4 style="margin-top:12px">${st.act === `remove` ? `Where node B's keys went` : `Where the new node's keys came from`}</h4>` + hbars(rk.map(n => ({ label: `node ${n}`, value: recv[n], text: fmtNum(recv[n]), cls: `alt` })), Math.max(...rk.map(n => recv[n]), 1));
        let n;
        if (st.v === 1) n = `With one position per node the arcs are uneven by chance, so the busiest node holds ${round(mx / avg, 1)}x its fair share.`;
        else n = `With ${st.v} positions per node the arcs interleave and the load evens out (busiest ${round(mx / avg, 2)}x average). Real systems use dozens to hundreds of virtual nodes, and give bigger machines more of them.`;
        if (st.act === `remove`) n += rk.length === 1 ? ` Node B's keys all moved to its single clockwise neighbour, doubling that node's load.` : ` Node B's keys were spread across ${rk.length} survivors instead of piling onto one neighbour.`;
        if (st.act === `add`) n += rk.length === 1 ? ` The new node took its keys from just one neighbour.` : ` The new node took a little from ${rk.length} existing nodes, so everyone got relief.`;
        q(`note`).innerHTML = note(n, mx / avg > 1.4 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => v, v: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch17 - CAP: what happens during a partition
  // =====================================================================
  const CAP_SC = {
    profile: { name: `profile name`, steps: [[`US`, `w`, `Ann sets her display name to "Ann Lee"`, `Ann Lee`], [`EU`, `r`, `Bo (EU) views Ann's profile`], [`EU`, `w`, `Ann, travelling in Europe, renames herself "Annie"`, `Annie`], [`US`, `r`, `Cy (US) views Ann's profile`], [`-`, `heal`, `Network heals; replicas sync`], [`EU`, `r`, `Bo (EU) views Ann's profile`]], init: `Ann` },
    seat: { name: `seat booking`, steps: [[`US`, `w`, `Ann books seat 6A`, `Ann`], [`EU`, `r`, `Bo (EU) checks seat 6A`], [`EU`, `w`, `Bo books seat 6A`, `Bo`], [`US`, `r`, `Cy (US) checks seat 6A`], [`-`, `heal`, `Network heals; replicas sync`], [`EU`, `r`, `Bo checks his booking`]], init: `free` }
  };
  function capRun(sc, mode, part) {
    const S = CAP_SC[sc];
    const val = { US: S.init, EU: S.init }, ts = { US: 0, EU: 0 };
    let t = 0, errors = 0, stale = 0, conflicts = 0, latest = S.init;
    const rows = [];
    const partitioned = () => part === `on`;
    let healed = false;
    S.steps.forEach(([site, op, text, v]) => {
      t++;
      let resp;
      const cut = partitioned() && !healed;
      if (op === `heal`) {
        healed = true;
        if (val.US !== val.EU) { const win = ts.US >= ts.EU ? `US` : `EU`, lose = win === `US` ? `EU` : `US`; if (mode === `ap` && ts.US && ts.EU && ts.US !== ts.EU) conflicts++; resp = `last write wins: keeps "${val[win]}", discards "${val[lose]}"`; val[lose] = val[win]; latest = val[win]; }
        else resp = `already in sync`;
      } else if (op === `w`) {
        if (sc === `seat` && mode === `cp` && !cut && val.US !== `free`) { resp = `rejected: seat already taken`; }
        else if (cut && mode === `cp` && site === `EU`) { errors++; resp = `error: can't reach the majority, write refused`; }
        else if (sc === `seat` && val[site] !== `free`) resp = `rejected: seat already taken`;
        else {
          val[site] = v; ts[site] = t;
          if (!cut) { const o = site === `US` ? `EU` : `US`; val[o] = v; ts[o] = t; }
          latest = v;
          resp = `ok: ${sc === `seat` ? `booked for ${v}` : `saved "${v}"`}`;
        }
      } else {
        if (cut && mode === `cp` && site === `EU`) { errors++; resp = `error: can't confirm latest value`; }
        else { resp = `returns "${val[site]}"`; if (val[site] !== latest) { stale++; resp += ` (stale)`; } }
      }
      rows.push({ t, site, text, resp, us: val.US, eu: val.EU });
    });
    const doubleBooked = sc === `seat` && conflicts > 0;
    return { rows, errors, stale, conflicts, doubleBooked };
  }
  D.capPartition = {
    title: `CAP in action: a partition between US and EU replicas`,
    blurb: `Data is replicated across a US and an EU data centre (the US side holds the majority of replicas). Toggle a network partition and choose what the system does during it: <strong>CP</strong> refuses requests it can't guarantee are up to date; <strong>AP</strong> answers from whatever replica is reachable and reconciles later with last-write-wins. Try it for a profile name and for a seat booking.`,
    mount(el) {
      const st = { sc: `profile`, mode: `ap`, part: `on` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`data`, seg(`sc`, [[`profile`, `profile name`], [`seat`, `seat booking`]], st.sc))}${ctl(`during a partition`, seg(`mode`, [[`cp`, `CP: refuse`], [`ap`, `AP: answer anyway`]], st.mode))}${ctl(`network partition`, seg(`part`, [[`off`, `off`], [`on`, `on (until step 5)`]], st.part))}</div>
        <div class="lab-panel"><h4>Timeline</h4><div data-k="tbl"></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = capRun(st.sc, st.mode, st.part);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>#</th><th>at</th><th>request</th><th>response</th><th>US replica</th><th>EU replica</th></tr>${R.rows.map(r => `<tr><td>${r.t}</td><td>${r.site}</td><td style="white-space:normal;min-width:180px">${esc(r.text)}</td><td style="white-space:normal;min-width:180px;color:${/error/.test(r.resp) ? `var(--warn)` : /stale|discards/.test(r.resp) ? `var(--bad)` : `inherit`}">${esc(r.resp)}</td><td class="mono">${esc(r.us)}</td><td class="mono">${esc(r.eu)}</td></tr>`).join(``)}</table></div>`;
        q(`stats`).innerHTML = stat(`errors returned`, R.errors, R.errors ? `warn` : `good`) + stat(`stale reads`, R.stale, R.stale ? `bad` : `good`) + stat(`conflicting writes`, R.conflicts, R.conflicts ? `bad` : `good`) + (st.sc === `seat` ? stat(`seat double-booked`, R.doubleBooked ? `yes` : `no`, R.doubleBooked ? `bad` : `good`) : ``);
        let n;
        if (st.part === `off`) n = `Without a partition, writes replicate right away and every read sees the latest value: consistency and availability both hold. CAP only forces a choice while the network is split.`;
        else if (st.mode === `cp`) n = `The EU side can't reach the majority, so it refuses reads and writes instead of risking stale or conflicting data: ${R.errors} requests got errors, but nobody saw wrong data. ${st.sc === `seat` ? `For seat booking that's the right trade: Bo can retry later, and the seat is never sold twice.` : `For a profile name that's probably the wrong trade: an error page is worse than an old name.`}`;
        else n = `Every request got an answer, but the EU side served stale data (${R.stale} stale reads) and accepted a conflicting write that last-write-wins resolved by discarding one of them. ${st.sc === `seat` ? `For seats that's a disaster: two people were told they booked 6A. Bookings need consistency.` : `For a profile name that's fine: seeing "Ann" for a few seconds is harmless. Profiles should choose availability.`}`;
        q(`note`).innerHTML = note(n, st.part === `off` ? `good` : (st.sc === `seat`) === (st.mode === `cp`) ? `good` : `bad`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch17 - Quorum reads and writes (N, R, W)
  // =====================================================================
  function qSim(st, seed) {
    const r = mulberry32(seed * 41 + st.n * 7 + st.w * 3 + st.r);
    const N = st.n, up = N - st.down;
    let stale = 0, reads = 0, wLat = 0, rLat = 0, writes = 0;
    const T = 3000;
    const exp = m => -Math.log(1 - r()) * m;
    const canW = up >= st.w, canR = up >= st.r;
    if (canW && canR) for (let i = 0; i < T; i++) {
      writes++;
      const delays = Array.from({ length: up }, () => 1 + exp(2));
      const order = delays.map((d, k) => [d, k]).sort((a, b) => a[0] - b[0]);
      wLat += order[st.w - 1][0];
      const has = new Array(up).fill(0);
      order.forEach(([d, k], j) => { has[k] = j < st.w ? 0 : d + exp(st.lag); });
      reads++;
      const at = r() * 100;
      const idx = Array.from({ length: up }, (_, k) => k).sort(() => r() - 0.5).slice(0, st.r);
      if (!idx.some(k => has[k] <= at)) stale++;
      rLat += Math.max(...idx.map(() => 1 + exp(2)));
    }
    return { staleP: reads ? stale / reads : 0, wAvail: canW ? 1 : 0, rAvail: canR ? 1 : 0, wLat: writes ? wLat / writes : 0, rLat: reads ? rLat / reads : 0, measured: reads > 0 };
  }
  D.quorum = {
    title: `Quorums: tuning consistency with N, W and R`,
    blurb: `Each value is stored on <strong>N</strong> replicas. A write returns once <strong>W</strong> replicas acknowledge it; the rest catch up asynchronously after a replication lag. A read asks <strong>R</strong> replicas and returns the newest version among them. Reads here happen 0-100 ms after the write. Take replicas down to see availability change.`,
    mount(el) {
      const st = { n: 3, w: 2, r: 2, lag: 50, down: 0 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`replicas N`, seg(`n`, [[3, `3`], [5, `5`]], st.n))}${ctl(`write quorum W`, rng(`w`, 1, 3, 1, st.w))}${ctl(`read quorum R`, rng(`r`, 1, 3, 1, st.r))}</div>
        <div class="ctl-row">${ctl(`replication lag (mean)`, rng(`lag`, 0, 500, 10, st.lag))}${ctl(`replicas down`, rng(`down`, 0, 2, 1, st.down))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Replicas</h4><div data-k="viz"></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        st.w = Math.min(st.w, st.n); st.r = Math.min(st.r, st.n); st.down = Math.min(st.down, st.n - 1);
        [[`w`, st.n], [`r`, st.n], [`down`, st.n - 1]].forEach(([k, mx]) => { const i = el.querySelector(`input[data-rng="${k}"]`); i.max = mx; i.value = st[k]; el.querySelector(`[data-rv="${k}"]`).textContent = st[k]; });
        const R = qSim(st, 1);
        const strong = st.r + st.w > st.n;
        let s = ``;
        for (let i = 0; i < st.n; i++) {
          const x = 40 + i * (440 / Math.max(1, st.n - 1)) * (st.n > 1 ? 1 : 0), down = i >= st.n - st.down;
          const wr = !down && i < st.w, rd = !down && i >= st.n - st.down - st.r;
          s += `<circle cx="${x}" cy="60" r="24" style="fill:${down ? `var(--bg-3)` : `var(--bg-2)`};stroke:${down ? `var(--bad)` : `var(--accent)`};stroke-width:2;${down ? `stroke-dasharray:4 3` : ``}"/>`;
          s += `<text class="svg-label" x="${x}" y="64" text-anchor="middle" style="fill:var(--text)">${down ? `down` : `R${i + 1}`}</text>`;
          if (wr) s += `<text class="svg-label" x="${x}" y="24" text-anchor="middle" style="fill:var(--accent-3);font-weight:700">write ack</text>`;
          if (rd) s += `<text class="svg-label" x="${x}" y="104" text-anchor="middle" style="fill:var(--accent-2);font-weight:700">read</text>`;
        }
        q(`viz`).innerHTML = svgWrap(520, 115, s) + `<div style="margin-top:6px">${strong ? chip(`R + W = ${st.r + st.w} &gt; N = ${st.n}: read and write sets overlap`, `ok`) : chip(`R + W = ${st.r + st.w} &le; N = ${st.n}: reads may miss the latest write`, `no`)}</div>`;
        q(`stats`).innerHTML = stat(`stale reads`, R.measured ? pct(R.staleP, 1) : `-`, R.staleP > 0.01 ? `bad` : `good`) + stat(`writes available`, R.wAvail ? `yes` : `no`, R.wAvail ? `good` : `bad`) + stat(`reads available`, R.rAvail ? `yes` : `no`, R.rAvail ? `good` : `bad`) + stat(`write latency`, R.measured ? ms(R.wLat) : `-`) + stat(`read latency`, R.measured ? ms(R.rLat) : `-`);
        let n;
        if (!R.wAvail || !R.rAvail) { const f = [!R.wAvail && `writes (need W = ${st.w})`, !R.rAvail && `reads (need R = ${st.r})`].filter(Boolean).join(` and `); n = `With ${st.down} replica${st.down > 1 ? `s` : ``} down only ${st.n - st.down} can respond, so ${f} fail. That's the CAP trade-off in miniature: stronger quorums need more replicas reachable.`; }
        else if (strong) n = `Every read set overlaps the replicas that acknowledged the latest write, so reads see it (stale reads ${pct(R.staleP, 1)}). With N = ${st.n} this tolerates ${Math.min(st.n - st.w, st.n - st.r)} replica${Math.min(st.n - st.w, st.n - st.r) === 1 ? `` : `s`} down for both reads and writes.`;
        else n = `R + W isn't greater than N, so a read can land only on replicas the write hasn't reached yet: ${pct(R.staleP, 1)} of reads are stale with a ${st.lag} ms lag. Faster and more available, but only eventually consistent.${st.lag ? ` Lower the lag to see staleness shrink.` : ` Even with no extra lag, a read can arrive before the write has propagated over the network.`}`;
        q(`note`).innerHTML = note(n, strong && R.wAvail === 1 && R.rAvail === 1 ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { w: v => v, r: v => v, lag: v => v + ` ms`, down: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch18 - Latency ladder
  // =====================================================================
  const LL_OPS = [
    [`L1 cache reference`, 1], [`Branch mispredict`, 3], [`L2 cache reference`, 4], [`Mutex lock/unlock`, 17], [`Main memory reference`, 100],
    [`Compress 1 KB`, 2000], [`Read 1 MB from memory`, 15000], [`SSD random read 4 KB`, 20000], [`Redis GET, same AZ`, 300000],
    [`RTT within an AZ`, 500000], [`Read 1 MB from SSD`, 500000], [`RTT across AZs`, 1500000], [`Indexed DB query`, 5000000],
    [`HDD seek`, 10000000], [`Read 1 MB from HDD`, 5000000], [`RTT US East-West`, 65000000], [`RTT US-Europe`, 90000000], [`RTT US-Asia`, 150000000]
  ];
  const fmtNs = ns => ns < 1000 ? ns + ` ns` : ns < 1e6 ? round(ns / 1000, 1) + ` µs` : ns < 1e9 ? round(ns / 1e6, 1) + ` ms` : round(ns / 1e9, 2) + ` s`;
  const fmtHuman = s => s < 60 ? round(s, 0) + ` s` : s < 3600 ? round(s / 60, 1) + ` min` : s < 86400 ? round(s / 3600, 1) + ` hours` : s < 86400 * 365 ? round(s / 86400, 1) + ` days` : round(s / 86400 / 365, 1) + ` years`;
  D.latencyLadder = {
    title: `The latency ladder: from CPU cache to another continent`,
    blurb: `Approximate latencies on modern hardware and cloud networks, on a log scale (each step is 10x). Switch to the human scale, where 1 nanosecond becomes 1 second, to feel the gaps: memory is a couple of minutes, an SSD read is hours, and a cross-region round trip is years.`,
    mount(el) {
      const st = { scale: `real`, group: `all` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`show as`, seg(`scale`, [[`real`, `real time`], [`human`, `if 1 ns were 1 s`]], st.scale))}${ctl(`filter`, seg(`group`, [[`all`, `everything`], [`storage`, `memory and storage`], [`net`, `network`]], st.group))}</div>
        <div class="lab-panel"><div data-k="bars"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const ops = LL_OPS.filter(([n]) => st.group === `all` || (st.group === `net` ? /RTT|Redis/.test(n) : !/RTT|Redis/.test(n))).slice().sort((a, b) => a[1] - b[1]);
        const lg = v => Math.log10(v) + 0.3;
        const mx = lg(150000000);
        q(`bars`).innerHTML = hbars(ops.map(([n, v]) => ({ label: n, value: lg(v), max: mx, text: st.scale === `real` ? fmtNs(v) : fmtHuman(v), cls: /RTT/.test(n) ? `warn` : /memory|cache|Mutex|Branch|Compress/i.test(n) ? `good` : `alt` })), mx);
        q(`note`).innerHTML = note(`RTT is a network round trip. Memory is about 100x slower than L1 cache, an SSD read about 200x slower than memory, a same-zone network round trip about 25x slower than an SSD read, and crossing an ocean about 200x slower again. Design consequences: keep hot data in memory (caches), keep chatty calls within a region, and treat every cross-region round trip as expensive. Numbers are rough and vary by hardware; the orders of magnitude are what matter.`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch18 - Back-of-the-envelope estimator
  // =====================================================================
  const EST = { dbWrites: 10000, dbReads: 20000, redis: 100000, app: 5000, dbStore: 10e12 };
  const fmtB = b => b >= 1e15 ? round(b / 1e15, 1) + ` PB` : fmtBytes(Math.round(b));
  D.estimator = {
    title: `Back-of-the-envelope estimator: do you need a cache or shards?`,
    blurb: `Turn daily active users into requests per second, storage and bandwidth, then compare them with rough single-node limits: about ${fmtNum(EST.app)} requests/s per app server, ${fmtNum(EST.dbWrites)} writes/s and ${fmtNum(EST.dbReads)} reads/s for one relational primary, ${fmtNum(EST.redis)} ops/s per Redis node, and ~10 TB as a comfortable single-database size. Rules of thumb, not benchmarks.`,
    mount(el) {
      const st = { dau: 6, reads: 50, writes: 5, size: 1, peak: 3, years: 5, hit: 90 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`daily active users`, rng(`dau`, 4, 9, 0.1, st.dau))}${ctl(`reads per user per day`, rng(`reads`, 1, 500, 1, st.reads))}${ctl(`writes per user per day`, rng(`writes`, 0, 100, 1, st.writes))}</div>
        <div class="ctl-row">${ctl(`bytes per write (KB)`, rng(`size`, 0.1, 50, 0.1, st.size))}${ctl(`peak / average`, seg(`peak`, [[2, `2x`], [3, `3x`], [5, `5x`], [10, `10x`]], st.peak))}${ctl(`retention (years)`, rng(`years`, 1, 10, 1, st.years))}${ctl(`cache hit ratio`, rng(`hit`, 0, 99, 1, st.hit))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Estimates</h4><div class="stat-row" data-k="stats"></div><div data-k="math"></div></div>
          <div class="lab-panel"><h4>What this implies</h4><div data-k="verdict"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const dau = Math.pow(10, st.dau);
        const rAvg = dau * st.reads / 86400, wAvg = dau * st.writes / 86400;
        const rPeak = rAvg * st.peak, wPeak = wAvg * st.peak;
        const store = dau * st.writes * st.size * 1000 * 365 * st.years;
        const dbReads = rPeak * (1 - st.hit / 100);
        const bw = (rPeak * 10e3 + wPeak * st.size * 1000);
        const apps = Math.max(2, Math.ceil((rPeak + wPeak) / EST.app * 1.3));
        q(`stats`).innerHTML = stat(`read QPS (avg / peak)`, `${fmtNum(rAvg)} / ${fmtNum(rPeak)}`) + stat(`write QPS (avg / peak)`, `${fmtNum(wAvg)} / ${fmtNum(wPeak)}`) + stat(`read:write`, st.writes ? round(st.reads / st.writes, 1) + `:1` : `reads only`) + stat(`storage after ${st.years} yr`, fmtB(store)) + stat(`peak egress (10 KB responses)`, fmtB(bw) + `/s`);
        q(`math`).innerHTML = `<div class="cs-note" style="margin-top:8px">${fmtNum(dau)} users x ${st.reads} reads / 86,400 s = ${fmtNum(rAvg)} reads/s on average; x${st.peak} at peak. Storage: ${fmtNum(dau * st.writes)} writes/day x ${st.size} KB x 365 x ${st.years}.</div>`;
        const row = (ok, label, detail) => `<tr><td>${ok === null ? chip(`fine`, `muted`) : ok ? chip(`needed`, `no`) : chip(`not needed`, `ok`)}</td><td style="white-space:normal"><b>${label}</b><div class="cs-note" style="margin:2px 0 0">${detail}</div></td></tr>`;
        const needCache = rPeak > EST.dbReads * 0.5;
        const needReplicas = dbReads > EST.dbReads;
        const needShardW = wPeak > EST.dbWrites;
        const needShardS = store > EST.dbStore;
        const redisNodes = Math.max(1, Math.ceil(rPeak * (st.hit / 100) / EST.redis));
        q(`verdict`).innerHTML = `<table class="mini-table">
          ${row(null, `${apps} stateless app servers`, `${fmtNum(rPeak + wPeak)} peak req/s at ~${fmtNum(EST.app)} each, plus 30% headroom.`)}
          ${row(needCache, `Cache in front of the database`, needCache ? `${fmtNum(rPeak)} peak reads/s is a lot for one database; at ${st.hit}% hits the DB sees ${fmtNum(dbReads)}/s. ${redisNodes} Redis node${redisNodes > 1 ? `s` : ``}.` : `${fmtNum(rPeak)} peak reads/s fits a single well-indexed database.`)}
          ${row(needReplicas, `Read replicas`, needReplicas ? `Even after the cache, ${fmtNum(dbReads)} reads/s exceeds one node (~${fmtNum(EST.dbReads)}).` : `Database read load after caching (${fmtNum(dbReads)}/s) fits one node.`)}
          ${row(needShardW || needShardS, `Sharding`, needShardW ? `${fmtNum(wPeak)} peak writes/s exceeds one primary (~${fmtNum(EST.dbWrites)}/s).` : needShardS ? `${fmtB(store)} exceeds ~10 TB per database; shard or move bulk data to object storage.` : `${fmtNum(wPeak)} writes/s and ${fmtB(store)} fit one primary. Don't shard.`)}
        </table>`;
        let n = needShardW || needShardS ? `The numbers justify sharding, so say which limit you hit and pick a shard key from the main access pattern.` : needCache ? `A single primary still works; the read volume is what calls for a cache (and maybe replicas). Sharding here would be premature.` : `Everything fits on a single database with a couple of app servers. Saying so, with the numbers, is a stronger answer than reaching for sharding and caches by reflex.`;
        if (st.size >= 10) n += ` At ${st.size} KB per write you're likely storing media or documents; put the blobs in object storage and keep only metadata in the database.`;
        q(`note`).innerHTML = note(n, needShardW || needShardS ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { dau: v => fmtNum(Math.pow(10, v)), reads: v => v, writes: v => v, size: v => v + ` KB`, years: v => v, hit: v => v + `%` }, draw);
      draw();
    }
  };
})();
