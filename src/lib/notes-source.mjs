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
 * @property {string[]} labScripts  the lab scripts (shared labkit.js, then demos*.js), relative to public/
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
  if (fs.existsSync(index)) {
    const html = fs.readFileSync(index, "utf8");
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => path.resolve(dir, m[1]));
    const labScripts = scripts.filter(s => /^(labkit|demos(-part\d+)?)\.js$/.test(path.basename(s))).map(toPublic);
    return { dir, track, slug, legacy: true, scripts, labScripts };
  }
  const names = fs.readdirSync(dir);
  const pick = (/** @type {string} */ prefix) => names
    .filter(n => new RegExp(`^${prefix}(-part\\d+)?\\.js$`).test(n))
    .sort((a, b) => partNumber(a) - partNumber(b))
    .map(n => path.join(dir, n));
  const labs = [path.join(publicDir, "shared", "labkit.js"), ...pick("demos")];
  return { dir, track, slug, legacy: false, scripts: [...pick("data"), ...labs], labScripts: labs.map(toPublic) };
}

/**
 * Runs an app's scripts (except the browser-only app.js) and returns what they define.
 * @param {AppFiles} app
 * @returns {{ DATA: any, DEMOS: Record<string, any>, errors: string[] }}
 */
export function loadApp(app) {
  /** @type {string[]} */
  const errors = [];
  /** @type {any} */
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const file of app.scripts) {
    if (path.basename(file) === "app.js") continue;
    if (!fs.existsSync(file)) { errors.push(`${file}: missing`); continue; }
    try { vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file }); }
    catch (e) { errors.push(`${file}: throws while loading: ${e instanceof Error ? e.message : e}`); }
  }
  return { DATA: ctx.DATA, DEMOS: ctx.DEMOS || {}, errors };
}
