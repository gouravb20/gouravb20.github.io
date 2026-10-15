// Interactive book notes - app shell (shared by every notes site)
// Depends on DATA (data*.js), DEMOS (demos*.js) and DeepRender (deep.js); book-specific strings live in DATA.book.
// Deep dives (deep/<chapter>.js, filling DEEP) load on demand.
// The data contract is typed in shared/notes.d.ts and enforced by scripts/check-site.mjs.

const BOOK = DATA.book;
const STORAGE_KEY = BOOK.storageKey;
const MOBILE_BREAKPOINT = 768;
const TABS = ["learn", "concepts", "labs", "cheatsheet", "interview"];
const DEFAULT_TAB = "learn";
// Book-wide pages, routed as #/glossary and #/cheatsheet alongside the chapters
const VIEWS = { glossary: "Glossary", cheatsheet: "All cheatsheets" };

const state = {
  currentChapter: "dashboard",
  currentTab: "concepts",
  theme: "dark",
  hideDefs: false,
  revealed: new Set(),
  progress: {},
  lastChapter: null,
  conceptQuery: "",
  conceptShow: "all",
  qaDiff: "all",
  qaHideReviewed: false
};

let labCleanups = [];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (saved.progress) state.progress = saved.progress;
    if (saved.theme) state.theme = saved.theme;
    state.hideDefs = !!saved.hideDefs;
    if (saved.lastChapter) state.lastChapter = saved.lastChapter;
    // One-time migrate per-book theme into the site-wide look preference.
    if (window.SDLooks && saved.theme && !localStorage.getItem(window.SDLooks.THEME_KEY)) {
      window.SDLooks.applyTheme(saved.theme === "light" ? "light" : "dark");
    }
  } catch (e) { console.warn("Could not load state", e); }
  applyTheme();
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ progress: state.progress, theme: state.theme, hideDefs: state.hideDefs, lastChapter: state.lastChapter }));
  } catch (e) {}
}
function getChapterProgress(chId) {
  if (!state.progress[chId]) state.progress[chId] = { conceptsLearned: {}, qaReviewed: {} };
  const p = state.progress[chId];
  if (!p.sectionsRead) p.sectionsRead = {};
  return p;
}
function countTrue(obj) { return Object.keys(obj || {}).filter(k => obj[k]).length; }
function applyTheme() {
  if (window.SDLooks) {
    window.SDLooks.applyTheme();
    return;
  }
  document.body.classList.toggle("light", state.theme === "light");
  const t = document.getElementById("themeToggle");
  if (t) t.textContent = state.theme === "light" ? "Dark" : "Light";
}

let toastTimer;
function showToast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.borderColor = isError ? "var(--bad)" : "var(--accent)";
  t.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = "0"; }, 4500);
}
const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

function computeChapterPct(ch) {
  const prog = getChapterProgress(ch.id);
  const total = ch.concepts.length + ch.interview.length;
  if (!total) return 0;
  return Math.round(((countTrue(prog.conceptsLearned) + countTrue(prog.qaReviewed)) / total) * 100);
}
function computeOverallPct() {
  let total = 0, done = 0;
  DATA.chapters.forEach(ch => {
    const p = getChapterProgress(ch.id);
    total += ch.concepts.length + ch.interview.length;
    done += countTrue(p.conceptsLearned) + countTrue(p.qaReviewed);
  });
  return total ? Math.round((done / total) * 100) : 0;
}

// ============================================================
// Routing (hash based so labs can be deep-linked)
// ============================================================
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!parts.length) return { chapter: "dashboard", tab: DEFAULT_TAB, lab: null };
  if (VIEWS[parts[0]]) return { chapter: parts[0], tab: DEFAULT_TAB, lab: null };
  const ch = DATA.chapters.find(c => c.id === parts[0]);
  if (!ch) return { chapter: "dashboard", tab: DEFAULT_TAB, lab: null };
  const tab = TABS.includes(parts[1]) ? parts[1] : DEFAULT_TAB;
  return { chapter: ch.id, tab, lab: parts[2] || null };
}
/** `lab` is a lab id on the labs tab and a section id on the learn tab. */
function navigate(chapter, tab, lab) {
  const hash = chapter === "dashboard" ? "#/" : VIEWS[chapter] ? `#/${chapter}` : `#/${chapter}/${tab || DEFAULT_TAB}${lab ? "/" + lab : ""}`;
  if (location.hash === hash) { applyRoute(); return; }
  location.hash = hash;
}
function applyRoute() {
  const r = parseHash();
  const chapterChanged = r.chapter !== state.currentChapter;
  state.currentChapter = r.chapter;
  state.currentTab = r.tab;
  if (chapterChanged) { state.revealed.clear(); state.conceptQuery = ""; }
  if (r.chapter !== "dashboard" && !VIEWS[r.chapter] && state.lastChapter !== r.chapter) { state.lastChapter = r.chapter; saveState(); }
  pendingTarget = r.lab ? (r.tab === "learn" ? "learn-" : "lab-") + r.lab : null;
  render();
  if (!scrollToPending() && chapterChanged) window.scrollTo(0, 0);
}
// Deep dives render after their file loads, so a #/ch3/learn/<section> target may have to wait.
let pendingTarget = null;
function scrollToPending() {
  const el = pendingTarget && document.getElementById(pendingTarget);
  if (!el) return false;
  pendingTarget = null;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  return true;
}

// ============================================================
// Drawer / menus
// ============================================================
function openDrawer() { sidebarEl().classList.add("open"); document.getElementById("backdrop").classList.add("open"); }
function closeDrawer() { sidebarEl().classList.remove("open"); document.getElementById("backdrop").classList.remove("open"); }
function sidebarEl() { return document.getElementById("sidebar"); }
function closeMoreMenu() { document.getElementById("moreMenu").classList.remove("open"); }

