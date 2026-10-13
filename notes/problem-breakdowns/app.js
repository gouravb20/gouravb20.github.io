// Interactive book notes - app shell (shared by every notes site)
// Depends on DATA (data*.js) and DEMOS (demos*.js); book-specific strings live in DATA.book

const BOOK = Object.assign({
  storageKey: "streaming_systems_notes_v1",
  appId: "streaming-systems-notes",
  exportPrefix: "streaming-systems-progress",
  pillarsTitle: "The four questions (the book's backbone)",
  takeawaysTitle: "Ten takeaways to remember",
  labsIntro: "Each lab is a small simulator built on the book's own example data. Change the knobs and watch how results, watermarks and panes respond. Labs reset when you leave the tab."
}, DATA.book);
const STORAGE_KEY = BOOK.storageKey;
const MOBILE_BREAKPOINT = 768;
const TABS = ["concepts", "labs", "cheatsheet", "interview", "flashcards"];

const state = {
  currentChapter: "dashboard",
  currentTab: "concepts",
  flashIndex: 0,
  flashFlipped: false,
  theme: "dark",
  progress: {}
};

let labCleanups = [];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (saved.progress) state.progress = saved.progress;
    if (saved.theme) state.theme = saved.theme;
  } catch (e) { console.warn("Could not load state", e); }
  applyTheme();
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ progress: state.progress, theme: state.theme }));
  } catch (e) {}
}
function getChapterProgress(chId) {
  if (!state.progress[chId]) state.progress[chId] = { conceptsLearned: {}, qaReviewed: {} };
  return state.progress[chId];
}
function countTrue(obj) { return Object.keys(obj || {}).filter(k => obj[k]).length; }
function applyTheme() {
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
  if (!parts.length) return { chapter: "dashboard", tab: "concepts", lab: null };
  const ch = DATA.chapters.find(c => c.id === parts[0]);
  if (!ch) return { chapter: "dashboard", tab: "concepts", lab: null };
  const tab = TABS.includes(parts[1]) ? parts[1] : "concepts";
  return { chapter: ch.id, tab, lab: parts[2] || null };
}
function navigate(chapter, tab, lab) {
  const hash = chapter === "dashboard" ? "#/" : `#/${chapter}/${tab || "concepts"}${lab ? "/" + lab : ""}`;
  if (location.hash === hash) { applyRoute(); return; }
  location.hash = hash;
}
function applyRoute() {
  const r = parseHash();
  const chapterChanged = r.chapter !== state.currentChapter;
  state.currentChapter = r.chapter;
  state.currentTab = r.tab;
  if (chapterChanged) { state.flashIndex = 0; state.flashFlipped = false; }
  render();
  if (r.lab) {
    const el = document.getElementById("lab-" + r.lab);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    }
  } else if (chapterChanged) {
    window.scrollTo(0, 0);
  }
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
      navigate(el.dataset.chapter, "concepts");
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
  const ch = DATA.chapters.find(c => c.id === state.currentChapter);
  const prog = getChapterProgress(ch.id);
  const doneC = countTrue(prog.conceptsLearned);
  const doneQ = countTrue(prog.qaReviewed);
  const tabBtn = (id, label, count, extra) =>
    `<button class="tab ${extra || ""} ${state.currentTab === id ? "active" : ""}" data-tab="${id}">${label} <span class="tab-count">${count}</span></button>`;

  let body = "";
  if (state.currentTab === "concepts") body = renderConcepts(ch);
  else if (state.currentTab === "labs") body = renderLabsShell(ch);
  else if (state.currentTab === "cheatsheet") body = renderCheatsheet(ch);
  else if (state.currentTab === "interview") body = renderInterview(ch);
  else body = renderFlashcards(ch);

  const idx = DATA.chapters.findIndex(c => c.id === ch.id);
  const prev = DATA.chapters[idx - 1], next = DATA.chapters[idx + 1];
  m.innerHTML = `
    <div class="chapter-header">
      <div class="chapter-label">Chapter ${ch.number} &middot; ${DATA.parts[ch.part]}</div>
      <h1>${ch.title}</h1>
      <div class="overview-text">${ch.overview}</div>
    </div>
    <div class="tabs">
      ${tabBtn("concepts", "Core Concepts", `${doneC}/${ch.concepts.length}`)}
      ${tabBtn("labs", "&#9654; Interactive Labs", ch.labs.length, "labs-tab")}
      ${tabBtn("cheatsheet", "Cheatsheet", ch.cheatsheet.length)}
      ${tabBtn("interview", "Interview Q&amp;A", `${doneQ}/${ch.interview.length}`)}
      ${tabBtn("flashcards", "Flashcards", ch.concepts.length + ch.interview.length)}
    </div>
    <div id="tabBody">${body}</div>
    <div class="chapter-footer">
      ${prev ? `<button class="nav-btn" data-nav="${prev.id}"><div class="nav-btn-label">&larr; Previous</div>Ch ${prev.number}: ${prev.title}</button>` : "<div></div>"}
      ${next ? `<button class="nav-btn right" data-nav="${next.id}"><div class="nav-btn-label">Next &rarr;</div>Ch ${next.number}: ${next.title}</button>` : "<div></div>"}
    </div>`;

  m.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    state.flashIndex = 0; state.flashFlipped = false;
    navigate(ch.id, t.dataset.tab);
  }));
  m.querySelectorAll("[data-nav]").forEach(n => n.addEventListener("click", () => navigate(n.dataset.nav, "concepts")));
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
  }));
  const fc = m.querySelector(".flashcard");
  if (fc) fc.addEventListener("click", () => { state.flashFlipped = !state.flashFlipped; fc.classList.toggle("flipped", state.flashFlipped); });
  m.querySelectorAll("[data-fc-nav]").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation(); moveFlash(ch, b.dataset.fcNav);
  }));

  if (state.currentTab === "labs") mountLabs(ch);
}

