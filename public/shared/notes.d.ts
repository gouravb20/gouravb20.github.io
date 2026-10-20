// Data contract for the notes apps: data*.js fills DATA, demos*.js fills DEMOS, shared/app.js renders both.
// Strings are rendered as HTML unless noted otherwise.

interface NotesData {
  book: Book;
  /** Part number to part title, e.g. `{ 1: "Foundations" }`. Every chapter's `part` must be a key here. */
  parts: Record<number, string>;
  /** The dashboard's pillar cards; `cls` picks the card colour. */
  fourQuestions: { q: string; cls: "what" | "where" | "when" | "how"; text: string; answer: string }[];
  takeaways: string[];
  /** In reading order; data-part*.js files append with `window.DATA.chapters.push(...)`. */
  chapters: Chapter[];
}

interface Book {
  title: string;
  subtitle: string;
  /** localStorage key for progress. Must be unique per app and match the hub card's `data-key`. */
  storageKey: string;
  /** Written into progress exports. */
  appId: string;
  /** File name prefix for progress exports. */
  exportPrefix: string;
  pillarsTitle: string;
  takeawaysTitle: string;
  labsIntro: string;
  /** Top-bar brand for Astro-rendered apps (legacy apps hard-code it in index.html): logo letters, name, tagline. */
  mono?: string;
  shortTitle?: string;
  tagline?: string;
}

interface Chapter {
  /** Used in the URL (`#/<id>/labs`) and as the progress key, so renaming it resets readers' progress. */
  id: string;
  part: number;
  /** Usually 1, 2, 3...; a string for appendices such as "A". */
  number: number | string;
  title: string;
  overview: string;
  /** The page this chapter is based on, shown under the overview as "Reference: <title>". */
  source?: { title: string; url: string };
  /** Shown as a green, yellow or red badge in the sidebar, chapter header and dashboard. */
  difficulty?: "easy" | "medium" | "hard";
  concepts: Concept[];
  /** Keys into DEMOS. */
  labs: string[];
  cheatsheet: Cheatsheet[];
  interview: QA[];
  /**
   * Problem breakdowns only. A chapter with `problem` is one interview problem: its page opens on the Problem tab, then
   * Solution, Deep Dives (its deep/<id>.js), Core Concepts, Interview Q&A, Levels and Cheatsheet, with labs embedded
   * in the sections instead of a Labs tab. Section ids must be unique across the three arrays.
   */
  problem?: DeepSection[];
  solution?: DeepSection[];
  /** What a mid-level, senior and staff candidate is expected to cover. */
  levels?: DeepSection[];
}

interface Concept {
  term: string;
  def: string;
  why?: string;
  ex?: string;
  /** A DEMOS key; adds a "See it live" button that jumps to that lab in whichever chapter lists it. */
  demo?: string;
}

type Cheatsheet = TableSheet | ListSheet | CodeSheet;
interface SheetBase { title: string; note?: string }
interface TableSheet extends SheetBase { type: "table"; headers: string[]; rows: (string | number)[][] }
interface ListSheet extends SheetBase { type: "list"; items: string[] }
/** `body` is plain text, escaped; with `lang` ("java", "go", "json") it is also syntax-highlighted by shared/highlight.js. */
interface CodeSheet extends SheetBase { type: "code"; body: string; lang?: string; alt?: CodeAlternatives }

/** The same code in other languages, by language ("go"). Filled from alt/<chapter id>.js by title; readers pick with the language menu. */
type CodeAlternatives = Record<string, string>;

interface QA {
  q: string;
  a: string;
  /** Shown as the badge text; anything other than "easy" or "hard" is styled as medium. */
  diff?: "easy" | "med" | "medium" | "hard";
}

interface Lab {
  title: string;
  blurb: string;
  mount(el: HTMLElement, ctx: LabContext): void;
}

/** Everything registered here is torn down when the reader leaves the labs tab. */
interface LabContext {
  every(fn: () => void, ms: number): number;
  clear(handle: number): void;
  onCleanup(fn: () => void): void;
}

/**
 * A chapter's long-form Deep Dive, in `notes/<book>/deep/<chapter id>.js`:
 * `window.DEEP = window.DEEP || {}; DEEP.ch5 = { ... };`. Rendered by shared/deep.js.
 * Authoring guide: "Writing a deep dive" in README.md.
 */
interface DeepDive {
  /** One to three paragraphs that make the chapter's problem felt. */
  hook: string;
  sections: DeepSection[];
  /** 4-8 lessons to remember. */
  takeaways: string[];
  /** Only link URLs that certainly exist; otherwise leave `url` out. */
  furtherReading?: { title: string; url?: string; note?: string }[];
}

interface DeepSection {
  /** Lowercase slug, unique in the chapter; in URLs and progress, so don't rename it. */
  id: string;
  title: string;
  /** Small label above the title, e.g. "Motivation". */
  kicker?: string;
  blocks: DeepBlock[];
}

type DeepBlock =
  | { type: "text"; html: string }
  | { type: "problem" | "idea" | "analogy"; html: string; title?: string }
  | { type: "callout"; tone: "insight" | "warning" | "interview" | "history" | "modern" | "tip" | "mistake"; html: string; title?: string }
  /** Inline SVG with a viewBox; colours only through the --dg-* variables. */
  | { type: "diagram"; svg: string; title?: string; caption?: string }
  | { type: "realworld"; items: { org: string; title?: string; html: string }[]; title?: string }
  | { type: "tradeoffs"; pros: string[]; cons: string[]; prosLabel?: string; consLabel?: string; title?: string }
  | { type: "compare"; items: { title: string; html: string; tone?: "ok" | "bad" | "warn" | "info" }[]; title?: string }
  | { type: "table"; headers: string[]; rows: (string | number)[][]; title?: string; note?: string }
  /** `code` is plain text, escaped; `lang` "java", "go" or "json" adds syntax highlighting. */
  | { type: "code"; code: string; lang?: string; alt?: CodeAlternatives; title?: string; caption?: string }
  | { type: "steps" | "keypoints" | "list"; items: string[]; title?: string }
  /** `answer` is the index of the correct option. */
  | { type: "quiz"; q: string; options: string[]; answer: number; explain: string }
  /** Mounts one of the book's labs (a DEMOS key) inside the section. */
  | { type: "lab"; id: string; caption?: string };

declare var DATA: NotesData;
declare var DEMOS: Record<string, Lab>;
declare var DEEP: Record<string, DeepDive>;
/** alt/<chapter id>.js: ALT[chapterId][lang][code block title] = code. */
declare var ALT: Record<string, Record<string, Record<string, string>>>;
