// Mastering Go - interactive labs, part 2 (chapters 4-6). Depends on labkit.js.
(function () {
  "use strict";
  const K = window.LabKit;
  const { esc, clamp, sum, round, seg, wireSegs, rng, wireRanges, ctl, stat, note, hbars, svgWrap, fmtNum, fmtBytes, pct, mulberry32 } = K;
  const D = window.DEMOS;
  const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;
  const pblock = (cls, head, body) => `<div class="pblock ${cls}"><div class="pblock-h">${head}</div><pre>${esc(body)}</pre></div>`;
  const tok = (cls, txt) => `<span class="tok ${cls}">${esc(String(txt))}</span>`;
  const btn = (act, label) => `<button class="lab-btn" data-act="${act}">${label}</button>`;
  // Code panel with one highlighted line (0-based); lines are plain text.
  const codePanel = (head, lines, hot, cls) => `<div class="pblock ${cls || `ctx`}"><div class="pblock-h">${head}</div><pre>${lines.map((l, i) => i === hot ? `<span class="tok c2 hot">${esc(l)}</span>` : esc(l)).join(`\n`)}</pre></div>`;
  const goNum = v => {
    if (typeof v !== `number`) return String(v);
    if (Number.isInteger(v)) return String(v);
    return String(round(v, 6));
  };

  // =====================================================================
  // Ch4 - Constraint checker
  // =====================================================================
  const C4_TYPES = {
    int: { label: `int`, decl: ``, under: `int`, cmp: true, vals: [`4`, `3`], sum: `7`, max: `4`, eq: `false`, elems: `3` },
    AnotherInt: { label: `AnotherInt`, decl: `type AnotherInt int`, under: `int`, cmp: true, vals: [`AnotherInt(4)`, `AnotherInt(3)`], sum: `7`, max: `4`, eq: `false`, elems: `3` },
    float64: { label: `float64`, decl: ``, under: `float64`, cmp: true, vals: [`4.1`, `3.2`], sum: `7.3`, max: `4.1`, eq: `false` },
    Celsius: { label: `Celsius`, decl: `type Celsius float64`, under: `float64`, cmp: true, vals: [`Celsius(21.5)`, `Celsius(19)`], sum: `40.5`, max: `21.5`, eq: `false` },
    string: { label: `string`, decl: ``, under: `string`, cmp: true, vals: [`"aa"`, `"bb"`], sum: `aabb`, max: `bb`, eq: `false` },
    bool: { label: `bool`, decl: ``, under: `bool`, cmp: true, vals: [`true`, `true`], eq: `true` },
    arr: { label: `[2]int`, decl: ``, under: `[2]int`, cmp: true, vals: [`[2]int{1, 2}`, `[2]int{1, 3}`], eq: `false` },
    Point: { label: `Point`, decl: `type Point struct{ X, Y int }`, under: `struct{ X, Y int }`, cmp: true, vals: [`Point{1, 2}`, `Point{1, 2}`], eq: `true` },
    slice: { label: `[]int`, decl: ``, under: `[]int`, cmp: false, vals: [`[]int{1, 2}`, `[]int{1, 3}`] },
    map: { label: `map[string]int`, decl: ``, under: `map[string]int`, cmp: false, vals: [`map[string]int{"a": 1}`, `map[string]int{"a": 1}`] }
  };
  const C4_PRINT = { int: [`4`, `3`], AnotherInt: [`4`, `3`], float64: [`4.1`, `3.2`], Celsius: [`21.5`, `19`], string: [`aa`, `bb`], bool: [`true`, `true`], arr: [`[1 2]`, `[1 3]`], Point: [`{1 2}`, `{1 2}`], slice: [`[1 2]`, `[1 3]`], map: [`map[a:1]`, `map[a:1]`] };
  const NUMERIC = [`int`, `int8`, `int16`, `int32`, `int64`, `float64`];
  const ORDERED = [`int`, `int8`, `int16`, `int32`, `int64`, `uint`, `uint8`, `uint16`, `uint32`, `uint64`, `uintptr`, `float32`, `float64`, `string`];
  function c4Constraints(tilde) {
    return {
      any: { label: `any`, decl: `// any is predeclared: interface{}`, func: `func PrintSlice[T any](s []T) {\n    for _, v := range s {\n        fmt.Print(v, " ")\n    }\n}`, call: (v, T) => `PrintSlice([]${T}{${v[0]}, ${v[1]}})` },
      comparable: { label: `comparable`, decl: `// comparable is predeclared`, func: `func Same[T comparable](a, b T) bool {\n    return a == b\n}`, call: v => `fmt.Println(Same(${v[0]}, ${v[1]}))` },
      Numeric: { label: `Numeric`, terms: NUMERIC, tilde, decl: `type Numeric interface {\n    ${NUMERIC.map(t => (tilde ? `~` : ``) + t).join(` | `)}\n}`, func: `func Add[T Numeric](a, b T) T {\n    return a + b\n}`, call: v => `fmt.Println(Add(${v[0]}, ${v[1]}))` },
      AllInts: { label: `AllInts`, terms: [`int`], tilde: true, decl: `type AllInts interface {\n    ~int\n}`, func: `func AddElements[T AllInts](s []T) T {\n    sum := T(0)\n    for _, v := range s {\n        sum = sum + v\n    }\n    return sum\n}`, call: (v, T) => `fmt.Println(AddElements([]${T}{0, 1, 2}))` },
      Ordered: { label: `cmp.Ordered`, terms: ORDERED, tilde: true, decl: `// package cmp\ntype Ordered interface {\n    ~int | ~int8 | ... | ~float64 | ~string\n}`, func: `func Biggest[T cmp.Ordered](a, b T) T {\n    return max(a, b)\n}`, call: v => `fmt.Println(Biggest(${v[0]}, ${v[1]}))` }
    };
  }
  function c4Check(tk, ck, cons) {
    const t = C4_TYPES[tk], c = cons[ck];
    if (ck === `any`) return { ok: true, out: C4_PRINT[tk].join(` `) + ` ` };
    if (ck === `comparable`) return t.cmp ? { ok: true, out: t.eq } : { ok: false, err: `${t.label} does not satisfy comparable` };
    const exact = c.terms.includes(t.label);
    const under = c.terms.includes(t.under);
    const ok = c.tilde ? under : exact;
    const termList = c.terms.map(x => (c.tilde ? `~` : ``) + x).join(` | `);
    if (!ok) {
      if (!c.tilde && under) return { ok: false, err: `${t.label} does not satisfy ${c.label} (possibly missing ~ for ${t.under} in ${c.label})` };
      return { ok: false, err: `${t.label} does not satisfy ${c.label} (${t.label} missing in ${termList})` };
    }
    if (ck === `Numeric`) return { ok: true, out: t.sum };
    if (ck === `AllInts`) return { ok: true, out: t.elems };
    return { ok: true, out: t.max };
  }
  D.c04Constraints = {
    title: `Constraint checker: which type arguments compile?`,
    blurb: `Pick a type argument and a constraint from the chapter (<code>any</code>, <code>comparable</code>, the book's <code>Numeric</code> union, <code>AllInts</code> with <code>~int</code>, and <code>cmp.Ordered</code>). The lab shows the generic function, the call, and either the program's output or the compiler error you would get. Then switch on <code>~</code> in <code>Numeric</code> and watch named types like <code>AnotherInt</code> and <code>Celsius</code> get accepted.`,
    mount(el) {
      const st = { t: `AnotherInt`, c: `Numeric`, tilde: `off` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`type argument T`, seg(`t`, Object.keys(C4_TYPES).map(k => [k, esc(C4_TYPES[k].label)]), st.t))}</div>
        <div class="ctl-row">${ctl(`constraint`, seg(`c`, [[`any`, `any`], [`comparable`, `comparable`], [`Numeric`, `Numeric`], [`AllInts`, `AllInts (~int)`], [`Ordered`, `cmp.Ordered`]], st.c))}${ctl(`Numeric uses ~`, seg(`tilde`, [[`off`, `no (book)`], [`on`, `yes`]], st.tilde))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Source</h4><div data-k="src"></div></div>
          <div class="lab-panel"><h4>go run main.go</h4><div data-k="res"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>Every type against every constraint</h4><div data-k="matrix" class="scroll-x"></div></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const cons = c4Constraints(st.tilde === `on`);
        const t = C4_TYPES[st.t], c = cons[st.c];
        const src = [t.decl, c.decl, c.func, `func main() {\n    // T inferred as ${t.label}\n    ${c.call(t.vals, t.label)}\n}`].filter(Boolean).join(`\n\n`);
        q(`src`).innerHTML = pblock(`user`, `main.go`, src);
        const r = c4Check(st.t, st.c, cons);
        q(`res`).innerHTML = r.ok
          ? `${chip(`ok`, `compiles`)}<div style="margin-top:8px">${pblock(`out`, `stdout`, r.out)}</div>`
          : `${chip(`no`, `compile error`)}<div style="margin-top:8px">${pblock(`bad`, `go build`, `# command-line-arguments\n./main.go:14:17: ` + r.err)}</div>`;
        const keys = Object.keys(cons);
        q(`matrix`).innerHTML = `<table class="mini-table"><tr><th>T</th>${keys.map(k => `<th>${esc(cons[k].label)}</th>`).join(``)}</tr>${Object.keys(C4_TYPES).map(tk => `<tr class="${tk === st.t ? `new` : ``}"><td><code>${esc(C4_TYPES[tk].label)}</code></td>${keys.map(ck => { const ok = c4Check(tk, ck, cons).ok; return `<td>${chip(ok ? `ok` : `no`, ok ? `✓` : `✗`)}</td>`; }).join(``)}</tr>`).join(``)}</table>`;
        let n;
        if (!r.ok && /possibly missing ~/.test(r.err)) n = `<strong>${esc(t.label)}</strong> is a new named type whose underlying type is ${t.under}. A plain union term matches only the exact type, so the compiler suggests the fix: write <code>~${t.under}</code>. Flip <em>Numeric uses ~</em> to yes.`;
        else if (!r.ok && st.c === `comparable`) n = `Slices, maps and functions don't support <code>==</code>, so they are not in the <code>comparable</code> type set. Compare slices with <code>slices.Equal</code> and maps with <code>maps.Equal</code>. Arrays such as <code>[2]int</code> and structs of comparable fields <em>are</em> comparable.`;
        else if (!r.ok) n = `<code>${esc(t.label)}</code> is not in the type set of <code>${esc(c.label)}</code>. The constraint also decides which operations the body may use: <code>+</code> is allowed in <code>Add</code> only because every type in <code>Numeric</code> supports it.`;
        else if (st.c === `any`) n = `<code>any</code> accepts every type, but the body may only do things valid for all types: assign, pass and print. Writing <code>a + b</code> or <code>a == b</code> inside <code>PrintSlice</code> would not compile.`;
        else if (st.c === `Ordered` && st.t === `string`) n = `<code>cmp.Ordered</code> includes <code>~string</code>, so <code>max</code> compares strings lexically: "bb" &gt; "aa".`;
        else n = `<code>${esc(t.label)}</code> is in the type set of <code>${esc(c.label)}</code>${c.tilde ? ` (underlying type ${esc(t.under)} matches a <code>~</code> term)` : ``}. The compiler checks this once at the call site, so no run-time checks are needed.`;
        q(`note`).innerHTML = note(n, r.ok ? `good` : `bad`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch4 - Shallow vs deep copy
  // =====================================================================
  D.c04Copies = {
    title: `Shallow vs deep copy: who sees the write?`,
    blurb: `Copy <code>s</code> into <code>t</code> by plain assignment, with <code>slices.Clone</code> (shallow), or with a deep copy loop. Then write through <code>t</code> or <code>s</code> and see which variables change. Colours identify <strong>backing arrays</strong>: the same colour means shared memory. Try the nested <code>[][]int</code>, where <code>slices.Clone</code> copies only the outer array, and give <code>s</code> spare capacity to see <code>append</code> quietly write into a shared array.`,
    mount(el) {
      const st = { shape: `nested`, how: `clone`, spare: `no` };
      let nextId, s, t, log;
      const COLORS = [`c0`, `c1`, `c3`, `c2`, `c5`, `c4`];
      const arr = vals => ({ id: nextId++, vals });
      const reset = () => {
        nextId = 0;
        const extra = st.spare === `yes` ? 2 : 0;
        if (st.shape === `flat`) {
          const vals = [1, 2, -1, -2];
          const a = arr(vals.concat(Array(extra).fill(0)));
          s = { a, len: 4, cap: 4 + extra };
        } else {
          const a = arr([arr([1, 2]), arr([3, 4])].concat(Array(extra).fill(null)));
          s = { a, len: 2, cap: 2 + extra };
        }
        log = [st.shape === `flat` ? (extra ? `s := make([]int, 4, 6); copy(s, []int{1, 2, -1, -2})` : `s := []int{1, 2, -1, -2}`) : (extra ? `s := make([][]int, 2, 4); s[0], s[1] = []int{1, 2}, []int{3, 4}` : `s := [][]int{{1, 2}, {3, 4}}`)];
        if (st.how === `assign`) { t = { a: s.a, len: s.len, cap: s.cap }; log.push(`t := s`); }
        else if (st.how === `clone` || st.shape === `flat`) {
          t = { a: arr(s.a.vals.slice(0, s.len)), len: s.len, cap: s.len };
          log.push(st.how === `clone` ? `t := slices.Clone(s)` : `t := make([]int, len(s)); copy(t, s)  // deep == shallow for []int`);
        } else {
          t = { a: arr(s.a.vals.slice(0, s.len).map(r => arr(r.vals.slice()))), len: s.len, cap: s.len };
          log.push(`t := make([][]int, len(s))\nfor i := range s {\n    t[i] = slices.Clone(s[i])\n}`);
        }
      };
      const doAppend = (sl, name, v) => {
        let res;
        if (sl.len < sl.cap) {
          sl.a.vals[sl.len] = v;
          res = { a: sl.a, len: sl.len + 1, cap: sl.cap };
        } else {
          const ncap = Math.max(1, sl.cap * 2);
          const vals = sl.a.vals.slice(0, sl.len).concat([v]);
          while (vals.length < ncap) vals.push(st.shape === `flat` ? 0 : null);
          res = { a: arr(vals), len: sl.len + 1, cap: ncap };
        }
        return res;
      };
      const OPS = {
        tw: { label: () => st.shape === `flat` ? `t[0] = 99` : `t[0][0] = 99`, run: () => { if (st.shape === `flat`) t.a.vals[0] = 99; else t.a.vals[0].vals[0] = 99; } },
        tr: { label: () => st.shape === `flat` ? `t[1] = 7` : `t[1] = []int{7, 7}`, run: () => { t.a.vals[1] = st.shape === `flat` ? 7 : arr([7, 7]); } },
        ta: { label: () => st.shape === `flat` ? `t = append(t, 5)` : `t = append(t, []int{5})`, run: () => { t = doAppend(t, `t`, st.shape === `flat` ? 5 : arr([5])); } },
        sw: { label: () => st.shape === `flat` ? `s[1] = -7` : `s[1][1] = -7`, run: () => { if (st.shape === `flat`) s.a.vals[1] = -7; else s.a.vals[1].vals[1] = -7; } },
        sa: { label: () => st.shape === `flat` ? `s = append(s, 8)` : `s = append(s, []int{8})`, run: () => { s = doAppend(s, `s`, st.shape === `flat` ? 8 : arr([8])); } }
      };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`s holds`, seg(`shape`, [[`flat`, `[]int (book's s1)`], [`nested`, `[][]int`]], st.shape))}${ctl(`copy with`, seg(`how`, [[`assign`, `t := s`], [`clone`, `slices.Clone`], [`deep`, `deep copy`]], st.how))}${ctl(`s has spare capacity`, seg(`spare`, [[`no`, `no`], [`yes`, `yes (+2)`]], st.spare))}</div>
        <div class="ctl-row" data-k="ops"></div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Slice headers and backing arrays</h4><div data-k="mem"></div><div class="legend"><span>${chip(`muted`, `dim cell = beyond len (capacity only)`)}</span></div></div>
          <div class="lab-panel"><h4>Program so far</h4><div data-k="code"></div><div data-k="out"></div></div>
        </div>
        <div data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const colorOf = a => COLORS[a.id % COLORS.length];
      const fmtGo = sl => `[` + sl.a.vals.slice(0, sl.len).map(v => st.shape === `flat` ? v : `[` + v.vals.join(` `) + `]`).join(` `) + `]`;
      const drawSlice = (name, sl) => {
        const cells = [];
        for (let i = 0; i < sl.cap; i++) {
          const v = sl.a.vals[i];
          const live = i < sl.len;
          if (st.shape === `flat`) cells.push(tok(live ? colorOf(sl.a) : `dim`, v));
          else cells.push(v ? `<span class="tok ${live ? colorOf(v) : `dim`}" title="inner array #${v.id}">[${esc(v.vals.join(` `))}]<sub>#${v.id}</sub></span>` : tok(`dim`, `nil`));
        }
        return `<div style="margin-bottom:10px"><div style="font-size:12px;margin-bottom:3px"><b>${name}</b> len=${sl.len} cap=${sl.cap} &rarr; ${chip(`muted`, `array #${sl.a.id}`)} <span class="tok ${colorOf(sl.a)}">outer</span></div><div class="toks">${cells.join(``)}</div></div>`;
      };
      const drawOps = () => {
        q(`ops`).innerHTML = Object.keys(OPS).map(k => btn(k, `<code>${esc(OPS[k].label())}</code>`)).join(` `) + ` ` + btn(`reset`, `reset`);
      };
      const draw = () => {
        q(`mem`).innerHTML = drawSlice(`s`, s) + drawSlice(`t`, t);
        q(`code`).innerHTML = pblock(`user`, `main.go`, log.join(`\n`));
        q(`out`).innerHTML = pblock(`out`, `fmt.Println(s); fmt.Println(t)`, fmtGo(s) + `\n` + fmtGo(t));
        const outerShared = s.a === t.a;
        let innerShared = 0;
        if (st.shape === `nested`) {
          const sIn = new Set(s.a.vals.slice(0, s.len).filter(Boolean));
          t.a.vals.slice(0, t.len).forEach(v => { if (v && sIn.has(v)) innerShared++; });
        }
        q(`stats`).innerHTML = `<div class="stat-row" style="margin-top:10px">${stat(`outer array shared`, outerShared ? `yes` : `no`, outerShared ? `bad` : `good`)}${st.shape === `nested` ? stat(`inner rows shared`, innerShared, innerShared ? `bad` : `good`) : ``}${stat(`arrays allocated`, nextId)}</div>`;
        let n;
        if (st.how === `assign`) n = `<code>t := s</code> copies only the slice <strong>header</strong> (pointer, len, cap). Both variables point to array #${s.a === t.a ? s.a.id : `0`}, so element writes are seen by both. ${st.spare === `yes` ? `With spare capacity, <code>t = append(t, ...)</code> writes into the <em>shared</em> array beyond s's length; a later <code>s = append(s, ...)</code> overwrites that slot, and t sees the change. This is the classic append aliasing bug.` : `<code>append</code> on a full slice allocates a new array, so after appending, t and s silently stop sharing.`}`;
        else if (st.shape === `flat`) n = `For <code>[]int</code>, a shallow copy is already a full copy: the elements are plain values. After <code>slices.Clone</code>, s and t have separate arrays, as in the book's output <code>-1 -1 -1</code> then <code>0 -1 -1</code>.`;
        else if (st.how === `clone`) n = `<code>slices.Clone</code> is <strong>shallow</strong>: it gives t a new outer array (#${t.a.id}), but the elements are slice headers that still point to the same inner arrays. <code>t[0][0] = 99</code> shows up in s. <code>t[1] = []int{7, 7}</code> only replaces t's header, so s keeps its row.`;
        else n = `A deep copy clones every level, so t's rows are new arrays (different colours) and no write through t or s is visible in the other. This costs an allocation per row, and for pointer graphs it must also handle cycles, which is why the standard library has no generic deep copy.`;
        q(`note`).innerHTML = note(n, (outerShared || innerShared) ? `warn` : `good`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`button[data-act]`);
        if (!b || !el.contains(b)) return;
        const a = b.dataset.act;
        if (a === `reset`) { reset(); draw(); return; }
        if (OPS[a]) { log.push(OPS[a].label()); OPS[a].run(); draw(); }
      });
      wireSegs(el, st, () => { reset(); drawOps(); draw(); });
      reset(); drawOps(); draw();
    }
  };

  // =====================================================================
  // Ch4 - slices package playground
  // =====================================================================
  const C4_FUNCS = {
    Clone: `slices.Clone`, Compact: `slices.Compact`, Clip: `slices.Clip`, Contains: `slices.Contains`, Index: `slices.Index`,
    MinMax: `slices.Min / Max`, Replace: `slices.Replace`, Insert: `slices.Insert`, Delete: `slices.Delete`, Sort: `slices.Sort`, Reverse: `slices.Reverse`, BinarySearch: `slices.BinarySearch`
  };
  D.c04SlicesLab = {
    title: `The slices package: results, lengths and capacities`,
    blurb: `Type a slice of ints, give it some spare capacity, and run the Go 1.21 <code>slices</code> functions from the chapter on it (<code>Clone</code>, <code>Compact</code>, <code>Clip</code>, <code>Replace</code>, <code>Sort</code>...). The lab shows the returned slice and what happened to the <strong>original backing array</strong>, which is why you must write <code>s = slices.Compact(s)</code>. Switch between Go 1.21 and 1.22 to see 1.22 zero the obsolete tail elements.`,
    mount(el) {
      const st = { fn: `Compact`, spare: 2, v: 2, ver: `1.22` };
      let input = `1, 2, 2, -1, -1, -1, 0, 0`;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`s :=`, `<input class="lab-input" data-k="in" style="width:260px" value="${esc(input)}">`)}${ctl(`spare capacity`, rng(`spare`, 0, 6, 1, st.spare))}${ctl(`value v`, rng(`v`, -3, 5, 1, st.v))}${ctl(`Go`, seg(`ver`, [[`1.21`, `1.21`], [`1.22`, `1.22+`]], st.ver))}</div>
        <div class="ctl-row">${ctl(`function`, seg(`fn`, Object.keys(C4_FUNCS).map(k => [k, C4_FUNCS[k]]), st.fn))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Call</h4><div data-k="call"></div><div data-k="before"></div></div>
          <div class="lab-panel"><h4>Result</h4><div data-k="after"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const cells = (vals, len, hotFrom, hotTo, cls) => `<div class="toks">${vals.map((v, i) => tok(i >= len ? `dim` : (i >= hotFrom && i < hotTo ? `${cls || `c5`} hot` : `c1`), v)).join(``)}</div>`;
      const draw = () => {
        const parsed = input.split(/[\s,]+/).filter(x => x !== ``).map(Number);
        if (parsed.some(x => !Number.isFinite(x) || !Number.isInteger(x))) {
          q(`call`).innerHTML = note(`Enter integers separated by commas.`, `bad`); q(`before`).innerHTML = ``; q(`after`).innerHTML = ``; q(`note`).innerHTML = ``; return;
        }
        const s = parsed.slice(0, 16), len = s.length, cap = len + st.spare;
        const back = s.concat(Array(st.spare).fill(0));
        const v = st.v, z122 = st.ver === `1.22`;
        q(`before`).innerHTML = `<div style="font-size:12px;margin:8px 0 3px">s before: len=${len} cap=${cap}</div>` + cells(back, len, 0, 0);
        let call, res = null, resLen = 0, resCap = 0, newBack = null, scalar = null, panic = null, n = ``, same = true;
        const fmtS = (a, l) => `[` + a.slice(0, l).join(` `) + `]`;
        switch (st.fn) {
          case `Clone`:
            call = `t := slices.Clone(s)`;
            res = s.slice(); resLen = len; resCap = len; same = false;
            n = `A new backing array with the same elements, a <strong>shallow</strong> copy. The clone has no spare capacity (cap may be rounded up by the allocator). Writing to t no longer affects s.`;
            break;
          case `Compact`: {
            call = `s = slices.Compact(s)`;
            const out = [];
            s.forEach(x => { if (!out.length || out[out.length - 1] !== x) out.push(x); });
            newBack = back.slice();
            out.forEach((x, i) => { newBack[i] = x; });
            for (let i = out.length; i < len; i++) newBack[i] = z122 ? 0 : back[i];
            res = newBack; resLen = out.length; resCap = cap;
            n = `Runs of <em>consecutive</em> equal values collapse to one: ${len - out.length} element${len - out.length === 1 ? `` : `s`} removed. It works in place, so the length shrinks and capacity stays at ${cap}. ${z122 ? `Go 1.22+ zeroes the obsolete tail (cells ${out.length}..${len - 1}) so the GC can free anything they referenced.` : `In Go 1.21 the obsolete tail keeps stale values, and the old variable would still see them if you forgot to reassign.`} Sort first to remove all duplicates.`;
            break;
          }
          case `Clip`:
            call = `s = slices.Clip(s)`;
            res = back; resLen = len; resCap = len;
            n = `Same backing array, but capacity is cut to the length (${cap} &rarr; ${len}), like the book's len 10 / cap 100 example. A later <code>append</code> must allocate, so it can't overwrite memory that another slice still uses.`;
            break;
          case `Contains`:
            call = `slices.Contains(s, ${v})`; scalar = String(s.includes(v));
            n = `A linear scan, O(n). For repeated lookups, build a <code>map[int]struct{}</code> or sort once and use BinarySearch.`;
            break;
          case `Index`:
            call = `slices.Index(s, ${v})`; scalar = String(s.indexOf(v));
            n = `The index of the first occurrence, or -1. Requires <code>comparable</code> elements; <code>IndexFunc</code> takes a predicate instead.`;
            break;
          case `MinMax`:
            call = `slices.Min(s), slices.Max(s)`;
            if (!len) panic = `panic: slices.Min: empty list`;
            else scalar = `Min: ${Math.min(...s)} Max: ${Math.max(...s)}`;
            n = `No sorting needed; the stats app uses these for each data file. Both <strong>panic on an empty slice</strong>, so check <code>len(s)</code> first. The built-ins <code>min(a, b)</code> and <code>max(a, b)</code> work on individual values.`;
            break;
          case `Replace`:
            call = `s = slices.Replace(s, 1, 3, 100, 200)`;
            if (len < 3) panic = `panic: runtime error: slice bounds out of range [3:${len}]`;
            else { res = s.slice(0, 1).concat([100, 200], s.slice(3)); newBack = res.concat(back.slice(res.length)); res = newBack; resLen = len; resCap = cap; }
            n = `Replaces <code>s[1:3]</code> with 100, 200 (the book's example). The same number of values goes in as comes out, so it happens in place. A longer replacement may reallocate.`;
            break;
          case `Insert`: {
            call = `s = slices.Insert(s, 1, 42)`;
            if (len < 1) { panic = `panic: runtime error: slice bounds out of range [1:0]`; break; }
            const out = s.slice(0, 1).concat([42], s.slice(1));
            if (len + 1 <= cap) { newBack = out.concat(back.slice(out.length)); res = newBack; resLen = len + 1; resCap = cap; n = `There was spare capacity, so the elements shifted right <strong>in place</strong>. Any other slice sharing this array sees the shift.`; }
            else { res = out; resLen = len + 1; resCap = Math.max(len + 1, cap * 2); res = out.concat(Array(resCap - out.length).fill(0)); same = false; n = `No spare capacity, so a <strong>new array</strong> was allocated (like append growth). The old s is untouched. Add spare capacity to see the in-place version.`; }
            break;
          }
          case `Delete`: {
            call = `s = slices.Delete(s, 1, 3)`;
            if (len < 3) { panic = `panic: runtime error: slice bounds out of range [3:${len}]`; break; }
            const out = s.slice(0, 1).concat(s.slice(3));
            newBack = back.slice(); out.forEach((x, i) => { newBack[i] = x; });
            for (let i = out.length; i < len; i++) newBack[i] = z122 ? 0 : back[i];
            res = newBack; resLen = out.length; resCap = cap;
            n = `Removes <code>s[1:3]</code> by shifting the tail left, in place, in O(len). ${z122 ? `Go 1.22+ zeroes the two freed cells.` : `Go 1.21 leaves stale copies in the freed cells.`}`;
            break;
          }
          case `Sort`:
            call = `slices.Sort(s)`;
            res = s.slice().sort((a, b) => a - b).concat(back.slice(len)); resLen = len; resCap = cap;
            n = `In-place ascending sort for any <code>cmp.Ordered</code> type (pdqsort, not stable). For structs, use <code>slices.SortFunc(s, func(a, b T) int { return cmp.Compare(a.K, b.K) })</code>.`;
            break;
          case `Reverse`:
            call = `slices.Reverse(s)`;
            res = s.slice().reverse().concat(back.slice(len)); resLen = len; resCap = cap;
            n = `In place, with no return value. To sort descending: <code>slices.Sort(s); slices.Reverse(s)</code>, or <code>SortFunc</code> with the comparison flipped.`;
            break;
          case `BinarySearch`: {
            call = `i, found := slices.BinarySearch(s, ${v})`;
            const sorted = s.every((x, i) => !i || s[i - 1] <= x);
            let lo = 0, hi = len;
            while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
            scalar = `i = ${lo}, found = ${lo < len && s[lo] === v}`;
            n = sorted ? `O(log n). If not found, i is where v would be inserted to keep the order, which is handy with <code>slices.Insert</code>.` : `<strong>s is not sorted</strong>, so the result is meaningless. BinarySearch doesn't check; run Sort first.`;
            break;
          }
        }
        q(`call`).innerHTML = pblock(`user`, `Go`, call);
        let html = ``;
        if (panic) html = pblock(`bad`, `run time`, panic);
        else if (scalar !== null) html = pblock(`out`, `returns`, scalar);
        else {
          html = `<div style="font-size:12px;margin-bottom:3px">${same ? `same backing array` : `<strong>new</strong> backing array`}: len=${resLen} cap=${resCap}</div>` + cells(res, resLen, 0, resLen, `c5`);
          html += pblock(`out`, `fmt.Println(s)`, fmtS(res, resLen));
          if (same && resLen < len) html += `<div style="font-size:12px;margin-top:6px">If you forgot to reassign, the old <code>s</code> (len ${len}) would print <code>${esc(fmtS(res, len))}</code></div>`;
        }
        q(`after`).innerHTML = html;
        q(`note`).innerHTML = note(n, panic ? `bad` : ``);
      };
      q(`in`).addEventListener(`input`, e => { input = e.target.value; draw(); });
      wireSegs(el, st, draw);
      wireRanges(el, st, { spare: x => x, v: x => x }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch5 - Method sets: value vs pointer receivers
  // =====================================================================
  const C5_OPERANDS = {
    c: { label: `c`, type: `Counter`, addr: true, desc: `addressable variable` },
    p: { label: `&c`, type: `*Counter`, addr: true, desc: `pointer` },
    lit: { label: `Counter{}`, type: `Counter`, addr: false, desc: `composite literal (not addressable)` },
    mapel: { label: `m["k"]`, type: `Counter`, addr: false, desc: `map element (not addressable)` }
  };
  D.c05MethodSets = {
    title: `Method sets: value vs pointer receivers`,
    blurb: `A tiny <code>Counter</code> with a <code>Value()</code> reader and an <code>Inc()</code> mutator. Choose each method's receiver and the operand you call it on. The lab shows which calls compile (and how Go rewrites them), whether <code>Inc()</code> actually changes the counter, and which interfaces each operand satisfies, with the exact compiler error when it doesn't.`,
    mount(el) {
      const st = { vr: `value`, ir: `pointer`, op: `c` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`Value() receiver`, seg(`vr`, [[`value`, `(c Counter)`], [`pointer`, `(c *Counter)`]], st.vr))}${ctl(`Inc() receiver`, seg(`ir`, [[`value`, `(c Counter)`], [`pointer`, `(c *Counter)`]], st.ir))}</div>
        <div class="ctl-row">${ctl(`operand x`, seg(`op`, Object.keys(C5_OPERANDS).map(k => [k, esc(C5_OPERANDS[k].label)]), st.op))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Source</h4><div data-k="src"></div><div data-k="sets"></div></div>
          <div class="lab-panel"><h4>Direct calls on <span data-k="opname"></span></h4><div data-k="calls"></div><h4 style="margin-top:12px">Interface assignment</h4><div data-k="ifaces"></div></div>
        </div>
        <div data-k="sim"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const o = C5_OPERANDS[st.op];
        const recv = { Value: st.vr, Inc: st.ir };
        q(`opname`).innerHTML = `<code>${esc(o.label)}</code>`;
        const sig = (m, body, res) => `func (c ${recv[m] === `pointer` ? `*` : ``}Counter) ${m}()${res ? ` ` + res : ``} { ${body} }`;
        q(`src`).innerHTML = pblock(`user`, `main.go`, [
          `type Counter struct{ n int }`, ``,
          sig(`Value`, `return c.n`, `int`),
          sig(`Inc`, `c.n++`), ``,
          `type Reader interface{ Value() int }`,
          `type Incrementer interface{ Inc() }`,
          `type ReadIncrementer interface{ Reader; Incrementer }`, ``,
          `var c Counter`,
          `m := map[string]Counter{"k": {}}`
        ].join(`\n`));
        const setT = Object.keys(recv).filter(m => recv[m] === `value`);
        const setP = [`Inc`, `Value`].sort();
        q(`sets`).innerHTML = `<table class="mini-table" style="margin-top:8px"><tr><th>type</th><th>method set</th></tr><tr class="${o.type === `Counter` ? `new` : ``}"><td><code>Counter</code></td><td>${setT.length ? setT.map(m => `<code>${m}</code>`).join(`, `) : `<em>empty</em>`}</td></tr><tr class="${o.type === `*Counter` ? `new` : ``}"><td><code>*Counter</code></td><td>${setP.map(m => `<code>${m}</code>`).join(`, `)}</td></tr></table>`;
        const callInfo = m => {
          const r = recv[m];
          if (o.type === `*Counter`) return r === `pointer` ? { ok: true, how: `${o.label}.${m}()`, mut: true } : { ok: true, how: `(*(&c)).${m}()  // copies *p`, mut: false };
          if (r === `value`) return { ok: true, how: `${o.label}.${m}()  // on a copy`, mut: false };
          if (o.addr) return { ok: true, how: `(&c).${m}()  // Go takes the address`, mut: true };
          return { ok: false, err: `cannot call pointer method ${m} on Counter` };
        };
        q(`calls`).innerHTML = `<table class="mini-table"><tr><th>call</th><th></th><th>compiled as / error</th></tr>${[`Value`, `Inc`].map(m => { const c = callInfo(m); return `<tr><td><code>${esc(o.label)}.${m}()</code></td><td>${chip(c.ok ? `ok` : `no`, c.ok ? `ok` : `error`)}</td><td><code>${esc(c.ok ? c.how : c.err)}</code></td></tr>`; }).join(``)}</table>`;
        const ifs = { Reader: [`Value`], Incrementer: [`Inc`], ReadIncrementer: [`Inc`, `Value`] };
        const mset = o.type === `*Counter` ? setP : setT;
        q(`ifaces`).innerHTML = `<table class="mini-table"><tr><th>statement</th><th></th><th>compiler says</th></tr>${Object.keys(ifs).map(I => {
          const missing = ifs[I].filter(m => !mset.includes(m));
          const ok = !missing.length;
          return `<tr><td><code>var _ ${I} = ${esc(o.label)}</code></td><td>${chip(ok ? `ok` : `no`, ok ? `ok` : `error`)}</td><td>${ok ? `<span style="color:var(--text-muted)">${o.type === `Counter` ? `copies the value into the interface` : `stores the pointer`}</span>` : `<code>Counter does not implement ${I} (method ${missing[0]} has pointer receiver)</code>`}</td></tr>`;
        }).join(``)}</table>`;
        const inc = callInfo(`Inc`);
        let simCode, simOut, simCls;
        const target = st.op === `mapel` ? `m["k"].n` : st.op === `lit` ? `(the literal is gone)` : `c.n`;
        simCode = `for range 3 {\n    ${o.label}.Inc()\n}\nfmt.Println(${st.op === `mapel` ? `m["k"].n` : st.op === `lit` ? `"literal"` : `c.n`})`;
        if (!inc.ok) { simOut = `./main.go:16:9: ${inc.err}`; simCls = `bad`; }
        else if (inc.mut) { simOut = `3`; simCls = `out`; }
        else { simOut = st.op === `lit` ? `literal` : `0`; simCls = `out`; }
        q(`sim`).innerHTML = `<div class="lab-grid even" style="margin-top:12px"><div class="lab-panel"><h4>Call Inc() three times</h4>${pblock(`user`, `Go`, simCode)}</div><div class="lab-panel"><h4>Result</h4>${pblock(simCls, inc.ok ? `stdout` : `go build`, simOut)}<div class="stat-row" style="margin-top:8px">${stat(`${target}`, !inc.ok ? `-` : inc.mut ? 3 : 0, inc.ok && inc.mut ? `good` : `bad`)}</div></div></div>`;
        let n;
        if (!inc.ok) n = `<code>${esc(o.label)}</code> is a ${o.desc}. Go can only insert the <code>&amp;</code> for addressable operands, so a pointer method can't be called on it. Assign it to a variable first, or store pointers in the map (<code>map[string]*Counter</code>).`;
        else if (st.ir === `value`) n = `With a <strong>value receiver</strong>, <code>Inc()</code> increments a copy, which is then thrown away. The counter stays at 0: the code compiles but the mutation is silently lost. Mutators need pointer receivers.`;
        else if (st.op === `c`) n = `<code>c.Inc()</code> compiles because c is addressable: Go rewrites it as <code>(&amp;c).Inc()</code>. But the method set of <code>Counter</code> doesn't contain <code>Inc</code>, so <code>var _ Incrementer = c</code> fails. Store <code>&amp;c</code> in the interface instead.`;
        else n = `<code>*Counter</code>'s method set includes both value and pointer methods, so a pointer satisfies every interface here and mutations hit the original. This is why constructors usually return <code>*T</code>.`;
        q(`note`).innerHTML = note(n, !inc.ok ? `bad` : (st.ir === `value` ? `warn` : `good`));
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch5 - Type switch and type assertion
  // =====================================================================
  const C5_VALUES = {
    entry: { label: `Entry{100, "F2", Secret{...}}`, dyn: `main.Entry`, matches: [`Entry`], show: `{100 F2 ****}`, short: `Entry` },
    secret: { label: `Secret{"myPassword"}`, dyn: `main.Secret`, matches: [`Secret`, `fmt.Stringer`], show: `****`, short: `Secret` },
    str: { label: `"A string"`, dyn: `string`, matches: [`string`], show: `A string`, short: `string` },
    flt: { label: `12.23`, dyn: `float64`, matches: [`float64`], show: `12.23`, short: `float64` },
    rune: { label: `'€'`, dyn: `int32`, matches: [`int, int32`], show: `8364`, short: `int32` },
    int: { label: `12`, dyn: `int`, matches: [`int, int32`], show: `12`, short: `int` },
    ef: { label: `emptyFile{true, 0}`, dyn: `main.emptyFile`, matches: [`emptyFile`, `error`], show: `Ended with io.EOF (true) but read (0) bytes`, short: `emptyFile` },
    sl: { label: `[]int{1, 2}`, dyn: `[]int`, matches: [], show: `[1 2]`, short: `[]int` },
    nil: { label: `nil`, dyn: `<nil>`, matches: [`nil`], show: `<nil>`, short: `nil` }
  };
  const C5_CASES = {
    nil: `fmt.Println("nil interface")`,
    Secret: `fmt.Println("Secret type")`,
    Entry: `fmt.Println("Entry type")`,
    emptyFile: `fmt.Println("empty file, read", v.Read)`,
    error: `fmt.Println("error:", v)`,
    'fmt.Stringer': `fmt.Println("Stringer:", v.String())`,
    'int, int32': `fmt.Printf("integer %v\\n", v) // v is interface{}`,
    float64: `fmt.Println("float64:", v+1)`,
    string: `fmt.Println("string of length", len(v))`
  };
  const C5_ORDERS = {
    specific: [`nil`, `Secret`, `Entry`, `emptyFile`, `error`, `fmt.Stringer`, `int, int32`, `float64`, `string`],
    generic: [`nil`, `error`, `fmt.Stringer`, `Secret`, `Entry`, `emptyFile`, `int, int32`, `float64`, `string`]
  };
  const C5_TARGETS = { int: { iface: false, zero: `0` }, int32: { iface: false, zero: `0` }, float64: { iface: false, zero: `0` }, string: { iface: false, zero: `""` }, Secret: { iface: false, zero: `{}` }, error: { iface: true, zero: `<nil>`, method: `Error` }, 'fmt.Stringer': { iface: true, zero: `<nil>`, method: `String` } };
  D.c05TypeSwitch = {
    title: `Type switches and type assertions`,
    blurb: `Put a value into an <code>interface{}</code> (the book's <code>Entry</code>, <code>Secret</code>, a string, a float, the rune <code>'€'</code>, an <code>emptyFile</code> error...) and dispatch it. Here <code>Secret</code> also has a <code>String()</code> method that masks the password, so it satisfies <code>fmt.Stringer</code>. Reorder the cases to see the first match win, then try type assertions in the comma-ok and single-value forms. A wrong single-value assertion panics with Go's real message.`,
    mount(el) {
      const st = { val: `ef`, order: `specific`, target: `error`, form: `single` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`var x interface{} =`, seg(`val`, Object.keys(C5_VALUES).map(k => [k, esc(C5_VALUES[k].short)]), st.val))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Type switch</h4><div class="ctl-row">${ctl(`case order`, seg(`order`, [[`specific`, `specific first`], [`generic`, `interfaces first`]], st.order))}</div><div data-k="sw"></div><div data-k="swout"></div></div>
          <div class="lab-panel"><h4>Type assertion</h4><div class="ctl-row">${ctl(`assert to`, seg(`target`, Object.keys(C5_TARGETS).map(k => [k, k]), st.target))}</div><div class="ctl-row">${ctl(`form`, seg(`form`, [[`ok`, `v, ok := x.(T)`], [`single`, `v := x.(T)`]], st.form))}</div><div data-k="as"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const draw = () => {
        const v = C5_VALUES[st.val];
        const order = C5_ORDERS[st.order];
        const hit = order.findIndex(c => v.matches.includes(c));
        const lines = [`x = ${v.label}  // %T = ${v.dyn}`, `switch v := x.(type) {`];
        let hotLine = -1;
        order.forEach((c, i) => {
          if (i === hit) hotLine = lines.length;
          lines.push(`case ${c}:`, `    ${C5_CASES[c]}`);
        });
        if (hit < 0) hotLine = lines.length;
        lines.push(`default:`, `    fmt.Printf("Not supported type: %T\\n", v)`, `}`);
        q(`sw`).innerHTML = codePanel(`typeSwitch.go`, lines, hotLine, `user`);
        let out;
        const c = hit >= 0 ? order[hit] : null;
        if (c === null) out = `Not supported type: ${v.dyn}`;
        else if (c === `nil`) out = `nil interface`;
        else if (c === `Secret`) out = `Secret type`;
        else if (c === `Entry`) out = `Entry type`;
        else if (c === `emptyFile`) out = `empty file, read 0`;
        else if (c === `error`) out = `error: ${v.show}`;
        else if (c === `fmt.Stringer`) out = `Stringer: ****`;
        else if (c === `int, int32`) out = `integer ${v.show}`;
        else if (c === `float64`) out = `float64: 13.23`;
        else out = `string of length 8`;
        const shadow = v.matches.length > 1 && order.indexOf(v.matches[0]) > hit;
        q(`swout`).innerHTML = pblock(`out`, `stdout`, out) + (shadow ? `<div style="margin-top:6px">${chip(`late`, `case ${v.matches[0]} is unreachable for this value`)}</div>` : ``);
        // assertion
        const T = st.target, tg = C5_TARGETS[T];
        const matches = st.val !== `nil` && (tg.iface ? (T === `error` ? st.val === `ef` : st.val === `secret`) : v.dyn.replace(`main.`, ``) === T);
        const shownVal = T === `fmt.Stringer` || T === `error` ? v.show : v.show;
        let as, cls;
        if (st.form === `ok`) {
          as = matches ? `v = ${shownVal}, ok = true` : `v = ${tg.zero}, ok = false`;
          cls = `out`;
        } else if (matches) { as = `v = ${shownVal}`; cls = `out`; }
        else {
          cls = `bad`;
          if (st.val === `nil`) as = `panic: interface conversion: interface ${tg.iface ? `is nil, not ${T}` : `{} is nil, not ${T}`}`;
          else if (tg.iface) as = `panic: interface conversion: ${v.dyn} is not ${T}: missing method ${tg.method}`;
          else as = `panic: interface conversion: interface {} is ${v.dyn}, not ${T === `Secret` ? `main.Secret` : T}`;
          as += `\n\ngoroutine 1 [running]:\nmain.main()\n\t/tmp/assertions.go:39 +0x130\nexit status 2`;
        }
        q(`as`).innerHTML = pblock(`user`, `Go`, st.form === `ok` ? `v, ok := x.(${T})\nfmt.Println(v, ok)` : `v := x.(${T})\nfmt.Println(v)`) + pblock(cls, cls === `bad` ? `run time` : `result`, as);
        let n;
        if (shadow) n = `The value matches <code>case ${v.matches[0]}</code> and <code>case ${v.matches[1]}</code>, but <strong>the first matching case wins</strong>. With interfaces first, the broad <code>case ${v.matches[1]}</code> swallows it and the specific branch never runs. The compiler doesn't warn, so order cases from specific to general.`;
        else if (st.val === `rune`) n = `<code>'€'</code> is a rune, which is an alias for <code>int32</code>. Its value is the code point 8364, matching the book's <code>Learn('€')</code> output <em>Data type: int32</em>. In the multi-type <code>case int, int32</code>, v keeps the type <code>interface{}</code>, so <code>v+1</code> would not compile there.`;
        else if (st.val === `nil`) n = `A nil interface has no dynamic type: it matches only <code>case nil</code>, and every assertion fails (comma-ok gives the zero value and false).`;
        else if (cls === `bad`) n = `A single-value assertion to the wrong type is a <strong>run-time panic</strong>, exactly like the book's <code>anInt.(bool)</code>. Use the comma-ok form unless a mismatch really is a bug.`;
        else if (tg.iface && matches) n = `Asserting to an <em>interface</em> type checks whether the dynamic type implements it. This is how <code>isFileEmpty</code> recovers its <code>emptyFile</code> from an <code>error</code>. In real code, prefer <code>errors.As</code>, which also looks through wrapped errors.`;
        else n = `In a single-type case, v has that concrete type, so you can use its fields and operators directly (<code>v+1</code> for float64, <code>len(v)</code> for string).`;
        q(`note`).innerHTML = note(n, shadow || cls === `bad` ? `warn` : `good`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch5 - Reflection walker
  // =====================================================================
  const C5_STRUCTS = {
    record: { name: `Record`, decl: `type Secret struct {\n    Username string\n    Password string\n}\n\ntype Record struct {\n    Field1 string\n    Field2 float64\n    Field3 Secret\n}\n\nA := Record{"String value", -12.123, Secret{"Mihalis", "Tsoukalos"}}`,
      fields: () => [{ name: `Field1`, type: `string`, kind: `string`, val: `String value` }, { name: `Field2`, type: `float64`, kind: `float64`, val: -12.123 }, { name: `Field3`, type: `main.Secret`, kind: `struct`, sub: [{ name: `Username`, type: `string`, kind: `string`, val: `Mihalis` }, { name: `Password`, type: `string`, kind: `string`, val: `Tsoukalos` }] }] },
    t: { name: `T`, decl: `type T struct {\n    F1 int\n    F2 string\n    F3 float64\n}\n\nA := T{1, "F2", 3.0}`,
      fields: () => [{ name: `F1`, type: `int`, kind: `int`, val: 1 }, { name: `F2`, type: `string`, kind: `string`, val: `F2` }, { name: `F3`, type: `float64`, kind: `float64`, val: 3 }] },
    user: { name: `User`, decl: `type User struct {\n    Name     string \`json:"name"\`\n    Age      int    \`json:"age"\`\n    password string\n}\n\nA := User{"ann", 30, "s3cr3t"}`,
      fields: () => [{ name: `Name`, type: `string`, kind: `string`, val: `ann`, tag: `json:"name"` }, { name: `Age`, type: `int`, kind: `int`, val: 30, tag: `json:"age"` }, { name: `password`, type: `string`, kind: `string`, val: `s3cr3t`, unexp: true }] }
  };
  const fmtField = f => f.sub ? `{` + f.sub.map(fmtField).join(` `) + `}` : (typeof f.val === `number` ? goNum(f.val) : f.val);
  D.c05Reflect = {
    title: `Reflection walker: Type, Kind, fields and CanSet`,
    blurb: `The book's <code>reflection.go</code> and <code>setValues.go</code> in one lab. Pick a struct and how you obtain its <code>reflect.Value</code>, and the walker lists each field's name, type, kind, value and whether it can be set. Press <em>Set fields</em> to run the setValues loop (ints become -100, strings become "Changed!"). Only <code>ValueOf(&amp;A).Elem()</code> succeeds; the other forms panic, as do unexported fields.`,
    mount(el) {
      const st = { s: `t`, how: `elem`, deep: `on` };
      let fields, msg, applied;
      const reset = () => { fields = C5_STRUCTS[st.s].fields(); msg = null; applied = false; };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`struct`, seg(`s`, [[`record`, `Record (reflection.go)`], [`t`, `T (setValues.go)`], [`user`, `User (tags + unexported)`]], st.s))}${ctl(`walk nested structs`, seg(`deep`, [[`on`, `on`], [`off`, `off`]], st.deep))}</div>
        <div class="ctl-row">${ctl(`r :=`, seg(`how`, [[`val`, `reflect.ValueOf(A)`], [`ptr`, `reflect.ValueOf(&amp;A)`], [`elem`, `reflect.ValueOf(&amp;A).Elem()`]], st.how))} ${btn(`set`, `Set fields`)} ${btn(`reset`, `reset`)}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Source</h4><div data-k="src"></div></div>
          <div class="lab-panel"><h4>What reflect sees</h4><div data-k="head"></div><div data-k="tbl" class="scroll-x"></div></div>
        </div>
        <div data-k="out"></div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const runSet = () => {
        const S = C5_STRUCTS[st.s];
        if (st.how === `ptr`) { msg = `panic: reflect: call of reflect.Value.NumField on ptr Value`; return; }
        for (const f of fields) {
          if (f.kind !== `int` && f.kind !== `string`) continue;
          const setter = f.kind === `int` ? `SetInt` : `SetString`;
          if (st.how === `val`) { msg = `panic: reflect: reflect.Value.${setter} using unaddressable value`; return; }
          if (f.unexp) { msg = `panic: reflect: reflect.Value.${setter} using value obtained using unexported field`; return; }
          f.val = f.kind === `int` ? -100 : `Changed!`;
        }
        applied = true;
        msg = null;
        void S;
      };
      const draw = () => {
        const S = C5_STRUCTS[st.s];
        const how = st.how === `val` ? `reflect.ValueOf(A)` : st.how === `ptr` ? `reflect.ValueOf(&A)` : `reflect.ValueOf(&A).Elem()`;
        q(`src`).innerHTML = pblock(`user`, `main.go`, `${S.decl}\n\nr := ${how}\ntypeOfA := r.Type()\nfor i := 0; i < r.NumField(); i++ {\n    f := r.Field(i)\n    switch f.Kind() {\n    case reflect.Int:\n        f.SetInt(-100)\n    case reflect.String:\n        f.SetString("Changed!")\n    }\n}\nfmt.Println("A:", A)`);
        const typ = st.how === `ptr` ? `*main.${S.name}` : `main.${S.name}`;
        const kind = st.how === `ptr` ? `ptr` : `struct`;
        q(`head`).innerHTML = `<div class="stat-row">${stat(`r.Type()`, esc(typ))}${stat(`r.Kind()`, kind)}${stat(`r.CanSet()`, st.how === `elem` ? `true` : `false`, st.how === `elem` ? `good` : `bad`)}${stat(`r.NumField()`, st.how === `ptr` ? `panic` : fields.length, st.how === `ptr` ? `bad` : ``)}</div>`;
        if (st.how === `ptr`) {
          q(`tbl`).innerHTML = pblock(`bad`, `run time`, `panic: reflect: call of reflect.Value.NumField on ptr Value`) + `<div style="font-size:12px;margin-top:6px">Call <code>r.Elem()</code> to get from the pointer to the struct it points to.</div>`;
        } else {
          const rows = [];
          const walk = (fs, depth, prefix, parentUnexp) => fs.forEach((f, i) => {
            const settable = st.how === `elem` && !f.unexp && !parentUnexp;
            rows.push(`<tr class="${f.unexp ? `dim` : ``}"><td class="num">${prefix}${i}</td><td style="padding-left:${6 + depth * 14}px"><code>${esc(f.name)}</code>${f.tag ? ` <span style="color:var(--text-muted);font-size:11px">${esc(f.tag)}</span>` : ``}</td><td><code>${esc(f.type)}</code></td><td>${f.kind}</td><td><code>${esc(fmtField(f))}</code>${f.unexp ? ` ${chip(`no`, `Interface() panics`)}` : ``}</td><td>${chip(settable ? `ok` : `no`, settable ? `true` : `false`)}</td></tr>`);
            if (f.sub && st.deep === `on`) walk(f.sub, depth + 1, `${prefix}${i}.`, f.unexp);
          });
          walk(fields, 0, ``, false);
          q(`tbl`).innerHTML = `<table class="mini-table"><tr><th class="num">i</th><th>Name</th><th>Type()</th><th>Kind()</th><th>value</th><th>CanSet()</th></tr>${rows.join(``)}</table>`;
        }
        const aLine = `A: {` + fields.map(fmtField).join(` `) + `}`;
        q(`out`).innerHTML = msg ? pblock(`bad`, `run time`, msg + `\n\ngoroutine 1 [running]:\nmain.main()\nexit status 2`) : pblock(`out`, applied ? `after Set fields` : `fmt.Println("A:", A)`, aLine);
        let n;
        if (msg && st.how === `val`) n = `<code>reflect.ValueOf(A)</code> wraps a <strong>copy</strong> of A, so nothing reachable from it is addressable and every setter panics. Pass a pointer and call <code>Elem()</code>.`;
        else if (msg && st.how === `ptr`) n = `The Value's Kind is <code>ptr</code>, not <code>struct</code>. Struct methods like <code>NumField</code> panic on it, a run-time error the compiler can't catch (drawback #3).`;
        else if (msg) n = `The exported fields were already changed, then the loop hit the <strong>unexported</strong> field <code>password</code>. Reflection can read unexported fields but can never set them, and even <code>Interface()</code> on them panics. Check <code>f.CanSet()</code> before setting.`;
        else if (applied) n = `Through <code>ValueOf(&amp;A).Elem()</code> the fields are addressable and settable, so the struct changed in place, like the book's <code>A: {-100 Changed! 3}</code>. Fields whose Kind isn't Int or String${st.s === `record` ? ` (including the nested Secret, a struct)` : ``} are skipped.`;
        else if (st.s === `user`) n = `<code>Type().Field(i).Tag.Get("json")</code> reads struct tags. This is how <code>encoding/json</code> maps fields to keys. The unexported <code>password</code> field is visible to reflection but not settable, and JSON ignores it.`;
        else if (st.s === `record`) n = `<code>Field3</code> has Type <code>main.Secret</code> but Kind <code>struct</code>. The book checks <code>k == reflect.Struct</code> to find embedded structures, and the walker recurses into them. Turn <em>walk nested structs</em> off to see only the top level.`;
        else n = `Type is the named type (<code>main.T</code>); Kind is its category. Press <em>Set fields</em>, then switch the Value form to see which forms are settable.`;
        q(`note`).innerHTML = note(n, msg ? `bad` : `good`);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`button[data-act]`);
        if (!b || !el.contains(b)) return;
        if (b.dataset.act === `reset`) reset();
        else if (b.dataset.act === `set`) { reset(); runSet(); }
        draw();
      });
      wireSegs(el, st, () => { reset(); draw(); });
      reset(); draw();
    }
  };

  // =====================================================================
  // Ch6 - defer visualizer
  // =====================================================================
  function c06Script(sc, ver) {
    const steps = [];
    const add = (line, note, stack, vars, out) => steps.push({ line, note, stack: stack.slice(), vars: Object.assign({}, vars), out });
    if (sc === `d1` || sc === `d2` || sc === `d3`) {
      const code = sc === `d1`
        ? [`func d1() {`, `    for i := 3; i > 0; i-- {`, `        defer fmt.Print(i, " ")`, `    }`, `}`]
        : sc === `d2`
          ? [`func d2() {`, `    for i := 3; i > 0; i-- {`, `        defer func() {`, `            fmt.Print(i, " ")`, `        }()`, `    }`, `    fmt.Println()`, `}`]
          : [`func d3() {`, `    for i := 3; i > 0; i-- {`, `        defer func(n int) {`, `            fmt.Print(n, " ")`, `        }(i)`, `    }`, `}`];
      const deferLine = 2;
      const stack = [];
      let out = ``;
      const shared = sc === `d2` && ver === `1.21`;
      const cells = [];
      let vars = {};
      add(0, `d${sc[1]}() starts. The defer stack is empty.`, stack, vars, out);
      for (let i = 3; i > 0; i--) {
        vars = { i };
        add(1, `Loop iteration with i = ${i}.`, stack, vars, out);
        if (sc === `d1`) { stack.push({ txt: `fmt.Print(${i}, " ")`, val: () => i, cap: `arg i = ${i}` }); add(deferLine, `<code>defer fmt.Print(i, " ")</code> evaluates its arguments <strong>now</strong>, so the call is saved with the value ${i}.`, stack, vars, out); }
        else if (sc === `d3`) { const n = i; stack.push({ txt: `func(n int){...}(${n})`, val: () => n, cap: `n = ${n}` }); add(deferLine, `The value of i (${n}) is passed as argument n and evaluated immediately.`, stack, vars, out); }
        else {
          const cell = shared ? (cells[0] || (cells[0] = { v: i })) : { v: i };
          if (shared) cell.v = i;
          else cells.push(cell);
          stack.push({ txt: `func(){ Print(i) }`, val: () => cell.v, cap: shared ? `captures shared i` : `captures this iteration's i (${i})`, cell });
          add(deferLine, shared ? `The closure captures the <strong>variable</strong> i, not its value. Before Go 1.22 there is one i for the whole loop.` : `Go 1.22+: every iteration has its own i, so this closure captures an i that stays ${i}.`, stack, vars, out);
        }
      }
      if (shared) cells[0].v = 0;
      vars = shared ? { i: 0 } : {};
      add(1, shared ? `i-- makes i = 0 and the condition i &gt; 0 fails. The shared i is now <strong>0</strong>.` : `The loop ends.`, stack, vars, out);
      if (sc === `d2`) { out += `\n`; add(6, `<code>fmt.Println()</code> runs before any deferred call.`, stack, vars, out); }
      const retLine = code.length - 1;
      add(retLine, `The function is about to return, so the deferred calls run in <strong>LIFO</strong> order.`, stack, vars, out);
      while (stack.length) {
        const top = stack.pop();
        const v = top.val();
        out += v + ` `;
        add(retLine, `Pop <code>${esc(top.txt)}</code> and print ${v}${sc === `d2` ? (shared ? ` (reads the shared i at run time)` : ` (its own i)`) : ``}.`, stack, vars, out);
      }
      return { code, steps, expect: sc === `d2` && shared ? `0 0 0` : `1 2 3` };
    }
    if (sc === `named` || sc === `unnamed`) {
      const named = sc === `named`;
      const code = named
        ? [`func f() (n int) {`, `    defer func() { n *= 2 }()`, `    n = 3`, `    return n + 1`, `}`, ``, `fmt.Println(f())`]
        : [`func g() int {`, `    n := 3`, `    defer func() { n *= 2 }()`, `    return n + 1`, `}`, ``, `fmt.Println(g())`];
      const stack = [];
      let out = ``;
      if (named) {
        add(0, `The named result n is a variable initialized to 0.`, stack, { n: 0, result: `n` }, out);
        stack.push({ txt: `func(){ n *= 2 }`, cap: `captures result n` });
        add(1, `The closure captures the <strong>result variable</strong> n itself.`, stack, { n: 0, result: `n` }, out);
        add(2, `n = 3.`, stack, { n: 3, result: `n` }, out);
        add(3, `<code>return n + 1</code> first <strong>assigns</strong> 4 to the result n...`, stack, { n: 4, result: `n` }, out);
        stack.pop();
        add(3, `...then runs the deferred closure: n *= 2, so n = 8.`, stack, { n: 8, result: `n` }, out);
        out = `8`;
        add(6, `The caller receives the result variable's final value: <strong>8</strong>.`, stack, { n: 8, result: `n` }, out);
        return { code, steps, expect: `8` };
      }
      add(1, `n is an ordinary local variable.`, stack, { n: 3, result: `(unnamed)` }, out);
      stack.push({ txt: `func(){ n *= 2 }`, cap: `captures local n` });
      add(2, `The closure captures the local n.`, stack, { n: 3, result: `(unnamed)` }, out);
      add(3, `<code>return n + 1</code> copies 4 into the hidden result slot.`, stack, { n: 3, result: 4 }, out);
      stack.pop();
      add(3, `The deferred closure doubles the local n to 6, but the result was already copied.`, stack, { n: 6, result: 4 }, out);
      out = `4`;
      add(6, `The caller receives <strong>4</strong>. Only named results can be changed by defer.`, stack, { n: 6, result: 4 }, out);
      return { code, steps, expect: `4` };
    }
    return { code: [], steps: [{ line: 0, note: ``, stack: [], vars: {}, out: `` }], expect: `` };
  }
  D.c06Defer = {
    title: `defer: LIFO order, argument evaluation and closures`,
    blurb: `Step through the book's <code>defer.go</code> (d1, d2, d3) and two named-result examples. Watch calls pile onto the defer stack, see what each one captured, and see the output as the stack unwinds in LIFO order. Toggle the Go version to see why d2 printed <code>0 0 0</code> before Go 1.22 and prints <code>1 2 3</code> since.`,
    mount(el, ctx) {
      const st = { sc: `d2`, ver: `1.21` };
      let S, pos, timer = null;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`function`, seg(`sc`, [[`d1`, `d1: defer Print(i)`], [`d2`, `d2: defer closure`], [`d3`, `d3: defer func(n)(i)`], [`named`, `named result`], [`unnamed`, `unnamed result`]], st.sc))}${ctl(`Go version`, seg(`ver`, [[`1.21`, `&le; 1.21`], [`1.22`, `1.22+`]], st.ver))}</div>
        <div class="ctl-row">${btn(`step`, `Step &#9654;`)} ${btn(`play`, `Play`)} ${btn(`end`, `Run to end`)} ${btn(`reset`, `Reset`)}</div>
        <div class="lab-grid three">
          <div class="lab-panel"><h4>Code</h4><div data-k="code"></div></div>
          <div class="lab-panel"><h4>Defer stack (top first)</h4><div data-k="stack"></div><h4 style="margin-top:10px">Variables</h4><div data-k="vars"></div></div>
          <div class="lab-panel"><h4>Output</h4><div data-k="out"></div><div data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const stop = () => { if (timer !== null) { ctx.clear(timer); timer = null; } const b = el.querySelector(`[data-act="play"]`); if (b) b.textContent = `Play`; };
      const load = () => { stop(); S = c06Script(st.sc, st.ver); pos = 0; };
      const draw = () => {
        const s = S.steps[pos];
        q(`code`).innerHTML = codePanel(`defer.go`, S.code, s.line, `user`);
        q(`stack`).innerHTML = s.stack.length ? `<div class="toks" style="flex-direction:column;align-items:flex-start;gap:4px">${s.stack.slice().reverse().map((f, i) => `<span class="tok ${i === 0 ? `c2 hot` : `c1`}">${esc(f.txt)} <span style="opacity:.7;font-size:11px">${esc(f.cap)}</span></span>`).join(``)}</div>` : chip(`muted`, `empty`);
        const vk = Object.keys(s.vars);
        q(`vars`).innerHTML = vk.length ? `<div class="kv">${vk.map(k => `<div class="kv-row"><span>${esc(k)}</span><span>${esc(String(s.vars[k]))}</span></div>`).join(``)}</div>` : chip(`muted`, `no live loop variable`);
        q(`out`).innerHTML = pblock(`out`, `stdout`, s.out.trim() || ` `);
        q(`stats`).innerHTML = `<div class="stat-row" style="margin-top:8px">${stat(`step`, `${pos + 1}/${S.steps.length}`)}${stat(`final output`, esc(S.expect))}</div>`;
        let n = s.note;
        if (pos === S.steps.length - 1) {
          if (st.sc === `d2` && st.ver === `1.21`) n += ` <br>This is a <strong>closure</strong> problem, not a defer problem: all three closures read the same variable after the loop finished. The fix is d3's style, passing the value as an argument.`;
          else if (st.sc === `d2`) n += ` <br>With Go 1.22 loop-variable semantics (go.mod says <code>go 1.22</code> or later), each closure has its own i. d3's explicit argument still reads more clearly.`;
          else if (st.sc === `d1` || st.sc === `d3`) n += ` <br>Deferred calls run in reverse order of registration: 3, 2, 1 were pushed, so 1, 2, 3 print.`;
        }
        q(`note`).innerHTML = note(n, pos === S.steps.length - 1 ? (st.sc === `d2` && st.ver === `1.21` ? `warn` : `good`) : ``);
      };
      const step = () => { if (pos < S.steps.length - 1) { pos++; draw(); } if (pos >= S.steps.length - 1) stop(); };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`button[data-act]`);
        if (!b || !el.contains(b)) return;
        const a = b.dataset.act;
        if (a === `step`) { stop(); step(); }
        else if (a === `end`) { stop(); pos = S.steps.length - 1; draw(); }
        else if (a === `reset`) { load(); draw(); }
        else if (a === `play`) {
          if (timer !== null) { stop(); return; }
          if (pos >= S.steps.length - 1) { pos = 0; draw(); }
          timer = ctx.every(step, 850);
          b.textContent = `Pause`;
        }
      });
      wireSegs(el, st, () => { load(); draw(); });
      load(); draw();
    }
  };

  // =====================================================================
  // Ch6 - Package initialization order
  // =====================================================================
  D.c06InitOrder = {
    title: `Package initialization order: variables, init() and main()`,
    blurb: `The book's example: <code>main</code> imports package A, which imports package B. Add a direct import of B from main, a second <code>init()</code> in B, or a blank import of the go-sqlite3 driver, then step through what the runtime executes before <code>main()</code>. Notice that main's variables are initialized in <strong>dependency</strong> order, not source order.`,
    mount(el, ctx) {
      const st = { direct: `no`, two: `no`, drv: `yes` };
      let steps, pos, timer = null;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`main also imports B`, seg(`direct`, [[`no`, `no`], [`yes`, `yes`]], st.direct))}${ctl(`B has two init()s`, seg(`two`, [[`no`, `no`], [`yes`, `yes`]], st.two))}${ctl(`import _ go-sqlite3`, seg(`drv`, [[`no`, `no`], [`yes`, `yes`]], st.drv))}</div>
        <div class="ctl-row">${btn(`step`, `Step &#9654;`)} ${btn(`play`, `Play`)} ${btn(`end`, `Run to end`)} ${btn(`reset`, `Reset`)}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Packages</h4><div data-k="pk"></div></div>
          <div class="lab-panel"><h4>Execution order</h4><div data-k="order"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const pkgs = () => {
        const P = {
          a: { path: `example.com/a`, name: `A`, imports: [`b`], src: `package a\n\nimport "example.com/b"\n\nvar Version = "v" + b.Major\n\nfunc init() { fmt.Println("A: init()") }`, vars: [`A: var Version = "v" + b.Major`], inits: [`A: init()`] },
          b: { path: `example.com/b`, name: `B`, imports: [], src: `package b\n\nvar Major = loadMajor()\n\nfunc init() { fmt.Println("B: init() #1") }` + (st.two === `yes` ? `\nfunc init() { fmt.Println("B: init() #2") }` : ``), vars: [`B: var Major = loadMajor()`], inits: [`B: init() #1`].concat(st.two === `yes` ? [`B: init() #2`] : []) }
        };
        if (st.drv === `yes`) P.sqlite = { path: `github.com/mattn/go-sqlite3`, name: `go-sqlite3`, imports: [], src: `package sqlite3\n\nfunc init() {\n    sql.Register("sqlite3", &SQLiteDriver{})\n}`, vars: [], inits: [`go-sqlite3: init() → sql.Register("sqlite3")`] };
        const mainImports = [`a`].concat(st.direct === `yes` ? [`b`] : []).concat(st.drv === `yes` ? [`sqlite`] : []);
        P.main = { path: `main`, name: `main`, imports: mainImports, src: `package main\n\nimport (\n    "example.com/a"\n` + (st.direct === `yes` ? `    "example.com/b"\n` : ``) + (st.drv === `yes` ? `    _ "github.com/mattn/go-sqlite3"\n` : ``) + `)\n\nvar x = y + 1      // declared first...\nvar y = config()   // ...but y is initialized first\n\nfunc init() { fmt.Println("main: init()") }\n\nfunc main() { fmt.Println("main()", a.Version) }`, vars: [`main: var y = config()`, `main: var x = y + 1`], inits: [`main: init()`] };
        return P;
      };
      const build = () => {
        const P = pkgs();
        const done = new Set();
        const seq = [];
        const lib = Object.keys(P).filter(k => k !== `main`).sort((x, y) => P[x].path < P[y].path ? -1 : 1);
        while (done.size < lib.length) {
          const k = lib.find(x => !done.has(x) && P[x].imports.every(d => done.has(d)));
          if (!k) break;
          P[k].vars.forEach(v => seq.push({ pkg: k, txt: v, kind: `var` }));
          P[k].inits.forEach(v => seq.push({ pkg: k, txt: v, kind: `init` }));
          done.add(k);
        }
        P.main.vars.forEach(v => seq.push({ pkg: `main`, txt: v, kind: `var` }));
        P.main.inits.forEach(v => seq.push({ pkg: `main`, txt: v, kind: `init` }));
        seq.push({ pkg: `main`, txt: `main() begins`, kind: `main` });
        return { P, seq };
      };
      const stop = () => { if (timer !== null) { ctx.clear(timer); timer = null; } const b = el.querySelector(`[data-act="play"]`); if (b) b.textContent = `Play`; };
      const load = () => { stop(); steps = build(); pos = -1; };
      const KIND = { var: `c1`, init: `c3`, main: `c5` };
      const draw = () => {
        const { P, seq } = steps;
        const cur = pos >= 0 ? seq[pos] : null;
        const doneP = new Set(seq.slice(0, pos + 1).map(s => s.pkg));
        q(`pk`).innerHTML = [`main`, `a`, `b`, `sqlite`].filter(k => P[k]).map(k => {
          const p = P[k];
          const active = cur && cur.pkg === k;
          return `<div style="margin-bottom:8px"><div style="font-size:12px;margin-bottom:3px">${chip(active ? `early` : doneP.has(k) ? `ok` : `muted`, esc(p.path))} ${p.imports.length ? `imports ${p.imports.map(d => `<code>${esc(P[d].path)}</code>`).join(`, `)}` : `no imports`}</div>${pblock(active ? `user` : `off`, p.name, p.src)}</div>`;
        }).join(``);
        q(`order`).innerHTML = `<table class="mini-table"><tr><th class="num">#</th><th>step</th><th>kind</th></tr>${seq.map((s, i) => `<tr class="${i === pos ? `new` : i > pos ? `dim` : ``}"><td class="num">${i + 1}</td><td><code>${esc(s.txt)}</code></td><td>${tok(KIND[s.kind], s.kind === `var` ? `package var` : s.kind)}</td></tr>`).join(``)}</table>`;
        let n;
        if (!cur) n = `Press Step. Nothing in main runs until every imported package has been initialized.`;
        else if (cur.kind === `main`) n = `Every package was initialized exactly once: ${[...new Set(seq.map(s => s.pkg))].filter(k => k !== `main`).map(k => P[k].name).join(` &rarr; `)} &rarr; main. ${st.direct === `yes` ? `Importing B directly from main changed nothing, because A had already triggered B's initialization.` : `Try making main import B directly: the order doesn't change.`} ${st.drv === `yes` ? `The blank import ran the driver's init(), so <code>sql.Open("sqlite3", ...)</code> works.` : ``}`;
        else if (cur.pkg === `main` && cur.kind === `var`) n = `Within a package, variables are initialized in <strong>dependency order</strong>: x is declared first, but it depends on y, so <code>y = config()</code> runs first.`;
        else if (cur.pkg === `b`) n = `B has no imports of its own, so it is initialized first: package variables, then ${st.two === `yes` ? `both init() functions in source order` : `its init()`}. This is the first init() of the program.`;
        else if (cur.pkg === `sqlite`) n = `<code>import _</code> keeps the package only for its side effects: its init() registers the driver with <code>database/sql</code>. Since Go 1.21, independent packages are initialized in import-path order, so it runs after example.com/a and b.`;
        else n = `A can only initialize after B is done, because <code>Version</code> reads <code>b.Major</code>.`;
        q(`note`).innerHTML = note(n, cur && cur.kind === `main` ? `good` : ``);
      };
      const step = () => { if (pos < steps.seq.length - 1) { pos++; draw(); } if (pos >= steps.seq.length - 1) stop(); };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`button[data-act]`);
        if (!b || !el.contains(b)) return;
        const a = b.dataset.act;
        if (a === `step`) { stop(); step(); }
        else if (a === `end`) { stop(); pos = steps.seq.length - 1; draw(); }
        else if (a === `reset`) { load(); draw(); }
        else if (a === `play`) {
          if (timer !== null) { stop(); return; }
          if (pos >= steps.seq.length - 1) { pos = -1; draw(); }
          timer = ctx.every(step, 800);
          b.textContent = `Pause`;
        }
      });
      wireSegs(el, st, () => { load(); draw(); });
      load(); draw();
    }
  };

  // =====================================================================
  // Ch6 - Closures and functions returning functions
  // =====================================================================
  D.c06Closures = {
    title: `Functions that return functions, and closures with state`,
    blurb: `Left: the book's <code>funRet(i)</code>, which returns one of two anonymous functions depending on i. Pick i and k and see which function you got and what it returns. Right: a <code>counter()</code> factory. Every call creates a new closure with its <strong>own</strong> captured <code>c</code>; calling one never affects another.`,
    mount(el) {
      const st = { i: 10, k: 10 };
      let closures = [], log = [];
      el.innerHTML = `
        <div class="lab-grid even">
          <div class="lab-panel"><h4>returnFunction.go</h4>
            <div class="ctl-row">${ctl(`funRet(i), i =`, rng(`i`, -10, 10, 1, st.i))}${ctl(`call with k =`, rng(`k`, -10, 10, 1, st.k))}</div>
            <div data-k="fr"></div><div data-k="frout"></div></div>
          <div class="lab-panel"><h4>counter() closures</h4>
            ${pblock(`user`, `Go`, `func counter() func() int {\n    c := 0\n    return func() int {\n        c++\n        return c\n    }\n}`)}
            <div class="ctl-row">${btn(`new`, `next := counter()`)} ${btn(`clear`, `reset`)}</div>
            <div data-k="cl"></div><div data-k="log"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = k => el.querySelector(`[data-k="${k}"]`);
      const drawFr = () => {
        const neg = st.i < 0;
        const lines = [`func funRet(i int) func(int) int {`, `    if i < 0 {`, `        return func(k int) int {`, `            k = -k`, `            return k + k`, `        }`, `    }`, `    return func(k int) int {`, `        return k * k`, `    }`, `}`];
        q(`fr`).innerHTML = codePanel(`funRet(${st.i})`, lines, neg ? 2 : 7, `user`);
        const r = neg ? (-st.k) + (-st.k) : st.k * st.k;
        q(`frout`).innerHTML = pblock(`out`, `f := funRet(${st.i}); fmt.Printf("%T\\n", f); fmt.Println(f(${st.k}))`, `func(int) int\n${r}`) + `<div class="stat-row" style="margin-top:8px">${stat(`returned function`, neg ? `-2k` : `k²`)}${stat(`f(${st.k})`, r, `good`)}</div>`;
      };
      const drawCl = () => {
        q(`cl`).innerHTML = closures.length ? `<table class="mini-table"><tr><th>closure</th><th>captured c</th><th></th></tr>${closures.map((c, i) => `<tr class="${c.hot ? `new` : ``}"><td><code>c${i + 1}</code></td><td class="num">${tok(`c${i % 6}`, `c = ${c.c}`)}</td><td>${btn(`call:${i}`, `c${i + 1}()`)}</td></tr>`).join(``)}</table>` : chip(`muted`, `no closures yet: press next := counter()`);
        q(`log`).innerHTML = log.length ? pblock(`out`, `calls`, log.slice(-8).join(`\n`)) : ``;
        let n;
        if (!closures.length) n = `<code>counter()</code> returns a function value. The local variable <code>c</code> would normally die when counter returns, but the closure keeps it alive (it escapes to the heap).`;
        else if (closures.length === 1) n = `Call c1 a few times: its private <code>c</code> keeps counting between calls. Then create a second counter.`;
        else n = `Each <code>counter()</code> call made a <strong>new</strong> c, so the ${closures.length} closures count independently. Closures capture variables, not values, which is the same mechanism that makes the d2 defer example print 0 0 0 when the variable is shared.`;
        q(`note`).innerHTML = note(n, closures.length > 1 ? `good` : ``);
      };
      el.addEventListener(`click`, e => {
        const b = e.target.closest(`button[data-act]`);
        if (!b || !el.contains(b)) return;
        const a = b.dataset.act;
        closures.forEach(c => { c.hot = false; });
        if (a === `new`) { if (closures.length < 6) { closures.push({ c: 0, hot: true }); log.push(`c${closures.length} := counter()`); } }
        else if (a === `clear`) { closures = []; log = []; }
        else if (a.indexOf(`call:`) === 0) { const i = +a.slice(5); const c = closures[i]; if (c) { c.c++; c.hot = true; log.push(`c${i + 1}() = ${c.c}`); } }
        drawCl();
      });
      wireRanges(el, st, { i: v => v, k: v => v }, drawFr);
      drawFr(); drawCl();
    }
  };
})();
