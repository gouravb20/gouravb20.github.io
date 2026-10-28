// Site-wide sidebar, docked on the left, collapsible to an icon rail, and a drawer on narrow screens. It shows one level at a time:
// the main menu (Dashboard, Learn, Books, Slides), or, inside a section, "Back to main", the section's pages and the current notes
// app's chapter list (#sidebar, moved in from the page).
// Include with <script src=".../shared/sitenav.js"></script> in <head>, not deferred, so the page reserves the sidebar's width before
// first paint; the site root is worked out from this script's URL.
(function () {
  if (typeof document === "undefined") return;
  const script = document.currentScript;
  const root = new URL("../", script ? script.src : location.href);
  const DOCKED = "(min-width: 1024px)";
  const KEY = "learn_sitenav";

  const svg = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    home: svg(`<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>`),
    hld: svg(`<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>`),
    lld: svg(`<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>`),
    code: svg(`<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>`),
    books: svg(`<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>`),
    slides: svg(`<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>`),
    concepts: svg(`<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>`),
    advanced: svg(`<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="m19 15 .7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>`),
    patterns: svg(`<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>`),
    problems: svg(`<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>`),
    book: svg(`<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>`),
    pdf: svg(`<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>`),
    deck: svg(`<rect x="3" y="4" width="18" height="12" rx="2"/><path d="m10 8 4 2-4 2z"/>`),
    menu: svg(`<path d="M4 6h16M4 12h16M4 18h16"/>`),
    next: svg(`<path d="m9 6 6 6-6 6"/>`),
    back: svg(`<path d="m15 6-6 6 6 6"/>`),
    fold: svg(`<path d="m14 6-6 6 6 6M19 6v12"/>`)
  };

  const HLD = "high-level-design/notes/", LLD = "low-level-design/notes/", BOOKS = "books/notes/";
  const MAIN = [
    { path: "", icon: "home", title: "Dashboard" },
    { group: "Learn" },
    { id: "hld", path: "high-level-design/", icon: "hld", title: "High-Level Design", kids: [
      { path: `${HLD}core-concepts/`, icon: "concepts", title: "Core Concepts" },
      { path: `${HLD}patterns/`, icon: "patterns", title: "Patterns" },
      { path: `${HLD}advanced-topics/`, icon: "advanced", title: "Advanced Topics" },
      { path: `${HLD}problem-breakdowns/`, icon: "problems", title: "Problem Breakdowns" }
    ] },
    { id: "lld", path: "low-level-design/", icon: "lld", title: "Low-Level Design", kids: [
      { path: `${LLD}in-a-hurry/`, icon: "concepts", title: "LLD in a Hurry" },
      { path: `${LLD}concurrency/`, icon: "advanced", title: "Concurrency" },
      { path: `${LLD}problem-breakdowns/`, icon: "problems", title: "Problem Breakdowns" }
    ] },
    { icon: "code", title: "Code", soon: true },
    { group: "" },
    { id: "books", path: "books/", icon: "books", title: "Books", kids: [
      { path: `${BOOKS}ddia/`, icon: "book", title: "Designing Data-Intensive Applications" },
      { path: `${BOOKS}streaming-systems/`, icon: "book", title: "Streaming Systems" },
      { path: `${BOOKS}database-internals/`, icon: "book", title: "Database Internals" },
      { path: `${BOOKS}architecture-hard-parts/`, icon: "book", title: "Software Architecture: The Hard Parts" },
      { path: `${BOOKS}ai-engineering/`, icon: "book", title: "AI Engineering" },
      { path: `${BOOKS}graphrag/`, icon: "book", title: "Essential GraphRAG" },
      { path: `${BOOKS}mastering-go/`, icon: "book", title: "Mastering Go" },
      { path: "books/#library", icon: "pdf", title: "PDF library" }
    ] },
    { id: "slides", path: "slides/", icon: "slides", title: "Slides", kids: [
      { path: "slides/database-guide/", icon: "deck", title: "A Field Guide to Databases" },
      { path: "slides/database-anatomy-part2/", icon: "deck", title: "Database Anatomy, Part 2" }
    ] }
  ];

  const css = `
    html.sn-on{--sn-w:280px}
    .sn{--sn-accent:var(--accent,#4be38a);position:fixed;top:0;bottom:0;left:0;z-index:95;width:var(--sn-w);display:flex;flex-direction:column;
      box-sizing:border-box;background:var(--bg-2,#10172a);color:var(--text,#e6ebf5);border-right:1px solid var(--border,#24304f);
      font:14px/1.4 var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif);text-align:left}
    .sn *,.sn *::before,.sn *::after{box-sizing:border-box}
    .sn a{color:inherit;text-decoration:none}
    .sn svg{flex:none;display:block}
    .sn-head{display:flex;align-items:center;gap:8px;box-sizing:border-box;padding:12px 12px 12px 14px;border-bottom:1px solid var(--border,#24304f)}
    .sn-home{display:flex;align-items:center;gap:10px;flex:1;min-width:0;font-weight:700;font-size:15px;border-radius:8px}
    .sn-mark{flex:none;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:#dc2626;color:#fff;font-size:14px;font-weight:800}
    .sn-close{display:none;flex:none;width:32px;height:32px;place-items:center;border-radius:8px;border:1px solid var(--border,#24304f);
      background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer}
    .sn-body{position:relative;flex:1;overflow-y:auto;overscroll-behavior:contain;padding:10px 10px 16px}
    .sn-view[hidden]{display:none}
    .sn ul{list-style:none;margin:0;padding:0}
    .sn-group{padding:14px 10px 6px;color:var(--muted,var(--text-muted,#94a3b8));font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase}
    .sn-group:empty{padding:6px 0;margin:0 10px 6px;border-bottom:1px solid var(--border,#24304f)}
    .sn-row{display:flex;align-items:center;border-radius:8px;margin-bottom:1px}
    .sn-row:hover{background:var(--bg-3,#18213a)}
    .sn-row.sn-current,.sn-row.sn-in{background:color-mix(in srgb,var(--sn-accent) 12%,transparent)}
    .sn-row.sn-current .sn-link,.sn-row.sn-in .sn-link{color:var(--sn-accent)}
    .sn-link{flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:7px 10px;border-radius:8px;color:inherit}
    .sn-link>svg{color:var(--muted,var(--text-muted,#94a3b8))}
    .sn-current .sn-link>svg,.sn-in .sn-link>svg{color:currentColor}
    .sn-link.sn-off{cursor:default;color:var(--muted,var(--text-muted,#94a3b8))}
    .sn-txt{flex:1;min-width:0}
    .sn-soon{flex:none;font-size:10.5px;font-weight:600;padding:1px 7px;border-radius:999px;color:var(--muted,var(--text-muted,#94a3b8));
      border:1px solid var(--border,#24304f)}
    .sn-btn-icon{flex:none;width:30px;height:30px;display:grid;place-items:center;padding:0;border:0;border-radius:6px;background:transparent;
      color:var(--muted,var(--text-muted,#94a3b8));cursor:pointer}
    .sn-btn-icon:hover{background:var(--bg-3,#18213a);color:var(--text,#e6ebf5)}
    .sn-caret svg{transition:transform .15s ease;transform:rotate(90deg)}
    .sn-caret[aria-expanded="false"] svg{transform:none}
    .sn-back{display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px;margin-bottom:6px;border:0;border-radius:8px;background:transparent;
      color:var(--muted,var(--text-muted,#94a3b8));font:inherit;font-size:13.5px;cursor:pointer}
    .sn-back:hover{background:var(--bg-3,#18213a);color:var(--text,#e6ebf5)}
    .sn-section{display:flex;align-items:center;gap:10px;padding:6px 10px 10px;font-weight:700;font-size:15px}
    .sn-section[aria-current]{color:var(--sn-accent)}
    .sn-kids{margin:2px 0 8px 19px;padding-left:8px;border-left:1px solid var(--border,#24304f)}
    .sn-kids[hidden]{display:none}
    .sn-foot{border-top:1px solid var(--border,#24304f);padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px))}
    .sn-fold{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;
      color:var(--muted,var(--text-muted,#94a3b8));font:inherit;font-size:13px;cursor:pointer}
    .sn-fold:hover{background:var(--bg-3,#18213a);color:var(--text,#e6ebf5)}
    .sn a:focus-visible,.sn button:focus-visible,.sn-btn:focus-visible{outline:2px solid var(--sn-accent);outline-offset:1px}
    .sn-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex:none;padding:0;
      border-radius:8px;border:1px solid var(--border,#24304f);background:var(--bg-3,#18213a);color:var(--text,#e6ebf5);cursor:pointer}
    .sn-btn:hover{border-color:var(--muted,var(--text-muted,#94a3b8))}
    .sn-btn.sn-fixed{position:fixed;top:max(12px,env(safe-area-inset-top,0px));left:12px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.25)}

    html.sn-on .layout{grid-template-columns:minmax(0,1fr)}
    html.sn-on .layout>.sidebar{display:none}
    html.sn-on .menu-toggle{display:none!important}
    .sn #sidebar{position:static;transform:none;width:auto;max-width:none;max-height:none;overflow:visible;padding:2px 0 4px;
      background:none;border:0;box-shadow:none;z-index:auto;top:auto}
    .sn #sidebar .part-header{padding:12px 6px 4px;font-size:10.5px;letter-spacing:.8px}
    .sn #sidebar .chapter-item{gap:8px;padding:5px 6px;font-size:13px;margin-bottom:1px;border-left:0}
    .sn #sidebar .chapter-item.active{padding-left:6px;background:color-mix(in srgb,var(--sn-accent) 12%,transparent);color:var(--sn-accent)}
    .sn #sidebar .chapter-num{min-width:18px;height:18px;font-size:10.5px;background:none;color:var(--muted,var(--text-muted,#94a3b8))}
    .sn #sidebar .chapter-item.active .chapter-num{background:none;color:var(--sn-accent)}
    .sn #sidebar .chapter-ring{width:15px;height:15px}

    @media ${DOCKED}{
      html.sn-on body{padding-left:var(--sn-w)}
      html.sn-on .home-btn,.sn-btn,.sn-backdrop{display:none!important}
      html.sn-collapsed{--sn-w:60px}
      html.sn-collapsed .sn-txt,html.sn-collapsed .sn-soon,html.sn-collapsed .sn-btn-icon,html.sn-collapsed .sn-kids,
      html.sn-collapsed .sn-fold span,html.sn-collapsed .sn-back span,html.sn-collapsed .sn-group,html.sn-collapsed .sn-section{display:none}
      html.sn-collapsed .sn-head{justify-content:center;padding:12px 0}
      html.sn-collapsed .sn-home{flex:none}
      html.sn-collapsed .sn-body{padding:10px 8px}
      html.sn-collapsed .sn-link,html.sn-collapsed .sn-back,html.sn-collapsed .sn-fold{justify-content:center;padding:8px 0}
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
  const linked = n => n.path != null && !n.path.includes("#");
  const within = n => linked(n) && n.path !== "" && here.startsWith(href(n));
  const section = MAIN.find(n => n.kids && within(n));
  const page = section && section.kids.filter(within).sort((a, b) => b.path.length - a.path.length)[0];
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  function mount() {
    if (document.getElementById("snPanel")) return;
    const chapters = document.querySelector(".layout > #sidebar");

    const row = (n, extra = "", cls = "") => {
      const label = `${ICON[n.icon]}<span class="sn-txt">${n.title}</span>${n.soon ? `<span class="sn-soon">Soon</span>` : ""}`;
      const link = n.path != null
        ? `<a class="sn-link" href="${href(n)}" title="${esc(n.title)}"${here === href(n) ? ` aria-current="page"` : ""}>${label}</a>`
        : `<span class="sn-link sn-off" title="${esc(n.title)}: coming soon" aria-disabled="true">${label}</span>`;
      return `<div class="sn-row${cls}">${link}${extra}</div>`;
    };

    const main = MAIN.map(n => {
      if ("group" in n) return `<li class="sn-group">${n.group}</li>`;
      const cur = n.path === "" ? here === root.href : within(n);
      const drill = n.kids ? `<button type="button" class="sn-btn-icon" data-view="${n.id}" aria-label="Open the ${esc(n.title)} menu" title="Open menu">${ICON.next}</button>` : "";
      return `<li>${row(n, drill, cur ? (here === href(n) ? " sn-current" : " sn-in") : "")}</li>`;
    }).join("");

    const sub = n => {
      const items = n.kids.map(k => {
        if (k !== page || !chapters) return `<li>${row(k, "", k === page ? " sn-current" : "")}</li>`;
        const open = k.path in prefs.open ? prefs.open[k.path] : true;
        const caret = `<button type="button" class="sn-btn-icon sn-caret" aria-expanded="${open}" aria-controls="snChapters" aria-label="Show or hide the chapters" data-path="${esc(k.path)}">${ICON.next}</button>`;
        return `<li>${row(k, caret, here === href(k) ? " sn-current" : " sn-in")}<div class="sn-kids" id="snChapters"${open ? "" : " hidden"}></div></li>`;
      }).join("");
      return `<div class="sn-view" data-view="${n.id}"${n === section ? "" : " hidden"}>
          <button type="button" class="sn-back" data-view="main" title="Back to main">${ICON.back}<span>Back to main</span></button>
          <a class="sn-section" href="${href(n)}"${here === href(n) ? ` aria-current="page"` : ""}>${n.title}</a>
          <ul>${items}</ul>
        </div>`;
    };

    const wrap = document.createElement("div");
    wrap.id = "snRoot";
    wrap.innerHTML = `
      <div class="sn-backdrop" data-sn-close></div>
      <aside class="sn" id="snPanel" aria-label="Site navigation">
        <div class="sn-head">
          <a class="sn-home" href="${root.href}" title="Home"><span class="sn-mark" aria-hidden="true">L</span><span class="sn-txt">System Design</span></a>
          <button type="button" class="sn-close" data-sn-close aria-label="Close navigation">&times;</button>
        </div>
        <nav class="sn-body" aria-label="Sections">
          <div class="sn-view" data-view="main"${section ? " hidden" : ""}><ul>${main}</ul></div>
          ${MAIN.filter(n => n.kids).map(sub).join("")}
        </nav>
        <div class="sn-foot"><button type="button" class="sn-fold" id="snFold">${ICON.fold}<span>Collapse</span></button></div>
      </aside>`;
    document.body.appendChild(wrap);
    const panel = wrap.querySelector(".sn");
    const body = wrap.querySelector(".sn-body");
    const fold = wrap.querySelector("#snFold");

    const slot = wrap.querySelector("#snChapters");
    if (slot) { slot.appendChild(chapters); chapters.classList.add("sn-embedded"); }

    body.addEventListener("click", e => {
      const go = e.target.closest("button[data-view]");
      if (go) {
        for (const v of body.querySelectorAll(".sn-view")) v.hidden = v.dataset.view !== go.dataset.view;
        body.scrollTop = 0;
        body.querySelector(`.sn-view[data-view="${go.dataset.view}"]`).querySelector("a, button").focus({ preventScroll: true });
        return;
      }
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
      if (on) (body.querySelector(".sn-view:not([hidden]) [aria-current]") || body.querySelector(".sn-view:not([hidden]) a")).focus({ preventScroll: true });
      else if (!docked.matches) btn.focus();
    };
    btn.addEventListener("click", e => { e.stopPropagation(); setDrawer(!drawer); });
    wrap.addEventListener("click", e => {
      if (e.target.closest("[data-sn-close]") || (drawer && e.target.closest("a, .chapter-item"))) setDrawer(false);
    });
    document.addEventListener("keydown", e => { if (drawer && e.key === "Escape") { e.preventDefault(); setDrawer(false); } });
    docked.addEventListener("change", () => { if (docked.matches) setDrawer(false); });

    // Docked beside the page, the sidebar's header is as tall as the page's top bar, so their bottom rules line up.
    // Each page and look sizes its own top bar, so measure it rather than hard-code a height.
    const head = wrap.querySelector(".sn-head");
    if (topbar && head) {
      const alignHead = () => { head.style.minHeight = docked.matches ? topbar.offsetHeight + "px" : ""; };
      new ResizeObserver(alignHead).observe(topbar);
      docked.addEventListener("change", alignHead);
      alignHead();
    }

    const reveal = () => {
      const active = body.querySelector(".chapter-item.active") || body.querySelector(".sn-current");
      if (!active || !active.offsetParent) return;
      const r = active.getBoundingClientRect(), t = body.getBoundingClientRect();
      if (r.bottom > t.bottom || r.top < t.top) body.scrollTop += r.top - t.top - body.clientHeight / 3;
    };
    reveal();
    if (slot) new MutationObserver(reveal).observe(chapters, { childList: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
