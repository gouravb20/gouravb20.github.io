# System Design · Interactive Notes

Interactive system design study notes in two tracks:

- [`high-level-design/`](high-level-design/index.html): chapter-wise notes for the system design core concepts, the advanced topics, worked problem breakdowns and the books behind modern data and AI systems, plus a slide deck on how databases differ and an in-browser library of the source books.
- [`low-level-design/`](low-level-design/index.html): chapter-wise notes for the languages and building blocks behind well-designed programs, starting with *Mastering Go*, plus an in-browser library of the source books.

It is a plain static site (HTML, CSS and JavaScript, no build step and no dependencies). Open the root `index.html` in a browser to pick a track, or serve the folder with any static host such as GitHub Pages.

## High-level design

| Book | Notes | Chapters | Concepts | Labs | Q&A |
|---|---|---|---|---|---|
| System Design Core Concepts (based on [Hello Interview](https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials)) | [`notes/core-concepts`](high-level-design/notes/core-concepts/index.html) | 18 | 224 | 31 | 115 |
| System Design Advanced Topics (based on [Hello Interview](https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search) and [Arpit Bhayani](https://arpitbhayani.me/blogs/morris-counter/)) | [`notes/advanced-topics`](high-level-design/notes/advanced-topics/index.html) | 10 | 125 | 20 | 54 |
| System Design Problem Breakdowns: YouTube Top K (inspired by [Hello Interview](https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k)) | [`notes/problem-breakdowns`](high-level-design/notes/problem-breakdowns/index.html) | 5 | 50 | 8 | 26 |
| Designing Data-Intensive Applications (Kleppmann) | [`notes/ddia`](high-level-design/notes/ddia/index.html) | 12 | 181 | - | 100 |
| Streaming Systems (Akidau, Chernyak & Lax) | [`notes/streaming-systems`](high-level-design/notes/streaming-systems/index.html) | 10 | 118 | 22 | 82 |
| AI Engineering (Huyen) | [`notes/ai-engineering`](high-level-design/notes/ai-engineering/index.html) | 10 | 119 | 22 | 78 |
| Essential GraphRAG (Bratanič & Hane) | [`notes/graphrag`](high-level-design/notes/graphrag/index.html) | 9 | 97 | 16 | 67 |
| Database Internals, Part I: Storage Engines (Petrov) | [`notes/database-internals`](high-level-design/notes/database-internals/index.html) | 7 | 107 | 23 | 58 |

Paths in the table are relative to `high-level-design/`. Also included:

- [`slides/database-guide`](high-level-design/slides/database-guide/index.html): *A Field Guide to Databases*, a 20-slide deck on OLTP vs OLAP, data models, B-Tree vs LSM-Tree, compute/storage separation and distributed SQL.
- [`books/`](high-level-design/books/index.html): a library page that opens each source PDF in the browser's built-in PDF viewer (`books/index.html#ddia`, `#database-internals`, ...), with links to the notes and downloads. It also holds Alex Xu's *System Design Interview* volumes 1 and 2 (`#sdi-vol1`, `#sdi-vol2`), linked to the core concepts notes.
- [`isolation-anomalies.md`](high-level-design/isolation-anomalies.md): a one-page map of transaction isolation anomalies.

## Low-level design

| Book | Notes | Chapters | Concepts | Labs | Q&A |
|---|---|---|---|---|---|
| Mastering Go, 4th edition (Tsoukalos) | [`notes/mastering-go`](low-level-design/notes/mastering-go/index.html) | 16 | 246 | 47 | 156 |

Paths in the table are relative to `low-level-design/`. Also included:

- [`books/`](low-level-design/books/index.html): the same library viewer as the high-level design track, holding *Mastering Go* (`books/index.html#mastering-go`).

## Features of the notes sites

Every book gets the same app:

- **Core concepts** with definitions, why each one matters and examples. Mark them as learned.
- **Interactive labs**: small simulators built on the book's own examples (watermarks and triggers, B-Tree splits, ARIES recovery, LSM compaction, Bloom filters, KV caches, hybrid search and more).
- **Cheatsheets** with trade-off tables, **interview Q&A** with difficulty levels, and **flashcards**.
- Full-text search (press `/`), light and dark themes, and a mobile layout.
- Progress is saved in `localStorage`, separately for each book. **Export** and **Import** move it between devices. The hub page shows progress for every book.
- Hash routing (`#/ch3/labs/btree`), so any chapter, tab or lab can be bookmarked.

## Running locally

Opening `index.html` directly works. If your browser restricts `file://` pages, serve the folder instead:

```sh
npx http-server .
# or
python -m http.server
```

## Project layout

```
index.html                     landing page: pick high-level or low-level design
high-level-design/
  index.html                   hub page linking every book, the slides and the library
  notes/<book>/
    index.html                 app shell (top bar, sidebar, main area)
    app.js                     shared app: routing, tabs, search, progress, export/import
    styles.css                 shared styles plus any book-specific lab visuals
    labkit.js                  helpers for labs (controls, sliders, SVG charts, formatting)
    data.js, data-part2.js     the book's content (core-concepts also has data-part3.js)
    demos.js, demos-part2.js   the book's labs (core-concepts also has demos-part3.js)
  slides/database-guide/       slide deck
  books/                       source PDFs and the library / viewer page
low-level-design/
  index.html                   hub page linking every book and the library
  notes/<book>/                same app layout as above (mastering-go has data-part1..5.js and demos-part1..5.js)
  books/                       source PDFs and the library / viewer page
```

`app.js`, `labkit.js` and the base of `styles.css` are identical in every notes folder. Fix a bug in one and copy it to the others.

## Adding a book

1. Copy an existing `notes/<book>` folder into the right track (`high-level-design/notes/` or `low-level-design/notes/`). Its Home button links to `../../index.html`, the hub of that track.
2. Rewrite `data.js` (and `data-part2.js` if needed). It sets `window.DATA`:
   - `book`: title, subtitle, `storageKey` (unique per book), `appId`, `exportPrefix`, section titles and the labs intro.
   - `parts`: part number to part name.
   - `fourQuestions`: the four "big idea" cards on the dashboard (`cls`, `q`, `text`, `answer`).
   - `takeaways`: a list of HTML strings.
   - `chapters`: each has `id`, `part`, `number`, `title`, `overview`, `concepts[{term, def, why, ex?, demo?}]`, `cheatsheet[{title, type: table|list|code, ...}]`, `interview[{q, a, diff: easy|medium|hard}]` and `labs[]`.

   Text is raw HTML, so escape `<` as `&lt;`. Only `code` cheatsheet bodies are escaped automatically.
3. Write labs in `demos.js` as `window.DEMOS[id] = { title, blurb, mount(el, ctx) }` and list their ids in each chapter's `labs`.
4. Update the brand and script tags in `index.html`, then add a card to the track's hub `index.html` with `data-key` set to the book's `storageKey` and `data-total` set to its concepts plus Q&A.

## Credits

- The core concepts notes follow the topics of [Hello Interview's system design core concepts](https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials), and the advanced topics notes follow their [advanced topics](https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search) (proximity search, data structures for big data, vector databases, time series databases, change data capture), rewritten as original notes with labs. Read the originals there.
- The problem breakdowns notes cover the same interview problems as [Hello Interview's problem breakdowns](https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k), starting with Top K. They are written independently, with their own explanations, numbers and labs, and do not reproduce the original articles. Read the originals there.
- The Morris counter chapter in the advanced topics notes is based on Arpit Bhayani's essay [Space-Efficient Counting: Exploring Morris' Algorithm](https://arpitbhayani.me/blogs/morris-counter/) and his [Python implementation](https://github.com/arpitbbhayani/morris-counter).
- The DDIA chapter content (concepts, cheatsheets and interview Q&A) is ported from [ddia-notes](https://github.com/tiwari1302/ddia-notes) by Shashank Tiwari, whose site also inspired the design of every notes app here.
- The books belong to their authors and publishers. The notes are personal study material and are no substitute for reading the books.
