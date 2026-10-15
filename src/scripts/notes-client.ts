// Browser side of the Astro-rendered notes pages. The HTML already holds all content; this adds progress
// tracking, tabs, labs, flashcards, search, theme and import/export on top of it.
// Progress is stored exactly as the single-page app (public/shared/app.js) stores it, under DATA.book.storageKey.

import type { SearchItem } from "../lib/site";

type ChapterProgress = { conceptsLearned: Record<string, boolean>; qaReviewed: Record<string, boolean> };
type Saved = { progress: Record<string, ChapterProgress>; theme: "dark" | "light" };
interface LabContext { every(fn: () => void, ms: number): number; clear(h: number): void; onCleanup(fn: () => void): void }
interface Lab { title: string; blurb: string; mount(el: HTMLElement, ctx: LabContext): void }
declare global { interface Window { DEMOS?: Record<string, Lab> } }

const TABS = ["concepts", "labs", "cheatsheet", "interview", "flashcards"] as const;
type Tab = (typeof TABS)[number];
const isTab = (s: string): s is Tab => (TABS as readonly string[]).includes(s);

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const cfg = document.body.dataset;
const STORAGE_KEY = cfg.storageKey!;
const chapterId = cfg.chapter || null;

// ------------------------------------------------------------------ state

const state: Saved = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { progress: s.progress || {}, theme: s.theme === "light" ? "light" : "dark" };
  } catch {
    return { progress: {}, theme: "dark" };
  }
})();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
}
const chapterProgress = (id: string) => (state.progress[id] ??= { conceptsLearned: {}, qaReviewed: {} });
const countTrue = (o?: Record<string, boolean>) => Object.values(o || {}).filter(Boolean).length;
const pct = (done: number, total: number) => (total ? Math.min(100, Math.round((done / total) * 100)) : 0);

// ------------------------------------------------------------------ progress display

