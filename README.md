# System Design · Interactive Notes

Interactive system design study notes in four sections, published at [gouravb20.github.io/learn](https://gouravb20.github.io/learn/). A hamburger menu at the top left of every hub page opens a panel with all four:

- [`high-level-design/`](public/high-level-design/index.html): chapter-wise notes for the system design core concepts, the advanced topics and worked problem breakdowns.
- [`low-level-design/`](public/low-level-design/index.html): notes on the building blocks of well-designed programs. Coming soon.
- [`books/`](public/books/index.html): chapter-wise notes for the books behind modern data, AI and Go programs, plus a library that opens every source PDF in the browser.
- [`slides/`](public/slides/index.html): slide decks and visual guides.

The site is built with [Astro](https://astro.build) as plain static HTML. Most pages are still the original hand-written static site, served unchanged from `public/`. Notes apps are being moved, one at a time, from single-page apps to Astro-rendered pages (one real page per chapter, so search engines can index them); Problem Breakdowns is the first.

## High-level design

| Book | Notes | Chapters | Concepts | Labs | Q&A |
|---|---|---|---|---|---|
| System Design Core Concepts (based on [Hello Interview](https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials)) | [`notes/core-concepts`](public/high-level-design/notes/core-concepts/index.html) | 18 | 228 | 31 | 116 |
| System Design Advanced Topics (based on [Hello Interview](https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search) and [Arpit Bhayani](https://arpitbhayani.me/blogs/morris-counter/)) | [`notes/advanced-topics`](public/high-level-design/notes/advanced-topics/index.html) | 10 | 125 | 20 | 54 |
| System Design Problem Breakdowns: YouTube Top K (inspired by [Hello Interview](https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k)) | [`notes/problem-breakdowns`](public/high-level-design/notes/problem-breakdowns/) | 5 | 50 | 8 | 26 |

Paths in the table are relative to `public/high-level-design/`. Also included: [`isolation-anomalies.md`](public/high-level-design/isolation-anomalies.md), a one-page map of transaction isolation anomalies.

## Low-level design

Coming soon. The *Mastering Go* notes that used to live here are now in Books.

## Books

| Book | Notes | Chapters | Concepts | Labs | Q&A |
|---|---|---|---|---|---|
| Designing Data-Intensive Applications (Kleppmann) | [`notes/ddia`](public/books/notes/ddia/index.html) | 12 | 181 | - | 100 |
| Streaming Systems (Akidau, Chernyak & Lax) | [`notes/streaming-systems`](public/books/notes/streaming-systems/index.html) | 10 | 118 | 22 | 82 |
| AI Engineering (Huyen) | [`notes/ai-engineering`](public/books/notes/ai-engineering/index.html) | 10 | 119 | 22 | 78 |
| Essential GraphRAG (Bratanič & Hane) | [`notes/graphrag`](public/books/notes/graphrag/index.html) | 9 | 97 | 16 | 67 |
| Database Internals, Part I: Storage Engines (Petrov) | [`notes/database-internals`](public/books/notes/database-internals/index.html) | 7 | 107 | 23 | 58 |
| Mastering Go, 4th edition (Tsoukalos) | [`notes/mastering-go`](public/books/notes/mastering-go/index.html) | 16 | 246 | 47 | 156 |
| Software Architecture: The Hard Parts (Ford, Richards, Sadalage & Dehghani) | [`notes/architecture-hard-parts`](public/books/notes/architecture-hard-parts/) | 15 | 135 | 14 | 75 |

Paths in the table are relative to `public/books/`. The [Books page](public/books/index.html) lists these notes, then a library that opens each source PDF in the browser's built-in PDF viewer (`books/index.html#ddia`, `#mastering-go`, ...), with links to the notes and downloads. The library also holds Alex Xu's *System Design Interview* volumes 1 and 2 (`#sdi-vol1`, `#sdi-vol2`, linked to the core concepts notes), *Software Architecture: The Hard Parts*, *Learning SPARQL* and *Staff Engineer*.

## Slides

- [`slides/database-guide`](public/slides/database-guide/index.html): *A Field Guide to Databases*, a 20-slide deck on OLTP vs OLAP, data models, B-Tree vs LSM-Tree, compute/storage separation and distributed SQL.
## Features of the notes sites

Every book gets the same app:

- **Deep Dive** for every chapter: a long-form explanation that starts from the problem each idea solves, with diagrams, the book's labs embedded where they fit, real-world systems, trade-offs, interview angles and one-question self-checks. Mark sections as understood as you go.
- **Core concepts** with definitions, why each one matters and examples. Mark them as learned, and filter a chapter's cards by text or by to learn / learned.
- **Interactive labs**: small simulators built on the book's own examples (watermarks and triggers, B-Tree splits, ARIES recovery, LSM compaction, Bloom filters, KV caches, hybrid search and more).
- **Cheatsheets** with trade-off tables, and **interview Q&A** with difficulty levels (answers stay collapsed until opened). Filter questions by difficulty, hide the ones you've reviewed, or expand them all.
- **Self-test**: hide the definitions on the Concepts tab and reveal one card at a time.
- **Glossary**: every term in the book A to Z, filterable by text and by chapter, with your learned terms ticked.
- **All cheatsheets on one page**, with a print stylesheet for a compact black-on-white copy (or a PDF).
- A **Continue** card on the dashboard that opens the first unfinished chapter, starting from the one you read last.
- Full-text search (press `/`; every word must match, title hits rank first, <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd> pick a result), <kbd>j</kbd> / <kbd>k</kbd> for the next / previous chapter, light and dark themes, and a mobile layout.
- Progress is saved in `localStorage`, separately for each book. The hub pages show progress for every set of notes.
- Bookmarkable chapters, tabs and labs. Astro-rendered apps use real URLs (`problem-breakdowns/ch2/#lab-servingStrategy`, `problem-breakdowns/glossary/`); single-page apps use hash routes (`#/ch3/labs/btree`, `#/glossary`, `#/cheatsheet`). When an app moves to Astro, its old hash links redirect to the new pages and saved progress carries over.
- Astro-rendered apps also get per-page titles, descriptions, canonical URLs, Open Graph tags, structured data (Course, LearningResource, BreadcrumbList) and a sitemap. Their content is in the HTML, so it reads fine without JavaScript; only labs and progress tracking need it.

## Running locally

Requires Node.js 22.12 or later.

```sh
npm install
npm run dev        # http://localhost:4321/learn/ (rebuilds as you edit)
npm run build      # writes the site to dist/
npm run preview    # serves dist/ exactly as GitHub Pages will
```

Every URL lives under `/learn/`, as on GitHub Pages, so the dev server's bare `http://localhost:4321/` is a 404.

## Project layout

```
public/                        served as-is under /learn/
  index.html                   landing page: pick a section
  shared/                      used by every page
    sitenav.js                 hamburger menu: a panel over the page linking the four sections
    app.js                     single-page app shell: routing, tabs, search, progress, export/import
    styles.css                 styles, including every book's lab visuals
    labkit.js                  helpers for labs (controls, sliders, SVG charts, formatting)
    notes.d.ts                 types for DATA and DEMOS
  high-level-design/
    index.html                 hub page linking core concepts, advanced topics and problem breakdowns
    notes/<app>/
      index.html               single-page apps only: page markup and script tags
      data.js, data-part2.js   the app's content (core-concepts also has data-part3.js)
      demos.js, demos-part2.js the app's labs (core-concepts also has demos-part3.js)
  low-level-design/index.html  coming-soon page
  books/
    index.html                 book notes, then the library / PDF viewer
    notes/<book>/              same layout as above (mastering-go has data-part1..5.js and demos-part1..5.js)
    <topic>/*.pdf              source PDFs
  slides/
    index.html                 list of decks
    database-guide/            slide deck
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

1. Copy an existing `notes/<book>` folder into the right section (`public/high-level-design/notes/` for topic notes, `public/books/notes/` for a book's notes). Copy one without an `index.html` (such as `problem-breakdowns`) to get Astro pages.
2. Rewrite `data.js` (and `data-part2.js` if needed). It sets `window.DATA`, typed in `public/shared/notes.d.ts`:
   - `book`: title, subtitle, `storageKey` (unique per book), `appId`, `exportPrefix`, section titles, the labs intro, and for Astro apps the top-bar brand (`mono`, `shortTitle`, `tagline`).
   - `parts`: part number to part name.
   - `fourQuestions`: the four "big idea" cards on the dashboard (`cls`, `q`, `text`, `answer`).
   - `takeaways`: a list of HTML strings.
   - `chapters`: each has `id`, `part`, `number`, `title`, `overview`, `concepts[{term, def, why, ex?, demo?}]`, `cheatsheet[{title, type: table|list|code, ...}]`, `interview[{q, a, diff: easy|med|hard}]` and `labs[]`.

   Text is raw HTML, so escape `<` as `&lt;`. Only `code` cheatsheet bodies are escaped automatically.
3. Write labs in `demos.js` as `window.DEMOS[id] = { title, blurb, mount(el, ctx) }` and list their ids in each chapter's `labs`.
4. Add a card to the track's hub `index.html` with `data-key` set to the book's `storageKey`. Copy the `data-count` markup from an existing card, add a README table row, then run `npm run build` and `node scripts/check-site.mjs --fix` to fill in `data-total` and every count.

## Writing a deep dive

Each chapter's **Deep Dive** tab is a long-form explanation in `notes/<book>/deep/<chapter id>.js`:

```js
window.DEEP = window.DEEP || {};
DEEP.ch16 = { hook: `<p>...</p>`, sections: [{ id: "the-ring", title: "...", kicker: "The key idea", blocks: [...] }], takeaways: [...], furtherReading: [...] };
```

The format is typed in `public/shared/notes.d.ts` (`DeepDive`), rendered by `public/shared/deep.js` (in the browser for single-page apps, at build time for Astro pages) and loaded only when a reader opens the chapter. [`core-concepts/deep/ch16.js`](public/high-level-design/notes/core-concepts/deep/ch16.js) is a complete example.

- **Teach in order:** the problem (what breaks without the idea), the key idea in a sentence or two, how it works, a diagram or one of the book's labs, real systems that use it, trade-offs, the interview angle, and a one-question quiz that tests understanding rather than recall.
- **Blocks:** `text`, `problem`, `idea`, `analogy`, `callout` (tones `insight`, `warning`, `interview`, `history`, `modern`, `tip`, `mistake`), `diagram` (inline SVG), `realworld`, `tradeoffs`, `compare`, `table`, `code`, `steps`, `keypoints`, `list`, `quiz` and `lab` (mounts one of the book's labs inside the section).
- **Write original explanations.** Never copy sentences from the books or from other sites; quote at most a short phrase, with attribution. Only state facts, numbers and incidents you are sure are true and publicly documented, and only link URLs you are sure exist.
- **Diagrams:** an `<svg>` with a `viewBox` (at most 640 wide) and no fixed width, font sizes of 12 or more, and colours only through the `--dg-*` variables (`--dg-1` to `--dg-6`, each with `-soft`, plus `--dg-ok`, `--dg-bad`, `--dg-ink`, `--dg-muted`, `--dg-line`, `--dg-panel`) so both themes work. Prefix marker and gradient ids with the book and chapter (`cc16-arrow`), because every diagram on a page shares one id namespace.
- Section ids are in URLs and saved progress ("Mark as understood"), so don't rename them once published.

Check deep dives without building: `node scripts/check-deep.mjs [book folder]`. `npm run check` runs the same checks, and `astro check` type-checks the files.

## Moving a single-page app to Astro

1. Add `mono`, `shortTitle` and `tagline` to the app's `DATA.book` (the logo letters, name and tagline from its `index.html` top bar).
2. Delete the app's `index.html`. Nothing else moves: Astro now renders the folder from its `data*.js` and `demos*.js` (in part order, with `shared/labkit.js` before the demos).
3. Run `npm run check`. The Zod schema in `src/content.config.ts` is stricter than the single-page app, so fix anything it reports.
4. Open the app in `npm run dev` and try the labs. Hub links to `notes/<book>/index.html` keep working, old `#/chN/...` links redirect, and readers keep their progress.

## Deploying

Pages is published by `.github/workflows/deploy.yml` on every push to `main` (or run it by hand from the Actions tab). It relies on **Settings → Pages → Build and deployment → Source** being **GitHub Actions**; publishing the branch directly would serve the repository root, while the site lives in `public/` and `src/`.

Search engines read `robots.txt` only at the domain root, so it lives in the [gouravb20.github.io](https://github.com/gouravb20/gouravb20.github.io) repository. It keeps crawlers off the book PDFs (`Disallow: /learn/*.pdf$`) and advertises this site's sitemap (`Sitemap: …/learn/sitemap-index.xml`) so pages can be discovered without waiting for inbound links. Hub pages also ship canonical URLs, Open Graph tags, JSON-LD (`WebSite` / `Dataset` / `CollectionPage`), and a machine-readable [`dataset.jsonld`](public/dataset.jsonld). After deploy, submit the sitemap once in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters) if you want indexing sooner.

## Credits

- The core concepts notes follow the topics of [Hello Interview's system design core concepts](https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials), and the advanced topics notes follow their [advanced topics](https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search) (proximity search, data structures for big data, vector databases, time series databases, change data capture), rewritten as original notes with labs. Read the originals there.
- The problem breakdowns notes cover the same interview problems as [Hello Interview's problem breakdowns](https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k), starting with Top K. They are written independently, with their own explanations, numbers and labs, and do not reproduce the original articles. Read the originals there.
- The Morris counter chapter in the advanced topics notes is based on Arpit Bhayani's essay [Space-Efficient Counting: Exploring Morris' Algorithm](https://arpitbhayani.me/blogs/morris-counter/) and his [Python implementation](https://github.com/arpitbbhayani/morris-counter).
- The DDIA chapter content (concepts, cheatsheets and interview Q&A) is ported from [ddia-notes](https://github.com/tiwari1302/ddia-notes) by Shashank Tiwari, whose site also inspired the design of every notes app here.
- The books belong to their authors and publishers. The notes are personal study material and are no substitute for reading the books.
