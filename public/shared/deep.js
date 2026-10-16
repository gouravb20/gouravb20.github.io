// Deep Dive renderer, shared by the single-page apps (in the browser) and the Astro pages (at build time,
// through src/lib/notes-source.mjs). Turns a DeepDive (typed in shared/notes.d.ts) into HTML; no DOM access.
(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const titled = (title, cls = "deep-block-title") => (title ? `<div class="${cls}">${title}</div>` : "");
  const LABELS = {
    problem: "The problem", idea: "The key idea", analogy: "Analogy",
    insight: "Insight", warning: "Watch out", interview: "Interview angle", history: "History",
    modern: "Since the book", tip: "Tip", mistake: "Common mistake",
  };

  /**
   * @param {DeepBlock} b
   * @param {{ labInfo: (id: string) => { title: string, blurb: string } | undefined }} opts
   */
  function block(b, opts) {
    switch (b.type) {
      case "text":
        return `<div class="deep-text">${b.html}</div>`;
      case "problem":
      case "idea":
      case "analogy":
        return `<div class="deep-callout deep-${b.type}"><div class="deep-callout-label">${b.title || LABELS[b.type]}</div>${b.html}</div>`;
      case "callout":
        return `<div class="deep-callout deep-tone-${b.tone}"><div class="deep-callout-label">${b.title || LABELS[b.tone] || "Note"}</div>${b.html}</div>`;
      case "diagram":
        return `<figure class="deep-diagram">${titled(b.title)}<div class="deep-svg">${b.svg}</div>${b.caption ? `<figcaption>${b.caption}</figcaption>` : ""}</figure>`;
      case "realworld":
        return `<div class="deep-realworld">${titled(b.title || "In the real world")}<div class="deep-cards">${b.items.map(it =>
          `<div class="deep-card"><div class="deep-card-org">${it.org}</div>${it.title ? `<div class="deep-card-title">${it.title}</div>` : ""}<div class="deep-card-body">${it.html}</div></div>`).join("")}</div></div>`;
      case "tradeoffs":
        return `<div class="deep-tradeoffs">${titled(b.title || "Trade-offs")}<div class="deep-two">` +
          `<div class="deep-pros"><div class="deep-col-label">${b.prosLabel || "You gain"}</div><ul>${b.pros.map(p => `<li>${p}</li>`).join("")}</ul></div>` +
          `<div class="deep-cons"><div class="deep-col-label">${b.consLabel || "You pay"}</div><ul>${b.cons.map(p => `<li>${p}</li>`).join("")}</ul></div></div></div>`;
      case "compare":
        return `<div class="deep-compare">${titled(b.title)}<div class="deep-cards">${b.items.map(it =>
          `<div class="deep-card${it.tone ? ` tone-${it.tone}` : ""}"><div class="deep-card-title">${it.title}</div><div class="deep-card-body">${it.html}</div></div>`).join("")}</div></div>`;
      case "table":
        return `<div class="deep-table">${titled(b.title)}<div class="deep-table-wrap"><table><thead><tr>${b.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
          b.rows.map(r => `<tr>${r.map((c, i) => `<td data-label="${esc(String(b.headers[i] || "").replace(/<[^>]+>/g, ""))}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${b.note ? `<div class="cs-note">${b.note}</div>` : ""}</div>`;
      case "code":
        return `<figure class="deep-code">${titled(b.title)}<pre${b.lang ? ` data-lang="${esc(b.lang)}"` : ""}><code>${esc(b.code)}</code></pre>${b.caption ? `<figcaption>${b.caption}</figcaption>` : ""}</figure>`;
      case "steps":
        return `<div class="deep-steps">${titled(b.title)}<ol>${b.items.map(it => `<li>${it}</li>`).join("")}</ol></div>`;
      case "keypoints":
        return `<div class="deep-keypoints">${titled(b.title || "Key points")}<ul>${b.items.map(it => `<li>${it}</li>`).join("")}</ul></div>`;
      case "list":
        return `<div class="deep-text">${titled(b.title, "deep-list-title")}<ul>${b.items.map(it => `<li>${it}</li>`).join("")}</ul></div>`;
      case "quiz":
        return `<div class="deep-quiz" data-answer="${b.answer}"><div class="deep-callout-label">Check yourself</div><div class="dq-q">${b.q}</div>` +
          `<div class="dq-options">${b.options.map((o, i) => `<button class="dq-option" data-i="${i}">${o}</button>`).join("")}</div>` +
          `<div class="dq-explain" hidden>${b.explain}</div></div>`;
      case "lab": {
        const lab = opts.labInfo(b.id);
        if (!lab) return "";
        return `<figure class="lab-card deep-lab"><div class="lab-head"><span class="lab-tag">Try it</span><h3>${lab.title}</h3></div>` +
          `<div class="lab-blurb">${b.caption || lab.blurb}</div><div class="lab-body" data-lab="${esc(b.id)}"></div></figure>`;
      }
      default:
        return "";
    }
  }

  /**
   * @param {DeepDive} deep
   * @param {{
   *   sectionHref: (id: string) => string,
   *   labInfo: (id: string) => { title: string, blurb: string } | undefined,
   *   done?: (id: string) => boolean,
   * }} opts
   */
  function render(deep, opts) {
    const done = opts.done || (() => false);
    const toc = deep.sections.map((s, i) =>
      `<li class="${done(s.id) ? "done" : ""}" data-sec="${esc(s.id)}"><a href="${opts.sectionHref(s.id)}" data-sec-link="${esc(s.id)}"><span class="toc-num">${i + 1}</span><span class="toc-title">${s.title}</span><span class="toc-check" aria-hidden="true">&#10003;</span></a></li>`).join("");
    const sections = deep.sections.map((s, i) => `
      <section class="deep-section${done(s.id) ? " done" : ""}" id="learn-${esc(s.id)}" data-sec="${esc(s.id)}">
        ${s.kicker ? `<div class="deep-kicker">${s.kicker}</div>` : ""}
        <h2 class="deep-h2"><span class="deep-num">${i + 1}</span>${s.title}</h2>
        ${s.blocks.map(b => block(b, opts)).join("\n")}
        <div class="deep-section-foot"><button class="section-done${done(s.id) ? " on" : ""}" data-sec="${esc(s.id)}" aria-pressed="${done(s.id)}">${done(s.id) ? "&#10003; Understood" : "Mark as understood"}</button></div>
      </section>`).join("");
    const reading = (deep.furtherReading || []).map(r =>
      `<li>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${r.title}</a> &#8599;` : `<strong>${r.title}</strong>`}${r.note ? ` <span class="muted">${r.note}</span>` : ""}</li>`).join("");
    return `<div class="deep">
      <nav class="deep-toc" aria-label="Sections"><div class="deep-toc-title">In this deep dive <span class="deep-toc-count"></span></div><ol>${toc}</ol></nav>
      <div class="deep-hook">${deep.hook}</div>
      ${sections}
      ${deep.takeaways.length ? `<div class="deep-takeaways"><h2>Key takeaways</h2><ol>${deep.takeaways.map(t => `<li>${t}</li>`).join("")}</ol></div>` : ""}
      ${reading ? `<div class="deep-reading"><h2>Further reading</h2><ul>${reading}</ul></div>` : ""}
    </div>`;
  }

  /** Plain text of a section, for search. */
  function sectionText(s) {
    const parts = [s.title];
    for (const b of s.blocks) {
      if ("html" in b) parts.push(b.html);
      if ("items" in b) parts.push(...b.items.map(it => (typeof it === "string" ? it : `${it.org || ""} ${it.title || ""} ${it.html}`)));
      if (b.type === "tradeoffs") parts.push(...b.pros, ...b.cons);
      if (b.type === "table") parts.push(...b.headers, ...b.rows.flat().map(String));
      if (b.type === "quiz") parts.push(b.q, ...b.options, b.explain);
      if (b.type === "diagram" || b.type === "code") parts.push(b.caption || "");
    }
    return parts.join(" ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  window.DeepRender = { render, sectionText };
})();
