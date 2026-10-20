// Syntax highlighting for code blocks. Exposes window.CodeHighlight.highlight(code, lang) -> HTML.
// Pure string work, no DOM: deep.js uses it at build time (in a sandbox) and labs use it in the browser.
// Languages: java, go, json. Anything else comes back escaped and uncoloured.
(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const span = (cls, text) => `<span class="tok-${cls}">${esc(text)}</span>`;
  const words = s => new Set(s.split(/\s+/).filter(Boolean));
  const NUMBER = /(\b0[xX][\da-fA-F_]+[lLiu]*\b|\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[lLfFdDi]?\b)/.source;

  /**
   * A tokenizer for C-family languages. Comments and strings are matched first, so words inside them stay uncoloured.
   * Identifiers become keywords, built-in types, constants, types (Capitalised), or functions (followed by "(").
   */
  function cFamily({ strings, annotations, keywords, types = words(""), constants = words(""), builtins = words(""), capitalisedIsType }) {
    const re = new RegExp([
      /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.source,              // 1 comment
      `(${strings})`,                                      // 2 string
      annotations ? /(@[A-Za-z_]\w*)/.source : "((?!))",   // 3 annotation (a group that never matches keeps numbering)
      NUMBER,                                              // 4 number
      /([A-Za-z_$][\w$]*)/.source                          // 5 identifier
    ].join("|"), "g");
    return code => {
      let out = "", last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(code))) {
        out += esc(code.slice(last, m.index));
        last = re.lastIndex;
        if (m[1]) out += span("com", m[1]);
        else if (m[2]) out += span("str", m[2]);
        else if (m[3]) out += span("ann", m[3]);
        else if (m[4]) out += span("num", m[4]);
        else {
          const id = m[5], call = /^\s*\(/.test(code.slice(last)), allCaps = /^[A-Z][A-Z0-9_]+$/.test(id);
          if (keywords.has(id)) out += span("kw", id);
          else if (constants.has(id)) out += span("num", id);
          else if (types.has(id)) out += span("type", id);
          else if (builtins.has(id) && call) out += span("fn", id);
          else if (capitalisedIsType(id, call, allCaps)) out += span("type", id);
          else if (call) out += span("fn", id);
          else if (allCaps) out += span("num", id);
          else out += esc(id);
        }
      }
      return out + esc(code.slice(last));
    };
  }

  const java = cFamily({
    strings: /"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)'/.source,
    annotations: true,
    keywords: words(`abstract assert boolean break byte case catch char class const continue default do double else enum
      extends final finally float for goto if implements import instanceof int interface long native new package private
      protected public return short static strictfp super switch synchronized this throw throws transient try void
      volatile while var record sealed permits yield`),
    constants: words("true false null"),
    capitalisedIsType: (id, call, allCaps) => /^[A-Z]/.test(id) && !allCaps          // Map, HashMap; not MAX_SIZE
  });

  const go = cFamily({
    strings: /`[^`]*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)+'/.source,
    annotations: false,
    keywords: words(`break case chan const continue default defer else fallthrough for func go goto if import interface
      map package range return select struct switch type var`),
    types: words(`any bool byte comparable complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune
      string uint uint8 uint16 uint32 uint64 uintptr`),
    constants: words("true false nil iota"),
    builtins: words("append cap clear close complex copy delete imag len make max min new panic print println real recover"),
    capitalisedIsType: (id, call) => /^[A-Z]/.test(id) && !call                      // http.Client; but fmt.Println( is a call
  });

  const JSON_RE = /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g;
  function json(code) {
    let out = "", last = 0, m;
    JSON_RE.lastIndex = 0;
    while ((m = JSON_RE.exec(code))) {
      out += esc(code.slice(last, m.index));
      last = JSON_RE.lastIndex;
      if (m[1]) out += m[2] ? span("fn", m[1]) + esc(m[2]) : span("str", m[1]);
      else if (m[3]) out += span("num", m[3]);
      else out += span("kw", m[4]);
    }
    return out + esc(code.slice(last));
  }

  const LANGS = { java, go, json };
  function highlight(code, lang) {
    const fn = LANGS[String(lang || "").toLowerCase()];
    return fn ? fn(String(code)) : esc(code);
  }

  window.CodeHighlight = { highlight, languages: Object.keys(LANGS) };
})();
