// Patterns labs, part I: Real-time Updates (lab ids start with "rt").
(function () {
  "use strict";
  const { clamp, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, path, fmtNum, pct } = window.LabKit;
  window.DEMOS = window.DEMOS || {};
  const D = window.DEMOS;
  const chip = (txt, cls) => `<span class="chip ${cls || ``}">${txt}</span>`;
  const secs = v => v >= 3600 ? round(v / 3600, 1) + ` h` : v >= 60 ? round(v / 60, 1) + ` min` : v >= 1 ? round(v, 1) + ` s` : Math.round(v * 1000) + ` ms`;
  const h32 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; };

  // =====================================================================
  // What does each client-server protocol cost at a given scale?
  // =====================================================================
  const PC = { rtt: 0.1, lpTimeout: 30, reqPerServer: 5000, connPerServer: 50000 };
  D.rtPollingCost = {
    title: `Polling vs long polling vs SSE vs WebSockets: what it costs`,
    blurb: `Set how many clients are online, how often each one has a new update, and the polling interval. The lab compares the request rate, the share of wasted (empty) responses, how late an update arrives and how many servers you need. Assumptions: a 100 ms round trip, a 30 s long-poll timeout, a server handles 5,000 short requests per second or holds 50,000 idle connections. The numbers are illustrative; the ratios are the lesson.`,
    mount(el) {
      const st = { clients: 2, rate: 2, interval: 5 };
      const CL = [1e3, 1e4, 1e5, 1e6, 1e7];
      el.innerHTML = `
        <div class="ctl-row">${ctl(`clients online`, rng(`clients`, 0, 4, 1, st.clients))}${ctl(`updates per client per minute`, rng(`rate`, 0.1, 30, 0.1, st.rate))}${ctl(`poll interval`, rng(`interval`, 1, 60, 1, st.interval))}</div>
        <div class="lab-panel"><h4>Requests per second reaching your servers</h4><div data-k="bars"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>Side by side</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const N = CL[st.clients], u = st.rate / 60, T = st.interval, L = PC.lpTimeout;
        const pollEmpty = Math.exp(-u * T);
        const lpCycle = (1 - Math.exp(-u * L)) / u + PC.rtt;
        const lpEmpty = Math.exp(-u * L);
        const R = [
          { k: `poll`, name: `Simple polling`, req: N / T, empty: pollEmpty, delay: T / 2 + PC.rtt / 2, conns: 0 },
          { k: `long`, name: `Long polling`, req: N / lpCycle, empty: lpEmpty, delay: PC.rtt, conns: N },
          { k: `sse`, name: `Server-Sent Events`, req: N / 3600, empty: 0, delay: PC.rtt / 2, conns: N },
          { k: `ws`, name: `WebSockets`, req: N / 3600, empty: 0, delay: PC.rtt / 2, conns: N }
        ];
        R.forEach(r => {
          r.servers = Math.max(1, Math.ceil(Math.max(r.req / PC.reqPerServer, r.conns / PC.connPerServer)));
          r.msgs = r.k === `poll` || r.k === `long` ? r.req : N * u;
        });
        q(`bars`).innerHTML = hbars(R.map(r => ({ label: r.name, value: r.req, text: fmtNum(r.req) + `/s`, cls: r.k === `poll` ? `warn` : r.k === `long` ? `alt` : `good` })));
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>protocol</th><th class="num">requests/s</th><th class="num">empty responses</th><th class="num">avg update delay</th><th class="num">open connections</th><th class="num">servers needed</th></tr>${R.map(r => `<tr><td>${r.name}</td><td class="num">${fmtNum(r.req)}</td><td class="num">${pct(r.empty, 0)}</td><td class="num">${secs(r.delay)}</td><td class="num">${fmtNum(r.conns)}</td><td class="num">${fmtNum(r.servers)}</td></tr>`).join(``)}</table></div>
          <p class="lab-note" style="margin-top:8px">Events pushed per second across all clients: ${fmtNum(N * u)}. SSE and WebSocket request counts are just reconnects (about one per client per hour here).</p>`;
        let n;
        if (u * T > 3) n = `Updates arrive faster than you poll (${round(u * T, 1)} per interval), so almost every poll returns data and polling is honest work. The catch is latency: an update waits ${secs(T / 2)} on average. If that is fine for the product, polling is the simplest correct answer.`;
        else if (pollEmpty > 0.8) n = `${pct(pollEmpty, 0)} of polls come back empty: ${fmtNum(R[0].req * pollEmpty)} wasted requests per second, each one authenticated, routed and logged. Long polling and SSE remove that waste, at the price of ${fmtNum(N)} open connections and stateful servers. Shortening the interval to cut latency makes the waste worse.`;
        else n = `Polling wastes ${pct(pollEmpty, 0)} of its requests and adds ${secs(T / 2)} of delay on average. Push protocols trade that for one held connection per client. Note that SSE and WebSockets cost the same here; pick WebSockets only when clients also send often.`;
        q(`note`).innerHTML = note(n, pollEmpty > 0.8 ? `warn` : `good`);
      };
      wireRanges(el, st, { clients: v => fmtNum(CL[v]), rate: v => v, interval: v => v + ` s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Routing events to the right connection server: consistent hashing vs pub/sub
  // =====================================================================
  const RT_USERS = 12000;
  function rtRing(n, vnodes) {
    const pts = [];
    for (let s = 0; s < n; s++) for (let v = 0; v < vnodes; v++) pts.push([h32(`srv-` + s + `-vn-` + v), s]);
    pts.sort((a, b) => a[0] - b[0]);
    return pts;
  }
  function rtOwner(ring, h) {
    let lo = 0, hi = ring.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ring[m][0] < h) lo = m + 1; else hi = m; }
    return ring[lo === ring.length ? 0 : lo][1];
  }
  function rtRoute(strategy, n, vnodes, change, seed) {
    const n2 = change === `add` ? n + 1 : n - 1;
    const hashes = new Array(RT_USERS);
    for (let u = 0; u < RT_USERS; u++) hashes[u] = h32(`user-` + u);
    const before = new Array(RT_USERS), after = new Array(RT_USERS);
    if (strategy === `mod`) {
      for (let u = 0; u < RT_USERS; u++) { before[u] = hashes[u] % n; after[u] = change === `add` ? hashes[u] % n2 : null; }
      if (change === `fail`) {
        // server n-1 dies; the remaining servers are renumbered 0..n-2 and every key is re-hashed mod (n-1)
        for (let u = 0; u < RT_USERS; u++) after[u] = hashes[u] % n2;
      }
    } else if (strategy === `ring`) {
      const r1 = rtRing(n, vnodes);
      const r2 = change === `add` ? rtRing(n2, vnodes) : r1.filter(p => p[1] !== n - 1);
      for (let u = 0; u < RT_USERS; u++) { before[u] = rtOwner(r1, hashes[u]); after[u] = rtOwner(r2, hashes[u]); }
    } else {
      // pub/sub: clients connect anywhere (least connections); nobody moves unless their server dies
      const r = mulberry32(seed);
      const load = new Array(n).fill(0);
      for (let u = 0; u < RT_USERS; u++) {
        let best = 0;
        for (let s = 1; s < n; s++) if (load[s] < load[best] || (load[s] === load[best] && r() < 0.5)) best = s;
        before[u] = best; load[best]++;
      }
      const load2 = new Array(n2).fill(0);
      for (let u = 0; u < RT_USERS; u++) if (change === `add` || before[u] !== n - 1) { after[u] = before[u]; load2[before[u]]++; }
      for (let u = 0; u < RT_USERS; u++) if (change === `fail` && before[u] === n - 1) {
        let best = 0;
        for (let s = 1; s < n2; s++) if (load2[s] < load2[best]) best = s;
        after[u] = best; load2[best]++;
      }
    }
    const lb = new Array(n).fill(0), la = new Array(n2).fill(0);
    let moved = 0, forced = 0;
    for (let u = 0; u < RT_USERS; u++) {
      lb[before[u]]++; la[after[u]]++;
      if (before[u] !== after[u]) { moved++; if (change === `fail` && before[u] === n - 1) forced++; }
    }
    return { lb, la, moved, forced, n2 };
  }
  D.rtRouting = {
    title: `Finding the server that holds the connection`,
    blurb: `12,000 users hold persistent connections spread over your connection servers. An event for a user must reach whichever server holds that user's socket. With consistent hashing, the user's ID decides the server, so producers can send directly; with pub/sub, users connect anywhere and servers subscribe to the users' channels. Add a server or kill one and count how many users have to reconnect.`,
    mount(el) {
      const st = { strategy: `ring`, n: 6, vnodes: 100, change: `add` };
      const NAMES = { mod: `hash mod N`, ring: `consistent hashing`, pubsub: `pub/sub (connect anywhere)` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`routing`, seg(`strategy`, Object.keys(NAMES).map(k => [k, NAMES[k]]), st.strategy))}</div>
        <div class="ctl-row">${ctl(`connection servers`, rng(`n`, 2, 16, 1, st.n))}${ctl(`virtual nodes per server`, rng(`vnodes`, 1, 200, 1, st.vnodes))}${ctl(`event`, seg(`change`, [[`add`, `add a server`], [`fail`, `a server dies`]], st.change))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Connections per server, before</h4><div data-k="before"></div></div>
          <div class="lab-panel"><h4>Connections per server, after</h4><div data-k="after"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><div class="stat-row" data-k="stats"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>All three, same change</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const all = {};
        Object.keys(NAMES).forEach(k => { all[k] = rtRoute(k, st.n, st.vnodes, st.change, 7); });
        const R = all[st.strategy];
        const max = Math.max(...R.lb, ...R.la);
        const bars = arr => hbars(arr.map((v, i) => ({ label: `server ${i + 1}`, value: v, text: fmtNum(v), cls: v > 1.3 * RT_USERS / arr.length ? `bad` : v < 0.5 * RT_USERS / arr.length ? `warn` : `good` })), max);
        q(`before`).innerHTML = bars(R.lb);
        q(`after`).innerHTML = bars(R.la);
        const ideal = st.change === `add` ? 1 / (st.n + 1) : 1 / st.n;
        const imb = Math.max(...R.la) / (RT_USERS / R.n2);
        q(`stats`).innerHTML = stat(`users who must reconnect`, `${fmtNum(R.moved)} (${pct(R.moved / RT_USERS, 1)})`, R.moved / RT_USERS > 2 * ideal ? `bad` : `good`) + stat(`unavoidable minimum`, pct(st.change === `add` && st.strategy === `pubsub` ? 0 : ideal, 1)) + stat(`busiest server vs average`, round(imb, 2) + `x`, imb > 1.3 ? `warn` : `good`) + stat(`hops per event`, st.strategy === `pubsub` ? `producer to broker to server` : `producer to server (direct)`);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>routing</th><th class="num">reconnects</th><th class="num">busiest / avg after</th><th>needs a broker</th><th>new server fills up</th></tr>${Object.keys(NAMES).map(k => `<tr class="${k === st.strategy ? `new` : ``}"><td>${NAMES[k]}</td><td class="num">${fmtNum(all[k].moved)}</td><td class="num">${round(Math.max(...all[k].la) / (RT_USERS / all[k].n2), 2)}x</td><td>${chip(k === `pubsub` ? `yes` : `no`, k === `pubsub` ? `muted` : `ok`)}</td><td>${k === `pubsub` ? (st.change === `add` ? chip(`only as new users arrive`, `no`) : `-`) : chip(`at once`, `ok`)}</td></tr>`).join(``)}</table></div>`;
        let n;
        if (st.strategy === `mod`) n = `Re-hashing with mod ${R.n2} moves ${pct(R.moved / RT_USERS, 0)} of users, not the ${pct(ideal, 0)} that actually had to move. Every one of them drops their socket and reconnects to a new server, and any events sent during the shuffle go to the old owner. This is why connection routing uses consistent hashing.`;
        else if (st.strategy === `ring`) n = `Consistent hashing moved ${pct(R.moved / RT_USERS, 1)} of users, close to the minimum of ${pct(ideal, 1)}. ${st.vnodes < 20 ? `With only ${st.vnodes} virtual node${st.vnodes > 1 ? `s` : ``} per server the load is lumpy (busiest server ${round(imb, 2)}x the average); raise it to smooth the ring.` : `With ${st.vnodes} virtual nodes per server the load stays even.`} The cost: during a change, producers and clients must agree on the new ring (usually via a coordination service such as ZooKeeper or etcd), or events land on the wrong server.`;
        else n = st.change === `add` ? `Nobody reconnects: users stay where they are, and the new server only fills up as new or reconnecting users pick it. Routing needs no agreement on ownership because every event goes through the broker, which delivers it to whichever server subscribed to that user's channel. You pay one broker hop per event and a subscription per online user.` : `Only the dead server's users reconnect, and least-connections balancing spreads them over the survivors. Each one re-subscribes to its channel on the new server; events published while they were away are lost unless the channel is a durable stream or the client catches up from storage.`;
        q(`note`).innerHTML = note(n, st.strategy === `mod` ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => v, vnodes: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Fan-out for a user with millions of followers
  // =====================================================================
  const CF = { broker: 1e6, perServerWrites: 50000, pullEvery: 60 };
  D.rtCelebrity = {
    title: `One update, millions of followers: fan-out strategies`,
    blurb: `A popular account posts, and every online follower should see it. Compare publishing one message per follower, one message per connection server (each server fans out to its own sockets), and letting followers pull. Assumptions: the broker moves 1 million messages per second, a connection server writes 50,000 socket frames per second, followers are spread evenly over the fleet, and pulling clients refresh every 60 s.`,
    mount(el) {
      const st = { followers: 3, online: 10, posts: 1, fleet: 200 };
      const FL = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
      el.innerHTML = `
        <div class="ctl-row">${ctl(`followers`, rng(`followers`, 0, 5, 1, st.followers))}${ctl(`online right now`, rng(`online`, 1, 50, 1, st.online))}${ctl(`posts per minute`, rng(`posts`, 1, 20, 1, st.posts))}${ctl(`connection servers in the fleet`, rng(`fleet`, 10, 2000, 10, st.fleet))}</div>
        <div class="lab-panel"><h4>Time until the last online follower sees one post</h4><div data-k="bars"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>Cost per post</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const F = FL[st.followers], on = Math.round(F * st.online / 100);
        const servers = st.fleet;
        const per = on / servers;
        const touched = servers * (1 - Math.exp(-on / servers));
        const perPostMsgs = on;
        const R = [
          { k: `each`, name: `one message per follower`, msgs: on, time: on / CF.broker + per / CF.perServerWrites, reads: 0, cls: `bad` },
          { k: `server`, name: `one message per server`, msgs: Math.round(touched), time: touched / CF.broker + per / CF.perServerWrites, reads: 0, cls: `good` },
          { k: `pull`, name: `followers pull`, msgs: 0, time: CF.pullEvery, reads: on / CF.pullEvery, cls: `warn` }
        ];
        const brokerLoad = perPostMsgs * st.posts / 60 / CF.broker;
        q(`bars`).innerHTML = hbars(R.map(r => ({ label: r.name, value: r.time, text: secs(r.time), cls: r.cls })));
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>strategy</th><th class="num">broker messages / post</th><th class="num">reads on the post / s</th><th class="num">last follower sees it</th><th>real time?</th></tr>${R.map(r => `<tr><td>${r.name}</td><td class="num">${fmtNum(r.msgs)}</td><td class="num">${fmtNum(r.reads)}</td><td class="num">${secs(r.time)}</td><td>${chip(r.k === `pull` ? `no` : `yes`, r.k === `pull` ? `no` : `ok`)}</td></tr>`).join(``)}</table></div>
          <div class="stat-row" style="margin-top:10px">${stat(`online followers`, fmtNum(on))}${stat(`followers per server`, fmtNum(round(per, 0)))}${stat(`broker busy with per-follower fan-out`, pct(Math.min(brokerLoad, 9.99), 0), brokerLoad > 0.5 ? `bad` : `good`)}</div>`;
        let n;
        if (on < 10000) n = `Only ${fmtNum(on)} followers are online, so even one message per follower is trivial. Fan-out strategy only starts to matter at hundreds of thousands of recipients; don't over-engineer for a normal user.`;
        else n = `Per-follower fan-out puts ${fmtNum(on)} messages on the broker for one post${brokerLoad > 0.5 ? `, and at ${st.posts} post${st.posts > 1 ? `s` : ``} a minute that is ${pct(brokerLoad, 0)} of its capacity, starving every other user` : ``}. Publishing once to a channel that each connection server subscribes to sends about ${fmtNum(Math.round(touched))} messages; each server then writes to its own sockets in parallel. Pulling sends nothing but is up to ${CF.pullEvery} s late and turns into ${fmtNum(on / CF.pullEvery)} reads a second, which only work because the post is one hot, cacheable object.`;
        q(`note`).innerHTML = note(n, on < 10000 ? `good` : brokerLoad > 0.5 ? `bad` : `warn`);
      };
      wireRanges(el, st, { followers: v => fmtNum(FL[v]), online: v => v + `%`, posts: v => v, fleet: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Reconnection storms: backoff and jitter
  // =====================================================================
  const RC = { dt: 0.1, horizon: 120, maxDelay: 30, base: 1, levels: 14, rejectCost: 0.25 };
  const RC_NAMES = { now: `retry immediately`, fixed: `fixed 1 s`, expo: `exponential backoff`, jitter: `exponential + full jitter` };
  function rcSim(strategy, C, cap, buffer) {
    const ticks = Math.round(RC.horizon / RC.dt), L = RC.levels;
    // point[t][l]: attempts landing exactly at tick t; diff[t][l]: start/end of a uniform spread (jitter)
    const point = Array.from({ length: ticks + 2 }, () => new Float64Array(L));
    const diff = Array.from({ length: ticks + 2 }, () => new Float64Array(L));
    const lv = l => Math.min(l, L - 1);
    const add = (t, l, n) => { if (t <= ticks) point[t][lv(l)] += n; };
    const delayFor = l => strategy === `now` ? RC.dt : strategy === `fixed` ? 1 : Math.min(RC.maxDelay, RC.base * Math.pow(2, l));
    const spread = (t0, l, n) => {
      const w = Math.max(1, Math.round(delayFor(l) / RC.dt));
      if (t0 + 1 > ticks) return;
      diff[t0 + 1][lv(l)] += n / w;
      if (t0 + w + 1 <= ticks + 1) diff[t0 + w + 1][lv(l)] -= n / w;
    };
    if (strategy === `jitter`) spread(0, 0, C); else add(1, 0, C);
    const rate = new Float64Array(L), row = new Float64Array(L);
    const attempts = new Float64Array(ticks + 1);
    let done = 0, wasted = 0, t99 = null, late = 0, peak = 0;
    const capTick = cap * RC.dt;
    for (let t = 0; t <= ticks; t++) {
      let A = 0;
      for (let l = 0; l < L; l++) { rate[l] += diff[t][l]; row[l] = point[t][l] + Math.max(0, rate[l]); A += row[l]; }
      attempts[t] = A / RC.dt;
      peak = Math.max(peak, attempts[t]);
      if (A < 1e-9) continue;
      // rejected handshakes still cost CPU: under overload, each excess attempt eats a quarter of an accept
      const over = Math.max(0, A / capTick - 1);
      const ok = Math.min(A, capTick / (1 + RC.rejectCost * over)), f = ok / A;
      done += ok; wasted += A - ok;
      if (t * RC.dt > buffer) late += ok;
      if (t99 === null && done >= 0.99 * C) t99 = t * RC.dt;
      for (let l = 0; l < L; l++) {
        const fail = row[l] * (1 - f);
        if (fail <= 1e-9) continue;
        if (strategy === `jitter`) spread(t, l + 1, fail);
        else add(t + Math.max(1, Math.round(delayFor(l) / RC.dt)), l + 1, fail);
      }
    }
    late = Math.round(late + Math.max(0, C - done));
    return { attempts, done, wasted, t99, late, peak, ticks };
  }
  D.rtReconnect = {
    title: `Reconnection storms: why clients need backoff and jitter`,
    blurb: `A connection server dies and all of its clients try to reconnect at the same moment. The surviving servers can accept a limited number of new connections per second (TLS handshake, auth, re-subscribing); attempts beyond that fail and the client retries. Rejected attempts are not free: each one costs a quarter of a successful handshake, so a flood of retries lowers how many clients get in. Compare retry policies, and see how many clients were gone longer than the server's replay buffer and so need a full resync.`,
    mount(el) {
      const st = { strategy: `jitter`, clients: 50000, cap: 5000, buffer: 30 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`retry policy`, seg(`strategy`, Object.keys(RC_NAMES).map(k => [k, RC_NAMES[k]]), st.strategy))}</div>
        <div class="ctl-row">${ctl(`clients on the dead server`, rng(`clients`, 5000, 200000, 5000, st.clients))}${ctl(`cluster accepts per second`, rng(`cap`, 1000, 20000, 500, st.cap))}${ctl(`replay buffer`, rng(`buffer`, 5, 120, 5, st.buffer))}</div>
        <div class="lab-panel"><h4>Reconnect attempts per second after the crash</h4><div data-k="chart"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        <div class="lab-panel" style="margin-top:14px"><h4>All policies, same crash</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const all = {};
        Object.keys(RC_NAMES).forEach(k => { all[k] = rcSim(k, st.clients, st.cap, st.buffer); });
        const R = all[st.strategy];
        const show = Math.min(RC.horizon, Math.max(20, (R.t99 || RC.horizon) * 1.3));
        const ymax = Math.max(st.cap * 1.5, ...Array.from(R.attempts.slice(0, Math.round(show / RC.dt))).map(v => Math.min(v, st.clients / RC.dt)));
        const ym = Math.pow(10, Math.ceil(Math.log10(ymax)));
        const top = ymax <= ym / 2 ? ym / 2 : ym;
        const a = axes({ x0: 56, x1: 600, y0: 200, y1: 14, dx0: 0, dx1: show, dy0: 0, dy1: top, xTicks: [0, show / 4, show / 2, 3 * show / 4, show].map(v => round(v, 0)), yTicks: [0, top / 2, top], xFmt: v => v + ` s`, yFmt: v => fmtNum(v), xLabel: `seconds after the crash` });
        const pts = [];
        for (let t = 0; t * RC.dt <= show; t++) pts.push([a.X(t * RC.dt), a.Y(Math.min(R.attempts[t], top))]);
        let c = a.svg + `<line x1="56" x2="600" y1="${a.Y(st.cap)}" y2="${a.Y(st.cap)}" style="stroke:var(--good);stroke-width:1.5;stroke-dasharray:5 4"/><text x="596" y="${a.Y(st.cap) - 5}" text-anchor="end" class="svg-label" style="fill:var(--good)">capacity</text>`;
        c += `<path d="${path(pts)}" style="fill:none;stroke:var(--accent);stroke-width:2"/>`;
        q(`chart`).innerHTML = svgWrap(620, 236, c);
        q(`stats`).innerHTML = stat(`99% reconnected after`, R.t99 === null ? `> ${RC.horizon} s` : secs(R.t99), R.t99 === null || R.t99 > 2 * st.clients / st.cap ? `bad` : `good`) + stat(`peak attempts/s`, fmtNum(R.peak), R.peak > 3 * st.cap ? `bad` : `good`) + stat(`rejected attempts`, fmtNum(R.wasted), R.wasted > st.clients ? `bad` : ``) + stat(`clients needing a full resync`, `${fmtNum(R.late)} (${pct(R.late / st.clients, 0)})`, R.late ? `warn` : `good`);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th>policy</th><th class="num">99% back after</th><th class="num">peak attempts/s</th><th class="num">rejected attempts</th><th class="num">full resyncs</th></tr>${Object.keys(RC_NAMES).map(k => `<tr class="${k === st.strategy ? `new` : ``}"><td>${RC_NAMES[k]}</td><td class="num">${all[k].t99 === null ? `> ${RC.horizon} s` : secs(all[k].t99)}</td><td class="num">${fmtNum(all[k].peak)}</td><td class="num">${fmtNum(all[k].wasted)}</td><td class="num">${fmtNum(all[k].late)}</td></tr>`).join(``)}</table></div>`;
        const floor = st.clients / st.cap;
        const N = {
          now: `Every rejected client retries on the next tick, so the cluster sees about ${fmtNum(R.peak)} attempts a second against a capacity of ${fmtNum(st.cap)}. Rejected handshakes still burn CPU, so the flood itself shrinks how many clients get in, and in production the healthy servers can tip over too. Never ship a tight retry loop.`,
          fixed: `A fixed one-second retry keeps all the failed clients in lockstep: they come back as one wave every second, and each wave is mostly rejected. It is better than retrying instantly but still wastes ${fmtNum(R.wasted)} attempts.`,
          expo: `Backoff thins out the retries, but every client that failed together waits the same 1, 2, 4, 8 s and comes back together. Each wave still lands at one instant, mostly gets rejected, and the gaps between waves grow longer and longer while capacity sits idle.`,
          jitter: `Full jitter picks a random delay between zero and the backoff ceiling, so retries spread into a smooth stream close to capacity. Everyone is back in about ${R.t99 === null ? `more than ${RC.horizon} s` : secs(R.t99)}, near the floor of ${secs(floor)} that ${fmtNum(st.clients)} clients at ${fmtNum(st.cap)} accepts/s allows.`
        };
        let n = N[st.strategy];
        n += R.late ? ` ${fmtNum(R.late)} clients were away longer than the ${st.buffer} s replay buffer, so they cannot just ask for "everything after event N" and must refetch state from the database: one more reason to reconnect quickly and to size the buffer for your worst outage.` : ` Every client got back within the ${st.buffer} s replay buffer, so each can resume from its last event ID instead of refetching state.`;
        q(`note`).innerHTML = note(n, st.strategy === `jitter` ? `good` : st.strategy === `now` ? `bad` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { clients: v => fmtNum(v), cap: v => fmtNum(v) + `/s`, buffer: v => v + ` s` }, draw);
      draw();
    }
  };
})();
