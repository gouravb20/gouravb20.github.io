// Database Internals - interactive labs, part 2 (chapters 5-7). Depends on labkit.js.
(function () {
  "use strict";
  const K = window.LabKit;
  const { esc, clamp, sum, round, seg, wireSegs, rng, wireRanges, ctl, stat, note, hbars, svgWrap, fmtNum, fmtBytes, pct, mulberry32, axes, path } = K;
  const D = window.DEMOS;
  const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;
  const pblock = (cls, head, body) => `<div class="pblock ${cls}"><div class="pblock-h">${head}</div><pre>${esc(body)}</pre></div>`;
  const tok = (cls, txt) => `<span class="tok ${cls}">${esc(String(txt))}</span>`;
  const PALETTE = [`rgba(20,184,166,.38)`, `rgba(56,189,248,.38)`, `rgba(245,158,11,.38)`, `rgba(168,85,247,.38)`, `rgba(239,68,68,.32)`, `rgba(34,197,94,.38)`];

  // =====================================================================
  // Ch5 - Page cache eviction
  // =====================================================================
  const PC_PRESETS = {
    belady: { label: `Bélády string`, refs: `1 2 3 4 1 2 5 1 2 3 4 5`.split(` `), pin: `1` },
    btree: { label: `B-Tree lookups`, refs: [3, 1, 5, 2, 6, 1, 4, 3, 5, 2].flatMap(l => [`R`, l <= 3 ? `I1` : `I2`, `L` + l]), pin: `R` },
    scan: { label: `hot pages + one scan`, refs: `A B C A B C S1 S2 S3 S4 S5 S6 A B C A B C`.split(` `), pin: `A` }
  };
  const PC_POL = { fifo: `FIFO`, lru: `LRU`, clock: `CLOCK`, lfu: `LFU`, opt: `OPT (Bélády)` };
  function pcSim(refs, cap, pol, pin) {
    const slots = Array(cap).fill(null), loaded = Array(cap).fill(0), last = Array(cap).fill(0), freq = Array(cap).fill(0), bits = Array(cap).fill(0);
    let hand = 0, hits = 0;
    const steps = [];
    refs.forEach((p, t) => {
      let i = slots.indexOf(p), ev = null;
      const hit = i >= 0;
      if (hit) { hits++; last[i] = t; freq[i]++; bits[i] = 1; }
      else {
        i = slots.indexOf(null);
        if (i < 0) {
          const cand = slots.map((s, j) => j).filter(j => slots[j] !== pin);
          if (!cand.length) i = -1;
          else if (pol === `fifo`) i = cand.reduce((a, b) => loaded[b] < loaded[a] ? b : a);
          else if (pol === `lru`) i = cand.reduce((a, b) => last[b] < last[a] ? b : a);
          else if (pol === `lfu`) i = cand.reduce((a, b) => freq[b] < freq[a] || (freq[b] === freq[a] && last[b] < last[a]) ? b : a);
          else if (pol === `opt`) {
            const next = j => { const n = refs.indexOf(slots[j], t + 1); return n < 0 ? Infinity : n; };
            i = cand.reduce((a, b) => next(b) > next(a) ? b : a);
          } else {
            for (let g = 0; g < cap * 3; g++) {
              const s = hand; hand = (hand + 1) % cap;
              if (slots[s] === pin) continue;
              if (bits[s]) { bits[s] = 0; continue; }
              i = s; break;
            }
            if (i < 0) { i = cand[0]; }
          }
          if (i >= 0) ev = slots[i];
        }
        if (i >= 0) { slots[i] = p; loaded[i] = t; last[i] = t; freq[i] = 1; bits[i] = 1; }
      }
      steps.push({ p, hit, slot: i, ev, slots: slots.slice(), bits: bits.slice(), hand });
    });
    return { steps, hits, misses: refs.length - hits };
  }
  D.pageCache = {
    title: `Page cache: FIFO, LRU, CLOCK, LFU and optimal eviction`,
    blurb: `A buffer pool with a handful of frames replaying a page reference string. Compare the book's eviction policies (and Bélády's optimal OPT, which needs to know the future, as a yardstick). The <strong>B-Tree</strong> preset shows why FIFO is a poor fit: the root is paged in first, so FIFO evicts it first. The <strong>scan</strong> preset shows a sequential scan flushing a recency-based cache, and <strong>pinning</strong> keeps a page resident no matter what.`,
    mount(el) {
      const st = { pre: `btree`, pol: `fifo`, cap: 3, pin: `off` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`references`, seg(`pre`, Object.keys(PC_PRESETS).map(k => [k, PC_PRESETS[k].label]), st.pre))}${ctl(`policy`, seg(`pol`, Object.keys(PC_POL).map(k => [k, PC_POL[k]]), st.pol))}</div>
        <div class="ctl-row">${ctl(`frames`, rng(`cap`, 1, 6, 1, st.cap))}${ctl(`pin`, `<span data-k="pinseg"></span>`)}</div>
        <div class="lab-panel"><h4>Trace (frame contents after each reference)</h4><div class="trace" data-k="trace"></div><div class="legend"><span>${chip(`ok`, `hit`)}</span><span>${chip(`final`, `paged in`)}</span><span>${chip(`no`, `miss`)}</span><span data-k="clockleg"></span></div></div>
        <div class="lab-grid even" style="margin-top:12px">
          <div class="lab-panel"><h4>Result</h4><div class="stat-row" data-k="stats"></div></div>
          <div class="lab-panel"><h4>Hit ratio by policy, same frames</h4><div data-k="cmp"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const drawPin = () => {
        q(`pinseg`).innerHTML = seg(`pin`, [[`off`, `none`], [`on`, `pin ` + PC_PRESETS[st.pre].pin]], st.pin);
        q(`pinseg`).querySelectorAll(`button`).forEach(b => b.addEventListener(`click`, () => { st.pin = b.dataset.v; drawPin(); draw(); }));
      };
      const draw = () => {
        const P = PC_PRESETS[st.pre], pin = st.pin === `on` ? P.pin : null;
        const R = pcSim(P.refs, st.cap, st.pol, pin);
        let h = `<table><tr><th class="lbl">ref</th>${R.steps.map(s => `<th>${esc(s.p)}</th>`).join(``)}</tr>`;
        for (let f = 0; f < st.cap; f++) {
          h += `<tr><td class="lbl">frame ${f}</td>${R.steps.map(s => {
            const v = s.slots[f];
            const cls = v === null ? `` : s.slot === f ? (s.hit ? `hit` : `in`) : v === pin ? `pin` : ``;
            const bit = st.pol === `clock` && v !== null ? `<sup>${s.bits[f]}</sup>` : ``;
            return `<td class="${cls}">${v === null ? `` : esc(v) + bit}</td>`;
          }).join(``)}</tr>`;
        }
        h += `<tr><td class="lbl">result</td>${R.steps.map(s => `<td class="${s.hit ? `hit` : `miss`}">${s.hit ? `H` : `M`}</td>`).join(``)}</tr></table>`;
        q(`trace`).innerHTML = h;
        q(`clockleg`).innerHTML = st.pol === `clock` ? `superscript = CLOCK access bit` : ``;
        q(`stats`).innerHTML = stat(`references`, P.refs.length) + stat(`hits`, R.hits, `good`) + stat(`misses (page-ins)`, R.misses, `bad`) + stat(`hit ratio`, pct(R.hits / P.refs.length));
        q(`cmp`).innerHTML = hbars(Object.keys(PC_POL).map(p => { const r = pcSim(P.refs, st.cap, p, pin); return { label: PC_POL[p], value: r.hits / P.refs.length, max: 1, text: pct(r.hits / P.refs.length), cls: p === st.pol ? `good` : `muted` }; }), 1);
        let n;
        if (st.pre === `belady`) {
          const f3 = pcSim(P.refs, 3, `fifo`, null).misses, f4 = pcSim(P.refs, 4, `fifo`, null).misses;
          n = `With this classic reference string FIFO takes <strong>${f3} faults with 3 frames but ${f4} with 4</strong>: more memory, more misses. This is Bélády's anomaly (a well-known result, not covered in the book). LRU and OPT never get worse with more frames.`;
        } else if (st.pre === `btree`) {
          const rootEv = R.steps.filter(s => s.ev === `R`).length;
          n = `Every lookup starts at the root R. ${rootEv ? `${PC_POL[st.pol]} evicted R <strong>${rootEv} time${rootEv > 1 ? `s` : ``}</strong>, so it had to be paged in again.` : `${PC_POL[st.pol]} kept R resident.`} The book's point: FIFO looks only at page-in time, so the first pages loaded (root and upper levels) are the first to go. Pinning the top levels avoids it.`;
        } else n = `The scan touches S1-S6 once each. LRU and FIFO let it push out the hot pages A, B, C, which then miss again. Frequency-based LFU (and TinyLFU, which only admits a page if it is more frequent than the victim) keeps them.`;
        if (st.pol === `clock`) n += ` CLOCK sweeps a circular buffer: access bit 1 → clear it and move on, 0 → evict. It approximates LRU without relinking a list on every hit.`;
        q(`note`).innerHTML = note(n);
      };
      wireSegs(el, st, k => { if (k === `pre`) { st.pin = `off`; drawPin(); } draw(); });
      wireRanges(el, st, { cap: v => v }, draw);
      drawPin(); draw();
    }
  };

  // =====================================================================
  // Ch5 - WAL, steal/force and ARIES recovery
  // =====================================================================
  const WAL_LOG = [
    { lsn: 1, tx: `T1`, page: `P1`, before: 100, after: 80 },
    { lsn: 2, tx: `T2`, page: `P2`, before: 50, after: 70 },
    { lsn: 3, tx: `T1`, page: `P3`, before: 10, after: 30 },
    { lsn: 4, tx: `T1`, commit: true },
    { lsn: 5, tx: `T3`, page: `P1`, before: 80, after: 60 },
    { lsn: 6, tx: `T2`, page: `P3`, before: 30, after: 35 },
    { lsn: 7, tx: `T2`, commit: true },
    { lsn: 8, tx: `T3`, page: `P2`, before: 70, after: 0 },
    { lsn: 9, tx: `T3`, page: `P3`, before: 35, after: 99 },
    { lsn: 10, tx: `T3`, commit: true }
  ];
  const WAL_FLUSH = [{ after: 3, page: `P1` }, { after: 5, page: `P1` }, { after: 8, page: `P2` }, { after: 9, page: `P3` }];
  const WAL_INIT = { P1: 100, P2: 50, P3: 10 };
  function walRun(steal, force, crash) {
    const mem = {}, disk = {}, unc = {};
    Object.keys(WAL_INIT).forEach(p => { mem[p] = { v: WAL_INIT[p], lsn: 0 }; disk[p] = { v: WAL_INIT[p], lsn: 0 }; unc[p] = new Set(); });
    const events = {};
    const ev = (t, cls, txt) => (events[t] = events[t] || []).push([cls, txt]);
    const flush = (t, p, why) => { disk[p] = { v: mem[p].v, lsn: mem[p].lsn }; ev(t, unc[p].size ? `bad` : `ok`, `flush ${p} = ${mem[p].v} (${why}${unc[p].size ? `, contains uncommitted ${[...unc[p]].join(`, `)}` : ``})`); };
    for (let t = 1; t <= crash; t++) {
      const r = WAL_LOG[t - 1];
      if (r.commit) {
        Object.values(unc).forEach(s => s.delete(r.tx));
        if (force) { const pages = [...new Set(WAL_LOG.filter(x => x.tx === r.tx && x.page && x.lsn < r.lsn).map(x => x.page))]; pages.forEach(p => flush(t, p, `force at ${r.tx} commit`)); }
      } else { mem[r.page] = { v: r.after, lsn: r.lsn }; unc[r.page].add(r.tx); }
      WAL_FLUSH.filter(f => f.after === t).forEach(f => {
        if (disk[f.page].lsn === mem[f.page].lsn) return;
        if (!steal && unc[f.page].size) ev(t, `info`, `background flush of ${f.page} skipped: no-steal, ${[...unc[f.page]].join(`, `)} uncommitted`);
        else flush(t, f.page, `background flush`);
      });
    }
    const log = WAL_LOG.slice(0, crash);
    const winners = new Set(log.filter(r => r.commit).map(r => r.tx));
    const losers = [...new Set(log.filter(r => r.page && !winners.has(r.tx)).map(r => r.tx))];
    const atCrash = {}; Object.keys(disk).forEach(p => { atCrash[p] = { ...disk[p] }; });
    const undoNeeded = log.some(r => r.page && !winners.has(r.tx) && disk[r.page].lsn >= r.lsn);
    const redoNeeded = log.some(r => r.page && winners.has(r.tx) && disk[r.page].lsn < r.lsn);
    const redo = [], undo = [];
    const rec = {}; Object.keys(disk).forEach(p => { rec[p] = { ...disk[p] }; });
    log.filter(r => r.page).forEach(r => {
      if (rec[r.page].lsn < r.lsn) { rec[r.page] = { v: r.after, lsn: r.lsn }; redo.push([r, true]); } else redo.push([r, false]);
    });
    const afterRedo = {}; Object.keys(rec).forEach(p => { afterRedo[p] = { ...rec[p] }; });
    let clr = crash;
    log.filter(r => r.page && !winners.has(r.tx)).reverse().forEach(r => { clr++; rec[r.page] = { v: r.before, lsn: clr }; undo.push([r, clr]); });
    const expected = { ...WAL_INIT }; log.filter(r => r.page && winners.has(r.tx)).forEach(r => { expected[r.page] = r.after; });
    return { events, winners: [...winners], losers, atCrash, afterRedo, final: rec, expected, redo, undo, undoNeeded, redoNeeded };
  }
  D.walRecovery = {
    title: `WAL + ARIES: steal/force policies and crash recovery`,
    blurb: `Three transactions update pages P1-P3, and every change is logged before it is applied. The buffer manager flushes pages in the background (that's <strong>steal</strong> if a page holds uncommitted data) and maybe at commit (<strong>force</strong>). Pick a crash point and watch <strong>ARIES</strong> recover: analysis finds winners and losers, redo repeats history for changes missing on disk, undo rolls back losers in reverse and writes <strong>compensation log records</strong>.`,
    mount(el) {
      const st = { steal: `steal`, force: `noforce`, crash: 8 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`flushing uncommitted pages`, seg(`steal`, [[`steal`, `steal`], [`nosteal`, `no-steal`]], st.steal))}${ctl(`at commit`, seg(`force`, [[`noforce`, `no-force`], [`force`, `force`]], st.force))}</div>
        <div class="ctl-row">${ctl(`crash after LSN`, rng(`crash`, 1, 10, 1, st.crash))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Log and buffer manager activity</h4><div data-k="log"></div></div>
          <div class="lab-panel"><h4>Recovery</h4><div data-k="rec"></div></div>
        </div>
        <div class="stat-row" data-k="stats" style="margin-top:12px"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const steal = st.steal === `steal`, force = st.force === `force`;
        const R = walRun(steal, force, st.crash);
        const recTxt = r => r.commit ? `${r.tx} COMMIT` : `${r.tx} ${r.page}: ${r.before} → ${r.after}`;
        let h = `<table class="sched"><tr><th>LSN</th><th>record</th></tr>`;
        WAL_LOG.forEach(r => {
          const lost = r.lsn > st.crash;
          h += `<tr style="${lost ? `opacity:.35` : ``}"><td>${r.lsn}</td><td class="op">${recTxt(r)}${lost ? `<span class="ann">never written (after crash)</span>` : ``}${(R.events[r.lsn] || []).map(([c, t]) => `<span class="ann" style="color:var(--${c === `bad` ? `bad` : c === `ok` ? `good` : `text-muted`})">⤓ ${esc(t)}</span>`).join(``)}</td></tr>`;
          if (r.lsn === st.crash) h += `<tr class="bad"><td colspan="2" style="color:var(--bad);font-weight:700">💥 crash: memory lost, log 1..${st.crash} durable</td></tr>`;
        });
        q(`log`).innerHTML = h + `</table>`;
        const pages = Object.keys(WAL_INIT);
        let r = `<div style="font-size:12.5px;margin-bottom:6px"><b>1. Analysis</b>: winners ${R.winners.length ? R.winners.map(t => chip(`ok`, t)).join(` `) : chip(`muted`, `none`)} losers ${R.losers.length ? R.losers.map(t => chip(`no`, t)).join(` `) : chip(`muted`, `none`)}</div>`;
        r += `<div style="font-size:12.5px;margin-bottom:6px"><b>2. Redo</b> (repeat history if page LSN &lt; record LSN): ${R.redo.length ? R.redo.map(([x, done]) => done ? chip(`final`, `LSN ${x.lsn}`) : chip(`muted`, `${x.lsn} on disk`)).join(` `) : chip(`muted`, `nothing logged`)}</div>`;
        r += `<div style="font-size:12.5px;margin-bottom:10px"><b>3. Undo</b> (losers, newest first): ${R.undo.length ? R.undo.map(([x, c]) => chip(`undo`, `undo ${x.lsn} → CLR ${c}`)).join(` `) : chip(`muted`, `nothing to undo`)}</div>`;
        r += `<table class="mini-table"><tr><th>page</th><th class="num">disk at crash</th><th class="num">after redo</th><th class="num">after undo</th><th class="num">committed state</th><th></th></tr>${pages.map(p => `<tr><td>${p}</td><td class="num">${R.atCrash[p].v} <span style="color:var(--text-muted)">@${R.atCrash[p].lsn}</span></td><td class="num">${R.afterRedo[p].v}</td><td class="num">${R.final[p].v}</td><td class="num">${R.expected[p]}</td><td>${R.final[p].v === R.expected[p] ? chip(`ok`, `✓`) : chip(`no`, `✗`)}</td></tr>`).join(``)}</table>`;
        q(`rec`).innerHTML = r;
        q(`stats`).innerHTML = stat(`redo applied`, R.redo.filter(x => x[1]).length) + stat(`redo skipped (already on disk)`, R.redo.filter(x => !x[1]).length) + stat(`undone + CLRs`, R.undo.length) + stat(`undo needed?`, R.undoNeeded ? `yes` : `no`, R.undoNeeded ? `bad` : `good`) + stat(`redo needed?`, R.redoNeeded ? `yes` : `no`, R.redoNeeded ? `bad` : `good`);
        const combo = { 'steal/noforce': `Steal + no-force is what ARIES assumes: the most freedom for the buffer manager, so recovery needs both undo (loser pages may be on disk) and redo (winner pages may not be).`, 'steal/force': `Steal + force: committed changes are always on disk, so redo is never strictly needed, but losers' pages may have been flushed and must be undone.`, 'nosteal/noforce': `No-steal + no-force: loser changes never reach disk, so there is nothing to undo, but committed changes may still only be in the log and must be redone.`, 'nosteal/force': `No-steal + force needs neither undo nor redo, but every commit waits for page writes, and pages with uncommitted data can never leave memory.` }[st.steal + `/` + st.force];
        q(`note`).innerHTML = note(`${combo} ARIES still <em>repeats history</em> (it also redoes losers' logged changes) and then undoes them, which keeps recovery uniform. A CLR records each undo, so a crash during recovery never undoes the same change twice.`, `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { crash: v => `LSN ` + v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch5 - Isolation levels and anomalies
  // =====================================================================
  const ISO_LV = { ru: `Read uncommitted`, rc: `Read committed`, rr: `Repeatable read`, si: `Snapshot isolation`, ser: `Serializable` };
  const ISO = {
    dirty: {
      label: `dirty read`,
      steps: [[1, `UPDATE users SET address = 'New St' WHERE id = 1`], [2, `SELECT address FROM users WHERE id = 1`], [1, `ROLLBACK`], [2, `ship the parcel to the address read`]],
      lv: {
        ru: [false, { 1: [`reads 'New St' (uncommitted)`, `bad`] }, `T2 used 'New St', a value that was never committed.`],
        rc: [true, { 1: [`reads 'Old St' (last committed)`, ``] }, `Only committed data is visible.`],
        rr: [true, { 1: [`reads 'Old St' (last committed)`, ``] }, `Only committed data is visible.`],
        si: [true, { 1: [`reads 'Old St' from its snapshot`, ``] }, `The snapshot contains only transactions committed before T2 started.`],
        ser: [true, { 1: [`reads 'Old St' (last committed)`, ``] }, `Only committed data is visible.`]
      }
    },
    nonrep: {
      label: `nonrepeatable read`,
      steps: [[1, `SELECT balance FROM acct WHERE id = 1   -- 100`], [2, `UPDATE acct SET balance = 50 WHERE id = 1`], [2, `COMMIT`], [1, `SELECT balance FROM acct WHERE id = 1`]],
      lv: {
        ru: [false, { 3: [`reads 50: same row, different value`, `bad`] }, `T1 read the same row twice and got 100, then 50.`],
        rc: [false, { 3: [`reads 50: same row, different value`, `bad`] }, `Read committed only forbids dirty reads; T2's change was committed.`],
        rr: [true, { 1: [`waits: T1 holds a shared lock on the row until it finishes`, `wait`], 3: [`reads 100 again`, ``] }, `Read locks are held to the end of T1, so T2's update waits.`],
        si: [true, { 3: [`reads 100 from its snapshot`, ``] }, `T2 commits freely, but T1 keeps reading its snapshot.`],
        ser: [true, { 1: [`waits for T1's shared lock`, `wait`], 3: [`reads 100 again`, ``] }, `Same as repeatable read for a single row.`]
      }
    },
    phantom: {
      label: `phantom read`,
      steps: [[1, `SELECT COUNT(*) FROM emp WHERE dept = 'eng'   -- 3`], [2, `INSERT INTO emp (name, dept) VALUES ('Ann', 'eng')`], [2, `COMMIT`], [1, `SELECT COUNT(*) FROM emp WHERE dept = 'eng'`]],
      lv: {
        ru: [false, { 3: [`counts 4: a phantom row appeared`, `bad`] }, `The range query returned a different set of rows.`],
        rc: [false, { 3: [`counts 4: a phantom row appeared`, `bad`] }, `The range query returned a different set of rows.`],
        rr: [false, { 3: [`counts 4: row locks don't cover rows that didn't exist yet`, `bad`] }, `Repeatable read locks the rows it read, not the range, so a new row slips in.`],
        si: [true, { 3: [`counts 3 from its snapshot`, ``] }, `The snapshot doesn't include Ann, so the count is stable.`],
        ser: [true, { 1: [`waits: T1 holds a range (predicate) lock on dept = 'eng'`, `wait`], 3: [`counts 3`, ``] }, `Range or predicate locks block inserts into the scanned range.`]
      }
    },
    lost: {
      label: `lost update`,
      steps: [[1, `SELECT v FROM counter   -- 10`], [2, `SELECT v FROM counter   -- 10`], [1, `UPDATE counter SET v = 11`], [1, `COMMIT`], [2, `UPDATE counter SET v = 11`], [2, `COMMIT`]],
      lv: {
        ru: [false, { 4: [`overwrites T1's write: v = 11`, `bad`] }, `Two increments, final value 11 instead of 12.`],
        rc: [false, { 4: [`overwrites T1's write: v = 11`, `bad`] }, `Two increments, final value 11 instead of 12.`],
        rr: [true, { 2: [`waits: T2 holds a shared lock on v`, `wait`], 4: [`waits for T1 too → deadlock, T2 aborted and retried: v = 12`, `abort`] }, `With lock-based repeatable read, both hold read locks and both try to upgrade: a deadlock, and one transaction is aborted. (MVCC-based "repeatable read" in some databases does allow this anomaly.)`],
        si: [true, { 5: [`aborted: v changed since T2's snapshot (first committer wins); retry gives 12`, `abort`] }, `Only one of two transactions modifying the same value may commit. The book: snapshot isolation precludes lost updates.`],
        ser: [true, { 5: [`aborted (conflict); retry gives 12`, `abort`] }, `Serializable execution never loses an update.`]
      }
    },
    skew: {
      label: `write skew`,
      steps: [[1, `SELECT A1, A2   -- 100, 150: sum 250 ≥ 200, OK`], [2, `SELECT A1, A2   -- 100, 150: sum 250 ≥ 200, OK`], [1, `UPDATE A1 = A1 - 200   -- -100`], [2, `UPDATE A2 = A2 - 200   -- -50`], [1, `COMMIT`], [2, `COMMIT`]],
      lv: {
        ru: [false, { 5: [`commits: A1 + A2 = -150`, `bad`] }, `Each transaction kept A1 + A2 ≥ 0 on its own; together they broke it.`],
        rc: [false, { 5: [`commits: A1 + A2 = -150`, `bad`] }, `Each transaction kept A1 + A2 ≥ 0 on its own; together they broke it.`],
        rr: [true, { 2: [`waits: T2 holds a shared lock on A1`, `wait`], 3: [`waits for T1's lock on A2 → deadlock, T2 aborted`, `abort`] }, `With lock-based repeatable read, both hold read locks on A1 and A2, so the writes deadlock and one aborts.`],
        si: [false, { 5: [`commits: different records, no write-write conflict. A1 + A2 = -150`, `bad`] }, `The book's example: snapshot isolation allows write skew because T1 and T2 modify different values.`],
        ser: [true, { 5: [`aborted: read-write dependency cycle detected`, `abort`] }, `Serializable execution forbids outcomes that no serial order could produce.`]
      }
    }
  };
  D.isolation = {
    title: `Isolation levels vs read and write anomalies`,
    blurb: `Five classic anomalies from Chapter 5, each as a two-transaction schedule, including the book's <strong>write skew</strong> (A1 = 100, A2 = 150, invariant A1 + A2 ≥ 0, each withdraws 200). Pick an isolation level and see what each step observes, who waits, and who gets aborted. The matrix follows Figure 5-5 for the read anomalies; locking behaviour shown for repeatable read and serializable is the textbook lock-based implementation.`,
    mount(el) {
      const st = { sc: `skew`, lv: `si` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`anomaly`, seg(`sc`, Object.keys(ISO).map(k => [k, ISO[k].label]), st.sc))}</div>
        <div class="ctl-row">${ctl(`isolation level`, seg(`lv`, Object.keys(ISO_LV).map(k => [k, ISO_LV[k]]), st.lv))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Schedule</h4><div data-k="sched"></div><div data-k="res" style="margin-top:10px"></div></div>
          <div class="lab-panel"><h4>Allowed anomalies</h4><div data-k="mx"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const S = ISO[st.sc], [ok, ann, why] = S.lv[st.lv];
        q(`sched`).innerHTML = `<table class="sched"><tr><th>#</th><th>T1</th><th>T2</th></tr>${S.steps.map(([t, op], i) => {
          const a = ann[i], cls = a ? (a[1] === `bad` ? `bad` : a[1] === `abort` ? `` : a[1] === `wait` ? `wait` : ``) : ``;
          const cell = `<td class="op">${esc(op)}${a ? `<span class="ann" style="color:var(--${a[1] === `bad` ? `bad` : a[1] === `abort` ? `bad` : a[1] === `wait` ? `warn` : `good`})">→ ${esc(a[0])}</span>` : ``}</td>`;
          return `<tr class="${cls}"><td>${i + 1}</td>${t === 1 ? cell + `<td></td>` : `<td></td>` + cell}</tr>`;
        }).join(``)}</table>`;
        q(`res`).innerHTML = `${ok ? chip(`ok`, `prevented`) : chip(`no`, `anomaly happens`)} <span style="font-size:12.5px">${esc(why)}</span>`;
        q(`mx`).innerHTML = `<table class="mini-table"><tr><th></th>${Object.keys(ISO).map(k => `<th style="font-size:10px">${ISO[k].label}</th>`).join(``)}</tr>${Object.keys(ISO_LV).map(l => `<tr><td style="font-size:11.5px">${ISO_LV[l]}</td>${Object.keys(ISO).map(k => { const o = ISO[k].lv[l][0]; return `<td class="${l === st.lv && k === st.sc ? `cell-hl` : ``}" style="text-align:center">${o ? `<span style="color:var(--good)">-</span>` : `<span style="color:var(--bad)">allowed</span>`}</td>`; }).join(``)}</tr>`).join(``)}</table><div class="cs-note" style="margin-top:6px">"-" = prevented. Lost update and write skew under repeatable read assume lock-based RR.</div>`;
        q(`note`).innerHTML = note(st.sc === `skew` && st.lv === `si` ? `This is the case the book highlights: snapshot isolation stops lost updates (same value) but not write skew (different values, shared invariant). Serializable isolation, or explicitly locking the rows read (SELECT ... FOR UPDATE), prevents it.` : ok ? `Prevented by ${ISO_LV[st.lv].toLowerCase()}. Stronger isolation costs coordination: waiting on locks, or aborting and retrying.` : `Weaker isolation levels trade correctness for concurrency. The application must know which anomalies it can tolerate.`, ok ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch5 - 2PL deadlocks: detection vs avoidance
  // =====================================================================
  const DL_SC = {
    two: { label: `two-way cycle`, txs: { T1: [`A`, `B`], T2: [`B`, `A`] } },
    three: { label: `three-way cycle`, txs: { T1: [`A`, `B`], T2: [`B`, `C`], T3: [`C`, `A`] } },
    ordered: { label: `same lock order`, txs: { T1: [`A`, `B`], T2: [`A`, `B`], T3: [`A`, `B`] } }
  };
  const DL_SCHEME = { detect: `waits-for graph`, waitdie: `wait-die`, woundwait: `wound-wait`, timeout: `timeout` };
  function dlRun(sc, scheme) {
    const names = Object.keys(sc.txs);
    const T = names.map((n, i) => ({ n, ts: i + 1, script: sc.txs[n], pc: 0, state: `run`, held: [], waited: 0, delay: 0, aborts: 0 }));
    const owner = {}, events = [];
    let turn = 0;
    const edges = () => T.filter(t => t.state === `wait`).map(t => [t.n, owner[t.script[t.pc]] ? owner[t.script[t.pc]].n : null]).filter(e => e[1]);
    const snap = () => ({ edges: edges(), owner: Object.fromEntries(Object.entries(owner).map(([l, t]) => [l, t.n])), states: Object.fromEntries(T.map(t => [t.n, t.state])) });
    const push = (cls, txt) => events.push({ cls, txt, ...snap() });
    const release = t => { t.held.forEach(l => { delete owner[l]; }); t.held = []; };
    const abort = (t, why) => { release(t); t.pc = 0; t.state = `run`; t.waited = 0; t.delay = 2; t.aborts++; push(`bad`, `${t.n} aborted (${why}), releases its locks and restarts`); };
    const cycle = () => {
      const g = {}; edges().forEach(([a, b]) => { g[a] = b; });
      for (const s of Object.keys(g)) { const seen = []; let c = s; while (g[c] && !seen.includes(c)) { seen.push(c); c = g[c]; } if (c === s) return seen; }
      return null;
    };
    for (let step = 0; step < 80 && T.some(t => t.state !== `done`); step++) {
      let t = null;
      for (let k = 0; k < T.length; k++) { const c = T[(turn + k) % T.length]; if (c.state !== `done` && c.delay === 0) { t = c; turn = (turn + k + 1) % T.length; break; } }
      T.forEach(c => { if (c.delay > 0 && c !== t) c.delay--; });
      if (!t) continue;
      if (t.pc >= t.script.length) { release(t); t.state = `done`; push(`ok`, `${t.n} commits and releases ${t.script.join(`, `)}`); continue; }
      const l = t.script[t.pc], h = owner[l];
      if (!h) { owner[l] = t; t.held.push(l); t.pc++; const was = t.state; t.state = `run`; t.waited = 0; push(`ok`, `${t.n} acquires X(${l})${was === `wait` ? ` after waiting` : ``}`); continue; }
      if (scheme === `waitdie` && t.ts > h.ts) { abort(t, `wait-die: younger than holder ${h.n}, dies`); continue; }
      if (scheme === `woundwait` && t.ts < h.ts) { abort(h, `wound-wait: wounded by older ${t.n}`); owner[l] = t; t.held.push(l); t.pc++; t.state = `run`; push(`ok`, `${t.n} acquires X(${l})`); continue; }
      const first = t.state !== `wait`;
      t.state = `wait`; t.waited++;
      if (first) push(`dup`, `${t.n} requests X(${l}), held by ${h.n}: waits`);
      if (scheme === `detect`) { const c = cycle(); if (c) { const victim = T.filter(x => c.includes(x.n)).reduce((a, b) => b.ts > a.ts ? b : a); push(`bad`, `cycle ${c.concat(c[0]).join(` → `)} in the waits-for graph`); abort(victim, `deadlock victim, youngest in cycle`); } }
      if (scheme === `timeout` && t.waited > 3) abort(t, `lock wait timeout`);
    }
    return { events, T };
  }
  D.deadlock = {
    title: `Two-phase locking deadlocks: detect, avoid or time out`,
    blurb: `Transactions take exclusive locks in a growing phase and release them all at commit (strict 2PL). When they lock in opposite orders, they can wait for each other forever. Step through and compare the book's remedies: build a <strong>waits-for graph</strong> and abort a victim on a cycle, use timestamps with <strong>wait-die</strong> or <strong>wound-wait</strong> (T1 is oldest), or give up after a <strong>timeout</strong>.`,
    mount(el) {
      const st = { sc: `two`, scheme: `detect` };
      let run, cur;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`scenario`, seg(`sc`, Object.keys(DL_SC).map(k => [k, DL_SC[k].label]), st.sc))}${ctl(`scheme`, seg(`scheme`, Object.keys(DL_SCHEME).map(k => [k, DL_SCHEME[k]]), st.scheme))}</div>
        <div class="ctl-row"><button class="lab-btn" data-act="step">Step</button><button class="lab-btn ghost" data-act="all">Run to end</button><button class="lab-btn ghost" data-act="reset">Reset</button><span data-k="scripts" style="font-size:12px;color:var(--text-muted)"></span></div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Waits-for graph and lock table</h4><div data-k="g"></div><div data-k="locks"></div></div>
          <div class="lab-panel"><h4>Events</h4><div class="log" data-k="log" style="max-height:260px"></div></div>
        </div>
        <div class="stat-row" data-k="stats" style="margin-top:12px"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const reset = () => { run = dlRun(DL_SC[st.sc], st.scheme); cur = -1; };
      const draw = () => {
        const sc = DL_SC[st.sc], names = Object.keys(sc.txs);
        q(`scripts`).innerHTML = names.map((n, i) => `${n} (ts ${i + 1}): ${sc.txs[n].join(` → `)}`).join(` · `);
        const e = cur >= 0 ? run.events[cur] : { edges: [], owner: {}, states: Object.fromEntries(names.map(n => [n, `run`])) };
        const P = names.length === 2 ? { T1: [80, 70], T2: [260, 70] } : { T1: [170, 30], T2: [80, 135], T3: [260, 135] };
        let s = `<defs><marker id="dlArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--accent-3)"/></marker></defs>`;
        e.edges.forEach(([a, b]) => {
          const [x1, y1] = P[a], [x2, y2] = P[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ox = -dy / L * 6, oy = dx / L * 6;
          s += `<line x1="${x1 + dx / L * 24 + ox}" y1="${y1 + dy / L * 24 + oy}" x2="${x2 - dx / L * 26 + ox}" y2="${y2 - dy / L * 26 + oy}" style="stroke:var(--accent-3);stroke-width:2" marker-end="url(#dlArrow)"/>`;
        });
        names.forEach(n => {
          const [x, y] = P[n], stt = e.states[n];
          s += `<circle cx="${x}" cy="${y}" r="22" style="fill:${stt === `done` ? `rgba(34,197,94,.3)` : stt === `wait` ? `rgba(245,158,11,.3)` : `var(--bg-3)`};stroke:var(--border)"/><text class="svg-node-txt" x="${x}" y="${y + 1}" style="font-size:12px;font-weight:700;dominant-baseline:central">${n}</text><text class="svg-node-txt" x="${x}" y="${y + 34}" style="fill:var(--text-muted)">${stt}</text>`;
        });
        q(`g`).innerHTML = svgWrap(340, 175, s);
        const locks = [...new Set(Object.values(sc.txs).flat())].sort();
        q(`locks`).innerHTML = `<table class="mini-table"><tr><th>lock</th>${locks.map(l => `<th>${l}</th>`).join(``)}</tr><tr><td>holder</td>${locks.map(l => `<td>${e.owner[l] || `<span style="color:var(--text-muted)">free</span>`}</td>`).join(``)}</tr></table>`;
        q(`log`).innerHTML = cur < 0 ? `<div class="info">Press Step.</div>` : run.events.slice(0, cur + 1).map((x, i) => `<div class="${x.cls}">${i + 1}. ${esc(x.txt)}</div>`).reverse().join(``);
        const done = cur >= run.events.length - 1, aborts = run.events.slice(0, cur + 1).filter(x => x.txt.includes(`aborted`)).length;
        q(`stats`).innerHTML = stat(`events`, `${cur + 1} / ${run.events.length}`) + stat(`aborts`, aborts, aborts ? `bad` : `good`) + stat(`committed`, Object.values(e.states).filter(x => x === `done`).length + ` / ${names.length}`);
        const N = {
          detect: `The waits-for graph has an edge Ti → Tj when Ti waits for a lock Tj holds. A cycle is a deadlock; the youngest transaction in it is aborted. Only real deadlocks cause aborts, but the graph must be maintained and checked.`,
          waitdie: `Wait-die: an older transaction may wait for a younger one, but a younger requester "dies" (aborts) instead of waiting for an older one. Waits only go from old to young, so no cycle can form. Restarted transactions keep their timestamp, so they eventually become the oldest.`,
          woundwait: `Wound-wait: an older requester "wounds" (aborts) the younger holder and takes the lock; a younger requester waits. Waits only go from young to old, so again no cycle.`,
          timeout: `Timeouts need no graph: a transaction that has waited too long is aborted. Simple, but the timeout is a guess. Too short aborts transactions that were merely slow; too long leaves deadlocked ones stuck.`
        };
        q(`note`).innerHTML = note(N[st.scheme] + (st.sc === `ordered` ? ` <strong>Here every transaction locks A before B, so no cycle is possible</strong>; conservative ordering is the cheapest way to avoid deadlocks.` : ``) + (done ? `` : ` <em>Step to continue.</em>`), done ? `good` : ``);
      };
      el.addEventListener(`click`, ev => {
        const b = ev.target.closest(`[data-act]`); if (!b) return;
        if (b.dataset.act === `step`) cur = Math.min(cur + 1, run.events.length - 1);
        else if (b.dataset.act === `all`) cur = run.events.length - 1;
        else reset();
        draw();
      });
      wireSegs(el, st, () => { reset(); draw(); });
      reset(); draw();
    }
  };

  // =====================================================================
  // Ch5 - Latch crabbing
  // =====================================================================
  const LC_CAP = 4, LC_MIN = 2, LC_NAMES = [`root`, `internal 1`, `internal 2`, `leaf`];
  function lcSteps(f, op, proto) {
    const steps = [];
    let held = [];
    const push = (act, extra) => steps.push({ act, held: held.map(h => ({ ...h })), ...extra });
    const safe = l => op === `insert` ? f[l] < LC_CAP : op === `delete` ? f[l] > LC_MIN : true;
    const mode = op === `read` ? `S` : `X`;
    const perform = () => {
      if (op === `read`) { push(`read the key in the leaf`); return; }
      let top = 3; while (top > 0 && !safe(top)) top--;
      const what = op === `insert` ? `split` : `merge`;
      push(safe(3) ? `${op} in the leaf (safe: no ${what})` : `${op} in the leaf; ${what}s propagate up to ${LC_NAMES[top]}`, { touch: top });
    };
    const pessimistic = () => {
      held = [{ l: 0, m: mode }]; push(`acquire ${mode} latch on root`);
      for (let l = 1; l <= 3; l++) {
        held.push({ l, m: mode }); push(`acquire ${mode} latch on ${LC_NAMES[l]}`);
        if (op === `read`) { held = held.filter(h => h.l === l); push(`release latch on ${LC_NAMES[l - 1]}`); }
        else if (safe(l) && held.length > 1) { const rel = held.filter(h => h.l < l).map(h => LC_NAMES[h.l]); held = held.filter(h => h.l === l); push(`${LC_NAMES[l]} is safe (${op === `insert` ? `not full` : `above minimum`}): release ${rel.join(`, `)}`); }
      }
      perform(); held = []; push(`release all latches`);
    };
    if (proto === `naive`) {
      for (let l = 0; l <= 3; l++) { held.push({ l, m: mode }); push(`acquire ${mode} latch on ${LC_NAMES[l]} (keep it)`); }
      perform(); held = []; push(`release all latches`);
    } else if (proto === `crab` || op === `read`) pessimistic();
    else {
      held = [{ l: 0, m: `S` }]; push(`optimistic: acquire S latch on root`);
      for (let l = 1; l <= 2; l++) { held.push({ l, m: `S` }); push(`acquire S latch on ${LC_NAMES[l]}`); held = held.filter(h => h.l === l); push(`release ${LC_NAMES[l - 1]}`); }
      held.push({ l: 3, m: `X` }); push(`acquire X latch on leaf`); held = held.filter(h => h.l === 3); push(`release ${LC_NAMES[2]}`);
      if (safe(3)) { perform(); held = []; push(`release leaf`); }
      else { held = []; push(`leaf is unsafe: release everything and restart pessimistically`, { restart: true }); pessimistic(); }
    }
    return steps;
  }
  D.latchCrabbing = {
    title: `Latch crabbing down a B-Tree path`,
    blurb: `Latches protect pages while a split or merge is half-done. Holding them on the whole root-to-leaf path is safe but serializes every writer on the root. <strong>Latch crabbing</strong> grabs the child, then lets go of the parent as soon as the child is <strong>safe</strong> (an insert won't split it, a delete won't merge it). The <strong>optimistic</strong> variant descends with shared latches and only restarts with exclusive ones if the leaf turns out to be unsafe. Set how full each node is and step through.`,
    mount(el) {
      const st = { op: `insert`, proto: `crab`, f0: 2, f1: 3, f2: 4, f3: 4 };
      let cur = 0;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`operation`, seg(`op`, [[`read`, `read`], [`insert`, `insert`], [`delete`, `delete`]], st.op))}${ctl(`protocol`, seg(`proto`, [[`naive`, `hold whole path`], [`crab`, `crabbing`], [`opt`, `optimistic`]], st.proto))}</div>
        <div class="ctl-row">${[0, 1, 2, 3].map(l => ctl(LC_NAMES[l] + ` keys`, rng(`f` + l, 1, 4, 1, st[`f` + l]))).join(``)}</div>
        <div class="ctl-row"><button class="lab-btn" data-act="next">Next step</button><button class="lab-btn ghost" data-act="prev">Back</button><button class="lab-btn ghost" data-act="end">Last step</button><button class="lab-btn ghost" data-act="first">Restart</button></div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Steps</h4><div data-k="steps" class="scroll-y"></div></div>
          <div class="lab-panel"><h4>Path and latches</h4><div data-k="svg"></div></div>
        </div>
        <div class="stat-row" data-k="stats" style="margin-top:12px"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const fl = () => [st.f0, st.f1, st.f2, st.f3];
      const draw = () => {
        const f = fl(), steps = lcSteps(f, st.op, st.proto);
        cur = clamp(cur, 0, steps.length - 1);
        const s = steps[cur];
        q(`steps`).innerHTML = `<table class="sched"><tr><th>#</th><th>action</th><th>latches held</th></tr>${steps.map((x, i) => `<tr style="${i === cur ? `background:rgba(245,158,11,.14)` : i > cur ? `opacity:.4` : ``}"><td>${i + 1}</td><td>${esc(x.act)}</td><td class="op">${x.held.map(h => `${h.m}:${LC_NAMES[h.l].replace(`internal `, `I`)}`).join(` `) || `-`}</td></tr>`).join(``)}</table>`;
        let g = ``;
        const safeL = l => st.op === `insert` ? f[l] < LC_CAP : st.op === `delete` ? f[l] > LC_MIN : true;
        for (let l = 0; l < 4; l++) {
          const y = 14 + l * 62, h = s.held.find(x => x.l === l);
          if (l) g += `<line class="bt-link ${h && s.held.find(x => x.l === l - 1) ? `hot` : ``}" x1="110" y1="${y - 26}" x2="110" y2="${y}"/>`;
          g += `<rect class="bt-node ${st.op === `read` ? `` : safeL(l) ? `safe` : `full`} ${h ? `hot` : ``} ${s.touch !== undefined && l >= s.touch ? `new` : ``}" x="40" y="${y}" width="140" height="36" rx="5"/>`;
          for (let k = 0; k < LC_CAP; k++) g += `<rect x="${48 + k * 31}" y="${y + 18}" width="27" height="11" rx="2" style="fill:${k < f[l] ? `var(--accent)` : `var(--bg)`};opacity:${k < f[l] ? .7 : 1};stroke:var(--border)"/>`;
          g += `<text class="svg-label" x="110" y="${y + 11}" text-anchor="middle" style="font-size:10px">${LC_NAMES[l]} (${f[l]}/${LC_CAP})</text>`;
          if (h) g += `<rect x="192" y="${y + 6}" width="28" height="24" rx="4" style="fill:${h.m === `X` ? `var(--bad)` : `var(--accent-2)`}"/><text x="206" y="${y + 18}" style="fill:#fff;font-size:12px;font-weight:700;text-anchor:middle;dominant-baseline:central">${h.m}</text>`;
        }
        q(`svg`).innerHTML = svgWrap(240, 260, g);
        const maxHeld = Math.max(...steps.map(x => x.held.length)), rootX = steps.filter(x => x.held.some(h => h.l === 0 && h.m === `X`)).length, total = sum(steps.map(x => x.held.length));
        q(`stats`).innerHTML = stat(`steps`, steps.length) + stat(`max latches held`, maxHeld) + stat(`steps with root X-latched`, rootX, rootX > 2 ? `bad` : `good`) + stat(`latch-steps (sum)`, total) + (steps.some(x => x.restart) ? stat(`restart`, `yes`, `bad`) : ``);
        let n;
        if (st.op === `read`) n = `Reads crab with shared latches: hold at most two at a time (parent and child), and release the parent as soon as the child is latched.`;
        else if (st.proto === `naive`) n = `Holding exclusive latches on the whole path is correct but the root stays X-latched for the entire operation, blocking every other reader and writer of the tree.`;
        else if (st.proto === `crab`) n = `Green nodes are safe for this ${st.op}; red ones might ${st.op === `insert` ? `split` : `merge`}. Ancestors are released the moment a safe node is reached, because no structural change can propagate above it.`;
        else n = `Most inserts and deletes don't change the tree structure, so it pays to descend with cheap shared latches and only take an exclusive latch on the leaf. If the leaf is unsafe, restart with full crabbing. Blink-Trees go further, using high keys and sibling links so splits never need the parent latched.`;
        q(`note`).innerHTML = note(n, `good`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`); if (!b) return;
        const a = b.dataset.act; cur = a === `next` ? cur + 1 : a === `prev` ? cur - 1 : a === `end` ? 999 : 0; draw();
      });
      wireSegs(el, st, () => { cur = 0; draw(); });
      wireRanges(el, st, { f0: v => v, f1: v => v, f2: v => v, f3: v => v }, () => { cur = 0; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch6 - Copy-on-write B-Tree (LMDB style)
  // =====================================================================
  D.copyOnWrite = {
    title: `Copy-on-write B-Tree: path copying, snapshots and reclamation`,
    blurb: `An LMDB-style tree that never modifies a page. Updating a value copies the leaf, then every ancestor up to a <strong>new root</strong>, and the root pointer flips atomically. Readers that started earlier keep their old root and see a consistent snapshot without any latches. Old pages become garbage only when no reader can reach them.`,
    mount(el) {
      let pages, nextId, roots, readers, freed, lastWritten, log;
      const mk = (kind, data) => { const id = `p` + (nextId++); pages[id] = { id, kind, ...data }; return id; };
      const reset = () => {
        pages = {}; nextId = 1; readers = []; freed = 0; lastWritten = 0; log = [];
        const L = [[[5, 1], [8, 1]], [[12, 1], [15, 1]], [[21, 1], [27, 1]], [[33, 1], [40, 1]]].map(kv => mk(`leaf`, { kv }));
        const I = [mk(`int`, { keys: [12], kids: [L[0], L[1]] }), mk(`int`, { keys: [33], kids: [L[2], L[3]] })];
        roots = [{ v: 1, id: mk(`root`, { keys: [21], kids: I }) }];
      };
      const cur = () => roots[roots.length - 1];
      const reach = ids => { const s = new Set(); const w = id => { if (!id || s.has(id)) return; s.add(id); (pages[id].kids || []).forEach(w); }; ids.forEach(w); return s; };
      const liveRoots = () => [...new Set([cur().v, ...readers])].map(v => roots.find(r => r.v === v).id);
      const update = li => {
        const r = pages[cur().id], ii = li >> 1, i = pages[r.kids[ii]], l = pages[i.kids[li & 1]];
        const nl = mk(`leaf`, { kv: l.kv.map((p, j) => j === 0 ? [p[0], p[1] + 1] : p) });
        const ni = mk(`int`, { keys: i.keys, kids: i.kids.map((k, j) => j === (li & 1) ? nl : k) });
        const nr = mk(`root`, { keys: r.keys, kids: r.kids.map((k, j) => j === ii ? ni : k) });
        roots.push({ v: cur().v + 1, id: nr }); lastWritten = 3;
        log.unshift([`ok`, `v${cur().v}: updated key ${l.kv[0][0]} → copied ${l.id}→${nl}, ${i.id}→${ni}, ${r.id}→${nr}; root pointer swapped`]);
      };
      const garbage = () => { const live = reach(liveRoots()); return Object.keys(pages).filter(id => !live.has(id) && !pages[id].freed); };
      el.innerHTML = `
        <div class="ctl-row"><span style="font-size:12px;color:var(--text-muted)">update a value in leaf:</span>${[0, 1, 2, 3].map(i => `<button class="lab-btn ghost" data-up="${i}">leaf ${i + 1}</button>`).join(``)}</div>
        <div class="ctl-row"><button class="lab-btn" data-act="reader">Start a reader on current version</button><button class="lab-btn ghost" data-act="finish">Finish oldest reader</button><button class="lab-btn ghost" data-act="reclaim">Reclaim unreachable pages</button><button class="lab-btn ghost" data-act="reset">Reset</button></div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4 data-k="lt"></h4><div data-k="left"></div></div>
          <div class="lab-panel"><h4 data-k="rt"></h4><div data-k="right"></div></div>
        </div>
        <div class="stat-row" data-k="stats" style="margin-top:12px"></div>
        <div class="lab-grid even" style="margin-top:12px"><div class="lab-panel"><h4>Log</h4><div class="log" data-k="log"></div></div><div data-k="note"></div></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const tree = (rootId, other, mode) => {
        const r = pages[rootId], P = [[150, 14]], ids = [rootId];
        r.kids.forEach((iid, a) => { ids.push(iid); P.push([75 + a * 150, 76]); pages[iid].kids.forEach((lid, b) => { ids.push(lid); P.push([37 + a * 150 + b * 76, 138]); }); });
        let s = ``;
        [[0, 1], [0, 4], [1, 2], [1, 3], [4, 5], [4, 6]].forEach(([a, b]) => { s += `<line class="bt-link" x1="${P[a][0]}" y1="${P[a][1] + 34}" x2="${P[b][0]}" y2="${P[b][1]}"/>`; });
        ids.forEach((id, j) => {
          const p = pages[id], shared = other.has(id), cls = shared ? `` : mode === `new` ? `copy` : `old`;
          const label = p.kind === `leaf` ? p.kv.map(([k, v]) => `${k}:v${v}`).join(` `) : p.keys.join(` `);
          s += `<rect class="bt-node ${p.kind === `leaf` ? `leaf` : ``} ${cls}" x="${P[j][0] - 34}" y="${P[j][1]}" width="68" height="34" rx="4"/><text class="bt-key muted" x="${P[j][0]}" y="${P[j][1] + 10}">${id}</text><text class="bt-key" x="${P[j][0]}" y="${P[j][1] + 23}" style="font-size:${p.kind === `leaf` ? 9.5 : 11}px">${label}</text>`;
        });
        return svgWrap(300, 178, s);
      };
      const draw = () => {
        const c = cur(), oldest = readers.length ? Math.min(...readers) : null;
        const leftV = oldest !== null && oldest !== c.v ? oldest : (roots.length > 1 ? roots[roots.length - 2].v : null);
        const right = c.id;
        if (leftV !== null) {
          const lid = roots.find(r => r.v === leftV).id, ls = reach([lid]), rs = reach([right]);
          q(`lt`).textContent = oldest === leftV ? `Reader's snapshot: version ${leftV}` : `Previous version ${leftV} (no reader holds it)`;
          q(`left`).innerHTML = tree(lid, rs, `old`);
          q(`right`).innerHTML = tree(right, ls, `new`);
        } else { q(`lt`).textContent = `No older version yet`; q(`left`).innerHTML = `<div class="cs-note">Update a leaf to create version 2.</div>`; q(`right`).innerHTML = tree(right, reach([right]), `old`); }
        q(`rt`).textContent = `Current version ${c.v} (root ${c.id})`;
        const g = garbage(), live = reach(liveRoots());
        q(`stats`).innerHTML = stat(`version`, c.v) + stat(`pages written by last update`, lastWritten) + stat(`pages allocated`, Object.keys(pages).length) + stat(`reachable`, live.size) + stat(`garbage`, g.length, g.length ? `bad` : ``) + stat(`freed`, freed) + stat(`readers`, readers.length ? readers.map(v => `v` + v).join(` `) : `none`);
        q(`log`).innerHTML = log.length ? log.map(([cl, t]) => `<div class="${cl}">${esc(t)}</div>`).join(``) : `<div class="info">Click a leaf to update it.</div>`;
        q(`note`).innerHTML = note(`Teal pages were copied by the last update; dashed pages exist only in the older version; plain pages are <strong>shared</strong> by both versions. Every update writes a whole root-to-leaf path (${lastWritten || 3} pages here) instead of one page, but the tree is never half-modified, so no WAL is needed, and readers never block or get blocked. A page is reclaimable once no live root (current or held by a reader) reaches it.`, `good`);
      };
      el.addEventListener(`click`, e => {
        const u = e.target.closest(`[data-up]`);
        if (u) { update(+u.dataset.up); draw(); return; }
        const b = e.target.closest(`[data-act]`); if (!b) return;
        const a = b.dataset.act;
        if (a === `reader`) { readers.push(cur().v); log.unshift([`info`, `reader started on version ${cur().v}`]); }
        else if (a === `finish`) { if (readers.length) { const m = Math.min(...readers); readers.splice(readers.indexOf(m), 1); log.unshift([`info`, `reader on version ${m} finished`]); } else log.unshift([`dup`, `no active readers`]); }
        else if (a === `reclaim`) { const g = garbage(); g.forEach(id => { pages[id].freed = true; }); freed += g.length; g.forEach(id => delete pages[id]); log.unshift([g.length ? `ok` : `dup`, g.length ? `reclaimed ${g.length} unreachable page${g.length > 1 ? `s` : ``}` : `nothing to reclaim: every page is reachable from a live root`]); roots = roots.filter(r => pages[r.id]); }
        else reset();
        log = log.slice(0, 30); draw();
      });
      reset(); draw();
    }
  };

  // =====================================================================
  // Ch6 - Bw-Tree delta chains
  // =====================================================================
  const BW_PAGE = 4096, BW_DELTA = 48;
  D.bwTree = {
    title: `Bw-Tree: delta chains, CAS and consolidation`,
    blurb: `A Bw-Tree never rewrites a page for a small change. It prepends a small <strong>delta node</strong> and swings the node's entry in the in-memory <strong>mapping table</strong> with a single <strong>compare-and-swap</strong>. If another writer won the race, the CAS fails and the update retries. Long chains make reads slower (every read walks the chain), so once the chain reaches a threshold the node is <strong>consolidated</strong> into a fresh base node.`,
    mount(el) {
      const st = { thr: 6, writers: 1 };
      let base, chain, stats, log, rnd;
      const reset = () => { base = [10, 20, 30, 40]; chain = []; stats = { updates: 0, cas: 0, fails: 0, cons: 0, bytes: 0, readHops: 0, reads: 0 }; log = []; rnd = mulberry32(11); };
      const view = () => { const s = new Set(base); chain.slice().reverse().forEach(d => { if (d.op === `insert`) s.add(d.key); else if (d.op === `delete`) s.delete(d.key); }); return [...s].sort((a, b) => a - b); };
      const consolidate = why => { base = view(); chain = []; stats.cons++; stats.bytes += BW_PAGE; log.unshift([`ok`, `consolidated (${why}): new base [${base.join(` `)}] installed with one CAS`]); };
      const update = (op, quiet) => {
        const cur = view();
        let key;
        if (op === `delete` && cur.length) key = cur[Math.floor(rnd() * cur.length)];
        else { op = `insert`; do { key = 5 * (1 + Math.floor(rnd() * 20)); } while (cur.includes(key) && cur.length < 20); }
        let tries = 0; const pFail = 1 - Math.pow(0.88, st.writers - 1);
        while (true) { tries++; stats.cas++; if (rnd() >= pFail || tries > 20) break; stats.fails++; }
        chain.unshift({ op, key }); stats.updates++; stats.bytes += BW_DELTA;
        stats.reads++; stats.readHops += chain.length + 1;
        if (!quiet) log.unshift([tries > 1 ? `dup` : `info`, `Δ ${op} ${key} prepended${tries > 1 ? ` after ${tries - 1} failed CAS` : ``}; chain length ${chain.length}`]);
        if (chain.length >= st.thr) consolidate(`chain reached ${st.thr}`);
      };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`consolidation threshold`, rng(`thr`, 2, 16, 1, st.thr))}${ctl(`concurrent writers`, rng(`writers`, 1, 8, 1, st.writers))}</div>
        <div class="ctl-row"><button class="lab-btn" data-act="ins">+ insert delta</button><button class="lab-btn ghost" data-act="del">+ delete delta</button><button class="lab-btn ghost" data-act="run">Run 200 updates</button><button class="lab-btn ghost" data-act="cons">Consolidate now</button><button class="lab-btn ghost" data-act="reset">Reset</button></div>
        <div class="lab-panel"><h4>Mapping table → logical node P7</h4><div data-k="chain"></div><div style="font-size:12px;margin-top:8px;color:var(--text-muted)" data-k="view"></div></div>
        <div class="lab-grid even" style="margin-top:12px">
          <div class="lab-panel"><h4>Threshold trade-off (steady state)</h4><div data-k="chart"></div><div class="legend"><span><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" class="svg-line"/></svg> bytes written per update</span><span><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" class="svg-line2"/></svg> nodes visited per read</span></div></div>
          <div class="lab-panel"><h4>Counters</h4><div class="stat-row" data-k="stats"></div><div class="log" data-k="log" style="margin-top:10px;max-height:150px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const arrow = `<span style="color:var(--text-muted);padding:0 3px">→</span>`;
        q(`chain`).innerHTML = `<div class="toks" style="align-items:center">${tok(`c3 hot`, `P7`)}${arrow}${chain.map(d => tok(d.op === `insert` ? `c5` : `c4`, `Δ ${d.op} ${d.key}`) + arrow).join(``)}${tok(`c1`, `base [${base.join(` `)}]`)}</div>`;
        q(`view`).innerHTML = `Logical contents (base + deltas applied): [${view().join(` `)}]`;
        const a = axes({ x0: 40, x1: 440, y0: 170, y1: 12, dx0: 1, dx1: 16, dy0: 0, dy1: 4200, xTicks: [1, 4, 8, 12, 16], yTicks: [0, 1000, 2000, 3000, 4000], yFmt: v => fmtNum(v, 0), xLabel: `threshold` });
        const bytes = [], hops = [];
        for (let t = 1; t <= 16; t += 0.25) { bytes.push([a.X(t), a.Y(BW_DELTA + BW_PAGE / t)]); hops.push([a.X(t), a.Y((t + 1) / 2 * 4200 / 9)]); }
        let s = a.svg + `<path class="svg-line" d="${path(bytes)}"/><path class="svg-line2" d="${path(hops)}"/>`;
        s += `<line x1="${a.X(st.thr)}" x2="${a.X(st.thr)}" y1="170" y2="12" style="stroke:var(--accent-3);stroke-dasharray:3 3"/>`;
        for (let h = 0; h <= 8; h += 2) s += `<text class="svg-label" x="446" y="${a.Y(h * 4200 / 9) + 3}" style="font-size:9px">${h}</text>`;
        q(`chart`).innerHTML = svgWrap(470, 200, s);
        const wa = stats.updates ? stats.bytes / stats.updates : 0;
        q(`stats`).innerHTML = stat(`updates`, stats.updates) + stat(`failed CAS`, stats.fails, stats.fails ? `bad` : ``) + stat(`consolidations`, stats.cons) + stat(`bytes / update`, stats.updates ? fmtNum(wa, 0) : `-`) + stat(`vs in-place page write`, stats.updates ? round(BW_PAGE / wa, 1) + `x less` : `-`, `good`) + stat(`avg read hops`, stats.reads ? round(stats.readHops / stats.reads, 1) : `-`);
        q(`log`).innerHTML = log.slice(0, 20).map(([c, t]) => `<div class="${c}">${esc(t)}</div>`).join(``) || `<div class="info">Add a delta.</div>`;
        q(`note`).innerHTML = note(`An in-place B-Tree would rewrite a ${BW_PAGE / 1024} KB page for each change. Here each update costs a ~${BW_DELTA} B delta plus 1/${st.thr} of a page for consolidation, so a threshold of ${st.thr} writes about ${fmtNum(BW_DELTA + BW_PAGE / st.thr, 0)} B per update, while reads walk ${round((st.thr + 1) / 2, 1)} nodes on average. ${st.writers > 1 ? `With ${st.writers} writers racing on the same node, some CAS operations fail and retry; nobody ever blocks on a latch.` : `Add writers to see CAS conflicts.`} The byte sizes are illustrative.`, `good`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`); if (!b) return;
        const a = b.dataset.act;
        if (a === `ins`) update(`insert`); else if (a === `del`) update(`delete`);
        else if (a === `run`) { for (let i = 0; i < 200; i++) update(rnd() < 0.6 ? `insert` : `delete`, true); log.unshift([`info`, `ran 200 updates`]); }
        else if (a === `cons`) { if (chain.length) consolidate(`manual`); else log.unshift([`dup`, `chain is empty`]); }
        else reset();
        log = log.slice(0, 40); draw();
      });
      wireRanges(el, st, { thr: v => v, writers: v => v }, draw);
      reset(); draw();
    }
  };

  // =====================================================================
  // Ch6 - Fractional cascading
  // =====================================================================
  const FC_A = [[12, 24, 32, 34, 39], [22, 25, 28, 30, 35], [11, 16, 24, 26, 30]];
  function fcBuild() {
    const aug = [null, null, FC_A[2].map(v => ({ v, br: false }))];
    for (let i = 1; i >= 0; i--) {
      const pulled = FC_A[i + 1].filter((_, j) => j % 2 === 1).map(v => ({ v, br: true }));
      aug[i] = FC_A[i].map(v => ({ v, br: false })).concat(pulled).sort((a, b) => a.v - b.v || (a.br ? 1 : -1));
      aug[i].forEach(e => { if (e.br) e.to = aug[i + 1].findIndex(x => x.v === e.v && !x.br); });
    }
    return aug;
  }
  function fcBin(arr, key) { let lo = 0, hi = arr.length, c = 0; while (lo < hi) { const mid = (lo + hi) >> 1; c++; if (arr[mid] < key) lo = mid + 1; else hi = mid; } return [lo, c]; }
  D.fractionalCascading = {
    title: `Fractional cascading: searching many sorted runs`,
    blurb: `The book's three sorted arrays. Searching each one separately costs a binary search per array. With <strong>fractional cascading</strong>, every other element of the next array is copied up as a <strong>bridge</strong> that remembers its position below. After one binary search at the top, each lower level needs only a couple of comparisons near the bridge. FD-Trees use this to search their immutable sorted runs.`,
    mount(el) {
      const st = { key: 26, mode: `bridge` };
      const aug = fcBuild();
      el.innerHTML = `
        <div class="ctl-row">${ctl(`search key`, rng(`key`, 10, 40, 1, st.key))}${ctl(`mode`, seg(`mode`, [[`plain`, `separate binary searches`], [`bridge`, `with bridges`]], st.mode))}</div>
        <div class="lab-panel"><h4 data-k="h"></h4><div data-k="svg"></div><div class="legend"><span>${chip(`final`, `original element`)}</span><span>${chip(`early`, `bridge (copied from below)`)}</span><span>${chip(`ok`, `first element ≥ key`)}</span></div></div>
        <div class="lab-grid even" style="margin-top:12px">
          <div class="lab-panel"><h4>This search</h4><div data-k="tbl"></div></div>
          <div class="lab-panel"><h4>At scale (k arrays of n elements)</h4><div data-k="scale"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const key = st.key, plain = FC_A.map(a => fcBin(a, key));
        let found = [], cmpB = 0, pos = [];
        const [p0, c0] = fcBin(aug[0].map(e => e.v), key); cmpB += c0; pos[0] = p0;
        for (let i = 0; i < 3; i++) {
          if (i > 0) {
            const prev = aug[i - 1], br = prev.slice(pos[i - 1]).find(e => e.br);
            let qd = br ? br.to : aug[i].length;
            while (qd > 0) { cmpB++; if (aug[i][qd - 1].v >= key) qd--; else break; }
            pos[i] = qd;
          }
          const arr = aug[i], j = arr.slice(pos[i]).findIndex(e => !e.br);
          found[i] = j < 0 ? null : arr[pos[i] + j].v;
        }
        const ok = found.every((v, i) => v === (FC_A[i][plain[i][0]] ?? null));
        const BW = 34, rows = st.mode === `bridge` ? aug : FC_A.map(a => a.map(v => ({ v, br: false })));
        let s = ``;
        const X = (i, j) => 60 + j * (BW + 6), Y = i => 14 + i * 64;
        if (st.mode === `bridge`) rows.forEach((r, i) => r.forEach((e, j) => { if (e.br && i < 2) s += `<line class="bt-link ${i < 2 && pos[i] <= j && rows[i].slice(pos[i]).find(x => x.br) === e ? `hot` : ``}" x1="${X(i, j) + BW / 2}" y1="${Y(i) + 24}" x2="${X(i + 1, e.to) + BW / 2}" y2="${Y(i + 1)}"/>`; }));
        rows.forEach((r, i) => {
          s += `<text class="svg-label" x="8" y="${Y(i) + 16}">A${i + 1}${st.mode === `bridge` && i < 2 ? `'` : ``}</text>`;
          const hit = st.mode === `bridge` ? (() => { const j = r.slice(pos[i]).findIndex(e => !e.br); return j < 0 ? -1 : pos[i] + j; })() : plain[i][0];
          r.forEach((e, j) => {
            const fill = j === hit ? `rgba(34,197,94,.45)` : e.br ? `rgba(245,158,11,.3)` : `rgba(59,130,246,.22)`;
            s += `<rect x="${X(i, j)}" y="${Y(i)}" width="${BW}" height="24" rx="4" style="fill:${fill};stroke:${j === hit ? `var(--good)` : `var(--border)`}"/><text class="bt-key" x="${X(i, j) + BW / 2}" y="${Y(i) + 12}">${e.v}</text>`;
          });
          if (hit < 0 || hit >= r.length) s += `<text class="svg-label" x="${X(i, r.length) + 4}" y="${Y(i) + 16}" style="fill:var(--good)">end (no element ≥ ${key})</text>`;
        });
        q(`svg`).innerHTML = svgWrap(420, 190, s);
        q(`h`).textContent = st.mode === `bridge` ? `Augmented arrays: A1' and A2' include bridges from the level below` : `Original arrays`;
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th></th>${[1, 2, 3].map(i => `<th class="num">A${i}</th>`).join(``)}<th class="num">comparisons</th></tr>
          <tr><td>separate searches</td>${plain.map((p, i) => `<td class="num">${FC_A[i][p[0]] ?? `end`}</td>`).join(``)}<td class="num">${sum(plain.map(p => p[1]))}</td></tr>
          <tr class="new"><td>with bridges</td>${found.map(v => `<td class="num">${v ?? `end`}</td>`).join(``)}<td class="num">${cmpB}</td></tr></table>
          <div style="margin-top:8px">${ok ? chip(`ok`, `same answers`) : chip(`no`, `mismatch`)}</div>`;
        const sc = [[5, 1e3], [5, 1e6], [20, 1e6]].map(([k, n]) => { const plainC = k * Math.ceil(Math.log2(n + 1)), br = Math.ceil(Math.log2(2 * n + 1)) + 2 * (k - 1); return `<tr><td>${k} × ${fmtNum(n)}</td><td class="num">${plainC}</td><td class="num">~${br}</td></tr>`; }).join(``);
        q(`scale`).innerHTML = `<table class="mini-table"><tr><th>arrays</th><th class="num">separate</th><th class="num">cascaded</th></tr>${sc}</table><div class="cs-note" style="margin-top:6px">Separate: k·log<sub>2</sub>n. Cascaded: one search of a ~2n array, then a constant number of steps per level.</div>`;
        q(`note`).innerHTML = note(st.mode === `bridge` ? `As in the book, A2' = A2 plus A3's odd-position elements (16, 26) and A1' = A1 plus A2's odd-position elements (25, 30). After binary searching A1', the first bridge at or after the found position points into A2', where at most a step or two is needed, and so on down. On three five-element arrays the saving is small; with many long runs it is large.` : `Each array is binary searched on its own: ${plain.map(p => p[1]).join(` + `)} = ${sum(plain.map(p => p[1]))} comparisons. Switch to bridges to search only the top level.`, `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { key: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch6 - van Emde Boas layout
  // =====================================================================
  function vebOrder(h) {
    const out = [];
    const rec = (root, hh) => {
      if (hh === 1) { out.push(root); return; }
      const top = Math.floor(hh / 2), bot = hh - top;
      rec(root, top);
      const start = root * Math.pow(2, top);
      for (let i = 0; i < Math.pow(2, top); i++) rec(start + i, bot);
    };
    rec(1, h);
    return out;
  }
  function vebPositions(h, layout) {
    const n = Math.pow(2, h) - 1, pos = {};
    if (layout === `bfs`) for (let i = 1; i <= n; i++) pos[i] = i - 1;
    else if (layout === `veb`) vebOrder(h).forEach((node, i) => { pos[node] = i; });
    else { let c = 0; const ino = i => { if (i > n) return; ino(2 * i); pos[i] = c++; ino(2 * i + 1); }; ino(1); }
    return pos;
  }
  const VEB_LAY = { bfs: `breadth-first`, veb: `van Emde Boas`, inorder: `sorted (in-order)` };
  D.vebLayout = {
    title: `Cache-oblivious layout: van Emde Boas vs breadth-first`,
    blurb: `A complete binary tree stored in a flat array, read in blocks of B nodes. Each node's label is its position in memory and its colour is the block it lands in. The <strong>van Emde Boas</strong> layout cuts the tree at half its height, stores the top subtree contiguously, then each bottom subtree, recursively. A root-to-leaf path then touches few blocks <em>for any block size</em>, without knowing B in advance.`,
    mount(el) {
      const st = { h: 4, B: 3, lay: `veb`, leaf: 5 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`tree height`, seg(`h`, [[4, `4 (15 nodes)`], [5, `5 (31 nodes)`]], st.h))}${ctl(`block size B`, seg(`B`, [[2, `2`], [3, `3`], [4, `4`], [7, `7`], [8, `8`]], st.B))}${ctl(`layout`, seg(`lay`, Object.keys(VEB_LAY).map(k => [k, VEB_LAY[k]]), st.lay))}</div>
        <div class="ctl-row">${ctl(`search for leaf #`, rng(`leaf`, 0, 15, 1, st.leaf))}</div>
        <div class="lab-panel"><h4>Tree (label = array position, colour = block)</h4><div data-k="svg"></div><h4 style="margin-top:8px">Memory</h4><div data-k="mem"></div></div>
        <div class="lab-grid even" style="margin-top:12px"><div class="lab-panel"><h4>Blocks per root-to-leaf path (average over all leaves)</h4><div data-k="cmp"></div></div><div data-k="note"></div></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const blocksFor = (h, B, lay, leaf) => { const pos = vebPositions(h, lay); let i = Math.pow(2, h - 1) + leaf; const s = new Set(); while (i >= 1) { s.add(Math.floor(pos[i] / B)); i = i >> 1; } return s.size; };
      const draw = () => {
        const leaves = Math.pow(2, st.h - 1); st.leaf = Math.min(st.leaf, leaves - 1);
        const inp = el.querySelector(`input[data-rng="leaf"]`); inp.max = leaves - 1; inp.value = st.leaf; el.querySelector(`[data-rv="leaf"]`).textContent = st.leaf;
        const pos = vebPositions(st.h, st.lay), n = Math.pow(2, st.h) - 1;
        const onPath = new Set(); let i = leaves + st.leaf; while (i >= 1) { onPath.add(i); i >>= 1; }
        const W = 620, LH = 46;
        let s = ``;
        const xy = idx => { const d = Math.floor(Math.log2(idx)), k = idx - Math.pow(2, d); return [W * (k + 0.5) / Math.pow(2, d), 18 + d * LH]; };
        for (let idx = 2; idx <= n; idx++) { const [x1, y1] = xy(idx >> 1), [x2, y2] = xy(idx); s += `<line class="bt-link ${onPath.has(idx) ? `hot` : ``}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }
        for (let idx = 1; idx <= n; idx++) {
          const [x, y] = xy(idx), b = Math.floor(pos[idx] / st.B);
          s += `<circle cx="${x}" cy="${y}" r="${st.h === 5 ? 11 : 13}" style="fill:${PALETTE[b % 6]};stroke:${onPath.has(idx) ? `var(--accent-3)` : `var(--border)`};stroke-width:${onPath.has(idx) ? 3 : 1}"/><text class="bt-key" x="${x}" y="${y}" style="font-size:${st.h === 5 ? 9 : 10}px">${pos[idx]}</text>`;
        }
        q(`svg`).innerHTML = svgWrap(W, 18 + (st.h - 1) * LH + 18, s);
        const inv = []; Object.keys(pos).forEach(k => { inv[pos[k]] = +k; });
        q(`mem`).innerHTML = `<div class="bytes">${inv.map((node, p) => `<span class="byte ${onPath.has(node) ? `hot` : ``}" style="background:${PALETTE[Math.floor(p / st.B) % 6]};min-width:22px">${p}<small>b${Math.floor(p / st.B)}</small></span>`).join(``)}</div>`;
        const touched = blocksFor(st.h, st.B, st.lay, st.leaf);
        const avg = lay => sum(Array.from({ length: leaves }, (_, l) => blocksFor(st.h, st.B, lay, l))) / leaves;
        const A = Object.keys(VEB_LAY).map(l => ({ l, v: avg(l) })), best = Math.min(...A.map(a => a.v));
        q(`cmp`).innerHTML = hbars(A.map(a => ({ label: VEB_LAY[a.l], value: a.v, text: round(a.v, 2), cls: a.v === best ? `good` : a.l === st.lay ? `` : `muted` })), st.h) + `<div class="stat-row" style="margin-top:8px">${stat(`path length`, st.h + ` nodes`)}${stat(`blocks touched now`, touched, touched <= Math.ceil(st.h / Math.max(1, Math.floor(Math.log2(st.B + 1)))) ? `good` : `bad`)}</div>`;
        q(`note`).innerHTML = note(st.lay === `veb` ? `With B = ${st.B}, vEB packs small subtrees into blocks, so a path crosses roughly log<sub>B</sub>N blocks. It does this without ever being told B: try other block sizes and it stays close to the best layout.` : st.lay === `bfs` ? `Breadth-first keeps the top levels together, but deeper levels spread out: below the first few levels every node on the path tends to land in a different block.` : `A sorted (in-order) array is great for binary search on a whole array, but tree paths jump around, so nearly every step lands in a new block.`, st.lay === `veb` ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { leaf: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - LSM Tree with leveled / size-tiered compaction
  // =====================================================================
  const LSM_KEYS = 40;
  function bloomMake(keys) { const m = Math.max(8, keys.length * 10), bits = new Uint8Array(m), hs = k => [0, 1, 2].map(i => ((k * 2654435761 + i * 40503 * (k ^ 0x5bd1)) >>> 0) % m); keys.forEach(k => hs(k).forEach(b => { bits[b] = 1; })); return { has: k => hs(k).every(b => bits[b]) }; }
  D.lsmTree = {
    title: `LSM Tree: memtable, flushes, compaction and lookups`,
    blurb: `Writes go to a sorted in-memory <strong>memtable</strong> (and a WAL). When it fills, it is flushed as an immutable sorted table. <strong>Leveled</strong> compaction (RocksDB) keeps levels 1+ as non-overlapping key ranges, each level ~3x bigger than the last here. <strong>Size-tiered</strong> compaction (Cassandra) merges tables of similar size. Deletes write <strong>tombstones</strong>; lookups check tables newest-first and can skip tables using <strong>Bloom filters</strong>. Rectangles are drawn over the key range they cover (keys 1-${LSM_KEYS}).`,
    mount(el) {
      const st = { comp: `leveled`, cap: 6, bloom: `on`, wl: `uniform` };
      let mem, tables, seq, tid, user, disk, log, rnd, last;
      const reset = () => { mem = new Map(); tables = []; seq = 0; tid = 1; user = 0; disk = 0; log = []; rnd = mulberry32(5); last = null; };
      const mkTable = (entries, level) => { disk += entries.length; return { id: tid++, level, entries, min: entries[0].k, max: entries[entries.length - 1].k, bloom: bloomMake(entries.map(e => e.k)), newest: Math.max(...entries.map(e => e.seq)) }; };
      const mergeE = (ts, others) => {
        const best = new Map();
        ts.forEach(t => t.entries.forEach(e => { const b = best.get(e.k); if (!b || e.seq > b.seq) best.set(e.k, e); }));
        let dropped = 0;
        const out = [...best.values()].filter(e => { if (!e.del) return true; if (others.some(t => e.k >= t.min && e.k <= t.max && t.entries.some(x => x.k === e.k))) return true; dropped++; return false; }).sort((a, b) => a.k - b.k);
        return { out, dropped, shadowed: sum(ts.map(t => t.entries.length)) - best.size };
      };
      const LV0 = 2, RATIO = 3, base = () => st.cap * 2;
      const compact = () => {
        for (let guard = 0; guard < 20; guard++) {
          if (st.comp === `leveled`) {
            const l0 = tables.filter(t => t.level === 0);
            let src = null, lvl = 0;
            if (l0.length > LV0) { src = l0; lvl = 0; }
            else {
              for (let L = 1; L < 6; L++) { const lt = tables.filter(t => t.level === L); if (sum(lt.map(t => t.entries.length)) > base() * Math.pow(RATIO, L - 1)) { src = [lt.reduce((a, b) => a.newest < b.newest ? a : b)]; lvl = L; break; } }
            }
            if (!src) return;
            const lo = Math.min(...src.map(t => t.min)), hi = Math.max(...src.map(t => t.max));
            const overl = tables.filter(t => t.level === lvl + 1 && t.max >= lo && t.min <= hi), inputs = src.concat(overl);
            const others = tables.filter(t => !inputs.includes(t));
            const { out, dropped, shadowed } = mergeE(inputs, others);
            tables = others;
            for (let i = 0; i < out.length; i += st.cap) tables.push(mkTable(out.slice(i, i + st.cap), lvl + 1));
            log.unshift([`ok`, `compact L${lvl}→L${lvl + 1}: merged ${inputs.length} tables (${sum(inputs.map(t => t.entries.length))} entries) into ${Math.ceil(out.length / st.cap) || 0}; ${shadowed} old versions and ${dropped} tombstones dropped`]);
          } else {
            const tier = t => Math.max(0, Math.floor(Math.log(t.entries.length / st.cap + 1e-9) / Math.log(3) + 0.35));
            const byTier = {}; tables.forEach(t => { t.level = tier(t); (byTier[t.level] = byTier[t.level] || []).push(t); });
            const full = Object.keys(byTier).map(Number).sort((a, b) => a - b).find(k => byTier[k].length >= 3);
            if (full === undefined) return;
            const inputs = byTier[full], others = tables.filter(t => !inputs.includes(t));
            const { out, dropped, shadowed } = mergeE(inputs, others);
            tables = others;
            if (out.length) { const t = mkTable(out, 0); t.level = tier(t); tables.push(t); }
            log.unshift([`ok`, `size-tiered: merged ${inputs.length} tables of tier ${full} into one of ${out.length} entries; ${shadowed} old versions and ${dropped} tombstones dropped`]);
          }
        }
      };
      const flush = () => {
        if (!mem.size) return;
        const entries = [...mem.entries()].map(([k, e]) => ({ k, ...e })).sort((a, b) => a.k - b.k);
        const t = mkTable(entries, 0); tables.push(t); mem = new Map();
        log.unshift([`info`, `memtable full: flushed table #${t.id} (${entries.length} entries, keys ${t.min}-${t.max}) to ${st.comp === `leveled` ? `L0` : `tier 0`}; WAL segment can be dropped`]);
        compact();
      };
      const pick = () => st.wl === `hot` && rnd() < 0.8 ? 1 + Math.floor(rnd() * 8) : 1 + Math.floor(rnd() * LSM_KEYS);
      const put = (k, del) => { mem.set(k, { seq: ++seq, del: !!del }); user++; if (mem.size >= st.cap) flush(); };
      const order = () => st.comp === `leveled` ? tables.slice().sort((a, b) => a.level - b.level || b.newest - a.newest) : tables.slice().sort((a, b) => b.newest - a.newest);
      const get = k => {
        const r = { k, probes: 0, skipped: 0, fp: 0, val: null, src: null };
        if (mem.has(k)) { const e = mem.get(k); r.val = e.del ? `deleted` : `v` + e.seq; r.src = `memtable`; return r; }
        for (const t of order()) {
          if (k < t.min || k > t.max) continue;
          if (st.bloom === `on` && !t.bloom.has(k)) { r.skipped++; continue; }
          r.probes++;
          const e = t.entries.find(x => x.k === k);
          if (e) { r.val = e.del ? `deleted (tombstone)` : `v` + e.seq; r.src = `table #${t.id}`; return r; }
          if (st.bloom === `on`) r.fp++;
        }
        r.val = `not found`; return r;
      };
      const liveKeys = () => { const best = new Map(); tables.forEach(t => t.entries.forEach(e => { const b = best.get(e.k); if (!b || e.seq > b.seq) best.set(e.k, e); })); mem.forEach((e, k) => best.set(k, { k, ...e })); return [...best.values()].filter(e => !e.del).length; };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`compaction`, seg(`comp`, [[`leveled`, `leveled`], [`tiered`, `size-tiered`]], st.comp))}${ctl(`memtable size`, seg(`cap`, [[4, `4`], [6, `6`], [8, `8`]], st.cap))}${ctl(`Bloom filters`, seg(`bloom`, [[`on`, `on`], [`off`, `off`]], st.bloom))}${ctl(`keys`, seg(`wl`, [[`uniform`, `uniform`], [`hot`, `80% on keys 1-8`]], st.wl))}</div>
        <div class="ctl-row"><button class="lab-btn" data-act="put1">put ×1</button><button class="lab-btn ghost" data-act="put20">put ×20</button><button class="lab-btn ghost" data-act="del5">delete ×5</button><button class="lab-btn ghost" data-act="get">get random key</button><button class="lab-btn ghost" data-act="get50">50 random gets</button><button class="lab-btn ghost" data-act="reset">Reset</button></div>
        <div class="lab-panel"><h4>Structure</h4><div data-k="svg"></div></div>
        <div class="lab-grid even" style="margin-top:12px">
          <div class="lab-panel"><h4>Amplification</h4><div class="stat-row" data-k="stats"></div><div data-k="get" style="margin-top:10px"></div></div>
          <div class="lab-panel"><h4>Log</h4><div class="log" data-k="log"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const W = 600, X0 = 70, X = k => X0 + (k - 1) / (LSM_KEYS - 1) * (W - X0 - 14);
        let s = ``, y = 8;
        s += `<text class="svg-label" x="4" y="${y + 13}">memtable</text>`;
        [...mem.keys()].forEach(k => { const e = mem.get(k); s += `<rect x="${X(k) - 3}" y="${y + 2}" width="6" height="16" rx="1" style="fill:${e.del ? `var(--bad)` : `var(--accent-3)`}"/>`; });
        s += `<text class="svg-label" x="${W - 4}" y="${y + 13}" text-anchor="end" style="font-size:9px">${mem.size}/${st.cap}</text>`;
        y += 28;
        const levels = [...new Set(tables.map(t => t.level))].sort((a, b) => a - b);
        const maxL = Math.max(st.comp === `leveled` ? 2 : 1, ...levels, 0);
        for (let L = 0; L <= maxL; L++) {
          const lt = tables.filter(t => t.level === L).sort((a, b) => a.min - b.min || b.newest - a.newest);
          const lanes = [];
          lt.forEach(t => { let ln = lanes.findIndex(end => end < t.min); if (ln < 0) { lanes.push(0); ln = lanes.length - 1; } lanes[ln] = t.max; t._lane = ln; });
          const nl = Math.max(1, lanes.length), hgt = nl * 20 + 6;
          s += `<line class="svg-grid" x1="0" x2="${W}" y1="${y - 3}" y2="${y - 3}"/><text class="svg-label" x="4" y="${y + 14}">${st.comp === `leveled` ? `L` + L : `tier ` + L}</text>`;
          if (st.comp === `leveled` && L > 0) s += `<text class="svg-label" x="4" y="${y + 26}" style="font-size:8.5px">cap ${base() * Math.pow(RATIO, L - 1)}</text>`;
          lt.forEach(t => {
            const tomb = t.entries.filter(e => e.del).length, x1 = X(t.min) - 4, x2 = X(t.max) + 4, yy = y + t._lane * 20;
            s += `<rect x="${x1}" y="${yy}" width="${Math.max(8, x2 - x1)}" height="16" rx="3" style="fill:${last && last.hitT === t.id ? `rgba(34,197,94,.5)` : `rgba(56,189,248,.28)`};stroke:var(--accent-2)"/>`;
            s += `<text class="bt-key" x="${(x1 + x2) / 2}" y="${yy + 8}" style="font-size:9px">#${t.id}·${t.entries.length}${tomb ? `·${tomb}✝` : ``}</text>`;
          });
          y += hgt;
        }
        s += `<g class="svg-axis">${[1, 10, 20, 30, 40].map(k => `<text x="${X(k)}" y="${y + 10}" text-anchor="middle">${k}</text>`).join(``)}</g>`;
        q(`svg`).innerHTML = svgWrap(W, y + 16, s);
        const onDisk = sum(tables.map(t => t.entries.length)), live = liveKeys();
        q(`stats`).innerHTML = stat(`user writes`, user) + stat(`entries written to disk`, disk) + stat(`write amplification`, user ? round(disk / user, 2) : `-`, user && disk / user > 3 ? `bad` : ``) + stat(`tables`, tables.length) + stat(`space amplification`, live ? round((onDisk + mem.size) / live, 2) : `-`) ;
        q(`get`).innerHTML = last ? (last.avg ? `<div class="stat-row">${stat(`avg tables read per get`, round(last.avg, 2), last.avg > 2 ? `bad` : `good`)}${stat(`avg skipped by Bloom`, round(last.skip, 2))}${stat(`Bloom false positives`, last.fpTotal)}</div>` : `<div style="font-size:12.5px">get(${last.k}) → <b>${last.val}</b> ${last.src ? `from ${last.src}` : ``}: ${last.probes} table${last.probes === 1 ? `` : `s`} read, ${last.skipped} skipped by Bloom filter${last.fp ? `, ${last.fp} false positive` : ``}</div>`) : `<div class="cs-note">Run a get to measure read amplification.</div>`;
        q(`log`).innerHTML = log.slice(0, 25).map(([c, t]) => `<div class="${c}">${esc(t)}</div>`).join(``) || `<div class="info">Put some keys.</div>`;
        q(`note`).innerHTML = note(st.comp === `leveled` ? `Leveled: from L1 down each level is a set of non-overlapping tables, so a lookup reads at most one table per level. The price is rewriting data each time it moves down a level: watch write amplification climb. Tombstones are dropped once no table outside the merge still holds the key.` : `Size-tiered: tables of similar size are merged once three accumulate, so each entry is rewritten fewer times (lower write amplification), but tables overlap and a lookup may have to check many of them. Bloom filters hide most of that cost for point lookups.`, `good`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`); if (!b) return;
        const a = b.dataset.act;
        if (a === `put1`) { const k = pick(); put(k); log.unshift([`info`, `put ${k} → memtable (and WAL)`]); last = null; }
        else if (a === `put20`) { for (let i = 0; i < 20; i++) put(pick()); last = null; }
        else if (a === `del5`) { for (let i = 0; i < 5; i++) { const k = pick(); put(k, true); } log.unshift([`dup`, `5 deletes written as tombstones`]); last = null; }
        else if (a === `get`) { const k = pick(), r = get(k); const t = tables.find(x => r.src === `table #${x.id}`); last = { ...r, hitT: t ? t.id : null }; }
        else if (a === `get50`) { let p = 0, sk = 0, fp = 0; for (let i = 0; i < 50; i++) { const r = get(pick()); p += r.probes; sk += r.skipped; fp += r.fp; } last = { avg: p / 50, skip: sk / 50, fpTotal: fp }; }
        else reset();
        log = log.slice(0, 40); draw();
      });
      wireSegs(el, st, () => { reset(); for (let i = 0; i < 40; i++) put(pick()); log.unshift([`info`, `reset and preloaded 40 random puts`]); draw(); });
      reset(); for (let i = 0; i < 40; i++) put(pick()); log.unshift([`info`, `preloaded 40 random puts`]); draw();
    }
  };

  // =====================================================================
  // Ch7 - Merge-iteration with a priority queue
  // =====================================================================
  const MI_SETS = {
    book: { label: `book example`, src: [{ n: `Iterator 1`, ts: 1, items: [[`k2`, `v1`], [`k4`, `v2`]] }, { n: `Iterator 2`, ts: 2, items: [[`k1`, `v3`], [`k2`, `v4`], [`k3`, `v5`]] }] },
    tomb: { label: `with a tombstone`, src: [{ n: `Iterator 1`, ts: 1, items: [[`k2`, `v1`], [`k3`, `v6`], [`k4`, `v2`]] }, { n: `Iterator 2`, ts: 2, items: [[`k1`, `v3`], [`k2`, `v4`], [`k3`, null]] }] },
    range: { label: `with a range tombstone`, src: [{ n: `Iterator 1`, ts: 1, items: [[`k2`, `v1`], [`k4`, `v2`]] }, { n: `Iterator 2`, ts: 2, items: [[`k1`, `v3`], [`k2`, `v4`], [`k3`, `v5`]] }], range: { from: `k2`, to: `k4`, ts: 3 } }
  };
  function miSteps(set) {
    const cur = set.src.map(() => 0), pq = [], out = [], steps = [];
    const snap = desc => steps.push({ desc, rem: set.src.map((s, i) => s.items.slice(cur[i])), pq: pq.slice().sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : b.ts - a.ts), out: out.slice() });
    const refill = i => { if (cur[i] < set.src[i].items.length) { const [k, v] = set.src[i].items[cur[i]++]; pq.push({ k, v, src: i, ts: set.src[i].ts }); } };
    snap(`Start: each iterator is sorted by key; the priority queue is empty.`);
    set.src.forEach((_, i) => refill(i));
    snap(`Fill the priority queue with the head of every iterator.`);
    while (pq.length) {
      pq.sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : b.ts - a.ts);
      const k = pq[0].k, same = pq.filter(e => e.k === k);
      same.forEach(e => pq.splice(pq.indexOf(e), 1));
      const win = same[0];
      const hidden = set.range && k >= set.range.from && k < set.range.to && set.range.ts > win.ts;
      let desc;
      if (hidden) desc = `${k} is covered by the range tombstone [${set.range.from}, ${set.range.to}) written later (ts ${set.range.ts}): hidden.`;
      else if (win.v === null) desc = `${k}: newest record (from ${set.src[win.src].n}) is a tombstone, so the key is deleted and nothing is emitted${same.length > 1 ? `; the older value is shadowed` : ``}.`;
      else { out.push({ k, v: win.v }); desc = same.length > 1 ? `Two records for ${k} (${same.map(e => `${e.v ?? `tombstone`} from ${set.src[e.src].n}`).join(`, `)}): reconcile by timestamp, keep ${win.v} from the newer ${set.src[win.src].n}.` : `${k}:${win.v} is the smallest key in the queue: append it to the result.`; }
      same.forEach(e => refill(e.src));
      snap(desc + ` Refill from ${[...new Set(same.map(e => set.src[e.src].n))].join(` and `)}.`);
    }
    snap(`All iterators and the queue are empty. Merged result: ${out.map(e => `${e.k}:${e.v}`).join(`, `) || `(empty)`}.`);
    return steps;
  }
  D.mergeIteration = {
    title: `Merge-iteration: combining sorted tables with a priority queue`,
    blurb: `Step through the book's example: two iterators over disk-resident tables, Iterator 1 = {k2:v1} {k4:v2} and Iterator 2 = {k1:v3} {k2:v4} {k3:v5}, where Iterator 2 is newer. The <strong>min-heap</strong> always yields the smallest key; records with the same key come from different tables and are <strong>reconciled</strong> by timestamp. Variants add a tombstone and a range tombstone [k2, k4).`,
    mount(el) {
      const st = { set: `book` };
      let steps, cur;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`input`, seg(`set`, Object.keys(MI_SETS).map(k => [k, MI_SETS[k].label]), st.set))}</div>
        <div class="ctl-row"><button class="lab-btn" data-act="next">Next step</button><button class="lab-btn ghost" data-act="prev">Back</button><button class="lab-btn ghost" data-act="end">Run to end</button><button class="lab-btn ghost" data-act="first">Restart</button><span data-k="pos" style="font-size:12px;color:var(--text-muted)"></span></div>
        <div class="lab-grid three" data-k="cols"></div>
        <div data-k="note" style="margin-top:12px"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const rec = (k, v, cls) => tok(cls, `{${k}: ${v === null ? `✝ tombstone` : v}}`);
      const reset = () => { steps = miSteps(MI_SETS[st.set]); cur = 0; };
      const draw = () => {
        const set = MI_SETS[st.set], s = steps[cur];
        q(`pos`).textContent = `step ${cur + 1} of ${steps.length}`;
        const srcs = set.src.map((src, i) => `<div style="margin-bottom:8px"><div style="font-size:11px;color:var(--text-muted)">${src.n} (ts ${src.ts}${i === set.src.length - 1 ? `, newer` : ``})</div><div class="toks">${s.rem[i].length ? s.rem[i].map(([k, v]) => rec(k, v, `c${i}`)).join(``) : `<span class="cs-note">{} exhausted</span>`}</div></div>`).join(``) + (set.range ? `<div><div style="font-size:11px;color:var(--text-muted)">range tombstone (ts ${set.range.ts})</div><div class="toks">${tok(`c4`, `delete [${set.range.from}, ${set.range.to})`)}</div></div>` : ``);
        q(`cols`).innerHTML = `<div class="lab-panel"><h4>Iterators</h4>${srcs}</div>
          <div class="lab-panel"><h4>Priority queue (min-heap)</h4><div class="toks" style="flex-direction:column;align-items:flex-start">${s.pq.length ? s.pq.map((e, j) => rec(e.k, e.v, `c${e.src}` + (j === 0 ? ` hot` : ``))).join(``) : `<span class="cs-note">empty</span>`}</div></div>
          <div class="lab-panel"><h4>Merged result</h4><div class="toks">${s.out.length ? s.out.map(e => rec(e.k, e.v, `c5`)).join(``) : `<span class="cs-note">empty</span>`}</div></div>`;
        q(`note`).innerHTML = note(s.desc + (cur === steps.length - 1 ? ` The same procedure drives point lookups, range scans and compaction; with M sources it costs O(log M) per record.` : ``), cur === steps.length - 1 ? `good` : ``);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`); if (!b) return;
        const a = b.dataset.act;
        cur = clamp(a === `next` ? cur + 1 : a === `prev` ? cur - 1 : a === `end` ? steps.length - 1 : 0, 0, steps.length - 1); draw();
      });
      wireSegs(el, st, () => { reset(); draw(); });
      reset(); draw();
    }
  };

  // =====================================================================
  // Ch7 - Bloom filter
  // =====================================================================
  const BF_BOOK = { key1: [3, 5, 10], key2: [5, 8, 14], key3: [3, 10, 14], key4: [5, 9, 15] };
  const bfHash = (x, seed) => { let h = (x ^ seed) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
  D.bloomFilter = {
    title: `Bloom filter: "definitely not" or "maybe"`,
    blurb: `The book's example first: a 16-bit array and 3 hash functions. key1 sets bits 3, 5, 10 and key2 sets 5, 8, 14. Query key3 (bits 3, 10, 14) and you get a <strong>false positive</strong>: every bit was set by other keys. key4 (5, 9, 15) hits a zero bit, so it is <strong>definitely absent</strong>. Then switch to the scale view and tune bits per key and hash count against the false positive rate.`,
    mount(el) {
      const st = { mode: `book`, added: `both`, qk: `key3`, bpk: 10, k: 3 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`view`, seg(`mode`, [[`book`, `book example (16 bits)`], [`scale`, `at scale`]], st.mode))}</div>
        <div data-k="body"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const drawBody = () => {
        if (st.mode === `book`) q(`body`).innerHTML = `<div class="ctl-row">${ctl(`keys added`, seg(`added`, [[`none`, `none`], [`one`, `key1`], [`both`, `key1 + key2`]], st.added))}${ctl(`query`, seg(`qk`, [[`key1`, `key1`], [`key3`, `key3`], [`key4`, `key4`]], st.qk))}</div><div class="lab-panel"><h4>Bit array</h4><div data-k="bits"></div></div><div data-k="res" style="margin-top:12px"></div>`;
        else q(`body`).innerHTML = `<div class="ctl-row">${ctl(`bits per key (m/n)`, rng(`bpk`, 2, 20, 1, st.bpk))}${ctl(`hash functions k`, rng(`k`, 1, 12, 1, st.k))}</div><div class="lab-grid"><div class="lab-panel"><h4>False positive rate vs k</h4><div data-k="chart"></div><div class="legend"><span><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" class="svg-line"/></svg> theory (1 − e<sup>−kn/m</sup>)<sup>k</sup></span><span>● measured</span></div></div><div class="lab-panel"><h4>n = 1,000 keys, 20,000 negative lookups</h4><div class="stat-row" data-k="stats"></div></div></div><div data-k="res" style="margin-top:12px"></div>`;
        wireSegs(q(`body`), st, draw);
        wireRanges(q(`body`), st, { bpk: v => v, k: v => v }, draw);
      };
      const draw = () => {
        if (st.mode === `book`) {
          const keys = st.added === `none` ? [] : st.added === `one` ? [`key1`] : [`key1`, `key2`];
          const bits = Array(16).fill(0), by = {};
          keys.forEach(k => BF_BOOK[k].forEach(b => { bits[b] = 1; (by[b] = by[b] || []).push(k); }));
          const qb = BF_BOOK[st.qk];
          q(`bits`).innerHTML = `<div class="bytes">${bits.map((v, i) => `<span class="byte ${v ? `c0` : ``} ${qb.includes(i) ? (v ? `hot` : `bad`) : ``}" style="min-width:30px">${v}<small>${i}</small></span>`).join(``)}</div><div class="cs-note" style="margin-top:8px">${keys.map(k => `${k} → bits ${BF_BOOK[k].join(`, `)}`).join(` · `) || `empty filter`}. Queried bits (${st.qk} → ${qb.join(`, `)}) are outlined.</div>`;
          const all = qb.every(b => bits[b]), member = keys.includes(st.qk);
          const res = !all ? [`ok`, `definitely not in the set`, `Bit ${qb.filter(b => !bits[b]).join(` and `)} ${qb.filter(b => !bits[b]).length > 1 ? `are` : `is`} 0. If the key had been added, all of its bits would be 1, so a Bloom filter never gives false negatives. The table is skipped without any disk read.`, `good`]
            : member ? [`ok`, `maybe present (true positive)`, `All three bits are set because the key really was added. The lookup proceeds to read the table.`, `good`]
            : [`no`, `maybe present: FALSE POSITIVE`, `Bits ${qb.join(`, `)} were all set by ${[...new Set(qb.flatMap(b => by[b]))].join(` and `)}. ${st.qk} was never added, so the table read will find nothing. That's acceptable: the filter only promises "might be in the table".`, `warn`];
          q(`res`).innerHTML = `<div style="margin-bottom:6px">${chip(res[0], res[1])}</div>` + note(res[2], res[3]);
        } else {
          const n = 1000, m = n * st.bpk, kk = st.k;
          const bits = new Uint8Array(m), pos = (x, i) => (bfHash(x, 0x9747b28c) + i * (bfHash(x, 0x5bd1e995) | 1)) % m;
          for (let x = 0; x < n; x++) for (let i = 0; i < kk; i++) bits[pos(x * 2 + 1, i)] = 1;
          let fp = 0; const T = 20000;
          for (let x = 0; x < T; x++) { const y = (x + 5000) * 2; let all = true; for (let i = 0; i < kk && all; i++) if (!bits[pos(y, i)]) all = false; if (all) fp++; }
          const emp = fp / T, theo = Math.pow(1 - Math.exp(-kk / st.bpk), kk), kopt = st.bpk * Math.LN2;
          const a = axes({ x0: 50, x1: 440, y0: 170, y1: 12, dx0: 1, dx1: 12, dy0: 0, dy1: 0.5, xTicks: [1, 2, 4, 6, 8, 10, 12], yTicks: [0, 0.1, 0.2, 0.3, 0.4, 0.5], yFmt: v => pct(v), xLabel: `hash functions k` });
          const pts = []; for (let k = 1; k <= 12; k += 0.1) pts.push([a.X(k), a.Y(Math.min(0.5, Math.pow(1 - Math.exp(-k / st.bpk), k)))]);
          let s = a.svg + `<path class="svg-line" d="${path(pts)}"/>`;
          if (kopt <= 12) s += `<line x1="${a.X(kopt)}" x2="${a.X(kopt)}" y1="170" y2="12" style="stroke:var(--good);stroke-dasharray:3 3"/><text class="svg-label" x="${a.X(kopt) + 4}" y="22" style="fill:var(--good)">optimal k ≈ ${round(kopt, 1)}</text>`;
          s += `<circle cx="${a.X(kk)}" cy="${a.Y(Math.min(0.5, emp))}" r="5" style="fill:var(--accent-3)"/>`;
          q(`chart`).innerHTML = svgWrap(460, 200, s);
          q(`stats`).innerHTML = stat(`filter size`, fmtBytes(m / 8)) + stat(`theory FP`, pct(theo, 2)) + stat(`measured FP`, pct(emp, 2), emp < 0.02 ? `good` : emp > 0.1 ? `bad` : ``) + stat(`optimal k`, round(kopt, 1)) + stat(`bits set`, pct(sum(Array.from(bits)) / m));
          q(`res`).innerHTML = note(`More bits per key always lowers the false positive rate. More hash functions help only up to k = (m/n)·ln 2; past that, the array fills with ones and false positives rise again. LSM Trees know each table's key count when it is written (tables are immutable), so they can size the filter exactly. ~10 bits per key gives about 1%.`, `good`);
        }
      };
      wireSegs(el.querySelector(`.ctl-row`), st, () => { drawBody(); draw(); });
      drawBody(); draw();
    }
  };

  // =====================================================================
  // Ch7 - RUM: read, write and space amplification
  // =====================================================================
  D.amplification = {
    title: `Read, update and memory overhead: the RUM trade-off`,
    blurb: `Compare an in-place B-Tree with leveled and size-tiered LSM Trees on the three overheads of the <strong>RUM conjecture</strong>. Cost formulas are the standard back-of-envelope models from the LSM literature (leveling: write ≈ T·L, reads ≈ L runs, space ≈ 1 + 1/T; tiering: write ≈ L, reads ≈ T·L runs, space up to T), <em>not figures from the book</em>, but they show the same trade-off it describes.`,
    mount(el) {
      const st = { T: 10, data: 3, rec: 100, bloom: `on` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`size ratio T`, rng(`T`, 2, 20, 1, st.T))}${ctl(`data size`, rng(`data`, 0, 4, 0.5, st.data))}</div>
        <div class="ctl-row">${ctl(`record size`, seg(`rec`, [[100, `100 B`], [1000, `1 KB`]], st.rec))}${ctl(`Bloom filters`, seg(`bloom`, [[`on`, `on (1% FP)`], [`off`, `off`]], st.bloom))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Overheads</h4><div data-k="bars"></div></div>
          <div class="lab-panel"><h4>RUM triangle (illustrative)</h4><div data-k="tri"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const bytes = Math.pow(10, st.data) * 1e9, mem = 64e6, T = st.T;
        const L = Math.max(1, Math.ceil(Math.log(bytes / mem) / Math.log(T)));
        const probe = runs => st.bloom === `on` ? 1 + 0.01 * (runs - 1) : runs;
        const S = {
          btree: { label: `B-Tree (in place)`, w: 4096 / st.rec, r: 1, s: 1 / 0.7 },
          lev: { label: `LSM leveled`, w: T * L, r: probe(L), s: 1 + 1 / T },
          tier: { label: `LSM size-tiered`, w: L, r: probe(T * L), s: T }
        };
        const metric = (key, title, fmt) => `<div style="font-size:11px;color:var(--text-muted);margin:8px 0 3px">${title}</div>` + hbars(Object.keys(S).map(k => ({ label: S[k].label, value: S[k][key], text: fmt(S[k][key]), cls: S[k][key] === Math.min(...Object.values(S).map(v => v[key])) ? `good` : `` })));
        q(`bars`).innerHTML = metric(`w`, `Write amplification (bytes written per byte updated)`, v => round(v, 1) + `x`) + metric(`r`, `Read cost (runs / pages probed per point lookup)`, v => round(v, 2)) + metric(`s`, `Space amplification (worst case)`, v => round(v, 2) + `x`) + `<div class="stat-row" style="margin-top:8px">${stat(`LSM levels L`, L)}${stat(`data`, fmtBytes(bytes))}${stat(`memtable`, `64 MB`)}</div>`;
        const C = { r: [200, 18], u: [30, 300], m: [370, 300] };
        let s = `<polygon points="${C.r.join(`,`)} ${C.u.join(`,`)} ${C.m.join(`,`)}" style="fill:var(--bg-3);stroke:var(--border)"/>`;
        s += `<text class="svg-label" x="200" y="12" text-anchor="middle">Read-optimized</text><text class="svg-label" x="24" y="316">Update-optimized</text><text class="svg-label" x="376" y="316" text-anchor="end">Memory-optimized</text>`;
        const mins = { r: Math.min(...Object.values(S).map(v => v.r)), w: Math.min(...Object.values(S).map(v => v.w)), s: Math.min(...Object.values(S).map(v => v.s)) };
        const colors = { btree: `var(--accent-3)`, lev: `var(--accent)`, tier: `var(--accent-2)` };
        Object.keys(S).forEach(k => {
          const v = S[k], wr = Math.pow(mins.r / v.r, 1.5), wu = Math.pow(mins.w / v.w, 1.5), wm = Math.pow(mins.s / v.s, 1.5), z = wr + wu + wm;
          const x = (wr * C.r[0] + wu * C.u[0] + wm * C.m[0]) / z, y = (wr * C.r[1] + wu * C.u[1] + wm * C.m[1]) / z;
          s += `<circle cx="${x}" cy="${y}" r="9" style="fill:${colors[k]}"/><text class="svg-label" x="${x + 12}" y="${y + 4}" style="font-size:10.5px">${v.label}</text>`;
        });
        q(`tri`).innerHTML = svgWrap(400, 326, s);
        q(`note`).innerHTML = note(`No structure sits in every corner: that's the RUM conjecture. The B-Tree is cheapest to read but rewrites a whole page for a ${st.rec}-byte update (${round(4096 / st.rec, 0)}x). Leveled LSM rewrites data about T times per level but keeps one run per level. Size-tiered writes least but keeps up to T overlapping runs per level${st.bloom === `on` ? `; Bloom filters hide most of that read cost for point lookups (not for range scans)` : `; turn Bloom filters on to see how much they help point lookups`}. Raising T moves leveled toward reads and tiered toward writes.`, `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { T: v => v, data: v => fmtBytes(Math.pow(10, v) * 1e9) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 / Ch2 - SSD Flash Translation Layer and garbage collection
  // =====================================================================
  const FTL_NB = 16, FTL_P = 8;
  function ftlNew(op) {
    const LP = Math.floor(FTL_NB * FTL_P * (1 - op / 100));
    const s = { LP, blocks: Array.from({ length: FTL_NB }, () => ({ pages: Array(FTL_P).fill(-1), wp: 0, erases: 0 })), map: new Int32Array(LP).fill(-1), active: 0, host: 0, gc: 0, erases: 0 };
    for (let l = 0; l < LP; l++) ftlWrite(s, l, false);
    s.host = 0; s.gc = 0; s.erases = 0;
    return s;
  }
  const ftlFree = s => s.blocks.map((b, i) => i).filter(i => i !== s.active && s.blocks[i].wp === 0);
  function ftlPlace(s, lpn, gc) {
    const b = s.blocks[s.active]; if (b.wp >= FTL_P) return;
    if (s.map[lpn] >= 0) { const o = s.map[lpn]; s.blocks[Math.floor(o / FTL_P)].pages[o % FTL_P] = -2; }
    b.pages[b.wp] = lpn; s.map[lpn] = s.active * FTL_P + b.wp; b.wp++;
    if (gc) s.gc++; else s.host++;
  }
  // One erased block is always held in reserve so GC has somewhere to relocate live pages.
  function ftlEnsure(s) {
    for (let guard = 0; guard < FTL_NB * 2; guard++) {
      if (s.blocks[s.active].wp < FTL_P) return;
      const free = ftlFree(s);
      if (free.length > 1 || !free.length) { if (free.length) s.active = free[0]; return; }
      let victim = -1, best = 1e9;
      s.blocks.forEach((b, i) => { if (i === s.active || b.wp < FTL_P) return; const valid = b.pages.filter(p => p >= 0).length; if (valid < best) { best = valid; victim = i; } });
      s.active = free[0];
      if (victim < 0 || best >= FTL_P) return;
      s.blocks[victim].pages.filter(p => p >= 0).forEach(l => ftlPlace(s, l, true));
      const vb = s.blocks[victim]; vb.pages.fill(-1); vb.wp = 0; vb.erases++; s.erases++;
    }
  }
  function ftlWrite(s, lpn) { ftlEnsure(s); ftlPlace(s, lpn, false); }
  const ftlNext = (s, wl, rnd, i) => wl === `seq` ? i % s.LP : wl === `hot` ? (rnd() < 0.8 ? Math.floor(rnd() * s.LP * 0.2) : Math.floor(s.LP * 0.2 + rnd() * s.LP * 0.8)) : Math.floor(rnd() * s.LP);
  D.ftl = {
    title: `SSD Flash Translation Layer: out-of-place writes and garbage collection`,
    blurb: `An SSD with ${FTL_NB} erase blocks of ${FTL_P} pages. Pages can only be written once after an erase, and erases happen per block. So an overwrite goes to a fresh page and the old one becomes <strong>invalid</strong>. When free blocks run out, the FTL's <strong>garbage collector</strong> picks the block with the fewest valid pages, relocates them and erases it. Those relocations are extra writes: <strong>write amplification</strong>. Vary over-provisioning and the write pattern.`,
    mount(el) {
      const st = { op: 20, wl: `rand` };
      let s, rnd, written, curve = {};
      const reset = () => { s = ftlNew(st.op); rnd = mulberry32(17); written = 0; };
      const run = n => { for (let i = 0; i < n; i++) ftlWrite(s, ftlNext(s, st.wl, rnd, written++), true); };
      const curveFor = wl => {
        if (curve[wl]) return curve[wl];
        return (curve[wl] = [7, 10, 15, 20, 28, 35, 50].map(op => { const t = ftlNew(op), r = mulberry32(3); for (let i = 0; i < 3000; i++) ftlWrite(t, ftlNext(t, wl, r, i), true); return [op, t.host ? (t.host + t.gc) / t.host : 1]; }));
      };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`over-provisioning`, rng(`op`, 7, 50, 1, st.op))}${ctl(`write pattern`, seg(`wl`, [[`rand`, `random`], [`hot`, `hot/cold 80/20`], [`seq`, `sequential`]], st.wl))}</div>
        <div class="ctl-row"><button class="lab-btn" data-act="w100">+100 writes</button><button class="lab-btn ghost" data-act="w1000">+1,000 writes</button><button class="lab-btn ghost" data-act="reset">Reset (drive full once)</button></div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Erase blocks (rows) × pages</h4><div data-k="grid"></div><div class="legend"><span>${chip(`final`, `valid`)}</span><span>${chip(`no`, `invalid (stale)`)}</span><span>${chip(`muted`, `erased / free`)}</span><span>▶ active block</span></div></div>
          <div class="lab-panel"><h4>Write amplification vs over-provisioning</h4><div data-k="chart"></div><div class="stat-row" data-k="stats" style="margin-top:8px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        let g = ``;
        s.blocks.forEach((b, i) => {
          const y = 4 + i * 15;
          g += `<text class="svg-label" x="0" y="${y + 10}" style="font-size:9px">${i === s.active ? `▶` : ``}b${i}</text>`;
          b.pages.forEach((p, j) => { g += `<rect x="${28 + j * 22}" y="${y}" width="19" height="12" rx="2" style="fill:${p >= 0 ? `rgba(59,130,246,.55)` : p === -2 ? `rgba(239,68,68,.45)` : `var(--bg-3)`};stroke:var(--border)"/>`; });
          g += `<text class="svg-label" x="${32 + FTL_P * 22}" y="${y + 10}" style="font-size:9px">${b.erases} erases</text>`;
        });
        q(`grid`).innerHTML = svgWrap(260, 4 + FTL_NB * 15, g);
        const c = curveFor(st.wl), wa = s.host ? (s.host + s.gc) / s.host : 1;
        const a = axes({ x0: 40, x1: 300, y0: 150, y1: 12, dx0: 5, dx1: 50, dy0: 1, dy1: Math.max(3, Math.ceil(Math.max(...c.map(p => p[1]), wa))), xTicks: [10, 20, 30, 40, 50], yTicks: [1, 2, 3, 4, 5, 6, 8, 10].filter(v => v <= Math.max(3, Math.ceil(Math.max(...c.map(p => p[1]), wa)))), xFmt: v => v + `%`, yFmt: v => v + `x`, xLabel: `over-provisioning` });
        let ch = a.svg + `<path class="svg-line" d="${path(c.map(([o, w]) => [a.X(o), a.Y(w)]))}"/>`;
        if (s.host) ch += `<circle cx="${a.X(st.op)}" cy="${a.Y(wa)}" r="5" style="fill:var(--accent-3)"/>`;
        q(`chart`).innerHTML = svgWrap(320, 180, ch);
        const inv = sum(s.blocks.map(b => b.pages.filter(p => p === -2).length));
        q(`stats`).innerHTML = stat(`logical pages`, s.LP + ` / ${FTL_NB * FTL_P}`) + stat(`host writes`, s.host) + stat(`GC relocations`, s.gc, s.gc ? `bad` : ``) + stat(`write amplification`, s.host ? round(wa, 2) + `x` : `-`, wa > 2 ? `bad` : `good`) + stat(`erases`, s.erases) + stat(`invalid pages`, inv);
        q(`note`).innerHTML = note(st.wl === `seq` ? `Sequential overwrites invalidate whole blocks in order, so the victim block is entirely stale and GC moves nothing: write amplification ≈ 1. This is why log-structured, append-only writers (LSM Trees) are SSD-friendly.` : `${st.wl === `hot` ? `80% of writes hit 20% of pages, but the FTL writes hot and cold pages into the same blocks. Greedy GC picks the stalest block and keeps copying the cold pages mixed into it, so skew alone doesn't help (it can even hurt); real FTLs separate hot and cold write streams.` : `Random overwrites scatter invalid pages across blocks, so each victim still has live pages to copy.`} More over-provisioning (spare pages invisible to the host) gives GC emptier victims and lowers write amplification. Stacking a log-structured database on a log-structured filesystem on this FTL multiplies these effects (log stacking).`, st.wl === `seq` ? `good` : `warn`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`[data-act]`); if (!b) return;
        const a = b.dataset.act;
        if (a === `w100`) run(100); else if (a === `w1000`) run(1000); else reset();
        draw();
      });
      wireSegs(el, st, () => { reset(); run(500); draw(); });
      wireRanges(el, st, { op: v => v + `%` }, () => { reset(); run(500); draw(); });
      reset(); run(500); draw();
    }
  };
})();
