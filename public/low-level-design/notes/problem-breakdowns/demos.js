// LLD problem breakdown labs: Rate Limiter. Time is simulated, so every run is repeatable.
(function () {
  "use strict";
  const { esc, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, fmtNum, fmtBytes, pct } = window.LabKit;
  const D = (window.DEMOS = window.DEMOS || {});
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });
  // The limiter algorithms, mirroring the Java on the Solution tab. now is in ms.
  function tokenBucket(cap, perSec) {
    const s = new Map();
    return { name: `Token bucket`, try(id, now) {
      let b = s.get(id); if (!b) { b = { tokens: cap, last: now }; s.set(id, b); }
      b.tokens = Math.min(cap, b.tokens + (now - b.last) * perSec / 1000); b.last = now;
      if (b.tokens >= 1) { b.tokens -= 1; return { allowed: true, remaining: Math.floor(b.tokens), retry: null }; }
      return { allowed: false, remaining: 0, retry: Math.ceil((1 - b.tokens) / (perSec / 1000)) };
    }, state: id => { const b = s.get(id); return b ? `${round(b.tokens, 2)} tokens` : `none yet`; } };
  }
  function slidingLog(max, win) {
    const s = new Map();
    return { name: `Sliding window log`, try(id, now) {
      let q = s.get(id); if (!q) { q = []; s.set(id, q); }
      while (q.length && q[0] <= now - win) q.shift();
      if (q.length < max) { q.push(now); return { allowed: true, remaining: max - q.length, retry: null }; }
      return { allowed: false, remaining: 0, retry: q[0] + win - now };
    }, state: id => { const q = s.get(id); return q ? `${q.length} timestamp${q.length === 1 ? `` : `s`} in window` : `none yet`; } };
  }
  function fixedWindow(max, win) {
    const s = new Map();
    return { name: `Fixed window`, try(id, now) {
      const start = now - (now % win);
      let w = s.get(id); if (!w) { w = { start, count: 0 }; s.set(id, w); }
      if (w.start !== start) { w.start = start; w.count = 0; }
      if (w.count < max) { w.count++; return { allowed: true, remaining: max - w.count, retry: null }; }
      return { allowed: false, remaining: 0, retry: start + win - now };
    }, state: id => { const w = s.get(id); return w ? `${w.count} in window starting ${(w.start / 1000).toFixed(0)} s` : `none yet`; } };
  }

  // =====================================================================
  // Solution tab - drive the designed RateLimiter
  // =====================================================================
  const RULES = [
    { endpoint: `/search`, algo: `TokenBucket`, params: `capacity 5, refill 1/s`, make: () => tokenBucket(5, 1) },
    { endpoint: `/orders`, algo: `SlidingWindowLog`, params: `3 per 10 s`, make: () => slidingLog(3, 10000) },
    { endpoint: `(default)`, algo: `FixedWindow`, params: `4 per 10 s`, make: () => fixedWindow(4, 10000) }
  ];
  D.limiterPlayground = {
    title: `Drive the rate limiter`,
    blurb: `A small configuration is loaded: <code>/search</code> uses a token bucket (capacity 5, refill 1 per second), <code>/orders</code> a sliding window log (3 per 10 s), and anything else falls back to a fixed window (4 per 10 s). Send requests as different clients, move the clock forward, and read what <code>check(clientId, endpoint)</code> returns.`,
    mount(el) {
      const st = { client: `alice`, ep: `/search` };
      let now, limiters, log;
      const reset = () => { now = 0; limiters = { "/search": RULES[0].make(), "/orders": RULES[1].make(), "(default)": RULES[2].make() }; log = []; };
      const route = ep => limiters[ep] ? ep : `(default)`;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`client`, seg(`client`, [[`alice`, `alice`], [`bob`, `bob`]], st.client))}${ctl(`endpoint`, seg(`ep`, [[`/search`, `/search`], [`/orders`, `/orders`], [`/reports`, `/reports (no rule)`]], st.ep))}</div>
        <div class="ctl-row" style="gap:8px">
          <button class="lab-btn" data-act="send">check(client, endpoint)</button>
          <button class="lab-btn ghost" data-act="burst">Send 5 at once</button>
          <button class="lab-btn ghost" data-act="t1">Clock +1 s</button>
          <button class="lab-btn ghost" data-act="t5">Clock +5 s</button>
          <button class="lab-btn ghost" data-act="reset">Reset</button>
        </div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Calls (latest at the bottom)</h4><div data-k="log"></div></div>
          <div class="lab-panel"><h4>Configuration and state</h4><div data-k="state"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const send = () => {
        const key = route(st.ep), res = limiters[key].try(st.client, now);
        log.push({ t: now, client: st.client, ep: st.ep, algo: RULES.find(x => x.endpoint === key).algo, res });
      };
      const draw = () => {
        const rows = log.slice(-10).map((e, i, a) => `<tr${i === a.length - 1 ? ` class="new"` : ``}><td class="num">${(e.t / 1000).toFixed(0)} s</td><td>${e.client}</td><td>${e.ep}</td><td>${e.res.allowed ? chip(`allowed`, `ok`) : chip(`denied`, `no`)}</td><td class="num">${e.res.remaining}</td><td class="num">${e.res.retry == null ? `null` : e.res.retry + ` ms`}</td></tr>`).join(``);
        q(`log`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th class="num">time</th><th>client</th><th>endpoint</th><th>allowed</th><th class="num">remaining</th><th class="num">retryAfterMs</th></tr>${rows || `<tr><td colspan="6">No calls yet. Press check(client, endpoint).</td></tr>`}</table></div>`;
        q(`state`).innerHTML = `<div style="font-size:13px;margin-bottom:8px">Clock: <b>${(now / 1000).toFixed(0)} s</b></div>` + RULES.map(r => `<div style="margin-bottom:8px;font-size:12.5px"><b>${r.endpoint}</b> &middot; ${r.algo} (${r.params})<br><span class="muted">alice: ${limiters[r.endpoint].state(`alice`)} &middot; bob: ${limiters[r.endpoint].state(`bob`)}</span></div>`).join(``);
        const last = log[log.length - 1];
        let n;
        if (!last) n = `Each endpoint has its own limiter, and each limiter keeps separate state per client. Start by sending a few /search requests as alice.`;
        else if (last.res.allowed) n = `${last.ep === `/reports` ? `/reports has no rule, so the default fixed window decided. ` : ``}Allowed, with ${last.res.remaining} left for ${last.client} on ${last.ep}. retryAfterMs is null because the request went through.`;
        else n = `Denied: ${last.client} has used up ${last.ep === `/reports` ? `the default rule's` : last.ep + `'s`} quota. Retrying after ${last.res.retry} ms is the earliest moment it could succeed (${last.algo === `TokenBucket` ? `time to earn the missing fraction of a token` : last.algo === `SlidingWindowLog` ? `when the oldest request in the window expires` : `when the current window ends`}). The other client is unaffected: switch to ${last.client === `alice` ? `bob` : `alice`} and try.`;
        q(`note`).innerHTML = note(n, last && !last.res.allowed ? `warn` : `good`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`);
        if (!b) return;
        const a = b.dataset.act;
        if (a === `send`) send();
        else if (a === `burst`) for (let i = 0; i < 5; i++) send();
        else if (a === `t1`) now += 1000;
        else if (a === `t5`) now += 5000;
        else if (a === `reset`) reset();
        else return;
        draw();
      });
      wireSegs(el, st, draw);
      reset(); draw();
    }
  };

  // =====================================================================
  // Deep dive - concurrent requests against one bucket
  // =====================================================================
  function overshootTrial(r, threads, tokens, mode) {
    let shared = tokens, allowed = 0, retries = 0;
    const th = Array.from({ length: threads }, () => ({ pc: 0, seen: 0, done: false }));
    let owner = -1, live = threads, guard = 0;
    while (live > 0 && guard++ < 10000) {
      const i = Math.floor(r() * threads), t = th[i];
      if (t.done) continue;
      if (mode === `lock`) {
        if (owner !== -1 && owner !== i) continue;
        if (t.pc === 0) { owner = i; t.pc = 1; }
        else if (t.pc === 1) { t.seen = shared; t.pc = 2; }
        else { if (t.seen >= 1) { shared = t.seen - 1; allowed++; } owner = -1; t.done = true; live--; }
      } else if (mode === `cas`) {
        if (t.pc === 0) { t.seen = shared; t.pc = 1; }
        else if (t.seen < 1) { t.done = true; live--; }
        else if (shared === t.seen) { shared = t.seen - 1; allowed++; t.done = true; live--; }
        else { retries++; t.pc = 0; }
      } else {
        if (t.pc === 0) { t.seen = shared; t.pc = 1; }
        else { if (t.seen >= 1) { shared = t.seen - 1; allowed++; } t.done = true; live--; }
      }
    }
    return { allowed, retries };
  }
  D.concurrentOvershoot = {
    title: `Concurrent requests against one client's bucket`,
    blurb: `Several threads handle requests from the same client at the same moment, and the bucket has only a few tokens left. Each thread reads the token count and then writes it back minus one. Compare the plain version, a lock on the client's bucket, and a compare-and-set loop over 1,000 random interleavings.`,
    mount(el) {
      const st = { threads: 8, tokens: 3, mode: `none`, seed: 11 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`update`, seg(`mode`, [[`none`, `plain read then write`], [`lock`, `synchronized (bucket)`], [`cas`, `AtomicReference CAS loop`]], st.mode))}${againBtn}</div>
        <div class="ctl-row">${ctl(`concurrent requests`, rng(`threads`, 2, 32, 1, st.threads))}${ctl(`tokens left`, rng(`tokens`, 0, 10, 1, st.tokens))}</div>
        <div class="lab-panel"><h4>How many requests were allowed, across 1,000 interleavings</h4><div data-k="chart"></div></div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const r = mulberry32(st.seed), N = 1000, hist = Array(st.threads + 1).fill(0);
        let over = 0, retries = 0;
        for (let i = 0; i < N; i++) { const x = overshootTrial(r, st.threads, st.tokens, st.mode); hist[x.allowed]++; if (x.allowed > st.tokens) over++; retries += x.retries; }
        const max = Math.max(...hist), bw = 700 / hist.length;
        let s = ``;
        hist.forEach((h, k) => {
          const bh = (h / max) * 130, x = 40 + k * bw;
          s += `<rect x="${x + 2}" y="${150 - bh}" width="${Math.max(2, bw - 4)}" height="${bh}" rx="2" style="fill:${k > st.tokens ? `var(--bad)` : `var(--good)`}"/>`;
          if (hist.length <= 20 || k % 2 === 0) s += `<text x="${x + bw / 2}" y="166" text-anchor="middle" class="svg-label">${k}</text>`;
        });
        s += `<text x="40" y="184" class="svg-label">requests allowed in a trial (red = more than the ${st.tokens} tokens available)</text>`;
        q(`chart`).innerHTML = svgWrap(760, 192, s);
        const worst = hist.reduce((m, h, k) => (h ? k : m), 0);
        q(`stats`).innerHTML = stat(`trials that let through too many`, pct(over / N, 1), over ? `bad` : `good`) + stat(`worst trial: allowed`, `${worst} of ${st.tokens}`, worst > st.tokens ? `bad` : `good`) + (st.mode === `cas` ? stat(`CAS retries per trial`, round(retries / N, 2), `warn`) : ``);
        let n;
        if (st.mode === `none`) n = `Refill-and-spend is a read-modify-write. Threads that read the same token count all see "enough" and all decrement from that stale value, so up to ${worst} requests passed with only ${st.tokens} tokens: ${pct(over / N, 1)} of trials overshoot. Single-threaded tests never show this.`;
        else if (st.mode === `lock`) n = `With <code>synchronized (bucket)</code> around refill and spend, one request at a time updates this client's bucket, so exactly min(requests, tokens) are allowed in every trial. Because the lock is per client, other clients never wait on it.`;
        else n = `A CAS loop reads an immutable state, computes the next one and swaps it only if nobody changed it in between; losers retry (${round(retries / N, 2)} retries per trial here). Never more than ${st.tokens} allowed, and no thread ever blocks.`;
        q(`note`).innerHTML = note(n, over ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { threads: v => v, tokens: v => v }, draw);
      onAgain(el, () => { st.seed = (st.seed * 31 + 5) % 100003; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Deep dive - memory per client and idle eviction
  // =====================================================================
  const BYTES = { bucket: 120, fixed: 120, counter: 130, logBase: 140, logPer: 24 };
  D.memoryEstimator = {
    title: `How much memory does per-client state take?`,
    blurb: `Every client ever seen leaves state in every limiter it touched. Estimate the heap used for a number of distinct clients, with and without evicting idle ones. Assumed sizes include the map entry and object headers on a 64-bit JVM: ~120 bytes per bucket or window, ~130 per sliding counter, and for a sliding log ~140 bytes plus ~24 per stored timestamp (a boxed Long in a deque). Treat them as rough.`,
    mount(el) {
      const st = { clients: 6, eps: 5, algo: `bucket`, limit: 100, fill: 0.5, active: 0.05 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`algorithm`, seg(`algo`, [[`bucket`, `token bucket`], [`fixed`, `fixed window`], [`counter`, `sliding counter`], [`log`, `sliding log`]], st.algo))}</div>
        <div class="ctl-row">${ctl(`distinct clients seen`, rng(`clients`, 3, 8, 0.25, st.clients))}${ctl(`endpoints each client uses`, rng(`eps`, 1, 20, 1, st.eps))}</div>
        <div class="ctl-row">${ctl(`limit per window (sliding log)`, rng(`limit`, 5, 10000, 5, st.limit))}${ctl(`how full a typical log is`, rng(`fill`, 0.05, 1, 0.05, st.fill))}${ctl(`clients active within the idle TTL`, rng(`active`, 0.001, 1, 0.001, st.active))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const clients = Math.pow(10, st.clients), per = st.algo === `log` ? BYTES.logBase + BYTES.logPer * st.limit * st.fill : BYTES[st.algo];
        const total = clients * st.eps * per, kept = total * st.active;
        const heapWarn = b => b > 8e9 ? `bad` : b > 1e9 ? `warn` : `good`;
        q(`stats`).innerHTML = stat(`bytes per client per endpoint`, fmtBytes(Math.round(per))) + stat(`state entries`, fmtNum(clients * st.eps)) + stat(`without eviction`, fmtBytes(total), heapWarn(total)) + stat(`with idle eviction`, fmtBytes(kept), heapWarn(kept));
        let n = `${fmtNum(clients)} clients on ${st.eps} endpoint${st.eps > 1 ? `s` : ``} leave ${fmtNum(clients * st.eps)} state objects. Without eviction that is ${fmtBytes(total)}, and it only grows: every new client ID adds more. Evicting clients idle longer than a TTL keeps only the ${pct(st.active, 1)} recently active: ${fmtBytes(kept)}. `;
        if (st.algo === `log`) n += `The sliding log stores a timestamp per accepted request, so its cost scales with the limit: at ${st.limit} per window it is ${round(per / BYTES.bucket, 0)}&times; a token bucket per client. For large limits, prefer the sliding window counter.`;
        else n += `For a token bucket, a client idle long enough to refill completely can be dropped with no effect on behaviour: recreating it full is identical.`;
        q(`note`).innerHTML = note(n, heapWarn(total) === `good` ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { clients: v => fmtNum(Math.pow(10, v)), eps: v => v, limit: v => v, fill: v => pct(v), active: v => pct(v, 1) }, draw);
      draw();
    }
  };

  // =====================================================================
  // File System - the designed FileSystem, driven by shell-like commands
  // =====================================================================
  class FsError extends Error { constructor(type, msg) { super(msg); this.type = type; } }
  function makeFs() {
    const mkNode = (name, dir, content) => ({ name, dir, parent: null, children: dir ? new Map() : null, content: content || `` });
    const root = mkNode(``, true);
    const pathOf = n => { if (!n.parent) return `/`; const parts = []; for (let x = n; x.parent; x = x.parent) parts.unshift(x.name); return `/` + parts.join(`/`); };
    const parse = raw => {
      if (!raw || raw[0] !== `/`) throw new FsError(`InvalidPathException`, `${raw || `(empty)`}: must be absolute`);
      const parts = raw.split(`/`).filter(Boolean);
      if (parts.some(s => s === `.` || s === `..`)) throw new FsError(`InvalidPathException`, `${raw}: relative segments are not supported`);
      return parts;
    };
    const asDir = (n, p) => { if (n.dir) return n; throw new FsError(`NotADirectoryException`, `${p} is a file`); };
    const asFile = (n, p) => { if (!n.dir) return n; throw new FsError(`NotAFileException`, `${p} is a folder`); };
    const resolve = parts => {
      let cur = root;
      for (const s of parts) {
        asDir(cur, pathOf(cur));
        if (!cur.children.has(s)) throw new FsError(`PathNotFoundException`, `/${parts.join(`/`)} not found`);
        cur = cur.children.get(s);
      }
      return cur;
    };
    const add = (dir, n) => { dir.children.set(n.name, n); n.parent = dir; };
    const remove = n => { n.parent.children.delete(n.name); n.parent = null; };
    const parentFor = parts => {
      if (!parts.length) throw new FsError(`AlreadyExistsException`, `/ already exists`);
      const parent = asDir(resolve(parts.slice(0, -1)), `/` + parts.slice(0, -1).join(`/`));
      if (parent.children.has(parts[parts.length - 1])) throw new FsError(`AlreadyExistsException`, `/${parts.join(`/`)} already exists`);
      return parent;
    };
    const fs = {
      root, pathOf,
      mkdir(p) { const parts = parse(p); add(parentFor(parts), mkNode(parts[parts.length - 1], true)); return `created folder ${pathOf(resolve(parts))}`; },
      touch(p, c) { const parts = parse(p); add(parentFor(parts), mkNode(parts[parts.length - 1], false, c)); return `created file ${pathOf(resolve(parts))}`; },
      write(p, c) { asFile(resolve(parse(p)), p).content = c; return `wrote ${c.length} characters to ${p}`; },
      cat(p) { const c = asFile(resolve(parse(p)), p).content; return c === `` ? `(empty file)` : `"${c}"`; },
      ls(p) { const d = asDir(resolve(parse(p)), p); const names = [...d.children.values()].sort((a, b) => a.name.localeCompare(b.name)).map(n => n.name + (n.dir ? `/` : ``)); return names.length ? names.join(`  `) : `(empty folder)`; },
      path(p) { return pathOf(resolve(parse(p))); },
      rm(p, recursive) {
        const parts = parse(p);
        if (!parts.length) throw new FsError(`InvalidOperationException`, `cannot delete the root`);
        const n = resolve(parts);
        if (n.dir && n.children.size && !recursive) throw new FsError(`DirectoryNotEmptyException`, `${p} is not empty (use rm -r)`);
        remove(n); return `deleted ${p}${n.dir ? ` and everything under it` : ``}`;
      },
      mv(src, destDir) {
        const n = resolve(parse(src));
        if (!n.parent) throw new FsError(`InvalidOperationException`, `cannot move the root`);
        const dest = asDir(resolve(parse(destDir)), destDir);
        for (let a = dest; a; a = a.parent) if (a === n) throw new FsError(`InvalidOperationException`, `cannot move ${src} into its own subtree`);
        if (dest.children.has(n.name)) throw new FsError(`AlreadyExistsException`, `${pathOf(dest).replace(/\/$/, ``)}/${n.name} already exists`);
        remove(n); add(dest, n); return `moved to ${pathOf(n)}`;
      },
      rename(p, name) {
        if (!name || name.includes(`/`)) throw new FsError(`InvalidPathException`, `${name || `(empty)`}: invalid name`);
        const n = resolve(parse(p));
        if (!n.parent) throw new FsError(`InvalidOperationException`, `cannot rename the root`);
        const parent = n.parent;
        if (parent.children.has(name)) throw new FsError(`AlreadyExistsException`, `${pathOf(parent).replace(/\/$/, ``)}/${name} already exists`);
        remove(n); n.name = name; add(parent, n); return `renamed to ${pathOf(n)}`;
      }
    };
    return fs;
  }
  const FS_PRESETS = [
    `mkdir /home/ben`, `touch /home/ben/todo.txt buy milk`, `ls /home`, `mv /home/ana /home/ben`, `rename /home/ben/ana anna`, `path /home/ben/anna/notes.txt`,
    `mv /home /home/ben`, `rm /home`, `rm /`, `cat /home`, `mkdir /tmp/x/y`, `ls /etc/hosts`
  ];
  D.fsPlayground = {
    title: `Drive the file system`,
    blurb: `A shell over the <code>FileSystem</code> class from the Solution tab, starting with <code>/home/ana/notes.txt</code> and <code>/etc/hosts</code>. Commands: <code>mkdir</code>, <code>touch PATH [text]</code>, <code>write PATH text</code>, <code>cat</code>, <code>ls [PATH]</code>, <code>path PATH</code>, <code>mv SRC DEST_FOLDER</code>, <code>rename PATH NEW_NAME</code>, <code>rm [-r] PATH</code>. Errors show the exception the Java code would throw.`,
    mount(el) {
      let fs, log;
      const reset = () => { fs = makeFs(); fs.mkdir(`/home`); fs.mkdir(`/home/ana`); fs.touch(`/home/ana/notes.txt`, `buy milk`); fs.mkdir(`/etc`); fs.touch(`/etc/hosts`, `127.0.0.1 localhost`); log = []; };
      el.innerHTML = `
        <div class="ctl-row" style="gap:8px"><input type="text" data-k="cmd" placeholder="e.g. mkdir /home/ben" spellcheck="false" autocomplete="off" style="flex:1;min-width:220px;font-family:'SF Mono',Consolas,monospace;font-size:13px;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)"><button class="lab-btn" data-act="run">Run</button><button class="lab-btn ghost" data-act="reset">Reset</button></div>
        <div class="ctl-row" style="gap:6px">${FS_PRESETS.map(c => `<button class="lab-btn ghost" data-cmd="${esc(c)}" style="font-family:'SF Mono',Consolas,monospace;font-size:11.5px;padding:3px 8px">${esc(c)}</button>`).join(``)}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Session (latest at the bottom)</h4><div data-k="log"></div></div>
          <div class="lab-panel"><h4>The tree</h4><div data-k="tree"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const run = line => {
        const text = String(line || ``).trim();
        if (!text) return;
        const [cmd, ...rest] = text.split(/\s+/);
        let out, err = null;
        try {
          if (cmd === `mkdir`) out = fs.mkdir(rest[0]);
          else if (cmd === `touch`) out = fs.touch(rest[0], rest.slice(1).join(` `));
          else if (cmd === `write`) out = fs.write(rest[0], rest.slice(1).join(` `));
          else if (cmd === `cat`) out = fs.cat(rest[0]);
          else if (cmd === `ls`) out = fs.ls(rest[0] || `/`);
          else if (cmd === `path`) out = fs.path(rest[0]);
          else if (cmd === `mv`) out = fs.mv(rest[0], rest[1]);
          else if (cmd === `rename`) out = fs.rename(rest[0], rest[1]);
          else if (cmd === `rm`) out = rest[0] === `-r` ? fs.rm(rest[1], true) : fs.rm(rest[0], false);
          else throw new FsError(`UnknownCommand`, `try mkdir, touch, write, cat, ls, path, mv, rename or rm`);
        } catch (e) { err = e instanceof FsError ? e : new FsError(`Error`, String(e.message || e)); }
        log.push({ text, out, err });
      };
      const tree = (n, depth) => {
        const kids = [...n.children.values()].sort((a, b) => a.name.localeCompare(b.name));
        return kids.map(k => `${`  `.repeat(depth)}${k.dir ? `<b>${esc(k.name)}/</b>` : esc(k.name) + (k.content ? ` <span class="muted">"${esc(k.content.length > 24 ? k.content.slice(0, 24) + `...` : k.content)}"</span>` : ``)}\n` + (k.dir ? tree(k, depth + 1) : ``)).join(``);
      };
      const draw = () => {
        const rows = log.slice(-8).map((e, i, a) => `<tr${i === a.length - 1 ? ` class="new"` : ``}><td style="white-space:normal"><code>$ ${esc(e.text)}</code><br>${e.err ? chip(e.err.type, `no`) + ` ` + esc(e.err.message) : esc(e.out)}</td></tr>`).join(``);
        q(`log`).innerHTML = `<div class="scroll-x"><table class="mini-table">${rows || `<tr><td style="white-space:normal">Type a command or click one of the examples above.</td></tr>`}</table></div>`;
        q(`tree`).innerHTML = `<pre style="margin:0;font-size:12.5px;line-height:1.5;white-space:pre">/\n${tree(fs.root, 1)}</pre>`;
        const last = log[log.length - 1];
        let n;
        if (!last) n = `Every command maps to one <code>FileSystem</code> method. Try moving a folder, then ask for the path of a file inside it: parent pointers make the new path correct with no extra work.`;
        else if (!last.err) n = `OK. ${/^mv|^rename/.test(last.text) ? `Only one map entry and one parent pointer changed; every descendant's path is now different without being touched.` : /^rm -r/.test(last.text) ? `One map removal detached the whole subtree; the garbage collector reclaims it.` : /^path/.test(last.text) ? `Computed by walking parent pointers to the root.` : `Resolved one map lookup per path segment.`}`;
        else {
          const why = {
            InvalidOperationException: `This is the check that protects the tree: the root can't be removed, and a folder can't move under itself (walking up from the destination reached the source).`,
            DirectoryNotEmptyException: `A non-recursive delete refuses to remove children by accident. Use rm -r.`,
            NotADirectoryException: `A file appeared where the operation needed a folder.`,
            NotAFileException: `read and write only make sense on files.`,
            PathNotFoundException: `Resolution stopped at a missing segment. Create requires the parent folder to exist (mkdir -p would be an extension).`,
            AlreadyExistsException: `Names are unique within a folder; the check runs before anything changes.`,
            InvalidPathException: `Paths must be absolute, and names can't contain "/" or be "." or "..".`
          }[last.err.type] || `Unknown command.`;
          n = `<code>${esc(last.err.type)}</code>: ${why} Nothing in the tree changed.`;
        }
        q(`note`).innerHTML = note(n, last && last.err ? `warn` : `good`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`button`);
        if (!b) return;
        if (b.dataset.cmd) run(b.dataset.cmd);
        else if (b.dataset.act === `run`) { const inp = q(`cmd`); run(inp.value); inp.value = ``; }
        else if (b.dataset.act === `reset`) reset();
        else return;
        draw();
      });
      el.addEventListener(`keydown`, e => { if (e.key === `Enter` && e.target.dataset && e.target.dataset.k === `cmd`) { run(e.target.value); e.target.value = ``; draw(); } });
      reset(); draw();
    }
  };

  // =====================================================================
  // File System - parent pointers vs stored paths vs a global path index
  // =====================================================================
  D.pathDesigns = {
    title: `Where should a node's path come from?`,
    blurb: `Three ways to answer "what is this node's full path?" and "which node is at this path?". <strong>Parent pointers</strong> (the chosen design) compute paths by walking up. <strong>Stored paths</strong> keep the full path string in every node. A <strong>global index</strong> keeps a map from every full path to its node. Costs are counted as node visits or map updates per operation.`,
    mount(el) {
      const st = { depth: 6, sub: 3, moves: 20 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`typical path depth`, rng(`depth`, 1, 40, 1, st.depth))}${ctl(`entries under a moved or renamed folder`, rng(`sub`, 0, 5, 0.25, st.sub))}</div>
        <div class="ctl-row">${ctl(`moves and renames per 1,000 operations (the rest are lookups and path() calls, half each)`, rng(`moves`, 0, 300, 5, st.moves))}</div>
        <div class="lab-panel"><h4>Cost per 1,000 operations</h4><div data-k="bars"></div></div>
        <div class="lab-panel" style="margin-top:12px"><h4>Cost of each operation</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const d = st.depth, s = Math.round(Math.pow(10, st.sub)), m = st.moves, rest = (1000 - m) / 2;
        const designs = [
          { name: `Parent pointers`, resolve: d, path: d, move: d + 1, cls: `good` },
          { name: `Stored path in each node`, resolve: d, path: 1, move: d + 1 + s, cls: `warn` },
          { name: `Global path index`, resolve: 1, path: 1, move: d + 1 + 2 * s, cls: `bad` }
        ];
        designs.forEach(x => { x.total = m * x.move + rest * (x.resolve + x.path); });
        const max = Math.max(...designs.map(x => x.total));
        q(`bars`).innerHTML = `<div class="hbars">${designs.map(x => `<div class="hbar"><span class="hbar-label">${x.name}</span><span class="hbar-track"><span class="hbar-fill ${x.total === Math.min(...designs.map(y => y.total)) ? `good` : `warn`}" style="width:${Math.max(1, (x.total / max) * 100)}%;display:block"></span></span><span class="hbar-val">${fmtNum(x.total)}</span></div>`).join(``)}</div>`;
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>design</th><th class="num">resolve path</th><th class="num">path()</th><th class="num">move / rename</th><th>extra memory</th></tr>${designs.map((x, i) => `<tr><td>${x.name}</td><td class="num">${fmtNum(x.resolve)}</td><td class="num">${fmtNum(x.path)}</td><td class="num">${fmtNum(x.move)}</td><td>${[`one reference per node`, `a full path string per node`, `a map entry and path string per node`][i]}</td></tr>`).join(``)}</table></div>`;
        const best = designs.reduce((a, b) => (b.total < a.total ? b : a));
        let n = `Moving a folder with ${fmtNum(s)} entr${s === 1 ? `y` : `ies`} under it costs ${fmtNum(designs[0].move)} steps with parent pointers (the cycle check plus one re-link) but ${fmtNum(designs[1].move)} with stored paths and ${fmtNum(designs[2].move)} with a global index, because every descendant's stored path or index key must be rewritten. `;
        n += best.name === `Parent pointers` ? `For this mix, parent pointers are cheapest overall, and they can never hold a stale path.` : `With so few moves and such deep paths, caching paths wins on raw count here, but every move becomes proportional to the subtree, and each cached path is one more thing that can go stale. Parent pointers keep the worst case bounded by depth.`;
        q(`note`).innerHTML = note(n, best.name === `Parent pointers` ? `good` : `warn`);
      };
      wireRanges(el, st, { depth: v => v, sub: v => fmtNum(Math.round(Math.pow(10, v))), moves: v => v }, draw);
      draw();
    }
  };
})();
