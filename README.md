# System Design · Interactive Notes

Chapter-wise interactive study notes for the system design core concepts, the advanced topics and the books behind modern data and AI systems, plus a slide deck on how databases differ and an in-browser library of the source books.

It is a plain static site (HTML, CSS and JavaScript, no build step and no dependencies). Open `index.html` in a browser, or serve the folder with any static host such as GitHub Pages.

## What's inside

| Book | Notes | Chapters | Concepts | Labs | Q&A |
|---|---|---|---|---|---|
| System Design Core Concepts (based on [Hello Interview](https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials)) | [`notes/core-concepts`](notes/core-concepts/index.html) | 18 | 224 | 31 | 115 |
| System Design Advanced Topics (based on [Hello Interview](https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search) and [Arpit Bhayani](https://arpitbhayani.me/blogs/morris-counter/)) | [`notes/advanced-topics`](notes/advanced-topics/index.html) | 10 | 125 | 20 | 54 |
| System Design Problem Breakdowns: YouTube Top K (inspired by [Hello Interview](https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k)) | [`notes/problem-breakdowns`](notes/problem-breakdowns/index.html) | 5 | 50 | 8 | 26 |
| Designing Data-Intensive Applications (Kleppmann) | [`notes/ddia`](notes/ddia/index.html) | 12 | 181 | - | 100 |
| Streaming Systems (Akidau, Chernyak & Lax) | [`notes/streaming-systems`](notes/streaming-systems/index.html) | 10 | 118 | 22 | 82 |
| AI Engineering (Huyen) | [`notes/ai-engineering`](notes/ai-engineering/index.html) | 10 | 119 | 22 | 78 |
| Essential GraphRAG (Bratanič & Hane) | [`notes/graphrag`](notes/graphrag/index.html) | 9 | 97 | 16 | 67 |
| Database Internals, Part I: Storage Engines (Petrov) | [`notes/database-internals`](notes/database-internals/index.html) | 7 | 107 | 23 | 58 |

Also included:

- [`slides/database-guide`](slides/database-guide/index.html): *A Field Guide to Databases*, a 20-slide deck on OLTP vs OLAP, data models, B-Tree vs LSM-Tree, compute/storage separation and distributed SQL.
- [`books/`](books/index.html): a library page that opens each source PDF in the browser's built-in PDF viewer (`books/index.html#ddia`, `#database-internals`, ...), with links to the notes and downloads. It also holds Alex Xu's *System Design Interview* volumes 1 and 2 (`#sdi-vol1`, `#sdi-vol2`), linked to the core concepts notes.

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
index.html                 hub page linking every book, the slides and the library
notes/<book>/
  index.html               app shell (top bar, sidebar, main area)
  app.js                   shared app: routing, tabs, search, progress, export/import
  styles.css               shared styles plus any book-specific lab visuals
  labkit.js                helpers for labs (controls, sliders, SVG charts, formatting)
  data.js, data-part2.js   the book's content (core-concepts also has data-part3.js)
  demos.js, demos-part2.js the book's labs (core-concepts also has demos-part3.js)
slides/database-guide/     slide deck
books/                     source PDFs and the library / viewer page
```

`app.js`, `labkit.js` and the base of `styles.css` are identical in every notes folder. Fix a bug in one and copy it to the others.

## Adding a book

1. Copy an existing `notes/<book>` folder.
2. Rewrite `data.js` (and `data-part2.js` if needed). It sets `window.DATA`:
   - `book`: title, subtitle, `storageKey` (unique per book), `appId`, `exportPrefix`, section titles and the labs intro.
   - `parts`: part number to part name.
   - `fourQuestions`: the four "big idea" cards on the dashboard (`cls`, `q`, `text`, `answer`).
   - `takeaways`: a list of HTML strings.
   - `chapters`: each has `id`, `part`, `number`, `title`, `overview`, `concepts[{term, def, why, ex?, demo?}]`, `cheatsheet[{title, type: table|list|code, ...}]`, `interview[{q, a, diff: easy|medium|hard}]` and `labs[]`.

   Text is raw HTML, so escape `<` as `&lt;`. Only `code` cheatsheet bodies are escaped automatically.
3. Write labs in `demos.js` as `window.DEMOS[id] = { title, blurb, mount(el, ctx) }` and list their ids in each chapter's `labs`.
4. Update the brand and script tags in `index.html`, then add a card to the hub `index.html` with `data-key` set to the book's `storageKey` and `data-total` set to its concepts plus Q&A.

## Credits

- The core concepts notes follow the topics of [Hello Interview's system design core concepts](https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials), and the advanced topics notes follow their [advanced topics](https://www.hellointerview.com/learn/system-design/deep-dives/proximity-search) (proximity search, data structures for big data, vector databases, time series databases, change data capture), rewritten as original notes with labs. Read the originals there.
- The problem breakdowns notes cover the same interview problems as [Hello Interview's problem breakdowns](https://www.hellointerview.com/learn/system-design/problem-breakdowns/top-k), starting with Top K. They are written independently, with their own explanations, numbers and labs, and do not reproduce the original articles. Read the originals there.
- The Morris counter chapter in the advanced topics notes is based on Arpit Bhayani's essay [Space-Efficient Counting: Exploring Morris' Algorithm](https://arpitbhayani.me/blogs/morris-counter/) and his [Python implementation](https://github.com/arpitbbhayani/morris-counter).
- The DDIA chapter content (concepts, cheatsheets and interview Q&A) is ported from [ddia-notes](https://github.com/tiwari1302/ddia-notes) by Shashank Tiwari, whose site also inspired the design of every notes app here.
- The books belong to their authors and publishers. The notes are personal study material and are no substitute for reading the books.