function ringHtml(p: number) {
  if (p === 100) return '<div class="check">&#10003;</div>';
  const r = 8, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 20 20"><circle class="bg" cx="10" cy="10" r="${r}"/><circle class="fg" cx="10" cy="10" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c - (p / 100) * c}"/></svg>`;
}

function refreshProgress() {
  let done = 0, total = 0, concepts = 0, qa = 0;
  for (const item of $$("a.chapter-item[data-chapter]")) {
    const id = item.dataset.chapter!, t = Number(item.dataset.total);
    const p = state.progress[id];
    const d = p ? countTrue(p.conceptsLearned) + countTrue(p.qaReviewed) : 0;
    done += d; total += t;
    concepts += p ? countTrue(p.conceptsLearned) : 0;
    qa += p ? countTrue(p.qaReviewed) : 0;
    const ring = $(".chapter-ring", item)!;
    const cp = pct(d, t);
    ring.classList.toggle("done", cp === 100);
    ring.innerHTML = ringHtml(cp);
    const card = $(`[data-chapter-card="${id}"]`);
    if (card) {
      $(".dcc-pct", card)!.textContent = `${cp}%`;
      $(".dcc-prog-fill", card)!.style.width = `${cp}%`;
    }
  }
  const overall = pct(done, total);
  byId("overallProgressText").textContent = `${overall}%`;
  byId("overallProgressFill").style.width = `${overall}%`;
  const stat = (id: string, v: string | number) => { const el = byId(id); if (el) el.textContent = String(v); };
  stat("statOverall", `${overall}%`);
  stat("statConcepts", concepts);
  stat("statQa", qa);

  if (chapterId) {
    const p = state.progress[chapterId];
    const c = $('[data-tab-count="concepts"]'), q = $('[data-tab-count="interview"]');
    if (c) c.textContent = `${countTrue(p?.conceptsLearned)}/${$$(".learn-toggle").length}`;
    if (q) q.textContent = `${countTrue(p?.qaReviewed)}/${$$(".review-btn").length}`;
  }
}

// ------------------------------------------------------------------ chapter: concepts and Q&A

function setLearned(btn: HTMLElement, on: boolean) {
  btn.classList.toggle("on", on);
  btn.innerHTML = on ? "&#10003;" : "";
  btn.setAttribute("aria-pressed", String(on));
  btn.closest(".concept-card")?.classList.toggle("learned", on);
}
function setReviewed(btn: HTMLElement, on: boolean) {
  btn.classList.toggle("on", on);
  btn.textContent = on ? "\u2713 Reviewed" : "Mark reviewed";
  btn.closest(".qa-item")?.classList.toggle("reviewed", on);
}

function initChapter(id: string) {
  const p = state.progress[id];
  for (const b of $$(".learn-toggle")) setLearned(b, !!p?.conceptsLearned[b.dataset.idx!]);
  for (const b of $$(".review-btn")) setReviewed(b, !!p?.qaReviewed[b.dataset.idx!]);

  document.addEventListener("click", e => {
    const t = e.target as HTMLElement;
    const learn = t.closest<HTMLElement>(".learn-toggle");
    if (learn) {
      const cp = chapterProgress(id), k = learn.dataset.idx!;
      cp.conceptsLearned[k] = !cp.conceptsLearned[k];
      setLearned(learn, cp.conceptsLearned[k]);
      save(); refreshProgress();
      return;
    }
    const review = t.closest<HTMLElement>(".review-btn");
    if (review) {
      const cp = chapterProgress(id), k = review.dataset.idx!;
      cp.qaReviewed[k] = !cp.qaReviewed[k];
      setReviewed(review, cp.qaReviewed[k]);
      save(); refreshProgress();
      return;
    }
    const header = t.closest<HTMLElement>(".qa-header");
    if (header) toggleQa(header);
  });
  document.addEventListener("keydown", e => {
    const header = (e.target as HTMLElement).closest?.<HTMLElement>(".qa-header");
    if (header && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleQa(header); }
  });
}
function toggleQa(header: HTMLElement) {
  const open = header.parentElement!.classList.toggle("open");
  header.setAttribute("aria-expanded", String(open));
}

// ------------------------------------------------------------------ chapter: tabs and labs

let currentTab: Tab | null = null;
let labCleanups: (() => void)[] = [];

function mountLabs() {
  for (const el of $$(".lab-body[data-lab]")) {
    const lab = window.DEMOS?.[el.dataset.lab!];
    el.innerHTML = "";
    if (!lab) { el.innerHTML = '<div class="lab-note bad">This lab failed to load.</div>'; continue; }
    const ctx: LabContext = {
      every(fn, ms) { const h = window.setInterval(fn, ms); labCleanups.push(() => clearInterval(h)); return h; },
      clear(h) { clearInterval(h); },
      onCleanup(fn) { labCleanups.push(fn); },
    };
    try { lab.mount(el, ctx); }
    catch (err) { console.error(err); el.innerHTML = `<div class="lab-note bad">This lab failed to load: ${err instanceof Error ? err.message : err}</div>`; }
  }
}
function unmountLabs() {
  for (const fn of labCleanups) { try { fn(); } catch { /* lab already gone */ } }
  labCleanups = [];
  for (const el of $$(".lab-body[data-lab]")) el.innerHTML = "";
}

function showTab(tab: Tab, labId?: string) {
  if (tab !== currentTab) {
    if (currentTab === "labs") unmountLabs();
    for (const p of $$("[data-panel]")) p.hidden = p.dataset.panel !== tab;
    for (const t of $$(".tabs .tab")) t.classList.toggle("active", t.dataset.tab === tab);
    currentTab = tab;
    if (tab === "labs") mountLabs();
    if (tab === "flashcards") { flash.index = 0; flash.flipped = false; renderFlashcards(); }
  }
  if (labId) {
    const el = document.getElementById(`lab-${labId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    }
  }
}
function showFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith("lab-")) showTab("labs", h.slice(4));
  else showTab(isTab(h) ? h : "concepts");
}

function initTabs() {
  for (const t of $$(".tabs .tab")) {
    t.addEventListener("click", e => {
      e.preventDefault();
      history.pushState(null, "", `#${t.dataset.tab}`);
      showFromHash();
    });
  }
  window.addEventListener("hashchange", showFromHash);
  window.addEventListener("popstate", showFromHash);
  showFromHash();
}

// ------------------------------------------------------------------ chapter: flashcards

const flash = { index: 0, flipped: false, deck: [] as { front: string; back: string; kind: string }[] };

function buildDeck() {
  const deck: typeof flash.deck = [];
  for (const c of $$(".concept-card")) {
    const html = (sel: string) => $(sel, c)?.innerHTML;
    const why = html(".concept-why"), ex = html(".concept-example");
    deck.push({
      front: html(".concept-term") ?? "",
      back: (html(".concept-def") ?? "") + (why ? `<br><br><em>Why it matters:</em> ${why}` : "") + (ex ? `<br><em>Example:</em> ${ex}` : ""),
      kind: "Concept",
    });
  }
  for (const q of $$(".qa-item")) deck.push({ front: $(".qa-q", q)!.innerHTML, back: $(".qa-body-inner", q)!.innerHTML, kind: "Question" });
  return deck;
}

