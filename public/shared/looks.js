// Site-wide look (skin) + dark/light/auto mode. Shared by notes apps, Astro pages and hubs.
// Looks restyle through CSS variables in shared/skins/<id>.css; "classic" is styles.css alone.
(function (global) {
  const SKIN_KEY = "system_design_skin";
  const THEME_KEY = "system_design_theme";
  const FONTS = {
    editorial: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap",
    blueprint: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap",
    brutalist: "https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,100,400;0,100,600;0,100,700;0,100,800;0,125,800;1,100,400&family=IBM+Plex+Mono:wght@400;500;700&display=swap",
    terminal: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;700;800&display=swap",
  };
  const DEFAULT_SKIN = "editorial";
  const SKINS = [
    { id: "editorial", name: "Editorial", note: "Paper and ink", sw: ["#f7f3ea", "#24211c", "#c2371d"] },
    { id: "blueprint", name: "Blueprint", note: "Drafting sheet", sw: ["#0d2c56", "#e8f1fc", "#7fdcff"] },
    { id: "brutalist", name: "Swiss", note: "Bold poster type", sw: ["#f4f1e8", "#111111", "#ffd60a"] },
    { id: "terminal", name: "Ops console", note: "tmux and Grafana", sw: ["#0b0d0c", "#d3dbd5", "#4be38a"] },
    { id: "classic", name: "Classic", note: "Teal and slate", sw: ["#0a0f1c", "#e2e8f0", "#14b8a6"] },
  ];
  const THEMES = [
    { id: "dark", name: "Dark", label: "☾ Dark" },
    { id: "light", name: "Light", label: "☀ Light" },
    { id: "auto", name: "Auto", label: "◐ Auto" },
  ];

  const looksBase = () => {
    const link = document.querySelector('link[href*="shared/styles.css"], link[href*="styles.css"]');
    if (!link) return "";
    const href = link.getAttribute("href") || "";
    const i = href.lastIndexOf("/");
    return i >= 0 ? href.slice(0, i + 1) : "";
  };

  function read(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }

  // The site check evaluates this file in Node, which has no DOM.
  if (typeof document === "undefined") return;

  let activeSkin = document.documentElement.getAttribute("data-skin") || read(SKIN_KEY, DEFAULT_SKIN);
  if (!SKINS.some(s => s.id === activeSkin)) activeSkin = DEFAULT_SKIN;
  let themePref = read(THEME_KEY, "");

  function resolvedTheme() {
    const q = (location.search.match(/[?&]theme=(light|dark|auto)/) || [])[1];
    const pref = q || themePref;
    if (pref === "light" || pref === "dark") return pref;
    if (pref === "auto" || !pref) {
      return global.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    return "dark";
  }

  function applyTheme(pref) {
    if (pref === "light" || pref === "dark" || pref === "auto") {
      themePref = pref;
      write(THEME_KEY, pref);
    }
    const t = resolvedTheme();
    document.body?.classList.toggle("light", t === "light");
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()
        || getComputedStyle(document.body || document.documentElement).getPropertyValue("--bg").trim();
      if (bg) meta.setAttribute("content", bg);
    }
    const btn = document.getElementById("themeToggle");
    if (btn) {
      const cycle = themePref === "light" ? "auto" : themePref === "auto" ? "dark" : "light";
      const cur = THEMES.find(x => x.id === (themePref || "dark")) || THEMES[0];
      btn.textContent = cur.label;
      btn.title = `Theme: ${cur.name} (click for ${cycle})`;
      btn.setAttribute("aria-label", `Theme ${cur.name}. Click to switch.`);
    }
    const mbtn = document.getElementById("themeMenuBtn");
    if (mbtn) mbtn.textContent = (THEMES.find(x => x.id === (themePref || "dark")) || THEMES[0]).label + " theme";
    document.dispatchEvent(new CustomEvent("sd:theme", { detail: { theme: t, pref: themePref || "dark" } }));
  }

  function setFonts(id) {
    const old = document.getElementById("skinFonts");
    if (old) old.remove();
    const url = FONTS[id];
    if (!url) return;
    const f = document.createElement("link");
    f.rel = "stylesheet";
    f.id = "skinFonts";
    f.href = url;
    f.media = "print";
    f.onload = () => { f.media = "all"; };
    document.head.appendChild(f);
  }

  function applySkin(id) {
    if (!SKINS.some(s => s.id === id)) return;
    write(SKIN_KEY, id);
    const html = document.documentElement;
    const old = document.getElementById("skinCss");
    const finish = () => {
      if (id === "classic") html.removeAttribute("data-skin");
      else html.setAttribute("data-skin", id);
      if (old) old.remove();
      setFonts(id);
      activeSkin = id;
      applyTheme();
      renderMenus();
      document.dispatchEvent(new CustomEvent("sd:skin", { detail: { skin: id } }));
    };
    if (id === "classic") { finish(); return; }
    if (activeSkin === id && document.getElementById("skinCss")) { applyTheme(); renderMenus(); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${looksBase()}skins/${id}.css`;
    link.onload = () => { link.id = "skinCss"; finish(); };
    link.onerror = () => { link.remove(); finish(); };
    document.head.appendChild(link);
  }

  function cycleTheme() {
    const order = ["dark", "light", "auto"];
    const cur = themePref && order.includes(themePref) ? themePref : "dark";
    applyTheme(order[(order.indexOf(cur) + 1) % order.length]);
  }

  const APPEARANCE_ICON = `<svg class="look-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2.8a9.2 9.2 0 0 0 0 18.4h1.15a2.15 2.15 0 0 0 1.55-3.66 2.15 2.15 0 0 1 1.55-3.66H18.2a1.9 1.9 0 0 0 1.9-1.9A9.2 9.2 0 0 0 12 2.8ZM7.15 11.2a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Zm3.15-3.35a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Zm4.15.15a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Zm1.55 3.35a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7Z"/></svg>`;

  function menuHtml() {
    const pref = themePref || "auto";
    const themes = THEMES.map(t => `
      <button type="button" class="look-opt${t.id === pref ? " is-active" : ""}" data-theme="${t.id}" role="menuitemradio" aria-checked="${t.id === pref}">
        <span class="look-txt"><b>${t.name}</b></span>
        <span class="look-check" aria-hidden="true">✓</span>
      </button>`).join("");
    const looks = SKINS.map(x => `
      <button type="button" class="look-opt${x.id === activeSkin ? " is-active" : ""}" data-skin="${x.id}" role="menuitemradio" aria-checked="${x.id === activeSkin}">
        <span class="look-sw" aria-hidden="true">${x.sw.map(c => `<i style="background:${c}"></i>`).join("")}</span>
        <span class="look-txt"><b>${x.name}</b><small>${x.note}</small></span>
        <span class="look-check" aria-hidden="true">✓</span>
      </button>`).join("");
    return `<div class="look-title">Mode</div>${themes}<div class="look-title look-split">Look</div>${looks}`;
  }

  function renderMenus() {
    const html = menuHtml();
    const menu = document.getElementById("lookMenu");
    const list = document.getElementById("lookMenuMobile");
    if (menu) menu.innerHTML = html;
    if (list) list.innerHTML = html;
    document.querySelectorAll(".look-opt").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      closeMenu();
      if (b.dataset.theme) applyTheme(b.dataset.theme);
      else if (b.dataset.skin) applySkin(b.dataset.skin);
    }));
  }

  function closeMenu() {
    document.getElementById("lookMenu")?.classList.remove("open");
    document.getElementById("lookToggle")?.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    const m = document.getElementById("lookMenu");
    if (!m) return;
    const open = m.classList.toggle("open");
    document.getElementById("lookToggle")?.setAttribute("aria-expanded", String(open));
  }

  function ensureLookStyles() {
    if (document.getElementById("lookStyles")) return;
    const s = document.createElement("style");
    s.id = "lookStyles";
    s.textContent = `
      .look-wrap{position:relative}
      .look-menu{position:absolute;top:calc(100% + 8px);right:0;width:300px;z-index:210;display:none;background:var(--bg-2,#10172a);border:1px solid var(--border,#26324f);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.35);padding:6px;color:var(--text,#e2e8f0)}
      .look-menu.open{display:block}
      .look-title,.look-foot,.more-sep{font-size:10.5px;text-transform:uppercase;letter-spacing:.8px;font-weight:700;color:var(--text-muted,#94a3b8);padding:6px 10px 4px}
      .look-foot{font-size:12px;text-transform:none;letter-spacing:0;font-weight:500;border-top:1px solid var(--border,#26324f);margin-top:4px}
      .look-opt{display:flex;align-items:center;gap:10px;width:100%;min-height:46px;padding:7px 10px;text-align:left;background:transparent;color:inherit;border:1px solid transparent;border-radius:8px;font:inherit;cursor:pointer}
      .look-opt:hover,.look-opt:focus-visible{background:var(--bg-3,#18213a);outline:none}
      .look-opt.is-active{border-color:var(--accent,#14b8a6)}
      .look-sw{display:inline-flex;flex-shrink:0;border:1px solid var(--border,#26324f);border-radius:5px;overflow:hidden}
      .look-sw i{display:block;width:11px;height:28px}
      .look-txt{display:flex;flex-direction:column;flex:1;min-width:0;line-height:1.3}
      .look-txt b{font-size:14px;font-weight:700}
      .look-txt small{font-size:12px;color:var(--text-muted,#94a3b8)}
      .look-check{color:var(--accent,#14b8a6);font-weight:800;visibility:hidden}
      .look-opt.is-active .look-check{visibility:visible}
      .look-split{border-top:1px solid var(--border,#26324f);margin-top:4px;padding-top:8px}
      .look-icon{display:block}
      #themeToggle, #moreMenu [data-action="theme"]{display:none!important}
      .more-menu .look-list{display:grid;gap:2px}
      .more-sep{border-top:1px solid var(--border,#26324f);margin-top:4px;padding-top:10px}
    `;
    document.head.appendChild(s);
  }

  /** Insert Look control next to #themeToggle when the page has a notes/hub topbar. */
  function ensureControls() {
    const themeBtn = document.getElementById("themeToggle");
    if (!themeBtn || document.getElementById("lookWrap")) {
      if (document.getElementById("lookWrap")) renderMenus();
      return;
    }
    ensureLookStyles();
    const btnClass = themeBtn.className || "iconbtn";
    themeBtn.insertAdjacentHTML("afterend", `
      <div class="look-wrap" id="lookWrap">
        <button type="button" class="${btnClass}" id="lookToggle" aria-haspopup="true" aria-expanded="false" aria-controls="lookMenu" title="Appearance">${APPEARANCE_ICON}<span class="sr-only"> Appearance</span></button>
        <div class="look-menu" id="lookMenu" role="menu" aria-label="Look"></div>
      </div>`);
    const more = document.getElementById("moreMenu");
    themeBtn.hidden = true;
    if (more && !document.getElementById("lookMenuMobile")) {
      more.insertAdjacentHTML("beforeend", `<div class="more-sep">Appearance</div><div class="look-list" id="lookMenuMobile" role="group" aria-label="Appearance"></div>`);
    }
    document.getElementById("lookToggle")?.addEventListener("click", e => {
      e.stopPropagation();
      toggleMenu();
    });
    document.addEventListener("click", e => {
      if (!e.target.closest?.("#lookWrap")) closeMenu();
    });
    // Hub pages: click cycles dark → light → auto
    if (!themeBtn.dataset.sdLooksBound) {
      themeBtn.dataset.sdLooksBound = "1";
      themeBtn.addEventListener("click", e => {
        // Notes apps bind their own handler; hubs rely on this.
        if (themeBtn.closest(".topbar") && document.getElementById("resetBtn")) return;
        e.preventDefault();
        cycleTheme();
      });
    }
    renderMenus();
  }

  /** Early boot: set data-skin before paint when possible; call again after DOM for theme. */
  function boot() {
    ensureLookStyles();
    const q = (location.search.match(/[?&]skin=([a-z0-9-]+)/) || [])[1];
    const saved = read(SKIN_KEY, DEFAULT_SKIN);
    const skin = q && SKINS.some(s => s.id === q) ? q : (SKINS.some(s => s.id === saved) ? saved : DEFAULT_SKIN);
    if (skin === "classic") document.documentElement.removeAttribute("data-skin");
    else document.documentElement.setAttribute("data-skin", skin);
    if (skin !== "classic" && !document.getElementById("skinCss") && document.head) {
      const href = `${looksBase()}skins/${skin}.css`;
      if (document.readyState === "loading") document.write(`<link rel="stylesheet" id="skinCss" href="${href}">`);
      else {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.id = "skinCss";
        link.href = href;
        document.head.appendChild(link);
      }
      setFonts(skin);
    }
    activeSkin = skin;
    if (!themePref) {
      // Prefer per-book theme from notes storage when present (back-compat).
      try {
        const key = document.body?.dataset?.storageKey;
        if (key) {
          const saved = JSON.parse(localStorage.getItem(key) || "{}");
          if (saved.theme === "light" || saved.theme === "dark") themePref = saved.theme;
        }
      } catch { /* ignore */ }
    }
    if (document.body) applyTheme();
  }

  const api = {
    SKINS, THEMES, SKIN_KEY, THEME_KEY,
    get skin() { return activeSkin; },
    get themePref() { return themePref || "dark"; },
    resolvedTheme, applyTheme, applySkin, cycleTheme, ensureControls, boot, closeMenu,
  };
  global.SDLooks = api;

  // Run as soon as this script executes (in <head> or at end of body).
  boot();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { boot(); ensureControls(); });
  } else {
    ensureControls();
  }
  global.matchMedia?.("(prefers-color-scheme: light)")?.addEventListener?.("change", () => {
    if ((themePref || "auto") === "auto" || !themePref) applyTheme();
  });
})(typeof window !== "undefined" ? window : globalThis);
