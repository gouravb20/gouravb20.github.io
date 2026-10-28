// Patterns labs, part IV: Scaling Reads (lab ids start with "sr").
(function () {
  "use strict";
  const { round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, fmtNum, pct } = window.LabKit;
  window.DEMOS = window.DEMOS || {};
  const D = window.DEMOS;
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });
  const ms = v => v >= 1000 ? round(v / 1000, 1) + ` s` : Math.round(v) + ` ms`;

  // =====================================================================
  // The read-scaling ladder: where does each read land, and what saturates?
  // =====================================================================
  const RL = { node: 5000, unindexed: 25, wPrimary: 2, wReplica: 1, cacheNode: 100000 };
  D.srReadLadder = {
    title: `The read-scaling ladder: which rung do you need?`,
    blurb: `Set the read traffic and the read:write ratio, then climb the ladder: add an index, read replicas, a cache and a CDN. Each database node can do 5,000 indexed reads per second (a full scan costs 25 times more), a write costs 2 units on the primary and 1 unit to apply on each replica, and a cache node handles 100,000 operations per second. The numbers are assumptions; the shape is the lesson.`,
    mount(el) {
      const st = { reads: 4, ratio: 100, index: `off`, replicas: 0, hit: 0, cdn: 0 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`reads per second`, rng(`reads`, 2, 6, 0.25, st.reads))}${ctl(`read:write ratio`, seg(`ratio`, [[10, `10:1`], [100, `100:1`], [1000, `1000:1`]], st.ratio))}</div>
        <div class="ctl-row">${ctl(`1. index the hot query`, seg(`index`, [[`off`, `no index`], [`on`, `indexed`]], st.index))}${ctl(`2. read replicas`, rng(`replicas`, 0, 10, 1, st.replicas))}</div>
        <div class="ctl-row">${ctl(`3. cache hit rate`, rng(`hit`, 0, 99, 1, st.hit))}${ctl(`4. share served by a CDN`, rng(`cdn`, 0, 90, 5, st.cdn))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Where reads are served</h4><div data-k="flow"></div><h4 style="margin-top:14px">Database utilisation</h4><div data-k="util"></div></div>
          <div class="lab-panel"><h4>What you bought, what it costs</h4><div class="stat-row" data-k="stats"></div><div data-k="stale"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const reads = Math.pow(10, st.reads), writes = reads / st.ratio;
        const cdn = reads * st.cdn / 100, afterCdn = reads - cdn;
        const cache = afterCdn * st.hit / 100, db = afterCdn - cache;
        const nodes = 1 + st.replicas, cost = st.index === `on` ? 1 : RL.unindexed;
        const perNode = db / nodes * cost;
        const prim = (perNode + writes * RL.wPrimary) / RL.node;
        const repl = st.replicas ? (perNode + writes * RL.wReplica) / RL.node : 0;
        const writeOnly = writes * RL.wPrimary / RL.node;
        const cacheNodes = cache > 0 ? Math.max(1, Math.ceil(afterCdn / RL.cacheNode)) : 0;
        const u = v => v > 1 ? `bad` : v > 0.7 ? `warn` : `good`;
        q(`flow`).innerHTML = hbars([
          { label: `CDN edge`, value: cdn, text: fmtNum(cdn) + `/s`, cls: `alt` },
          { label: `cache`, value: cache, text: fmtNum(cache) + `/s`, cls: `good` },
          { label: `database`, value: db, text: fmtNum(db) + `/s`, cls: db > 0 ? `warn` : `muted` }
        ], reads);
        const rows = [{ label: `primary`, value: Math.min(prim, 1.5), text: pct(prim), cls: u(prim) }];
        if (st.replicas) rows.push({ label: `each replica`, value: Math.min(repl, 1.5), text: pct(repl), cls: u(repl) });
        q(`util`).innerHTML = hbars(rows, 1.5) + `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Bars are scaled so 100% sits two thirds of the way across.</div>`;
        q(`stats`).innerHTML = stat(`reads hitting the database`, fmtNum(db) + `/s`, db > 0 && prim > 1 ? `bad` : ``) +
          stat(`writes (all go to the primary)`, fmtNum(writes) + `/s`) +
          stat(`database nodes`, nodes) + stat(`cache nodes needed`, cacheNodes);
        const stale = [];
        if (st.index === `on`) stale.push(`Index: slightly slower writes and more storage. No staleness.`);
        if (st.replicas) stale.push(`Replicas: reads can lag the primary by milliseconds to seconds, so a user may not see their own write.`);
        if (st.hit) stale.push(`Cache: entries can be stale until the TTL expires or an invalidation lands; a cold or failed cache sends all ${fmtNum(afterCdn)} reads/s to the database.`);
        if (st.cdn) stale.push(`CDN: only works for content that is the same for many users; stale until its TTL or a purge.`);
        q(`stale`).innerHTML = stale.length ? `<ul style="margin:6px 0 0 18px;font-size:13px">${stale.map(s => `<li>${s}</li>`).join(``)}</ul>` : `<div style="font-size:13px;color:var(--text-muted)">One database, no copies: always fresh, and the only thing that can saturate is that one box.</div>`;
        let n, cls = `good`;
        if (writeOnly > 1) { n = `Writes alone need ${pct(writeOnly)} of the primary. No read-side trick fixes that: every replica still applies every write, and caches don't absorb writes. This is a write-scaling problem (shard or batch the writes).`; cls = `bad`; }
        else if (prim > 1 || repl > 1) {
          cls = `bad`;
          if (st.index === `off`) n = `The database is at ${pct(Math.max(prim, repl))}. The cheapest fix comes first: index the hot query. Each read then costs 1 unit instead of ${RL.unindexed}.`;
          else if (st.replicas < 5) n = `Indexed, still over capacity. Add read replicas: each one takes a share of the reads but also applies every write, so they help most when the read:write ratio is high.`;
          else if (st.hit < 80) n = `Replicas alone are not enough at this volume. Put a cache in front: at a 90% hit rate the database sees a tenth of the reads that get past the CDN.`;
          else n = `Still saturated. Raise the hit rate, push shared content to a CDN, or shard the data if the working set doesn't fit.`;
        } else if (prim > 0.7 || repl > 0.7) { n = `It fits, but above 70% utilisation there is no headroom for a traffic spike or a cold cache. Climb one more rung or add replicas.`; cls = `warn`; }
        else {
          const used = [st.index === `on`, st.replicas > 0, st.hit > 0, st.cdn > 0].filter(Boolean).length;
          n = `Everything fits with headroom, using ${used} rung${used === 1 ? `` : `s`} of the ladder. Each rung you didn't need is complexity and staleness you avoided.` + (st.hit && db < 1000 && st.replicas > 1 ? ` With the cache absorbing most reads, some replicas may now be idle; you could remove them.` : ``);
        }
        q(`note`).innerHTML = note(n, cls);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { reads: v => fmtNum(Math.pow(10, v)) + `/s`, replicas: v => v, hit: v => v + `%`, cdn: v => v + `%` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Replica lag and read-your-writes
  // =====================================================================
  const RW_ST = { any: `any replica`, window: `primary for 2 s after a write`, token: `LSN token (replica if caught up)`, primary: `always the primary` };
  const RW_OTHER = 0.95; // share of all reads made by people who did not just write
  function rwSim(st, seed) {
    const r = mulberry32(seed), N = 5000;
    const R = {}; Object.keys(RW_ST).forEach(k => { R[k] = { stale: 0, toPrimary: 0 }; });
    for (let i = 0; i < N; i++) {
      let lag = -Math.log(Math.max(1e-9, r())) * st.lag;
      if (st.spike === `on` && r() < 0.05) lag *= 20;
      const t = st.delay * (0.5 + r());
      const behind = t < lag;
      if (behind) R.any.stale++;
      if (t < 2000) R.window.toPrimary++; else if (behind) R.window.stale++;
      if (behind) R.token.toPrimary++;
      R.primary.toPrimary++;
    }
    Object.keys(R).forEach(k => {
      R[k].staleP = R[k].stale / N;
      R[k].primaryShare = k === `primary` ? 1 : (1 - RW_OTHER) * R[k].toPrimary / N;
    });
    return R;
  }
  D.srReplicaLag = {
    title: `Replica lag: will users see their own writes?`,
    blurb: `5,000 users each save an edit, then reload the page. Writes go to the primary; reads go wherever the routing strategy sends them. Replication lag is random (exponential around the mean you set), with optional spikes. 95% of all reads come from people who did not just write anything, and always go to replicas.`,
    mount(el) {
      const st = { lag: 200, delay: 300, spike: `off`, strat: `any` };
      let seed = 5;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`mean replica lag`, rng(`lag`, 10, 2000, 10, st.lag))}${ctl(`user reloads after about`, rng(`delay`, 50, 3000, 50, st.delay))}${ctl(`lag spikes (5% of the time, 20x)`, seg(`spike`, [[`off`, `off`], [`on`, `on`]], st.spike))}</div>
        <div class="ctl-row">${ctl(`route the writer's read to`, seg(`strat`, Object.keys(RW_ST).map(k => [k, RW_ST[k]]), st.strat))}</div>
        <div class="ctl-row">${againBtn}</div>
        <div class="lab-panel"><h4>This strategy</h4><div class="stat-row" data-k="stats"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>All strategies, same run</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = rwSim(st, seed * 13 + 3), s = R[st.strat];
        q(`stats`).innerHTML = stat(`users who saw their old data`, `${fmtNum(s.stale)} (${pct(s.staleP, 1)})`, s.stale ? `bad` : `good`) +
          stat(`share of ALL reads on the primary`, pct(s.primaryShare, 1), s.primaryShare > 0.5 ? `bad` : s.primaryShare > 0.03 ? `warn` : `good`);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>writer's read goes to</th><th class="num">saw stale data</th><th class="num">primary read share</th><th>needs</th></tr>${Object.keys(RW_ST).map(k => `<tr class="${k === st.strat ? `new` : ``}"><td>${RW_ST[k]}</td><td class="num" style="${R[k].stale ? `color:var(--bad);font-weight:700` : ``}">${pct(R[k].staleP, 1)}</td><td class="num">${pct(R[k].primaryShare, 1)}</td><td>${{ any: `nothing`, window: `last-write time per user (cookie or session)`, token: `write returns its log position; replicas report theirs`, primary: `a primary big enough for every read` }[k]}</td></tr>`).join(``)}</table></div>`;
        const N = {
          any: s.stale ? `${pct(s.staleP, 1)} of users reloaded before their replica caught up and saw the old value. They will assume the save failed and click again. That is the read-your-writes problem.` : `Nobody saw stale data this run, because users wait longer than the lag. Turn on lag spikes or reload sooner: real lag has a long tail.`,
          window: s.stale ? `Pinning the writer to the primary for 2 seconds fixes most cases cheaply, but lag longer than the window still leaks through (${fmtNum(s.stale)} users). Size the window from the lag you actually measure, at a high percentile.` : `A fixed window covers every case here at a small cost: only recent writers touch the primary. Its weakness is a lag spike longer than the window.`,
          token: `The write returns its log position (an LSN or GTID) and the client sends it back. A replica that has replayed that far serves the read; otherwise it falls back to the primary (or waits briefly). Zero stale reads, and the primary only sees reads that genuinely need it.`,
          primary: `Correct, and it defeats the point of the replicas: the primary serves every read again. Use it only for the few reads that must be fresh, such as a balance shown right after a transfer.`
        };
        q(`note`).innerHTML = note(N[st.strat], s.stale ? `bad` : s.primaryShare > 0.5 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { lag: ms, delay: ms }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Cache stampede on a hot key, and the fixes
  // =====================================================================
  const SP_ST = { none: `no protection`, local: `single-flight per server`, lock: `distributed lock`, swr: `serve stale, refresh in background`, early: `probabilistic early refresh` };
  const SP_TTL = 30, SP_SPAN = 90, SP_CAP = 1000; // seconds, seconds, queries the DB handles concurrently at normal speed
  function spSim(st) {
    const qps = Math.pow(10, st.qps), base = st.rebuild;
    // Unprotected: every request that arrives during the rebuild misses and queries the DB. More queries -> slower rebuild -> more misses.
    let rb = base, n = 0, collapsed = false;
    for (let i = 0; i < 12; i++) {
      n = qps * rb / 1000;
      const next = base * Math.max(1, n / SP_CAP);
      if (next > 30000) { rb = 30000; n = qps * 30; collapsed = true; break; }
      rb = next;
    }
    const R = {};
    R.none = { per: n, rb, waited: n, stale: 0, collapsed };
    const lq = Math.min(st.servers, qps * base / 1000);
    const lrb = base * Math.max(1, lq / SP_CAP);
    R.local = { per: Math.max(1, lq), rb: lrb, waited: qps * lrb / 1000, stale: 0 };
    R.lock = { per: 1, rb: base, waited: qps * base / 1000, stale: 0 };
    R.swr = { per: 1, rb: base, waited: 0, stale: base };
    R.early = { per: 1, rb: base, waited: 0, stale: 0 };
    Object.values(R).forEach(x => { x.peak = x.per / Math.max(0.001, x.rb / 1000); });
    return { R, qps };
  }
  D.srStampede = {
    title: `Cache stampede: one hot key expires`,
    blurb: `A single hot key (say, the home page feed) is read by every request and cached with a ${SP_TTL}-second TTL. When it expires, how many requests go to the database before the value is back? The database is assumed to handle ${SP_CAP} concurrent copies of this query at normal speed and slows down in proportion beyond that.`,
    mount(el) {
      const st = { qps: 3.5, rebuild: 200, servers: 20, strat: `none` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`reads/s of the hot key`, rng(`qps`, 2, 5, 0.1, st.qps))}${ctl(`time to rebuild the value`, rng(`rebuild`, 20, 2000, 20, st.rebuild))}${ctl(`app servers`, rng(`servers`, 1, 100, 1, st.servers))}</div>
        <div class="ctl-row">${ctl(`protection`, seg(`strat`, Object.keys(SP_ST).map(k => [k, SP_ST[k]]), st.strat))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Database queries for this key over ${SP_SPAN} s</h4><div data-k="chart"></div></div>
          <div class="lab-panel"><h4>Per expiry</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>All strategies</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const { R, qps } = spSim(st), s = R[st.strat];
        // Timeline: DB queries per second, in 0.5 s buckets.
        const bucket = 0.5, B = SP_SPAN / bucket, series = new Array(B).fill(0);
        for (let k = 1; k * SP_TTL <= SP_SPAN; k++) {
          const start = st.strat === `early` ? k * SP_TTL - 2 : k * SP_TTL;
          const dur = Math.max(bucket, s.rb / 1000);
          const rate = s.per / dur;
          for (let t = start; t < start + dur && t < SP_SPAN; t += bucket) { const b = Math.floor(t / bucket); if (b >= 0 && b < B) series[b] += rate; }
        }
        const ymax = Math.max(10, ...series) * 1.1;
        const ax = axes({ x0: 46, x1: 380, y0: 190, y1: 14, dx0: 0, dx1: SP_SPAN, dy0: 0, dy1: ymax, xTicks: [0, 30, 60, 90], yTicks: [0, ymax / 2, ymax].map(v => round(v, 0)), yFmt: v => fmtNum(v, 0), xFmt: v => v + `s`, xLabel: `time (cache expires at 30, 60, 90 s)` });
        let bars = ``;
        series.forEach((v, i) => { if (v > 0) { const x = ax.X(i * bucket), y = ax.Y(v); bars += `<rect x="${round(x, 1)}" y="${round(y, 1)}" width="${round(Math.max(2, ax.X(bucket) - ax.X(0)), 1)}" height="${round(190 - y, 1)}" style="fill:${s.per > SP_CAP ? `var(--bad)` : `var(--accent)`}"/>`; } });
        q(`chart`).innerHTML = svgWrap(390, 222, ax.svg + bars);
        q(`stats`).innerHTML = stat(`database queries`, fmtNum(s.per, 0), s.per > SP_CAP ? `bad` : s.per > 5 ? `warn` : `good`) +
          stat(`rebuild took`, ms(s.rb), s.rb > st.rebuild * 1.5 ? `bad` : ``) +
          stat(`requests that waited for the rebuild`, fmtNum(s.waited, 0), s.waited > 0 ? `warn` : `good`) +
          stat(`extra staleness served`, s.stale ? `up to ` + ms(s.stale) : `none`);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>strategy</th><th class="num">DB queries per expiry</th><th class="num">rebuild time</th><th class="num">requests waiting</th><th>trade-off</th></tr>${Object.keys(SP_ST).map(k => `<tr class="${k === st.strat ? `new` : ``}"><td>${SP_ST[k]}</td><td class="num" style="${R[k].per > SP_CAP ? `color:var(--bad);font-weight:700` : ``}">${fmtNum(R[k].per, 0)}</td><td class="num">${ms(R[k].rb)}</td><td class="num">${fmtNum(R[k].waited, 0)}</td><td>${{ none: `simplest; melts the DB on hot keys`, local: `in-process, no coordination; one query per server`, lock: `one query, but waiters add latency; lock needs a timeout`, swr: `no waiting; readers see a value up to one rebuild old`, early: `refreshes before expiry; needs a cheap per-read check` }[k]}</td></tr>`).join(``)}</table></div>`;
        const N = {
          none: R.none.collapsed ? `At ${fmtNum(qps)} reads/s every request in the rebuild window misses. The flood slows the query, which widens the window, which lets in more requests: the rebuild never finishes and the database falls over. This is a stampede (thundering herd).` : `Every request that arrives while the value is being rebuilt misses and runs the same query: ${fmtNum(R.none.per, 0)} identical queries per expiry. ${R.none.per > SP_CAP ? `That is past what the database handles, so the rebuild itself slows down and lets in even more requests.` : `Raise the read rate or the rebuild time to watch this turn into a collapse.`}`,
          local: `Each server lets one request rebuild and makes its other requests wait for that result (Go's singleflight does this). The database sees one query per server, ${fmtNum(R.local.per, 0)} here. Good enough for a few dozen servers; add a distributed lock if you run hundreds.`,
          lock: `The first request to win a short lock in the cache (for example SET key:lock NX with an expiry) rebuilds; everyone else waits briefly and re-reads the cache. One query per expiry, at the cost of ${fmtNum(R.lock.waited, 0)} requests waiting about ${ms(st.rebuild)}. The lock must expire on its own in case the rebuilder dies.`,
          swr: `Keep the old value past its soft expiry. The first reader after it triggers one background refresh, and everyone keeps reading the old value until the new one lands. One query, nobody waits, and the price is up to ${ms(st.rebuild)} of extra staleness.`,
          early: `Each read, with a probability that rises as the expiry nears, refreshes the value early. With heavy traffic one request almost always refreshes a moment before expiry, so the key never actually goes missing. One query, nobody waits.`
        };
        q(`note`).innerHTML = note(N[st.strat], s.per > SP_CAP ? `bad` : s.waited > 0 && st.strat !== `none` ? `warn` : st.strat === `none` ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { qps: v => fmtNum(Math.pow(10, v)), rebuild: ms, servers: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Hot keys on a sharded cache
  // =====================================================================
  const HK = { shards: 8, cap: 100000, servers: 50, home: 3 };
  D.srHotKey = {
    title: `Hot keys: one celebrity post on a sharded cache`,
    blurb: `A Redis cluster of ${HK.shards} shards, each good for about ${fmtNum(HK.cap)} operations per second, serves all reads. Normal traffic spreads evenly by key hash, but one key (a celebrity's post) takes a share of every read, and a single key always hashes to a single shard. ${HK.servers} app servers sit in front.`,
    mount(el) {
      const st = { total: 500000, share: 20, fix: `none`, copies: 8, l1ttl: 1 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`total reads/s`, rng(`total`, 100000, 1000000, 50000, st.total))}${ctl(`share of reads for the hot key`, rng(`share`, 0, 60, 1, st.share))}</div>
        <div class="ctl-row">${ctl(`mitigation`, seg(`fix`, [[`none`, `none`], [`copies`, `replicate the key`], [`l1`, `local cache in app servers`]], st.fix))}${ctl(`copies (key#1..key#N)`, rng(`copies`, 2, 16, 1, st.copies))}${ctl(`local cache TTL`, rng(`l1ttl`, 0.5, 10, 0.5, st.l1ttl))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Load per cache shard</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const hot = st.total * st.share / 100, bg = (st.total - hot) / HK.shards;
        const load = new Array(HK.shards).fill(bg);
        let hotToCache = hot, staleness = `none`, writeFan = 1;
        if (st.fix === `none`) load[HK.home] += hot;
        else if (st.fix === `copies`) {
          // key#i is placed on shard (home + i) mod shards: copies beyond the shard count share shards.
          for (let i = 0; i < st.copies; i++) load[(HK.home + i) % HK.shards] += hot / st.copies;
          writeFan = st.copies;
          staleness = `copies can briefly disagree while an update fans out`;
        } else {
          hotToCache = Math.min(hot, HK.servers / st.l1ttl);
          load[HK.home] += hotToCache;
          staleness = `up to ${st.l1ttl} s per server`;
        }
        const max = Math.max(...load), hotShard = load.indexOf(max);
        q(`bars`).innerHTML = hbars(load.map((v, i) => ({ label: `shard ${i}`, value: Math.min(v, HK.cap * 2), text: fmtNum(v) + `/s`, cls: v > HK.cap ? `bad` : v > HK.cap * 0.7 ? `warn` : `good` })), HK.cap * 2) + `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Capacity (${fmtNum(HK.cap)}/s) is the middle of each bar.</div>`;
        q(`stats`).innerHTML = stat(`hottest shard`, `shard ${hotShard}: ${pct(max / HK.cap)}`, max > HK.cap ? `bad` : max > HK.cap * 0.7 ? `warn` : `good`) +
          stat(`hot-key reads reaching the cache`, fmtNum(hotToCache) + `/s`) +
          stat(`writes per update of the hot key`, writeFan) + stat(`extra staleness`, staleness);
        let n, cls;
        if (max > HK.cap) {
          cls = `bad`;
          n = st.fix === `none` ? `Shard ${HK.home} holds the hot key and gets ${fmtNum(load[HK.home])} reads/s while the others idle. Adding shards doesn't help: one key still lives on one shard. Split the key or cache it closer to the reader.` :
            st.fix === `copies` && st.copies < HK.shards ? `${st.copies} copies spread the hot key over ${st.copies} shards, which isn't enough here. Add copies, up to the shard count.` : `Even spread perfectly, total traffic exceeds the cluster. Add shards, or put a local cache in front.`;
        } else if (st.fix === `none`) { cls = st.share ? `warn` : `good`; n = st.share ? `It fits for now, but one shard carries ${pct(load[HK.home] / Math.max(1, bg))} of a normal shard's load. A bigger celebrity tips it over.` : `No hot key: uniform hashing spreads load evenly.`; }
        else if (st.fix === `copies`) { cls = `good`; n = `Readers pick a random copy (key#1 to key#${st.copies}), so the hot key's load is split across shards. The price: every update writes ${st.copies} copies, and a reader can briefly see an old copy.`; }
        else { cls = `good`; n = `Each app server keeps the hot value in memory for ${st.l1ttl} s, so the cache sees at most ${HK.servers} servers / ${st.l1ttl} s = ${fmtNum(hotToCache)} reads/s for it, whatever the traffic. The price is a little staleness, and you need a way to decide which keys are hot.`; }
        q(`note`).innerHTML = note(n, cls);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { total: v => fmtNum(v) + `/s`, share: v => v + `%`, copies: v => v, l1ttl: v => v + ` s` }, draw);
      draw();
    }
  };
})();
