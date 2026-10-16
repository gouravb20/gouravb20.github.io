// Streaming Systems - interactive labs, part 2 (chapters 5-10)

(function () {
  "use strict";
  const L = window.SSLab;
  const { T, fmt, fmtDur, clamp, lin, mulberry32, seg, wireSegs, ctl, svgWrap, timingChip, okChip, sum, SCORES, byPt, simulate, winLabel } = L;
  const DEMOS = window.DEMOS;

  // ==================================================================
  // CH5 · exactlyOnce
  // ==================================================================
  DEMOS.exactlyOnce = {
    title: "Exactly-once shuffle: retries, dedup catalog and Bloom filters",
    blurb: "A sender pushes records to a receiver over an unreliable RPC. On an <strong>ambiguous failure</strong> (a timeout or a lost ack) it can't tell whether the record got through, so it <strong>retries until acked</strong>. Compare a receiver with no dedup, one that checks a <strong>catalog</strong> of record IDs, and one that puts a <strong>Bloom filter</strong> in front of the catalog to skip most lookups.",
    mount(el) {
      const st = { mode: "catalog", n: 20, fail: 30, seed: 3 };
      el.innerHTML = `
        <div class="ctl-row">
          ${ctl("Receiver", seg("mode", [["none", "No dedup"], ["catalog", "Dedup catalog"], ["bloom", "Bloom filter + catalog"]], st.mode))}
          <button class="iconbtn" data-rerun>↻ New random run</button>
        </div>
        <div class="ctl-row">
          <div class="range-wrap"><span class="ctl-label">Records</span><input type="range" data-k="n" min="5" max="40" step="1" value="${st.n}"><span class="range-val" data-v="n"></span></div>
          <div class="range-wrap"><span class="ctl-label">Ambiguous failure rate</span><input type="range" data-k="fail" min="0" max="60" step="5" value="${st.fail}"><span class="range-val" data-v="fail"></span></div>
        </div>
        <div class="stat-row" data-stats></div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Event log</h4><div class="log" data-log></div></div>
          <div class="lab-panel"><h4>Bloom filter (64 bits, 3 hashes)</h4><div data-bloom></div><div class="cs-note" style="margin-top:8px" data-bnote></div></div>
        </div>
        <div class="lab-note" data-note></div>`;
      const hashes = id => [17, 31, 101].map(sd => { let h = 2166136261 ^ sd; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 64; });
      function run() {
        const rng = mulberry32(st.seed * 7919 + 1);
        const bloom = new Uint8Array(64), catalog = new Set(), truth = new Set();
        const s = { count: 0, deliveries: 0, retries: 0, dupsDelivered: 0, dupsDropped: 0, lookups: 0, skipped: 0, fps: 0 };
        const log = [];
        const failRate = st.fail / 100;
        function receive(id, attempt) {
          s.deliveries++;
          const isDup = truth.has(id); truth.add(id);
          if (isDup) s.dupsDelivered++;
          if (st.mode === "none") { s.count++; log.push([isDup ? "bad" : "ok", `${id} try ${attempt}: processed${isDup ? " AGAIN, so it's counted twice" : ""}`]); return; }
          if (st.mode === "bloom") {
            const hs = hashes(id), maybe = hs.every(h => bloom[h]);
            if (!maybe) { hs.forEach(h => { bloom[h] = 1; }); catalog.add(id); s.count++; s.skipped++; log.push(["ok", `${id} try ${attempt}: Bloom says definitely new, so skip the catalog lookup and process`]); return; }
            s.lookups++;
            if (catalog.has(id)) { s.dupsDropped++; log.push(["dup", `${id} try ${attempt}: Bloom says maybe, the catalog has it, so the duplicate is dropped`]); return; }
            s.fps++; catalog.add(id); s.count++;
            log.push(["info", `${id} try ${attempt}: Bloom false positive, catalog miss, so process`]);
            return;
          }
          s.lookups++;
          if (catalog.has(id)) { s.dupsDropped++; log.push(["dup", `${id} try ${attempt}: ID already in catalog, so the duplicate is dropped`]); }
          else { catalog.add(id); s.count++; log.push(["ok", `${id} try ${attempt}: new ID, so process and record it in the catalog`]); }
        }
        for (let i = 1; i <= st.n; i++) {
          const id = "rec-" + String(i).padStart(2, "0");
          let attempt = 0, acked = false;
          while (!acked) {
            attempt++;
            if (attempt > 1) s.retries++;
            if (attempt >= 8 || rng() >= failRate) { receive(id, attempt); acked = true; }
            else if (rng() < 0.5) { receive(id, attempt); log.push(["info", `${id} try ${attempt}: ack lost (DEADLINE_EXCEEDED), so the sender retries`]); }
            else log.push(["info", `${id} try ${attempt}: RPC failed before delivery, so the sender retries`]);
          }
        }
        return { s, log, bloom };
      }
      function draw() {
        el.querySelector('[data-v="n"]').textContent = st.n;
        el.querySelector('[data-v="fail"]').textContent = st.fail + "%";
        const { s, log, bloom } = run();
        const ok = s.count === st.n;
        el.querySelector("[data-stats]").innerHTML = `
          <div class="stat-mini"><b>${st.n}</b>unique records sent</div>
          <div class="stat-mini"><b>${s.retries}</b>retries</div>
          <div class="stat-mini"><b>${s.deliveries}</b>deliveries</div>
          <div class="stat-mini"><b>${s.dupsDelivered}</b>duplicates delivered</div>
          <div class="stat-mini ${ok ? "good" : "bad"}"><b>${s.count}</b>processed ${ok ? "✓" : "✗"}</div>
          ${st.mode !== "none" ? `<div class="stat-mini"><b>${s.lookups}</b>catalog lookups</div>` : ""}
          ${st.mode === "bloom" ? `<div class="stat-mini good"><b>${s.skipped}</b>lookups skipped</div><div class="stat-mini"><b>${s.fps}</b>false positives</div>` : ""}`;
        el.querySelector("[data-log]").innerHTML = log.map(([c, t]) => `<div class="${c}">${t}</div>`).join("");
        el.querySelector("[data-bloom]").innerHTML = st.mode === "bloom" ? `<div class="bloom">${Array.from(bloom).map(b => `<div class="${b ? "on" : ""}"></div>`).join("")}</div>` : `<div class="muted" style="font-size:12.5px">Select "Bloom filter + catalog" to see it.</div>`;
        el.querySelector("[data-bnote]").innerHTML = st.mode === "bloom" ? `${sum(Array.from(bloom))}/64 bits set. As the filter fills up, false positives rise. Dataflow buckets filters into 10-minute ranges and drops old ones, so they stay sparse.` : "";
        el.querySelector("[data-note]").className = "lab-note " + (ok ? "good" : "bad");
        el.querySelector("[data-note]").innerHTML = st.mode === "none"
          ? `<strong>At-least-once only:</strong> retries guarantee nothing is lost, but ${s.dupsDelivered} duplicate deliveries were all counted. Totals are inflated.`
          : st.mode === "catalog"
            ? `<strong>Exactly-once:</strong> every delivery costs a catalog lookup (${s.lookups} here), even though only ${s.dupsDelivered} were duplicates. That is correct, but expensive at scale.`
            : `<strong>Exactly-once, and cheaper:</strong> the Bloom filter answered "definitely new" for ${s.skipped} of ${s.deliveries} deliveries, so only ${s.lookups} hit the catalog. False positives cost an extra lookup but never cause a wrong result.`;
      }
      wireSegs(el, st, draw);
      el.querySelectorAll("input[data-k]").forEach(r => r.addEventListener("input", () => { st[r.dataset.k] = +r.value; draw(); }));
      el.querySelector("[data-rerun]").addEventListener("click", () => { st.seed++; draw(); });
      draw();
    }
  };

  // ==================================================================
  // CH5 · sinks
  // ==================================================================
  DEMOS.sinks = {
    title: "Exactly-once sinks: why idempotence needs a checkpoint",
    blurb: "Three rows are written to an external table (think BigQuery streaming inserts). The worker <strong>crashes after the write but before the step commits</strong>, so the runner retries. Step through and compare four sink designs. Only deterministic input plus an idempotent write survives the retry.",
    mount(el) {
      const ROWS = ["Julie 5", "Ed 7", "Amy 3"];
      const STEPS = [
        "Three rows are ready to be written: Julie 5, Ed 7, Amy 3.",
        "The sink step prepares the write (and, depending on the design, attaches insert IDs).",
        "The external table accepts the write.",
        "💥 The worker crashes before the step commits, so the runner doesn't know the write happened.",
        "The runner retries the step."
      ];
      const STRATS = [
        { id: "append", name: "Plain append", desc: "No IDs. Each write appends rows." },
        { id: "fresh", name: "Random insert IDs, no checkpoint", desc: "Generates a UUID per row in the same step that writes. The retry regenerates them." },
        { id: "reshuffle", name: "Random insert IDs + Reshuffle", desc: "Generates the UUIDs, checkpoints them via Reshuffle, then writes. The retry replays the same IDs." },
        { id: "upsert", name: "Deterministic key upsert", desc: "Key = user#eventTime, written as overwrite-by-key. Idempotent by construction." }
      ];
      const st = { step: 0 };
      el.innerHTML = `
        <div class="ctl-row"><button class="iconbtn" data-prev>◀ Back</button><button class="iconbtn" data-next>Next step ▶</button><span class="ctl" data-stepn></span></div>
        <div class="lab-note" data-steptxt style="margin-top:0;margin-bottom:12px"></div>
        <div class="pipeline" data-strats></div>
        <div class="lab-note" data-note></div>`;
      function tableFor(id, step) {
        const ids1 = ["a1", "a2", "a3"], ids2 = ["b1", "b2", "b3"];
        const key = i => ["julie#12:00:26", "ed#12:02:26", "amy#12:03:39"][i];
        const prep = { append: () => "no IDs", fresh: () => `IDs ${ids1.join(", ")} (in memory only)`, reshuffle: () => `IDs ${ids1.join(", ")}, checkpointed ✓`, upsert: () => "keys user#eventTime" };
        const retryNote = { append: "Rewrites the same rows without IDs, so the table appends them again.", fresh: `The step re-runs and mints NEW IDs ${ids2.join(", ")}. The table sees new IDs and keeps both copies.`, reshuffle: `Replays the checkpointed IDs ${ids1.join(", ")}. The table recognizes them and drops the duplicates.`, upsert: "Overwrites the same keys with the same values. No change." };
        let rows = [];
        if (step >= 2) rows = ROWS.map((r, i) => ({ r, tag: id === "append" ? "" : id === "upsert" ? key(i) : ids1[i] }));
        if (step >= 4) {
          if (id === "append") rows = rows.concat(ROWS.map(r => ({ r, tag: "", dup: true })));
          if (id === "fresh") rows = rows.concat(ROWS.map((r, i) => ({ r, tag: ids2[i], dup: true })));
        }
        return { prep: step >= 1 ? prep[id]() : "", retry: step >= 4 ? retryNote[id] : "", rows };
      }
      function draw() {
        el.querySelector("[data-stepn]").textContent = `Step ${st.step + 1} / ${STEPS.length}`;
        el.querySelector("[data-steptxt]").innerHTML = STEPS[st.step];
        el.querySelector("[data-strats]").innerHTML = STRATS.map(s => {
          const t = tableFor(s.id, st.step);
          const ok = t.rows.length === 3;
          return `<div class="pipe-stage"><h5>${s.name} ${st.step >= 4 ? okChip(ok, "✓ exactly once", "✗ duplicates") : ""}</h5>
            <div class="cs-note" style="margin-bottom:6px">${s.desc}</div>
            ${t.prep ? `<div style="font-size:12px;margin-bottom:4px"><strong>Prepared:</strong> ${t.prep}</div>` : ""}
            ${t.retry ? `<div style="font-size:12px;margin-bottom:6px"><strong>Retry:</strong> ${t.retry}</div>` : ""}
            <div class="kv">${t.rows.map(r => `<div class="kv-row ${r.dup ? "hot" : ""}"><span>${r.r}</span><span class="muted">${r.tag}</span></div>`).join("") || '<div class="muted">table is empty</div>'}</div>
          </div>`;
        }).join("");
        el.querySelector("[data-note]").innerHTML = st.step < 4
          ? "Every design looks the same until the retry. The question is whether the retried write is <em>exactly the same write</em>."
          : "<strong>Lesson:</strong> an idempotent sink (insert IDs) is not enough if the IDs come from nondeterministic code that re-runs on retry. Checkpoint the nondeterministic output with Reshuffle (a GroupByKey) first. Dataflow's file sinks follow the same idea: write uniquely named temp files, checkpoint the list, then do an idempotent rename.";
      }
      el.querySelector("[data-next]").addEventListener("click", () => { st.step = Math.min(STEPS.length - 1, st.step + 1); draw(); });
      el.querySelector("[data-prev]").addEventListener("click", () => { st.step = Math.max(0, st.step - 1); draw(); });
      draw();
    }
  };

  // ==================================================================
  // CH6 · streamTable
  // ==================================================================
  DEMOS.streamTable = {
    title: "Stream → table → stream: grouping, triggering and accumulation",
    blurb: "Scores flow in as a <span class='badge-ts S'>STREAM</span>. They are parsed (stream → stream), then <strong>grouped</strong> into a per-user SUM <span class='badge-ts T'>TABLE</span> (stream → table). A <strong>trigger</strong> ungroups the table back into a stream (table → stream), and a downstream consumer rebuilds its own table from that stream. Change the accumulation mode and the consumer to see when they agree.",
    mount(el, ctx) {
      const recs = byPt(SCORES);
      const st = { k: 0, trig: "perRecord", mode: "value", consumer: "upsert", timer: null };
      el.innerHTML = `
        <div class="ctl-row">
          <button class="iconbtn" data-step>Next record ▶</button>
          <button class="iconbtn" data-play>▶ Play</button>
          <button class="iconbtn" data-reset>↺ Reset</button>
          ${ctl("Trigger", seg("trig", [["perRecord", "Per record"], ["every3", "Every 3 records"], ["end", "At end of input"]], st.trig))}
        </div>
        <div class="ctl-row">
          ${ctl("Accumulation", seg("mode", [["delta", "Discarding (deltas)"], ["value", "Accumulating (values)"], ["retract", "Values + retractions"]], st.mode))}
          ${ctl("Consumer", seg("consumer", [["upsert", "Overwrite by user (KV store)"], ["teamSum", "Sum into a team total"]], st.consumer))}
        </div>
        <div class="pipeline" data-pipe></div>
        <div class="lab-note" data-note></div>`;
      function computeState() {
        const state = {}, lastPaneSum = {}, lastEmitted = {}, dirty = new Set(), out = [];
        const emit = (u, i) => {
          const delta = state[u] - (lastPaneSum[u] || 0);
          if (st.mode === "delta") out.push({ u, v: delta, i });
          else {
            if (st.mode === "retract" && lastEmitted[u] !== undefined) out.push({ u, v: lastEmitted[u], undo: true, i });
            out.push({ u, v: state[u], i });
          }
          lastPaneSum[u] = state[u];
          lastEmitted[u] = st.mode === "delta" ? delta : state[u];
        };
        for (let i = 0; i < st.k; i++) {
          const r = recs[i];
          state[r.name] = (state[r.name] || 0) + r.v;
          dirty.add(r.name);
          const fire = st.trig === "perRecord" || (st.trig === "every3" && (i + 1) % 3 === 0) || (st.trig === "end" && i === recs.length - 1);
          if (fire) { for (const u of dirty) emit(u, i); dirty.clear(); }
        }
        const kv = {}; let total = 0;
        for (const o of out) {
          if (st.consumer === "upsert") { if (o.undo) delete kv[o.u]; else kv[o.u] = o.v; }
          else total += o.undo ? -o.v : o.v;
        }
        return { state, lastPaneSum, out, kv, total, dirty };
      }
      function draw() {
        const c = computeState();
        const last = recs[st.k - 1];
        const stage = (title, badge, body) => `<div class="pipe-stage"><h5><span>${title}</span><span class="badge-ts ${badge}">${badge === "S" ? "STREAM" : "TABLE"}</span></h5>${body}</div>`;
        const arrow = lbl => `<div class="pipe-arrow" title="${lbl}">→</div>`;
        const input = recs.map((r, i) => `<div class="stream-item ${i === st.k - 1 ? "hot" : ""}" style="${i < st.k ? "opacity:0.35" : ""}">"${r.name},${r.v}"</div>`).join("");
        const parsed = recs.slice(0, st.k).map((r, i) => `<div class="stream-item ${i === st.k - 1 ? "hot" : ""}">(${r.name}, ${r.v})</div>`).join("") || '<div class="muted">-</div>';
        const table = Object.keys(c.state).map(u => `<div class="kv-row ${last && last.name === u ? "hot" : ""}"><span>${u}</span><span>${c.state[u]}${c.dirty.has(u) ? ' <span class="muted">(not yet emitted)</span>' : ""}</span></div>`).join("") || '<div class="muted">empty</div>';
        const outS = c.out.map(o => `<div class="stream-item ${o.undo ? "undo" : ""} ${o.i === st.k - 1 ? "hot" : ""}">${o.undo ? "undo " : ""}(${o.u}, ${o.undo ? "−" : ""}${o.v})</div>`).join("") || '<div class="muted">nothing emitted yet</div>';
        let consumer, ok;
        if (st.consumer === "upsert") {
          const users = Object.keys(c.lastPaneSum);
          ok = users.every(u => c.kv[u] === c.lastPaneSum[u]) && Object.keys(c.kv).length === users.length;
          consumer = users.map(u => `<div class="kv-row"><span>${u}</span><span>${c.kv[u] !== undefined ? c.kv[u] : "-"} ${c.kv[u] === c.lastPaneSum[u] ? "" : `<span class="chip no">should be ${c.lastPaneSum[u]}</span>`}</span></div>`).join("") || '<div class="muted">empty</div>';
        } else {
          const expect = sum(Object.values(c.lastPaneSum));
          ok = c.total === expect;
          consumer = `<div class="kv-row"><span>team total</span><span>${c.total}</span></div><div class="kv-row"><span class="muted">expected</span><span class="muted">${expect}</span></div>`;
        }
        el.querySelector("[data-pipe]").innerHTML =
          stage("Input", "S", `<div class="scroll-y" style="max-height:230px">${input}</div>`) + arrow("Map / parse: stream → stream") +
          stage("Parsed", "S", `<div class="scroll-y" style="max-height:230px">${parsed}</div>`) + arrow("GroupByKey + SUM: stream → table") +
          stage("SUM by user", "T", `<div class="kv">${table}</div>`) + arrow("Trigger: table → stream") +
          stage("Triggered output", "S", `<div class="scroll-y" style="max-height:230px">${outS}</div>`) + arrow("Consumer: stream → table") +
          stage(st.consumer === "upsert" ? "Consumer KV store" : "Consumer team total", "T", `<div class="kv">${consumer}</div><div style="margin-top:8px">${st.k ? okChip(ok, "✓ matches upstream", "✗ diverged") : ""}</div>`);
        const why = {
          "upsert-delta": "An overwrite store that receives <em>deltas</em> stores only the last delta per user. Julie ends up with 8 instead of 13.",
          "upsert-value": "Values plus overwrite-by-key is the classic combination, for example writing panes to Bigtable keyed by user + window.",
          "upsert-retract": "Retractions also work for a KV store: an undo deletes the old row, and the new value replaces it.",
          "teamSum-delta": "Deltas add up correctly when you regroup by a different key.",
          "teamSum-value": "Adding <em>values</em> double-counts: Julie's 5 and then her 13 are both added. This is the bug from Table 2-1.",
          "teamSum-retract": "Retractions fix regrouping: −5 cancels the old value before +13 is added."
        }[st.consumer + "-" + st.mode];
        el.querySelector("[data-note]").className = "lab-note " + (!st.k ? "" : ok ? "good" : "bad");
        el.querySelector("[data-note]").innerHTML = (st.k ? `<strong>${last.name} ${last.v}</strong> just arrived. ` : "Press <strong>Next record</strong>. ") + why + " Grouping brought the data to rest, and the trigger put it back in motion. Accumulation decides what that stream means.";
      }
      const stop = () => { if (st.timer) ctx.clear(st.timer); st.timer = null; el.querySelector("[data-play]").textContent = "▶ Play"; };
      el.querySelector("[data-step]").addEventListener("click", () => { st.k = Math.min(recs.length, st.k + 1); draw(); });
      el.querySelector("[data-reset]").addEventListener("click", () => { stop(); st.k = 0; draw(); });
      el.querySelector("[data-play]").addEventListener("click", () => {
        if (st.timer) { stop(); return; }
        if (st.k >= recs.length) st.k = 0;
        el.querySelector("[data-play]").textContent = "❚❚ Pause";
        st.timer = ctx.every(() => { st.k++; draw(); if (st.k >= recs.length) stop(); }, 900);
      });
      wireSegs(el, st, draw);
      draw();
    }
  };

  // ==================================================================
  // CH6 · mapreduceST
  // ==================================================================
  DEMOS.mapreduceST = {
    title: "MapReduce as streams and tables (word count)",
    blurb: "Click any phase or dataset. The job reads <span class='badge-ts T'>TABLE</span> → <span class='badge-ts S'>STREAM</span> → <span class='badge-ts S'>STREAM</span> → <span class='badge-ts T'>TABLE</span> → <span class='badge-ts S'>STREAM</span> → <span class='badge-ts S'>STREAM</span> → <span class='badge-ts T'>TABLE</span>. Batch processing is full of streams.",
    mount(el, ctx) {
      const N = [
        { k: "T", label: "Input table", data: ['1 → "the cat"', '2 → "the dog"'], desc: "Data at rest: the input files, viewed as a table of (offset, line)." },
        { k: "op", label: "MapRead", io: "table → stream", desc: "Iterates over the input table and puts its rows in motion, one record at a time." },
        { k: "S", label: "Stream", data: ['(1, "the cat")', '(2, "the dog")'], desc: "Records in motion." },
        { k: "op", label: "Map", io: "stream → stream", desc: "The user's element-wise map function. It may filter or explode records, but they stay independent and in motion." },
        { k: "S", label: "Stream", data: ["(the, 1)", "(cat, 1)", "(the, 1)", "(dog, 1)"], desc: "Still in motion: cardinality changed, but nothing has been grouped." },
        { k: "op", label: "MapWrite", io: "stream → table", desc: "Groups records by key into persistent (or at least recoverable) storage. Like-keyed records come to rest together: a stream becomes a table." },
        { k: "T", label: "Grouped table", data: ["the → [1, 1]", "cat → [1]", "dog → [1]"], desc: "Data at rest, keyed by word." },
        { k: "op", label: "ReduceRead", io: "table → stream", desc: "Same as MapRead, but over (key, list of values) pairs." },
        { k: "S", label: "Stream", data: ["(the, [1, 1])", "(cat, [1])", "(dog, [1])"], desc: "Grouped records back in motion." },
        { k: "op", label: "Reduce", io: "stream → stream", desc: "A glorified map that happens to receive a list of values per key." },
        { k: "S", label: "Stream", data: ["(the, 2)", "(cat, 1)", "(dog, 1)"], desc: "Reduced records in motion." },
        { k: "op", label: "ReduceWrite", io: "stream → table", desc: "Groups output by key into the final table. If the reducer emits no keys, each record gets an implicit unique key (like AUTO_INCREMENT), and is still brought to rest." },
        { k: "T", label: "Output table", data: ["the → 2", "cat → 1", "dog → 1"], desc: "Final data at rest." }
      ];
      const st = { sel: 5, timer: null };
      el.innerHTML = `
        <div class="ctl-row"><button class="iconbtn" data-play>▶ Walk through</button></div>
        <div class="mr-phases" data-nodes></div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4 data-title></h4><div data-detail></div></div>
          <div class="lab-panel"><h4>The general theory</h4>
            <table class="mini-table"><tbody>
              <tr><td>stream → stream</td><td>nongrouping (Map, Reduce)</td></tr>
              <tr><td>stream → table</td><td>grouping (MapWrite, ReduceWrite)</td></tr>
              <tr><td>table → stream</td><td>ungrouping (MapRead, ReduceRead; triggers in streaming)</td></tr>
              <tr><td>table → table</td><td><em>none</em>: data must be put in motion</td></tr>
            </tbody></table>
          </div>
        </div>`;
      function draw() {
        el.querySelector("[data-nodes]").innerHTML = N.map((n, i) => {
          const cls = n.k === "op" ? "op" : n.k;
          return `<button class="mr-node ${cls} ${i === st.sel ? "on" : ""}" data-i="${i}">${n.k === "op" ? n.label : n.k === "T" ? "TABLE" : "STREAM"}</button>${i < N.length - 1 ? '<span class="muted">→</span>' : ""}`;
        }).join("");
        const n = N[st.sel];
        el.querySelector("[data-title]").textContent = n.k === "op" ? `${n.label} · ${n.io}` : n.label;
        el.querySelector("[data-detail]").innerHTML = `<div style="font-size:13px;margin-bottom:8px">${n.desc}</div>` +
          (n.data ? `<div class="kv">${n.data.map(d => `<div class="${n.k === "S" ? "stream-item" : "kv-row"}">${d}</div>`).join("")}</div>` : "");
        el.querySelectorAll(".mr-node").forEach(b => b.addEventListener("click", () => { st.sel = +b.dataset.i; draw(); }));
      }
      const btn = el.querySelector("[data-play]");
      btn.addEventListener("click", () => {
        if (st.timer) { ctx.clear(st.timer); st.timer = null; btn.textContent = "▶ Walk through"; return; }
        st.sel = 0; draw(); btn.textContent = "❚❚ Pause";
        st.timer = ctx.every(() => { st.sel++; if (st.sel >= N.length - 1) { st.sel = N.length - 1; ctx.clear(st.timer); st.timer = null; btn.textContent = "▶ Walk through"; } draw(); }, 1300);
      });
      draw();
    }
  };

  // ==================================================================
  // CH7 · stateCost
  // ==================================================================
  DEMOS.stateCost = {
    title: "Raw grouping vs incremental combining (and combiner lifting)",
    blurb: "Three views on why <strong>CombineFn</strong> matters. First, the storage and compute of one window with repeated early firings. Second, shuffle volume for a hot key with and without combiner lifting. Third, a mean computed as associative (sum, count) accumulators split across workers in any order.",
    mount(el) {
      const st = { n: 60, every: 10, workers: 8, shuffleSeed: 1 };
      el.innerHTML = `
        <div class="ctl-row">
          <div class="range-wrap"><span class="ctl-label">Inputs in window</span><input type="range" data-k="n" min="10" max="200" step="10" value="${st.n}"><span class="range-val" data-v="n"></span></div>
          <div class="range-wrap"><span class="ctl-label">Early firing every</span><input type="range" data-k="every" min="1" max="30" step="1" value="${st.every}"><span class="range-val" data-v="every"></span></div>
        </div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>One window: raw grouping vs CombineFn</h4><div data-a></div></div>
          <div class="lab-panel"><h4>Hot key: combiner lifting</h4>
            <div class="range-wrap" style="margin-bottom:8px"><span class="ctl-label">Workers</span><input type="range" data-k="workers" min="1" max="32" step="1" value="${st.workers}"><span class="range-val" data-v="workers"></span></div>
            <div data-b></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>CombineFn for mean: createAccumulator → addInput → mergeAccumulators → extractOutput</h4>
          <button class="iconbtn" data-shuffle>⇄ Shuffle values across workers</button><div data-c style="margin-top:10px"></div></div>`;
      const bar = (label, v, max, cls) => `<div style="font-size:12px;margin:6px 0 2px">${label}: <b>${v.toLocaleString()}</b></div><div style="background:var(--bg-3);border-radius:4px;height:10px;overflow:hidden"><div style="width:${max ? Math.max(1, (v / max) * 100) : 0}%;height:100%;background:${cls}"></div></div>`;
      function draw() {
        el.querySelector('[data-v="n"]').textContent = st.n;
        el.querySelector('[data-v="every"]').textContent = st.every + " inputs";
        el.querySelector('[data-v="workers"]').textContent = st.workers;
        const F = Math.ceil(st.n / st.every);
        let rawWork = 0;
        for (let j = 1; j <= F; j++) rawWork += Math.min(j * st.every, st.n);
        rawWork += st.n;
        const incWork = st.n + F + 1;
        const mxS = st.n, mxW = rawWork;
        el.querySelector("[data-a]").innerHTML =
          `<div class="cs-note">${F} early panes + 1 on-time pane.</div>` +
          bar("Raw grouping · values stored", st.n, mxS, "var(--accent-3)") + bar("CombineFn · values stored (one accumulator)", 1, mxS, "var(--accent)") +
          bar("Raw grouping · additions performed", rawWork, mxW, "var(--accent-3)") + bar("CombineFn · additions + extracts", incWork, mxW, "var(--accent)") +
          `<div class="lab-note" style="margin-top:10px">Raw grouping re-sums the whole list at every firing, which is O(n²) overall. Incremental combining folds each input in once, which is O(n). Merging windows is also cheap: merge two accumulators instead of concatenating lists.</div>`;
        const E = 100000;
        el.querySelector("[data-b]").innerHTML =
          bar("Records shuffled without lifting", E, E, "var(--accent-3)") + bar("Accumulators shuffled with lifting", st.workers, E, "var(--accent)") +
          `<div class="cs-note" style="margin-top:8px">With lifting, each worker pre-combines its share of the hot key and sends one accumulator. That's a ${Math.round(E / st.workers).toLocaleString()}× reduction, and it also cuts the exactly-once dedup work at the shuffle (Chapter 5).</div>`;
        const vals = [4, 8, 15, 16, 23, 42];
        const rng = mulberry32(st.shuffleSeed * 97);
        const parts = [[], [], []];
        vals.slice().sort(() => rng() - 0.5).forEach(v => parts[Math.floor(rng() * 3)].push(v));
        const accs = parts.map(p => ({ sum: sum(p), count: p.length }));
        const merged = accs.reduce((a, b) => ({ sum: a.sum + b.sum, count: a.count + b.count }), { sum: 0, count: 0 });
        el.querySelector("[data-c]").innerHTML = `<div class="pipeline">
          ${parts.map((p, i) => `<div class="pipe-stage"><h5>Worker ${i + 1}</h5><div class="kv">${p.map(v => `<div class="kv-row"><span>addInput(${v})</span></div>`).join("") || '<div class="muted">no inputs</div>'}<div class="kv-row hot"><span>acc</span><span>(sum ${accs[i].sum}, count ${accs[i].count})</span></div></div></div>`).join("")}
          <div class="pipe-arrow">→</div>
          <div class="pipe-stage"><h5>mergeAccumulators</h5><div class="kv"><div class="kv-row hot"><span>acc</span><span>(sum ${merged.sum}, count ${merged.count})</span></div></div>
          <h5 style="margin-top:10px">extractOutput</h5><div class="kv"><div class="kv-row"><span>mean</span><span><b>${(merged.sum / merged.count).toFixed(1)}</b></span></div></div></div>
        </div><div class="cs-note" style="margin-top:6px">Shuffle as many times as you like: the result is always 18.0, because merging is commutative and associative.</div>`;
      }
      el.querySelectorAll("input[data-k]").forEach(r => r.addEventListener("input", () => { st[r.dataset.k] = +r.value; draw(); }));
      el.querySelector("[data-shuffle]").addEventListener("click", () => { st.shuffleSeed++; draw(); });
      draw();
    }
  };

  // ==================================================================
  // CH7 · attribution
  // ==================================================================
  DEMOS.attribution = {
    title: "Conversion attribution with state and event-time timers",
    blurb: "This follows the book's case study for one user. Events arrive <strong>out of order</strong>: the goal shows up before the landing-page visit and the ad impression that led to it. Step through with an <strong>event-time timer</strong> (wait for the watermark) or with <strong>immediate attribution</strong>, and watch the state, timer and walk-back.",
    mount(el) {
      const EV = [
        { kind: "visit", url: "/shoes", ref: "/landing", t: "12:01:00" },
        { kind: "goal", url: "/checkout", ref: "/shoes", t: "12:02:30" },
        { kind: "wm", t: "12:01:30" },
        { kind: "visit", url: "/landing", ref: null, t: "12:00:40" },
        { kind: "imp", ad: "shoes-ad", url: "/landing", t: "12:00:30" },
        { kind: "imp", ad: "shoes-ad", url: "/landing", t: "12:00:35" },
        { kind: "wm", t: "12:03:00" },
        { kind: "imp", ad: "hats-ad", url: "/hats", t: "12:03:45" },
        { kind: "wm", t: "end" }
      ];
      const st = { k: 0, mode: "timer" };
      el.innerHTML = `
        <div class="ctl-row">
          <button class="iconbtn" data-prev>◀ Back</button><button class="iconbtn" data-next>Next event ▶</button><button class="iconbtn" data-all>Run all</button>
          ${ctl("Strategy", seg("mode", [["timer", "Event-time timer (book)"], ["immediate", "Attribute immediately"]], st.mode))}
        </div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Input (processing-time order)</h4><div data-events></div></div>
          <div class="lab-panel"><h4>Per-user state</h4><div data-state></div></div>
        </div>
        <div class="lab-grid even" style="margin-top:14px">
          <div class="lab-panel"><h4>Attributions emitted</h4><div data-out></div></div>
          <div class="lab-panel"><h4>Log</h4><div class="log" data-log></div></div>
        </div>`;
      const label = e => e.kind === "visit" ? `visit ${e.url}${e.ref ? ` (referer ${e.ref})` : ""}` : e.kind === "goal" ? `GOAL ${e.url} (referer ${e.ref})` : e.kind === "imp" ? `impression ${e.ad} → ${e.url}` : `watermark → ${e.t === "end" ? "+∞" : e.t}`;
      function run() {
        const visits = new Map(), imps = new Map(), goals = [], out = [], log = [];
        let minGoal = null, wm = -Infinity;
        const attribute = g => {
          const path = [g.url]; let cur = g;
          for (let guard = 0; guard < 10; guard++) {
            if (imps.has(cur.url)) { const im = imps.get(cur.url); return { ok: true, chain: [im.ad, ...path.reverse()] }; }
            if (cur.ref && visits.has(cur.ref)) { cur = visits.get(cur.ref); path.push(cur.url); continue; }
            return { ok: false, missing: cur.ref ? `visit ${cur.ref}` : `an impression for ${cur.url}`, chain: path.reverse() };
          }
          return { ok: false, missing: "loop", chain: path };
        };
        for (let i = 0; i < st.k; i++) {
          const e = EV[i], et = e.t === "end" ? Infinity : T(e.t);
          if (e.kind === "visit") { visits.set(e.url, Object.assign({}, e, { et })); log.push(["info", `store visit ${e.url} in MapState visits`]); }
          else if (e.kind === "imp") {
            if (imps.has(e.url) && imps.get(e.url).ad === e.ad) log.push(["dup", `duplicate impression of ${e.ad} → ${e.url} ignored (spam protection)`]);
            else { imps.set(e.url, Object.assign({}, e, { et })); log.push(["info", `store impression ${e.ad} keyed by ${e.url}`]); }
          } else if (e.kind === "goal") {
            const g = Object.assign({}, e, { et });
            visits.set(e.url, g);
            if (st.mode === "timer") {
              goals.push(g);
              if (minGoal === null || et < minGoal) { minGoal = et; log.push(["info", `goal stored in SetState; event-time timer set for ${fmt(et)}`]); }
            } else {
              const r = attribute(g);
              if (r.ok) { out.push({ g, chain: r.chain, at: label(e) }); log.push(["ok", `attributed immediately: ${r.chain.join(" → ")}`]); }
              else { out.push({ g, fail: true, missing: r.missing, chain: r.chain }); log.push(["bad", `walk-back failed: ${r.chain.join(" → ")} … missing ${r.missing} (it hasn't arrived yet!)`]); }
            }
          } else if (e.kind === "wm") {
            wm = et;
            log.push(["info", `watermark advances to ${e.t === "end" ? "+∞" : e.t}`]);
            if (st.mode === "timer" && minGoal !== null && wm >= minGoal) {
              log.push(["ok", `timer fires (watermark ≥ ${fmt(minGoal)})`]);
              for (const g of goals.filter(x => x.et <= wm)) {
                const r = attribute(g);
                if (r.ok) { out.push({ g, chain: r.chain }); log.push(["ok", `attributed: ${r.chain.join(" → ")}`]); }
                else { out.push({ g, fail: true, missing: r.missing, chain: r.chain }); log.push(["bad", `walk-back failed: missing ${r.missing}`]); }
              }
              for (let j = goals.length - 1; j >= 0; j--) if (goals[j].et <= wm) goals.splice(j, 1);
              minGoal = goals.length ? Math.min(...goals.map(x => x.et)) : null;
              log.push(["info", minGoal === null ? "no pending goals; timer cleared" : `timer reset to ${fmt(minGoal)}`]);
            }
            if (e.t === "end" && imps.has("/hats")) log.push(["info", "hats-ad impression never led to a goal, so it stays unattributed"]);
          }
        }
        return { visits, imps, goals, minGoal, wm, out, log };
      }
      function draw() {
        const r = run();
        el.querySelector("[data-events]").innerHTML = `<table class="mini-table"><thead><tr><th>#</th><th>Event</th><th>Event time</th></tr></thead><tbody>
          ${EV.map((e, i) => `<tr class="${i < st.k ? (i === st.k - 1 ? "new" : "") : "dim"}"><td>${i + 1}</td><td>${label(e)}</td><td>${e.kind === "wm" ? "-" : e.t}</td></tr>`).join("")}</tbody></table>`;
        const kvs = (m, f) => [...m.entries()].map(([k, v]) => `<div class="kv-row"><span>${k}</span><span>${f(v)}</span></div>`).join("") || '<div class="muted">∅</div>';
        el.querySelector("[data-state]").innerHTML = `
          <div class="cs-note">MapState&lt;URL, Visit&gt; visits</div><div class="kv">${kvs(r.visits, v => `${fmt(v.et)}${v.ref ? " ← " + v.ref : ""}`)}</div>
          <div class="cs-note" style="margin-top:6px">MapState&lt;URL, Impression&gt; impressions</div><div class="kv">${kvs(r.imps, v => `${v.ad} @ ${fmt(v.et)}`)}</div>
          <div class="cs-note" style="margin-top:6px">SetState&lt;Visit&gt; goals · ValueState minGoal · Timer</div>
          <div class="kv"><div class="kv-row"><span>pending goals</span><span>${r.goals.map(g => g.url + " @ " + fmt(g.et)).join(", ") || "∅"}</span></div>
          <div class="kv-row ${r.minGoal !== null ? "hot" : ""}"><span>event-time timer</span><span>${st.mode === "timer" ? (r.minGoal !== null ? fmt(r.minGoal) : "not set") : "n/a"}</span></div>
          <div class="kv-row"><span>watermark</span><span>${r.wm === -Infinity ? "-" : fmt(r.wm)}</span></div></div>`;
        el.querySelector("[data-out]").innerHTML = r.out.length ? r.out.map(o => o.fail
          ? `<div class="lab-note bad" style="margin-top:0;margin-bottom:6px">✗ ${o.g.url}: walk-back stopped at ${o.chain.join(" → ")}, missing <strong>${o.missing}</strong>. The goal goes unattributed (or is credited wrongly).</div>`
          : `<div class="lab-note good" style="margin-top:0;margin-bottom:6px">✓ <strong>${o.chain[0]}</strong> → ${o.chain.slice(1).join(" → ")}</div>`).join("")
          : '<div class="muted" style="font-size:12.5px">nothing yet</div>';
        el.querySelector("[data-log]").innerHTML = r.log.map(([c, t]) => `<div class="${c}">${t}</div>`).join("") || '<div class="info">press Next event</div>';
      }
      el.querySelector("[data-next]").addEventListener("click", () => { st.k = Math.min(EV.length, st.k + 1); draw(); });
      el.querySelector("[data-prev]").addEventListener("click", () => { st.k = Math.max(0, st.k - 1); draw(); });
      el.querySelector("[data-all]").addEventListener("click", () => { st.k = EV.length; draw(); });
      wireSegs(el, st, draw);
      draw();
    }
  };

  // ==================================================================
  // CH8 · tvr
  // ==================================================================
  DEMOS.tvr = {
    title: "Time-varying relations: TABLE vs STREAM renderings",
    blurb: "One query, one time-varying relation, rendered three ways. A <strong>TABLE</strong> is a snapshot at the chosen time, a <strong>TVR</strong> is the full sequence of snapshots, and a <strong>STREAM</strong> is the changelog. Drag the clock and switch queries: the relational logic never changes, only the rendering does.",
    mount(el) {
      const DATA = [
        { name: "Julie", score: 7, t: T("12:01:00") },
        { name: "Frank", score: 3, t: T("12:03:00") },
        { name: "Julie", score: 1, t: T("12:03:00") },
        { name: "Julie", score: 4, t: T("12:07:00") }
      ];
      const st = { q: "sum", render: "table", undo: true, t: T("12:08:00") };
      const QUERIES = {
        raw: { sql: "* FROM UserScores", cols: ["Name", "Score", "Time"], f: rows => rows.map(r => ({ key: r.name + "@" + r.t + r.score, cells: [r.name, r.score, fmt(r.t, false)], mt: r.t })) },
        filter: { sql: "* FROM UserScores WHERE Name = 'Julie'", cols: ["Name", "Score", "Time"], f: rows => rows.filter(r => r.name === "Julie").map(r => ({ key: r.name + "@" + r.t + r.score, cells: [r.name, r.score, fmt(r.t, false)], mt: r.t })) },
        sum: { sql: "Name, SUM(Score) AS Total FROM UserScores GROUP BY Name", cols: ["Name", "Total"], f: rows => { const m = new Map(); rows.forEach(r => { const c = m.get(r.name) || { s: 0, mt: 0 }; c.s += r.score; c.mt = r.t; m.set(r.name, c); }); return [...m.entries()].map(([n, c]) => ({ key: n, cells: [n, c.s], mt: c.mt })); } }
      };
      el.innerHTML = `
        <div class="ctl-row">
          ${ctl("Query", seg("q", [["raw", "SELECT *"], ["filter", "WHERE Name = 'Julie'"], ["sum", "GROUP BY Name, SUM"]], st.q))}
          ${ctl("Rendering", seg("render", [["table", "TABLE"], ["tvr", "TVR"], ["stream", "STREAM"]], st.render))}
          ${ctl("Sys.Undo", seg("undo", [["true", "Show retractions"], ["false", "Hide"]], st.undo))}
        </div>
        <div class="ctl-row"><div class="range-wrap"><span class="ctl-label">Query time</span><input type="range" min="0" max="${T("12:08:00")}" step="60" value="${st.t}"><span class="range-val"></span></div></div>
        <div class="lab-panel"><pre style="margin:0 0 10px;font-size:12px"><code data-sql></code></pre><div data-out></div></div>
        <div class="lab-note" data-note></div>`;
      const snapshot = (q, t) => QUERIES[q].f(DATA.filter(r => r.t <= t));
      const changeTimes = [...new Set(DATA.map(r => r.t))].sort((a, b) => a - b);
      function draw() {
        const Q = QUERIES[st.q];
        el.querySelector(".range-val").textContent = fmt(st.t, false);
        const kw = st.render === "stream" ? "STREAM" : st.render === "tvr" ? "TVR" : "TABLE";
        const extra = st.render === "table" ? ", Sys.MTime" : st.render === "stream" ? `, Sys.EmitTime${st.undo ? ", Sys.Undo" : ""}` : "";
        el.querySelector("[data-sql]").textContent = `${fmt(st.t, false)}> SELECT ${kw} ${Q.sql.replace(" FROM", extra + " FROM")};`;
        const head = cols => `<thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>`;
        let html = "";
        if (st.render === "table") {
          const rows = snapshot(st.q, st.t);
          html = `<table class="mini-table">${head([...Q.cols, "Sys.MTime"])}<tbody>${rows.map(r => `<tr>${r.cells.map(c => `<td>${c}</td>`).join("")}<td>${fmt(r.mt, false)}</td></tr>`).join("") || `<tr><td colspan="${Q.cols.length + 1}" class="muted">(empty)</td></tr>`}</tbody></table>`;
        } else if (st.render === "tvr") {
          const bounds = [0, ...changeTimes.filter(c => c <= st.t)];
          html = `<div class="tvr-grid">${bounds.map((b, i) => {
            const end = i + 1 < bounds.length ? fmt(bounds[i + 1], false) : (st.t >= T("12:08:00") ? "now" : fmt(st.t, false) + "+");
            const rows = snapshot(st.q, b);
            return `<div class="tvr-cell"><div class="rng">[${fmt(b, false)}, ${end})</div><table class="mini-table">${head(Q.cols)}<tbody>${rows.map(r => `<tr>${r.cells.map(c => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${Q.cols.length}" class="muted">(empty)</td></tr>`}</tbody></table></div>`;
          }).join("")}</div>`;
        } else {
          const rowsOut = [];
          let prev = [];
          for (const c of changeTimes.filter(c => c <= st.t)) {
            const cur = snapshot(st.q, c);
            const pk = new Map(prev.map(r => [r.key, r])), ck = new Map(cur.map(r => [r.key, r]));
            prev.forEach(r => { const n = ck.get(r.key); if (!n || n.cells.join() !== r.cells.join()) rowsOut.push({ r, t: c, undo: true }); });
            cur.forEach(r => { const o = pk.get(r.key); if (!o || o.cells.join() !== r.cells.join()) rowsOut.push({ r, t: c, undo: false }); });
            prev = cur;
          }
          const shown = rowsOut.filter(x => st.undo || !x.undo);
          html = `<table class="mini-table">${head([...Q.cols, "Sys.EmitTime", ...(st.undo ? ["Sys.Undo"] : [])])}<tbody>${shown.map(x => `<tr class="${x.undo ? "undo" : ""}">${x.r.cells.map(c => `<td>${c}</td>`).join("")}<td>${fmt(x.t, false)}</td>${st.undo ? `<td>${x.undo ? "undo" : ""}</td>` : ""}</tr>`).join("") || `<tr><td colspan="6" class="muted">(no changes yet)</td></tr>`}</tbody></table><div class="cs-note" style="margin-top:4px">........ [12:00, ${fmt(st.t, false)}] ........</div>`;
        }
        el.querySelector("[data-out]").innerHTML = html;
        el.querySelector("[data-note]").innerHTML = st.q === "sum"
          ? (st.render === "stream" ? (st.undo ? "The grouped query's stream needs <strong>retractions</strong>: when Julie's total changes from 7 to 8, the old row is undone. A consumer can then rebuild any snapshot of the TVR, including regrouped ones." : "Without Sys.Undo, the stream only says Julie is now 8. An upserting consumer is fine, but anything that regroups would double-count.") : "Aggregation brings data to rest. Each snapshot is a classic relation, and relational algebra applies point by point, so closure holds.")
          : "Non-grouping queries only ever add rows here, so their stream has no retractions. Filtering a TVR gives a TVR.";
      }
      wireSegs(el, st, draw);
      el.querySelector("input[type=range]").addEventListener("input", e => { st.t = +e.target.value; draw(); });
      draw();
    }
  };

  // ==================================================================
  // CH8 · sqlEmit
  // ==================================================================
  DEMOS.sqlEmit = {
    title: "Streaming SQL: EMIT clauses and system columns",
    blurb: "The windowed team-score sum from Chapter 2, written as streaming SQL. Choose an <code>EMIT</code> clause and system columns, and see the resulting <code>SELECT STREAM</code> output. It is computed by the same engine as the Beam simulator, with the heuristic watermark and the nine scores.",
    mount(el) {
      const st = { emit: "default", timing: true, index: true, undo: false };
      const EMITS = {
        default: { trig: "perRecord", sql: "", label: "default (per record)" },
        delay: { trig: "unaligned", sql: "EMIT AFTER DELAY INTERVAL '1' MINUTE  -- illustrative syntax", label: "repeated 1-min delay" },
        watermark: { trig: "watermark", sql: "EMIT WHEN WATERMARK PAST WINDOW_END(Window)", label: "watermark" },
        wmLate: { trig: "wmLate", sql: "EMIT WHEN WATERMARK PAST WINDOW_END(Window)\n  AND THEN AFTER 0 SECONDS", label: "watermark + late" }
      };
      el.innerHTML = `
        <div class="ctl-row">${ctl("EMIT", seg("emit", [["default", "Default (per record)"], ["delay", "After delay 1 min"], ["watermark", "When watermark past"], ["wmLate", "Watermark + late"]], st.emit))}</div>
        <div class="ctl-row">
          ${ctl("Sys.EmitTiming", seg("timing", [["true", "On"], ["false", "Off"]], st.timing))}
          ${ctl("Sys.EmitIndex", seg("index", [["true", "On"], ["false", "Off"]], st.index))}
          ${ctl("Sys.Undo", seg("undo", [["true", "On"], ["false", "Off"]], st.undo))}
        </div>
        <div class="lab-grid">
          <div class="lab-panel"><pre style="margin:0;font-size:12px;overflow-x:auto"><code data-sql></code></pre></div>
          <div class="lab-panel"><h4>Final TABLE rendering at 12:11</h4><div data-table></div></div>
        </div>
        <div class="lab-panel" style="margin-top:14px"><h4>SELECT STREAM output</h4><div class="scroll-y" data-stream></div></div>
        <div class="lab-note" data-note></div>`;
      function draw() {
        const E = EMITS[st.emit];
        const cfg = { windowing: "fixed", trigger: E.trig, delay: 60, wm: "heuristic", accum: st.undo ? "retracting" : "accumulating", lateness: Infinity };
        const res = simulate(cfg, byPt(SCORES));
        const wmBased = ["watermark", "wmLate"].includes(E.trig);
        const cols = ["Total", "Window", "EmitTime"].concat(st.timing ? ["Sys.EmitTiming"] : [], st.index ? ["Sys.EmitIndex"] : [], st.undo ? ["Sys.Undo"] : []);
        el.querySelector("[data-sql]").textContent =
          `SELECT STREAM\n  SUM(Score) AS Total,\n  TUMBLE(EventTime, INTERVAL '2' MINUTE) AS Window,\n  CURRENT_TIMESTAMP AS EmitTime${st.timing ? ",\n  Sys.EmitTiming" : ""}${st.index ? ",\n  Sys.EmitIndex" : ""}${st.undo ? ",\n  Sys.Undo" : ""}\nFROM UserScores\nGROUP BY TUMBLE(EventTime, INTERVAL '2' MINUTE)` + (E.sql ? "\n" + E.sql : "") + ";";
        const rows = [];
        const tim = p => wmBased ? timingChip(p.timing) : '<span class="chip muted">n/a</span>';
        for (const p of res.panes) {
          if (p.retract !== null) rows.push(`<tr class="undo"><td class="num">${p.retract}</td><td>${winLabel(p)}</td><td>${fmt(p.t)}</td>${st.timing ? `<td>${tim(p)}</td>` : ""}${st.index ? `<td class="num">${p.idx - 1}</td>` : ""}${st.undo ? "<td>undo</td>" : ""}</tr>`);
          rows.push(`<tr><td class="num">${p.value}</td><td>${winLabel(p)}</td><td>${fmt(p.t)}</td>${st.timing ? `<td>${tim(p)}</td>` : ""}${st.index ? `<td class="num">${p.idx}</td>` : ""}${st.undo ? "<td></td>" : ""}</tr>`);
        }
        el.querySelector("[data-stream]").innerHTML = `<table class="mini-table"><thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table><div class="cs-note">.............. [12:00, 12:11] ..............</div>`;
        const fin = L.finalPerWindow(res, cfg.accum);
        el.querySelector("[data-table]").innerHTML = `<table class="mini-table"><thead><tr><th>Total</th><th>Window</th></tr></thead><tbody>${fin.map(f => `<tr><td class="num">${f.value}</td><td>${winLabel(f)}</td></tr>`).join("")}</tbody></table>`;
        el.querySelector("[data-note]").innerHTML = {
          default: "With no EMIT clause, a STREAM query emits on every change: 5, 7, 10, 4, 18, 3, 14, 11, 12. That is exactly the per-record trigger.",
          delay: "A repeated <em>unaligned</em> delay trigger fires 1 minute after the first new record for each window. It's slightly less chatty than per-record, and spreads load out. These match the book's Figure 8-12 (5 at 12:06:19, 10 at 12:06:39, 4 at 12:07:39, 18 at 12:08:06, …).",
          watermark: "One row per window when the heuristic watermark passes the window end. The [12:00, 12:02) window says 5 forever, because Frank's 9 is ignored.",
          wmLate: "The on-time row comes from the watermark, and <code>AND THEN AFTER 0 SECONDS</code> adds a late row per late record. Frank's 9 corrects window 1 to 14. Sys.EmitIndex distinguishes the revisions."
        }[st.emit] + " <span class='muted'>Watermark timings are this lab's model; the book's own figures use a slightly different watermark curve.</span>";
      }
      wireSegs(el, st, draw);
      draw();
    }
  };

  // ==================================================================
  // CH9 · joins
  // ==================================================================
  DEMOS.joins = {
    title: "Streaming joins: FULL OUTER and its derivatives",
    blurb: "Uses the book's Left (L1@12:02, L2@12:06, L3@12:03) and Right (R2@12:01, R3@12:04, R4@12:05) tables, joined on Num. Pick a join type and see the TABLE snapshot and the STREAM changelog with retractions. Then window the join into 5-minute TUMBLE windows and switch to a watermark trigger to see unmatched rows wait for completeness.",
    mount(el) {
      const LEFT = [{ id: "L1", num: 1, t: T("12:02:00") }, { id: "L2", num: 2, t: T("12:06:00") }, { id: "L3", num: 3, t: T("12:03:00") }];
      const RIGHT = [{ id: "R2", num: 2, t: T("12:01:00") }, { id: "R3", num: 3, t: T("12:04:00") }, { id: "R4", num: 4, t: T("12:05:00") }];
      const st = { type: "full", win: "none", trig: "perRecord", t: T("12:10:00") };
      el.innerHTML = `
        <div class="ctl-row">${ctl("Join", seg("type", [["full", "FULL OUTER"], ["left", "LEFT OUTER"], ["right", "RIGHT OUTER"], ["inner", "INNER"], ["anti", "ANTI"], ["semi", "SEMI"]], st.type))}</div>
        <div class="ctl-row">
          ${ctl("Windowing", seg("win", [["none", "Unwindowed"], ["tumble", "TUMBLE 5 min"]], st.win))}
          ${ctl("Trigger", seg("trig", [["perRecord", "Per record (default)"], ["watermark", "Watermark past window end"]], st.trig))}
          <div class="range-wrap"><span class="ctl-label">Time</span><input type="range" min="0" max="${T("12:10:00")}" step="60" value="${st.t}"><span class="range-val"></span></div>
        </div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>TABLE at query time</h4><div data-table></div></div>
          <div class="lab-panel"><h4>STREAM (changelog)</h4><div class="scroll-y" data-stream></div></div>
        </div>
        <div class="lab-note" data-note></div>`;
      const winOf = t => Math.floor(t / 300) * 300;
      const winTxt = w => `[${fmt(w, false)}, ${fmt(w + 300, false)})`;
      function joinAt(t) {
        const ls = LEFT.filter(r => r.t <= t), rs = RIGHT.filter(r => r.t <= t);
        const match = (l, r) => l.num === r.num && (st.win === "none" || winOf(l.t) === winOf(r.t));
        const out = [];
        const matchedR = new Set();
        for (const l of ls) {
          const ms = rs.filter(r => match(l, r));
          ms.forEach(r => matchedR.add(r.id));
          if (ms.length) {
            if (st.type === "semi") out.push({ L: l, R: null, semi: true });
            else if (st.type !== "anti") ms.forEach(r => out.push({ L: l, R: r }));
          } else if (["full", "left", "anti"].includes(st.type)) out.push({ L: l, R: null });
        }
        if (["full", "right", "anti"].includes(st.type)) for (const r of rs) if (!matchedR.has(r.id)) out.push({ L: null, R: r });
        return out.map(o => Object.assign(o, { key: (o.L ? o.L.id : "null") + "|" + (o.R ? o.R.id : o.semi ? "-" : "null"), w: st.win === "none" ? null : winOf((o.L || o.R).t) }));
      }
      const times = [...new Set([...LEFT, ...RIGHT].map(r => r.t))].sort((a, b) => a - b);
      function draw() {
        el.querySelector(".range-val").textContent = fmt(st.t, false);
        const wmMode = st.trig === "watermark";
        let stream = [];
        if (!wmMode) {
          let prev = [];
          for (const c of times.filter(c => c <= st.t)) {
            const cur = joinAt(c), pk = new Set(prev.map(x => x.key)), ck = new Set(cur.map(x => x.key));
            prev.filter(x => !ck.has(x.key)).forEach(x => stream.push({ x, t: c, undo: true }));
            cur.filter(x => !pk.has(x.key)).forEach(x => stream.push({ x, t: c, undo: false }));
            prev = cur;
          }
        } else {
          const final = joinAt(Infinity);
          for (const x of final) {
            const emitAt = st.win === "none" ? Infinity : x.w + 300;
            if (emitAt <= st.t) stream.push({ x, t: emitAt, undo: false });
          }
          stream.sort((a, b) => a.t - b.t);
        }
        const table = wmMode ? stream.map(s => s.x) : joinAt(st.t);
        const cell = r => r ? r.id : '<span class="muted">null</span>';
        const showR = st.type !== "semi";
        const hdr = `<th>L</th>${showR ? "<th>R</th>" : ""}${st.win !== "none" ? "<th>Window</th>" : ""}`;
        const row = x => `<td>${cell(x.L)}</td>${showR ? `<td>${cell(x.R)}</td>` : ""}${st.win !== "none" ? `<td>${winTxt(x.w)}</td>` : ""}`;
        el.querySelector("[data-table]").innerHTML = `<table class="mini-table"><thead><tr>${hdr}</tr></thead><tbody>${table.map(x => `<tr>${row(x)}</tr>`).join("") || `<tr><td colspan="3" class="muted">(empty)</td></tr>`}</tbody></table>`;
        el.querySelector("[data-stream]").innerHTML = `<table class="mini-table"><thead><tr>${hdr}<th>Time</th><th>Undo</th></tr></thead><tbody>${stream.map(s => `<tr class="${s.undo ? "undo" : ""}">${row(s.x)}<td>${fmt(s.t, false)}</td><td>${s.undo ? "undo" : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">${wmMode && st.win === "none" ? "unwindowed + watermark: nothing until the input ends" : "(no output yet)"}</td></tr>`}</tbody></table>`;
        const undos = stream.filter(s => s.undo).length;
        const notes = {
          full: "FULL OUTER keeps everything. Unmatched rows appear immediately with NULLs and are <strong>retracted</strong> once a partner shows up, as (L3, null) does at 12:04.",
          left: "LEFT OUTER = FULL OUTER with rows whose left side is null filtered out.",
          right: "RIGHT OUTER = FULL OUTER with rows whose right side is null filtered out.",
          inner: "INNER = FULL OUTER filtered to rows where both sides are non-null. With 1:1 keys, its stream needs no retractions.",
          anti: "ANTI = only the unjoined rows. It's just as retraction-heavy as FULL OUTER, because rows that eventually match must be removed.",
          semi: "SEMI = left rows with at least one match, each returned once regardless of how many matches."
        };
        let extra = "";
        if (st.win === "tumble") extra = " With 5-minute windows, <strong>L2 (12:06) and R2 (12:01) no longer join</strong>, because they fall in different windows.";
        if (wmMode) extra += st.win === "tumble" ? " With a watermark trigger, each window's results are emitted once, when the watermark passes 12:05 and then 12:10. NULL rows are final, and there are no retractions." : " An unwindowed join has no window end for the watermark to pass, so it can only finalize at the end of input. That's why windowing helps time out outer joins.";
        el.querySelector("[data-note]").innerHTML = notes[st.type] + extra + (wmMode ? "" : ` <span class="muted">(${undos} retraction${undos === 1 ? "" : "s"} so far)</span>`);
      }
      wireSegs(el, st, draw);
      el.querySelector("input[type=range]").addEventListener("input", e => { st.t = +e.target.value; draw(); });
      draw();
    }
  };

  // ==================================================================
  // CH9 · temporalValidity
  // ==================================================================
  DEMOS.temporalValidity = {
    title: "Temporal validity join: converting euros to yen",
    blurb: "Rates slice event time into <strong>validity windows</strong>: each rate is valid until the next one starts. Rates arrive out of order, so windows <strong>split and shrink</strong>. Each order joins the rate valid at its event time. Compare per-record output (with retractions) with a watermark trigger (one final row per order).",
    mount(el) {
      const RATES = [{ rate: 114, et: T("12:00:30"), pt: T("12:06:23") }, { rate: 116, et: T("12:03:00"), pt: T("12:09:07") }, { rate: 119, et: T("12:06:00"), pt: T("12:07:33") }];
      const ORDERS = [{ amt: 2, et: T("12:02:00"), pt: T("12:05:07") }, { amt: 5, et: T("12:05:00"), pt: T("12:08:00") }, { amt: 3, et: T("12:08:00"), pt: T("12:09:33") }];
      const END = T("12:11:00");
      const st = { trig: "perRecord", P: END };
      el.innerHTML = `
        <div class="ctl-row">
          ${ctl("Trigger", seg("trig", [["perRecord", "Per record (default)"], ["watermark", "EMIT WHEN WATERMARK PAST WINDOW_END"]], st.trig))}
          <div class="range-wrap"><span class="ctl-label">Processing time</span><input type="range" min="${T("12:05:00")}" max="${END}" step="1" value="${st.P}"><span class="range-val"></span></div>
        </div>
        <div class="lab-panel"><h4>Euro → Yen validity windows (event time) as known at this processing time</h4><div data-svg></div></div>
        <div class="lab-grid even" style="margin-top:14px">
          <div class="lab-panel"><h4>Joined TABLE</h4><div data-table></div></div>
          <div class="lab-panel"><h4>STREAM</h4><div data-stream></div></div>
        </div>
        <div class="lab-note" data-note></div>`;
      const windowsAt = P => {
        const known = RATES.filter(r => r.pt <= P).sort((a, b) => a.et - b.et);
        return known.map((r, i) => ({ rate: r.rate, start: r.et, end: i + 1 < known.length ? known[i + 1].et : Infinity }));
      };
      const joinAt = P => ORDERS.filter(o => o.pt <= P).map(o => { const w = windowsAt(P).find(w => o.et >= w.start && o.et < w.end); return w ? { o, w, y: o.amt * w.rate } : null; }).filter(Boolean);
      const wmAt = P => { if (P >= END) return Infinity; let m = P; [...RATES, ...ORDERS].forEach(x => { if (x.pt > P) m = Math.min(m, x.et); }); return m; };
      const events = [...RATES, ...ORDERS].map(x => x.pt).sort((a, b) => a - b);
      function draw() {
        const P = st.P;
        el.querySelector(".range-val").textContent = `${fmt(P)} · WM ${fmt(wmAt(P))}`;
        const W = 640, H = 120, m = { l: 20, r: 20, t: 14, b: 26 };
        const X = lin(0, 600, m.l, W - m.r);
        let s = `<g class="svg-axis">`;
        for (let v = 0; v <= 600; v += 60) s += `<line class="svg-grid" x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(v)}" y="${H - m.b + 13}" text-anchor="middle">${fmt(v, false)}</text>`;
        s += `</g>`;
        const cols = { 114: "var(--accent)", 116: "var(--accent-3)", 119: "var(--accent-2)" };
        windowsAt(P).forEach(w => {
          const xa = X(w.start), xb = X(Math.min(600, w.end));
          s += `<rect x="${xa}" y="${m.t + 4}" width="${xb - xa}" height="34" rx="4" style="fill:${cols[w.rate]};opacity:0.28;stroke:${cols[w.rate]}"/><text class="svg-title" x="${xa + 6}" y="${m.t + 25}">${w.rate} ¥/€</text>`;
        });
        if (!windowsAt(P).length) s += `<text class="svg-label" x="${X(300)}" y="${m.t + 25}" text-anchor="middle">no rates known yet: every rate is undefined</text>`;
        ORDERS.forEach(o => {
          const seen = o.pt <= P;
          s += `<circle class="svg-rec ${seen ? "seen" : "pending"}" cx="${X(o.et)}" cy="${m.t + 60}" r="10"/><text class="svg-rec-txt ${seen ? "" : "pending"}" x="${X(o.et)}" y="${m.t + 60}">€${o.amt}</text>`;
        });
        if (st.trig === "watermark") { const wm = wmAt(P); if (isFinite(wm)) s += `<line class="svg-wm" x1="${X(clamp(wm, 0, 600))}" x2="${X(clamp(wm, 0, 600))}" y1="${m.t}" y2="${H - m.b}"/><text class="svg-pane-txt ON_TIME" x="${X(clamp(wm, 0, 600)) + 3}" y="${H - m.b - 4}">WM</text>`; }
        el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, s);

        let stream = [];
        if (st.trig === "perRecord") {
          let prev = [];
          for (const c of events.filter(c => c <= P)) {
            const cur = joinAt(c);
            const key = j => j.o.amt + "@" + j.o.et;
            const pk = new Map(prev.map(j => [key(j), j])), ck = new Map(cur.map(j => [key(j), j]));
            prev.forEach(j => { const n = ck.get(key(j)); if (!n || n.y !== j.y) stream.push({ j, t: c, undo: true }); });
            cur.forEach(j => { const o = pk.get(key(j)); if (!o || o.y !== j.y) stream.push({ j, t: c, undo: false }); });
            prev = cur;
          }
        } else {
          const emitted = new Set();
          for (let p = T("12:05:00"); p <= P; p++) {
            const wm = wmAt(p);
            for (const j of joinAt(p)) {
              const k = j.o.amt + "@" + j.o.et;
              if (!emitted.has(k) && wm >= j.w.end) { emitted.add(k); stream.push({ j, t: p, undo: false }); }
            }
          }
        }
        const table = st.trig === "perRecord" ? joinAt(P) : stream.map(s => s.j);
        const rowH = "<th>€</th><th>¥/€</th><th>¥</th><th>Order</th>";
        const row = j => `<td>${j.o.amt}</td><td>${j.w.rate}</td><td>${j.y}</td><td>${fmt(j.o.et, false)}</td>`;
        el.querySelector("[data-table]").innerHTML = `<table class="mini-table"><thead><tr>${rowH}</tr></thead><tbody>${table.map(j => `<tr>${row(j)}</tr>`).join("") || '<tr><td colspan="4" class="muted">(empty)</td></tr>'}</tbody></table>`;
        el.querySelector("[data-stream]").innerHTML = `<table class="mini-table"><thead><tr>${rowH}<th>Time</th><th>Undo</th></tr></thead><tbody>${stream.map(x => `<tr class="${x.undo ? "undo" : ""}">${row(x.j)}<td>${x.t >= END ? "end" : fmt(x.t)}</td><td>${x.undo ? "undo" : ""}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">(nothing yet)</td></tr>'}</tbody></table>`;
        el.querySelector("[data-note]").innerHTML = st.trig === "perRecord"
          ? "Per-record: at 12:08:00 the €5 order (12:05) joins 114, because 116 hasn't arrived and 114's window still covers 12:05. At 12:09:07 the 116 rate arrives, <strong>splits</strong> 114's window, and the 570 row is retracted and replaced by 580. Final answer: 228, 580, 357."
          : "Watermark trigger: an order emits only once the watermark passes the end of its validity window, so every row is final and there are no retractions. Orders €2 and €5 emit when the watermark jumps at 12:09:07. The €3 order sits in the open-ended 119 window and emits at end of input. <span class='muted'>The book's emit times (12:08:52, 12:10:04, 12:10:13) come from its own watermark curve. The values are the same.</span>";
      }
      wireSegs(el, st, draw);
      el.querySelector("input[type=range]").addEventListener("input", e => { st.P = +e.target.value; draw(); });
      draw();
    }
  };

  // ==================================================================
  // CH10 · timeline
  // ==================================================================
  DEMOS.timeline = {
    title: "Timeline: ten systems that shaped streaming",
    blurb: "Click a system to see its key contribution, what it got wrong or left unsolved, and what it passed on.",
    mount(el) {
      const SYS = [
        { n: "MapReduce", y: 2004, org: "Google", c: "Scalability and simplicity", d: "A tiny Map → Shuffle → Reduce API on a fault-tolerant engine over commodity hardware. The 2004 paper changed the industry.", w: "Rigid shape; real pipelines became chains of hand-tuned jobs." },
        { n: "Hadoop", y: 2006, org: "Yahoo / Apache", c: "Open-source ecosystem", d: "Open-source MapReduce and HDFS. It spawned Pig, Hive, HBase and a whole ecosystem.", w: "Inherited MapReduce's batch-only, rigid model." },
        { n: "Flume", y: 2007, org: "Google", c: "Pipelines and optimization", d: "FlumeJava: logical pipelines plus an optimizer (fusion, combiner lifting) that escapes the Map → Shuffle → Reduce shape without hand-tuning.", w: "Internal to Google; batch-oriented until streaming was added later." },
        { n: "Storm", y: 2011, org: "BackType / Twitter", c: "Low latency, weak consistency", d: "Brought stream processing to the masses by trading correctness for latency.", w: "No exactly-once state, which gave rise to the Lambda Architecture." },
        { n: "Kafka", y: 2011, org: "LinkedIn", c: "Durable streams; streams and tables", d: "A persistent, replayable log as the streaming transport. It popularized stream/table duality.", w: "A transport, not a processing model (Kafka Streams came later)." },
        { n: "Spark", y: 2013, org: "UC Berkeley", c: "Strong consistency", d: "RDDs; Spark Streaming as repeated deterministic microbatches showed correctness and low latency could coexist.", w: "Assumed in-order data; latency was bound to the batch interval." },
        { n: "MillWheel", y: 2013, org: "Google", c: "Out-of-order processing", d: "Exactly-once persistent state plus watermarks and timers made robust out-of-order streaming possible.", w: "Low-level API; internal to Google." },
        { n: "Cloud Dataflow", y: 2015, org: "Google", c: "Unified batch + streaming", d: "MillWheel's out-of-order processing combined with Flume's optimizable pipelines: the Dataflow Model and the What/Where/When/How questions.", w: "A managed service; the model needed an open home, which became Beam." },
        { n: "Flink", y: 2015, org: "Apache", c: "Open-source streaming innovator", d: "Quickly adopted the Dataflow Model's out-of-order processing in open source, and added distributed snapshots and savepoints.", w: "Pushed the industry; its savepoint idea is still being adopted elsewhere." },
        { n: "Beam", y: 2016, org: "Apache", c: "Portability", d: "A portable model and SDKs that run on Flink, Spark, Dataflow, Apex and more. It aims to be the programmatic equivalent of SQL.", w: "Feature support varies by runner." }
      ];
      const st = { sel: 7 };
      el.innerHTML = `<div class="lab-panel"><div data-svg></div></div><div class="lab-card tl-card" style="margin-bottom:0" data-card></div>`;
      function draw() {
        const W = 680, H = 210, m = { l: 20, r: 20, t: 16, b: 30 };
        const X = lin(2003, 2017, m.l, W - m.r);
        let s = `<g class="svg-axis">`;
        for (let y = 2003; y <= 2017; y++) s += `<line class="svg-grid" x1="${X(y)}" x2="${X(y)}" y1="${m.t}" y2="${H - m.b}"/><text x="${X(y)}" y="${H - m.b + 14}" text-anchor="middle">${y}</text>`;
        s += `</g>`;
        const rowsUsed = {};
        SYS.forEach((x, i) => {
          const r = rowsUsed[x.y] = (rowsUsed[x.y] === undefined ? 0 : rowsUsed[x.y] + 1);
          const y = m.t + 6 + ((i % 4) + r) % 5 * 32;
          const on = i === st.sel;
          s += `<g class="svg-tl-bar" data-i="${i}"><rect x="${X(x.y) - 4}" y="${y}" width="${x.n.length * 7 + 16}" height="24" rx="6" style="fill:${on ? "var(--accent)" : "var(--bg-3)"};stroke:${on ? "var(--accent)" : "var(--border)"};opacity:${on ? 1 : 0.9}"/><text x="${X(x.y) + 4}" y="${y + 16}" style="font-size:11.5px;font-weight:600;fill:${on ? "#fff" : "var(--text)"}">${x.n}</text></g>`;
        });
        el.querySelector("[data-svg]").innerHTML = svgWrap(W, H, s);
        el.querySelectorAll(".svg-tl-bar").forEach(g => g.addEventListener("click", () => { st.sel = +g.dataset.i; draw(); }));
        const x = SYS[st.sel];
        el.querySelector("[data-card]").innerHTML = `<div class="lab-head"><span class="lab-tag">${x.y} · ${x.org}</span><h3>${x.n}: ${x.c}</h3></div>
          <div style="font-size:14px;margin-bottom:8px">${x.d}</div>
          <div class="lab-note warn">${x.w}</div>
          <div class="ctl-row" style="margin-top:12px"><button class="iconbtn" data-p ${st.sel === 0 ? "disabled" : ""}>← Previous</button><button class="iconbtn" data-n ${st.sel === SYS.length - 1 ? "disabled" : ""}>Next →</button></div>`;
        el.querySelector("[data-p]").addEventListener("click", () => { st.sel = Math.max(0, st.sel - 1); draw(); });
        el.querySelector("[data-n]").addEventListener("click", () => { st.sel = Math.min(SYS.length - 1, st.sel + 1); draw(); });
      }
      draw();
    }
  };
})();