function updateTabCounts(ch) {
  const prog = getChapterProgress(ch.id);
  const qTab = document.querySelector('.tab[data-tab="interview"] .tab-count');
  if (qTab) qTab.textContent = `${countTrue(prog.qaReviewed)}/${ch.interview.length}`;
}

function renderConcepts(ch) {
  const prog = getChapterProgress(ch.id);
  return `<div class="concepts-grid">${ch.concepts.map((c, i) => {
    const on = !!prog.conceptsLearned[i];
    const demo = c.demo && DEMOS[c.demo];
    return `
      <div class="concept-card ${on ? "learned" : ""}">
        <button class="learn-toggle ${on ? "on" : ""}" data-idx="${i}" title="Mark as learned">${on ? "&#10003;" : ""}</button>
        <div class="concept-term">${c.term}</div>
        <div class="concept-def">${c.def}</div>
        ${c.why ? `<div class="concept-why">${c.why}</div>` : ""}
        ${c.ex ? `<div class="concept-example">${c.ex}</div>` : ""}
        ${demo ? `<button class="concept-demo-link" data-demo-link="${c.demo}">&#9654; See it live: ${demo.title}</button>` : ""}
      </div>`;
  }).join("")}</div>`;
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
  return ch.cheatsheet.map(cs => {
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
  }).join("");
}

