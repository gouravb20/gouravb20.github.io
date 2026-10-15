#!/usr/bin/env node
// Checks the deep dives of every notes app, or only the apps whose folder path contains the given text:
//   node scripts/check-deep.mjs                 every app
//   node scripts/check-deep.mjs ddia            public/high-level-design/notes/ddia
// No build needed. scripts/check-site.mjs runs the same checks.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDeep } from "../src/lib/deep-check.mjs";
import { findApps, loadApp } from "../src/lib/notes-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filter = process.argv[2] || "";
let failed = false;
for (const app of findApps(path.join(ROOT, "public"))) {
  const name = path.relative(ROOT, app.dir).split(path.sep).join("/");
  if (!name.includes(filter)) continue;
  const loaded = loadApp(app);
  const { problems, warnings, stats } = checkDeep({ name, ...loaded, deepScripts: app.deepScripts });
  problems.unshift(...loaded.errors.map(e => `${name}: ${e}`));
  console.log(`${name}: ${stats.chapters}/${loaded.DATA?.chapters?.length ?? 0} chapters, ${stats.sections} sections, ~${stats.words} words`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  for (const p of problems) console.log(`  problem: ${p}`);
  if (problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
