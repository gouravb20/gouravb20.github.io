#!/usr/bin/env node
// Checks the static site: every notes app's data and labs, the counts shown on the hubs and in README tables,
// and every relative link. `node scripts/check-site.mjs` reports problems and exits 1; `--fix` rewrites stale counts.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = process.argv.includes("--fix");
const problems = [];
const warnings = [];
const rel = p => path.relative(ROOT, p).split(path.sep).join("/");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const FILES = walk(ROOT);

// ---------------------------------------------------------------- notes apps

const BOOK_FIELDS = ["title", "subtitle", "storageKey", "appId", "exportPrefix", "pillarsTitle", "takeawaysTitle", "labsIntro"];
const apps = new Map();

function loadApp(indexFile) {
  const dir = path.dirname(indexFile);
  const name = rel(dir);
  const html = fs.readFileSync(indexFile, "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => path.resolve(dir, m[1]));
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const s of scripts) {
    if (path.basename(s) === "app.js") continue;
    if (!fs.existsSync(s)) continue;
    try { vm.runInContext(fs.readFileSync(s, "utf8"), ctx, { filename: rel(s) }); }
    catch (e) { problems.push(`${rel(s)}: throws while loading: ${e.message}`); }
  }
  const D = ctx.DATA, DEMOS = ctx.DEMOS || {};
  if (!D || !Array.isArray(D.chapters)) { problems.push(`${name}: window.DATA.chapters is missing`); return; }

  for (const f of BOOK_FIELDS) if (typeof D.book?.[f] !== "string" || !D.book[f]) problems.push(`${name}: DATA.book.${f} is missing`);
  for (const [id, d] of Object.entries(DEMOS)) {
    if (!d || typeof d.mount !== "function" || !d.title || !d.blurb) problems.push(`${name}: lab ${id} needs title, blurb and mount()`);
  }

  const ids = new Set(), used = new Set();
  const counts = { chapters: D.chapters.length, concepts: 0, labs: 0, qa: 0 };
  for (const ch of D.chapters) {
    const where = `${name} chapter ${ch.id}`;
    if (ids.has(ch.id)) problems.push(`${where}: duplicate chapter id`);
    ids.add(ch.id);
    if (!D.parts?.[ch.part]) problems.push(`${where}: part ${ch.part} is not in DATA.parts`);
    for (const k of ["concepts", "labs", "cheatsheet", "interview"]) {
      if (!Array.isArray(ch[k])) { problems.push(`${where}: ${k} must be an array`); ch[k] = []; }
    }
    for (const id of ch.labs) { used.add(id); if (!DEMOS[id]) problems.push(`${where}: lab ${id} is not defined in any demos file`); }
    for (const c of ch.concepts) if (c.demo && !DEMOS[c.demo]) problems.push(`${where}: concept "${c.term}" links to missing lab ${c.demo}`);
    counts.concepts += ch.concepts.length;
    counts.labs += ch.labs.length;
    counts.qa += ch.interview.length;
  }
  const unused = Object.keys(DEMOS).filter(id => !used.has(id));
  if (unused.length) warnings.push(`${name}: labs not listed in any chapter: ${unused.join(", ")}`);
  apps.set(dir, { name, storageKey: D.book?.storageKey, counts });
}

for (const f of FILES) if (/[\\/]notes[\\/][^\\/]+[\\/]index\.html$/.test(f)) loadApp(f);

const byKey = new Map();
for (const a of apps.values()) {
  if (!a.storageKey) continue;
  if (byKey.has(a.storageKey)) problems.push(`${a.name}: storageKey ${a.storageKey} is also used by ${byKey.get(a.storageKey)}`);
  byKey.set(a.storageKey, a.name);
}

// ---------------------------------------------------------------- hub numbers

