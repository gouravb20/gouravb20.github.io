// Essential GraphRAG - interactive labs, part 1 (chapters 1-4). Depends on labkit.js.
(function () {
  "use strict";
  const K = window.LabKit;
  const { esc, clamp, sum, round, seg, wireSegs, rng, wireRanges, ctl, stat, note, hbars, okChip } = K;
  const D = window.DEMOS;
  const pblock = (cls, head, body) => `<div class="pblock ${cls}"><div class="pblock-h">${head}</div><pre>${esc(body)}</pre></div>`;
  const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;

  // =====================================================================
  // Ch1 - RAG on/off across the four LLM limitations
  // =====================================================================
  const RAG_SCN = {
    cutoff: {
      label: `knowledge cutoff`, q: `Who won the 2024 NBA championship?`,
      doc: `The Boston Celtics won the 2024 NBA championship, beating the Dallas Mavericks 4-1 in the Finals.`,
      plain: [`I'm sorry, but my knowledge only goes up to October 2023, so I don't have information about the 2024 NBA championship.`, `refused`],
      grounded: `The Boston Celtics won the 2024 NBA championship.`
    },
    outdated: {
      label: `outdated info`, q: `Who owns the Dallas Mavericks?`,
      doc: `In late 2023 Mark Cuban sold his majority stake in the Dallas Mavericks to the Adelson family and the Dumonts, while retaining a minority share.`,
      plain: [`Mark Cuban is the owner of the Dallas Mavericks.`, `outdated`],
      grounded: `The Adelson family and the Dumonts hold the majority stake; Mark Cuban kept a minority share.`
    },
    halluc: {
      label: `hallucination`, q: `What is the WikiData ID of the Dallas Mavericks?`,
      doc: null,
      plain: [`The WikiData ID of the Dallas Mavericks is Q152232.`, `hallucinated`],
      grounded: null
    },
    private: {
      label: `private data`, q: `How many vacation days do new employees at Acme get?`,
      doc: `Acme HR policy (2024): new employees receive 25 vacation days per year, rising to 30 after five years of service.`,
      plain: [`Companies typically offer 10-15 vacation days to new employees, but I don't have access to Acme's internal policies.`, `generic`],
      grounded: `New Acme employees get 25 vacation days per year (30 after five years).`
    },
    known: {
      label: `already known`, q: `Who won the 2023 NBA championship?`,
      doc: `The Denver Nuggets are the 2023 NBA champions, after a 4:1 victory over the Miami Heat.`,
      plain: [`The Denver Nuggets won the 2023 NBA championship.`, `correct`],
      grounded: `The Denver Nuggets won the 2023 NBA championship.`
    }
  };
  const VERDICT = {
    correct: [`ok`, `✓ correct`], refused: [`muted`, `refuses (cutoff)`], outdated: [`no`, `✗ outdated`],
    hallucinated: [`no`, `✗ hallucinated`], generic: [`muted`, `generic, not specific`], safe: [`early`, `says it doesn't know`]
  };
  D.ragToggle = {
    title: `RAG on/off: knowledge cutoff, outdated facts, hallucination, private data`,
    blurb: `Pick a question that hits one of the LLM limitations from Chapter 1, then switch <strong>retrieval-augmented generation</strong> on. With RAG the retrieved document is pasted into the prompt template and the LLM answers from it. Also try a retrieval <strong>miss</strong>: the "only use the provided documents" instruction is what turns a would-be hallucination into an honest "I don't know".`,
    mount(el) {
      const st = { scn: `cutoff`, rag: `off`, hit: `hit`, ground: `on` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`question`, seg(`scn`, Object.keys(RAG_SCN).map(k => [k, RAG_SCN[k].label]), st.scn))}</div>
        <div class="ctl-row">${ctl(`RAG`, seg(`rag`, [[`off`, `off`], [`on`, `on`]], st.rag))}${ctl(`retrieval`, seg(`hit`, [[`hit`, `finds the doc`], [`miss`, `misses`]], st.hit))}${ctl(`"only use the documents"`, seg(`ground`, [[`on`, `on`], [`off`, `off`]], st.ground))}</div>
        <div class="lab-grid even"><div class="lab-panel"><h4>Prompt sent to the LLM</h4><div data-k="prompt"></div></div><div class="lab-panel"><h4>Answer</h4><div data-k="ans"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const s = RAG_SCN[st.scn];
        const found = st.rag === `on` && st.hit === `hit` && s.doc;
        const ctxDoc = st.rag === `off` ? null : found ? s.doc : `Einstein was granted a patent for a blouse design on October 27, 1936.`;
        let prompt = ``;
        if (st.rag === `on` && st.ground === `on`) prompt += pblock(`sys`, `system`, `Answer using only the provided documents. If they don't contain the answer, say you don't know.`);
        if (ctxDoc) prompt += pblock(`ctx`, `retrieved context ${found ? "(relevant)" : "(irrelevant: retrieval missed)"}`, ctxDoc);
        prompt += pblock(`user`, `question`, s.q);
        q(`prompt`).innerHTML = prompt;
        let ans, v;
        if (st.rag === `off`) [ans, v] = s.plain;
        else if (found) { ans = s.grounded; v = `correct`; }
        else if (st.ground === `on`) { ans = `The provided documents don't contain this information, so I can't answer.`; v = `safe`; }
        else [ans, v] = s.plain;
        q(`ans`).innerHTML = pblock(v === `correct` ? `out` : v === `safe` ? `sys` : `bad`, `LLM output`, ans) + `<div style="margin-top:6px">${chip(...VERDICT[v])}</div>`;
        let n;
        if (st.scn === `halluc`) n = `The knowledge base has no WikiData entry, so retrieval always misses here. Without RAG (or without the grounding instruction) the model confidently returns <strong>Q152232</strong>, which the book points out is actually the movie <em>Womanlight</em>. Identifiers, URLs and citations are classic hallucinations.`;
        else if (st.rag === `off`) n = { cutoff: `Anything after the training cutoff is unknown to the model.`, outdated: `The fact was true in the training data but changed later. The model has no way to know.`, private: `Internal data was never in the training set, regardless of the cutoff date.`, known: `For well-known facts before the cutoff the model is fine on its own; RAG still adds a citable source.` }[st.scn];
        else if (!found) n = st.ground === `on` ? `Retrieval missed. The grounding instruction makes the model admit it, which is the safe failure mode.` : `Retrieval missed and nothing told the model to stay within the documents, so it fell back to its own (possibly wrong) knowledge.`;
        else n = `The facts are in the prompt, so the model only needs its language skills. That's why the generator can be a smaller, cheaper model.`;
        q(`note`).innerHTML = note(n, v === `correct` ? `good` : v === `safe` ? `` : `warn`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch1 - Which questions need structure? (figure 1.14 graph)
  // =====================================================================
  const QT_PEOPLE = [[`John Doe`, `Sam Altman`, `2023-01-01`], [`Jane Roe`, `Sam Altman`, `2022-06-01`], [`Ali Khan`, `Sam Altman`, `2021-03-15`], [`Mei Lin`, `John Doe`, `2023-04-10`], [`Omar Diaz`, `John Doe`, `2022-11-01`], [`Sara Park`, `Jane Roe`, `2024-02-01`]];
  const QT_TASKS = [[`Release new model`, `John Doe`, `Completed`], [`Write eval suite`, `Mei Lin`, `Completed`], [`Fix tokenizer bug`, `Omar Diaz`, `Open`], [`Update pricing page`, `Sara Park`, `Completed`], [`Plan GPU budget`, `Jane Roe`, `Completed`], [`Draft safety report`, `Ali Khan`, `Open`], [`Migrate vector index`, `Mei Lin`, `Completed`], [`Review API limits`, `Ali Khan`, `Completed`], [`Hire two engineers`, `Jane Roe`, `Open`], [`Rotate API keys`, `Omar Diaz`, `Completed`], [`Benchmark latency`, `Sara Park`, `Open`], [`Write launch blog`, `John Doe`, `Open`]];
  const QT_CHUNKS = [{ t: `Sam Altman is the CEO of OpenAI.`, kind: `ceo` }]
    .concat(QT_PEOPLE.map(([n, m, d]) => ({ t: `${n} has been an employee of OpenAI since ${d}. ${n} reports to ${m}.`, kind: `emp`, n, m })))
    .concat(QT_TASKS.map(([t, a, s]) => ({ t: `Task "${t}" is assigned to ${a}. Status: ${s}.`, kind: `task`, title: t, a, s })))
    .concat([{ t: `Article "New LLM model" (2023-07-07) mentions OpenAI: the new model doubles the context window and is cheaper per token.`, kind: `article` }]);
  const stemW = s => K.contentWords(s).map(w => w.length > 3 && w.endsWith(`s`) ? w.slice(0, -1) : w);
  const QT_TRUE_SAM = QT_TASKS.filter(t => QT_PEOPLE.find(p => p[0] === t[1] && p[1] === `Sam Altman`)).map(t => t[0]);
  const QT_Q = {
    ceo: { label: `lookup`, q: `Who is the CEO of OpenAI?`, cy: `MATCH (p:Person)<-[:HAS_CEO]-(:Company {name:'OpenAI'})\nRETURN p.name`, truth: `Sam Altman` },
    count: { label: `counting`, q: `How many tasks are completed?`, cy: `MATCH (t:Task {status:'Completed'})\nRETURN count(t)`, truth: `${QT_TASKS.filter(t => t[2] === `Completed`).length}` },
    hop: { label: `multi-hop`, q: `Which tasks are assigned to employees who report to Sam Altman?`, cy: `MATCH (t:Task)-[:ASSIGNED_TO]->(e:Person)\n      -[:REPORTS_TO]->(:Person {name:'Sam Altman'})\nRETURN t.title`, truth: QT_TRUE_SAM.join(`, `) },
    text: { label: `free text`, q: `What does the article say about the new LLM model?`, cy: `MATCH (a:Article {title:'New LLM model'})\nRETURN a.content`, truth: `It doubles the context window and is cheaper per token.` }
  };
  D.questionTypes = {
    title: `Which questions need structured data?`,
    blurb: `The graph from figure 1.14: OpenAI, its CEO, employees with REPORTS_TO, tasks with a status, and an article. The same facts also exist as text chunks. Ask each question with <strong>vector top-k over chunks</strong>, with a <strong>structured-only</strong> graph query, or with a <strong>knowledge graph</strong> that has both. Raise k and see what it takes for chunks to answer counting and multi-hop questions.`,
    mount(el) {
      const st = { qk: `count`, mode: `vector`, k: 4 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`question`, seg(`qk`, Object.keys(QT_Q).map(k => [k, QT_Q[k].label]), st.qk))}${ctl(`retrieval`, seg(`mode`, [[`vector`, `vector top-k`], [`struct`, `structured only`], [`kg`, `knowledge graph (both)`]], st.mode))}${ctl(`k`, rng(`k`, 1, 20, 1, st.k))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid even"><div class="lab-panel"><h4 data-k="lh"></h4><div class="scroll-y" style="max-height:300px" data-k="left"></div></div><div class="lab-panel"><h4>Answer</h4><div data-k="ans"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const Q = QT_Q[st.qk], qw = new Set(stemW(Q.q));
        const scored = QT_CHUNKS.map((c, i) => ({ c, i, s: stemW(c.t).filter(w => qw.has(w)).length })).sort((a, b) => b.s - a.s || a.i - b.i);
        const top = scored.slice(0, st.k);
        let ans, ok;
        if (st.mode === `vector`) {
          const got = top.map(x => x.c);
          if (st.qk === `ceo`) { ok = got.some(c => c.kind === `ceo`); ans = ok ? `Sam Altman` : `I can't tell from the documents.`; }
          else if (st.qk === `count`) { const n = got.filter(c => c.kind === `task` && c.s === `Completed`).length; ans = `${n} tasks are completed.`; ok = String(n) === Q.truth; }
          else if (st.qk === `hop`) {
            const mgr = new Set(got.filter(c => c.kind === `emp` && c.m === `Sam Altman`).map(c => c.n));
            const tasks = got.filter(c => c.kind === `task` && mgr.has(c.a)).map(c => c.title);
            ans = tasks.length ? tasks.join(`, `) : `The documents mention who reports to Sam Altman but not their tasks.`;
            ok = tasks.length === QT_TRUE_SAM.length;
          } else { ok = got.some(c => c.kind === `article`); ans = ok ? Q.truth : `I can't tell from the documents.`; }
          q(`lh`).textContent = `Top-${st.k} chunks by similarity (of ${QT_CHUNKS.length})`;
          q(`left`).innerHTML = `<table class="mini-table">${top.map((x, r) => `<tr><td>${r + 1}</td><td style="white-space:normal;font-size:11.5px">${esc(x.c.t)}</td><td class="num">${x.s}</td></tr>`).join("")}</table>`;
        } else {
          ok = st.mode === `kg` || st.qk !== `text`;
          ans = ok ? Q.truth : `The structured part stores only the article's title and date, not its content.`;
          q(`lh`).textContent = `Cypher over the graph`;
          q(`left`).innerHTML = pblock(ok ? `ctx` : `bad`, `query`, Q.cy) + (ok ? `` : `<div class="cs-note">No text in a structured-only graph.</div>`);
        }
        q(`ans`).innerHTML = pblock(ok ? `out` : `bad`, Q.q, ans) + `<div style="margin-top:6px">${okChip(ok)}</div><div class="cs-note" style="margin-top:6px">Ground truth: ${esc(Q.truth)}</div>`;
        q(`stats`).innerHTML = stat(`chunks in store`, QT_CHUNKS.length) + stat(`tasks / completed`, `${QT_TASKS.length} / ${QT_TASKS.filter(t => t[2] === `Completed`).length}`) + stat(`employees reporting to Sam`, QT_PEOPLE.filter(p => p[1] === `Sam Altman`).length);
        const msg = st.mode !== `vector` ? (st.mode === `kg` ? `A knowledge graph answers all four: exact queries for structured questions and stored text for the fuzzy one.` : st.qk === `text` ? `Structure alone can't answer open-ended questions about text content. You need the unstructured part too.` : `One exact query, no matter how many tasks exist.`)
          : st.qk === `count` ? `The LLM can only count the chunks it was shown. It's right only when k covers every completed task, and nothing tells it whether it saw them all. With 10,000 tasks you'd need k = 10,000.`
          : st.qk === `hop` ? `The question needs a join: task → assignee → manager. Similarity ranks the "reports to Sam Altman" chunks first, and the task chunks they connect to only come in at large k.`
          : `Similarity search is great at this kind of lookup.`;
        q(`note`).innerHTML = note(msg, ok ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, null, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch2 - Chunking (Listing 2.1, both modes)
  // =====================================================================
  const EINSTEIN = `Considering Einstein's upbringing, his interest in inventions and patents was not unusual. Being a manufacturer's son, Einstein grew up in an environment of machines and instruments. When his father's company obtained the contract to illuminate Munich city during the beer festival, he was actively engaged in execution of the contract. In his ETH days Einstein was genuinely interested in experimental works. He wrote to a friend that most of the time he worked in the physical laboratory, fascinated by the direct contact with observation. However, his main occupation was theoretical physics, and the inventions he worked upon were his diversions. Einstein was involved in three major inventions: a refrigeration system with Leo Szilard, a sound reproduction system with Rudolf Goldschmidt, and an automatic camera. Einstein left his job at the Patent office and joined the University of Zurich on October 15, 1909. In 1911 he moved to Prague University as a full professor, and a year later he was appointed full professor at ETH Zurich, his alma mater. In 1914 he became Director of the Kaiser Wilhelm Institute for Physics and a professor at the Humboldt University of Berlin.`;
  function chunkText(text, size, overlap, wsOnly) {
    const out = []; let index = 0;
    while (index < text.length) {
      if (wsOnly) {
        let prevWs = 0, left = index - overlap;
        while (left >= 0) { if (text[left] === ` `) { prevWs = left; break; } left--; }
        let next = text.indexOf(` `, index + size); if (next === -1) next = text.length;
        let s = prevWs, e = next; while (s < e && text[s] === ` `) s++;
        out.push({ s, e, t: text.slice(s, e) });
        index = next + 1;
      } else {
        const s = Math.max(0, index - overlap + 1), e = Math.min(index + size + overlap, text.length);
        out.push({ s, e, t: text.slice(s, e) });
        index += size;
      }
    }
    return out;
  }
  const SPANS = {
    zurich: [`When did Einstein join the University of Zurich?`, `joined the University of Zurich on October 15, 1909`],
    inventions: [`What were Einstein's three major inventions?`, `a refrigeration system with Leo Szilard, a sound reproduction system with Rudolf Goldschmidt, and an automatic camera`],
    eth: [`When was Einstein interested in experimental works?`, `In his ETH days Einstein was genuinely interested in experimental works`]
  };
  D.chunker = {
    title: `Text chunking: size, overlap and split strategy`,
    blurb: `The book's <code>chunk_text</code> (Listing 2.1) on a passage from the Einstein patents paper. In <strong>whitespace</strong> mode it extends each chunk to the next space and starts it at a space within the overlap window, so words are never broken. The book uses 500 characters with 40 overlap. Pick a question and check whether its answer survives intact in at least one chunk.`,
    mount(el) {
      const st = { size: 300, ov: 40, mode: `ws`, span: `zurich` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`chunk size (chars)`, rng(`size`, 80, 800, 20, st.size))}${ctl(`overlap`, rng(`ov`, 0, 150, 10, st.ov))}${ctl(`split`, seg(`mode`, [[`ws`, `whitespace only`], [`any`, `any character`]], st.mode))}</div>
        <div class="ctl-row">${ctl(`answer to find`, seg(`span`, Object.keys(SPANS).map(k => [k, SPANS[k][0]]), st.span))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-panel"><h4>Chunks (overlap with the previous chunk is highlighted; the answer chunk has an amber border)</h4><div class="scroll-y" style="max-height:360px" data-k="chunks"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const ch = chunkText(EINSTEIN, st.size, st.ov, st.mode === `ws`);
        const span = SPANS[st.span][1], hits = ch.map(c => c.t.includes(span));
        const broken = ch.filter((c, i) => i > 0 && /[A-Za-z0-9]/.test(EINSTEIN[c.s] || ``) && /[A-Za-z0-9]/.test(EINSTEIN[c.s - 1] || ``)).length
          + ch.filter(c => /[A-Za-z0-9]/.test(EINSTEIN[c.e - 1] || ``) && /[A-Za-z0-9]/.test(EINSTEIN[c.e] || ``)).length;
        const stored = sum(ch.map(c => c.t.length));
        q(`chunks`).innerHTML = ch.map((c, i) => {
          const prevEnd = i ? ch[i - 1].e : 0, ovEnd = clamp(prevEnd, c.s, c.e);
          const body = i && ovEnd > c.s ? `<span class="cell-hl">${esc(EINSTEIN.slice(c.s, ovEnd))}</span>${esc(EINSTEIN.slice(ovEnd, c.e))}` : esc(c.t);
          return `<div class="pblock ${hits[i] ? "user" : "ctx"}" style="${hits[i] ? "border-left-width:5px" : ""}"><div class="pblock-h">chunk ${i} · ${c.t.length} chars${hits[i] ? " · contains the answer" : ""}</div><pre>${body}</pre></div>`;
        }).join("");
        const any = hits.some(Boolean);
        q(`stats`).innerHTML = stat(`chunks`, ch.length) + stat(`avg length`, Math.round(stored / ch.length)) + stat(`stored / original`, round(stored / EINSTEIN.length, 2) + `×`) + stat(`broken words at edges`, broken, broken ? `bad` : `good`) + stat(`answer intact`, any ? `yes` : `no`, any ? `good` : `bad`);
        q(`note`).innerHTML = note(any
          ? (st.mode === `any` && broken ? `The answer survived, but character splitting cut ${broken} word(s) at chunk edges. Broken words at chunk starts and ends hurt the embedding's understanding, which is why the book splits only at whitespace.` : `The answer fits inside one chunk. Bigger overlap costs storage (${round(stored / EINSTEIN.length, 2)}× the original text) but protects answers near boundaries.`)
          : `The answer straddles a chunk boundary, so no single chunk contains it. Increase the overlap or the chunk size. Real answers are fuzzier than an exact span, but the risk is the same.`, any ? (broken && st.mode === `any` ? `warn` : `good`) : `bad`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, null, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch2 - Hybrid search: vector + full-text, max-normalized, UNION, dedupe
  // =====================================================================
  const HCH = [
    `Considering Einstein's upbringing, his interest in inventions and patents was not unusual. Being a manufacturer's son, he grew up among machines and instruments.`,
    `In his ETH days Einstein was genuinely interested in experimental works, and spent most of his time in the physical laboratory.`,
    `His main occupation was theoretical physics. The inventions he worked upon were his diversions in unproductive times.`,
    `Einstein was involved in three major inventions: a refrigeration system with Leo Szilard, a sound reproduction system with Rudolf Goldschmidt, and an automatic camera.`,
    `The Einstein-Szilard refrigerator had no moving parts and used only a heat source; the patent was granted in 1930.`,
    `Einstein left the Patent office and joined the University of Zurich in 1909, moved to Prague in 1911 and was appointed full professor at ETH a year later.`,
    `In 1914 he became Director of the Kaiser Wilhelm Institute for Physics and a professor at the Humboldt University of Berlin.`,
    `At the Bern patent office, Einstein evaluated patent applications for electromagnetic devices, which sharpened his practical skills.`
  ];
  // toy concept dims: EINSTEIN(base), EXPERIMENT, INVENTION, CAREER, PATENT, THEORY, UPBRINGING, COOLING, TIME
  const HW = {
    einstein: { 0: 1 }, experimental: { 1: 1 }, laboratory: { 1: 0.8 }, works: { 1: 0.2 }, observation: { 1: 0.5 }, practical: { 1: 0.3, 4: 0.2 },
    inventions: { 2: 1 }, invention: { 2: 1 }, gadgets: { 2: 0.9 }, build: { 2: 0.4 }, built: { 2: 0.4 }, refrigeration: { 2: 0.5, 7: 1 }, refrigerator: { 2: 0.5, 7: 1 }, camera: { 2: 0.6 }, sound: { 2: 0.4 }, collaborators: { 2: 0.3 },
    professor: { 3: 1 }, university: { 3: 0.8 }, joined: { 3: 0.4 }, director: { 3: 0.7 }, appointed: { 3: 0.5 }, career: { 3: 1 },
    patent: { 4: 1 }, patents: { 4: 1 }, office: { 4: 0.4 }, applications: { 4: 0.3 },
    theoretical: { 5: 1 }, physics: { 5: 0.6 }, upbringing: { 6: 1 }, son: { 6: 0.5 }, machines: { 6: 0.4, 2: 0.2 },
    cooling: { 7: 1 }, heat: { 7: 0.6 }, days: { 8: 0.6 }, time: { 8: 0.8 }, when: { 8: 0.5 }, 1909: { 8: 0.4 }, 1911: { 8: 0.4 }, 1914: { 8: 0.4 }, 1930: { 8: 0.3 }
  };
  const hvec = s => { const v = new Array(9).fill(0); v[0] = 0.6; K.words(s).forEach(w => { const e = HW[w]; if (e) Object.keys(e).forEach(i => { v[i] += e[i]; }); }); return v; };
  const HTOK = HCH.map(c => K.contentWords(c));
  const HAVG = sum(HTOK.map(t => t.length)) / HCH.length;
  const bm25 = qs => { const qt = Array.from(new Set(K.contentWords(qs))); return HTOK.map(dt => sum(qt.map(t => { const f = dt.filter(x => x === t).length; if (!f) return 0; const n = HTOK.filter(d => d.includes(t)).length; const idf = Math.log(1 + (HCH.length - n + 0.5) / (n + 0.5)); return idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * dt.length / HAVG)); }))); };
  const HQ = {
    book: [`At what time was Einstein really interested in experimental works?`, [1]],
    rare: [`Who worked with Rudolf Goldschmidt?`, [3]],
    para: [`Which gadgets did he build with collaborators?`, [3]]
  };
  D.hybridSearch = {
    title: `Hybrid search: vector + full-text, normalized and merged`,
    blurb: `Eight chunks of the Einstein paper. Vector search scores meaning (toy embeddings); full-text search scores exact keywords (BM25, as in Lucene). The book's hybrid query <strong>divides each list by its own max score</strong>, UNIONs them, keeps each chunk's max and returns the top k. Green rows are relevant. Switch normalization off to see why raw scores can't be mixed.`,
    mount(el) {
      const st = { qk: `book`, q: HQ.book[0], k: 3, norm: `max` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`query`, seg(`qk`, [[`book`, `book's question`], [`rare`, `rare name`], [`para`, `paraphrase`]], st.qk))}${ctl(`k`, rng(`k`, 1, 5, 1, st.k))}${ctl(`normalization`, seg(`norm`, [[`max`, `divide by max`], [`none`, `raw scores`]], st.norm))}</div>
        <div class="ctl-row"><input class="lab-input" data-k="q" value="${esc(st.q)}"></div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid three" data-k="cols"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const rel = st.qk && HQ[st.qk][0] === st.q ? HQ[st.qk][1] : null;
        const qv = hvec(st.q), sv = HCH.map(c => K.cosine(qv, hvec(c))), sf = bm25(st.q);
        const top = s => s.map((v, i) => i).filter(i => s[i] > 0).sort((a, b) => s[b] - s[a]).slice(0, st.k);
        const tv = top(sv), tf = top(sf);
        const mv = Math.max(...tv.map(i => sv[i]), 1e-9), mf = Math.max(...tf.map(i => sf[i]), 1e-9);
        const nv = i => st.norm === `max` ? sv[i] / mv : sv[i], nf = i => st.norm === `max` ? sf[i] / mf : sf[i];
        const merged = {};
        tv.forEach(i => { merged[i] = { s: nv(i), src: `V` }; });
        tf.forEach(i => { const s = nf(i); if (!merged[i]) merged[i] = { s, src: `F` }; else { merged[i].src = `V+F`; merged[i].s = Math.max(merged[i].s, s); } });
        const th = Object.keys(merged).map(Number).sort((a, b) => merged[b].s - merged[a].s).slice(0, st.k);
        const row = (i, r, val, extra) => `<tr class="${rel && rel.includes(i) ? "new" : ""}"><td>${r + 1}</td><td style="white-space:normal;font-size:11.5px">#${i} ${esc(HCH[i].slice(0, 62))}…</td><td class="num">${val}</td>${extra != null ? `<td>${extra}</td>` : ``}</tr>`;
        const col = (title, ids, f, extra) => `<div class="lab-panel"><h4>${title}</h4>${ids.length ? `<table class="mini-table">${ids.map((i, r) => row(i, r, f(i), extra ? extra(i) : null)).join("")}</table>` : `<div class="cs-note">No matches.</div>`}</div>`;
        q(`cols`).innerHTML = col(`Vector (cosine${st.norm === `max` ? " ÷ max" : ""})`, tv, i => `${round(sv[i], 3)}${st.norm === `max` ? ` → ${round(nv(i), 2)}` : ``}`)
          + col(`Full-text (BM25${st.norm === `max` ? " ÷ max" : ""})`, tf, i => `${round(sf[i], 2)}${st.norm === `max` ? ` → ${round(nf(i), 2)}` : ``}`)
          + col(`Hybrid: UNION, max per chunk, top ${st.k}`, th, i => round(merged[i].s, 2), i => chip(merged[i].src === `V+F` ? `ok` : `muted`, merged[i].src));
        const recall = ids => rel ? `${ids.filter(i => rel.includes(i)).length}/${rel.length}` : `-`;
        q(`stats`).innerHTML = stat(`vector recall@k`, recall(tv)) + stat(`full-text recall@k`, recall(tf)) + stat(`hybrid recall@k`, recall(th));
        let n;
        if (st.norm === `none`) n = `Raw BM25 scores (unbounded, often above 1) and cosine similarities (0 to 1) live on different scales, so full-text hits crowd out vector hits. That is why the book normalizes each list by its maximum first.`;
        else if (st.qk === `book`) n = `Both lists put chunk #1 on top (normalized 1.0), matching the book's result. Hybrid then fills the remaining slots from whichever list scored them higher.`;
        else if (st.qk === `rare`) {
          const rank = s => s.map((v, i) => i).sort((a, b) => s[b] - s[a]).indexOf(3) + 1;
          n = `"Goldschmidt" is a rare name the embedding has never seen, so the query vector carries no meaning and the vector ranking is driven by unrelated words: chunk #3 is only at rank ${rank(sv)} there${rank(sv) > st.k ? `, so vector search misses it` : ` (set k below ${rank(sv)} and vector search loses it)`}. Full-text matches the exact name and ranks it #${rank(sf)}.`;
        }
        else if (st.qk === `para`) n = `No chunk contains "gadgets" or "collaborators", so BM25 only matches on weak words. The embedding understands gadgets ≈ inventions.`;
        else n = `Custom query. Watch how the two retrievers disagree and which chunks both agree on (V+F).`;
        n += ` Note the side effect of max-normalization: each list's top hit gets 1.0 even when it is a weak match.`;
        q(`note`).innerHTML = note(n, st.norm === `none` ? `warn` : ``);
      };
      wireSegs(el, st, key => { if (key === `qk`) { st.q = HQ[st.qk][0]; q(`q`).value = st.q; } draw(); });
      wireRanges(el, st, null, draw);
      q(`q`).addEventListener(`input`, e => { st.q = e.target.value; st.qk = null; K.setSeg(el, `qk`, `__`); draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch3 - Step-back prompting
  // =====================================================================
  // dims: AUDEL, LEOPOLD, CAREER/HISTORY, SPECIFIC DATES, FOOTBALL, EDUCATION, SEASON/CALENDAR, BOTANY
  const SB_DIMS = [`Audel`, `Leopold`, `career/history`, `specific dates`, `football`, `education`, `season/calendar`, `botany`];
  const SB_DOCS = [
    { t: `Thierry Audel is a French former footballer who played as a defender. His career took him to Triestina, Macclesfield Town (joined 2007) and Lincoln City.`, v: [1, 0, 1, 0.3, 0.6, 0, 0, 0] },
    { t: `2007-08 Football League Two season review: final table, top scorers, and transfer dates from August 2007 to May 2008.`, v: [0, 0, 0, 1, 0.9, 0, 1, 0] },
    { t: `Leopold attained her master's in botany from the University of California, Berkeley in 1950 and a Ph.D. in botany from Yale University in 1955.`, v: [0, 1, 0.7, 0.4, 0, 1, 0, 0.8] },
    { t: `University calendar archive (1954): fall term runs from August to November, spring term from January to May.`, v: [0, 0, 0, 1, 0, 0.6, 1, 0] },
    { t: `Aldo Leopold, Estella's father, was a conservationist whose career shaped American wildlife management.`, v: [0, 0.7, 0.7, 0, 0, 0, 0, 0.3] }
  ];
  const SB_Q = {
    audel: { q: `Which team did Thierry Audel play for from 2007 to 2008?`, qv: [0.7, 0, 0, 1, 0.8, 0, 0.6, 0], sb: `What is the career history of Thierry Audel?`, sv: [1, 0, 1, 0, 0.3, 0, 0, 0], rel: 0, ans: `Macclesfield Town (he joined in 2007).` },
    leopold: { q: `Estella Leopold went to which school between August and November 1954?`, qv: [0, 0.7, 0, 1, 0, 0.6, 0.8, 0], sb: `What was Estella Leopold's education history?`, sv: [0, 1, 0.8, 0, 0, 1, 0, 0], rel: 2, ans: `Yale University (Ph.D. completed in 1955).` }
  };
  D.stepBack = {
    title: `Step-back prompting: broaden the question before searching`,
    blurb: `The book's examples (Thierry Audel, Estella Leopold). The specific question is dominated by dates, so its embedding lands near documents about seasons and calendars. An LLM with the step-back prompt rewrites it into a broader question that matches the biography. The <em>original</em> question is still used to generate the answer. Vectors here are toy concept vectors, shown so you can see why.`,
    mount(el) {
      const st = { qk: `audel`, use: `on`, k: 2 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`example`, seg(`qk`, [[`audel`, `Thierry Audel`], [`leopold`, `Estella Leopold`]], st.qk))}${ctl(`step-back`, seg(`use`, [[`off`, `off`], [`on`, `on`]], st.use))}${ctl(`k`, rng(`k`, 1, 3, 1, st.k))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid even"><div class="lab-panel"><h4>Pipeline</h4><div data-k="pipe"></div></div><div class="lab-panel"><h4>Similarity of the search query to each document</h4><div data-k="bars"></div><div class="cs-note" data-k="dims" style="margin-top:8px"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const S = SB_Q[st.qk], on = st.use === `on`, qv = on ? S.sv : S.qv;
        const sims = SB_DOCS.map(d => K.cosine(qv, d.v));
        const order = sims.map((s, i) => i).sort((a, b) => sims[b] - sims[a]);
        const got = order.slice(0, st.k), hit = got.includes(S.rel);
        q(`bars`).innerHTML = hbars(order.map(i => ({ label: (i === S.rel ? `★ ` : ``) + SB_DOCS[i].t.slice(0, 34) + `…`, value: sims[i], text: round(sims[i], 2), cls: got.includes(i) ? (i === S.rel ? `good` : `warn`) : `muted`, title: SB_DOCS[i].t })), 1);
        q(`dims`).innerHTML = `Query vector: ` + qv.map((v, i) => v ? `${SB_DIMS[i]} ${v}` : null).filter(Boolean).join(` · `);
        q(`pipe`).innerHTML = pblock(`user`, `user question`, S.q)
          + (on ? pblock(`sys`, `LLM + step-back prompt (few-shot)`, `You are an expert at world knowledge. Your task is to step back and paraphrase a question to a more generic step-back question, which is easier to answer.\n"input": "Could the members of The Police perform lawful arrests?"\n"output": "what can the members of The Police do?"`) + pblock(`ctx`, `step-back question (used for retrieval)`, S.sb) : pblock(`sys off`, `step-back skipped`, `search with the original question`))
          + pblock(`ctx`, `retrieved top-${st.k}`, got.map(i => `• ${SB_DOCS[i].t}`).join(`\n`))
          + pblock(hit ? `out` : `bad`, `answer to the original question`, hit ? S.ans : `The documents don't say which team/school that was.`);
        q(`stats`).innerHTML = stat(`relevant doc rank`, order.indexOf(S.rel) + 1, order.indexOf(S.rel) < st.k ? `good` : `bad`) + stat(`answered`, hit ? `yes` : `no`, hit ? `good` : `bad`) + stat(`LLM calls`, on ? 2 : 1);
        q(`note`).innerHTML = note(on
          ? (hit ? `The broad question matches the biography, which contains the specific answer. Retrieval used the rewrite; the answer used the original question.` : `Even with step-back the relevant document didn't make the top-${st.k}.`)
          : `The specific dates pull the query toward the season/calendar documents, which share the words but not the answer. The biography ranks below them.`, hit ? `good` : `warn`)
          + note(`The cost: one extra LLM call per question (latency and money), and a risk that the rewrite drifts from the user's intent. Exercise 3.3: compare with and without step-back on your own questions.`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, null, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch3 - Parent document retriever (k * 4 over-fetch)
  // =====================================================================
  const PD = [
    { id: `P1`, title: `1. Introduction`, kids: [`Einstein's upbringing among machines explains his interest in inventions.`, `His father's company illuminated Munich during the beer festival.`, `At ETH he spent most of his time in the physical laboratory.`] },
    { id: `P2`, title: `2. Patent office years`, kids: [`At the Bern patent office he examined applications for electrical devices.`, `The patent office work trained him to spot the core idea of an invention.`, `He left the patent office for the University of Zurich in 1909.`] },
    { id: `P3`, title: `3A. Refrigerator with Szilard`, kids: [`Einstein and Leo Szilard designed a refrigerator with no moving parts.`, `It used a heat source and ammonia, butane and water to move heat.`, `The refrigerator patent was granted in 1930, but the design was never sold widely.`, `Electrolux bought one of the refrigerator patents.`] },
    { id: `P4`, title: `3B. Blouse design`, kids: [`Einstein also designed a blouse that adapted to the wearer's body.`, `The blouse design used a flexible pattern of pleats and seams.`, `The patent was granted on October 27, 1936.`] },
    { id: `P5`, title: `3C. Automatic camera`, kids: [`An automatic camera adjusted exposure to the available light.`, `It was developed with Gustav Bucky.`, `A light-sensitive cell controlled the aperture.`] }
  ];
  const PD_CH = []; PD.forEach((p, pi) => p.kids.forEach((t, ci) => PD_CH.push({ p: pi, ci, t })));
  const PD_Q = {
    blouse: { q: `When was Einstein granted the patent for his blouse design?`, answer: [3, 2], sc: { "3-0": 0.91, "3-1": 0.86, "3-2": 0.62, "2-2": 0.71, "2-0": 0.58, "1-0": 0.66, "1-1": 0.6, "4-0": 0.52 } },
    fridge: { q: `What was special about the Einstein-Szilard refrigerator?`, answer: [2, 0], sc: { "2-0": 0.93, "2-2": 0.88, "2-1": 0.84, "2-3": 0.8, "1-0": 0.55, "0-0": 0.5, "3-0": 0.47, "4-0": 0.45 } }
  };
  D.parentDoc = {
    title: `Parent document retriever: match children, return parents`,
    blurb: `The Einstein paper as PDF → Parent (≤ 2,000 chars) → Child (500 chars, embedded). The query is matched against <strong>child</strong> embeddings, then the Cypher query traverses <code>(child)&lt;-[:HAS_CHILD]-(parent)</code>, keeps each parent's max score and returns k <strong>parents</strong>. Watch why the book fetches <strong>k × 4</strong> children: several top children belong to the same parent.`,
    mount(el) {
      const st = { qk: `blouse`, k: 2, mult: 4, ret: `parent` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`question`, seg(`qk`, [[`blouse`, `blouse patent date`], [`fridge`, `Szilard refrigerator`]], st.qk))}${ctl(`k`, rng(`k`, 1, 4, 1, st.k))}${ctl(`children fetched`, seg(`mult`, [[1, `k × 1`], [2, `k × 2`], [4, `k × 4`]], st.mult))}${ctl(`return`, seg(`ret`, [[`parent`, `parents`], [`child`, `children only`]], st.ret))}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid even"><div class="lab-panel"><h4>Child chunks ranked by similarity</h4><table class="mini-table" data-k="kids"></table></div><div class="lab-panel"><h4>Context passed to the LLM</h4><div class="scroll-y" style="max-height:330px" data-k="ctx"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const Q = PD_Q[st.qk];
        const ranked = PD_CH.map(c => ({ ...c, s: Q.sc[`${c.p}-${c.ci}`] || 0.3 + 0.01 * ((c.p * 7 + c.ci * 3) % 10) })).sort((a, b) => b.s - a.s);
        const fetchN = st.ret === `child` ? st.k : st.k * st.mult, fetched = ranked.slice(0, fetchN);
        const parents = []; fetched.forEach(c => { if (!parents.some(p => p.p === c.p)) parents.push({ p: c.p, s: c.s }); });
        const outParents = parents.slice(0, st.k);
        q(`kids`).innerHTML = `<tr><th>#</th><th>parent</th><th>child text</th><th class="num">score</th></tr>` + ranked.slice(0, 10).map((c, r) => `<tr class="${r < fetchN ? "new" : "dim"}"><td>${r + 1}</td><td>${PD[c.p].id}</td><td style="white-space:normal;font-size:11.5px">${esc(c.t)}${c.p === Q.answer[0] && c.ci === Q.answer[1] ? " ★" : ""}</td><td class="num">${c.s.toFixed(2)}</td></tr>`).join("");
        let ctxHtml, hasAns, chars;
        if (st.ret === `child`) {
          ctxHtml = fetched.map(c => pblock(`ctx`, `${PD[c.p].id} child`, c.t)).join("");
          hasAns = fetched.some(c => c.p === Q.answer[0] && c.ci === Q.answer[1]); chars = sum(fetched.map(c => c.t.length));
        } else {
          ctxHtml = outParents.map(p => pblock(`ctx`, `${PD[p.p].id} · ${PD[p.p].title} · max score ${p.s.toFixed(2)}`, PD[p.p].kids.join(` `))).join("");
          hasAns = outParents.some(p => p.p === Q.answer[0]); chars = sum(outParents.map(p => PD[p.p].kids.join(` `).length));
        }
        q(`ctx`).innerHTML = ctxHtml;
        const short = st.ret === `parent` && outParents.length < st.k;
        q(`stats`).innerHTML = stat(`children fetched`, fetchN) + (st.ret === `parent` ? stat(`unique parents / k`, `${outParents.length} / ${st.k}`, short ? `bad` : `good`) : ``) + stat(`context chars`, chars) + stat(`answer (★) in context`, hasAns ? `yes` : `no`, hasAns ? `good` : `bad`);
        let n;
        if (st.ret === `child`) n = hasAns ? `The answer child happened to rank high enough.` : `The best-matching children talk about the topic, but the child with the actual answer (★) uses different words and ranks low. Returning only children loses it; the parent contains it.`;
        else if (short) n = `Only ${outParents.length} unique parent(s) for k = ${st.k}: the top children are siblings from the same parent. Over-fetching (k × 4) creates the buffer that the book uses to guarantee k parents after deduplication.`;
        else n = `Small children give precise matches; the parent gives the LLM full context, including the sibling chunk with the answer. The price is a longer prompt (${chars} chars).`;
        q(`note`).innerHTML = note(n, hasAns && !short ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, null, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch4 - text2cypher prompt builder over a toy Movies graph
  // =====================================================================
  const P = { // name: born
    "Tom Hanks": 1956, "Meg Ryan": 1961, "Keanu Reeves": 1964, "Carrie-Anne Moss": 1967, "Laurence Fishburne": 1961, "Lana Wachowski": 1965, "Lilly Wachowski": 1967,
    "Tom Cruise": 1962, "Kelly McGillis": 1957, "Tony Scott": 1944, "Jack Nicholson": 1937, "Nora Ephron": 1941, "Rob Reiner": 1947, "Ron Howard": 1954, "Robert Zemeckis": 1951
  };
  const M = { "The Matrix": 1999, "The Matrix Reloaded": 2003, "Top Gun": 1986, "A Few Good Men": 1992, "Sleepless in Seattle": 1993, "You've Got Mail": 1998, "When Harry Met Sally": 1989, "Apollo 13": 1995, "Cast Away": 2000, "Stand By Me": 1986 };
  const ACTED = [["Tom Hanks", "Sleepless in Seattle"], ["Tom Hanks", "You've Got Mail"], ["Tom Hanks", "Apollo 13"], ["Tom Hanks", "Cast Away"], ["Meg Ryan", "Sleepless in Seattle"], ["Meg Ryan", "You've Got Mail"], ["Meg Ryan", "Top Gun"], ["Meg Ryan", "When Harry Met Sally"],
    ["Keanu Reeves", "The Matrix"], ["Keanu Reeves", "The Matrix Reloaded"], ["Carrie-Anne Moss", "The Matrix"], ["Carrie-Anne Moss", "The Matrix Reloaded"], ["Laurence Fishburne", "The Matrix"], ["Laurence Fishburne", "The Matrix Reloaded"],
    ["Tom Cruise", "Top Gun"], ["Tom Cruise", "A Few Good Men"], ["Kelly McGillis", "Top Gun"], ["Jack Nicholson", "A Few Good Men"]];
  const DIRECTED = [["Lana Wachowski", "The Matrix"], ["Lilly Wachowski", "The Matrix"], ["Lana Wachowski", "The Matrix Reloaded"], ["Lilly Wachowski", "The Matrix Reloaded"], ["Tony Scott", "Top Gun"], ["Rob Reiner", "A Few Good Men"], ["Rob Reiner", "When Harry Met Sally"], ["Rob Reiner", "Stand By Me"], ["Nora Ephron", "Sleepless in Seattle"], ["Nora Ephron", "You've Got Mail"], ["Ron Howard", "Apollo 13"], ["Robert Zemeckis", "Cast Away"]];
  const PRODUCED_IN = [["The Matrix", "United States"], ["The Matrix", "Australia"]];
  const countBy = (pairs, idx) => { const m = {}; pairs.forEach(p => { m[p[idx]] = (m[p[idx]] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
  const EMPTY = { rows: [], why: `no rows` };
  const T2C_Q = {
    most: {
      q: `Who directed the most movies?`,
      ok: { cy: `MATCH (p:Person)-[:DIRECTED]->(m:Movie)\nRETURN p.name, COUNT(m) AS movieCount\nORDER BY movieCount DESC LIMIT 1`, run: () => ({ cols: [`p.name`, `movieCount`], rows: countBy(DIRECTED, 0).slice(0, 1) }) },
      noSchema: { cy: `MATCH (d:Director)-[:DIRECTED]->(m:Film)\nRETURN d.name, COUNT(m) AS films\nORDER BY films DESC LIMIT 1`, why: `There is no :Director or :Film label in the graph, so nothing matches.` },
      noTerm: { cy: `MATCH (d:Director)-[:DIRECTED]->(m:Movie)\nRETURN d.name, COUNT(m) AS movieCount\nORDER BY movieCount DESC LIMIT 1`, why: `"Directed" suggested a :Director label. Directors are :Person nodes; the terminology mapping says so.` }
    },
    born: {
      q: `Which actors were born before 1960?`,
      ok: { cy: `MATCH (p:Person)-[:ACTED_IN]->(:Movie)\nWHERE p.born < 1960\nRETURN DISTINCT p.name, p.born`, run: () => ({ cols: [`p.name`, `p.born`], rows: Array.from(new Set(ACTED.map(a => a[0]))).filter(n => P[n] < 1960).map(n => [n, P[n]]) }) },
      noSchema: { cy: `MATCH (a:Actor)\nWHERE a.birthYear < 1960\nRETURN a.name`, why: `Guessed label :Actor and property birthYear; the graph has :Person {born}.` },
      noTerm: { cy: `MATCH (a:Actor)\nWHERE a.born < 1960\nRETURN a.name`, why: `Right property, wrong label: "actors" are :Person nodes with ACTED_IN relationships.` }
    },
    country: {
      q: `In what country was the movie The Matrix produced?`,
      ok: { cy: `MATCH (m:Movie {title: 'The Matrix'})-[:PRODUCED_IN]->(c:Country)\nRETURN c.name`, run: () => ({ cols: [`c.name`], rows: PRODUCED_IN.filter(r => r[0] === `The Matrix`).map(r => [r[1]]) }) },
      noSchema: { cy: `MATCH (m:Movie {title: 'The Matrix'})\nRETURN m.country`, why: `Country is a node reached via PRODUCED_IN, not a property, so m.country is null.` },
      noShot: { cy: `MATCH (m:Movie {title: 'The Matrix'})\nRETURN m.country`, why: `Even with the schema, the model reached for a property. The book's fix is a few-shot example showing the PRODUCED_IN traversal.` }
    },
    cast: {
      q: `Who acted in Top Gun?`,
      ok: { cy: `MATCH (p:Person)-[:ACTED_IN]->(m:Movie {title: 'Top Gun'})\nRETURN p.name`, run: () => ({ cols: [`p.name`], rows: ACTED.filter(a => a[1] === `Top Gun`).map(a => [a[0]]) }) },
      noSchema: { cy: `MATCH (a:Actor)-[:ACTED_IN]->(f:Film {name: 'Top Gun'})\nRETURN a.name`, why: `Invented labels (:Actor, :Film) and property (name instead of title).` }
    },
    pairs: {
      q: `Which two people acted in the most movies together?`,
      ok: { cy: `MATCH (p1:Person)-[:ACTED_IN]->(m:Movie)<-[:ACTED_IN]-(p2:Person)\nWHERE p1.name < p2.name\nRETURN p1.name, p2.name, COUNT(m) AS movieCount\nORDER BY movieCount DESC LIMIT 1`, run: () => { const c = {}; Object.keys(M).forEach(mv => { const cast = ACTED.filter(a => a[1] === mv).map(a => a[0]).sort(); for (let i = 0; i < cast.length; i++) for (let j = i + 1; j < cast.length; j++) { const k = cast[i] + `|` + cast[j]; c[k] = (c[k] || 0) + 1; } }); const best = Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]; return { cols: [`p1.name`, `p2.name`, `movieCount`], rows: [[...best[0].split(`|`), best[1]]] }; } },
      noSchema: { cy: `MATCH (a:Actor)-[:CO_STARRED]->(b:Actor)\nRETURN a.name, b.name, count(*) AS n\nORDER BY n DESC LIMIT 1`, why: `Invented a CO_STARRED relationship that doesn't exist.` }
    }
  };
  const SCHEMA_STR = `Node properties:\nMovie {tagline: STRING, title: STRING, released: INTEGER}\nPerson {born: INTEGER, name: STRING}\nCountry {name: STRING}\nRelationship properties:\nACTED_IN {roles: LIST}\nThe relationships:\n(:Person)-[:ACTED_IN]->(:Movie)\n(:Person)-[:DIRECTED]->(:Movie)\n(:Movie)-[:PRODUCED_IN]->(:Country)`;
  const TERM_STR = `Persons: When a user asks about a person by trade like actor, writer, director, producer, or reviewer, they are referring to a node with the label 'Person'.\nMovies: When a user asks about a film or movie, they are referring to a node with the label Movie.`;
  const SHOT_STR = `Question: In what country was the movie Ready Player One produced?\nCypher: MATCH (m:Movie {title: 'Ready Player One'})-[:PRODUCED_IN]->(c:Country) RETURN c.name`;
  const FMT_STR = `Do not include any explanations or apologies in your responses.\nDo not include any text except the generated Cypher statement.\nONLY RESPOND WITH CYPHER - NO CODE BLOCKS.`;
  function t2cGenerate(qk, o) {
    const Q = T2C_Q[qk];
    let v = Q.ok, why = null;
    if (!o.schema && Q.noSchema) { v = Q.noSchema; why = Q.noSchema.why; }
    else if (!o.term && Q.noTerm) { v = Q.noTerm; why = Q.noTerm.why; }
    else if (!o.shot && Q.noShot) { v = Q.noShot; why = Q.noShot.why; }
    const raw = o.fmt ? v.cy : `Sure! Here is a Cypher query that answers your question:\n\n\`\`\`cypher\n${v.cy}\n\`\`\`\n\nThis query finds the matching nodes and returns the result.`;
    let res;
    if (!o.fmt) res = { err: `Invalid input 'S': expected a Cypher clause (line 1, column 1)` };
    else if (v === Q.ok) res = Q.ok.run();
    else res = { cols: [`result`], rows: qk === `country` ? [[`null`]] : [], why };
    return { raw, res, correct: o.fmt && v === Q.ok, why: o.fmt ? why : `The answer is wrapped in prose and a code fence, so executing it fails. Format instructions make the output directly executable.` };
  }
  D.text2cypher = {
    title: `text2cypher: build the prompt, generate Cypher, run it`,
    blurb: `A toy version of the Movies graph (plus a Country node, like the book's few-shot example). Toggle the four prompt ingredients from section 4.3 and see how a typical LLM's query changes. The generations are scripted to reproduce the failure modes the book describes, and the queries really run against the in-browser graph.`,
    mount(el) {
      const st = { qk: `most`, schema: true, term: true, shot: true, fmt: true };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`question`, seg(`qk`, Object.keys(T2C_Q).map(k => [k, T2C_Q[k].q]), st.qk))}</div>
        <div class="ctl-row">${[[`schema`, `schema`], [`term`, `terminology mapping`], [`shot`, `few-shot example`], [`fmt`, `format instructions`]].map(([k, l]) => ctl(l, seg(k, [[true, `on`], [false, `off`]], st[k]))).join("")}</div>
        <div class="stat-row" data-k="stats"></div>
        <div class="lab-grid even"><div class="lab-panel"><h4>Prompt</h4><div class="scroll-y" style="max-height:380px" data-k="prompt"></div></div><div class="lab-panel"><h4>LLM output → execution</h4><div data-k="out"></div></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const Q = T2C_Q[st.qk], g = t2cGenerate(st.qk, st);
        q(`prompt`).innerHTML = pblock(`sys`, `instructions`, `Generate Cypher statement to query a graph database to get the data to answer the following user question.`)
          + pblock(`ctx ${st.schema ? "" : "off"}`, `graph database schema`, `Use only the provided relationship types and properties in the schema.\n${SCHEMA_STR}`)
          + pblock(`ctx ${st.term ? "" : "off"}`, `terminology mapping`, TERM_STR)
          + pblock(`ctx ${st.shot ? "" : "off"}`, `examples`, SHOT_STR)
          + pblock(`sys ${st.fmt ? "" : "off"}`, `format instructions`, FMT_STR)
          + pblock(`user`, `user question`, Q.q);
        let table;
        if (g.res.err) table = `<div class="lab-note bad">Neo.ClientError.Statement.SyntaxError: ${esc(g.res.err)}</div>`;
        else table = g.res.rows.length ? `<table class="mini-table"><tr>${g.res.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr>${g.res.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>` : `<div class="cs-note">(no rows)</div>`;
        q(`out`).innerHTML = pblock(g.correct ? `out` : `bad`, `generated`, g.raw) + table + `<div style="margin-top:6px">${okChip(g.correct, `✓ correct query`, `✗ wrong / failed`)}</div>`;
        const score = Object.keys(T2C_Q).filter(k => t2cGenerate(k, st).correct).length;
        q(`stats`).innerHTML = stat(`questions answered correctly with these settings`, `${score} / ${Object.keys(T2C_Q).length}`, score === 5 ? `good` : score < 3 ? `bad` : ``) + stat(`prompt ingredients on`, [st.schema, st.term, st.shot, st.fmt].filter(Boolean).length + ` / 4`);
        q(`note`).innerHTML = note(g.correct ? `The query is valid for this schema and returns the right rows. In production also guard execution: read-only access, timeouts and row limits.` : esc(g.why || ``), g.correct ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };
})();
