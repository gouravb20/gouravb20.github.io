// Streaming Systems - interactive labs, part 1 (shared helpers + chapters 1-4)
// Contract: window.DEMOS[id] = { title, blurb, mount(el, ctx) }
// ctx = { every(fn, ms) -> handle, clear(handle), onCleanup(fn) }

(function () {
  "use strict";

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  const T = s => { const p = s.split(":").map(Number); return (p[0] - 12) * 3600 + p[1] * 60 + (p[2] || 0); };
  function fmt(s, withSec = true) {
    if (s === Infinity) return "+∞";
    if (s === -Infinity) return "−∞";
    const tot = Math.round(12 * 3600 + s);
    const h = Math.floor(tot / 3600), m = Math.floor((tot % 3600) / 60), x = ((tot % 60) + 60) % 60;
    return h + ":" + String(m).padStart(2, "0") + (withSec ? ":" + String(x).padStart(2, "0") : "");
  }
  const fmtDur = s => {
    if (!isFinite(s)) return "∞";
    const neg = s < 0; s = Math.abs(Math.round(s));
    const m = Math.floor(s / 60), x = s % 60;
    return (neg ? "−" : "") + (m ? `${m}m ${String(x).padStart(2, "0")}s` : `${x}s`);
  };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lin = (d0, d1, r0, r1) => v => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function parseVal(v) {
    if (v === "Infinity") return Infinity;
    if (v === "true") return true;
    if (v === "false") return false;
    if (v !== "" && !isNaN(+v)) return +v;
    return v;
  }
  function seg(key, opts, cur) {
    return `<span class="seg" data-seg="${key}">` +
      opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? "on" : ""}">${l}</button>`).join("") +
      "</span>";
  }
  function setSeg(root, key, val) {
    const s = root.querySelector(`.seg[data-seg="${key}"]`);
    if (s) s.querySelectorAll("button").forEach(b => b.classList.toggle("on", String(parseVal(b.dataset.v)) === String(val)));
  }
  function wireSegs(root, st, onChange) {
    root.querySelectorAll(".seg[data-seg]").forEach(s => s.addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      st[s.dataset.seg] = parseVal(b.dataset.v);
      s.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      onChange(s.dataset.seg);
    }));
  }
  const ctl = (label, inner) => `<span class="ctl"><span class="ctl-label">${label}</span>${inner}</span>`;
  const svgWrap = (w, h, inner) => `<svg class="lab-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
  const TIMING_CHIP = { EARLY: ["early", "early"], ON_TIME: ["ontime", "on-time"], LATE: ["late", "late"], FINAL: ["final", "final"] };
  const timingChip = t => { const c = TIMING_CHIP[t] || ["muted", t]; return `<span class="chip ${c[0]}">${c[1]}</span>`; };
  const okChip = (ok, yes = "✓ correct", no = "✗ wrong") => `<span class="chip ${ok ? "ok" : "no"}">${ok ? yes : no}</span>`;
  const sum = a => a.reduce((s, x) => s + x, 0);

  // Axis helper for time plots. Returns SVG markup.
  function timeAxes(o) {
    // o: {x0,x1,y0,y1 (px), dx0,dx1,dy0,dy1 (domain secs), xStep, yStep, xLabel, yLabel, xFmt, yFmt}
    const X = lin(o.dx0, o.dx1, o.x0, o.x1), Y = lin(o.dy0, o.dy1, o.y0, o.y1);
    let s = `<g class="svg-axis">`;
    for (let v = Math.ceil(o.dx0 / o.xStep) * o.xStep; v <= o.dx1 + 1e-6; v += o.xStep) {
      s += `<line class="svg-grid" x1="${X(v)}" x2="${X(v)}" y1="${o.y0}" y2="${o.y1}"/>`;
      s += `<text x="${X(v)}" y="${o.y0 + 14}" text-anchor="middle">${(o.xFmt || (t => fmt(t, false)))(v)}</text>`;
    }
    for (let v = Math.ceil(o.dy0 / o.yStep) * o.yStep; v <= o.dy1 + 1e-6; v += o.yStep) {
      s += `<line class="svg-grid" x1="${o.x0}" x2="${o.x1}" y1="${Y(v)}" y2="${Y(v)}"/>`;
      s += `<text x="${o.x0 - 5}" y="${Y(v) + 3}" text-anchor="end">${(o.yFmt || (t => fmt(t, false)))(v)}</text>`;
    }
    s += `<line x1="${o.x0}" x2="${o.x1}" y1="${o.y0}" y2="${o.y0}"/><line x1="${o.x0}" x2="${o.x0}" y1="${o.y0}" y2="${o.y1}"/>`;
    s += `</g>`;
    if (o.xLabel) s += `<text class="svg-label" x="${(o.x0 + o.x1) / 2}" y="${o.y0 + 28}" text-anchor="middle">${o.xLabel}</text>`;
    if (o.yLabel) s += `<text class="svg-label" transform="translate(12 ${(o.y0 + o.y1) / 2}) rotate(-90)" text-anchor="middle">${o.yLabel}</text>`;
    return { svg: s, X, Y };
  }

  // ------------------------------------------------------------------
  // The book's running example (Chapter 2): nine scores for one team
  // ------------------------------------------------------------------
  const SCORES = [
    { name: "Julie", v: 5, et: T("12:00:26"), pt: T("12:05:19") },
    { name: "Frank", v: 9, et: T("12:01:26"), pt: T("12:08:19"), missed: true },
    { name: "Ed", v: 7, et: T("12:02:26"), pt: T("12:05:39") },
    { name: "Julie", v: 8, et: T("12:03:06"), pt: T("12:07:06") },
    { name: "Amy", v: 3, et: T("12:03:39"), pt: T("12:06:13") },
    { name: "Fred", v: 4, et: T("12:04:19"), pt: T("12:06:39") },
    { name: "Naomi", v: 3, et: T("12:06:39"), pt: T("12:07:19") },
    { name: "Becky", v: 8, et: T("12:07:26"), pt: T("12:08:39") },
    { name: "Naomi", v: 1, et: T("12:07:46"), pt: T("12:09:00") }
  ];
  // A second arrival order for the same events (Chapter 4: processing-time windows give 7, 36, 5)
  const ALT_PT = ["12:08:30", "12:06:05", "12:05:30", "12:06:20", "12:06:40", "12:06:55", "12:07:05", "12:07:35", "12:07:55"];
  const SCORES_ALT = SCORES.map((r, i) => Object.assign({}, r, { pt: T(ALT_PT[i]) }));
  const byPt = rs => rs.slice().sort((a, b) => a.pt - b.pt);
  const SIM_END = T("12:11:00");

  function assignWindows(mode, et) {
    if (mode === "global") return [{ key: "global", start: -Infinity, end: Infinity }];
    if (mode === "sliding") {
      const out = [];
      for (let st = Math.floor(et / 60) * 60 - 60; st <= et; st += 60) if (et < st + 120) out.push({ key: "s" + st, start: st, end: st + 120 });
      return out;
    }
    const st = Math.floor(et / 120) * 120;
    return [{ key: "f" + st, start: st, end: st + 120 }];
  }
  const winLabel = w => (w.start === -Infinity ? "global" : `[${fmt(w.start, false)}, ${fmt(w.end, false)})`);

  // Discrete-time simulation of a Beam pipeline: Sum per window, with a trigger, watermark and accumulation mode.
  // cfg: { windowing: fixed|sliding|global, trigger: batch|perRecord|aligned|unaligned|watermark|eol|wmLate,
  //        delay (secs, for aligned/unaligned), wm: perfect|heuristic, accum: discarding|accumulating|retracting, lateness }
  function simulate(cfg, recsIn) {
    const END = SIM_END;
    const delay = cfg.delay || 120;
    const recs = recsIn.map(r => Object.assign({}, r, { status: "pending", reason: "" }));
    const isBatch = cfg.trigger === "batch";
    const onTimeTrig = ["watermark", "eol", "wmLate"].includes(cfg.trigger);
    const lateTrig = ["eol", "wmLate"].includes(cfg.trigger);
    const wmAt = P => {
      if (P >= END) return Infinity;
      let m = P;
      for (const r of recs) if (r.pt > P && !(cfg.wm === "heuristic" && r.missed)) m = Math.min(m, r.et);
      return m;
    };
    const wins = new Map();
    const panes = [];
    const wmSeries = [];
    const getWin = w => {
      if (!wins.has(w.key)) wins.set(w.key, Object.assign({}, w, { sum: 0, adds: [], lastPaneSum: 0, lastEmitted: null, paneIdx: 0, onTime: false, closedAt: null, dirty: false, timer: null }));
      return wins.get(w.key);
    };
    const fire = (win, s, W, forced) => {
      const timing = forced || (W >= win.end ? "LATE" : "EARLY");
      const value = cfg.accum === "discarding" ? win.sum - win.lastPaneSum : win.sum;
      const retract = cfg.accum === "retracting" && win.lastEmitted !== null ? win.lastEmitted : null;
      panes.push({ t: s, key: win.key, start: win.start, end: win.end, value, retract, timing, idx: win.paneIdx++ });
      win.lastPaneSum = win.sum; win.lastEmitted = value; win.dirty = false; win.timer = null;
    };
    let Wprev = isBatch ? -Infinity : wmAt(0);
    for (let s = 0; s <= END; s++) {
      for (const r of recs) {
        if (r.pt !== s) continue;
        const late = !isBatch && r.et < Wprev;
        let added = 0, reason = "";
        for (const w of assignWindows(cfg.windowing, r.et)) {
          const win = getWin(w);
          if (win.closedAt !== null) { reason = "dropped: window already garbage-collected (beyond allowed lateness)"; continue; }
          if (cfg.trigger === "watermark" && win.onTime) { reason = "ignored: the watermark trigger already fired and has no late firings"; continue; }
          win.sum += r.v; win.adds.push({ t: s, v: r.v }); win.dirty = true; added++;
          if (cfg.trigger === "unaligned" && win.timer === null) win.timer = s + delay;
          if (cfg.trigger === "perRecord") fire(win, s, Wprev);
          else if (lateTrig && win.onTime) fire(win, s, Wprev, "LATE");
        }
        r.status = added === 0 ? "dropped" : late ? "late" : "seen";
        r.reason = added === 0 ? reason : late ? "late: event time is behind the watermark" : "on time";
      }
      const W = isBatch ? (s >= END ? Infinity : -Infinity) : wmAt(s);
      if (onTimeTrig) {
        for (const win of wins.values()) if (!win.onTime && win.closedAt === null && win.adds.length && W >= win.end) { fire(win, s, W, "ON_TIME"); win.onTime = true; }
      }
      if (!isBatch && isFinite(cfg.lateness)) {
        for (const win of wins.values()) if (win.closedAt === null && W >= win.end + cfg.lateness) win.closedAt = s;
      }
      if (cfg.trigger === "aligned" && s > 0 && s % delay === 0) for (const win of wins.values()) if (win.dirty && win.closedAt === null) fire(win, s, W);
      if (cfg.trigger === "eol" && s > 0 && s % 60 === 0) for (const win of wins.values()) if (win.dirty && !win.onTime && win.closedAt === null) fire(win, s, W, "EARLY");
      if (cfg.trigger === "unaligned") for (const win of wins.values()) if (win.timer === s && win.closedAt === null) fire(win, s, W);
      if (isBatch && s === END) for (const win of wins.values()) if (win.adds.length) fire(win, s, W, "FINAL");
      wmSeries.push(W);
      Wprev = W;
    }
    return { recs, panes, wins: [...wins.values()], wmSeries };
  }

  // What a mode-appropriate consumer ends up believing for each window
  function finalPerWindow(res, accum) {
    const out = new Map();
    for (const p of res.panes) {
      const cur = out.get(p.key) || { key: p.key, start: p.start, end: p.end, value: 0 };
      cur.value = accum === "discarding" ? cur.value + p.value : p.value;
      out.set(p.key, cur);
    }
    return [...out.values()].sort((a, b) => a.start - b.start);
  }
  function trueSums(windowing, recs) {
    const m = new Map();
    for (const r of recs) for (const w of assignWindows(windowing, r.et)) m.set(w.key, (m.get(w.key) || 0) + r.v);
    return m;
  }

  function beamCode(c) {
    const win = c.windowing === "fixed" ? "FixedWindows.of(TWO_MINUTES)" : c.windowing === "sliding" ? "SlidingWindows.of(TWO_MINUTES).every(ONE_MINUTE)" : null;
    const head = "PCollection<KV<Team, Integer>> totals = input\n";
    if (c.trigger === "batch") {
      return win ? `${head}  .apply(Window.into(${win}))\n  .apply(Sum.integersPerKey());\n// executed on a batch engine: one pane per window, when input is complete`
        : `${head}  .apply(Sum.integersPerKey());\n// executed on a batch engine: a single total when input is complete`;
    }
    const d = c.delay === 60 ? "ONE_MINUTE" : "TWO_MINUTES";
    const trig = {
      perRecord: "Repeatedly(AfterCount(1))",
      aligned: `Repeatedly(AlignedDelay(${d}))`,
      unaligned: `Repeatedly(UnalignedDelay(${d}))`,
      watermark: "AfterWatermark()",
      wmLate: "AfterWatermark()\n                   .withLateFirings(AfterCount(1))",
      eol: "AfterWatermark()\n                   .withEarlyFirings(AlignedDelay(ONE_MINUTE))\n                   .withLateFirings(AfterCount(1))"
    }[c.trigger];
    let s = head + (win ? `  .apply(Window.into(${win})\n               .triggering(${trig})` : `  .apply(Window.triggering(${trig})`);
    if (isFinite(c.lateness)) s += `\n               .withAllowedLateness(${c.lateness === 0 ? "ZERO" : "ONE_MINUTE"})`;
    s += "\n               " + { discarding: ".discardingFiredPanes())", accumulating: ".accumulatingFiredPanes())", retracting: ".accumulatingAndRetractingFiredPanes())" }[c.accum];
    s += "\n  .apply(Sum.integersPerKey());";
    s += `\n// watermark: ${c.wm === "perfect" ? "perfect (accounts for every record)" : "heuristic (fails to account for Frank's 9)"}`;
    return s;
  }

  const DEMOS = {};

  // ==================================================================
  // CH1 · skew
  // ==================================================================
  DEMOS.skew = {
    title: "Event time vs processing time: skew and lag",
    blurb: "Each dot is one of the book's nine scores, plotted at <strong>(event time, processing time)</strong>. The dashed diagonal is the ideal, where events are processed the instant they happen. The green curve is reality: a perfect watermark, the event time up to which input is complete. Drag processing time and watch the <strong>skew</strong> (the horizontal gap) grow and shrink.",
    mount(el, ctx) {
      const recs = byPt(SCORES);
      const st = { P: T("12:07:00"), timer: null };
      const P0 = T("12:05:00"), P1 = T("12:10:00");
      el.innerHTML = `
        <div class="ctl-row">
          <div class="range-wrap"><span class="ctl-label">Processing time</span><input type="range" min="${P0}" max="${P1}" step="1" value="${st.P}"><span class="range-val"></span></div>
          <button class="iconbtn" data-play>▶ Play</button>
        </div>
        <div class="lab-grid">
          <div class="lab-panel"><div data-svg></div>
            <div class="legend"><span><i class="sw line" style="background:var(--text-muted)"></i>ideal (event time = processing time)</span><span><i class="sw line" style="background:var(--when)"></i>reality: perfect watermark</span><span><i class="sw line" style="background:var(--accent-3)"></i>skew at current time</span></div>
          </div>
          <div class="lab-panel"><h4>Readout</h4><div data-read></div></div>
        </div>
        <div class="lab-note">Lag is vertical (how long after it happened a record was seen); skew is horizontal (how far behind in event time the pipeline is). A single slow record (Frank's 9, seen 6m 53s late) holds the perfect watermark back for everyone. That is the "too slow" problem from Chapter 2.</div>`;
      const W = 560, H = 330, m = { l: 56, r: 14, t: 12, b: 38 };
      const wmAt = P => { let x = P; for (const r of recs) if (r.pt > P) x = Math.min(x, r.et); return x; };
      const range = el.querySelector("input[type=range]");
      function draw() {
        const ax = timeAxes({ x0: m.l, x1: W - m.r, y0: H - m.b, y1: m.t, dx0: 0, dx1: 600, dy0: P0, dy1: P1, xStep: 60, yStep: 60, xLabel: "Event time →", yLabel: "Processing time →" });
        const { X, Y } = ax;
        let s = ax.svg;
        s += `<line class="svg-ideal" x1="${X(P0)}" y1="${Y(P0)}" x2="${X(P1)}" y2="${Y(P1)}"/>`;
        let pts = [];
        for (let p = P0; p <= P1; p += 2) pts.push(`${X(wmAt(p))},${Y(p)}`);
        s += `<polyline class="svg-wm" points="${pts.join(" ")}"/>`;
        const wm = wmAt(st.P);
        s += `<line class="svg-now" x1="${m.l}" x2="${W - m.r}" y1="${Y(st.P)}" y2="${Y(st.P)}" opacity="0.35"/>`;
        s += `<line stroke="var(--accent-3)" stroke-width="3" x1="${X(wm)}" x2="${X(Math.min(st.P, 600))}" y1="${Y(st.P)}" y2="${Y(st.P)}"/>`;
        s += `<text class="svg-pane-txt EARLY" x="${(X(wm) + X(Math.min(st.P, 600))) / 2}" y="${Y(st.P) - 6}" text-anchor="middle">skew ${fmtDur(st.P - wm)}</text>`;
        for (const r of recs) {
          const seen = r.pt <= st.P, hold = !seen && r.et === wm;
          if (seen) s += `<line stroke="var(--accent-2)" stroke-dasharray="2 3" opacity="0.5" x1="${X(r.et)}" x2="${X(r.et)}" y1="${Y(Math.max(r.et, P0))}" y2="${Y(r.pt)}"/>`;
          s += `<circle class="svg-rec ${seen ? "seen" : "pending"} ${hold ? "hot" : ""}" cx="${X(r.et)}" cy="${Y(r.pt)}" r="9"/><text class="svg-rec-txt ${seen ? "" : "pending"}" x="${X(r.et)}" y="${Y(r.pt)}">${r.v}</text>`;
        }
        el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, s);
        el.querySelector(".range-val").textContent = fmt(st.P);
        const seen = recs.filter(r => r.pt <= st.P);
        const holder = recs.find(r => r.pt > st.P && r.et === wm);
        el.querySelector("[data-read]").innerHTML = `
          <div class="stat-row">
            <div class="stat-mini"><b>${seen.length}/9</b>records seen</div>
            <div class="stat-mini"><b>${fmt(wm)}</b>watermark (event time)</div>
            <div class="stat-mini"><b>${fmtDur(st.P - wm)}</b>event-time skew</div>
          </div>
          ${holder ? `<div class="lab-note warn" style="margin-top:4px">Watermark held back by <strong>${holder.name} ${holder.v}</strong> (event time ${fmt(holder.et)}), which isn't seen until ${fmt(holder.pt)}.</div>` : ""}
          <table class="mini-table" style="margin-top:8px"><thead><tr><th>Record</th><th>Event</th><th>Seen</th><th class="num">Lag</th></tr></thead><tbody>
          ${recs.map(r => `<tr class="${r.pt <= st.P ? "" : "dim"}"><td>${r.name} ${r.v}</td><td>${fmt(r.et)}</td><td>${fmt(r.pt)}</td><td class="num">${fmtDur(r.pt - r.et)}</td></tr>`).join("")}
          </tbody></table>`;
      }
      range.addEventListener("input", () => { st.P = +range.value; draw(); });
      const playBtn = el.querySelector("[data-play]");
      playBtn.addEventListener("click", () => {
        if (st.timer) { ctx.clear(st.timer); st.timer = null; playBtn.textContent = "▶ Play"; return; }
        if (st.P >= P1) st.P = P0;
        playBtn.textContent = "❚❚ Pause";
        st.timer = ctx.every(() => {
          st.P = Math.min(P1, st.P + 3); range.value = st.P; draw();
          if (st.P >= P1) { ctx.clear(st.timer); st.timer = null; playBtn.textContent = "▶ Play"; }
        }, 40);
      });
      draw();
    }
  };

  // ==================================================================
  // CH1 · ptVsEt
  // ==================================================================
  DEMOS.ptVsEt = {
    title: "Processing-time vs event-time windows (and what to key Bigtable by)",
    blurb: "The same nine events arrive in two different orders. <strong>Event-time windows</strong> always give the same answer. <strong>Processing-time windows</strong> depend on network weather. This is why persisted business results should be keyed by event-time window.",
    mount(el) {
      const st = { order: "original" };
      el.innerHTML = `
        <div class="ctl-row">${ctl("Arrival order", seg("order", [["original", "Original (book Fig 2-1)"], ["alternate", "Alternate (book Fig 4-3 right)"]], st.order))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Records (sorted by arrival)</h4><div data-recs></div></div>
          <div class="lab-panel"><h4>2-minute window results</h4><div data-res></div></div>
        </div>
        <div class="lab-note" data-note></div>`;
      function draw() {
        const recs = byPt(st.order === "original" ? SCORES : SCORES_ALT);
        const etW = [0, 120, 240, 360], ptW = [240, 360, 480];
        el.querySelector("[data-recs]").innerHTML = `<table class="mini-table"><thead><tr><th>Score</th><th>Event time</th><th>Processing time</th><th>ET window</th><th>PT window</th></tr></thead><tbody>
          ${recs.map(r => `<tr><td>${r.name} ${r.v}</td><td>${fmt(r.et)}</td><td>${fmt(r.pt)}</td><td>${fmt(Math.floor(r.et / 120) * 120, false)}</td><td>${fmt(Math.floor(r.pt / 120) * 120, false)}</td></tr>`).join("")}</tbody></table>`;
        const etRes = etW.map(s => sum(recs.filter(r => r.et >= s && r.et < s + 120).map(r => r.v)));
        const ptRes = ptW.map(s => sum(recs.filter(r => r.pt >= s && r.pt < s + 120).map(r => r.v)));
        el.querySelector("[data-res]").innerHTML = `
          <table class="mini-table"><thead><tr><th>Event-time window</th><th class="num">Sum</th></tr></thead><tbody>
          ${etW.map((s, i) => `<tr><td>[${fmt(s, false)}, ${fmt(s + 120, false)})</td><td class="num">${etRes[i]}</td></tr>`).join("")}</tbody></table>
          <div style="margin:6px 0 14px">${okChip(true, "✓ same in both orders")}</div>
          <table class="mini-table"><thead><tr><th>Processing-time window</th><th class="num">Sum</th></tr></thead><tbody>
          ${ptW.map((s, i) => `<tr><td>[${fmt(s, false)}, ${fmt(s + 120, false)})</td><td class="num">${ptRes[i]}</td></tr>`).join("")}</tbody></table>
          <div style="margin-top:6px">${okChip(false, "", st.order === "original" ? "12, 18, 18 here, but 7, 36, 5 in the other order" : "7, 36, 5 here, but 12, 18, 18 in the other order")}</div>`;
        el.querySelector("[data-note]").innerHTML = `<strong>Storage rule of thumb:</strong> write rows keyed by <code>team#eventWindowStart</code> (for example, <code>blue#12:00</code> → 14). A late record re-emits the pane for its own event-time window and overwrites that one row in accumulating mode. Keying by processing time would scatter one window's data across rows that differ between runs. Keep processing time as a metadata column (emitted_at, pane index) if you need it.`;
      }
      wireSegs(el, st, draw);
      draw();
    }
  };

  // ==================================================================
  // CH1 · windowTypes
  // ==================================================================
  DEMOS.windowTypes = {
    title: "Fixed, sliding and session windows",
    blurb: "Three keys with events scattered over 10 minutes of event time. Switch the windowing strategy and tune sizes to see how the same events group differently. Fixed and sliding windows are <strong>aligned</strong> (the same boundaries for all keys); sessions are <strong>unaligned</strong> and data-driven.",
    mount(el) {
      const KEYS = {
        A: [15, 50, 70, 200, 230, 380, 410, 440, 520],
        B: [30, 140, 160, 175, 300, 470, 490],
        C: [90, 100, 250, 265, 280, 330, 560, 580]
      };
      const st = { type: "fixed", size: 120, period: 60, gap: 60 };
      el.innerHTML = `
        <div class="ctl-row">${ctl("Windowing", seg("type", [["fixed", "Fixed"], ["sliding", "Sliding"], ["sessions", "Sessions"]], st.type))}</div>
        <div class="ctl-row">
          <div class="range-wrap" data-show="fixed sliding"><span class="ctl-label">Size</span><input type="range" data-k="size" min="60" max="240" step="30" value="${st.size}"><span class="range-val" data-v="size"></span></div>
          <div class="range-wrap" data-show="sliding"><span class="ctl-label">Period</span><input type="range" data-k="period" min="30" max="120" step="30" value="${st.period}"><span class="range-val" data-v="period"></span></div>
          <div class="range-wrap" data-show="sessions"><span class="ctl-label">Gap timeout</span><input type="range" data-k="gap" min="20" max="150" step="10" value="${st.gap}"><span class="range-val" data-v="gap"></span></div>
        </div>
        <div class="lab-panel"><div data-svg></div></div>
        <div class="lab-note" data-note></div>`;
      const W = 640, laneH = 70, m = { l: 40, r: 12, t: 10, b: 30 };
      const H = m.t + laneH * 3 + m.b;
      const X = lin(0, 600, m.l, W - m.r);
      function draw() {
        el.querySelectorAll("[data-show]").forEach(n => { n.style.display = n.dataset.show.split(" ").includes(st.type) ? "" : "none"; });
        if (st.period > st.size) st.period = st.size;
        el.querySelectorAll("[data-v]").forEach(n => { n.textContent = fmtDur(st[n.dataset.v]); });
        let s = `<g class="svg-axis">`;
        for (let v = 0; v <= 600; v += 60) s += `<line class="svg-grid" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(v)}" y="${H - m.b + 14}" text-anchor="middle">${fmt(v, false)}</text>`;
        s += `</g><text class="svg-label" x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle">Event time →</text>`;
        let windowsCount = 0;
        Object.keys(KEYS).forEach((k, li) => {
          const y0 = m.t + li * laneH, evs = KEYS[k];
          s += `<text class="svg-title" x="${m.l - 26}" y="${y0 + laneH / 2 + 4}">${k}</text>`;
          if (st.type === "fixed") {
            for (let w = 0; w < 600; w += st.size) {
              const n = evs.filter(e => e >= w && e < w + st.size).length;
              if (!n) continue;
              windowsCount++;
              s += `<rect class="svg-win" x="${X(w) + 1}" y="${y0 + 6}" width="${X(w + st.size) - X(w) - 2}" height="${laneH - 26}" rx="4"/><text class="svg-state-txt" x="${X(w) + 5}" y="${y0 + 17}">${n}</text>`;
            }
          } else if (st.type === "sliding") {
            const rows = Math.round(st.size / st.period), rh = (laneH - 26) / rows;
            for (let w = -st.size + st.period; w < 600; w += st.period) {
              const n = evs.filter(e => e >= w && e < w + st.size).length;
              if (!n) continue;
              windowsCount++;
              const r = (((w / st.period) % rows) + rows) % rows;
              const xa = X(Math.max(0, w)), xb = X(Math.min(600, w + st.size));
              s += `<rect class="${r % 2 ? "svg-win2" : "svg-win"}" x="${xa + 1}" y="${y0 + 6 + r * rh}" width="${Math.max(2, xb - xa - 2)}" height="${Math.max(3, rh - 2)}" rx="3"/>`;
              if (rh >= 9) s += `<text class="svg-state-txt" x="${xa + 4}" y="${y0 + 6 + r * rh + Math.min(rh - 3, 10)}">${n}</text>`;
            }
          } else {
            const sorted = evs.slice().sort((a, b) => a - b), sess = [];
            for (const e of sorted) {
              const c = sess[sess.length - 1];
              if (c && e <= c.end) { c.end = Math.max(c.end, e + st.gap); c.n++; } else sess.push({ start: e, end: e + st.gap, n: 1 });
            }
            windowsCount += sess.length;
            for (const e of sorted) s += `<rect class="svg-proto" x="${X(e)}" y="${y0 + laneH - 30}" width="${X(e + st.gap) - X(e)}" height="6"/>`;
            for (const c of sess) s += `<rect class="svg-session" x="${X(c.start)}" y="${y0 + 8}" width="${Math.max(2, X(Math.min(600, c.end)) - X(c.start))}" height="${laneH - 42}" rx="4"/><text class="svg-rec-txt" x="${X(c.start) + 10}" y="${y0 + 8 + (laneH - 42) / 2}">${c.n}</text>`;
          }
          for (const e of evs) s += `<circle class="svg-dot" cx="${X(e)}" cy="${y0 + laneH - 14}" r="4"/>`;
        });
        el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, s);
        el.querySelector("[data-note]").innerHTML = {
          fixed: `<strong>Fixed (tumbling)</strong> windows: ${windowsCount} non-empty windows. Each event belongs to exactly one window, and all keys share the same boundaries (aligned).`,
          sliding: `<strong>Sliding</strong> windows of ${fmtDur(st.size)} every ${fmtDur(st.period)}: each event belongs to ${Math.round(st.size / st.period)} windows (${windowsCount} non-empty in total). When the period equals the size, these are just fixed windows.`,
          sessions: `<strong>Sessions</strong> with a ${fmtDur(st.gap)} gap: ${windowsCount} sessions. The faint bars underneath are each event's proto-session [t, t + gap). Overlapping proto-sessions merge. Boundaries differ per key (unaligned) and can't be known in advance.`
        }[st.type];
      }
      wireSegs(el, st, draw);
      el.querySelectorAll("input[data-k]").forEach(r => r.addEventListener("input", () => { st[r.dataset.k] = +r.value; draw(); }));
      draw();
    }
  };

  // ==================================================================
  // CH2 · beamSim (the main simulator)
  // ==================================================================
  const BEAM_BASE = { windowing: "fixed", trigger: "eol", wm: "heuristic", accum: "accumulating", lateness: Infinity, order: "original" };
  const BEAM_PRESETS = [
    ["batch", "Fig 2-3 · Classic batch, no windowing", { windowing: "global", trigger: "batch", wm: "perfect" }],
    ["wbatch", "Fig 2-5 · Windowed summation on a batch engine", { trigger: "batch", wm: "perfect" }],
    ["perRecord", "Fig 2-6 · Per-record trigger", { trigger: "perRecord" }],
    ["aligned", "Fig 2-7 · Aligned 2-minute delay (microbatch)", { trigger: "aligned" }],
    ["unaligned", "Fig 2-8 · Unaligned 2-minute delay", { trigger: "unaligned" }],
    ["wmPerfect", "Fig 2-10 left · Watermark trigger, perfect watermark", { trigger: "watermark", wm: "perfect" }],
    ["wmHeur", "Fig 2-10 right · Watermark trigger, heuristic watermark", { trigger: "watermark" }],
    ["eol", "Fig 2-11 · Early / on-time / late", { trigger: "eol" }],
    ["lateness", "Fig 2-12 · Early / on-time / late + 1 min allowed lateness", { trigger: "eol", lateness: 60 }],
    ["discarding", "Fig 2-13 · Discarding mode", { trigger: "eol", accum: "discarding" }],
    ["retract", "Fig 2-14 · Accumulating & retracting mode", { trigger: "eol", accum: "retracting" }],
    ["ptTrig", "Fig 4-3 · Processing-time \"windows\" via triggers", { windowing: "global", trigger: "aligned", accum: "discarding", wm: "perfect" }],
    ["custom", "Custom (your settings)", null]
  ];
  const TRIGGER_OPTS = [
    ["batch", "Batch: once, when input is complete"],
    ["perRecord", "Repeatedly(AfterCount(1)): per record"],
    ["aligned", "Repeatedly(AlignedDelay(2 min)): microbatch"],
    ["unaligned", "Repeatedly(UnalignedDelay(2 min))"],
    ["watermark", "AfterWatermark(): on-time only"],
    ["eol", "AfterWatermark + early AlignedDelay(1 min) + late AfterCount(1)"]
  ];
  const TRIGGER_EXPLAIN = {
    batch: "A batch engine waits for all input, then emits once. It's simple and correct, but you wait for the whole dataset, which never ends for unbounded input.",
    perRecord: "Every record produces a new pane. You get the lowest latency, but it's chatty and gives no sense of completeness. Fine for low-volume keys.",
    aligned: "All windows fire together on 2-minute processing-time boundaries, which is what microbatch systems do. It's predictable but bursty, and gives no notion of completeness.",
    unaligned: "Each window fires 2 minutes after its first unprocessed record. Load is spread more evenly than with aligned delays.",
    watermark: "One pane per window, when the watermark passes the window's end. A perfect watermark can be too slow (waiting on the 9). A heuristic one can be too fast (it emits 5 and then ignores the 9).",
    eol: "Early panes every minute, one on-time pane when the watermark passes, and an immediate late pane for every late record. It solves both too-slow and too-fast watermarks."
  };

  DEMOS.beamSim = {
    title: "Beam Model simulator: What / Where / When / How",
    blurb: "This reproduces the book's Chapter 2 figures with the nine team scores. Pick a <strong>figure preset</strong>, or set the <span class='q q-where'>Where</span>, <span class='q q-when'>When</span> and <span class='q q-how'>How</span> knobs yourself. Then scrub processing time. Dots are records at (event time, processing time). The green line is the watermark, grey boxes are window state, and colored bars are emitted panes.",
    mount(el, ctx) {
      const st = Object.assign({}, BEAM_BASE, { preset: "eol", P: SIM_END, timer: null });
      el.innerHTML = `
        <div class="ctl-row">${ctl("Book figure", `<select class="sel" data-preset>${BEAM_PRESETS.map(p => `<option value="${p[0]}">${p[1]}</option>`).join("")}</select>`)}</div>
        <div class="ctl-row">
          ${ctl("<span class='q q-where'>Where</span>", seg("windowing", [["fixed", "Fixed 2m"], ["sliding", "Sliding 2m/1m"], ["global", "Global"]], st.windowing))}
          ${ctl("<span class='q q-when'>When</span>", `<select class="sel" data-trigger>${TRIGGER_OPTS.map(t => `<option value="${t[0]}">${t[1]}</option>`).join("")}</select>`)}
        </div>
        <div class="ctl-row">
          ${ctl("Watermark", seg("wm", [["perfect", "Perfect"], ["heuristic", "Heuristic"]], st.wm))}
          ${ctl("<span class='q q-how'>How</span>", seg("accum", [["discarding", "Discarding"], ["accumulating", "Accumulating"], ["retracting", "Acc. + retracting"]], st.accum))}
          ${ctl("Allowed lateness", seg("lateness", [["Infinity", "∞"], ["60", "1 min"], ["0", "0"]], st.lateness))}
          ${ctl("Arrival order", seg("order", [["original", "Original"], ["alternate", "Alternate"]], st.order))}
        </div>
        <div class="ctl-row">
          <button class="iconbtn" data-play>▶ Play</button>
          <div class="range-wrap"><span class="ctl-label">Processing time</span><input type="range" min="${T("12:03:00")}" max="${SIM_END}" step="1" value="${st.P}"><span class="range-val"></span></div>
        </div>
        <div class="lab-grid">
          <div class="lab-panel"><div data-svg></div>
            <div class="legend">
              <span><i class="sw" style="background:var(--accent-2)"></i>on-time record</span>
              <span><i class="sw" style="background:var(--late)"></i>late record</span>
              <span><i class="sw" style="background:var(--bg-4);border:1px solid var(--text-muted)"></i>dropped / ignored</span>
              <span><i class="sw line" style="background:var(--when)"></i>watermark</span>
              <span><i class="sw line" style="background:var(--early)"></i>early</span>
              <span><i class="sw line" style="background:var(--ontime)"></i>on-time</span>
              <span><i class="sw line" style="background:var(--late)"></i>late</span>
              <span><i class="sw line" style="background:var(--final)"></i>batch / final</span>
            </div>
          </div>
          <div class="lab-panel"><h4>Emitted panes</h4><div class="scroll-y" data-panes></div><div data-final></div></div>
        </div>
        <div class="lab-note" data-explain></div>
        <div class="lab-panel" style="margin-top:12px"><h4>Equivalent Beam code</h4><pre style="margin:0;font-size:12px;overflow-x:auto"><code data-code></code></pre></div>`;

      const selP = el.querySelector("[data-preset]"), selT = el.querySelector("[data-trigger]");
      const range = el.querySelector("input[type=range]");
      selP.value = st.preset; selT.value = st.trigger;
      let res = null;

      function recompute() {
        res = simulate(st, byPt(st.order === "original" ? SCORES : SCORES_ALT));
        selT.value = st.trigger;
        ["windowing", "wm", "accum", "lateness", "order"].forEach(k => setSeg(el, k, st[k]));
        el.querySelector("[data-code]").textContent = beamCode(st);
        el.querySelector("[data-explain]").innerHTML = `<strong>${TRIGGER_OPTS.find(t => t[0] === st.trigger)[1]}.</strong> ${TRIGGER_EXPLAIN[st.trigger]}`;
        draw();
      }

      function draw() {
        const W = 640, H = 430, m = { l: 56, r: 14, t: 14, b: 38 };
        const PY0 = T("12:03:00");
        const ax = timeAxes({ x0: m.l, x1: W - m.r, y0: H - m.b, y1: m.t, dx0: 0, dx1: 480, dy0: PY0, dy1: SIM_END, xStep: 60, yStep: 60, xLabel: "Event time →", yLabel: "Processing time →" });
        const X = v => ax.X(clamp(v, 0, 480)), Y = v => ax.Y(clamp(v, PY0, SIM_END));
        const P = st.P, isBatch = st.trigger === "batch";
        let s = "";
        if (st.windowing === "fixed") for (let w = 0; w < 480; w += 240) s += `<rect class="svg-band" x="${X(w)}" y="${m.t}" width="${X(w + 120) - X(w)}" height="${H - m.b - m.t}"/>`;
        s += ax.svg;
        s += `<line class="svg-ideal" x1="${X(PY0)}" y1="${Y(PY0)}" x2="${X(480)}" y2="${Y(480)}"/>`;
        // window state boxes
        for (const w of res.wins) {
          const first = w.adds.length ? w.adds[0].t : null;
          if (first === null || first > P) continue;
          const xa = X(w.start), xb = X(w.end);
          const top = w.closedAt !== null && w.closedAt <= P ? w.closedAt : P;
          const val = sum(w.adds.filter(a => a.t <= P).map(a => a.v));
          if (w.closedAt !== null && w.closedAt <= P) s += `<rect class="svg-closed" x="${xa + 2}" y="${Y(top)}" width="${xb - xa - 4}" height="${Y(first) - Y(top)}"/><text class="svg-state-txt" x="${xa + 5}" y="${Y(top) - 3}">closed (GC)</text>`;
          else s += `<rect class="svg-state" x="${xa + 2}" y="${Y(top)}" width="${xb - xa - 4}" height="${Math.max(1, Y(first) - Y(top))}"/><text class="svg-state-txt" x="${xa + 5}" y="${Y(top) + 11}">state: ${val}</text>`;
        }
        // watermark
        if (!isBatch) {
          const pts = [];
          for (let p = PY0; p <= Math.min(P, SIM_END - 1); p += 1) pts.push(`${X(res.wmSeries[p])},${Y(p)}`);
          if (pts.length > 1) s += `<polyline class="svg-wm" points="${pts.join(" ")}"/>`;
        } else if (P >= SIM_END) {
          s += `<line class="svg-wm2" x1="${m.l}" x2="${W - m.r}" y1="${Y(SIM_END) + 1}" y2="${Y(SIM_END) + 1}"/><text class="svg-label" x="${W - m.r - 4}" y="${Y(SIM_END) + 12}" text-anchor="end">input complete</text>`;
        }
        // panes
        const shown = res.panes.filter(p => p.t <= P);
        const labelCount = {};
        for (const p of shown) {
          const xa = X(p.start) + 3, xb = X(p.end) - 3, y = Y(p.t);
          const k = p.key + "@" + p.t;
          labelCount[k] = (labelCount[k] || 0) + 1;
          s += `<line class="svg-pane ${p.timing}" x1="${xa}" x2="${xb}" y1="${y}" y2="${y}"/>`;
          const txt = p.retract !== null ? `${p.value} (−${p.retract})` : `${p.value}`;
          s += `<text class="svg-pane-txt ${p.timing}" x="${xb - 2}" y="${y - 4}" text-anchor="end">${txt}</text>`;
        }
        // records
        for (const r of res.recs) {
          const seen = r.pt <= P;
          const cls = seen ? r.status : "pending";
          s += `<circle class="svg-rec ${cls}" cx="${X(r.et)}" cy="${Y(r.pt)}" r="9"><title>${r.name} ${r.v}: event ${fmt(r.et)}, processed ${fmt(r.pt)}${seen ? " · " + r.reason : ""}</title></circle><text class="svg-rec-txt ${seen ? "" : "pending"}" x="${X(r.et)}" y="${Y(r.pt)}">${r.v}</text>`;
        }
        s += `<line class="svg-now" x1="${m.l}" x2="${W - m.r}" y1="${Y(P)}" y2="${Y(P)}" opacity="0.5"/>`;
        el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, s);
        el.querySelector(".range-val").textContent = fmt(P) + (isBatch ? "" : ` · WM ${fmt(res.wmSeries[Math.min(P, SIM_END)])}`);

        // panes table
        const rows = [];
        for (const p of res.panes) {
          const dim = p.t > P ? "dim" : "";
          if (p.retract !== null) rows.push(`<tr class="undo ${dim}"><td>${fmt(p.t)}</td><td>${winLabel(p)}</td><td class="num">−${p.retract}</td><td><span class="chip undo">retract</span></td><td class="num">${p.idx}</td></tr>`);
          rows.push(`<tr class="${dim}"><td>${fmt(p.t)}</td><td>${winLabel(p)}</td><td class="num">${p.value}</td><td>${timingChip(p.timing)}</td><td class="num">${p.idx}</td></tr>`);
        }
        el.querySelector("[data-panes]").innerHTML = `<table class="mini-table"><thead><tr><th>Emit</th><th>Window</th><th class="num">Value</th><th>Timing</th><th class="num">#</th></tr></thead><tbody>${rows.join("") || `<tr><td colspan="5" class="muted">no panes</td></tr>`}</tbody></table>`;

        // final verdict
        const truth = trueSums(st.windowing, res.recs);
        const fin = finalPerWindow(res, st.accum);
        const dropped = res.recs.filter(r => r.status === "dropped");
        el.querySelector("[data-final]").innerHTML = `
          <h4 style="margin-top:12px">After everything has fired, a consumer holds</h4>
          <table class="mini-table"><thead><tr><th>Window</th><th class="num">Result</th><th class="num">Truth</th><th></th></tr></thead><tbody>
          ${fin.map(f => `<tr><td>${winLabel(f)}</td><td class="num">${f.value}</td><td class="num">${truth.get(f.key)}</td><td>${okChip(f.value === truth.get(f.key))}</td></tr>`).join("")}
          </tbody></table>
          ${dropped.length ? `<div class="lab-note bad">${dropped.map(r => `<strong>${r.name} ${r.v}</strong>: ${r.reason}`).join("<br>")}</div>` : ""}
          <div class="cs-note" style="margin-top:6px">${st.accum === "discarding" ? "Discarding mode: the consumer <em>adds</em> the panes." : st.accum === "retracting" ? "Retracting mode: the consumer applies retractions, then the new values." : "Accumulating mode: the consumer <em>overwrites</em> with each newer pane."}</div>`;
      }

      selP.addEventListener("change", () => {
        st.preset = selP.value;
        const p = BEAM_PRESETS.find(x => x[0] === st.preset);
        if (p && p[2]) Object.assign(st, BEAM_BASE, p[2], { order: st.order });
        recompute();
      });
      selT.addEventListener("change", () => { st.trigger = selT.value; st.preset = "custom"; selP.value = "custom"; recompute(); });
      wireSegs(el, st, () => { st.preset = "custom"; selP.value = "custom"; recompute(); });
      range.addEventListener("input", () => { st.P = +range.value; draw(); });
      const playBtn = el.querySelector("[data-play]");
      const stop = () => { if (st.timer) ctx.clear(st.timer); st.timer = null; playBtn.textContent = "▶ Play"; };
      playBtn.addEventListener("click", () => {
        if (st.timer) { stop(); return; }
        if (st.P >= SIM_END) st.P = T("12:05:00");
        playBtn.textContent = "❚❚ Pause";
        st.timer = ctx.every(() => {
          st.P = Math.min(SIM_END, st.P + 3); range.value = st.P; draw();
          if (st.P >= SIM_END) stop();
        }, 35);
      });
      recompute();
    }
  };

  // ==================================================================
  // CH2 · accumulation
  // ==================================================================
  DEMOS.accumulation = {
    title: "Accumulation modes vs downstream consumers (Table 2-1)",
    blurb: "Enter the inputs that arrive in each pane of one window (panes separated by <code>|</code>). See what each accumulation mode emits, and what two kinds of consumers end up with: an <strong>overwrite-by-key store</strong> (such as Bigtable) and a <strong>summing</strong> consumer (one that regroups by another key).",
    mount(el) {
      const st = { input: "3 | 8, 1" };
      el.innerHTML = `
        <div class="ctl-row">
          ${ctl("Pane inputs", `<input class="txt" data-in value="${st.input}" style="width:180px">`)}
          <button class="iconbtn" data-ex="3 | 8, 1">Table 2-1</button>
          <button class="iconbtn" data-ex="5 | 9">Window [12:00, 12:02)</button>
          <button class="iconbtn" data-ex="7 | 3 | 8">Three panes</button>
        </div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>What each mode emits</h4><div data-emit></div></div>
          <div class="lab-panel"><h4>What the consumer ends up with</h4><div data-cons></div></div>
        </div>
        <div class="lab-note">Rule: <strong>overwrite</strong> consumers want <em>accumulating</em>; <strong>additive</strong> consumers want <em>discarding</em>; consumers that <strong>regroup</strong> or rely on merging windows (sessions) need <em>retractions</em>, which work with both.</div>`;
      const inp = el.querySelector("[data-in]");
      function draw() {
        const panes = st.input.split("|").map(p => p.split(",").map(x => parseFloat(x)).filter(x => !isNaN(x))).filter(p => p.length);
        if (!panes.length) { el.querySelector("[data-emit]").innerHTML = `<div class="muted">Enter numbers, like 3 | 8, 1</div>`; el.querySelector("[data-cons]").innerHTML = ""; return; }
        let run = 0, prev = null;
        const rows = panes.map((p, i) => {
          const d = sum(p); run += d;
          const r = { i, inputs: p.join(", "), disc: d, acc: run, retr: prev };
          prev = run;
          return r;
        });
        const total = run;
        el.querySelector("[data-emit]").innerHTML = `<table class="mini-table"><thead><tr><th>Pane</th><th>Inputs</th><th class="num">Discarding</th><th class="num">Accumulating</th><th class="num">Acc. + retracting</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td>${r.i + 1}</td><td>[${r.inputs}]</td><td class="num">${r.disc}</td><td class="num">${r.acc}</td><td class="num">${r.acc}${r.retr !== null ? ` <span class="chip undo">−${r.retr}</span>` : ""}</td></tr>`).join("")}
          </tbody></table>`;
        const ow = { disc: rows[rows.length - 1].disc, acc: total, retr: total };
        const sm = { disc: sum(rows.map(r => r.disc)), acc: sum(rows.map(r => r.acc)), retr: sum(rows.map(r => r.acc)) - sum(rows.map(r => r.retr || 0)) };
        const cell = v => `<td class="num">${v} ${okChip(v === total, "✓", "✗")}</td>`;
        el.querySelector("[data-cons]").innerHTML = `<table class="mini-table"><thead><tr><th>Consumer</th><th class="num">Discarding</th><th class="num">Accumulating</th><th class="num">Retracting</th></tr></thead><tbody>
          <tr><td>Overwrite by window key</td>${cell(ow.disc)}${cell(ow.acc)}${cell(ow.retr)}</tr>
          <tr><td>Sum everything received</td>${cell(sm.disc)}${cell(sm.acc)}${cell(sm.retr)}</tr>
          </tbody></table><div class="cs-note" style="margin-top:8px">True total for the window: <strong>${total}</strong>.</div>`;
      }
      inp.addEventListener("input", () => { st.input = inp.value; draw(); });
      el.querySelectorAll("[data-ex]").forEach(b => b.addEventListener("click", () => { st.input = inp.value = b.dataset.ex; draw(); }));
      draw();
    }
  };

  // ==================================================================
  // CH3 · wmDistribution
  // ==================================================================
  DEMOS.wmDistribution = {
    title: "The watermark as the oldest in-flight work",
    blurb: "Messages enter with a random event-time delay and complete at random. The histogram shows the event times of <span style='color:var(--accent-3)'>in-flight</span> and <span style='color:var(--accent)'>completed</span> messages. The watermark is the left edge of the in-flight distribution. Inject a <strong>stuck message</strong> to see the visibility property, or lower the <strong>percentile</strong> to trade completeness for latency.",
    mount(el, ctx) {
      const rng = mulberry32(7);
      const st = { now: 0, msgs: [], wm: -Infinity, nextId: 1, stuckId: null, outliers: false, pct: 100, playing: true };
      const expo = mean => -Math.log(1 - rng()) * mean;
      function tick() {
        st.now += 1;
        for (let i = 0; i < 3; i++) {
          let skew = expo(4);
          if (st.outliers && rng() < 0.06) skew = 15 + rng() * 30;
          st.msgs.push({ id: st.nextId++, et: st.now - skew, done: false });
        }
        for (const m of st.msgs) if (!m.done && m.id !== st.stuckId && rng() < 0.3) m.done = true;
        st.msgs = st.msgs.filter(m => !m.done || m.et > st.now - 60);
        const inflight = st.msgs.filter(m => !m.done);
        const minEt = inflight.length ? Math.min(...inflight.map(m => m.et)) : st.now;
        st.wm = Math.max(st.wm, minEt);
      }
      for (let i = 0; i < 70; i++) tick();
      el.innerHTML = `
        <div class="ctl-row">
          <button class="iconbtn" data-play>❚❚ Pause</button>
          <button class="iconbtn" data-step>Step +1s</button>
          <button class="iconbtn" data-stuck>Inject stuck message</button>
          ${ctl("Outliers", seg("outliers", [["false", "Off"], ["true", "6% very late"]], st.outliers))}
        </div>
        <div class="ctl-row"><div class="range-wrap"><span class="ctl-label">Percentile watermark</span><input type="range" min="50" max="100" step="1" value="100"><span class="range-val"></span></div></div>
        <div class="lab-panel"><div data-svg></div>
          <div class="legend"><span><i class="sw" style="background:var(--accent-3)"></i>in flight</span><span><i class="sw" style="background:var(--accent)"></i>completed</span><span><i class="sw line" style="background:var(--when)"></i>100% watermark</span><span><i class="sw line" style="background:var(--accent-3)"></i>percentile watermark</span><span><i class="sw line" style="background:var(--text)"></i>now</span></div>
        </div>
        <div class="stat-row" data-stats></div>
        <div class="lab-note" data-note></div>`;
      const W = 640, H = 230, m = { l: 40, r: 14, t: 14, b: 30 };
      function draw() {
        const inflight = st.msgs.filter(x => !x.done).sort((a, b) => a.et - b.et);
        const lo = st.now - 60, bin = 2, nb = 30;
        const X = lin(lo, st.now, m.l, W - m.r);
        const cIn = new Array(nb).fill(0), cDone = new Array(nb).fill(0);
        for (const x of st.msgs) {
          const b = clamp(Math.floor((x.et - lo) / bin), 0, nb - 1);
          (x.done ? cDone : cIn)[b]++;
        }
        const maxC = Math.max(4, ...cIn.map((c, i) => c + cDone[i]));
        const Y = lin(0, maxC, H - m.b, m.t);
        let s = `<g class="svg-axis">`;
        for (let v = Math.ceil(lo / 10) * 10; v <= st.now; v += 10) s += `<line class="svg-grid" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(v)}" y="${H - m.b + 13}" text-anchor="middle">t=${v}s</text>`;
        s += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/></g><text class="svg-label" x="${(m.l + W - m.r) / 2}" y="${H - 3}" text-anchor="middle">Event time of messages →</text>`;
        for (let i = 0; i < nb; i++) {
          const x = X(lo + i * bin) + 1, w = X(lo + (i + 1) * bin) - X(lo + i * bin) - 2;
          s += `<rect class="svg-bar" x="${x}" y="${Y(cDone[i])}" width="${w}" height="${H - m.b - Y(cDone[i])}"/>`;
          s += `<rect class="svg-bar3" x="${x}" y="${Y(cDone[i] + cIn[i])}" width="${w}" height="${Y(cDone[i]) - Y(cDone[i] + cIn[i])}"/>`;
        }
        let pw = st.wm;
        if (st.pct < 100 && inflight.length) {
          const idx = Math.min(inflight.length - 1, Math.floor((1 - st.pct / 100) * inflight.length));
          pw = Math.max(st.wm, inflight[idx].et);
        }
        const xw = X(clamp(st.wm, lo, st.now));
        s += `<line class="svg-wm" x1="${xw}" x2="${xw}" y1="${m.t - 4}" y2="${H - m.b}"/><text class="svg-pane-txt ON_TIME" x="${xw + 3}" y="${m.t + 6}">WM</text>`;
        if (st.pct < 100) { const xp = X(clamp(pw, lo, st.now)); s += `<line class="svg-wm2" x1="${xp}" x2="${xp}" y1="${m.t - 4}" y2="${H - m.b}"/><text class="svg-pane-txt EARLY" x="${xp + 3}" y="${m.t + 18}">P${st.pct}</text>`; }
        s += `<line class="svg-now" x1="${X(st.now)}" x2="${X(st.now)}" y1="${m.t - 4}" y2="${H - m.b}"/>`;
        el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, s);
        el.querySelector(".range-val").textContent = st.pct === 100 ? "100% (true watermark)" : st.pct + "%";
        const wouldBeLate = st.pct < 100 ? inflight.filter(x => x.et < pw).length : 0;
        el.querySelector("[data-stats]").innerHTML = `
          <div class="stat-mini"><b>t=${st.now}s</b>processing time</div>
          <div class="stat-mini"><b>t=${st.wm.toFixed(1)}s</b>watermark</div>
          <div class="stat-mini ${st.now - st.wm > 20 ? "bad" : ""}"><b>${(st.now - st.wm).toFixed(1)}s</b>watermark lag</div>
          <div class="stat-mini"><b>${inflight.length}</b>in flight</div>
          ${st.pct < 100 ? `<div class="stat-mini"><b>${(st.now - pw).toFixed(1)}s</b>P${st.pct} lag</div><div class="stat-mini bad"><b>${wouldBeLate}</b>would become late</div>` : ""}`;
        const stuck = st.stuckId !== null ? st.msgs.find(x => x.id === st.stuckId) : null;
        el.querySelector("[data-note]").className = "lab-note" + (stuck ? " bad" : "");
        el.querySelector("[data-note]").innerHTML = stuck
          ? `<strong>Visibility:</strong> message #${stuck.id} (event time t=${stuck.et.toFixed(1)}s) is stuck, so the watermark is pinned exactly at it while processing time moves on. A processing-rate metric would barely notice one message, but the watermark points right at it. <button class="iconbtn" data-unstick style="margin-left:6px">Unstick it</button>`
          : st.pct < 100
            ? `<strong>Percentile watermark:</strong> ignoring the oldest ${100 - st.pct}% of in-flight messages lets windows close sooner (lower lag). The cost is that the ${wouldBeLate} messages behind it will arrive as late data. This is useful when you'd rather see most of the data quickly, as in abuse detection.`
            : `<strong>Completeness:</strong> the watermark is the minimum event time of anything still in flight. Every message to its left has finished, so windows ending before it can be closed. Turn on outliers to see a few very late messages drag the watermark back.`;
        const un = el.querySelector("[data-unstick]");
        if (un) un.addEventListener("click", () => { st.stuckId = null; draw(); });
      }
      const playBtn = el.querySelector("[data-play]");
      let h = ctx.every(() => { tick(); draw(); }, 400);
      playBtn.addEventListener("click", () => {
        if (h) { ctx.clear(h); h = null; playBtn.textContent = "▶ Play"; }
        else { h = ctx.every(() => { tick(); draw(); }, 400); playBtn.textContent = "❚❚ Pause"; }
      });
      el.querySelector("[data-step]").addEventListener("click", () => { tick(); draw(); });
      el.querySelector("[data-stuck]").addEventListener("click", () => {
        const msg = { id: st.nextId++, et: st.now - 3, done: false };
        st.msgs.push(msg); st.stuckId = msg.id; draw();
      });
      el.querySelector("input[type=range]").addEventListener("input", e => { st.pct = +e.target.value; draw(); });
      wireSegs(el, st, draw);
      draw();
    }
  };

  // ==================================================================
  // CH3 · wmPropagation
  // ==================================================================
  DEMOS.wmPropagation = {
    title: "Watermark propagation and output timestamps",
    blurb: "A two-stage pipeline: <strong>Stage 1</strong> sums per 1-minute window, and <strong>Stage 2</strong> sums Stage 1's results per 2-minute window. Each stage's output watermark is the min of its input watermark and the timestamps it is holding for buffered data. Compare the <strong>end of window</strong> and <strong>earliest element</strong> output-timestamp policies.",
    mount(el) {
      const rng = mulberry32(42);
      const evs = [];
      for (let pt = 0; pt <= 1200; pt += 4) evs.push({ pt, et: pt - (5 + rng() * 35) });
      const LAG = 45, SPAN = 1200;
      const src = P => P - LAG;
      function compute(policy) {
        const w1 = new Map();
        for (const e of evs) { const s = Math.floor(e.et / 60) * 60; if (!w1.has(s)) w1.set(s, { start: s, end: s + 60, elems: [] }); w1.get(s).elems.push(e); }
        const wins1 = [...w1.values()].map(w => {
          w.elems.sort((a, b) => a.pt - b.pt);
          w.emit = w.end + LAG; w.first = w.elems[0].pt;
          w.ts = policy === "end" ? w.end - 0.001 : Math.min(...w.elems.map(e => e.et));
          return w;
        });
        const out1 = new Float64Array(SPAN + 1);
        let prev = -Infinity;
        for (let P = 0; P <= SPAN; P++) {
          let mm = src(P);
          for (const w of wins1) if (w.first <= P && w.emit > P) {
            let hold = w.end;
            if (policy !== "end") { hold = Infinity; for (const e of w.elems) { if (e.pt > P) break; hold = Math.min(hold, e.et); } }
            mm = Math.min(mm, hold);
          }
          prev = Math.max(prev, mm); out1[P] = prev;
        }
        const w2 = new Map();
        for (const w of wins1) {
          const s = Math.floor(w.ts / 120) * 120;
          if (!w2.has(s)) w2.set(s, { start: s, end: s + 120, elems: [] });
          w2.get(s).elems.push({ ts: w.ts, pt: w.emit, n: w.elems.length });
        }
        const wins2 = [...w2.values()].sort((a, b) => a.start - b.start).map(w => {
          w.elems.sort((a, b) => a.pt - b.pt);
          w.first = w.elems[0].pt;
          w.emit = Infinity;
          for (let P = w.first; P <= SPAN; P++) if (out1[P] >= w.end) { w.emit = P; break; }
          return w;
        });
        const out2 = new Float64Array(SPAN + 1);
        prev = -Infinity;
        for (let P = 0; P <= SPAN; P++) {
          let mm = out1[P];
          for (const w of wins2) if (w.first <= P && w.emit > P) {
            let hold = w.end;
            if (policy !== "end") { hold = Infinity; for (const e of w.elems) { if (e.pt > P) break; hold = Math.min(hold, e.ts); } }
            mm = Math.min(mm, hold);
          }
          prev = Math.max(prev, mm); out2[P] = prev;
        }
        return { out1, out2, wins2 };
      }
      const R = { end: compute("end"), earliest: compute("earliest") };
      const st = { policy: "end", P: 600 };
      el.innerHTML = `
        <div class="ctl-row">
          ${ctl("Output timestamp", seg("policy", [["end", "End of window"], ["earliest", "Earliest element"]], st.policy))}
          <div class="range-wrap"><span class="ctl-label">Processing time</span><input type="range" min="60" max="${SPAN}" step="1" value="${st.P}"><span class="range-val"></span></div>
        </div>
        <div class="lab-grid">
          <div class="lab-panel"><div data-svg></div>
            <div class="legend"><span><i class="sw line" style="background:var(--text-muted)"></i>ideal</span><span><i class="sw line" style="background:var(--when)"></i>source / Stage 1 input WM</span><span><i class="sw line" style="background:var(--accent-3)"></i>Stage 1 output WM</span><span><i class="sw line" style="background:var(--accent-2)"></i>Stage 2 output WM</span></div>
          </div>
          <div class="lab-panel"><h4>Readout</h4><div data-read></div></div>
        </div>
        <div class="lab-note" data-note></div>`;
      const W = 600, H = 320, m = { l: 56, r: 12, t: 12, b: 38 };
      function draw() {
        const r = R[st.policy];
        const ax = timeAxes({ x0: m.l, x1: W - m.r, y0: H - m.b, y1: m.t, dx0: 0, dx1: SPAN, dy0: -60, dy1: SPAN, xStep: 120, yStep: 120, xLabel: "Processing time →", yLabel: "Event time (watermark) →" });
        const { X, Y } = ax;
        let s = ax.svg + `<line class="svg-ideal" x1="${X(0)}" y1="${Y(0)}" x2="${X(SPAN)}" y2="${Y(SPAN)}"/>`;
        const line = (fn, cls) => { const pts = []; for (let P = 0; P <= SPAN; P += 4) { const v = fn(P); if (isFinite(v) && v >= -60) pts.push(`${X(P)},${Y(v)}`); } return `<polyline class="${cls}" points="${pts.join(" ")}"/>`; };
        s += line(src, "svg-wm") + line(P => r.out1[P], "svg-wm2") + line(P => r.out2[P], "svg-wm3");
        s += `<line class="svg-now" x1="${X(st.P)}" x2="${X(st.P)}" y1="${m.t}" y2="${H - m.b}" opacity="0.5"/>`;
        el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, s);
        el.querySelector(".range-val").textContent = fmt(st.P);
        const a = src(st.P), b = r.out1[st.P], c = r.out2[st.P];
        const tbl = ["end", "earliest"].map(pol => {
          const ws = R[pol].wins2.filter(w => w.start >= 0 && w.start < 600);
          return `<tr><td>${pol === "end" ? "End of window" : "Earliest element"}</td><td>${ws.map(w => w.elems.length).join(" · ")}</td></tr>`;
        }).join("");
        el.querySelector("[data-read]").innerHTML = `
          <div class="stat-row">
            <div class="stat-mini"><b>${fmt(a)}</b>Stage 1 input WM</div>
            <div class="stat-mini"><b>${fmt(b)}</b>Stage 1 output WM</div>
            <div class="stat-mini"><b>${fmt(c)}</b>Stage 2 output WM</div>
          </div>
          <div class="stat-row">
            <div class="stat-mini ${a - b > 30 ? "bad" : "good"}"><b>${fmtDur(a - b)}</b>Stage 1 event-time latency</div>
            <div class="stat-mini ${b - c > 30 ? "bad" : "good"}"><b>${fmtDur(b - c)}</b>Stage 2 event-time latency</div>
          </div>
          <h4 style="margin-top:10px">Semantics change too</h4>
          <div class="cs-note">How many Stage 1 results land in each of Stage 2's first five 2-minute windows:</div>
          <table class="mini-table"><tbody>${tbl}</tbody></table>`;
        el.querySelector("[data-note]").innerHTML = st.policy === "end"
          ? "<strong>End of window:</strong> a stage only needs to hold its output watermark at the window's end, which the input watermark hasn't reached yet anyway. So the output watermark tracks the input almost exactly, and per-stage latency is about zero."
          : "<strong>Earliest element:</strong> each stage holds its output watermark at the oldest buffered element until the window fires. Delay compounds stage by stage (input WM − output WM grows). Downstream windowing also shifts, because results are timestamped earlier and fall into different windows.";
      }
      wireSegs(el, st, draw);
      el.querySelector("input[type=range]").addEventListener("input", e => { st.P = +e.target.value; draw(); });
      draw();
    }
  };

  // ==================================================================
  // CH3 · ptWatermark
  // ==================================================================
  DEMOS.ptWatermark = {
    title: "Processing-time watermark: system delay vs data delay",
    blurb: "An event-time watermark that's an hour behind is ambiguous. The pipeline might be <strong>stuck</strong>, or it might be processing an <strong>old backlog</strong> perfectly well. The processing-time watermark (the age of the oldest pending operation) tells the two apart.",
    mount(el) {
      const st = { sc: "healthy" };
      const healthyEt = t => 4 + (t % 60) * 0.5;
      const SC = {
        healthy: { et: healthyEt, pt: t => 2 + 1.5 * Math.abs(Math.sin(t / 17)), note: "<strong>Healthy:</strong> both delays are small. Data is fresh and the system keeps up." },
        stuck: { et: t => (t < 200 ? healthyEt(t) : t < 380 ? healthyEt(200) + (t - 200) : healthyEt(t)), pt: t => (t < 200 || t >= 380 ? 2 : 2 + (t - 200)), note: "<strong>System delay:</strong> at t=200s an operation gets stuck (a hot key, a poisoned record or a crash loop). <em>Both</em> watermarks start lagging together. Page someone!" },
        backlog: { et: t => 3600 - t * 0.5, pt: t => 2 + Math.abs(Math.sin(t / 9)), note: "<strong>Data delay:</strong> the pipeline is chewing through a backlog of hour-old events. The event-time delay is huge but shrinking, while the processing-time delay stays small. The system is healthy; the data is just old." }
      };
      el.innerHTML = `
        <div class="ctl-row">${ctl("Scenario", seg("sc", [["healthy", "Healthy"], ["stuck", "Stuck operation"], ["backlog", "Old backlog"]], st.sc))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Event-time watermark delay</h4><div data-a></div></div>
          <div class="lab-panel"><h4>Processing-time watermark delay</h4><div data-b></div></div>
        </div>
        <div class="lab-note" data-note></div>`;
      function chart(fn, cls) {
        const W = 320, H = 180, m = { l: 48, r: 8, t: 10, b: 28 };
        let mx = 10; for (let t = 0; t <= 600; t += 5) mx = Math.max(mx, fn(t));
        mx *= 1.1;
        const X = lin(0, 600, m.l, W - m.r), Y = lin(0, mx, H - m.b, m.t);
        let s = `<g class="svg-axis">`;
        for (let v = 0; v <= 600; v += 120) s += `<text x="${X(v)}" y="${H - m.b + 13}" text-anchor="middle">${v}s</text>`;
        for (let i = 0; i <= 4; i++) { const v = (mx / 4) * i; s += `<line class="svg-grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 4}" y="${Y(v) + 3}" text-anchor="end">${fmtDur(v)}</text>`; }
        s += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/></g><text class="svg-label" x="${(m.l + W - m.r) / 2}" y="${H - 2}" text-anchor="middle">processing time →</text>`;
        const pts = []; for (let t = 0; t <= 600; t += 3) pts.push(`${X(t)},${Y(fn(t))}`);
        return svgWrap(W, H, s + `<polyline class="${cls}" points="${pts.join(" ")}"/>`);
      }
      function draw() {
        const sc = SC[st.sc];
        el.querySelector("[data-a]").innerHTML = chart(sc.et, "svg-wm");
        el.querySelector("[data-b]").innerHTML = chart(sc.pt, "svg-wm3");
        el.querySelector("[data-note]").className = "lab-note " + (st.sc === "stuck" ? "bad" : st.sc === "backlog" ? "warn" : "good");
        el.querySelector("[data-note]").innerHTML = sc.note + " Dataflow also uses a processing-time watermark to garbage-collect exactly-once dedup state (Chapter 5).";
      }
      wireSegs(el, st, draw);
      draw();
    }
  };

  // ==================================================================
  // CH4 · ptWindows
  // ==================================================================
  DEMOS.ptWindows = {
    title: "Three ways to window: event time, triggers, ingress time",
    blurb: "Same nine events, two arrival orders. <strong>Event-time windows</strong> are vertical bands. <strong>Processing-time windows via triggers</strong> are horizontal bands, because panes of a global window are cut by processing time. <strong>Via ingress time</strong>, each record slides right onto the diagonal, because its event time is overwritten with its arrival time. Watch the totals.",
    mount(el) {
      const st = { method: "event", order: "original" };
      const COLORS = ["var(--accent)", "var(--accent-3)", "var(--accent-2)", "var(--how)"];
      el.innerHTML = `
        <div class="ctl-row">
          ${ctl("Method", seg("method", [["event", "Event-time windows"], ["triggers", "Processing time via triggers"], ["ingress", "Processing time via ingress time"]], st.method))}
          ${ctl("Arrival order", seg("order", [["original", "Original"], ["alternate", "Alternate"]], st.order))}
        </div>
        <div class="lab-grid">
          <div class="lab-panel"><div data-svg></div></div>
          <div class="lab-panel"><h4>Window totals</h4><div data-res></div></div>
        </div>
        <div class="lab-note" data-note></div>`;
      const W = 600, H = 360, m = { l: 56, r: 12, t: 12, b: 38 };
      const PY0 = T("12:04:00"), PY1 = T("12:10:00");
      const ax = timeAxes({ x0: m.l, x1: W - m.r, y0: H - m.b, y1: m.t, dx0: 0, dx1: 600, dy0: PY0, dy1: PY1, xStep: 60, yStep: 60, xLabel: "Event time →", yLabel: "Processing time →" });
      const { X, Y } = ax;
      el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, `<g data-bands></g>${ax.svg}<line class="svg-ideal" x1="${X(PY0)}" y1="${Y(PY0)}" x2="${X(PY1)}" y2="${Y(PY1)}"/>` +
        SCORES.map((r, i) => `<g class="svg-dot-g" data-i="${i}"><circle class="svg-rec seen" r="10"/><text class="svg-rec-txt">${r.v}</text></g>`).join(""));
      const results = (method, order) => {
        const rs = order === "original" ? SCORES : SCORES_ALT;
        if (method === "event") return [0, 120, 240, 360].map(s => ({ label: `[${fmt(s, false)}, ${fmt(s + 120, false)})`, v: sum(rs.filter(r => r.et >= s && r.et < s + 120).map(r => r.v)) }));
        return [240, 360, 480].map(s => ({ label: `[${fmt(s, false)}, ${fmt(s + 120, false)})`, v: sum(rs.filter(r => r.pt >= s && r.pt < s + 120).map(r => r.v)) }));
      };
      function draw() {
        const rs = st.order === "original" ? SCORES : SCORES_ALT;
        let bands = "";
        if (st.method === "triggers") {
          [240, 360, 480].forEach((s, i) => { bands += `<rect x="${m.l}" y="${Y(s + 120)}" width="${W - m.r - m.l}" height="${Y(s) - Y(s + 120)}" style="fill:${COLORS[i]};opacity:0.12"/><text class="svg-label" x="${W - m.r - 4}" y="${Y(s + 120) + 12}" text-anchor="end">pane ${i + 1}</text>`; });
        } else {
          (st.method === "event" ? [0, 120, 240, 360] : [240, 360, 480]).forEach((s, i) => { bands += `<rect x="${X(s)}" y="${m.t}" width="${X(s + 120) - X(s)}" height="${H - m.b - m.t}" style="fill:${COLORS[i]};opacity:0.12"/>`; });
        }
        el.querySelector("[data-bands]").innerHTML = bands;
        rs.forEach((r, i) => {
          const x = st.method === "ingress" ? r.pt : r.et;
          const g = el.querySelector(`.svg-dot-g[data-i="${i}"]`);
          g.style.transform = `translate(${X(x)}px, ${Y(r.pt)}px)`;
          const wi = st.method === "event" ? Math.floor(r.et / 120) : Math.floor(r.pt / 120) - 2;
          const c = g.querySelector("circle");
          c.style.fill = COLORS[wi] || "var(--text-muted)"; c.style.stroke = c.style.fill;
        });
        const cur = results(st.method, st.order);
        el.querySelector("[data-res]").innerHTML = `
          <table class="mini-table"><thead><tr><th>${st.method === "event" ? "Event-time window" : st.method === "triggers" ? "Processing-time pane" : "Ingress-time window"}</th><th class="num">Sum</th></tr></thead><tbody>
          ${cur.map((r, i) => `<tr><td><i class="sw" style="background:${COLORS[i]}"></i> ${r.label}</td><td class="num">${r.v}</td></tr>`).join("")}</tbody></table>
          <h4 style="margin-top:12px">All combinations</h4>
          <table class="mini-table"><thead><tr><th>Method</th><th>Original</th><th>Alternate</th></tr></thead><tbody>
          ${[["event", "Event time"], ["triggers", "Via triggers"], ["ingress", "Via ingress time"]].map(([k, l]) => `<tr class="${k === st.method ? "new" : ""}"><td>${l}</td><td>${results(k, "original").map(x => x.v).join(", ")}</td><td>${results(k, "alternate").map(x => x.v).join(", ")}</td></tr>`).join("")}
          </tbody></table>`;
        el.querySelector("[data-note]").innerHTML = {
          event: "Event-time windows give <strong>14, 18, 4, 12</strong> regardless of arrival order. Toggle the order: the dots move vertically, but nobody changes window.",
          triggers: "A global window with <code>Repeatedly(AlignedDelay(TWO_MINUTES))</code> in discarding mode: each pane collects whatever arrived in that 2 minutes of processing time. Toggle the order and the totals change (12, 18, 18 vs 7, 36, 5).",
          ingress: "Event times are overwritten with arrival times (the dots slide onto the diagonal). Then normal fixed windows with a perfect watermark apply. The totals are identical to the trigger approach, but the windows are drawn on the event-time axis."
        }[st.method];
      }
      wireSegs(el, st, draw);
      draw();
    }
  };

  // ==================================================================
  // CH4 · sessions
  // ==================================================================
  function sessionize(rs, gap, maxLen) {
    const sorted = rs.slice().sort((a, b) => a.et - b.et), out = [];
    for (const r of sorted) {
      const c = out[out.length - 1];
      const newEnd = c ? Math.max(c.end, r.et + gap) : 0;
      if (c && r.et <= c.end && (!maxLen || newEnd - c.start <= maxLen)) { c.end = newEnd; c.sum += r.v; c.recs.push(r); }
      else out.push({ start: r.et, end: r.et + gap, sum: r.v, recs: [r] });
    }
    return out;
  }
  const sessKey = s => `${s.start}-${s.end}-${s.sum}`;

  DEMOS.sessions = {
    title: "Session windows: proto-sessions, merging and retractions",
    blurb: "Step through the nine records in arrival order. Each record gets a <strong>proto-session</strong> [t, t + gap), and overlapping ones <strong>merge</strong>. Every merge retracts previously emitted sessions. Watch Frank's late 9 bridge the 5 and the 22 into one session of <strong>36</strong>.",
    mount(el) {
      const recs = byPt(SCORES);
      const st = { k: 0, gap: 60, bounded: false };
      el.innerHTML = `
        <div class="ctl-row">
          <button class="iconbtn" data-prev>◀ Back</button>
          <button class="iconbtn" data-next>Next record ▶</button>
          <button class="iconbtn" data-all>Show all</button>
          <div class="range-wrap"><span class="ctl-label">Gap</span><input type="range" min="30" max="120" step="10" value="${st.gap}"><span class="range-val"></span></div>
          ${ctl("Bounded sessions", seg("bounded", [["false", "Off"], ["true", "Max 3 min"]], st.bounded))}
        </div>
        <div class="lab-grid">
          <div class="lab-panel"><div data-svg></div><div class="cs-note" data-step></div></div>
          <div class="lab-panel"><h4>Output stream (with retractions)</h4><div class="scroll-y" data-stream></div></div>
        </div>
        <div class="lab-note" data-note></div>`;
      const W = 620, H = 200, m = { l: 20, r: 14, t: 16, b: 30 };
      const X = lin(0, 560, m.l, W - m.r);
      function draw() {
        const maxLen = st.bounded ? 180 : 0;
        const seen = recs.slice(0, st.k);
        const sess = sessionize(seen, st.gap, maxLen);
        el.querySelector(".range-val").textContent = fmtDur(st.gap);
        let s = `<g class="svg-axis">`;
        for (let v = 0; v <= 540; v += 60) s += `<line class="svg-grid" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(v)}" y="${H - m.b + 14}" text-anchor="middle">${fmt(v, false)}</text>`;
        s += `</g><text class="svg-title" x="${m.l}" y="${m.t + 2}">Proto-sessions</text><text class="svg-title" x="${m.l}" y="${m.t + 92}">Merged sessions</text>`;
        recs.forEach((r, i) => {
          const isSeen = i < st.k, isNew = i === st.k - 1;
          if (isSeen) s += `<rect class="svg-proto" x="${X(r.et)}" y="${m.t + 46}" width="${X(r.et + st.gap) - X(r.et)}" height="10" ${isNew ? 'style="opacity:0.6"' : ""}/>`;
          s += `<circle class="svg-rec ${isSeen ? (r.missed ? "late" : "seen") : "pending"} ${isNew ? "hot" : ""}" cx="${X(r.et)}" cy="${m.t + 30}" r="9"/><text class="svg-rec-txt ${isSeen ? "" : "pending"}" x="${X(r.et)}" y="${m.t + 30}">${r.v}</text>`;
        });
        for (const c of sess) s += `<rect class="svg-session" x="${X(c.start)}" y="${m.t + 100}" width="${X(c.end) - X(c.start)}" height="30" rx="5"/><text class="svg-rec-txt" x="${(X(c.start) + X(c.end)) / 2}" y="${m.t + 115}" style="font-size:12px">${c.sum}</text>`;
        el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, s);
        const last = recs[st.k - 1];
        el.querySelector("[data-step]").innerHTML = st.k === 0 ? "Click <strong>Next record</strong> to start." : `Arrival ${st.k}/9 at ${fmt(last.pt)}: <strong>${last.name} ${last.v}</strong> (event time ${fmt(last.et)})${last.missed ? ", which arrives very late" : ""}.`;
        const rows = [];
        for (let i = 1; i <= st.k; i++) {
          const before = sessionize(recs.slice(0, i - 1), st.gap, maxLen), after = sessionize(recs.slice(0, i), st.gap, maxLen);
          const bk = new Set(before.map(sessKey)), ak = new Set(after.map(sessKey));
          before.filter(x => !ak.has(sessKey(x))).forEach(x => rows.push({ t: recs[i - 1].pt, undo: true, s: x, cur: i === st.k }));
          after.filter(x => !bk.has(sessKey(x))).forEach(x => rows.push({ t: recs[i - 1].pt, undo: false, s: x, cur: i === st.k }));
        }
        el.querySelector("[data-stream]").innerHTML = `<table class="mini-table"><thead><tr><th>Time</th><th>Session</th><th class="num">Sum</th><th></th></tr></thead><tbody>
          ${rows.map(r => `<tr class="${r.undo ? "undo" : ""} ${r.cur ? "new" : ""}"><td>${fmt(r.t)}</td><td>[${fmt(r.s.start)}, ${fmt(r.s.end)})</td><td class="num">${r.undo ? "−" : ""}${r.s.sum}</td><td>${r.undo ? '<span class="chip undo">undo</span>' : ""}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">nothing yet</td></tr>'}
          </tbody></table>`;
        el.querySelector("[data-note]").innerHTML = st.bounded
          ? "<strong>Bounded sessions:</strong> merging stops once a session would exceed 3 minutes, so the long session splits. This guards against bots that keep a session open forever."
          : "This is a per-record view of the book's Figure 4-7. In the book, early and on-time firings batch some of these changes, but the merge-and-retract pattern is the same. Without retractions, a downstream sum would count the 5 and the 22 <em>and</em> the 36.";
      }
      el.querySelector("[data-next]").addEventListener("click", () => { st.k = Math.min(9, st.k + 1); draw(); });
      el.querySelector("[data-prev]").addEventListener("click", () => { st.k = Math.max(0, st.k - 1); draw(); });
      el.querySelector("[data-all]").addEventListener("click", () => { st.k = 9; draw(); });
      el.querySelector("input[type=range]").addEventListener("input", e => { st.gap = +e.target.value; draw(); });
      wireSegs(el, st, draw);
      draw();
    }
  };

  // ==================================================================
  // CH4 · unaligned
  // ==================================================================
  DEMOS.unaligned = {
    title: "Aligned vs unaligned fixed windows: smoothing output bursts",
    blurb: "Twenty-four keys, each with 2-minute fixed windows. With <strong>aligned</strong> windows, every key's window closes at the same instant, so output arrives in big bursts. With <strong>unaligned</strong> windows, each key's windows are phase-shifted by hash(key) mod 2 min, and the same total output is spread evenly.",
    mount(el) {
      const st = { mode: "aligned", keys: 24 };
      el.innerHTML = `
        <div class="ctl-row">
          ${ctl("Windows", seg("mode", [["aligned", "Aligned"], ["unaligned", "Unaligned (per-key phase)"]], st.mode))}
          <div class="range-wrap"><span class="ctl-label">Keys</span><input type="range" min="4" max="60" step="1" value="${st.keys}"><span class="range-val"></span></div>
        </div>
        <div class="lab-panel"><h4>Panes emitted per 10 seconds of processing time</h4><div data-svg></div></div>
        <div class="stat-row" data-stats></div>
        <div class="lab-note">Per key, the semantics are identical: every key still gets non-overlapping 2-minute windows. Only the phase differs. In Beam this is a custom WindowFn whose assignment uses the element's key.</div>`;
      const hash = k => { let h = 2166136261; const s = "key" + k; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); };
      function draw() {
        el.querySelector(".range-val").textContent = st.keys;
        const SPAN = 960, BIN = 10, nb = SPAN / BIN, bins = new Array(nb).fill(0);
        for (let k = 0; k < st.keys; k++) {
          const shift = st.mode === "aligned" ? 0 : hash(k) % 120;
          for (let end = shift + 120; end <= SPAN; end += 120) { const t = end + 5; if (t < SPAN) bins[Math.floor(t / BIN)]++; }
        }
        const W = 640, H = 200, m = { l: 36, r: 10, t: 10, b: 28 };
        const mx = Math.max(...bins, 4);
        const X = lin(0, SPAN, m.l, W - m.r), Y = lin(0, mx, H - m.b, m.t);
        let s = `<g class="svg-axis">`;
        for (let v = 0; v <= SPAN; v += 120) s += `<line class="svg-grid" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(v)}" y="${H - m.b + 13}" text-anchor="middle">${fmt(v, false)}</text>`;
        for (let i = 0; i <= 4; i++) { const v = Math.round((mx / 4) * i); s += `<text x="${m.l - 4}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`; }
        s += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/></g>`;
        bins.forEach((c, i) => { if (c) s += `<rect class="${st.mode === "aligned" ? "svg-bar3" : "svg-bar"}" x="${X(i * BIN) + 0.5}" y="${Y(c)}" width="${Math.max(1, X(BIN) - X(0) - 1)}" height="${H - m.b - Y(c)}"/>`; });
        el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, s);
        const total = sum(bins), busy = bins.filter(c => c > 0).length;
        el.querySelector("[data-stats]").innerHTML = `<div class="stat-mini"><b>${total}</b>panes in total</div><div class="stat-mini ${st.mode === "aligned" ? "bad" : "good"}"><b>${Math.max(...bins)}</b>peak per 10s</div><div class="stat-mini"><b>${busy}/${nb}</b>busy 10s slots</div>`;
      }
      wireSegs(el, st, draw);
      el.querySelector("input[type=range]").addEventListener("input", e => { st.keys = +e.target.value; draw(); });
      draw();
    }
  };

  // Export for demos-part2.js
  window.DEMOS = DEMOS;
  window.SSLab = { T, fmt, fmtDur, esc, clamp, lin, mulberry32, parseVal, seg, setSeg, wireSegs, ctl, svgWrap, timingChip, okChip, sum, timeAxes, SCORES, SCORES_ALT, byPt, SIM_END, simulate, assignWindows, winLabel, finalPerWindow, trueSums, beamCode };
})();
