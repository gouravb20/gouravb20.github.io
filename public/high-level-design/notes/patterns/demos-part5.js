// System design patterns labs, part 5: Scaling Writes (partition keys, hot keys, bursts and queues, aggregation)
window.DEMOS = window.DEMOS || {};
(function () {
  "use strict";
  const { round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, path, fmtNum, pct } = window.LabKit;
  const D = window.DEMOS;
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const h32 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; };
  const zipfCdf = (n, s) => { const c = new Float64Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc += 1 / Math.pow(i + 1, s); c[i] = acc; } for (let i = 0; i < n; i++) c[i] /= acc; return c; };
  const zipfPick = (cdf, u) => { let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; } return lo; };
  const againBtn = `<button class="lab-btn ghost" data-act="again">New random run</button>`;
  const onAgain = (el, fn) => el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) fn(); });
  const fmtS = s => s >= 60 ? round(s / 60, 1) + ` min` : round(s, 1) + ` s`;

  // =====================================================================
  // Choosing a partition key: write spread vs single-shard queries
  // =====================================================================
  const SL_USERS = 50000, SL_EVENTS = 40000, SL_CAP = 10000;
  const SL_CDF = zipfCdf(SL_USERS, 0.9);
  // Assumed traffic shares by country, for illustration only.
  const SL_COUNTRY = [[`A`, 0.30], [`B`, 0.16], [`C`, 0.10], [`D`, 0.08], [`E`, 0.07], [`F`, 0.06], [`G`, 0.06], [`H`, 0.05], [`I`, 0.05], [`J`, 0.04], [`K`, 0.03]];
  const SL_KEYS = {
    user: `hash(user_id)`,
    post: `hash(post_id)`,
    time: `range(created_at)`,
    country: `country`
  };
  function slLoads(key, N, rate, seed) {
    const r = mulberry32(seed);
    const cnt = new Array(N).fill(0);
    if (key === `time`) cnt[N - 1] = SL_EVENTS;
    else if (key === `country`) SL_COUNTRY.forEach(([c, s]) => { cnt[h32(`country-` + c) % N] += s * SL_EVENTS; });
    else for (let i = 0; i < SL_EVENTS; i++) {
      const shard = key === `user` ? h32(`u` + zipfPick(SL_CDF, r()) + `-` + seed) % N : Math.floor(r() * N);
      cnt[shard]++;
    }
    return cnt.map(c => c / SL_EVENTS * rate);
  }
  D.swShardLoad = {
    title: `Choosing a partition key`,
    blurb: `A social app writes posts and likes at a steady rate. Pick the partition key and the number of shards, and watch two things: whether the writes spread evenly (no shard over its 10K writes/s budget) and how many shards the two most common reads have to touch.`,
    mount(el) {
      const st = { key: `user`, shards: 8, rate: 50000 };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`partition key`, seg(`key`, Object.keys(SL_KEYS).map(k => [k, SL_KEYS[k]]), st.key))}</div>
        <div class="ctl-row">${ctl(`shards`, rng(`shards`, 2, 24, 1, st.shards))}${ctl(`total writes`, rng(`rate`, 10000, 200000, 10000, st.rate))}</div>
        <div class="ctl-row">${againBtn}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Write load per shard (budget 10K/s each)</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>Shards each read has to touch</h4><div data-k="reads"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const N = st.shards, loads = slLoads(st.key, N, st.rate, seed * 13 + 5);
        const max = Math.max(...loads), over = loads.reduce((s, l) => s + Math.max(0, l - SL_CAP), 0);
        const idle = loads.filter(l => l < 1).length;
        q(`bars`).innerHTML = hbars(loads.map((l, i) => ({ label: `shard ${i + 1}`, value: l, text: fmtNum(l) + `/s`, cls: l > SL_CAP ? `bad` : l > SL_CAP * 0.8 ? `warn` : `good`, dim: l < 1 })), Math.max(SL_CAP * 1.2, max));
        const touch = {
          user: [1, N], post: [N, N], time: [`1-2`, 1], country: [1, N]
        }[st.key];
        const cell = v => v === 1 || v === `1-2` ? chip(`${v} shard${v === 1 ? `` : `s`}`, `ok`) : chip(`all ${v}`, `no`);
        q(`reads`).innerHTML = `<table class="mini-table"><tr><th>read</th><th>shards touched</th></tr><tr><td>A user's own recent posts</td><td>${cell(touch[0])}</td></tr><tr><td>Every post from the last hour (for a trending job)</td><td>${cell(touch[1])}</td></tr></table>`;
        q(`stats`).innerHTML = stat(`hottest shard vs budget`, pct(max / SL_CAP), max > SL_CAP ? `bad` : max > SL_CAP * 0.8 ? `warn` : `good`) + stat(`writes over budget`, fmtNum(over) + `/s`, over ? `bad` : `good`) + stat(`idle shards`, `${idle} / ${N}`, idle ? `warn` : ``);
        const N_ = {
          user: `Hashing the user ID spreads writes well because there are many users, and a user's own posts sit on one shard, so the profile page is a single-shard read. The global "last hour" scan must fan out to every shard; that job is better served by a separate stream or analytics store. ${max > SL_CAP ? `Even with an even spread you are over budget: add shards.` : `A few heavy users make some shards warmer than others; that is the hot-key problem, handled separately.`}`,
          post: `Hashing the post ID gives the most even spread, but now a user's posts are scattered across all ${N} shards, so the profile page becomes a scatter-gather read. Good write spread is only half of a partition key; it should also keep the common read on one shard.`,
          time: `Range-partitioning by creation time puts every new write on the newest range, so one shard takes all ${fmtNum(st.rate)}/s while the others sit idle. Adding shards does nothing for writes. Time ranges are good for reads and retention (drop old shards), bad as the only key for a write-heavy table; combine them with a hash, e.g. (hash(user_id), created_at).`,
          country: `Country has only ${SL_COUNTRY.length} values and a skewed distribution, so the biggest country decides the hottest shard and ${N > SL_COUNTRY.length ? `some shards can never get any data` : `shards fill unevenly`}. Low-cardinality keys cap how far you can scale out. Keep country as a secondary column, or as the first level of a compound key only when data must stay in a region.`
        };
        q(`note`).innerHTML = note(N_[st.key], max > SL_CAP ? `bad` : (st.key === `user` ? `good` : `warn`));
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { shards: v => v, rate: v => fmtNum(v) + `/s` }, draw);
      onAgain(el, () => { seed++; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Hot key splitting: a celebrity post's like counter
  // =====================================================================
  const HK_PARTS = 16, HK_CAP = 1000, HK_BG = 4000, HK_VIEWS = 20000, HK_HOME = 5;
  D.swHotKeySplit = {
    title: `Splitting a hot key`,
    blurb: `A celebrity's post gets likes faster than one partition can take. The model: 16 partitions of 1,000 writes/s each, already carrying 4K/s of likes on ordinary posts (250/s per partition). Split the counter into N sub-keys (post#0 ... post#N-1), write each like to a random one, and sum them on read. Sub-keys are assumed to land on distinct partitions, wrapping round when N exceeds 16. Watch the hottest partition fall and the read cost rise.`,
    mount(el) {
      const st = { likes: 6000, split: 1, scope: `hot` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`likes on the celebrity post`, rng(`likes`, 1000, 20000, 1000, st.likes))}${ctl(`sub-keys (N)`, seg(`split`, [1, 4, 8, 16, 32].map(v => [v, v]), st.split))}</div>
        <div class="ctl-row">${ctl(`split which keys`, seg(`scope`, [[`hot`, `only keys detected as hot`], [`all`, `every post`]], st.scope))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Writes per partition (capacity 1,000/s)</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>What it costs</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const bg = HK_BG / HK_PARTS, spare = HK_CAP - bg;
        const load = new Array(HK_PARTS).fill(bg);
        const subs = st.split;
        for (let i = 0; i < subs; i++) load[(HK_HOME + i) % HK_PARTS] += st.likes / subs;
        const max = Math.max(...load);
        const throttled = load.reduce((s, l) => s + Math.max(0, l - HK_CAP), 0);
        const used = Math.min(subs, HK_PARTS);
        const short = st.likes > spare * HK_PARTS;
        const needN = Math.ceil(st.likes / spare);
        q(`bars`).innerHTML = hbars(load.map((l, i) => ({ label: `p${i}`, value: l, text: fmtNum(l) + `/s`, cls: l > HK_CAP ? `bad` : l > HK_CAP * 0.8 ? `warn` : `good` })), Math.max(HK_CAP * 1.5, max));
        const readOps = st.scope === `all` ? HK_VIEWS * subs : HK_VIEWS * 0.95 + HK_VIEWS * 0.05 * subs;
        q(`stats`).innerHTML = stat(`hottest partition vs capacity`, pct(max / HK_CAP), max > HK_CAP ? `bad` : max > HK_CAP * 0.8 ? `warn` : `good`) + stat(`likes throttled`, fmtNum(throttled) + `/s`, throttled ? `bad` : `good`) + stat(`partitions the counter uses`, `${used} / ${HK_PARTS}`) + stat(`reads to show the count`, subs, subs > HK_PARTS ? `warn` : ``) + stat(`read ops/s for ${fmtNum(HK_VIEWS)} views/s (5% on this post)`, fmtNum(readOps), st.scope === `all` && subs > 1 ? `bad` : ``);
        let n;
        if (short && throttled > 0) n = `The whole cluster has only ${fmtNum(spare * HK_PARTS)}/s of spare capacity (16 partitions × ${fmtNum(spare)}/s left after ordinary traffic), less than the ${fmtNum(st.likes)} likes/s arriving. No amount of splitting fixes that: add partitions, or absorb likes in memory and write totals every second so far fewer writes reach the store.`;
        else if (throttled > 0 && subs === 1) n = `One key lives on one partition, so all ${fmtNum(st.likes)} likes/s hit it and everything over 1,000/s is throttled or queued, while the other partitions have room to spare. Adding partitions doesn't help: the database can't split a single key. Split it yourself: write to post#k with k random in 0..N-1.`;
        else if (throttled > 0) n = `${subs} sub-keys still leave ${fmtNum(st.likes / subs)}/s each, on partitions that already carry ${fmtNum(bg)}/s. Pick N from the peak: N ≥ peak / (capacity − existing load per partition) = ${fmtNum(st.likes)} / ${fmtNum(spare)} → at least ${needN}, plus headroom. With real hashing some sub-keys share a partition, so leave more.`;
        else n = `The likes now spread over ${used} partitions and nothing is throttled. ${subs > HK_PARTS ? `With more sub-keys than partitions, extra sub-keys only double up on partitions already in use: the write spread is no better than N = ${HK_PARTS}, but every read costs ${subs} lookups. ` : ``}The price is on the read side: showing the count means reading ${subs} sub-keys and summing them. ${st.scope === `all` ? `Splitting every post multiplies the reads for all posts, almost all of which were never hot. Split only keys you detect as hot, and cache the summed count for a second or two.` : `Because only the hot key is split, ordinary posts still cost one read; caching the sum for a second or two makes even the hot one cheap.`}`;
        q(`note`).innerHTML = note(n, throttled ? `bad` : (st.scope === `all` && subs > 1) || subs > HK_PARTS ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { likes: v => fmtNum(v) + `/s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Bursts: write directly, buffer in a queue, or shed low-value writes
  // =====================================================================
  const QB_T = 150, QB_BASE = 4000, QB_START = 20, QB_LIMIT = 400000, QB_LOW = 0.6, QB_PER_CONSUMER = 3000;
  const QB_MODES = { direct: `write directly`, queue: `queue, unbounded`, shed: `bounded queue + shedding` };
  // A commit has a fixed cost (round trip, fsync) assumed to be 10x the per-row cost.
  const qbRows = (cap, b) => cap * b / (1 + 0.1 * (b - 1));
  function qbSim(st) {
    const b = st.mode === `direct` ? 1 : st.batch;
    const dbRows = qbRows(st.cap, b);
    const drain = st.mode === `direct` ? dbRows : Math.min(dbRows, st.consumers * QB_PER_CONSUMER * (b > 1 ? 4 : 1));
    let qd = 0, rejected = 0, dropped = 0, written = 0, peak = 0, emptyAt = null;
    const pts = [];
    const end = QB_START + st.dur;
    for (let t = 0; t < QB_T; t++) {
      const inc = QB_BASE + (t >= QB_START && t < end ? st.spike : 0);
      let w;
      if (st.mode === `direct`) { w = Math.min(inc, dbRows); rejected += inc - w; }
      else {
        let add = inc;
        if (st.mode === `shed` && qd + add > QB_LIMIT) {
          const low = inc * QB_LOW * 0.9; // keep a 10% sample of low-value events
          dropped += low; add -= low;
          if (qd + add > QB_LIMIT) { const over = qd + add - QB_LIMIT; rejected += over; add -= over; }
        }
        qd += add;
        w = Math.min(qd, drain); qd -= w;
      }
      written += w; peak = Math.max(peak, qd);
      if (t >= end && emptyAt === null && qd < 1) emptyAt = t;
      pts.push({ t, inc, w, qd });
    }
    return { pts, rejected, dropped, written, peak, emptyAt, drain, dbRows, end, lag: peak / Math.max(1, drain) };
  }
  D.swQueueBurst = {
    title: `Absorbing a write burst`,
    blurb: `Steady traffic is 4K writes/s; then a spike arrives (a match ends, a post goes viral). The database can commit a fixed number of single-row writes per second. Compare writing directly, buffering in a queue, and a bounded queue that sheds low-value events (60% of traffic here is view and analytics events) when it fills. Batching and consumer count change how fast the queue drains.`,
    mount(el) {
      const st = { mode: `queue`, spike: 20000, dur: 30, cap: 10000, consumers: 4, batch: 1 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`strategy`, seg(`mode`, Object.keys(QB_MODES).map(k => [k, QB_MODES[k]]), st.mode))}</div>
        <div class="ctl-row">${ctl(`spike adds`, rng(`spike`, 5000, 60000, 5000, st.spike))}${ctl(`spike lasts`, rng(`dur`, 10, 60, 5, st.dur))}${ctl(`DB single-row commits/s`, rng(`cap`, 4000, 20000, 1000, st.cap))}</div>
        <div class="ctl-row">${ctl(`queue consumers (3K rows/s each)`, rng(`consumers`, 1, 12, 1, st.consumers))}${ctl(`rows per commit`, seg(`batch`, [[1, `1`], [10, `10`], [100, `100`]], st.batch))}</div>
        <div class="lab-panel"><h4>Writes per second: arriving vs committed</h4><div data-k="chart"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>Queue depth</h4><div data-k="depth"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = qbSim(st);
        const W = 600, H = 200;
        const yMax = Math.max(QB_BASE + st.spike, R.drain) * 1.1;
        const A = axes({ x0: 50, x1: W - 10, y0: H - 30, y1: 10, dx0: 0, dx1: QB_T, dy0: 0, dy1: yMax, xTicks: [0, 30, 60, 90, 120, 150], yTicks: [0, yMax / 2, yMax].map(v => Math.round(v)), xFmt: v => v + `s`, yFmt: v => fmtNum(v, 0), xLabel: `time` });
        const line = (key, color, dash) => `<path d="${path(R.pts.map(p => [A.X(p.t), A.Y(p[key])]))}" fill="none" style="stroke:${color}" stroke-width="2" ${dash ? `stroke-dasharray="5 4"` : ``}/>`;
        const capY = A.Y(Math.min(R.drain, yMax));
        q(`chart`).innerHTML = svgWrap(W, H, A.svg + `<line x1="50" x2="${W - 10}" y1="${capY}" y2="${capY}" style="stroke:var(--bad)" stroke-dasharray="3 3"/><text x="${W - 14}" y="${capY - 5}" text-anchor="end" font-size="12" style="fill:var(--bad)">drain limit ${fmtNum(R.drain, 0)}/s</text>` + line(`inc`, `var(--text-muted)`, true) + line(`w`, `var(--accent)`) + `<text x="60" y="24" font-size="12" style="fill:var(--text-muted)">dashed: arriving</text><text x="60" y="40" font-size="12" style="fill:var(--accent)">solid: committed</text>`);
        const dMax = Math.max(1000, R.peak * 1.1, st.mode === `shed` ? QB_LIMIT * 1.1 : 0);
        const B = axes({ x0: 50, x1: W - 10, y0: 120, y1: 10, dx0: 0, dx1: QB_T, dy0: 0, dy1: dMax, xTicks: [0, 30, 60, 90, 120, 150], yTicks: [0, Math.round(dMax / 2), Math.round(dMax)], xFmt: v => v + `s`, yFmt: v => fmtNum(v, 0) });
        const area = `<path d="${path(R.pts.map(p => [B.X(p.t), B.Y(p.qd)]))} L${B.X(QB_T - 1)} ${B.Y(0)} L${B.X(0)} ${B.Y(0)} Z" style="fill:var(--accent-2);opacity:0.35;stroke:var(--accent-2)"/>`;
        const lim = st.mode === `shed` ? `<line x1="50" x2="${W - 10}" y1="${B.Y(QB_LIMIT)}" y2="${B.Y(QB_LIMIT)}" style="stroke:var(--warn)" stroke-dasharray="3 3"/><text x="${W - 14}" y="${B.Y(QB_LIMIT) - 5}" text-anchor="end" font-size="12" style="fill:var(--warn)">queue limit</text>` : ``;
        q(`depth`).innerHTML = st.mode === `direct` ? `<p style="color:var(--text-muted)">No queue: every write waits on the database.</p>` : svgWrap(W, 140, B.svg + area + lim);
        const drainT = R.emptyAt === null ? `not within ${QB_T}s` : fmtS(R.emptyAt - R.end);
        q(`stats`).innerHTML = stat(`writes rejected (client errors)`, fmtNum(R.rejected), R.rejected ? `bad` : `good`) + stat(`low-value events dropped (10% sampled)`, fmtNum(R.dropped), R.dropped ? `warn` : ``) + stat(`peak queue depth`, fmtNum(R.peak)) + stat(`worst write delay`, fmtS(R.lag), R.lag > 60 ? `bad` : R.lag > 10 ? `warn` : `good`) + stat(`time to empty after the spike`, st.mode === `direct` ? `n/a` : drainT, R.emptyAt === null && st.mode !== `direct` ? `bad` : ``);
        const consumerBound = st.consumers * QB_PER_CONSUMER * (st.batch > 1 ? 4 : 1) < R.dbRows;
        let n;
        if (st.mode === `direct`) n = R.rejected ? `Without a buffer, everything above the database's ${fmtNum(R.dbRows, 0)} commits/s fails: ${fmtNum(R.rejected)} writes rejected (or timed out, which is worse). Clients retry, which makes the spike bigger. A queue turns those errors into delay.` : `The database keeps up with this spike, so writing directly is the simplest choice. Don't add a queue you don't need.`;
        else {
          n = `The queue absorbs the spike and the database works at a steady ${fmtNum(R.drain, 0)} rows/s; the cost is delay, up to ${fmtS(R.lag)} for a write that arrives at the peak. `;
          if (R.emptyAt === null) n += `The drain rate is below the average arrival rate, so the backlog never clears: a queue only smooths bursts; it can't fix a database that is too small for the steady load. `;
          if (st.mode === `shed` && (R.dropped || R.rejected)) n += `When the queue hit its limit, low-value events were sampled down to 10% instead of growing the delay, and only then were real writes refused with back-pressure. `;
          if (st.mode === `queue` && R.lag > 60) n += `An unbounded queue hides trouble: users see their action "succeed" minutes before it is stored. Bound it and decide what to drop. `;
          n += consumerBound ? `Here the consumers are the bottleneck; adding consumers helps until they reach the database's limit.` : `The database is the bottleneck now, so more consumers won't drain faster${st.batch < 100 ? `; bigger batches (more rows per commit) will` : `; you need a bigger or sharded database`}.`;
        }
        q(`note`).innerHTML = note(n, R.rejected ? `bad` : R.emptyAt === null && st.mode !== `direct` ? `bad` : R.lag > 10 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { spike: v => `+` + fmtNum(v) + `/s`, dur: v => v + `s`, cap: v => fmtNum(v) + `/s`, consumers: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Batching and hierarchical aggregation of counters
  // =====================================================================
  const AG_VIDEOS = 200000, AG_REGIONS = 4;
  const AG_P = (() => { const p = new Float64Array(AG_VIDEOS); let acc = 0; for (let i = 0; i < AG_VIDEOS; i++) { p[i] = 1 / Math.pow(i + 1, 1.1); acc += p[i]; } for (let i = 0; i < AG_VIDEOS; i++) p[i] /= acc; return p; })();
  // Expected distinct videos among n views (Poisson approximation).
  const agDistinct = n => { let d = 0; for (let i = 0; i < AG_VIDEOS; i++) d += 1 - Math.exp(-n * AG_P[i]); return d; };
  const AG_MODES = { direct: `one DB write per view`, server: `count in memory per server`, tiers: `servers, then regional aggregators` };
  D.swAggregate = {
    title: `Batching view counts before they hit the database`,
    blurb: `Every video view increments a counter. 200K videos with a skewed (Zipf) popularity, served by a fleet of app servers. Writing each view is one database write; counting in memory and flushing every T seconds turns many increments of the same video into one "count += n". A second tier of regional aggregators merges again. Compare database writes, staleness and what a crash loses.`,
    mount(el) {
      const st = { rate: 500000, servers: 50, T: 10, mode: `server` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`strategy`, seg(`mode`, Object.keys(AG_MODES).map(k => [k, AG_MODES[k]]), st.mode))}</div>
        <div class="ctl-row">${ctl(`views per second`, seg(`rate`, [[100000, `100K`], [500000, `500K`], [2000000, `2M`]], st.rate))}${ctl(`flush every`, seg(`T`, [[1, `1 s`], [10, `10 s`], [60, `60 s`]], st.T))}${ctl(`app servers`, rng(`servers`, 10, 200, 10, st.servers))}</div>
        <div class="lab-panel"><h4>Database writes per second, all strategies</h4><div data-k="bars"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = st.rate, T = st.T, S = st.servers;
        const perServer = S * agDistinct(R * T / S) / T;
        const perRegion = AG_REGIONS * agDistinct(R * T / AG_REGIONS) / T;
        const W = { direct: R, server: perServer, tiers: perRegion };
        q(`bars`).innerHTML = hbars(Object.keys(AG_MODES).map(k => ({ label: AG_MODES[k], value: W[k], text: fmtNum(W[k]) + `/s`, cls: k === st.mode ? `` : `muted` })));
        const stale = st.mode === `direct` ? 0 : st.mode === `server` ? T : 2 * T;
        const atRisk = st.mode === `direct` ? 0 : st.mode === `server` ? R * T / S : R * T / AG_REGIONS;
        q(`stats`).innerHTML = stat(`DB writes/s`, fmtNum(W[st.mode]), W[st.mode] > 50000 ? `bad` : W[st.mode] > 10000 ? `warn` : `good`) + stat(`reduction vs one write per view`, round(R / W[st.mode], 1) + `×`) + stat(`count can be stale by up to`, stale ? fmtS(stale) : `0 s`) + stat(`views lost if one ${st.mode === `tiers` ? `aggregator` : `server`} crashes`, fmtNum(atRisk), atRisk ? `warn` : `good`) + (st.mode === `tiers` ? stat(`messages servers → aggregators`, fmtNum(perServer) + `/s`) : ``);
        const N = {
          direct: `${fmtNum(R)} writes/s, mostly increments of the same popular videos, often the same rows. That is far beyond one database and creates hot rows. The data is perfectly fresh, but nobody needs a view count exact to the millisecond.`,
          server: `Each server keeps a map of video → count and flushes "count += n" every ${T}s. Popular videos collapse to one write per server per flush, so the database sees ${fmtNum(perServer)} writes/s (${round(R / perServer, 0)}× fewer). Long-tail videos still cost about one write per view, and more servers means each one sees fewer repeats. The price: counts are up to ${T}s stale, and a crashed server loses its unflushed counts unless views are first appended to a durable log such as Kafka.`,
          tiers: `Servers flush partial counts to ${AG_REGIONS} regional aggregators, which merge them and flush again. Each aggregator sees a quarter of all traffic, so more views of each video collapse together: ${fmtNum(perRegion)} DB writes/s. Staleness doubles to ${2 * T}s and an aggregator crash loses more, so make the aggregators consume from a log and commit offsets only after flushing.`
        };
        q(`note`).innerHTML = note(N[st.mode], st.mode === `direct` ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { servers: v => v }, draw);
      draw();
    }
  };
})();
