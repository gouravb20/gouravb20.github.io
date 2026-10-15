// Advanced topics labs, part 2: approximate counting - coin-flip and Morris counters (chapter 5)
(function () {
  "use strict";
  const { round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, axes, path, fmtNum, pct } = window.LabKit;
  const D = window.DEMOS;
  const PAL = [`var(--accent)`, `var(--accent-2)`, `var(--accent-3)`, `#a78bfa`, `#f472b6`, `#4ade80`, `#f87171`, `#facc15`];
  const REG_MAX = 255;
  const gauss = r => { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });
  const big = v => { if (v < 1e13) return fmtNum(v); const e = Math.floor(Math.log10(v)); return `${round(v / Math.pow(10, e), 1)} × 10<sup>${e}</sup>`; };
  const bitsFor = x => Math.max(1, Math.ceil(Math.log2(x + 1)));
  const morrisEst = (a, v) => a * (Math.pow(1 + 1 / a, v) - 1);
  const morrisMax = a => morrisEst(a, REG_MAX);
  const quant = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

  // log(1 - p) for p = (1 + 1/a)^-v, per a and register value v
  const LOG_MISS = {};
  function logMiss(a) {
    if (!LOG_MISS[a]) {
      const b = 1 + 1 / a, t = new Float64Array(4096);
      for (let v = 1; v < t.length; v++) t[v] = Math.log1p(-Math.pow(b, -v));
      LOG_MISS[a] = t;
    }
    return LOG_MISS[a];
  }

  // One Morris counter over n events. The wait for the next increment at register v is geometric
  // with p = (1 + 1/a)^-v, so the simulation jumps between increments instead of looping over events.
  // cps (sorted event counts) optionally records the register value at each checkpoint.
  function morrisRun(n, a, r, cps) {
    const lm = logMiss(a);
    const at = cps ? new Float64Array(cps.length) : null;
    let v = 0, seen = 0, j = 0;
    for (;;) {
      const wait = v === 0 ? 1 : 1 + Math.floor(Math.log(1 - r()) / lm[v]);
      if (seen + wait > n) break;
      seen += wait;
      if (at) while (j < cps.length && cps[j] < seen) at[j++] = v;
      v++;
    }
    if (at) while (j < cps.length) at[j++] = v;
    return { v, at };
  }

  function binomial(n, p, r) {
    const mean = n * p, varr = mean * (1 - p);
    if (varr >= 25) return Math.max(0, Math.round(mean + Math.sqrt(varr) * gauss(r)));
    if (n <= 2000) { let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k; }
    const L = Math.exp(-mean);
    let k = 0, prod = r();
    while (prod > L) { k++; prod *= r(); }
    return k;
  }

  // =====================================================================
  // Ch5 - Coin-flip counter vs Morris counter in one byte
  // =====================================================================
  D.coinFlipCounter = {
    title: `Coin-flip counting vs Morris counting in one byte`,
    blurb: `Both counters get an 8-bit register. The coin-flip counter increments with a fixed probability p and multiplies back by 1/p. The Morris counter increments with probability (1 + 1/a)<sup>&minus;v</sup>, which shrinks as its register grows. The chart shows each counter's relative error across every scale; the table runs 300 trials at the count you pick.`,
    mount(el) {
      const st = { n: 3, p: 16, a: 30 };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`true events n`, rng(`n`, 0.5, 9, 0.1, st.n))}${ctl(`coin-flip probability p`, seg(`p`, [[2, `1/2`], [16, `1/16`], [256, `1/256`], [4096, `1/4096`]], st.p))}${ctl(`Morris parameter a`, seg(`a`, [[1, `1`], [8, `8`], [30, `30`]], st.a))}</div>
        <div class="ctl-row">${againBtn}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Relative standard error vs true count</h4><div data-k="chart"></div><div class="legend"><span><i class="sw line" style="background:var(--warn)"></i>coin flip</span><span><i class="sw line" style="background:var(--accent)"></i>Morris</span><span><i class="sw line" style="background:var(--text-muted)"></i>your n</span></div></div>
          <div class="lab-panel"><h4>300 trials at your n</h4><div data-k="table"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const n = Math.max(1, Math.round(Math.pow(10, st.n)));
        const den = st.p, p = 1 / den, a = st.a;
        const capC = REG_MAX * den, capM = morrisMax(a);
        const rseC = x => Math.min(1, Math.max(Math.sqrt((1 - p) / (x * p)), x > capC ? 1 - capC / x : 0));
        const rseM = x => Math.min(1, Math.max(Math.sqrt((x - 1) / (2 * a * x)), x > capM ? 1 - capM / x : 0));

        const ax = axes({ x0: 46, x1: 370, y0: 180, y1: 12, dx0: 1, dx1: 1e9, dy0: 0, dy1: 1, xLog: true, xTicks: [1, 1e3, 1e6, 1e9], yTicks: [0, 0.25, 0.5, 0.75, 1], xFmt: v => fmtNum(v, 0), yFmt: v => v === 1 ? `100%+` : pct(v), xLabel: `true count (log scale)` });
        const xs = Array.from({ length: 121 }, (_, i) => Math.pow(10, 9 * i / 120));
        let s = ax.svg;
        if (capC < 1e9) s += `<line x1="${ax.X(capC)}" x2="${ax.X(capC)}" y1="180" y2="12" style="stroke:var(--warn);stroke-dasharray:2 3;opacity:.7"/><text class="svg-label" x="${ax.X(capC) + 3}" y="24" style="fill:var(--warn)">coin flip full</text>`;
        if (capM < 1e9) s += `<line x1="${ax.X(capM)}" x2="${ax.X(capM)}" y1="180" y2="12" style="stroke:var(--accent);stroke-dasharray:2 3;opacity:.7"/><text class="svg-label" x="${ax.X(capM) + 3}" y="38" style="fill:var(--accent)">Morris full</text>`;
        s += `<path d="${path(xs.map(x => [ax.X(x), ax.Y(rseC(x))]))}" style="fill:none;stroke:var(--warn);stroke-width:2.2"/>`;
        s += `<path d="${path(xs.map(x => [ax.X(x), ax.Y(rseM(x))]))}" style="fill:none;stroke:var(--accent);stroke-width:2.2"/>`;
        s += `<line class="svg-now" x1="${ax.X(n)}" x2="${ax.X(n)}" y1="180" y2="12" style="opacity:.5"/>`;
        q(`chart`).innerHTML = svgWrap(390, 214, s);

        const r = mulberry32(seed * 7919 + Math.round(st.n * 10) * 31 + den + a * 7);
        const T = 300, eC = [], eM = [];
        let ovC = 0, ovM = 0, regC = 0, regM = 0;
        for (let t = 0; t < T; t++) {
          const vc = binomial(n, p, r);
          if (vc > REG_MAX) ovC++;
          regC += Math.min(vc, REG_MAX);
          eC.push(Math.min(vc, REG_MAX) * den);
          const vm = morrisRun(n, a, r).v;
          if (vm > REG_MAX) ovM++;
          regM += Math.min(vm, REG_MAX);
          eM.push(morrisEst(a, Math.min(vm, REG_MAX)));
        }
        const rms = es => Math.sqrt(es.reduce((acc, e) => acc + ((e - n) / n) ** 2, 0) / es.length);
        const rC = rms(eC), rM = rms(eM);
        eC.sort((x, y) => x - y); eM.sort((x, y) => x - y);
        const cls = v => v <= 0.15 ? `color:var(--good)` : v <= 0.4 ? `color:var(--warn)` : `color:var(--bad)`;
        const row = (label, c, m) => `<tr><td>${label}</td><td class="num">${c}</td><td class="num">${m}</td></tr>`;
        q(`table`).innerHTML = `<table class="mini-table"><tr><th></th><th class="num">coin flip, p = 1/${den}</th><th class="num">Morris, a = ${a}</th></tr>
          ${row(`average register value`, round(regC / T, 1), round(regM / T, 1))}
          ${row(`middle 90% of estimates`, `${fmtNum(quant(eC, 0.05))} – ${fmtNum(quant(eC, 0.95))}`, `${fmtNum(quant(eM, 0.05))} – ${fmtNum(quant(eM, 0.95))}`)}
          ${row(`relative error (RMS)`, `<span style="${cls(rC)}">±${pct(rC, 1)}</span>`, `<span style="${cls(rM)}">±${pct(rM, 1)}</span>`)}
          ${row(`runs that overflowed 255`, `<span style="${ovC ? `color:var(--bad)` : ``}">${ovC} / ${T}</span>`, `<span style="${ovM ? `color:var(--bad)` : ``}">${ovM} / ${T}</span>`)}
          ${row(`largest count in one byte`, fmtNum(capC), big(capM))}
        </table>`;

        let msg;
        if (n > capC) msg = `At ${fmtNum(n)} events the coin-flip register is full: with p = 1/${den}, one byte only reaches ${fmtNum(capC)}, so it reports that no matter how many more events arrive.`;
        else if (rC > 0.3) msg = `At ${fmtNum(n)} events the coin-flip counter is mostly noise (±${pct(rC, 0)}): with p = 1/${den} it has only incremented about ${fmtNum(Math.round(n / den))} times.`;
        else msg = `The coin-flip counter is accurate here (±${pct(rC, 1)}) because it has incremented about ${fmtNum(Math.round(n / den))} times; its error keeps shrinking until the register fills at ${fmtNum(capC)}.`;
        msg += ` The Morris counter with a = ${a} sits near ±${pct(1 / Math.sqrt(2 * a), 0)} at every scale`;
        msg += n > capM ? `, but ${fmtNum(n)} is past the ${big(capM)} it can reach in one byte with a = ${a}: pick a smaller a or give it more bits.` : ` and one byte reaches ${big(capM)}.`;
        msg += ` A fixed probability buys accuracy in one band of counts; Morris spreads the same byte evenly across every order of magnitude.`;
        q(`note`).innerHTML = note(msg, n > capM || rM > 0.4 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => fmtNum(Math.max(1, Math.round(Math.pow(10, v)))) }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch5 - Morris counter: trajectories, error and space
  // =====================================================================
  D.morrisCounter = {
    title: `Morris counter: counting to a billion in a few bits`,
    blurb: `Each line is one Morris counter (or the average of k counters) fed the same stream. It increments with probability (1 + 1/a)<sup>&minus;v</sup> and reports a((1 + 1/a)<sup>v</sup> &minus; 1); a = 1 is Morris's original base-2 counter. The chart plots estimate &divide; true count as events arrive. Runs are jumpy at small counts, then settle into a band whose width depends only on a and k.`,
    mount(el) {
      const st = { n: 6, a: 1, k: 1 };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`events counted`, rng(`n`, 2, 9, 0.1, st.n))}${ctl(`base parameter a`, seg(`a`, [[1, `1 (base 2)`], [2, `2`], [8, `8`], [30, `30`]], st.a))}${ctl(`counters averaged k`, seg(`k`, [[1, `1`], [4, `4`], [16, `16`]], st.k))}</div>
        <div class="ctl-row">${againBtn}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Estimate &divide; true count as events arrive (8 runs)</h4><div data-k="chart"></div><div class="legend"><span><i class="sw line" style="background:var(--accent)"></i>one run each</span><span><i class="sw line" style="background:var(--text-muted)"></i>&plusmn;1 standard error</span></div></div>
          <div class="lab-panel"><h4>After all events</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const n = Math.round(Math.pow(10, st.n)), a = st.a, k = st.k;
        const r = mulberry32(seed * 7919 + Math.round(st.n * 10) * 31 + a * 101 + k);
        const se = 1 / Math.sqrt(2 * a * k);
        const L = Math.log10(n), NC = 72;
        const cps = Array.from({ length: NC + 1 }, (_, j) => Math.max(1, Math.round(Math.pow(10, L * j / NC))));

        const lines = [];
        for (let t = 0; t < 8; t++) {
          const acc = new Float64Array(cps.length);
          for (let c = 0; c < k; c++) { const R = morrisRun(n, a, r, cps); for (let j = 0; j < cps.length; j++) acc[j] += morrisEst(a, R.at[j]); }
          lines.push(cps.map((x, j) => [x, acc[j] / k / x]));
        }
        const step = Math.max(1, Math.ceil(L / 5));
        const xt = []; for (let e = 0; e <= L; e += step) xt.push(Math.pow(10, e));
        const ax = axes({ x0: 46, x1: 370, y0: 180, y1: 12, dx0: 1, dx1: n, dy0: 0, dy1: 3, xLog: true, xTicks: xt, yTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3], xFmt: v => fmtNum(v, 0), yFmt: v => v + `×`, xLabel: `events so far (log scale)` });
        let s = ax.svg;
        const yb = v => ax.Y(Math.max(0, Math.min(3, v)));
        s += `<line x1="46" x2="370" y1="${ax.Y(1)}" y2="${ax.Y(1)}" style="stroke:var(--text);opacity:.5"/>`;
        [1 - se, 1 + se].forEach(v => { if (v > 0 && v < 3) s += `<line class="svg-ideal" x1="46" x2="370" y1="${ax.Y(v)}" y2="${ax.Y(v)}"/>`; });
        lines.forEach((ln, i) => { s += `<path d="${path(ln.map(([x, y]) => [ax.X(x), yb(y)]))}" style="fill:none;stroke:${PAL[i % PAL.length]};stroke-width:1.6;opacity:.85"/>`; });
        q(`chart`).innerHTML = svgWrap(390, 214, s);

        const T = Math.round(200 / Math.sqrt(k));
        const ests = [];
        let sq = 0, vmax = 0, v0 = -1;
        for (let t = 0; t < T; t++) {
          let sum = 0;
          for (let c = 0; c < k; c++) { const v = morrisRun(n, a, r).v; sum += morrisEst(a, v); vmax = Math.max(vmax, v); if (v0 < 0) v0 = v; }
          const e = sum / k;
          ests.push(e); sq += ((e - n) / n) ** 2;
        }
        const rms = Math.sqrt(sq / T);
        ests.sort((x, y) => x - y);
        const expV = Math.log(1 + n / a) / Math.log(1 + 1 / a);
        const regBits = bitsFor(vmax), exactBits = bitsFor(n), cap = morrisMax(a);
        q(`stats`).innerHTML =
          stat(`true count`, fmtNum(n)) +
          stat(`middle 90% of estimates`, `${fmtNum(quant(ests, 0.05))} – ${fmtNum(quant(ests, 0.95))}`) +
          stat(`relative error (RMS) vs theory 1/√(2ak)`, `±${pct(rms, 1)} vs ±${pct(se, 1)}`, rms <= 0.15 ? `good` : rms <= 0.4 ? `warn` : `bad`) +
          stat(`register value, one run (expected ≈ ${round(expV, 1)})`, v0) +
          stat(`bits per counter vs exact counter`, `${regBits}${k > 1 ? ` × ${k}` : ``} vs ${exactBits}`, regBits * k < exactBits ? `good` : ``) +
          stat(`register writes for ${fmtNum(n)} events`, fmtNum(v0)) +
          stat(`largest count in 8 bits with a = ${a}`, big(cap), n > cap ? `bad` : ``);

        let msg = `With a = ${a}${k > 1 ? ` and ${k} counters averaged` : ``}, estimates land within ±${pct(rms, 0)} of ${fmtNum(n)} (theory ±${pct(se, 0)}), using ${regBits} bits per counter where an exact counter needs ${exactBits}.`;
        if (a === 1 && k === 1) msg += ` That's Morris's original counter: tiny and unbiased, but single runs often land at half or double the truth. Raise a or average counters to tighten the band.`;
        if (n > cap) msg += ` ${fmtNum(n)} is beyond what 8 bits can reach with a = ${a} (${big(cap)}), so this setting needs ${regBits}-bit registers.`;
        msg += ` Each counter changed state only about ${fmtNum(v0)} times across ${fmtNum(n)} events, which is why Morris counters suit storage where writes are expensive.`;
        q(`note`).innerHTML = note(msg, rms <= 0.15 ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => fmtNum(Math.round(Math.pow(10, v))) }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };
})();
