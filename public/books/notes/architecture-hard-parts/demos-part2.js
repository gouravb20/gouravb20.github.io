// Software Architecture: The Hard Parts - labs for chapters 8-13
(function () {
  "use strict";
  const { esc, clamp, sum, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, fmtNum, pct } = window.LabKit;
  const D = (window.DEMOS = window.DEMOS || {});
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const muted = s => `<span style="color:var(--text-muted)">${s}</span>`;
  const fmtDur = s => s >= 3600 ? round(s / 3600, 1) + ` h` : s >= 60 ? round(s / 60, 1) + ` min` : s >= 1 ? round(s, 1) + ` s` : round(s * 1000, 0) + ` ms`;
  const nines = a => round(a * 100, a > 0.9999 ? 4 : 3) + `%`;

  // =====================================================================
  // Ch8 - Shared library vs shared service vs copying
  // =====================================================================
  D.reuseCost = {
    title: `Reuse: what a change to shared code costs`,
    blurb: `Basket's pricing rules are used by several services. Compare three ways of sharing them as the number of consumers and the rate of change grow. Assumptions: library consumers upgrade on their own schedule (average lag below), so the number of versions live is roughly 1 + changes per month × lag in months (Little's law); a shared-service release that goes wrong hits every consumer at once; a copied fix has to be applied by hand in every copy.`,
    mount(el) {
      const st = { n: 8, rate: 4, lag: 6, risk: 5, lat: 4 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`consumers`, rng(`n`, 2, 30, 1, st.n))}${ctl(`changes per month`, rng(`rate`, 0.5, 20, 0.5, st.rate))}${ctl(`library upgrade lag`, rng(`lag`, 1, 16, 1, st.lag))}</div>
        <div class="ctl-row">${ctl(`chance a release is bad`, rng(`risk`, 1, 20, 1, st.risk))}${ctl(`extra latency per remote call`, rng(`lat`, 1, 30, 1, st.lat))}</div>
        <div class="lab-panel" style="overflow-x:auto"><h4>Per month</h4><div data-k="tbl"></div></div>
        <div class="lab-grid even" style="margin-top:14px">
          <div class="lab-panel"><h4>Distinct versions in production</h4><div data-k="ver"></div></div>
          <div class="lab-panel"><h4>Consumers hit by bad releases / month</h4><div data-k="hit"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const lagM = st.lag / 4.33, r = st.risk / 100;
        const libVersions = Math.min(st.n, 1 + st.rate * lagM);
        const libDeploys = st.n * st.rate;
        const libHit = st.rate * r * 1;
        const svcHit = st.rate * r * st.n;
        const copyEdits = st.n * st.rate;
        const copyVersions = Math.min(st.n, 1 + st.rate * lagM * 1.5);
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th></th><th class="num">shared library</th><th class="num">shared service</th><th class="num">copied code</th></tr>
          <tr><td>deployments to roll a change out</td><td class="num">${fmtNum(libDeploys)} ${muted(`(every consumer)`)}</td><td class="num">${fmtNum(st.rate)} ${muted(`(one service)`)}</td><td class="num">${fmtNum(copyEdits)} ${muted(`(edit + deploy each)`)}</td></tr>
          <tr><td>versions live at once</td><td class="num">${round(libVersions, 1)}</td><td class="num">1</td><td class="num">${round(copyVersions, 1)} ${muted(`(drifting copies)`)}</td></tr>
          <tr><td>consumers hit by one bad release</td><td class="num">1 ${muted(`(first adopter)`)}</td><td class="num">${st.n}</td><td class="num">1</td></tr>
          <tr><td>runtime dependency</td><td class="num">none</td><td class="num">every call, +${st.lat} ms</td><td class="num">none</td></tr></table>`;
        q(`ver`).innerHTML = hbars([
          { label: `library`, value: libVersions, text: round(libVersions, 1), cls: libVersions > 3 ? `bad` : `warn` },
          { label: `service`, value: 1, text: `1`, cls: `good` },
          { label: `copies`, value: copyVersions, text: round(copyVersions, 1), cls: `bad` }
        ], st.n);
        q(`hit`).innerHTML = hbars([
          { label: `library`, value: libHit, text: round(libHit, 2), cls: `good` },
          { label: `service`, value: svcHit, text: round(svcHit, 2), cls: svcHit > 2 ? `bad` : `warn` },
          { label: `copies`, value: libHit, text: round(libHit, 2), cls: `good` }
        ]);
        let n;
        if (st.rate <= 1) n = `Pricing changes about ${st.rate === 1 ? `once` : `every ${round(1 / st.rate, 1)} months`} a month: slow-changing code is where a <strong>shared library</strong> shines. Version drift stays small and nobody pays a network hop.`;
        else if (st.rate >= 8) n = `At ${st.rate} changes a month, a library leaves ~${round(libVersions, 1)} versions running at once, so "what price does Basket charge?" depends on which service you ask. A <strong>shared service</strong> gives one answer, at the cost of ${round(svcHit, 1)} consumer-incidents a month from bad releases and +${st.lat} ms per call. Volatile shared logic tends to want a service, with careful release practices.`;
        else n = `In the middle ground there's no clear winner: the library's cost is ${round(libVersions, 1)} versions live and ${fmtNum(libDeploys)} consumer deployments a month; the service's is a runtime dependency and wider blast radius. The deciding question is usually whether consumers <em>must</em> see the same rules at the same time.`;
        q(`note`).innerHTML = note(n, st.rate >= 8 ? `warn` : `good`);
      };
      wireRanges(el, st, { rate: v => v + `/mo`, lag: v => v + ` weeks`, risk: v => v + `%`, lat: v => v + ` ms` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch9 - Eventual consistency patterns
  // =====================================================================
  D.consistencyWindow = {
    title: `Eventual consistency: how long are copies out of date?`,
    blurb: `A customer changes their delivery address in the account service; delivery and billing keep copies. Compare the three patterns: a background job that reconciles every N minutes, an orchestrated request that updates all three before replying, and an event the account service publishes for the others to consume. A read is stale if it arrives after an update but before the copy catches up.`,
    mount(el) {
      const st = { batch: 60, lag: 2, hop: 60, upd: 2, av: 99.9 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`batch interval`, rng(`batch`, 5, 240, 5, st.batch))}${ctl(`event delivery lag`, rng(`lag`, 0.2, 30, 0.2, st.lag))}${ctl(`latency per service call`, rng(`hop`, 10, 300, 10, st.hop))}</div>
        <div class="ctl-row">${ctl(`updates per record per day`, rng(`upd`, 0.1, 50, 0.1, st.upd))}${ctl(`availability of each service`, rng(`av`, 99, 99.99, 0.01, st.av))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Average time a copy is out of date</h4><div data-k="lagb"></div></div>
          <div class="lab-panel"><h4>Share of reads that see stale data</h4><div data-k="stale"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px;overflow-x:auto"><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const u = st.upd / 86400, a = st.av / 100;
        const P = [
          { n: `background sync`, lag: st.batch * 60 / 2, user: st.hop / 1000, wa: a, cpl: `high: job reads every store` },
          { n: `orchestrated request`, lag: 0, user: (3 * st.hop) / 1000, wa: a * a * a, cpl: `high: account calls both` },
          { n: `event-based`, lag: st.lag, user: st.hop / 1000, wa: a, cpl: `low: publish and forget` }
        ];
        P.forEach(p => { p.stale = 1 - Math.exp(-u * p.lag); });
        q(`lagb`).innerHTML = hbars(P.map(p => ({ label: p.n, value: Math.log10(1 + p.lag), text: p.lag ? fmtDur(p.lag) : `0 (if all succeed)`, cls: p.lag > 600 ? `bad` : p.lag > 10 ? `warn` : `good` })), Math.log10(1 + 7200));
        q(`stale`).innerHTML = hbars(P.map(p => ({ label: p.n, value: p.stale, text: p.stale < 1e-4 ? `< 0.01%` : pct(p.stale, 2), cls: p.stale > 0.01 ? `bad` : p.stale > 0.001 ? `warn` : `good` })));
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>pattern</th><th class="num">user waits</th><th class="num">update succeeds</th><th>coupling</th></tr>${P.map(p => `<tr><td>${p.n}</td><td class="num">${fmtDur(p.user)}</td><td class="num">${nines(p.wa)}</td><td>${p.cpl}</td></tr>`).join(``)}</table>`;
        const ev = P[2], bg = P[0];
        q(`note`).innerHTML = note(`The orchestrated request is the only pattern with no stale window, and it pays twice: the customer waits ${fmtDur(P[1].user)} for three calls, and the update fails whenever any of the three services is down (${nines(P[1].wa)}). Events give a ${fmtDur(ev.lag)} window with loose coupling; the batch job's window averages ${fmtDur(bg.lag)} and the job has to know every schema it reconciles. For an address used to plan tomorrow's deliveries, seconds of staleness are harmless. For a payment method charged at checkout, they may not be.`, `good`);
      };
      wireRanges(el, st, { batch: v => v + ` min`, lag: v => round(v, 1) + ` s`, hop: v => v + ` ms`, upd: v => round(v, 1), av: v => round(v, 2) + `%` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch10 - Distributed data access patterns
  // =====================================================================
  D.dataAccess = {
    title: `Reading data you don't own: four patterns`,
    blurb: `Basket's delivery service needs customer addresses owned by the customer service. Set the size of the data, how often it changes and is read, and what the reader needs. Each pattern is checked for feasibility and rated on latency, freshness, availability and load on the owner. Assumed: 300 bytes per address row, 6 reader instances, and an owner that runs at the availability you set.`,
    mount(el) {
      const st = { rows: 6, reads: 400, upd: 5, mem: 2, fresh: `secs`, ownAv: 99.9 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`rows needed`, rng(`rows`, 3, 8, 0.1, st.rows))}${ctl(`reads per second`, rng(`reads`, 10, 5000, 10, st.reads))}${ctl(`updates per second`, rng(`upd`, 0, 500, 1, st.upd))}</div>
        <div class="ctl-row">${ctl(`memory per reader instance for a cache`, rng(`mem`, 0.25, 16, 0.25, st.mem))}${ctl(`freshness`, seg(`fresh`, [[`secs`, `seconds of lag OK`], [`now`, `must be current`]], st.fresh))}${ctl(`owner availability`, rng(`ownAv`, 99, 99.99, 0.01, st.ownAv))}</div>
        <div class="lab-panel" style="overflow-x:auto"><div data-k="tbl"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>Fit for these requirements</h4><div data-k="bars"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const rows = Math.pow(10, st.rows), bytes = rows * 300, a = st.ownAv / 100;
        const cacheFits = bytes < st.mem * 1e9 * 0.5;
        const P = [
          { n: `interservice call`, lat: 8 + Math.min(40, st.reads / 200), fresh: `current`, av: a * 0.9999, load: st.reads, ok: true, why: `` },
          { n: `column replication`, lat: 1, fresh: `~1 s behind`, av: 0.9995, load: st.upd, ok: st.fresh !== `now`, why: `copies lag the owner` },
          { n: `replicated cache`, lat: 0.05, fresh: `~100 ms behind`, av: 0.9999, load: st.upd, ok: cacheFits && st.fresh !== `now` && st.upd < 200, why: !cacheFits ? `${fmtNum(bytes / 1e9, 1)} GB won't fit in ${st.mem} GB per instance` : st.upd >= 200 ? `update rate too high to replicate to every instance` : `copies lag the owner` },
          { n: `data domain`, lat: 1.5, fresh: `current`, av: 0.9995, load: 0, ok: true, why: `` }
        ];
        P.forEach(p => {
          const sLat = p.lat < 1 ? 5 : p.lat < 5 ? 4 : p.lat < 15 ? 3 : 2;
          const sAv = p.av > 0.9995 ? 5 : p.av > 0.999 ? 4 : p.av > 0.995 ? 3 : 2;
          const sLoad = p.load / Math.max(1, st.reads) > 0.5 ? 2 : 5;
          const sOwn = p.n === `data domain` ? 1 : p.n === `interservice call` ? 5 : 3;
          p.score = p.ok ? (sLat + sAv + sLoad + sOwn) / 20 : 0;
        });
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>pattern</th><th class="num">read latency</th><th>freshness</th><th class="num">read availability</th><th class="num">reads/s hitting owner</th><th>feasible?</th></tr>${P.map(p => `<tr class="${p.ok ? `` : `dim`}"><td>${p.n}</td><td class="num">${p.lat < 1 ? round(p.lat * 1000, 0) + ` µs` : round(p.lat, 1) + ` ms`}</td><td>${p.fresh}</td><td class="num">${nines(p.av)}</td><td class="num">${fmtNum(p.load, 0)}</td><td>${p.ok ? chip(`yes`, `ok`) : chip(`no`, `no`) + ` ${muted(esc(p.why))}`}</td></tr>`).join(``)}</table>`;
        const best = P.reduce((b, p) => p.score > b.score ? p : b, P[0]);
        q(`bars`).innerHTML = hbars(P.map(p => ({ label: p.n, value: p.score, text: p.ok ? pct(p.score) : `ruled out`, cls: p === best ? `good` : p.ok ? `muted` : `bad` })), 1);
        let n = `For ${fmtNum(rows, 0)} rows (${fmtNum(bytes / 1e6, 0)} MB) read ${fmtNum(st.reads, 0)} times a second, <strong>${best.n}</strong> fits best under this lab's simple scoring (latency, read availability, owner load and how cleanly ownership stays with the customer service). `;
        if (best.n === `interservice call`) n += `Freshness rules out copies, so every read pays a network hop and fails when the owner does (${nines(a)}).`;
        else if (best.n === `replicated cache`) n += `The data is small and slow-changing enough to live in every reader's memory, so reads are local and survive owner outages once the cache has loaded.`;
        else if (best.n === `column replication`) n += `Reads become local and survive owner outages; the price is a sync mechanism and a copy that must stay read-only.`;
        else n += `Sharing the schema keeps data current and fast, but widens the bounded context: schema changes now need both teams.`;
        q(`note`).innerHTML = note(n, `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { rows: v => fmtNum(Math.pow(10, v), 0), reads: v => fmtNum(v, 0), upd: v => v, mem: v => v + ` GB`, ownAv: v => round(v, 2) + `%` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch11 - Orchestration vs choreography, simulated
  // =====================================================================
  D.workflowSim = {
    title: `Orchestration vs choreography: run 1,000 orders`,
    blurb: `An order workflow of N steps (payment, stock, picking, ...). Each step fails with the probability you set; a failure means earlier steps must be compensated. Orchestration: the orchestrator sends a command and gets a reply for each step (2 messages), and sends compensations itself. Choreography: each step emits one event, and a failure event makes every completed step compensate. Assumed one network hop per message.`,
    mount(el) {
      const st = { n: 5, p: 3, hop: 20, seed: 1 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`steps`, rng(`n`, 3, 10, 1, st.n))}${ctl(`failure chance per step`, rng(`p`, 0, 15, 0.5, st.p))}${ctl(`latency per hop`, rng(`hop`, 5, 100, 5, st.hop))}<button class="lab-btn ghost" data-act="again">Run another 1,000</button></div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Orchestration</h4><div class="stat-row" data-k="o"></div></div>
          <div class="lab-panel"><h4>Choreography</h4><div class="stat-row" data-k="c"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>Where failure handling lives</h4><div data-k="h"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) { st.seed++; draw(); } });
      const draw = () => {
        const r = mulberry32(st.seed * 7919);
        const N = 1000, n = st.n, p = st.p / 100;
        let ok = 0, oMsg = 0, cMsg = 0, oLat = 0, cLat = 0, comp = 0;
        for (let i = 0; i < N; i++) {
          let fail = -1;
          for (let k = 0; k < n; k++) if (r() < p) { fail = k; break; }
          if (fail < 0) { ok++; oMsg += 2 * n; cMsg += n; oLat += 2 * n; cLat += n; }
          else { oMsg += 2 * (fail + 1) + 2 * fail; cMsg += (fail + 1) + fail; oLat += 2 * (fail + 1) + 2 * fail; cLat += (fail + 1) + 1; comp += fail; }
        }
        const oHandlers = n, cHandlers = (n * (n - 1)) / 2;
        q(`o`).innerHTML = stat(`orders completed`, pct(ok / N, 1)) + stat(`messages / order`, round(oMsg / N, 1)) + stat(`avg latency`, Math.round((oLat / N) * st.hop) + ` ms`, `warn`) + stat(`status query`, `1 call`, `good`);
        q(`c`).innerHTML = stat(`orders completed`, pct(ok / N, 1)) + stat(`messages / order`, round(cMsg / N, 1)) + stat(`avg latency`, Math.round((cLat / N) * st.hop) + ` ms`, `good`) + stat(`status query (stateless)`, `${n} calls`, `bad`);
        q(`h`).innerHTML = hbars([
          { label: `orchestrator: failure branches, one place`, value: oHandlers, text: `${oHandlers} in 1 service`, cls: `good` },
          { label: `choreography: compensation handlers`, value: cHandlers, text: `${cHandlers} across ${n - 1} services`, cls: cHandlers > 15 ? `bad` : `warn` }
        ]) + `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">${comp} compensations ran across the 1,000 orders.</div>`;
        q(`note`).innerHTML = note(`Choreography halves the messages and the latency (${Math.round((cLat / N) * st.hop)} vs ${Math.round((oLat / N) * st.hop)} ms), with no coordinator to scale or lose. But each step must listen for the failure of every later step, so handlers grow as n(n−1)/2: ${cHandlers} for ${n} steps, spread over services that each see only part of the flow. The orchestrator keeps ${oHandlers} branches in one place and can answer "where is order 4711?" with one lookup. ${st.p >= 5 ? `At a ${st.p}% failure rate per step, error handling dominates: orchestration's case gets stronger.` : `With rare failures and few steps, choreography's speed is cheap to have.`}`, st.p >= 5 || n >= 7 ? `warn` : `good`);
      };
      wireRanges(el, st, { p: v => v + `%`, hop: v => v + ` ms` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch12 - Saga explorer
  // =====================================================================
  const SAGA = {
    "sync-atomic-orch": `Epic Saga`, "sync-atomic-chor": `Phone Tag Saga`, "sync-eventual-orch": `Fairy Tale Saga`, "sync-eventual-chor": `Time Travel Saga`,
    "async-atomic-orch": `Fantasy Fiction Saga`, "async-atomic-chor": `Horror Story Saga`, "async-eventual-orch": `Parallel Saga`, "async-eventual-chor": `Anthology Saga`
  };
  D.sagaExplorer = {
    title: `Saga explorer: three choices, eight shapes`,
    blurb: `Pick communication, consistency and coordination for Basket's order saga (Order → Payment → Stock → Delivery) and see which named saga you get, how messages flow, and what happens when stock runs out. The ratings come from a simple additive model of the chapter's reasoning (sync and atomic hurt responsiveness and scale; atomic and choreography add complexity; orchestration adds coupling), not from the book's own table.`,
    mount(el) {
      const st = { com: `sync`, con: `atomic`, coo: `orch`, fail: `ok` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`communication`, seg(`com`, [[`sync`, `synchronous`], [`async`, `asynchronous`]], st.com))}${ctl(`consistency`, seg(`con`, [[`atomic`, `atomic`], [`eventual`, `eventual`]], st.con))}${ctl(`coordination`, seg(`coo`, [[`orch`, `orchestrated`], [`chor`, `choreographed`]], st.coo))}${ctl(`scenario`, seg(`fail`, [[`ok`, `happy path`], [`stock`, `stock runs out`]], st.fail))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4 data-k="name"></h4><div data-k="svg"></div></div>
          <div class="lab-panel"><h4>Ratings (1-5)</h4><div data-k="bars"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const s = st.com === `sync` ? 1 : 0, a = st.con === `atomic` ? 1 : 0, o = st.coo === `orch` ? 1 : 0;
        const name = SAGA[`${st.com}-${st.con}-${st.coo}`];
        const R = {
          coupling: clamp(1 + 1.5 * s + 1.5 * a + o, 1, 5),
          complexity: clamp(1 + 1.25 * a + 0.5 * (1 - s) + (1 - o) * (1 + a), 1, 5),
          responsiveness: clamp(5 - 1.75 * s - 1.25 * a - 0.5 * o, 1, 5),
          scale: clamp(5 - 1.5 * s - 1.5 * a - 0.75 * o, 1, 5)
        };
        q(`name`).textContent = `${name} · ${st.com === `sync` ? `sync` : `async`}, ${st.con}, ${o ? `orchestrated` : `choreographed`}`;
        const svcs = [`Order`, `Payment`, `Stock`, `Delivery`];
        const X = i => 80 + i * 160, Y = o ? 190 : 120;
        const fail = st.fail === `stock`;
        let g = `<defs><marker id="sg-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill:var(--text-muted)"/></marker><marker id="sg-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill:var(--bad)"/></marker></defs>`;
        const dash = s ? `` : `stroke-dasharray="6 5"`;
        if (a) g += `<rect x="12" y="${Y - 45}" width="616" height="90" rx="12" style="fill:var(--bad);opacity:.07;stroke:var(--bad)" stroke-dasharray="4 4"/><text x="20" y="${Y + 38}" font-size="11" style="fill:var(--bad)">all-or-nothing: earlier steps must be undone on failure</text>`;
        if (o) {
          g += `<rect x="250" y="20" width="140" height="44" rx="9" style="fill:var(--bg-3);stroke:var(--accent);stroke-width:2"/><text x="320" y="47" text-anchor="middle" font-size="13" font-weight="700" style="fill:var(--text)">Orchestrator</text>`;
          svcs.forEach((sv, i) => {
            const reached = !fail || i <= 2;
            if (!reached) return;
            g += `<line x1="${320 + (i - 1.5) * 30}" y1="64" x2="${X(i)}" y2="${Y - 24}" style="stroke:${fail && i === 2 ? `var(--bad)` : `var(--text-muted)`};stroke-width:1.8" ${dash} marker-end="url(#${fail && i === 2 ? `sg-bad` : `sg-arr`})"/>`;
            g += `<text x="${(320 + (i - 1.5) * 30 + X(i)) / 2 + (i < 2 ? -14 : 14)}" y="${(64 + Y - 24) / 2}" text-anchor="middle" font-size="11" style="fill:var(--text-muted)">${i + 1}</text>`;
          });
        } else {
          for (let i = 0; i < 3; i++) {
            if (fail && i >= 2) break;
            g += `<line x1="${X(i) + 55}" y1="${Y}" x2="${X(i + 1) - 55}" y2="${Y}" style="stroke:var(--text-muted);stroke-width:1.8" ${dash} marker-end="url(#sg-arr)"/>`;
            g += `<text x="${(X(i) + X(i + 1)) / 2}" y="${Y - 8}" text-anchor="middle" font-size="11" style="fill:var(--text-muted)">${s ? `calls` : `event`}</text>`;
          }
        }
        if (fail) {
          if (o) g += `<path d="M ${X(1)} ${Y + 24} Q ${X(1)} ${Y + 70} ${X(0) + 30} ${Y + 70}" style="fill:none;stroke:var(--bad);stroke-width:1.6" stroke-dasharray="3 3"/>`;
          else g += `<path d="M ${X(2) - 40} ${Y + 22} Q ${X(1)} ${Y + 75} ${X(0) + 20} ${Y + 24}" style="fill:none;stroke:var(--bad);stroke-width:1.6" stroke-dasharray="3 3" marker-end="url(#sg-bad)"/>`;
          g += `<text x="${X(1)}" y="${Y + 88}" text-anchor="middle" font-size="11" style="fill:var(--bad)">${a ? `refund payment, cancel order` : `order → NO_STOCK state`}</text>`;
        }
        svcs.forEach((sv, i) => {
          const dim = fail && i === 3;
          const bad = fail && i === 2;
          g += `<rect x="${X(i) - 55}" y="${Y - 22}" width="110" height="44" rx="8" style="fill:var(--bg-3);stroke:${bad ? `var(--bad)` : `var(--border)`};stroke-width:${bad ? 2.5 : 1.5};opacity:${dim ? 0.35 : 1}"/>`;
          g += `<text x="${X(i)}" y="${Y + 5}" text-anchor="middle" font-size="13" font-weight="600" style="fill:var(--text);opacity:${dim ? 0.4 : 1}">${sv}</text>`;
          if (!a && !dim) g += `<text x="${X(i)}" y="${Y - 28}" text-anchor="middle" font-size="11" style="fill:var(--good)">local commit</text>`;
        });
        q(`svg`).innerHTML = svgWrap(640, 300, g) + `<div class="legend"><span><i class="sw line" style="background:var(--text-muted)"></i>${s ? `synchronous: caller waits` : `asynchronous (dashed): caller moves on`}</span></div>`;
        q(`bars`).innerHTML = hbars([
          { label: `coupling (lower is better)`, value: R.coupling, text: round(R.coupling, 1), cls: R.coupling >= 4 ? `bad` : R.coupling >= 3 ? `warn` : `good` },
          { label: `complexity (lower is better)`, value: R.complexity, text: round(R.complexity, 1), cls: R.complexity >= 4 ? `bad` : R.complexity >= 3 ? `warn` : `good` },
          { label: `responsiveness, availability`, value: R.responsiveness, text: round(R.responsiveness, 1), cls: R.responsiveness <= 2 ? `bad` : R.responsiveness < 3.5 ? `warn` : `good` },
          { label: `scale, elasticity`, value: R.scale, text: round(R.scale, 1), cls: R.scale <= 2 ? `bad` : R.scale < 3.5 ? `warn` : `good` }
        ], 5);
        const why = {
          "Epic Saga": `It reproduces the monolith's transaction across the network: familiar, but every service must be up, the customer waits for every call, and if the refund itself fails you're inconsistent anyway.`,
          "Phone Tag Saga": `Without an orchestrator, the failure has to be passed back along the chain of callers, each undoing its own work. The happy path is a little faster than Epic; the error path is much harder to get right.`,
          "Fairy Tale Saga": `A pragmatic favourite: the orchestrator keeps the flow readable and handles errors, and each service commits locally, so no distributed locking. Responsiveness is still bounded by synchronous calls.`,
          "Time Travel Saga": `A chain of synchronous calls with local commits: simple for linear, high-throughput pipelines, confusing as soon as a flow branches or fails often.`,
          "Fantasy Fiction Saga": `Asynchrony makes atomicity harder, not easier: the orchestrator has to track many in-flight orders and their partial results, and the customer may see a confirmed order get rolled back.`,
          "Horror Story Saga": `The combination to avoid: atomicity with asynchronous events and no coordinator. Every service must track pending work and react to out-of-order failures from the others. It usually happens by accident, when teams adopt events but keep monolith expectations.`,
          "Parallel Saga": `Asynchronous requests, local commits, and an orchestrator that owns error handling and status: responsive and scalable, with a single place to answer "where is my order?". A strong default for complex flows at scale.`,
          "Anthology Saga": `The loosest shape: events, local commits, no coordinator. Excellent scale; but the workflow exists only as the sum of event handlers, so complex flows and failures get hard to follow.`
        }[name];
        const failTxt = fail ? (a ? ` <strong>Stock runs out:</strong> the payment already succeeded, so it must be refunded and the order cancelled to restore the all-or-nothing illusion${o ? `, driven by the orchestrator` : `, coordinated by services passing the failure backwards`}. Other services may already have seen the paid order.` : ` <strong>Stock runs out:</strong> nothing is rolled back. The order moves to a <code>NO_STOCK</code> state the business understands (offer a substitute, partial refund or cancel), which is the state-machine alternative to compensation.`) : ``;
        q(`note`).innerHTML = note(`<strong>${name}.</strong> ${why}${failTxt}`, name === `Horror Story Saga` || name === `Epic Saga` ? `bad` : a ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch13 - Contract strictness and breaking changes
  // =====================================================================
  const CB_FIELDS = { id: 40, name: 30, email: 40, phone: 20, addresses: 600, loyaltyTier: 10, orderHistory: 38000, preferences: 1200 };
  const CB_CONSUMERS = [
    { n: `Delivery`, uses: [`id`, `phone`, `addresses`] },
    { n: `Marketing`, uses: [`id`, `email`, `name`, `loyaltyTier`] },
    { n: `Support`, uses: [`id`, `name`, `email`, `phone`] }
  ];
  const CB_CHANGES = {
    add: { label: `add optional field`, touches: null, desc: `adds <code>preferredSlot</code>` },
    rename: { label: `rename phone → mobile`, touches: `phone`, desc: `renames <code>phone</code> to <code>mobile</code>` },
    remove: { label: `remove loyaltyTier`, touches: `loyaltyTier`, desc: `removes <code>loyaltyTier</code>` },
    retype: { label: `postcode string → object`, touches: `addresses`, desc: `changes the address postcode from a string to an object` }
  };
  D.contractBreak = {
    title: `Contracts: which consumers break?`,
    blurb: `The customer service returns a customer document; three consumers use different parts of it. Choose a contract style and a change to the provider. Strict here means consumers validate against a closed schema (unknown or missing fields are errors); loose means consumers read the fields they need and ignore the rest; consumer-driven contracts (CDC) add each consumer's expectations as tests in the provider's build.`,
    mount(el) {
      const st = { style: `loose`, ch: `rename`, calls: 500 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`contract style`, seg(`style`, [[`strict`, `strict (closed schema)`], [`loose`, `loose`], [`cdc`, `loose + consumer-driven tests`]], st.style))}</div>
        <div class="ctl-row">${ctl(`provider change`, seg(`ch`, Object.keys(CB_CHANGES).map(k => [k, CB_CHANGES[k].label]), st.ch))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Effect on consumers</h4><div data-k="tbl"></div></div>
          <div class="lab-panel"><h4>Stamp coupling: payload vs what's used</h4><div class="ctl-row">${ctl(`calls per second`, rng(`calls`, 10, 5000, 10, st.calls))}</div><div data-k="stamp"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const C = CB_CHANGES[st.ch];
        const res = CB_CONSUMERS.map(c => {
          const affected = st.style === `strict` ? true : C.touches ? c.uses.includes(C.touches) : false;
          if (!affected) return { c, r: chip(`unaffected`, `ok`), bad: 0 };
          if (st.style === `cdc`) return { c, r: chip(`caught in provider build`, `final`), bad: 0, caught: 1 };
          return { c, r: chip(`breaks in production`, `no`), bad: 1 };
        });
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>consumer</th><th>reads</th><th>result</th></tr>${res.map(x => `<tr><td>${x.c.n}</td><td style="white-space:normal">${x.c.uses.join(`, `)}</td><td>${x.r}</td></tr>`).join(``)}</table>`;
        const full = sum(Object.values(CB_FIELDS));
        q(`stamp`).innerHTML = hbars([{ label: `full document`, value: full, text: fmtNum(full / 1000, 1) + ` KB`, cls: `bad` }, ...CB_CONSUMERS.map(c => { const u = sum(c.uses.map(f => CB_FIELDS[f])); return { label: `${c.n} uses`, value: u, text: fmtNum(u / 1000, 2) + ` KB` + ` (${pct(u / full, 1)})`, cls: `good` }; })]) + `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">At ${fmtNum(st.calls, 0)} calls/s the full document is ${round((full * st.calls) / 1e6, 1)} MB/s; Delivery needs ${round((sum(CB_CONSUMERS[0].uses.map(f => CB_FIELDS[f])) * st.calls) / 1e6, 2)} MB/s of it.</div>`;
        const broken = sum(res.map(x => x.bad)), caught = sum(res.map(x => x.caught || 0));
        let n = `The provider ${C.desc}. `;
        if (st.style === `strict`) n += `With closed schemas, <strong>every consumer breaks</strong>, even ones that never read the field, so even additive changes need a new version run alongside the old one. Fine inside a quantum where releases are coordinated; costly between teams.`;
        else if (st.style === `loose`) n += broken ? `${broken} consumer${broken > 1 ? `s break` : ` breaks`} in production, and the provider had no way to know. Loose contracts move contract checking out of the compiler, so something else has to do it.` : `No consumer reads what changed, so nothing breaks: loose contracts let providers evolve freely.`;
        else n += caught ? `The change would break ${caught} consumer${caught > 1 ? `s` : ``}, but their contract tests fail in the <strong>provider's</strong> build, before release. The provider can negotiate, add the new field alongside the old one, or version the change. Everything no consumer depends on stays free to change.` : `No consumer test covers the change, so it ships without coordination.`;
        q(`note`).innerHTML = note(n, broken ? `bad` : caught ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { calls: v => fmtNum(v, 0) + `/s` }, draw);
      draw();
    }
  };
})();
