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
  concepts: Concept[];
  /** Keys into DEMOS. */
  labs: string[];
  cheatsheet: Cheatsheet[];
  interview: QA[];
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
/** `body` is shown as escaped plain text. */
interface CodeSheet extends SheetBase { type: "code"; body: string }

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

declare var DATA: NotesData;
declare var DEMOS: Record<string, Lab>;
