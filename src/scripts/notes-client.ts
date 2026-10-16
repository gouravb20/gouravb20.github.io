// Browser side of the Astro-rendered notes pages. The HTML already holds all content; this adds progress
// tracking, tabs, labs, the definitions self-test, search, theme and import/export on top of it.
// Progress is stored exactly as the single-page app (public/shared/app.js) stores it, under DATA.book.storageKey.

import type { SearchItem } from "../lib/site";

type ChapterProgress = { conceptsLearned: Record<string, boolean>; qaReviewed: Record<string, boolean>; sectionsRead?: Record<string, boolean> };
type Saved = { progress: Record<string, ChapterProgress>; theme: "dark" | "light" | "auto"; hideDefs: boolean; lastChapter?: string };
interface LabContext { every(fn: () => void, ms: number): number; clear(h: number): void; onCleanup(fn: () => void): void }
interface Lab { title: string; blurb: string; mount(el: HTMLElement, ctx: LabContext): void }
interface SDLooksApi {
  THEME_KEY: string;
  themePref: string;
  resolvedTheme(): "dark" | "light";
  applyTheme(pref?: string): void;
  cycleTheme(): void;
  ensureControls(): void;
  boot(): void;
}
declare global { interface Window { DEMOS?: Record<string, Lab>; SDLooks?: SDLooksApi } }

const TABS = ["concepts", "learn", "labs", "interview", "cheatsheet"] as const;
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
    const theme = s.theme === "light" || s.theme === "auto" ? s.theme : "dark";
    if (window.SDLooks && s.theme && !localStorage.getItem(window.SDLooks.THEME_KEY)) {
      window.SDLooks.applyTheme(theme === "auto" ? "auto" : theme);
    }
    return { progress: s.progress || {}, theme, hideDefs: !!s.hideDefs, lastChapter: typeof s.lastChapter === "string" ? s.lastChapter : undefined };
  } catch {
    return { progress: {}, theme: "dark", hideDefs: false };
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
    const learned = countTrue(p?.conceptsLearned), concepts = $$(".learn-toggle").length;
    const c = $('[data-tab-count="concepts"]'), q = $('[data-tab-count="interview"]');
    if (c) c.textContent = `${learned}/${concepts}`;
    if (q) q.textContent = `${countTrue(p?.qaReviewed)}/${$$(".review-btn").length}`;
    const todo = $('[data-show-count="todo"]'), done = $('[data-show-count="done"]');
    if (todo) todo.textContent = String(concepts - learned);
    if (done) done.textContent = String(learned);
  }
}

// ------------------------------------------------------------------ dashboard: continue where you left off

function initContinue() {
  const card = byId<HTMLAnchorElement>("continueCard");
  if (!card) return;
  const cards = $$<HTMLAnchorElement>("[data-chapter-card]");
  const start = Math.max(0, cards.findIndex(c => c.dataset.chapterCard === state.lastChapter));
  for (let n = 0; n < cards.length; n++) {
    const c = cards[(start + n) % cards.length], d = c.dataset;
    const p = state.progress[d.chapterCard!];
    const cp = pct(p ? countTrue(p.conceptsLearned) + countTrue(p.qaReviewed) : 0, Number(d.total));
    if (cp === 100) continue;
    card.href = c.href;
    $(".continue-label", card)!.textContent = state.lastChapter ? "Continue where you left off" : "Start here";
    $(".continue-title", card)!.textContent = `Chapter ${d.number}: ${d.title}`;
    $(".continue-meta", card)!.textContent =
      `${cp}% done \u00b7 ${countTrue(p?.conceptsLearned)}/${d.concepts} concepts \u00b7 ${countTrue(p?.qaReviewed)}/${d.qa} Q&A`;
    card.hidden = false;
    return;
  }
}

// ------------------------------------------------------------------ chapter: deep dive

