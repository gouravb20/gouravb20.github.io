import fs from "node:fs";
import path from "node:path";

const roots = ["public/high-level-design/notes", "public/low-level-design/notes"];
for (const root of roots) {
  for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const f = path.join(root, dir.name, "index.html");
    if (!fs.existsSync(f)) continue;
    let html = fs.readFileSync(f, "utf8");
    if (html.includes("shared/looks.js")) {
      console.log("skip", f);
      continue;
    }
    const next = html.replace(
      /(<link rel="stylesheet" href="((?:\.\.\/)+)shared\/styles\.css">)/,
      (_, full, rel) => `${full}\n  <script src="${rel}shared/looks.js"></script>`,
    );
    if (next === html) {
      console.log("NO MATCH", f);
      continue;
    }
    fs.writeFileSync(f, next);
    console.log("ok", f);
  }
}
