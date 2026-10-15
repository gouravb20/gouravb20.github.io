import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { chapterPath, plain, url, type Notes, type SearchItem } from "../../../../lib/site";

export const getStaticPaths = (async () => {
  const all = await getCollection("notes");
  return all.map(e => ({ params: { track: e.data.track, app: e.data.slug }, props: { notes: e.data } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const notes = props.notes as Notes;
  const items: SearchItem[] = [];
  const clip = (html: string, more = false) => { const t = plain(html); return t.length > 120 ? t.slice(0, 120) + (more ? "..." : "") : t; };
  for (const ch of notes.chapters) {
    const at = (hash: string) => `${url(chapterPath(notes, ch))}#${hash}`;
    const add = (kind: string, title: string, snippet: string, href: string, ...parts: (string | undefined)[]) =>
      items.push({ n: ch.number, kind, title, snippet, href, text: plain(parts.filter(Boolean).join(" ")).toLowerCase() });
    for (const c of ch.concepts) add("Concept", c.term, clip(c.def), at("concepts"), c.term, c.def, c.why, c.ex);
    for (const id of ch.labs) { const l = notes.labInfo[id]; add("Lab", l.title, clip(l.blurb), at(`lab-${id}`), l.title, l.blurb); }
    for (const q of ch.interview) add("Q&A", q.q, clip(q.a, true), at("interview"), q.q, q.a);
    for (const cs of ch.cheatsheet) add("Cheatsheet", cs.title, "", at("cheatsheet"), cs.title);
  }
  return new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json" } });
};
