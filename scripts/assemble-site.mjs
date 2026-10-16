#!/usr/bin/env node
// Builds the GitHub Pages root for the user site gouravb20.github.io.
// The portfolio (home/) is served at /. The notes build (dist/) is served at /learn/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const home = path.join(root, "home");
const out = path.join(root, "site");

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("dist/ is missing. Run npm run build first.");
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(home, out, { recursive: true });
fs.cpSync(dist, path.join(out, "learn"), { recursive: true });
console.log("Assembled site/: portfolio at / and notes at /learn/.");
