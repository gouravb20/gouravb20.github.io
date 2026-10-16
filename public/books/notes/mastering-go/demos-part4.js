// Mastering Go - interactive labs, part 4 (chapters 9-11). Depends on labkit.js.
(function () {
  "use strict";
  const K = window.LabKit;
  const { esc, clamp, sum, round, seg, wireSegs, rng, wireRanges, ctl, stat, note, hbars, svgWrap, fmtNum, fmtBytes, pct, mulberry32 } = K;
  const D = window.DEMOS;
  const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;
  const pblock = (cls, head, body) => `<div class="pblock ${cls}"><div class="pblock-h">${head}</div><pre>${esc(body)}</pre></div>`;
  const qk = (el, k) => el.querySelector(`[data-k="${k}"]`);
  const ghostBtn = (attrs, label) => `<button class="lab-btn ghost" ${attrs}>${label}</button>`;
  const setRange = (el, k, v) => {
    const inp = el.querySelector(`input[data-rng="${k}"]`);
    if (!inp) return;
    inp.value = v;
    inp.dispatchEvent(new Event(`input`));
  };

  // =====================================================================
  // Ch9 - ServeMux route matcher (book's servers + Go 1.22 patterns)
  // =====================================================================
  const MUX_SETS = {
    www: {
      label: `wwwServer.go`,
      routes: [[`/time`, `timeHandler`], [`/`, `myHandler`]],
      examples: [[`GET`, `/`], [`GET`, `/time`], [`GET`, `/time/`], [`GET`, `/doesNotExist`], [`POST`, `/time`]]
    },
    stats: {
      label: `statistics server`,
      routes: [[`/list`, `listHandler`], [`/insert/`, `insertHandler`], [`/insert`, `insertHandler`], [`/search`, `searchHandler`], [`/search/`, `searchHandler`], [`/delete/`, `deleteHandler`], [`/status`, `statusHandler`], [`/`, `defaultHandler`]],
      examples: [[`GET`, `/list`], [`GET`, `/delete`], [`GET`, `/delete/d1`], [`GET`, `/search/d4`], [`GET`, `/insert/v1/1.0/2/3/`], [`GET`, `/status/`], [`GET`, `/doesNotExist`], [`GET`, `//list/../status`]]
    },
    modern: {
      label: `Go 1.22+ patterns`,
      routes: [[`GET /users`, `listUsers`], [`POST /users`, `createUser`], [`GET /users/{id}`, `getUser`], [`DELETE /users/{id}`, `deleteUser`], [`GET /users/me`, `getMe`], [`GET /files/{path...}`, `serveFile`], [`/static/`, `fileServer`], [`GET /{$}`, `home`]],
      examples: [[`GET`, `/users/42`], [`GET`, `/users/me`], [`DELETE`, `/users/42`], [`PUT`, `/users/42`], [`HEAD`, `/users`], [`POST`, `/users`], [`GET`, `/files/css/site.css`], [`GET`, `/files`], [`POST`, `/static/logo.png`], [`GET`, `/`], [`GET`, `/about`], [`GET`, `/users/`]]
    }
  };
  function muxParse(s) {
    let method = ``, path = s;
    const sp = s.indexOf(` `);
    if (sp > 0) { method = s.slice(0, sp); path = s.slice(sp + 1).trim(); }
    const raw = path.slice(1).split(`/`);
    let sub = false, end = false, multi = false;
    if (raw[raw.length - 1] === ``) { sub = true; raw.pop(); }
    const segs = raw.map(x => {
      const m = /^\{([^}]*)\}$/.exec(x);
      if (!m) return { k: `lit`, v: x };
      if (m[1] === `$`) return { k: `end` };
      if (m[1].endsWith(`...`)) return { k: `multi`, v: m[1].slice(0, -3) };
      return { k: `wild`, v: m[1] };
    });
    if (segs.length && segs[segs.length - 1].k === `end`) { segs.pop(); end = true; }
    if (segs.length && segs[segs.length - 1].k === `multi`) multi = true;
    const ranks = segs.map(x => x.k === `lit` ? 3 : x.k === `wild` ? 2 : 1);
    if (end) ranks.push(2.5);
    else if (sub) ranks.push(1);
    return { method, path, segs, sub, end, multi, ranks };
  }
  function muxMatchPath(p, R) {
    const vals = {};
    const fixed = p.multi ? p.segs.length - 1 : p.segs.length;
    for (let i = 0; i < fixed; i++) {
      if (i >= R.length) return null;
      const s = p.segs[i];
      if (s.k === `lit`) { if (R[i] !== s.v) return null; }
      else { if (R[i] === ``) return null; vals[s.v] = R[i]; }
    }
    if (p.multi) { if (R.length < p.segs.length) return null; vals[p.segs[fixed].v] = R.slice(fixed).join(`/`); return vals; }
    if (p.end) return (R.length === fixed + 1 && R[fixed] === ``) ? vals : null;
    if (p.sub) return R.length > fixed ? vals : null;
    return R.length === fixed ? vals : null;
  }
  function muxExact(p, R) {
    if (!p.sub && !p.multi) return true;
    if (R[R.length - 1] !== ``) return false;
    return p.sub ? R.length === p.segs.length + 1 : R.length === p.segs.length;
  }
  const muxMeth = (pm, m) => pm === `` || pm === m || (pm === `GET` && m === `HEAD`);
  function muxCmp(a, b) {
    const n = Math.max(a.ranks.length, b.ranks.length);
    for (let i = 0; i < n; i++) {
      const x = a.ranks[i] || 0, y = b.ranks[i] || 0;
      if (x !== y) return x - y;
    }
    return (a.method ? 1 : 0) - (b.method ? 1 : 0);
  }
  function cleanPath(p) {
    if (!p.startsWith(`/`)) p = `/` + p;
    const trail = p.endsWith(`/`) && p !== `/`;
    const out = [];
    p.split(`/`).forEach(s => { if (s === `` || s === `.`) return; if (s === `..`) out.pop(); else out.push(s); });
    let c = `/` + out.join(`/`);
    if (trail && c !== `/`) c += `/`;
    return c;
  }
  function muxResolve(set, method, rawIn) {
    let raw = String(rawIn || ``).trim() || `/`;
    let query = ``;
    const qi = raw.indexOf(`?`);
    if (qi >= 0) { query = raw.slice(qi); raw = raw.slice(0, qi) || `/`; }
    if (!raw.startsWith(`/`)) raw = `/` + raw;
    const pats = set.routes.map(([s, h], i) => Object.assign(muxParse(s), { src: s, h, i }));
    const evalAt = path => {
      const R = path.slice(1).split(`/`);
      return pats.map(p => { const vals = muxMatchPath(p, R); return { p, vals, pathOk: !!vals, methOk: muxMeth(p.method, method), exact: !!vals && muxExact(p, R) }; });
    };
    const pick = rows => { const c = rows.filter(r => r.pathOk && r.methOk); return c.length ? c.reduce((x, y) => muxCmp(y.p, x.p) > 0 ? y : x) : null; };
    const clean = cleanPath(raw);
    const rows = evalAt(clean);
    if (clean !== raw) return { kind: `clean`, rows, code: 301, location: clean + query, raw, query };
    const best = pick(rows);
    if (!(best && best.exact) && !clean.endsWith(`/`)) {
      const b2 = pick(evalAt(clean + `/`));
      if (b2 && b2.exact) return { kind: `slash`, rows, code: 301, location: clean + `/` + query, via: b2, raw, query };
    }
    if (best) return { kind: `ok`, rows, code: 200, best, raw, query };
    const allow = new Set();
    rows.filter(r => r.pathOk && r.p.method).forEach(r => { allow.add(r.p.method); if (r.p.method === `GET`) allow.add(`HEAD`); });
    if (allow.size) return { kind: `405`, rows, code: 405, allow: [...allow].sort(), raw, query };
    return { kind: `404`, rows, code: 404, raw, query };
  }
  D.c09MuxMatcher = {
    title: `ServeMux route matcher: which handler wins?`,
    blurb: `Type a request path and see how <code>http.ServeMux</code> picks a handler. The route tables are the book's <strong>wwwServer.go</strong> and <strong>statistics server</strong>, plus a set of <strong>Go 1.22+ patterns</strong> with methods and wildcards. Patterns ending in <code>/</code> match a whole subtree, <code>/</code> catches everything, and the most specific pattern wins. Try <code>/delete</code> to get the book's 301 redirect, <code>PUT /users/42</code> for a 405 with an <code>Allow</code> header, and <code>/about</code> to see <code>{$}</code> stop <code>/</code> from being a catch-all.`,
    mount(el) {
      const st = { set: `stats`, method: `GET`, path: `/delete` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`routes`, seg(`set`, Object.keys(MUX_SETS).map(k => [k, MUX_SETS[k].label]), st.set))}</div>
        <div class="ctl-row">${ctl(`method`, seg(`method`, [[`GET`, `GET`], [`HEAD`, `HEAD`], [`POST`, `POST`], [`PUT`, `PUT`], [`DELETE`, `DELETE`]], st.method))}
          <span class="ctl" style="flex:1"><span class="ctl-label">path</span><input class="lab-input mono" data-k="path" value="${esc(st.path)}" spellcheck="false"></span></div>
        <div class="ctl-row" data-k="ex"></div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Registered patterns</h4><div data-k="tbl"></div><div class="legend"><span>${chip(`ok`, `wins`)}</span><span>${chip(`final`, `also matches`)}</span><span>${chip(`late`, `path ok, method no`)}</span><span>${chip(`muted`, `no match`)}</span></div></div>
          <div class="lab-panel"><h4>Response</h4><div data-k="resp"></div><div data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const inp = qk(el, `path`);
      const drawEx = () => {
        const set = MUX_SETS[st.set];
        qk(el, `ex`).innerHTML = `<span class="ctl-label" style="font-size:11px;color:var(--text-muted)">TRY</span> ` + set.examples.map((e, i) => ghostBtn(`data-ex="${i}" style="padding:3px 8px;font-size:11.5px"`, esc(e[0] + ` ` + e[1]))).join(` `);
        qk(el, `ex`).querySelectorAll(`[data-ex]`).forEach(b => b.addEventListener(`click`, () => {
          const e = set.examples[+b.dataset.ex];
          st.method = e[0]; st.path = e[1]; inp.value = e[1];
          K.setSeg(el, `method`, e[0]);
          draw();
        }));
      };
      const draw = () => {
        const set = MUX_SETS[st.set];
        const r = muxResolve(set, st.method, st.path);
        const winner = r.kind === `ok` ? r.best : null;
        qk(el, `tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>pattern</th><th>handler</th><th>match</th></tr>${r.rows.map(row => {
          let c;
          if (row === winner) c = chip(`ok`, `wins`);
          else if (row.pathOk && row.methOk) c = chip(`final`, `matches`);
          else if (row.pathOk) c = chip(`late`, `method ✗`);
          else c = chip(`muted`, `-`);
          const cls = row === winner ? `new` : row.pathOk ? `` : `dim`;
          return `<tr class="${cls}"><td class="mono">${esc(row.p.src)}</td><td class="mono">${esc(row.p.h)}</td><td>${c}</td></tr>`;
        }).join(``)}</table></div>`;
        let resp, cls, n, ncls = `good`;
        const reqLine = `${st.method} ${r.raw}${r.query} HTTP/1.1`;
        if (r.kind === `ok`) {
          const vals = Object.keys(r.best.vals);
          resp = `${reqLine}\n\n-> ${r.best.p.h}(w, r)\n` + (vals.length ? vals.map(k => `   r.PathValue("${k}") = "${r.best.vals[k]}"`).join(`\n`) + `\n` : ``) + `\nHTTP/1.1 200 OK` + (st.method === `HEAD` ? `\n(HEAD: headers only, body discarded)` : ``);
          cls = `out`;
          const others = r.rows.filter(x => x !== r.best && x.pathOk && x.methOk);
          n = `<strong>${esc(r.best.p.src)}</strong> handles the request.`;
          if (others.length) n += ` ${others.map(o => `<code>${esc(o.p.src)}</code>`).join(`, `)} also match${others.length === 1 ? `es` : ``}, but ${others.length === 1 ? `it is` : `they are`} less specific: a literal segment beats a <code>{wildcard}</code>, which beats a subtree remainder, and a pattern with a method beats one without.`;
          if (r.best.p.src === `/` || r.best.p.src.endsWith(` /`)) n += ` <code>/</code> is the catch-all: it matches every path no other pattern claims, which is why the book makes it the default handler.`;
          if (st.method === `HEAD` && r.best.p.method === `GET`) n += ` A <code>GET</code> pattern also serves <code>HEAD</code>.`;
          if (r.best.p.sub && r.raw !== `/` && r.best.p.src !== `/`) n += ` <code>${esc(r.best.p.src)}</code> ends in a slash, so it matches the whole subtree below it.`;
        } else if (r.kind === `slash` || r.kind === `clean`) {
          resp = `${reqLine}\n\nHTTP/1.1 301 Moved Permanently\nLocation: ${r.location}\n\n<a href="${r.location}">Moved Permanently</a>.`;
          cls = `ctx`; ncls = `warn`;
          n = r.kind === `slash`
            ? `No pattern matches <code>${esc(r.raw)}</code> exactly, but the subtree pattern <code>${esc(r.via.p.src)}</code> matches <code>${esc(r.raw)}/</code>. ServeMux redirects to the slash version even though <code>/</code> would have caught the request, which is the message the book gets from <code>curl localhost:1234/delete</code>. Register the bare path too if you don't want the redirect.`
            : `The path isn't clean (it has <code>//</code>, <code>.</code> or <code>..</code>), so ServeMux first redirects to the cleaned path <code>${esc(r.location)}</code>. Handlers never see unclean paths.`;
        } else if (r.kind === `405`) {
          resp = `${reqLine}\n\nHTTP/1.1 405 Method Not Allowed\nAllow: ${r.allow.join(`, `)}\n\nMethod Not Allowed`;
          cls = `bad`; ncls = `warn`;
          n = `The path matches, but only for ${r.allow.join(`, `)}, and no method-less pattern catches it. Go 1.22+ answers <strong>405</strong> with an <code>Allow</code> header automatically. Before 1.22 you had to check <code>r.Method</code> yourself, as the book's handlers in Chapter 11 do.`;
        } else {
          resp = `${reqLine}\n\nHTTP/1.1 404 Not Found\n\n404 page not found`;
          cls = `bad`; ncls = `bad`;
          n = `Nothing matches, and there is no catch-all <code>/</code>, so ServeMux calls <code>http.NotFound</code>.` + (st.set === `modern` ? ` <code>GET /{$}</code> matches only <code>/</code> itself. Unlike plain <code>/</code>, it isn't a subtree pattern.` : ``);
        }
        qk(el, `resp`).innerHTML = pblock(cls, `status ${r.code}`, resp);
        const pathMatches = r.rows.filter(x => x.pathOk).length;
        qk(el, `stats`).innerHTML = `<div class="stat-row">${stat(`status`, r.code, r.code === 200 ? `good` : r.code >= 400 ? `bad` : ``)}${stat(`patterns matching the path`, pathMatches)}${stat(`registered`, r.rows.length)}</div>`;
        qk(el, `note`).innerHTML = note(n, ncls);
      };
      inp.addEventListener(`input`, () => { st.path = inp.value; draw(); });
      wireSegs(el, st, k => {
        if (k === `set`) { const e = MUX_SETS[st.set].examples[0]; st.method = e[0]; st.path = e[1]; inp.value = e[1]; K.setSeg(el, `method`, e[0]); drawEx(); }
        draw();
      });
      drawEx(); draw();
    }
  };

  // =====================================================================
  // Ch9 - HTTP timeouts: who gives up first?
  // =====================================================================
  const TO_PRESETS = {
    good: { label: `all fine`, cli: `client`, C: 15, R: 3, W: 3, U: 0.5, H: 1, Dl: 0.5 },
    tclient: { label: `timeoutClient.go (5s)`, cli: `ctx`, C: 5, R: 0, W: 0, U: 0, H: 10, Dl: 0.5 },
    tserver: { label: `timeoutServer.go, slow upload`, cli: `client`, C: 0, R: 3, W: 3, U: 5, H: 0.5, Dl: 0.5 },
    slowh: { label: `slow handler`, cli: `client`, C: 15, R: 3, W: 3, U: 0, H: 5, Dl: 0.5 },
    slowr: { label: `slow reader`, cli: `client`, C: 15, R: 3, W: 3, U: 0, H: 1, Dl: 4 },
    dial: { label: `withDeadline.go (1s)`, cli: `deadline`, C: 1, R: 0, W: 0, U: 0, H: 3, Dl: 0.5 },
    hang: { label: `hung handler, no client timeout`, cli: `client`, C: 0, R: 3, W: 3, U: 0, H: 30, Dl: 0.5 }
  };
  D.c09Timeouts = {
    title: `HTTP timeouts: client Timeout vs server ReadTimeout / WriteTimeout`,
    blurb: `One request, three phases: the client <strong>uploads</strong> the request body, the <strong>handler</strong> runs, and the client <strong>downloads</strong> the response. Set the client's limit (<code>Client.Timeout</code>, a <code>context.WithTimeout</code>, or the book's <code>SetDeadline</code> dialer) and the server's <code>ReadTimeout</code> and <code>WriteTimeout</code>, and see who gives up first and what each side sees. A value of 0 means no timeout, as with <code>http.DefaultClient</code> and <code>http.ListenAndServe</code>. Times are in seconds.`,
    mount(el) {
      const st = Object.assign({}, TO_PRESETS.good);
      el.innerHTML = `
        <div class="ctl-row">${ctl(`scenario`, Object.keys(TO_PRESETS).map(k => ghostBtn(`data-pre="${k}" style="padding:3px 8px;font-size:11.5px"`, TO_PRESETS[k].label)).join(` `))}</div>
        <div class="ctl-row">${ctl(`client uses`, seg(`cli`, [[`client`, `Client.Timeout`], [`ctx`, `context.WithTimeout`], [`deadline`, `conn.SetDeadline`]], st.cli))}${ctl(`client limit`, rng(`C`, 0, 20, 0.5, st.C))}</div>
        <div class="ctl-row">${ctl(`ReadTimeout`, rng(`R`, 0, 10, 0.5, st.R))}${ctl(`WriteTimeout`, rng(`W`, 0, 10, 0.5, st.W))}</div>
        <div class="ctl-row">${ctl(`upload time`, rng(`U`, 0, 10, 0.5, st.U))}${ctl(`handler time`, rng(`H`, 0, 30, 0.5, st.H))}${ctl(`download time`, rng(`Dl`, 0, 10, 0.5, st.Dl))}</div>
        <div class="lab-panel"><h4>Timeline</h4><div data-k="svg"></div>
          <div class="legend"><span><span class="sw" style="background:var(--accent-3)"></span>upload</span><span><span class="sw" style="background:var(--accent)"></span>handler</span><span><span class="sw" style="background:var(--good)"></span>response</span><span><span class="sw line" style="background:var(--accent-3)"></span>client limit</span><span><span class="sw line" style="background:var(--accent-2)"></span>ReadTimeout</span><span><span class="sw line" style="background:var(--when)"></span>WriteTimeout</span></div></div>
        <div class="lab-grid even" style="margin-top:12px">
          <div class="lab-panel"><h4>What the client sees</h4><div data-k="cli"></div></div>
          <div class="lab-panel"><h4>What the server does</h4><div data-k="srv"></div></div>
        </div>
        <div data-k="note"></div>`;
      const INF = 1e9;
      const fmtS = v => v >= INF ? `∞` : round(v, 2) + `s`;
      const draw = () => {
        const U = st.U, H = st.H >= 30 ? INF : st.H, Dl = st.Dl;
        const hEnd = U + H, done = hEnd + Dl;
        const method = U > 0 ? `POST` : `GET`;
        const url = `http://localhost:8001/`;
        const ev = [];
        if (st.C > 0 && st.C < done) ev.push({ who: `client`, t: st.C, ord: 0 });
        if (st.R > 0 && U > st.R) ev.push({ who: `read`, t: st.R, ord: 1 });
        if (st.W > 0 && done > st.W && H < INF) ev.push({ who: `write`, t: Math.max(st.W, hEnd), ord: 2 });
        if (done < INF) ev.push({ who: `ok`, t: done, ord: 3 });
        ev.sort((a, b) => a.t - b.t || a.ord - b.ord);
        const win = ev.length ? ev[0] : { who: `hang`, t: INF };
        // timeline
        const finite = [U, st.C, st.R, st.W, H < INF ? done : 0, H < INF ? 0 : 12].filter(v => v > 0 && v < INF);
        const maxT = Math.max(4, Math.min(34, Math.max(...finite, win.t < INF ? win.t : 0) * 1.12 + 0.5));
        const x0 = 96, x1 = 506, X = t => x0 + (Math.min(t, maxT) / maxT) * (x1 - x0);
        const cut = win.t;
        let s = ``;
        const step = maxT > 20 ? 5 : maxT > 8 ? 2 : 1;
        for (let t = 0; t <= maxT + 0.001; t += step) s += `<line class="svg-grid" x1="${X(t)}" x2="${X(t)}" y1="14" y2="128"/><text class="svg-label" x="${X(t)}" y="142" text-anchor="middle">${t}s</text>`;
        const phase = (y, a, b, fill, label) => {
          s += `<text class="svg-label" x="${x0 - 6}" y="${y + 12}" text-anchor="end">${label}</text>`;
          if (b <= a && b < INF) { s += `<text class="svg-label" x="${X(a) + 4}" y="${y + 12}">(none)</text>`; return; }
          const bb = Math.min(b, maxT + 1);
          s += `<rect x="${X(a)}" y="${y}" width="${Math.max(1, X(bb) - X(a))}" height="16" rx="3" style="fill:${fill};opacity:.22"/>`;
          const e = Math.min(b, cut);
          if (e > a) s += `<rect x="${X(a)}" y="${y}" width="${Math.max(1, X(Math.min(e, maxT + 1)) - X(a))}" height="16" rx="3" style="fill:${fill}"/>`;
          if (b >= INF) s += `<text class="svg-label" x="${x1 - 4}" y="${y + 12}" text-anchor="end">∞</text>`;
        };
        phase(22, 0, U, `var(--accent-3)`, `client upload`);
        phase(56, U, hEnd, `var(--accent)`, `handler`);
        phase(90, hEnd, done, `var(--good)`, `response`);
        const vline = (t, cls, label, dy) => { if (t > 0 && t <= maxT) s += `<line class="${cls}" x1="${X(t)}" x2="${X(t)}" y1="12" y2="130"/><text class="svg-label" x="${X(t) + 3}" y="${10 + dy}">${label}</text>`; };
        vline(st.C, `svg-wm2`, `client ${fmtS(st.C)}`, 0);
        vline(st.R, `svg-wm3`, `Read ${fmtS(st.R)}`, 0);
        vline(st.W, `svg-wm`, `Write ${fmtS(st.W)}`, 0);
        if (cut < INF && cut <= maxT) s += `<line class="svg-now" x1="${X(cut)}" x2="${X(cut)}" y1="16" y2="128" style="stroke-dasharray:2 2"/><circle cx="${X(cut)}" cy="128" r="4" style="fill:${win.who === `ok` ? `var(--good)` : `var(--bad)`}"/>`;
        qk(el, `svg`).innerHTML = svgWrap(520, 150, s);
        // messages
        let cliMsg, srvMsg, cliCls = `bad`, n, ncls = `warn`;
        const handlerTail = H >= INF ? `the handler never returns` : `the handler keeps running until ${fmtS(hEnd)}`;
        if (win.who === `ok`) {
          cliMsg = `${method} ${url}\n-> 200 OK after ${fmtS(done)}\n   io.ReadAll(resp.Body) succeeds`;
          srvMsg = `request read in ${fmtS(U)}\nhandler ran ${fmtS(H)}\nresponse written, connection kept alive (IdleTimeout)`;
          cliCls = `out`; ncls = `good`;
          n = `Everything finishes inside every limit. Notice how much slack is left: the server's limits should cover the slowest <em>legitimate</em> client, and the client's should cover the slowest acceptable response.`;
        } else if (win.who === `client`) {
          const awaiting = st.C < hEnd;
          if (st.cli === `client`) cliMsg = `${method} "${url}": context deadline exceeded\n(Client.Timeout exceeded while ${awaiting ? `awaiting headers` : `reading body`})`;
          else if (st.cli === `ctx`) cliMsg = `${method} "${url}": context deadline exceeded`;
          else cliMsg = `${method} "${url}": read tcp 127.0.0.1:52492->127.0.0.1:8001: i/o timeout`;
          srvMsg = `client closed the connection at ${fmtS(st.C)}\nr.Context() is cancelled\n${handlerTail} unless it watches r.Context()`;
          n = `The <strong>client</strong> gives up first, at ${fmtS(st.C)}. ` + (st.cli === `ctx` ? `This is the book's <code>timeoutClient.go</code>: the context created by <code>context.WithTimeout</code> expires and <code>Do()</code> returns. ` : st.cli === `deadline` ? `This is the book's <code>withDeadline.go</code>: the custom <code>Transport.Dial</code> set an absolute deadline on the TCP connection, so the read fails no matter how steadily data was flowing. ` : `<code>Client.Timeout</code> covers the whole exchange, including reading the body. `) + `The server only learns about it when the connection drops. Its handler goes on working unless it checks <code>r.Context().Done()</code>.`;
        } else if (win.who === `read`) {
          cliMsg = `${method} "${url}": write tcp 127.0.0.1:52492->127.0.0.1:8001:\n  write: broken pipe   (or an error status if the handler replied)`;
          srvMsg = `ReadTimeout (${fmtS(st.R)}) hit while the body was still arriving\nr.Body.Read returns "i/o timeout"\nconnection is torn down`;
          n = `The <strong>server's ReadTimeout</strong> fires: the client needed ${fmtS(U)} to send the request but the server allows only ${fmtS(st.R)}. This is the book's <code>timeoutServer.go</code> defence. Without it, a client that dribbles bytes (slow-loris) could hold the connection open forever. Add <code>ReadHeaderTimeout</code> to limit just the headers.`;
          ncls = `good`;
        } else if (win.who === `write`) {
          const inBody = win.t > hEnd;
          cliMsg = inBody ? `${method} ${url} -> 200 OK (headers)\nio.ReadAll(resp.Body): unexpected EOF` : `${method} "${url}": EOF\n(empty reply: the connection closed without a response)`;
          srvMsg = inBody
            ? `WriteTimeout (${fmtS(st.W)}) passes during the transfer\nremaining writes fail, connection closed`
            : `WriteTimeout (${fmtS(st.W)}) passed while the handler ran\nhandler finished at ${fmtS(hEnd)}, flush fails\nno log line, no status code: client gets EOF`;
          n = inBody
            ? `The <strong>server's WriteTimeout</strong> cuts a slow reader off mid-response. WriteTimeout is measured from the end of reading the request headers, so the upload, the handler and the download all count against it.`
            : `The handler took ${fmtS(H)} but <strong>WriteTimeout</strong> is ${fmtS(st.W)}. The deadline does <em>not</em> stop the handler. It runs to the end, then its response can't be written and the client sees a bare <code>EOF</code> instead of a clean error. Use <code>http.TimeoutHandler</code> (it replies 503) or a context deadline to bound handler work.`;
          if (U > 0) n += ` Upload time counts too: the write deadline was already running while the body arrived.`;
        } else {
          cliMsg = `${method} ${url}\n... still waiting (forever)`;
          srvMsg = `handler blocked forever\nWriteTimeout only fails *writes*; nothing is written,\nso nothing closes the connection`;
          ncls = `bad`;
          n = `<strong>Nobody gives up.</strong> The handler never returns, so WriteTimeout never gets a write to fail, and the client has no timeout (like <code>http.Get</code> on <code>DefaultClient</code>). The goroutine and connection leak. Always set a client timeout, and bound handler work with contexts or <code>http.TimeoutHandler</code>.`;
        }
        qk(el, `cli`).innerHTML = pblock(cliCls, win.who === `ok` ? `success` : win.who === `client` ? `client timed out` : `error`, cliMsg) + `<div class="stat-row">${stat(`outcome at`, win.t < INF ? fmtS(win.t) : `never`, win.who === `ok` ? `good` : `bad`)}${stat(`would finish at`, fmtS(done))}</div>`;
        qk(el, `srv`).innerHTML = pblock(win.who === `ok` ? `ctx` : `sys`, `server`, srvMsg) + `<table class="mini-table"><tr><th>limit</th><th class="num">value</th><th>fires?</th></tr>
          <tr><td>client (${st.cli === `client` ? `Client.Timeout` : st.cli === `ctx` ? `context` : `SetDeadline`})</td><td class="num">${st.C ? fmtS(st.C) : `none`}</td><td>${ev.some(e => e.who === `client`) ? chip(win.who === `client` ? `no` : `muted`, win.who === `client` ? `first` : `later`) : chip(`ok`, `no`)}</td></tr>
          <tr><td>ReadTimeout</td><td class="num">${st.R ? fmtS(st.R) : `none`}</td><td>${ev.some(e => e.who === `read`) ? chip(win.who === `read` ? `no` : `muted`, win.who === `read` ? `first` : `later`) : chip(`ok`, `no`)}</td></tr>
          <tr><td>WriteTimeout</td><td class="num">${st.W ? fmtS(st.W) : `none`}</td><td>${ev.some(e => e.who === `write`) ? chip(win.who === `write` ? `no` : `muted`, win.who === `write` ? `first` : `later`) : (st.W && H >= INF ? chip(`late`, `never writes`) : chip(`ok`, `no`))}</td></tr></table>`;
        qk(el, `note`).innerHTML = note(n, ncls);
      };
      el.querySelectorAll(`[data-pre]`).forEach(b => b.addEventListener(`click`, () => {
        const p = TO_PRESETS[b.dataset.pre];
        st.cli = p.cli; K.setSeg(el, `cli`, p.cli);
        [`C`, `R`, `W`, `U`, `H`, `Dl`].forEach(k => setRange(el, k, p[k]));
        draw();
      }));
      wireSegs(el, st, draw);
      wireRanges(el, st, { C: v => v ? v + ` s` : `none`, R: v => v ? v + ` s` : `none`, W: v => v ? v + ` s` : `none`, U: v => v + ` s`, H: v => v >= 30 ? `∞ (hangs)` : v + ` s`, Dl: v => v + ` s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch9 - errgroup fan-out
  // =====================================================================
  const EG_URLS = [`https://golang.org`, `https://go.dev/doc/`, `https://pkg.go.dev`, `https://www.mtsoukalos.eu/`, `https://example.com`, `http://localhost:80`];
  D.c09ErrGroup = {
    title: `errgroup: fan-out, first error, cancellation`,
    blurb: `The book's <code>eGroup.go</code> fetches every URL in its own goroutine with <code>g.Go()</code> and reports the first error from <code>g.Wait()</code>. Make one URL fail (the book's x509 error on Arch Linux, or a refused connection), then compare a plain <code>errgroup.Group</code> with <code>errgroup.WithContext</code>, and cap concurrency with <code>SetLimit</code>. Watch when <code>Wait()</code> returns and how much work happens after the error is already known.`,
    mount(el) {
      const st = { mode: `group`, fail: `tls`, limit: 0, seed: 7 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`group`, seg(`mode`, [[`group`, `new(errgroup.Group)`], [`ignore`, `WithContext + http.Get`], [`ctx`, `WithContext + NewRequestWithContext`]], st.mode))}</div>
        <div class="ctl-row">${ctl(`failure`, seg(`fail`, [[`none`, `none`], [`tls`, `x509 error`], [`refused`, `connection refused`], [`both`, `both`]], st.fail))}${ctl(`SetLimit`, seg(`limit`, [[0, `none`], [1, `1`], [2, `2`], [3, `3`]], st.limit))}${ghostBtn(`data-k="reseed"`, `new latencies`)}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Goroutines over time (ms)</h4><div data-k="svg"></div><div class="legend"><span><span class="sw" style="background:var(--accent)"></span>OK</span><span><span class="sw" style="background:var(--bad)"></span>error</span><span><span class="sw" style="background:var(--text-muted);opacity:.5"></span>context canceled</span></div></div>
          <div class="lab-panel"><h4>Program output</h4><div data-k="out"></div><div data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const draw = () => {
        const r = mulberry32(st.seed * 977 + 13);
        const tasks = EG_URLS.map((u, i) => {
          const lat = Math.round((150 + r() * 1250) / 10) * 10;
          let fail = null, ft = lat;
          if (i === 3 && (st.fail === `tls` || st.fail === `both`)) fail = `Get "${u}": tls: failed to verify certificate: x509: certificate signed by unknown authority`;
          if (i === 5 && (st.fail === `refused` || st.fail === `both`)) { fail = `Get "${u}": dial tcp [::1]:80: connect: connection refused`; ft = 20; }
          return { i, u, natural: fail ? ft : lat, fail };
        });
        const cap = st.limit || 99;
        const running = [], done = [];
        let now = 0, nx = 0, first = null;
        while (true) {
          while (running.length < cap && nx < tasks.length) {
            const t = tasks[nx++];
            t.start = now;
            if (st.mode === `ctx` && first) { t.end = now + 2; t.status = `canceled`; }
            else { t.end = now + t.natural; t.status = t.fail ? `fail` : `ok`; }
            running.push(t);
          }
          if (!running.length) break;
          running.sort((a, b) => a.end - b.end);
          const t = running.shift();
          now = t.end;
          if (t.status === `fail` && !first) {
            first = t;
            if (st.mode === `ctx`) running.forEach(o => { if (o.end > now + 3) { o.end = now + 3; o.status = `canceled`; } });
          }
          done.push(t);
        }
        const waitAt = now;
        const maxT = Math.max(200, waitAt) * 1.06;
        const x0 = 150, x1 = 500, X = t => x0 + (t / maxT) * (x1 - x0), RH = 24;
        let s = ``;
        const step = maxT > 1500 ? 500 : maxT > 600 ? 200 : 100;
        const H = tasks.length * RH + 30;
        for (let t = 0; t <= maxT; t += step) s += `<line class="svg-grid" x1="${X(t)}" x2="${X(t)}" y1="6" y2="${H - 20}"/><text class="svg-label" x="${X(t)}" y="${H - 6}" text-anchor="middle">${t}</text>`;
        tasks.forEach((t, k) => {
          const y = 8 + k * RH;
          const fill = t.status === `ok` ? `fill:var(--accent)` : t.status === `fail` ? `fill:var(--bad)` : `fill:var(--text-muted);opacity:.5`;
          s += `<text class="svg-label" x="${x0 - 6}" y="${y + 12}" text-anchor="end">${esc(t.u.replace(/^https?:\/\//, ``).slice(0, 22))}</text>`;
          s += `<rect x="${X(t.start)}" y="${y}" width="${Math.max(2, X(t.end) - X(t.start))}" height="15" rx="3" style="${fill}"/>`;
          if (t.status === `canceled` && t.natural + t.start > t.end) s += `<rect x="${X(t.end)}" y="${y + 6}" width="${Math.max(0, X(Math.min(maxT, t.start + t.natural)) - X(t.end))}" height="3" style="fill:var(--text-muted);opacity:.35"/>`;
        });
        if (first) s += `<line class="svg-wm2" x1="${X(first.end)}" x2="${X(first.end)}" y1="4" y2="${H - 20}"/><text class="svg-label" x="${X(first.end) + 3}" y="${H - 22}">first error</text>`;
        s += `<line class="svg-now" x1="${X(waitAt)}" x2="${X(waitAt)}" y1="4" y2="${H - 20}"/><text class="svg-label" x="${X(waitAt) - 3}" y="12" text-anchor="end">Wait()</text>`;
        qk(el, `svg`).innerHTML = svgWrap(520, H, s);
        const lines = [`$ go run eGroup.go ${EG_URLS.length} URLs`];
        done.forEach(t => { if (t.status === `ok`) lines.push(`${t.u} is OK.`); });
        lines.push(first ? `Error: ${first.fail}` : `Everything went fine!`);
        qk(el, `out`).innerHTML = pblock(first ? `bad` : `out`, `stdout (completion order)`, lines.join(`\n`));
        const okN = tasks.filter(t => t.status === `ok`).length, failN = tasks.filter(t => t.status === `fail`).length, canN = tasks.filter(t => t.status === `canceled`).length;
        const wasted = first ? sum(tasks.filter(t => t !== first).map(t => Math.max(0, t.end - Math.max(t.start, first.end)))) : 0;
        qk(el, `stats`).innerHTML = `<div class="stat-row">${stat(`Wait() returns`, waitAt + ` ms`)}${stat(`first error at`, first ? first.end + ` ms` : `-`, first ? `bad` : `good`)}${stat(`OK / failed / canceled`, `${okN} / ${failN} / ${canN}`)}${stat(`work after first error`, wasted + ` ms`, wasted ? `bad` : `good`)}</div>`;
        let n;
        if (!first) n = `No errors: <code>Wait()</code> returns nil once the slowest fetch finishes (${waitAt} ms), and the program prints "Everything went fine!". ` + (st.limit ? `With <code>SetLimit(${st.limit})</code>, <code>g.Go()</code> blocks until a slot frees up, so the fetches run in waves and take longer overall.` : `Without a limit all ${EG_URLS.length} goroutines start at once, so wall time is the slowest single fetch.`);
        else if (st.mode === `group`) n = `A plain <code>errgroup.Group</code> remembers the <strong>first</strong> error (${first.end} ms) but cancels nothing. The other fetches run to completion and <code>Wait()</code> returns only at ${waitAt} ms, after ${wasted} ms of work done after the outcome was already known.`;
        else if (st.mode === `ignore`) n = `<code>errgroup.WithContext</code> <em>does</em> cancel its context at ${first.end} ms, but these goroutines use <code>http.Get</code>, which never sees that context. Cancellation is cooperative: a context only helps if the work checks it. Same timing as a plain Group.`;
        else n = `With <code>WithContext</code> and <code>http.NewRequestWithContext(ctx, ...)</code>, the first error cancels <code>ctx</code>. In-flight requests abort with <code>context canceled</code>` + (st.limit ? `, and goroutines started later by the blocked <code>g.Go()</code> fail immediately` : ``) + `. <code>Wait()</code> returns at ${waitAt} ms, almost right after the error, and still reports the <em>first</em> error, not the cancellations.`;
        qk(el, `note`).innerHTML = note(n, first ? (st.mode === `ctx` ? `good` : `warn`) : `good`);
      };
      qk(el, `reseed`).addEventListener(`click`, () => { st.seed++; draw(); });
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch10 - TCP vs UDP message exchange
  // =====================================================================
  D.c10TcpUdp = {
    title: `TCP vs UDP: the same messages over a lossy network`,
    blurb: `Send the same numbered messages with <code>net.Dial("tcp", ...)</code> and with <code>net.DialUDP("udp4", ...)</code> over a link that drops and delays packets. TCP pays for a handshake and retransmissions but hands <code>bufio.Reader</code> every byte, in order. UDP sends immediately, and <code>ReadFromUDP</code> returns whatever survives, in whatever order it arrives. Times are in ticks; one-way latency is 2 ticks.`,
    mount(el) {
      const st = { n: 8, loss: 15, reorder: 20, seed: 3 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`messages`, rng(`n`, 3, 12, 1, st.n))}${ctl(`packet loss`, rng(`loss`, 0, 40, 5, st.loss))}</div>
        <div class="ctl-row">${ctl(`delay jitter`, rng(`reorder`, 0, 50, 5, st.reorder))}${ghostBtn(`data-k="reseed"`, `new network luck`)}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>TCP: what bufio.Reader delivers</h4><div data-k="tcpT"></div><div data-k="tcpS"></div><div class="log" data-k="tcpL"></div></div>
          <div class="lab-panel"><h4>UDP: what ReadFromUDP returns</h4><div data-k="udpT"></div><div data-k="udpS"></div><div class="log" data-k="udpL"></div></div>
        </div>
        <div data-k="note"></div>`;
      const L = 2, RTO = 6;
      const draw = () => {
        const r = mulberry32(st.seed * 7919 + 1);
        const U = [];
        for (let i = 0; i < 12; i++) { const row = []; for (let k = 0; k < 6; k++) row.push({ l: r(), j: r(), a: r() }); U.push(row); }
        const lost = (i, k) => U[i][k].l * 100 < st.loss;
        const jit = (i, k) => U[i][k].j * 100 < st.reorder ? 1 + Math.floor(U[i][k].a * 5) : 0;
        const N = st.n;
        // UDP
        const ud = [];
        for (let i = 0; i < N; i++) ud.push({ i, send: i, lost: lost(i, 0), arr: i + L + jit(i, 0) });
        const arrived = ud.filter(x => !x.lost).sort((a, b) => a.arr - b.arr || a.i - b.i);
        let mx = -1, ooo = 0;
        arrived.forEach(x => { x.ooo = x.i < mx; if (x.ooo) ooo++; mx = Math.max(mx, x.i); });
        const uLog = [];
        ud.forEach(x => { uLog.push({ t: x.send, c: `info`, s: `t=${x.send} -> datagram "msg${x.i + 1}"` }); uLog.push(x.lost ? { t: x.send + 0.5, c: `bad`, s: `t=${x.send} x msg${x.i + 1} lost, nobody notices` } : { t: x.arr + 0.1, c: x.ooo ? `dup` : `ok`, s: `t=${x.arr} ReadFromUDP -> "msg${x.i + 1}"${x.ooo ? ` (out of order)` : ``}` }); });
        uLog.sort((a, b) => a.t - b.t);
        qk(el, `udpT`).innerHTML = `<div class="toks" style="margin-bottom:6px">${arrived.map(x => `<span class="tok ${x.ooo ? `c2 hot` : `c5`}">msg${x.i + 1}</span>`).join(``)}${ud.filter(x => x.lost).map(x => `<span class="tok c4 dim">msg${x.i + 1} ✗</span>`).join(``)}</div>`;
        const uLast = arrived.length ? Math.max(...arrived.map(x => x.arr)) : 0;
        qk(el, `udpS`).innerHTML = `<div class="stat-row">${stat(`delivered`, `${arrived.length}/${N}`, arrived.length < N ? `bad` : `good`)}${stat(`out of order`, ooo, ooo ? `bad` : `good`)}${stat(`last arrival`, `t=${uLast}`)}${stat(`packets sent`, N)}</div>`;
        qk(el, `udpL`).innerHTML = uLog.map(x => `<div class="${x.c}">${esc(x.s)}</div>`).join(``);
        // TCP
        const tLog = [{ t: 0, c: `info`, s: `t=0 -> SYN` }, { t: L, c: `info`, s: `t=${L} <- SYN-ACK` }, { t: 2 * L, c: `info`, s: `t=${2 * L} -> ACK (net.Dial returns)` }];
        const tc = [];
        let tx = 0, retx = 0, prevDel = 0, hol = 0;
        for (let i = 0; i < N; i++) {
          let send = 2 * L + i, k = 0;
          tx++;
          tLog.push({ t: send, c: `info`, s: `t=${send} -> segment "msg${i + 1}"` });
          while (k < 5 && lost(i, k)) {
            tLog.push({ t: send + 0.4, c: `bad`, s: `t=${send} x msg${i + 1} lost` });
            send += RTO; k++; tx++; retx++;
            tLog.push({ t: send, c: `dup`, s: `t=${send} -> retransmit "msg${i + 1}" (no ACK)` });
          }
          const arr = send + L + jit(i, k);
          const del = Math.max(arr, prevDel);
          if (del > arr) { hol += del - arr; tLog.push({ t: arr + 0.2, c: `dup`, s: `t=${arr} msg${i + 1} arrives, buffered (waiting for an earlier segment)` }); }
          tLog.push({ t: del + 0.3, c: `ok`, s: `t=${del} ReadString -> "msg${i + 1}"` });
          tc.push({ i, arr, del, retx: k });
          prevDel = del;
        }
        const tEnd = prevDel + 2 * L;
        tLog.push({ t: tEnd, c: `info`, s: `t=${tEnd} FIN / ACK exchange, conn.Close()` });
        tLog.sort((a, b) => a.t - b.t);
        qk(el, `tcpT`).innerHTML = `<div class="toks" style="margin-bottom:6px">${tc.map(x => `<span class="tok c5${x.retx ? ` hot` : ``}" title="arrived t=${x.arr}, delivered t=${x.del}">msg${x.i + 1}${x.retx ? ` ↻` : ``}</span>`).join(``)}</div>`;
        qk(el, `tcpS`).innerHTML = `<div class="stat-row">${stat(`delivered`, `${N}/${N}`, `good`)}${stat(`retransmits`, retx, retx ? `bad` : `good`)}${stat(`head-of-line wait`, hol + ` ticks`, hol ? `bad` : `good`)}${stat(`last delivery`, `t=${prevDel}`)}${stat(`packets on wire`, 3 + tx + N + 4)}</div>`;
        qk(el, `tcpL`).innerHTML = tLog.map(x => `<div class="${x.c}">${esc(x.s)}</div>`).join(``);
        let n = `TCP delivered all ${N} messages in order, but the last one reached the application at t=${prevDel}, while UDP's last datagram landed at t=${uLast}. `;
        if (retx) n += `${retx} retransmission${retx > 1 ? `s` : ``} cost ${RTO} ticks each, and because TCP is an ordered byte stream, later segments that had already arrived waited ${hol} ticks in the kernel buffer (<strong>head-of-line blocking</strong>). `;
        n += arrived.length < N || ooo ? `UDP lost ${N - arrived.length} and reordered ${ooo}: the application must detect and handle that itself (sequence numbers, retries), or simply not care, as with metrics, games or the book's random-number server.` : `With this luck UDP lost nothing, but nothing guarantees that. Raise the loss rate.`;
        n += ` The TCP model is simplified (no windows or fast retransmit), but the trade-off is real.`;
        qk(el, `note`).innerHTML = note(n, retx || arrived.length < N ? `warn` : `good`);
      };
      qk(el, `reseed`).addEventListener(`click`, () => { st.seed++; draw(); });
      wireRanges(el, st, { n: v => v, loss: v => v + `%`, reorder: v => v + `% delayed` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch10 - Concurrent TCP server
  // =====================================================================
  const CT_CODE = {
    once: `l, _ := net.Listen("tcp", PORT)\nc, _ := l.Accept()        // called once\nfor {\n    netData, _ := bufio.NewReader(c).ReadString('\\n')\n    ... // serve this one client until STOP\n}`,
    seq: `l, _ := net.Listen("tcp", PORT)\nfor {\n    c, _ := l.Accept()\n    handleConnection(c)    // runs inline: blocks the loop\n}`,
    conc: `l, _ := net.Listen("tcp4", PORT)\nfor {\n    c, _ := l.Accept()\n    go handleConnection(c, count) // own goroutine\n    count++\n}`
  };
  D.c10ConcTcp = {
    title: `Concurrent TCP server: Accept once vs sequential vs goroutine per connection`,
    blurb: `Clients connect one after another and each keeps its session open for a few seconds before sending <code>STOP</code>. Compare the book's <code>tcpS.go</code> (which calls <code>Accept()</code> only once), a loop that handles each connection inline, and <code>concTCP.go</code>, which hands every connection to <code>go handleConnection(c, count)</code>.`,
    mount(el) {
      const st = { mode: `seq`, clients: 6, dur: 4, gap: 1, seed: 2 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`server`, seg(`mode`, [[`once`, `tcpS.go (Accept once)`], [`seq`, `Accept loop, inline`], [`conc`, `concTCP.go (go handle)`]], st.mode))}</div>
        <div class="ctl-row">${ctl(`clients`, rng(`clients`, 2, 10, 1, st.clients))}${ctl(`avg session`, rng(`dur`, 1, 10, 0.5, st.dur))}${ctl(`arrive every`, rng(`gap`, 0.2, 4, 0.2, st.gap))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Client sessions (seconds)</h4><div data-k="svg"></div><div class="legend"><span><span class="sw" style="background:var(--text-muted);opacity:.45"></span>connected, waiting in the backlog</span><span><span class="sw" style="background:var(--accent)"></span>being served</span><span><span class="sw" style="background:var(--bad)"></span>reset / refused</span></div></div>
          <div class="lab-panel"><h4>Server loop</h4><div data-k="code"></div><div data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const draw = () => {
        const r = mulberry32(st.seed * 131 + 7);
        const cs = [];
        for (let i = 0; i < st.clients; i++) {
          const jit = r(), f = 0.4 + r() * 1.2;
          cs.push({ i, a: round(i * st.gap + jit * st.gap * 0.4, 2), d: round(Math.max(0.3, st.dur * f), 2) });
        }
        let prevEnd = 0, exitT = null;
        cs.forEach((c, k) => {
          if (st.mode === `conc`) { c.s = c.a; c.e = c.a + c.d; }
          else if (st.mode === `seq`) { c.s = Math.max(c.a, prevEnd); c.e = c.s + c.d; prevEnd = c.e; }
          else {
            if (k === 0) { c.s = c.a; c.e = c.a + c.d; exitT = c.e; }
            else if (c.a < exitT) { c.s = null; c.e = exitT; c.fate = `reset`; }
            else { c.s = null; c.e = c.a; c.fate = `refused`; }
          }
        });
        const maxT = Math.max(...cs.map(c => c.e)) * 1.05 + 0.2;
        const x0 = 70, x1 = 505, X = t => x0 + (t / maxT) * (x1 - x0), RH = 22, H = cs.length * RH + 30;
        let s = ``;
        const step = maxT > 30 ? 10 : maxT > 12 ? 4 : maxT > 5 ? 2 : 1;
        for (let t = 0; t <= maxT; t += step) s += `<line class="svg-grid" x1="${X(t)}" x2="${X(t)}" y1="4" y2="${H - 20}"/><text class="svg-label" x="${X(t)}" y="${H - 6}" text-anchor="middle">${t}s</text>`;
        cs.forEach((c, k) => {
          const y = 6 + k * RH;
          s += `<text class="svg-label" x="${x0 - 6}" y="${y + 12}" text-anchor="end">client ${c.i}</text>`;
          if (c.fate === `refused`) { s += `<rect x="${X(c.a) - 3}" y="${y}" width="6" height="15" rx="2" style="fill:var(--bad)"/><text class="svg-label" x="${X(c.a) + 6}" y="${y + 12}">refused</text>`; return; }
          const ws = c.a, we = c.s == null ? c.e : c.s;
          if (we > ws) s += `<rect x="${X(ws)}" y="${y + 3}" width="${Math.max(1, X(we) - X(ws))}" height="9" rx="2" style="fill:var(--text-muted);opacity:.45"/>`;
          if (c.fate === `reset`) s += `<rect x="${X(c.e) - 3}" y="${y}" width="6" height="15" rx="2" style="fill:var(--bad)"/><text class="svg-label" x="${Math.min(X(c.e) + 6, x1 - 30)}" y="${y + 12}">reset</text>`;
          else s += `<rect x="${X(c.s)}" y="${y}" width="${Math.max(1, X(c.e) - X(c.s))}" height="15" rx="3" style="fill:var(--accent)"/>`;
        });
        qk(el, `svg`).innerHTML = svgWrap(520, H, s);
        qk(el, `code`).innerHTML = [`once`, `seq`, `conc`].map(m => pblock(m === st.mode ? `out` : `off`, m === `once` ? `tcpS.go` : m === `seq` ? `sequential` : `concTCP.go`, CT_CODE[m])).join(``);
        const served = cs.filter(c => c.s != null);
        const waits = served.map(c => c.s - c.a);
        const avgW = waits.length ? sum(waits) / waits.length : 0;
        const span = Math.max(...cs.map(c => c.e)) - cs[0].a;
        qk(el, `stats`).innerHTML = `<div class="stat-row">${stat(`served`, `${served.length}/${cs.length}`, served.length < cs.length ? `bad` : `good`)}${stat(`avg wait`, round(avgW, 2) + ` s`, avgW > 0.05 ? `bad` : `good`)}${stat(`max wait`, round(waits.length ? Math.max(...waits) : 0, 2) + ` s`)}${stat(`all done after`, round(span, 1) + ` s`)}</div>`;
        let n, ncls;
        if (st.mode === `once`) {
          const rs = cs.filter(c => c.fate === `reset`).length, rf = cs.filter(c => c.fate === `refused`).length;
          n = `Only <strong>client 0</strong> is ever served: <code>Accept()</code> sits outside the loop. The kernel still completes the TCP handshake for the others and queues them in the listen backlog, so their <code>net.Dial</code> <em>succeeds</em>, but nobody reads. When client 0 sends STOP the program returns, ${rs} waiting client${rs === 1 ? ` is` : `s are`} reset${rf ? ` and ${rf} later one${rf === 1 ? ` is` : `s are`} refused` : ``}. The book leaves fixing this as an exercise.`;
          ncls = `bad`;
        } else if (st.mode === `seq`) {
          n = `<code>Accept()</code> is in the loop, but the handler runs inline, so the next client is accepted only after the current one sends STOP. Waits pile up (average ${round(avgW, 2)} s) whenever sessions are longer than the gap between arrivals. One slow or idle client blocks everyone behind it.`;
          ncls = avgW > 0.05 ? `warn` : `good`;
        } else {
          n = `Each accepted connection gets its own goroutine, and the main goroutine goes straight back to <code>Accept()</code>, so nobody waits and the sessions overlap. This is the pattern behind every Go network server, <code>net/http</code> included. Goroutines start with a few KB of stack, so tens of thousands of connections are fine. Add <code>defer c.Close()</code> and read deadlines so idle clients can't pin goroutines forever.`;
          ncls = `good`;
        }
        qk(el, `note`).innerHTML = note(n, ncls);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { clients: v => v, dur: v => v + ` s`, gap: v => v + ` s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch10 - WebSocket handshake and frames
  // =====================================================================
  const WS_GUID = `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`;
  function utf8(str) {
    if (typeof TextEncoder !== `undefined`) return Array.from(new TextEncoder().encode(str));
    const s = unescape(encodeURIComponent(str));
    return Array.from(s, ch => ch.charCodeAt(0));
  }
  function sha1(bytes) {
    const m = bytes.slice();
    const bitLen = bytes.length * 8;
    m.push(0x80);
    while (m.length % 64 !== 56) m.push(0);
    const hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
    m.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    const w = new Array(80);
    for (let i = 0; i < m.length; i += 64) {
      for (let j = 0; j < 16; j++) w[j] = (m[i + 4 * j] << 24) | (m[i + 4 * j + 1] << 16) | (m[i + 4 * j + 2] << 8) | m[i + 4 * j + 3];
      for (let j = 16; j < 80; j++) { const x = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16]; w[j] = (x << 1) | (x >>> 31); }
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let j = 0; j < 80; j++) {
        let f, k;
        if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        const t = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) | 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    const out = [];
    [h0, h1, h2, h3, h4].forEach(h => out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255));
    return out;
  }
  const B64 = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/`;
  function b64(bytes) {
    let s = ``;
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : `=`) + (i + 2 < bytes.length ? B64[n & 63] : `=`);
    }
    return s;
  }
  const wsAccept = key => b64(sha1(utf8(key + WS_GUID)));
  const hex2 = b => b.toString(16).toUpperCase().padStart(2, `0`);
  function wsFrame(op, payload, mask) {
    const hdr = [{ b: 0x80 | op, c: `c3`, l: `FIN+op` }];
    const len = payload.length, mbit = mask ? 0x80 : 0;
    if (len < 126) hdr.push({ b: mbit | len, c: `c1`, l: mask ? `M+len` : `len` });
    else { hdr.push({ b: mbit | 126, c: `c1`, l: mask ? `M+126` : `126` }, { b: (len >> 8) & 255, c: `c1`, l: `len` }, { b: len & 255, c: `c1`, l: `len` }); }
    if (mask) mask.forEach(b => hdr.push({ b, c: `c2`, l: `mask` }));
    const body = payload.map((b, i) => ({ b: mask ? b ^ mask[i % 4] : b, c: mask ? `c4` : `c5`, l: mask ? `xor` : (b >= 32 && b < 127 ? String.fromCharCode(b) : `·`) }));
    return { hdr, body, total: hdr.length + body.length };
  }
  const bytesHtml = (arr, max) => `<div class="bytes">${arr.slice(0, max).map(x => `<span class="byte ${x.c}">${hex2(x.b)}<small>${esc(x.l)}</small></span>`).join(``)}${arr.length > max ? `<span class="byte dim">…<small>+${arr.length - max}</small></span>` : ``}</div>`;
  D.c10WebSocket = {
    title: `WebSocket: the Upgrade handshake and frames on the wire`,
    blurb: `What <code>upgrader.Upgrade(w, r, nil)</code> and <code>websocket.DefaultDialer.Dial()</code> exchange. The server proves it speaks WebSocket by hashing the client's <code>Sec-WebSocket-Key</code> with a fixed GUID (SHA-1, then base64). The RFC 6455 sample key gives the RFC's answer. Then type a message and see the frames: the client's <code>WriteMessage</code> is <strong>masked</strong> and the server's echo is not. Switch the page's Origin to an attacker's site to see what the book's <code>CheckOrigin: return true</code> allows.`,
    mount(el) {
      const st = { key: `rfc`, kseed: 1, origin: `same`, check: `book`, op: `text`, msg: `Hello from websocat!` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`Sec-WebSocket-Key`, seg(`key`, [[`rfc`, `RFC 6455 sample`], [`rand`, `random`]], st.key))}${ghostBtn(`data-k="newkey"`, `new key`)}</div>
        <div class="ctl-row">${ctl(`page Origin`, seg(`origin`, [[`same`, `http://localhost:1234`], [`evil`, `https://evil.example`]], st.origin))}${ctl(`CheckOrigin`, seg(`check`, [[`book`, `book: return true`], [`default`, `nil (same host)`], [`allow`, `allowlist`]], st.check))}</div>
        <div class="ctl-row">${ctl(`message type`, seg(`op`, [[`text`, `TextMessage`], [`binary`, `BinaryMessage`], [`ping`, `ping`], [`close`, `CloseMessage`]], st.op))}
          <span class="ctl" style="flex:1"><span class="ctl-label">payload</span><input class="lab-input mono" data-k="msg" value="${esc(st.msg)}" maxlength="300" spellcheck="false"></span></div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Handshake (HTTP/1.1)</h4><div data-k="hs"></div></div>
          <div class="lab-panel"><h4>Frames</h4><div data-k="fr"></div></div>
        </div>
        <div data-k="stats"></div>
        <div data-k="note"></div>`;
      const inp = qk(el, `msg`);
      const draw = () => {
        let key;
        if (st.key === `rfc`) key = `dGhlIHNhbXBsZSBub25jZQ==`;
        else { const r = mulberry32(st.kseed * 2654435761); const kb = []; for (let i = 0; i < 16; i++) kb.push(Math.floor(r() * 256)); key = b64(kb); }
        const acc = wsAccept(key);
        const origin = st.origin === `same` ? `http://localhost:1234` : `https://evil.example`;
        const allowed = st.check === `book` ? true : st.check === `default` ? origin.replace(/^https?:\/\//, ``) === `localhost:1234` : [`http://localhost:1234`, `https://app.example.com`].includes(origin);
        const req = `GET /ws HTTP/1.1\nHost: localhost:1234\nUpgrade: websocket\nConnection: Upgrade\nSec-WebSocket-Version: 13\nSec-WebSocket-Key: ${key}\nOrigin: ${origin}`;
        const resp = allowed
          ? `HTTP/1.1 101 Switching Protocols\nUpgrade: websocket\nConnection: Upgrade\nSec-WebSocket-Accept: ${acc}`
          : `HTTP/1.1 403 Forbidden\nContent-Type: text/plain; charset=utf-8\nSec-Websocket-Version: 13\n\nForbidden`;
        qk(el, `hs`).innerHTML = pblock(`user`, `client -> server`, req) + pblock(allowed ? `out` : `bad`, `server -> client`, resp) +
          (allowed ? pblock(`sys`, `how the accept value is computed`, `base64( SHA-1( "${key}"\n             + "${WS_GUID}" ) )\n= ${acc}`) : pblock(`bad`, `server log`, `upgrader.Upgrade: websocket: request origin not allowed by Upgrader.CheckOrigin`));
        let payload = st.op === `close` ? [0x03, 0xE8] : utf8(st.msg);
        if (st.op === `ping` && payload.length > 125) payload = payload.slice(0, 125);
        const opc = { text: 1, binary: 2, ping: 9, close: 8 }[st.op];
        const r2 = mulberry32(st.kseed * 97 + 5);
        const mask = [0, 0, 0, 0].map(() => Math.floor(r2() * 256));
        const cf = wsFrame(opc, payload, mask);
        const replyOp = st.op === `ping` ? 0xA : opc;
        const sf = wsFrame(replyOp, payload, null);
        const opName = { 1: `text (0x1)`, 2: `binary (0x2)`, 8: `close (0x8)`, 9: `ping (0x9)`, 10: `pong (0xA)` };
        if (!allowed) {
          qk(el, `fr`).innerHTML = note(`No frames: the upgrade was refused with <strong>403</strong>, and the connection stays HTTP and is closed.`, `bad`);
        } else {
          qk(el, `fr`).innerHTML = `<div style="font-size:12px;margin-bottom:4px">client <code>WriteMessage</code>: ${opName[opc]}, <strong>masked</strong></div>${bytesHtml(cf.hdr.concat(cf.body), 40)}
            <div style="font-size:12px;margin:10px 0 4px">server ${st.op === `ping` ? `auto-reply (default PingHandler)` : st.op === `close` ? `close reply (default CloseHandler)` : `echo <code>WriteMessage(mt, message)</code>`}: ${opName[replyOp]}, unmasked</div>${bytesHtml(sf.hdr.concat(sf.body), 40)}
            <div class="legend"><span>${chip(`final`, `FIN + opcode`)}</span><span>${chip(`muted`, `mask bit + length`)}</span><span>${chip(`early`, `masking key`)}</span><span>${chip(`late`, `masked payload`)}</span><span>${chip(`ok`, `plain payload`)}</span></div>`;
        }
        const httpReq = `POST /msg HTTP/1.1\r\nHost: localhost:1234\r\nUser-Agent: Go-http-client/1.1\r\nContent-Length: ${payload.length}\r\nContent-Type: text/plain\r\nAccept-Encoding: gzip\r\n\r\n`.length + payload.length;
        const httpResp = `HTTP/1.1 200 OK\r\nDate: Mon, 09 Oct 2023 17:29:31 GMT\r\nContent-Length: ${payload.length}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n`.length + payload.length;
        qk(el, `stats`).innerHTML = allowed ? `<div class="lab-panel" style="margin-top:12px"><h4>Bytes for one round trip</h4>${hbars([
          { label: `WebSocket frames`, value: cf.total + sf.total, text: fmtBytes(cf.total + sf.total), cls: `good` },
          { label: `HTTP POST + reply`, value: httpReq + httpResp, text: fmtBytes(httpReq + httpResp), cls: `warn` }
        ])}<div class="stat-row">${stat(`payload`, fmtBytes(payload.length))}${stat(`client frame overhead`, fmtBytes(cf.total - payload.length))}${stat(`server frame overhead`, fmtBytes(sf.total - payload.length))}</div></div>` : ``;
        let n;
        if (!allowed) n = `The default <code>CheckOrigin</code> (nil) rejects a handshake whose <code>Origin</code> host differs from <code>Host</code>, and an allowlist rejects anything not on it. Browsers do <em>not</em> apply CORS to WebSockets, so this check is your protection against cross-site WebSocket hijacking.`;
        else if (st.origin === `evil`) n = `The book's <code>CheckOrigin: func(r *http.Request) bool { return true }</code> accepts the attacker's page. If the server authenticated with cookies, that page could now read and send messages as the victim. Fine for a local echo server, never for production.`;
        else if (st.op === `ping`) n = `Pings are control frames (at most 125 bytes). <code>ReadMessage()</code> never returns them: gorilla's default ping handler answers with a <strong>pong</strong> carrying the same payload. Servers use pings plus read deadlines to detect dead peers.`;
        else if (st.op === `close`) n = `The book's client sends <code>websocket.FormatCloseMessage(websocket.CloseNormalClosure, "")</code>: opcode 0x8 with the 2-byte status <code>03 E8</code> = 1000. The server's <code>ReadMessage</code> then fails with <code>websocket: close 1000 (normal)</code>, as in the book's log. Closing websocat with Ctrl+D gives 1005 (no status) instead.`;
        else n = `After the 101 response the same TCP connection carries frames: 2 header bytes for short payloads (<code>FIN</code>, the opcode, the mask bit and the length), plus a 4-byte <strong>masking key</strong> on every client frame. The payload is XORed with it so intermediaries can't be tricked into caching attacker-chosen bytes. The server's echo is sent unmasked. Compared with a new HTTP request per message, the per-message overhead is tiny.`;
        qk(el, `note`).innerHTML = note(n, !allowed ? `good` : st.origin === `evil` ? `bad` : `good`);
      };
      inp.addEventListener(`input`, () => { st.msg = inp.value; draw(); });
      qk(el, `newkey`).addEventListener(`click`, () => { st.kseed++; if (st.key === `rfc`) { st.key = `rand`; K.setSeg(el, `key`, `rand`); } draw(); });
      wireSegs(el, st, draw);
      draw();
    },
    _accept: wsAccept
  };

  // =====================================================================
  // Ch11 - REST explorer for the book's SQLite user server (gorilla/mux)
  // =====================================================================
  const REST_ROUTES = [
    { m: null, p: `/time`, h: `TimeHandler` },
    { m: `GET`, p: `/getall`, h: `GetAllHandler` },
    { m: `GET`, p: `/getid/{username}`, h: `GetIDHandler` },
    { m: `GET`, p: `/logged`, h: `LoggedUsersHandler` },
    { m: `GET`, p: `/username/{id:[0-9]+}`, h: `GetUserDataHandler` },
    { m: `PUT`, p: `/update`, h: `UpdateHandler` },
    { m: `POST`, p: `/add`, h: `AddHandler` },
    { m: `POST`, p: `/login`, h: `LoginHandler` },
    { m: `POST`, p: `/logout`, h: `LogoutHandler` },
    { m: `DELETE`, p: `/username/{id:[0-9]+}`, h: `DeleteHandler` }
  ];
  function gmMatch(pattern, path) {
    const ps = pattern.split(`/`), xs = path.split(`/`);
    if (ps.length !== xs.length) return null;
    const vars = {};
    for (let i = 0; i < ps.length; i++) {
      const m = /^\{([^:}]+)(?::(.+))?\}$/.exec(ps[i]);
      if (!m) { if (ps[i] !== xs[i]) return null; continue; }
      const re = new RegExp(`^(?:${m[2] || `[^/]+`})$`);
      if (!re.test(xs[i])) return null;
      vars[m[1]] = xs[i];
    }
    return vars;
  }
  const REST_SEED = () => [
    { id: 1, username: `admin`, password: `admin`, lastlogin: 1620922454, admin: 1, active: 1 },
    { id: 3, username: `mihalis`, password: `admin`, lastlogin: 0, admin: 0, active: 0 },
    { id: 4, username: `newUser`, password: `aPass`, lastlogin: 0, admin: 0, active: 0 }
  ];
  const REST_ISSUERS = { a1: [`admin`, `admin`], a2: [`admin`, `justChanged`], m: [`mihalis`, `admin`], bad: [`admin`, `notPass`] };
  const REST_PRESETS = [
    [`list all`, `GET`, `/getall`],
    [`getid mihalis`, `GET`, `/getid/mihalis`],
    [`user 3`, `GET`, `/username/3`],
    [`logged`, `GET`, `/logged`],
    [`add packt`, `POST`, `/add`, `{"username":"packt","password":"admin","admin":0}`],
    [`login`, `POST`, `/login`],
    [`logout`, `POST`, `/logout`],
    [`change admin pw`, `PUT`, `/update`, `{"username":"admin","password":"justChanged","admin":1}`],
    [`delete 4`, `DELETE`, `/username/4`],
    [`PUT /getall`, `PUT`, `/getall`],
    [`/username/abc`, `GET`, `/username/abc`],
    [`/doesNotExist`, `GET`, `/doesNotExist`],
    [`PATCH /time`, `PATCH`, `/time`]
  ];
  D.c11RestExplorer = {
    title: `REST explorer: the book's SQLite user server`,
    blurb: `A simulation of the chapter's gorilla/mux server, with one subrouter per HTTP method, path variables like <code>{id:[0-9]+}</code>, a <code>NotFoundHandler</code> and a <code>MethodNotAllowedHandler</code>. Every request carries the issuer's credentials in its JSON body, as in the book. Pick a request (or type one), choose who issues it, and press <strong>Send</strong>: you'll see the curl command, how the router dispatches it, the status code and JSON, and the database change. Try changing admin's password, then sending as <code>admin:admin</code> again.`,
    mount(el) {
      let db = REST_SEED(), nextId = 5;
      const hist = [];
      let lastChange = null;
      const st = { method: `GET`, issuer: `a1`, path: `/getall`, data: `{"username":"packt","password":"admin","admin":0}` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`presets`, REST_PRESETS.map((p, i) => ghostBtn(`data-pre="${i}" style="padding:3px 8px;font-size:11.5px"`, esc(p[0]))).join(` `))}</div>
        <div class="ctl-row">${ctl(`method`, seg(`method`, [[`GET`, `GET`], [`POST`, `POST`], [`PUT`, `PUT`], [`PATCH`, `PATCH`], [`DELETE`, `DELETE`]], st.method))}${ctl(`issued by (-u / -p)`, seg(`issuer`, [[`a1`, `admin:admin`], [`a2`, `admin:justChanged`], [`m`, `mihalis:admin`], [`bad`, `admin:notPass`]], st.issuer))}</div>
        <div class="ctl-row"><span class="ctl" style="flex:1"><span class="ctl-label">path</span><input class="lab-input mono" data-k="path" value="${esc(st.path)}" spellcheck="false"></span>
          <span class="ctl" style="flex:1.4"><span class="ctl-label">data (--data, for /add and /update)</span><input class="lab-input mono" data-k="data" value="${esc(st.data)}" spellcheck="false"></span>
          <button class="lab-btn" data-k="send">Send</button>${ghostBtn(`data-k="reset"`, `reset DB`)}</div>
        <div data-k="curl"></div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Router and handler</h4><div data-k="route"></div><div data-k="resp"></div></div>
          <div class="lab-panel"><h4>users table (REST.db)</h4><div data-k="db"></div><h4 style="margin-top:10px">Request log</h4><div class="log" data-k="log"></div></div>
        </div>
        <div data-k="note"></div>`;
      const inPath = qk(el, `path`), inData = qk(el, `data`);
      const issuer = () => { const [u, p] = REST_ISSUERS[st.issuer]; return { username: u, password: p }; };
      const findName = n => db.find(u => u.username === n);
      const valid = u => { const x = findName(u.username); return !!x && x.password === u.password; };
      const isAdmin = u => valid(u) && findName(u.username).admin === 1;
      const needsPair = p => p === `/add` || p === `/update`;
      const reqBody = path => {
        const iss = JSON.stringify(issuer());
        if (path === `/time`) return null;
        return needsPair(path) ? `[${iss}, ${st.data.trim() || `{}`}]` : iss;
      };
      const normPath = () => { let p = (st.path || `/`).trim().split(`?`)[0] || `/`; if (!p.startsWith(`/`)) p = `/` + p; return p; };
      const drawCurl = () => {
        const p = normPath(), b = reqBody(p);
        qk(el, `curl`).innerHTML = pblock(`user`, `equivalent curl`, `curl -X ${st.method} ${b ? `-H 'Content-Type: application/json' -d '${b}' ` : ``}localhost:1234${p} -v`);
      };
      const jsonList = arr => arr.length ? `[` + arr.map(u => JSON.stringify(u)).join(`,\n `) + `]` : `[]`;
      const exec = () => {
        const path = normPath(), M = st.method;
        let route = null, vars = null;
        const pathHits = [];
        for (const rt of REST_ROUTES) {
          const v = gmMatch(rt.p, path);
          if (!v) continue;
          pathHits.push(rt);
          if (rt.m === null || rt.m === M) { route = rt; vars = v; break; }
        }
        lastChange = null;
        let code = 200, ctype = `application/json`, body = ``, trace, why;
        if (!route && pathHits.length) {
          code = 405; ctype = `text/plain`; body = `Method not allowed!`;
          trace = `rMux: path ${path} matches ${pathHits.map(r => `${r.m} ${r.p}`).join(`, `)}\n      but no route accepts ${M}\n-> rMux.MethodNotAllowedHandler`;
          why = `gorilla/mux found a route for the path but not for <code>${M}</code>, so <code>MethodNotAllowedHandler</code> answers before any handler or credential check runs. This is the book's <code>PUT /getall</code> test.`;
        } else if (!route) {
          code = 404; ctype = `text/plain`; body = `${path} is not supported. Thanks for visiting!`;
          trace = `rMux: no route matches ${path}${/^\/username\//.test(path) ? `\n      ({id:[0-9]+} requires digits)` : ``}\n-> rMux.NotFoundHandler = DefaultHandler`;
          why = /^\/username\//.test(path) ? `The variable <code>{id:[0-9]+}</code> carries a regex, so <code>abc</code> doesn't match the route at all. The handler never has to validate the ID, and the request falls through to <code>NotFoundHandler</code>.` : `No route matches, so gorilla/mux calls <code>NotFoundHandler</code> (the book's <code>DefaultHandler</code>).`;
        } else {
          const varTxt = Object.keys(vars).length ? `\n      mux.Vars(r) = ${JSON.stringify(vars)}` : ``;
          trace = `rMux -> ${route.m ? `${route.m} subrouter (rMux.Methods(http.Method${route.m[0] + route.m.slice(1).toLowerCase()}).Subrouter())` : `root router (all methods)`}\n      route ${route.p}${varTxt}\n-> ${route.h}(rw, r)`;
          const iss = issuer();
          let pair = null;
          if (needsPair(path)) { try { pair = JSON.parse(st.data.trim() || `{}`); } catch (e) { pair = undefined; } }
          const now = Math.floor(Date.now() / 1000);
          const h = route.h;
          if (h === `TimeHandler`) { ctype = `text/plain`; body = `The current time is: ${new Date().toUTCString()}`; why = `<code>/time</code> is registered on the root router, so it answers every method (even ${M}), needs no JSON and no account. The book uses it as a health check.`; }
          else if (h === `GetAllHandler`) {
            if (!isAdmin(iss)) { code = 400; body = ``; why = `<code>IsUserAdmin(user)</code> failed (${valid(iss) ? `not an admin` : `wrong username or password`}). The book answers <strong>400 Bad Request</strong>; a stricter API would use 401 (bad credentials) or 403 (not allowed).`; }
            else { body = jsonList(db); why = `Admin credentials checked, so <code>SliceToJSON(ListAllUsers(), rw)</code> streams every row. Note that the passwords go out too: a real API must never return them, and should store bcrypt or argon2 hashes, not plaintext.`; }
          } else if (h === `GetIDHandler`) {
            if (!isAdmin(iss)) { code = 400; why = `Only admins may look up IDs, so 400.`; }
            else { const u = findName(vars.username); if (!u) { code = 404; why = `No user called <code>${esc(vars.username)}</code>.`; } else { body = JSON.stringify(u); why = `<code>mux.Vars(r)["username"]</code> = "${esc(vars.username)}", and the user's ID is ${u.id}.`; } }
          } else if (h === `LoggedUsersHandler`) {
            if (!valid(iss)) { code = 400; why = `The issuer's credentials are invalid, so 400.`; }
            else { body = jsonList(db.filter(u => u.active === 1)); why = `Returns every row with <code>active = 1</code>. Use the login and logout presets to change this list.`; }
          } else if (h === `GetUserDataHandler` || h === `DeleteHandler`) {
            const id = +vars.id, u = db.find(x => x.id === id);
            if (!isAdmin(iss)) { code = 400; why = `Admin only, so 400.`; }
            else if (!u) { code = 404; why = `No user with ID ${id}. ${h === `DeleteHandler` ? `Deleting twice gives 404 the second time, which is the behaviour the book checks with <code>curl -v</code>. DELETE is still idempotent: the <em>state</em> is the same.` : ``}`; }
            else if (h === `GetUserDataHandler`) { body = JSON.stringify(u); why = `Same path as the DELETE route, but the GET subrouter sends it to <code>GetUserDataHandler</code>. The method decides the action.`; }
            else { db = db.filter(x => x.id !== id); body = ``; lastChange = { id, kind: `del`, row: u }; why = `<code>DeleteUser(${id})</code> runs <code>DELETE FROM users WHERE UserID = $1</code> through <code>Prepare</code>/<code>Exec</code>. The parameter is bound, not concatenated, so there is no SQL injection. The response is an empty 200 (204 No Content would also fit).`; }
          } else if (h === `AddHandler` || h === `UpdateHandler`) {
            if (pair === undefined) { code = 400; why = `<code>json.Unmarshal</code> failed on the --data record, so 400.`; }
            else if (!isAdmin(iss)) { code = 400; why = `<code>users[0]</code> (the issuer) is not a valid admin. The server logs "Command issued by non-admin user: ${esc(iss.username)}" and answers 400. In the book even a regular user can't change their own password this way.`; }
            else if (!pair || !pair.username && !pair.Username) { code = 400; why = `The second record has no username, so 400.`; }
            else {
              const name = pair.username || pair.Username, pw = pair.password != null ? String(pair.password) : pair.Password != null ? String(pair.Password) : ``;
              const adm = (pair.admin != null ? +pair.admin : pair.Admin != null ? +pair.Admin : 0) ? 1 : 0;
              const ex = findName(name);
              if (h === `AddHandler`) {
                if (ex) { code = 400; why = `<code>InsertUser()</code> refuses a duplicate username, so 400 Bad Request (409 Conflict would be more precise).`; }
                else { const row = { id: nextId++, username: name, password: pw, lastlogin: 0, admin: adm, active: 0 }; db.push(row); lastChange = { id: row.id, kind: `new` }; why = `The body is a JSON <strong>array</strong>: <code>[issuer, newUser]</code>. The order is a server convention the client must follow. A new row gets ID ${row.id}. The handler never calls <code>WriteHeader</code>, so the client sees an implicit 200; RESTfully this would be <code>201 Created</code> with a <code>Location</code> header.`; }
              } else {
                if (!ex) { code = 404; why = `No user called <code>${esc(name)}</code> to update.`; }
                else { ex.password = pw || ex.password; ex.admin = adm; lastChange = { id: ex.id, kind: `new` }; why = `<code>/update</code> (PUT) finds the user by <em>username</em> and rewrites password and admin flag, keeping the ID.` + (name === `admin` ? ` Admin's password is now <code>${esc(ex.password)}</code>, so switch the issuer to match.` : ``); }
              }
            }
          } else if (h === `LoginHandler` || h === `LogoutHandler`) {
            if (!valid(iss)) { code = 400; why = `<code>IsUserValid()</code> compares the username <em>and</em> password, and they don't match, so 400.`; }
            else { const u = findName(iss.username); u.active = h === `LoginHandler` ? 1 : 0; if (u.active) u.lastlogin = now; lastChange = { id: u.id, kind: `new` }; why = `${h === `LoginHandler` ? `Login sets <code>active = 1</code> and <code>lastlogin</code> to the current epoch.` : `Logout sets <code>active = 0</code>.`} Check <code>/logged</code> to confirm.`; }
          }
          if (!body) ctype = ``;
        }
        const txt = { 200: `OK`, 400: `Bad Request`, 404: `Not Found`, 405: `Method Not Allowed` }[code];
        qk(el, `route`).innerHTML = pblock(`sys`, `dispatch`, trace);
        qk(el, `resp`).innerHTML = pblock(code === 200 ? `out` : `bad`, `response`, `HTTP/1.1 ${code} ${txt}${ctype ? `\nContent-Type: ${ctype}` : ``}\nContent-Length: ${body.length}\n\n${body}`);
        hist.unshift({ code, s: `${code} ${M} ${path}  (${REST_ISSUERS[st.issuer].join(`:`)})` });
        if (hist.length > 12) hist.pop();
        drawDb();
        qk(el, `note`).innerHTML = note(why || ``, code === 200 ? `good` : code === 405 || code === 404 ? `warn` : `bad`);
      };
      const drawDb = () => {
        let rows = db.map(u => `<tr class="${lastChange && lastChange.kind === `new` && lastChange.id === u.id ? `new` : ``}"><td class="num">${u.id}</td><td>${esc(u.username)}</td><td class="mono">${esc(u.password)}</td><td class="num">${u.lastlogin}</td><td class="num">${u.admin}</td><td class="num">${u.active}</td></tr>`).join(``);
        if (lastChange && lastChange.kind === `del`) { const u = lastChange.row; rows += `<tr class="undo"><td class="num">${u.id}</td><td>${esc(u.username)}</td><td class="mono">${esc(u.password)}</td><td class="num">${u.lastlogin}</td><td class="num">${u.admin}</td><td class="num">deleted</td></tr>`; }
        qk(el, `db`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th class="num">UserID</th><th>username</th><th>password</th><th class="num">lastlogin</th><th class="num">admin</th><th class="num">active</th></tr>${rows}</table></div>`;
        qk(el, `log`).innerHTML = hist.length ? hist.map(h => `<div class="${h.code === 200 ? `ok` : h.code === 400 ? `bad` : `dup`}">${esc(h.s)}</div>`).join(``) : `<div class="info">no requests yet</div>`;
      };
      el.querySelectorAll(`[data-pre]`).forEach(b => b.addEventListener(`click`, () => {
        const p = REST_PRESETS[+b.dataset.pre];
        st.method = p[1]; st.path = p[2]; inPath.value = p[2];
        if (p[3]) { st.data = p[3]; inData.value = p[3]; }
        K.setSeg(el, `method`, p[1]);
        drawCurl(); exec();
      }));
      inPath.addEventListener(`input`, () => { st.path = inPath.value; drawCurl(); });
      inData.addEventListener(`input`, () => { st.data = inData.value; drawCurl(); });
      inPath.addEventListener(`keydown`, e => { if (e.key === `Enter`) exec(); });
      qk(el, `send`).addEventListener(`click`, exec);
      qk(el, `reset`).addEventListener(`click`, () => { db = REST_SEED(); nextId = 5; lastChange = null; hist.length = 0; drawDb(); qk(el, `note`).innerHTML = note(`Database reset to the book's rows: admin (ID 1), mihalis (ID 3), newUser (ID 4).`); });
      wireSegs(el, st, drawCurl);
      drawCurl(); exec();
    }
  };

  // =====================================================================
  // Ch11 - API versioning strategies
  // =====================================================================
  const VER = {
    path: { label: `path /v1`, req: v => `GET ${v ? `/${v}` : ``}/users/3 HTTP/1.1\nHost: api.example.com`, code: `r := mux.NewRouter()\nv1 := r.PathPrefix("/v1").Subrouter()\nv1.HandleFunc("/users/{id:[0-9]+}", getUserV1).Methods(http.MethodGet)\nv2 := r.PathPrefix("/v2").Subrouter()\nv2.HandleFunc("/users/{id:[0-9]+}", getUserV2).Methods(http.MethodGet)`, none: `404`, url: true, cache: true, browser: true },
    query: { label: `query ?version=`, req: v => `GET /users/3${v ? `?version=${v}` : ``} HTTP/1.1\nHost: api.example.com`, code: `r.HandleFunc("/users/{id:[0-9]+}", getUserV2).Queries("version", "v2")\nr.HandleFunc("/users/{id:[0-9]+}", getUserV1) // no/other version -> v1`, none: `default`, url: true, cache: `partly`, browser: true },
    header: { label: `custom header`, req: v => `GET /users/3 HTTP/1.1\nHost: api.example.com${v ? `\nversion-used: ${v.slice(1)}` : ``}`, code: `r.HandleFunc("/users/{id:[0-9]+}", getUserV2).Headers("version-used", "2")\nr.HandleFunc("/users/{id:[0-9]+}", getUserV1)\n// responses must send  Vary: version-used`, none: `default`, url: false, cache: `needs Vary`, browser: false },
    accept: { label: `Accept (content negotiation)`, req: v => `GET /users/3 HTTP/1.1\nHost: api.example.com\nAccept: ${v ? `application/vnd.example.${v}+json` : `application/json`}`, code: `r.HandleFunc("/users/{id:[0-9]+}", getUserV2).\n    HeadersRegexp("Accept", \`vnd\\.example\\.v2\\+json\`)\nr.HandleFunc("/users/{id:[0-9]+}", getUserV1)\n// responses: Content-Type: application/vnd.example.v2+json, Vary: Accept`, none: `default`, url: false, cache: `needs Vary`, browser: false },
    subdomain: { label: `subdomain`, req: v => `GET /users/3 HTTP/1.1\nHost: ${v ? `${v}.` : ``}api.example.com`, code: `r.Host("v1.api.example.com").Subrouter().HandleFunc("/users/{id:[0-9]+}", getUserV1)\nr.Host("v2.api.example.com").Subrouter().HandleFunc("/users/{id:[0-9]+}", getUserV2)\n// or route at the load balancer to separate deployments`, none: `default`, url: true, cache: true, browser: true }
  };
  D.c11Versioning = {
    title: `API versioning: five ways to say "v2"`,
    blurb: `The chapter lists five ways to version a REST API. Pick a strategy and the version the client asks for, and see the request, the gorilla/mux routing, and the response. v1 returns the old <code>rServer.go</code> shape (<code>{"user","password"}</code>), v2 the database-backed <code>User</code>. Then deprecate or remove v1 to see what old clients get.`,
    mount(el) {
      const st = { strat: `path`, ver: `v2`, life: `active` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`strategy`, seg(`strat`, Object.keys(VER).map(k => [k, VER[k].label]), st.strat))}</div>
        <div class="ctl-row">${ctl(`client asks for`, seg(`ver`, [[`v1`, `v1`], [`v2`, `v2`], [``, `nothing`]], st.ver))}${ctl(`v1 status`, seg(`life`, [[`active`, `active`], [`deprecated`, `deprecated`], [`removed`, `removed`]], st.life))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Request and routing</h4><div data-k="req"></div></div>
          <div class="lab-panel"><h4>Response</h4><div data-k="resp"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>Trade-offs</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const draw = () => {
        const S = VER[st.strat];
        let served = st.ver || (S.none === `404` ? null : `v1`);
        let code = 200, extra = ``, body;
        const v1Body = `{"user":"mihalis","password":"admin"}`;
        const v2Body = `{"id":3,"username":"mihalis","lastlogin":0,"admin":0,"active":0}`;
        if (served === null) { code = 404; body = `404 page not found`; }
        else if (served === `v1` && st.life === `removed`) {
          code = st.strat === `accept` ? 406 : st.strat === `path` || st.strat === `subdomain` ? 410 : 400;
          body = code === 406 ? `{"error":"version v1 is no longer available; use application/vnd.example.v2+json"}` : `{"error":"API v1 was removed on 2026-06-30; use v2"}`;
        } else {
          body = served === `v1` ? v1Body : v2Body;
          if (served === `v1` && st.life === `deprecated`) extra = `\nDeprecation: true\nSunset: Tue, 30 Jun 2026 23:59:59 GMT\nLink: <${st.strat === `path` ? `/v2/users/3` : `https://api.example.com/docs/v2`}>; rel="successor-version"`;
        }
        const ctype = served === `v2` && st.strat === `accept` ? `application/vnd.example.v2+json` : `application/json`;
        const vary = st.strat === `header` ? `\nVary: version-used` : st.strat === `accept` ? `\nVary: Accept` : ``;
        const txt = { 200: `OK`, 400: `Bad Request`, 404: `Not Found`, 406: `Not Acceptable`, 410: `Gone` }[code];
        qk(el, `req`).innerHTML = pblock(`user`, `client`, S.req(st.ver)) + pblock(`sys`, `gorilla/mux`, S.code);
        qk(el, `resp`).innerHTML = pblock(code === 200 ? (extra ? `ctx` : `out`) : `bad`, `served by ${served ? `getUser` + served.toUpperCase() : `nobody`}`, `HTTP/1.1 ${code} ${txt}\nContent-Type: ${ctype}${code === 200 ? vary : ``}${extra}\n\n${body}`);
        const yn = v => v === true ? chip(`ok`, `yes`) : v === false ? chip(`no`, `no`) : chip(`early`, v);
        qk(el, `tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>strategy</th><th>version visible in URL</th><th>plain HTTP caching</th><th>testable in a browser</th><th>no version sent</th></tr>${Object.keys(VER).map(k => { const v = VER[k]; return `<tr class="${k === st.strat ? `new` : ``}"><td>${v.label}</td><td>${yn(v.url)}</td><td>${yn(v.cache)}</td><td>${yn(v.browser)}</td><td>${v.none === `404` ? chip(`no`, `404`) : chip(`muted`, `server default`)}</td></tr>`; }).join(``)}</table></div>`;
        let n;
        if (served === null) n = `With path versioning there is no unversioned <code>/users/3</code>, so the request is a 404. That is explicit and safe: a client can't silently get a format it doesn't understand. Some APIs redirect or alias the bare path to the latest version instead.`;
        else if (!st.ver) n = `The client sent no version, so the server falls back to <strong>v1</strong>, the oldest supported shape, so old clients keep working. Defaulting to the <em>latest</em> instead would break them the day v3 ships. Whichever you choose, document it.`;
        else if (code !== 200) n = `v1 is gone. Old clients get <strong>${code} ${txt}</strong> with a pointer to v2 instead of a confusing parse error. ` + (code === 406 ? `With content negotiation, 406 Not Acceptable is the natural answer.` : code === 410 ? `410 Gone tells clients and caches the resource will not come back.` : `400 is a pragmatic choice when the version is a header or parameter.`);
        else if (extra) n = `v1 still works but is <strong>deprecated</strong>: <code>Deprecation</code>, <code>Sunset</code> and <code>Link: rel="successor-version"</code> headers warn clients (and their logs) before removal.`;
        else n = `Requesting <strong>${st.ver}</strong> via ${S.label}. ` + ({ path: `This is the author's preference: the version is in every URL and log line, caches and CDNs need nothing special, and each version is just a <code>PathPrefix</code> subrouter.`, query: `Easy to add, but optional parameters get forgotten, and every cache key now depends on the query string.`, header: `URLs stay clean, but the version is invisible in browsers and logs, and caches need <code>Vary: version-used</code>.`, accept: `The "purist" option versions the representation rather than the resource. Precise, but harder to test with a browser or plain curl, and caches need <code>Vary: Accept</code>.`, subdomain: `Each version can be a separate deployment behind the load balancer, at the cost of DNS entries and TLS certificates per version.` })[st.strat];
        qk(el, `note`).innerHTML = note(n + ` <em>The book's advice: there is no single correct answer. Be consistent everywhere.</em>`, code === 200 ? (extra ? `warn` : `good`) : `bad`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };
})();