const within = (dir, p) => p === dir || p.startsWith(dir + path.sep);
const slideCount = file => (fs.readFileSync(file, "utf8").match(/<section[^>]*class="[^"]*\bslide\b/g) || []).length;
const bookCount = file => (fs.readFileSync(file, "utf8").match(/^\s*\{\s*id:\s*"/gm) || []).length;

function metric(name, dir) {
  if (name === "slides") {
    return FILES.filter(f => within(dir, f) && /[\\/]slides[\\/][^\\/]+[\\/]index\.html$/.test(f)).reduce((s, f) => s + slideCount(f), 0);
  }
  if (name === "books") return bookCount(path.join(dir, "index.html"));
  if (name === "total") return metric("concepts", dir) + metric("qa", dir);
  let sum = null;
  for (const [appDir, a] of apps) if (within(dir, appDir)) sum = (sum || 0) + a.counts[name];
  return sum;
}

let fixed = 0;
for (const file of FILES.filter(f => f.endsWith(".html") && !apps.has(path.dirname(f)))) {
  const dir = path.dirname(file);
  const src = fs.readFileSync(file, "utf8");
  const line = i => src.slice(0, i).split("\n").length;
  const stale = [];
  const check = (i, what, have, want) => {
    if (want == null) problems.push(`${rel(file)}:${line(i)}: ${what} points at nothing countable`);
    else if (String(have) !== String(want)) stale.push(`${rel(file)}:${line(i)}: ${what} says ${have}, should be ${want}`);
    return want == null ? have : want;
  };

  let out = src.replace(/<(\w+)\b([^>]*\bdata-count="(\w+)"[^>]*)>([^<]*)<\/\1>/g, (m, tag, attrs, name, have, i) => {
    const from = (attrs.match(/\bdata-src="([^"]*)"/) || [])[1];
    if (from == null) { problems.push(`${rel(file)}:${line(i)}: data-count="${name}" needs data-src`); return m; }
    const want = check(i, `${name} for ${from}`, have.trim(), metric(name, path.resolve(dir, from)));
    return `<${tag}${attrs}>${want}</${tag}>`;
  });

  out = out.replace(/<a\b[^>]*>/g, (tag, i) => {
    const href = (tag.match(/\bhref="([^"]+)"/) || [])[1];
    const key = (tag.match(/\bdata-key="([^"]+)"/) || [])[1];
    const total = (tag.match(/\bdata-total="(\d+)"/) || [])[1];
    if (!href || (!key && !total)) return tag;
    const app = apps.get(path.dirname(path.resolve(dir, href)));
    if (!app) { problems.push(`${rel(file)}:${line(i)}: card with data-key/data-total links to ${href}, which is not a notes app`); return tag; }
    if (key !== app.storageKey) problems.push(`${rel(file)}:${line(i)}: data-key="${key}" but ${app.name} saves progress under "${app.storageKey}"`);
    const want = check(i, `data-total for ${app.name}`, total, app.counts.concepts + app.counts.qa);
    return total == null ? tag.replace(/>$/, ` data-total="${want}">`) : tag.replace(/\bdata-total="\d+"/, `data-total="${want}"`);
  });

  if (stale.length && FIX) { fs.writeFileSync(file, out); fixed += stale.length; console.log(`fixed ${stale.length} number(s) in ${rel(file)}`); }
  else problems.push(...stale);
}

// Markdown table rows that link a notes app end with: | chapters | concepts | labs | Q&A |, "-" for zero.
for (const file of FILES.filter(f => f.endsWith(".md"))) {
  const src = fs.readFileSync(file, "utf8");
  const stale = [];
  const out = src.split("\n").map((row, n) => {
    const link = row.match(/^\|.*\]\(([^)]*\/notes\/[^/)]+)\/index\.html\)/);
    const app = link && apps.get(path.resolve(path.dirname(file), link[1]));
    if (!app) return row;
    const cells = row.replace(/\r$/, "").split("|");
    const tail = cells.length - 5;
    const want = ["chapters", "concepts", "labs", "qa"].map(k => String(app.counts[k] || "-"));
    const have = cells.slice(tail, tail + 4).map(c => c.trim());
    if (have.join() === want.join()) return row;
    stale.push(`${rel(file)}:${n + 1}: ${app.name} row says ${have.join(" / ")}, should be ${want.join(" / ")}`);
    want.forEach((v, i) => { cells[tail + i] = ` ${v} `; });
    return cells.join("|") + (row.endsWith("\r") ? "\r" : "");
  }).join("\n");
  if (stale.length && FIX) { fs.writeFileSync(file, out); fixed += stale.length; console.log(`fixed ${stale.length} row(s) in ${rel(file)}`); }
  else problems.push(...stale);
}

// ---------------------------------------------------------------- links

// GitHub Pages is case-sensitive even when the local disk is not, so match every path segment exactly.
const listing = new Map();
function existsExact(p) {
  const parts = path.relative(ROOT, p).split(path.sep);
  if (parts[0] === "..") return fs.existsSync(p);
  let cur = ROOT;
  for (const part of parts) {
    if (!part) continue;
    if (!listing.has(cur)) { try { listing.set(cur, new Set(fs.readdirSync(cur))); } catch { return false; } }
    if (!listing.get(cur).has(part)) return false;
    cur = path.join(cur, part);
  }
  return true;
}

let linkCount = 0;
function checkRef(file, ref, i, src) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(ref) || ref.includes("${")) return;
  let target = ref.split("#")[0].split("?")[0];
  if (!target) return;
  try { target = decodeURIComponent(target); } catch { /* leave as written */ }
  linkCount++;
  const full = path.resolve(path.dirname(file), target);
  const ok = existsExact(full) || (target.endsWith("/") && existsExact(path.join(full, "index.html")));
  if (!ok) problems.push(`${rel(file)}:${src.slice(0, i).split("\n").length}: broken link ${ref}`);
}

for (const file of FILES.filter(f => /\.(html|md)$/.test(f))) {
  const src = fs.readFileSync(file, "utf8");
  if (file.endsWith(".html")) {
    for (const m of src.matchAll(/\b(?:href|src)="([^"]+)"/g)) checkRef(file, m[1], m.index, src);
    // Book library entries: { file: "ddia/....pdf", notes: "../notes/ddia/index.html" }
    for (const m of src.matchAll(/\b(?:file|notes):\s*"([^"]+)"/g)) checkRef(file, m[1], m.index, src);
  } else if (file.endsWith(".md")) {
    for (const m of src.matchAll(/\]\(([^)\s]+)\)/g)) checkRef(file, m[1], m.index, src);
  }
}

// ---------------------------------------------------------------- report

for (const a of apps.values()) {
  const c = a.counts;
  console.log(`${a.name.padEnd(42)} ${String(c.chapters).padStart(3)} chapters ${String(c.concepts).padStart(4)} concepts ${String(c.labs).padStart(3)} labs ${String(c.qa).padStart(4)} Q&A`);
}
  console.log(`\n${apps.size} notes apps, ${linkCount} relative links checked${fixed ? `, ${fixed} count(s) fixed` : ""}.`);
for (const w of warnings) console.log(`warning: ${w}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  if (problems.some(p => / says .*, should be /.test(p))) console.error("\nRun `node scripts/check-site.mjs --fix` to update stale counts.");
  process.exit(1);
}
console.log("All checks passed.");
