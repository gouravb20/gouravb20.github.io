// Advanced topics labs - proximity search, big-data structures, vector databases, time series, CDC (chapters 1-4, 6-10)
(function () {
  "use strict";
  const { esc, clamp, sum, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, path, fmtNum, pct } = window.LabKit;
  const D = window.DEMOS;
  const PAL = [`var(--accent)`, `var(--accent-2)`, `var(--accent-3)`, `#a78bfa`, `#f472b6`, `#4ade80`, `#f87171`, `#facc15`];
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const fmtB = b => { const a = Math.abs(b); if (a >= 1e15) return round(b / 1e15, 2) + ` PB`; if (a >= 1e12) return round(b / 1e12, 2) + ` TB`; if (a >= 1e9) return round(b / 1e9, 1) + ` GB`; if (a >= 1e6) return round(b / 1e6, 1) + ` MB`; if (a >= 1e3) return round(b / 1e3, 1) + ` KB`; return Math.round(b) + ` B`; };
  const fmtT = s => s >= 86400 ? round(s / 86400, 1) + ` days` : s >= 3600 ? round(s / 3600, 1) + ` h` : s >= 60 ? round(s / 60, 1) + ` min` : s >= 1 ? round(s, 1) + ` s` : s >= 1e-3 ? round(s * 1e3, 1) + ` ms` : round(s * 1e6, 0) + ` µs`;
  const h32 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; };
  const hashInt = (x, s) => { let h = Math.imul((x | 0) ^ (s | 0), 0x9e3779b1); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
  const gauss = r => { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const zipfCdf = (n, s) => { const c = new Float64Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc += 1 / Math.pow(i + 1, s); c[i] = acc; } for (let i = 0; i < n; i++) c[i] /= acc; return c; };
  const zipfPick = (cdf, u) => { let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } return lo; };
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });

  // =====================================================================
  // Ch1 - Why a latitude index doesn't find nearby points
  // =====================================================================
  const LS_N = 6000;
  const LS_C = { down: [36, 42], sub: [80, 74] };
  function lsPoints(seed) {
    const r = mulberry32(seed), pts = [];
    for (let i = 0; i < LS_N; i++) {
      if (r() < 0.65) pts.push([clamp(36 + gauss(r) * 9, 0, 100), clamp(42 + gauss(r) * 9, 0, 100)]);
      else pts.push([r() * 100, r() * 100]);
    }
    return pts;
  }
  const LS_M = { scan: `full table scan`, lat: `B-tree on latitude`, latlng: `composite (lat, lng)`, cells: `grid cells (3×3)` };
  function lsEval(pts, cx, cy, r) {
    const cell = r;
    const qcx = Math.floor(cx / cell), qcy = Math.floor(cy / cell);
    let strip = 0, box = 0, cells = 0, res = 0;
    const cls = new Uint8Array(pts.length);
    pts.forEach(([x, y], i) => {
      const inStrip = Math.abs(y - cy) <= r;
      const inBox = inStrip && Math.abs(x - cx) <= r;
      const inCells = Math.abs(Math.floor(x / cell) - qcx) <= 1 && Math.abs(Math.floor(y / cell) - qcy) <= 1;
      const hit = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      if (inStrip) strip++;
      if (inBox) box++;
      if (inCells) cells++;
      if (hit) res++;
      cls[i] = (inStrip ? 1 : 0) | (inBox ? 2 : 0) | (inCells ? 4 : 0) | (hit ? 8 : 0);
    });
    return {
      cls, res, cell, qcx, qcy,
      m: {
        scan: { walked: 0, fetched: pts.length },
        lat: { walked: strip, fetched: strip },
        latlng: { walked: strip, fetched: box },
        cells: { walked: cells, fetched: cells }
      }
    };
  }
  D.latStrip = {
    title: `Why a B-tree on latitude can't find nearby drivers`,
    blurb: `${fmtNum(LS_N)} drivers in a 100 × 100 km city, most of them downtown. A rider asks for drivers within a radius. Compare what each access path has to read before the exact distance check can throw away the misses. Real latitude bands wrap the whole planet, so the waste here is a gentle version of reality.`,
    mount(el) {
      const st = { method: `lat`, where: `down`, radius: 3 };
      const pts = lsPoints(19);
      el.innerHTML = `
        <div class="ctl-row">${ctl(`access path`, seg(`method`, Object.keys(LS_M).map(k => [k, LS_M[k]]), st.method))}</div>
        <div class="ctl-row">${ctl(`rider is`, seg(`where`, [[`down`, `downtown`], [`sub`, `in the suburbs`]], st.where))}${ctl(`search radius`, rng(`radius`, 0.5, 10, 0.5, st.radius))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>What gets read</h4><div data-k="map"></div><div class="legend"><span><i class="sw" style="background:var(--good)"></i>result</span><span><i class="sw" style="background:var(--accent-3)"></i>read, then discarded</span><span><i class="sw" style="background:#64748b"></i>not read</span></div></div>
          <div class="lab-panel"><h4>Selected access path</h4><div class="stat-row" data-k="stats"></div><h4 style="margin-top:12px">All access paths</h4><div data-k="tbl"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const [cx, cy] = LS_C[st.where], r = st.radius;
        const E = lsEval(pts, cx, cy, r);
        const S = 3.6, W = 360;
        const X = v => round(v * S, 1), Y = v => round(W - v * S, 1);
        let s = `<rect x="0" y="0" width="${W}" height="${W}" style="fill:var(--bg-2);stroke:var(--border)"/>`;
        if (st.method === `lat` || st.method === `latlng`) s += `<rect x="0" y="${Y(cy + r)}" width="${W}" height="${round(2 * r * S, 1)}" style="fill:var(--accent);opacity:.14"/>`;
        if (st.method === `latlng`) s += `<rect x="${X(cx - r)}" y="${Y(cy + r)}" width="${round(2 * r * S, 1)}" height="${round(2 * r * S, 1)}" style="fill:none;stroke:var(--accent-2);stroke-width:1.5"/>`;
        if (st.method === `cells`) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) s += `<rect x="${X((E.qcx + i) * E.cell)}" y="${Y((E.qcy + j + 1) * E.cell)}" width="${round(E.cell * S, 1)}" height="${round(E.cell * S, 1)}" style="fill:var(--accent);fill-opacity:.12;stroke:var(--accent);stroke-width:1"/>`;
        const bit = { scan: 15, lat: 1, latlng: 2, cells: 4 }[st.method];
        let dots = ``;
        pts.forEach(([x, y], i) => {
          const c = E.cls[i], read = st.method === `scan` || (c & bit), hit = c & 8;
          const col = hit ? `var(--good)` : read ? `var(--accent-3)` : `#64748b`;
          dots += `<circle cx="${X(x)}" cy="${Y(y)}" r="${hit ? 1.8 : 1.1}" style="fill:${col};opacity:${read || hit ? 0.9 : 0.3}"/>`;
        });
        s += dots + `<circle cx="${X(cx)}" cy="${Y(cy)}" r="${round(r * S, 1)}" style="fill:none;stroke:var(--good);stroke-width:2"/><circle cx="${X(cx)}" cy="${Y(cy)}" r="3.5" style="fill:var(--text)"/>`;
        q(`map`).innerHTML = svgWrap(W, W, s);
        const m = E.m[st.method];
        const waste = m.fetched ? 1 - E.res / m.fetched : 0;
        q(`stats`).innerHTML = stat(`index entries walked`, st.method === `scan` ? `-` : fmtNum(m.walked)) + stat(`rows fetched and distance-checked`, fmtNum(m.fetched), m.fetched > 20 * Math.max(1, E.res) ? `bad` : m.fetched > 4 * Math.max(1, E.res) ? `warn` : `good`) + stat(`actual results`, fmtNum(E.res)) + stat(`work thrown away`, pct(waste, 0), waste > 0.9 ? `bad` : waste > 0.6 ? `warn` : `good`);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>access path</th><th class="num">walked</th><th class="num">fetched</th></tr>${Object.keys(LS_M).map(k => `<tr class="${k === st.method ? `new` : ``}"><td>${LS_M[k]}</td><td class="num">${k === `scan` ? `-` : fmtNum(E.m[k].walked)}</td><td class="num">${fmtNum(E.m[k].fetched)}</td></tr>`).join(``)}</table></div><div class="cs-note">Walked = index entries scanned; fetched = rows read and distance-checked. All paths return the same ${fmtNum(E.res)} results.</div>`;
        const lat = E.m.lat.fetched, cells = E.m.cells.fetched;
        const N = {
          scan: `A full scan computes the distance to all ${fmtNum(LS_N)} drivers to find ${fmtNum(E.res)}. Fine for a toy table, hopeless for millions of rows at thousands of queries per second.`,
          lat: `The latitude index narrows the search to a horizontal band, but the band spans the whole map: ${fmtNum(lat)} rows fetched for ${fmtNum(E.res)} results. A B-tree sorts by one value, so it can only cut along one axis.`,
          latlng: `The composite index still walks the whole latitude band (${fmtNum(E.m.latlng.walked)} entries), because longitude is only sorted <i>within</i> each exact latitude value. It filters on longitude while scanning, so only ${fmtNum(E.m.latlng.fetched)} rows are fetched, but the scan cost is the same as the latitude-only index.`,
          cells: `Bucketing drivers into cells about as wide as the radius turns the query into 9 exact-match lookups: ${fmtNum(cells)} rows read for ${fmtNum(E.res)} results, ${lat > 0 ? round(lat / Math.max(1, cells), 1) + `× fewer than the latitude band` : `far less than a scan`}. This is the idea behind geohash, S2, H3 and grid indexes.`
        };
        let n = N[st.method];
        if (st.where === `down` && st.method !== `scan`) n += ` Downtown is dense, so every approach reads more; with spatial cells the work grows with the local density, not with the size of the map.`;
        q(`note`).innerHTML = note(n, st.method === `cells` ? `good` : st.method === `scan` ? `bad` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { radius: v => v + ` km` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch1 - Quadtree: adaptive cells
  // =====================================================================
  function qtPoints(n, dist, seed) {
    const r = mulberry32(seed + n * 3 + (dist === `city` ? 1 : dist === `two` ? 2 : 0)), pts = [];
    for (let i = 0; i < n; i++) {
      if (dist === `uniform`) pts.push([r() * 100, r() * 100]);
      else if (dist === `city`) pts.push(r() < 0.8 ? [clamp(35 + gauss(r) * 5, 0, 99.99), clamp(40 + gauss(r) * 5, 0, 99.99)] : [r() * 100, r() * 100]);
      else { const u = r(); pts.push(u < 0.45 ? [clamp(28 + gauss(r) * 4, 0, 99.99), clamp(30 + gauss(r) * 4, 0, 99.99)] : u < 0.9 ? [clamp(70 + gauss(r) * 6, 0, 99.99), clamp(68 + gauss(r) * 6, 0, 99.99)] : [r() * 100, r() * 100]); }
    }
    return pts;
  }
  function qtBuild(pts, cap) {
    const root = { x: 0, y: 0, w: 100, d: 0, pts: pts.slice(), kids: null };
    const stack = [root], leaves = [];
    let nodes = 1, maxD = 0;
    while (stack.length) {
      const n = stack.pop();
      maxD = Math.max(maxD, n.d);
      if (n.pts.length > cap && n.d < 14) {
        const hw = n.w / 2;
        n.kids = [[0, 0], [hw, 0], [0, hw], [hw, hw]].map(([dx, dy]) => ({ x: n.x + dx, y: n.y + dy, w: hw, d: n.d + 1, pts: [], kids: null }));
        n.pts.forEach(p => n.kids[(p[0] >= n.x + hw ? 1 : 0) + (p[1] >= n.y + hw ? 2 : 0)].pts.push(p));
        n.pts = null;
        nodes += 4;
        stack.push(...n.kids);
      } else leaves.push(n);
    }
    return { root, leaves, nodes, maxD };
  }
  function qtQuery(root, cx, cy, r) {
    let visited = 0, checked = 0, res = 0;
    const hitLeaves = [];
    const go = n => {
      const nx = clamp(cx, n.x, n.x + n.w), ny = clamp(cy, n.y, n.y + n.w);
      if ((nx - cx) ** 2 + (ny - cy) ** 2 > r * r) return;
      visited++;
      if (n.kids) { n.kids.forEach(go); return; }
      hitLeaves.push(n);
      checked += n.pts.length;
      n.pts.forEach(p => { if ((p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= r * r) res++; });
    };
    go(root);
    let n = root;
    while (n.kids) n = n.kids[(cx >= n.x + n.w / 2 ? 1 : 0) + (cy >= n.y + n.w / 2 ? 2 : 0)];
    return { visited, checked, res, hitLeaves, depthAt: n.d };
  }
  D.quadtree = {
    title: `Quadtree: cells that split where the data is dense`,
    blurb: `Each square splits into four once it holds more than the leaf capacity. Dense areas end up with small, deep cells and empty areas stay as large shallow cells. A radius query only descends into squares that touch the circle.`,
    mount(el) {
      const st = { n: 2000, cap: 8, dist: `city`, where: `down`, radius: 2 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`points`, rng(`n`, 200, 5000, 100, st.n))}${ctl(`leaf capacity`, rng(`cap`, 2, 64, 1, st.cap))}${ctl(`search radius`, rng(`radius`, 1, 15, 0.5, st.radius))}</div>
        <div class="ctl-row">${ctl(`distribution`, seg(`dist`, [[`uniform`, `uniform`], [`city`, `one dense city`], [`two`, `two cities`]], st.dist))}${ctl(`query at`, seg(`where`, [[`down`, `dense area`], [`rural`, `sparse area`]], st.where))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Tree cells and the query</h4><div data-k="map"></div><div class="legend"><span><i class="sw" style="background:var(--accent-3)"></i>leaves the query had to scan</span></div></div>
          <div class="lab-panel"><h4>Tree and query cost</h4><div class="stat-row" data-k="stats"></div><h4 style="margin-top:12px">Leaves by depth</h4><div data-k="depth"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      let cacheKey = ``, pts = null, T = null;
      const draw = () => {
        const key = st.n + `|` + st.dist + `|` + st.cap;
        if (key !== cacheKey) { pts = qtPoints(st.n, st.dist, 7); T = qtBuild(pts, st.cap); cacheKey = key; }
        const [cx, cy] = st.where === `down` ? (st.dist === `two` ? [28, 30] : st.dist === `city` ? [35, 40] : [40, 45]) : [85, 15];
        const Q = qtQuery(T.root, cx, cy, st.radius);
        const S = 3.6, W = 360, X = v => round(v * S, 1), Y = v => round(W - v * S, 1);
        let s = `<rect x="0" y="0" width="${W}" height="${W}" style="fill:var(--bg-2)"/>`;
        const hit = new Set(Q.hitLeaves);
        pts.forEach(p => { s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r=".8" style="fill:var(--text);opacity:.35"/>`; });
        T.leaves.forEach(l => { s += `<rect x="${X(l.x)}" y="${Y(l.y + l.w)}" width="${round(l.w * S, 1)}" height="${round(l.w * S, 1)}" style="fill:${hit.has(l) ? `var(--accent-3)` : `none`};fill-opacity:.3;stroke:${hit.has(l) ? `var(--accent-3)` : `#475569`};stroke-width:${hit.has(l) ? 1 : 0.6}"/>`; });
        s += `<circle cx="${X(cx)}" cy="${Y(cy)}" r="${round(st.radius * S, 1)}" style="fill:none;stroke:var(--good);stroke-width:2"/><circle cx="${X(cx)}" cy="${Y(cy)}" r="3" style="fill:var(--good)"/>`;
        q(`map`).innerHTML = svgWrap(W, W, s);
        const kd = Math.ceil(Math.log2(Math.max(2, st.n / st.cap)));
        q(`stats`).innerHTML = stat(`tree nodes`, fmtNum(T.nodes)) + stat(`leaves`, fmtNum(T.leaves.length)) + stat(`max depth`, T.maxD) + stat(`depth at the query point`, Q.depthAt) + stat(`nodes visited`, Q.visited) + stat(`points checked`, `${fmtNum(Q.checked)} of ${fmtNum(st.n)}`, Q.checked < st.n * 0.1 ? `good` : `warn`) + stat(`results`, Q.res) + stat(`balanced k-d tree depth`, kd);
        const byD = {};
        T.leaves.forEach(l => { byD[l.d] = (byD[l.d] || 0) + 1; });
        const ds = Object.keys(byD).map(Number).sort((a, b) => a - b);
        q(`depth`).innerHTML = hbars(ds.map(d => ({ label: `depth ${d}`, value: byD[d], text: byD[d], cls: d === Q.depthAt ? `alt` : `` })));
        let n = `The tree has ${fmtNum(T.leaves.length)} leaves, from depth ${ds[0]} to ${T.maxD}. The query visited ${Q.visited} nodes and checked ${fmtNum(Q.checked)} points (${pct(Q.checked / st.n, 1)} of the data) to return ${Q.res}.`;
        if (st.dist !== `uniform` && T.maxD - ds[0] >= 3) n += ` The dense area sits ${T.maxD - ds[0]} levels deeper than empty space: cell size adapts to density, which a fixed grid or geohash precision can't do.`;
        if (st.cap <= 4) n += ` A tiny leaf capacity means a deep tree, so every query and insert walks more levels.`;
        if (st.cap >= 48) n += ` A large leaf capacity gives a shallow tree, but each leaf it touches makes the query check many points.`;
        n += ` A balanced k-d tree would be about ${kd} levels deep; it splits on the median, so it adapts too, but rebalancing under constant inserts is costly.`;
        q(`note`).innerHTML = note(n, `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => fmtNum(v), cap: v => v, radius: v => v + ` km` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch2 - Geohash encoder and 9-cell proximity search
  // =====================================================================
  const B32 = `0123456789bcdefghjkmnpqrstuvwxyz`;
  function ghEncode(lat, lon, prec) {
    const la = [-90, 90], lo = [-180, 180];
    let hash = ``, bit = 0, ch = 0, even = true;
    while (hash.length < prec) {
      const R = even ? lo : la, v = even ? lon : lat, mid = (R[0] + R[1]) / 2;
      if (v >= mid) { ch = ch * 2 + 1; R[0] = mid; } else { ch = ch * 2; R[1] = mid; }
      even = !even;
      if (++bit === 5) { hash += B32[ch]; bit = 0; ch = 0; }
    }
    return { hash, la, lo };
  }
  const GH_PLACES = { nyc: [`Times Square`, 40.758, -73.9855], lon: [`Trafalgar Sq`, 51.508, -0.128], blr: [`MG Road, Bengaluru`, 12.9757, 77.6061], sfo: [`Union Square, SF`, 37.788, -122.4075] };
  D.geohash = {
    title: `Geohash: nearby search with a prefix lookup`,
    blurb: `A geohash interleaves latitude and longitude bits and writes them in base 32; each extra character shrinks the cell about 32x. To find places within a radius, compute the user's cell, fetch everything in that cell and its <strong>8 neighbours</strong> (a plain prefix or key lookup), then filter by exact distance. The dots are 90 random places around the user, and the encoding below is real.`,
    mount(el) {
      const st = { place: `nyc`, prec: 6, radius: 0.5 };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`user at`, seg(`place`, Object.keys(GH_PLACES).map(k => [k, GH_PLACES[k][0]]), st.place))}</div>
        <div class="ctl-row">${ctl(`geohash length`, rng(`prec`, 4, 8, 1, st.prec))}${ctl(`search radius`, rng(`radius`, 0.05, 5, 0.05, st.radius))}<button class="lab-btn ghost" data-act="again">New places</button></div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Cells around the user</h4><div data-k="map"></div>
            <div class="legend"><span><i class="sw" style="background:var(--good)"></i>within radius, found</span><span><i class="sw" style="background:var(--accent-2)"></i>fetched, filtered out</span><span><i class="sw" style="background:var(--bad)"></i>within radius, missed</span><span><i class="sw" style="background:var(--text-muted)"></i>not fetched</span></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div><div data-k="bits"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const [name, lat, lon] = GH_PLACES[st.place];
        const cell = ghEncode(lat, lon, st.prec);
        const dLa = cell.la[1] - cell.la[0], dLo = cell.lo[1] - cell.lo[0];
        const kmLa = dLa * 110.57, kmLo = dLo * 111.32 * Math.cos(lat * Math.PI / 180);
        const cLa = (cell.la[0] + cell.la[1]) / 2, cLo = (cell.lo[0] + cell.lo[1]) / 2;
        const nine = new Set();
        const labels = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const h = ghEncode(cLa + dy * dLa, cLo + dx * dLo, st.prec).hash; nine.add(h); labels.push({ dx, dy, h }); }
        const r = mulberry32(seed * 101 + st.prec * 7 + Object.keys(GH_PLACES).indexOf(st.place));
        const pts = Array.from({ length: 90 }, () => {
          const pla = cell.la[0] - 2 * dLa + r() * 5 * dLa, plo = cell.lo[0] - 2 * dLo + r() * 5 * dLo;
          const dist = Math.hypot((pla - lat) * 110.57, (plo - lon) * 111.32 * Math.cos(lat * Math.PI / 180));
          return { pla, plo, dist, cand: nine.has(ghEncode(pla, plo, st.prec).hash) };
        });
        const W = 500, H = clamp(W * kmLa / kmLo, 180, 420);
        const X = v => ((v - (cell.lo[0] - 2 * dLo)) / (5 * dLo)) * W, Y = v => H - ((v - (cell.la[0] - 2 * dLa)) / (5 * dLa)) * H;
        let s = ``;
        for (let i = 0; i <= 5; i++) { s += `<line class="svg-grid" x1="${i * W / 5}" x2="${i * W / 5}" y1="0" y2="${H}"/><line class="svg-grid" x1="0" x2="${W}" y1="${i * H / 5}" y2="${i * H / 5}"/>`; }
        s += `<rect x="${W / 5}" y="${H / 5}" width="${3 * W / 5}" height="${3 * H / 5}" style="fill:var(--accent-2);opacity:.08;stroke:var(--accent-2)"/>`;
        s += `<rect x="${2 * W / 5}" y="${2 * H / 5}" width="${W / 5}" height="${H / 5}" style="fill:var(--accent);opacity:.12;stroke:var(--accent);stroke-width:1.5"/>`;
        labels.forEach(lb => { const t = lb.h.length > 6 ? `…` + lb.h.slice(-4) : lb.h; s += `<text class="svg-label" x="${(2.5 + lb.dx) * W / 5}" y="${(2.5 - lb.dy) * H / 5 - H / 10 + 12}" text-anchor="middle" style="${lb.dx === 0 && lb.dy === 0 ? `fill:var(--text);font-weight:700` : ``}">${t}</text>`; });
        const rx = st.radius / (5 * kmLo) * W, ry = st.radius / (5 * kmLa) * H;
        s += `<ellipse cx="${X(lon)}" cy="${Y(lat)}" rx="${rx}" ry="${ry}" style="fill:none;stroke:var(--text);stroke-dasharray:4 3"/>`;
        pts.forEach(p => {
          const inR = p.dist <= st.radius;
          const col = inR && p.cand ? `var(--good)` : p.cand ? `var(--accent-2)` : inR ? `var(--bad)` : `var(--text-muted)`;
          s += `<circle cx="${X(p.plo)}" cy="${Y(p.pla)}" r="${inR ? 4 : 3}" style="fill:${col};opacity:${p.cand || inR ? 1 : .45}"/>`;
        });
        s += `<circle cx="${X(lon)}" cy="${Y(lat)}" r="5" style="fill:var(--text)"/>`;
        q(`map`).innerHTML = svgWrap(W, H, s);
        const cand = pts.filter(p => p.cand), match = pts.filter(p => p.dist <= st.radius), found = match.filter(p => p.cand), missed = match.length - found.length;
        const across = ghEncode(lat, cell.lo[1] + dLo * 0.001, st.prec).hash;
        let common = 0; while (common < st.prec && across[common] === cell.hash[common]) common++;
        q(`stats`).innerHTML = stat(`geohash of ${esc(name)}`, `<span class="mono">${cell.hash}</span>`) + stat(`cell size`, `${kmLo >= 1 ? round(kmLo, 1) + ` km` : Math.round(kmLo * 1000) + ` m`} x ${kmLa >= 1 ? round(kmLa, 1) + ` km` : Math.round(kmLa * 1000) + ` m`}`) + stat(`places fetched (9 cells)`, cand.length) + stat(`within ${st.radius} km`, match.length) + stat(`missed`, missed, missed ? `bad` : `good`) + stat(`fetched that were useful`, cand.length ? pct(found.length / cand.length) : `-`);
        q(`bits`).innerHTML = `<div class="cs-note" style="margin-top:8px">A point just across the cell's east edge has geohash <span class="mono">${across}</span>, sharing ${common} of ${st.prec} characters, which is why neighbours must be searched too.</div>`;
        const minCell = Math.min(kmLa, kmLo);
        let n;
        if (st.radius > minCell) n = `The radius (${st.radius} km) is larger than a cell (${round(minCell, 2)} km), so the 3x3 block can't cover it and ${missed} nearby places were missed. Use a shorter geohash (bigger cells) or fetch more rings of neighbours.`;
        else if (cand.length && found.length / cand.length < 0.15) n = `The 9 cells are much bigger than the search circle, so most fetched places are thrown away by the distance filter. A longer geohash (smaller cells) would fetch less.`;
        else n = `Cells of about ${round(minCell, 2)} km comfortably cover a ${st.radius} km radius: one lookup per cell for 9 prefixes, then an exact distance check. Pick the geohash length so a cell is at least as big as the radius.`;
        q(`note`).innerHTML = note(n, st.radius > minCell ? `bad` : `good`);
      };
      el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) { seed++; draw(); } });
      wireSegs(el, st, draw);
      wireRanges(el, st, { prec: v => v + ` chars`, radius: v => v + ` km` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch2 - Geohash cell shape vs latitude
  // =====================================================================
  const R_EARTH = 6371;
  function ghCell(prec, lat) {
    const bits = 5 * prec, lonBits = Math.ceil(bits / 2), latBits = Math.floor(bits / 2);
    const h = 180 / Math.pow(2, latBits) * 111.32, wEq = 360 / Math.pow(2, lonBits) * 111.32;
    return { w: wEq * Math.cos(lat * Math.PI / 180), h, wEq };
  }
  function s2Level(areaKm2) {
    const total = 4 * Math.PI * R_EARTH * R_EARTH;
    const L = clamp(Math.round(Math.log(total / (6 * areaKm2)) / Math.log(4)), 0, 30);
    return { L, side: Math.sqrt(total / (6 * Math.pow(4, L))) };
  }
  const fmtKm = v => v >= 1 ? round(v, v >= 10 ? 1 : 2) + ` km` : Math.round(v * 1000) + ` m`;
  D.cellShape = {
    title: `Geohash cells shrink toward the poles; S2 cells don't`,
    blurb: `A geohash cell spans a fixed number of degrees. A degree of latitude is always ~111 km, but a degree of longitude shrinks with cos(latitude), so the same precision covers very different shapes in Singapore and in Oslo. S2 projects the sphere onto a cube first, so its cells stay roughly square everywhere.`,
    mount(el) {
      const st = { lat: 45, prec: 6 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`latitude`, rng(`lat`, 0, 85, 1, st.lat))}${ctl(`geohash precision (characters)`, rng(`prec`, 4, 8, 1, st.prec))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Cell shapes at this latitude (same scale)</h4><div data-k="shape"></div></div>
          <div class="lab-panel"><h4>Geohash cell width vs latitude</h4><div data-k="chart"></div><div class="legend"><span><i class="sw line" style="background:var(--accent)"></i>geohash width</span><span><i class="sw line" style="background:var(--accent-2)"></i>geohash height</span><span><i class="sw line" style="background:var(--good)"></i>S2 cell side (comparable level)</span></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>Same precision around the world</h4><div class="stat-row" data-k="stats"></div><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const g = ghCell(st.prec, st.lat), g0 = ghCell(st.prec, 0);
        const s2 = s2Level(g0.wEq * g0.h);
        const maxDim = Math.max(g0.wEq, g.h, s2.side);
        const sc = 150 / maxDim;
        let s = ``;
        const gw = Math.max(1, g.w * sc), gh = g.h * sc, ss = s2.side * sc;
        s += `<rect x="${round(120 - gw / 2, 1)}" y="${round(100 - gh / 2, 1)}" width="${round(gw, 1)}" height="${round(gh, 1)}" style="fill:var(--accent);fill-opacity:.25;stroke:var(--accent);stroke-width:2"/>`;
        s += `<text class="svg-label" x="120" y="196" text-anchor="middle">geohash (${st.prec} chars)</text><text class="svg-label" x="120" y="210" text-anchor="middle">${fmtKm(g.w)} × ${fmtKm(g.h)}</text>`;
        s += `<rect x="${round(340 - ss / 2, 1)}" y="${round(100 - ss / 2, 1)}" width="${round(ss, 1)}" height="${round(ss, 1)}" style="fill:var(--good);fill-opacity:.2;stroke:var(--good);stroke-width:2"/>`;
        s += `<text class="svg-label" x="340" y="196" text-anchor="middle">S2 level ${s2.L} (average)</text><text class="svg-label" x="340" y="210" text-anchor="middle">~${fmtKm(s2.side)} × ${fmtKm(s2.side)}</text>`;
        q(`shape`).innerHTML = svgWrap(460, 220, s);
        const ymax = Math.max(g0.wEq, g0.h, s2.side) * 1.1;
        const a = axes({ x0: 56, x1: 350, y0: 180, y1: 12, dx0: 0, dx1: 85, dy0: 0, dy1: ymax, xTicks: [0, 30, 60, 85], yTicks: [0, ymax / 2, ymax].map(v => round(v, 2)), xFmt: v => v + `°`, yFmt: v => fmtKm(v), xLabel: `latitude` });
        let c = a.svg;
        const wp = [], hp = [], sp = [];
        for (let la = 0; la <= 85; la += 1) { wp.push([a.X(la), a.Y(ghCell(st.prec, la).w)]); hp.push([a.X(la), a.Y(g.h)]); sp.push([a.X(la), a.Y(s2.side)]); }
        c += `<path d="${path(hp)}" style="fill:none;stroke:var(--accent-2);stroke-width:2;stroke-dasharray:5 3"/><path d="${path(sp)}" style="fill:none;stroke:var(--good);stroke-width:2;stroke-dasharray:2 3"/><path d="${path(wp)}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        c += `<circle cx="${a.X(st.lat)}" cy="${a.Y(g.w)}" r="5" style="fill:var(--accent-3)"/>`;
        q(`chart`).innerHTML = svgWrap(360, 214, c);
        const ratio = g.w / g0.wEq;
        q(`stats`).innerHTML = stat(`geohash cell here`, `${fmtKm(g.w)} × ${fmtKm(g.h)}`) + stat(`area vs at the equator`, pct(ratio, 0), ratio < 0.5 ? `bad` : ratio < 0.8 ? `warn` : `good`) + stat(`aspect ratio (long / short)`, round(Math.max(g.w, g.h) / Math.min(g.w, g.h), 2), Math.max(g.w, g.h) / Math.min(g.w, g.h) > 2.5 ? `warn` : ``) + stat(`comparable S2 level`, `${s2.L} (~${fmtKm(s2.side)})`);
        const cities = [[0, `Quito, Singapore`], [30, `Cairo, Shanghai`], [45, `Milan, Minneapolis`], [60, `Oslo, Helsinki`], [75, `Svalbard`]];
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>latitude</th><th>e.g.</th><th class="num">width</th><th class="num">height</th><th class="num">area vs equator</th></tr>${cities.map(([la, nm]) => { const x = ghCell(st.prec, la); return `<tr class="${Math.abs(la - st.lat) < 8 ? `new` : ``}"><td>${la}°</td><td>${nm}</td><td class="num">${fmtKm(x.w)}</td><td class="num">${fmtKm(x.h)}</td><td class="num">${pct(x.w / x.wEq, 0)}</td></tr>`; }).join(``)}</table></div>`;
        let n = `At ${st.lat}° a ${st.prec}-character geohash cell is ${fmtKm(g.w)} wide and ${fmtKm(g.h)} tall, ${pct(ratio, 0)} of its area at the equator.`;
        n += ratio < 0.6 ? ` A "search the 3×3 neighbourhood" rule tuned for the equator covers a much narrower east-west area here, so choose the precision from the latitude or use a scheme with near-uniform cells.` : ` Close enough to the equator that one precision works, but a global service should still pick precision per region.`;
        n += ` S2 cells at a given level vary by at most ~2× in area across the whole globe, and H3 hexagons are nearly uniform.`;
        q(`note`).innerHTML = note(n, ratio < 0.6 ? `warn` : `good`);
      };
      wireRanges(el, st, { lat: v => v + `°`, prec: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch2 - Square vs hexagonal neighbourhoods
  // =====================================================================
  D.hexRings = {
    title: `Square grid vs hexagons: neighbours and rings`,
    blurb: `Search k rings out from the rider's cell. On a square grid a "ring" is a square, so corner cells are 41% farther than edge cells. On a hexagonal grid (H3) all six neighbours are the same distance away, and rings are closer to circles.`,
    mount(el) {
      const st = { grid: `hex`, k: 2 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`grid`, seg(`grid`, [[`square`, `squares (geohash-like)`], [`hex`, `hexagons (H3-like)`]], st.grid))}${ctl(`rings searched (k)`, rng(`k`, 1, 5, 1, st.k))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Cells within k rings</h4><div data-k="map"></div></div>
          <div class="lab-panel"><h4>Comparison</h4><div class="stat-row" data-k="stats"></div><div data-k="tbl"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const k = st.k, W = 460, H = 340, cx = W / 2, cy = H / 2;
        const size = 150 / ((k + 1) * 1.8);
        const sp = size * Math.sqrt(3);
        let s = ``, cells = 0;
        const dists = [];
        const fill = ring => ring === 0 ? `var(--accent-3)` : `var(--accent)`;
        const op = ring => ring === 0 ? 0.85 : round(0.7 - 0.45 * (ring - 1) / Math.max(1, k - 1), 2);
        if (st.grid === `hex`) {
          for (let qq = -(k + 1); qq <= k + 1; qq++) for (let r = -(k + 1); r <= k + 1; r++) {
            const ring = (Math.abs(qq) + Math.abs(r) + Math.abs(qq + r)) / 2;
            if (ring > k + 1) continue;
            const x = cx + sp * (qq + r / 2), y = cy + size * 1.5 * r;
            const pts = [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 180 * (60 * i + 30); return round(x + size * 0.97 * Math.cos(a), 1) + `,` + round(y + size * 0.97 * Math.sin(a), 1); }).join(` `);
            const inside = ring <= k;
            if (inside) { cells++; if (ring === k) dists.push(Math.hypot(x - cx, y - cy) / sp); }
            s += `<polygon points="${pts}" style="fill:${inside ? fill(ring) : `none`};fill-opacity:${inside ? op(ring) : 0};stroke:var(--border);stroke-width:1"/>`;
          }
          for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; s += `<line x1="${cx}" y1="${cy}" x2="${round(cx + sp * Math.cos(a), 1)}" y2="${round(cy + sp * Math.sin(a), 1)}" style="stroke:var(--text);stroke-width:1.5"/>`; }
        } else {
          for (let i = -(k + 1); i <= k + 1; i++) for (let j = -(k + 1); j <= k + 1; j++) {
            const ring = Math.max(Math.abs(i), Math.abs(j));
            const x = cx + i * sp, y = cy + j * sp, inside = ring <= k;
            if (inside) { cells++; if (ring === k) dists.push(Math.hypot(i, j)); }
            s += `<rect x="${round(x - sp / 2 + 1, 1)}" y="${round(y - sp / 2 + 1, 1)}" width="${round(sp - 2, 1)}" height="${round(sp - 2, 1)}" style="fill:${inside ? fill(ring) : `none`};fill-opacity:${inside ? op(ring) : 0};stroke:var(--border);stroke-width:1"/>`;
          }
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) s += `<line x1="${cx}" y1="${cy}" x2="${round(cx + i * sp, 1)}" y2="${round(cy + j * sp, 1)}" style="stroke:${i && j ? `var(--bad)` : `var(--text)`};stroke-width:1.5"/>`;
        }
        s += `<circle cx="${cx}" cy="${cy}" r="${round(k * sp, 1)}" style="fill:none;stroke:var(--good);stroke-width:2;stroke-dasharray:5 4"/>`;
        q(`map`).innerHTML = svgWrap(W, H, s);
        const sqCells = (2 * k + 1) ** 2, hxCells = 1 + 3 * k * (k + 1);
        const round_ = Math.max(...dists) / Math.min(...dists);
        q(`stats`).innerHTML = stat(`cells searched`, cells) + stat(`neighbour distances`, st.grid === `hex` ? `6 × 1.00` : `4 × 1.00, 4 × 1.41`, st.grid === `hex` ? `good` : `warn`) + stat(`outer ring: farthest / nearest cell`, round(round_, 2), round_ > 1.3 ? `warn` : `good`);
        const rows = [1, 2, 3, 4, 5].map(kk => `<tr class="${kk === k ? `new` : ``}"><td>${kk}</td><td class="num">${(2 * kk + 1) ** 2}</td><td class="num">${1 + 3 * kk * (kk + 1)}</td></tr>`).join(``);
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>k</th><th class="num">square cells</th><th class="num">hex cells</th></tr>${rows}</table><div class="cs-note">Square: (2k+1)². Hex: 1 + 3k(k+1). The dashed circle has a radius of k cell spacings.</div>`;
        const n = st.grid === `hex`
          ? `Every hexagon touches six neighbours across an edge, all at the same distance, so "expand one more ring" grows the search area evenly in every direction. ${k} rings means ${hxCells} cells, and the outer ring varies by only ${round(round_, 2)}× in distance. That's why Uber built H3 for surge pricing and dispatch.`
          : `Squares have two kinds of neighbours: 4 across an edge and 4 at the corners (red lines), which are 1.41× farther away. ${k} rings means ${sqCells} cells, a square-shaped search area whose corners reach ${round(round_, 2)}× farther than its edges. You either over-fetch the corners or under-cover the sides.`;
        q(`note`).innerHTML = note(n, st.grid === `hex` ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { k: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch3 - Bloom filter: a tiny filter, then sizing
  // =====================================================================
  const BF_NAMES = [`alice`, `bob`, `carol`, `dave`, `erin`, `frank`, `grace`, `heidi`, `ivan`, `judy`, `mallory`, `oscar`, `peggy`, `trent`];
  const BF_M = 32, BF_K = 3;
  const bfPos = name => { const a = h32(name), b = (h32(name + `#`) | 1) >>> 0; return [0, 1, 2].map(i => (a + i * b) % BF_M); };
  function bfSim(n, bpi, k, seed) {
    const m = Math.max(8, Math.round(n * bpi));
    const bits = new Uint8Array(m);
    for (let i = 0; i < n; i++) { const a = hashInt(i, seed), b = (hashInt(i, seed ^ 0x5bd1e995) | 1) >>> 0; for (let j = 0; j < k; j++) bits[(a + j * b) % m] = 1; }
    let set = 0;
    for (let i = 0; i < m; i++) set += bits[i];
    const T = 20000;
    let fp = 0;
    for (let t = 0; t < T; t++) {
      const x = 50000000 + t, a = hashInt(x, seed), b = (hashInt(x, seed ^ 0x5bd1e995) | 1) >>> 0;
      let all = true;
      for (let j = 0; j < k && all; j++) if (!bits[(a + j * b) % m]) all = false;
      if (all) fp++;
    }
    return { m, fill: set / m, fp: fp / T, fpCount: fp, T };
  }
  const bfFormula = (n, m, k) => Math.pow(1 - Math.exp(-k * n / m), k);
  D.bloomFilter = {
    title: `Bloom filter: "definitely not" or "probably yes"`,
    blurb: `Top: a 32-bit filter with 3 hash functions. Add names, then check any name: if any of its 3 bits is 0 it was definitely never added; if all are 1 it was probably added. Bottom: size a real filter and compare the measured false-positive rate with the formula.`,
    mount(el) {
      const st = { added: 6, n: 4, bpi: 10, k: 7 };
      el.innerHTML = `
        <div class="lab-panel"><h4>A 32-bit filter, k = 3</h4>
          <div class="ctl-row">${ctl(`names added`, seg(`added`, [[3, `first 3`], [6, `first 6`], [10, `first 10`]], st.added))}${ctl(`check a name`, `<input class="lab-input" data-f="q" value="mallory" style="min-width:140px">`)}</div>
          <div data-k="bits"></div><div data-k="verdict"></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>Sizing a real filter</h4>
          <div class="ctl-row">${ctl(`items inserted`, rng(`n`, 3, 5.3, 0.1, st.n))}${ctl(`bits per item`, rng(`bpi`, 1, 20, 1, st.bpi))}${ctl(`hash functions (k)`, rng(`k`, 1, 16, 1, st.k))}</div>
          <div class="lab-grid"><div><div data-k="chart"></div><div class="legend"><span><i class="sw line" style="background:var(--accent)"></i>formula vs k</span><span><i class="sw" style="background:var(--accent-3)"></i>measured at your k</span></div></div><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const input = el.querySelector(`[data-f="q"]`);
      const drawMini = () => {
        const added = BF_NAMES.slice(0, st.added);
        const bits = new Array(BF_M).fill(0);
        added.forEach(nm => bfPos(nm).forEach(p => { bits[p] = 1; }));
        const name = input.value.trim().toLowerCase();
        const qp = name ? bfPos(name) : [];
        const W = 520, cw = W / BF_M;
        let s = ``;
        bits.forEach((b, i) => {
          const isQ = qp.includes(i);
          s += `<rect x="${round(i * cw + 1, 1)}" y="8" width="${round(cw - 2, 1)}" height="28" rx="3" style="fill:${b ? `var(--accent)` : `var(--bg-3)`};fill-opacity:${b ? 0.75 : 1};stroke:${isQ ? (b ? `var(--good)` : `var(--bad)`) : `var(--border)`};stroke-width:${isQ ? 3 : 1}"/>`;
          if (i % 4 === 0) s += `<text x="${round(i * cw + cw / 2, 1)}" y="50" text-anchor="middle" style="font-size:9px;fill:var(--text);opacity:.6">${i}</text>`;
        });
        q(`bits`).innerHTML = svgWrap(W, 56, s) + `<div class="cs-note">Added: ${added.map(a => `<span class="mono">${a}</span>`).join(`, `)}. ${fmtNum(bits.filter(Boolean).length)} of ${BF_M} bits set.</div>`;
        if (!name) { q(`verdict`).innerHTML = note(`Type a name to check it.`); return; }
        const allSet = qp.every(p => bits[p]);
        const was = added.includes(name);
        const v = !allSet ? note(`<b>${esc(name)}</b> hashes to bits ${qp.join(`, `)}. Bit ${qp.find(p => !bits[p])} is 0, so <b>${esc(name)}</b> was <b>definitely never added</b>. No lookup in the real store is needed.`, `good`)
          : was ? note(`<b>${esc(name)}</b> hashes to bits ${qp.join(`, `)}, all set: <b>probably added</b>, and it really was (true positive). The caller still confirms in the real store.`, `good`)
          : note(`<b>${esc(name)}</b> hashes to bits ${qp.join(`, `)}, all set by <i>other</i> names: the filter says <b>probably added</b>, but it never was. This is a <b>false positive</b>, the price of using so few bits. Try adding more names and watch it happen more often.`, `warn`);
        q(`verdict`).innerHTML = v;
      };
      const drawSim = () => {
        const n = Math.round(Math.pow(10, st.n));
        const R = bfSim(n, st.bpi, st.k, 11);
        const kOpt = Math.max(1, Math.round(st.bpi * Math.LN2));
        const curve = [];
        let maxFp = 0;
        for (let k = 1; k <= 16; k++) { const f = bfFormula(n, R.m, k); curve.push([k, f]); maxFp = Math.max(maxFp, f); }
        const ytop = clamp(Math.max(maxFp, R.fp) * 1.1, 0.001, 1);
        const a = axes({ x0: 50, x1: 300, y0: 170, y1: 12, dx0: 1, dx1: 16, dy0: 0, dy1: ytop, xTicks: [1, 4, 8, 12, 16], yTicks: [0, ytop / 2, ytop], xFmt: v => v, yFmt: v => pct(v, ytop < 0.02 ? 2 : 1), xLabel: `hash functions (k)` });
        let c = a.svg + `<path d="${path(curve.map(([k, f]) => [a.X(k), a.Y(f)]))}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        c += `<line x1="${a.X(kOpt)}" x2="${a.X(kOpt)}" y1="170" y2="12" style="stroke:var(--good);stroke-dasharray:3 3"/><circle cx="${a.X(st.k)}" cy="${a.Y(Math.min(R.fp, ytop))}" r="5" style="fill:var(--accent-3)"/>`;
        q(`chart`).innerHTML = svgWrap(320, 200, c);
        const f = bfFormula(n, R.m, st.k);
        const setBytes = n * 48;
        q(`stats`).innerHTML = stat(`filter size`, fmtB(R.m / 8)) + stat(`hash set of the same keys (~48 B each)`, fmtB(setBytes)) + stat(`measured false positives`, `${pct(R.fp, R.fp < 0.01 ? 2 : 1)} (${fmtNum(R.fpCount)} / ${fmtNum(R.T)})`, R.fp > 0.1 ? `bad` : R.fp > 0.02 ? `warn` : `good`) + stat(`formula (1 − e<sup>−kn/m</sup>)<sup>k</sup>`, pct(f, f < 0.01 ? 2 : 1)) + stat(`bits set`, pct(R.fill, 0), R.fill > 0.7 ? `warn` : ``) + stat(`optimal k for ${st.bpi} bits/item`, kOpt);
        let msg = `${fmtNum(n)} items in ${fmtB(R.m / 8)} (${st.bpi} bits each) give a measured false-positive rate of ${pct(R.fp, 2)}, against ${fmtB(setBytes)} for a hash set.`;
        if (st.k > kOpt + 2) msg += ` With k = ${st.k} the filter is over-hashed: ${pct(R.fill, 0)} of bits are set, so random keys collide more. The optimum is k ≈ 0.69 × bits per item = ${kOpt}.`;
        else if (st.k < kOpt - 2) msg += ` With k = ${st.k} each key checks too few bits, so a collision on all of them is too easy. Try k = ${kOpt}.`;
        else msg += ` k is near the optimum (${kOpt}). Each extra bit per item cuts false positives by roughly a third; 10 bits per item gives about 1%.`;
        q(`note`).innerHTML = note(msg, R.fp > 0.05 ? `warn` : `good`);
      };
      const draw = () => { drawMini(); drawSim(); };
      input.addEventListener(`input`, drawMini);
      wireSegs(el, st, drawMini);
      wireRanges(el, st, { n: v => fmtNum(Math.round(Math.pow(10, v))), bpi: v => v, k: v => v }, drawSim);
      draw();
    }
  };

  // =====================================================================
  // Ch4 - Count-Min Sketch
  // =====================================================================
  const CM_U = 20000, CM_N = 200000;
  let cmData = null;
  function cmStream() {
    if (cmData) return cmData;
    const r = mulberry32(22), cdf = zipfCdf(CM_U, 1.05);
    const perm = Array.from({ length: CM_U }, (_, i) => i);
    for (let i = CM_U - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const ev = new Int32Array(CM_N), cnt = new Int32Array(CM_U);
    for (let i = 0; i < CM_N; i++) { const it = perm[zipfPick(cdf, r())]; ev[i] = it; cnt[it]++; }
    return (cmData = { ev, cnt });
  }
  D.countMin = {
    title: `Count-Min Sketch: counting ${fmtNum(CM_N)} views in a few KB`,
    blurb: `${fmtNum(CM_N)} video views over ${fmtNum(CM_U)} videos, with Zipf popularity. Each view increments one counter in each of d rows (one hash per row). The estimate for a video is the minimum of its d counters: collisions only ever add, so the sketch can overcount but never undercount.`,
    mount(el) {
      const st = { w: 9, d: 4 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`width w (counters per row)`, rng(`w`, 4, 13, 1, st.w))}${ctl(`depth d (rows / hashes)`, rng(`d`, 1, 8, 1, st.d))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Most-viewed videos: true vs estimated</h4><div data-k="top"></div><h4 style="margin-top:12px">Rare videos</h4><div data-k="rare"></div></div>
          <div class="lab-panel"><h4>Accuracy and memory</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const { ev, cnt } = cmStream();
        const w = Math.pow(2, st.w), d = st.d;
        const tbl = new Uint32Array(w * d);
        const seeds = Array.from({ length: d }, (_, r) => r * 7919 + 1);
        for (let i = 0; i < CM_N; i++) { const e = ev[i]; for (let r = 0; r < d; r++) tbl[r * w + hashInt(e, seeds[r]) % w]++; }
        const est = it => { let m = Infinity; for (let r = 0; r < d; r++) m = Math.min(m, tbl[r * w + hashInt(it, seeds[r]) % w]); return m; };
        const items = Array.from({ length: CM_U }, (_, i) => i);
        const byTrue = items.slice().sort((a, b) => cnt[b] - cnt[a]);
        const E = new Float64Array(CM_U);
        items.forEach(i => { E[i] = est(i); });
        const byEst = items.slice().sort((a, b) => E[b] - E[a]);
        const top10 = new Set(byTrue.slice(0, 10));
        const overlap = byEst.slice(0, 10).filter(i => top10.has(i)).length;
        const relTop = sum(byTrue.slice(0, 100).map(i => (E[i] - cnt[i]) / cnt[i])) / 100;
        const rare = items.filter(i => cnt[i] > 0 && cnt[i] <= 2);
        const rareErr = rare.length ? sum(rare.map(i => E[i] - cnt[i])) / rare.length : 0;
        const rareRel = rare.length ? sum(rare.map(i => (E[i] - cnt[i]) / cnt[i])) / rare.length : 0;
        const distinct = items.filter(i => cnt[i] > 0).length;
        const bound = Math.E / w * CM_N;
        const row = i => `<tr><td class="mono">video:${i}</td><td class="num">${fmtNum(cnt[i], 0)}</td><td class="num">${fmtNum(E[i], 0)}</td><td class="num" style="${E[i] - cnt[i] > Math.max(5, cnt[i] * 0.1) ? `color:var(--warn);font-weight:700` : ``}">+${fmtNum(E[i] - cnt[i], 0)}</td></tr>`;
        q(`top`).innerHTML = `<table class="mini-table"><tr><th>video</th><th class="num">true</th><th class="num">estimate</th><th class="num">over</th></tr>${byTrue.slice(0, 6).map(row).join(``)}</table>`;
        q(`rare`).innerHTML = `<table class="mini-table"><tr><th>video</th><th class="num">true</th><th class="num">estimate</th><th class="num">over</th></tr>${rare.slice(0, 4).map(row).join(``)}</table>`;
        const sk = w * d * 4, mapB = distinct * 50;
        q(`stats`).innerHTML = stat(`sketch memory (${fmtNum(w)} × ${d} × 4 B)`, fmtB(sk)) + stat(`exact hash map (~50 B × ${fmtNum(distinct)})`, fmtB(mapB)) + stat(`error bound εN = (e / w) · N`, `±${fmtNum(bound, 0)}`) + stat(`top-100 average overcount`, pct(relTop, 1), relTop > 0.1 ? `bad` : relTop > 0.02 ? `warn` : `good`) + stat(`rare videos: average overcount`, `+${fmtNum(rareErr, 0)} views (${pct(rareRel, 0)})`, rareRel > 1 ? `bad` : rareRel > 0.2 ? `warn` : `good`) + stat(`true top 10 found in estimated top 10`, `${overlap} / 10`, overlap >= 9 ? `good` : overlap >= 6 ? `warn` : `bad`);
        let n = `${fmtB(sk)} of counters ranks the heavy hitters with ${pct(relTop, 1)} average overcount, and ${overlap} of the true top 10 appear in the estimated top 10.`;
        n += rareErr >= 5 ? ` Rare videos look much more popular than they are (+${fmtNum(rareErr, 0)} views on a true count of 1-2): every counter they hash to is shared with heavier items. Count-Min is for finding what's big, not for exact small counts.` : ` Even rare videos are within about ${Math.max(1, Math.round(rareErr))} view${Math.round(rareErr) > 1 ? `s` : ``} of their true count, because the table is wide enough that collisions are uncommon.`;
        if (d === 1) n += ` With a single row there is no second opinion: one unlucky collision is the estimate. More rows let the minimum dodge collisions.`;
        q(`note`).innerHTML = note(n, overlap >= 9 && relTop < 0.05 ? `good` : `warn`);
      };
      wireRanges(el, st, { w: v => fmtNum(Math.pow(2, v)), d: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch4 - HyperLogLog
  // =====================================================================
  function hllRun(D_, p, dup, seed) {
    const m = 1 << p, reg = new Uint8Array(m);
    const r = mulberry32(seed);
    const reps = dup === `on` ? 3 : 1;
    const hashes = new Uint32Array(D_);
    for (let i = 0; i < D_; i++) hashes[i] = Math.floor(r() * 4294967296) >>> 0;
    for (let rep = 0; rep < reps; rep++) for (let i = 0; i < D_; i++) {
      const h = hashes[i], idx = h >>> (32 - p), w = (h << p) >>> 0;
      const rho = w === 0 ? 32 - p + 1 : Math.clz32(w) + 1;
      if (rho > reg[idx]) reg[idx] = rho;
    }
    let z = 0, zeros = 0;
    for (let i = 0; i < m; i++) { z += Math.pow(2, -reg[i]); if (!reg[i]) zeros++; }
    const alpha = m === 16 ? 0.673 : m === 32 ? 0.697 : m === 64 ? 0.709 : 0.7213 / (1 + 1.079 / m);
    let E = alpha * m * m / z, lc = false;
    if (E <= 2.5 * m && zeros > 0) { E = m * Math.log(m / zeros); lc = true; }
    return { m, reg, E, lc, zeros, events: D_ * reps };
  }
  D.hyperLogLog = {
    title: `HyperLogLog: counting distinct users in kilobytes`,
    blurb: `Each user ID is hashed. The first p bits choose one of m = 2<sup>p</sup> registers; the register keeps the longest run of leading zeros seen in the rest of the hash. A run of r zeros is a 1-in-2<sup>r</sup> event, so the registers together estimate how many distinct hashes were seen. Repeats hash the same way and change nothing.`,
    mount(el) {
      const st = { d: 4.5, p: 12, dup: `off` };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`true distinct users`, rng(`d`, 2, 6, 0.1, st.d))}${ctl(`precision p (m = 2^p registers)`, rng(`p`, 4, 16, 1, st.p))}${ctl(`each user seen`, seg(`dup`, [[`off`, `once`], [`on`, `3 times`]], st.dup))}</div>
        <div class="ctl-row">${againBtn}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Estimate</h4><div class="stat-row" data-k="stats"></div></div>
          <div class="lab-panel"><h4>Register values (longest zero run + 1)</h4><div data-k="hist"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const Dn = Math.round(Math.pow(10, st.d));
        const R = hllRun(Dn, st.p, st.dup, seed * 7919 + st.p);
        const err = (R.E - Dn) / Dn, se = 1.04 / Math.sqrt(R.m);
        const memB = Math.ceil(R.m * 6 / 8), exact = Dn * 40;
        q(`stats`).innerHTML = stat(`true distinct`, fmtNum(Dn)) + stat(`HLL estimate`, fmtNum(R.E)) + stat(`error`, (err >= 0 ? `+` : ``) + pct(err, 1), Math.abs(err) > 2 * se ? `bad` : Math.abs(err) > se ? `warn` : `good`) + stat(`typical error 1.04 / √m`, `±${pct(se, 1)}`) + stat(`HLL memory (${fmtNum(R.m)} × 6 bits)`, fmtB(memB)) + stat(`exact set (~40 B per ID)`, fmtB(exact)) + stat(`events processed`, fmtNum(R.events));
        const hist = {};
        let mx = 0;
        for (let i = 0; i < R.m; i++) { hist[R.reg[i]] = (hist[R.reg[i]] || 0) + 1; mx = Math.max(mx, R.reg[i]); }
        const vals = Object.keys(hist).map(Number).sort((a, b) => a - b).slice(0, 16);
        q(`hist`).innerHTML = hbars(vals.map(v => ({ label: `value ${v}`, value: hist[v], text: fmtNum(hist[v], 0), cls: v === 0 ? `muted` : v === mx ? `alt` : `` })));
        let n = `${fmtB(memB)} of registers estimates ${fmtNum(Dn)} distinct users within ${pct(Math.abs(err), 1)}; an exact set would need about ${fmtB(exact)}. The error depends only on the number of registers (±${pct(se, 1)} typical), not on how many users there are.`;
        if (st.dup === `on`) n += ` Every user was counted three times, and the estimate didn't move: duplicates produce the same hash, and the same register keeps the same maximum.`;
        if (R.lc) n += ` With few users compared to registers, many registers are still 0 (${fmtNum(R.zeros)}), so the small-range correction (linear counting) is used instead of the raw formula.`;
        if (st.p <= 6) n += ` With only ${R.m} registers the estimate is noisy; press "New random run" to see it jump.`;
        n += ` HLL sketches also merge: take the register-wise max of two sketches to get distinct users across both.`;
        q(`note`).innerHTML = note(n, Math.abs(err) > 2 * se ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { d: v => fmtNum(Math.round(Math.pow(10, v))), p: v => `${v} (m = ${fmtNum(Math.pow(2, v))})` }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch6 - Similarity metrics on embeddings
  // =====================================================================
  const KN_DOCS = [
    [`Champions League final recap`, 15, 1.0], [`Transfer window rumours`, 28, 0.7], [`Marathon training plan`, 45, 1.6], [`Football club finances`, 70, 1.3],
    [`Stock market slides on rate fears`, 100, 1.2], [`How index funds work`, 118, 0.8], [`Crypto exchange collapses`, 132, 2.3], [`Restaurant business economics`, 160, 1.1],
    [`Weeknight pasta recipes`, 200, 1.0], [`Sourdough starter guide`, 218, 1.5], [`Knife skills 101`, 236, 0.6], [`Sleep and recovery for athletes`, 330, 0.9]
  ];
  const KN_MET = { cos: `cosine`, dot: `dot product`, l2: `Euclidean (L2)` };
  D.knnMetrics = {
    title: `Cosine, dot product and Euclidean: which neighbours win?`,
    blurb: `Twelve articles embedded in 2 dimensions (real embeddings have hundreds). The direction of a vector carries meaning; its length often reflects things like document length or popularity. Move the query and switch metrics to see when they agree and when they don't.`,
    mount(el) {
      const st = { ang: 40, len: 1, metric: `cos`, norm: `off`, logN: 7, dims: 768 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`query direction`, rng(`ang`, 0, 359, 1, st.ang))}${ctl(`query length`, rng(`len`, 0.2, 2.5, 0.1, st.len))}</div>
        <div class="ctl-row">${ctl(`metric`, seg(`metric`, Object.keys(KN_MET).map(k => [k, KN_MET[k]]), st.metric))}${ctl(`normalise all vectors`, seg(`norm`, [[`off`, `no`], [`on`, `yes (unit length)`]], st.norm))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Embedding space</h4><div data-k="map"></div></div>
          <div class="lab-panel"><h4>Top 3 by each metric</h4><div data-k="tbl"></div></div>
        </div>
        <div data-k="note"></div>
        <div class="lab-panel" style="margin-top:14px"><h4>Brute-force search cost</h4>
          <div class="ctl-row">${ctl(`vectors`, rng(`logN`, 4, 10, 0.5, st.logN))}${ctl(`dimensions`, seg(`dims`, [[384, `384`], [768, `768`], [1536, `1536`], [3072, `3072`]], st.dims))}</div>
          <div class="stat-row" data-k="cost"></div>
        </div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const nz = v => { const l = Math.hypot(v[0], v[1]); return st.norm === `on` ? [v[0] / l, v[1] / l] : v; };
        const docs = KN_DOCS.map(([t, a, l], i) => ({ i, t, v: nz([l * Math.cos(a * Math.PI / 180), l * Math.sin(a * Math.PI / 180)]) }));
        const qv = nz([st.len * Math.cos(st.ang * Math.PI / 180), st.len * Math.sin(st.ang * Math.PI / 180)]);
        const score = {
          cos: d => (d.v[0] * qv[0] + d.v[1] * qv[1]) / (Math.hypot(...d.v) * Math.hypot(...qv)),
          dot: d => d.v[0] * qv[0] + d.v[1] * qv[1],
          l2: d => -Math.hypot(d.v[0] - qv[0], d.v[1] - qv[1])
        };
        const top = {};
        Object.keys(score).forEach(m => { top[m] = docs.slice().sort((a, b) => score[m](b) - score[m](a)).slice(0, 3); });
        const sel = new Set(top[st.metric].map(d => d.i));
        const W = 360, C = W / 2, S = 62;
        let s = `<circle cx="${C}" cy="${C}" r="${S}" style="fill:none;stroke:var(--border);stroke-dasharray:3 3"/><line x1="0" x2="${W}" y1="${C}" y2="${C}" style="stroke:var(--border)"/><line y1="0" y2="${W}" x1="${C}" x2="${C}" style="stroke:var(--border)"/>`;
        docs.forEach(d => {
          const x = C + d.v[0] * S, y = C - d.v[1] * S, on = sel.has(d.i);
          s += `<line x1="${C}" y1="${C}" x2="${round(x, 1)}" y2="${round(y, 1)}" style="stroke:${on ? `var(--good)` : `#64748b`};stroke-width:${on ? 2.5 : 1.2};opacity:${on ? 1 : 0.7}"/><circle cx="${round(x, 1)}" cy="${round(y, 1)}" r="${on ? 9 : 8}" style="fill:${on ? `var(--good)` : `var(--bg-3)`};stroke:var(--border)"/><text x="${round(x, 1)}" y="${round(y + 3.5, 1)}" text-anchor="middle" style="font-size:9px;font-weight:700;fill:${on ? `#0b1020` : `var(--text)`}">${d.i + 1}</text>`;
        });
        const qx = C + qv[0] * S, qy = C - qv[1] * S;
        s += `<line x1="${C}" y1="${C}" x2="${round(qx, 1)}" y2="${round(qy, 1)}" style="stroke:var(--accent-3);stroke-width:3"/><circle cx="${round(qx, 1)}" cy="${round(qy, 1)}" r="6" style="fill:var(--accent-3)"/><text class="svg-label" x="${round(qx + 9, 1)}" y="${round(qy - 7, 1)}">query</text>`;
        q(`map`).innerHTML = svgWrap(W, W, s) + `<div class="cs-note">Dashed circle = length 1.</div>`;
        const cell = (m, r) => { const d = top[m][r]; return `<td style="white-space:normal" title="${esc(d.t)}"><b>${d.i + 1}</b> ${esc(d.t)}</td>`; };
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table" style="table-layout:fixed;width:100%"><tr><th style="width:22px">#</th>${Object.keys(KN_MET).map(m => `<th style="white-space:normal;${m === st.metric ? `color:var(--accent)` : ``}">${KN_MET[m]}</th>`).join(``)}</tr>${[0, 1, 2].map(r => `<tr><td>${r + 1}</td>${Object.keys(KN_MET).map(m => cell(m, r)).join(``)}</tr>`).join(``)}</table></div>`;
        const same = (a, b) => top[a].every((d, i) => d.i === top[b][i].i);
        let n;
        if (st.norm === `on`) n = `With every vector normalised to length 1, cosine, dot product and Euclidean distance give the same ranking (L2² = 2 − 2·cos). That's why many embedding models output unit vectors and databases use the cheap dot product.`;
        else {
          const parts = [];
          const diffAt = (a, b) => [0, 1, 2].find(i => top[a][i].i !== top[b][i].i);
          const len = d => round(Math.hypot(...d.v), 1);
          if (!same(`cos`, `dot`)) { const i = diffAt(`cos`, `dot`); parts.push(`Dot product rewards length: at rank ${i + 1} it picks "${top.dot[i].t}" (length ${len(top.dot[i])}) where cosine picks "${top.cos[i].t}" (length ${len(top.cos[i])}).`); }
          if (!same(`cos`, `l2`)) { const i = diffAt(`cos`, `l2`); parts.push(`Euclidean distance compares positions, so it favours documents about as long as the query (length ${st.len}): at rank ${i + 1} it picks "${top.l2[i].t}" where cosine picks "${top.cos[i].t}".`); }
          n = parts.length ? parts.join(` `) + ` Use the metric the embedding model was trained with, usually cosine.` : `All three metrics agree for this query. They diverge when vectors differ in length; try making the query short or long, or point it at the long "Crypto exchange collapses" vector.`;
        }
        q(`note`).innerHTML = note(n, st.norm === `on` || n.startsWith(`All three`) ? `good` : `warn`);
        const N = Math.pow(10, st.logN), flops = N * st.dims * 2;
        const sec = flops / 50e9;
        q(`cost`).innerHTML = stat(`vectors`, fmtNum(N)) + stat(`memory (float32)`, fmtB(N * st.dims * 4), N * st.dims * 4 > 256e9 ? `bad` : ``) + stat(`work per query`, fmtNum(flops) + ` FLOPs`) + stat(`one query at ~50 GFLOP/s`, fmtT(sec), sec > 0.1 ? `bad` : sec > 0.01 ? `warn` : `good`) + stat(`queries / s per core`, fmtNum(1 / sec, 1), 1 / sec < 10 ? `bad` : ``);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { ang: v => v + `°`, len: v => round(v, 1), logN: v => fmtNum(Math.pow(10, v)) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - IVF: recall vs nprobe
  // =====================================================================
  const IV_N = 3000, IV_D = 16, IV_Q = 40, IV_K = 10;
  let ivData = null;
  const ivCache = {};
  function ivBuildData() {
    if (ivData) return ivData;
    const r = mulberry32(24), C = 30;
    const cent = new Float32Array(C * IV_D);
    for (let i = 0; i < C * IV_D; i++) cent[i] = (r() * 2 - 1) * 1.2;
    const mk = () => { const c = Math.floor(r() * C), v = new Float32Array(IV_D); for (let j = 0; j < IV_D; j++) v[j] = cent[c * IV_D + j] + gauss(r) * 0.5; return v; };
    const X = Array.from({ length: IV_N }, mk), Q = Array.from({ length: IV_Q }, mk);
    const d2 = (a, b) => { let s = 0; for (let j = 0; j < IV_D; j++) { const t = a[j] - b[j]; s += t * t; } return s; };
    const truth = Q.map(qv => X.map((x, i) => [d2(qv, x), i]).sort((a, b) => a[0] - b[0]).slice(0, IV_K).map(p => p[1]));
    return (ivData = { X, Q, truth, d2 });
  }
  function ivIndex(nlist) {
    if (ivCache[nlist]) return ivCache[nlist];
    const { X, d2 } = ivBuildData();
    const r = mulberry32(nlist * 13);
    let C = Array.from({ length: nlist }, () => Float32Array.from(X[Math.floor(r() * IV_N)]));
    const asg = new Int32Array(IV_N);
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < IV_N; i++) { let b = 0, bd = Infinity; for (let c = 0; c < nlist; c++) { const d = d2(X[i], C[c]); if (d < bd) { bd = d; b = c; } } asg[i] = b; }
      const S = Array.from({ length: nlist }, () => new Float32Array(IV_D)), cnt = new Int32Array(nlist);
      for (let i = 0; i < IV_N; i++) { cnt[asg[i]]++; for (let j = 0; j < IV_D; j++) S[asg[i]][j] += X[i][j]; }
      C = C.map((c, k) => cnt[k] ? S[k].map(v => v / cnt[k]) : c);
    }
    const lists = Array.from({ length: nlist }, () => []);
    for (let i = 0; i < IV_N; i++) lists[asg[i]].push(i);
    return (ivCache[nlist] = { C, lists });
  }
  function ivSearch(nlist, nprobe) {
    const { X, Q, truth, d2 } = ivBuildData();
    const { C, lists } = ivIndex(nlist);
    let rec = 0, scanned = 0;
    Q.forEach((qv, qi) => {
      const order = C.map((c, k) => [d2(qv, c), k]).sort((a, b) => a[0] - b[0]).slice(0, nprobe);
      const cand = [];
      order.forEach(([, k]) => lists[k].forEach(i => cand.push([d2(qv, X[i]), i])));
      scanned += cand.length;
      const got = new Set(cand.sort((a, b) => a[0] - b[0]).slice(0, IV_K).map(p => p[1]));
      rec += truth[qi].filter(i => got.has(i)).length / IV_K;
    });
    return { recall: rec / IV_Q, scanned: scanned / IV_Q };
  }
  D.ivfRecall = {
    title: `IVF index: trading recall for speed with nprobe`,
    blurb: `${fmtNum(IV_N)} 16-dimensional vectors are clustered with k-means into nlist lists. A query compares itself to the list centroids, then scans only the nprobe closest lists. The true nearest neighbour sometimes sits just across a boundary in a list you didn't scan; that's lost recall.`,
    mount(el) {
      const st = { nlist: 64, nprobe: 4 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`lists (nlist)`, seg(`nlist`, [[16, `16`], [32, `32`], [64, `64`], [128, `128`]], st.nlist))}${ctl(`lists scanned per query (nprobe)`, rng(`nprobe`, 1, 32, 1, st.nprobe))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Recall@10 and work vs nprobe</h4><div data-k="chart"></div><div class="legend"><span><i class="sw line" style="background:var(--good)"></i>recall@10</span><span><i class="sw line" style="background:var(--accent-3)"></i>% of vectors scanned</span></div></div>
          <div class="lab-panel"><h4>At your setting</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const np = Math.min(st.nprobe, st.nlist);
        const R = ivSearch(st.nlist, np);
        const xs = [1, 2, 4, 8, 16, 32].filter(v => v <= st.nlist);
        const curve = xs.map(v => [v, ivSearch(st.nlist, v)]);
        const a = axes({ x0: 46, x1: 370, y0: 180, y1: 12, dx0: 1, dx1: 32, dy0: 0, dy1: 1, xLog: true, xTicks: xs, yTicks: [0, 0.25, 0.5, 0.75, 1], xFmt: v => v, yFmt: v => pct(v), xLabel: `nprobe` });
        let s = a.svg;
        s += `<path d="${path(curve.map(([v, c]) => [a.X(v), a.Y(c.recall)]))}" style="fill:none;stroke:var(--good);stroke-width:2"/>`;
        s += `<path d="${path(curve.map(([v, c]) => [a.X(v), a.Y(c.scanned / IV_N)]))}" style="fill:none;stroke:var(--accent-3);stroke-width:2;stroke-dasharray:5 3"/>`;
        s += `<circle cx="${a.X(np)}" cy="${a.Y(R.recall)}" r="5" style="fill:var(--good)"/><circle cx="${a.X(np)}" cy="${a.Y(R.scanned / IV_N)}" r="5" style="fill:var(--accent-3)"/>`;
        q(`chart`).innerHTML = svgWrap(390, 214, s);
        const work = R.scanned + st.nlist;
        q(`stats`).innerHTML = stat(`recall@10`, pct(R.recall, 1), R.recall >= 0.95 ? `good` : R.recall >= 0.8 ? `warn` : `bad`) + stat(`vectors scanned per query`, `${fmtNum(R.scanned, 0)} (${pct(R.scanned / IV_N, 1)})`) + stat(`distance computations vs brute force`, `${fmtNum(work, 0)} vs ${fmtNum(IV_N)}`) + stat(`speed-up`, round(IV_N / work, 1) + `×`, IV_N / work > 3 ? `good` : ``);
        let n = `Scanning ${np} of ${st.nlist} lists touches ${pct(R.scanned / IV_N, 1)} of the vectors and finds ${pct(R.recall, 1)} of the true top 10.`;
        if (R.recall < 0.8) n += ` Too few lists: neighbours near cluster boundaries live in lists you skipped. Raise nprobe.`;
        else if (R.scanned / IV_N > 0.5) n += ` You're scanning most of the data, so the index barely helps. Lower nprobe or use more lists.`;
        else n += ` That's the usual sweet spot: high recall for a fraction of the work.`;
        n += ` More lists make each list smaller (less work per probe) but put more boundaries in the way, so you need a higher nprobe for the same recall.`;
        q(`note`).innerHTML = note(n, R.recall >= 0.9 && R.scanned / IV_N < 0.5 ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { nprobe: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - HNSW-style graph search (bottom layer)
  // =====================================================================
  function hnBuild(N, M, seed) {
    const r = mulberry32(seed + N * 7 + M);
    const P = Array.from({ length: N }, () => [r() * 100, r() * 100]);
    const adj = Array.from({ length: N }, () => []);
    const d = (a, b) => (P[a][0] - P[b][0]) ** 2 + (P[a][1] - P[b][1]) ** 2;
    const maxDeg = 2 * M;
    for (let i = 1; i < N; i++) {
      const near = [];
      for (let j = 0; j < i; j++) near.push([d(i, j), j]);
      near.sort((a, b) => a[0] - b[0]);
      near.slice(0, M).forEach(([, j]) => {
        adj[i].push(j); adj[j].push(i);
        if (adj[j].length > maxDeg) adj[j] = adj[j].map(x => [d(j, x), x]).sort((a, b) => a[0] - b[0]).slice(0, maxDeg).map(p => p[1]);
      });
    }
    return { P, adj };
  }
  function hnSearch(G, qp, ef, k) {
    const dq = i => (G.P[i][0] - qp[0]) ** 2 + (G.P[i][1] - qp[1]) ** 2;
    const vis = new Set([0]);
    let cand = [[dq(0), 0]], res = [[dq(0), 0]];
    const pathIds = [0];
    let best = res[0][0];
    while (cand.length) {
      cand.sort((a, b) => a[0] - b[0]);
      const [cd, c] = cand.shift();
      const worst = res[res.length - 1][0];
      if (cd > worst && res.length >= ef) break;
      if (cd < best || c === 0) { if (c !== 0) pathIds.push(c); best = Math.min(best, cd); }
      G.adj[c].forEach(nb => {
        if (vis.has(nb)) return;
        vis.add(nb);
        const dn = dq(nb);
        if (res.length < ef || dn < res[res.length - 1][0]) {
          cand.push([dn, nb]); res.push([dn, nb]); res.sort((a, b) => a[0] - b[0]);
          if (res.length > ef) res.pop();
        }
      });
    }
    return { ids: res.slice(0, k).map(p => p[1]), evals: vis.size, vis, pathIds };
  }
  D.hnswSearch = {
    title: `Graph search: how HNSW finds neighbours without scanning`,
    blurb: `Points are inserted one by one and linked to their M nearest existing points, building a navigable small-world graph (the bottom layer of HNSW). A query starts at a fixed entry point and greedily walks to closer neighbours, keeping the best ef candidates. Recall@5 is measured on 30 random queries.`,
    mount(el) {
      const st = { n: 600, m: 6, ef: 16 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`points`, rng(`n`, 200, 2000, 100, st.n))}${ctl(`links per point (M)`, rng(`m`, 2, 16, 1, st.m))}${ctl(`search breadth (ef)`, rng(`ef`, 5, 100, 1, st.ef))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>One query: nodes evaluated and the greedy path</h4><div data-k="map"></div><div class="legend"><span><i class="sw" style="background:var(--accent-3)"></i>distance computed</span><span><i class="sw" style="background:var(--good)"></i>top 5 returned</span><span><i class="sw line" style="background:var(--accent)"></i>path from the entry point</span></div></div>
          <div class="lab-panel"><h4>Over 30 queries</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      let key = ``, G = null;
      const draw = () => {
        const kk = st.n + `|` + st.m;
        if (kk !== key) { G = hnBuild(st.n, st.m, 24); key = kk; }
        const r = mulberry32(99);
        const Qs = Array.from({ length: 30 }, () => [r() * 100, r() * 100]);
        let rec = 0, evals = 0, first = null;
        Qs.forEach((qp, i) => {
          const R = hnSearch(G, qp, st.ef, 5);
          const truth = G.P.map((p, j) => [(p[0] - qp[0]) ** 2 + (p[1] - qp[1]) ** 2, j]).sort((a, b) => a[0] - b[0]).slice(0, 5).map(p => p[1]);
          const got = new Set(R.ids);
          rec += truth.filter(j => got.has(j)).length / 5;
          evals += R.evals;
          if (!i) first = { qp, R };
        });
        rec /= 30; evals /= 30;
        const S = 3.4, W = 340, X = v => round(v * S, 1), Y = v => round(W - v * S, 1);
        let s = `<rect width="${W}" height="${W}" style="fill:var(--bg-2)"/>`;
        if (st.n <= 700) G.adj.forEach((nb, i) => nb.forEach(j => { if (j > i) s += `<line x1="${X(G.P[i][0])}" y1="${Y(G.P[i][1])}" x2="${X(G.P[j][0])}" y2="${Y(G.P[j][1])}" style="stroke:var(--border);stroke-width:.5"/>`; }));
        const res = new Set(first.R.ids);
        G.P.forEach((p, i) => { const v = first.R.vis.has(i), g = res.has(i); s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${g ? 3.5 : v ? 2.4 : 1.4}" style="fill:${g ? `var(--good)` : v ? `var(--accent-3)` : `#64748b`};opacity:${g || v ? 1 : 0.5}"/>`; });
        s += `<path d="${path(first.R.pathIds.map(i => [X(G.P[i][0]), Y(G.P[i][1])]))}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        s += `<circle cx="${X(G.P[0][0])}" cy="${Y(G.P[0][1])}" r="5" style="fill:none;stroke:var(--accent);stroke-width:2"/><text class="svg-label" x="${X(G.P[0][0]) + 7}" y="${Y(G.P[0][1]) - 6}">entry</text>`;
        s += `<path d="M${X(first.qp[0])} ${Y(first.qp[1]) - 7} L${X(first.qp[0]) + 6} ${Y(first.qp[1]) + 5} L${X(first.qp[0]) - 6} ${Y(first.qp[1]) + 5} Z" style="fill:var(--text)"/>`;
        q(`map`).innerHTML = svgWrap(W, W, s) + (st.n > 700 ? `<div class="cs-note">Edges hidden above 700 points.</div>` : ``);
        const avgDeg = sum(G.adj.map(a => a.length)) / st.n;
        q(`stats`).innerHTML = stat(`recall@5`, pct(rec, 1), rec >= 0.95 ? `good` : rec >= 0.8 ? `warn` : `bad`) + stat(`distances computed per query`, fmtNum(evals, 0)) + stat(`share of points touched`, pct(evals / st.n, 1), evals / st.n < 0.2 ? `good` : `warn`) + stat(`brute force would compute`, fmtNum(st.n)) + stat(`average links per point`, round(avgDeg, 1)) + stat(`graph memory (4 B per link)`, fmtB(avgDeg * 4 * st.n));
        let n = `Each query computed about ${fmtNum(evals, 0)} distances (${pct(evals / st.n, 1)} of the points) and found ${pct(rec, 1)} of the true top 5.`;
        if (st.m <= 3) n += ` With M = ${st.m} the graph is thin: greedy walks get stuck in local minima where no neighbour is closer, so recall drops. Raising M fixes that, at the cost of memory and slower inserts.`;
        else if (rec < 0.9) n += ` Raise ef to keep more candidates alive; it costs more distance computations but escapes local minima.`;
        else n += ` Raising ef further buys little recall for more work.`;
        n += ` Real HNSW adds sparse upper layers with long links, so the walk starts with big jumps toward the query instead of crawling from a fixed entry point; work grows roughly with log N.`;
        q(`note`).innerHTML = note(n, rec >= 0.9 ? `good` : `warn`);
      };
      wireRanges(el, st, { n: v => fmtNum(v), m: v => v, ef: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - Vector memory sizing
  // =====================================================================
  const VM_PREC = { f32: [`float32`, 4], f16: [`float16`, 2], i8: [`int8 (scalar quantised)`, 1], pq: [`PQ (d/16 bytes)`, 1 / 16] };
  const VM_IDX = { flat: `flat (no index)`, hnsw: `HNSW, M = 16`, ivf: `IVF` };
  D.vectorMemory = {
    title: `Vector index sizing: does it fit in RAM?`,
    blurb: `ANN indexes are fast because they live in memory. Estimate the footprint from vector count, dimensions, precision and index type, and see where pgvector stops being enough. Assumed: 64 B of ID and metadata per vector, 30% headroom, nodes with 256 GB of which 75% is usable.`,
    mount(el) {
      const st = { n: 7, dims: 1536, prec: `f32`, idx: `hnsw` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`vectors`, rng(`n`, 5, 10, 0.1, st.n))}${ctl(`dimensions`, seg(`dims`, [[384, `384`], [768, `768`], [1536, `1536`], [3072, `3072`]], st.dims))}</div>
        <div class="ctl-row">${ctl(`precision`, seg(`prec`, Object.keys(VM_PREC).map(k => [k, VM_PREC[k][0]]), st.prec))}${ctl(`index`, seg(`idx`, Object.keys(VM_IDX).map(k => [k, VM_IDX[k]]), st.idx))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Memory breakdown</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const N = Math.pow(10, st.n), d = st.dims;
        const vec = N * d * VM_PREC[st.prec][1];
        const graph = st.idx === `hnsw` ? N * 2 * 16 * 4 * 1.1 : st.idx === `ivf` ? N * 8 : 0;
        const meta = N * 64;
        const total = (vec + graph + meta) * 1.3;
        const usable = 256e9 * 0.75;
        const nodes = Math.max(1, Math.ceil(total / usable));
        const bfSec = st.idx === `flat` ? Math.max(N * d * 2 / (50e9 * 32 * nodes), vec / (100e9 * nodes)) : 0;
        q(`bars`).innerHTML = hbars([
          { label: `vectors`, value: vec, text: fmtB(vec) },
          { label: `graph / lists`, value: graph, text: fmtB(graph), cls: `alt` },
          { label: `IDs + metadata`, value: meta, text: fmtB(meta), cls: `muted` },
          { label: `total + headroom`, value: total, text: fmtB(total), cls: nodes > 1 ? `bad` : `good` }
        ]);
        q(`stats`).innerHTML = stat(`vectors`, fmtNum(N)) + stat(`bytes per vector`, fmtB(d * VM_PREC[st.prec][1])) + stat(`total footprint`, fmtB(total), nodes > 1 ? `bad` : total > 64e9 ? `warn` : `good`) + stat(`256 GB nodes needed`, fmtNum(nodes, 0), nodes > 8 ? `bad` : nodes > 1 ? `warn` : `good`) + (st.idx === `flat` ? stat(`brute-force query (memory-bandwidth bound)`, fmtT(bfSec), bfSec > 0.1 ? `bad` : ``) : ``);
        let n, cls = `good`;
        if (st.idx === `flat` && N > 1e6) { n = `Without an index, every query reads all ${fmtB(vec)} of vectors: about ${fmtT(bfSec)} per query, limited by memory bandwidth, so one node serves only a few queries per second. Flat search is fine below about a million vectors or for re-ranking a candidate list; beyond that add HNSW or IVF.`; cls = `bad`; }
        else if (total <= 64e9 && N <= 5e7) n = `${fmtB(total)} fits on one ordinary database server. If your data already lives in Postgres, pgvector with an HNSW index is the simplest choice: one system, transactional, filters in SQL.`;
        else if (nodes === 1) n = `${fmtB(total)} fits on one large node. pgvector can still work, but index builds take hours and filtered search gets harder; a dedicated vector database (or OpenSearch / Elasticsearch kNN) starts to earn its keep.`;
        else { n = `${fmtB(total)} needs ${nodes} nodes, so the index must be sharded: each query fans out to every shard and merges the top-k. This is dedicated vector database territory (Milvus, Pinecone, Weaviate, Vespa).`; cls = `warn`; }
        if (st.prec === `f32` && nodes > 1) n += ` Quantising to int8 cuts vector memory 4× and PQ about 64×, usually re-ranking the top candidates with full-precision vectors read from disk.`;
        if (st.idx === `hnsw`) n += ` The HNSW graph adds ~${fmtNum(2 * 16 * 4 * 1.1, 0)} B per vector regardless of dimensions, so it dominates once vectors are quantised.`;
        q(`note`).innerHTML = note(n, cls);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => fmtNum(Math.pow(10, v)) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Gorilla compression
  // =====================================================================
  const TS_N = 720;
  function tsSeries(jit, pat, seed) {
    const r = mulberry32(seed + (jit === `small` ? 1 : jit === `irr` ? 2 : 0) * 10 + ({ cpu: 0, flat: 1, counter: 2, noise: 3 }[pat]));
    const T = [], V = [];
    let t = 1700000000, v = pat === `counter` ? 1200 : 42.5;
    for (let i = 0; i < TS_N; i++) {
      T.push(t);
      V.push(v);
      t += jit === `none` ? 10 : jit === `small` ? 10 + (r() < 0.2 ? (r() < 0.5 ? -1 : 1) : 0) : 5 + Math.floor(r() * 11);
      if (pat === `cpu`) v = round(clamp(v + gauss(r) * 1.5, 5, 95), 1);
      else if (pat === `flat`) { if (r() < 0.05) v = round(30 + r() * 40, 1); }
      else if (pat === `counter`) v += Math.floor(r() * 40);
      else v = r() * 100;
    }
    return { T, V };
  }
  function f64Words(x, dv) { dv.setFloat64(0, x); return [dv.getUint32(0), dv.getUint32(4)]; }
  const ctz32 = x => x === 0 ? 32 : 31 - Math.clz32(x & -x);
  function gorilla(T, V) {
    const dv = new DataView(new ArrayBuffer(8));
    let tBits = 64 + 14, vBits = 64;
    const rows = [];
    let prevD = T[1] - T[0], pl = -1, pt = -1;
    let [ph, plo] = f64Words(V[0], dv);
    rows.push({ t: T[0], dlt: `-`, dod: `-`, tb: 64, v: V[0], xr: `-`, vb: 64 });
    for (let i = 1; i < T.length; i++) {
      const dlt = T[i] - T[i - 1];
      let tb;
      if (i === 1) tb = 14;
      else {
        const dd = dlt - prevD;
        tb = dd === 0 ? 1 : Math.abs(dd) <= 63 ? 9 : Math.abs(dd) <= 255 ? 12 : Math.abs(dd) <= 2047 ? 16 : 36;
        tBits += tb;
      }
      const dod = i === 1 ? `-` : dlt - prevD;
      prevD = dlt;
      const [h, lo] = f64Words(V[i], dv);
      const xh = (h ^ ph) >>> 0, xl = (lo ^ plo) >>> 0;
      let vb, xr;
      if (!xh && !xl) { vb = 1; xr = `identical`; }
      else {
        const lz = Math.min(31, xh ? Math.clz32(xh) : 32 + Math.clz32(xl));
        const tz = xl ? ctz32(xl) : 32 + ctz32(xh);
        const mean = 64 - lz - tz;
        if (pl >= 0 && lz >= pl && tz >= pt) { vb = 2 + (64 - pl - pt); xr = `${64 - pl - pt} bits, reuse window`; }
        else { vb = 2 + 5 + 6 + mean; pl = lz; pt = tz; xr = `${mean} meaningful bits`; }
      }
      vBits += vb;
      ph = h; plo = lo;
      if (rows.length < 8) rows.push({ t: T[i], dlt, dod, tb, v: V[i], xr, vb });
    }
    return { tBits, vBits, rows };
  }
  const varintLen = z => z < 128 ? 1 : z < 16384 ? 2 : z < 2097152 ? 3 : z < 268435456 ? 4 : 5;
  const zig = n => n >= 0 ? 2 * n : -2 * n - 1;
  D.tsCompression = {
    title: `Gorilla compression: how many bits does a point really need?`,
    blurb: `${TS_N} points of one series (2 hours at ~10 s). Timestamps are stored as the change in the gap between points (delta-of-delta): a perfectly regular series costs 1 bit per timestamp. Values are XORed with the previous value: an unchanged value costs 1 bit, a small change costs only its meaningful bits. These are the real bit counts for the generated data.`,
    mount(el) {
      const st = { jit: `small`, pat: `cpu` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`timestamp regularity`, seg(`jit`, [[`none`, `exactly every 10 s`], [`small`, `±1 s jitter`], [`irr`, `irregular (5-15 s)`]], st.jit))}</div>
        <div class="ctl-row">${ctl(`values`, seg(`pat`, [[`cpu`, `CPU % (1 decimal)`], [`flat`, `mostly unchanged gauge`], [`counter`, `integer counter`], [`noise`, `random floats`]], st.pat))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Bytes per point</h4><div data-k="bars"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
          <div class="lab-panel"><h4>First points, encoded</h4><div data-k="tbl"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const { T, V } = tsSeries(st.jit, st.pat, 25);
        const G = gorilla(T, V);
        const gB = (G.tBits + G.vBits) / 8 / TS_N;
        const dec = { cpu: 1, flat: 1, counter: 0, noise: null }[st.pat];
        let vb = 0, tb = 0;
        for (let i = 1; i < TS_N; i++) {
          tb += varintLen(zig(T[i] - T[i - 1]));
          vb += dec == null ? 8 : varintLen(zig(Math.round((V[i] - V[i - 1]) * Math.pow(10, dec))));
        }
        const dvB = (tb + vb + 16) / TS_N;
        const rows = [
          { label: `Postgres row + index`, value: 80, text: `~80 B`, cls: `bad` },
          { label: `raw 64-bit pairs`, title: `8 B timestamp + 8 B float value`, value: 16, text: `16 B`, cls: `warn` },
          { label: `delta + varint`, value: dvB, text: round(dvB, 2) + ` B` },
          { label: `Gorilla`, value: gB, text: round(gB, 2) + ` B`, cls: `good` }
        ];
        q(`bars`).innerHTML = hbars(rows, 80);
        q(`stats`).innerHTML = stat(`Gorilla timestamp bits / point`, round(G.tBits / TS_N, 2)) + stat(`Gorilla value bits / point`, round(G.vBits / TS_N, 2)) + stat(`compression vs raw`, round(16 / gB, 1) + `×`, 16 / gB > 5 ? `good` : 16 / gB < 2 ? `bad` : `warn`) + stat(`1M series × 1 day at 10 s`, fmtB(gB * 8640 * 1e6));
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th class="num">Δt</th><th class="num">ΔΔt</th><th class="num">t bits</th><th class="num">value</th><th>XOR with previous</th><th class="num">v bits</th></tr>${G.rows.map(r => `<tr><td class="num">${r.dlt}</td><td class="num">${r.dod}</td><td class="num">${r.tb}</td><td class="num">${typeof r.v === `number` ? round(r.v, st.pat === `noise` ? 4 : 1) : r.v}</td><td>${r.xr}</td><td class="num">${r.vb}</td></tr>`).join(``)}</table></div><div class="cs-note">The first point is stored in full (64-bit time, 64-bit value); the first gap costs 14 bits.</div>`;
        let n = `This series compresses to ${round(gB, 2)} bytes per point, ${round(16 / gB, 1)}× smaller than raw and ~${Math.round(80 / gB)}× smaller than a row in a general-purpose database.`;
        if (st.jit === `none`) n += ` Perfectly regular timestamps cost 1 bit each: the gap never changes.`;
        else if (st.jit === `irr`) n += ` Irregular timestamps cost ~9 bits each, because every gap differs from the last.`;
        if (st.pat === `flat`) n += ` Unchanged values cost 1 bit each, which is why gauges that rarely move are nearly free.`;
        if (st.pat === `noise`) n += ` Random full-precision floats share few bits with their predecessor, so XOR saves little. Real metrics are rarely this noisy; rounding values at the source helps a lot.`;
        if (st.pat === `cpu`) n += ` Decimal values like 42.7 aren't exact in binary, so neighbouring values differ in most mantissa bits and cost ~50 bits each. Facebook's 1.37 bytes per point is an average over many series that are constant, integer-valued or slow-moving; try "mostly unchanged gauge".`;
        if (st.pat === `counter`) n += ` Integer counters as floats change only some mantissa bits, so the XOR has a short meaningful window.`;
        q(`note`).innerHTML = note(n, gB < 3 ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Time partitioning and retention
  // =====================================================================
  D.timePartition = {
    title: `Time partitioning: retention by DROP instead of DELETE`,
    blurb: `Metrics arrive at a steady rate and old data must go after the retention period. Compare one big table (delete expired rows every day) with one partition per day (drop the oldest partition). Assumed: a B-tree index entry of ~40 B per row and ~50K deleted rows per second including index maintenance.`,
    mount(el) {
      const st = { ppd: 9, ret: 30, mode: `part`, range: `24h` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`points per day`, rng(`ppd`, 6, 10.5, 0.1, st.ppd))}${ctl(`retention`, seg(`ret`, [[7, `7 days`], [30, `30 days`], [90, `90 days`]], st.ret))}</div>
        <div class="ctl-row">${ctl(`layout`, seg(`mode`, [[`table`, `one table + DELETE`], [`part`, `daily partitions + DROP`]], st.mode))}${ctl(`dashboard query`, seg(`range`, [[`1h`, `last hour`], [`24h`, `last 24 h`], [`7d`, `last 7 days`]], st.range))}</div>
        <div class="lab-panel"><h4>Days on disk</h4><div data-k="days"></div><div class="legend"><span><i class="sw" style="background:var(--accent-2)"></i>hot (receiving writes)</span><span><i class="sw" style="background:var(--good)"></i>read by the query</span><span><i class="sw" style="background:var(--bg-3)"></i>skipped</span><span><i class="sw" style="background:var(--bad)"></i>expiring today</span></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>Cost</h4><div class="stat-row" data-k="stats"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const ppd = Math.pow(10, st.ppd), ret = st.ret, part = st.mode === `part`;
        const touched = { "1h": 1, "24h": 2, "7d": 8 }[st.range];
        const days = ret + 1;
        const W = 520, bw = W / days;
        let s = ``;
        for (let i = 0; i < days; i++) {
          const age = days - 1 - i;
          const col = i === 0 ? `var(--bad)` : age === 0 ? `var(--accent-2)` : age < touched ? `var(--good)` : `var(--bg-3)`;
          s += `<rect x="${round(i * bw + (part ? 1 : 0), 1)}" y="6" width="${round(bw - (part ? 2 : 0), 1)}" height="34" rx="${part ? 2 : 0}" style="fill:${col};fill-opacity:${age < touched && i ? 0.75 : 1};stroke:${part ? `var(--border)` : `none`}"/>`;
        }
        if (!part) s += `<rect x="0" y="6" width="${W}" height="34" style="fill:none;stroke:var(--text);stroke-width:1.5"/>`;
        s += `<text class="svg-label" x="2" y="54">oldest</text><text class="svg-label" x="${W - 2}" y="54" text-anchor="end">today</text>`;
        q(`days`).innerHTML = svgWrap(W, 60, s);
        const rows = ppd * ret;
        const idxAll = rows * 40, idxHot = ppd * 40;
        const delSec = ppd / 50000;
        q(`stats`).innerHTML = stat(`rows kept`, fmtNum(rows)) + stat(part ? `daily retention job: DROP one partition` : `daily retention job: DELETE ${fmtNum(ppd)} rows`, part ? `< 1 s` : fmtT(delSec), part ? `good` : delSec > 3600 ? `bad` : `warn`) + stat(`dead rows left for VACUUM / compaction`, part ? `0` : fmtNum(ppd), part ? `good` : `bad`) + stat(`index receiving inserts`, part ? fmtB(idxHot) + ` (today only)` : fmtB(idxAll) + ` (everything)`, part || idxAll < 32e9 ? `good` : `warn`) + stat(`data the query can skip`, part ? `${ret + 1 - touched} of ${ret} partitions` : `uses the time index`, part ? `good` : ``);
        let n = part
          ? `Expiring a day is a metadata operation: drop the oldest partition and its files are gone, with nothing left to vacuum. Inserts only touch today's ${fmtB(idxHot)} index${idxHot < 16e9 ? `, which stays in memory` : `, ${ret}× smaller than one index over everything`}, and the ${st.range === `7d` ? `7-day` : st.range === `24h` ? `24-hour` : `1-hour`} query reads ${touched} partition${touched > 1 ? `s` : ``} and skips the rest without looking.`
          : `Every day ${fmtNum(ppd)} expired rows must be deleted one by one (about ${fmtT(delSec)}), each delete also updating the indexes, and the dead rows linger until vacuum or compaction reclaims them. Inserts maintain one ${fmtB(idxAll)} index over all ${ret} days, which ${idxAll > 32e9 ? `no longer fits in memory, so every insert risks a disk read` : `fits in memory for now`}.`;
        n += ` This is why every time series database partitions by time (TimescaleDB chunks, InfluxDB shards, Prometheus 2-hour blocks).`;
        q(`note`).innerHTML = note(n, part ? `good` : delSec > 600 ? `bad` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { ppd: v => fmtNum(Math.pow(10, v)) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch9 - Cardinality explosion
  // =====================================================================
  D.cardinality = {
    title: `Cardinality: how one tag can take down your metrics`,
    blurb: `Every unique combination of metric name and tag values is a separate series, with its own index entry and in-memory buffer. Count the series for a fleet and see what adding a high-cardinality tag does. Assumed: ~3 KB of memory per active series, a 64 GB node, 15 s scrape interval.`,
    mount(el) {
      const st = { hosts: 3, metrics: 200, regions: 6, extra: `none`, users: 5 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`hosts`, rng(`hosts`, 1, 5, 0.1, st.hosts))}${ctl(`metric names per host`, rng(`metrics`, 10, 500, 10, st.metrics))}${ctl(`regions`, rng(`regions`, 1, 20, 1, st.regions))}</div>
        <div class="ctl-row">${ctl(`extra tag`, seg(`extra`, [[`none`, `none`], [`status`, `status_code (5 values)`], [`container`, `container_id`], [`user`, `user_id`]], st.extra))}${ctl(`active users (for user_id)`, rng(`users`, 3, 7, 0.5, st.users))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Series count, built up tag by tag (log scale)</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const H = Math.round(Math.pow(10, st.hosts)), U = Math.round(Math.pow(10, st.users));
        const base = H * st.metrics;
        const mult = { none: 1, status: 5, container: 10 * 20, user: U }[st.extra];
        const series = base * mult;
        const mem = series * 3000, node = 64e9;
        const pps = series / 15;
        const lg = v => Math.log10(Math.max(1, v));
        const rows = [
          { label: `metric names`, value: lg(st.metrics), text: fmtNum(st.metrics) },
          { label: `× hosts`, value: lg(base), text: fmtNum(base) },
          { label: `× region`, value: lg(base), text: `${fmtNum(base)} (×1)`, title: `Each host lives in one region, so region adds no series`, cls: `muted` },
          { label: `× ${st.extra === `none` ? `no extra tag` : st.extra === `status` ? `status_code` : st.extra === `container` ? `container_id` : `user_id`}`, value: lg(series), text: fmtNum(series), cls: series > 1e7 ? `bad` : series > 1e6 ? `warn` : `good` }
        ];
        q(`bars`).innerHTML = hbars(rows, 11) + `<div class="cs-note">Naive product with regions multiplied in: ${fmtNum(base * st.regions * mult)}. The real count is lower because region is determined by host.</div>`;
        q(`stats`).innerHTML = stat(`series in the index`, fmtNum(series), series > 1e7 ? `bad` : series > 2e6 ? `warn` : `good`) + stat(`index + buffer memory`, fmtB(mem), mem > node ? `bad` : mem > node * 0.5 ? `warn` : `good`) + stat(`64 GB nodes needed`, fmtNum(Math.max(1, Math.ceil(mem / (node * 0.7))), 0), mem > node * 0.7 ? `bad` : `good`) + stat(`samples ingested / s`, fmtNum(pps));
        const N = {
          none: `${fmtNum(series)} series: ${fmtNum(H)} hosts × ${st.metrics} metrics. Region doesn't multiply anything because each host belongs to exactly one region; tags only multiply when they vary independently.`,
          status: `A bounded tag like status_code multiplies series by its handful of values. That's fine and useful.`,
          container: `container_id gets a new value on every deploy and restart, so old series pile up until retention expires them (here ~10 containers per host × 20 deploys in the retention window). Prometheus users call this churn; it bloats the index even though few series are active at once.`,
          user: `user_id multiplies every metric by ${fmtNum(U)} users: ${fmtNum(series)} series. Each series costs index memory and a write buffer whether or not it gets queried. Per-user data belongs in logs, traces or an analytics store, not in metric tags.`
        };
        q(`note`).innerHTML = note(N[st.extra] + (mem > node ? ` At ${fmtB(mem)} this no longer fits on one node: ingestion slows, queries time out and the database can run out of memory.` : ``), mem > node ? `bad` : mem > node * 0.5 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { hosts: v => fmtNum(Math.round(Math.pow(10, v))), metrics: v => v, regions: v => v, users: v => fmtNum(Math.round(Math.pow(10, v))) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch9 - Downsampling: storage tiers and lost spikes
  // =====================================================================
  const DS_TIERS = { raw: [[`raw 10 s`, 10, 365]], tiered: [[`raw 10 s`, 10, 2], [`1 min`, 60, 14], [`5 min`, 300, 90], [`1 hour`, 3600, 730]] };
  D.downsampling = {
    title: `Downsampling: cheap long-range queries, and the spikes they hide`,
    blurb: `Keep raw points briefly, then roll them up into coarser buckets that store min, max, sum and count. Top: storage and points read for a dashboard query. Bottom: a CPU spike lasting 30 s inside an hour, and what each rollup shows. Assumed: ~1.5 B per raw point after compression, ~6 B per rollup bucket.`,
    mount(el) {
      const st = { series: 5, policy: `tiered`, range: `30d`, bucket: 300 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`series`, rng(`series`, 3, 7, 0.5, st.series))}${ctl(`policy`, seg(`policy`, [[`raw`, `raw for a year`], [`tiered`, `tiered rollups`]], st.policy))}${ctl(`dashboard range`, seg(`range`, [[`1h`, `1 hour`], [`1d`, `1 day`], [`30d`, `30 days`], [`1y`, `1 year`]], st.range))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Storage per tier</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>Query cost</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>A 30-second spike, seen through a rollup</h4>
          <div class="ctl-row">${ctl(`rollup bucket`, seg(`bucket`, [[60, `1 min`], [300, `5 min`], [900, `15 min`]], st.bucket))}</div>
          <div data-k="spike"></div><div class="legend"><span><i class="sw line" style="background:#64748b"></i>raw 10 s</span><span><i class="sw line" style="background:var(--accent)"></i>avg rollup</span><span><i class="sw line" style="background:var(--bad)"></i>max rollup</span><span><i class="sw line" style="background:var(--warn)"></i>alert at 90%</span></div>
          <div class="stat-row" data-k="spikeStats"></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const raw = (() => { const r = mulberry32(26), v = []; for (let i = 0; i < 360; i++) v.push(i >= 222 && i < 225 ? 97 + r() * 2 : clamp(30 + gauss(r) * 4, 5, 60)); return v; })();
      const draw = () => {
        const S = Math.pow(10, st.series);
        const tiers = DS_TIERS[st.policy];
        const sto = tiers.map(([nm, iv, days], i) => ({ nm, iv, days, bytes: S * days * 86400 / iv * (i === 0 && iv === 10 ? 1.5 : 6) }));
        const yearRaw = S * 365 * 86400 / 10 * 1.5;
        q(`bars`).innerHTML = hbars(sto.map(t => ({ label: `${t.nm}, ${t.days} d`, value: t.bytes, text: fmtB(t.bytes), cls: t.iv === 10 ? `warn` : `good` })).concat([{ label: `total`, value: sum(sto.map(t => t.bytes)), text: fmtB(sum(sto.map(t => t.bytes))), cls: `alt` }]).concat(st.policy === `raw` ? [] : [{ label: `vs raw for a year`, value: yearRaw, text: fmtB(yearRaw), cls: `muted` }]), Math.max(yearRaw, ...sto.map(t => t.bytes)));
        const rs = { "1h": 3600, "1d": 86400, "30d": 30 * 86400, "1y": 365 * 86400 }[st.range];
        const tier = sto.find(t => t.days * 86400 >= rs && rs / t.iv <= 2000) || sto.find(t => t.days * 86400 >= rs) || sto[sto.length - 1];
        const pts = rs / tier.iv;
        q(`stats`).innerHTML = stat(`tier used`, tier.nm) + stat(`points read per series`, fmtNum(pts), pts > 1e5 ? `bad` : pts > 5000 ? `warn` : `good`) + stat(`points read across 100 series`, fmtNum(pts * 100)) + stat(`total storage vs a year of raw`, pct(sum(sto.map(t => t.bytes)) / yearRaw, 1), st.policy === `raw` ? `bad` : `good`);
        const b = st.bucket / 10, avg = [], mx = [];
        for (let i = 0; i < 360; i += b) { const sl = raw.slice(i, i + b); avg.push([i, sum(sl) / sl.length]); mx.push([i, Math.max(...sl)]); }
        const a = axes({ x0: 40, x1: 495, y0: 170, y1: 12, dx0: 0, dx1: 360, dy0: 0, dy1: 100, xTicks: [0, 90, 180, 270, 360], yTicks: [0, 50, 90], xFmt: v => v / 6 + ` min`, yFmt: v => v + `%` });
        const step = arr => { const p = []; arr.forEach(([i, v]) => { p.push([a.X(i), a.Y(v)]); p.push([a.X(Math.min(360, i + b)), a.Y(v)]); }); return p; };
        let c = a.svg + `<line x1="40" x2="495" y1="${a.Y(90)}" y2="${a.Y(90)}" style="stroke:var(--warn);stroke-dasharray:4 3"/>`;
        c += `<path d="${path(raw.map((v, i) => [a.X(i), a.Y(v)]))}" style="fill:none;stroke:#64748b;stroke-width:1"/>`;
        c += `<path d="${path(step(mx))}" style="fill:none;stroke:var(--bad);stroke-width:2"/><path d="${path(step(avg))}" style="fill:none;stroke:var(--accent);stroke-width:2.5"/>`;
        q(`spike`).innerHTML = svgWrap(520, 200, c);
        const pk = Math.max(...raw), pa = Math.max(...avg.map(x => x[1])), pm = Math.max(...mx.map(x => x[1]));
        q(`spikeStats`).innerHTML = stat(`true peak`, round(pk, 1) + `%`) + stat(`peak in the avg rollup`, round(pa, 1) + `%`, pa < 90 ? `bad` : `good`) + stat(`peak in the max rollup`, round(pm, 1) + `%`, `good`) + stat(`90% alert on the average`, pa >= 90 ? `fires` : `never fires`, pa >= 90 ? `good` : `bad`);
        let n = st.policy === `tiered` ? `Tiered rollups keep storage at ${pct(sum(sto.map(t => t.bytes)) / yearRaw, 1)} of a year of raw points, and a ${st.range} dashboard reads ${fmtNum(pts)} points per series from the ${tier.nm} tier.` : `Keeping raw points for a year costs ${fmtB(yearRaw)}, and a ${st.range} dashboard reads ${fmtNum(pts)} points per series${pts > 1e5 ? `, far more than any chart can draw` : ``}.`;
        n += ` In the spike chart, the ${st.bucket / 60}-minute average shows a peak of only ${round(pa, 1)}%: the 30 s spike to ${round(pk, 0)}% is averaged away${pa < 90 ? ` and an alert on the average never fires` : ``}. Store max (and min, sum, count) in every rollup, and alert on raw data.`;
        q(`note`).innerHTML = note(n, pa < 90 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { series: v => fmtNum(Math.pow(10, v)) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch10 - Dual writes vs CDC vs outbox
  // =====================================================================
  const DW_AP = { dual: `dual write`, retry: `dual write + retries`, cdc: `CDC from the log`, outbox: `outbox + CDC` };
  function dwSim(ap, st, seed) {
    const r = mulberry32(seed), P = 2000, U = 10000;
    const db = new Int32Array(P), ix = new Int32Array(P);
    let lost = 0, failed = 0, raced = 0, v = 0;
    for (let u = 0; u < U; u++) {
      const p = Math.floor(r() * P);
      const racing = st.race === `on` && r() < 0.03;
      const crash = r() < st.crash / 100, fail = r() < st.fail / 100, swap = r() < 0.5;
      if (racing) {
        const a = ++v, b = ++v;
        db[p] = b;
        if (ap === `cdc` || ap === `outbox`) { ix[p] = b; continue; }
        if (crash) { lost++; continue; }
        if (fail && ap === `dual`) { failed++; ix[p] = a; continue; }
        if (swap) { ix[p] = a; raced++; } else ix[p] = b;
      } else {
        const a = ++v;
        db[p] = a;
        if (ap === `cdc` || ap === `outbox`) { ix[p] = a; continue; }
        if (crash) { lost++; continue; }
        if (fail && ap === `dual`) { failed++; continue; }
        ix[p] = a;
      }
    }
    let div = 0;
    for (let i = 0; i < P; i++) if (db[i] !== ix[i]) div++;
    return { div, lost, failed, raced, P, U };
  }
  D.dualWrite = {
    title: `Dual writes vs CDC: keeping a search index in sync`,
    blurb: `10,000 product updates across 2,000 products must reach Postgres and Elasticsearch. Writing both from the application can fail halfway, and two concurrent requests can reach the index in the opposite order from the database. CDC reads committed changes from the database log instead, in commit order, and retries until applied.`,
    mount(el) {
      const st = { ap: `dual`, fail: 2, crash: 0.5, race: `on` };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`approach`, seg(`ap`, Object.keys(DW_AP).map(k => [k, DW_AP[k]]), st.ap))}</div>
        <div class="ctl-row">${ctl(`search write failures`, rng(`fail`, 0, 20, 0.5, st.fail))}${ctl(`app crashes between writes`, rng(`crash`, 0, 5, 0.1, st.crash))}${ctl(`concurrent updates to a product`, seg(`race`, [[`off`, `never`], [`on`, `3% of updates`]], st.race))}</div>
        <div class="ctl-row">${againBtn}</div>
        <div class="lab-panel"><h4>After 10,000 updates</h4><div class="stat-row" data-k="stats"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>All approaches, same run</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const META = {
        dual: { lat: `+ search write (~20 ms)`, lag: `none`, atomic: false, intent: true },
        retry: { lat: `+ search write and retries`, lag: `none`, atomic: false, intent: true },
        cdc: { lat: `none`, lag: `~0.1-2 s`, atomic: true, intent: false },
        outbox: { lat: `+ one insert, same transaction`, lag: `~0.1-2 s`, atomic: true, intent: true }
      };
      const draw = () => {
        const R = {};
        Object.keys(DW_AP).forEach(k => { R[k] = dwSim(k, st, seed * 31 + 7); });
        const s = R[st.ap];
        q(`stats`).innerHTML = stat(`products where index ≠ database`, `${fmtNum(s.div)} (${pct(s.div / s.P, 1)})`, s.div ? `bad` : `good`) + stat(`lost to crashes`, fmtNum(s.lost), s.lost ? `bad` : `good`) + stat(`lost to failed search writes`, fmtNum(s.failed), s.failed ? `bad` : `good`) + stat(`overwritten by an older value (race)`, fmtNum(s.raced), s.raced ? `bad` : `good`) + stat(`replication lag`, META[st.ap].lag);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>approach</th><th class="num">diverged</th><th>added write latency</th><th>lag</th><th>atomic with DB write</th><th>says why it changed</th></tr>${Object.keys(DW_AP).map(k => `<tr class="${k === st.ap ? `new` : ``}"><td>${DW_AP[k]}</td><td class="num" style="${R[k].div ? `color:var(--bad);font-weight:700` : ``}">${fmtNum(R[k].div)}</td><td>${META[k].lat}</td><td>${META[k].lag}</td><td>${chip(META[k].atomic ? `yes` : `no`, META[k].atomic ? `ok` : `no`)}</td><td>${chip(META[k].intent ? `yes` : `no`, META[k].intent ? `ok` : `muted`)}</td></tr>`).join(``)}</table></div>`;
        const clean = `No divergence this run because crashes${st.ap === `dual` ? `, failures` : ``} and concurrent updates are all switched off. In production none of them is ever zero.`;
        const N = {
          dual: s.div ? `${fmtNum(s.lost + s.failed + s.raced)} search writes went wrong. A later update to the same product happens to repair some of them, but ${fmtNum(s.div)} products still show different data in search than in the database, and nothing will notice or fix them.` : clean,
          retry: s.div ? `Retries recover failed search writes, but not a crash between the two writes, and not two concurrent requests whose search writes land in the opposite order: ${fmtNum(s.div)} products still diverge. Retries also make the user's request slower.` : clean,
          cdc: `The application writes only to Postgres. A connector (for example Debezium) tails the write-ahead log and applies changes to the index in commit order, retrying until they succeed, so nothing diverges; the index just lags by a second or so. Events describe row changes, not business intent.`,
          outbox: `The application inserts a business event ("PriceChanged") into an outbox table in the same transaction as the update, and CDC publishes it. You get CDC's guarantees plus events that say what happened and why, and consumers aren't coupled to your table schema.`
        };
        q(`note`).innerHTML = note(N[st.ap], s.div ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { fail: v => v + `%`, crash: v => v + `%` }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch10 - CDC ordering, partitioning and idempotent consumers
  // =====================================================================
  const CO_ROWS = 12, CO_UPD = 5;
  function coSim(st, seed) {
    const r = mulberry32(seed);
    const ev = [];
    let lsn = 0;
    for (let u = 1; u <= CO_UPD; u++) {
      const order = Array.from({ length: CO_ROWS }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      order.forEach(row => { lsn++; ev.push({ row, ver: u, lsn }); });
    }
    const P = st.parts;
    const queues = Array.from({ length: P }, () => []);
    ev.forEach((e, i) => queues[st.part === `key` ? hashInt(e.row, 3) % P : i % P].push(e));
    const apps = [];
    queues.forEach(qu => {
      let t = 0;
      const mid = Math.floor(qu.length / 2);
      qu.forEach((e, i) => {
        t = Math.max(t, e.lsn * 0.4) + 0.5 + -Math.log(Math.max(1e-9, r())) * 1.5;
        apps.push({ t, e, dup: false });
        if (st.dup === `on` && i === mid) qu.slice(Math.max(0, i - 3), i + 1).forEach(x => { t += 0.5 + r(); apps.push({ t, e: x, dup: true }); });
      });
    });
    apps.sort((a, b) => a.t - b.t);
    const ixVer = new Array(CO_ROWS).fill(0), ixLsn = new Array(CO_ROWS).fill(0), seen = new Array(CO_ROWS).fill(0);
    let ooo = 0, dupApplied = 0, skipped = 0;
    const log = [];
    apps.forEach(a => {
      const { row, ver, lsn: l } = a.e;
      const late = l < seen[row];
      if (late) ooo++;
      seen[row] = Math.max(seen[row], l);
      let action;
      if (st.consumer === `blind` || l > ixLsn[row]) { ixVer[row] = ver; ixLsn[row] = l; action = `applied`; if (a.dup) dupApplied++; }
      else { action = `skipped`; skipped++; }
      log.push({ row, ver, lsn: l, dup: a.dup, late, action, after: ixVer[row] });
    });
    const stale = ixVer.map((v, i) => [i, v]).filter(([, v]) => v !== CO_UPD);
    return { ev, apps, ixVer, ooo, dupApplied, skipped, stale, log };
  }
  D.cdcOrdering = {
    title: `CDC consumers: ordering, partitioning and duplicates`,
    blurb: `12 products are each updated 5 times (v1 to v5). The change events go through a topic with several partitions, each consumed independently with variable delay. Order is only guaranteed within a partition, and delivery is at-least-once. Will the search index end at v5 for every product?`,
    mount(el) {
      const st = { part: `key`, consumer: `blind`, dup: `off`, parts: 4 };
      let seed = 3;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`partition events by`, seg(`part`, [[`key`, `primary key`], [`rr`, `round robin`]], st.part))}${ctl(`partitions`, rng(`parts`, 1, 6, 1, st.parts))}</div>
        <div class="ctl-row">${ctl(`consumer`, seg(`consumer`, [[`blind`, `blind overwrite`], [`version`, `apply only if LSN is newer`]], st.consumer))}${ctl(`redelivery after a consumer restart`, seg(`dup`, [[`off`, `off`], [`on`, `on`]], st.dup))}</div>
        <div class="ctl-row">${againBtn}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Final index state</h4><div data-k="grid"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
          <div class="lab-panel"><h4 data-k="rowTitle"></h4><div data-k="log"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = coSim(st, seed * 17 + 1);
        q(`grid`).innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px">${R.ixVer.map((v, i) => chip(`product ${i + 1}: v${v}`, v === CO_UPD ? `ok` : `no`)).join(``)}</div>`;
        q(`stats`).innerHTML = stat(`products left stale`, `${R.stale.length} / ${CO_ROWS}`, R.stale.length ? `bad` : `good`) + stat(`events that arrived after a newer one`, R.ooo, R.ooo ? `warn` : `good`) + stat(`redelivered events applied`, R.dupApplied, R.dupApplied && st.consumer === `blind` ? `warn` : ``) + stat(`events skipped as older`, R.skipped);
        const show = R.stale.length ? R.stale[0][0] : (R.log.find(x => x.late) || R.log[0]).row;
        q(`rowTitle`).textContent = `Events for product ${show + 1}, in arrival order`;
        const rows = R.log.filter(x => x.row === show);
        q(`log`).innerHTML = `<table class="mini-table"><tr><th>event</th><th class="num">LSN</th><th>arrived</th><th>action</th><th>index now</th></tr>${rows.map(x => `<tr><td>v${x.ver}${x.dup ? ` (redelivered)` : ``}</td><td class="num">${x.lsn}</td><td>${x.late ? chip(`late`, `no`) : chip(`in order`, `ok`)}</td><td>${x.action === `applied` ? (x.late ? `<span style="color:var(--bad)">overwrote newer</span>` : `applied`) : `<span style="color:var(--good)">skipped (older)</span>`}</td><td>v${x.after}</td></tr>`).join(``)}</table>`;
        let n;
        if (R.stale.length) n = `${R.stale.length} product${R.stale.length > 1 ? `s` : ``} ended on an old version. ${st.part === `rr` ? `Round-robin spreads one product's updates over several partitions, and partitions are consumed independently, so v3 can arrive after v4 and a blind overwrite keeps v3.` : `Some events for one product were applied out of commit order.`} Partition by primary key, and make the consumer compare versions (the log position / LSN, or a row version column) and ignore anything older than what it already applied.`;
        else if (st.consumer === `version` && R.skipped) n = `Events did arrive late or twice (${R.ooo} arrived after a newer one), but the consumer only applies an event if its LSN is newer than the one stored, so ${R.skipped} were skipped and the index converges to v5 everywhere. Version-checked consumers make reordering and duplicates harmless.`;
        else {
          n = `Every product ended at v5. ` + (st.part === `key` ? `Partitioning by primary key keeps each product's events in one partition, consumed in commit order.` : `Round robin got lucky this run; press "New random run".`);
          n += st.dup === `on` ? ` Redelivered events were replayed in order, and these are full-row upserts, so replaying them converges to the same state. Delta events such as "stock − 1" would be applied twice; deduplicate those by event ID or LSN.` : ` Switch to round robin to see reordering break a blind consumer.`;
        }
        if (st.parts === 1) n += ` With one partition everything is ordered, but you can only run one consumer; throughput is capped.`;
        q(`note`).innerHTML = note(n, R.stale.length ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { parts: v => v }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };
})();
