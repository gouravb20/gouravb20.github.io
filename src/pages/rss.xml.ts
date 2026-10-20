import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import fs from "node:fs";
import path from "node:path";
import { findApps } from "../lib/notes-source.mjs";
import { SITE_NAME, TRACKS, chapterPath, plain, summary, url, type Notes } from "../lib/site";

/** Newest mtime among an app's data / deep / alt scripts — used as each chapter's pubDate. */
function appMtimes(publicDir: string): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const app of findApps(publicDir)) {
    if (app.legacy) continue;
    const files = [...app.scripts.filter(s => /^data(-part\d+)?\.js$/i.test(path.basename(s))), ...app.deepScripts];
    const altDir = path.join(app.dir, "alt");
    if (fs.existsSync(altDir)) {
      for (const name of fs.readdirSync(altDir)) if (name.endsWith(".js")) files.push(path.join(altDir, name));
    }
    let newest = 0;
    for (const file of files) {
      try { newest = Math.max(newest, fs.statSync(file).mtimeMs); } catch { /* missing file */ }
    }
    if (newest) out.set(`${app.track}/${app.slug}`, new Date(newest));
  }
  return out;
}

export const GET: APIRoute = async context => {
  // process.cwd() is the project root in both `astro dev` and `astro build` prerender.
  const mtimes = appMtimes(path.join(process.cwd(), "public"));
  const all = await getCollection("notes");

  const items = all.flatMap(entry => {
    const notes = entry.data as Notes;
    const bookTitle = plain(notes.book.shortTitle ?? notes.book.title);
    const track = TRACKS[notes.track] ?? notes.track;
    const pubDate = mtimes.get(`${notes.track}/${notes.slug}`);
    return notes.chapters.map(ch => ({
      title: `${bookTitle}: ${plain(ch.title)}`,
      description: summary(ch.overview, 280),
      link: url(chapterPath(notes, ch)),
      categories: [track, bookTitle],
      ...(pubDate ? { pubDate } : {}),
    }));
  });

  items.sort((a, b) => {
    const ta = a.pubDate?.getTime() ?? 0;
    const tb = b.pubDate?.getTime() ?? 0;
    return tb - ta || a.title.localeCompare(b.title);
  });

  // Channel <link> should be the notes site (/learn/), not the domain root.
  const site = new URL(import.meta.env.BASE_URL, context.site);

  return rss({
    title: SITE_NAME,
    description:
      "Interactive system design study notes: high-level design, low-level design, and book notes with labs, glossaries and interview Q&A.",
    site,
    items,
    customData: "<language>en-us</language>",
    trailingSlash: true,
  });
};
