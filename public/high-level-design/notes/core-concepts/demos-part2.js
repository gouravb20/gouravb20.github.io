// Core concepts labs, part 2: API design, data modeling, database indexing (chapters 7-11)
(function () {
  "use strict";
  const { esc, clamp, sum, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, fmtNum, fmtBytes, pct, words, STOP } = window.LabKit;
  const D = window.DEMOS;
  const ms = v => v >= 1000 ? round(v / 1000, 2) + ` s` : v >= 10 ? Math.round(v) + ` ms` : round(v, 2) + ` ms`;
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;

  // =====================================================================
  // Ch7 - What happens when each HTTP method is retried
  // =====================================================================
  const MS_OPS = {
    post: { label: `POST /events/9/bookings`, kind: `bookings` },
    postKey: { label: `POST + Idempotency-Key`, kind: `bookings` },
    put: { label: `PUT /users/7 (full profile)`, kind: `user` },
    patchSet: { label: `PATCH /users/7 set email`, kind: `user` },
    patchAppend: { label: `PATCH /users/7 add tag`, kind: `user` },
    del: { label: `DELETE /bookings/101`, kind: `bookings` }
  };
  function msRun(op, n) {
    const s = { bookings: [101], email: `ann@old.com`, tags: [`vip`], key: null };
    let nextId = 102;
    const rows = [];
    const snap = () => MS_OPS[op].kind === `bookings` ? `bookings: [${s.bookings.join(`, `)}]` : `email: ${s.email}, tags: [${s.tags.join(`, `)}]`;
    for (let i = 1; i <= n; i++) {
      let resp;
      if (op === `post`) { s.bookings.push(nextId); resp = `201 Created #${nextId++}`; }
      else if (op === `postKey`) {
        if (s.key) resp = `201 (stored response) #${s.key}`;
        else { s.bookings.push(nextId); s.key = nextId; resp = `201 Created #${nextId++}`; }
      } else if (op === `put`) { s.email = `ann@new.com`; s.tags = [`vip`]; resp = `200 OK`; }
      else if (op === `patchSet`) { s.email = `ann@new.com`; resp = `200 OK`; }
      else if (op === `patchAppend`) { s.tags.push(`beta`); resp = `200 OK`; }
      else if (s.bookings.includes(101)) { s.bookings = s.bookings.filter(b => b !== 101); resp = `204 No Content`; }
      else resp = `404 Not Found`;
      rows.push({ i, resp, state: snap() });
    }
    return { rows, final: snap() };
  }
  D.methodSemantics = {
    title: `Retrying HTTP methods: which ones are safe to repeat?`,
    blurb: `The client sent a request, the response got lost, so it retried. The server may receive the same request several times. Pick a request and how many copies reach the server, and compare the final state with what one delivery would have produced. That comparison is exactly what <strong>idempotent</strong> means.`,
    mount(el) {
      const st = { op: `post`, n: 3 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`request`, seg(`op`, Object.keys(MS_OPS).map(k => [k, MS_OPS[k].label]), st.op))}</div>
        <div class="ctl-row">${ctl(`copies the server receives`, rng(`n`, 1, 5, 1, st.n))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Server log</h4><div data-k="log"></div></div>
          <div class="lab-panel"><h4>Verdict</h4><div data-k="verdict"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = msRun(st.op, st.n), once = msRun(st.op, 1);
        const same = R.final === once.final;
        q(`log`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>#</th><th>response</th><th>state after</th></tr>${R.rows.map(r => `<tr class="${r.i > 1 ? `new` : ``}"><td>${r.i}</td><td class="mono">${esc(r.resp)}</td><td class="mono">${esc(r.state)}</td></tr>`).join(``)}</table></div>`;
        q(`verdict`).innerHTML = `<div style="margin-bottom:8px">${same ? chip(`same as one delivery`, `ok`) : chip(`different from one delivery`, `no`)}</div>
          <div class="cs-note">After 1 delivery: <span class="mono">${esc(once.final)}</span></div>
          <div class="cs-note">After ${st.n}: <span class="mono">${esc(R.final)}</span></div>`;
        const N = {
          post: `POST creates a new resource every time it arrives, so ${st.n} copies made ${st.n} bookings and the customer may be charged ${st.n} times. POST is not idempotent; protect creates with an idempotency key.`,
          postKey: `With an idempotency key the server recognizes the repeats and returns the stored response for the first booking, so the state is the same as one delivery even though POST itself isn't idempotent.`,
          put: `PUT replaces the whole resource with the representation sent, so repeating it leaves exactly the same state. PUT is idempotent.`,
          patchSet: `A PATCH that sets a field to a value is idempotent: the email ends up the same however many times it arrives.`,
          patchAppend: `A PATCH that appends (or increments) is not idempotent: each copy adds another tag. PATCH is only as safe as the change it describes.`,
          del: `DELETE is idempotent: the first copy deletes and returns 204, later copies return 404, but the server state is the same either way. Idempotency is about state, not identical responses.`
        };
        q(`note`).innerHTML = note(st.n === 1 ? `With a single delivery every method behaves as intended. Raise the copies to see which methods survive retries.` : N[st.op], same ? `good` : `bad`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Offset vs cursor pagination on a changing feed
  // =====================================================================
  function pdRun(st, mode) {
    const L = st.size;
    let posts = [];
    for (let id = 40; id >= 1; id--) posts.push(id);
    const pages = [posts.slice(0, L)];
    const p1 = pages[0];
    const deleted = p1.slice(0, st.del);
    const added = [];
    for (let k = st.add; k >= 1; k--) added.push(40 + k);
    posts = added.concat(posts.filter(id => !deleted.includes(id)));
    let cursor = p1[p1.length - 1];
    for (let p = 2; p <= 3; p++) {
      let pg;
      if (mode === `offset`) pg = posts.slice((p - 1) * L, p * L);
      else { pg = posts.filter(id => id < cursor).slice(0, L); if (pg.length) cursor = pg[pg.length - 1]; }
      pages.push(pg);
    }
    const counts = {};
    pages.forEach(pg => pg.forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
    const seen = Object.keys(counts).map(Number);
    const low = Math.min(...seen);
    const dups = seen.filter(id => counts[id] > 1);
    const missed = posts.filter(id => id <= 40 && id >= low && !counts[id]);
    return { pages, dups, missed, deleted, added };
  }
  D.paginationDrift = {
    title: `Offset vs cursor pagination on a live feed`,
    blurb: `A feed shows posts newest first. A user reads page 1; before they scroll to page 2, new posts arrive at the top and some posts they already saw are deleted. <strong>Offset</strong> pagination asks for "skip N, take L" and <strong>cursor</strong> pagination asks for "the L posts older than the last one I saw". Watch which one shows duplicates or silently skips posts, and what deep pages cost.`,
    mount(el) {
      const st = { size: 5, add: 2, del: 0, depth: 3 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`page size`, rng(`size`, 3, 8, 1, st.size))}${ctl(`new posts before page 2`, rng(`add`, 0, 5, 1, st.add))}${ctl(`page-1 posts deleted`, rng(`del`, 0, 3, 1, st.del))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Offset: ?offset=N&amp;limit=L</h4><div data-k="offset"></div></div>
          <div class="lab-panel"><h4>Cursor: ?cursor=last_id&amp;limit=L</h4><div data-k="cursor"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>Cost of a deep page</h4><div class="ctl-row">${ctl(`page number`, rng(`depth`, 0, 5, 1, st.depth))}</div><div class="stat-row" data-k="deep"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const render = R => R.pages.map((pg, i) => `<div style="margin:6px 0"><span class="ctl-label" style="display:inline-block;width:56px">page ${i + 1}</span><span class="toks" style="display:inline">${pg.map(id => `<span class="tok c${i}" style="${R.dups.includes(id) ? `outline:2px solid var(--bad);` : ``}${id > 40 ? `font-style:italic` : ``}">#${id}</span>`).join(``) || `<span class="cs-note">empty</span>`}</span></div>`).join(``) +
        `<div class="stat-row">${stat(`duplicates`, R.dups.length, R.dups.length ? `bad` : `good`)}${stat(`skipped posts`, R.missed.length, R.missed.length ? `bad` : `good`)}</div>` +
        (R.missed.length ? `<div class="cs-note">Never shown: ${R.missed.map(id => `#${id}`).join(`, `)}</div>` : ``);
      const draw = () => {
        const O = pdRun(st, `offset`), C = pdRun(st, `cursor`);
        q(`offset`).innerHTML = render(O);
        q(`cursor`).innerHTML = render(C);
        const page = Math.pow(10, st.depth);
        const offRows = (page - 1) * st.size + st.size;
        q(`deep`).innerHTML = stat(`rows the database walks (offset)`, fmtNum(offRows), offRows > 10000 ? `bad` : ``) + stat(`rows read (cursor + index)`, st.size, `good`);
        let n;
        if (!st.add && !st.del) n = `With no changes between requests both methods return the same pages. Add new posts or delete some to see offset pagination drift.`;
        else n = `New posts push everything down by ${st.add} and deletions pull it up by ${st.del}, so offset pagination's "skip ${st.size}" lands in the wrong place: ${O.dups.length ? `${O.dups.length} posts you already saw come back (outlined)` : `no repeats`}${O.missed.length ? ` and ${O.missed.length} posts are never shown` : ``}. The cursor asks for posts older than #${C.pages[0][C.pages[0].length - 1]}, which doesn't depend on what changed above it. New posts (italic) appear when the user refreshes the top.`;
        n += ` Offset also gets slower with depth: page ${fmtNum(page)} makes the database step over ${fmtNum(offRows - st.size)} rows, while a cursor seeks straight to the position with an index.`;
        q(`note`).innerHTML = note(n, O.dups.length || O.missed.length ? `warn` : ``);
      };
      wireRanges(el, st, { size: v => v, add: v => v, del: v => v, depth: v => fmtNum(Math.pow(10, v)) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Idempotency keys under retries
  // =====================================================================
  const IK_N = 200;
  const IK_MODES = { none: `no key`, racy: `key: check, then insert`, atomic: `key: unique insert in the same transaction` };
  function ikSim(st, mode, seed) {
    const r = mulberry32(seed * 977 + 13);
    let charges = 0, dupPayments = 0, extra = 0, gaveUp = 0, chargedButFailed = 0;
    const log = [];
    for (let p = 0; p < IK_N; p++) {
      let done = false, recorded = false, mine = 0, prevSlow = false;
      const ev = [];
      for (let a = 0; a <= st.retries && !done; a++) {
        const x = r(), race = r();
        if (x < st.timeout / 200) { ev.push(`lost before server`); prevSlow = false; continue; }
        const respLost = x < st.timeout / 100;
        let charged = false;
        if (mode === `none`) charged = true;
        else if (!recorded) { charged = true; recorded = true; }
        else if (mode === `racy` && prevSlow && race < st.race / 100) charged = true;
        if (charged) { mine++; charges++; }
        ev.push(charged ? (mine > 1 ? `CHARGED AGAIN` : `charged`) : `replayed stored result`);
        if (respLost) { ev.push(`response lost, retry`); prevSlow = true; }
        else { done = true; ev.push(`client got 201`); }
      }
      if (mine > 1) { dupPayments++; extra += mine - 1; }
      if (!done) { gaveUp++; if (mine) chargedButFailed++; }
      if (log.length < 6 && ev.length > 2) log.push(ev);
    }
    return { charges, dupPayments, extra, gaveUp, chargedButFailed, log };
  }
  D.idempotencyKey = {
    title: `Idempotency keys: retrying payments without double charging`,
    blurb: `${IK_N} customers each pay $50 once. Requests time out at the chosen rate: half the time the request never reaches the server, half the time the server charges the card but the response is lost. Clients retry. Compare sending no key, a key checked and then inserted in two steps (racy when a retry arrives while the first attempt is still running), and a key inserted atomically with a unique constraint.`,
    mount(el) {
      const st = { timeout: 20, retries: 3, race: 30, mode: `none` };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`server handling`, seg(`mode`, Object.keys(IK_MODES).map(k => [k, IK_MODES[k]]), st.mode))}</div>
        <div class="ctl-row">${ctl(`timeout rate`, rng(`timeout`, 0, 50, 5, st.timeout))}${ctl(`max retries`, rng(`retries`, 0, 5, 1, st.retries))}${ctl(`retry overlaps a slow first attempt`, rng(`race`, 0, 60, 10, st.race))}</div>
        <div class="ctl-row"><button class="lab-btn ghost" data-act="again">New random run</button></div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Duplicate charges by approach</h4><div data-k="cmp"></div><div class="stat-row" data-k="stats"></div></div>
          <div class="lab-panel"><h4>Sample payments with retries</h4><div data-k="log"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = ikSim(st, st.mode, seed);
        const all = Object.keys(IK_MODES).map(m => ({ m, r: ikSim(st, m, seed) }));
        const mx = Math.max(1, ...all.map(a => a.r.extra));
        const short = { none: `no key`, racy: `check, then insert`, atomic: `atomic insert` };
        q(`cmp`).innerHTML = hbars(all.map(a => ({ label: short[a.m], title: IK_MODES[a.m], value: a.r.extra, max: mx, text: `${a.r.extra} extra ($${fmtNum(a.r.extra * 50)})`, cls: a.r.extra ? (a.m === st.mode ? `bad` : `warn`) : `good` })), mx);
        q(`stats`).innerHTML = stat(`customers double charged`, R.dupPayments, R.dupPayments ? `bad` : `good`) + stat(`overcharged`, `$` + fmtNum(R.extra * 50), R.extra ? `bad` : `good`) + stat(`gave up after retries`, R.gaveUp, R.gaveUp ? `warn` : ``) + stat(`charged but saw an error`, R.chargedButFailed, R.chargedButFailed ? `bad` : ``);
        q(`log`).innerHTML = R.log.length ? R.log.map(ev => `<div class="log" style="margin-bottom:6px">${ev.map(e => `<span class="${/AGAIN/.test(e) ? `bad` : /replayed/.test(e) ? `ok` : /lost/.test(e) ? `dup` : `info`}">${esc(e)}</span>`).join(` &rarr; `)}</div>`).join(``) : `<div class="cs-note">No payment needed a retry. Raise the timeout rate.</div>`;
        const N = {
          none: `Without a key the server can't tell a retry from a new payment, so every lost response that gets retried charges the card again: ${R.extra} extra charges. "Just don't retry" isn't an option either: ${R.gaveUp} customers would then see failures for payments that may have gone through.`,
          racy: `The key fixes most duplicates, but checking for it and inserting it are separate steps. When a retry arrives while the first attempt is still processing, both see "no key yet" and both charge: ${R.extra} extra charges. Make the key insert atomic.`,
          atomic: `Inserting the key with a unique constraint in the same transaction as the charge means exactly one attempt wins; every retry gets the stored result. Zero duplicate charges no matter how often clients retry.`
        };
        q(`note`).innerHTML = note(N[st.mode] + (R.chargedButFailed ? ` Note the ${R.chargedButFailed} customers charged whose client gave up: with a key, a later retry (even hours later) would safely return the original result.` : ``), R.extra ? `bad` : `good`);
      };
      el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) { seed++; draw(); } });
      wireSegs(el, st, draw);
      wireRanges(el, st, { timeout: v => v + `%`, retries: v => v, race: v => v + `%` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Rate limiting: fixed window, sliding log, token bucket
  // =====================================================================
  const RL_W = 10, RL_T = 30;
  const RL_ALGOS = { fixed: `fixed window`, sliding: `sliding window log`, bucket: `token bucket` };
  function rlTraffic(pattern, L, seed) {
    const r = mulberry32(seed * 31 + L);
    const t = [];
    const poisson = (rate, a, b) => { let x = a - Math.log(1 - r()) / rate; while (x < b) { t.push(x); x -= Math.log(1 - r()) / rate; } };
    if (pattern === `steady`) poisson(1.5 * L / 10, 0, RL_T);
    else if (pattern === `bursty`) { poisson(0.3 * L / 10, 0, RL_T); [4, 13, 22].forEach(b => { for (let i = 0; i < Math.round(L * 1.5); i++) t.push(b + r() * 0.8); }); }
    else { poisson(0.15 * L / 10, 0, RL_T); for (let i = 0; i < L; i++) { t.push(9 + i * 0.9 / L); t.push(10.05 + i * 0.9 / L); } }
    return t.filter(x => x < RL_T).sort((a, b) => a - b);
  }
  function rlRun(algo, times, L) {
    const acc = [];
    if (algo === `fixed`) { const cnt = {}; times.forEach(x => { const w = Math.floor(x / RL_W); cnt[w] = cnt[w] || 0; if (cnt[w] < L) { cnt[w]++; acc.push(true); } else acc.push(false); }); }
    else if (algo === `sliding`) { const log = []; times.forEach(x => { while (log.length && log[0] <= x - RL_W) log.shift(); if (log.length < L) { log.push(x); acc.push(true); } else acc.push(false); }); }
    else { let tok = L, last = 0; times.forEach(x => { tok = Math.min(L, tok + (x - last) * L / RL_W); last = x; if (tok >= 1) { tok -= 1; acc.push(true); } else acc.push(false); }); }
    const at = times.filter((_, i) => acc[i]);
    let maxWin = 0, j = 0;
    for (let i = 0; i < at.length; i++) { while (at[j] <= at[i] - RL_W) j++; maxWin = Math.max(maxWin, i - j + 1); }
    let maxSec = 0, k = 0;
    for (let i = 0; i < at.length; i++) { while (at[k] <= at[i] - 1) k++; maxSec = Math.max(maxSec, i - k + 1); }
    return { acc, accepted: at.length, rejected: times.length - at.length, maxWin, maxSec };
  }
  D.rateLimiter = {
    title: `Rate limiters compared: fixed window, sliding log, token bucket`,
    blurb: `A client may make <strong>L requests per ${RL_W} seconds</strong>. Three classic algorithms enforce it differently. The <strong>fixed window</strong> counts per calendar window, the <strong>sliding window log</strong> counts the exact last ${RL_W} seconds, and the <strong>token bucket</strong> holds up to L tokens refilled at L per ${RL_W} s. Feed them the same traffic and compare what gets through.`,
    mount(el) {
      const st = { pattern: `boundary`, L: 10 };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`traffic`, seg(`pattern`, [[`steady`, `steady, 1.5x the limit`], [`bursty`, `bursts`], [`boundary`, `burst across a window edge`]], st.pattern))}${ctl(`limit L per ${RL_W} s`, rng(`L`, 5, 20, 1, st.L))}</div>
        <div class="ctl-row"><button class="lab-btn ghost" data-act="again">New random run</button></div>
        <div class="lab-panel"><h4>Requests over time</h4><div data-k="chart"></div>
          <div class="legend"><span><i class="sw" style="background:var(--good)"></i>allowed</span><span><i class="sw" style="background:var(--bad)"></i>rejected with 429</span><span><i class="sw line" style="background:var(--text-muted)"></i>fixed window boundaries</span></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>Results</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const times = rlTraffic(st.pattern, st.L, seed);
        const res = Object.keys(RL_ALGOS).map(a => ({ a, r: rlRun(a, times, st.L) }));
        const W = 520, L0 = 120, X = t => L0 + (t / RL_T) * (W - L0 - 8), RH = 34;
        let s = ``;
        for (let w = 0; w <= RL_T; w += RL_W) s += `<line x1="${X(w)}" x2="${X(w)}" y1="0" y2="${res.length * RH}" style="stroke:var(--text-muted);stroke-dasharray:3 3"/><text class="svg-label" x="${X(w)}" y="${res.length * RH + 12}" text-anchor="middle">${w}s</text>`;
        res.forEach((x, i) => {
          const y = i * RH + 6;
          s += `<text class="svg-label" x="${L0 - 8}" y="${y + 14}" text-anchor="end">${RL_ALGOS[x.a]}</text>`;
          times.forEach((t, k) => { s += `<rect x="${X(t) - 1}" y="${x.r.acc[k] ? y + 2 : y + 12}" width="2.2" height="${x.r.acc[k] ? 18 : 8}" style="fill:${x.r.acc[k] ? `var(--good)` : `var(--bad)`}"/>`; });
        });
        q(`chart`).innerHTML = svgWrap(W, res.length * RH + 18, s);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>algorithm</th><th class="num">allowed</th><th class="num">rejected</th><th class="num">most allowed in any ${RL_W} s</th><th class="num">most in any 1 s</th><th>state per client</th></tr>${res.map(x => `<tr><td>${RL_ALGOS[x.a]}</td><td class="num">${x.r.accepted}</td><td class="num">${x.r.rejected}</td><td class="num" style="${x.r.maxWin > st.L ? `color:var(--bad);font-weight:700` : ``}">${x.r.maxWin}${x.r.maxWin > st.L ? ` (&gt; L)` : ``}</td><td class="num">${x.r.maxSec}</td><td>${x.a === `fixed` ? `1 counter` : x.a === `sliding` ? `up to L timestamps` : `token count + time`}</td></tr>`).join(``)}</table></div><div class="cs-note">${times.length} requests in ${RL_T} s.</div>`;
        const fx = res[0].r;
        const N = {
          boundary: `The client sends L requests just before a window edge and L just after. The fixed window resets its counter at the edge, so it lets ${fx.maxWin} through within ${RL_W} seconds, ${round(fx.maxWin / st.L, 1)}x the limit. The sliding log never exceeds L in any ${RL_W} s span. The token bucket allows a burst up to L, then only the refill rate.`,
          bursty: `Bursts of ${Math.round(st.L * 1.5)} requests arrive at once. The token bucket absorbs up to L of each burst and rejects the rest, then refills; that burst allowance is why it's the most common choice for API limits. The sliding log is exact but stores a timestamp per request.`,
          steady: `Traffic runs at 1.5x the limit, so every algorithm rejects about a third. They differ only at the edges: the fixed window lets small bursts through at boundaries, and the token bucket smooths admissions to its refill rate.`
        };
        q(`note`).innerHTML = note(N[st.pattern] + ` In production the counters live in a shared store such as Redis so every gateway instance enforces the same limit, and rejected requests get 429 with a Retry-After header.`, st.pattern === `boundary` ? `warn` : ``);
      };
      el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) { seed++; draw(); } });
      wireSegs(el, st, draw);
      wireRanges(el, st, { L: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch9 - Normalized vs denormalized vs normalized + cache
  // =====================================================================
  const DN_MODELS = { norm: `normalized`, denorm: `denormalized`, cache: `normalized + cached feed` };
  function dnCost(st, m) {
    const page = 20, hit = 0.95;
    const normRead = page + page + page;
    const c = {
      norm: { read: normRead, like: 1, rename: 1, copies: 1, stale: `none` },
      denorm: { read: page, like: 2, rename: st.posts, copies: st.posts + 1, stale: `until every copy is updated` },
      cache: { read: hit * 1 + (1 - hit) * normRead, like: 1, rename: 1, copies: 1, stale: `up to the cache TTL (30 s)` }
    }[m];
    c.readRows = st.reads * c.read;
    c.writeRows = st.likes * c.like + (st.renames / 86400) * c.rename;
    return c;
  }
  D.denormalize = {
    title: `Normalize or denormalize? Paying on reads or on writes`,
    blurb: `A feed page shows 20 posts, each with its author's username and a like count. <strong>Normalized</strong>: posts reference users by ID and likes live in their own table, so a read joins users and reads a maintained count per post. <strong>Denormalized</strong>: the username and like count are copied into every post row. <strong>Normalized + cache</strong>: the clean tables stay the source of truth and a cache holds ready-made feed pages. Move the sliders to see where the work goes.`,
    mount(el) {
      const st = { model: `norm`, reads: 2000, likes: 500, posts: 300, renames: 10000 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`model`, seg(`model`, Object.keys(DN_MODELS).map(k => [k, DN_MODELS[k]]), st.model))}</div>
        <div class="ctl-row">${ctl(`feed reads / s`, rng(`reads`, 100, 20000, 100, st.reads))}${ctl(`likes / s`, rng(`likes`, 0, 5000, 100, st.likes))}${ctl(`posts per user`, rng(`posts`, 10, 5000, 10, st.posts))}${ctl(`username changes / day`, rng(`renames`, 0, 100000, 1000, st.renames))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Rows read per second</h4><div data-k="reads"></div><h4 style="margin-top:12px">Rows written per second</h4><div data-k="writes"></div></div>
          <div class="lab-panel"><h4>posts table (selected model)</h4><div data-k="tbl"></div><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const all = Object.keys(DN_MODELS).map(m => ({ m, c: dnCost(st, m) }));
        const c = dnCost(st, st.model);
        const rMax = Math.max(...all.map(a => a.c.readRows)), wMax = Math.max(1e-9, ...all.map(a => a.c.writeRows));
        const short = { norm: `normalized`, denorm: `denormalized`, cache: `norm + cache` };
        q(`reads`).innerHTML = hbars(all.map(a => ({ label: short[a.m], title: DN_MODELS[a.m], value: a.c.readRows, max: rMax, text: fmtNum(a.c.readRows), cls: a.m === st.model ? `alt` : `muted` })), rMax);
        q(`writes`).innerHTML = hbars(all.map(a => ({ label: short[a.m], title: DN_MODELS[a.m], value: a.c.writeRows, max: wMax, text: fmtNum(a.c.writeRows), cls: a.m === st.model ? `warn` : `muted` })), wMax);
        const dup = st.model === `denorm`;
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>id</th><th>user_id</th>${dup ? `<th>username</th><th class="num">like_count</th>` : ``}<th>content</th></tr>
          <tr><td>901</td><td>7</td>${dup ? `<td style="color:var(--warn)">ann_lee</td><td class="num" style="color:var(--warn)">42</td>` : ``}<td>Hello world</td></tr>
          <tr><td>902</td><td>7</td>${dup ? `<td style="color:var(--warn)">ann_lee</td><td class="num" style="color:var(--warn)">7</td>` : ``}<td>Second post</td></tr>
          <tr><td>903</td><td>9</td>${dup ? `<td style="color:var(--warn)">raj_k</td><td class="num" style="color:var(--warn)">130</td>` : ``}<td>Hi all</td></tr></table></div>
          <div class="cs-note">${dup ? `Highlighted columns are copies of data owned by users and likes.` : st.model === `cache` ? `Source tables stay normalized; the cache stores the hydrated feed page.` : `Usernames live only in users; counts are read from a per-post counter row.`}</div>`;
        q(`stats`).innerHTML = stat(`rows touched per feed read`, round(c.read, 1)) + stat(`rows updated per username change`, fmtNum(c.rename), c.rename > 100 ? `bad` : ``) + stat(`copies of a username`, fmtNum(c.copies)) + stat(`staleness`, c.stale);
        const N = {
          norm: `Each fact lives in one place, so a username change touches one row and nothing can disagree. Reads pay for it: each feed page touches ${round(c.read, 0)} rows across three tables. At ${fmtNum(st.reads)} reads per second that's ${fmtNum(c.readRows)} rows per second, which is where a cache or denormalization starts to look attractive.`,
          denorm: `Reads get cheap (${round(c.read, 0)} rows per page, no joins), but every username change now rewrites ${fmtNum(st.posts)} post rows and every like also updates the post row, which becomes a contended hot row on popular posts. Miss one update and the copies disagree.`,
          cache: `The source of truth stays normalized and correct; ${pct(0.95)} of feed reads are served from the cache at ~1 row each, so database reads drop to ${fmtNum(c.readRows)} per second. The price is staleness up to the TTL and the cache's own failure modes, usually a better trade than denormalizing the tables.`
        };
        q(`note`).innerHTML = note(N[st.model], st.model === `denorm` && st.posts * st.renames > 1e7 ? `warn` : ``);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { reads: v => fmtNum(v), likes: v => fmtNum(v), posts: v => fmtNum(v), renames: v => fmtNum(v) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch10 - Pages read: full scan vs B-tree vs hash vs LSM
  // =====================================================================
  const IX_TYPES = { none: `no index (full scan)`, btree: `B-tree`, hash: `hash index`, lsm: `LSM tree` };
  const IX_RAND = 0.1, IX_SEQ = 0.01, IX_ROWS_PER_PAGE = 100, IX_FAN = 400;
  function ixCost(st, idx) {
    const N = Math.round(Math.pow(10, st.rows)), heap = Math.ceil(N / IX_ROWS_PER_PAGE);
    const depth = Math.max(1, Math.ceil(Math.log(N) / Math.log(IX_FAN)));
    const M = Math.max(1, Math.round(N * 0.001));
    const levels = Math.max(1, Math.ceil(Math.log10(Math.max(10, N / 1e5))));
    let rand = 0, seqp = 0, full = false;
    if (idx === `none` || (idx === `hash` && st.q === `range`)) { seqp = heap; full = true; }
    else if (idx === `btree`) rand = st.q === `point` ? depth + 1 : depth + Math.ceil(M / IX_FAN) + M;
    else if (idx === `hash`) rand = 2;
    else rand = st.q === `point` ? 2 : levels + Math.ceil(M / IX_FAN) * 1.5 + M;
    const writes = idx === `none` ? 1 : 1 + st.sec;
    return { N, heap, depth, M, levels, pages: rand + seqp, time: rand * IX_RAND + seqp * IX_SEQ, full, writes };
  }
  D.indexScan = {
    title: `What an index saves (and costs): pages read per query`,
    blurb: `A table of users with ~${IX_ROWS_PER_PAGE} rows per 8 KB page. Run a <strong>point query</strong> (<code>WHERE email = ?</code>) or a <strong>range query</strong> (<code>WHERE created_at</code> in the last 0.1% of rows) with different index types and count the pages read. Assumed costs: ${IX_RAND} ms per random page read, ${IX_SEQ} ms per sequential page, B-tree fan-out ${IX_FAN}.`,
    mount(el) {
      const st = { rows: 7, q: `point`, idx: `btree`, sec: 2 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`rows in the table`, rng(`rows`, 3, 10, 1, st.rows))}${ctl(`query`, seg(`q`, [[`point`, `point: email = ?`], [`range`, `range: last 0.1%`]], st.q))}</div>
        <div class="ctl-row">${ctl(`index`, seg(`idx`, Object.keys(IX_TYPES).map(k => [k, IX_TYPES[k]]), st.idx))}${ctl(`secondary indexes on the table`, rng(`sec`, 0, 8, 1, st.sec))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Pages read for this query (log scale)</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>Selected index</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const all = Object.keys(IX_TYPES).map(k => ({ k, c: ixCost(st, k) }));
        const c = ixCost(st, st.idx);
        const lg = v => Math.log10(1 + v);
        const mx = Math.max(...all.map(a => lg(a.c.pages)));
        q(`bars`).innerHTML = hbars(all.map(a => ({ label: IX_TYPES[a.k], value: lg(a.c.pages), max: mx, text: fmtNum(Math.round(a.c.pages)), title: `${IX_TYPES[a.k]}: ${fmtNum(Math.round(a.c.pages))} pages, ${ms(a.c.time)}`, cls: a.k === st.idx ? (a.c.full ? `bad` : `good`) : `muted` })), mx);
        q(`stats`).innerHTML = stat(`rows`, fmtNum(c.N)) + stat(`table pages`, fmtNum(c.heap)) + (st.idx === `btree` ? stat(`B-tree depth`, c.depth) : ``) + (st.idx === `lsm` ? stat(`LSM levels`, c.levels) : ``) + stat(`est. query time`, ms(c.time), c.time > 100 ? `bad` : `good`) + stat(`page writes per insert`, c.writes + (st.idx === `lsm` ? ` (batched, sequential)` : ``), c.writes > 4 ? `warn` : ``) + (st.idx !== `none` ? stat(`index storage`, fmtBytes(c.N * 32 * (1 + st.sec))) : ``);
        let n;
        if (st.idx === `none`) n = `Without an index the database reads all ${fmtNum(c.heap)} pages to find ${st.q === `point` ? `one row` : `${fmtNum(c.M)} rows`}: ${ms(c.time)}. Fine for a few thousand rows, hopeless at ${fmtNum(c.N)}.`;
        else if (st.idx === `hash` && st.q === `range`) n = `A hash index scrambles key order, so it can't find a range of dates: the query falls back to a full scan. That's why B-trees, which keep keys sorted, are the default.`;
        else if (st.idx === `btree`) n = st.q === `point` ? `With fan-out ${IX_FAN}, ${fmtNum(c.N)} keys fit in a tree only ${c.depth} levels deep, so a lookup reads ${c.depth} index pages plus the row's page (and the top levels are usually cached). The table could grow 1,000x and the lookup would barely change.` : `The B-tree seeks to the start of the range and walks ${Math.ceil(c.M / IX_FAN)} leaf pages in order, but each of the ${fmtNum(c.M)} matching rows still needs a random read from the table. Covering indexes and clustering by the range column remove those lookups.`;
        else if (st.idx === `hash`) n = `A hash index finds the key's location in one step: about two page reads for an exact match. It can't help with ranges or sorting, so it's rarely chosen over a B-tree.`;
        else n = st.q === `point` ? `An LSM tree checks the in-memory memtable, then its ${c.levels} levels of sorted files; Bloom filters rule out files that can't contain the key, so a point read costs about one disk read. Its real advantage is on the write side: inserts are buffered and written sequentially.` : `A range query must merge matching keys from every LSM level, a little more work than a B-tree walk. LSM trees accept that read cost for much cheaper, sequential writes.`;
        if (st.sec >= 5) n += ` With ${st.sec} secondary indexes every insert updates ${c.writes} structures; on a write-heavy table that overhead is often the bottleneck.`;
        q(`note`).innerHTML = note(n, c.full ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { rows: v => fmtNum(Math.pow(10, v)), sec: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch11 - Composite index column order (leftmost prefix rule)
  // =====================================================================
  const CI_COLS = { u: `user_id`, s: `status`, c: `created_at` };
  const CI_SEL = { u: 1 / 10000, s: 1 / 4, c: 0.1 };
  const CI_QUERIES = [
    { id: `q1`, sql: `WHERE user_id = ?`, eq: [`u`], range: null, order: null, limit: null },
    { id: `q2`, sql: `WHERE user_id = ? AND status = ?`, eq: [`u`, `s`], range: null, order: null, limit: null },
    { id: `q3`, sql: `WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 20`, eq: [`u`, `s`], range: null, order: `c`, limit: 20 },
    { id: `q4`, sql: `WHERE user_id = ? AND created_at > ?`, eq: [`u`], range: `c`, order: null, limit: null },
    { id: `q5`, sql: `WHERE status = ? ORDER BY created_at DESC LIMIT 20`, eq: [`s`], range: null, order: `c`, limit: 20 },
    { id: `q6`, sql: `WHERE created_at > ?`, eq: [], range: `c`, order: null, limit: null }
  ];
  const CI_N = 1000000;
  function ciPlan(idx, qr) {
    const filters = qr.eq.concat(qr.range ? [qr.range] : []);
    const matchSel = filters.reduce((p, f) => p * CI_SEL[f], 1);
    const returned = Math.max(1, Math.round(CI_N * matchSel));
    const out = qr.limit ? Math.min(qr.limit, returned) : returned;
    if (!idx.length) return { seek: [], sorted: false, examined: CI_N, out, full: true };
    const seek = [];
    let i = 0;
    while (i < idx.length && qr.eq.includes(idx[i])) seek.push(idx[i++]);
    let sorted = false;
    if (qr.order && idx[i] === qr.order) sorted = true;
    if (qr.range && idx[i] === qr.range) { seek.push(idx[i]); i++; }
    if (!seek.length) return { seek, sorted: false, examined: CI_N, out, full: true };
    let examined = CI_N * seek.reduce((p, f) => p * CI_SEL[f], 1);
    const rest = filters.filter(f => !seek.includes(f));
    if (sorted && qr.limit) examined = Math.min(examined, qr.limit / rest.reduce((p, f) => p * CI_SEL[f], 1));
    return { seek, sorted, examined: Math.max(1, Math.round(examined)), out, full: false };
  }
  D.compositeIndex = {
    title: `Composite indexes: column order decides which queries it serves`,
    blurb: `An <code>orders</code> table with ${fmtNum(CI_N)} rows: 10,000 users, 4 statuses, and <code>created_at</code> filters that match the last 10%. Choose the column order of one composite index and see, for six common queries, which columns it can seek on (the <strong>leftmost prefix</strong>), whether it returns rows already sorted, and how many index entries the database examines. Turn on <strong>covering</strong> to include the selected columns so no table lookups are needed.`,
    mount(el) {
      const st = { idx: `usc`, cover: `off` };
      const perms = [`usc`, `ucs`, `suc`, `scu`, `cus`, `csu`];
      el.innerHTML = `
        <div class="ctl-row">${ctl(`index on`, seg(`idx`, [[`none`, `no index`]].concat(perms.map(p => [p, `(${p.split(``).map(c => CI_COLS[c]).join(`, `)})`])), st.idx))}</div>
        <div class="ctl-row">${ctl(`covering (INCLUDE id, total)`, seg(`cover`, [[`off`, `off`], [`on`, `on`]], st.cover))}</div>
        <div class="lab-panel"><h4>Query plans</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const idx = st.idx === `none` ? [] : st.idx.split(``);
        const plans = CI_QUERIES.map(qr => ({ qr, p: ciPlan(idx, qr) }));
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>query</th><th>seeks on</th><th>sorted by index</th><th class="num">entries examined</th><th class="num">table lookups</th></tr>${plans.map(({ qr, p }) => `<tr><td class="mono" style="white-space:normal;min-width:220px">${esc(qr.sql)}</td><td>${p.full ? chip(`full scan`, `no`) : chip(p.seek.map(c => CI_COLS[c]).join(` + `), `ok`)}</td><td>${qr.order ? (p.sorted ? chip(`yes`, `ok`) : chip(`no, sort needed`, `no`)) : `<span class="chip muted">n/a</span>`}</td><td class="num" style="${p.examined > 10000 ? `color:var(--bad);font-weight:700` : ``}">${fmtNum(p.examined)}</td><td class="num">${p.full || st.cover === `on` ? (p.full ? `-` : `0`) : fmtNum(p.examined)}</td></tr>`).join(``)}</table></div>`;
        const good = plans.filter(x => !x.p.full && (!x.qr.order || x.p.sorted)).length;
        let n;
        if (!idx.length) n = `Without an index every query scans all ${fmtNum(CI_N)} rows. Pick a column order to see which queries each index can serve.`;
        else {
          n = `This index serves ${good} of 6 queries well. A B-tree on (${idx.map(c => CI_COLS[c]).join(`, `)}) is sorted by ${CI_COLS[idx[0]]} first, so queries that don't constrain ${CI_COLS[idx[0]]} can't seek and fall back to a full scan.`;
          if (st.idx === `usc`) n += ` This order follows the rule of thumb: equality columns (user_id, status) first, then the range or sort column (created_at), so Q3 seeks straight to the user's shipped orders and reads the newest 20 without sorting.`;
          if (idx[0] === `c`) n += ` Leading with the range column is usually wrong: once the index seeks on a range, the columns after it can't be used for seeking.`;
          if (idx[0] === `s`) n += ` Leading with a low-cardinality column (4 statuses) makes the first seek match a quarter of the table.`;
          if (st.cover === `on`) n += ` Covering: the index also stores id and total, so matching entries answer the query without visiting the table at all.`;
        }
        q(`note`).innerHTML = note(n, st.idx === `usc` ? `good` : ``);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch11 - Geohash encoder and 9-cell proximity search
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
  // Ch11 - Inverted index and full-text search
  // =====================================================================
  const II_DOCS = [
    `Taylor Swift tickets sell out in minutes`,
    `Cheap concert tickets for New York shows`,
    `How ticket booking systems prevent double booking`,
    `Swift engineers scale the booking service`,
    `New York weather: rain expected at the concert`,
    `Scaling search with an inverted index`,
    `Booking flights and concert tickets on mobile`,
    `Redis caches hot tickets for the concert`
  ];
  const VOW = /[aeiou]/;
  function iiStem(w) {
    if (w.length > 5 && w.endsWith(`ing`)) { let b = w.slice(0, -3); if (b.length >= 3 && !VOW.test(b[b.length - 1]) && VOW.test(b[b.length - 2]) && !VOW.test(b[b.length - 3])) b += `e`; return b; }
    if (w.length > 4 && w.endsWith(`ed`)) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith(`s`) && !/(ss|is|us)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function iiTokens(text, stem) { return words(text).filter(w => !STOP.has(w)).map(w => stem ? iiStem(w) : w); }
  D.invertedIndex = {
    title: `Inverted index: how full-text search finds documents`,
    blurb: `Each document is split into terms (lowercased, stop words dropped, optionally stemmed so "booking" and "book" match), and the index maps every term to the list of documents containing it: its <strong>posting list</strong>. A query reads a few posting lists, combines them, and ranks the matches by TF-IDF (rare terms count more). Type a query below.`,
    mount(el) {
      const st = { mode: `and`, stem: `on` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`query`, `<input class="lab-input" data-f="q" value="concert tickets" style="min-width:200px">`)}${ctl(`combine`, seg(`mode`, [[`and`, `AND (all terms)`], [`or`, `OR (any term)`]], st.mode))}${ctl(`stemming`, seg(`stem`, [[`on`, `on`], [`off`, `off`]], st.stem))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Results</h4><div data-k="res"></div></div>
          <div class="lab-panel"><h4>Posting lists for the query</h4><div data-k="post"></div><h4 style="margin-top:12px">Whole index (term: document count)</h4><div data-k="all"></div></div>
        </div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const input = el.querySelector(`[data-f="q"]`);
      const draw = () => {
        const stem = st.stem === `on`;
        const index = {};
        const docTerms = II_DOCS.map(d => iiTokens(d, stem));
        docTerms.forEach((ts, i) => ts.forEach(t => { (index[t] = index[t] || new Map()).set(i, (index[t].get(i) || 0) + 1); }));
        const qt = Array.from(new Set(iiTokens(input.value, stem)));
        const N = II_DOCS.length;
        let ids = null;
        qt.forEach(t => {
          const docs = new Set(index[t] ? index[t].keys() : []);
          if (ids === null) ids = docs;
          else ids = st.mode === `and` ? new Set([...ids].filter(x => docs.has(x))) : new Set([...ids, ...docs]);
        });
        ids = ids || new Set();
        const score = i => sum(qt.map(t => index[t] && index[t].get(i) ? index[t].get(i) * Math.log(1 + N / index[t].size) : 0));
        const ranked = [...ids].map(i => ({ i, s: score(i) })).sort((a, b) => b.s - a.s);
        const hl = (text) => text.split(/(\s+)/).map(w => { const t = words(w)[0]; return t && qt.includes(stem ? iiStem(t) : t) ? `<b style="color:var(--accent)">${esc(w)}</b>` : esc(w); }).join(``);
        q(`res`).innerHTML = ranked.length ? `<table class="mini-table"><tr><th>doc</th><th>text</th><th class="num">score</th></tr>${ranked.map(x => `<tr><td>${x.i + 1}</td><td style="white-space:normal">${hl(II_DOCS[x.i])}</td><td class="num">${round(x.s, 2)}</td></tr>`).join(``)}</table>` : `<div class="cs-note">${qt.length ? `No document matches.` : `Type a query (stop words like "the" are ignored).`}</div>`;
        q(`post`).innerHTML = qt.length ? qt.map(t => `<div style="margin:4px 0"><span class="mono" style="display:inline-block;min-width:90px">${esc(t)}</span> &rarr; <span class="toks" style="display:inline">${index[t] ? [...index[t].keys()].map(i => `<span class="tok c${i % 6}">doc ${i + 1}</span>`).join(``) : `<span class="cs-note">not in index</span>`}</span></div>`).join(``) : `<div class="cs-note">-</div>`;
        const terms = Object.keys(index).sort((a, b) => index[b].size - index[a].size || a.localeCompare(b));
        q(`all`).innerHTML = `<div class="toks">${terms.map(t => `<span class="tok ${qt.includes(t) ? `hot` : `dim`}">${esc(t)}: ${index[t].size}</span>`).join(``)}</div>`;
        const postings = sum(qt.map(t => index[t] ? index[t].size : 0));
        const totalChars = sum(II_DOCS.map(d => d.length));
        q(`stats`).innerHTML = stat(`documents`, N) + stat(`distinct terms`, terms.length) + stat(`postings read by the index`, postings, `good`) + stat(`characters a LIKE '%...%' scan reads`, fmtNum(totalChars), `bad`);
        let n = qt.length && !postings ? `None of the query terms are in the index, so the search knows there are no matches after a single lookup per term, without reading any document.` : `The index answers from ${postings} postings instead of scanning every document's text. At millions of documents that's the difference between milliseconds and minutes.`;
        if (!stem && qt.some(t => /s$|ing$/.test(t))) n += ` Stemming is off, so "${qt.find(t => /s$|ing$/.test(t))}" only matches that exact form; turn it on to match other word forms.`;
        if (st.mode === `or`) n += ` OR returns any document with any term; ranking pushes documents with rarer terms, or more of the terms, to the top.`;
        n += ` In a real design the database stays the source of truth and changes stream into a search engine like Elasticsearch, so results lag writes slightly.`;
        q(`note`).innerHTML = note(n, `good`);
      };
      input.addEventListener(`input`, draw);
      wireSegs(el, st, draw);
      draw();
    }
  };
})();
