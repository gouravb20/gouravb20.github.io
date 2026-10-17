import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import fs from "node:fs";
import path from "node:path";

const site = "https://gouravb20.github.io";
const base = "/learn";

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
  // Machine-readable site description (JSON-LD / DCAT), linked from the landing page.
  out.push(`${site}${base}/dataset.jsonld`);
  return out;
}

// GitHub Pages (and `astro preview`) serve public/<dir>/index.html for "<dir>/"; the dev server only serves
// public files by exact path. Match the host in dev.
// By the time Vite middleware runs, Astro has stripped the base from req.url (req.originalUrl keeps it) and
// already answered requests outside the base, so "/" itself still 404s in dev: open /learn/.
function publicDirectoryIndex() {
  return {
    name: "public-directory-index",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [full, query] = (req.originalUrl ?? req.url ?? "").split("?");
        const search = query ? `?${query}` : "";
        if (full === base) {
          res.writeHead(302, { Location: `${base}/${search}` });
          return res.end();
        }
        if (!full.startsWith(`${base}/`)) return next();
        if (!fs.existsSync(path.join("public", decodeURIComponent(full.slice(base.length)), "index.html"))) return next();
        if (!full.endsWith("/")) {
          res.writeHead(301, { Location: `${full}/${search}` });
          return res.end();
        }
        req.url = `${(req.url ?? "").split("?")[0]}index.html${search}`;
        next();
      });
    },
  };
}

// Problem breakdowns used to be split into five chapters per problem (ch1-ch5 Top K, ch6-ch10 Flash Sale).
const breakdowns = "/high-level-design/notes/problem-breakdowns";
const redirects = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [`${breakdowns}/ch${i + 1}`, `${base}${breakdowns}/${i < 5 ? "top-k" : "flash-sale"}/`]),
);

export default defineConfig({
  site,
  base,
  trailingSlash: "ignore",
  build: { format: "directory" },
  redirects,
  integrations: [sitemap({ customPages: publicPages() })],
  vite: { plugins: [publicDirectoryIndex()] },
});