function initLearn(id: string) {
  const panel = $('[data-panel="learn"]');
  if (!panel) return;
  const sections = $$(".deep-section", panel);
  const read = () => (chapterProgress(id).sectionsRead ??= {});
  const setDone = (sec: string, on: boolean) => {
    const btn = $(`.section-done[data-sec="${sec}"]`, panel)!;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.innerHTML = on ? "&#10003; Understood" : "Mark as understood";
    btn.closest(".deep-section")?.classList.toggle("done", on);
    $(`.deep-toc li[data-sec="${sec}"]`, panel)?.classList.toggle("done", on);
  };
  const count = () => {
    const done = sections.filter(s => read()[s.dataset.sec!]).length;
    $(".deep-toc-count", panel)!.textContent = `\u00b7 ${done} of ${sections.length} understood`;
    const tab = $('[data-tab-count="learn"]');
    if (tab) tab.textContent = `${done}/${sections.length}`;
  };
  for (const s of sections) setDone(s.dataset.sec!, !!read()[s.dataset.sec!]);
  count();

  panel.addEventListener("click", e => {
    const t = e.target as HTMLElement;
    const done = t.closest<HTMLElement>(".section-done");
    if (done) {
      const sec = done.dataset.sec!, on = !read()[sec];
      read()[sec] = on;
      setDone(sec, on);
      save(); count();
      return;
    }
    const option = t.closest<HTMLButtonElement>(".dq-option");
    const quiz = option?.closest<HTMLElement>(".deep-quiz");
    if (!option || !quiz || option.disabled) return;
    const answer = Number(quiz.dataset.answer), right = Number(option.dataset.i) === answer;
    for (const o of $$<HTMLButtonElement>(".dq-option", quiz)) {
      o.disabled = true;
      if (Number(o.dataset.i) === answer) o.classList.add("right");
    }
    if (!right) option.classList.add("wrong");
    const ex = $(".dq-explain", quiz)!;
    ex.hidden = false;
    ex.className = `dq-explain ${right ? "right" : "wrong"}`;
  });
}

// ------------------------------------------------------------------ chapter: concept and Q&A filters

function initFilters() {
  let query = "", show = "all", diff = "all", hideReviewed = false;
  const conceptEmpty = byId("conceptEmpty"), qaEmpty = byId("qaEmpty");
  const applyConcepts = () => {
    if (!conceptEmpty) return;
    const q = query.toLowerCase().trim();
    let n = 0;
    for (const card of $$(".concept-card")) {
      const text = `${$(".concept-term", card)!.textContent} ${$(".concept-def", card)!.textContent}`.toLowerCase();
      const learned = card.classList.contains("learned");
      card.hidden = (!!q && !text.includes(q)) || (show !== "all" && (show === "done") !== learned);
      if (!card.hidden) n++;
    }
    conceptEmpty.hidden = n > 0;
    conceptEmpty.textContent = q ? `No concepts match "${query.trim()}".`
      : show === "done" ? "Nothing marked as learned yet. Tick the circle on a card once you can explain it."
      : "Every concept in this chapter is marked as learned.";
  };
  const applyQa = () => {
    if (!qaEmpty) return;
    let n = 0;
    for (const it of $$(".qa-item")) {
      it.hidden = (diff !== "all" && it.dataset.diff !== diff) || (hideReviewed && it.classList.contains("reviewed"));
      if (!it.hidden) n++;
    }
    qaEmpty.hidden = n > 0;
  };
  const segment = (attr: string, set: (v: string) => void, apply: () => void) => {
    const buttons = $$(`[data-${attr}]`);
    for (const b of buttons) b.addEventListener("click", () => {
      set(b.getAttribute(`data-${attr}`)!);
      for (const x of buttons) x.classList.toggle("on", x === b);
      apply();
    });
  };

  const filter = byId<HTMLInputElement>("conceptFilter");
  filter?.addEventListener("input", () => { query = filter.value; applyConcepts(); });
  segment("show", v => { show = v; }, applyConcepts);
  segment("diff", v => { diff = v; }, applyQa);
  const hide = byId<HTMLInputElement>("qaHideReviewed");
  hide?.addEventListener("change", () => { hideReviewed = hide.checked; applyQa(); });
  const expand = byId("qaExpandAll");
  expand?.addEventListener("click", () => {
    const items = $$(".qa-item:not([hidden])");
    const open = !items.every(it => it.classList.contains("open"));
    for (const it of items) {
      it.classList.toggle("open", open);
      $(".qa-header", it)?.setAttribute("aria-expanded", String(open));
    }
    expand.textContent = open ? "Collapse all" : "Expand all";
  });
  // Marking a card changes which filter it falls under.
  document.addEventListener("click", e => {
    if ((e.target as HTMLElement).closest(".learn-toggle")) applyConcepts();
    if ((e.target as HTMLElement).closest(".review-btn")) applyQa();
  });
  const qaBar = $(".qa-toolbar");
  if (qaBar) qaBar.hidden = false;
}

// ------------------------------------------------------------------ glossary and the all-chapters cheatsheet

