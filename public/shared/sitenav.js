// Site-wide sidebar: a tree of the site's sections docked on the left, collapsible to an icon rail, and a drawer on narrow screens.
// Include with <script src=".../shared/sitenav.js"></script> in <head>, not deferred, so the page reserves the sidebar's width before
// first paint; the site root is worked out from this script's URL. On a notes app the app's chapter list (#sidebar) moves under the
// app's entry in the tree.
(function () {
  if (typeof document === "undefined") return;
  const script = document.currentScript;
  const root = new URL("../", script ? script.src : location.href);
  const DOCKED = "(min-width: 1024px)";
  const KEY = "learn_sitenav";

  const TREE = [
    { path: "high-level-design/", mono: "HLD", accent: "#38bdf8", title: "High-Level Design", kids: [
      { path: "high-level-design/notes/core-concepts/", mono: "CC", accent: "#f87171", title: "Core Concepts" },
      { path: "high-level-design/notes/advanced-topics/", mono: "AT", accent: "#fb923c", title: "Advanced Topics" },
      { path: "high-level-design/notes/problem-breakdowns/", mono: "PB", accent: "#a3e635", title: "Problem Breakdowns" }
    ] },
    { path: "low-level-design/", mono: "LLD", accent: "#00add8", title: "Low-Level Design", note: "Coming soon" },
    { path: "books/", mono: "B", accent: "#14b8a6", title: "Books", kids: [
      { path: "books/notes/ddia/", mono: "D", accent: "#f472b6", title: "Designing Data-Intensive Applications" },
      { path: "books/notes/streaming-systems/", mono: "S", accent: "#38bdf8", title: "Streaming Systems" },
      { path: "books/notes/database-internals/", mono: "DI", accent: "#4ade80", title: "Database Internals" },
      { path: "books/notes/architecture-hard-parts/", mono: "SA", accent: "#e879f9", title: "Software Architecture: The Hard Parts" },
      { path: "books/notes/ai-engineering/", mono: "AI", accent: "#14b8a6", title: "AI Engineering" },
      { path: "books/notes/graphrag/", mono: "G", accent: "#a78bfa", title: "Essential GraphRAG" },
      { path: "books/notes/mastering-go/", mono: "Go", accent: "#00add8", title: "Mastering Go" },
      { path: "books/#library", mono: "PDF", accent: "#94a3b8", title: "PDF library" }
    ] },
    { path: "slides/", mono: "S", accent: "#f59e0b", title: "Slides", kids: [
      { path: "slides/database-guide/", mono: "DB", accent: "#f59e0b", title: "A Field Guide to Databases" }
    ] }
  ];

  const ICON = {
    menu: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    caret: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    fold: `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6M19 6v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };

  const css = `
    html.sn-on{--sn-w:288px}
    .sn{position:fixed;top:0;bottom:0;left:0;z-index:95;width:var(--sn-w);display:flex;flex-direction:column;box-sizing:border-box;
      background:var(--bg-2,#10172a);color:var(--text,#e6ebf5);border-right:1px solid var(--border,#24304f);
      font:14px/1.4 var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif);text-align:left}
    .sn *,.sn *::before,.sn *::after{box-sizing:border-box}
    .sn a{color:inherit;text-decoration:none}
    .sn-head{display:flex;align-items:center;gap:8px;padding:14px 12px 12px 14px;border-bottom:1px solid var(--border,#24304f)}
    .sn-home{display:flex;align-items:center;gap:10px;flex:1;min-width:0;font-weight:700;font-size:16px;border-radius:8px}
    .sn-mark{flex:none;width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:#dc2626;color:#fff;font-size:16px;font-weight:800}
    .sn-close{display:none;flex:none;width:32px;height:32px;place-items:center;border-radius:8px;border:1px solid var(--border,#24304f);
      background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer}
    .sn-tree{position:relative;flex:1;overflow-y:auto;overscroll-behavior:contain;padding:10px 10px 16px}
    .sn ul{list-style:none;margin:0;padding:0}
    .sn-row{display:flex;align-items:center;gap:2px;border-radius:8px;margin-bottom:2px}
    .sn-row:hover{background:var(--bg-3,#18213a)}
    .sn-row.sn-current{background:color-mix(in srgb,var(--a) 14%,transparent)}
    .sn-link{flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px}
    .sn-current>.sn-link{font-weight:650}
    .sn-mono{flex:none;width:28px;height:28px;border-radius:7px;display:grid;place-items:center;font-weight:800;font-size:11px;color:var(--a);
      background:color-mix(in srgb,var(--a) 16%,transparent);border:1px solid color-mix(in srgb,var(--a) 38%,transparent)}
    .sn-txt{flex:1;min-width:0}
    .sn-txt small{display:block;color:var(--muted,var(--text-muted,#94a3b8));font-size:11.5px;font-weight:400}
    .sn-caret{flex:none;width:28px;height:28px;display:grid;place-items:center;padding:0;border:0;border-radius:6px;background:transparent;
      color:var(--muted,var(--text-muted,#94a3b8));cursor:pointer}
    .sn-caret:hover{background:var(--bg-3,#18213a);color:var(--text,#e6ebf5)}
    .sn-caret svg{transition:transform .15s ease}
    .sn-caret[aria-expanded="true"] svg{transform:rotate(90deg)}
    .sn-kids{margin:2px 0 8px 21px;padding-left:8px;border-left:1px solid var(--border,#24304f)}
    .sn-kids .sn-link{gap:8px;padding:5px 6px;font-size:13.5px}
    .sn-kids .sn-mono{width:22px;height:22px;border-radius:6px;font-size:9px}
    .sn-kids[hidden]{display:none}
    .sn-foot{border-top:1px solid var(--border,#24304f);padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px))}
    .sn-fold{display:flex;align-items:center;gap:8px;width:100%;padding:8px;border:0;border-radius:8px;background:transparent;
      color:var(--muted,var(--text-muted,#94a3b8));font:inherit;font-size:13px;cursor:pointer}
    .sn-fold:hover{background:var(--bg-3,#18213a);color:var(--text,#e6ebf5)}
    .sn a:focus-visible,.sn button:focus-visible,.sn-btn:focus-visible{outline:2px solid #38bdf8;outline-offset:1px}
    .sn-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex:none;padding:0;
      border-radius:8px;border:1px solid var(--border,#24304f);background:var(--bg-3,#18213a);color:var(--text,#e6ebf5);cursor:pointer}
    .sn-btn:hover{border-color:var(--muted,var(--text-muted,#94a3b8))}
    .sn-btn.sn-fixed{position:fixed;top:max(12px,env(safe-area-inset-top,0px));left:12px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.25)}

    html.sn-on .layout{grid-template-columns:minmax(0,1fr)}
    html.sn-on .layout>.sidebar{display:none}
    html.sn-on .menu-toggle{display:none!important}
    .sn #sidebar{position:static;transform:none;width:auto;max-width:none;max-height:none;overflow:visible;padding:2px 0 4px;
      background:none;border:0;box-shadow:none;z-index:auto;top:auto}
    .sn #sidebar .part-header{padding:12px 6px 4px;font-size:10.5px}
    .sn #sidebar .chapter-item{gap:8px;padding:6px 8px;font-size:13px;margin-bottom:1px}
    .sn #sidebar .chapter-item.active{padding-left:5px}
    .sn #sidebar .chapter-num{min-width:22px;height:22px;font-size:10.5px}

    @media ${DOCKED}{
      html.sn-on body{padding-left:var(--sn-w)}
      html.sn-on .home-btn,.sn-btn,.sn-backdrop{display:none!important}
      html.sn-collapsed{--sn-w:64px}
      html.sn-collapsed .sn-txt,html.sn-collapsed .sn-caret,html.sn-collapsed .sn-kids,html.sn-collapsed .sn-fold span{display:none}
      html.sn-collapsed .sn-head{justify-content:center;padding:14px 0 12px}
      html.sn-collapsed .sn-home{flex:none}
      html.sn-collapsed .sn-tree{padding:10px 8px}
      html.sn-collapsed .sn-link{justify-content:center;padding:6px 0}
      html.sn-collapsed .sn-row.sn-in{background:color-mix(in srgb,var(--a) 14%,transparent)}
      html.sn-collapsed .sn-fold{justify-content:center}
      html.sn-collapsed .sn-fold svg{transform:rotate(180deg)}
    }
    @media (max-width:1023.98px){
      .sn{z-index:10000;width:min(320px,88vw);transform:translateX(-102%);visibility:hidden;box-shadow:12px 0 40px rgba(0,0,0,.35);
        transition:transform .2s ease,visibility 0s linear .2s}
      html.sn-drawer .sn{transform:none;visibility:visible;transition:transform .2s ease}
      .sn-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(5,8,18,.55);opacity:0;pointer-events:none;transition:opacity .18s ease}
      html.sn-drawer .sn-backdrop{opacity:1;pointer-events:auto}
      html.sn-drawer,html.sn-drawer body{overflow:hidden}
      .sn-close{display:grid}
      .sn-foot{display:none}
    }
    @media (prefers-reduced-motion:reduce){.sn,.sn-backdrop,.sn-caret svg{transition:none!important}}
    @media print{.sn,.sn-btn,.sn-backdrop{display:none!important}html.sn-on body{padding-left:0!important}}`;

  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  if (!prefs.open || typeof prefs.open !== "object") prefs.open = {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} };

  const html = document.documentElement;
  html.classList.add("sn-on");
  html.classList.toggle("sn-collapsed", !!prefs.collapsed);
  const style = document.createElement("style");
  style.id = "snStyles";
  style.textContent = css;
  (document.head || html).appendChild(style);

  const href = n => new URL(n.path, root).href;
  const here = location.href.split(/[?#]/)[0].replace(/index\.html$/, "");
  const nodes = [];
  (function walk(list, parent) { list.forEach(n => { n.parent = parent; nodes.push(n); if (n.kids) walk(n.kids, n); }); })(TREE, null);
  const current = nodes.filter(n => !n.path.includes("#") && here.startsWith(href(n)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const trail = new Set();
  for (let n = current; n; n = n.parent) trail.add(n);
  const isOpen = n => n.path in prefs.open ? prefs.open[n.path] : (!n.parent || trail.has(n));
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  function mount() {
    if (document.getElementById("snPanel")) return;
    const chapters = document.querySelector(".layout > #sidebar");
    let uid = 0;
    const item = n => {
      const id = `snKids${++uid}`;
      const withChapters = n === current && chapters;
      const expandable = !!(n.kids || withChapters);
      const open = expandable && isOpen(n);
      const cur = n === current ? ` aria-current="${here === href(n) ? "page" : "location"}"` : "";
      const kids = n.kids ? `<ul class="sn-kids" id="${id}"${open ? "" : " hidden"}>${n.kids.map(item).join("")}</ul>`
        : withChapters ? `<div class="sn-kids sn-chapters" id="${id}"${open ? "" : " hidden"}></div>` : "";
      return `<li style="--a:${n.accent}">
        <div class="sn-row${n === current ? " sn-current" : trail.has(n) ? " sn-in" : ""}">
          <a class="sn-link" href="${href(n)}" title="${esc(n.title)}"${cur}><span class="sn-mono" aria-hidden="true">${n.mono}</span><span class="sn-txt">${n.title}${n.note ? `<small>${n.note}</small>` : ""}</span></a>
          ${expandable ? `<button type="button" class="sn-caret" aria-expanded="${open}" aria-controls="${id}" aria-label="${esc(n.title)}: show or hide pages" data-path="${esc(n.path)}">${ICON.caret}</button>` : ""}
        </div>${kids}
      </li>`;
    };

    const wrap = document.createElement("div");
    wrap.id = "snRoot";
    wrap.innerHTML = `
      <div class="sn-backdrop" data-sn-close></div>
      <aside class="sn" id="snPanel" aria-label="Site navigation">
        <div class="sn-head">
          <a class="sn-home" href="${root.href}" title="Home"${here === root.href ? ` aria-current="page"` : ""}><span class="sn-mark" aria-hidden="true">L</span><span class="sn-txt">System Design</span></a>
          <button type="button" class="sn-close" data-sn-close aria-label="Close navigation">&times;</button>
        </div>
        <nav class="sn-tree" aria-label="Sections"><ul>${TREE.map(item).join("")}</ul></nav>
        <div class="sn-foot"><button type="button" class="sn-fold" id="snFold">${ICON.fold}<span>Collapse</span></button></div>
      </aside>`;
    document.body.appendChild(wrap);
    const panel = wrap.querySelector(".sn");
    const tree = wrap.querySelector(".sn-tree");
    const fold = wrap.querySelector("#snFold");

    const slot = wrap.querySelector(".sn-chapters");
    if (slot) { slot.appendChild(chapters); chapters.classList.add("sn-embedded"); }

    tree.addEventListener("click", e => {
      const caret = e.target.closest(".sn-caret");
      if (!caret) return;
      const open = caret.getAttribute("aria-expanded") !== "true";
      caret.setAttribute("aria-expanded", String(open));
      document.getElementById(caret.getAttribute("aria-controls")).hidden = !open;
      prefs.open[caret.dataset.path] = open;
      save();
    });

    const syncFold = () => {
      const c = html.classList.contains("sn-collapsed");
      fold.setAttribute("aria-label", c ? "Expand sidebar" : "Collapse sidebar");
      fold.title = c ? "Expand sidebar" : "Collapse sidebar";
      fold.querySelector("span").textContent = c ? "Expand" : "Collapse";
    };
    syncFold();
    fold.addEventListener("click", () => {
      prefs.collapsed = !html.classList.contains("sn-collapsed");
      html.classList.toggle("sn-collapsed", prefs.collapsed);
      save();
      syncFold();
    });

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sn-btn";
    btn.title = "Menu";
    btn.setAttribute("aria-label", "Open navigation");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "snPanel");
    btn.innerHTML = ICON.menu;
    const topbar = document.querySelector("header.topbar, .topbar");
    if (topbar) topbar.insertBefore(btn, topbar.firstChild);
    else { btn.classList.add("sn-fixed"); document.body.appendChild(btn); }

    const docked = window.matchMedia(DOCKED);
    let drawer = false;
    const setDrawer = on => {
      if (on === drawer) return;
      drawer = on;
      btn.setAttribute("aria-expanded", String(on));
      html.classList.toggle("sn-drawer", on);
      if (on) (panel.querySelector("[aria-current]") || panel.querySelector("a")).focus({ preventScroll: true });
      else if (!docked.matches) btn.focus();
    };
    btn.addEventListener("click", e => { e.stopPropagation(); setDrawer(!drawer); });
    wrap.addEventListener("click", e => {
      if (e.target.closest("[data-sn-close]") || (drawer && e.target.closest("a, .chapter-item"))) setDrawer(false);
    });
    document.addEventListener("keydown", e => { if (drawer && e.key === "Escape") { e.preventDefault(); setDrawer(false); } });
    docked.addEventListener("change", () => { if (docked.matches) setDrawer(false); });

    const reveal = () => {
      const active = tree.querySelector(".chapter-item.active") || tree.querySelector(".sn-current");
      if (!active || !active.offsetParent) return;
      const r = active.getBoundingClientRect(), t = tree.getBoundingClientRect();
      if (r.bottom > t.bottom || r.top < t.top) tree.scrollTop += r.top - t.top - tree.clientHeight / 3;
    };
    reveal();
    // Single-page notes apps re-render the chapter list on every navigation.
    if (slot) new MutationObserver(reveal).observe(chapters, { childList: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