function renderInterview(ch) {
  const prog = getChapterProgress(ch.id);
  return ch.interview.map((qa, i) => {
    const reviewed = !!prog.qaReviewed[i];
    const cls = qa.diff === "easy" ? "diff-easy" : qa.diff === "hard" ? "diff-hard" : "diff-med";
    return `
      <div class="qa-item ${reviewed ? "reviewed" : ""}">
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
  }).join("");
}

function buildFlashDeck(ch) {
  const deck = [];
  ch.concepts.forEach(c => deck.push({
    front: c.term,
    back: c.def + (c.why ? `<br><br><em>Why it matters:</em> ${c.why}` : "") + (c.ex ? `<br><em>Example:</em> ${c.ex}` : ""),
    kind: "Concept"
  }));
  ch.interview.forEach(q => deck.push({ front: q.q, back: q.a, kind: "Question" }));
  return deck;
}
function renderFlashcards(ch) {
  const deck = buildFlashDeck(ch);
  const idx = Math.max(0, Math.min(state.flashIndex, deck.length - 1));
  const card = deck[idx];
  return `
    <div class="fc-stage">
      <div class="flashcard ${state.flashFlipped ? "flipped" : ""}">
        <div class="fc-face fc-front"><div class="fc-label">${card.kind} &middot; tap to flip</div><div class="fc-content">${card.front}</div></div>
        <div class="fc-face fc-back"><div class="fc-label">Answer &middot; tap to flip</div><div class="fc-content">${card.back}</div></div>
      </div>
    </div>
    <div class="fc-nav">
      <button class="iconbtn" data-fc-nav="prev">&larr; Prev</button>
      <span class="fc-counter">${idx + 1} / ${deck.length}</span>
      <button class="iconbtn" data-fc-nav="next">Next &rarr;</button>
      <button class="iconbtn" data-fc-nav="shuffle">&#8644; Shuffle</button>
    </div>
    <div class="cs-note" style="text-align:center;margin-top:16px;">Tip: <kbd>Space</kbd> flips &middot; <kbd>&larr;</kbd> <kbd>&rarr;</kbd> navigate</div>`;
}
function moveFlash(ch, dir) {
  const n = buildFlashDeck(ch).length;
  if (dir === "prev") state.flashIndex = (state.flashIndex - 1 + n) % n;
  else if (dir === "next") state.flashIndex = (state.flashIndex + 1) % n;
  else state.flashIndex = Math.floor(Math.random() * n);
  state.flashFlipped = false;
  renderMain();
}

// ============================================================
// Dashboard
// ============================================================
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
        <strong>How to use:</strong> every chapter has Core Concepts, Interactive Labs, a Cheatsheet, Interview Q&amp;A, and Flashcards.
        Concept cards with a <span style="color:var(--accent-3)">&#9654; See it live</span> button jump straight to the lab that demonstrates them.
        Progress is saved in this browser; use <strong>Export</strong> and <strong>Import</strong> to move it between devices.
      </div>
    </div>`;
  m.querySelectorAll("[data-chapter]").forEach(el => el.addEventListener("click", () => navigate(el.dataset.chapter, "concepts")));
}

// ============================================================
// Search
// ============================================================
const stripTags = s => String(s || "").replace(/<[^>]+>/g, "");
function runSearch(q) {
  const qq = q.toLowerCase().trim();
  if (qq.length < 2) return [];
  const out = [];
  DATA.chapters.forEach(ch => {
    ch.concepts.forEach(c => {
      if ((c.term + " " + c.def + " " + (c.why || "") + " " + (c.ex || "")).toLowerCase().includes(qq))
        out.push({ ch, kind: "Concept", title: c.term, snippet: stripTags(c.def).slice(0, 120), tab: "concepts" });
    });
    ch.labs.forEach(id => {
      const d = DEMOS[id];
      if (d && (d.title + " " + d.blurb).toLowerCase().includes(qq))
        out.push({ ch, kind: "Lab", title: d.title, snippet: stripTags(d.blurb).slice(0, 120), tab: "labs", lab: id });
    });
    ch.interview.forEach(x => {
      if ((x.q + " " + x.a).toLowerCase().includes(qq))
        out.push({ ch, kind: "Q&A", title: x.q, snippet: stripTags(x.a).slice(0, 120) + "...", tab: "interview" });
    });
    ch.cheatsheet.forEach(cs => {
      if (cs.title.toLowerCase().includes(qq)) out.push({ ch, kind: "Cheatsheet", title: cs.title, snippet: "", tab: "cheatsheet" });
    });
  });
  return out.slice(0, 30);
}
function renderSearch(q) {
  const box = document.getElementById("searchResults");
  const rs = runSearch(q);
  if (!rs.length) { box.classList.remove("open"); box.innerHTML = ""; return; }
  box.innerHTML = rs.map((r, i) => `
    <div class="sr-item" data-i="${i}">
      <div class="sr-label">Ch ${r.ch.number} &middot; ${r.kind}</div>
      <div class="sr-title">${r.title}</div>
      ${r.snippet ? `<div class="sr-snippet">${r.snippet}</div>` : ""}
    </div>`).join("");
  box.classList.add("open");
  box.querySelectorAll(".sr-item").forEach(el => el.addEventListener("click", () => {
    const r = rs[+el.dataset.i];
    document.getElementById("searchBox").value = "";
    box.classList.remove("open");
    navigate(r.ch.id, r.tab, r.lab);
  }));
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
function doToggleTheme() { state.theme = state.theme === "light" ? "dark" : "light"; saveState(); applyTheme(); }
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
    if (state.currentTab === "flashcards" && state.currentChapter !== "dashboard") {
      const ch = DATA.chapters.find(c => c.id === state.currentChapter);
      if (e.key === " ") {
        e.preventDefault();
        state.flashFlipped = !state.flashFlipped;
        const fc = document.querySelector(".flashcard");
        if (fc) fc.classList.toggle("flipped", state.flashFlipped);
      }
      if (e.key === "ArrowRight") moveFlash(ch, "next");
      if (e.key === "ArrowLeft") moveFlash(ch, "prev");
    }
  });
  window.addEventListener("resize", () => { if (!isMobile()) closeDrawer(); });
}

document.addEventListener("DOMContentLoaded", init);
