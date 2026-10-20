// Validates an app's deep dives (deep/<chapter id>.js). Shared by scripts/check-site.mjs and scripts/check-deep.mjs.
// The format is typed in public/shared/notes.d.ts; Astro apps are also checked by the Zod schema in src/content.config.ts.
import path from "node:path";

const TONES = ["insight", "warning", "interview", "history", "modern", "tip", "mistake"];
const CARD_TONES = ["ok", "bad", "warn", "info"];
// Tags whose opening and closing counts must match in every HTML string.
const PAIRED = ["p", "ul", "ol", "li", "strong", "em", "b", "i", "code", "h3", "h4", "a", "span", "table", "thead", "tbody", "tr", "td", "th", "pre", "div", "sup", "sub"];

/** @param {any} v */
const isText = v => typeof v === "string" && v.trim().length > 0;
/** @param {any} v */
const isTextArray = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every(isText);

/** @param {string} html */
function unbalanced(html) {
  const bad = [];
  for (const tag of PAIRED) {
    const open = (html.match(new RegExp(`<${tag}(?=[\\s>])[^>]*>`, "gi")) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    if (open !== close) bad.push(`<${tag}> ${open} open / ${close} closed`);
  }
  return bad;
}

/**
 * @param {{ name: string, DATA: any, DEMOS: Record<string, any>, DEEP: Record<string, any>, deepFiles: Record<string, string>, deepScripts: string[] }} app
 * @returns {{ problems: string[], warnings: string[], stats: { chapters: number, sections: number, words: number } }}
 */
export function checkDeep(app) {
  /** @type {string[]} */
  const problems = [], warnings = [];
  const stats = { chapters: 0, sections: 0, words: 0 };
  const chapters = new Map((app.DATA?.chapters || []).map((/** @type {any} */ ch) => [ch.id, ch]));

  const definedBy = new Map(Object.entries(app.deepFiles).map(([id, f]) => [f, id]));
  for (const file of app.deepScripts) {
    const want = path.basename(file, ".js");
    const got = definedBy.get(file);
    if (!got) problems.push(`${app.name}: deep/${path.basename(file)} doesn't set DEEP["${want}"]`);
    else if (got !== want) problems.push(`${app.name}: deep/${path.basename(file)} sets DEEP["${got}"]; the file must be named after the chapter id it defines`);
  }

  /** @param {string} where */
  const reporter = where => {
    const p = (/** @type {string} */ msg) => problems.push(`${where}: ${msg}`);
    /** @param {any} v @param {string} at */
    const html = (v, at) => {
      if (!isText(v)) { p(`${at}: missing HTML`); return; }
      const bad = unbalanced(v);
      if (bad.length) p(`${at}: unbalanced HTML (${bad.join(", ")})`);
      stats.words += v.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    };
    return { p, html, where };
  };

  for (const [id, deep] of Object.entries(app.DEEP)) {
    const r = reporter(`${app.name} deep/${id}.js`), { p, html } = r;
    if (!chapters.has(id)) p(`no chapter has id "${id}"`);
    if (!deep || typeof deep !== "object") { p("DEEP entry is not an object"); continue; }
    stats.chapters++;
    html(deep.hook, "hook");
    if (!Array.isArray(deep.takeaways)) p("takeaways must be an array");
    else deep.takeaways.forEach((/** @type {any} */ t, /** @type {number} */ i) => html(t, `takeaways[${i}]`));
    for (const [i, r] of (deep.furtherReading || []).entries()) {
      if (!isText(r.title)) p(`furtherReading[${i}] needs a title`);
      if (r.url != null && !/^https?:\/\/\S+$/.test(r.url)) p(`furtherReading[${i}].url is not an absolute URL`);
    }
    if (!Array.isArray(deep.sections) || !deep.sections.length) { p("needs at least one section"); continue; }
    checkSections(deep.sections, r);
  }

  // A chapter's Main tab, and a problem breakdown's Problem, Solution and By Level tabs, use the same section format.
  for (const ch of chapters.values()) {
    if (ch.main != null) {
      const r = reporter(`${app.name} main/${ch.id}.js`);
      if (!Array.isArray(ch.main) || !ch.main.length) r.p("needs at least one section");
      else checkSections(ch.main, r);
    }
    const tabs = ["problem", "solution", "levels"];
    if (!tabs.some(t => ch[t] != null)) continue;
    for (const t of tabs) {
      const r = reporter(`${app.name} ${ch.id}.${t}`);
      if (!Array.isArray(ch[t]) || !ch[t].length) r.p("a problem breakdown needs at least one section here");
      else checkSections(ch[t], r);
    }
  }

  /** @param {any[]} sections @param {ReturnType<typeof reporter>} r */
  function checkSections(sections, { p, html, where }) {
    const seen = new Set();
    for (const [si, s] of sections.entries()) {
      const at = `section ${s?.id || si}`;
      stats.sections++;
      if (!s || !/^[a-z0-9-]+$/.test(s.id || "")) p(`${at}: id must be a lowercase slug`);
      else if (seen.has(s.id)) p(`${at}: duplicate section id`);
      seen.add(s?.id);
      if (!isText(s?.title)) p(`${at}: missing title`);
      if (!Array.isArray(s?.blocks) || !s.blocks.length) { p(`${at}: needs blocks`); continue; }
      for (const [bi, b] of s.blocks.entries()) {
        const bat = `${at} block ${bi} (${b?.type})`;
        const need = (/** @type {any} */ cond, /** @type {string} */ msg) => { if (!cond) p(`${bat}: ${msg}`); };
        switch (b?.type) {
          case "text": html(b.html, bat); break;
          case "problem": case "idea": case "analogy": html(b.html, bat); break;
          case "callout": need(TONES.includes(b.tone), `tone must be one of ${TONES.join(", ")}`); html(b.html, bat); break;
          case "diagram":
            need(/^\s*(<style[\s\S]*?<\/style>\s*)?<svg[\s\S]*<\/svg>\s*$/.test(b.svg || ""), "svg must be a single <svg>...</svg> element");
            need(/viewBox=/.test(b.svg || ""), "svg needs a viewBox");
            need(!/<svg[^>]*\swidth="\d/.test(b.svg || ""), "svg must not set a fixed width (it scales to the column)");
            if (/(fill|stroke)(="|:\s*)#[0-9a-f]{3,6}/i.test(b.svg || "")) warnings.push(`${where}: ${bat}: hard-coded colour; use the --dg-* variables so both themes work`);
            for (const m of (b.svg || "").matchAll(/font-size="(\d+(?:\.\d+)?)"/g)) if (Number(m[1]) < 11) { warnings.push(`${where}: ${bat}: font-size ${m[1]} is too small to read on a phone`); break; }
            if (b.caption != null) html(b.caption, `${bat} caption`);
            break;
          case "realworld":
            need(Array.isArray(b.items) && b.items.length > 0, "needs items");
            for (const it of b.items || []) { need(isText(it.org), "every item needs an org"); html(it.html, bat); }
            break;
          case "tradeoffs": need(isTextArray(b.pros) && isTextArray(b.cons), "needs pros[] and cons[]"); [...(b.pros || []), ...(b.cons || [])].forEach((/** @type {any} */ x) => html(x, bat)); break;
          case "compare":
            need(Array.isArray(b.items) && b.items.length >= 2, "needs at least two items");
            for (const it of b.items || []) { need(isText(it.title), "every item needs a title"); need(it.tone == null || CARD_TONES.includes(it.tone), `tone must be one of ${CARD_TONES.join(", ")}`); html(it.html, bat); }
            break;
          case "table":
            need(Array.isArray(b.headers) && b.headers.length > 0, "needs headers");
            need(Array.isArray(b.rows) && b.rows.length > 0, "needs rows");
            for (const r of b.rows || []) need(Array.isArray(r) && r.length === b.headers.length, `every row needs ${b.headers?.length} cells`);
            break;
          case "code": need(isText(b.code), "needs code"); break;
          case "steps": case "keypoints": case "list": need(isTextArray(b.items), "needs items[]"); (b.items || []).forEach((/** @type {any} */ x) => html(x, bat)); break;
          case "quiz":
            need(isText(b.q) && isTextArray(b.options, 2), "needs q and at least two options");
            need(Number.isInteger(b.answer) && b.answer >= 0 && b.answer < (b.options || []).length, "answer must be the index of an option");
            html(b.explain, `${bat} explain`);
            break;
          case "lab": need(!!app.DEMOS[b.id], `lab "${b.id}" is not defined in any demos file`); break;
          default: p(`${bat}: unknown block type`);
        }
      }
    }
  }

  for (const id of chapters.keys()) if (!app.DEEP[id]) warnings.push(`${app.name}: chapter ${id} has no deep dive yet`);
  return { problems, warnings, stats };
}
