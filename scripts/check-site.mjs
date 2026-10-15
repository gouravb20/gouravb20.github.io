#!/usr/bin/env node
// Checks the site: every notes app's data and labs, the counts shown on the hubs and in README tables, and
// every link in the built site. Run after `npm run build`.
// `node scripts/check-site.mjs` reports problems and exits 1; `--fix` rewrites stale counts in the sources.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDeep } from "../src/lib/deep-check.mjs";
import { findApps, loadApp } from "../src/lib/notes-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const DIST = path.join(ROOT, "dist");
const BASE = "/system-design/";
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
const SOURCES = walk(PUBLIC);

// ---------------------------------------------------------------- notes apps

const BOOK_FIELDS = ["title", "subtitle", "storageKey", "appId", "exportPrefix", "pillarsTitle", "takeawaysTitle", "labsIntro"];
/** App folder in public/ -> what the hubs need to know about it. */
const apps = new Map();

for (const app of findApps(PUBLIC)) {
  const name = rel(app.dir);
  const loaded = loadApp(app);
  const { DATA: D, DEMOS, errors } = loaded;
  problems.push(...errors.map(e => `${name}: ${e}`));
  if (!D || !Array.isArray(D.chapters)) { problems.push(`${name}: window.DATA.chapters is missing`); continue; }
  const deep = checkDeep({ name, ...loaded, deepScripts: app.deepScripts });
  problems.push(...deep.problems);
  warnings.push(...deep.warnings);

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
  apps.set(app.dir, { name, legacy: app.legacy, storageKey: D.book?.storageKey, counts });
}

const byKey = new Map();
for (const a of apps.values()) {
  if (!a.storageKey) continue;
  if (byKey.has(a.storageKey)) problems.push(`${a.name}: storageKey ${a.storageKey} is also used by ${byKey.get(a.storageKey)}`);
  byKey.set(a.storageKey, a.name);
}

/** A link to an app may name its folder or the folder's index.html. */
const appAt = target => apps.get(target.endsWith("index.html") ? path.dirname(target) : target.replace(/[\\/]$/, ""));

// ---------------------------------------------------------------- counts on the hubs and in README tables

const within = (dir, p) => p === dir || p.startsWith(dir + path.sep);
const slideCount = file => (fs.readFileSync(file, "utf8").match(/<section[^>]*class="[^"]*\bslide\b/g) || []).length;
const bookCount = file => (fs.readFileSync(file, "utf8").match(/^\s*\{\s*id:\s*"/gm) || []).length;

function metric(name, dir) {
  if (name === "slides") {
    return SOURCES.filter(f => within(dir, f) && /[\\/]slides[\\/][^\\/]+[\\/]index\.html$/.test(f)).reduce((s, f) => s + slideCount(f), 0);
  }
  if (name === "books") return bookCount(path.join(dir, "index.html"));
  if (name === "total") return metric("concepts", dir) + metric("qa", dir);
  let sum = null;
  for (const [appDir, a] of apps) if (within(dir, appDir)) sum = (sum || 0) + a.counts[name];
  return sum;
}

let fixed = 0;
for (const file of SOURCES.filter(f => f.endsWith(".html") && !apps.has(path.dirname(f)))) {
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
    const app = appAt(path.resolve(dir, href));
    if (!app) { problems.push(`${rel(file)}:${line(i)}: card with data-key/data-total links to ${href}, which is not a notes app`); return tag; }
    if (key !== app.storageKey) problems.push(`${rel(file)}:${line(i)}: data-key="${key}" but ${app.name} saves progress under "${app.storageKey}"`);
    const want = check(i, `data-total for ${app.name}`, total, app.counts.concepts + app.counts.qa);
    return total == null ? tag.replace(/>$/, ` data-total="${want}">`) : tag.replace(/\bdata-total="\d+"/, `data-total="${want}"`);
  });

  if (stale.length && FIX) { fs.writeFileSync(file, out); fixed += stale.length; console.log(`fixed ${stale.length} number(s) in ${rel(file)}`); }
  else problems.push(...stale);
}

// Markdown table rows that link a notes app end with: | chapters | concepts | labs | Q&A |, "-" for zero.
const MARKDOWN = fs.readdirSync(ROOT).filter(f => f.endsWith(".md")).map(f => path.join(ROOT, f));
for (const file of MARKDOWN) {
  const src = fs.readFileSync(file, "utf8");
  const stale = [];
  const out = src.split("\n").map((row, n) => {
    const link = row.match(/^\|.*\]\(([^)]*\/notes\/[^/)]+(?:\/index\.html|\/)?)\)/);
    const app = link && appAt(path.resolve(path.dirname(file), link[1]));
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
/** `siteRoot` is where BASE-absolute links ("/system-design/...") resolve; null for files outside the site. */
function checkRef(file, ref, i, src, siteRoot) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(ref) || ref.includes("${")) return;
  let target = ref.split("#")[0].split("?")[0];
  if (!target) return;
  try { target = decodeURIComponent(target); } catch { /* leave as written */ }
  linkCount++;
  const where = `${rel(file)}:${src.slice(0, i).split("\n").length}`;
  let full;
  if (target.startsWith("/")) {
    if (!siteRoot || !(target + "/").startsWith(BASE)) { problems.push(`${where}: link ${ref} is outside ${BASE}`); return; }
    full = path.join(siteRoot, target.slice(BASE.length));
  } else {
    full = path.resolve(path.dirname(file), target);
  }
  const ok = existsExact(full) || ((target.endsWith("/") || !path.extname(target)) && existsExact(path.join(full, "index.html")));
  if (!ok) problems.push(`${where}: broken link ${ref}`);
}

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  problems.push("dist/ is missing: run `npm run build` first so links in the built site can be checked");
} else {
  for (const file of walk(DIST).filter(f => f.endsWith(".html"))) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/\b(?:href|src)="([^"]+)"/g)) checkRef(file, m[1], m.index, src, DIST);
    // Book library entries: { file: "ddia/....pdf", notes: "../notes/ddia/index.html" }
    for (const m of src.matchAll(/\b(?:file|notes):\s*"([^"]+)"/g)) checkRef(file, m[1], m.index, src, DIST);
  }
}
for (const file of MARKDOWN) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\]\(([^)\s]+)\)/g)) checkRef(file, m[1], m.index, src, null);
}

// ---------------------------------------------------------------- report

for (const a of apps.values()) {
  const c = a.counts;
  console.log(`${a.name.padEnd(49)} ${String(c.chapters).padStart(3)} chapters ${String(c.concepts).padStart(4)} concepts ${String(c.labs).padStart(3)} labs ${String(c.qa).padStart(4)} Q&A  ${a.legacy ? "single-page app" : "Astro pages"}`);
}
console.log(`\n${apps.size} notes apps, ${linkCount} links checked${fixed ? `, ${fixed} count(s) fixed` : ""}.`);
for (const w of warnings) console.log(`warning: ${w}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  if (problems.some(p => / says .*, should be /.test(p))) console.error("\nRun `node scripts/check-site.mjs --fix` to update stale counts.");
  process.exit(1);
}
console.log("All checks passed.");
