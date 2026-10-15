import fs from "node:fs";

const files = [
  "public/index.html",
  "public/high-level-design/index.html",
  "public/low-level-design/index.html",
  "public/high-level-design/books/index.html",
  "public/low-level-design/books/index.html",
];

const NEW_THEME = `
      // Site-wide look + dark/light/auto (shared/looks.js)
      if (window.SDLooks) {
        // Migrate the old hub-only key once.
        try {
          if (!localStorage.getItem(SDLooks.THEME_KEY)) {
            const old = localStorage.getItem("system_design_hub_theme");
            if (old === "light" || old === "dark") SDLooks.applyTheme(old);
          }
        } catch (e) {}
        SDLooks.boot();
        SDLooks.ensureControls();
      }
`;

for (const f of files) {
  let html = fs.readFileSync(f, "utf8");
  if (!html.includes("shared/looks.js")) {
    const depth = (f.match(/\//g) || []).length - 1; // public/x -> 1
    const rel = "../".repeat(Math.max(0, depth - 1)) + (depth === 1 ? "shared/looks.js" : "shared/looks.js");
    // depth: public/index.html = 1 -> shared/looks.js
    // public/high-level-design/index.html = 2 -> ../shared/looks.js
    // public/high-level-design/books/index.html = 3 -> ../../shared/looks.js
    const parts = f.split("/");
    const ups = parts.length - 2; // files under public/
    const scriptRel = "../".repeat(ups) + "shared/looks.js";
    html = html.replace(
      /(<meta name="theme-color"[^>]*>)/,
      `$1\n  <script src="${scriptRel}"></script>`,
    );
  }

  // Replace the old THEME_KEY IIFE body with SDLooks wiring.
  html = html.replace(
    /const THEME_KEY = "system_design_hub_theme";[\s\S]*?btn\.addEventListener\("click", \(\) => \{ theme = theme === "dark" \? "light" : "dark"; localStorage\.setItem\(THEME_KEY, theme\); apply\(theme\); \}\);/,
    NEW_THEME.trim(),
  );
  html = html.replace(
    /const THEME_KEY = "system_design_hub_theme";[\s\S]*?themeBtn\.addEventListener\("click", \(\) => \{ theme = theme === "dark" \? "light" : "dark"; localStorage\.setItem\(THEME_KEY, theme\); applyTheme\(theme\); \}\);/,
    NEW_THEME.trim(),
  );

  // Also remove leftover apply helpers that are now unused if still present alone — leave them; harmless if unused vars.

  fs.writeFileSync(f, html);
  console.log(f, html.includes("SDLooks") ? "ok" : "CHECK");
}
