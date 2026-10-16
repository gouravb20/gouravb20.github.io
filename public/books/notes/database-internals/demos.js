// Database Internals - interactive labs, part 1 (chapters 1-4). Depends on labkit.js.
(function () {
  "use strict";
  const K = window.LabKit;
  const { esc, clamp, sum, round, seg, wireSegs, rng, wireRanges, ctl, stat, note, hbars, svgWrap, fmtNum, fmtBytes, pct, mulberry32, axes, path } = K;
  const D = window.DEMOS;
  const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;
  const pblock = (cls, head, body) => `<div class="pblock ${cls}"><div class="pblock-h">${head}</div><pre>${esc(body)}</pre></div>`;
  const hex2 = b => b.toString(16).toUpperCase().padStart(2, `0`);
  const BLOCK = 4096;

  // =====================================================================
  // Ch1 - Row vs column layout
  // =====================================================================
  const RC_TABLES = {
    stocks: {
      label: `stock quotes`,
      cols: [[`ID`, 4], [`Symbol`, 8], [`Date`, 4], [`Price`, 8]],
      rows: [[1, `DOW`, `08 Aug 2018`, `24,314.65`], [2, `DOW`, `09 Aug 2018`, `24,136.16`], [3, `S&P`, `08 Aug 2018`, `2,414.45`], [4, `S&P`, `09 Aug 2018`, `2,232.32`]],
      newRow: [5, `DOW`, `10 Aug 2018`, `25,509.23`],
      comp: [4, 25, 8, 2],
      queries: {
        agg: { label: `AVG(Price)`, sql: `SELECT AVG(Price) FROM quotes`, cols: [3], rows: `all` },
        point: { label: `one row by ID`, sql: `SELECT * FROM quotes WHERE ID = 3`, cols: [0, 1, 2, 3], rows: [2] },
        insert: { label: `insert a quote`, sql: `INSERT INTO quotes VALUES (5, 'DOW', ...)`, cols: [0, 1, 2, 3], rows: `new` }
      }
    },
    users: {
      label: `users`,
      cols: [[`ID`, 4], [`Name`, 32], [`Birth Date`, 4], [`Phone Number`, 16]],
      rows: [[10, `John`, `01 Aug 1981`, `+1 111 222 333`], [20, `Sam`, `14 Sep 1988`, `+1 555 888 999`], [30, `Keith`, `07 Jan 1984`, `+1 333 444 555`]],
      newRow: [40, `Ann`, `22 Mar 1990`, `+1 222 777 111`],
      comp: [4, 3, 3, 1.5],
      queries: {
        agg: { label: `all phone numbers`, sql: `SELECT Phone FROM users`, cols: [3], rows: `all` },
        point: { label: `one user profile`, sql: `SELECT * FROM users WHERE ID = 20`, cols: [0, 1, 2, 3], rows: [1] },
        insert: { label: `register a user`, sql: `INSERT INTO users VALUES (40, 'Ann', ...)`, cols: [0, 1, 2, 3], rows: `new` }
      }
    }
  };
  function rcCost(t, qk, layout, N, comp) {
    const qu = t.queries[qk];
    const widths = t.cols.map(c => c[1]);
    const rowB = sum(widths) / (comp ? 1.3 : 1);
    if (layout === `row`) {
      const per = Math.max(1, Math.floor(BLOCK / rowB));
      if (qk === `agg`) return { blocks: Math.ceil(N / per), useful: N * sum(qu.cols.map(c => widths[c])) };
      return { blocks: 1, useful: sum(widths) };
    }
    const colBlocks = c => Math.ceil(N / Math.max(1, Math.floor(BLOCK / (widths[c] / (comp ? t.comp[c] : 1)))));
    if (qk === `agg`) return { blocks: sum(qu.cols.map(colBlocks)), useful: N * sum(qu.cols.map(c => widths[c])) };
    return { blocks: t.cols.length, useful: sum(widths) };
  }
  D.rowColumn = {
    title: `Row vs column layout: what a query actually reads`,
    blurb: `The book's two example tables, stored both ways. Pick a query and watch which values are paged in. Disks hand out whole <strong>blocks</strong> (4 KB here), so a row store reading one column still drags every other column along, while a column store touches one file per column. Scale the table up to see the block counts, and switch on compression: same-type values in a column compress much better than mixed rows.`,
    mount(el) {
      const st = { tbl: `stocks`, qk: `agg`, n: 6, comp: `off` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`table`, seg(`tbl`, [[`stocks`, `stock quotes`], [`users`, `users`]], st.tbl))}${ctl(`query`, `<span data-k="qseg"></span>`)}</div>
        <div class="ctl-row">${ctl(`rows (10^n)`, rng(`n`, 3, 9, 1, st.n))}${ctl(`compression`, seg(`comp`, [[`off`, `off`], [`on`, `on`]], st.comp))}</div>
        <div data-k="sql"></div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Row-oriented: one block holds whole rows</h4><div data-k="row"></div></div>
          <div class="lab-panel"><h4>Column-oriented: one file per column</h4><div data-k="col"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>Blocks touched at scale</h4><div data-k="bars"></div><div class="legend"><span>${chip(`ok`, `needed`)}</span><span>${chip(`no`, `read but unused`)}</span><span>${chip(`final`, `written`)}</span><span>${chip(`muted`, `not touched`)}</span></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const drawQseg = () => {
        const t = RC_TABLES[st.tbl];
        q(`qseg`).innerHTML = seg(`qk`, Object.keys(t.queries).map(k => [k, t.queries[k].label]), st.qk);
        q(`qseg`).querySelectorAll(`button`).forEach(b => b.addEventListener(`click`, () => { st.qk = b.dataset.v; drawQseg(); draw(); }));
      };
      const tok = (cls, txt) => `<span class="tok ${cls}">${esc(String(txt))}</span>`;
      const draw = () => {
        const t = RC_TABLES[st.tbl], qu = t.queries[st.qk], N = Math.pow(10, st.n), comp = st.comp === `on`;
        q(`sql`).innerHTML = pblock(`user`, `query`, qu.sql);
        const isIns = qu.rows === `new`;
        const need = (ri, ci) => (qu.rows === `all` || (Array.isArray(qu.rows) && qu.rows.includes(ri))) && qu.cols.includes(ci);
        const rowCls = (ri, ci) => isIns ? `dim` : need(ri, ci) ? `c5 hot` : `c4`;
        let rowHtml = t.rows.map((r, ri) => `<div class="toks" style="margin-bottom:3px">${r.map((v, ci) => tok(rowCls(ri, ci), v)).join(``)}</div>`).join(``);
        if (isIns) rowHtml += `<div class="toks">${t.newRow.map(v => tok(`c1 hot`, v)).join(``)}</div>`;
        q(`row`).innerHTML = `<div class="scroll-y" style="max-height:none">${rowHtml}</div>`;
        const colCls = (ri, ci) => isIns ? `dim` : !qu.cols.includes(ci) ? `dim` : need(ri, ci) ? `c5 hot` : `c4`;
        q(`col`).innerHTML = t.cols.map((c, ci) => `<div style="margin-bottom:5px"><div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">${c[0]} (${c[1]} B)${comp ? ` · ~${t.comp[ci]}x compressed` : ``}</div><div class="toks">${t.rows.map((r, ri) => tok(colCls(ri, ci), (ri + 1) + `:` + r[ci])).join(``)}${isIns ? tok(`c1 hot`, (t.rows.length + 1) + `:` + t.newRow[ci]) : ``}</div></div>`).join(``);
        const R = rcCost(t, st.qk, `row`, N, comp), C = rcCost(t, st.qk, `col`, N, comp);
        const verb = isIns ? `written` : `read`;
        q(`bars`).innerHTML = hbars([
          { label: `row store`, value: R.blocks, text: fmtNum(R.blocks) + ` blk`, cls: R.blocks <= C.blocks ? `good` : `bad` },
          { label: `column store`, value: C.blocks, text: fmtNum(C.blocks) + ` blk`, cls: C.blocks <= R.blocks ? `good` : `bad` }
        ]) + `<div class="stat-row" style="margin-top:10px">${stat(`rows`, fmtNum(N))}${stat(`row store bytes ` + verb, fmtBytes(R.blocks * BLOCK))}${stat(`column store bytes ` + verb, fmtBytes(C.blocks * BLOCK))}${isIns ? `` : stat(`useful bytes`, fmtBytes(R.useful))}</div>`;
        let n;
        if (st.qk === `agg`) n = `Scanning one column of ${fmtNum(N)} rows: the row store must page in every block of the table, because each block interleaves all columns. The column store reads only the ${t.cols[qu.cols[0]][0]} file: <strong>${round(R.blocks / C.blocks, 1)}x fewer blocks</strong>${comp ? `, helped by compressing same-type values` : `; turn on compression to widen the gap`}. This is why analytical stores (Vertica, Parquet, ORC) are columnar.`;
        else if (st.qk === `point`) n = `Fetching one whole record: the row store finds it in a single block (spatial locality). The column store has to visit ${t.cols.length} column files and reassemble the tuple by its position (virtual ID). Point reads of full records favour rows, which is why OLTP systems are row-oriented.`;
        else n = `Inserting a record: the row store appends it to one block. The column store writes ${t.cols.length} values into ${t.cols.length} different column files. Column stores usually buffer inserts in memory and write them out in batches.`;
        if (comp) n += ` <em>Compression ratios here are illustrative, not from the book.</em>`;
        q(`note`).innerHTML = note(n, st.qk === `agg` ? `good` : ``);
      };
      wireSegs(el, st, k => { if (k === `tbl`) drawQseg(); draw(); });
      wireRanges(el, st, { n: v => fmtNum(Math.pow(10, v)) + ` rows` }, draw);
      drawQseg(); draw();
    }
  };

  // =====================================================================
  // Ch1 - Secondary index: file offset vs primary key indirection
  // =====================================================================
  D.indexIndirection = {
    title: `Secondary indexes: direct offsets vs primary key indirection`,
    blurb: `A secondary index can point straight at the record's <strong>file offset</strong>, or store the <strong>primary key</strong> and go through the primary index (as MySQL InnoDB does). Offsets give faster reads, but every time a record moves (a page split, a size-changing update, compaction) <em>every</em> index pointing at it must be rewritten. Slide the share of relocations and the number of secondary indexes and see which design wins. The hybrid stores both and falls back to the primary key when the offset is stale.`,
    mount(el) {
      const st = { k: 3, reloc: 10, stale: 20, h: 3 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`secondary indexes`, rng(`k`, 1, 8, 1, st.k))}${ctl(`index height`, seg(`h`, [[2, `2`], [3, `3`], [4, `4`]], st.h))}</div>
        <div class="ctl-row">${ctl(`operations that move a record`, rng(`reloc`, 0, 60, 5, st.reloc))}${ctl(`hybrid: stale offsets`, rng(`stale`, 0, 100, 10, st.stale))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Read path for WHERE name = 'Sam'</h4><div data-k="flow"></div></div>
          <div class="lab-panel"><h4>Page accesses per 1,000 operations</h4><div data-k="bars"></div><div data-k="tbl" style="margin-top:10px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const H = st.h, k = st.k, r = st.reloc / 100, s = st.stale / 100;
        const reads = 1000 * (1 - r), moves = 1000 * r;
        const S = {
          direct: { label: `direct offset`, read: H + 1, move: (k + 1) * (H + 1) },
          pk: { label: `primary key`, read: H + H, move: 1 * (H + 1) },
          hybrid: { label: `hybrid`, read: H + 1 + s * H, move: 1 * (H + 1) }
        };
        Object.values(S).forEach(v => { v.total = reads * v.read + moves * v.move; });
        const best = Object.keys(S).reduce((a, b) => S[a].total <= S[b].total ? a : b);
        q(`flow`).innerHTML =
          pblock(best === `direct` ? `out` : `ctx`, `direct offset (${H + 1} pages)`, `idx_name['Sam'] (${H} levels)\n  -> offset 0x1F40\n  -> heap page 31: {20, Sam, 14 Sep 1988, ...}`) +
          pblock(best === `pk` ? `out` : `ctx`, `primary key indirection (${2 * H} pages)`, `idx_name['Sam'] (${H} levels)\n  -> primary key 20\n  -> primary index (${H} levels)\n  -> leaf holds {20, Sam, ...}`) +
          pblock(best === `hybrid` ? `out` : `ctx`, `hybrid (${round(S.hybrid.read, 2)} pages on average)`, `idx_name['Sam'] -> (offset 0x1F40, pk 20)\n  try the offset; if the record moved (${st.stale}%),\n  fall back to the primary index`);
        q(`bars`).innerHTML = hbars(Object.keys(S).map(key => ({ label: S[key].label, value: S[key].total, text: fmtNum(S[key].total), cls: key === best ? `good` : `` })));
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>design</th><th class="num">per read</th><th class="num">per move</th><th class="num">indexes rewritten</th></tr>${Object.keys(S).map(key => `<tr class="${key === best ? `new` : ``}"><td>${S[key].label}</td><td class="num">${round(S[key].read, 2)}</td><td class="num">${S[key].move}</td><td class="num">${key === `direct` ? k + 1 : 1}</td></tr>`).join(``)}</table>`;
        let n;
        if (best === `direct`) n = `With ${st.reloc}% relocations and ${k} secondary index${k > 1 ? `es` : ``}, direct offsets win: reads are the common case and each costs one page less than a second index descent.`;
        else if (best === `pk`) n = `Records move often enough that rewriting ${k + 1} indexes on every move dominates. Primary key indirection only updates the primary index, which is why InnoDB's secondary indexes store the primary key.`;
        else n = `The hybrid gets most reads at offset cost and moves at primary-key cost. It pays a second descent only when the cached offset is stale.`;
        q(`note`).innerHTML = note(n + ` <em>The cost model (one page per level plus one write) is a simplification for comparison.</em>`, `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { k: v => v, reloc: v => v + `%`, stale: v => v + `%` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch2 - BST vs B-Tree height
  // =====================================================================
  const LAT = { hdd: [10, `ms`, `HDD seek ~10 ms`], ssd: [0.1, `ms`, `SSD read ~100 µs`] };
  D.btreeHeight = {
    title: `Fanout vs height: why disks want wide trees`,
    blurb: `A balanced binary search tree needs about log<sub>2</sub>N levels, and on disk every level is a random block read. A B-Tree packs K keys per page, so it needs only log<sub>K</sub>N reads, even though the number of key comparisons (binary search inside each node) stays around log<sub>2</sub>N. Try sorted inserts into an unbalanced BST, and cache the top levels in memory as a real page cache would.`,
    mount(el) {
      const st = { n: 9.6, k: 256, dev: `hdd`, order: `balanced`, cached: 1 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`items (10^n)`, rng(`n`, 3, 10, 0.2, st.n))}${ctl(`B-Tree fanout`, seg(`k`, [[16, `16`], [64, `64`], [256, `256`], [1024, `1024`]], st.k))}</div>
        <div class="ctl-row">${ctl(`BST inserts`, seg(`order`, [[`balanced`, `balanced`], [`sorted`, `sorted (no rebalancing)`]], st.order))}${ctl(`device`, seg(`dev`, [[`hdd`, `HDD`], [`ssd`, `SSD`]], st.dev))}${ctl(`top levels cached`, rng(`cached`, 0, 3, 1, st.cached))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Tree height (levels) vs number of items</h4><div data-k="chart"></div><div class="legend"><span><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" class="svg-line2"/></svg> balanced BST</span><span><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" class="svg-line"/></svg> B-Tree, selected fanout</span><span><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" class="svg-line3" style="opacity:.4"/></svg> other fanouts</span></div></div>
          <div class="lab-panel"><h4>One lookup</h4><div data-k="tbl"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const btH = (N, Kf) => { let h = 1, cap = Kf; while (cap < N) { cap *= Kf; h++; } return h; };
      const draw = () => {
        const N = Math.round(Math.pow(10, st.n));
        const bstH = st.order === `balanced` ? Math.ceil(Math.log2(N + 1)) : N;
        const bH = btH(N, st.k);
        const cmp = Math.ceil(Math.log2(N));
        const [lat, unit, devTxt] = LAT[st.dev];
        const reads = h => Math.max(0, h - st.cached);
        const a = axes({ x0: 46, x1: 470, y0: 210, y1: 14, dx0: 1e3, dx1: 1e10, dy0: 0, dy1: 36, xLog: true, xTicks: [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10], yTicks: [0, 6, 12, 18, 24, 30, 36], xFmt: v => fmtNum(v, 0), xLabel: `items`, yLabel: `levels` });
        let s = a.svg;
        const pts = f => { const out = []; for (let e = 3; e <= 10.0001; e += 0.02) out.push([a.X(Math.pow(10, e)), a.Y(Math.min(36, f(Math.pow(10, e))))]); return out; };
        [16, 64, 256, 1024].filter(f => f !== st.k).forEach(f => { s += `<path class="svg-line3" style="opacity:.35" d="${path(pts(x => btH(x, f)))}"/>`; });
        s += `<path class="svg-line2" d="${path(pts(x => Math.ceil(Math.log2(x + 1))))}"/>`;
        s += `<path class="svg-line" d="${path(pts(x => btH(x, st.k)))}"/>`;
        s += `<line class="svg-wm" x1="${a.X(N)}" x2="${a.X(N)}" y1="210" y2="14" style="stroke:var(--accent-3);stroke-dasharray:3 3"/>`;
        s += `<circle class="svg-dot" cx="${a.X(N)}" cy="${a.Y(bH)}" r="4" style="fill:var(--accent)"/>`;
        if (st.order === `balanced`) s += `<circle cx="${a.X(N)}" cy="${a.Y(Math.min(36, bstH))}" r="4" style="fill:var(--accent-3)"/>`;
        q(`chart`).innerHTML = svgWrap(490, 245, s);
        const t = (h) => { const r = reads(h); const ms = r * lat; return [r, ms >= 1000 ? round(ms / 1000, 1) + ` s` : round(ms, 2) + ` ` + unit]; };
        const [bR, bT] = t(bstH), [tR, tT] = t(bH);
        q(`tbl`).innerHTML = `<table class="mini-table">
          <tr><th></th><th class="num">BST</th><th class="num">B-Tree (K=${st.k})</th></tr>
          <tr><td>height (levels)</td><td class="num">${fmtNum(bstH, 0)}</td><td class="num">${bH}</td></tr>
          <tr><td>disk reads (${st.cached} cached)</td><td class="num">${fmtNum(bR, 0)}</td><td class="num">${tR}</td></tr>
          <tr><td>key comparisons</td><td class="num">${st.order === `balanced` ? cmp : `~` + fmtNum(N / 2, 1)}</td><td class="num">~${cmp}</td></tr>
          <tr><td>time (${devTxt})</td><td class="num">${bT}</td><td class="num">${tT}</td></tr>
        </table>
        <div class="stat-row" style="margin-top:10px">${stat(`items`, fmtNum(N))}${stat(`fewer reads`, bR && tR ? (bR / tR >= 1000 ? fmtNum(bR / tR) : round(bR / tR, 1)) + `x` : `-`, `good`)}</div>`;
        let n = st.order === `sorted`
          ? `Inserting sorted keys into a BST without rebalancing builds a <strong>pathological tree</strong>: a linked list ${fmtNum(N)} levels deep. Lookups degrade to a linear scan. Balancing fixes it, but rotations rewrite pointers on many pages.`
          : `For ${fmtNum(N)} items a balanced BST is ${bstH} levels deep (≈ log<sub>2</sub>N; the book's example: 4 billion items ≈ 32 comparisons). A B-Tree with fanout ${st.k} is only ${bH} levels deep, so it needs ${tR} disk read${tR === 1 ? `` : `s`} instead of ${bR}, with about the same number of comparisons done in memory.`;
        if (st.dev === `ssd` && st.order === `balanced`) n += ` SSDs shrink the latency gap, but block-wise access still makes every level a full page read.`;
        q(`note`).innerHTML = note(n, st.order === `sorted` ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => fmtNum(Math.round(Math.pow(10, v))), cached: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch2 - Interactive B+-Tree
  // =====================================================================
  function btDraw(root, hot, fresh, hitKey) {
    const levels = [];
    (function walk(n, d) { (levels[d] = levels[d] || []).push(n); if (!n.leaf) n.children.forEach(c => walk(c, d + 1)); })(root, 0);
    const KW = 24, PAD = 6, GAP = 12, LH = 62, NH = 24, TOP = 12;
    const w = n => Math.max(1, n.keys.length) * KW + PAD;
    const pos = new Map();
    let x = 10;
    levels[levels.length - 1].forEach(n => { pos.set(n, { x, w: w(n) }); x += w(n) + GAP; });
    for (let d = levels.length - 2; d >= 0; d--) levels[d].forEach(n => {
      const a = pos.get(n.children[0]), b = pos.get(n.children[n.children.length - 1]);
      pos.set(n, { x: (a.x + b.x + b.w) / 2 - w(n) / 2, w: w(n) });
    });
    const width = Math.max(x, 520), off = (width - x) / 2;
    const height = levels.length * LH + 4;
    let edges = ``, nodes = ``;
    levels.forEach((lvl, d) => lvl.forEach(n => {
      const p = pos.get(n), y = TOP + d * LH, px = p.x + off;
      if (!n.leaf) n.children.forEach((c, i) => {
        const cp = pos.get(c);
        edges += `<line class="bt-link ${hot.has(n) && hot.has(c) ? `hot` : ``}" x1="${px + PAD / 2 + i * KW}" y1="${y + NH}" x2="${cp.x + off + cp.w / 2}" y2="${y + LH}"/>`;
      });
      if (n.leaf && n.next && pos.has(n.next)) edges += `<line class="bt-link sib" x1="${px + p.w}" y1="${y + NH / 2}" x2="${pos.get(n.next).x + off}" y2="${y + NH / 2}"/>`;
      const cls = `bt-node ${n.leaf ? `leaf` : ``} ${fresh.has(n) ? `new` : hot.has(n) ? `hot` : ``}`;
      nodes += `<rect class="${cls}" x="${px}" y="${y}" width="${p.w}" height="${NH}" rx="4"/>`;
      n.keys.forEach((k, j) => {
        if (j) nodes += `<line class="bt-sep" x1="${px + PAD / 2 + j * KW}" x2="${px + PAD / 2 + j * KW}" y1="${y + 3}" y2="${y + NH - 3}"/>`;
        nodes += `<text class="bt-key ${n.leaf && k === hitKey ? `hit` : ``}" x="${px + PAD / 2 + (j + 0.5) * KW}" y="${y + NH / 2}">${k}</text>`;
      });
      if (!n.keys.length) nodes += `<text class="bt-key muted" x="${px + p.w / 2}" y="${y + NH / 2}">empty</text>`;
    }));
    return svgWrap(width, height, edges + nodes);
  }
  D.btree = {
    title: `B+-Tree playground: lookups, splits and merges`,
    blurb: `A real B+-Tree with values in the leaves and separator keys in internal nodes. Insert keys until a leaf overflows and watch it <strong>split</strong> and promote a separator; keep going until the root splits and the tree grows a level. Delete keys to trigger <strong>redistribution</strong> from a sibling or a <strong>merge</strong>, and watch the root collapse. Splits and merges travel up using the breadcrumbs collected on the way down. Dashed lines are leaf sibling links.`,
    mount(el) {
      const st = { m: 3 };
      let root, order, hot = new Set(), fresh = new Set(), hitKey = null, log = [], splits = 0, merges = 0;
      const MIN = () => Math.floor(st.m / 2);
      const say = (cls, txt) => { log.unshift([cls, txt]); log = log.slice(0, 40); };
      const findLeaf = (key, trail) => { let n = root; while (!n.leaf) { trail.push(n); let i = 0; while (i < n.keys.length && key >= n.keys[i]) i++; n = n.children[i]; } trail.push(n); return n; };
      const fmtK = a => `[${a.join(` `)}]`;
      function insert(key, quiet) {
        const trail = [], leaf = findLeaf(key, trail);
        if (leaf.keys.includes(key)) { if (!quiet) say(`dup`, `${key} already present`); return false; }
        leaf.keys.push(key); leaf.keys.sort((a, b) => a - b);
        order.push(key);
        if (!quiet) say(`info`, `inserted ${key} into leaf ${fmtK(leaf.keys)}`);
        let node = leaf, depth = trail.length - 1;
        while (node.keys.length > st.m) {
          let sep, right;
          if (node.leaf) {
            const mid = Math.ceil(node.keys.length / 2);
            right = { leaf: true, keys: node.keys.splice(mid), next: node.next };
            node.next = right; sep = right.keys[0];
            if (!quiet) say(`bad`, `leaf overflow: split into ${fmtK(node.keys)} ${fmtK(right.keys)}, promote ${sep}`);
          } else {
            const mid = Math.floor(node.keys.length / 2);
            sep = node.keys[mid];
            right = { leaf: false, keys: node.keys.splice(mid + 1), children: node.children.splice(mid + 1) };
            node.keys.pop();
            if (!quiet) say(`bad`, `internal overflow: split into ${fmtK(node.keys)} ${fmtK(right.keys)}, push ${sep} up`);
          }
          splits++; fresh.add(right);
          const parent = trail[depth - 1];
          if (!parent) {
            root = { leaf: false, keys: [sep], children: [node, right] };
            fresh.add(root);
            if (!quiet) say(`ok`, `root split: new root [${sep}], height grows to ${height()}`);
            break;
          }
          const idx = parent.children.indexOf(node);
          parent.keys.splice(idx, 0, sep); parent.children.splice(idx + 1, 0, right);
          node = parent; depth--;
        }
        hot = new Set(trail); hitKey = key;
        return true;
      }
      function remove(key) {
        const trail = [], leaf = findLeaf(key, trail);
        hot = new Set(trail); hitKey = null;
        const i = leaf.keys.indexOf(key);
        if (i < 0) { say(`dup`, `${key} not found (searched ${trail.length} node${trail.length > 1 ? `s` : ``})`); return; }
        leaf.keys.splice(i, 1);
        order = order.filter(k => k !== key);
        say(`info`, `deleted ${key} from leaf ${fmtK(leaf.keys)}`);
        let node = leaf, depth = trail.length - 1;
        while (node !== root && node.keys.length < MIN()) {
          const parent = trail[depth - 1], idx = parent.children.indexOf(node);
          const left = idx > 0 ? parent.children[idx - 1] : null, right = idx < parent.children.length - 1 ? parent.children[idx + 1] : null;
          if (left && left.keys.length > MIN()) {
            if (node.leaf) { node.keys.unshift(left.keys.pop()); parent.keys[idx - 1] = node.keys[0]; }
            else { node.keys.unshift(parent.keys[idx - 1]); parent.keys[idx - 1] = left.keys.pop(); node.children.unshift(left.children.pop()); }
            say(`ok`, `underflow: borrowed from left sibling, separator is now ${parent.keys[idx - 1]}`);
            fresh.add(node); break;
          }
          if (right && right.keys.length > MIN()) {
            if (node.leaf) { node.keys.push(right.keys.shift()); parent.keys[idx] = right.keys[0]; }
            else { node.keys.push(parent.keys[idx]); parent.keys[idx] = right.keys.shift(); node.children.push(right.children.shift()); }
            say(`ok`, `underflow: borrowed from right sibling, separator is now ${parent.keys[idx]}`);
            fresh.add(node); break;
          }
          const [a, b, si] = left ? [left, node, idx - 1] : [node, right, idx];
          if (a.leaf) { a.keys.push(...b.keys); a.next = b.next; }
          else { a.keys.push(parent.keys[si], ...b.keys); a.children.push(...b.children); }
          parent.keys.splice(si, 1); parent.children.splice(si + 1, 1);
          merges++; fresh.add(a);
          say(`bad`, `underflow: merged into ${fmtK(a.keys)}, separator removed from parent`);
          node = parent; depth--;
        }
        if (!root.leaf && root.keys.length === 0) { root = root.children[0]; say(`ok`, `root has one child: it becomes the new root, height shrinks to ${height()}`); }
      }
      function lookup(key) {
        const trail = [], leaf = findLeaf(key, trail);
        hot = new Set(trail); fresh = new Set();
        const found = leaf.keys.includes(key);
        hitKey = found ? key : null;
        say(found ? `ok` : `dup`, `lookup ${key}: ${trail.map(n => fmtK(n.keys)).join(` → `)} ${found ? `found` : `not found`} (${trail.length} page reads)`);
      }
      const height = () => { let h = 1, n = root; while (!n.leaf) { n = n.children[0]; h++; } return h; };
      const allNodes = () => { const out = []; (function w(n) { out.push(n); if (!n.leaf) n.children.forEach(w); })(root); return out; };
      function rebuild(keys) {
        root = { leaf: true, keys: [], next: null }; order = []; splits = 0; merges = 0;
        keys.forEach(k => insert(k, true));
        hot = new Set(); fresh = new Set(); hitKey = null;
      }
      el.innerHTML = `
        <div class="ctl-row">${ctl(`max keys per node`, seg(`m`, [[3, `3`], [4, `4`], [5, `5`], [6, `6`]], st.m))}
          <input class="lab-input" data-k="key" type="number" placeholder="key" style="max-width:90px;min-width:70px">
          <button class="lab-btn" data-act="ins">Insert</button><button class="lab-btn ghost" data-act="del">Delete</button><button class="lab-btn ghost" data-act="find">Lookup</button></div>
        <div class="ctl-row"><button class="lab-btn ghost" data-act="rand">+ 3 random</button><button class="lab-btn ghost" data-act="seq">insert 1..15 in order</button><button class="lab-btn ghost" data-act="drand">delete random</button><button class="lab-btn ghost" data-act="reset">Reset</button></div>
        <div class="lab-panel"><div data-k="svg"></div><div class="stat-row" data-k="stats" style="margin-top:8px"></div></div>
        <div class="lab-grid even" style="margin-top:12px"><div class="lab-panel"><h4>Log (newest first)</h4><div class="log" data-k="log"></div></div><div data-k="note"></div></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const rnd = mulberry32(7);
      const draw = () => {
        q(`svg`).innerHTML = btDraw(root, hot, fresh, hitKey);
        const nodes = allNodes(), keys = order.length;
        const occ = nodes.length ? sum(nodes.map(n => n.keys.length)) / (nodes.length * st.m) : 0;
        q(`stats`).innerHTML = stat(`height`, height()) + stat(`nodes`, nodes.length) + stat(`keys`, keys) + stat(`avg occupancy`, pct(occ)) + stat(`splits`, splits, splits ? `bad` : ``) + stat(`merges`, merges);
        q(`log`).innerHTML = log.length ? log.map(([c, t]) => `<div class="${c}">${esc(t)}</div>`).join(``) : `<div class="info">Insert a key to begin.</div>`;
        q(`note`).innerHTML = note(`Each node holds at most <strong>${st.m}</strong> keys and (apart from the root) at least <strong>${MIN()}</strong>. Highlighted nodes are the root-to-leaf path of the last operation: one page read per level. Green outlines are nodes created or changed by a split, merge or redistribution. Try <em>insert 1..15 in order</em> on an empty tree: with half splits, every left node stays half empty because keys never go back there (Chapter 4's right-only append fixes that).`);
      };
      const val = () => { const v = parseInt(q(`key`).value, 10); return isNaN(v) ? null : clamp(v, 0, 999); };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`); if (!b) return;
        const a = b.dataset.act;
        fresh = new Set();
        if (a === `ins` || a === `del` || a === `find`) {
          const v = val();
          if (v === null) { say(`dup`, `enter a number first`); draw(); return; }
          if (a === `ins`) { if (order.length >= 60) say(`dup`, `limit of 60 keys reached`); else insert(v); }
          else if (a === `del`) remove(v); else lookup(v);
        } else if (a === `rand`) {
          for (let i = 0; i < 3 && order.length < 60; i++) { let v, tries = 0; do { v = 1 + Math.floor(rnd() * 99); tries++; } while (order.includes(v) && tries < 200); insert(v); }
        } else if (a === `seq`) {
          for (let v = 1; v <= 15 && order.length < 60; v++) if (!order.includes(v)) insert(v, true);
          say(`info`, `inserted 1..15 in ascending order (${splits} splits so far)`); hot = new Set(); fresh = new Set();
        } else if (a === `drand`) {
          if (order.length) remove(order[Math.floor(rnd() * order.length)]); else say(`dup`, `tree is empty`);
        } else if (a === `reset`) { rebuild([10, 20, 5, 6, 12, 30, 7, 17]); log = []; say(`info`, `reset to 10 20 5 6 12 30 7 17`); }
        draw();
      });
      q(`key`).addEventListener(`keydown`, e => { if (e.key === `Enter`) el.querySelector(`[data-act="ins"]`).click(); });
      wireSegs(el, st, () => { const keep = order.slice(); rebuild(keep); log = []; say(`info`, `rebuilt with max ${st.m} keys per node`); draw(); });
      rebuild([10, 20, 5, 6, 12, 30, 7, 17]);
      say(`info`, `inserted 10 20 5 6 12 30 7 17`);
      draw();
    }
  };

  // =====================================================================
  // Ch3 - Binary encoding: endianness, record layout, flags
  // =====================================================================
  D.byteEncoding = {
    title: `Binary encoding: endianness, records and bit flags`,
    blurb: `Three building blocks of every file format from Chapter 3. <strong>Endianness</strong>: the same integer as big- and little-endian bytes, and what you get if the reader assumes the wrong order. <strong>Records</strong>: the book's employee layout with fixed-size fields first, and length-prefixed (Pascal) vs null-terminated strings. <strong>Flags</strong>: packing booleans into one byte with bitmasks.`,
    mount(el) {
      const st = { view: `endian`, w: 4, enc: `pascal`, leaf: `on`, varsize: `off`, ovf: `on`, ntype: 2 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`view`, seg(`view`, [[`endian`, `endianness`], [`record`, `employee record`], [`flags`, `flags &amp; enums`]], st.view))}</div>
        <div data-k="ctl"></div>
        <div data-k="out"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      let inputs = { val: `0xAABBCCDD`, first: `Leslie`, last: `Knope` };
      const byteBox = (b, label, cls) => `<span class="byte ${cls || ``}">${typeof b === `number` ? hex2(b) : esc(b)}<small>${label}</small></span>`;
      const drawCtl = () => {
        let h = ``;
        if (st.view === `endian`) h = `<div class="ctl-row">${ctl(`value`, `<input class="lab-input" data-in="val" value="${esc(inputs.val)}" style="max-width:200px">`)}${ctl(`width`, seg(`w`, [[2, `16-bit`], [4, `32-bit`], [8, `64-bit`]], st.w))}</div>`;
        else if (st.view === `record`) h = `<div class="ctl-row">${ctl(`first_name`, `<input class="lab-input" data-in="first" value="${esc(inputs.first)}" style="max-width:140px;min-width:90px">`)}${ctl(`last_name`, `<input class="lab-input" data-in="last" value="${esc(inputs.last)}" style="max-width:140px;min-width:90px">`)}${ctl(`strings`, seg(`enc`, [[`pascal`, `length-prefixed`], [`cstr`, `null-terminated`]], st.enc))}</div>`;
        else h = `<div class="ctl-row">${ctl(`IS_LEAF`, seg(`leaf`, [[`on`, `1`], [`off`, `0`]], st.leaf))}${ctl(`VARIABLE_SIZE_VALUES`, seg(`varsize`, [[`on`, `1`], [`off`, `0`]], st.varsize))}${ctl(`HAS_OVERFLOW_PAGES`, seg(`ovf`, [[`on`, `1`], [`off`, `0`]], st.ovf))}</div><div class="ctl-row">${ctl(`enum NodeType`, seg(`ntype`, [[0, `ROOT`], [1, `INTERNAL`], [2, `LEAF`]], st.ntype))}</div>`;
        q(`ctl`).innerHTML = h;
        wireSegs(q(`ctl`), st, draw);
        q(`ctl`).querySelectorAll(`[data-in]`).forEach(inp => inp.addEventListener(`input`, () => { inputs[inp.dataset.in] = inp.value; draw(); }));
      };
      const draw = () => {
        let h = ``;
        if (st.view === `endian`) {
          let v;
          try { const s = inputs.val.trim().replace(/_/g, ``); v = BigInt(s.length ? s : `0`); if (v < 0n) throw 0; } catch (e) { v = null; }
          if (v === null) { q(`out`).innerHTML = note(`Enter a non-negative integer in decimal or hex (0x...).`, `warn`); return; }
          const bits = BigInt(8 * st.w), mask = (1n << bits) - 1n, trunc = v > mask;
          v &= mask;
          const be = []; for (let i = 0; i < st.w; i++) be.push(Number((v >> BigInt(8 * (st.w - 1 - i))) & 0xFFn));
          const le = be.slice().reverse();
          const sig = i => `c${i % 6}`;
          const wrong = le.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
          const hx = x => `0x` + x.toString(16).toUpperCase().padStart(st.w * 2, `0`);
          h = `<div class="lab-grid even">
            <div class="lab-panel"><h4>Big-endian (most significant byte first)</h4><div class="bytes">${be.map((b, i) => byteBox(b, `+` + i, sig(i))).join(``)}</div></div>
            <div class="lab-panel"><h4>Little-endian (least significant byte first)</h4><div class="bytes">${le.map((b, i) => byteBox(b, `+` + i, sig(st.w - 1 - i))).join(``)}</div></div>
          </div>
          <div class="stat-row" style="margin-top:10px">${stat(`value`, hx(v))}${stat(`decimal`, v.toString())}${stat(`little-endian bytes read as big-endian`, hx(wrong), wrong === v ? `good` : `bad`)}</div>
          ${note(`Same colour = same byte. ${trunc ? `The value didn't fit and was truncated to ${st.w * 8} bits. ` : ``}${wrong === v ? `This value is a byte palindrome, so the order doesn't matter.` : `A reader that assumes the wrong byte order decodes <strong>${hx(wrong)}</strong> instead of ${hx(v)}.`} Formats must fix one order; RocksDB, for example, detects the platform's byte order and converts.`, wrong === v ? `` : `warn`)}`;
        } else if (st.view === `record`) {
          const enc = s => Array.from(s.slice(0, 24)).map(c => c.charCodeAt(0) & 0xFF);
          const f = enc(inputs.first), l = enc(inputs.last);
          const u16 = n => [(n >> 8) & 0xFF, n & 0xFF];
          const fields = [
            [`employee_id`, [0, 0, 0, 42], 0], [`tax_number`, [0x00, 0x12, 0xD6, 0x87], 1], [`date`, [1, 8, 81], 2], [`gender`, [0x01], 3]
          ];
          if (st.enc === `pascal`) fields.push([`first_name_length`, u16(f.length), 4], [`last_name_length`, u16(l.length), 4], [`first_name`, f, 5], [`last_name`, l, 1]);
          else fields.push([`first_name`, f.concat([0]), 5], [`last_name`, l.concat([0]), 1]);
          let off = 0; const rows = [];
          const boxes = fields.map(([name, bytes, c]) => { const start = off; off += bytes.length; rows.push([name, bytes.length, start, c]); return bytes.map((b, i) => byteBox(name.endsWith(`name`) && b ? String.fromCharCode(b) : b, start + i, `c${c}` + (b === 0 && st.enc === `cstr` && name.endsWith(`name`) && i === bytes.length - 1 ? ` hot` : ``))).join(``); }).join(``);
          const lastOff = rows.find(r => r[0] === `last_name`)[2];
          const scan = st.enc === `pascal` ? 0 : f.length + 1;
          h = `<div class="lab-panel"><h4>Encoded record (${off} bytes)</h4><div class="bytes">${boxes}</div></div>
          <div class="lab-grid even" style="margin-top:12px">
            <div class="lab-panel"><h4>Layout</h4><table class="mini-table"><tr><th>field</th><th class="num">size</th><th class="num">offset</th></tr>${rows.map(r => `<tr><td><span class="tok c${r[3]}" style="padding:1px 5px">${r[0]}</span></td><td class="num">${r[1]}</td><td class="num">${r[2]}</td></tr>`).join(``)}</table></div>
            <div class="lab-panel"><h4>Finding last_name</h4>${st.enc === `pascal`
              ? `<div class="stat-row">${stat(`bytes scanned`, 0, `good`)}${stat(`offset`, `16 + ${f.length} = ${lastOff}`)}</div><p style="font-size:12.5px;margin-top:8px">Read first_name_length from the fixed area (offset 12) and jump: offset = 16 + first_name_length. Length is known without scanning.</p>`
              : `<div class="stat-row">${stat(`bytes scanned`, scan, `bad`)}${stat(`offset`, lastOff)}</div><p style="font-size:12.5px;margin-top:8px">No lengths are stored, so the reader scans first_name byte by byte until the 00 terminator. Strings also can't contain a zero byte.</p>`}</div>
          </div>
          ${note(`The book's layout puts fixed-size fields first (employee_id 4 B, tax_number 4 B, date 3 B, gender 1 B, two 2-byte lengths), so every field is reachable with arithmetic. Variable-size fields follow. Names are trimmed to 24 characters here.`)}`;
        } else {
          const flags = (st.leaf === `on` ? 1 : 0) | (st.varsize === `on` ? 2 : 0) | (st.ovf === `on` ? 4 : 0);
          const bitsHtml = [7, 6, 5, 4, 3, 2, 1, 0].map(b => byteBox((flags >> b) & 1 ? `1` : `0`, `bit ` + b, b < 3 ? `c${[0, 1, 2][b]}` + ((flags >> b) & 1 ? ` hot` : ``) : `dim`)).join(``);
          const code = [`int IS_LEAF_MASK         = 0x01; // bit #1`, `int VARIABLE_SIZE_VALUES = 0x02; // bit #2`, `int HAS_OVERFLOW_PAGES   = 0x04; // bit #3`, ``, `flags = 0x${hex2(flags)};  // ${flags.toString(2).padStart(8, `0`)}b`, ``,
            st.ovf === `on` ? `flags |= HAS_OVERFLOW_PAGES;    // set` : `flags &= ~HAS_OVERFLOW_PAGES;   // unset`,
            `(flags & IS_LEAF_MASK) != 0          -> ${(flags & 1) !== 0}`, `(flags & VARIABLE_SIZE_VALUES) != 0  -> ${(flags & 2) !== 0}`, `(flags & HAS_OVERFLOW_PAGES) != 0    -> ${(flags & 4) !== 0}`].join(`\n`);
          const names = [`ROOT`, `INTERNAL`, `LEAF`];
          h = `<div class="lab-grid even">
            <div class="lab-panel"><h4>flags byte</h4><div class="bytes">${bitsHtml}</div><div class="stat-row" style="margin-top:10px">${stat(`hex`, `0x` + hex2(flags))}${stat(`decimal`, flags)}</div></div>
            <div class="lab-panel"><h4>Bitmask operations</h4>${pblock(`ctx`, `C-style`, code)}</div>
          </div>
          <div class="lab-panel" style="margin-top:12px"><h4>enum NodeType (mutually exclusive)</h4><div class="bytes">${byteBox(st.ntype, names[st.ntype], `c3 hot`)}</div></div>
          ${note(`Flags are <strong>not</strong> mutually exclusive, so each gets its own power-of-two bit and many fit in one byte. Enums are mutually exclusive values (ROOT 0x00, INTERNAL 0x01, LEAF 0x02), so a small integer is enough. Both keep page headers tiny.`)}`;
        }
        q(`out`).innerHTML = h;
      };
      wireSegs(el.querySelector(`.ctl-row`), st, () => { drawCtl(); draw(); });
      drawCtl(); draw();
    }
  };

  // =====================================================================
  // Ch3 - Slotted page
  // =====================================================================
  const SP_PAGE = 512, SP_HDR = 24, SP_SLOT = 2;
  const SP_NAMES = [[`Tom`, 40], [`Leslie`, 56], [`Ron`, 32], [`Ann`, 24], [`Ben`, 48], [`April`, 64], [`Andy`, 36], [`Donna`, 52], [`Jerry`, 28], [`Chris`, 44], [`Garry`, 30], [`Craig`, 60]];
  const spSize = (name, payload) => 4 + name.length + payload;
  D.slottedPage = {
    title: `Slotted page: offsets, cells, freelist and defragmentation`,
    blurb: `A 512-byte slotted page: a header, an <strong>offset array</strong> growing from the start and <strong>cells</strong> growing from the end. As in the book, Tom, Leslie and Ron are appended in insertion order while the offset array stays sorted by key. Delete cells to put their space on the <strong>availability list</strong>, then insert with <strong>first fit</strong> or <strong>best fit</strong>. When enough bytes are free but none are contiguous, the page must be <strong>defragmented</strong>; when even that won't help, it needs an overflow page or a split.`,
    mount(el) {
      const st = { fit: `first`, auto: `on` };
      let cells, free, cellTop, nextI, log, lastHot;
      const say = (cls, t) => { log.unshift([cls, t]); log = log.slice(0, 30); };
      const gap = () => cellTop - (SP_HDR + SP_SLOT * cells.length);
      const sorted = () => cells.slice().sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      function coalesce() {
        free.sort((a, b) => a.off - b.off);
        for (let i = 0; i < free.length - 1; i++) if (free[i].off + free[i].size === free[i + 1].off) { free[i].size += free[i + 1].size; free.splice(i + 1, 1); i--; }
        let changed = true;
        while (changed) { changed = false; const f = free.find(s => s.off === cellTop); if (f) { cellTop += f.size; free = free.filter(s => s !== f); changed = true; } }
      }
      function defrag(quiet) {
        let top = SP_PAGE;
        cells.slice().sort((a, b) => b.off - a.off).forEach(c => { top -= c.size; c.off = top; });
        cellTop = top; free = [];
        if (!quiet) say(`ok`, `defragmented: live cells rewritten contiguously, ${gap()} B contiguous free`);
      }
      function insert(name, payload) {
        const size = spSize(name, payload);
        if (cells.some(c => c.name === name)) { say(`dup`, `${name} is already on the page`); return false; }
        let seg = null;
        if (free.length && gap() >= SP_SLOT) {
          const fits = free.filter(s => s.size >= size);
          if (fits.length) seg = st.fit === `first` ? fits[0] : fits.reduce((a, b) => b.size - size < a.size - size ? b : a);
        }
        if (seg) {
          const c = { name, size, off: seg.off };
          say(`ok`, `${name} (${size} B) → ${st.fit} fit: reused freed segment @${seg.off} (${seg.size} B), ${seg.size - size} B left over`);
          seg.off += size; seg.size -= size; if (!seg.size) free = free.filter(s => s !== seg);
          cells.push(c); lastHot = c; return true;
        }
        if (gap() >= size + SP_SLOT) {
          cellTop -= size; const c = { name, size, off: cellTop }; cells.push(c); lastHot = c;
          say(`ok`, `${name} (${size} B) appended at @${cellTop}; offset array now ${cells.length} slots`);
          return true;
        }
        const total = gap() + sum(free.map(s => s.size));
        if (total >= size + SP_SLOT) {
          if (st.auto === `on`) { say(`dup`, `${name} (${size} B): ${total} B free in total but fragmented, defragmenting first`); defrag(); return insert(name, payload); }
          say(`bad`, `${name} (${size} B): ${total} B free in total, but no contiguous region. Defragment the page.`); return false;
        }
        say(`bad`, `${name} (${size} B): page full (${total} B free). Needs an overflow page or a node split.`); return false;
      }
      function del(name) {
        const c = cells.find(x => x.name === name); if (!c) return;
        cells = cells.filter(x => x !== c);
        if (c.off === cellTop) { cellTop += c.size; say(`info`, `deleted ${name}: it was the lowest cell, so its ${c.size} B rejoin the contiguous free space`); }
        else { free.push({ off: c.off, size: c.size }); say(`info`, `deleted ${name}: slot removed, ${c.size} B @${c.off} added to the availability list`); }
        coalesce(); lastHot = null;
      }
      function search(key) {
        const s = sorted(); let lo = 0, hi = s.length - 1, steps = [];
        while (lo <= hi) {
          const mid = (lo + hi) >> 1, c = s[mid];
          if (c.name === key) { steps.push(`slot ${mid} → @${c.off} "${c.name}" = found`); lastHot = c; say(`ok`, `search "${key}": ${steps.join(`; `)}`); return; }
          if (c.name < key) { steps.push(`slot ${mid} → @${c.off} "${c.name}" < key, go right`); lo = mid + 1; }
          else { steps.push(`slot ${mid} → @${c.off} "${c.name}" > key, go left`); hi = mid - 1; }
        }
        say(`dup`, `search "${key}": ${steps.join(`; `) || `empty page`}; not found, insertion point = slot ${lo}`);
      }
      function reset() { cells = []; free = []; cellTop = SP_PAGE; nextI = 0; log = []; lastHot = null; [0, 1, 2].forEach(i => insert(...SP_NAMES[i])); nextI = 3; }
      function fragDemo() {
        cells = []; free = []; cellTop = SP_PAGE; log = []; lastHot = null;
        [[`Tom`, 40], [`Ron`, 32], [`Ann`, 24], [`Leslie`, 56], [`Ben`, 48], [`April`, 64]].forEach(n => insert(...n));
        del(`Leslie`); del(`Ron`); nextI = 8; lastHot = null;
        say(`info`, `fragmentation demo: Leslie (66 B @329) and Ron (39 B @426) freed; next insert is Jerry (37 B). First fit takes Leslie's hole, best fit takes Ron's.`);
      }
      el.innerHTML = `
        <div class="ctl-row">${ctl(`placement`, seg(`fit`, [[`first`, `first fit`], [`best`, `best fit`]], st.fit))}${ctl(`defragment when needed`, seg(`auto`, [[`on`, `auto`], [`off`, `manual`]], st.auto))}</div>
        <div class="ctl-row"><button class="lab-btn" data-act="ins">Insert next</button><button class="lab-btn ghost" data-act="defrag">Defragment</button><button class="lab-btn ghost" data-act="frag">Fragmentation demo</button><button class="lab-btn ghost" data-act="reset">Reset (Tom, Leslie, Ron)</button>
          <input class="lab-input" data-k="key" placeholder="name to search" style="max-width:150px;min-width:110px"><button class="lab-btn ghost" data-act="find">Binary search</button></div>
        <div class="lab-panel"><h4>Page bytes 0-${SP_PAGE}</h4><div class="pagebar" data-k="bar"></div><div class="pg-axis"><span>0</span><span>header · offsets →</span><span>free</span><span>← cells</span><span>${SP_PAGE}</span></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        <div class="lab-grid three" style="margin-top:12px">
          <div class="lab-panel"><h4>Offset array (sorted by key)</h4><div data-k="slots"></div></div>
          <div class="lab-panel"><h4>Cells (physical order)</h4><div data-k="cells"></div></div>
          <div class="lab-panel"><h4>Availability list</h4><div data-k="free"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>Log (newest first)</h4><div class="log" data-k="log"></div></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const P = v => (v / SP_PAGE * 100) + `%`;
        let bar = `<div class="pg hdr" style="left:0;width:${P(SP_HDR)}" title="header ${SP_HDR} B">hdr</div>`;
        const offEnd = SP_HDR + SP_SLOT * cells.length;
        if (cells.length) bar += `<div class="pg off" style="left:${P(SP_HDR)};width:${P(offEnd - SP_HDR)}" title="offset array">${cells.length}</div>`;
        bar += `<div class="pg free" style="left:${P(offEnd)};width:${P(cellTop - offEnd)}">${gap()} B free</div>`;
        free.forEach(s => { bar += `<div class="pg dead" style="left:${P(s.off)};width:${P(s.size)}" title="free segment @${s.off}, ${s.size} B">${s.size}</div>`; });
        cells.forEach(c => { bar += `<div class="pg cell ${c === lastHot ? `hot` : ``}" style="left:${P(c.off)};width:${P(c.size)}" title="${c.name}: @${c.off}, ${c.size} B">${c.name}</div>`; });
        q(`bar`).innerHTML = bar;
        const used = sum(cells.map(c => c.size)), fl = sum(free.map(s => s.size));
        q(`stats`).innerHTML = stat(`cells`, cells.length) + stat(`cell bytes`, used) + stat(`contiguous free`, gap() + ` B`, gap() < 40 ? `bad` : ``) + stat(`on availability list`, fl + ` B / ${free.length} seg`) + stat(`next insert`, SP_NAMES[nextI % SP_NAMES.length][0] + ` (${spSize(...SP_NAMES[nextI % SP_NAMES.length])} B)`);
        q(`slots`).innerHTML = cells.length ? `<table class="mini-table"><tr><th>slot</th><th class="num">offset</th><th>key</th></tr>${sorted().map((c, i) => `<tr class="${c === lastHot ? `new` : ``}"><td>${i}</td><td class="num">@${c.off}</td><td>${c.name}</td></tr>`).join(``)}</table>` : `<div class="cs-note">empty</div>`;
        q(`cells`).innerHTML = cells.length ? `<table class="mini-table"><tr><th>cell</th><th class="num">@</th><th class="num">size</th><th></th></tr>${cells.slice().sort((a, b) => b.off - a.off).map(c => `<tr class="${c === lastHot ? `new` : ``}"><td>${c.name}</td><td class="num">${c.off}</td><td class="num">${c.size}</td><td><button class="lab-btn ghost" style="padding:1px 8px;font-size:11px" data-del="${c.name}">delete</button></td></tr>`).join(``)}</table>` : `<div class="cs-note">empty</div>`;
        q(`free`).innerHTML = free.length ? `<table class="mini-table"><tr><th>#</th><th class="num">offset</th><th class="num">size</th></tr>${free.map((s, i) => `<tr><td>${i}</td><td class="num">@${s.off}</td><td class="num">${s.size}</td></tr>`).join(``)}</table>` : `<div class="cs-note">No freed segments. Delete a cell that isn't the lowest one to create a hole.</div>`;
        q(`log`).innerHTML = log.map(([c, t]) => `<div class="${c}">${esc(t)}</div>`).join(``);
      };
      el.addEventListener(`click`, e => {
        const d = e.target.closest(`[data-del]`);
        if (d) { del(d.dataset.del); draw(); return; }
        const b = e.target.closest(`[data-act]`); if (!b) return;
        const a = b.dataset.act;
        if (a === `ins`) { const n = SP_NAMES[nextI % SP_NAMES.length]; if (insert(...n) || cells.some(c => c.name === n[0])) nextI++; }
        else if (a === `defrag`) defrag();
        else if (a === `frag`) fragDemo();
        else if (a === `reset`) reset();
        else if (a === `find`) { const v = q(`key`).value.trim(); if (v) search(v); else say(`dup`, `type a name to search for`); }
        draw();
      });
      wireSegs(el, st, draw);
      reset(); draw();
    }
  };

  // =====================================================================
  // Ch3 - Checksums vs CRC
  // =====================================================================
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = bytes => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const CK_METHODS = {
    sum: [`16-bit sum`, b => sum(Array.from(b)) & 0xFFFF, v => `0x` + v.toString(16).toUpperCase().padStart(4, `0`)],
    xor: [`XOR parity`, b => Array.from(b).reduce((a, x) => a ^ x, 0), v => `0x` + hex2(v)],
    crc: [`CRC-32`, crc32, v => `0x` + v.toString(16).toUpperCase().padStart(8, `0`)]
  };
  const CK_PATTERNS = {
    bit1: `one bit flipped`, bit2: `two bits, same position`, swap: `two bytes swapped`, burst: `burst of bits`, zero: `torn write (tail zeroed)`
  };
  function ckCorrupt(page, pat, burst, rnd, worst) {
    const b = Uint8Array.from(page), n = b.length, changed = new Set();
    const ri = m => Math.floor(rnd() * m);
    if (pat === `bit1`) { const i = ri(n); b[i] ^= 1 << ri(8); changed.add(i); }
    else if (pat === `bit2`) {
      const bit = ri(8); let i = ri(n), j = (i + 1 + ri(n - 1)) % n;
      if (worst) { for (let t = 0; t < 64; t++) { const a = ri(n), c = ri(n); if (a !== c && !((b[a] >> bit) & 1) && ((b[c] >> bit) & 1)) { i = a; j = c; break; } } }
      b[i] ^= 1 << bit; b[j] ^= 1 << bit; changed.add(i); changed.add(j);
    } else if (pat === `swap`) {
      let i = ri(n), j = ri(n), t = 0; while ((i === j || b[i] === b[j]) && t++ < 64) { i = ri(n); j = ri(n); }
      [b[i], b[j]] = [b[j], b[i]]; changed.add(i); changed.add(j);
    } else if (pat === `burst`) {
      const L = Math.min(burst, n * 8), start = ri(n * 8 - L + 1);
      for (let p = start; p < start + L; p++) { b[p >> 3] ^= 1 << (7 - (p & 7)); changed.add(p >> 3); }
    } else if (pat === `zero`) { for (let i = n - 4; i < n; i++) { if (b[i]) changed.add(i); b[i] = 0; } }
    return { bytes: b, changed };
  }
  D.checksum = {
    title: `Detecting page corruption: sum vs XOR vs CRC`,
    blurb: `A 16-byte page with three integrity checks stored in its header. Corrupt it in different ways and see which check notices. Simple sums and XOR miss whole classes of errors (swapped bytes, bits that cancel out); a <strong>CRC</strong> is designed to catch <strong>burst errors</strong> and is what databases store per page. Run 2,000 random trials to see detection rates.`,
    mount(el) {
      const st = { pat: `bit2`, burst: 12 };
      let seed = 3, page, trials = null;
      const newPage = () => { const r = mulberry32(seed * 7919); page = Uint8Array.from({ length: 16 }, () => Math.floor(r() * 256)); };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`corruption`, seg(`pat`, Object.keys(CK_PATTERNS).map(k => [k, CK_PATTERNS[k]]), st.pat))}</div>
        <div class="ctl-row">${ctl(`burst length (bits)`, rng(`burst`, 2, 48, 1, st.burst))}<button class="lab-btn ghost" data-act="again">New corruption</button><button class="lab-btn ghost" data-act="page">New page</button><button class="lab-btn" data-act="trials">Run 2,000 trials</button></div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Page as written</h4><div class="bytes" data-k="orig"></div><h4 style="margin-top:12px">Page as read back</h4><div class="bytes" data-k="bad"></div></div>
          <div class="lab-panel"><h4>Stored vs recomputed</h4><div data-k="tbl"></div><div data-k="trials" style="margin-top:12px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const rnd = mulberry32(seed * 104729 + st.burst);
        const { bytes, changed } = ckCorrupt(page, st.pat, st.burst, rnd, true);
        q(`orig`).innerHTML = Array.from(page).map((b, i) => `<span class="byte">${hex2(b)}<small>${i}</small></span>`).join(``);
        q(`bad`).innerHTML = Array.from(bytes).map((b, i) => `<span class="byte ${changed.has(i) ? `bad` : ``}">${hex2(b)}<small>${changed.has(i) ? hex2(page[i]) : i}</small></span>`).join(``);
        const res = Object.keys(CK_METHODS).map(k => { const [label, f, fmt] = CK_METHODS[k]; const a = f(page), b = f(bytes); return { k, label, a: fmt(a), b: fmt(b), det: a !== b }; });
        const corrupted = Array.from(bytes).some((b, i) => b !== page[i]);
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>check</th><th>stored</th><th>recomputed</th><th></th></tr>${res.map(r => `<tr><td>${r.label}</td><td>${r.a}</td><td>${r.b}</td><td>${!corrupted ? chip(`muted`, `no change`) : r.det ? chip(`ok`, `detected`) : chip(`no`, `missed`)}</td></tr>`).join(``)}</table>`;
        q(`trials`).innerHTML = trials && trials.pat === st.pat && trials.burst === st.burst ? `<h4>Detection rate over 2,000 random ${CK_PATTERNS[st.pat]} corruptions</h4>` + hbars(Object.keys(CK_METHODS).map(k => ({ label: CK_METHODS[k][0], value: trials[k], max: 1, text: pct(trials[k], 1), cls: trials[k] > 0.999 ? `good` : trials[k] < 0.5 ? `bad` : `warn` })), 1) : `<div class="cs-note">Run the trials to measure each check on random pages.</div>`;
        const N = {
          bit1: `Any single flipped bit changes the sum, the parity and the CRC. Every check catches it.`,
          bit2: `Two flips in the same bit position of different bytes cancel out in <strong>XOR</strong> every time. If one bit goes 0→1 and the other 1→0 (shown here), the <strong>sum</strong> cancels too. CRC catches it.`,
          swap: `Reordering bytes (for example, a misdirected or misaligned write) leaves the sum and the XOR unchanged, because both ignore position. CRC depends on the order of bytes and catches it.`,
          burst: `${st.burst} consecutive bits flipped. CRC-32 is guaranteed to detect any burst up to 32 bits${st.burst > 32 ? `; longer bursts slip through only with probability about 2<sup>-32</sup>` : ``}. This is why the book recommends CRCs for pages.`,
          zero: `The last 4 bytes were never written (a torn write). Most checks catch it, but only the CRC does so reliably regardless of the data.`
        };
        q(`note`).innerHTML = note(N[st.pat] + ` Checksums detect accidental corruption; they don't protect against tampering.`, st.pat === `bit1` ? `good` : `warn`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`); if (!b) return;
        if (b.dataset.act === `again`) seed++;
        else if (b.dataset.act === `page`) { seed += 13; newPage(); }
        else if (b.dataset.act === `trials`) {
          const r = mulberry32(seed * 31 + 5), cnt = { sum: 0, xor: 0, crc: 0 }; let n = 0;
          for (let t = 0; t < 2000; t++) {
            const pg = Uint8Array.from({ length: 16 }, () => Math.floor(r() * 256));
            const { bytes } = ckCorrupt(pg, st.pat, st.burst, r, false);
            if (bytes.every((x, i) => x === pg[i])) continue;
            n++; Object.keys(CK_METHODS).forEach(k => { if (CK_METHODS[k][1](pg) !== CK_METHODS[k][1](bytes)) cnt[k]++; });
          }
          trials = { pat: st.pat, burst: st.burst, sum: n ? cnt.sum / n : 1, xor: n ? cnt.xor / n : 1, crc: n ? cnt.crc / n : 1 };
        }
        draw();
      });
      wireSegs(el, st, draw);
      wireRanges(el, st, { burst: v => v + ` bits` }, draw);
      newPage(); draw();
    }
  };

  // =====================================================================
  // Ch4 - Split policies and occupancy
  // =====================================================================
  function ffSimulate(cap, N, ord, policy, ff) {
    let keys = Array.from({ length: N }, (_, i) => i + 1);
    if (ord === `rand`) { const r = mulberry32(42); for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; } }
    else if (ord === `rev`) keys.reverse();
    let splits = 0, moves = 0;
    if (policy === `bulk`) {
      const per = Math.max(1, Math.floor(cap * ff / 100)), leaves = [];
      for (let i = 0; i < N; i += per) leaves.push(Array.from({ length: Math.min(per, N - i) }, (_, j) => i + j + 1));
      return { leaves, splits: 0, moves: 0 };
    }
    const leaves = [[]];
    const find = k => { let lo = 0, hi = leaves.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (leaves[mid][0] <= k) lo = mid; else hi = mid - 1; } return lo; };
    const half = i => { const l = leaves[i], mid = Math.ceil(l.length / 2); leaves.splice(i + 1, 0, l.splice(mid)); splits++; };
    for (const k of keys) {
      const i = find(k), leaf = leaves[i];
      let p = leaf.length; while (p > 0 && leaf[p - 1] > k) p--;
      leaf.splice(p, 0, k);
      if (leaf.length <= cap) continue;
      if (policy === `half`) half(i);
      else if (policy === `right`) {
        if (i === leaves.length - 1 && p === leaf.length - 1) { leaf.pop(); leaves.push([k]); splits++; }
        else half(i);
      } else if (policy === `bstar`) {
        const L = leaves[i - 1], R = leaves[i + 1];
        if (L && L.length < cap) { L.push(leaf.shift()); moves++; }
        else if (R && R.length < cap) { R.unshift(leaf.pop()); moves++; }
        else if (R || L) {
          const j = R ? i : i - 1, all = leaves[j].concat(leaves[j + 1]), a = Math.ceil(all.length / 3), b = Math.ceil((all.length - a) / 2);
          leaves.splice(j, 2, all.slice(0, a), all.slice(a, a + b), all.slice(a + b)); splits++;
        } else half(i);
      }
    }
    return { leaves, splits, moves };
  }
  const FF_POL = { half: `half split`, bstar: `B* rebalancing`, right: `right-only append`, bulk: `bulk load` };
  D.fillFactor = {
    title: `Split policies: how full do B-Tree pages end up?`,
    blurb: `Insert N keys into the leaf level of a B-Tree and measure <strong>occupancy</strong>. A plain <strong>half split</strong> leaves sequential inserts at ~50% (left pages never receive keys again) and random ones around 70%. <strong>B* rebalancing</strong> shifts keys to siblings and splits two pages into three. <strong>Right-only append</strong> (PostgreSQL fastpath, SQLite quickbalance) starts an empty page instead of splitting when appending at the far right. <strong>Bulk loading</strong> writes presorted data bottom-up with no splits at all.`,
    mount(el) {
      const st = { cap: 8, N: 600, ord: `seq`, pol: `half`, ff: 100 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`keys per leaf`, seg(`cap`, [[4, `4`], [8, `8`], [16, `16`], [32, `32`]], st.cap))}${ctl(`insert order`, seg(`ord`, [[`seq`, `sequential`], [`rand`, `random`], [`rev`, `reverse`]], st.ord))}</div>
        <div class="ctl-row">${ctl(`policy`, seg(`pol`, Object.keys(FF_POL).map(k => [k, FF_POL[k]]), st.pol))}</div>
        <div class="ctl-row">${ctl(`keys inserted`, rng(`N`, 50, 2000, 50, st.N))}${ctl(`bulk fill factor`, rng(`ff`, 50, 100, 5, st.ff))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Leaf occupancy (first leaves, left to right)</h4><div data-k="strip"></div><h4 style="margin-top:10px">Distribution</h4><div data-k="hist"></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div><h4 style="margin-top:12px">All policies, same inserts</h4><div data-k="cmp"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const height = (leaves, cap) => { let n = leaves, h = 1; while (n > 1) { n = Math.ceil(n / (cap + 1)); h++; } return h; };
      const draw = () => {
        const R = ffSimulate(st.cap, st.N, st.ord, st.pol, st.ff);
        const occ = R.leaves.map(l => l.length / st.cap), avg = sum(occ) / occ.length;
        const show = occ.slice(0, 80), bw = 480 / Math.max(show.length, 20);
        let s = `<line class="svg-grid" x1="0" x2="480" y1="${70 - 0.5 * 64}" y2="${70 - 0.5 * 64}"/>`;
        show.forEach((o, i) => { s += `<rect class="${o >= 0.99 ? `svg-bar` : o < 0.6 ? `svg-bar3` : `svg-bar`}" style="${o < 0.99 && o >= 0.6 ? `opacity:.7` : ``}" x="${i * bw + 1}" y="${70 - o * 64}" width="${Math.max(1, bw - 2)}" height="${o * 64}"/>`; });
        s += `<text class="svg-label" x="482" y="${70 - 0.5 * 64 + 3}" text-anchor="start" style="font-size:9px">50%</text>`;
        q(`strip`).innerHTML = svgWrap(510, 74, s);
        const bins = Array(10).fill(0); occ.forEach(o => bins[Math.min(9, Math.floor(o * 10 - 1e-9))]++);
        q(`hist`).innerHTML = hbars(bins.map((c, i) => ({ label: `${i * 10 + 1}-${(i + 1) * 10}%`, value: c, text: c, dim: !c, cls: i >= 8 ? `good` : i < 5 ? `warn` : `` })));
        q(`stats`).innerHTML = stat(`leaves`, R.leaves.length) + stat(`avg occupancy`, pct(avg), avg > 0.85 ? `good` : avg < 0.6 ? `bad` : ``) + stat(`splits`, R.splits) + stat(`keys moved to siblings`, R.moves) + stat(`tree height`, height(R.leaves.length, st.cap));
        q(`cmp`).innerHTML = hbars(Object.keys(FF_POL).map(p => { const r = ffSimulate(st.cap, st.N, st.ord, p, st.ff); const a = r.leaves.length ? st.N / (r.leaves.length * st.cap) : 0; return { label: FF_POL[p], value: a, max: 1, text: pct(a) + ` · ${r.leaves.length}`, cls: p === st.pol ? `good` : `muted` }; }), 1);
        let n;
        if (st.pol === `bulk`) n = `Bulk loading sorts first, so insert order doesn't matter: leaves are written ${st.ff}% full with zero splits, sequentially. Leaving some free space (fill factor below 100%) absorbs future inserts without immediate splits.`;
        else if (st.pol === `right` && st.ord === `seq`) n = `Every key goes past the end of the rightmost leaf, so instead of splitting it in half, a fresh page is started and the full one stays full: ~100% occupancy. This is PostgreSQL's fastpath / SQLite's quickbalance.`;
        else if (st.pol === `right`) n = `Right-only append only helps when keys arrive in increasing order. With ${st.ord === `rand` ? `random` : `reverse`} keys it falls back to ordinary half splits.`;
        else if (st.pol === `half` && st.ord !== `rand`) n = `${st.ord === `seq` ? `Ascending` : `Descending`} keys always hit the same edge leaf. Each half split leaves a half-full page behind that never receives another key: occupancy sticks at ${pct(avg)}${avg > 0.52 ? ` (just above half, because a split of ${st.cap + 1} keys can't divide evenly and the larger half stays behind; bigger pages get closer to 50%)` : ``}, nearly doubling the page count.`;
        else if (st.pol === `bstar`) n = `B* rebalancing moves keys into a sibling with room, and when both are full splits two pages into three (each ~2/3 full). Occupancy improves at the cost of touching more pages per insert.`;
        else n = `Random inserts spread over all leaves; half-split pages fill up again before splitting, so occupancy settles around 70% (a classic result of B-Tree analysis).`;
        q(`note`).innerHTML = note(n, avg > 0.85 ? `good` : avg < 0.6 ? `warn` : ``);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { N: v => v, ff: v => v + `%` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch4 - Overflow pages
  // =====================================================================
  const OV_HDR = 16;
  D.overflowPages = {
    title: `Overflow pages and max_payload_size`,
    blurb: `To guarantee that a node always fits its fanout, a B-Tree stores at most <strong>max_payload_size = node size / fanout</strong> bytes of a record inline and spills the rest into a chain of linked <strong>overflow pages</strong>. Grow the record and watch the chain lengthen. Keys stay in the primary page, so searching doesn't need the overflow pages, but reading the full value does.`,
    mount(el) {
      const st = { page: 4096, fan: 16, p: 30 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`page size`, seg(`page`, [[4096, `4 KB`], [8192, `8 KB`], [16384, `16 KB`]], st.page))}${ctl(`fanout (records per node)`, rng(`fan`, 4, 64, 4, st.fan))}</div>
        <div class="ctl-row">${ctl(`record payload`, rng(`p`, 10, 50, 1, st.p))}</div>
        <div class="lab-panel"><h4>Primary page and overflow chain</h4><div data-k="svg"></div><div class="stat-row" data-k="stats" style="margin-top:8px"></div></div>
        <div class="lab-grid even" style="margin-top:12px"><div class="lab-panel"><h4>Common payload sizes</h4><div data-k="tbl"></div></div><div data-k="note"></div></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const calc = (payload, page, fan) => { const max = Math.floor(page / fan), inline = Math.min(payload, max), spill = payload - inline, ov = Math.ceil(spill / (page - OV_HDR)); return { max, inline, spill, ov, waste: ov ? ov * (page - OV_HDR) - spill : 0 }; };
      const draw = () => {
        const payload = Math.round(Math.pow(10, st.p / 10)), c = calc(payload, st.page, st.fan);
        const cols = Math.min(st.fan, 16), rows = Math.ceil(st.fan / cols), cw = 13, chh = 13;
        const pw = cols * (cw + 2) + 10, ph = rows * (chh + 2) + 26;
        let s = `<rect class="bt-node" x="4" y="4" width="${pw}" height="${ph}" rx="5"/><text class="svg-label" x="${4 + pw / 2}" y="17" text-anchor="middle">primary page (${st.fan} slots × ${c.max} B)</text>`;
        for (let i = 0; i < st.fan; i++) {
          const x = 9 + (i % cols) * (cw + 2), y = 24 + Math.floor(i / cols) * (chh + 2), mine = i === 0;
          const fill = mine ? c.inline / c.max : 0.35 + ((i * 37) % 50) / 100;
          s += `<rect x="${x}" y="${y}" width="${cw}" height="${chh}" rx="2" style="fill:var(--bg);stroke:var(--border)"/><rect x="${x}" y="${y + chh * (1 - fill)}" width="${cw}" height="${chh * fill}" rx="2" class="${mine ? `svg-bar3` : `svg-bar2`}"/>`;
        }
        const show = Math.min(c.ov, 8);
        let x = pw + 30;
        for (let i = 0; i < show; i++) {
          const used = i < c.ov - 1 ? 1 : (c.spill - (c.ov - 1) * (st.page - OV_HDR)) / (st.page - OV_HDR);
          s += `<line class="bt-link hot" x1="${x - 22}" y1="${4 + ph / 2}" x2="${x - 2}" y2="${4 + ph / 2}"/>`;
          s += `<rect class="bt-node" x="${x}" y="${4 + ph / 2 - 22}" width="44" height="44" rx="4"/><rect class="svg-bar3" x="${x + 3}" y="${4 + ph / 2 + 19 - 38 * used}" width="38" height="${38 * used}" rx="2" style="opacity:.8"/>`;
          s += `<text class="svg-label" x="${x + 22}" y="${4 + ph / 2 + 36}" text-anchor="middle" style="font-size:9px">ovf ${i + 1}</text>`;
          x += 64;
        }
        if (c.ov > show) { s += `<text class="svg-label" x="${x - 10}" y="${4 + ph / 2 + 4}">+${c.ov - show} more</text>`; x += 60; }
        q(`svg`).innerHTML = svgWrap(Math.max(x + 10, 560), ph + 22, s);
        q(`stats`).innerHTML = stat(`payload`, fmtBytes(payload)) + stat(`max_payload_size`, c.max + ` B`) + stat(`inline`, c.inline + ` B`) + stat(`spilled`, fmtBytes(c.spill)) + stat(`overflow pages`, c.ov, c.ov ? `bad` : `good`) + stat(`page reads for full value`, 1 + c.ov);
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>payload</th><th class="num">inline</th><th class="num">overflow pages</th><th class="num">reads</th></tr>${[100, 1000, 4000, 16000, 64000].map(p => { const r = calc(p, st.page, st.fan); return `<tr><td>${fmtBytes(p)}</td><td class="num">${r.inline}</td><td class="num">${r.ov}</td><td class="num">${1 + r.ov}</td></tr>`; }).join(``)}</table>`;
        q(`note`).innerHTML = note(c.ov
          ? `${fmtBytes(payload)} exceeds max_payload_size (${st.page} / ${st.fan} = ${c.max} B), so ${fmtBytes(c.spill)} spill into ${c.ov} overflow page${c.ov > 1 ? `s` : ``}${c.waste ? `, leaving ${fmtBytes(c.waste)} unused in the last one` : ``}. A lookup that only compares keys still reads one page; fetching the whole value reads ${1 + c.ov}. Without the limit, a single big record could take the whole node and drop its fanout to 1.`
          : `The record fits inline: ${payload} B ≤ ${c.max} B. Raising the fanout lowers max_payload_size and makes spilling more likely; larger pages raise it.`, c.ov ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { fan: v => v, p: v => fmtBytes(Math.round(Math.pow(10, v / 10))) }, draw);
      draw();
    }
  };
})();