function initGlossary() {
  const filter = byId<HTMLInputElement>("glFilter"), chapter = byId<HTMLSelectElement>("glChapter"), count = byId("glCount");
  if (!filter || !chapter || !count) return;
  const items = $$<HTMLAnchorElement>(".gl-item");
  let learned = 0;
  for (const it of items) {
    if (!state.progress[it.dataset.ch!]?.conceptsLearned[it.dataset.idx!]) continue;
    learned++;
    $(".gl-term", it)!.insertAdjacentHTML("beforeend", '<span class="gl-done" title="Learned">&#10003;</span>');
  }
  const total = items.length;
  const apply = () => {
    const q = filter.value.toLowerCase().trim();
    let n = 0;
    for (const it of items) {
      it.hidden = (!!q && !it.textContent!.toLowerCase().includes(q)) || (!!chapter.value && it.dataset.ch !== chapter.value);
      if (!it.hidden) n++;
    }
    for (const g of $$(".gl-group")) {
      g.hidden = !$(".gl-item:not([hidden])", g);
      $(`.letter-bar [data-letter="${g.id.slice(3)}"]`)?.classList.toggle("off", g.hidden);
    }
    count.textContent = q || chapter.value ? `${n} of ${total} terms` : `${total} terms \u00b7 ${learned} learned`;
    const empty = byId("glEmpty");
    empty.hidden = n > 0;
    empty.textContent = `No terms match "${filter.value.trim()}"${chapter.value ? " in this chapter" : ""}. Try a shorter word, or search everything with /.`;
  };
  filter.addEventListener("input", apply);
  chapter.addEventListener("change", apply);
  $(".ref-tools")!.hidden = false;
  apply();
}

