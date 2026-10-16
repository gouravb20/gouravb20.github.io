// Software Architecture: The Hard Parts - labs for chapters 1-7
(function () {
  "use strict";
  const { esc, clamp, sum, round, mulberry32, seg, setSeg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, path, fmtNum, pct } = window.LabKit;
  const D = (window.DEMOS = window.DEMOS || {});
  const PAL = [`var(--accent)`, `var(--accent-2)`, `var(--accent-3)`, `#a78bfa`, `#f472b6`, `#4ade80`, `#f87171`, `#facc15`];
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const muted = s => `<span style="color:var(--text-muted)">${s}</span>`;

  // =====================================================================
  // Ch1 / Ch15 - Weighted trade-off matrix with sensitivity
  // =====================================================================
  const TM = {
    payment: {
      label: `Split payment out of checkout?`,
      criteria: [`Consistency`, `Responsiveness`, `Fault isolation`, `PCI audit scope`, `Simplicity`, `Independent deploys`],
      weights: [4, 3, 3, 4, 2, 2],
      options: [
        { name: `Keep payment inside checkout`, s: [5, 4, 1, 1, 5, 1] },
        { name: `Payment service, sync call`, s: [3, 2, 2, 5, 3, 4] },
        { name: `Payment service, async + order states`, s: [2, 5, 4, 5, 2, 5] }
      ]
    },
    workflow: {
      label: `Run the order workflow by orchestration or choreography?`,
      criteria: [`Error handling`, `Order status visibility`, `Responsiveness`, `Scalability`, `Service decoupling`, `Ease of changing the flow`],
      weights: [4, 4, 2, 2, 2, 3],
      options: [
        { name: `Orchestrated`, s: [5, 5, 2, 2, 2, 4] },
        { name: `Choreographed`, s: [2, 1, 5, 5, 5, 2] },
        { name: `Hybrid: orchestrate core, events for the rest`, s: [4, 4, 3, 4, 3, 3] }
      ]
    },
    reuse: {
      label: `How should services share the pricing rules?`,
      criteria: [`Performance`, `Change reaches everyone fast`, `Fault isolation`, `Polyglot consumers`, `No version drift`, `Simplicity`],
      weights: [3, 4, 3, 1, 3, 2],
      options: [
        { name: `Shared library`, s: [5, 2, 5, 2, 1, 4] },
        { name: `Shared pricing service`, s: [2, 5, 2, 5, 5, 3] },
        { name: `Copy the code into each service`, s: [5, 1, 5, 1, 1, 5] }
      ]
    }
  };
  D.tradeoffMatrix = {
    title: `Trade-off matrix: weight what matters here`,
    blurb: `Pick a Basket decision. Each option is rated 1-5 on each criterion (my rough ratings, stated in the table); you set how much each criterion matters for this system. The winner is the highest weighted total. Below, the sensitivity check finds which single weight change would flip the decision, which is the part worth discussing with stakeholders.`,
    mount(el) {
      const st = { sc: `payment` };
      const W = {};
      const render = () => {
        const S = TM[st.sc];
        S.criteria.forEach((c, i) => { if (W[st.sc + i] == null) W[st.sc + i] = S.weights[i]; });
        el.innerHTML = `
          <div class="ctl-row">${ctl(`decision`, seg(`sc`, Object.keys(TM).map(k => [k, TM[k].label.replace(/\?$/, ``)]), st.sc))}</div>
          <div class="lab-grid">
            <div class="lab-panel"><h4>How much each criterion matters (0-5)</h4>${S.criteria.map((c, i) => `<div class="ctl-row" style="margin-bottom:6px">${ctl(c, rng(`w${i}`, 0, 5, 1, W[st.sc + i]))}</div>`).join(``)}</div>
            <div class="lab-panel"><h4>Weighted score (% of the best possible)</h4><div data-k="bars"></div><div data-k="sens" style="margin-top:10px"></div></div>
          </div>
          <div class="lab-panel" style="margin-top:14px;overflow-x:auto"><h4>Ratings × weights</h4><div data-k="tbl"></div></div>
          <div data-k="note"></div>`;
        const st2 = {};
        S.criteria.forEach((c, i) => { st2[`w${i}`] = W[st.sc + i]; });
        wireSegs(el, st, () => render());
        wireRanges(el, st2, null, k => { W[st.sc + k.slice(1)] = st2[k]; draw(); });
        draw();
      };
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const totals = (S, w) => S.options.map(o => sum(o.s.map((v, i) => v * w[i])));
      const draw = () => {
        const S = TM[st.sc];
        const w = S.criteria.map((c, i) => W[st.sc + i]);
        const max = 5 * sum(w) || 1;
        const t = totals(S, w);
        const best = t.indexOf(Math.max(...t));
        q(`bars`).innerHTML = hbars(S.options.map((o, i) => ({ label: o.name, value: t[i] / max, text: pct(t[i] / max), cls: i === best ? `good` : `muted` })), 1);
        // Sensitivity: for each criterion, the nearest weight (0-5) that changes the winner.
        const flips = [];
        S.criteria.forEach((c, i) => {
          let found = null;
          for (let d = 1; d <= 5 && !found; d++) {
            for (const nv of [w[i] - d, w[i] + d]) {
              if (nv < 0 || nv > 5) continue;
              const w2 = w.slice(); w2[i] = nv;
              const t2 = totals(S, w2);
              const b2 = t2.indexOf(Math.max(...t2));
              if (b2 !== best) { found = { c, nv, to: S.options[b2].name }; break; }
            }
          }
          if (found) flips.push(found);
        });
        q(`sens`).innerHTML = flips.length
          ? `<div style="font-size:12.5px;color:var(--text-muted)"><strong style="color:var(--text)">What would flip it:</strong><br>${flips.slice(0, 4).map(f => `${esc(f.c)} weight → ${f.nv}: <em>${esc(f.to)}</em> wins`).join(`<br>`)}</div>`
          : `<div style="font-size:12.5px;color:var(--text-muted)">No single weight change flips this decision: it's robust to how you value any one criterion.</div>`;
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>option</th>${S.criteria.map((c, i) => `<th class="num">${esc(c)} <span style="opacity:.7">×${w[i]}</span></th>`).join(``)}<th class="num">total</th></tr>${S.options.map((o, oi) => `<tr class="${oi === best ? `new` : ``}"><td>${esc(o.name)}</td>${o.s.map((v, i) => `<td class="num">${v}${muted(` → ${v * w[i]}`)}</td>`).join(``)}<td class="num"><strong>${t[oi]}</strong></td></tr>`).join(``)}</table>`;
        const sorted = t.slice().sort((a, b) => b - a);
        const margin = (sorted[0] - sorted[1]) / max;
        q(`note`).innerHTML = note(margin < 0.05
          ? `<strong>${esc(S.options[best].name)}</strong> wins by less than 5 points: effectively a tie. That's a signal to model concrete scenarios (a payment timeout, a holiday spike) rather than trust the totals.`
          : `<strong>${esc(S.options[best].name)}</strong> wins by ${pct(margin)}. The ratings are the same for every system; only the weights express context, which is exactly the "out-of-context trap" from Chapter 15: generic pros and cons decide nothing until you say what matters here.`, margin < 0.05 ? `warn` : `good`);
      };
      render();
    }
  };

  // =====================================================================
  // Ch2 - Architecture quantum finder
  // =====================================================================
  const QF_NODES = [
    { id: `store`, name: `Storefront`, x: 110, y: 70 },
    { id: `check`, name: `Checkout`, x: 330, y: 70 },
    { id: `pay`, name: `Payment`, x: 550, y: 70 },
    { id: `stock`, name: `Stock`, x: 330, y: 220 },
    { id: `deliv`, name: `Delivery`, x: 550, y: 220 },
    { id: `notify`, name: `Notify`, x: 110, y: 220 }
  ];
  const QF_EDGES = [
    { k: `e0`, a: `store`, b: `check`, def: `sync` },
    { k: `e1`, a: `check`, b: `pay`, def: `sync` },
    { k: `e2`, a: `check`, b: `stock`, def: `sync` },
    { k: `e3`, a: `check`, b: `deliv`, def: `async` },
    { k: `e4`, a: `deliv`, b: `notify`, def: `async` },
    { k: `e5`, a: `pay`, b: `notify`, def: `async` }
  ];
  const QF_DB = {
    shared: { label: `one shared database`, groups: [[`store`, `check`, `pay`, `stock`, `deliv`, `notify`]] },
    partial: { label: `Checkout + Stock share, rest separate`, groups: [[`check`, `stock`], [`store`], [`pay`], [`deliv`], [`notify`]] },
    separate: { label: `database per service`, groups: [[`store`], [`check`], [`pay`], [`stock`], [`deliv`], [`notify`]] }
  };
  D.quantumFinder = {
    title: `Architecture quantum finder`,
    blurb: `Six Basket services. Choose how they share databases (static coupling) and whether each call is synchronous or asynchronous (dynamic coupling). Colours show the static quanta: services that must be deployed together because they share a database. The availability figure assumes every service is 99.9% and every database 99.95%, and that a request fails if anything it synchronously depends on is down.`,
    mount(el) {
      const st = { db: `separate` };
      QF_EDGES.forEach(e => { st[e.k] = e.def; });
      const name = id => QF_NODES.find(n => n.id === id).name;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`databases`, seg(`db`, Object.keys(QF_DB).map(k => [k, QF_DB[k].label]), st.db))}</div>
        <div class="ctl-row">${QF_EDGES.map(e => ctl(`${name(e.a)} → ${name(e.b)}`, seg(e.k, [[`sync`, `sync`], [`async`, `async`]], st[e.k]))).join(``)}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Services, databases and calls</h4><div data-k="svg"></div><div class="legend"><span><i class="sw line" style="background:var(--text)"></i>synchronous call</span><span><i class="sw line" style="background:var(--text-muted)"></i>asynchronous (dashed)</span></div></div>
          <div class="lab-panel"><h4>What it adds up to</h4><div class="stat-row" data-k="stats"></div><div data-k="groups" style="font-size:12.5px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const groups = QF_DB[st.db].groups;
        const dbOf = {};
        groups.forEach((g, gi) => g.forEach(id => { dbOf[id] = gi; }));
        // Runtime entanglement: union of shared DB and sync edges.
        const parent = {};
        QF_NODES.forEach(n => { parent[n.id] = n.id; });
        const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
        const union = (a, b) => { parent[find(a)] = find(b); };
        groups.forEach(g => g.forEach(id => union(g[0], id)));
        QF_EDGES.forEach(e => { if (st[e.k] === `sync`) union(e.a, e.b); });
        const ent = {};
        QF_NODES.forEach(n => { (ent[find(n.id)] = ent[find(n.id)] || []).push(n.name); });
        const entGroups = Object.values(ent);
        // Storefront availability: everything synchronously reachable from it, plus their databases.
        const reach = new Set([`store`]);
        let grew = true;
        while (grew) { grew = false; QF_EDGES.forEach(e => { if (st[e.k] === `sync` && reach.has(e.a) && !reach.has(e.b)) { reach.add(e.b); grew = true; } }); }
        const dbs = new Set([...reach].map(id => dbOf[id]));
        const avail = Math.pow(0.999, reach.size) * Math.pow(0.9995, dbs.size);
        const downMin = (1 - avail) * 30 * 24 * 60;
        let s = `<defs><marker id="qf-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill:var(--text-muted)"/></marker></defs>`;
        QF_EDGES.forEach(e => {
          const A = QF_NODES.find(n => n.id === e.a), B = QF_NODES.find(n => n.id === e.b);
          const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
          const ox = dx / L, oy = dy / L;
          const pad = Math.abs(ox) > Math.abs(oy) ? 64 : 30;
          const sync = st[e.k] === `sync`;
          s += `<line x1="${A.x + ox * pad}" y1="${A.y + oy * pad}" x2="${B.x - ox * pad}" y2="${B.y - oy * pad}" style="stroke:${sync ? `var(--text)` : `var(--text-muted)`};stroke-width:${sync ? 2.4 : 1.6}" ${sync ? `` : `stroke-dasharray="6 5"`} marker-end="url(#qf-arr)"/>`;
        });
        QF_NODES.forEach(n => {
          const gi = dbOf[n.id];
          const c = PAL[gi % PAL.length];
          s += `<rect x="${n.x - 62}" y="${n.y - 26}" width="124" height="52" rx="9" style="fill:var(--bg-3);stroke:${c};stroke-width:2.5"/>`;
          s += `<text x="${n.x}" y="${n.y - 3}" text-anchor="middle" font-size="13" font-weight="700" style="fill:var(--text)">${n.name}</text>`;
          s += `<text x="${n.x}" y="${n.y + 14}" text-anchor="middle" font-size="11" style="fill:${c}">DB ${String.fromCharCode(65 + gi)}${reach.has(n.id) ? ` · in path` : ``}</text>`;
        });
        q(`svg`).innerHTML = svgWrap(660, 290, s);
        q(`stats`).innerHTML = stat(`static quanta`, groups.length, groups.length === 1 ? `bad` : groups.length < 4 ? `warn` : `good`) + stat(`runtime-entangled groups`, entGroups.length, entGroups.length <= 2 ? `warn` : `good`) + stat(`Storefront availability`, round(avail * 100, 3) + `%`, avail > 0.997 ? `good` : avail > 0.995 ? `warn` : `bad`) + stat(`≈ downtime / month`, Math.round(downMin) + ` min`);
        q(`groups`).innerHTML = `<p style="margin:4px 0 6px"><strong>Deploy together</strong> (shared database):</p>${groups.filter(g => g.length > 1).map(g => chip(g.map(name).join(` + `), `undo`)).join(` `) || muted(`none: every service deploys alone`)}<p style="margin:10px 0 6px"><strong>Fail and slow down together</strong> (shared DB or sync calls):</p>${entGroups.map(g => chip(g.join(` + `), g.length > 1 ? `early` : `muted`)).join(` `)}`;
        let n;
        if (st.db === `shared`) n = `With one shared database there is <strong>one architecture quantum</strong>: six processes, but one deployable unit for any schema change and one database outage away from total failure. This is the distributed monolith.`;
        else if (reach.size > 2) n = `Storefront synchronously depends on ${[...reach].filter(x => x !== `store`).map(name).join(`, `)}. Its availability is the product of all of them, ${round(avail * 100, 3)}%, so it is worse than any single service. Switch one of those calls to asynchronous and watch the figure and the entangled group shrink.`;
        else n = `Storefront only waits on what it calls directly, so failures elsewhere stay elsewhere. The cost of asynchrony moves to error handling and consistency: Checkout must cope with "payment pending", which is the subject of Chapters 11 and 12.`;
        q(`note`).innerHTML = note(n, st.db === `shared` ? `bad` : reach.size > 2 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch3 - Elasticity: monolith vs a small service under a spike
  // =====================================================================
  D.elasticitySpike = {
    title: `Elasticity: scaling a monolith vs one service for a spike`,
    blurb: `At 6:00 Basket opens next week's delivery slots and slot search traffic jumps. Normal load is 100 requests/s, 20 of them slot search. Each instance handles 150 requests/s; an autoscaler checks every 10 s and targets 70% utilisation. The monolith must start whole copies of the app (large, slow to boot); the split design starts copies of a small slot service only. Requests above ready capacity are dropped.`,
    mount(el) {
      const st = { mult: 10, tm: 180, ts: 20, gbM: 4, gbS: 0.5 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`slot traffic spike`, rng(`mult`, 2, 30, 1, st.mult))}${ctl(`monolith boot time`, rng(`tm`, 30, 300, 10, st.tm))}${ctl(`slot service boot time`, rng(`ts`, 5, 120, 5, st.ts))}</div>
        <div class="lab-panel"><h4>Demand vs ready capacity over 10 minutes (requests/s)</h4><div data-k="chart"></div><div class="legend"><span><i class="sw line" style="background:var(--text)"></i>demand on the scaled unit</span><span><i class="sw line" style="background:var(--bad)"></i>monolith capacity</span><span><i class="sw line" style="background:var(--good)"></i>slot service capacity</span></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const sim = (boot, base, demandFn, cap) => {
        let ready = Math.ceil(base / (cap * 0.7)); const pending = [];
        const out = []; let dropped = 0, total = 0, instSec = 0, peak = ready;
        for (let t = 0; t < 600; t++) {
          while (pending.length && pending[0] <= t) { pending.shift(); ready++; }
          const d = demandFn(t);
          if (t % 10 === 0) {
            const want = Math.ceil(d / (cap * 0.7));
            for (let i = ready + pending.length; i < want; i++) pending.push(t + boot);
          }
          const c = ready * cap;
          dropped += Math.max(0, d - c); total += d; instSec += ready + pending.length;
          peak = Math.max(peak, ready + pending.length);
          out.push([t, d, c]);
        }
        return { out, dropped, total, instSec, peak };
      };
      const draw = () => {
        const slot = t => t < 60 ? 20 : t < 120 ? 20 + (20 * st.mult - 20) * (t - 60) / 60 : 20 * st.mult;
        const all = t => 80 + slot(t);
        const M = sim(st.tm, 100, all, 150);
        const S = sim(st.ts, 20, slot, 150);
        const ymax = Math.max(200, all(599) * 1.15, ...M.out.map(o => o[2]));
        const ax = axes({ x0: 50, x1: 760, y0: 220, y1: 12, dx0: 0, dx1: 600, dy0: 0, dy1: ymax, xTicks: [0, 120, 240, 360, 480, 600], yTicks: [0, ymax / 4, ymax / 2, (3 * ymax) / 4].map(v => Math.round(v)), xFmt: v => `6:${String(Math.floor(v / 60)).padStart(2, `0`)}`, yFmt: v => fmtNum(v, 0) });
        let s = ax.svg;
        s += `<path d="${path(M.out.map(o => [ax.X(o[0]), ax.Y(o[1])]))}" style="fill:none;stroke:var(--text);stroke-width:1.6"/>`;
        s += `<path d="${path(S.out.map(o => [ax.X(o[0]), ax.Y(o[1])]))}" style="fill:none;stroke:var(--text);stroke-width:1.2" stroke-dasharray="4 4"/>`;
        s += `<path d="${path(M.out.map(o => [ax.X(o[0]), ax.Y(Math.min(ymax, o[2]))]))}" style="fill:none;stroke:var(--bad);stroke-width:2"/>`;
        s += `<path d="${path(S.out.map(o => [ax.X(o[0]), ax.Y(Math.min(ymax, o[2]))]))}" style="fill:none;stroke:var(--good);stroke-width:2"/>`;
        s += `<text x="${ax.X(590)}" y="${ax.Y(all(599)) - 6}" text-anchor="end" font-size="11" style="fill:var(--text-muted)">all traffic (monolith)</text>`;
        s += `<text x="${ax.X(590)}" y="${ax.Y(slot(599)) + 14}" text-anchor="end" font-size="11" style="fill:var(--text-muted)">slot search only (dashed)</text>`;
        q(`chart`).innerHTML = svgWrap(780, 250, s);
        const mDrop = M.dropped / M.total, sDrop = S.dropped / S.total;
        const mGbh = M.instSec * st.gbM / 3600, sGbh = (S.instSec * st.gbS + 600 * 4 * st.gbS) / 3600;
        q(`stats`).innerHTML = stat(`monolith: requests dropped`, pct(mDrop, 1), mDrop > 0.05 ? `bad` : mDrop > 0.01 ? `warn` : `good`) + stat(`split: slot requests dropped`, pct(sDrop, 1), sDrop > 0.05 ? `bad` : sDrop > 0.01 ? `warn` : `good`) + stat(`monolith peak instances (4 GB)`, M.peak) + stat(`slot service peak instances (0.5 GB)`, S.peak) + stat(`memory used: monolith vs split`, `${round(mGbh, 1)} vs ${round(sGbh, 1)} GB·h`);
        q(`note`).innerHTML = note(`The monolith drops ${pct(mDrop, 1)} of <em>all</em> requests, including checkout, while new copies boot for ${st.tm} s; the slot service drops ${pct(sDrop, 1)} of slot searches only, and nothing else is affected. Same scalability on paper (both eventually catch up), very different <strong>elasticity</strong>: it depends on how small the scaled unit is and how fast it starts. The split figure includes four other always-on services at 0.5 GB each.`, mDrop > sDrop * 2 ? `warn` : `good`);
      };
      wireRanges(el, st, { mult: v => v + `×`, tm: v => v + ` s`, ts: v => v + ` s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch4 - Abstractness, instability and the main sequence
  // =====================================================================
  const MS_PRESETS = {
    util: { label: `basket.common.util`, ca: 18, ce: 1, ab: 0, tot: 30 },
    payapi: { label: `basket.payment.api`, ca: 6, ce: 1, ab: 8, tot: 10 },
    web: { label: `basket.checkout.web`, ca: 0, ce: 9, ab: 0, tot: 20 },
    plug: { label: `basket.reporting.plugins`, ca: 0, ce: 2, ab: 9, tot: 10 },
    orders: { label: `basket.ordering`, ca: 4, ce: 5, ab: 4, tot: 18 }
  };
  D.mainSequence = {
    title: `Distance from the main sequence`,
    blurb: `Pick one of Basket's components or set the counts yourself. Instability I = Ce / (Ca + Ce); abstractness A = abstract types / all types; distance D = |A + I − 1|. Components near the diagonal balance the two; the corners mark the zone of pain (concrete and depended upon) and the zone of uselessness (abstract and unused).`,
    mount(el) {
      const st = { pre: `util`, ca: 18, ce: 1, ab: 0, tot: 30 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`component`, seg(`pre`, Object.keys(MS_PRESETS).map(k => [k, MS_PRESETS[k].label]), st.pre))}</div>
        <div class="ctl-row">${ctl(`incoming deps (Ca)`, rng(`ca`, 0, 20, 1, st.ca))}${ctl(`outgoing deps (Ce)`, rng(`ce`, 0, 20, 1, st.ce))}${ctl(`abstract types`, rng(`ab`, 0, 30, 1, st.ab))}${ctl(`total types`, rng(`tot`, 1, 30, 1, st.tot))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Abstractness vs instability</h4><div data-k="plot"></div></div>
          <div class="lab-panel"><h4>Metrics</h4><div class="stat-row" data-k="stats"></div><div data-k="all"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const metrics = (ca, ce, ab, tot) => { const I = ca + ce ? ce / (ca + ce) : 0; const A = clamp(ab / Math.max(1, tot), 0, 1); return { I, A, D: Math.abs(A + I - 1) }; };
      const setSliders = () => ["ca", "ce", "ab", "tot"].forEach(k => { const inp = el.querySelector(`input[data-rng="${k}"]`); inp.value = st[k]; inp.dispatchEvent(new Event(`input`)); });
      const draw = () => {
        const m = metrics(st.ca, st.ce, st.ab, st.tot);
        const X = v => 50 + v * 300, Y = v => 320 - v * 300;
        let s = `<rect x="50" y="20" width="300" height="300" style="fill:var(--bg-3);stroke:var(--border)"/>`;
        s += `<path d="M50 320 L50 200 A120 120 0 0 0 170 320 Z" style="fill:var(--bad);opacity:.18"/>`;
        s += `<path d="M350 20 L350 140 A120 120 0 0 1 230 20 Z" style="fill:var(--warn);opacity:.18"/>`;
        s += `<line x1="${X(0)}" y1="${Y(1)}" x2="${X(1)}" y2="${Y(0)}" style="stroke:var(--accent);stroke-width:2" stroke-dasharray="6 4"/>`;
        s += `<text x="${X(0.04)}" y="${Y(0.04)}" font-size="11" style="fill:var(--bad)">zone of pain</text>`;
        s += `<text x="${X(0.96)}" y="${Y(0.93)}" text-anchor="end" font-size="11" style="fill:var(--warn)">zone of uselessness</text>`;
        s += `<text x="${X(0.55)}" y="${Y(0.52)}" font-size="11" style="fill:var(--accent)" transform="rotate(45 ${X(0.55)} ${Y(0.52)})">main sequence</text>`;
        Object.entries(MS_PRESETS).forEach(([k, p]) => { if (k === st.pre) return; const pm = metrics(p.ca, p.ce, p.ab, p.tot); s += `<circle cx="${X(pm.I)}" cy="${Y(pm.A)}" r="4" style="fill:var(--text-muted);opacity:.6"/>`; });
        s += `<circle cx="${X(m.I)}" cy="${Y(m.A)}" r="8" style="fill:var(--accent-3);stroke:var(--bg);stroke-width:2"/>`;
        s += `<text x="200" y="345" text-anchor="middle" font-size="12" style="fill:var(--text-muted)">instability I →</text><text transform="translate(28 170) rotate(-90)" text-anchor="middle" font-size="12" style="fill:var(--text-muted)">abstractness A →</text>`;
        s += `<text x="50" y="335" font-size="11" text-anchor="middle" style="fill:var(--text-muted)">0</text><text x="350" y="335" font-size="11" text-anchor="middle" style="fill:var(--text-muted)">1</text><text x="42" y="24" font-size="11" text-anchor="end" style="fill:var(--text-muted)">1</text>`;
        q(`plot`).innerHTML = svgWrap(370, 355, s);
        const zone = m.D < 0.3 ? `near the main sequence` : m.A + m.I < 1 ? `towards the zone of pain` : `towards the zone of uselessness`;
        q(`stats`).innerHTML = stat(`instability I`, round(m.I, 2)) + stat(`abstractness A`, round(m.A, 2)) + stat(`distance D`, round(m.D, 2), m.D < 0.3 ? `good` : m.D < 0.6 ? `warn` : `bad`);
        q(`all`).innerHTML = `<table class="mini-table"><tr><th>component</th><th class="num">I</th><th class="num">A</th><th class="num">D</th></tr>${Object.entries(MS_PRESETS).map(([k, p]) => { const pm = metrics(p.ca, p.ce, p.ab, p.tot); return `<tr class="${k === st.pre ? `new` : ``}"><td>${p.label}</td><td class="num">${round(pm.I, 2)}</td><td class="num">${round(pm.A, 2)}</td><td class="num">${round(pm.D, 2)}</td></tr>`; }).join(``)}</table>`;
        let n = `With Ca = ${st.ca} and Ce = ${st.ce}, I = ${round(m.I, 2)}; with ${st.ab} of ${st.tot} types abstract, A = ${round(m.A, 2)}. D = ${round(m.D, 2)}: ${zone}.`;
        if (m.D >= 0.3 && m.A + m.I < 1) n += ` Many things depend on concrete code here, so every change ripples outwards. Extracting it means either an interface for dependants to code against, or accepting it as a shared library with slow, careful releases.`;
        else if (m.D >= 0.3) n += ` Abstractions that nothing depends on add indirection without benefit; collapse them or find out why they exist.`;
        else n += ` A healthy balance. A fitness function that fails when D crosses a threshold keeps it that way during the migration.`;
        q(`note`).innerHTML = note(n, m.D < 0.3 ? `good` : `warn`);
      };
      wireSegs(el, st, k => { if (k === `pre`) { Object.assign(st, MS_PRESETS[st.pre]); setSliders(); } draw(); });
      wireRanges(el, st, null, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch5 - Identify and size components
  // =====================================================================
  const CS_BASE = [
    [`catalogue.search`, 9800], [`catalogue.admin`, 4100], [`cart`, 5600], [`checkout.core`, 31500], [`checkout.notify`, 1200],
    [`payment`, 7900], [`stock`, 6300], [`picking`, 5200], [`delivery.slots`, 4700], [`delivery.routes`, 6800],
    [`delivery.sms`, 900], [`account`, 5100], [`account.email`, 700], [`promotions`, 8400], [`reporting`, 7300]
  ];
  const CS_VIEWS = {
    asis: { label: `as found`, f: c => c },
    gather: { label: `gather notifications`, f: c => [...c.filter(([n]) => ![`checkout.notify`, `delivery.sms`, `account.email`].includes(n)), [`notification`, 2800]] },
    split: { label: `gather + split checkout.core`, f: c => [...CS_VIEWS.gather.f(c).filter(([n]) => n !== `checkout.core`), [`checkout.orders`, 12400], [`checkout.pricing`, 10300], [`checkout.validation`, 8800]] }
  };
  D.componentSizes = {
    title: `Identify and size components`,
    blurb: `Basket's components (under <code>basket.*</code>) with their size in statements. A component is flagged as oversized when it sits more than k standard deviations above the mean, and as a fragment when it's under 2% of the codebase. Apply the next two patterns, gathering duplicated notification code and splitting the bloated checkout component, and watch the distribution even out.`,
    mount(el) {
      const st = { view: `asis`, k: 2 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`step`, seg(`view`, Object.keys(CS_VIEWS).map(k => [k, CS_VIEWS[k].label]), st.view))}${ctl(`oversized above mean +`, rng(`k`, 1, 3, 0.25, st.k))}</div>
        <div class="lab-panel"><h4>Statements per component</h4><div data-k="bars"></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const comps = CS_VIEWS[st.view].f(CS_BASE).slice().sort((a, b) => b[1] - a[1]);
        const vals = comps.map(c => c[1]);
        const total = sum(vals), mean = total / vals.length;
        const sd = Math.sqrt(sum(vals.map(v => (v - mean) ** 2)) / vals.length);
        const hi = mean + st.k * sd;
        const big = comps.filter(c => c[1] > hi), small = comps.filter(c => c[1] / total < 0.02);
        q(`bars`).innerHTML = hbars(comps.map(([n, v]) => ({ label: n, value: v, text: `${fmtNum(v)} · ${pct(v / total, 1)}`, cls: v > hi ? `bad` : v / total < 0.02 ? `warn` : `` })));
        q(`stats`).innerHTML = stat(`components`, comps.length) + stat(`total statements`, fmtNum(total)) + stat(`mean`, fmtNum(mean)) + stat(`std deviation`, fmtNum(sd), sd / mean > 0.8 ? `bad` : sd / mean > 0.5 ? `warn` : `good`) + stat(`oversized`, big.length, big.length ? `bad` : `good`) + stat(`fragments (< 2%)`, small.length, small.length ? `warn` : `good`);
        let n;
        if (st.view === `asis`) n = `<code>checkout.core</code> is ${pct(31500 / total, 0)} of the codebase, and three tiny components (<code>checkout.notify</code>, <code>delivery.sms</code>, <code>account.email</code>) each send customer messages their own way. The first is a service-sized ball of responsibilities; the others are the same domain function scattered in three places.`;
        else if (st.view === `gather`) n = `Gathering the notification code into one component removes three fragments and gives the function a single owner, a likely future service. <code>checkout.core</code> is still an outlier.`;
        else n = `Splitting <code>checkout.core</code> along its responsibilities (orders, pricing, validation) brings the coefficient of variation down to ${round(sd / mean, 2)}. Evenly sized, cohesive components are what make the later "create domain services" step predictable.`;
        q(`note`).innerHTML = note(n, big.length ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { k: v => v + ` σ` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch6 - Connection budget for a shared database
  // =====================================================================
  D.connectionBudget = {
    title: `Connection budget: when the shared database runs out`,
    blurb: `Every service instance keeps a connection pool open. Total demand is services × instances × pool size; a database server accepts a fixed maximum (PostgreSQL defaults to 100; managed instances typically allow a few hundred to a few thousand). Splitting data across servers divides the demand; a connection pooler such as PgBouncer multiplexes many client connections onto fewer server ones.`,
    mount(el) {
      const st = { svc: 18, inst: 6, pool: 20, max: 1000, srv: 1, pooler: `off` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`services`, rng(`svc`, 1, 40, 1, st.svc))}${ctl(`instances each`, rng(`inst`, 1, 20, 1, st.inst))}${ctl(`pool size per instance`, rng(`pool`, 5, 50, 5, st.pool))}</div>
        <div class="ctl-row">${ctl(`max connections per server`, rng(`max`, 100, 5000, 100, st.max))}${ctl(`database servers (data split evenly)`, rng(`srv`, 1, 10, 1, st.srv))}${ctl(`pooler`, seg(`pooler`, [[`off`, `none`], [`on`, `PgBouncer, 200 server conns`]], st.pooler))}</div>
        <div class="lab-panel"><h4>Connections per database server</h4><div data-k="bars"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const demand = st.svc * st.inst * st.pool;
        const perSrv = demand / st.srv;
        const server = st.pooler === `on` ? Math.min(perSrv, 200) : perSrv;
        const over = server > st.max;
        q(`bars`).innerHTML = hbars([
          { label: `client demand / server`, value: perSrv, text: fmtNum(perSrv, 0), cls: perSrv > st.max ? `bad` : `warn` },
          { label: `server connections used`, value: server, text: fmtNum(server, 0), cls: over ? `bad` : server > st.max * 0.8 ? `warn` : `good` },
          { label: `server limit`, value: st.max, text: fmtNum(st.max, 0), cls: `muted` }
        ], Math.max(perSrv, st.max) * 1.05);
        const maxInst = Math.floor((st.max * st.srv) / (st.svc * st.pool));
        q(`stats`).innerHTML = stat(`total client connections`, fmtNum(demand, 0)) + stat(`utilisation per server`, pct(server / st.max), over ? `bad` : server > st.max * 0.8 ? `warn` : `good`) + stat(`max instances per service before limit (no pooler)`, maxInst, maxInst < st.inst ? `bad` : `good`);
        let n = `${st.svc} services × ${st.inst} instances × ${st.pool} connections = ${fmtNum(demand, 0)} connections${st.srv > 1 ? `, ${fmtNum(perSrv, 0)} per server across ${st.srv} servers` : ``}.`;
        if (over) n += ` That exceeds the ${fmtNum(st.max, 0)} limit: new instances fail to connect exactly when you scale out under load. Options are smaller pools, a pooler, or splitting the data so each domain's services connect to their own server.`;
        else if (st.pooler === `on`) n += ` The pooler keeps the server at ${fmtNum(server, 0)} connections. It treats the symptom well, but every service still shares one server's CPU, locks and failure, which the other disintegrators in this chapter are about.`;
        else n += ` Within the limit for now, with ${pct(1 - server / st.max)} headroom. Double the instances for a peak and check again.`;
        q(`note`).innerHTML = note(n, over ? `bad` : server > st.max * 0.8 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, null, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - Granularity tug of war
  // =====================================================================
  const GB_DIS = [[`scope`, `Scope and function (low cohesion)`], [`vol`, `Code volatility differs`], [`scale`, `Scalability needs differ`], [`fault`, `Fault tolerance`], [`sec`, `Security boundary`], [`ext`, `Extensibility`]];
  const GB_INT = [[`tx`, `Database transactions (×1.5)`], [`wf`, `Workflow: chatty calls`], [`code`, `Shared domain code`], [`data`, `Data relationships`]];
  const GB_PRESETS = {
    notify: { label: `Notifications: email, SMS, push`, v: { scope: 0, vol: 1, scale: 1, fault: 2, sec: 0, ext: 1, tx: 0, wf: 0, code: 2, data: 1 } },
    slots: { label: `Delivery slots: search vs admin`, v: { scope: 1, vol: 0, scale: 2, fault: 1, sec: 1, ext: 0, tx: 0, wf: 1, code: 1, data: 2 } },
    orderpay: { label: `Orders + payment`, v: { scope: 1, vol: 1, scale: 0, fault: 1, sec: 2, ext: 1, tx: 2, wf: 2, code: 0, data: 1 } }
  };
  D.granularityBalance = {
    title: `Granularity: disintegrators vs integrators`,
    blurb: `Choose a candidate split in Basket, or set each force yourself (none, some, strong). Disintegrators pull towards separate services; integrators towards one. Database transactions count 1.5× because losing atomicity is usually the most expensive consequence of a split. The verdict is a conversation starter for stakeholders, not a rule.`,
    mount(el) {
      const st = { pre: `notify` };
      Object.assign(st, GB_PRESETS.notify.v);
      const lv = [[0, `none`], [1, `some`], [2, `strong`]];
      el.innerHTML = `
        <div class="ctl-row">${ctl(`candidate`, seg(`pre`, Object.keys(GB_PRESETS).map(k => [k, GB_PRESETS[k].label]), st.pre))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Disintegrators: split</h4>${GB_DIS.map(([k, l]) => `<div class="ctl-row" style="margin-bottom:6px">${ctl(l, seg(k, lv, st[k]))}</div>`).join(``)}</div>
          <div class="lab-panel"><h4>Integrators: keep together</h4>${GB_INT.map(([k, l]) => `<div class="ctl-row" style="margin-bottom:6px">${ctl(l, seg(k, lv, st[k]))}</div>`).join(``)}</div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>Tug of war</h4><div data-k="rope"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const dis = sum(GB_DIS.map(([k]) => st[k]));
        const int = sum(GB_INT.map(([k]) => st[k] * (k === `tx` ? 1.5 : 1)));
        const bal = dis - int;
        const x = 380 + clamp(bal, -8, 8) * 40;
        let s = `<rect x="40" y="40" width="680" height="10" rx="5" style="fill:var(--bg-3);stroke:var(--border)"/>`;
        s += `<line x1="380" y1="25" x2="380" y2="65" style="stroke:var(--text-muted)" stroke-dasharray="3 3"/>`;
        s += `<text x="40" y="85" font-size="12" style="fill:var(--accent)">← keep one service</text><text x="720" y="85" text-anchor="end" font-size="12" style="fill:var(--accent-3)">split into services →</text>`;
        s += `<circle cx="${x}" cy="45" r="13" style="fill:${bal > 1 ? `var(--accent-3)` : bal < -1 ? `var(--accent)` : `var(--text-muted)`};stroke:var(--bg);stroke-width:3"/>`;
        s += `<text x="${x}" y="20" text-anchor="middle" font-size="12" font-weight="700" style="fill:var(--text)">${bal > 0 ? `+` : ``}${round(bal, 1)}</text>`;
        q(`rope`).innerHTML = svgWrap(760, 95, s) + `<div class="stat-row">${stat(`disintegrator pull`, round(dis, 1))}${stat(`integrator pull`, round(int, 1))}</div>`;
        let n;
        if (st.tx === 2 && bal > 1) n = `The forces favour splitting, but a <strong>strong transaction need</strong> is in play. Before splitting, ask the business directly: if the payment succeeds and the order write fails, is a few seconds of inconsistency acceptable? If not, the split costs a saga with compensation (Chapter 12).`;
        else if (bal > 1) n = `Disintegrators win by ${round(bal, 1)}. Split, and write down which disintegrator justified it in an ADR, so you can tell later whether the reason still holds.`;
        else if (bal < -1) n = `Integrators win by ${round(-bal, 1)}. Keep it as one service; splitting would turn local calls and transactions into network calls and distributed workflows for little gain.`;
        else n = `Roughly balanced. This is where the decision belongs with stakeholders: present the strongest force on each side in business terms and let them choose what they'd rather give up.`;
        q(`note`).innerHTML = note(n, Math.abs(bal) <= 1 ? `warn` : `good`);
      };
      wireSegs(el, st, k => {
        if (k === `pre`) { Object.assign(st, GB_PRESETS[st.pre].v); [...GB_DIS, ...GB_INT].forEach(([key]) => setSeg(el, key, st[key])); }
        else setSeg(el, `pre`, ``);
        draw();
      });
      draw();
    }
  };
})();
