// Problem breakdown labs: YouTube Top K
(function () {
  "use strict";
  const { esc, clamp, sum, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, path, fmtNum, pct } = window.LabKit;
  const D = (window.DEMOS = window.DEMOS || {});
  const PAL = [`var(--accent)`, `var(--accent-2)`, `var(--accent-3)`, `#a78bfa`, `#f472b6`, `#4ade80`, `#f87171`, `#facc15`];
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const fmtB = b => { const a = Math.abs(b); if (a >= 1e15) return round(b / 1e15, 2) + ` PB`; if (a >= 1e12) return round(b / 1e12, 2) + ` TB`; if (a >= 1e9) return round(b / 1e9, 1) + ` GB`; if (a >= 1e6) return round(b / 1e6, 1) + ` MB`; if (a >= 1e3) return round(b / 1e3, 1) + ` KB`; return Math.round(b) + ` B`; };
  const fmtT = s => s >= 86400 ? round(s / 86400, 1) + ` days` : s >= 3600 ? round(s / 3600, 1) + ` h` : s >= 60 ? round(s / 60, 1) + ` min` : s >= 1 ? round(s, 1) + ` s` : s >= 1e-3 ? round(s * 1e3, 1) + ` ms` : round(s * 1e6, 0) + ` µs`;
  const hashInt = (x, s) => { let h = Math.imul((x | 0) ^ (s | 0), 0x9e3779b1); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
  const gauss = r => { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const zipfCdf = (n, s) => { const c = new Float64Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc += 1 / Math.pow(i + 1, s); c[i] = acc; } for (let i = 0; i < n; i++) c[i] /= acc; return c; };
  const zipfPick = (cdf, u) => { let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } return lo; };
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });
  const clock = m => { const t = 8 * 60 + Math.round(m); return String(Math.floor(t / 60)).padStart(2, `0`) + `:` + String(t % 60).padStart(2, `0`); };

  // =====================================================================
  // Ch1 - Back-of-the-envelope estimator
  // =====================================================================
  D.topkEstimator = {
    title: `Back-of-the-envelope: how big is YouTube Top K?`,
    blurb: `Turn the headline numbers into the ones that shape the design: writes per second, how many videos exist, how much memory one set of counters needs, and how many database nodes per-event writes would take. Assumed: peak traffic is 2× the average; a counter is an 8-byte ID plus an 8-byte count, or ~60 bytes as a Postgres row with an index entry.`,
    mount(el) {
      const st = { vpd: 10.85, secs: `short`, upl: 1, len: 6, years: 10, node: 10000 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`views per day`, rng(`vpd`, 9, 11.5, 0.05, st.vpd))}${ctl(`seconds per day`, seg(`secs`, [[`short`, `~100K (shortcut)`], [`exact`, `86,400`]], st.secs))}</div>
        <div class="ctl-row">${ctl(`hours of video uploaded per second`, rng(`upl`, 0.1, 5, 0.1, st.upl))}${ctl(`average video length`, rng(`len`, 1, 20, 1, st.len))}${ctl(`years of catalogue`, rng(`years`, 1, 20, 1, st.years))}</div>
        <div class="ctl-row">${ctl(`indexed writes / s one DB node sustains`, rng(`node`, 2000, 50000, 1000, st.node))}</div>
        <div class="lab-panel"><h4>Writes per second vs one database node (log scale)</h4><div data-k="bars"></div><div class="stat-row" data-k="stats" style="margin-top:12px"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const vpd = Math.pow(10, st.vpd), spd = st.secs === `short` ? 1e5 : 86400;
        const avg = vpd / spd, peak = avg * 2;
        const vidsPerDay = st.upl * 3600 / (st.len * 60) * spd;
        const catalog = vidsPerDay * 365 * st.years;
        const raw = catalog * 16, pg = catalog * 60;
        const shards = Math.ceil(peak / st.node);
        const lg = v => Math.log10(Math.max(1, v));
        q(`bars`).innerHTML = hbars([
          { label: `one DB node`, value: lg(st.node), text: fmtNum(st.node) + `/s`, cls: `good` },
          { label: `average views`, value: lg(avg), text: fmtNum(avg) + `/s`, cls: `warn` },
          { label: `peak views (2×)`, value: lg(peak), text: fmtNum(peak) + `/s`, cls: `bad` }
        ], 7);
        q(`stats`).innerHTML = stat(`average writes / s`, fmtNum(avg)) + stat(`peak writes / s`, fmtNum(peak), peak > st.node ? `bad` : `good`) + stat(`new videos / day`, fmtNum(vidsPerDay)) + stat(`catalogue after ${st.years} years`, fmtNum(catalog)) + stat(`one set of counters (16 B each)`, fmtB(raw), raw < 256e9 ? `good` : `warn`) + stat(`as Postgres rows + index (~60 B)`, fmtB(pg)) + stat(`DB nodes for per-event writes at peak`, fmtNum(shards, 0), shards > 10 ? `bad` : shards > 1 ? `warn` : `good`);
        let n = `${fmtNum(vpd)} views a day is about ${fmtNum(avg)} writes per second on average and ${fmtNum(peak)} at peak, ${round(peak / st.node, 0)}× what one node can apply as indexed updates. Writing every view to a database would take about ${fmtNum(shards, 0)} nodes, which is why the design aggregates in the stream first.`;
        n += ` The catalogue reaches ~${fmtNum(catalog)} videos, so one full set of counters is ${fmtB(raw)}: it fits in memory on one large machine, but you need one such set per window.`;
        if (st.secs === `exact`) n += ` Using 86,400 instead of 100K changes the answer by ~15%, which doesn't change any decision; round numbers keep you fast.`;
        q(`note`).innerHTML = note(n, peak > st.node ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { vpd: v => fmtNum(Math.pow(10, v)), upl: v => round(v, 1) + ` h/s`, len: v => v + ` min`, years: v => v, node: v => fmtNum(v) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch1 - Tumbling vs sliding windows, plus lateness
  // =====================================================================
  const WT_VIDS = [
    [`Weeknight cooking basics`, m => 40 + 4 * Math.sin(m / 9)],
    [`Cup final highlights`, m => 8 + 150 * Math.exp(-(((m - 118) / 8) ** 2))],
    [`New album, full stream`, m => 95 * Math.exp(-m / 75) + 10],
    [`Election night live`, m => 14 + 75 * Math.exp(-(((m - 85) / 15) ** 2))],
    [`Lo-fi beats to study to`, m => 33 + 3 * Math.cos(m / 13)]
  ];
  let wtSeries = null;
  const wtData = () => wtSeries || (wtSeries = WT_VIDS.map(([, f], i) => { const r = mulberry32(31 + i); return Array.from({ length: 180 }, (_, m) => Math.max(0, f(m) * (1 + gauss(r) * 0.08))); }));
  const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
  const lateFrac = W => { const ln = W <= 0 ? 1 : 1 - 0.5 * (1 + erf((Math.log(W) - Math.log(2)) / (1.2 * Math.SQRT2))); const off = W < 30 ? 1 : clamp((600 - W) / 570, 0, 1); return 0.97 * ln + 0.03 * off; };
  D.windowTypes = {
    title: `Tumbling vs sliding windows, and how long to wait for late views`,
    blurb: `Five videos over three hours (views per minute, in thousands). Move "now" and compare what "the last hour" means under each window type. Below: view events reach the pipeline after a delay (most within seconds, a few from devices that were offline for minutes); the watermark decides how long a window waits before its result is final.`,
    mount(el) {
      const st = { now: 126, win: `tumble`, wm: 30 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`now`, rng(`now`, 60, 179, 1, st.now))}${ctl(`"last hour" means`, seg(`win`, [[`tumble`, `tumbling (last full hour)`], [`slide`, `sliding (trailing 60 min)`]], st.win))}</div>
        <div class="lab-panel"><h4>Views per minute; shaded = the window being counted</h4><div data-k="chart"></div><div class="legend">${WT_VIDS.map(([t], i) => `<span><i class="sw line" style="background:${PAL[i]}"></i>${t}</span>`).join(``)}</div></div>
        <div class="lab-grid" style="margin-top:14px">
          <div class="lab-panel"><h4>Ranking under each window type</h4><div data-k="tbl"></div></div>
          <div class="lab-panel"><h4>Late events vs watermark delay</h4><div class="ctl-row">${ctl(`watermark delay`, rng(`wm`, 0, 120, 5, st.wm))}</div><div data-k="late"></div><div class="stat-row" data-k="lstats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const S = wtData();
        const t = st.now, hb = Math.floor(t / 60) * 60;
        const W = { tumble: [hb - 60, hb], slide: [t - 60, t] };
        const [a, b] = W[st.win];
        const ax = axes({ x0: 40, x1: 760, y0: 190, y1: 12, dx0: 0, dx1: 180, dy0: 0, dy1: 170, xTicks: [0, 30, 60, 90, 120, 150, 180], yTicks: [0, 50, 100, 150], xFmt: clock, yFmt: v => v + `K` });
        let s = `<rect x="${ax.X(a)}" y="12" width="${ax.X(b) - ax.X(a)}" height="178" style="fill:var(--accent);opacity:.12"/>` + ax.svg;
        S.forEach((ser, i) => { s += `<path d="${path(ser.map((v, m) => [ax.X(m), ax.Y(Math.min(170, v))]))}" style="fill:none;stroke:${PAL[i]};stroke-width:1.8"/>`; });
        s += `<line x1="${ax.X(t)}" x2="${ax.X(t)}" y1="12" y2="190" style="stroke:var(--text);stroke-dasharray:4 3"/><text class="svg-label" x="${ax.X(t) + 4}" y="24">now ${clock(t)}</text>`;
        q(`chart`).innerHTML = svgWrap(780, 220, s);
        const tot = ([lo, hi]) => S.map((ser, i) => ({ i, v: sum(ser.slice(lo, hi)) })).sort((x, y) => y.v - x.v);
        const T = tot(W.tumble), L = tot(W.slide);
        const rows = [0, 1, 2, 3, 4].map(r => `<tr><td>${r + 1}</td><td style="white-space:normal;${st.win === `tumble` ? `font-weight:700` : ``}">${esc(WT_VIDS[T[r].i][0])} <span class="mono" style="opacity:.7">${fmtNum(T[r].v * 1000)}</span></td><td style="white-space:normal;${st.win === `slide` ? `font-weight:700` : ``}">${esc(WT_VIDS[L[r].i][0])} <span class="mono" style="opacity:.7">${fmtNum(L[r].v * 1000)}</span></td></tr>`).join(``);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table" style="table-layout:fixed;width:100%"><tr><th style="width:22px">#</th><th style="white-space:normal">tumbling ${clock(W.tumble[0])}-${clock(W.tumble[1])}</th><th style="white-space:normal">sliding ${clock(W.slide[0])}-${clock(W.slide[1])}</th></tr>${rows}</table></div>`;
        const ax2 = axes({ x0: 46, x1: 370, y0: 150, y1: 12, dx0: 0, dx1: 120, dy0: 0, dy1: 0.5, xTicks: [0, 30, 60, 90, 120], yTicks: [0, 0.25, 0.5], xFmt: v => v + ` s`, yFmt: v => pct(v), xLabel: `watermark delay` });
        const pts = []; for (let w = 0; w <= 120; w += 2) pts.push([ax2.X(w), ax2.Y(Math.min(0.5, lateFrac(w)))]);
        const lf = lateFrac(st.wm);
        let s2 = ax2.svg + `<line x1="${ax2.X(60)}" x2="${ax2.X(60)}" y1="12" y2="150" style="stroke:var(--warn);stroke-dasharray:4 3"/><text class="svg-label" x="${ax2.X(60) + 4}" y="24">1-min budget</text>`;
        s2 += `<path d="${path(pts)}" style="fill:none;stroke:var(--accent);stroke-width:2"/><circle cx="${ax2.X(st.wm)}" cy="${ax2.Y(Math.min(0.5, lf))}" r="5" style="fill:var(--accent-3)"/>`;
        q(`late`).innerHTML = svgWrap(390, 180, s2);
        q(`lstats`).innerHTML = stat(`views arriving after the watermark`, pct(lf, lf < 0.01 ? 2 : 1), lf > 0.05 ? `bad` : lf > 0.02 ? `warn` : `good`) + stat(`late views / s at 800K/s`, fmtNum(lf * 8e5)) + stat(`window final after it ends`, st.wm + ` s`, st.wm > 60 ? `bad` : `good`);
        const same = T.every((x, i) => x.i === L[i].i);
        let n = st.win === `tumble`
          ? `At ${clock(t)} the tumbling "last hour" is ${clock(W.tumble[0])}-${clock(W.tumble[1])}: each view counts in exactly one window, and this answer won't change until ${clock(hb + 60)}.`
          : `At ${clock(t)} the sliding "last hour" is ${clock(t - 60)}-${clock(t)}. Each minute, the newest minute is added and the oldest one subtracted, so the system must still remember the counts from an hour ago.`;
        n += same ? ` Here both window types give the same ranking.` : ` The rankings differ: the sliding window ${L[0].i !== T[0].i ? `puts "${WT_VIDS[L[0].i][0]}" on top` : `reorders the list`} because it includes the last ${t - hb} minutes, which tumbling hasn't counted yet.`;
        n += ` With a ${st.wm}-second watermark, ${pct(lf, 1)} of views arrive too late for their window${st.wm > 60 ? `, but waiting longer than the 1-minute freshness budget breaks the requirement` : lf > 0.06 ? `; most of them are ordinary network delay of a few seconds, so a slightly longer watermark would catch them` : lf > 0.03 ? `; that's mostly the long tail of offline devices, which no reasonable delay will catch, so drop or correct them` : ``}.`;
        q(`note`).innerHTML = note(n, st.wm > 60 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { now: v => clock(v), wm: v => v + ` s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch2 - Serving strategies
  // =====================================================================
  const SV_C = 8, SV_SERVERS = 20, SV_WINDOWS = 4;
  const SV_S = { direct: `query every request`, ttl: `cache with TTL`, coalesce: `TTL + coalescing`, pre: `scheduled precompute` };
  function svModel(k, st) {
    const cap = SV_C / st.q;
    if (k === `direct`) {
      const over = st.rps > cap;
      return { dbq: st.rps * 3600, slow: 1, worst: over ? Infinity : st.q, stale: 0, over };
    }
    if (k === `ttl` || k === `coalesce`) {
      const exp = 3600 / st.ttl * SV_WINDOWS;
      const herd = k === `ttl` ? st.rps * st.q / SV_WINDOWS : SV_SERVERS;
      const worst = st.q * Math.max(1, herd / SV_C);
      const slowReq = exp * (st.rps / SV_WINDOWS) * Math.min(worst, st.ttl);
      return { dbq: exp * herd, slow: Math.min(1, slowReq / (st.rps * 3600)), worst, stale: st.ttl, herd };
    }
    const runs = 3600 / st.refresh * SV_WINDOWS;
    return { dbq: runs, slow: 0, worst: 0.001, stale: st.refresh + st.q, behind: st.q * SV_WINDOWS / SV_C > st.refresh };
  }
  D.servingStrategy = {
    title: `Serving top K: query, cache with a TTL, or precompute?`,
    blurb: `Clients ask for four windows. Computing one window's top K from the database takes the chosen number of seconds. Assumed: the database can run ${SV_C} of these heavy queries at once, there are ${SV_SERVERS} API servers, and a cache hit takes ~1 ms. The latency target is 50 ms.`,
    mount(el) {
      const st = { strat: `ttl`, rps: 2000, q: 15, ttl: 300, refresh: 60 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`strategy`, seg(`strat`, Object.keys(SV_S).map(k => [k, SV_S[k]]), st.strat))}</div>
        <div class="ctl-row">${ctl(`top-K requests / s`, rng(`rps`, 100, 20000, 100, st.rps))}${ctl(`time to compute one window`, rng(`q`, 1, 60, 1, st.q))}${ctl(`cache TTL`, rng(`ttl`, 60, 3600, 60, st.ttl))}${ctl(`precompute every`, rng(`refresh`, 15, 300, 15, st.refresh))}</div>
        <div class="lab-panel"><h4>Latency over 30 minutes (log scale)</h4><div data-k="chart"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>All strategies</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const M = {}; Object.keys(SV_S).forEach(k => { M[k] = svModel(k, st); });
        const m = M[st.strat];
        const ax = axes({ x0: 50, x1: 760, y0: 170, y1: 12, dx0: 0, dx1: 1800, dy0: 0, dy1: 5.3, xTicks: [0, 300, 600, 900, 1200, 1500, 1800], yTicks: [0, 1.7, 3, 4.7], xFmt: v => v / 60 + ` min`, yFmt: v => [`1 ms`, `50 ms`, `1 s`, `50 s`][[0, 1.7, 3, 4.7].indexOf(v)] });
        const pts = [];
        for (let t = 0; t <= 1800; t += 2) {
          let ms = 1;
          if (st.strat === `direct`) ms = m.over ? Math.min(2e5, st.q * 1000 * (1 + t * (st.rps - SV_C / st.q) / SV_C)) : st.q * 1000;
          else if (st.strat !== `pre`) { const ph = t % st.ttl; if (ph < Math.min(m.worst, st.ttl)) ms = Math.max(1, (Math.min(m.worst, st.ttl) - ph) * 1000); }
          pts.push([ax.X(t), ax.Y(Math.log10(Math.max(1, ms)))]);
        }
        let s = ax.svg + `<line x1="50" x2="760" y1="${ax.Y(1.7)}" y2="${ax.Y(1.7)}" style="stroke:var(--warn);stroke-dasharray:4 3"/>`;
        s += `<path d="${path(pts)}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        q(`chart`).innerHTML = svgWrap(780, 200, s);
        const worstTxt = v => v === Infinity ? `unbounded` : v <= 0.002 ? `~1 ms` : v > 3600 ? `over 1 h` : fmtT(v);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>strategy</th><th class="num">DB queries / hour</th><th class="num">requests over 50 ms</th><th class="num">worst latency</th><th class="num">max staleness</th></tr>${Object.keys(SV_S).map(k => { const x = M[k]; return `<tr class="${k === st.strat ? `new` : ``}"><td>${SV_S[k]}</td><td class="num">${fmtNum(Math.round(x.dbq))}</td><td class="num" style="${x.slow > 0.001 ? `color:var(--bad);font-weight:700` : ``}">${pct(x.slow, x.slow < 0.01 ? 2 : 0)}</td><td class="num">${worstTxt(x.worst)}</td><td class="num">${x.stale ? fmtT(x.stale) : `none`}</td></tr>`; }).join(``)}</table></div>`;
        const N = {
          direct: m.over ? `${fmtNum(st.rps)} requests per second, each needing a ${st.q}-second query, against a database that can finish ${round(SV_C / st.q, 2)} per second: the queue grows without bound. Never aggregate on the request path.` : `Every request waits ${st.q} s for the database. Correct and fresh, but nowhere near the 50 ms target.`,
          ttl: `Hits are ~1 ms, but every ${fmtT(st.ttl)} each window's key expires and every request in the next few seconds fires the query itself: ~${fmtNum(m.herd)} parallel copies against ${SV_C} slots, ${m.worst > 120 ? `a backlog that would take the database ~${fmtT(m.worst)} to clear, so in practice those requests time out` : `so those requests take ~${fmtT(m.worst)}`}. That's the expiry cliff.`,
          coalesce: `Coalescing lets one request per server run the query while the others wait, so the database sees ${SV_SERVERS} copies instead of thousands. But everyone waiting still sees ~${fmtT(m.worst)} at each expiry, so ${pct(m.slow, 2)} of requests miss the target.`,
          pre: `A job recomputes each window every ${fmtT(st.refresh)} and writes the cache before anyone asks, so every read is a hit and latency is flat. The cost is ${fmtNum(Math.round(m.dbq))} heavy queries an hour and answers up to ${fmtT(m.stale)} old.${m.behind ? ` At ${st.q} s per window the job can't finish all ${SV_WINDOWS} windows within the interval; make the query cheaper (per-window totals, Ch 4) or refresh less often.` : ``}`
        };
        q(`note`).innerHTML = note(N[st.strat], st.strat === `pre` && !m.behind ? `good` : st.strat === `direct` ? `bad` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { rps: v => fmtNum(v), q: v => v + ` s`, ttl: v => fmtT(v), refresh: v => fmtT(v) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch3 - Sharding and merging per-shard top K
  // =====================================================================
  const SM_U = 3000, SM_E = 300000;
  const SM_P = { key: `by video ID`, rr: `round robin`, two: `round robin, then re-key (two stage)` };
  function smSim(st, seed) {
    const r = mulberry32(seed), cdf = zipfCdf(SM_U, 0.9), S = st.shards;
    const perm = Array.from({ length: SM_U }, (_, i) => i);
    for (let i = SM_U - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const truth = new Int32Array(SM_U), local = Array.from({ length: S }, () => new Int32Array(SM_U)), load = new Array(S).fill(0);
    for (let i = 0; i < SM_E; i++) {
      const v = st.viral === `on` && r() < 0.15 ? perm[40] : perm[zipfPick(cdf, r())];
      truth[v]++;
      const sh = st.part === `key` ? hashInt(v, 5) % S : i % S;
      local[sh][v]++; load[sh]++;
    }
    const K = st.k;
    const topOf = arr => Array.from(arr.keys()).filter(i => arr[i] > 0).sort((a, b) => arr[b] - arr[a]).slice(0, K);
    const merged = new Map();
    let stage2 = null;
    if (st.part === `two`) {
      stage2 = new Array(S).fill(0);
      const tot = new Int32Array(SM_U);
      local.forEach(arr => arr.forEach((c, v) => { if (c) { tot[v] += c; stage2[hashInt(v, 5) % S]++; } }));
      topOf(tot).forEach(v => merged.set(v, tot[v]));
    } else {
      local.forEach(arr => topOf(arr).forEach(v => merged.set(v, (merged.get(v) || 0) + arr[v])));
    }
    const mergedTop = Array.from(merged.entries()).sort((a, b) => b[1] - a[1]).slice(0, K);
    const trueTop = topOf(truth);
    return { truth, trueTop, mergedTop, load, stage2 };
  }
  D.shardMerge = {
    title: `Sharding counters: when is "merge each shard's top K" exact?`,
    blurb: `${fmtNum(SM_E)} views of ${fmtNum(SM_U)} videos are split across shards. Each shard reports its own top K and the lists are merged by adding counts. Compare partitioning by video ID with spreading events round robin, and see what a viral video does to shard load.`,
    mount(el) {
      const st = { part: `key`, shards: 8, k: 10, viral: `off` };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`partition events`, seg(`part`, Object.keys(SM_P).map(k => [k, SM_P[k]]), st.part))}</div>
        <div class="ctl-row">${ctl(`shards`, rng(`shards`, 2, 16, 1, st.shards))}${ctl(`K`, rng(`k`, 5, 20, 1, st.k))}${ctl(`one viral video (15% of views)`, seg(`viral`, [[`off`, `off`], [`on`, `on`]], st.viral))}</div>
        <div class="ctl-row">${againBtn}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Merged top K vs the true top K</h4><div data-k="tbl"></div></div>
          <div class="lab-panel"><h4 data-k="loadTitle">Events per shard</h4><div data-k="load"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = smSim(st, seed * 13 + 1);
        const trueSet = new Set(R.trueTop);
        const correct = R.mergedTop.filter(([v]) => trueSet.has(v)).length;
        const exactCounts = R.mergedTop.filter(([v, c]) => c === R.truth[v]).length;
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>#</th><th>merged result</th><th class="num">reported</th><th class="num">true count</th><th>in true top K?</th></tr>${R.mergedTop.map(([v, c], i) => `<tr><td>${i + 1}</td><td class="mono">video:${v}</td><td class="num">${c.toLocaleString(`en-US`)}</td><td class="num" style="${c !== R.truth[v] ? `color:var(--warn);font-weight:700` : ``}">${R.truth[v].toLocaleString(`en-US`)}</td><td>${trueSet.has(v) ? chip(`yes`, `ok`) : chip(`no`, `no`)}</td></tr>`).join(``)}</table></div>`;
        const ld = R.stage2 || R.load, mean = sum(ld) / ld.length, mx = Math.max(...ld), s2 = R.stage2 ? sum(R.stage2) : 0;
        q(`loadTitle`).textContent = R.stage2 ? `Messages per shard in the keyed second stage` : `Events per shard`;
        q(`load`).innerHTML = hbars(ld.map((v, i) => ({ label: `shard ${i}`, value: v, text: fmtNum(v), cls: v === mx && mx > 1.5 * mean ? `bad` : `` })));
        q(`stats`).innerHTML = stat(`true top K found`, `${correct} / ${st.k}`, correct === st.k ? `good` : `bad`) + stat(`reported counts that are exact`, `${exactCounts} / ${st.k}`, exactCounts === st.k ? `good` : `warn`) + stat(`busiest shard vs average`, round(mx / mean, 2) + `×`, mx / mean > 1.5 ? `bad` : mx / mean > 1.2 ? `warn` : `good`) + (R.stage2 ? stat(`messages into stage 2 vs raw events`, `${fmtNum(s2)} vs ${fmtNum(SM_E)}`, `good`) : ``);
        const N = {
          key: `Each video lives on exactly one shard, so its full count is there and any video in the global top K must be in its own shard's top K: the merge finds ${correct} of ${st.k} with exact counts.${mx / mean > 1.5 ? ` The price is load: the shard that owns ${st.viral === `on` ? `the viral video` : `the most popular videos`} handles ${round(mx / mean, 1)}× the average.` : ``}`,
          rr: `Round robin balances load perfectly, but every video's views are split across ${st.shards} shards and each shard reports only its local top K. A merged count is exact only if the video made every shard's list. ${exactCounts === st.k && correct === st.k ? `This run was exact because the top ${st.k} are popular enough to top every shard; that luck runs out near the boundary of the list, with more shards or with flatter popularity.` : `Here ${st.k - exactCounts} of ${st.k} reported counts ${st.k - exactCounts === 1 ? `is` : `are`} too low${correct < st.k ? ` and ${st.k - correct} of the true top K ${st.k - correct === 1 ? `is` : `are`} missing` : `, though the right videos were found`}. The heavy hitters survive; the errors sit near position K.`}`,
          two: `Stage one counts locally wherever events land (even load); stage two re-keys the partial sums by video ID, so the final counts are exact. Stage two receives one message per (video, shard) pair, ${fmtNum(s2)} instead of ${fmtNum(SM_E)} events, so even a viral video arrives as a handful of partial sums.`
        };
        q(`note`).innerHTML = note(N[st.part], correct === st.k && exactCounts === st.k && mx / mean <= 1.5 ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { shards: v => v, k: v => v }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch3 - Pre-aggregation in the stream
  // =====================================================================
  function zipfDistinct(n, U, s) {
    let H = 0, Dn = 0;
    const bins = [];
    for (let lo = 1; lo <= U;) { const hi = Math.min(U, Math.max(lo, Math.floor(lo * 1.03))); bins.push([lo, hi]); lo = hi + 1; }
    bins.forEach(([lo, hi]) => { const mid = (lo + hi) / 2; H += (hi - lo + 1) * Math.pow(mid, -s); });
    bins.forEach(([lo, hi]) => { const mid = (lo + hi) / 2, p = Math.pow(mid, -s) / H; Dn += (hi - lo + 1) * (1 - Math.exp(-n * p)); });
    return Dn;
  }
  const BW_INT = [1, 10, 60, 600, 3600];
  D.batchingWrites = {
    title: `Aggregating before writing: how many writes does it save?`,
    blurb: `Instead of one database write per view, the stream job sums views per video and flushes once per interval. The writes per flush equal the number of distinct videos watched in that interval, which a skewed popularity curve keeps small. Assumed: Zipf popularity over the active catalogue, ~40 B of in-memory state per distinct video, 10K upserts / s per database node.`,
    mount(el) {
      const st = { vps: 5.9, cat: 8, skew: 1, flush: 60 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`views / s`, rng(`vps`, 4, 6.5, 0.1, st.vps))}${ctl(`videos watched at all in a day`, rng(`cat`, 6, 9, 0.1, st.cat))}${ctl(`popularity skew`, seg(`skew`, [[0.8, `mild`], [1, `typical`], [1.2, `extreme`]], st.skew))}</div>
        <div class="ctl-row">${ctl(`flush every`, seg(`flush`, BW_INT.map(v => [v, fmtT(v)]), st.flush))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Database writes / s vs flush interval</h4><div data-k="chart"></div></div>
          <div class="lab-panel"><h4>At your interval</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const vps = Math.pow(10, st.vps), U = Math.round(Math.pow(10, st.cat));
        const pts = BW_INT.map(f => { const d = zipfDistinct(vps * f, U, st.skew); return { f, d, w: d / f }; });
        const cur = pts.find(p => p.f === st.flush);
        const lo = Math.floor(Math.log10(Math.min(...pts.map(p => p.w)))) , hi = Math.ceil(Math.log10(vps));
        const ax = axes({ x0: 56, x1: 370, y0: 170, y1: 12, dx0: 1, dx1: 3600, dy0: lo, dy1: hi, xLog: true, xTicks: BW_INT, yTicks: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), xFmt: v => fmtT(v), yFmt: v => fmtNum(Math.pow(10, v)), xLabel: `flush interval` });
        let s = ax.svg + `<line x1="56" x2="370" y1="${ax.Y(Math.log10(vps))}" y2="${ax.Y(Math.log10(vps))}" style="stroke:var(--bad);stroke-dasharray:4 3"/><text class="svg-label" x="60" y="${ax.Y(Math.log10(vps)) - 4}">one write per view</text>`;
        if (Math.log10(1e4) >= lo) s += `<line x1="56" x2="370" y1="${ax.Y(4)}" y2="${ax.Y(4)}" style="stroke:var(--good);stroke-dasharray:2 3"/><text class="svg-label" x="60" y="${ax.Y(4) - 4}">one DB node</text>`;
        s += `<path d="${path(pts.map(p => [ax.X(p.f), ax.Y(Math.log10(p.w))]))}" style="fill:none;stroke:var(--accent);stroke-width:2"/>` + pts.map(p => `<circle cx="${ax.X(p.f)}" cy="${ax.Y(Math.log10(p.w))}" r="${p.f === st.flush ? 6 : 3.5}" style="fill:${p.f === st.flush ? `var(--accent-3)` : `var(--accent)`}"/>`).join(``);
        q(`chart`).innerHTML = svgWrap(390, 200, s);
        const red = vps / cur.w, nodes = Math.max(1, Math.ceil(cur.w / 1e4));
        q(`stats`).innerHTML = stat(`views per flush`, fmtNum(vps * st.flush)) + stat(`distinct videos per flush (= writes)`, fmtNum(cur.d)) + stat(`DB writes / s`, fmtNum(cur.w), cur.w > 1e5 ? `bad` : cur.w > 1e4 ? `warn` : `good`) + stat(`reduction vs one write per view`, round(red, 1) + `×`, red > 10 ? `good` : ``) + stat(`DB nodes at 10K upserts / s`, fmtNum(nodes, 0), nodes > 10 ? `bad` : nodes > 2 ? `warn` : `good`) + stat(`state held in memory`, fmtB(cur.d * 40)) + stat(`extra delay before counts land`, `up to ${fmtT(st.flush)}`, st.flush > 60 ? `warn` : `good`);
        let n = `Flushing every ${fmtT(st.flush)}, the job sees ${fmtNum(vps * st.flush)} views but only ${fmtNum(cur.d)} distinct videos, so the database takes ${fmtNum(cur.w)} upserts per second, ${round(red, red < 10 ? 1 : 0)}× fewer than writing every view.`;
        if (st.flush > 60) n += ` Longer intervals save more, but counts land up to ${fmtT(st.flush)} late, beyond a 1-minute freshness budget. A common split: minute panes for freshness, written as hourly and daily totals.`;
        if (st.skew < 1) n += ` With mild skew, views are spread over more videos, so batching saves less.`;
        n += ` A crash loses nothing: the job restores its last checkpoint and replays the log from there.`;
        q(`note`).innerHTML = note(n, nodes <= 2 && st.flush <= 60 ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { vps: v => fmtNum(Math.pow(10, v)), cat: v => fmtNum(Math.pow(10, v)) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch4 - Cost of a windowed top-K query by design
  // =====================================================================
  const WQ_D = { buckets: `hour buckets, sum at query`, rollup: `hour + day rollups`, window: `per-window totals + index` };
  const WQ_GROW = { hour: 1, day: 4, month: 20 };
  function wqModel(d, win, A) {
    const Dw = A * WQ_GROW[win], K = 1000;
    const rows = d === `window` ? K : d === `buckets` ? { hour: A, day: 24 * A, month: 720 * A }[win] : { hour: A, day: 4 * A, month: 30 * 4 * A }[win];
    const groups = d === `window` ? 0 : Dw;
    const writes = { buckets: A, rollup: 2 * A, window: 4 * A }[d];
    return { rows, groups, writes, sec: d === `window` ? 0.005 : rows / 2e7 + groups * 5e-8 };
  }
  D.windowQueryCost = {
    title: `What it costs the refresher to compute each window`,
    blurb: `The refresher must produce the top 1,000 for each window. Compare storing hourly buckets (sum at query time), adding daily rollups, and keeping a running total per window with an index on views. Assumed: the number of distinct videos grows ~4× from an hour to a day and ~20× to a month; scanning and aggregating ~20M rows per second.`,
    mount(el) {
      const st = { active: 7.3, win: `day`, design: `buckets` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`distinct videos watched per hour`, rng(`active`, 6, 8, 0.1, st.active))}${ctl(`window`, seg(`win`, [[`hour`, `last hour`], [`day`, `last day`], [`month`, `last month`]], st.win))}</div>
        <div class="ctl-row">${ctl(`storage design`, seg(`design`, Object.keys(WQ_D).map(k => [k, WQ_D[k]]), st.design))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Rows read per refresh (log scale)</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>Selected design</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>All designs, all windows</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const A = Math.pow(10, st.active);
        const lg = v => Math.log10(Math.max(1, v));
        q(`bars`).innerHTML = hbars(Object.keys(WQ_D).map(d => { const m = wqModel(d, st.win, A); return { label: d === `window` ? `per-window totals` : d === `rollup` ? `rollups` : `hour buckets`, title: WQ_D[d], value: lg(m.rows), text: fmtNum(m.rows), cls: d === st.design ? `alt` : m.rows > 1e9 ? `bad` : `` }; }), 12);
        const m = wqModel(st.design, st.win, A);
        q(`stats`).innerHTML = stat(`rows read`, fmtNum(m.rows), m.rows > 1e9 ? `bad` : m.rows > 1e7 ? `warn` : `good`) + stat(`videos to aggregate in memory`, m.groups ? fmtNum(m.groups) : `none`) + stat(`hash table for the aggregation`, m.groups ? fmtB(m.groups * 50) : `-`) + stat(`time per refresh`, fmtT(m.sec), m.sec > 60 ? `bad` : m.sec > 5 ? `warn` : `good`) + stat(`rows written per hourly flush`, fmtNum(m.writes));
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>design</th><th class="num">hour</th><th class="num">day</th><th class="num">month</th><th class="num">writes / flush</th></tr>${Object.keys(WQ_D).map(d => `<tr class="${d === st.design ? `new` : ``}"><td>${WQ_D[d]}</td>${[`hour`, `day`, `month`].map(w => { const x = wqModel(d, w, A); return `<td class="num" style="${x.sec > 60 ? `color:var(--bad);font-weight:700` : ``}">${fmtT(x.sec)}</td>`; }).join(``)}<td class="num">${fmtNum(wqModel(d, `hour`, A).writes)}</td></tr>`).join(``)}</table></div><div class="cs-note">Times are per refresh of one window; the refresher repeats them every minute.</div>`;
        const N = {
          buckets: `Summing hourly buckets reads ${fmtNum(m.rows)} rows and aggregates ${fmtNum(m.groups)} videos for the last ${st.win}, about ${fmtT(m.sec)} per refresh${m.sec > 60 ? `, longer than the 1-minute refresh interval` : ``}.${st.win === `month` ? ` At this size the month window is a batch job, not a query.` : ` The same design takes ${fmtT(wqModel(`buckets`, `month`, A).sec)} for the last month.`}`,
          rollup: st.win === `hour` ? `For the last hour rollups change nothing: it is still ${fmtNum(m.rows)} hour rows and about ${fmtT(m.sec)}. They help long windows by summing day rows instead, but a refresh still has to aggregate every video watched in the window before it can sort.` : `Daily rollups cut the rows a long window has to sum (${fmtNum(m.rows)} for the last ${st.win}), but every refresh still aggregates all ${fmtNum(m.groups)} videos before it can sort, so long windows remain slow.`,
          window: `A running total per window with an index on views makes every refresh an index walk over 1,000 entries, a few milliseconds whatever the window. The cost moves to the write side: each hourly flush updates ${fmtNum(m.writes)} rows across four tables, which batched upserts handle.`
        };
        q(`note`).innerHTML = note(N[st.design], st.design === `window` ? `good` : m.sec > 60 ? `bad` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { active: v => fmtNum(Math.pow(10, v)) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch4 - Sliding counter: add the new minute, subtract the old
  // =====================================================================
  let scSeries = null;
  const scData = () => scSeries || (scSeries = (() => { const r = mulberry32(44); return Array.from({ length: 180 }, (_, m) => Math.max(0, Math.round(200 + 900 * Math.exp(-(((m - 95) / 10) ** 2)) + 60 * gauss(r)))); })());
  const SC_S = { all: `slide every window by minute`, hybrid: `slide hour, tumble day + month`, lagged: `lagged consumer subtracts` };
  D.slidingCounter = {
    title: `Sliding windows: add the newest minute, subtract the oldest`,
    blurb: `Top: one video's views per minute. The sliding "last hour" total is updated each minute by adding the minute that just finished and subtracting the minute that just left the window. Bottom: what that costs across the whole catalogue. Assumed: ~24 B per stored (video, minute) count, ~40 B per view event in Kafka.`,
    mount(el) {
      const st = { now: 110, mpm: 6.5, vpd: 10.85, strat: `hybrid` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`now`, rng(`now`, 61, 179, 1, st.now))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>One video, views per minute</h4><div data-k="chart"></div><div class="legend"><span><i class="sw" style="background:var(--good)"></i>added this minute</span><span><i class="sw" style="background:var(--bad)"></i>subtracted this minute</span><span><i class="sw" style="background:var(--accent)"></i>inside the window</span></div></div>
          <div class="lab-panel"><h4>The update</h4><div data-k="calc"></div><div class="stat-row" data-k="vstats" style="margin-top:10px"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>Across the catalogue</h4>
          <div class="ctl-row">${ctl(`distinct videos watched per minute`, rng(`mpm`, 5, 7.5, 0.1, st.mpm))}${ctl(`views per day`, rng(`vpd`, 10, 11.3, 0.05, st.vpd))}</div>
          <div class="ctl-row">${ctl(`strategy`, seg(`strat`, Object.keys(SC_S).map(k => [k, SC_S[k]]), st.strat))}</div>
          <div class="lab-grid"><div data-k="bars"></div><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const S = scData(), t = st.now;
        const add = S[t - 1], subIdx = t - 61, sub = subIdx >= 0 ? S[subIdx] : 0;
        const prev = sum(S.slice(Math.max(0, t - 61), t - 1)), cur = sum(S.slice(t - 60, t));
        const tumb = sum(S.slice(Math.floor(t / 60) * 60 - 60, Math.floor(t / 60) * 60));
        const W = 520, bw = W / 180, H = 160, mx = Math.max(...S);
        let s = ``;
        S.forEach((v, m) => {
          const col = m === t - 1 ? `var(--good)` : m === subIdx ? `var(--bad)` : m >= t - 60 && m < t ? `var(--accent)` : `#475569`;
          const h = v / mx * (H - 20);
          s += `<rect x="${round(m * bw, 2)}" y="${round(H - h, 1)}" width="${round(Math.max(1, bw - 0.6), 2)}" height="${round(h, 1)}" style="fill:${col};opacity:${m >= t - 61 && m < t ? 1 : 0.5}"/>`;
        });
        s += `<text class="svg-label" x="2" y="${H + 14}">${clock(0)}</text><text class="svg-label" x="${W - 2}" y="${H + 14}" text-anchor="end">${clock(180)}</text><text class="svg-label" x="${round((t - 0.5) * bw, 1)}" y="12" text-anchor="middle">now</text>`;
        q(`chart`).innerHTML = svgWrap(W, H + 20, s);
        q(`calc`).innerHTML = `<div class="mono" style="line-height:1.9">total(${clock(t - 1)}) = ${fmtNum(prev, 0)}<br>+ minute ${clock(t - 1)} = <span style="color:var(--good)">+${fmtNum(add, 0)}</span><br>− minute ${clock(subIdx)} = <span style="color:var(--bad)">−${fmtNum(sub, 0)}</span><br><b>total(${clock(t)}) = ${fmtNum(prev + add - sub, 0)}</b></div>`;
        q(`vstats`).innerHTML = stat(`sliding last hour (${clock(t - 60)}-${clock(t)})`, fmtNum(cur, 0)) + stat(`tumbling last hour`, fmtNum(tumb, 0)) + stat(`check: recomputed from scratch`, fmtNum(cur, 0) === fmtNum(prev + add - sub, 0) ? `matches` : `differs`, `good`);
        const M = Math.pow(10, st.mpm), vpd = Math.pow(10, st.vpd);
        const buckets = { all: 43200 * M * 24, hybrid: 60 * M * 24, lagged: 0 }[st.strat];
        const kafka = st.strat === `lagged` ? vpd * 30 * 40 : vpd * 1 * 40;
        const readsPerMin = { all: 3 * M, hybrid: M, lagged: 0 }[st.strat];
        const extraConsume = st.strat === `lagged` ? vpd / 86400 * 3 : 0;
        const tot = Object.keys(SC_S).map(k => ({ k, b: { all: 43200 * M * 24, hybrid: 60 * M * 24, lagged: 0 }[k] + vpd * (k === `lagged` ? 30 : 1) * 40 }));
        const lgB = b => Math.max(0.2, Math.log10(b) - 9);
        q(`bars`).innerHTML = `<div class="cs-note" style="margin:0 0 6px">Minute buckets plus Kafka retention, log scale</div>` + hbars(tot.map(({ k, b }) => ({ label: k === `all` ? `all sliding` : k, title: SC_S[k], value: lgB(b), text: fmtB(b), cls: k === st.strat ? `alt` : `` })), Math.max(...tot.map(x => lgB(x.b))));
        q(`stats`).innerHTML = stat(`minute buckets kept`, fmtB(buckets), buckets > 10e12 ? `bad` : buckets > 1e12 ? `warn` : `good`) + stat(`Kafka retention needed`, st.strat === `lagged` ? `30 days (${fmtB(kafka)})` : `~1 day (${fmtB(kafka)})`) + stat(`bucket rows read per minute to subtract`, fmtNum(readsPerMin)) + stat(`extra events consumed / s`, extraConsume ? fmtNum(extraConsume) : `0`);
        const N = {
          all: `Sliding the month at minute granularity means keeping 43,200 buckets for every video watched, ${fmtB(buckets)}, and reading three windows' worth of expired buckets every minute. Users won't notice the month moving minute by minute, so this buys almost nothing.`,
          hybrid: `Only the last hour slides, so only an hour of minute buckets is kept (${fmtB(buckets)}); the day and month windows tumble and need just a running total each. This matches what users actually notice.`,
          lagged: `A second consumer group reads the same topic exactly one window behind and subtracts each view as it passes, so there are no bucket tables. Instead Kafka keeps 30 days of events (${fmtB(kafka)}), which is cheap sequential storage, and the cluster reads each event once per sliding window.`
        };
        q(`note`).innerHTML = note(`At ${clock(t)} the total moves by +${fmtNum(add, 0)} − ${fmtNum(sub, 0)}; the only state the update needs is the count from exactly an hour ago. ` + N[st.strat], st.strat === `all` ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { now: v => clock(v), mpm: v => fmtNum(Math.pow(10, v)), vpd: v => fmtNum(Math.pow(10, v)) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch5 - Count-Min Sketch + heap for approximate top K
  // =====================================================================
  const CT_U = 50000, CT_N = 200000;
  let ctStream = null;
  function ctData() {
    if (ctStream) return ctStream;
    const r = mulberry32(55), cdf = zipfCdf(CT_U, 1);
    const perm = Array.from({ length: CT_U }, (_, i) => i);
    for (let i = CT_U - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const ev = new Int32Array(CT_N), cnt = new Int32Array(CT_U);
    for (let i = 0; i < CT_N; i++) { const v = perm[zipfPick(cdf, r())]; ev[i] = v; cnt[v]++; }
    return (ctStream = { ev, cnt });
  }
  function ctRun(w, d, H) {
    const { ev } = ctData();
    const tbl = new Uint32Array(w * d), seeds = Array.from({ length: d }, (_, i) => i * 7919 + 3);
    const ids = [], vals = [], pos = new Map();
    const swap = (a, b) => { [ids[a], ids[b]] = [ids[b], ids[a]]; [vals[a], vals[b]] = [vals[b], vals[a]]; pos.set(ids[a], a); pos.set(ids[b], b); };
    const up = i => { while (i > 0) { const p = (i - 1) >> 1; if (vals[p] <= vals[i]) break; swap(p, i); i = p; } };
    const down = i => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < ids.length && vals[l] < vals[m]) m = l; if (r < ids.length && vals[r] < vals[m]) m = r; if (m === i) break; swap(m, i); i = m; } };
    for (let n = 0; n < CT_N; n++) {
      const e = ev[n];
      let est = Infinity;
      for (let r = 0; r < d; r++) { const k = r * w + hashInt(e, seeds[r]) % w; tbl[k]++; if (tbl[k] < est) est = tbl[k]; }
      const p = pos.get(e);
      if (p !== undefined) { vals[p] = est; down(p); }
      else if (ids.length < H) { ids.push(e); vals.push(est); pos.set(e, ids.length - 1); up(ids.length - 1); }
      else if (est > vals[0]) { pos.delete(ids[0]); ids[0] = e; vals[0] = est; pos.set(e, 0); down(0); }
    }
    return ids.map((id, i) => [id, vals[i]]).sort((a, b) => b[1] - a[1]);
  }
  D.cmsTopK = {
    title: `Approximate top K: a Count-Min Sketch plus a small heap`,
    blurb: `${fmtNum(CT_N)} views over ${fmtNum(CT_U)} videos. Each view is added to the sketch and its estimated count is offered to a min-heap of candidates; reading the top K means reading the heap. Compare with exact counting, and see how sketch width and heap size affect the result.`,
    mount(el) {
      const st = { w: 9, d: 4, heap: 40, k: 10 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`sketch width w`, rng(`w`, 5, 14, 1, st.w))}${ctl(`sketch depth d`, rng(`d`, 1, 6, 1, st.d))}</div>
        <div class="ctl-row">${ctl(`K`, rng(`k`, 5, 30, 1, st.k))}${ctl(`candidate heap size`, rng(`heap`, 5, 300, 5, st.heap))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Reported top K</h4><div data-k="tbl"></div></div>
          <div class="lab-panel"><h4>Accuracy and memory</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const K = st.k, H = Math.max(st.heap, K), w = Math.pow(2, st.w), d = st.d;
        const { cnt } = ctData();
        const res = ctRun(w, d, H).slice(0, K);
        const order = Array.from(cnt.keys()).sort((a, b) => cnt[b] - cnt[a]);
        const rank = new Map(order.map((v, i) => [v, i + 1]));
        const trueSet = new Set(order.slice(0, K));
        const hits = res.filter(([v]) => trueSet.has(v)).length;
        const relErr = sum(res.map(([v, e]) => e - cnt[v])) / Math.max(1, sum(res.map(([v]) => cnt[v])));
        const errTxt = relErr >= 10 ? `${fmtNum(1 + relErr, 0)}× the true total` : pct(relErr, relErr < 0.1 ? 1 : 0);
        const distinct = order.filter(v => cnt[v] > 0).length;
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>#</th><th>video</th><th class="num">estimate</th><th class="num">true</th><th class="num">true rank</th></tr>${res.slice(0, 12).map(([v, e], i) => `<tr><td>${i + 1}</td><td class="mono">video:${v}</td><td class="num" style="${e > cnt[v] ? `color:var(--warn)` : ``}">${e.toLocaleString(`en-US`)}</td><td class="num">${cnt[v].toLocaleString(`en-US`)}</td><td class="num" style="${rank.get(v) > K ? `color:var(--bad);font-weight:700` : ``}">${rank.get(v)}</td></tr>`).join(``)}</table></div>${K > 12 ? `<div class="cs-note">Showing the first 12 of ${K}.</div>` : ``}`;
        const mem = w * d * 4 + H * 32, exact = distinct * 50;
        q(`stats`).innerHTML = stat(`true top K found`, `${hits} / ${K}`, hits === K ? `good` : hits >= K * 0.8 ? `warn` : `bad`) + stat(`overestimate, summed over the reported list`, errTxt, relErr > 0.2 ? `bad` : relErr > 0.03 ? `warn` : `good`) + stat(`error bound e·N / w`, `±${fmtNum(Math.E * CT_N / w, 0)}`) + stat(`sketch + heap memory`, fmtB(mem)) + stat(`exact counts (~50 B × ${fmtNum(distinct)})`, fmtB(exact)) + stat(`memory saved`, round(exact / mem, exact / mem < 10 ? 1 : 0) + `×`, exact / mem > 5 ? `good` : ``);
        let n = `${fmtB(mem)} of sketch and heap found ${hits} of the true top ${K}, against ${fmtB(exact)} for exact counts.`;
        if (relErr > 0.2) n += ` The sketch is too narrow: collisions inflate the reported counts ${relErr >= 10 ? `to ${errTxt}` : `by ${errTxt} in total`}, so low-ranked videos can sneak in. Widen it; the error bound shrinks in proportion to w.`;
        else if (hits < K) n += ` The misses sit near position K, where true counts are close and small overestimates reorder them.`;
        if (st.heap < 2 * K) n += ` A candidate heap barely bigger than K evicts items that would have climbed back; keeping a few times K protects the boundary.`;
        if (d === 1) n += ` With one row there's no second opinion: one unlucky collision is the estimate.`;
        if (hits === K && relErr <= 0.03) n += ` Every top video is found with counts within a few percent, which is plenty for a trending list.`;
        else if (hits === K && relErr <= 0.2) n += ` Every top video is found, but the counts run ${errTxt} high in total: collisions only ever add, so a sketch never under-counts. Widen it if the displayed numbers matter as much as the order.`;
        q(`note`).innerHTML = note(n, hits === K ? `good` : `warn`);
      };
      wireRanges(el, st, { w: v => fmtNum(Math.pow(2, v)), d: v => v, k: v => v, heap: v => v }, draw);
      draw();
    }
  };
})();
