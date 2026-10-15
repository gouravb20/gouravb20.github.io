import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import fs from "node:fs";
import path from "node:path";

const site = "https://gouravb20.github.io";
const base = "/system-design";

// The sitemap plugin only knows Astro's own pages; list the static pages served from public/ too.
function publicPages(dir = "public", out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) publicPages(p, out);
    else if (e.name.endsWith(".html")) {
      const rel = path.relative("public", p).split(path.sep).join("/").replace(/(^|\/)index\.html$/, "$1");
      out.push(`${site}${base}/${rel}`);
    }
  }
  return out;
}

export default defineConfig({
  site,
  base,
  trailingSlash: "ignore",
  build: { format: "directory" },
  integrations: [sitemap({ customPages: publicPages() })],
});
