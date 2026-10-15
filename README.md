# System Design · Interactive Notes

Interactive system design study notes in two tracks, published at [gouravb20.github.io/system-design](https://gouravb20.github.io/system-design/):

- [`high-level-design/`](public/high-level-design/index.html): chapter-wise notes for the system design core concepts, the advanced topics, worked problem breakdowns and the books behind modern data and AI systems, plus a slide deck on how databases differ and an in-browser library of the source books.
- [`low-level-design/`](public/low-level-design/index.html): chapter-wise notes for the languages and building blocks behind well-designed programs, starting with *Mastering Go*, plus an in-browser library of the source books.

The site is built with [Astro](https://astro.build) as plain static HTML. Most pages are still the original hand-written static site, served unchanged from `public/`. Notes apps are being moved, one at a time, from single-page apps to Astro-rendered pages (one real page per chapter, so search engines can index them); Problem Breakdowns is the first.

## High-level design

| Book | Notes | Chapters | Concepts | Labs | Q&A |
|---|---|---|---|---|---|
| System Design Core Concepts (based on [Hello Interview](https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials)) | [`notes/core-concepts`](public/high-level-design/notes/core-concepts/index.html) | 18 | 228 | 31 | 116 |
| System Design Advanced Topics (based on [Hello Interview](https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search) and [Arpit Bhayani](https://arpitbhayani.me/blogs/morris-counter/)) | [`notes/advanced-topics`](public/high-level-design/notes/advanced-topics/index.html) | 10 | 125 | 20 | 54 |
| System Design Problem Breakdowns: YouTube Top K (inspired by [Hello Interview](https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k)) | [`notes/problem-breakdowns`](public/high-level-design/notes/problem-breakdowns/) | 5 | 50 | 8 | 26 |
| Designing Data-Intensive Applications (Kleppmann) | [`notes/ddia`](public/high-level-design/notes/ddia/index.html) | 12 | 181 | - | 100 |
| Streaming Systems (Akidau, Chernyak & Lax) | [`notes/streaming-systems`](public/high-level-design/notes/streaming-systems/index.html) | 10 | 118 | 22 | 82 |
| AI Engineering (Huyen) | [`notes/ai-engineering`](public/high-level-design/notes/ai-engineering/index.html) | 10 | 119 | 22 | 78 |
| Essential GraphRAG (Bratanič & Hane) | [`notes/graphrag`](public/high-level-design/notes/graphrag/index.html) | 9 | 97 | 16 | 67 |
| Database Internals, Part I: Storage Engines (Petrov) | [`notes/database-internals`](public/high-level-design/notes/database-internals/index.html) | 7 | 107 | 23 | 58 |

Paths in the table are relative to `public/high-level-design/`. Also included:

- [`slides/database-guide`](public/high-level-design/slides/database-guide/index.html): *A Field Guide to Databases*, a 20-slide deck on OLTP vs OLAP, data models, B-Tree vs LSM-Tree, compute/storage separation and distributed SQL.
- [`books/`](public/high-level-design/books/index.html): a library page that opens each source PDF in the browser's built-in PDF viewer (`books/index.html#ddia`, `#database-internals`, ...), with links to the notes and downloads. It also holds Alex Xu's *System Design Interview* volumes 1 and 2 (`#sdi-vol1`, `#sdi-vol2`), linked to the core concepts notes.
- [`isolation-anomalies.md`](public/high-level-design/isolation-anomalies.md): a one-page map of transaction isolation anomalies.

## Low-level design

| Book | Notes | Chapters | Concepts | Labs | Q&A |
|---|---|---|---|---|---|
| Mastering Go, 4th edition (Tsoukalos) | [`notes/mastering-go`](public/low-level-design/notes/mastering-go/index.html) | 16 | 246 | 47 | 156 |

Paths in the table are relative to `public/low-level-design/`. Also included:

- [`books/`](public/low-level-design/books/index.html): the same library viewer as the high-level design track, holding *Mastering Go* (`books/index.html#mastering-go`).

## Features of the notes sites

Every book gets the same app:

- **Core concepts** with definitions, why each one matters and examples. Mark them as learned, and filter a chapter's cards by text or by to learn / learned.
- **Interactive labs**: small simulators built on the book's own examples (watermarks and triggers, B-Tree splits, ARIES recovery, LSM compaction, Bloom filters, KV caches, hybrid search and more).
- **Cheatsheets** with trade-off tables, and **interview Q&A** with difficulty levels (answers stay collapsed until opened). Filter questions by difficulty, hide the ones you've reviewed, or expand them all.
- **Self-test**: hide the definitions on the Concepts tab and reveal one card at a time.
- **Glossary**: every term in the book A to Z, filterable by text and by chapter, with your learned terms ticked.
- **All cheatsheets on one page**, with a print stylesheet for a compact black-on-white copy (or a PDF).
- A **Continue** card on the dashboard that opens the first unfinished chapter, starting from the one you read last.
- Full-text search (press `/`; every word must match, title hits rank first, <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd> pick a result), <kbd>j</kbd> / <kbd>k</kbd> for the next / previous chapter, light and dark themes, and a mobile layout.
- Progress is saved in `localStorage`, separately for each book. **Export** and **Import** move it between devices. The hub page shows progress for every book.
- Bookmarkable chapters, tabs and labs. Astro-rendered apps use real URLs (`problem-breakdowns/ch2/#lab-servingStrategy`, `problem-breakdowns/glossary/`); single-page apps use hash routes (`#/ch3/labs/btree`, `#/glossary`, `#/cheatsheet`). When an app moves to Astro, its old hash links redirect to the new pages and saved progress carries over.
- Astro-rendered apps also get per-page titles, descriptions, canonical URLs, Open Graph tags, structured data (Course, LearningResource, BreadcrumbList) and a sitemap. Their content is in the HTML, so it reads fine without JavaScript; only labs and progress tracking need it.

## Running locally

Requires Node.js 22.12 or later.

```sh
npm install
npm run dev        # http://localhost:4321/system-design/ (rebuilds as you edit)
npm run build      # writes the site to dist/
npm run preview    # serves dist/ exactly as GitHub Pages will
```

Every URL lives under `/system-design/`, as on GitHub Pages, so the dev server's bare `http://localhost:4321/` is a 404.

## Project layout

```
public/                        served as-is under /system-design/
  index.html                   landing page: pick high-level or low-level design
  shared/                      used by every notes app in both tracks
    app.js                     single-page app shell: routing, tabs, search, progress, export/import
    styles.css                 styles, including every book's lab visuals
    labkit.js                  helpers for labs (controls, sliders, SVG charts, formatting)
    notes.d.ts                 types for DATA and DEMOS
  high-level-design/
    index.html                 hub page linking every book, the slides and the library
    notes/<book>/
      index.html               single-page apps only: page markup and script tags
      data.js, data-part2.js   the book's content (core-concepts also has data-part3.js)
      demos.js, demos-part2.js the book's labs (core-concepts also has demos-part3.js)
    slides/database-guide/     slide deck
    books/                     source PDFs and the library / viewer page
  low-level-design/            same layout (mastering-go has data-part1..5.js and demos-part1..5.js)
src/
  content.config.ts            loads every Astro-rendered app's data*.js and demos*.js, validates them with Zod
  lib/notes-source.mjs         finds notes apps and runs their scripts; shared with scripts/check-site.mjs
  layouts/NotesLayout.astro    page shell: SEO tags, top bar, chapter sidebar
  pages/[track]/notes/[app]/   dashboard, one page per chapter, glossary/, cheatsheet/ and search.json
  scripts/notes-client.ts      browser side: progress, tabs, labs, self-test, search, theme, import/export
scripts/check-site.mjs         checks data, labs, counts and links (see below)
```

A notes folder with an `index.html` is a single-page app served as-is. A folder without one is rendered by Astro from the same `data*.js` and `demos*.js` files.

## Checking the site

```sh
npm run check                        # astro check, build, then scripts/check-site.mjs
node scripts/check-site.mjs --fix    # after a build: also rewrite stale counts on the hubs and in this README
```

`astro check` type-checks the Astro pages, the client script and every `data*.js` file (against `public/shared/notes.d.ts`, via `tsconfig.json`). The build also validates every Astro-rendered app against a Zod schema. The check script loads every notes app the way the browser does and reports:

- labs listed in a chapter, or linked from a concept, that no demos file defines;
- duplicate chapter ids, unknown parts, missing `DATA.book` fields, and `storageKey`s used by two apps;
- hub cards whose `data-key` doesn't match the app's `storageKey`, or whose `data-total` is stale;
- stale counts: any element with `data-count="chapters|concepts|labs|qa|slides|books"` and a `data-src` folder, plus README table rows that link a notes app;
- links in the built site (including the library's PDF paths) and in this README that don't resolve, matching case exactly as GitHub Pages does.

All of it runs in CI on pull requests and pushes to `main` (`.github/workflows/check.yml`); pull requests also get a downloadable build of the site.

## Adding a book

1. Copy an existing `notes/<book>` folder into the right track (`public/high-level-design/notes/` or `public/low-level-design/notes/`). Copy one without an `index.html` (such as `problem-breakdowns`) to get Astro pages.
2. Rewrite `data.js` (and `data-part2.js` if needed). It sets `window.DATA`, typed in `public/shared/notes.d.ts`:
   - `book`: title, subtitle, `storageKey` (unique per book), `appId`, `exportPrefix`, section titles, the labs intro, and for Astro apps the top-bar brand (`mono`, `shortTitle`, `tagline`).
   - `parts`: part number to part name.
   - `fourQuestions`: the four "big idea" cards on the dashboard (`cls`, `q`, `text`, `answer`).
   - `takeaways`: a list of HTML strings.
   - `chapters`: each has `id`, `part`, `number`, `title`, `overview`, `concepts[{term, def, why, ex?, demo?}]`, `cheatsheet[{title, type: table|list|code, ...}]`, `interview[{q, a, diff: easy|med|hard}]` and `labs[]`.

   Text is raw HTML, so escape `<` as `&lt;`. Only `code` cheatsheet bodies are escaped automatically.
3. Write labs in `demos.js` as `window.DEMOS[id] = { title, blurb, mount(el, ctx) }` and list their ids in each chapter's `labs`.
4. Add a card to the track's hub `index.html` with `data-key` set to the book's `storageKey`. Copy the `data-count` markup from an existing card, add a README table row, then run `npm run build` and `node scripts/check-site.mjs --fix` to fill in `data-total` and every count.

## Moving a single-page app to Astro

1. Add `mono`, `shortTitle` and `tagline` to the app's `DATA.book` (the logo letters, name and tagline from its `index.html` top bar).
2. Delete the app's `index.html`. Nothing else moves: Astro now renders the folder from its `data*.js` and `demos*.js` (in part order, with `shared/labkit.js` before the demos).
3. Run `npm run check`. The Zod schema in `src/content.config.ts` is stricter than the single-page app, so fix anything it reports.
4. Open the app in `npm run dev` and try the labs. Hub links to `notes/<book>/index.html` keep working, old `#/chN/...` links redirect, and readers keep their progress.

## Deploying

Pages is published by `.github/workflows/deploy.yml` on every push to `main` (or run it by hand from the Actions tab). It relies on **Settings → Pages → Build and deployment → Source** being **GitHub Actions**; publishing the branch directly would serve the repository root, while the site lives in `public/` and `src/`.

Search engines read `robots.txt` only at the domain root, so it lives in the [gouravb20.github.io](https://github.com/gouravb20/gouravb20.github.io) repository. It keeps crawlers off the book PDFs (`Disallow: /system-design/*.pdf$`).

## Credits

- The core concepts notes follow the topics of [Hello Interview's system design core concepts](https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials), and the advanced topics notes follow their [advanced topics](https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search) (proximity search, data structures for big data, vector databases, time series databases, change data capture), rewritten as original notes with labs. Read the originals there.
- The problem breakdowns notes cover the same interview problems as [Hello Interview's problem breakdowns](https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k), starting with Top K. They are written independently, with their own explanations, numbers and labs, and do not reproduce the original articles. Read the originals there.
- The Morris counter chapter in the advanced topics notes is based on Arpit Bhayani's essay [Space-Efficient Counting: Exploring Morris' Algorithm](https://arpitbhayani.me/blogs/morris-counter/) and his [Python implementation](https://github.com/arpitbbhayani/morris-counter).
- The DDIA chapter content (concepts, cheatsheets and interview Q&A) is ported from [ddia-notes](https://github.com/tiwari1302/ddia-notes) by Shashank Tiwari, whose site also inspired the design of every notes app here.
- The books belong to their authors and publishers. The notes are personal study material and are no substitute for reading the books.
