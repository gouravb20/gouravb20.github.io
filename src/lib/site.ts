import type { CollectionEntry } from "astro:content";

export type Notes = CollectionEntry<"notes">["data"];
export type Chapter = Notes["chapters"][number];

export const SITE_NAME = "System Design Notes";

export const TRACKS: Record<string, string> = {
  "high-level-design": "High-level design",
  "low-level-design": "Low-level design",
  books: "Books",
};

/** Site-absolute URL under the configured base, e.g. url("shared/styles.css") -> "/learn/shared/styles.css". */
export function url(path = ""): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export const appPath = (n: Notes) => `${n.track}/notes/${n.slug}/`;
export const chapterPath = (n: Notes, ch: Chapter) => `${appPath(n)}${ch.id}/`;
/** The site-wide language menu: code with a version in the chosen language shows it; other code shows as written. */
export const CODE_LANGUAGES = [["java", "Java"], ["go", "Go"]] as const;

/** Short sidebar name: the title before the colon ("Logging Service: levels, ..." -> "Logging Service"). */
export const shortName = (title: string) => plain(title).split(":")[0].trim();

/** Problem breakdowns and the low-level design track list chapters by short name; other notes keep full titles. */
export const usesShortNames = (n: Notes, ch: Chapter) => !!ch.problem || n.track === "low-level-design";

/** Labels for a chapter's difficulty badge. */
export const LEVEL_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

/** What one page of an app is called: problem breakdowns have problems, everything else has chapters. */
export const unitNoun = (ch: Chapter, short = false) => (ch.problem ? "Problem" : short ? "Ch" : "Chapter");

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

/**
 * Short glossary label: prefer a trailing abbreviation in parentheses, otherwise the first
 * one or two words before a colon (drop leading a/an/the). Keeps the A–Z list scannable.
 */
export function shortLabel(html: string): string {
  const t = plain(html);
  const abbr = t.match(/\(([A-Za-z][A-Za-z0-9+./-]{1,10})\)\s*$/);
  if (abbr) return abbr[1].toUpperCase() === abbr[1] || abbr[1].length <= 6 ? abbr[1] : abbr[1];
  const head = t.split(":")[0].trim();
  const words = head.split(/[\s/]+/).filter(Boolean);
  while (words.length && /^(a|an|the)$/i.test(words[0])) words.shift();
  if (!words.length) return t.slice(0, 24);
  // Keep "Exact vs approximate" style contrasts as three tokens.
  if (words.length >= 3 && /^vs\.?$/i.test(words[1])) return words.slice(0, 3).join(" ");
  return words.slice(0, 2).join(" ");
}

/** Plain-text summary cut at a word boundary, for meta descriptions. */
export function summary(html: string, max = 158): string {
  const text = plain(html);
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(" ", max - 1)).replace(/[\s,;:.–—-]+$/, "") + "…";
}

/** JSON for an inline <script type="application/ld+json">, safe against "</script>" in the data. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** One row of an app's search.json; `where` is e.g. "Ch 3", `text` is lower-cased plain text to match against. */
export interface SearchItem { where: string; kind: string; title: string; snippet: string; href: string; text: string }

/** Parts in order, skipping any with no chapters yet (e.g. a difficulty level nobody has written a problem for). */
export const sortedParts = (n: Notes) =>
  Object.keys(n.parts).map(Number).filter(p => n.chapters.some(c => c.part === p)).sort((a, b) => a - b);
