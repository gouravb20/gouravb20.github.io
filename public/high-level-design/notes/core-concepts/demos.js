// Core concepts labs: networking essentials (chapters 1-6)
(function () {
  "use strict";
  const { esc, clamp, sum, round, mulberry32, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, path, fmtNum, fmtBytes, pct } = window.LabKit;
  const D = window.DEMOS;
  const PAL = [`var(--accent)`, `var(--accent-2)`, `var(--accent-3)`, `#a78bfa`, `#f472b6`, `#4ade80`];
  const ms = v => v >= 1000 ? round(v / 1000, 2) + ` s` : Math.round(v) + ` ms`;
  const pctl = (arr, p) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

  // =====================================================================
  // Ch1 - Life of a web request: DNS, TCP, TLS, HTTP and connection reuse
  // =====================================================================
  const WR_COL = { dns: `var(--accent-2)`, tcp: `var(--accent-3)`, tls: `#a78bfa`, net: `var(--text-muted)`, srv: `var(--accent)` };
  function wrPlan(st, mode) {
    const rtt = st.rtt, tlsK = st.tls === `none` ? 0 : st.tls === `12` ? 2 : 1;
    const bars = [];
    let t = 0;
    if (st.dns === `cold`) { bars.push({ row: 0, kind: `dns`, a: 0, b: rtt }); t = rtt; }
    const setup = (row, start) => {
      let s = start;
      bars.push({ row, kind: `tcp`, a: s, b: s + rtt }); s += rtt;
      if (tlsK) { bars.push({ row, kind: `tls`, a: s, b: s + tlsK * rtt }); s += tlsK * rtt; }
      return s;
    };
    const req = (row, start) => {
      bars.push({ row, kind: `net`, a: start, b: start + rtt / 2 });
      bars.push({ row, kind: `srv`, a: start + rtt / 2, b: start + rtt / 2 + st.srv });
      bars.push({ row, kind: `net`, a: start + rtt / 2 + st.srv, b: start + rtt + st.srv });
      return start + rtt + st.srv;
    };
    let handshakes = 0, rts = st.dns === `cold` ? 1 : 0, srvOnPath = 0;
    if (mode === `new`) {
      for (let i = 1; i <= st.n; i++) { t = req(i, setup(i, t)); handshakes++; }
      rts += st.n * (2 + tlsK); srvOnPath = st.n * st.srv;
    } else if (mode === `keep`) {
      t = setup(0, t); handshakes = 1;
      for (let i = 1; i <= st.n; i++) t = req(i, t);
      rts += 1 + tlsK + st.n; srvOnPath = st.n * st.srv;
    } else {
      const s = setup(0, t); handshakes = 1;
      for (let i = 1; i <= st.n; i++) t = Math.max(t, req(i, s));
      rts += 2 + tlsK; srvOnPath = st.srv;
    }
    return { bars, total: t, handshakes, rts, srvOnPath };
  }
  const WR_MODES = { new: `new connection per request`, keep: `keep-alive (reuse, one at a time)`, h2: `HTTP/2 (reuse, all in parallel)` };
  D.webRequest = {
    title: `Life of a web request: where the round trips go`,
    blurb: `A page needs <strong>n</strong> HTTPS requests to one server. Each step costs round trips: DNS, the TCP handshake (SYN, SYN-ACK, ACK), the TLS handshake, then the request itself plus server time. Change the round-trip time and the connection strategy to see how much of the wait is the network rather than your code. Teardown (FIN/ACK) happens after the response, so it isn't drawn.`,
    mount(el) {
      const st = { rtt: 80, srv: 40, n: 6, tls: `13`, mode: `new`, dns: `cold` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`round-trip time`, rng(`rtt`, 5, 300, 5, st.rtt))}${ctl(`server time / request`, rng(`srv`, 0, 400, 10, st.srv))}${ctl(`requests on the page`, rng(`n`, 1, 12, 1, st.n))}</div>
        <div class="ctl-row">${ctl(`connections`, seg(`mode`, Object.keys(WR_MODES).map(k => [k, WR_MODES[k]]), st.mode))}</div>
        <div class="ctl-row">${ctl(`TLS`, seg(`tls`, [[`none`, `plain HTTP`], [`13`, `TLS 1.3 (1 RTT)`], [`12`, `TLS 1.2 (2 RTT)`]], st.tls))}${ctl(`DNS`, seg(`dns`, [[`cold`, `not cached`], [`cached`, `cached`]], st.dns))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Timeline</h4><div data-k="chart"></div>
            <div class="legend"><span><i class="sw" style="background:${WR_COL.dns}"></i>DNS</span><span><i class="sw" style="background:${WR_COL.tcp}"></i>TCP handshake</span><span><i class="sw" style="background:${WR_COL.tls}"></i>TLS handshake</span><span><i class="sw" style="background:${WR_COL.net};opacity:.5"></i>request / response in flight</span><span><i class="sw" style="background:${WR_COL.srv}"></i>server processing</span></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div><h4 style="margin-top:12px">Same page, three ways</h4><div data-k="cmp"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const P = wrPlan(st, st.mode);
        const rows = st.n + 1, RH = 17, L = 64, W = 520, H = rows * RH + 30;
        const X = v => L + (v / Math.max(P.total, 1)) * (W - L - 10);
        let s = ``;
        for (let r = 0; r < rows; r++) {
          s += `<text class="svg-label" x="${L - 6}" y="${r * RH + 12}" text-anchor="end">${r === 0 ? (st.mode === `new` ? `DNS` : `setup`) : `req ${r}`}</text>`;
          s += `<line class="svg-grid" x1="${L}" x2="${W - 10}" y1="${r * RH + RH - 2}" y2="${r * RH + RH - 2}"/>`;
        }
        P.bars.forEach(b => { s += `<rect x="${X(b.a)}" y="${b.row * RH + 2}" width="${Math.max(0.8, X(b.b) - X(b.a))}" height="${RH - 6}" rx="2" style="fill:${WR_COL[b.kind]};${b.kind === `net` ? `opacity:.45` : ``}"/>`; });
        const mag = Math.pow(10, Math.floor(Math.log10(Math.max(P.total, 10))));
        const tick = [1, 2, 5, 10].map(m => m * mag / 2).find(v => P.total / v <= 6) || mag;
        for (let v = 0; v <= P.total + 1e-6; v += tick) s += `<text class="svg-label" x="${X(v)}" y="${rows * RH + 14}" text-anchor="middle">${ms(v)}</text>`;
        q(`chart`).innerHTML = svgWrap(W, H, s);
        const netShare = 1 - P.srvOnPath / Math.max(P.total, 1);
        q(`stats`).innerHTML = stat(`time to load`, ms(P.total)) + stat(`round trips on the critical path`, P.rts) + stat(`TCP handshakes`, P.handshakes) + stat(`spent waiting on the network`, pct(netShare), netShare > 0.7 ? `bad` : ``);
        const all = Object.keys(WR_MODES).map(m => ({ m, t: wrPlan(st, m).total }));
        const mx = Math.max(...all.map(a => a.t));
        q(`cmp`).innerHTML = hbars(all.map(a => ({ label: { new: `new conn each`, keep: `keep-alive`, h2: `HTTP/2` }[a.m], value: a.t, max: mx, text: ms(a.t), cls: a.m === st.mode ? `good` : `muted` })), mx);
        const tlsTxt = st.tls === `none` ? `` : `, TLS adds ${st.tls === `12` ? 2 : 1} more`;
        let n;
        if (st.mode === `new`) n = `Every request pays a fresh TCP handshake (1 RTT${tlsTxt}) before it can even be sent. With ${st.n} requests that is ${P.handshakes} handshakes; the network accounts for ${pct(netShare)} of the wait. Reusing the connection removes almost all of it.`;
        else if (st.mode === `keep`) n = `The connection is set up once and reused, so each extra request costs one round trip plus server time. Requests still wait for each other; HTTP/1.1 browsers work around this by opening about six connections per host.`;
        else n = `HTTP/2 sets up one connection and sends all ${st.n} requests at once over it (multiplexing), so the page costs about ${P.rts} round trips regardless of how many requests it makes. HTTP/3 (QUIC) also folds the TLS handshake into the transport handshake.`;
        if (st.rtt >= 150) n += ` At ${st.rtt} ms per round trip (a distant or mobile user), cutting round trips matters far more than shaving server time.`;
        q(`note`).innerHTML = note(n, st.mode === `new` ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { rtt: v => v + ` ms`, srv: v => v + ` ms`, n: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch2 - TCP vs UDP over a lossy link
  // =====================================================================
  const TU_N = 40, TU_GAP = 20;
  function tuSim(st, seed) {
    const r = mulberry32(seed * 7919 + 17);
    const draws = Array.from({ length: TU_N }, () => Array.from({ length: 10 }, () => ({ lost: r() < st.loss / 100, j: r() })));
    const owd = d => st.rtt / 2 + d.j * st.jit;
    const udp = [], tcp = [];
    let lastUdp = -Infinity, ooo = 0;
    for (let i = 0; i < TU_N; i++) {
      const send = i * TU_GAP, d0 = draws[i][0];
      if (d0.lost) udp.push({ lost: true });
      else { const arr = send + owd(d0); if (arr < lastUdp) ooo++; lastUdp = Math.max(lastUdp, arr); udp.push({ lat: arr - send }); }
    }
    const rto = Math.max(st.rtt * 1.5, st.rtt + 4 * st.jit) + 10;
    let prevDeliver = -Infinity, retx = 0;
    for (let i = 0; i < TU_N; i++) {
      const send = i * TU_GAP;
      let a = 0; while (a < 9 && draws[i][a].lost) a++;
      retx += a;
      const arr = send + a * rto + owd(draws[i][Math.min(a, 9)]);
      const deliver = Math.max(arr, prevDeliver);
      prevDeliver = deliver;
      tcp.push({ lat: deliver - send, retx: a, blocked: deliver > arr + 0.5 });
    }
    return { udp, tcp, ooo, retx };
  }
  D.tcpVsUdp = {
    title: `TCP vs UDP on a lossy link: completeness or freshness?`,
    blurb: `A voice app sends a small packet every 20 ms. Over <strong>UDP</strong>, lost packets are simply gone and late ones may arrive out of order. Over <strong>TCP</strong>, lost packets are retransmitted and everything is delivered in order, so one loss holds back the packets behind it (<strong>head-of-line blocking</strong>). The playout deadline is how late audio can be and still be useful.`,
    mount(el) {
      const st = { loss: 5, rtt: 80, jit: 20, deadline: 150 };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`packet loss`, rng(`loss`, 0, 30, 1, st.loss))}${ctl(`round-trip time`, rng(`rtt`, 20, 300, 10, st.rtt))}${ctl(`jitter`, rng(`jit`, 0, 80, 5, st.jit))}${ctl(`playout deadline`, rng(`deadline`, 60, 500, 10, st.deadline))}</div>
        <div class="ctl-row"><button class="lab-btn ghost" data-act="again">New random run</button></div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Delay from send to the application, per packet</h4><div data-k="chart"></div>
            <div class="legend"><span><i class="sw" style="background:var(--good)"></i>on time</span><span><i class="sw" style="background:var(--warn)"></i>past the deadline</span><span><i class="sw" style="background:var(--bad)"></i>lost (UDP)</span><span><i class="sw line" style="background:var(--text)"></i>deadline</span></div></div>
          <div class="lab-panel"><h4>Comparison</h4><div data-k="tbl"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = tuSim(st, seed);
        const W = 520, CH = 92, cap = Math.max(st.deadline * 2, st.rtt * 3), bw = (W - 60) / TU_N;
        const chart = (rows, y0, label) => {
          let s = `<text class="svg-title" x="0" y="${y0 + 12}">${label}</text>`;
          const Y = v => y0 + CH - (Math.min(v, cap) / cap) * (CH - 18);
          s += `<line class="svg-grid" x1="56" x2="${W}" y1="${y0 + CH}" y2="${y0 + CH}"/>`;
          rows.forEach((p, i) => {
            const x = 58 + i * bw;
            if (p.lost) s += `<text x="${x + bw / 2}" y="${y0 + CH - 3}" text-anchor="middle" style="fill:var(--bad);font-size:11px;font-weight:700">×</text>`;
            else s += `<rect x="${x}" y="${Y(p.lat)}" width="${Math.max(1, bw - 2)}" height="${y0 + CH - Y(p.lat)}" style="fill:${p.lat <= st.deadline ? `var(--good)` : `var(--warn)`}"/>`;
          });
          s += `<line x1="56" x2="${W}" y1="${Y(st.deadline)}" y2="${Y(st.deadline)}" style="stroke:var(--text);stroke-dasharray:4 3"/>`;
          s += `<text class="svg-label" x="52" y="${Y(st.deadline) + 3}" text-anchor="end">${st.deadline} ms</text>`;
          s += `<text class="svg-label" x="52" y="${y0 + 22}" text-anchor="end">${cap}+</text>`;
          return s;
        };
        q(`chart`).innerHTML = svgWrap(W, CH * 2 + 26, chart(R.udp, 0, `UDP`) + chart(R.tcp, CH + 22, `TCP`));
        const uOk = R.udp.filter(p => !p.lost), uLat = uOk.map(p => p.lat), tLat = R.tcp.map(p => p.lat);
        const uUse = uOk.filter(p => p.lat <= st.deadline).length / TU_N, tUse = R.tcp.filter(p => p.lat <= st.deadline).length / TU_N;
        const avg = a => a.length ? sum(a) / a.length : 0;
        const ack = Math.ceil(TU_N / 2);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table">
          <tr><th></th><th class="num">UDP</th><th class="num">TCP</th></tr>
          <tr><td>delivered</td><td class="num">${pct(uOk.length / TU_N)}</td><td class="num">100%</td></tr>
          <tr><td>useful (by deadline)</td><td class="num"><b>${pct(uUse)}</b></td><td class="num"><b>${pct(tUse)}</b></td></tr>
          <tr><td>average delay</td><td class="num">${ms(avg(uLat))}</td><td class="num">${ms(avg(tLat))}</td></tr>
          <tr><td>worst delay</td><td class="num">${ms(Math.max(0, ...uLat))}</td><td class="num">${ms(Math.max(...tLat))}</td></tr>
          <tr><td>out of order</td><td class="num">${R.ooo}</td><td class="num">0</td></tr>
          <tr><td>retransmissions</td><td class="num">0</td><td class="num">${R.retx}</td></tr>
          <tr><td>header bytes</td><td class="num">${TU_N * 8} B</td><td class="num">${TU_N * 20 + R.retx * 20} B</td></tr>
          <tr><td>ACK packets back</td><td class="num">0</td><td class="num">~${ack}</td></tr>
        </table></div>`;
        let n;
        if (st.loss === 0 && st.jit === 0) n = `On a perfect link the two behave the same apart from header size and TCP's handshake. The difference only appears when packets are lost or delayed.`;
        else if (tUse < uUse) n = `TCP delivers every packet, but each loss stalls the stream for a retransmission timeout and everything behind it waits (head-of-line blocking), so fewer packets make the ${st.deadline} ms deadline than with UDP, which just skips the gaps. That is why real-time audio, video and games prefer UDP and conceal loss.`;
        else n = `With little loss or a generous deadline, TCP's retransmissions still arrive in time, so it loses nothing useful. Raise the loss rate or tighten the deadline to see head-of-line blocking hurt.`;
        q(`note`).innerHTML = note(n, tUse < uUse ? `warn` : `good`);
      };
      el.addEventListener(`click`, e => { if (e.target.closest(`[data-act="again"]`)) { seed++; draw(); } });
      wireRanges(el, st, { loss: v => v + `%`, rtt: v => v + ` ms`, jit: v => `±` + v + ` ms`, deadline: v => v + ` ms` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch3 - Under-fetching and over-fetching: REST vs aggregate vs GraphQL
  // =====================================================================
  const AF_HDR = 500, AF_NEED = 650;
  function afPlan(st) {
    const N = st.users, conc = st.par === `seq` ? 1 : st.par === `six` ? 6 : Infinity;
    const callSrv = 12;
    const restCalls = 1 + 2 * N, restRounds = 1 + Math.ceil(2 * N / Math.min(conc, 2 * N));
    const rest = { calls: restCalls, rounds: restRounds, time: restRounds * (st.rtt + callSrv), bytes: restCalls * AF_HDR + N * (250 + 1500 + 1000), db: restCalls };
    const agg = { calls: 1, rounds: 1, time: st.rtt + 20 + N * 2, bytes: AF_HDR + N * (250 + 1500 + 1000 + 3000), db: 3 };
    const gqlDb = st.dl === `on` ? 3 : 1 + 2 * N;
    const gql = { calls: 1, rounds: 1, time: st.rtt + 15 + (st.dl === `on` ? 6 : 2 * N * 1.5), bytes: AF_HDR + 400 + N * AF_NEED, db: gqlDb };
    [rest, agg, gql].forEach(p => { p.useful = (N * AF_NEED) / p.bytes; });
    return { rest, agg, gql };
  }
  D.apiFetch = {
    title: `Under-fetching vs over-fetching: one screen, three APIs`,
    blurb: `A screen lists <strong>N users</strong>, each with a few profile fields and the names of their groups. With fine-grained <strong>REST</strong> the client fetches the list, then a profile and a group list per user. A <strong>kitchen-sink endpoint</strong> returns everything in one call, including fields the screen never shows. <strong>GraphQL</strong> asks for exactly the fields needed, in one call, but its per-field resolvers can hammer the database unless they batch.`,
    mount(el) {
      const st = { users: 20, rtt: 60, par: `six`, dl: `off` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`users on screen`, rng(`users`, 5, 50, 5, st.users))}${ctl(`client round-trip time`, rng(`rtt`, 10, 300, 10, st.rtt))}</div>
        <div class="ctl-row">${ctl(`REST calls in parallel`, seg(`par`, [[`seq`, `one at a time`], [`six`, `6 at a time (HTTP/1.1)`], [`all`, `all at once (HTTP/2)`]], st.par))}${ctl(`GraphQL resolver batching`, seg(`dl`, [[`off`, `off (N+1 queries)`], [`on`, `on (DataLoader)`]], st.dl))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Time until the screen can render</h4><div data-k="time"></div><h4 style="margin-top:12px">Bytes downloaded</h4><div data-k="bytes"></div></div>
          <div class="lab-panel"><h4>Details</h4><div data-k="tbl"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const LBL = { rest: `REST, fine-grained`, agg: `kitchen-sink endpoint`, gql: `GraphQL` };
      const draw = () => {
        const P = afPlan(st), keys = [`rest`, `agg`, `gql`];
        const tMax = Math.max(...keys.map(k => P[k].time)), bMax = Math.max(...keys.map(k => P[k].bytes));
        const best = keys.reduce((a, k) => P[k].time < P[a].time ? k : a, `rest`);
        q(`time`).innerHTML = hbars(keys.map(k => ({ label: LBL[k], value: P[k].time, max: tMax, text: ms(P[k].time), cls: k === best ? `good` : `` })), tMax);
        q(`bytes`).innerHTML = hbars(keys.map(k => ({ label: LBL[k], value: P[k].bytes, max: bMax, text: fmtBytes(P[k].bytes), cls: P[k].useful < 0.3 ? `warn` : `alt` })), bMax);
        const SH = { rest: `REST`, agg: `kitchen sink`, gql: `GraphQL` };
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th></th>${keys.map(k => `<th class="num">${SH[k]}</th>`).join(``)}</tr>
          <tr><td>HTTP calls</td>${keys.map(k => `<td class="num">${P[k].calls}</td>`).join(``)}</tr>
          <tr><td>sequential round trips</td>${keys.map(k => `<td class="num">${P[k].rounds}</td>`).join(``)}</tr>
          <tr><td>useful share of bytes</td>${keys.map(k => `<td class="num">${pct(P[k].useful)}</td>`).join(``)}</tr>
          <tr><td>database queries</td>${keys.map(k => `<td class="num">${P[k].db}</td>`).join(``)}</tr>
        </table></div><div class="cs-note">Assumes ~500 B of headers per call, 650 B of fields actually shown per user, and ~3 KB of extra data per user in the kitchen-sink response.</div>`;
        let n = `Fine-grained REST needs ${P.rest.calls} calls in ${P.rest.rounds} sequential round trips: classic <strong>under-fetching</strong>. The kitchen-sink endpoint is one round trip but only ${pct(P.agg.useful)} of what it sends is used: <strong>over-fetching</strong>. GraphQL gets one round trip and almost no waste.`;
        n += st.dl === `on` ? ` With batching its resolvers make just ${P.gql.db} database queries.` : ` But without batching its resolvers issue ${P.gql.db} database queries for one request (the N+1 problem): the work moved from the client to your servers.`;
        if (st.par === `all`) n += ` HTTP/2 lets REST fire every call at once, which shrinks its round trips to ${P.rest.rounds}, but the server still handles ${P.rest.calls} requests.`;
        q(`note`).innerHTML = note(n);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { users: v => v, rtt: v => v + ` ms` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch3 - JSON vs Protocol Buffers: a real encoder
  // =====================================================================
  const utf8 = s => new TextEncoder().encode(s);
  function pbVarint(n) { const out = []; n = Math.max(0, Math.floor(n)); while (n >= 128) { out.push((n % 128) | 128); n = Math.floor(n / 128); } out.push(n); return out; }
  function pbEncode(u) {
    const fields = [];
    const key = (f, wt) => pbVarint(f * 8 + wt);
    const str = (f, name, v) => { if (!v) return; const b = Array.from(utf8(v)); fields.push({ name, bytes: key(f, 2).concat(pbVarint(b.length), b), keyLen: key(f, 2).length }); };
    const int = (f, name, v) => { if (!v) return; fields.push({ name, bytes: key(f, 0).concat(pbVarint(v)), keyLen: key(f, 0).length }); };
    int(1, `id`, u.id); str(2, `name`, u.name); str(3, `email`, u.email); int(4, `age`, u.age);
    if (u.active) fields.push({ name: `active`, bytes: key(5, 0).concat([1]), keyLen: 1 });
    u.tags.forEach((t, i) => str(16, `tags[${i}]`, t));
    return fields;
  }
  D.protobufSize = {
    title: `JSON vs Protocol Buffers: encode a message yourself`,
    blurb: `gRPC messages are Protocol Buffers: each field is sent as a small numeric <strong>tag</strong> (field number and wire type) followed by a compact value, instead of repeating the field name as text. Edit the record and compare the real encodings byte for byte. The schema is <code>message User { int64 id = 1; string name = 2; string email = 3; int32 age = 4; bool active = 5; repeated string tags = 16; }</code>.`,
    mount(el) {
      const st = { rate: 4 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`id`, `<input class="lab-input" data-f="id" value="48213" style="min-width:90px;flex:0 1 110px">`)}${ctl(`name`, `<input class="lab-input" data-f="name" value="Priya Raman" style="min-width:120px">`)}${ctl(`email`, `<input class="lab-input" data-f="email" value="priya@example.com" style="min-width:160px">`)}</div>
        <div class="ctl-row">${ctl(`age`, `<input class="lab-input" data-f="age" value="34" style="min-width:60px;flex:0 1 70px">`)}${ctl(`tags (comma separated)`, `<input class="lab-input" data-f="tags" value="admin,beta" style="min-width:140px">`)}${ctl(`active`, `<input type="checkbox" data-f="active" checked>`)}${ctl(`messages per second`, rng(`rate`, 2, 6, 1, st.rate))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Protocol Buffers bytes</h4><div data-k="pb"></div><div data-k="pblegend" class="legend"></div></div>
          <div class="lab-panel"><h4>JSON text</h4><div data-k="json"></div></div>
        </div>
        <div class="stat-row" data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const val = f => el.querySelector(`[data-f="${f}"]`);
      const draw = () => {
        const toInt = v => { const n = parseInt(String(v).replace(/[^0-9]/g, ``), 10); return isFinite(n) ? Math.min(n, 9007199254740991) : 0; };
        const u = { id: toInt(val(`id`).value), name: val(`name`).value, email: val(`email`).value, age: Math.min(toInt(val(`age`).value), 2147483647), active: val(`active`).checked, tags: val(`tags`).value.split(`,`).map(s => s.trim()).filter(Boolean) };
        const F = pbEncode(u);
        const pbLen = sum(F.map(f => f.bytes.length));
        const json = JSON.stringify(u), jsonLen = utf8(json).length;
        const hex = b => b.toString(16).toUpperCase().padStart(2, `0`);
        q(`pb`).innerHTML = F.length ? `<div class="toks">${F.map((f, i) => f.bytes.map((b, j) => `<span class="tok c${i % 6}" style="${j < f.keyLen ? `font-weight:700;text-decoration:underline` : ``}" title="${esc(f.name)}">${hex(b)}</span>`).join(``)).join(``)}</div>` : `<div class="cs-note">Every field is at its default value, so nothing is sent at all.</div>`;
        q(`pblegend`).innerHTML = F.map((f, i) => `<span><i class="sw tok c${i % 6}" style="padding:0"></i>${esc(f.name)} (${f.bytes.length} B)</span>`).join(``) + (F.length ? `<span>underlined = tag</span>` : ``);
        q(`json`).innerHTML = `<div class="toks"><span class="tok" style="white-space:pre-wrap;word-break:break-all">${esc(json)}</span></div>`;
        const rate = Math.pow(10, st.rate);
        q(`stats`).innerHTML = stat(`JSON bytes`, jsonLen) + stat(`protobuf bytes`, pbLen, `good`) + stat(`protobuf / JSON`, jsonLen ? pct(pbLen / jsonLen) : `-`) + stat(`JSON bandwidth at ${fmtNum(rate)} msg/s`, fmtBytes(jsonLen * rate) + `/s`) + stat(`protobuf bandwidth`, fmtBytes(pbLen * rate) + `/s`, `good`);
        const tagNote = u.tags.length ? ` Each tag costs a 2-byte key because field number 16 doesn't fit in one byte; fields 1-15 get 1-byte keys, so give them to frequent fields.` : ``;
        q(`note`).innerHTML = note(`JSON repeats every field name in every message and writes numbers as text; protobuf replaces names with field numbers agreed in the schema and writes integers as varints (7 bits per byte). Fields at their default value (0, empty string, false) aren't sent at all.${tagNote} Strings cost about the same in both, so the saving is biggest for numeric, many-field messages.`);
      };
      el.querySelectorAll(`[data-f]`).forEach(i => i.addEventListener(i.type === `checkbox` ? `change` : `input`, draw));
      wireRanges(el, st, { rate: v => fmtNum(Math.pow(10, v)) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch4 - Polling vs long polling vs SSE vs WebSockets
  // =====================================================================
  const RT_HOLD = 30, RT_SSE_LIFE = 300, RT_WS_LIFE = 3600, RT_HDR = 700, RT_CONN_KB = 10;
  function rtModel(st) {
    const C = Math.round(Math.pow(10, st.c)), lam = st.ev / 60, up = st.up / 60, rttS = st.rtt / 1000;
    const pushRate = C * lam;
    const poll = { req: C / st.poll + C * up, lat: st.poll * 500 + st.rtt / 2, conns: 0, empty: Math.exp(-lam * st.poll), upPath: `separate POST`, dir: `pull` };
    const cycle = lam > 0 ? (1 - Math.exp(-lam * RT_HOLD)) / lam + rttS : RT_HOLD + rttS;
    const lp = { req: C / cycle + C * up, lat: st.rtt / 2 + lam * rttS * st.rtt / 2, conns: C, empty: Math.exp(-lam * RT_HOLD), upPath: `separate POST`, dir: `server push` };
    const sse = { req: C / RT_SSE_LIFE + C * up, lat: st.rtt / 2, conns: C, empty: 0, upPath: `separate POST`, dir: `server to client` };
    const ws = { req: C / RT_WS_LIFE, lat: st.rtt / 2, conns: C, empty: 0, upPath: `same socket`, dir: `both ways`, frames: C * up + pushRate };
    return { C, pushRate, poll, lp, sse, ws };
  }
  D.realtimeCompare = {
    title: `Real-time push: what each technique costs the server`,
    blurb: `<strong>C</strong> clients each receive server events at some rate and may send messages back. Compare the HTTP requests per second the server must handle, how stale updates are, and how many connections it must hold open. The model assumes long polls are held up to ${RT_HOLD} s, SSE streams are cut and resumed every ${RT_SSE_LIFE / 60} min by proxies, WebSockets reconnect hourly, and an idle open connection costs ~${RT_CONN_KB} KB of server memory.`,
    mount(el) {
      const st = { c: 5, ev: 6, up: 0, poll: 10, rtt: 80 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`connected clients`, rng(`c`, 3, 6, 0.5, st.c))}${ctl(`poll interval`, rng(`poll`, 1, 60, 1, st.poll))}${ctl(`round-trip time`, rng(`rtt`, 20, 300, 10, st.rtt))}</div>
        <div class="ctl-row">${ctl(`server events per client`, seg(`ev`, [[0.2, `1 per 5 min`], [1, `1 / min`], [6, `6 / min`], [60, `1 / s`]], st.ev))}${ctl(`client messages`, seg(`up`, [[0, `none`], [1, `1 / min`], [10, `10 / min`], [60, `1 / s`]], st.up))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>HTTP requests per second at the server</h4><div data-k="req"></div></div>
          <div class="lab-panel"><h4>Average staleness of an update</h4><div data-k="lat"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>Details</h4><div data-k="tbl"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const LBL = { poll: `polling`, lp: `long polling`, sse: `SSE`, ws: `WebSockets` };
      const draw = () => {
        const M = rtModel(st), keys = [`poll`, `lp`, `sse`, `ws`];
        let rec = `poll`;
        if (st.up >= 10) rec = `ws`;
        else if (st.ev >= 1 || st.poll * 500 > 5000) rec = st.up >= 1 && st.ev >= 6 ? `ws` : `sse`;
        const lg = v => Math.log10(1 + v);
        const rMax = Math.max(...keys.map(k => lg(M[k].req)));
        q(`req`).innerHTML = hbars(keys.map(k => ({ label: LBL[k], value: lg(M[k].req), max: rMax, text: fmtNum(M[k].req), cls: k === rec ? `good` : `` })), rMax);
        const lMax = Math.max(...keys.map(k => M[k].lat));
        q(`lat`).innerHTML = hbars(keys.map(k => ({ label: LBL[k], value: M[k].lat, max: lMax, text: ms(M[k].lat), cls: k === rec ? `good` : `alt` })), lMax);
        q(`tbl`).innerHTML = `<div class="scroll-x"><table class="mini-table"><tr><th></th>${keys.map(k => `<th class="num">${LBL[k]}</th>`).join(``)}</tr>
          <tr><td>open connections</td>${keys.map(k => `<td class="num">${M[k].conns ? fmtNum(M[k].conns) : `-`}</td>`).join(``)}</tr>
          <tr><td>memory for them</td>${keys.map(k => `<td class="num">${M[k].conns ? fmtBytes(M[k].conns * RT_CONN_KB * 1000) : `-`}</td>`).join(``)}</tr>
          <tr><td>empty responses</td>${keys.map(k => `<td class="num">${k === `poll` || k === `lp` ? pct(M[k].empty) : `-`}</td>`).join(``)}</tr>
          <tr><td>header bytes / s</td>${keys.map(k => `<td class="num">${fmtBytes(M[k].req * RT_HDR)}</td>`).join(``)}</tr>
          <tr><td>client to server</td>${keys.map(k => `<td class="num">${M[k].upPath}</td>`).join(``)}</tr>
          <tr><td>load balancer</td>${keys.map(k => `<td class="num">${k === `ws` ? `L4 / WS-aware` : `any L7`}</td>`).join(``)}</tr>
        </table></div><div class="cs-note">Events delivered to clients: ${fmtNum(M.pushRate)} per second in every case. Bars for requests use a log scale.</div>`;
        const N = {
          poll: `Updates are rare enough that plain polling is fine: ${pct(M.poll.empty)} of polls come back empty, but there's no connection state to manage and any load balancer works. Lengthen the interval if the request rate is too high.`,
          sse: `Events flow mostly from server to client, so <strong>SSE</strong> fits: updates arrive within about half a round trip over one long-lived HTTP response per client, and the few client messages go out as normal POSTs. Polling at ${st.poll} s would send ${fmtNum(M.poll.req)} requests per second and still deliver updates ${ms(M.poll.lat)} late on average.`,
          ws: `Clients send frequent messages as well as receiving them, so <strong>WebSockets</strong> fit: both directions share one socket, avoiding ${fmtNum(st.up * M.C / 60)} extra HTTP requests per second that SSE or polling would need for client messages. The price is ${fmtNum(M.C)} stateful connections that need connection-aware load balancing and careful deploys.`
        };
        q(`note`).innerHTML = note(N[rec], `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { c: v => fmtNum(Math.round(Math.pow(10, v))), poll: v => v + ` s`, rtt: v => v + ` ms` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch5 - Load balancer simulator
  // =====================================================================
  const LB_ALGOS = { rr: `round robin`, random: `random`, least: `least connections`, fastest: `least response time`, iphash: `IP hash` };
  const LB_TICK = 50, LB_DUR = 30000, LB_EVENT = 15000, LB_HC = 2000, LB_CLIENTS = 300;
  const lbHash = id => Math.imul(id + 1, 2654435761) >>> 0;
  function lbSim(st) {
    const r = mulberry32(1234 + st.n * 7 + Object.keys(LB_ALGOS).indexOf(st.algo) * 31 + (st.wl === `long` ? 3 : st.wl === `uneven` ? 5 : 0) + (st.ev === `fail` ? 11 : st.ev === `add` ? 13 : 0));
    const mk = i => ({ id: i, alive: true, inRot: true, active: [], handled: 0, lat: [], ewma: 40, slow: st.wl === `uneven` && i === 0 ? 3 : 1, dropped: 0 });
    const S = Array.from({ length: st.n }, (_, i) => mk(i));
    let rrIdx = 0, errors = 0, failedAt = -1;
    const series = [];
    const remapBefore = {};
    const rot = () => S.filter(s => s.inRot);
    const pick = (list, client) => {
      if (st.algo === `rr`) return list[rrIdx++ % list.length];
      if (st.algo === `random`) return list[Math.floor(r() * list.length)];
      if (st.algo === `iphash`) return list[lbHash(client) % list.length];
      const score = st.algo === `least` ? s => s.active.length + r() * 0.01 : s => s.ewma * (s.active.length + 1) + r() * 0.01;
      return list.reduce((a, s) => score(s) < score(a) ? s : a, list[0]);
    };
    const longMode = st.wl === `long`;
    const perTick = longMode ? 1 : 10;
    for (let t = 0; t < LB_DUR; t += LB_TICK) {
      if (t === LB_EVENT) {
        const before = rot();
        for (let c = 0; c < LB_CLIENTS; c++) remapBefore[c] = before[lbHash(c) % before.length].id;
        if (st.ev === `fail`) { const v = S[1]; v.alive = false; v.dropped = v.active.length; v.active = []; failedAt = t; if (st.hc === `off`) v.inRot = true; }
        if (st.ev === `add`) S.push(mk(S.length));
      }
      if (failedAt >= 0 && st.hc === `on` && t >= failedAt + LB_HC) S.forEach(s => { if (!s.alive) s.inRot = false; });
      S.forEach(s => { if (s.active.length) s.active = s.active.filter(e => e > t); });
      const arrivals = longMode ? (r() < 0.6 ? 1 : 0) + (r() < 0.4 ? 1 : 0) : perTick + (r() < 0.5 ? 1 : 0) - (r() < 0.5 ? 1 : 0);
      for (let a = 0; a < arrivals; a++) {
        const list = rot();
        const client = Math.floor(r() * LB_CLIENTS);
        const s = pick(list, client);
        if (!s.alive) { errors++; continue; }
        s.handled++;
        if (longMode) s.active.push(t - Math.log(1 - r()) * 120000);
        else {
          const lat = 40 * s.slow * (1 + s.active.length / 6) * (0.6 + r() * 0.8);
          s.lat.push(lat); s.ewma = s.ewma * 0.8 + lat * 0.2; s.active.push(t + lat);
        }
      }
      if (t % 500 === 0) series.push({ t, v: S.map(s => longMode ? s.active.length : s.active.length) });
    }
    let remapped = 0;
    if (st.ev !== `none`) { const after = rot(); for (let c = 0; c < LB_CLIENTS; c++) if (after[lbHash(c) % after.length].id !== remapBefore[c]) remapped++; }
    return { S, errors, series, remapped };
  }
  D.loadBalancer = {
    title: `Load balancer simulator: algorithms, failures and scale-out`,
    blurb: `Requests arrive at a dedicated load balancer in front of a few servers for 30 seconds. Choose the algorithm and the workload: short stateless requests, long-lived connections (like WebSockets), or short requests on a fleet where one server is three times slower. Halfway through, a server can crash or a new one can be added; health checks remove dead servers after ${LB_HC / 1000} s.`,
    mount(el) {
      const st = { algo: `rr`, wl: `short`, ev: `none`, hc: `on`, n: 4 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`algorithm`, seg(`algo`, Object.keys(LB_ALGOS).map(k => [k, LB_ALGOS[k]]), st.algo))}</div>
        <div class="ctl-row">${ctl(`workload`, seg(`wl`, [[`short`, `short requests`], [`long`, `long-lived connections`], [`uneven`, `one slow server`]], st.wl))}${ctl(`servers`, seg(`n`, [[3, `3`], [4, `4`], [5, `5`]], st.n))}</div>
        <div class="ctl-row">${ctl(`at 15 s`, seg(`ev`, [[`none`, `nothing`], [`fail`, `server 2 crashes`], [`add`, `add a server`]], st.ev))}${ctl(`health checks`, seg(`hc`, [[`on`, `on`], [`off`, `off`]], st.hc))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4 data-k="ctitle"></h4><div data-k="chart"></div><div class="legend" data-k="legend"></div></div>
          <div class="lab-panel"><h4>Per server</h4><div data-k="bars"></div><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = lbSim(st), longMode = st.wl === `long`;
        const nS = R.S.length;
        const yMax = Math.max(4, ...R.series.map(p => Math.max(...p.v.filter(v => v != null))));
        const a = axes({ x0: 40, x1: 500, y0: 190, y1: 12, dx0: 0, dx1: LB_DUR, dy0: 0, dy1: yMax * 1.1, xTicks: [0, 5000, 10000, 15000, 20000, 25000, 30000], yTicks: [0, Math.round(yMax / 2), Math.round(yMax)], xFmt: v => v / 1000 + `s`, yLabel: `open` });
        let s = a.svg;
        if (st.ev !== `none`) s += `<line x1="${a.X(LB_EVENT)}" x2="${a.X(LB_EVENT)}" y1="12" y2="190" style="stroke:var(--bad);stroke-dasharray:4 3"/><text class="svg-label" x="${a.X(LB_EVENT) + 4}" y="22">${st.ev === `fail` ? `server 2 crashes` : `server ${nS} added`}</text>`;
        for (let i = 0; i < nS; i++) {
          const pts = R.series.filter(p => p.v[i] != null).map(p => [a.X(p.t), a.Y(p.v[i])]);
          if (pts.length > 1) s += `<path d="${path(pts)}" style="fill:none;stroke:${PAL[i % 6]};stroke-width:2"/>`;
        }
        q(`ctitle`).textContent = longMode ? `Open connections per server over time` : `In-flight requests per server over time`;
        q(`chart`).innerHTML = svgWrap(520, 215, s);
        q(`legend`).innerHTML = R.S.map((sv, i) => `<span><i class="sw line" style="background:${PAL[i % 6]}"></i>server ${i + 1}${sv.slow > 1 ? ` (slow)` : ``}${!sv.alive ? ` (down)` : ``}</span>`).join(``);
        const metric = sv => longMode ? sv.active.length : sv.handled;
        const mx = Math.max(1, ...R.S.map(metric));
        q(`bars`).innerHTML = hbars(R.S.map((sv, i) => ({ label: `server ${i + 1}`, value: metric(sv), max: mx, text: longMode ? `${sv.active.length} open` : `${sv.handled} req`, cls: !sv.alive ? `bad` : sv.slow > 1 ? `warn` : `` })), mx);
        const lats = [].concat(...R.S.map(sv => sv.lat));
        const live = R.S.filter(sv => sv.alive), mean = sum(live.map(metric)) / Math.max(1, live.length);
        const imb = mean ? Math.max(...live.map(metric)) / mean : 1;
        q(`stats`).innerHTML = (longMode ? `` : stat(`p95 latency`, ms(pctl(lats, 0.95)), pctl(lats, 0.95) > 120 ? `bad` : ``)) + stat(`busiest / average`, round(imb, 2) + `x`, imb > 1.5 ? `bad` : ``) + stat(`failed requests`, R.errors, R.errors ? `bad` : `good`) + (st.ev === `fail` ? stat(`connections cut by crash`, R.S[1].dropped) : ``) + (st.algo === `iphash` && st.ev !== `none` ? stat(`clients moved to another server`, pct(R.remapped / LB_CLIENTS), `bad`) : ``);
        let n;
        if (st.ev === `fail` && st.hc === `off`) n = `Without health checks the balancer keeps sending traffic to the dead server: ${R.errors} requests failed. Health checks are what turn a crash into a brief blip.`;
        else if (st.ev === `fail`) n = `Server 2 crashed at 15 s. Requests sent to it before the next health check failed (${R.errors}), then the balancer took it out of rotation and the others absorbed its share.${longMode ? ` Its ${R.S[1].dropped} open connections were cut; those clients must reconnect.` : ``}${!longMode && (st.algo === `least` || st.algo === `fastest`) ? ` ${st.algo === `least` ? `Least connections` : `Least response time`} made it worse: a dead server that instantly fails requests holds no open connections, so it looks like the least loaded and attracts extra traffic until it is removed.` : ``}`;
        else if (longMode && st.ev === `add` && st.algo === `least`) n = `Least connections sent new connections to the new server until it caught up, so all servers now hold about the same number. Round robin would give it only its 1-in-N share of new connections and leave it far emptier.`;
        else if (st.wl === `uneven` && (st.algo === `least` || st.algo === `fastest`)) n = `${LB_ALGOS[st.algo][0].toUpperCase() + LB_ALGOS[st.algo].slice(1)} notices that the slow server finishes requests later and sends it fewer: it handled ${R.S[0].handled} requests versus about ${Math.round(sum(R.S.slice(1).map(sv => sv.handled)) / (R.S.length - 1))} on each fast server, keeping p95 latency at ${ms(pctl(lats, 0.95))}. Round robin would give it an equal share and let its queue grow.`;
        else if (longMode && st.ev === `add` && (st.algo === `rr` || st.algo === `random` || st.algo === `iphash`)) n = `The new server only receives its share of <em>new</em> connections, while the old servers keep all the connections they accumulated, so it stays far emptier for a long time. Least connections sends new connections to it until it catches up. Use least connections for WebSockets and SSE.`;
        else if (st.wl === `uneven` && (st.algo === `rr` || st.algo === `random`)) n = `Round robin and random give the slow server the same share as the fast ones, so its requests queue up and drag the p95 latency up. Least connections and least response time notice it is slower and send it less.`;
        else if (st.algo === `iphash`) n = `IP hash pins each client to one server, which helps with server-local caches or sessions.${st.ev !== `none` ? ` But changing the number of servers remapped ${pct(R.remapped / LB_CLIENTS)} of clients at once; consistent hashing would move only about 1/N of them.` : ` Try adding a server to see the reshuffle when N changes.`}`;
        else n = longMode ? `With long-lived connections, what matters is how many each server holds. Watch how the counts stay balanced or drift as connections open and close.` : `For short, stateless requests on identical servers, every algorithm spreads load well; round robin or random is the simple default.`;
        q(`note`).innerHTML = note(n, R.errors || imb > 1.5 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch6 - Distance, the speed of light and CDNs
  // =====================================================================
  const CITIES = {
    nyc: [`New York`, 40.71, -74.01], sfo: [`San Francisco`, 37.77, -122.42], lon: [`London`, 51.51, -0.13], fra: [`Frankfurt`, 50.11, 8.68],
    bom: [`Mumbai`, 19.08, 72.88], sin: [`Singapore`, 1.35, 103.82], tyo: [`Tokyo`, 35.68, 139.69], syd: [`Sydney`, -33.87, 151.21],
    gru: [`São Paulo`, -23.55, -46.63], jnb: [`Johannesburg`, -26.2, 28.05]
  };
  const CITY_LBL = { lon: [-6, -3, `end`], fra: [6, 10, `start`], sfo: [-6, 3, `end`] };
  const REGIONS = [`nyc`, `fra`, `sin`];
  function gcKm(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const [, la1, lo1] = CITIES[a], [, la2, lo2] = CITIES[b];
    const dLa = rad(la2 - la1), dLo = rad(lo2 - lo1);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  D.latencyMap = {
    title: `Distance is latency: speed of light, CDNs and regions`,
    blurb: `Signals in fiber travel about <strong>200 km per millisecond</strong>, and real cable routes are longer than the great-circle path. Pick where the user is and where the origin server is, and see the round-trip floor, a realistic estimate, and what a page that needs several round trips costs with and without a CDN edge or a regional deployment.`,
    mount(el) {
      const st = { user: `syd`, origin: `nyc`, route: 1.5, rts: 5, hit: 80 };
      const opts = cur => Object.keys(CITIES).map(k => `<option value="${k}" ${k === cur ? `selected` : ``}>${CITIES[k][0]}</option>`).join(``);
      el.innerHTML = `
        <div class="ctl-row">${ctl(`user in`, `<select class="lab-select" data-s="user">${opts(st.user)}</select>`)}${ctl(`origin server in`, `<select class="lab-select" data-s="origin">${opts(st.origin)}</select>`)}${ctl(`route vs straight line`, rng(`route`, 1, 2.5, 0.1, st.route))}</div>
        <div class="ctl-row">${ctl(`round trips per page`, rng(`rts`, 1, 12, 1, st.rts))}${ctl(`CDN cache hit ratio`, rng(`hit`, 0, 100, 5, st.hit))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Path</h4><div data-k="map"></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div><h4 style="margin-top:10px">Page load (network only)</h4><div data-k="cmp"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4 data-k="ttitle"></h4><div data-k="all"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const rttOf = (a, b) => a === b ? 2 : gcKm(a, b) / 100 * st.route + 2;
      const draw = () => {
        const d = gcKm(st.user, st.origin), floor = st.user === st.origin ? 0 : d / 100, rtt = rttOf(st.user, st.origin);
        const W = 520, H = 250, X = lo => (lo + 180) / 360 * W, Y = la => (90 - la) / 180 * H;
        let s = `<rect x="0" y="0" width="${W}" height="${H}" rx="6" style="fill:var(--bg-3);opacity:.5"/>`;
        for (let lo = -150; lo <= 150; lo += 30) s += `<line class="svg-grid" x1="${X(lo)}" x2="${X(lo)}" y1="0" y2="${H}"/>`;
        for (let la = -60; la <= 60; la += 30) s += `<line class="svg-grid" x1="0" x2="${W}" y1="${Y(la)}" y2="${Y(la)}"/>`;
        const [, la1, lo1] = CITIES[st.user], [, la2, lo2] = CITIES[st.origin];
        const seg2 = (xa, ya, xb, yb) => `<line x1="${X(xa)}" y1="${Y(ya)}" x2="${X(xb)}" y2="${Y(yb)}" style="stroke:var(--accent-3);stroke-width:2;stroke-dasharray:6 4"/>`;
        if (Math.abs(lo1 - lo2) <= 180) s += seg2(lo1, la1, lo2, la2);
        else {
          const w = lo1 < lo2 ? -1 : 1, lo2w = lo2 + w * 360;
          const mid = la1 + (la2 - la1) * ((w * 180 - lo1) / (lo2w - lo1));
          s += seg2(lo1, la1, w * 180, mid) + seg2(-w * 180, mid, lo2, la2);
        }
        Object.keys(CITIES).forEach(k => {
          const [nm, la, lo] = CITIES[k], on = k === st.user || k === st.origin;
          s += `<circle cx="${X(lo)}" cy="${Y(la)}" r="${on ? 5 : 3}" style="fill:${k === st.user ? `var(--accent)` : k === st.origin ? `var(--accent-3)` : `var(--text-muted)`}"/>`;
          const [dx, dy, anc] = CITY_LBL[k] || [6, 3, `start`];
          s += `<text class="svg-label" x="${X(lo) + dx}" y="${Y(la) + dy}" text-anchor="${anc}" style="${on ? `fill:var(--text);font-weight:600` : ``}">${nm}</text>`;
        });
        q(`map`).innerHTML = svgWrap(W, H, s);
        const edge = 4;
        const direct = st.rts * rtt;
        const cdn = (st.hit / 100) * st.rts * edge + (1 - st.hit / 100) * (st.rts * edge + rtt);
        const region = REGIONS.reduce((b, k) => rttOf(st.user, k) < rttOf(st.user, b) ? k : b, REGIONS[0]);
        const regional = st.rts * rttOf(st.user, region);
        q(`stats`).innerHTML = stat(`great-circle distance`, fmtNum(Math.round(d), 1) + ` km`) + stat(`round-trip floor (physics)`, ms(floor)) + stat(`realistic round trip`, ms(rtt), rtt > 150 ? `bad` : ``);
        const rows = [{ label: `direct to origin`, value: direct, cls: `warn` }, { label: `via CDN edge`, value: cdn, cls: `good` }, { label: `${CITIES[region][0]} region`, value: regional, cls: `alt` }];
        const mx = Math.max(...rows.map(r => r.value));
        q(`cmp`).innerHTML = hbars(rows.map(r => Object.assign(r, { text: ms(r.value) })), mx);
        q(`ttitle`).textContent = `Realistic round trip from ${CITIES[st.user][0]} to each city`;
        const others = Object.keys(CITIES).filter(k => k !== st.user).map(k => ({ k, v: rttOf(st.user, k) })).sort((a, b) => a.v - b.v);
        const om = Math.max(...others.map(o => o.v));
        q(`all`).innerHTML = hbars(others.map(o => ({ label: CITIES[o.k][0], value: o.v, max: om, text: ms(o.v), cls: o.k === st.origin ? `warn` : o.v < 40 ? `good` : `` })), om);
        q(`note`).innerHTML = note(st.user === st.origin ? `User and server are in the same city: round trips cost a couple of milliseconds, so server time dominates.` : `${CITIES[st.user][0]} to ${CITIES[st.origin][0]} is about ${fmtNum(Math.round(d), 1)} km, so even a perfect straight fiber needs ${ms(floor)} per round trip; real routes push it to about ${ms(rtt)}. A page needing ${st.rts} round trips spends ${ms(direct)} on the network alone. A CDN edge near the user answers cache hits in a few milliseconds (${st.hit}% hits gives ${ms(cdn)}), and dynamic data needs servers and data in a nearer region.`, rtt > 150 ? `warn` : ``);
      };
      el.querySelectorAll(`[data-s]`).forEach(sel => sel.addEventListener(`change`, () => { st[sel.dataset.s] = sel.value; draw(); }));
      wireRanges(el, st, { route: v => v + `x`, rts: v => v, hit: v => v + `%` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch6 - Retry storms: a reconnect thundering herd, backoff and jitter
  // =====================================================================
  const RS_N = 10000, RS_TICK = 100, RS_TICKS = 600, RS_START = 20;
  const RS_POL = { immediate: `immediate retry`, fixed: `fixed 1 s delay`, expo: `exponential backoff`, jitter: `exponential + jitter` };
  const rsGoodput = (offered, capT) => offered <= capT ? offered : Math.floor(capT * Math.pow(capT / offered, 0.3));
  function rsSim(st, policy) {
    const r = mulberry32(99 + st.outage * 7 + st.cap + (st.maxr === Infinity ? 0 : st.maxr) * 3);
    const buckets = Array.from({ length: RS_TICKS + 1 }, () => []);
    for (let c = 0; c < RS_N; c++) buckets[RS_START + 1].push(0);
    const capT = Math.round(st.cap / 10), outEnd = RS_START + st.outage * 10;
    const offered = [], ok = [], connected = [];
    let attempts = 0, gaveUp = 0, conn = RS_N, done99 = null;
    const delay = att => {
      if (policy === `immediate`) return 1;
      if (policy === `fixed`) return 10;
      const e = Math.min(100, 2 * Math.pow(2, att - 1));
      return policy === `expo` ? e : 1 + Math.floor(r() * e);
    };
    for (let t = 0; t < RS_TICKS; t++) {
      if (t === RS_START) conn = 0;
      const list = buckets[t];
      offered.push(list.length);
      attempts += list.length;
      const served = t < outEnd ? 0 : rsGoodput(list.length, capT);
      for (let i = 0; i < served; i++) { const k = i + Math.floor(r() * (list.length - i)); [list[i], list[k]] = [list[k], list[i]]; }
      conn += served;
      ok.push(served);
      for (let i = served; i < list.length; i++) {
        const att = list[i] + 1;
        if (att > st.maxr) { gaveUp++; continue; }
        const nt = t + delay(att);
        if (nt < buckets.length) buckets[nt].push(att);
      }
      connected.push(conn);
      if (done99 == null && t >= RS_START && conn >= RS_N * 0.99) done99 = t;
    }
    return { offered, ok, connected, capT, outEnd, attempts, gaveUp, conn, rec: done99 == null ? null : Math.max(0, done99 - outEnd) * RS_TICK, peak: Math.max(...offered.slice(outEnd)) / capT };
  }
  D.retryStorm = {
    title: `Retry storms: why backoff needs jitter`,
    blurb: `${fmtNum(RS_N)} clients hold connections to a service. At 2 s the service restarts, every connection drops at the same instant and the service stays down for a few seconds. All the clients now try to reconnect, and each reconnect costs the server a handshake it can only do so many of per second. When more arrive than it can handle, it wastes effort on attempts it ends up rejecting, so fewer succeed. How the clients retry decides how long the fleet takes to recover.`,
    mount(el) {
      const st = { policy: `expo`, maxr: Infinity, outage: 5, cap: 2000 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`retry policy`, seg(`policy`, Object.keys(RS_POL).map(k => [k, RS_POL[k]]), st.policy))}</div>
        <div class="ctl-row">${ctl(`max retries`, seg(`maxr`, [[5, `5`], [10, `10`], [`Infinity`, `unlimited`]], st.maxr))}${ctl(`outage length`, rng(`outage`, 1, 15, 1, st.outage))}${ctl(`handshakes / s the server can do`, rng(`cap`, 1000, 10000, 500, st.cap))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Reconnect attempts per second vs capacity</h4><div data-k="chart"></div>
            <div class="legend"><span><i class="sw line" style="background:var(--accent-3)"></i>attempts</span><span><i class="sw line" style="background:var(--accent)"></i>succeeded</span><span><i class="sw line" style="background:var(--text)"></i>capacity</span><span><i class="sw line" style="background:var(--good)"></i>clients connected (right scale)</span><span><i class="sw" style="background:var(--bad);opacity:.25"></i>outage</span></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div><h4 style="margin-top:10px">Time to reconnect 99% after the outage, by policy</h4><div data-k="cmp"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = rsSim(st, st.policy);
        const toRps = v => v * 10;
        const yMax = Math.max(st.cap * 1.3, ...R.offered.slice(R.outEnd).map(toRps).map(v => Math.min(v, st.cap * 6))) * 1.05;
        const a = axes({ x0: 46, x1: 490, y0: 190, y1: 12, dx0: 0, dx1: RS_TICKS, dy0: 0, dy1: yMax, xTicks: [0, 100, 200, 300, 400, 500, 600], yTicks: [0, Math.round(yMax / 2), Math.round(yMax)], xFmt: v => v / 10 + `s`, yFmt: v => fmtNum(v, 0) });
        const Yc = v => 190 - (v / RS_N) * 178;
        let s = `<rect x="${a.X(RS_START)}" y="12" width="${a.X(R.outEnd) - a.X(RS_START)}" height="178" style="fill:var(--bad);opacity:.15"/>` + a.svg;
        s += `<text class="svg-label" x="494" y="15">100%</text><text class="svg-label" x="494" y="193">0%</text>`;
        const clip = v => Math.min(toRps(v), yMax);
        s += `<path d="${path(R.offered.map((v, i) => [a.X(i), a.Y(clip(v))]))}" style="fill:none;stroke:var(--accent-3);stroke-width:1.4"/>`;
        s += `<path d="${path(R.ok.map((v, i) => [a.X(i), a.Y(clip(v))]))}" style="fill:none;stroke:var(--accent);stroke-width:1.6"/>`;
        s += `<path d="${path(R.connected.map((v, i) => [a.X(i), Yc(v)]))}" style="fill:none;stroke:var(--good);stroke-width:2;stroke-dasharray:2 2"/>`;
        s += `<line x1="46" x2="490" y1="${a.Y(st.cap)}" y2="${a.Y(st.cap)}" style="stroke:var(--text);stroke-dasharray:5 3"/>`;
        q(`chart`).innerHTML = svgWrap(520, 215, s);
        const left = RS_TICKS - R.outEnd;
        q(`stats`).innerHTML = stat(`peak attempts after outage`, round(R.peak, 1) + `x capacity`, R.peak > 2 ? `bad` : ``) + stat(`99% reconnected after`, R.rec == null ? `not within ${round(left / 10, 0)} s` : ms(R.rec), R.rec == null || R.rec > 15000 ? `bad` : `good`) + stat(`connection attempts`, fmtNum(R.attempts)) + stat(`clients that gave up`, fmtNum(R.gaveUp), R.gaveUp ? `bad` : ``);
        const res = Object.keys(RS_POL).map(p => ({ p, r: rsSim(st, p) }));
        const val = x => x.r.rec == null ? left * RS_TICK : x.r.rec;
        const mx = Math.max(1, ...res.map(val));
        q(`cmp`).innerHTML = hbars(res.map(x => ({ label: RS_POL[x.p], value: val(x), max: mx, text: x.r.rec == null ? `> ${round(left / 10, 0)} s` : ms(x.r.rec), cls: x.p === st.policy ? `alt` : `muted` })), mx);
        const ideal = RS_N / st.cap;
        const fastest = res.reduce((b, x) => val(x) < val(b) ? x : b, res[0]).p;
        const imm = res.find(x => x.p === `immediate`).r;
        const N = {
          immediate: R.conn === 0 && R.gaveUp ? `Every client burned through its ${st.maxr} retries within half a second, while the service was still down, so nobody was left trying when it came back. Immediate retries waste the whole retry budget on the outage itself.` : R.peak <= 1 ? `The server can handshake the whole herd almost at once, so retrying immediately is harmless here and recovers fastest. Lower the capacity to see the storm.` : `Every client that fails tries again on the next tick, so the server faces up to ${fmtNum(RS_N)} handshakes every 100 ms, ${round(R.peak, 0)}x its capacity. Much of its effort goes into attempts it rejects, so clients trickle back slower than the ideal ${round(ideal, 1)} s.`,
          fixed: `All clients disconnected at the same instant, so with a fixed delay they all retry at the same instant too: once a second the server gets the whole herd at once, serves a sliver of it and sits idle in between.`,
          expo: `Backoff without randomness keeps the herd together: every client that failed at the same moment waits exactly as long and retries at the same moment, so each wave overwhelms the server again and only a few clients get in per wave. The gaps between waves grow, so recovery drags on.`,
          jitter: fastest === `jitter` ? `Randomizing each delay spreads the herd over the whole backoff window, so attempts arrive as a steady stream near capacity instead of waves: the fleet is back in ${ms(R.rec)}, the fastest of the four policies (the ideal, with perfect scheduling, is ${round(ideal, 1)} s). This is why "retry with exponential backoff" should always come with "and jitter".` : `Jitter removes the waves, but here the server could have taken the whole herd at once (immediate retry recovers in ${imm.rec == null ? `-` : ms(imm.rec)}), so clients waiting out long backoffs while the server sits idle is the cost. Cap the maximum delay; backoff is insurance against overload, not free.`
        };
        q(`note`).innerHTML = note(N[st.policy] + (R.gaveUp && R.conn ? ` ${fmtNum(R.gaveUp)} clients ran out of retries and stayed disconnected; with a cap on retries, a storm turns into lost users.` : ``), st.policy === `jitter` && fastest === `jitter` ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { outage: v => v + ` s`, cap: v => fmtNum(v) + `/s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch6 - Circuit breaker during a dependency outage
  // =====================================================================
  const CB_TICK = 100, CB_TICKS = 600, CB_DOWN = 100, CB_UP = 250, CB_RATE = 2, CB_WIN = 20;
  function cbSim(st) {
    const out = [];
    let state = `closed`, openUntil = 0, win = [], trials = 0, trialFails = 0, trialOk = 0;
    let healthy = true, recoveredAt = st.fragile === `off` ? CB_UP : null, quietTicks = 0;
    const pending = [];
    let sentOutage = 0, fallback = 0, maxInFlight = 0, latSum = 0, latN = 0;
    const timeoutT = st.timeout * 10;
    for (let t = 0; t < CB_TICKS; t++) {
      const resolved = pending.filter(p => p.done <= t);
      for (let i = pending.length - 1; i >= 0; i--) if (pending[i].done <= t) pending.splice(i, 1);
      resolved.forEach(p => {
        win.push(p.ok); if (win.length > CB_WIN) win.shift();
        if (p.trial) { if (p.ok) trialOk++; else trialFails++; }
      });
      if (state === `half` && trialFails) { state = `open`; openUntil = t + st.cool * 10; trialFails = 0; trialOk = 0; }
      else if (state === `half` && trialOk >= 3) { state = `closed`; win = []; trialOk = 0; }
      if (state === `open` && t >= openUntil) { state = `half`; trials = 0; trialFails = 0; trialOk = 0; }
      if (st.cb === `on` && state === `closed` && win.length >= 10 && win.filter(x => !x).length / win.length >= st.thr / 100) { state = `open`; openUntil = t + st.cool * 10; }
      if (t < CB_DOWN) healthy = true;
      else if (t < CB_UP) healthy = false;
      else if (recoveredAt == null) {
        const loadLast = out.slice(-1)[0] ? out.slice(-1)[0].sent : 0;
        quietTicks = loadLast * 10 < 5 ? quietTicks + 1 : 0;
        if (quietTicks >= 20) recoveredAt = t;
        healthy = recoveredAt != null;
      } else healthy = true;
      let sent = 0;
      for (let k = 0; k < CB_RATE; k++) {
        let send = st.cb === `off` || state === `closed`;
        let trial = false;
        if (st.cb === `on` && state === `half` && trials < 3) { send = true; trial = true; trials++; }
        if (!send) { fallback++; latN++; continue; }
        sent++;
        if (!healthy) sentOutage++;
        const ok = healthy, done = ok ? t : t + timeoutT;
        pending.push({ ok, done, trial });
        latSum += ok ? 50 : st.timeout * 1000; latN++;
      }
      maxInFlight = Math.max(maxInFlight, pending.filter(p => !p.ok).length);
      out.push({ t, state: st.cb === `on` ? state : `none`, sent, healthy, inflight: pending.length });
    }
    return { out, sentOutage, fallback, maxInFlight, avgLat: latN ? latSum / latN : 0, recoveredAt };
  }
  D.circuitBreaker = {
    title: `Circuit breaker: fail fast and let a dependency recover`,
    blurb: `A service calls a dependency 20 times a second. At 10 s the dependency hangs (calls time out); from 25 s it can recover, but if <strong>fragile recovery</strong> is on it only comes back once it gets a couple of quiet seconds, like a database warming up under a flood of reconnects. Compare calling it blindly with wrapping it in a <strong>circuit breaker</strong> (closed, open, half-open).`,
    mount(el) {
      const st = { cb: `on`, thr: 50, cool: 5, timeout: 2, fragile: `on` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`circuit breaker`, seg(`cb`, [[`on`, `on`], [`off`, `off`]], st.cb))}${ctl(`fragile recovery`, seg(`fragile`, [[`on`, `on`], [`off`, `off`]], st.fragile))}</div>
        <div class="ctl-row">${ctl(`trip at failure rate`, rng(`thr`, 20, 90, 10, st.thr))}${ctl(`open cool-down`, rng(`cool`, 1, 15, 1, st.cool))}${ctl(`call timeout`, rng(`timeout`, 1, 5, 1, st.timeout))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Timeline</h4><div data-k="chart"></div>
            <div class="legend"><span><i class="sw" style="background:var(--good);opacity:.5"></i>closed</span><span><i class="sw" style="background:var(--bad);opacity:.5"></i>open</span><span><i class="sw" style="background:var(--warn);opacity:.6"></i>half-open</span><span><i class="sw line" style="background:var(--accent-3)"></i>calls/s reaching the dependency</span><span><i class="sw line" style="background:var(--accent-2)"></i>calls waiting (threads tied up)</span></div></div>
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const R = cbSim(st);
        const W = 520, yMax = Math.max(25, ...R.out.map(o => o.inflight)) * 1.1;
        const a = axes({ x0: 40, x1: 500, y0: 200, y1: 40, dx0: 0, dx1: CB_TICKS, dy0: 0, dy1: yMax, xTicks: [0, 100, 200, 300, 400, 500, 600], yTicks: [0, Math.round(yMax / 2), Math.round(yMax)], xFmt: v => v / 10 + `s` });
        let s = `<text class="svg-label" x="0" y="12">dependency</text><text class="svg-label" x="0" y="30">breaker</text>`;
        R.out.forEach((o, i) => {
          const x = a.X(i), w = a.X(i + 1) - x + 0.3;
          s += `<rect x="${x}" y="4" width="${w}" height="10" style="fill:${o.healthy ? `var(--good)` : `var(--bad)`};opacity:.5"/>`;
          if (o.state !== `none`) s += `<rect x="${x}" y="22" width="${w}" height="10" style="fill:${o.state === `closed` ? `var(--good)` : o.state === `open` ? `var(--bad)` : `var(--warn)`};opacity:${o.state === `half` ? .7 : .5}"/>`;
        });
        if (st.cb === `off`) s += `<text class="svg-label" x="${a.X(300)}" y="31" text-anchor="middle">no breaker: every call goes through</text>`;
        s += a.svg;
        const rate = R.out.map((o, i) => { const w = R.out.slice(Math.max(0, i - 9), i + 1); return sum(w.map(x => x.sent)) / w.length * 10; });
        s += `<path d="${path(rate.map((v, i) => [a.X(i), a.Y(v)]))}" style="fill:none;stroke:var(--accent-3);stroke-width:1.8"/>`;
        s += `<path d="${path(R.out.map((o, i) => [a.X(i), a.Y(o.inflight)]))}" style="fill:none;stroke:var(--accent-2);stroke-width:1.8"/>`;
        q(`chart`).innerHTML = svgWrap(W, 225, s);
        q(`stats`).innerHTML = stat(`calls sent into the outage`, fmtNum(R.sentOutage), R.sentOutage > 200 ? `bad` : `good`) + stat(`peak calls waiting`, R.maxInFlight, R.maxInFlight > 20 ? `bad` : ``) + stat(`average caller latency`, ms(R.avgLat)) + stat(`served by fallback`, fmtNum(R.fallback)) + stat(`dependency healthy again at`, R.recoveredAt == null ? `not within 60 s` : round(R.recoveredAt / 10, 1) + ` s`, R.recoveredAt == null ? `bad` : `good`);
        let n;
        if (st.cb === `off`) n = `Without a breaker every call during the outage waits the full ${st.timeout} s timeout, so up to ${R.maxInFlight} calls pile up holding threads and connections: the caller is effectively down too (a cascading failure).${st.fragile === `on` && R.recoveredAt == null ? ` Worse, the steady stream of calls never lets the fragile dependency recover.` : ``}`;
        else n = `After the failure rate crossed ${st.thr}%, the breaker opened: calls failed fast with a fallback instead of waiting ${st.timeout} s, and the dependency stopped receiving traffic. Every ${st.cool} s it went half-open and let 3 trial calls through; once they succeeded it closed again.${st.fragile === `on` ? ` The quiet periods are what let the fragile dependency recover.` : ``}`;
        q(`note`).innerHTML = note(n, st.cb === `off` ? `bad` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { thr: v => v + `%`, cool: v => v + ` s`, timeout: v => v + ` s` }, draw);
      draw();
    }
  };
})();
