// Site-wide section menu: a hamburger at the top left that opens a panel over the page with the site's sections.
// Include with <script src=".../shared/sitenav.js" defer></script>; the site root is worked out from this script's URL.
(function () {
  if (typeof document === "undefined") return;
  const script = document.currentScript;
  const root = new URL("../", script ? script.src : location.href);

  const SECTIONS = [
    { path: "high-level-design/", mono: "HLD", accent: "#38bdf8", title: "High-Level Design", by: "Distributed systems, data and AI" },
    { path: "low-level-design/", mono: "LLD", accent: "#00add8", title: "Low-Level Design", by: "Building blocks of programs · coming soon" },
    { path: "books/", mono: "B", accent: "#14b8a6", title: "Books", by: "Book notes and the source PDFs" },
    { path: "slides/", mono: "S", accent: "#f59e0b", title: "Slides", by: "Visual guides and slide decks" }
  ];
  const ICON = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const here = location.href.split(/[?#]/)[0];
  const isHome = here === root.href || here === new URL("index.html", root).href;
  const current = SECTIONS.find(s => here.startsWith(new URL(s.path, root).href));

  const css = `
    .sn-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex:none;padding:0;
      border-radius:8px;border:1px solid var(--border,#24304f);background:var(--bg-3,#18213a);color:var(--text,#e6ebf5);cursor:pointer}
    .sn-btn:hover{border-color:var(--muted,var(--text-muted,#94a3b8))}
    .sn-btn:focus-visible,.sn-panel a:focus-visible,.sn-close:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
    .sn-btn.sn-fixed{position:fixed;top:max(12px,env(safe-area-inset-top,0px));left:12px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.25)}
    .sn-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(5,8,18,.55);opacity:0;transition:opacity .18s ease}
    .sn-panel{position:fixed;top:0;bottom:0;left:0;z-index:10000;width:min(340px,88vw);display:flex;flex-direction:column;gap:6px;
      padding:16px 14px calc(16px + env(safe-area-inset-bottom,0px));overflow-y:auto;background:var(--bg-2,#10172a);color:var(--text,#e6ebf5);
      border-right:1px solid var(--border,#24304f);box-shadow:12px 0 40px rgba(0,0,0,.35);transform:translateX(-102%);transition:transform .2s ease;
      font:15px/1.45 var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif)}
    .sn-open .sn-backdrop{opacity:1}
    .sn-open .sn-panel{transform:none}
    .sn-head{display:flex;align-items:center;gap:10px;padding:2px 4px 12px;border-bottom:1px solid var(--border,#24304f);margin-bottom:6px}
    .sn-home{display:flex;align-items:center;gap:10px;font-weight:700;color:inherit;text-decoration:none;flex:1;border-radius:8px}
    .sn-mark{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:#dc2626;color:#fff;font-size:15px;font-weight:800}
    .sn-close{width:32px;height:32px;border-radius:8px;border:1px solid var(--border,#24304f);background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer}
    .sn-label{color:var(--faint,var(--text-muted,#64748b));font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;padding:8px 6px 4px}
    .sn-panel a.sn-item{display:flex;align-items:center;gap:12px;padding:10px;border-radius:10px;color:inherit;text-decoration:none;border:1px solid transparent}
    .sn-panel a.sn-item:hover{background:var(--bg-3,#18213a)}
    .sn-panel a.sn-item[aria-current]{background:color-mix(in srgb,var(--a) 12%,transparent);border-color:color-mix(in srgb,var(--a) 40%,transparent)}
    .sn-mono{flex:none;width:40px;height:40px;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:13px;color:var(--a);
      background:color-mix(in srgb,var(--a) 16%,transparent);border:1px solid color-mix(in srgb,var(--a) 40%,transparent)}
    .sn-item b{display:block;font-size:15px}
    .sn-item small{display:block;color:var(--muted,var(--text-muted,#94a3b8));font-size:12.5px}
    html.sn-lock,html.sn-lock body{overflow:hidden}
    @media (prefers-reduced-motion:reduce){.sn-panel,.sn-backdrop{transition:none}}`;

  function mount() {
    if (document.getElementById("snPanel")) return;
    const style = document.createElement("style");
    style.id = "snStyles";
    style.textContent = css;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sn-btn";
    btn.id = "snToggle";
    btn.title = "Sections";
    btn.setAttribute("aria-label", "Open sections menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "snPanel");
    btn.innerHTML = ICON;
    const topbar = document.querySelector("header.topbar, .topbar");
    if (topbar) topbar.insertBefore(btn, topbar.firstChild);
    else { btn.classList.add("sn-fixed"); document.body.appendChild(btn); }

    const wrap = document.createElement("div");
    wrap.id = "snRoot";
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="sn-backdrop" data-sn-close></div>
      <nav class="sn-panel" id="snPanel" aria-label="Site sections" tabindex="-1">
        <div class="sn-head">
          <a class="sn-home" href="${root.href}"${isHome ? ` aria-current="page"` : ``}><span class="sn-mark" aria-hidden="true">L</span>Home</a>
          <button type="button" class="sn-close" data-sn-close aria-label="Close sections menu">&times;</button>
        </div>
        <div class="sn-label">Sections</div>
        ${SECTIONS.map(s => `
        <a class="sn-item" href="${new URL(s.path, root).href}" style="--a:${s.accent}"${s === current ? ` aria-current="page"` : ``}>
          <span class="sn-mono" aria-hidden="true">${s.mono}</span><span><b>${s.title}</b><small>${s.by}</small></span>
        </a>`).join("")}
      </nav>`;
    document.body.appendChild(wrap);

    const panel = wrap.querySelector(".sn-panel");
    let open = false;
    const set = on => {
      if (on === open) return;
      open = on;
      btn.setAttribute("aria-expanded", String(on));
      document.documentElement.classList.toggle("sn-lock", on);
      if (on) {
        wrap.hidden = false;
        requestAnimationFrame(() => { wrap.classList.add("sn-open"); (panel.querySelector("[aria-current]") || panel.querySelector("a")).focus(); });
      } else {
        wrap.classList.remove("sn-open");
        setTimeout(() => { if (!open) wrap.hidden = true; }, 220);
        btn.focus();
      }
    };
    btn.addEventListener("click", e => { e.stopPropagation(); set(!open); });
    wrap.addEventListener("click", e => { if (e.target.closest("[data-sn-close]") || e.target.closest("a")) set(false); });
    document.addEventListener("keydown", e => {
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); set(false); return; }
      if (e.key !== "Tab") return;
      const items = [...panel.querySelectorAll("a, button")];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