function initPrint() {
  const btn = byId("printBtn");
  if (!btn) return;
  btn.addEventListener("click", () => window.print());
  btn.parentElement!.hidden = false;
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

/** Labs live on the labs tab and inside deep dive sections; only the visible panel's labs run. */
function mountLabs(panel: HTMLElement) {
  for (const el of $$(".lab-body[data-lab]", panel)) {
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

/** `target` is the id of an element to scroll to: a lab card or a deep dive section. */
function showTab(tab: Tab, target?: string) {
  if (tab !== currentTab) {
    unmountLabs();
    for (const p of $$("[data-panel]")) p.hidden = p.dataset.panel !== tab;
    for (const t of $$(".tabs .tab")) t.classList.toggle("active", t.dataset.tab === tab);
    currentTab = tab;
    const panel = $(`[data-panel="${tab}"]`);
    if (panel && (tab === "labs" || tab === "learn")) mountLabs(panel);
  }
  const el = target && document.getElementById(target);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
}
function showFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  const first = ($(".tabs")?.dataset.firstTab ?? "concepts") as Tab;
  if (h.startsWith("lab-")) showTab("labs", h);
  else if (h.startsWith("learn-") && $('[data-panel="learn"]')) showTab("learn", h);
  else showTab(isTab(h) && $(`[data-panel="${h}"]`) ? h : first);
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

// ------------------------------------------------------------------ chapter: definitions self-test

function initSelfTest() {
  const bar = $(".concepts-toolbar"), toggle = $(".selftest-toggle"), hint = $(".selftest-hint"), grid = $(".concepts-grid");
  if (!bar || !toggle || !hint || !grid) return;
  const apply = () => {
    const on = state.hideDefs;
    grid.classList.toggle("selftest", on);
    toggle.classList.toggle("on", on);
    toggle.setAttribute("aria-pressed", String(on));
    toggle.textContent = on ? "Show definitions" : "Hide definitions";
    hint.textContent = on ? "Recall each definition, then click the card to check." : "Test yourself: hide the definitions and reveal one card at a time.";
    for (const card of $$(".concept-card.revealed")) card.classList.remove("revealed");
  };
  toggle.addEventListener("click", () => { state.hideDefs = !state.hideDefs; save(); apply(); });
  grid.addEventListener("click", e => {
    const t = e.target as HTMLElement;
    if (!state.hideDefs || t.closest(".learn-toggle, .concept-demo-link")) return;
    t.closest(".concept-card")?.classList.add("revealed");
  });
  bar.hidden = false;
  apply();
}

// ------------------------------------------------------------------ search

let index: Promise<SearchItem[]> | null = null;
const loadIndex = () => (index ??= fetch(cfg.searchUrl!).then(r => r.json() as Promise<SearchItem[]>).catch(() => { index = null; return []; }));

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function highlight(text: string, words: string[]) {
  const safe = escapeHtml(text);
  const pattern = words.filter(w => w.length > 1).map(w => escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return pattern ? safe.replace(new RegExp(`(${pattern})`, "gi"), "<mark>$1</mark>") : safe;
}

/** Every word must match; hits in the title rank first. */
async function runSearch(q: string) {
  const box = byId("searchResults");
  const qq = q.toLowerCase().trim();
  if (qq.length < 2) { box.classList.remove("open"); box.innerHTML = ""; return; }
  const words = qq.split(/\s+/);
  const score = (it: SearchItem) => { const t = it.title.toLowerCase(); return (t.startsWith(qq) ? 3 : 0) + (t.includes(qq) ? 5 : 0); };
  const results = (await loadIndex())
    .filter(it => words.every(w => it.text.includes(w)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, 30);
  if (byId<HTMLInputElement>("searchBox").value.toLowerCase().trim() !== qq) return;
  box.classList.add("open");
  if (!results.length) { box.innerHTML = `<div class="sr-empty">No matches for "${escapeHtml(q.trim())}"</div>`; return; }
  box.innerHTML = `<div class="sr-head">${results.length === 30 ? "Top 30" : results.length} result${results.length === 1 ? "" : "s"} &middot; <kbd>&uarr;</kbd> <kbd>&darr;</kbd> to move, <kbd>Enter</kbd> to open</div>` +
    results.map((r, i) => `
    <a class="sr-item${i === 0 ? " active" : ""}" href="${r.href}">
      <div class="sr-label">Ch ${r.n} &middot; ${r.kind}</div>
      <div class="sr-title">${highlight(r.title, words)}</div>
      ${r.snippet ? `<div class="sr-snippet">${highlight(r.snippet, words)}</div>` : ""}
    </a>`).join("");
}
function moveSearchSelection(delta: number) {
  const items = $$(".sr-item", byId("searchResults"));
  if (!items.length) return;
  const i = (items.findIndex(el => el.classList.contains("active")) + delta + items.length) % items.length;
  items.forEach((el, j) => el.classList.toggle("active", j === i));
  items[i].scrollIntoView({ block: "nearest" });
}

// ------------------------------------------------------------------ theme, export / import / reset, toast

function applyTheme() {
  if (window.SDLooks) {
    window.SDLooks.applyTheme();
    window.SDLooks.ensureControls();
    return;
  }
  document.body.classList.toggle("light", state.theme === "light");
  byId("themeToggle").textContent = state.theme === "light" ? "Dark" : "Light";
}
const toggleTheme = () => {
  if (window.SDLooks) {
    window.SDLooks.cycleTheme();
    state.theme = window.SDLooks.themePref as Saved["theme"];
    save();
    return;
  }
  state.theme = state.theme === "light" ? "dark" : "light";
  save();
  applyTheme();
};

function doReset() {
  if (!confirm("Reset all progress? This cannot be undone.")) return;
  state.progress = {}; save(); location.reload();
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
  byId("menuToggle").addEventListener("click", e => { e.stopPropagation(); sidebar.classList.contains("open") ? closeDrawer() : openDrawer(); });
  backdrop.addEventListener("click", closeDrawer);
  byId("moreToggle").addEventListener("click", e => { e.stopPropagation(); moreMenu.classList.toggle("open"); });
  const actions: Record<string, () => void> = { theme: toggleTheme, reset: doReset };
  for (const b of $$("#moreMenu [data-action]")) b.addEventListener("click", e => { e.stopPropagation(); closeMoreMenu(); actions[b.dataset.action!]?.(); });

  const box = byId<HTMLInputElement>("searchBox"), results = byId("searchResults");
  box.addEventListener("input", () => runSearch(box.value));
  box.addEventListener("focus", () => { loadIndex(); if (box.value) runSearch(box.value); });
  box.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); moveSearchSelection(e.key === "ArrowDown" ? 1 : -1); }
    else if (e.key === "Enter") {
      const active = $<HTMLAnchorElement>(".sr-item.active", results);
      if (active) { e.preventDefault(); active.click(); }
    }
  });
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
    if ((e.key === "j" || e.key === "k") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const target = chapterId
        ? $<HTMLAnchorElement>(`.chapter-footer a[rel="${e.key === "j" ? "next" : "prev"}"]`)
        : e.key === "j" ? $<HTMLAnchorElement>("a.chapter-item[data-chapter]") : null;
      if (target) location.href = target.href;
    }
  });
  window.addEventListener("resize", () => { if (!isMobile()) closeDrawer(); });
}

// ------------------------------------------------------------------ start

applyTheme();
initChrome();
if (chapterId) {
  if (state.lastChapter !== chapterId) { state.lastChapter = chapterId; save(); }
  initChapter(chapterId);
  initLearn(chapterId);
  initSelfTest();
  initFilters();
  initTabs();
}
refreshProgress();
initContinue();
initGlossary();
initPrint();
