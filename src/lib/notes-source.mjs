// Finds the notes apps under public/ and runs their data and lab scripts the way the browser does.
// Shared by the Astro content collection and scripts/check-site.mjs.
// An app folder with an index.html is a legacy single-page app; without one, Astro renders it.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

/** @param {string} name */
const partNumber = name => Number((name.match(/-part(\d+)\.js$/) || [])[1] || 0);

/**
 * @typedef {object} AppFiles
 * @property {string} dir        absolute path of the app folder
 * @property {string} track      e.g. "high-level-design"
 * @property {string} slug       e.g. "problem-breakdowns"
 * @property {boolean} legacy    true when the folder still has its own index.html
 * @property {string[]} scripts  every script the app loads, in order (absolute paths)
 * @property {string[]} labScripts  the lab scripts (shared highlight.js and labkit.js, then demos*.js), relative to public/
 * @property {string[]} deepScripts the chapters' deep dives, deep/<chapter id>.js (absolute paths)
 */

/**
 * @param {string} publicDir
 * @returns {AppFiles[]}
 */
export function findApps(publicDir) {
  /** @type {AppFiles[]} */
  const apps = [];
  for (const track of fs.readdirSync(publicDir, { withFileTypes: true })) {
    const notes = path.join(publicDir, track.name, "notes");
    if (!track.isDirectory() || !fs.existsSync(notes)) continue;
    for (const app of fs.readdirSync(notes, { withFileTypes: true })) {
      const dir = path.join(notes, app.name);
      if (app.isDirectory() && fs.existsSync(path.join(dir, "data.js"))) apps.push(appFiles(publicDir, dir, track.name, app.name));
    }
  }
  return apps;
}

/**
 * @param {string} publicDir
 * @param {string} dir
 * @param {string} track
 * @param {string} slug
 * @returns {AppFiles}
 */
function appFiles(publicDir, dir, track, slug) {
  const index = path.join(dir, "index.html");
  const toPublic = (/** @type {string} */ p) => path.relative(publicDir, p).split(path.sep).join("/");
  const deepDir = path.join(dir, "deep");
  const deepScripts = fs.existsSync(deepDir)
    ? fs.readdirSync(deepDir).filter(n => n.endsWith(".js")).sort().map(n => path.join(deepDir, n))
    : [];
  if (fs.existsSync(index)) {
    const html = fs.readFileSync(index, "utf8");
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => path.resolve(dir, m[1]));
    const labScripts = scripts.filter(s => /^(labkit|demos(-part\d+)?)\.js$/.test(path.basename(s))).map(toPublic);
    return { dir, track, slug, legacy: true, scripts, labScripts, deepScripts };
  }
  const names = fs.readdirSync(dir);
  const pick = (/** @type {string} */ prefix) => names
    .filter(n => new RegExp(`^${prefix}(-part\\d+)?\\.js$`).test(n))
    .sort((a, b) => partNumber(a) - partNumber(b))
    .map(n => path.join(dir, n));
  const labs = [path.join(publicDir, "shared", "highlight.js"), path.join(publicDir, "shared", "labkit.js"), ...pick("demos")];
  return { dir, track, slug, legacy: false, scripts: [...pick("data"), ...labs], labScripts: labs.map(toPublic), deepScripts };
}

/**
 * Runs an app's scripts (except the browser-only app.js and deep.js) and its deep dives, and returns what they define.
 * `DEEP` maps chapter id -> deep dive; `deepFiles` maps chapter id -> the file that defined it.
 * @param {AppFiles} app
 * @returns {{ DATA: any, DEMOS: Record<string, any>, DEEP: Record<string, any>, deepFiles: Record<string, string>, errors: string[] }}
 */
export function loadApp(app) {
  /** @type {string[]} */
  const errors = [];
  /** @type {any} */
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  const run = (/** @type {string} */ file) => {
    if (!fs.existsSync(file)) { errors.push(`${file}: missing`); return; }
    try { vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file }); }
    catch (e) { errors.push(`${file}: throws while loading: ${e instanceof Error ? e.message : e}`); }
  };
  for (const file of app.scripts) if (!["app.js", "deep.js"].includes(path.basename(file))) run(file);
  /** @type {Record<string, string>} */
  const deepFiles = {};
  ctx.DEEP = {};
  for (const file of app.deepScripts) {
    const before = new Set(Object.keys(ctx.DEEP));
    run(file);
    for (const id of Object.keys(ctx.DEEP)) if (!before.has(id)) deepFiles[id] = file;
  }
  ctx.MAIN = {};
  for (const file of folderScripts(app.dir, "main")) run(file);
  ctx.ALT = {};
  for (const file of folderScripts(app.dir, "alt")) run(file);
  if (ctx.DATA) {
    attachMain(ctx.DATA, ctx.MAIN, errors);
    mergeAlternatives(ctx.DATA, ctx.DEEP, ctx.ALT, errors);
  }
  return { DATA: ctx.DATA, DEMOS: ctx.DEMOS || {}, DEEP: ctx.DEEP, deepFiles, errors };
}

