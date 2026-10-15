// Pull only the dark/light CSS variable blocks from ddia-notes skins.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.resolve(ROOT, "../ddia-notes/skins");
const OUT = path.join(ROOT, "public/shared/skins");
const SKINS = ["editorial", "blueprint", "brutalist", "terminal"];

/** Capture one `{ ... }` block starting at `start` (index of the opening `{`). */
function captureBlock(css, start) {
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error("unclosed block");
}

function extractTokenBlocks(css, skin) {
  const blocks = [];
  const darkRe = new RegExp(`:root\\[data-skin="${skin}"\\]\\s*\\{`);
  const lightRe = new RegExp(`:root\\[data-skin="${skin}"\\]\\s+body\\.light\\s*\\{`);
  for (const re of [darkRe, lightRe]) {
    const m = css.match(re);
    if (!m) throw new Error(`${skin}: missing ${re}`);
    const open = css.indexOf("{", m.index);
    const body = captureBlock(css, open);
    const selector = css.slice(m.index, open).trim();
    blocks.push({ selector, body });
  }
  return blocks;
}

fs.mkdirSync(OUT, { recursive: true });
for (const skin of SKINS) {
  const css = fs.readFileSync(path.join(SRC, `${skin}.css`), "utf8");
  const [dark, light] = extractTokenBlocks(css, skin);
  const lightSel = `:root[data-skin="${skin}"] body.light,\n:root[data-skin="${skin}"][data-theme="light"]`;
  const map = `
:root[data-skin="${skin}"] {
  --dg-1: var(--viz-c2); --dg-1-soft: var(--viz-c2-soft, color-mix(in srgb, var(--viz-c2) 18%, transparent));
  --dg-2: var(--viz-c6); --dg-2-soft: var(--viz-c6-soft, color-mix(in srgb, var(--viz-c6) 18%, transparent));
  --dg-3: var(--viz-c3); --dg-3-soft: var(--viz-c3-soft, color-mix(in srgb, var(--viz-c3) 18%, transparent));
  --dg-4: var(--viz-c1); --dg-4-soft: var(--viz-c1-soft, color-mix(in srgb, var(--viz-c1) 18%, transparent));
  --dg-5: var(--viz-c5); --dg-5-soft: var(--viz-c5-soft, color-mix(in srgb, var(--viz-c5) 18%, transparent));
  --dg-6: var(--viz-muted); --dg-6-soft: color-mix(in srgb, var(--viz-muted) 18%, transparent);
  --dg-ok: var(--viz-ok, var(--good)); --dg-ok-soft: var(--viz-ok-soft, color-mix(in srgb, var(--good) 16%, transparent));
  --dg-bad: var(--viz-bad, var(--bad)); --dg-bad-soft: var(--viz-bad-soft, color-mix(in srgb, var(--bad) 16%, transparent));
  --dg-ink: var(--viz-ink, var(--text)); --dg-muted: var(--viz-muted, var(--text-muted));
  --dg-line: var(--viz-line, var(--border)); --dg-panel: var(--viz-panel, var(--bg-2));
  color-scheme: dark;
}
:root[data-skin="${skin}"] body.light,
:root[data-skin="${skin}"][data-theme="light"] { color-scheme: light; }
:root[data-skin="${skin}"] body {
  font-family: var(--font-sans, inherit);
}
:root[data-skin="${skin}"] code, :root[data-skin="${skin}"] pre, :root[data-skin="${skin}"] .mono {
  font-family: var(--font-mono, ui-monospace, monospace);
}
`;
  const out = `/* Token-only port of ddia-notes look: ${skin} */\n${dark.selector} ${dark.body}\n\n${lightSel} ${light.body}\n${map}`;
  fs.writeFileSync(path.join(OUT, `${skin}.css`), out);
  console.log(skin, fs.statSync(path.join(OUT, `${skin}.css`)).size);
}
