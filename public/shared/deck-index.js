/* Slide index for the slide decks.
   Click the counter (bottom right) or press G to list every slide and jump to one.
   Also keeps the URL hash on the current slide (#s7), so a shared link or a reload
   lands on the same slide.
   Needs the deck markup: main#deck > section.slide[id], and #counter showing "n / total".
   Load it after the deck's own script, which keeps #counter up to date. */
(function () {
  "use strict";
  var deck = document.getElementById("deck");
  var counter = document.getElementById("counter");
  var slides = Array.prototype.slice.call(document.querySelectorAll("#deck .slide"));
  if (!deck || !counter || !slides.length) return;

  /* ---------- styles (use the deck's colour tokens, so both themes work) ---------- */
  var css = document.createElement("style");
  css.textContent =
    "#counter{cursor:pointer}" +
    "#counter:hover{border-color:var(--accent);color:var(--accent)}" +
    ".dx-wrap{position:fixed;inset:0;z-index:10050;display:none;align-items:flex-start;justify-content:center;" +
      "padding:max(6vh,16px) 16px calc(16px + env(safe-area-inset-bottom,0px));background:rgba(8,10,16,.55)}" +
    ".dx-wrap.open{display:flex}" +
    ".dx-panel{width:min(780px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;" +
      "background:var(--surface);color:var(--fg);border:1px solid var(--border-strong);border-radius:14px;" +
      "box-shadow:0 24px 64px rgba(0,0,0,.35);font-family:var(--body)}" +
    ".dx-head{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 18px;border-bottom:1px solid var(--border)}" +
    ".dx-title{font-family:var(--display);font-weight:700;font-size:1rem;margin:0}" +
    ".dx-hint{font-family:var(--mono);font-size:.7rem;color:var(--muted);margin-left:auto}" +
    ".dx-close{width:32px;height:32px;border-radius:9px;border:1px solid var(--border-strong);background:var(--surface-2);" +
      "color:var(--fg);cursor:pointer;font-size:15px;line-height:1;display:grid;place-items:center;flex:none}" +
    ".dx-close:hover{border-color:var(--accent);color:var(--accent)}" +
    ".dx-list{list-style:none;margin:0;padding:8px;overflow-y:auto;display:grid;gap:2px 10px;" +
      "grid-template-columns:1fr 1fr;grid-auto-flow:column;grid-template-rows:repeat(var(--dx-rows),auto)}" +
    "@media (max-width:640px){.dx-list{grid-template-columns:1fr;grid-auto-flow:row;grid-template-rows:none}.dx-hint{display:none}}" +
    ".dx-list a{display:grid;grid-template-columns:2.1em 1fr;column-gap:8px;padding:7px 10px;border-radius:9px;" +
      "color:inherit;text-decoration:none;border:1px solid transparent}" +
    ".dx-list a:hover,.dx-list a:focus-visible{background:var(--surface-2);border-color:var(--border-strong);outline:none}" +
    ".dx-list a[aria-current]{background:var(--accent-soft);border-color:var(--accent)}" +
    ".dx-n{font-family:var(--mono);font-size:.74rem;color:var(--faint);padding-top:2px;grid-row:span 2}" +
    ".dx-list a[aria-current] .dx-n{color:var(--accent)}" +
    ".dx-eb{font-family:var(--mono);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}" +
    ".dx-t{font-size:.88rem;font-weight:600;line-height:1.3}";
  document.head.appendChild(css);

  /* ---------- build the list from the slides themselves ---------- */
  function text(el) {
    if (!el) return "";
    var c = el.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll("br"), function (br) { br.replaceWith(" "); });
    return c.textContent.replace(/\s+/g, " ").trim();
  }
  function esc(s) {
    return s.replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; });
  }
  var wrap = document.createElement("div");
  wrap.className = "dx-wrap";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "All slides");
  var rows = Math.ceil(slides.length / 2);
  wrap.innerHTML =
    '<div class="dx-panel"><div class="dx-head"><p class="dx-title">All slides</p>' +
    '<span class="dx-hint">↑ ↓ to move · Enter to open · Esc to close</span>' +
    '<button type="button" class="dx-close" aria-label="Close">✕</button></div>' +
    '<ol class="dx-list" style="--dx-rows:' + rows + '">' +
    slides.map(function (s, i) {
      var eb = text(s.querySelector(".eyebrow"));
      var t = text(s.querySelector("h1, h2")) || eb || "Slide " + (i + 1);
      return '<li><a href="#' + esc(s.id || "") + '" data-i="' + i + '"><span class="dx-n">' + String(i + 1).padStart(2, "0") +
        '</span><span class="dx-eb">' + esc(eb) + '</span><span class="dx-t">' + esc(t) + "</span></a></li>";
    }).join("") +
    "</ol></div>";
  document.body.appendChild(wrap);
  var list = wrap.querySelector(".dx-list");
  var closeBtn = wrap.querySelector(".dx-close");
  var links = Array.prototype.slice.call(list.querySelectorAll("a"));
  var isOpen = false;

  function current() {
    var m = /^\s*(\d+)/.exec(counter.textContent);
    return m ? Math.max(0, Math.min(slides.length - 1, +m[1] - 1)) : 0;
  }
  function show() {
    var c = current();
    links.forEach(function (a, i) {
      if (i === c) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    wrap.classList.add("open");
    isOpen = true;
    counter.setAttribute("aria-expanded", "true");
    links[c].focus();
  }
  function hide() {
    wrap.classList.remove("open");
    isOpen = false;
    counter.setAttribute("aria-expanded", "false");
    counter.focus();
  }
  function jump(i) {
    hide();
    // Jump straight there: a smooth scroll across many snapped slides
    // would walk the counter (and the hash) through every slide in between.
    var before = deck.style.scrollBehavior;
    deck.style.scrollBehavior = "auto";
    slides[i].scrollIntoView({ block: "start" });
    deck.style.scrollBehavior = before;
  }
  function move(i) { links[(i + links.length) % links.length].focus(); }
  function editable(t) {
    return t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  counter.setAttribute("aria-haspopup", "dialog");
  counter.setAttribute("aria-expanded", "false");
  if (!counter.title) counter.title = "All slides (G)";
  counter.addEventListener("click", function () { if (isOpen) hide(); else show(); });
  closeBtn.addEventListener("click", hide);
  wrap.addEventListener("click", function (e) { if (e.target === wrap) hide(); });
  list.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-i]");
    if (!a) return;
    e.preventDefault();
    jump(+a.getAttribute("data-i"));
  });

  // Capture phase on window, so while the list is open the deck's own
  // arrow / Space / Home / End handling never sees the key.
  window.addEventListener("keydown", function (e) {
    var k = e.key, plainG = (k === "g" || k === "G") && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!isOpen) {
      if (plainG && !editable(e.target)) { e.preventDefault(); show(); }
      return;
    }
    var i = links.indexOf(document.activeElement);
    var twoCols = getComputedStyle(list).gridAutoFlow.indexOf("column") === 0;
    if (k === "Escape" || plainG) hide();
    else if (k === "ArrowDown") move(i + 1);
    else if (k === "ArrowUp") move(i < 0 ? links.length - 1 : i - 1);
    else if (k === "ArrowRight" && twoCols) move(Math.min(i + rows, links.length - 1));
    else if (k === "ArrowLeft" && twoCols) move(Math.max(i - rows, 0));
    else if (k === "Home") move(0);
    else if (k === "End") move(links.length - 1);
    else if (k === "Tab") {
      var f = [closeBtn].concat(links), j = f.indexOf(document.activeElement);
      f[(j + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
    else if (k === "PageDown" || k === "PageUp" || k === " ") { e.stopPropagation(); return; } // let the list scroll
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  /* ---------- keep the URL hash on the current slide ---------- */
  // Starts only after load, so the browser's own jump to a deep link (#s11) is not overwritten.
  var syncing = false;
  function syncHash() {
    if (!syncing || !window.history || !history.replaceState) return;
    var i = current(), id = slides[i].id;
    var want = i === 0 || !id ? "" : "#" + id;
    if (location.hash !== want) history.replaceState(null, "", location.pathname + location.search + want);
  }
  new MutationObserver(syncHash).observe(counter, { childList: true, characterData: true, subtree: true });
  function startSync() { setTimeout(function () { syncing = true; syncHash(); }, 400); }
  if (document.readyState === "complete") startSync(); else window.addEventListener("load", startSync);
})();