/**
 * The scripts in one of an app's optional folders, in name order:
 * main/<chapter id>.js sets `MAIN[chapterId] = [sections]`, the chapter's Main tab;
 * alt/<chapter id>.js sets `ALT[chapterId] = { go: { "<code block title>": "..." } }`, its code in other languages.
 * @param {string} dir @param {string} folder
 */
function folderScripts(dir, folder) {
  const sub = path.join(dir, folder);
  return fs.existsSync(sub) ? fs.readdirSync(sub).filter(n => n.endsWith(".js")).sort().map(n => path.join(sub, n)) : [];
}

/** @param {any} DATA @param {Record<string, any[]>} MAIN @param {string[]} errors */
function attachMain(DATA, MAIN, errors) {
  for (const [chapterId, sections] of Object.entries(MAIN)) {
    const ch = (DATA.chapters || []).find((/** @type {any} */ c) => c.id === chapterId);
    if (!ch) errors.push(`main/${chapterId}.js: no chapter has id "${chapterId}"`);
    else ch.main = sections;
  }
}

/**
 * Attaches each alternative to every code block (or cheatsheet code) with the same title in that chapter, as `alt[lang]`;
 * a deep dive snippet and its cheatsheet copy often share a title.
 * An alternative whose title matches no block is an error, so a renamed block can't silently lose its translation.
 * @param {any} DATA @param {Record<string, any>} DEEP @param {Record<string, Record<string, Record<string, string>>>} ALT
 * @param {string[]} errors
 */
function mergeAlternatives(DATA, DEEP, ALT, errors) {
  for (const [chapterId, byLang] of Object.entries(ALT)) {
    const ch = (DATA.chapters || []).find((/** @type {any} */ c) => c.id === chapterId);
    if (!ch) { errors.push(`alt/${chapterId}.js: no chapter has id "${chapterId}"`); continue; }
    /** @type {Map<string, any[]>} */
    const byTitle = new Map();
    const add = (/** @type {string} */ title, /** @type {any} */ block) => byTitle.set(title, [...(byTitle.get(title) || []), block]);
    const sections = [...(ch.main || []), ...(ch.problem || []), ...(ch.solution || []), ...(ch.levels || []), ...((DEEP[chapterId] || {}).sections || [])];
    for (const s of sections) for (const b of s.blocks) if (b.type === "code" && b.title) add(b.title, b);
    for (const cs of ch.cheatsheet || []) if (cs.type === "code") add(cs.title, cs);
    for (const [lang, snippets] of Object.entries(byLang)) {
      for (const [title, code] of Object.entries(snippets)) {
        const targets = byTitle.get(title);
        if (!targets) { errors.push(`alt/${chapterId}.js: no code block titled "${title}" for ${lang}`); continue; }
        for (const t of targets) t.alt = { ...(t.alt || {}), [lang]: code };
      }
    }
  }
}

/** @type {{ render: (deep: any, opts: any) => string, article: (sections: any[], opts: any) => string, sectionText: (section: any) => string, highlight: (code: string, lang?: string) => string, codeHtml: (code: string, lang?: string, alt?: Record<string, string>) => string } | undefined} */
let renderer;
/**
 * The browser's deep dive renderer (public/shared/deep.js, with shared/highlight.js for code), run once in a sandbox.
 * @param {string} publicDir
 */
export function deepRenderer(publicDir) {
  if (!renderer) {
    /** @type {any} */
    const ctx = vm.createContext({});
    ctx.window = ctx;
    for (const name of ["highlight.js", "deep.js"]) {
      const file = path.join(publicDir, "shared", name);
      vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
    }
    renderer = ctx.DeepRender;
  }
  return /** @type {NonNullable<typeof renderer>} */ (renderer);
}
