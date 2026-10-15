import type { CollectionEntry } from "astro:content";

export type Notes = CollectionEntry<"notes">["data"];
export type Chapter = Notes["chapters"][number];

export const SITE_NAME = "System Design Notes";

export const TRACKS: Record<string, string> = {
  "high-level-design": "High-level design",
  "low-level-design": "Low-level design",
};

/** Site-absolute URL under the configured base, e.g. url("shared/styles.css") -> "/system-design/shared/styles.css". */
export function url(path = ""): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export const appPath = (n: Notes) => `${n.track}/notes/${n.slug}/`;
export const chapterPath = (n: Notes, ch: Chapter) => `${appPath(n)}${ch.id}/`;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", mdash: "—", ndash: "–",
  rarr: "→", larr: "←", harr: "↔", times: "×", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

/** HTML snippet from the data files -> plain text (for titles, meta descriptions and search). */
export function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain-text summary cut at a word boundary, for meta descriptions. */
export function summary(html: string, max = 158): string {
  const text = plain(html);
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(" ", max - 1)).replace(/[\s,;:.–—-]+$/, "") + "…";
}

/** JSON for an inline <script type="application/ld+json">, safe against "</script>" in the data. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** One row of an app's search.json; `text` is lower-cased plain text to match against. */
export interface SearchItem { n: string | number; kind: string; title: string; snippet: string; href: string; text: string }

export const sortedParts = (n: Notes) => Object.keys(n.parts).map(Number).sort((a, b) => a - b);
