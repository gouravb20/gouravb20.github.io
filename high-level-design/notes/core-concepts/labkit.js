// Shared helpers for interactive labs. Exposes window.LabKit.
// Lab contract: window.DEMOS[id] = { title, blurb, mount(el, ctx) }
// ctx = { every(fn, ms) -> handle, clear(handle), onCleanup(fn) }

(function () {
  "use strict";

  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lin = (d0, d1, r0, r1) => v => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  const sum = a => a.reduce((s, x) => s + x, 0);
  const round = (v, d = 2) => { const p = Math.pow(10, d); return Math.round(v * p) / p; };

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

  // Segmented buttons: seg("mode", [["a","A"],["b","B"]], st.mode)
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

  // Sliders: rng("temp", 0, 2, 0.1, st.temp)
  const rng = (key, min, max, step, val) =>
    `<span class="range-wrap"><input type="range" data-rng="${key}" min="${min}" max="${max}" step="${step}" value="${val}"><span class="range-val" data-rv="${key}"></span></span>`;
  function wireRanges(root, st, fmts, onChange) {
    root.querySelectorAll("input[data-rng]").forEach(inp => {
      const k = inp.dataset.rng;
      const out = root.querySelector(`[data-rv="${k}"]`);
      const show = () => { if (out) out.textContent = (fmts && fmts[k]) ? fmts[k](st[k]) : st[k]; };
      st[k] = +inp.value; show();
      inp.addEventListener("input", () => { st[k] = +inp.value; show(); onChange(k); });
    });
  }

  const ctl = (label, inner) => `<span class="ctl"><span class="ctl-label">${label}</span>${inner}</span>`;
  const svgWrap = (w, h, inner) => `<svg class="lab-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
  const okChip = (ok, yes = "✓ correct", no = "✗ wrong") => `<span class="chip ${ok ? "ok" : "no"}">${ok ? yes : no}</span>`;
  const stat = (label, value, cls) => `<div class="stat-mini ${cls || ""}"><b>${value}</b>${label}</div>`;
  const note = (html, cls) => `<div class="lab-note ${cls || ""}">${html}</div>`;

  // Horizontal bars: rows = [{label, value, max?, cls?, text?, dim?}]
  function hbars(rows, max) {
    const m = max || Math.max(1e-9, ...rows.map(r => r.value));
    return `<div class="hbars">${rows.map(r => `
      <div class="hbar ${r.dim ? "dim" : ""}" title="${esc(r.title || r.label)}">
        <span class="hbar-label">${r.label}</span>
        <span class="hbar-track"><span class="hbar-fill ${r.cls || ""}" style="width:${clamp((r.value / m) * 100, 0, 100)}%;display:block"></span></span>
        <span class="hbar-val">${r.text != null ? r.text : round(r.value, 2)}</span>
      </div>`).join("")}</div>`;
  }

  // Numeric axes. o: {x0,x1,y0,y1 px; dx0,dx1,dy0,dy1 domain; xTicks,yTicks arrays; xFmt,yFmt; xLabel,yLabel; xLog?}
  function axes(o) {
    const lx = o.xLog ? v => Math.log10(v) : v => v;
    const X0 = lin(lx(o.dx0), lx(o.dx1), o.x0, o.x1);
    const X = v => X0(lx(v));
    const Y = lin(o.dy0, o.dy1, o.y0, o.y1);
    const xf = o.xFmt || (v => v), yf = o.yFmt || (v => v);
    let s = `<g class="svg-axis">`;
    (o.xTicks || []).forEach(v => {
      s += `<line class="svg-grid" x1="${X(v)}" x2="${X(v)}" y1="${o.y0}" y2="${o.y1}"/>`;
      s += `<text x="${X(v)}" y="${o.y0 + 14}" text-anchor="middle">${xf(v)}</text>`;
    });
    (o.yTicks || []).forEach(v => {
      s += `<line class="svg-grid" x1="${o.x0}" x2="${o.x1}" y1="${Y(v)}" y2="${Y(v)}"/>`;
      s += `<text x="${o.x0 - 5}" y="${Y(v) + 3}" text-anchor="end">${yf(v)}</text>`;
    });
    s += `<line x1="${o.x0}" x2="${o.x1}" y1="${o.y0}" y2="${o.y0}"/><line x1="${o.x0}" x2="${o.x0}" y1="${o.y0}" y2="${o.y1}"/></g>`;
    if (o.xLabel) s += `<text class="svg-label" x="${(o.x0 + o.x1) / 2}" y="${o.y0 + 28}" text-anchor="middle">${o.xLabel}</text>`;
    if (o.yLabel) s += `<text class="svg-label" transform="translate(12 ${(o.y0 + o.y1) / 2}) rotate(-90)" text-anchor="middle">${o.yLabel}</text>`;
    return { svg: s, X, Y };
  }
  const path = pts => pts.map((p, i) => (i ? "L" : "M") + round(p[0], 1) + " " + round(p[1], 1)).join(" ");

  // Number formatting
  function fmtNum(v, d = 1) {
    const a = Math.abs(v);
    if (a >= 1e12) return round(v / 1e12, d) + "T";
    if (a >= 1e9) return round(v / 1e9, d) + "B";
    if (a >= 1e6) return round(v / 1e6, d) + "M";
    if (a >= 1e3) return round(v / 1e3, d) + "K";
    return String(round(v, d));
  }
  function fmtBytes(b) {
    const a = Math.abs(b);
    if (a >= 1e12) return round(b / 1e12, 2) + " TB";
    if (a >= 1e9) return round(b / 1e9, 1) + " GB";
    if (a >= 1e6) return round(b / 1e6, 1) + " MB";
    if (a >= 1e3) return round(b / 1e3, 1) + " KB";
    return b + " B";
  }
  const pct = (v, d = 0) => round(v * 100, d) + "%";

  // Text / ML helpers
  const STOP = new Set("a an the of in on at to for and or is are was were be by with as what which who whom when where how did does do it its this that from his her he she they them their there".split(" "));
  const words = s => (String(s).toLowerCase().match(/[a-z0-9']+/g) || []);
  const contentWords = s => words(s).filter(w => !STOP.has(w));
  function softmax(xs, temp = 1) {
    const t = Math.max(temp, 1e-6);
    const m = Math.max(...xs.map(x => x / t));
    const e = xs.map(x => Math.exp(x / t - m));
    const z = sum(e);
    return e.map(v => v / z);
  }
  function cosine(a, b) {
    let d = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? d / Math.sqrt(na * nb) : 0;
  }
  function jaccard(A, B) {
    const a = new Set(A), b = new Set(B);
    let inter = 0; a.forEach(x => { if (b.has(x)) inter++; });
    const uni = a.size + b.size - inter;
    return uni ? inter / uni : 0;
  }
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }

  window.LabKit = {
    esc, clamp, lin, sum, round, mulberry32, parseVal, seg, setSeg, wireSegs, rng, wireRanges,
    ctl, svgWrap, okChip, stat, note, hbars, axes, path, fmtNum, fmtBytes, pct,
    STOP, words, contentWords, softmax, cosine, jaccard, levenshtein
  };
  window.DEMOS = window.DEMOS || {};
})();
