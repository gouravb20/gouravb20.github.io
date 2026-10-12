// Essential GraphRAG - interactive labs, part 2 (chapters 5-8 + appendix). Depends on labkit.js.
(function () {
  "use strict";
  const K = window.LabKit;
  const { esc, clamp, sum, round, seg, wireSegs, rng, wireRanges, ctl, svgWrap, stat, note, hbars, axes, path, fmtNum, okChip, mulberry32 } = K;
  const D = window.DEMOS;
  const pblock = (cls, head, body) => `<div class="pblock ${cls}"><div class="pblock-h">${head}</div><pre>${esc(body)}</pre></div>`;
  const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;
  const COLORS = [`#14b8a6`, `#38bdf8`, `#f59e0b`, `#a855f7`, `#ef4444`, `#22c55e`, `#ec4899`, `#94a3b8`];

  // =====================================================================
  // Ch5 - Agentic RAG: query updater, router, tools, answer critic
  // =====================================================================
  const AG = {
    title: { label: `movie by title`, q: `Who directed The Matrix?` },
    actor: { label: `movies by actor`, q: `What movies has Keanu Reeves acted in?` },
    agg: { label: `aggregation`, q: `Who directed the most movies?` },
    given: { label: `answer in question`, q: `What's Dave Smith's last name?` },
    follow: { label: `follow-up`, q: `When was he born?`, prev: `For the question: 'Who directed Top Gun?', we have the answer: '[{"movie": "Top Gun", "directors": ["Tony Scott"]}]'` },
    missing: { label: `data missing`, q: `Who has won the most Oscars, and is that person alive?` }
  };
  function agentTrace(k, upd, crit) {
    const T = []; let llm = 0, tools = 0, ok = true, final;
    const L = (kind, head, body, cls) => T.push({ kind, head, body, cls });
    const S = AG[k];
    if (S.prev) L(`ctx`, `previous answers in conversation`, S.prev);
    L(`user`, `user input`, S.q);
    const round1 = (question, label) => {
      let qq = question;
      if (upd) {
        llm++;
        if (k === `follow` && question === S.q) qq = `When was Tony Scott born?`;
        L(`sys`, `query updater (LLM)${label}`, qq === question ? `{"question": "${question}"} (already atomic, kept)` : `{"question": "${qq}"}`);
      }
      llm++;
      let call, result;
      if (k === `title`) { call = `movie_info_by_title({"title": "The Matrix"})`; result = `[{"movie": "The Matrix", "cast": ["Keanu Reeves", "Carrie-Anne Moss", "Laurence Fishburne"], "directors": ["Lana Wachowski", "Lilly Wachowski"]}]`; }
      else if (k === `actor`) { call = `movies_info_by_actor({"actor": "Keanu Reeves"})`; result = `[{"movie": "The Matrix"}, {"movie": "The Matrix Reloaded"}]`; }
      else if (k === `agg`) { call = `text2cypher({"question": "Who directed the most movies?"})`; llm++; result = `generated: MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN p.name, COUNT(m) AS movieCount ORDER BY movieCount DESC LIMIT 1\nrows: [{"p.name": "Rob Reiner", "movieCount": 3}]`; }
      else if (k === `given`) { call = `answer_given({"answer": "Smith"})`; result = `"Smith"`; }
      else if (k === `follow`) {
        call = `text2cypher({"question": "${qq}"})`; llm++;
        result = qq.includes(`Tony Scott`) ? `generated: MATCH (p:Person {name: 'Tony Scott'}) RETURN p.born\nrows: [{"p.born": 1944}]` : `generated: MATCH (p:Person) RETURN p.name, p.born LIMIT 1\nrows: [{"p.name": "Tom Hanks", "p.born": 1956}]`;
      } else { call = `text2cypher({"question": "${qq}"})`; llm++; result = `generated: MATCH (p:Person) RETURN p.name ORDER BY p.oscars DESC LIMIT 1\nrows: [] (no oscars property in the graph)`; }
      tools++;
      L(`sys`, `retriever router (LLM tool call)`, call);
      L(`ctx`, `tool executed by our code`, result);
      return { qq, result };
    };
    const r1 = round1(S.q, ``);
    let resolved = !(k === `follow` && !r1.qq.includes(`Tony Scott`));
    if (crit) {
      llm++;
      if (!resolved) {
        L(`bad`, `answer critic (LLM)`, `{"questions": ["When was Tony Scott born?"]}  // the answer is about Tom Hanks, not the director of Top Gun`);
        const r2q = `When was Tony Scott born?`;
        if (upd) { llm++; L(`sys`, `query updater (LLM) · round 2`, `{"question": "${r2q}"} (already atomic, kept)`); }
        llm += 2; tools++;
        L(`sys`, `retriever router (LLM tool call) · round 2`, `text2cypher({"question": "${r2q}"})`);
        L(`ctx`, `tool executed by our code`, `generated: MATCH (p:Person {name: 'Tony Scott'}) RETURN p.born\nrows: [{"p.born": 1944}]`);
        resolved = true;
      } else if (k === `missing`) {
        L(`bad`, `answer critic (LLM)`, `{"questions": ["Which person has won the most Oscars?", "Is that person alive?"]}`);
        if (upd) { llm++; L(`sys`, `query updater (LLM) · round 2`, `{"question": "Which person has won the most Oscars? Is that person alive?"}`); }
        llm += 2; tools++;
        L(`sys`, `retriever router (LLM tool call) · round 2`, `text2cypher({"question": "Which person has won the most Oscars? Is that person alive?"})`);
        L(`ctx`, `tool executed by our code`, `rows: [] (still no Oscar data)`);
        L(`sys`, `exit criterion`, `Critique runs only once. Return what we have and let the final LLM say what's missing.`);
      } else L(`out`, `answer critic (LLM)`, `{"questions": []}  // fully answered`);
    }
    llm++;
    final = { title: `The Matrix was directed by Lana Wachowski and Lilly Wachowski.`, actor: `Keanu Reeves acted in The Matrix and The Matrix Reloaded.`, agg: `Rob Reiner directed the most movies (3).`, given: `Dave Smith's last name is Smith.`, missing: `The database doesn't contain information about Oscars, so I can't say who has won the most or whether that person is alive.` }[k];
    if (k === `follow`) { final = resolved ? `Tony Scott, the director of Top Gun, was born in 1944.` : `He was born in 1956.`; ok = resolved; }
    L(ok ? `out` : `bad`, `final answer (LLM, grounded in the answers only)`, final);
    return { T, llm, tools, ok };
  }
  D.agenticRouter = {
    title: `Agentic RAG: router, tools, query updater, answer critic`,
    blurb: `The Chapter 5 system over the Movies graph with four tools: <code>movie_info_by_title</code>, <code>movies_info_by_actor</code>, <code>text2cypher</code> (catch-all) and <code>answer_given</code>. Step through the trace. Turn the <strong>query updater</strong> and <strong>answer critic</strong> off to see what each one buys you, and what it costs in LLM calls. Traces are scripted to match the book's design.`,
    mount(el) {
      const st = { k: `title`, upd: true, crit: true, n: 99 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`question`, seg(`k`, Object.keys(AG).map(k => [k, AG[k].label]), st.k))}</div>
        <div class="ctl-row">${ctl(`query updater`, seg(`upd`, [[true, `on`], [false, `off`]], st.upd))}${ctl(`answer critic`, seg(`crit`, [[true, `on`], [false, `off`]], st.crit))}<button class="lab-btn ghost" data-k="step">Next step</button><button class="lab-btn ghost" data-k="all">Show all</button></div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-panel"><h4>Trace</h4><div data-k="trace"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const r = agentTrace(st.k, st.upd, st.crit);
        const shown = r.T.slice(0, st.n);
        q(`trace`).innerHTML = shown.map(t => pblock(t.kind, t.head, t.body)).join("") + (shown.length < r.T.length ? `<div class="cs-note">… ${r.T.length - shown.length} more step(s)</div>` : ``);
        q(`step`).disabled = shown.length >= r.T.length;
        q(`stats`).innerHTML = stat(`LLM calls`, r.llm) + stat(`tool calls`, r.tools) + stat(`result`, r.ok ? `correct` : `wrong`, r.ok ? `good` : `bad`);
        const n = {
          title: `A specialized Cypher template answers this directly: no Cypher generation, fewer LLM calls, reliable output.`,
          actor: `The router extracts the argument ("Keanu Reeves") and picks the actor template. The LLM only chooses; our code executes.`,
          agg: `No template fits an aggregation, so the router falls back to text2cypher, which costs one more LLM call to generate the query.`,
          given: `The answer is already in the question, so the answer_given tool avoids a pointless database call.`,
          follow: st.upd ? `The query updater uses the previous answer to rewrite "he" into "Tony Scott", so routing gets an atomic question.` : st.crit ? `Without the updater, text2cypher guessed and returned Tom Hanks. The critic caught it and asked a precise follow-up question.` : `Without the updater and the critic, the ambiguous "he" produces a confident wrong answer.`,
          missing: st.crit ? `The critic asks for the missing pieces, the data still isn't there, and the loop exits after one critique. The final prompt forbids making things up, so the answer says the information is missing.` : `With the critic off the answer is the same here, at fewer LLM calls. The critic pays off when a better retrieval exists.`
        }[st.k];
        q(`note`).innerHTML = note(n, r.ok ? `good` : `warn`);
      };
      wireSegs(el, st, () => { st.n = 99; draw(); });
      q(`step`).addEventListener(`click`, () => { if (st.n >= 99) st.n = 1; else st.n++; draw(); });
      q(`all`).addEventListener(`click`, () => { st.n = 99; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch6 - Structured extraction: schema choices -> JSON -> graph queries
  // =====================================================================
  const CONTRACT = `LICENSE AGREEMENT. This Agreement is entered into as of February 26, 1999 between TrueLink, Inc., 3026 South Higuera, San Luis Obispo, California ("TrueLink"), and Mortgage Logic.com, Inc., Two Venture Plaza, Irvine, California ("Client"). TrueLink grants Client a nonexclusive license to use the Interface for origination, underwriting, processing and funding of consumer finance receivables, and will provide hosting and support services. The term is one year, renewing automatically for successive one-year periods unless either party gives 30 days' notice before the end of the term. This Agreement is governed by the laws of the State of California.`;
  const EXISTING = [
    { contract_type: `Licensing Agreement`, effective_date: `2024-01-03`, total_amount: 10000, parties: [[`Acme Inc.`, `US`], [`Disney Inc.`, `US`]] },
    { contract_type: `Service Agreement`, effective_date: `2021-05-01`, total_amount: 250000, parties: [[`Globex Corp`, `US`], [`Initech LLC`, `US`]] },
    { contract_type: `Non-Disclosure Agreement (NDA)`, effective_date: `1998-07-15`, total_amount: null, parties: [[`Umbrella Ltd`, `GB`], [`Acme Inc.`, `US`]] }
  ];
  function extractContract(o) {
    return {
      contract_type: o.enumOn ? `Licensing Agreement` : `License Agreement`,
      parties: [
        { name: `Mortgage Logic.com, Inc.`, location: { address: `Two Venture Plaza`, city: `Irvine`, state: `California`, country: o.iso ? `US` : `United States` }, role: `Client` },
        { name: `TrueLink, Inc.`, location: { address: `3026 South Higuera`, city: `San Luis Obispo`, state: `California`, country: o.iso ? `US` : `USA` }, role: `Provider` }
      ],
      effective_date: o.fmt ? `1999-02-26` : `February 26, 1999`,
      term: `1 year, with automatic renewal for successive one-year periods unless terminated with 30 days' notice prior to the end of the term.`,
      end_date: o.opt ? null : `2000-02-26`,
      total_amount: o.opt ? null : 10000.0,
      governing_law: { address: null, city: null, state: `California`, country: o.iso ? `US` : `United States` }
    };
  }
  const EXQ = [
    { q: `How many Licensing Agreements do we have?`, cy: `MATCH (c:Contract {contract_type: 'Licensing Agreement'}) RETURN count(c)`, f: (all) => all.filter(c => c.contract_type === `Licensing Agreement`).length, truth: 2 },
    { q: `How many contracts involve a US organization?`, cy: `MATCH (c:Contract)<-[:HAS_PARTY]-(:Organization)-[:LOCATED_AT]->(l:Location {country: 'US'}) RETURN count(DISTINCT c)`, f: (all) => all.filter(c => c.parties.some(p => p[1] === `US`)).length, truth: 4 },
    { q: `How many contracts became effective before 2000?`, cy: `MATCH (c:Contract) WHERE c.effective_date < '2000-01-01' RETURN count(c)`, f: (all) => all.filter(c => c.effective_date < `2000-01-01`).length, truth: 2 },
    { q: `What is the total value of all contracts?`, cy: `MATCH (c:Contract) RETURN sum(c.total_amount)`, f: (all) => sum(all.map(c => c.total_amount || 0)), truth: 260000 }
  ];
  D.extraction = {
    title: `Structured extraction: schema choices decide query quality`,
    blurb: `The CUAD license agreement from section 6.1.3 (abridged), extracted with a Pydantic <code>Contract</code> model via Structured Outputs and imported next to three contracts already in the graph. Each toggle is a schema-design rule from the chapter. Turn rules off and watch the JSON drift and the downstream Cypher answers go wrong. The JSON for each setting is scripted to show typical model behavior.`,
    mount(el) {
      const st = { opt: true, enumOn: true, fmt: true, iso: true };
      el.innerHTML = `
        <div class="ctl-row">${[[`opt`, `Optional end_date / total_amount`], [`enumOn`, `enum for contract_type`], [`fmt`, `"Use yyyy-MM-dd format"`], [`iso`, `"two-letter ISO country"`]].map(([k, l]) => ctl(l, seg(k, [[true, `on`], [false, `off`]], st[k]))).join("")}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid even"><div class="lab-panel"><h4>Contract text → extracted JSON</h4><details style="margin-bottom:6px"><summary class="cs-note" style="cursor:pointer">show contract text</summary><div class="cs-note" style="margin-top:4px">${esc(CONTRACT)}</div></details><div data-k="json"></div></div><div class="lab-panel"><h4>Questions over the contract graph (4 contracts)</h4><div data-k="qs"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const x = extractContract(st);
        const bad = new Set();
        if (!st.enumOn) bad.add(`contract_type`); if (!st.fmt) bad.add(`effective_date`); if (!st.iso) bad.add(`country`); if (!st.opt) { bad.add(`end_date`); bad.add(`total_amount`); }
        const json = JSON.stringify(x, null, 2).split(`\n`).map(line => { const m = line.match(/"(\w+)":/); const isBad = m && bad.has(m[1]); return isBad ? `<span style="color:var(--bad);font-weight:700">${esc(line)}  ⚠</span>` : esc(line); }).join(`\n`);
        q(`json`).innerHTML = `<div class="pblock out"><div class="pblock-h">response_format=Contract</div><pre>${json}</pre></div>`;
        const mine = { contract_type: x.contract_type, effective_date: x.effective_date, total_amount: x.total_amount, parties: x.parties.map(p => [p.name, p.location.country]) };
        const all = EXISTING.concat([mine]);
        let right = 0;
        q(`qs`).innerHTML = EXQ.map(E => { const v = E.f(all), ok = v === E.truth; if (ok) right++; return `<div style="margin-bottom:8px"><div><b>${esc(E.q)}</b></div><div class="mono cs-note" style="font-size:11px">${esc(E.cy)}</div><div>→ ${fmtNum(v, 1)} ${okChip(ok)} ${ok ? `` : `<span class="cs-note">truth ${fmtNum(E.truth, 1)}</span>`}</div></div>`; }).join("");
        q(`stats`).innerHTML = stat(`questions right`, `${right} / ${EXQ.length}`, right === EXQ.length ? `good` : `bad`) + stat(`problem fields`, bad.size, bad.size ? `bad` : `good`);
        const msgs = [];
        if (!st.opt) msgs.push(`<b>Required</b> end_date and total_amount: the contract has neither, so the model invents them (an end date one year out, a $10,000 amount). Mark fields Optional when they may be absent.`);
        if (!st.enumOn) msgs.push(`Without the <b>enum</b> the model copies the heading ("License Agreement"), so an exact-match filter misses it.`);
        if (!st.fmt) msgs.push(`Without a <b>date format</b> in the description, dates come back as prose and string comparison breaks ("February..." sorts after "2000-...").`);
        if (!st.iso) msgs.push(`Without the <b>ISO standard</b>, countries come back as "USA" / "United States", so US filters miss them.`);
        q(`note`).innerHTML = note(msgs.length ? msgs.join(`<br>`) : `All four rules on: the extraction is consistent with the rest of the graph, so filters, counts and sums work. Structured data enables what embeddings can't: filtering, counting and aggregating.`, msgs.length ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch6 - Entity resolution
  // =====================================================================
  const ER = [
    [`UTI Asset Management Company`, `A`], [`UTI Asset Management Company Limited`, `A`], [`UTI Asset Management Company Ltd`, `A`], [`UTI Asset Mgmt. Co.`, `A`],
    [`Mortgage Logic.com, Inc.`, `B`], [`MortgageLogic.com Inc`, `B`], [`Mortgage Logic`, `B`],
    [`TrueLink, Inc.`, `C`], [`True Link Inc.`, `C`], [`Truelink`, `C`],
    [`ACME Inc.`, `D`], [`Acme Incorporated`, `D`], [`ACME Industries`, `E`], [`Acme Insurance Ltd`, `F`], [`UTI Infrastructure Technology Ltd`, `G`]
  ];
  const SUFFIX = new Set([`inc`, `incorporated`, `ltd`, `limited`, `llc`, `co`, `company`, `corp`, `corporation`, `com`]);
  const ABBR = { mgmt: `management`, co: `company`, intl: `international` };
  function erNorm(s, o) {
    let w = s.toLowerCase().replace(/[.,]/g, ` `).split(/\s+/).filter(Boolean);
    if (o.abbr) w = w.map(x => ABBR[x] || x);
    if (o.suffix) w = w.filter(x => !SUFFIX.has(x));
    return w.join(` `);
  }
  D.entityResolution = {
    title: `Entity resolution: when are two names the same organization?`,
    blurb: `Organization names as LLM extraction produces them across many contracts. Figure 6.5's three UTI variants are here, plus traps: <em>ACME Industries</em> and <em>Acme Insurance</em> are different companies, and so is <em>UTI Infrastructure Technology</em>. Choose normalization steps, a similarity function and a threshold. Pairs above the threshold are merged (transitively). The book's point: there's no generic setting; it's domain-specific.`,
    mount(el) {
      const st = { suffix: true, abbr: false, sim: `edit`, th: 0.8 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`strip legal suffixes`, seg(`suffix`, [[true, `on`], [false, `off`]], st.suffix))}${ctl(`expand abbreviations`, seg(`abbr`, [[true, `on`], [false, `off`]], st.abbr))}${ctl(`similarity`, seg(`sim`, [[`edit`, `edit distance ratio`], [`jac`, `token Jaccard`]], st.sim))}${ctl(`merge threshold`, rng(`th`, 0.4, 1, 0.02, st.th))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid even"><div class="lab-panel"><h4>Resulting nodes</h4><div data-k="clusters"></div></div><div class="lab-panel"><h4>Closest pairs</h4><div class="scroll-y" style="max-height:340px"><table class="mini-table" data-k="pairs"></table></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const N = ER.map(([n]) => erNorm(n, st));
        const simF = (a, b) => st.sim === `jac` ? K.jaccard(a.split(` `), b.split(` `)) : (Math.max(a.length, b.length) ? 1 - K.levenshtein(a, b) / Math.max(a.length, b.length) : 1);
        const pairs = [];
        for (let i = 0; i < ER.length; i++) for (let j = i + 1; j < ER.length; j++) pairs.push({ i, j, s: simF(N[i], N[j]), same: ER[i][1] === ER[j][1] });
        pairs.sort((a, b) => b.s - a.s);
        const par = ER.map((_, i) => i), find = x => par[x] === x ? x : (par[x] = find(par[x]));
        pairs.forEach(p => { if (p.s >= st.th - 1e-9) par[find(p.i)] = find(p.j); });
        const groups = {}; ER.forEach((_, i) => { const r = find(i); (groups[r] = groups[r] || []).push(i); });
        const G = Object.values(groups).sort((a, b) => b.length - a.length);
        let tp = 0, fp = 0, fn = 0;
        pairs.forEach(p => { const merged = find(p.i) === find(p.j); if (merged && p.same) tp++; else if (merged) fp++; else if (p.same) fn++; });
        const prec = tp + fp ? tp / (tp + fp) : 1, rec = tp + fn ? tp / (tp + fn) : 1;
        const trueN = new Set(ER.map(e => e[1])).size;
        q(`clusters`).innerHTML = G.map((g, gi) => { const pure = new Set(g.map(i => ER[i][1])).size === 1; return `<div class="pblock ${pure ? "ctx" : "bad"}"><div class="pblock-h">node ${gi + 1}${pure ? `` : ` · merges different companies`}</div><pre>${g.map(i => `${esc(ER[i][0])}   → "${esc(N[i])}"`).join(`\n`)}</pre></div>`; }).join("");
        q(`pairs`).innerHTML = `<tr><th>A</th><th>B</th><th class="num">sim</th><th>truth</th></tr>` + pairs.slice(0, 24).map(p => `<tr class="${p.s >= st.th - 1e-9 ? "new" : "dim"}"><td style="white-space:normal">${esc(ER[p.i][0])}</td><td style="white-space:normal">${esc(ER[p.j][0])}</td><td class="num">${p.s.toFixed(2)}</td><td>${p.same ? chip(`ok`, `same`) : chip(`no`, `different`)}</td></tr>`).join("");
        q(`stats`).innerHTML = stat(`nodes after merge`, `${G.length} (true ${trueN})`, G.length === trueN && fp === 0 ? `good` : ``) + stat(`pair precision`, round(prec, 2), prec < 1 ? `bad` : `good`) + stat(`pair recall`, round(rec, 2), rec < 1 ? `bad` : `good`) + stat(`wrong merges`, fp, fp ? `bad` : `good`);
        let n;
        if (fp && st.sim === `jac`) n = `Token Jaccard sees "acme industries" and "acme" as half the same. Once suffixes are gone, the remaining distinctive word matters a lot, and short names collide.`;
        else if (fp) n = `Wrong merges are usually worse than missed ones: they silently combine two companies' contracts. Raise the threshold or add domain rules (e.g. never merge when a distinctive token differs).`;
        else if (rec < 1) n = !st.abbr ? `"UTI Asset Mgmt. Co." needs abbreviation expansion. Rules like this come from domain knowledge, which is why the book recommends domain-specific ontologies and expert feedback loops.` : st.sim === `jac` ? `Jaccard can't see that "mortgagelogic" ≈ "mortgage logic" or "truelink" ≈ "true link". Character-level similarity handles spacing variants.` : `Some true duplicates remain separate. Lower the threshold carefully, and watch for wrong merges.`;
        else n = `Every duplicate is merged and nothing wrong is merged. The same settings could still fail in a different domain, such as biological entities in healthcare.`;
        q(`note`).innerHTML = note(n, fp ? `bad` : rec < 1 ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { th: v => v.toFixed(2) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - Chunk size and gleaning vs extracted entity references (model)
  // =====================================================================
  const ODY_TOKENS = 24 * 6515, DENSITY = 0.03;
  const perPass = size => 0.9 / (1 + size / 1500);
  const extracted = (size, g) => ODY_TOKENS * DENSITY * (1 - Math.pow(1 - perPass(size), g + 1));
  D.chunkEntities = {
    title: `Chunk size and self-reflection vs extracted entities`,
    blurb: `Figure 7.2 from the paper: smaller chunks and more self-reflection ("gleaning") passes extract more entity references. Here's a simple model of why. Each extraction pass finds a share of the entity mentions still missing from a chunk, and that share drops as the chunk grows. Corpus: The Odyssey's 24 books × 6,515 tokens on average. The curves are illustrative, not the paper's numbers.`,
    mount(el) {
      const st = { size: 1000, g: 1 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`your chunk size (tokens)`, rng(`size`, 300, 3000, 100, st.size))}${ctl(`self-reflection passes`, rng(`g`, 0, 3, 1, st.g))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid"><div class="lab-panel" data-k="chart"></div><div class="lab-panel"><h4>Cost of indexing</h4><table class="mini-table" data-k="tbl"></table></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const total = ODY_TOKENS * DENSITY;
        const A = axes({ x0: 50, x1: 470, y0: 210, y1: 14, dx0: 0, dx1: 3, dy0: 0, dy1: total, xTicks: [0, 1, 2, 3], yTicks: [0, total / 4, total / 2, total * 0.75, total], yFmt: v => fmtNum(v, 1), xLabel: `self-reflection passes` });
        let s = A.svg;
        const lines = [[600, `var(--accent)`], [1200, `var(--accent-2)`], [2400, `var(--accent-3)`], [st.size, `var(--how)`]];
        lines.forEach(([sz, col], li) => { const pts = [0, 1, 2, 3].map(g => [A.X(g), A.Y(extracted(sz, g))]); s += `<path d="${path(pts)}" fill="none" stroke="${col}" stroke-width="${li === 3 ? 3 : 2}" ${li === 3 ? `stroke-dasharray="5 3"` : ``}/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${col}"/>`).join(""); });
        s += `<circle cx="${A.X(st.g)}" cy="${A.Y(extracted(st.size, st.g))}" r="5" fill="none" stroke="var(--how)" stroke-width="2"/>`;
        s += `<line x1="50" x2="470" y1="${A.Y(total)}" y2="${A.Y(total)}" stroke="var(--text-muted)" stroke-dasharray="2 3"/>`;
        q(`chart`).innerHTML = `<h4>Entity references extracted</h4>` + svgWrap(480, 240, s) + `<div class="legend"><span><i class="sw line" style="background:var(--accent)"></i>600</span><span><i class="sw line" style="background:var(--accent-2)"></i>1,200</span><span><i class="sw line" style="background:var(--accent-3)"></i>2,400</span><span><i class="sw line" style="background:var(--how)"></i>yours (${st.size})</span><span>dotted = all mentions</span></div>`;
        const rows = [600, 1200, 2400, st.size].map(sz => { const chunks = Math.ceil(ODY_TOKENS / sz); return [sz, chunks, chunks * (st.g + 1), Math.round(extracted(sz, st.g))]; });
        q(`tbl`).innerHTML = `<tr><th>chunk size</th><th class="num">chunks</th><th class="num">LLM calls (${st.g + 1} pass${st.g ? "es" : ""})</th><th class="num">refs found</th></tr>` + rows.map((r, i) => `<tr class="${i === 3 ? "new" : ""}"><td>${r[0]}${i === 3 ? " (yours)" : ""}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td class="num">${fmtNum(r[3], 1)}</td></tr>`).join("");
        const ex = extracted(st.size, st.g);
        q(`stats`).innerHTML = stat(`mentions in corpus`, fmtNum(total, 1)) + stat(`found`, fmtNum(ex, 1)) + stat(`recall`, K.pct(ex / total)) + stat(`per-pass share`, K.pct(perPass(st.size)));
        q(`note`).innerHTML = note(`Smaller chunks and extra passes both raise recall, and both multiply LLM calls. The book picks 1,000-word chunks with 40 words of overlap. More entities is not automatically better: each one later needs summarization, and noise grows. Choose by evaluating answers, not entity counts.`);
      };
      wireRanges(el, st, null, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - Community detection (Louvain) on an Odyssey graph
  // =====================================================================
  const OD_N = [
    [`TELEMACHUS`, 250, 150], [`MINERVA`, 170, 95], [`PENELOPE`, 330, 205], [`SUITORS`, 365, 120], [`ANTINOUS`, 445, 85], [`EURYMACHUS`, 455, 160], [`MENTES`, 150, 175], [`ITHACA`, 300, 270], [`LAERTES`, 205, 255],
    [`JOVE`, 105, 40], [`AEGISTHUS`, 40, 125], [`AGAMEMNON`, 35, 215], [`ORESTES`, 95, 285], [`MERCURY`, 30, 40],
    [`ULYSSES`, 270, 330], [`CALYPSO`, 400, 300], [`NEPTUNE`, 470, 255], [`POLYPHEMUS`, 495, 330]
  ];
  const OD_E = [
    [`TELEMACHUS`, `MINERVA`, 14], [`TELEMACHUS`, `PENELOPE`, 4], [`TELEMACHUS`, `SUITORS`, 5], [`ANTINOUS`, `SUITORS`, 3], [`EURYMACHUS`, `SUITORS`, 3], [`ANTINOUS`, `TELEMACHUS`, 3], [`PENELOPE`, `SUITORS`, 3], [`EURYMACHUS`, `TELEMACHUS`, 2],
    [`MINERVA`, `MENTES`, 4], [`TELEMACHUS`, `MENTES`, 3], [`ITHACA`, `TELEMACHUS`, 2], [`ITHACA`, `PENELOPE`, 2], [`TELEMACHUS`, `LAERTES`, 1], [`LAERTES`, `ULYSSES`, 2], [`TELEMACHUS`, `ULYSSES`, 3], [`PENELOPE`, `ULYSSES`, 2],
    [`JOVE`, `MINERVA`, 4], [`JOVE`, `AEGISTHUS`, 3], [`AEGISTHUS`, `AGAMEMNON`, 3], [`ORESTES`, `AEGISTHUS`, 4], [`ORESTES`, `AGAMEMNON`, 3], [`MERCURY`, `AEGISTHUS`, 2], [`JOVE`, `MERCURY`, 2],
    [`ULYSSES`, `CALYPSO`, 3], [`MINERVA`, `CALYPSO`, 1], [`ULYSSES`, `NEPTUNE`, 3], [`NEPTUNE`, `POLYPHEMUS`, 3], [`POLYPHEMUS`, `ULYSSES`, 2], [`NEPTUNE`, `JOVE`, 1], [`ULYSSES`, `MINERVA`, 2]
  ];
  function louvain(n, edges, gamma, rand) {
    let member = Array.from({ length: n }, (_, i) => i);
    let gN = n, gE = edges.map(e => e.slice()), self = new Array(n).fill(0);
    for (let level = 0; level < 10; level++) {
      const adj = Array.from({ length: gN }, () => []);
      gE.forEach(([a, b, w]) => { adj[a].push([b, w]); adj[b].push([a, w]); });
      const k = adj.map((l, i) => sum(l.map(x => x[1])) + 2 * self[i]);
      const m2 = sum(k);
      const comm = Array.from({ length: gN }, (_, i) => i), tot = k.slice();
      let moved = true, guard = 0;
      while (moved && guard++ < 50) {
        moved = false;
        const order = Array.from({ length: gN }, (_, i) => i);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        for (const i of order) {
          const ci = comm[i], wTo = {};
          adj[i].forEach(([j, w]) => { wTo[comm[j]] = (wTo[comm[j]] || 0) + w; });
          tot[ci] -= k[i];
          let best = ci, bestGain = (wTo[ci] || 0) - gamma * tot[ci] * k[i] / m2;
          Object.keys(wTo).forEach(cs => { const c = +cs, gain = wTo[c] - gamma * tot[c] * k[i] / m2; if (gain > bestGain + 1e-12) { best = c; bestGain = gain; } });
          tot[best] += k[i];
          if (best !== ci) { comm[i] = best; moved = true; }
        }
      }
      const ids = {}; let c = 0; comm.forEach(x => { if (ids[x] == null) ids[x] = c++; });
      member = member.map(v => ids[comm[v]]);
      if (c === gN) break;
      const ns = new Array(c).fill(0), ne = {};
      for (let i = 0; i < gN; i++) ns[ids[comm[i]]] += self[i];
      gE.forEach(([a, b, w]) => { const A = ids[comm[a]], B = ids[comm[b]]; if (A === B) ns[A] += w; else { const key = A < B ? A + `,` + B : B + `,` + A; ne[key] = (ne[key] || 0) + w; } });
      gN = c; self = ns; gE = Object.keys(ne).map(key => { const [a, b] = key.split(`,`).map(Number); return [a, b, ne[key]]; });
    }
    return member;
  }
  function modularity(member, edges, gamma) {
    const m = sum(edges.map(e => e[2])), inC = {}, tot = {};
    edges.forEach(([a, b, w]) => { tot[member[a]] = (tot[member[a]] || 0) + w; tot[member[b]] = (tot[member[b]] || 0) + w; if (member[a] === member[b]) inC[member[a]] = (inC[member[a]] || 0) + w; });
    return sum(Object.keys(tot).map(c => (inC[c] || 0) / m - gamma * Math.pow(tot[c] / (2 * m), 2)));
  }
  D.communities = {
    title: `Community detection with Louvain`,
    blurb: `An entity graph like the one extracted from Book 1 of The Odyssey. Edge weight = number of extracted relationships (Telemachus and Minerva had 14). Louvain greedily moves nodes between communities to maximize <strong>modularity</strong>, then merges communities and repeats. It is <strong>nondeterministic</strong>, so re-run with a new seed. The <strong>resolution</strong> knob trades fewer, larger communities against more, smaller ones, much like picking a level in the community hierarchy.`,
    mount(el) {
      const st = { gamma: 1, w: `w`, seed: 1 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`resolution γ`, rng(`gamma`, 0.3, 2.5, 0.1, st.gamma))}${ctl(`edge weights`, seg(`w`, [[`w`, `relationship counts`], [`u`, `unweighted`]], st.w))}<button class="lab-btn ghost" data-k="rerun">Re-run (new seed)</button></div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid"><div class="lab-panel" data-k="svg"></div><div class="lab-panel"><h4>Communities → reports</h4><div data-k="list"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const idx = {}; OD_N.forEach((nd, i) => { idx[nd[0]] = i; });
      const draw = () => {
        const E = OD_E.map(([a, b, w]) => [idx[a], idx[b], st.w === `w` ? w : 1]);
        const mem = louvain(OD_N.length, E, st.gamma, mulberry32(st.seed * 7919));
        const Q = modularity(mem, E, st.gamma);
        const groups = {}; mem.forEach((c, i) => { (groups[c] = groups[c] || []).push(i); });
        const deg = OD_N.map((_, i) => sum(E.filter(e => e[0] === i || e[1] === i).map(e => e[2])));
        const G = Object.values(groups).sort((a, b) => b.length - a.length);
        const colorOf = {}; G.forEach((g, gi) => g.forEach(i => { colorOf[i] = COLORS[gi % COLORS.length]; }));
        let s = ``;
        E.forEach(([a, b, w]) => { const A = OD_N[a], B = OD_N[b]; const same = mem[a] === mem[b]; s += `<line class="svg-edge" x1="${A[1]}" y1="${A[2]}" x2="${B[1]}" y2="${B[2]}" style="stroke-width:${0.8 + Math.sqrt(w) * 0.8};${same ? `stroke:${colorOf[a]};opacity:.7` : `stroke-dasharray:3 3`}"/>`; });
        OD_N.forEach(([nm, x, y], i) => { s += `<circle class="svg-node" cx="${x}" cy="${y}" r="${7 + Math.sqrt(deg[i])}" fill="${colorOf[i]}"/><text class="svg-node-txt" x="${x}" y="${y - 11 - Math.sqrt(deg[i])}">${nm}</text>`; });
        q(`svg`).innerHTML = `<h4>Entity graph (solid = inside a community, dashed = between)</h4>` + svgWrap(530, 350, s);
        q(`list`).innerHTML = G.map((g, gi) => { const top = g.slice().sort((a, b) => deg[b] - deg[a]); const title = top.slice(0, 2).map(i => OD_N[i][0][0] + OD_N[i][0].slice(1).toLowerCase()).join(` & `); return `<div class="pblock" style="border-left-color:${COLORS[gi % COLORS.length]}"><div class="pblock-h">community ${gi + 1} · ${g.length} entities · title: "${title}${g.length > 2 ? " and others" : ""}"</div><pre>${top.map(i => OD_N[i][0]).join(`, `)}</pre></div>`; }).join("");
        q(`stats`).innerHTML = stat(`communities`, G.length) + stat(`sizes`, G.map(g => g.length).join(` / `)) + stat(`modularity Q`, round(Q, 3)) + stat(`seed`, st.seed);
        q(`note`).innerHTML = note(`Each community becomes one LLM-written report (title, summary, impact rating 0-10, findings), and global search reads those reports. In the book, Louvain found 9 communities of 2-13 nodes, including "Minerva, Telemachus, and the Ithacan Household". Larger γ gives more, smaller communities: more detailed reports, but more map-step LLM calls.`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { gamma: v => v.toFixed(1) }, draw);
      q(`rerun`).addEventListener(`click`, () => { st.seed++; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch7 - Global (map-reduce) vs local search
  // =====================================================================
  const GC = [
    { t: `Minerva, Telemachus and the Ithacan Household`, r: 8.5, s: `Minerva advises Telemachus, who is determined to find his father and restore order to a home overrun by suitors. Themes: divine guidance, loyalty, courage.` },
    { t: `Ulysses, Calypso and Neptune's Wrath`, r: 7.5, s: `Ulysses is held by Calypso and pursued by Neptune's anger over Polyphemus, delaying his return home.` },
    { t: `Jove, Aegisthus and the House of Agamemnon`, r: 7.0, s: `Jove recounts how Aegisthus murdered Agamemnon despite Mercury's warning, and how Orestes avenged his father.` },
    { t: `Mentes and the Taphians`, r: 4.0, s: `Mentes, chief of the Taphians and son of Anchialus, sails to Temesa with a cargo of iron.` },
    { t: `Laertes' Farm`, r: 3.0, s: `Laertes, Ulysses' father, lives in grief on his farm outside the city.` }
  ];
  const GQ = {
    about: { q: `What is this story about?`, type: `broad`, pts: [[[`A son searches for his absent father while suitors overrun the household`, 95], [`Minerva guides Telemachus in disguise`, 80]], [[`Ulysses is kept from home by Calypso and Neptune`, 90]], [[`A parallel tale of betrayal and vengeance: Aegisthus and Orestes`, 60]], [[`Mentes' voyage to Temesa`, 15]], [[`Laertes mourns his son`, 30]]] },
    conflict: { q: `What are the central conflicts in this story?`, type: `broad`, pts: [[[`The suitors vs Telemachus over the household`, 95]], [[`Neptune's wrath vs Ulysses' return`, 90], [`Calypso's captivity`, 55]], [[`Aegisthus' betrayal and Orestes' revenge`, 70]], [[`(no conflict described)`, 0]], [[`(no conflict described)`, 0]]] },
    ulysses: { q: `Who is Ulysses?`, type: `entity`, pts: [[[`Telemachus' absent father`, 70]], [[`A hero delayed by Calypso and Neptune`, 85]], [[`(not mentioned)`, 0]], [[`(not mentioned)`, 0]], [[`Laertes' son`, 50]]] },
    mentor: { q: `Who mentors Telemachus?`, type: `entity`, pts: [[[`Minerva, disguised as Mentes, advises him`, 95]], [[`(not mentioned)`, 0]], [[`(not mentioned)`, 0]], [[`Mentes is the disguise Minerva uses`, 40]], [[`(not mentioned)`, 0]]] }
  };
  const ENT = [
    [`ULYSSES`, `King of Ithaca, absent for years, kept by Calypso and hunted by Neptune.`, 1], [`TELEMACHUS`, `Son of Ulysses and Penelope, seeking news of his father.`, 0], [`MINERVA`, `Goddess who guides Telemachus, often disguised as Mentes.`, 0],
    [`PENELOPE`, `Ulysses' wife, besieged by suitors.`, 0], [`LAERTES`, `Ulysses' father, grieving on his farm.`, 4], [`CALYPSO`, `Nymph holding Ulysses on her island.`, 1], [`MENTES`, `Chief of the Taphians; Minerva's disguise.`, 3], [`ORESTES`, `Son of Agamemnon who killed Aegisthus.`, 2]
  ];
  const ESIM = { ulysses: [0.93, 0.62, 0.48, 0.6, 0.64, 0.66, 0.3, 0.2], mentor: [0.5, 0.9, 0.78, 0.4, 0.3, 0.2, 0.74, 0.25], about: [0.6, 0.58, 0.5, 0.45, 0.3, 0.4, 0.35, 0.3], conflict: [0.55, 0.5, 0.45, 0.5, 0.25, 0.42, 0.2, 0.48] };
  const CHUNKS7 = [
    [`Tell me, O Muse, of that ingenious hero who travelled far and wide after he had sacked Troy...`, [0]],
    [`Minerva, disguised as Mentes, chief of the Taphians, went to the house of Ulysses and was greeted by Telemachus at the gate.`, [1, 2, 6]],
    [`Calypso keeps Ulysses on her island, longing for his wife and his home.`, [0, 5]],
    [`Telemachus spoke quietly to Minerva during the banquet so the suitors could not hear.`, [1, 2]],
    [`Penelope came down and wept, asking the minstrel to stop singing of the Achaeans' return.`, [3]],
    [`Laertes no longer comes to town but lives in grief on his farm.`, [4, 0]],
    [`Jove spoke of Aegisthus, whom Orestes had killed to avenge Agamemnon.`, [7]]
  ];
  const RELS7 = [[1, 2, `Minerva mentors and encourages Telemachus (14 relationships summarized).`], [0, 1, `Ulysses is Telemachus' father.`], [0, 3, `Penelope is Ulysses' wife.`], [0, 5, `Calypso holds Ulysses.`], [0, 4, `Laertes is Ulysses' father.`], [2, 6, `Minerva disguises herself as Mentes.`], [1, 3, `Telemachus is Penelope's son.`]];
  D.globalLocal = {
    title: `Global search (map-reduce) vs local search`,
    blurb: `Two GraphRAG retrievers over the Odyssey index. <strong>Global</strong>: every community report rated ≥ threshold goes through a <em>map</em> LLM call that returns key points with importance scores 0-100, then one <em>reduce</em> call writes the answer from the top points. <strong>Local</strong>: vector search finds entry entities, Cypher gathers their chunks (ranked by how many entry entities they mention), relationships among them, community reports and summaries, all capped, and one LLM call answers.`,
    mount(el) {
      const st = { qk: `about`, mode: `global`, th: 5, k: 3, tc: 2, tr: 3 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`question`, seg(`qk`, Object.keys(GQ).map(k => [k, GQ[k].q]), st.qk))}${ctl(`retriever`, seg(`mode`, [[`global`, `global search`], [`local`, `local search`]], st.mode))}</div>
        <div class="ctl-row" data-k="gctl">${ctl(`community rating threshold`, rng(`th`, 0, 9, 0.5, st.th))}</div>
        <div class="ctl-row" data-k="lctl">${ctl(`k entities`, rng(`k`, 1, 5, 1, st.k))}${ctl(`topChunks`, rng(`tc`, 1, 4, 1, st.tc))}${ctl(`topInsideRels`, rng(`tr`, 0, 5, 1, st.tr))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid even"><div class="lab-panel"><h4 data-k="lh"></h4><div class="scroll-y" style="max-height:380px" data-k="left"></div></div><div class="lab-panel"><h4>Answer</h4><div data-k="ans"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const Q = GQ[st.qk], glob = st.mode === `global`;
        q(`gctl`).style.display = glob ? `` : `none`; q(`lctl`).style.display = glob ? `none` : ``;
        let left = ``, calls, ctxChars, ans, good;
        if (glob) {
          const used = GC.map((c, i) => ({ c, i })).filter(x => x.c.r >= st.th);
          const pts = [];
          left = used.map(x => { const ps = Q.pts[x.i]; ps.forEach(p => pts.push({ d: p[0], s: p[1], rep: x.i + 1 })); return `<div class="pblock ctx"><div class="pblock-h">map · report ${x.i + 1}: ${esc(x.c.t)} (rating ${x.c.r})</div><pre>${ps.map(p => `• ${esc(p[0])}  [score ${p[1]}]`).join(`\n`)}</pre></div>`; }).join("") || `<div class="cs-note">No community passes the threshold.</div>`;
          const top = pts.filter(p => p.s > 0).sort((a, b) => b.s - a.s).slice(0, 5);
          calls = used.length + 1; ctxChars = sum(used.map(x => x.c.s.length));
          ans = top.length ? top.map(p => `${p.d} [Data: Reports (${p.rep})]`).join(`. `) + `.` : `I don't know: no relevant points were found.`;
          good = Q.type === `broad` ? top.length >= 3 : top.length > 0;
          left += `<div class="pblock sys"><div class="pblock-h">reduce · top points by importance (score 0 dropped)</div><pre>${top.map(p => `${p.s}  ${esc(p.d)}`).join(`\n`) || `(none)`}</pre></div>`;
        } else {
          const sims = ESIM[st.qk], ents = sims.map((s, i) => i).sort((a, b) => sims[b] - sims[a]).slice(0, st.k);
          const ch = CHUNKS7.map((c, i) => ({ t: c[0], f: c[1].filter(e => ents.includes(e)).length, i })).filter(c => c.f).sort((a, b) => b.f - a.f || a.i - b.i).slice(0, st.tc);
          const rels = RELS7.filter(r => ents.includes(r[0]) && ents.includes(r[1])).slice(0, st.tr);
          const comms = Array.from(new Set(ents.map(e => ENT[e][2]))).slice(0, 2);
          left = pblock(`ctx`, `entities (vector top-${st.k})`, ents.map(e => `${ENT[e][0]} (${sims[e].toFixed(2)}): ${ENT[e][1]}`).join(`\n`))
            + pblock(`ctx`, `chunks (ranked by entry entities mentioned, top ${st.tc})`, ch.map(c => `[${c.f}] ${c.t}`).join(`\n`) || `(none)`)
            + pblock(`ctx`, `relationships among entry entities (top ${st.tr})`, rels.map(r => r[2]).join(`\n`) || `(none)`)
            + pblock(`ctx`, `community reports`, comms.map(c => GC[c].t).join(`\n`));
          calls = 1; ctxChars = sum(ents.map(e => ENT[e][1].length)) + sum(ch.map(c => c.t.length)) + sum(rels.map(r => r[2].length)) + sum(comms.map(c => GC[c].s.length));
          const hasMinerva = ents.includes(2), hasUly = ents.includes(0);
          if (st.qk === `ulysses`) { good = hasUly; ans = hasUly ? `Ulysses is the king of Ithaca, Telemachus' father and Penelope's husband. He is held on Calypso's island and pursued by Neptune${ents.includes(4) ? `, while his father Laertes grieves on his farm` : ``}.` : `The retrieved entities don't describe Ulysses.`; }
          else if (st.qk === `mentor`) { good = hasMinerva; ans = hasMinerva ? `Minerva mentors Telemachus, often disguised as Mentes, chief of the Taphians.` : `The context mentions Telemachus but not who guides him.`; }
          else { good = false; ans = `The story centers on ${ents.slice(0, 3).map(e => ENT[e][0][0] + ENT[e][0].slice(1).toLowerCase()).join(`, `)}, and related events. (Only the neighborhood of a few entities was seen, so whole-story themes are missing.)`; }
        }
        q(`lh`).textContent = glob ? `Map step per community → reduce` : `Local context (ranked and capped)`;
        q(`left`).innerHTML = left;
        q(`ans`).innerHTML = pblock(good ? `out` : `bad`, Q.q, ans) + `<div style="margin-top:6px">${good ? chip(`ok`, `good fit`) : chip(`no`, `poor fit`)}</div>`;
        q(`stats`).innerHTML = stat(`LLM calls`, calls) + stat(`context chars`, ctxChars) + stat(`question type`, Q.type);
        const n = glob
          ? (Q.type === `broad` ? `Broad questions need information spread over the whole dataset, which is exactly what precomputed community reports provide. Raising the threshold saves map calls but can drop relevant communities.` : `Global search works, but it pays one LLM call per community to answer a question about a single entity. Local search is the cheaper, more precise fit.`)
          : (Q.type === `entity` ? `Entity-focused questions start from the right nodes and expand to exactly the facts around them, with one LLM call. Cap sizes keep the prompt inside the context window.` : `Local search only sees the neighborhood of a few entities, so it can't summarize the whole story. Use global search for thematic questions.`);
        q(`note`).innerHTML = note(n, good ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { th: v => v.toFixed(1) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - RAGAS metrics calculator
  // =====================================================================
  const RG_FACTS = [
    { t: `Tom Cruise acted in Top Gun.`, gt: true }, { t: `Kelly McGillis acted in Top Gun.`, gt: true }, { t: `Val Kilmer acted in Top Gun.`, gt: true }, { t: `Meg Ryan acted in Top Gun.`, gt: true },
    { t: `Tom Hanks acted in Top Gun.`, gt: false }, { t: `Top Gun was released in 1986.`, gt: false }
  ];
  const RG_PRESET = {
    perfect: { label: `perfect`, ctx: [1, 1, 1, 1, 0, 0], ans: [1, 1, 1, 1, 0, 0] },
    missed: { label: `retriever missed one`, ctx: [1, 1, 1, 0, 0, 0], ans: [1, 1, 1, 0, 0, 0] },
    halluc: { label: `hallucinated extra`, ctx: [1, 1, 1, 1, 0, 0], ans: [1, 1, 1, 1, 1, 0] },
    extra: { label: `true but unasked detail`, ctx: [1, 1, 1, 1, 0, 1], ans: [1, 1, 1, 1, 0, 1] },
    ignored: { label: `ignored the context`, ctx: [1, 1, 1, 1, 0, 0], ans: [1, 0, 0, 0, 1, 0] }
  };
  D.ragas = {
    title: `RAGAS: context recall, faithfulness, answer correctness`,
    blurb: `The benchmark question "Who acted in Top Gun?" with a ground truth from its Cypher query. Each row is an atomic statement. Tick whether it appears in the <strong>retrieved context</strong> and in the <strong>answer</strong>, or load a preset, and see how the three metrics react. An LLM judge does this classification in RAGAS; here you do it by hand.`,
    mount(el) {
      const st = { p: `perfect`, ctx: RG_PRESET.perfect.ctx.slice(), ans: RG_PRESET.perfect.ans.slice() };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`preset`, seg(`p`, Object.keys(RG_PRESET).map(k => [k, RG_PRESET[k].label]), st.p))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid even"><div class="lab-panel"><h4>Statements</h4><table class="mini-table" data-k="tbl"></table></div><div class="lab-panel"><h4>How the scores are computed</h4><div data-k="calc"></div><h4 style="margin-top:10px">Book's benchmark summary (17 questions)</h4><div data-k="book"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        q(`tbl`).innerHTML = `<tr><th>statement</th><th>ground truth</th><th>in context</th><th>in answer</th></tr>` + RG_FACTS.map((f, i) => `<tr><td style="white-space:normal">${esc(f.t)}</td><td>${f.gt ? chip(`ok`, `yes`) : chip(`muted`, `no`)}</td><td><input type="checkbox" data-c="${i}" ${st.ctx[i] ? "checked" : ""}></td><td><input type="checkbox" data-a="${i}" ${st.ans[i] ? "checked" : ""}></td></tr>`).join("");
        const gtIdx = RG_FACTS.map((f, i) => i).filter(i => RG_FACTS[i].gt), ansIdx = RG_FACTS.map((f, i) => i).filter(i => st.ans[i]);
        const recall = gtIdx.filter(i => st.ctx[i]).length / gtIdx.length;
        const faithN = ansIdx.filter(i => st.ctx[i]).length, faith = ansIdx.length ? faithN / ansIdx.length : null;
        const TP = ansIdx.filter(i => RG_FACTS[i].gt).length, FP = ansIdx.length - TP, FN = gtIdx.length - TP;
        const f1 = TP + FP + FN ? TP / (TP + 0.5 * (FP + FN)) : 0;
        q(`stats`).innerHTML = stat(`context recall`, round(recall, 2), recall < 1 ? `bad` : `good`) + stat(`faithfulness`, faith == null ? `n/a` : round(faith, 2), faith != null && faith < 1 ? `bad` : `good`) + stat(`answer correctness (factual F1)`, round(f1, 2), f1 < 1 ? `bad` : `good`);
        q(`calc`).innerHTML = `<div class="mono" style="font-size:12px;line-height:1.7">context recall = ground-truth statements found in context / all ground-truth = ${gtIdx.filter(i => st.ctx[i]).length}/${gtIdx.length}<br>faithfulness = answer statements supported by context / all answer statements = ${faithN}/${ansIdx.length}<br>answer correctness: TP ${TP}, FP ${FP}, FN ${FN} → TP / (TP + ½(FP+FN)) = ${round(f1, 2)}</div><div class="cs-note">RAGAS by default blends this factual score with semantic similarity to the reference (weights 0.75 / 0.25).</div>`;
        q(`book`).innerHTML = hbars([{ label: `answer_correctness`, value: 0.7774, text: `0.7774`, cls: `warn` }, { label: `context_recall`, value: 0.7941, text: `0.7941`, cls: `warn` }, { label: `faithfulness`, value: 0.9657, text: `0.9657`, cls: `good` }], 1);
        let n;
        if (recall < 1 && faith === 1) n = `The generator was faithful to what it got, but the retriever missed information, so correctness drops. That's the book's pattern: high faithfulness (0.97), lower recall (0.79) and correctness (0.78). Fix retrieval first.`;
        else if (faith != null && faith < 1 && f1 < 1) n = `The answer contains claims that aren't in the context. Faithfulness catches hallucination even when the retriever did its job.`;
        else if (faith === 1 && f1 < 1) n = `Faithful but not "correct": the extra statement is true and supported by the context, yet it isn't in the ground truth, so it counts as a false positive. Metrics measure different things; read them together.`;
        else if (f1 === 1 && faith === 1 && recall === 1) n = `All three metrics are perfect.`;
        else n = `Mix and match to see each metric isolate one stage: recall for retrieval, faithfulness for grounding, correctness against the ground truth.`;
        q(`note`).innerHTML = note(n, f1 === 1 ? `good` : `warn`);
        el.querySelectorAll(`input[data-c],input[data-a]`).forEach(cb => cb.addEventListener(`change`, () => {
          if (cb.dataset.c != null) st.ctx[+cb.dataset.c] = cb.checked ? 1 : 0; else st.ans[+cb.dataset.a] = cb.checked ? 1 : 0;
          st.p = null; K.setSeg(el, `p`, `__`); draw();
        }));
      };
      wireSegs(el, st, () => { st.ctx = RG_PRESET[st.p].ctx.slice(); st.ans = RG_PRESET[st.p].ans.slice(); draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Benchmark design: static vs Cypher ground truth, coverage, latency
  // =====================================================================
  const BM = [
    { q: `Hello`, cat: `greeting`, tool: `none`, gt: () => `greeting + scope reminder`, agent: () => `greeting + scope reminder`, lat: 0.9 },
    { q: `What can you do?`, cat: `capabilities`, tool: `none`, gt: () => `answers questions about movies and cast`, agent: () => `answers questions about movies and cast`, lat: 0.9 },
    { q: `What is the weather like in Spain?`, cat: `irrelevant`, tool: `none`, gt: () => `out of scope`, agent: () => `out of scope`, lat: 0.8 },
    { q: `Who acted in Top Gun?`, cat: `tool: by title`, tool: `template`, gt: () => `Tom Cruise, Kelly McGillis, Val Kilmer, Meg Ryan`, agent: () => `Tom Cruise, Kelly McGillis, Val Kilmer, Meg Ryan`, lat: 1.4, cy: true },
    { q: `Who acted in top gun?`, cat: `value mapping`, tool: `template`, gt: () => `Tom Cruise, Kelly McGillis, Val Kilmer, Meg Ryan`, agent: () => `Tom Cruise, Kelly McGillis, Val Kilmer, Meg Ryan`, lat: 1.4, cy: true },
    { q: `How many movies did Tom Hanks appear in?`, cat: `aggregation`, tool: `text2cypher`, gt: d => d ? `13` : `12`, agent: d => d ? `13` : `12`, lat: 3.1, cy: true },
    { q: `In which movies did tom Hanks act in?`, cat: `tool: by actor`, tool: `template`, gt: d => d ? `12 titles + "The Post"` : `12 titles`, agent: d => d ? `12 titles + "The Post"` : `12 titles`, lat: 1.5, cy: true },
    { q: `List people born before 1940.`, cat: `filtering`, tool: `text2cypher`, gt: () => `Jack Nicholson, …`, agent: () => `Jack Nicholson, …`, lat: 2.9, cy: true },
    { q: `Who was born in 1965 and has directed a movie?`, cat: `multi-condition`, tool: `text2cypher`, gt: () => `Lana Wachowski, …`, agent: () => `Lana Wachowski, …`, lat: 3.0, cy: true },
    { q: `Which movie has the most Oscars?`, cat: `missing data`, tool: `text2cypher`, gt: () => `information is missing`, agent: () => `information is missing`, lat: 2.8 },
    { q: `Who has the longest name among all actors?`, cat: `edge case`, tool: `text2cypher`, gt: () => `(computed by Cypher)`, agent: () => `I don't know`, lat: 3.4, cy: true, fail: true }
  ];
  D.benchmark = {
    title: `Designing the benchmark: coverage, Cypher ground truth, latency`,
    blurb: `Benchmark rows in the style of tables 8.1 to 8.4. Each needs a ground truth. Store it as a <strong>static answer</strong> or as a <strong>Cypher query</strong> that's run at evaluation time. Then change the data (Tom Hanks gets a new movie) and see which benchmark keeps telling the truth. Latency by tool shows the book's observation that text2cypher questions are slower.`,
    mount(el) {
      const st = { gt: `static`, changed: false };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`ground truth stored as`, seg(`gt`, [[`static`, `static strings`], [`cypher`, `Cypher queries`]], st.gt))}${ctl(`database`, seg(`changed`, [[false, `as of benchmark creation`], [true, `after adding a Tom Hanks movie`]], st.changed))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid"><div class="lab-panel" style="overflow-x:auto"><table class="mini-table" data-k="tbl"></table></div><div class="lab-panel"><h4>Average latency by retrieval path</h4><div data-k="lat"></div><h4 style="margin-top:10px">Coverage</h4><div data-k="cov"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        let pass = 0, falseFail = 0;
        q(`tbl`).innerHTML = `<tr><th>question</th><th>category</th><th>expected</th><th>agent answer</th><th>judged</th></tr>` + BM.map(r => {
          const exp = st.gt === `cypher` || !r.cy ? r.gt(st.changed) : r.gt(false);
          const got = r.agent(st.changed), ok = exp === got;
          if (ok) pass++; else if (!r.fail) falseFail++;
          return `<tr class="${ok ? "" : r.fail ? "undo" : "dim"}"><td style="white-space:normal">${esc(r.q)}</td><td>${esc(r.cat)}</td><td style="white-space:normal">${esc(exp)}${r.cy && st.gt === `cypher` ? ` <span class="cs-note">(live)</span>` : ``}</td><td style="white-space:normal">${esc(got)}</td><td>${ok ? chip(`ok`, `pass`) : r.fail ? chip(`no`, `real failure`) : chip(`early`, `false failure`)}</td></tr>`;
        }).join("");
        const byTool = {}; BM.forEach(r => { (byTool[r.tool] = byTool[r.tool] || []).push(r.lat); });
        q(`lat`).innerHTML = hbars(Object.keys(byTool).map(t => ({ label: t, value: sum(byTool[t]) / byTool[t].length, text: round(sum(byTool[t]) / byTool[t].length, 1) + ` s`, cls: t === `text2cypher` ? `warn` : `` })));
        const cats = [`greeting / capabilities`, `irrelevant`, `tool selection`, `value mapping`, `aggregation / filtering`, `missing data`, `edge cases`];
        q(`cov`).innerHTML = `<div class="toks">${cats.map(c => `<span class="tok c5">${c} ✓</span>`).join("")}<span class="tok dim">multistep retrieval (add!)</span></div>`;
        q(`stats`).innerHTML = stat(`pass rate`, `${pass}/${BM.length}`) + stat(`false failures`, falseFail, falseFail ? `bad` : `good`) + stat(`real failures`, BM.filter(r => r.fail).length, `bad`);
        q(`note`).innerHTML = note(falseFail
          ? `The data changed, the agent correctly says 13, but the static ground truth still says 12. Static answers rot; the benchmark now reports false failures. Cypher ground truth recomputes the expected answer from the current data.`
          : `The one real failure ("longest name") is the book's example: text2cypher couldn't write the query. Fix it with a few-shot example or a dedicated tool, and keep the question as a regression test. Template tools answer faster than text2cypher, which needs an extra LLM call.`, falseFail ? `bad` : ``);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Appendix - MERGE vs CREATE (idempotent imports)
  // =====================================================================
  const MC_MODES = {
    create: { label: `CREATE everything`, cy: `CREATE (c:Contract {id: $doc_id, ...})\nCREATE (o1:Organization {name: 'TrueLink, Inc.'})-[:HAS_PARTY]->(c)\nCREATE (o2:Organization {name: 'Mortgage Logic.com, Inc.'})-[:HAS_PARTY]->(c)` },
    uuid: { label: `MERGE on randomUUID() (book's import)`, cy: `MERGE (contract:Contract {id: randomUUID()})\nSET contract += {...}\nUNWIND $parties AS party\nMERGE (p:Organization {name: party.name})\nMERGE (p)-[r:HAS_PARTY]->(contract)` },
    stable: { label: `MERGE on a stable document id`, cy: `MERGE (contract:Contract {id: $doc_id})   // e.g. hash of the source file\nSET contract += {...}\nUNWIND $parties AS party\nMERGE (p:Organization {name: party.name})\nMERGE (p)-[r:HAS_PARTY]->(contract)` }
  };
  D.mergeCreate = {
    title: `MERGE vs CREATE: re-running an import`,
    blurb: `Pipelines get re-run: retries, backfills, re-extraction after a prompt fix. Import the same contract several times with three variants of the import statement, with or without a unique constraint on <code>Organization.name</code>. The book notes its own contract import isn't idempotent because it MERGEs on <code>randomUUID()</code>.`,
    mount(el) {
      const st = { mode: `uuid`, cons: true, runs: 0, log: [] };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`import statement`, seg(`mode`, Object.keys(MC_MODES).map(k => [k, MC_MODES[k].label]), st.mode))}${ctl(`unique constraint on Organization.name`, seg(`cons`, [[true, `on`], [false, `off`]], st.cons))}</div>
        <div class="ctl-row"><button class="lab-btn" data-k="run">Run import</button><button class="lab-btn ghost" data-k="reset">Reset database</button></div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid even"><div class="lab-panel"><h4>Statement</h4><div data-k="cy"></div><div class="log" data-k="log"></div></div><div class="lab-panel" data-k="svg"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      let db = { contracts: 0, orgs: 0, rels: 0 };
      const run = () => {
        st.runs++;
        if (st.mode === `create`) {
          if (st.cons && db.orgs > 0) { st.log.unshift([`bad`, `run ${st.runs}: Neo.ClientError.Schema.ConstraintValidationFailed: Node already exists with label Organization and property name = 'TrueLink, Inc.'`]); return; }
          db.contracts++; db.orgs += 2; db.rels += 2;
        } else if (st.mode === `uuid`) { db.contracts++; db.orgs = Math.max(db.orgs, 2); db.rels += 2; }
        else { if (!db.contracts) { db.contracts = 1; db.rels = 2; } db.orgs = Math.max(db.orgs, 2); }
        st.log.unshift([`ok`, `run ${st.runs}: committed. Contracts ${db.contracts}, organizations ${db.orgs}, HAS_PARTY ${db.rels}`]);
      };
      const draw = () => {
        q(`cy`).innerHTML = pblock(`ctx`, `cypher`, MC_MODES[st.mode].cy);
        q(`log`).innerHTML = st.log.slice(0, 8).map(([c, t]) => `<div class="${c}">${esc(t)}</div>`).join("") || `<div class="info">(no runs yet)</div>`;
        const dupC = Math.max(0, db.contracts - 1), dupO = Math.max(0, db.orgs - 2);
        q(`stats`).innerHTML = stat(`runs`, st.runs) + stat(`Contract nodes`, db.contracts, dupC ? `bad` : `good`) + stat(`Organization nodes`, db.orgs, dupO ? `bad` : `good`) + stat(`HAS_PARTY`, db.rels, db.rels > 2 ? `bad` : `good`);
        let s = ``; const cN = Math.min(db.contracts, 8), oN = Math.min(db.orgs, 8);
        for (let i = 0; i < cN; i++) { const x = 60 + i * 55, y = 70; for (let j = 0; j < oN; j++) { const ox = 60 + j * 55, oy = 190; if (st.mode === `create` ? Math.floor(j / 2) === i : true) s += `<line class="svg-edge" x1="${ox}" y1="${oy}" x2="${x}" y2="${y}"/>`; } }
        for (let i = 0; i < cN; i++) s += `<circle class="svg-node" cx="${60 + i * 55}" cy="70" r="16" fill="${i ? "var(--bad)" : "var(--accent-2)"}"/><text class="svg-node-txt" x="${60 + i * 55}" y="45">Contract</text>`;
        for (let j = 0; j < oN; j++) s += `<circle class="svg-node" cx="${60 + j * 55}" cy="190" r="13" fill="${j > 1 ? "var(--bad)" : "var(--accent)"}"/><text class="svg-node-txt" x="${60 + j * 55}" y="220">${j % 2 ? "Mortgage Logic" : "TrueLink"}</text>`;
        q(`svg`).innerHTML = `<h4>Graph after ${st.runs} run(s) (red = duplicate)</h4>` + (db.contracts ? svgWrap(500, 240, s) : `<div class="cs-note">Empty database. Click "Run import".</div>`);
        const n = st.runs < 2 ? `Run the import at least twice.`
          : st.mode === `stable` ? `Idempotent: MERGE matches the existing contract by its stable id, and organizations by name. Re-running is safe.`
          : st.mode === `uuid` ? `randomUUID() never matches an existing node, so every run creates a new Contract with its own HAS_PARTY edges. Organizations are MERGEd by name and stay unique. Fix: MERGE on a deterministic key with a unique constraint.`
          : st.cons ? `CREATE ignores existing data. Here the unique constraint stopped the duplicate organizations and rolled back the whole transaction, so the run failed loudly instead of silently corrupting the graph.`
          : `CREATE with no constraint silently duplicates everything. Counting contracts or parties now gives wrong answers.`;
        q(`note`).innerHTML = note(n, st.runs < 2 ? `` : st.mode === `stable` ? `good` : `warn`);
      };
      wireSegs(el, st, () => { db = { contracts: 0, orgs: 0, rels: 0 }; st.runs = 0; st.log = []; draw(); });
      q(`run`).addEventListener(`click`, () => { run(); draw(); });
      q(`reset`).addEventListener(`click`, () => { db = { contracts: 0, orgs: 0, rels: 0 }; st.runs = 0; st.log = []; draw(); });
      draw();
    }
  };
})();
