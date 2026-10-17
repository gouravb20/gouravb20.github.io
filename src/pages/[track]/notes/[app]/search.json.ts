import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import path from "node:path";
import { deepRenderer } from "../../../../lib/notes-source.mjs";
import { chapterPath, plain, unitNoun, url, type Notes, type SearchItem } from "../../../../lib/site";

export const getStaticPaths = (async () => {
  const all = await getCollection("notes");
  return all.map(e => ({ params: { track: e.data.track, app: e.data.slug }, props: { notes: e.data } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const notes = props.notes as Notes;
  const renderer = deepRenderer(path.join(process.cwd(), "public"));
  const items: SearchItem[] = [];
  const clip = (html: string, more = false) => { const t = plain(html); return t.length > 120 ? t.slice(0, 120) + (more ? "..." : "") : t; };
  for (const ch of notes.chapters) {
    const where = `${unitNoun(ch, true)} ${ch.number}`;
    const at = (hash: string) => `${url(chapterPath(notes, ch))}#${hash}`;
    const add = (kind: string, title: string, snippet: string, href: string, ...parts: (string | undefined)[]) =>
      items.push({ where, kind, title, snippet, href, text: plain(parts.filter(Boolean).join(" ")).toLowerCase() });
    const sections = (kind: string, prefix: string, list: typeof ch.problem = []) => {
      for (const s of list) {
        const title = plain(s.title), text = renderer.sectionText(s);
        add(kind, title, text.slice(title.length + 1, title.length + 121), at(`${prefix}-${s.id}`), text);
      }
    };
    sections("Problem", "problem", ch.problem);
    sections("Solution", "solution", ch.solution);
    sections("Deep dive", "learn", notes.deep[ch.id]?.sections);
    sections("By level", "levels", ch.levels);
    for (const c of ch.concepts) add("Concept", c.term, clip(c.def), at("concepts"), c.term, c.def, c.why, c.ex);
    for (const id of ch.labs) { const l = notes.labInfo[id]; add("Lab", l.title, clip(l.blurb), at(`lab-${id}`), l.title, l.blurb); }
    for (const q of ch.interview) add("Q&A", q.q, clip(q.a, true), at("interview"), q.q, q.a);
    for (const cs of ch.cheatsheet) add("Cheatsheet", cs.title, "", at("cheatsheet"), cs.title);
  }
  return new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json" } });
};