function renderFlashcards() {
  const panel = byId("flashcards");
  if (!flash.deck.length) flash.deck = buildDeck();
  if (!flash.deck.length) { panel.innerHTML = '<div class="empty-tab">No cards for this chapter.</div>'; return; }
  const n = flash.deck.length;
  flash.index = Math.max(0, Math.min(flash.index, n - 1));
  const card = flash.deck[flash.index];
  panel.innerHTML = `
    <div class="fc-stage">
      <div class="flashcard ${flash.flipped ? "flipped" : ""}">
        <div class="fc-face fc-front"><div class="fc-label">${card.kind} &middot; tap to flip</div><div class="fc-content">${card.front}</div></div>
        <div class="fc-face fc-back"><div class="fc-label">Answer &middot; tap to flip</div><div class="fc-content">${card.back}</div></div>
      </div>
    </div>
    <div class="fc-nav">
      <button class="iconbtn" data-fc-nav="prev">&larr; Prev</button>
      <span class="fc-counter">${flash.index + 1} / ${n}</span>
      <button class="iconbtn" data-fc-nav="next">Next &rarr;</button>
      <button class="iconbtn" data-fc-nav="shuffle">&#8644; Shuffle</button>
    </div>
    <div class="cs-note" style="text-align:center;margin-top:16px;">Tip: <kbd>Space</kbd> flips &middot; <kbd>&larr;</kbd> <kbd>&rarr;</kbd> navigate</div>`;
}
function flipCard() {
  flash.flipped = !flash.flipped;
  $(".flashcard")?.classList.toggle("flipped", flash.flipped);
}
function moveCard(dir: string) {
  const n = flash.deck.length;
  if (!n) return;
  if (dir === "prev") flash.index = (flash.index - 1 + n) % n;
  else if (dir === "next") flash.index = (flash.index + 1) % n;
  else flash.index = Math.floor(Math.random() * n);
  flash.flipped = false;
  renderFlashcards();
}
function initFlashcards() {
  byId("flashcards").addEventListener("click", e => {
    const t = e.target as HTMLElement;
    const nav = t.closest<HTMLElement>("[data-fc-nav]");
    if (nav) { e.stopPropagation(); moveCard(nav.dataset.fcNav!); }
    else if (t.closest(".flashcard")) flipCard();
  });
}

// ------------------------------------------------------------------ search

let index: Promise<SearchItem[]> | null = null;
const loadIndex = () => (index ??= fetch(cfg.searchUrl!).then(r => r.json() as Promise<SearchItem[]>).catch(() => { index = null; return []; }));

async function runSearch(q: string) {
  const box = byId("searchResults");
  const qq = q.toLowerCase().trim();
  if (qq.length < 2) { box.classList.remove("open"); box.innerHTML = ""; return; }
  const results = (await loadIndex()).filter(it => it.text.includes(qq)).slice(0, 30);
  if (byId<HTMLInputElement>("searchBox").value.toLowerCase().trim() !== qq) return;
  if (!results.length) { box.classList.remove("open"); box.innerHTML = ""; return; }
  box.innerHTML = results.map(r => `
    <a class="sr-item" href="${r.href}">
      <div class="sr-label">Ch ${r.n} &middot; ${r.kind}</div>
      <div class="sr-title">${r.title}</div>
      ${r.snippet ? `<div class="sr-snippet">${r.snippet.replace(/</g, "&lt;")}</div>` : ""}
    </a>`).join("");
  box.classList.add("open");
}

// ------------------------------------------------------------------ theme, export / import / reset, toast

function applyTheme() {
  document.body.classList.toggle("light", state.theme === "light");
  byId("themeToggle").textContent = state.theme === "light" ? "Dark" : "Light";
}
const toggleTheme = () => { state.theme = state.theme === "light" ? "dark" : "light"; save(); applyTheme(); };

let toastTimer: number | undefined;
function showToast(msg: string, isError = false) {
  const t = byId("toast");
  t.textContent = msg;
  t.style.borderColor = isError ? "var(--bad)" : "var(--accent)";
  t.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.style.opacity = "0"; }, 4500);
}