// ============================================================
// Sidebar
// ============================================================
function renderSidebar() {
  const parts = {};
  DATA.chapters.forEach(ch => { (parts[ch.part] = parts[ch.part] || []).push(ch); });
  let html = `
    <div class="chapter-item ${state.currentChapter === "dashboard" ? "active" : ""}" data-chapter="dashboard">
      <div class="chapter-num">&#10022;</div><div class="chapter-title">Dashboard</div>
    </div>
    <div class="chapter-item ${state.currentChapter === "glossary" ? "active" : ""}" data-chapter="glossary">
      <div class="chapter-num">A&ndash;Z</div><div class="chapter-title">${VIEWS.glossary}</div>
    </div>
    <div class="chapter-item ${state.currentChapter === "cheatsheet" ? "active" : ""}" data-chapter="cheatsheet">
      <div class="chapter-num">&#8801;</div><div class="chapter-title">${VIEWS.cheatsheet}</div>
    </div>`;
  Object.keys(parts).sort((a, b) => a - b).forEach(p => {
    html += `<div class="part-header">${DATA.parts[p] || "Part " + p}</div>`;
    parts[p].forEach(ch => {
      const pct = computeChapterPct(ch);
      const r = 8, c = 2 * Math.PI * r, off = c - (pct / 100) * c;
      html += `
        <div class="chapter-item ${state.currentChapter === ch.id ? "active" : ""}" data-chapter="${ch.id}">
          <div class="chapter-num">${ch.number}</div>
          <div class="chapter-title">${ch.title}</div>
          <div class="chapter-ring ${pct === 100 ? "done" : ""}">
            ${pct === 100 ? '<div class="check">&#10003;</div>'
              : `<svg viewBox="0 0 20 20"><circle class="bg" cx="10" cy="10" r="${r}"/><circle class="fg" cx="10" cy="10" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${off}"/></svg>`}
          </div>
        </div>`;
    });
  });
  const sb = sidebarEl();
  sb.innerHTML = html;
  sb.querySelectorAll(".chapter-item").forEach(el => {
    el.addEventListener("click", () => {
      if (isMobile()) closeDrawer();
      navigate(el.dataset.chapter, DEFAULT_TAB);
    });
  });
}

// ============================================================
// Main
// ============================================================
function cleanupLabs() {
  labCleanups.forEach(fn => { try { fn(); } catch (e) {} });
  labCleanups = [];
}

function renderMain() {
  cleanupLabs();
  const m = document.getElementById("main");
  if (state.currentChapter === "dashboard") { renderDashboard(m); return; }
  if (state.currentChapter === "glossary") { renderGlossary(m); return; }
  if (state.currentChapter === "cheatsheet") { renderAllCheatsheets(m); return; }
  const ch = DATA.chapters.find(c => c.id === state.currentChapter);
  const prog = getChapterProgress(ch.id);
  const doneC = countTrue(prog.conceptsLearned);
  const doneQ = countTrue(prog.qaReviewed);
  const tabBtn = (id, label, count, extra) =>
    `<button class="tab ${extra || ""} ${state.currentTab === id ? "active" : ""}" data-tab="${id}">${label} <span class="tab-count">${count}</span></button>`;

  const deep = DEEP[ch.id];
  const learnCount = deep ? `${deep.sections.filter(s => prog.sectionsRead[s.id]).length}/${deep.sections.length}` : "&hellip;";

  let body = "";
  if (state.currentTab === "learn") body = renderLearn(ch);
  else if (state.currentTab === "concepts") body = renderConcepts(ch);
  else if (state.currentTab === "labs") body = renderLabsShell(ch);
  else if (state.currentTab === "cheatsheet") body = renderCheatsheet(ch);
  else body = renderInterview(ch);

  const idx = DATA.chapters.findIndex(c => c.id === ch.id);
  const prev = DATA.chapters[idx - 1], next = DATA.chapters[idx + 1];
  m.innerHTML = `
    <div class="chapter-header">
      <div class="chapter-label">Chapter ${ch.number} &middot; ${DATA.parts[ch.part]}</div>
      <h1>${ch.title}</h1>
      <div class="overview-text">${ch.overview}</div>
      ${ch.source ? `<div class="chapter-source">Reference: <a href="${ch.source.url}" target="_blank" rel="noopener">${ch.source.title}</a> &#8599;</div>` : ""}
    </div>
    <div class="tabs">
      ${tabBtn("learn", "Deep Dive", learnCount, "learn-tab")}
      ${tabBtn("concepts", "Core Concepts", `${doneC}/${ch.concepts.length}`)}
      ${tabBtn("labs", "&#9654; Interactive Labs", ch.labs.length, "labs-tab")}
      ${tabBtn("cheatsheet", "Cheatsheet", ch.cheatsheet.length)}
      ${tabBtn("interview", "Interview Q&amp;A", `${doneQ}/${ch.interview.length}`)}
    </div>
    <div id="tabBody">${body}</div>
    <div class="chapter-footer">
      ${prev ? `<button class="nav-btn" data-nav="${prev.id}"><div class="nav-btn-label">&larr; Previous</div>Ch ${prev.number}: ${prev.title}</button>` : "<div></div>"}
      ${next ? `<button class="nav-btn right" data-nav="${next.id}"><div class="nav-btn-label">Next &rarr;</div>Ch ${next.number}: ${next.title}</button>` : "<div></div>"}
    </div>`;

  m.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => navigate(ch.id, t.dataset.tab)));
  const selfTest = m.querySelector(".selftest-toggle");
  if (selfTest) selfTest.addEventListener("click", () => {
    state.hideDefs = !state.hideDefs;
    state.revealed.clear();
    saveState(); renderMain();
  });
  m.querySelectorAll(".concepts-grid.selftest .concept-card").forEach(card => card.addEventListener("click", e => {
    if (e.target.closest(".learn-toggle, .concept-demo-link")) return;
    state.revealed.add(+card.dataset.card);
    card.classList.add("revealed");
  }));
  m.querySelectorAll("[data-nav]").forEach(n => n.addEventListener("click", () => navigate(n.dataset.nav, DEFAULT_TAB)));
  m.querySelectorAll("[data-demo-link]").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    const owner = DATA.chapters.find(c => c.labs.includes(b.dataset.demoLink)) || ch;
    navigate(owner.id, "labs", b.dataset.demoLink);
  }));
  m.querySelectorAll(".learn-toggle").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    const p = getChapterProgress(ch.id);
    p.conceptsLearned[btn.dataset.idx] = !p.conceptsLearned[btn.dataset.idx];
    saveState(); render();
  }));
  m.querySelectorAll(".qa-header").forEach(h => h.addEventListener("click", () => h.parentElement.classList.toggle("open")));
  m.querySelectorAll(".review-btn").forEach(btn => btn.addEventListener("click", e => {
    e.stopPropagation();
    const p = getChapterProgress(ch.id);
    p.qaReviewed[btn.dataset.idx] = !p.qaReviewed[btn.dataset.idx];
    saveState();
    const item = btn.closest(".qa-item");
    item.classList.toggle("reviewed", !!p.qaReviewed[btn.dataset.idx]);
    btn.classList.toggle("on", !!p.qaReviewed[btn.dataset.idx]);
    btn.textContent = p.qaReviewed[btn.dataset.idx] ? "\u2713 Reviewed" : "Mark reviewed";
    renderSidebar(); updateProgressPill(); updateTabCounts(ch);
    applyQaFilter(m);
  }));
  wireFilters(m);
  if (state.currentTab === "learn") wireLearn(m, ch);
  if (state.currentTab === "labs" || state.currentTab === "learn") mountLabs(ch);
}

// ============================================================
// Deep Dive
// ============================================================
/** chapter id -> the pending load, or "missing" when the chapter has no deep dive file; loaded ones are in DEEP. */
const deepStatus = {};
window.DEEP = window.DEEP || {};
function loadDeep(chId) {
  if (DEEP[chId]) return Promise.resolve(true);
  if (deepStatus[chId] === "missing") return Promise.resolve(false);
  if (!deepStatus[chId]) {
    deepStatus[chId] = new Promise(resolve => {
      const sc = document.createElement("script");
      sc.src = `deep/${chId}.js`;
      sc.onload = () => { if (!DEEP[chId]) deepStatus[chId] = "missing"; resolve(!!DEEP[chId]); };
      sc.onerror = () => { deepStatus[chId] = "missing"; sc.remove(); resolve(false); };
      document.head.appendChild(sc);
    });
  }
  return deepStatus[chId];
}
function renderLearn(ch) {
  const deep = DEEP[ch.id];
  if (deep) {
    const p = getChapterProgress(ch.id);
    return DeepRender.render(deep, {
      sectionHref: id => `#/${ch.id}/learn/${id}`,
      labInfo: id => DEMOS[id],
      done: id => !!p.sectionsRead[id],
    });
  }
  if (deepStatus[ch.id] === "missing") {
    return `<div class="empty-tab">The deep dive for this chapter isn't written yet. Start with the <a href="#/${ch.id}/concepts">core concepts</a>.</div>`;
  }
  loadDeep(ch.id).then(() => {
    if (state.currentChapter === ch.id && state.currentTab === "learn") { renderMain(); scrollToPending(); }
  });
  return '<div class="deep-loading">Loading the deep dive&hellip;</div>';
}
function wireLearn(m, ch) {
  const deep = DEEP[ch.id];
  if (!deep) return;
  const p = getChapterProgress(ch.id);
  const count = () => {
    const done = deep.sections.filter(s => p.sectionsRead[s.id]).length;
    m.querySelector(".deep-toc-count").textContent = `\u00b7 ${done} of ${deep.sections.length} understood`;
    const tab = m.querySelector('.tab[data-tab="learn"] .tab-count');
    if (tab) tab.textContent = `${done}/${deep.sections.length}`;
  };
  count();
  m.querySelectorAll(".section-done").forEach(btn => btn.addEventListener("click", () => {
    const id = btn.dataset.sec, on = !p.sectionsRead[id];
    p.sectionsRead[id] = on;
    saveState();
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.innerHTML = on ? "&#10003; Understood" : "Mark as understood";
    btn.closest(".deep-section").classList.toggle("done", on);
    m.querySelector(`.deep-toc li[data-sec="${id}"]`).classList.toggle("done", on);
    count();
  }));
  m.querySelectorAll("[data-sec-link]").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    history.replaceState(null, "", a.getAttribute("href"));
    document.getElementById("learn-" + a.dataset.secLink).scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  wireQuizzes(m);
}
function wireQuizzes(root) {
  root.querySelectorAll(".deep-quiz").forEach(q => q.querySelectorAll(".dq-option").forEach(opt => opt.addEventListener("click", () => {
    const answer = +q.dataset.answer, right = +opt.dataset.i === answer;
    q.querySelectorAll(".dq-option").forEach(o => {
      o.disabled = true;
      if (+o.dataset.i === answer) o.classList.add("right");
    });
    if (!right) opt.classList.add("wrong");
    const ex = q.querySelector(".dq-explain");
    ex.hidden = false;
    ex.className = `dq-explain ${right ? "right" : "wrong"}`;
  })));
}

// Filters live in `state` so they survive the re-render that follows marking a card as learned.
function wireFilters(m) {
  const cf = m.querySelector("#conceptFilter");
  if (cf) cf.addEventListener("input", () => { state.conceptQuery = cf.value; applyConceptFilter(m); });
  m.querySelectorAll("[data-show]").forEach(b => b.addEventListener("click", () => {
    state.conceptShow = b.dataset.show;
    m.querySelectorAll("[data-show]").forEach(x => x.classList.toggle("on", x === b));
    applyConceptFilter(m);
  }));
  m.querySelectorAll("[data-diff]").forEach(b => b.addEventListener("click", () => {
    state.qaDiff = b.dataset.diff;
    m.querySelectorAll("[data-diff]").forEach(x => x.classList.toggle("on", x === b));
    applyQaFilter(m);
  }));
  const hr = m.querySelector("#qaHideReviewed");
  if (hr) hr.addEventListener("change", () => { state.qaHideReviewed = hr.checked; applyQaFilter(m); });
  const ex = m.querySelector("#qaExpandAll");
  if (ex) ex.addEventListener("click", () => {
    const items = [...m.querySelectorAll(".qa-item:not([hidden])")];
    const open = !items.every(it => it.classList.contains("open"));
    items.forEach(it => it.classList.toggle("open", open));
    ex.textContent = open ? "Collapse all" : "Expand all";
  });
  applyConceptFilter(m);
  applyQaFilter(m);
}
function applyConceptFilter(m) {
  const empty = m.querySelector("#conceptEmpty");
  if (!empty) return;
  const q = state.conceptQuery.toLowerCase().trim(), show = state.conceptShow;
  let n = 0;
  m.querySelectorAll(".concept-card").forEach(card => {
    const text = (card.querySelector(".concept-term").textContent + " " + card.querySelector(".concept-def").textContent).toLowerCase();
    const learned = card.classList.contains("learned");
    card.hidden = !!(q && !text.includes(q)) || (show !== "all" && (show === "done") !== learned);
    if (!card.hidden) n++;
  });
  empty.hidden = n > 0;
  empty.textContent = q ? `No concepts match "${state.conceptQuery.trim()}".`
    : show === "done" ? "Nothing marked as learned yet. Tick the circle on a card once you can explain it."
    : "Every concept in this chapter is marked as learned.";
}
function applyQaFilter(m) {
  const empty = m.querySelector("#qaEmpty");
  if (!empty) return;
  let n = 0;
  m.querySelectorAll(".qa-item").forEach(it => {
    it.hidden = (state.qaDiff !== "all" && it.dataset.diff !== state.qaDiff) || (state.qaHideReviewed && it.classList.contains("reviewed"));
    if (!it.hidden) n++;
  });
  empty.hidden = n > 0;
}

function updateTabCounts(ch) {
  const prog = getChapterProgress(ch.id);
  const qTab = document.querySelector('.tab[data-tab="interview"] .tab-count');
  if (qTab) qTab.textContent = `${countTrue(prog.qaReviewed)}/${ch.interview.length}`;
}

function renderConcepts(ch) {
  const prog = getChapterProgress(ch.id);
  const hide = state.hideDefs;
  const learned = countTrue(prog.conceptsLearned);
  const showBtn = (id, label) => `<button class="${state.conceptShow === id ? "on" : ""}" data-show="${id}">${label}</button>`;
  return `
    <div class="concepts-toolbar">
      <input type="search" class="tool-filter" id="conceptFilter" placeholder="Filter ${ch.concepts.length} concepts..." aria-label="Filter concepts" autocomplete="off" value="${escapeHtml(state.conceptQuery).replace(/"/g, "&quot;")}">
      <div class="seg" role="group" aria-label="Show">
        ${showBtn("all", "All")}${showBtn("todo", `To learn <span class="seg-count">${ch.concepts.length - learned}</span>`)}${showBtn("done", `Learned <span class="seg-count">${learned}</span>`)}
      </div>
      <button class="iconbtn selftest-toggle ${hide ? "on" : ""}" aria-pressed="${hide}">${hide ? "Show definitions" : "Hide definitions"}</button>
      <span>${hide ? "Recall each definition, then click the card to check." : "Test yourself: hide the definitions and reveal one card at a time."}</span>
    </div>
    <div class="concepts-grid ${hide ? "selftest" : ""}">${ch.concepts.map((c, i) => {
    const on = !!prog.conceptsLearned[i];
    const demo = c.demo && DEMOS[c.demo];
    return `
      <div class="concept-card ${on ? "learned" : ""} ${state.revealed.has(i) ? "revealed" : ""}" data-card="${i}">
        <button class="learn-toggle ${on ? "on" : ""}" data-idx="${i}" title="Mark as learned">${on ? "&#10003;" : ""}</button>
        <div class="concept-term">${c.term}</div>
        <div class="concept-def">${c.def}</div>
        ${c.why ? `<div class="concept-why">${c.why}</div>` : ""}
        ${c.ex ? `<div class="concept-example">${c.ex}</div>` : ""}
        ${demo ? `<button class="concept-demo-link" data-demo-link="${c.demo}">&#9654; See it live: ${demo.title}</button>` : ""}
        <button class="iconbtn reveal-btn">Reveal</button>
      </div>`;
  }).join("")}</div>
    <div class="empty-tab filter-empty" id="conceptEmpty" hidden></div>`;
}

function renderLabsShell(ch) {
  if (!ch.labs.length) return '<div class="empty-tab">No labs for this chapter.</div>';
  return `<div class="labs-intro">${BOOK.labsIntro}</div>` +
    ch.labs.map(id => {
      const d = DEMOS[id];
      if (!d) return "";
      return `<section class="lab-card" id="lab-${id}">
        <div class="lab-head"><span class="lab-tag">Lab</span><h3>${d.title}</h3></div>
        <div class="lab-blurb">${d.blurb}</div>
        <div class="lab-body" data-lab="${id}"></div>
      </section>`;
    }).join("");
}

function mountLabs(ch) {
  document.querySelectorAll(".lab-body[data-lab]").forEach(el => {
    const d = DEMOS[el.dataset.lab];
    if (!d) return;
    const ctx = {
      every(fn, ms) { const h = setInterval(fn, ms); labCleanups.push(() => clearInterval(h)); return h; },
      clear(h) { clearInterval(h); },
      onCleanup(fn) { labCleanups.push(fn); }
    };
    try { d.mount(el, ctx); }
    catch (err) { console.error(err); el.innerHTML = `<div class="lab-note bad">This lab failed to load: ${err.message}</div>`; }
  });
}

function renderCheatsheet(ch) {
  return `<div class="cheatsheet-actions"><a class="iconbtn" href="#/cheatsheet">&#8801; All chapters, printable</a></div>` +
    ch.cheatsheet.map(renderCheatsheetBlock).join("");
}
function renderCheatsheetBlock(cs) {
  let html = `<div class="cheatsheet-block"><h3>${cs.title}</h3>`;
  if (cs.type === "table") {
    html += `<table><thead><tr>${cs.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
    cs.rows.forEach(r => { html += `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`; });
    html += "</tbody></table>";
  } else if (cs.type === "list") {
    html += `<ul>${cs.items.map(it => `<li>${it}</li>`).join("")}</ul>`;
  } else if (cs.type === "code") {
    html += `<pre><code>${escapeHtml(cs.body)}</code></pre>`;
  } else {
    html += `<div>${cs.body}</div>`;
  }
  if (cs.note) html += `<div class="cs-note">${cs.note}</div>`;
  return html + "</div>";
}

const DIFFS = [["easy", "Easy"], ["med", "Medium"], ["hard", "Hard"]];
const diffOf = qa => (qa.diff === "easy" || qa.diff === "hard" ? qa.diff : "med");

function renderInterview(ch) {
  const prog = getChapterProgress(ch.id);
  const counts = {};
  ch.interview.forEach(qa => { counts[diffOf(qa)] = (counts[diffOf(qa)] || 0) + 1; });
  const diffBtn = (id, label, n) => `<button class="${state.qaDiff === id ? "on" : ""}" data-diff="${id}">${label} <span class="seg-count">${n}</span></button>`;
  const toolbar = `
    <div class="concepts-toolbar">
      <div class="seg" role="group" aria-label="Difficulty">
        ${diffBtn("all", "All", ch.interview.length)}${DIFFS.filter(([id]) => counts[id]).map(([id, label]) => diffBtn(id, label, counts[id])).join("")}
      </div>
      <label class="tool-check"><input type="checkbox" id="qaHideReviewed" ${state.qaHideReviewed ? "checked" : ""}> Hide reviewed</label>
      <button class="iconbtn" id="qaExpandAll">Expand all</button>
    </div>
    <p class="tab-tip">Answer out loud first, then open the model answer and compare.</p>`;
  return toolbar + ch.interview.map((qa, i) => {
    const reviewed = !!prog.qaReviewed[i];
    const cls = qa.diff === "easy" ? "diff-easy" : qa.diff === "hard" ? "diff-hard" : "diff-med";
    return `
      <div class="qa-item ${reviewed ? "reviewed" : ""}" data-diff="${diffOf(qa)}">
        <div class="qa-header">
          <span class="diff-badge ${cls}">${qa.diff || "med"}</span>
          <div class="qa-q">${qa.q}</div>
          <span class="qa-chevron">&#9662;</span>
        </div>
        <div class="qa-body">
          <div class="qa-body-inner">${qa.a}</div>
          <div class="qa-footer"><button class="review-btn ${reviewed ? "on" : ""}" data-idx="${i}">${reviewed ? "&#10003; Reviewed" : "Mark reviewed"}</button></div>
        </div>
      </div>`;
  }).join("") + `<div class="empty-tab filter-empty" id="qaEmpty" hidden>No questions left with these filters.</div>`;
}

// ============================================================
// Dashboard
// ============================================================
/** The first unfinished chapter, starting from the one read last and wrapping around; null once all are done. */
function nextUp() {
  const list = DATA.chapters;
  const start = Math.max(0, list.findIndex(c => c.id === state.lastChapter));
  for (let n = 0; n < list.length; n++) {
    const ch = list[(start + n) % list.length];
    const pct = computeChapterPct(ch);
    if (pct < 100) return { ch, pct };
  }
  return null;
}
function renderContinue(next) {
  if (!next) return "";
  const { ch, pct } = next;
  const p = getChapterProgress(ch.id);
  const label = state.lastChapter ? "Continue where you left off" : "Start here";
  return `<div class="continue-card" data-chapter="${ch.id}" role="link" tabindex="0">
    <div class="continue-body">
      <div class="continue-label">${label}</div>
      <div class="continue-title">Chapter ${ch.number}: ${ch.title}</div>
      <div class="continue-meta">${pct}% done &middot; ${countTrue(p.conceptsLearned)}/${ch.concepts.length} concepts &middot; ${countTrue(p.qaReviewed)}/${ch.interview.length} Q&amp;A</div>
    </div>
    <div class="continue-go">&rarr;</div>
  </div>`;
}

function renderDashboard(m) {
  const overall = computeOverallPct();
  const sum = f => DATA.chapters.reduce((s, c) => s + f(c), 0);
  const totalC = sum(c => c.concepts.length), totalQ = sum(c => c.interview.length), totalL = sum(c => c.labs.length);
  const doneC = sum(c => countTrue(getChapterProgress(c.id).conceptsLearned));
  const doneQ = sum(c => countTrue(getChapterProgress(c.id).qaReviewed));
  m.innerHTML = `
    <div class="dash-hero">
      <h1>${DATA.book.title}</h1>
      <p>${DATA.book.subtitle}</p>
    </div>
    <div class="dash-stats">
      <div class="stat-card"><div class="stat-label">Overall progress</div><div class="stat-value">${overall}%</div></div>
      <div class="stat-card"><div class="stat-label">Concepts learned</div><div class="stat-value">${doneC}<span class="small"> / ${totalC}</span></div></div>
      <div class="stat-card"><div class="stat-label">Q&amp;A reviewed</div><div class="stat-value">${doneQ}<span class="small"> / ${totalQ}</span></div></div>
      <div class="stat-card"><div class="stat-label">Interactive labs</div><div class="stat-value">${totalL}</div></div>
    </div>
    ${renderContinue(nextUp())}
    <div class="reference-links">
      <a class="iconbtn" href="#/glossary">A&ndash;Z Glossary of all ${totalC} terms</a>
      <a class="iconbtn" href="#/cheatsheet">&#8801; Every cheatsheet on one printable page</a>
    </div>
    <h2 class="dash-section-title">${BOOK.pillarsTitle}</h2>
    <div class="four-q">${DATA.fourQuestions.map(q => `
      <div class="four-q-card ${q.cls}"><h4><span class="q q-${q.cls}">${q.q}</span></h4>
      <div>${q.text}</div><div class="muted" style="margin-top:6px">${q.answer}</div></div>`).join("")}
    </div>
    <h2 class="dash-section-title">${BOOK.takeawaysTitle}</h2>
    <div class="takeaways"><ol>${DATA.takeaways.map(t => `<li>${t}</li>`).join("")}</ol></div>
    <h2 class="dash-section-title">Chapters</h2>
    <div class="dash-chapters">${DATA.chapters.map(ch => {
      const pct = computeChapterPct(ch);
      return `<div class="dash-chapter-card" data-chapter="${ch.id}">
        <div class="dcc-head"><div class="dcc-num">${ch.number}</div><div class="dcc-title">${ch.title}</div></div>
        <div class="dcc-meta"><span>${ch.concepts.length} concepts &middot; ${ch.labs.length} labs &middot; ${ch.interview.length} Q&amp;A</span><span>${pct}%</span></div>
        <div class="dcc-prog-bar"><div class="dcc-prog-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join("")}</div>
    <div class="chapter-footer" style="margin-top:30px;">
      <div style="color:var(--text-muted);font-size:13px;">
        <strong>How to use:</strong> every chapter opens with a Deep Dive that explains the ideas step by step, with diagrams, real-world examples and quick self-checks. Then come Core Concepts, Interactive Labs, a Cheatsheet and Interview Q&amp;A. To test yourself, hide the definitions on the Concepts tab, or try each interview question before opening its answer.
        Concept cards with a <span style="color:var(--accent-3)">&#9654; See it live</span> button jump straight to the lab that demonstrates them.
        Progress is saved in this browser; use <strong>Export</strong> and <strong>Import</strong> to move it between devices.
        Keys: <kbd>/</kbd> search (<kbd>&uarr;</kbd> <kbd>&darr;</kbd> <kbd>Enter</kbd> to pick a result), <kbd>j</kbd> / <kbd>k</kbd> next / previous chapter.
      </div>
    </div>`;
  m.querySelectorAll("[data-chapter]").forEach(el => el.addEventListener("click", () => navigate(el.dataset.chapter, DEFAULT_TAB)));
  const cont = m.querySelector(".continue-card");
  if (cont) cont.addEventListener("keydown", e => { if (e.key === "Enter") navigate(cont.dataset.chapter, DEFAULT_TAB); });
}

// ============================================================
// Glossary and all cheatsheets
// ============================================================
function shortLabel(termHtml) {
  const t = stripTags(termHtml).trim();
  const abbr = t.match(/\(([A-Za-z][A-Za-z0-9+./-]{1,10})\)\s*$/);
  if (abbr) return abbr[1];
  const head = t.split(":")[0].trim();
  const words = head.split(/[\s/]+/).filter(Boolean);
  while (words.length && /^(a|an|the)$/i.test(words[0])) words.shift();
  if (words.length >= 3 && /^vs\.?$/i.test(words[1])) return words.slice(0, 3).join(" ").slice(0, 40);
  return (words.slice(0, 2).join(" ") || t).slice(0, 40);
}
function oneLine(html, max = 90) {
  const t = stripTags(html).replace(/\s+/g, " ").trim();
  if (t.length <= max) return escapeHtml(t);
  return escapeHtml(t.slice(0, t.lastIndexOf(" ", max - 1)).replace(/[\s,;:.–—-]+$/, "") + "…");
}
function renderGlossary(m) {
  const all = [];
  DATA.chapters.forEach(ch => ch.concepts.forEach((c, i) => {
    const term = stripTags(c.term).trim();
    const label = shortLabel(c.term);
    all.push({ ch, c, i, term, label });
  }));
  all.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) || a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));
  const groups = {};
  all.forEach(x => {
    const L = x.label.charAt(0).toUpperCase();
    (groups[/[A-Z]/.test(L) ? L : "#"] ||= []).push(x);
  });
  const letters = Object.keys(groups).sort();
  const learned = all.filter(x => getChapterProgress(x.ch.id).conceptsLearned[x.i]).length;
  m.innerHTML = `
    <div class="chapter-header">
      <div class="chapter-label">Reference</div>
      <h1>Glossary</h1>
      <div class="overview-text">${all.length} terms · short labels · click for the chapter</div>
      <div class="ref-tools">
        <input type="search" class="tool-filter" id="glFilter" placeholder="Filter…" aria-label="Filter glossary" autocomplete="off">
        <select class="sel" id="glChapter" aria-label="Only show one chapter">
          <option value="">All chapters</option>
          ${DATA.chapters.filter(ch => ch.concepts.length).map(ch => `<option value="${ch.id}">Ch ${ch.number}: ${stripTags(ch.title)}</option>`).join("")}
        </select>
        <span id="glCount">${all.length} · ${learned} learned</span>
      </div>
    </div>
    <nav class="letter-bar" aria-label="Jump to letter">${letters.map(L => `<a href="#gl-${L}" data-letter="${L}">${L}</a>`).join("")}</nav>
    ${letters.map(L => `
      <div class="gl-group" id="gl-${L}">
        <div class="gl-letter">${L}</div>
        ${groups[L].map(x => `
          <div class="gl-item" data-ch="${x.ch.id}" title="${escapeHtml(x.term)}">
            <div class="gl-term"><span>${escapeHtml(x.label)}</span><span class="gl-ch">${x.ch.number}</span>${getChapterProgress(x.ch.id).conceptsLearned[x.i] ? '<span class="gl-done" title="Learned">&#10003;</span>' : ""}</div>
            <div class="gl-def">${oneLine(x.c.def)}</div>
            <span class="gl-full">${escapeHtml(x.term)}</span>
          </div>`).join("")}
      </div>`).join("")}
    <div class="empty-tab filter-empty" id="glEmpty" hidden></div>`;

  const f = m.querySelector("#glFilter"), sel = m.querySelector("#glChapter");
  const apply = () => {
    const q = f.value.toLowerCase().trim();
    let n = 0;
    m.querySelectorAll(".gl-item").forEach(it => {
      it.hidden = !!(q && !it.textContent.toLowerCase().includes(q)) || !!(sel.value && it.dataset.ch !== sel.value);
      if (!it.hidden) n++;
    });
    m.querySelectorAll(".gl-group").forEach(g => {
      g.hidden = !g.querySelector(".gl-item:not([hidden])");
      m.querySelector(`.letter-bar [data-letter="${g.id.slice(3)}"]`).classList.toggle("off", g.hidden);
    });
    m.querySelector("#glCount").textContent = q || sel.value ? `${n} of ${all.length} terms` : `${all.length} terms \u00b7 ${learned} learned`;
    const empty = m.querySelector("#glEmpty");
    empty.hidden = n > 0;
    empty.textContent = `No terms match "${f.value.trim()}"${sel.value ? " in this chapter" : ""}. Try a shorter word, or search everything with /.`;
  };
  f.addEventListener("input", apply);
  sel.addEventListener("change", apply);
  m.querySelectorAll(".letter-bar a").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    document.getElementById("gl-" + a.dataset.letter).scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  m.querySelectorAll(".gl-item").forEach(it => it.addEventListener("click", e => {
    if (e.target.closest("a")) return;
    navigate(it.dataset.ch, "concepts");
  }));
}

function renderAllCheatsheets(m) {
  const list = DATA.chapters.filter(ch => ch.cheatsheet.length);
  m.innerHTML = `
    <div class="chapter-header">
      <div class="chapter-label">Reference</div>
      <h1>Every cheatsheet</h1>
      <div class="overview-text">All ${list.length} chapters' cheatsheets on one page. Printing it (or saving it as a PDF) gives a compact black-on-white version.</div>
      <div class="ref-tools"><button class="iconbtn" id="printBtn">&#9113; Print / save as PDF</button></div>
    </div>
    <nav class="chapter-jump" aria-label="Jump to chapter">${list.map(ch => `<a href="#cs-${ch.id}" data-jump="${ch.id}" title="${stripTags(ch.title)}">Ch ${ch.number}</a>`).join("")}</nav>
    ${list.map(ch => `
      <section class="cs-chapter" id="cs-${ch.id}">
        <h2><span class="chapter-num">${ch.number}</span><span>${ch.title}</span><a href="#/${ch.id}/cheatsheet">Open chapter &rarr;</a></h2>
        ${ch.cheatsheet.map(renderCheatsheetBlock).join("")}
      </section>`).join("") || '<div class="empty-tab">No cheatsheets yet.</div>'}`;
  m.querySelector("#printBtn").addEventListener("click", () => window.print());
  m.querySelectorAll("[data-jump]").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    document.getElementById("cs-" + a.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

// ============================================================
// Search
// ============================================================
const stripTags = s => String(s || "").replace(/<[^>]+>/g, "");
let searchIndex = null;
function buildSearchIndex() {
  const out = [];
  const add = (ch, kind, title, snippet, text, tab, lab) =>
    out.push({ ch, kind, title: stripTags(title), snippet, tab, lab, text: stripTags(title + " " + text).toLowerCase() });
  DATA.chapters.forEach(ch => {
    (DEEP[ch.id] ? DEEP[ch.id].sections : []).forEach(s => {
      const text = DeepRender.sectionText(s);
      add(ch, "Deep dive", s.title, text.slice(s.title.length + 1, s.title.length + 121), text, "learn", s.id);
    });
    ch.concepts.forEach(c => add(ch, "Concept", c.term, stripTags(c.def).slice(0, 120), `${c.def} ${c.why || ""} ${c.ex || ""}`, "concepts"));
    ch.labs.forEach(id => { const d = DEMOS[id]; if (d) add(ch, "Lab", d.title, stripTags(d.blurb).slice(0, 120), d.blurb, "labs", id); });
    ch.interview.forEach(x => add(ch, "Q&A", x.q, stripTags(x.a).slice(0, 120) + "...", x.a, "interview"));
    ch.cheatsheet.forEach(cs => add(ch, "Cheatsheet", cs.title, "", JSON.stringify(cs.rows || cs.items || cs.body || ""), "cheatsheet"));
  });
  return out;
}
/** Every word must match; hits in the title rank first. */
function runSearch(q) {
  const qq = q.toLowerCase().trim();
  if (qq.length < 2) return [];
  searchIndex ||= buildSearchIndex();
  const words = qq.split(/\s+/);
  return searchIndex
    .filter(it => words.every(w => it.text.includes(w)))
    .map(it => {
      const t = it.title.toLowerCase();
      return { it, score: (t.startsWith(qq) ? 3 : 0) + (t.includes(qq) ? 5 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map(x => x.it);
}
function highlight(text, q) {
  const safe = escapeHtml(text);
  const words = q.trim().split(/\s+/).filter(w => w.length > 1).map(w => escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return words.length ? safe.replace(new RegExp(`(${words.join("|")})`, "gi"), "<mark>$1</mark>") : safe;
}
let allDeepRequested = false;
function renderSearch(q) {
  const box = document.getElementById("searchResults");
  if (!allDeepRequested && q.trim().length >= 2) {
    allDeepRequested = true;
    Promise.all(DATA.chapters.map(ch => loadDeep(ch.id))).then(() => {
      searchIndex = null;
      const sb = document.getElementById("searchBox");
      if (document.activeElement === sb && sb.value.trim().length >= 2) renderSearch(sb.value);
    });
  }
  const rs = runSearch(q);
  if (!rs.length) {
    const typed = q.trim().length >= 2;
    box.classList.toggle("open", typed);
    box.innerHTML = typed ? `<div class="sr-empty">No matches for "${escapeHtml(q.trim())}"</div>` : "";
    return;
  }
  box.innerHTML = `<div class="sr-head">${rs.length === 30 ? "Top 30" : rs.length} result${rs.length === 1 ? "" : "s"} &middot; <kbd>&uarr;</kbd> <kbd>&darr;</kbd> to move, <kbd>Enter</kbd> to open</div>` +
    rs.map((r, i) => `
    <div class="sr-item ${i === 0 ? "active" : ""}" data-i="${i}">
      <div class="sr-label">Ch ${r.ch.number} &middot; ${r.kind}</div>
      <div class="sr-title">${highlight(r.title, q)}</div>
      ${r.snippet ? `<div class="sr-snippet">${highlight(r.snippet, q)}</div>` : ""}
    </div>`).join("");
  box.classList.add("open");
  shownResults = rs;
  box.querySelectorAll(".sr-item").forEach(el => el.addEventListener("click", () => openResult(+el.dataset.i)));
}
let shownResults = [];
function openResult(i) {
  const r = shownResults[i];
  if (!r) return;
  const sb = document.getElementById("searchBox");
  sb.value = ""; sb.blur();
  document.getElementById("searchResults").classList.remove("open");
  navigate(r.ch.id, r.tab, r.lab);
}
function moveSearchSelection(delta) {
  const items = [...document.querySelectorAll("#searchResults .sr-item")];
  if (!items.length) return;
  const i = (items.findIndex(el => el.classList.contains("active")) + delta + items.length) % items.length;
  items.forEach((el, j) => el.classList.toggle("active", j === i));
  items[i].scrollIntoView({ block: "nearest" });
}

// ============================================================
// Export / import / theme / reset
// ============================================================
function doExport() {
  const payload = { app: BOOK.appId, version: 1, exportedAt: new Date().toISOString(), progress: state.progress, theme: state.theme };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${BOOK.exportPrefix}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Progress exported. Use Import on your other device.");
}
function doImportPick() { document.getElementById("importFile").click(); }
function doToggleTheme() {
  if (window.SDLooks) {
    window.SDLooks.cycleTheme();
    state.theme = window.SDLooks.themePref;
    saveState();
    return;
  }
  state.theme = state.theme === "light" ? "dark" : "light";
  saveState();
  applyTheme();
}
function doReset() {
  if (confirm("Reset all progress? This cannot be undone.")) { state.progress = {}; saveState(); render(); }
}
function handleImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data || typeof data !== "object" || !data.progress) throw new Error("File doesn't look like a progress export.");
      const merge = confirm("Import progress:\n\nOK = MERGE with current progress\nCancel = REPLACE current progress");
      if (merge) {
        Object.keys(data.progress).forEach(chId => {
          const cur = state.progress[chId] || { conceptsLearned: {}, qaReviewed: {} };
          const inc = data.progress[chId] || {};
          cur.conceptsLearned = Object.assign({}, cur.conceptsLearned, inc.conceptsLearned);
          cur.qaReviewed = Object.assign({}, cur.qaReviewed, inc.qaReviewed);
          cur.sectionsRead = Object.assign({}, cur.sectionsRead, inc.sectionsRead);
          state.progress[chId] = cur;
        });
      } else {
        state.progress = data.progress;
      }
      if (data.theme) { state.theme = data.theme; applyTheme(); }
      saveState(); render();
      showToast("Progress imported.");
    } catch (err) {
      showToast("Import failed: " + err.message, true);
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsText(file);
}

// ============================================================
// Top level
// ============================================================
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function updateProgressPill() {
  const pct = computeOverallPct();
  document.getElementById("overallProgressText").textContent = pct + "%";
  document.getElementById("overallProgressFill").style.width = pct + "%";
}
function render() {
  renderSidebar();
  renderMain();
  updateProgressPill();
}

function init() {
  loadState();
  applyRoute();
  window.addEventListener("hashchange", applyRoute);

  document.getElementById("themeToggle").addEventListener("click", doToggleTheme);
  document.getElementById("resetBtn").addEventListener("click", doReset);
  document.getElementById("exportBtn").addEventListener("click", doExport);
  document.getElementById("importBtn").addEventListener("click", doImportPick);
  document.getElementById("importFile").addEventListener("change", handleImport);
  document.getElementById("menuToggle").addEventListener("click", e => {
    e.stopPropagation();
    sidebarEl().classList.contains("open") ? closeDrawer() : openDrawer();
  });
  document.getElementById("backdrop").addEventListener("click", closeDrawer);
  document.getElementById("moreToggle").addEventListener("click", e => { e.stopPropagation(); document.getElementById("moreMenu").classList.toggle("open"); });
  document.querySelectorAll("#moreMenu [data-action]").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation(); closeMoreMenu();
    ({ export: doExport, import: doImportPick, theme: doToggleTheme, reset: doReset })[b.dataset.action]();
  }));

  const sb = document.getElementById("searchBox");
  sb.addEventListener("input", () => renderSearch(sb.value));
  sb.addEventListener("focus", () => { if (sb.value) renderSearch(sb.value); });
  sb.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); moveSearchSelection(e.key === "ArrowDown" ? 1 : -1); }
    else if (e.key === "Enter") {
      const a = document.querySelector("#searchResults .sr-item.active");
      if (a) { e.preventDefault(); openResult(+a.dataset.i); }
    }
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".search-wrap")) document.getElementById("searchResults").classList.remove("open");
    if (!e.target.closest(".more-wrap")) closeMoreMenu();
  });

  document.addEventListener("keydown", e => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (e.key === "Escape") { e.target.blur(); document.getElementById("searchResults").classList.remove("open"); }
      return;
    }
    if (e.key === "Escape") { closeDrawer(); closeMoreMenu(); }
    if (e.key === "/") { e.preventDefault(); sb.focus(); }
    if ((e.key === "j" || e.key === "k") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = DATA.chapters.findIndex(c => c.id === state.currentChapter);
      const target = i < 0 ? (e.key === "j" ? DATA.chapters[0] : null) : DATA.chapters[i + (e.key === "j" ? 1 : -1)];
      if (target) navigate(target.id, DEFAULT_TAB);
    }
  });
  window.addEventListener("resize", () => { if (!isMobile()) closeDrawer(); });
}

document.addEventListener("DOMContentLoaded", init);