function doExport() {
  const payload = { app: cfg.appId, version: 1, exportedAt: new Date().toISOString(), progress: state.progress, theme: state.theme };
  const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href, download: `${cfg.exportPrefix}-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(href);
  showToast("Progress exported. Use Import on your other device.");
}
const pickImport = () => byId("importFile").click();
function doReset() {
  if (!confirm("Reset all progress? This cannot be undone.")) return;
  state.progress = {}; save(); location.reload();
}
function handleImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  file.text().then(text => {
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || !data.progress) throw new Error("File doesn't look like a progress export.");
      if (confirm("Import progress:\n\nOK = MERGE with current progress\nCancel = REPLACE current progress")) {
        for (const [id, inc] of Object.entries<Partial<ChapterProgress>>(data.progress)) {
          const cur = state.progress[id] || { conceptsLearned: {}, qaReviewed: {} };
          cur.conceptsLearned = { ...cur.conceptsLearned, ...inc?.conceptsLearned };
          cur.qaReviewed = { ...cur.qaReviewed, ...inc?.qaReviewed };
          state.progress[id] = cur;
        }
      } else {
        state.progress = data.progress;
      }
      if (data.theme === "light" || data.theme === "dark") state.theme = data.theme;
      save();
      location.reload();
    } catch (err) {
      showToast(`Import failed: ${err instanceof Error ? err.message : err}`, true);
    } finally {
      input.value = "";
    }
  });
}

// ------------------------------------------------------------------ chrome: drawer, menus, keys

const sidebar = byId("sidebar"), backdrop = byId("backdrop"), moreMenu = byId("moreMenu");
const isMobile = () => window.innerWidth <= 768;
const openDrawer = () => { sidebar.classList.add("open"); backdrop.classList.add("open"); };
const closeDrawer = () => { sidebar.classList.remove("open"); backdrop.classList.remove("open"); };
const closeMoreMenu = () => moreMenu.classList.remove("open");

function initChrome() {
  byId("themeToggle").addEventListener("click", toggleTheme);
  byId("resetBtn").addEventListener("click", doReset);
  byId("exportBtn").addEventListener("click", doExport);
  byId("importBtn").addEventListener("click", pickImport);
  byId("importFile").addEventListener("change", handleImport);
  byId("menuToggle").addEventListener("click", e => { e.stopPropagation(); sidebar.classList.contains("open") ? closeDrawer() : openDrawer(); });
  backdrop.addEventListener("click", closeDrawer);
  byId("moreToggle").addEventListener("click", e => { e.stopPropagation(); moreMenu.classList.toggle("open"); });
  const actions: Record<string, () => void> = { export: doExport, import: pickImport, theme: toggleTheme, reset: doReset };
  for (const b of $$("#moreMenu [data-action]")) b.addEventListener("click", e => { e.stopPropagation(); closeMoreMenu(); actions[b.dataset.action!]?.(); });

  const box = byId<HTMLInputElement>("searchBox"), results = byId("searchResults");
  box.addEventListener("input", () => runSearch(box.value));
  box.addEventListener("focus", () => { loadIndex(); if (box.value) runSearch(box.value); });
  results.addEventListener("click", e => {
    if (!(e.target as HTMLElement).closest(".sr-item")) return;
    box.value = ""; results.classList.remove("open");
    if (isMobile()) closeDrawer();
  });
  document.addEventListener("click", e => {
    const t = e.target as HTMLElement;
    if (!t.closest(".search-wrap")) results.classList.remove("open");
    if (!t.closest(".more-wrap")) closeMoreMenu();
  });

  document.addEventListener("keydown", e => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (e.key === "Escape") { (e.target as HTMLElement).blur(); results.classList.remove("open"); }
      return;
    }
    if (e.key === "Escape") { closeDrawer(); closeMoreMenu(); }
    if (e.key === "/") { e.preventDefault(); box.focus(); }
    if (currentTab === "flashcards") {
      if (e.key === " ") { e.preventDefault(); flipCard(); }
      if (e.key === "ArrowRight") moveCard("next");
      if (e.key === "ArrowLeft") moveCard("prev");
    }
  });
  window.addEventListener("resize", () => { if (!isMobile()) closeDrawer(); });
}

// ------------------------------------------------------------------ start

applyTheme();
initChrome();
if (chapterId) {
  initChapter(chapterId);
  initFlashcards();
  initTabs();
}
refreshProgress();
