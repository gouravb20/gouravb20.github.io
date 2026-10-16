// Mastering Go - interactive labs, part 5 (chapters 12-15 and the appendix). Depends on labkit.js.
(function () {
  "use strict";
  const K = window.LabKit;
  const { esc, clamp, sum, round, seg, wireSegs, rng, wireRanges, ctl, stat, note, hbars, svgWrap, fmtNum, fmtBytes, pct, mulberry32, axes, path } = K;
  const D = window.DEMOS;
  const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;
  const pblock = (cls, head, body) => `<div class="pblock ${cls}"><div class="pblock-h">${head}</div><pre>${esc(body)}</pre></div>`;
  const btn = (act, label, ghost) => `<button class="lab-btn${ghost ? ` ghost` : ``}" data-act="${act}">${label}</button>`;
  const qsel = el => k => el.querySelector(`[data-k="${k}"]`);
  const onAct = (el, fn) => el.addEventListener(`click`, e => {
    const b = e.target.closest(`[data-act]`);
    if (b && el.contains(b)) fn(b.dataset.act, b);
  });
  const MONO = `font-family:'SF Mono',Consolas,monospace;font-size:12px;white-space:pre;tab-size:4;-moz-tab-size:4;line-height:1.55`;
  const codeView = (lines, bgFn) => `<div style="${MONO};overflow-x:auto">${lines.map((l, i) => {
    const bg = bgFn ? bgFn(i) : ``;
    return `<div style="padding:0 6px;border-radius:3px;${bg}"><span style="color:var(--text-muted);display:inline-block;width:2.2em;user-select:none">${i + 1}</span>${esc(l) || ` `}</div>`;
  }).join(``)}</div>`;
  const BG_OK = `background:rgba(34,197,94,0.16)`, BG_BAD = `background:rgba(239,68,68,0.16)`, BG_WARN = `background:rgba(245,158,11,0.16)`;

  // Go's small-object size classes (bytes); larger objects round up to whole 8 KB pages.
  const SIZE_CLASSES = [8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 352, 384, 416, 448, 480, 512, 576, 640, 704, 768, 896, 1024, 1152, 1280, 1408, 1536, 1792, 2048, 2304, 2688, 3072, 3200, 3456, 4096, 4864, 5376, 6144, 6528, 6784, 6912, 8192, 9472, 9728, 10240, 10880, 12288, 13568, 14336, 16384, 18432, 19072, 20480, 21760, 24576, 27264, 28672, 32768];
  function roundupsize(b) {
    if (b <= 0) return 0;
    if (b <= 32768) { for (const c of SIZE_CLASSES) if (c >= b) return c; }
    return Math.ceil(b / 8192) * 8192;
  }
  // append() growth for []int (8-byte elements), Go 1.20+ growslice.
  function appendStats(n) {
    let cap = 0, allocs = 0, bytes = 0, copied = 0;
    const steps = [];
    for (let len = 0; len < n;) {
      if (len === cap) {
        const newLen = len + 1;
        let nc = cap;
        if (newLen > 2 * cap) nc = newLen;
        else if (cap < 256) nc = 2 * cap;
        else { while (nc < newLen) nc += (nc + 768) >> 2; }
        const mem = roundupsize(nc * 8);
        copied += len; cap = Math.floor(mem / 8); allocs++; bytes += mem;
        steps.push(cap);
      }
      len = Math.min(n, cap);
    }
    return { allocs, bytes, copied, steps, cap };
  }

  // =====================================================================
  // Ch12 - Table-driven tests
  // =====================================================================
  const TT_BOOK = [[1, 2, 0, 0.5], [5, 10, 0, 0.5], [2, 2, 1, 1.0], [4, 2, 2, 2.0], [5, 2, 2, 2.5], [5, 4, 1, 1.2]];
  const goF = v => isNaN(v) ? `NaN` : !isFinite(v) ? (v > 0 ? `+Inf` : `-Inf`) : v.toFixed(6);
  D.c12TableTests = {
    title: `Table-driven tests: go test -v on the book's division table`,
    blurb: `The book's <code>table_test.go</code> checks <code>intDiv</code> and <code>floatDiv</code> against a slice of six cases, and the last one (5/4 = 1.2) is wrong on purpose. Edit the table and watch <code>go test -v</code> re-run. Compare one big loop with <code>t.Run</code> subtests, <code>t.Errorf</code> with <code>t.Fatalf</code>, and exact float comparison with a tolerance. Add a <code>7 / 0</code> case to see what a panic does to the whole test binary.`,
    mount(el) {
      const st = { mode: `loop`, fail: `error`, cmp: `exact` };
      let cases = TT_BOOK.map(r => r.slice());
      el.innerHTML = `
        <div class="ctl-row">${ctl(`structure`, seg(`mode`, [[`loop`, `one loop (book)`], [`subtests`, `t.Run subtests`]], st.mode))}${ctl(`on failure`, seg(`fail`, [[`error`, `t.Errorf`], [`fatal`, `t.Fatalf`]], st.fail))}${ctl(`float check`, seg(`cmp`, [[`exact`, `got != want`], [`tol`, `math.Abs(got-want) &gt; 1e-9`]], st.cmp))}</div>
        <div class="ctl-row">${btn(`add`, `+ add case`, true)}${btn(`zero`, `+ add 7 / 0`, true)}${btn(`fix`, `fix 5/4 to 1.25`, true)}${btn(`reset`, `reset to book`, true)}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>var tests = []myTest{...}</h4><div data-k="tbl"></div></div>
          <div class="lab-panel"><h4>$ go test -v *.go</h4><div data-k="out"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const inp = (i, f, v) => `<input class="lab-input" type="number" step="any" data-i="${i}" data-f="${f}" value="${v}" style="min-width:0;width:62px;flex:none;padding:3px 6px">`;
      const drawTable = () => {
        q(`tbl`).innerHTML = `<table class="mini-table"><tr><th>a</th><th>b</th><th>resInt</th><th>resFloat</th><th>result</th><th></th></tr>${cases.map((c, i) => `<tr><td>${inp(i, 0, c[0])}</td><td>${inp(i, 1, c[1])}</td><td>${inp(i, 2, c[2])}</td><td>${inp(i, 3, c[3])}</td><td data-k="res${i}"></td><td><button class="lab-btn ghost" style="padding:1px 8px;font-size:11px" data-act="del" data-i="${i}">x</button></td></tr>`).join(``)}</table>`;
      };
      const run = () => {
        const sub = st.mode === `subtests`;
        const res = cases.map(() => ({ s: `notrun`, msgs: [] }));
        const out = [`=== RUN   TestAll`];
        let panicked = false, anyFail = false;
        const names = {};
        const nameOf = c => { let n = `${c[0]}_div_${c[1]}`; if (names[n] !== undefined) { names[n]++; n += `#` + String(names[n]).padStart(2, `0`); } else names[n] = 0; return n; };
        const lineI = sub ? 31 : 29, lineF = sub ? 35 : 33;
        const check = (c, r, ind) => {
          const [a, b, ri, rf] = c;
          r.s = `pass`;
          if (b === 0) { r.s = `panic`; return `panic`; }
          const gi = Math.trunc(a / b);
          if (gi !== ri) { r.s = `fail`; r.msgs.push(`${ind}table_test.go:${lineI}: Expected ${ri}, got ${gi}`); if (st.fail === `fatal`) return `stop`; }
          const gf = a / b;
          const bad = st.cmp === `exact` ? gf !== rf : !(Math.abs(gf - rf) <= 1e-9);
          if (bad) { r.s = `fail`; r.msgs.push(`${ind}table_test.go:${lineF}: Expected ${goF(rf)}, got ${goF(gf)}`); if (st.fail === `fatal`) return `stop`; }
          return `ok`;
        };
        if (!sub) {
          for (let i = 0; i < cases.length; i++) {
            const r = check(cases[i], res[i], `    `);
            out.push(...res[i].msgs);
            if (res[i].s !== `pass`) anyFail = true;
            if (r === `panic`) { panicked = true; break; }
            if (r === `stop`) break;
          }
          if (!panicked) out.push(`--- ${anyFail ? `FAIL` : `PASS`}: TestAll (0.00s)`);
        } else {
          const tail = [];
          for (let i = 0; i < cases.length; i++) {
            const nm = nameOf(cases[i]);
            out.push(`=== RUN   TestAll/${nm}`);
            const r = check(cases[i], res[i], `    `);
            out.push(...res[i].msgs);
            if (r === `panic`) { panicked = true; anyFail = true; break; }
            if (res[i].s !== `pass`) anyFail = true;
            tail.push(`    --- ${res[i].s === `pass` ? `PASS` : `FAIL`}: TestAll/${nm} (0.00s)`);
          }
          if (!panicked) out.push(`--- ${anyFail ? `FAIL` : `PASS`}: TestAll (0.00s)`, ...tail);
        }
        if (panicked) {
          out.push(`--- FAIL: TestAll (0.00s)`, `panic: runtime error: integer divide by zero [recovered]`, `\tpanic: runtime error: integer divide by zero`, ``, `goroutine 6 [running]:`, `testing.tRunner.func1.2(...)`, `...`, `FAIL\tcommand-line-arguments\t0.312s`, `FAIL`);
        } else if (anyFail) out.push(`FAIL`, `FAIL\tcommand-line-arguments\t0.332s`, `FAIL`);
        else out.push(`PASS`, `ok  \tcommand-line-arguments\t0.301s`);
        q(`out`).innerHTML = pblock(panicked || anyFail ? `bad` : `out`, panicked ? `panic` : anyFail ? `FAIL` : `PASS`, out.join(`\n`));
        res.forEach((r, i) => {
          const cell = q(`res${i}`);
          if (cell) cell.innerHTML = r.s === `pass` ? chip(`ok`, `PASS`) : r.s === `fail` ? chip(`no`, `FAIL`) : r.s === `panic` ? chip(`no`, `PANIC`) : chip(`muted`, `not run`);
        });
        const cnt = s => res.filter(r => r.s === s).length;
        q(`stats`).innerHTML = stat(`cases`, cases.length) + stat(`passed`, cnt(`pass`), `good`) + stat(`failed`, cnt(`fail`) + cnt(`panic`), cnt(`fail`) + cnt(`panic`) ? `bad` : ``) + stat(`never ran`, cnt(`notrun`), cnt(`notrun`) ? `bad` : ``);
        let n;
        if (panicked) n = `Integer division by zero panics, and a panic in any test <strong>aborts the whole test binary</strong>: in subtest mode too, later cases never run. <code>floatDiv(7, 0)</code> alone would just return +Inf. Validate the divisor, or test for the panic explicitly with <code>recover</code>.`;
        else if (st.fail === `fatal` && cnt(`notrun`) && !sub) n = `<code>t.Fatalf</code> stopped <code>TestAll</code> at the first failure, so ${cnt(`notrun`)} case${cnt(`notrun`) > 1 ? `s` : ``} never ran. In one big loop, Fatal hides the remaining results. Switch to <strong>t.Run subtests</strong>: Fatal then stops only that subtest.`;
        else if (st.fail === `fatal` && sub && anyFail) n = `With subtests, <code>t.Fatalf</code> ends only the failing subtest (via <code>runtime.Goexit</code>); the other cases still run, and each has its own PASS/FAIL line you can select with <code>-run 'TestAll/5_div_4'</code>.`;
        else if (anyFail && st.cmp === `exact` && cases.some(c => c[1] && !Number.isInteger(c[3]) && Math.abs(c[0] / c[1] - c[3]) < 0.1 && c[0] / c[1] !== c[3])) n = `Exact float comparison: 5/4 is 1.25 but the table says 1.2, so the test fails, exactly as in the book. Floats that differ only by rounding would fail too: compare with a tolerance (and fix the wrong expectation).`;
        else if (anyFail) n = `The failure messages show expected vs got. A better message also names the inputs, for example <code>t.Errorf("floatDiv(%d, %d) = %f, want %f", ...)</code>, so you can find the case without counting rows.`;
        else n = `All cases pass. Adding coverage now is a one-line change to the table, which is the main selling point of table-driven tests.`;
        q(`note`).innerHTML = note(n, panicked ? `bad` : anyFail ? `warn` : `good`);
      };
      el.addEventListener(`input`, e => {
        const t = e.target;
        if (!t.matches(`input[data-f]`)) return;
        const i = +t.dataset.i, f = +t.dataset.f;
        const v = f === 3 ? parseFloat(t.value) : Math.trunc(parseFloat(t.value));
        cases[i][f] = isNaN(v) ? 0 : v;
        run();
      });
      onAct(el, (a, b) => {
        if (a === `add`) cases.push([9, 3, 3, 3.0]);
        else if (a === `zero`) cases.push([7, 0, 0, 0]);
        else if (a === `fix`) cases.forEach(c => { if (c[0] === 5 && c[1] === 4) c[3] = 1.25; });
        else if (a === `reset`) cases = TT_BOOK.map(r => r.slice());
        else if (a === `del`) cases.splice(+b.dataset.i, 1);
        else return;
        drawTable(); run();
      });
      wireSegs(el, st, run);
      drawTable(); run();
    }
  };

  // =====================================================================
  // Ch12 - Coverage and unreachable code
  // =====================================================================
  const COV_SRC = [
    [`package coverage`, null], [``, null], [`import "fmt"`, null], [``, null],
    [`func f1() {`, null], [`\tif true {`, `A`], [`\t\tfmt.Println("Hello!")`, `B`], [`\t} else {`, null], [`\t\tfmt.Println("Hi!")`, `C`], [`\t}`, null], [`}`, null], [``, null],
    [`func f2(n int) int {`, null], [`\tif n >= 0 {`, `D`], [`\t\treturn 0`, `E`], [`\t} else if n == 1 {`, `F`], [`\t\treturn 1`, `G`], [`\t} else {`, null], [`\t\treturn f2(n-1) + f2(n-2)`, `H`], [`\t}`, null], [`}`, null]
  ];
  const COV_BLOCKS = { A: `5.11,6.10`, B: `6.10,8.3`, C: `8.8,10.3`, D: `13.20,14.12`, E: `14.12,16.3`, F: `16.8,16.19`, G: `16.19,18.3`, H: `18.8,20.3` };
  const COV_CALLS = [[`f1()`, null], [`f2(123)`, 123], [`f2(0)`, 0], [`f2(1)`, 1], [`f2(-1)`, -1]];
  const VET_SRC = [`package main`, ``, `import "fmt"`, ``, `func S2() {`, `\treturn`, `\tfmt.Println("Hello!")`, `}`, ``, `func S1() {`, `\tfmt.Println("In S1()")`, `\treturn`, `\tfmt.Println("Leaving S1()")`, `}`];
  const VET_FIXED = [`package main`, ``, `import "fmt"`, ``, `func S2() {`, `\tfmt.Println("Hello!")`, `}`, ``, `func S1() {`, `\tfmt.Println("In S1()")`, `\tfmt.Println("Leaving S1()")`, `}`];
  D.c12Coverage = {
    title: `Code coverage: which branches do your tests reach?`,
    blurb: `The book's <code>coverage.go</code> hides two logic bugs. Choose which calls the tests make and watch <code>go test -cover</code>, the <code>coverage.out</code> profile and the HTML-style highlighting update. The book's tests (<code>f1()</code> and <code>f2(123)</code>) reach 50%. Try to reach 100%: you can't, because two blocks are unreachable. Then call <code>f2(-1)</code>. Below, <code>go vet</code> catches code after a <code>return</code>.`,
    mount(el) {
      const st = { mode: `set`, vfix: `no` };
      const on = new Set([0, 1]);
      el.innerHTML = `
        <div class="ctl-row">${ctl(`test calls`, `<span data-k="calls"></span>`)}${ctl(`-covermode`, seg(`mode`, [[`set`, `set`], [`count`, `count`]], st.mode))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>go tool cover -html=coverage.out</h4><div data-k="src"></div><div class="legend"><span>${chip(`ok`, `covered`)}</span><span>${chip(`no`, `not covered`)}</span><span>${chip(`muted`, `not tracked`)}</span></div></div>
          <div class="lab-panel"><h4>$ go test -cover / coverage.out</h4><div data-k="out"></div><div data-k="bars" style="margin-top:8px"></div></div>
        </div>
        <div data-k="note"></div>
        <div class="lab-grid even" style="margin-top:12px">
          <div class="lab-panel"><h4>cannotReach.go ${seg(`vfix`, [[`no`, `as written`], [`yes`, `returns removed`]], st.vfix)}</h4><div data-k="vsrc"></div></div>
          <div class="lab-panel"><h4>$ go vet cannotReach.go</h4><div data-k="vout"></div></div>
        </div>`;
      const q = qsel(el);
      const drawCalls = () => { q(`calls`).innerHTML = COV_CALLS.map(([l], i) => `<button class="lab-btn${on.has(i) ? `` : ` ghost`}" style="margin-right:4px;padding:3px 10px" data-act="call" data-i="${i}">${l}</button>`).join(``); };
      const draw = () => {
        drawCalls();
        const cnt = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 };
        let crash = false;
        on.forEach(i => {
          const arg = COV_CALLS[i][1];
          if (arg === null) { cnt.A++; cnt.B++; }
          else if (arg >= 0) { cnt.D++; cnt.E++; }
          else crash = true;
        });
        const total = 8, covered = Object.values(cnt).filter(v => v > 0).length;
        const lineBg = i => {
          const b = COV_SRC[i][1];
          if (!b || crash) return ``;
          return cnt[b] ? BG_OK : BG_BAD;
        };
        q(`src`).innerHTML = codeView(COV_SRC.map(r => r[0]), lineBg);
        if (crash) {
          q(`out`).innerHTML = pblock(`bad`, `go test -cover *.go`, `runtime: goroutine stack exceeds 1000000000-byte limit\nruntime: sp=0x14020160380 stack=[0x14020160000, 0x14040160000]\nfatal error: stack overflow\n\ngoroutine 18 [running]:\ncommand-line-arguments.f2(0xfffffffffff0bdc1)\n...\nFAIL\tcommand-line-arguments\t1.215s\nFAIL`);
          q(`bars`).innerHTML = ``;
          q(`note`).innerHTML = note(`<code>f2(-1)</code> skips both conditions, takes the <code>else</code> branch and calls <code>f2(-2) + f2(-3)</code>, which never reach a base case. The goroutine stack hits Go's 1 GB limit and the <strong>test binary dies</strong>, so no coverage profile is written. Coverage would only have told you the branch was red; this is the "does not work with negative integers" bug that coverage cannot find for you.`, `bad`);
          return;
        }
        const prof = [`mode: ${st.mode}`].concat(Object.keys(COV_BLOCKS).map(b => `coverage.go:${COV_BLOCKS[b]} 1 ${st.mode === `set` ? (cnt[b] ? 1 : 0) : cnt[b]}`));
        const fn = keys => { const c = keys.filter(k => cnt[k]).length; return round(100 * c / keys.length, 1); };
        q(`out`).innerHTML = pblock(covered === total ? `out` : `ctx`, `go test -cover *.go`, `ok  \tcommand-line-arguments\t0.420s\tcoverage: ${round(100 * covered / total, 1).toFixed(1)}% of statements`) +
          pblock(`sys`, `cat coverage.out`, prof.join(`\n`)) +
          pblock(`sys`, `go tool cover -func=coverage.out`, `coverage.go:5:\tf1\t\t${fn([`A`, `B`, `C`]).toFixed(1)}%\ncoverage.go:13:\tf2\t\t${fn([`D`, `E`, `F`, `G`, `H`]).toFixed(1)}%\ntotal:\t\t(statements)\t${round(100 * covered / total, 1).toFixed(1)}%`);
        q(`bars`).innerHTML = hbars([
          { label: `f1`, value: fn([`A`, `B`, `C`]), text: fn([`A`, `B`, `C`]) + `%`, cls: fn([`A`, `B`, `C`]) === 100 ? `good` : `warn` },
          { label: `f2`, value: fn([`D`, `E`, `F`, `G`, `H`]), text: fn([`D`, `E`, `F`, `G`, `H`]) + `%`, cls: `warn` },
          { label: `total`, value: 100 * covered / total, text: round(100 * covered / total, 1) + `%`, cls: covered === total ? `good` : `` }
        ], 100);
        let n = `Each line of <code>coverage.out</code> is <code>file:startLine.col,endLine.col numStatements count</code>; a 0 count is painted red. `;
        if (!on.size) n += `With no test calls, nothing runs: 0% coverage.`;
        else n += `The best you can do here is <strong>${covered === 4 ? `50` : round(100 * covered / total, 1)}%</strong> of 8 statements. Line 9 (<code>fmt.Println("Hi!")</code>) needs <code>if true</code> to be false, and line 17 (<code>return 1</code>) needs <code>n == 1</code> after <code>n &gt;= 0</code> already failed, which is impossible. Lines 16 and 19 only run for negative <code>n</code>, which crashes. Red code that no input can reach is a logic bug, not a missing test.`;
        if (st.mode === `count`) n += ` In <code>count</code> mode the last field is how many times each block ran, which helps spot hot paths.`;
        q(`note`).innerHTML = note(n, `warn`);
      };
      const drawVet = () => {
        const fixed = st.vfix === `yes`;
        const src = fixed ? VET_FIXED : VET_SRC;
        q(`vsrc`).innerHTML = codeView(src, i => !fixed && (i === 6 || i === 12) ? BG_BAD : !fixed && (i === 5 || i === 11) ? BG_WARN : ``);
        q(`vout`).innerHTML = fixed ? pblock(`out`, `go vet`, `(no output: vet found nothing suspicious)`) :
          pblock(`bad`, `go vet`, `# command-line-arguments\n./cannotReach.go:7:2: unreachable code\n./cannotReach.go:13:2: unreachable code`) +
          note(`The compiler accepts statements after a <code>return</code>, because this is a logic error rather than a syntax error. <code>go vet</code> (a subset of which runs during <code>go test</code>) and staticcheck catch it.`, `warn`);
      };
      onAct(el, (a, b) => { if (a === `call`) { const i = +b.dataset.i; if (on.has(i)) on.delete(i); else on.add(i); draw(); } });
      wireSegs(el, st, k => { if (k === `vfix`) drawVet(); else draw(); });
      draw(); drawVet();
    }
  };

  // =====================================================================
  // Ch12 - pprof flat vs cum
  // =====================================================================
  function ppTree(fix) {
    const n2 = fix === `none` ? 300 : 3, pre = fix === `none` ? 30 : 0, n1 = fix === `both` ? 2 : 120;
    return [
      [`runtime.main`, 0, [
        [`main.main`, 10, [
          [`main.N2`, n2, pre ? [[`runtime.asyncPreempt`, pre, []]] : []],
          [`main.N1`, n1, []],
          [`fmt.Println`, 0, [[`os.(*File).Write`, 0, [[`internal/poll.(*pollDesc).prepare`, 10, []]]]]],
          [`runtime.GC`, 0, [[`runtime.memclrNoHeapPointers`, 10, []], [`runtime.madvise`, 10, []]]]
        ]]
      ]],
      [`runtime.mcall`, 0, [[`runtime.park_m`, 0, [[`runtime.schedule`, 10, [[`runtime.findRunnable`, 0, [[`runtime.kevent`, 40, []], [`runtime.pthread_cond_wait`, 40, []]]]]]]]]],
      [`runtime.gcBgMarkWorker`, 0, [[`runtime.notewakeup`, 0, [[`runtime.semawakeup`, 0, [[`runtime.pthread_cond_signal`, 40, []]]]]], [`runtime.madvise`, 20, []]]]
    ];
  }
  const PP_SRC = {
    none: {
      [`main.N1`]: [[36, `func N1(n int) bool {`, 0, 0], [37, `\tk := math.Floor(float64(n/2 + 1))`, 0, 0], [38, `\tfor i := 2; i < int(k); i++ {`, 0, 0], [39, `\t\tif (n % i) == 0 {`, 1, 1], [40, `\t\t\treturn false`, 0, 0], [41, `\t\t}`, 0, 0], [42, `\t}`, 0, 0], [43, `\treturn true`, 0, 0], [44, `}`, 0, 0]],
      [`main.N2`]: [[46, `func N2(n int) bool {`, 0, 0], [47, `\tfor i := 2; i < n; i++ {`, 0, `pre`], [48, `\t\tif (n % i) == 0 {`, 1, 1], [49, `\t\t\treturn false`, 0, 0], [50, `\t\t}`, 0, 0], [51, `\t}`, 0, 0], [52, `\treturn true`, 0, 0], [53, `}`, 0, 0]]
    },
    sqrt: {
      [`main.N1`]: [[36, `func N1(n int) bool {`, 0, 0], [37, `\tk := int(math.Sqrt(float64(n))) + 1`, 0, 0], [38, `\tfor i := 2; i < k; i++ {`, 0, 0], [39, `\t\tif (n % i) == 0 {`, 1, 1], [40, `\t\t\treturn false`, 0, 0], [41, `\t\t}`, 0, 0], [42, `\t}`, 0, 0], [43, `\treturn true`, 0, 0], [44, `}`, 0, 0]],
      [`main.N2`]: [[46, `func N2(n int) bool {`, 0, 0], [47, `\tfor i := 2; i*i <= n; i++ {`, 0, 0], [48, `\t\tif (n % i) == 0 {`, 1, 1], [49, `\t\t\treturn false`, 0, 0], [50, `\t\t}`, 0, 0], [51, `\t}`, 0, 0], [52, `\treturn true`, 0, 0], [53, `}`, 0, 0]]
    }
  };
  D.c12Pprof = {
    title: `Reading a CPU profile: flat, cum, top and list`,
    blurb: `A profile shaped after the book's <code>go tool pprof cpuProfileCla.out</code> session (650 ms of samples, with <code>main.N2</code> on top). Switch between <code>top</code>, <code>top10 -cum</code>, the call tree and <code>list</code>, and click a function to inspect it. Then "optimize" the prime checks and watch the profile shift until the runtime itself dominates, which is the signal to stop optimizing.`,
    mount(el) {
      const st = { view: `top`, fix: `none` };
      let sel = `main.N2`;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`(pprof)`, seg(`view`, [[`top`, `top`], [`cum`, `top10 -cum`], [`tree`, `call tree`], [`list`, `list fn`]], st.view))}${ctl(`code`, seg(`fix`, [[`none`, `as in the book`], [`n2`, `N2 loops to &radic;n`], [`both`, `N1 and N2 to &radic;n`]], st.fix))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4 data-k="h"></h4><div data-k="main"></div></div>
          <div class="lab-panel"><h4>Where the samples went (flat)</h4><div data-k="bars"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const draw = () => {
        const roots = ppTree(st.fix);
        const flat = {}, cum = {}, kids = {};
        const walk = (n, stack) => {
          const [name, f, ch] = n;
          flat[name] = (flat[name] || 0) + f;
          let c = f;
          ch.forEach(k => { c += walk(k, stack.concat(name)); (kids[name] = kids[name] || new Set()).add(k[0]); });
          if (!stack.includes(name)) cum[name] = (cum[name] || 0) + c;
          return c;
        };
        roots.forEach(r => walk(r, []));
        const total = sum(Object.values(flat));
        const names = Object.keys(flat);
        const p = v => round(100 * v / total, 2).toFixed(2) + `%`;
        const ms = v => v ? v + `ms` : `0`;
        const table = order => {
          let s = 0;
          return `<table class="mini-table"><tr><th class="num">flat</th><th class="num">flat%</th><th class="num">sum%</th><th class="num">cum</th><th class="num">cum%</th><th></th></tr>${order.slice(0, 10).map(nm => { s += flat[nm]; return `<tr class="${nm === sel ? `new` : ``}" data-act="sel" data-fn="${esc(nm)}" style="cursor:pointer"><td class="num">${ms(flat[nm])}</td><td class="num">${p(flat[nm])}</td><td class="num">${p(s)}</td><td class="num">${ms(cum[nm])}</td><td class="num">${p(cum[nm])}</td><td>${esc(nm)}</td></tr>`; }).join(``)}</table>`;
        };
        const hdr = `Type: cpu\nTotal samples = ${total}ms\n`;
        if (st.view === `top`) {
          q(`h`).textContent = `(pprof) top`;
          const order = names.slice().sort((a, b) => flat[b] - flat[a] || cum[b] - cum[a]);
          q(`main`).innerHTML = pblock(`sys`, `header`, hdr + `Showing top 10 nodes out of ${names.length}`) + table(order);
        } else if (st.view === `cum`) {
          q(`h`).textContent = `(pprof) top10 -cum`;
          const order = names.slice().sort((a, b) => cum[b] - cum[a] || flat[b] - flat[a]);
          q(`main`).innerHTML = pblock(`sys`, `header`, hdr + `Showing top 10 nodes out of ${names.length}`) + table(order);
        } else if (st.view === `tree`) {
          q(`h`).textContent = `call tree (what pdf / web draw as a graph)`;
          const rows = [];
          const tw = (n, d) => { const [name, f, ch] = n; const c = f + sum(ch.map(function cc(k) { return k[1] + sum(k[2].map(cc)); })); rows.push([d, name, f, c]); ch.forEach(k => tw(k, d + 1)); };
          roots.forEach(r => tw(r, 0));
          q(`main`).innerHTML = `<div class="scroll-y" style="max-height:340px"><table class="mini-table"><tr><th>function</th><th class="num">flat</th><th class="num">cum</th></tr>${rows.map(([d, nm, f, c]) => `<tr class="${nm === sel ? `new` : ``}" data-act="sel" data-fn="${esc(nm)}" style="cursor:pointer"><td><span style="padding-left:${d * 14}px">${d ? `&#8627; ` : ``}${esc(nm)}</span></td><td class="num">${ms(f)}</td><td class="num">${ms(c)}</td></tr>`).join(``)}</table></div>`;
        } else {
          q(`h`).textContent = `(pprof) list ${sel}`;
          const src = (st.fix === `none` ? PP_SRC.none : st.fix === `n2` ? { [`main.N1`]: PP_SRC.none[`main.N1`], [`main.N2`]: PP_SRC.sqrt[`main.N2`] } : PP_SRC.sqrt)[sel];
          if (src) {
            const pre = flat[`runtime.asyncPreempt`] || 0;
            const body = src.map(([ln, code, hotF, hotC]) => {
              const f = hotF ? flat[sel] : 0;
              const c = hotC === `pre` ? pre : hotC ? flat[sel] : 0;
              return `${(f ? f + `ms` : `.`).padStart(10)} ${(c ? c + `ms` : `.`).padStart(10)} ${String(ln).padStart(6)}:${code}`;
            }).join(`\n`);
            q(`main`).innerHTML = pblock(`ctx`, `ROUTINE ======================== ${sel} in profileCla.go`, `${String(flat[sel]).padStart(7)}ms ${String(cum[sel]).padStart(9)}ms (flat, cum) ${p(cum[sel])} of Total\n` + body);
          } else {
            q(`main`).innerHTML = pblock(`sys`, sel, `flat ${ms(flat[sel])}, cum ${ms(cum[sel])}\n` + (sel.startsWith(`runtime`) || sel.includes(`poll`) || sel.includes(`os.`) || sel.includes(`fmt.`) ? `Source lives in $GOROOT; list works for it too, but you rarely optimize the runtime itself.\nAsk instead: which of MY functions makes the runtime do this work?` : `Click main.N1 or main.N2 in top / tree for an annotated listing.`) + (kids[sel] ? `\ncallees: ` + Array.from(kids[sel]).join(`, `) : ``));
          }
        }
        const order = names.slice().sort((a, b) => flat[b] - flat[a]).filter(nm => flat[nm] > 0).slice(0, 8);
        q(`bars`).innerHTML = hbars(order.map(nm => ({ label: nm.replace(`runtime.`, `rt.`).replace(`internal/poll.(*pollDesc).`, `poll.`), title: nm, value: flat[nm], text: flat[nm] + `ms`, cls: nm.startsWith(`main.`) ? `warn` : `alt` })));
        const user = (flat[`main.N1`] || 0) + (flat[`main.N2`] || 0) + (flat[`main.main`] || 0);
        q(`stats`).innerHTML = stat(`total samples`, total + ` ms`) + stat(`main.main cum`, cum[`main.main`] + ` ms`) + stat(`your code (flat)`, p(user), user / total > 0.5 ? `bad` : `good`);
        let n;
        if (st.view === `top` || st.view === `cum`) n = st.view === `top` ? `<strong>flat</strong> = samples in the function's own code; <strong>sum%</strong> is the running total down the list; <strong>cum</strong> adds everything it calls. Sorted by flat, the hot leaf functions come first: that is where to optimize.` : `Sorted by <strong>cum</strong>, dispatchers rise to the top: <code>runtime.main</code> and <code>main.main</code> do almost nothing themselves (flat 0-10 ms) but everything happens below them.`;
        else if (st.view === `tree`) n = `The same samples as a tree. A function's cum is its flat plus the cum of its children. <code>runtime.madvise</code> appears twice (called from <code>runtime.GC</code> and from a background worker), so <code>top</code> merges both call sites into one row.`;
        else n = `<code>list</code> annotates source lines. In the book, all of N1's 120 ms sat on <code>if (n % i) == 0</code>: the modulo in the loop is the cost, so reducing loop iterations is the only real fix.`;
        if (st.fix !== `none`) n += ` After bounding the loop at &radic;n, ${st.fix === `both` ? `both prime checks` : `N2`} nearly vanish and the remaining samples are scheduler waits, syscalls and GC. Further micro-optimization of your code would buy almost nothing.`;
        q(`note`).innerHTML = note(n, st.fix === `none` ? `` : `good`);
      };
      onAct(el, (a, b) => { if (a === `sel`) { sel = b.dataset.fn; draw(); } });
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch13 - Fuzzing simulator
  // =====================================================================
  function u8dec(b, i) {
    const c0 = b[i];
    const ct = (x, lo, hi) => x !== undefined && x >= (lo || 0x80) && x <= (hi || 0xBF);
    if (c0 < 0x80) return [c0, 1];
    if (c0 >= 0xC2 && c0 <= 0xDF) return ct(b[i + 1]) ? [((c0 & 0x1F) << 6) | (b[i + 1] & 0x3F), 2] : [0xFFFD, 1];
    if (c0 >= 0xE0 && c0 <= 0xEF) {
      const lo = c0 === 0xE0 ? 0xA0 : 0x80, hi = c0 === 0xED ? 0x9F : 0xBF;
      return ct(b[i + 1], lo, hi) && ct(b[i + 2]) ? [((c0 & 0x0F) << 12) | ((b[i + 1] & 0x3F) << 6) | (b[i + 2] & 0x3F), 3] : [0xFFFD, 1];
    }
    if (c0 >= 0xF0 && c0 <= 0xF4) {
      const lo = c0 === 0xF0 ? 0x90 : 0x80, hi = c0 === 0xF4 ? 0x8F : 0xBF;
      return ct(b[i + 1], lo, hi) && ct(b[i + 2]) && ct(b[i + 3]) ? [((c0 & 0x07) << 18) | ((b[i + 1] & 0x3F) << 12) | ((b[i + 2] & 0x3F) << 6) | (b[i + 3] & 0x3F), 4] : [0xFFFD, 1];
    }
    return [0xFFFD, 1];
  }
  const u8valid = b => { for (let i = 0; i < b.length;) { const [r, n] = u8dec(b, i); if (r === 0xFFFD && n === 1) return false; i += n; } return true; };
  const u8enc = r => r < 0x80 ? [r] : r < 0x800 ? [0xC0 | (r >> 6), 0x80 | (r & 0x3F)] : r < 0x10000 ? [0xE0 | (r >> 12), 0x80 | ((r >> 6) & 0x3F), 0x80 | (r & 0x3F)] : [0xF0 | (r >> 18), 0x80 | ((r >> 12) & 0x3F), 0x80 | ((r >> 6) & 0x3F), 0x80 | (r & 0x3F)];
  const strBytes = s => { const out = []; for (const ch of String(s)) out.push(...u8enc(ch.codePointAt(0))); return out; };
  const toRunes = b => { const r = []; for (let i = 0; i < b.length;) { const [c, n] = u8dec(b, i); r.push(c); i += n; } return r; };
  const fromRunes = rs => { const out = []; rs.forEach(r => out.push(...u8enc(r))); return out; };
  const eqB = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const hex2 = x => x.toString(16).padStart(2, `0`);
  function goQuote(b) {
    let s = `"`;
    for (let i = 0; i < b.length;) {
      const [r, n] = u8dec(b, i);
      if (r === 0xFFFD && n === 1) s += `\\x` + hex2(b[i]);
      else if (r === 0x22) s += `\\"`;
      else if (r === 0x5C) s += `\\\\`;
      else if (r === 0x0A) s += `\\n`;
      else if (r === 0x09) s += `\\t`;
      else if (r < 0x20 || r === 0x7F) s += `\\x` + hex2(r);
      else s += String.fromCodePoint(r);
      i += n;
    }
    return s + `"`;
  }
  const fzHash = arr => {
    let h1 = 0x811c9dc5, h2 = 0x9747b28c;
    arr.forEach(x => { h1 = Math.imul(h1 ^ (x & 0xFF), 0x01000193) >>> 0; h2 = Math.imul(h2 ^ ((x >>> 8) ^ x), 0x5bd1e995) >>> 0; h2 = (h2 ^ (h2 >>> 13)) >>> 0; });
    return h1.toString(16).padStart(8, `0`) + h2.toString(16).padStart(8, `0`);
  };
  const FZ_MB = [`é`, `Ԕ`, `世`, `ж`, `🙂`, `ß`];
  const FZ_T = {
    addint: { fn: `FuzzAddInt`, label: `AddInt (book, buggy)`, ints: true, run: ([x, y]) => { const got = x > 0 ? y + x : y; return got !== x + y ? `code_test.go:40: X: ${x}, Y: ${y}, Result ${got}, want ${x + y}` : null; } },
    addfix: { fn: `FuzzAddInt`, label: `AddInt fixed`, ints: true, run: () => null },
    r1: { fn: `FuzzReverse`, label: `R1: reverse bytes`, run: b => { const rev = b.slice().reverse(); const dbl = rev.slice().reverse(); if (!eqB(dbl, b)) return `reverse_test.go:51: Before: ${goQuote(b)}, after: ${goQuote(dbl)}`; if (u8valid(b) && !u8valid(rev)) return `reverse_test.go:55: Reverse: invalid UTF-8 string ${goQuote(rev)}`; return null; } },
    runes: { fn: `FuzzReverse`, label: `R2: []rune, no UTF-8 check`, run: b => { const rev = fromRunes(toRunes(b).reverse()); const dbl = fromRunes(toRunes(rev).reverse()); if (!eqB(dbl, b)) return `reverse_test.go:51: Before: ${goQuote(b)}, after: ${goQuote(dbl)}`; if (u8valid(b) && !u8valid(rev)) return `reverse_test.go:55: Reverse: invalid UTF-8 string ${goQuote(rev)}`; return null; } },
    fixed: { fn: `FuzzReverse`, label: `R2 fixed: ValidString + []rune`, run: b => { if (!u8valid(b)) return null; const rev = fromRunes(toRunes(b).reverse()); const dbl = fromRunes(toRunes(rev).reverse()); if (!eqB(dbl, b)) return `reverse_test.go:51: Before: ${goQuote(b)}, after: ${goQuote(dbl)}`; return null; } }
  };
  const FZ_CODE = {
    addint: `func AddInt(x, y int) int {\n\tfor i := 0; i < x; i++ {\n\t\ty = y + 1\n\t}\n\treturn y\n}`,
    addfix: `func AddInt(x, y int) int {\n\tif x < 0 {\n\t\tfor i := 0; i > x; i-- {\n\t\t\ty = y - 1\n\t\t}\n\t\treturn y\n\t}\n\tfor i := 0; i < x; i++ {\n\t\ty = y + 1\n\t}\n\treturn y\n}`,
    r1: `func R1(s string) []byte {\n\tsAr := []byte(s)\n\trev := make([]byte, len(s))\n\tl := len(sAr)\n\tfor i := 0; i < l; i++ {\n\t\trev[i] = sAr[l-1-i]\n\t}\n\treturn rev\n}`,
    runes: `func R2(s string) string {\n\tr := []rune(s) // invalid bytes become U+FFFD\n\tfor i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {\n\t\tr[i], r[j] = r[j], r[i]\n\t}\n\treturn string(r)\n}`,
    fixed: `func R2(s string) (string, error) {\n\tif !utf8.ValidString(s) {\n\t\treturn s, errors.New("Invalid UTF-8")\n\t}\n\tr := []rune(s)\n\tfor i, j := 0, len(r)-1; i < len(r)/2; i, j = i+1, j-1 {\n\t\tr[i], r[j] = r[j], r[i]\n\t}\n\treturn string(r), nil\n}`
  };
  const fzFeatB = b => {
    const f = [`len${b.length === 0 ? 0 : b.length < 2 ? 1 : b.length < 5 ? 2 : b.length < 17 ? 3 : 4}`];
    let inv = 0, mb = 0;
    for (let i = 0; i < b.length;) { const [r, n] = u8dec(b, i); if (r === 0xFFFD && n === 1) inv++; else if (n > 1) { mb++; f.push(`mb${n}`); } i += n; }
    if (inv) f.push(`inv${Math.min(inv, 3)}`);
    if (mb) f.push(`mbc${Math.min(mb, 3)}`);
    return f;
  };
  const fzFeatI = ([x, y]) => [`xs${Math.sign(x)}`, `ys${Math.sign(y)}`, `xm${Math.min(4, String(Math.abs(x)).length)}`, `ym${Math.min(4, String(Math.abs(y)).length)}`];
  function fzMutB(b, r, corpus) {
    const out = b.slice();
    const pos = () => Math.floor(r() * (out.length + 1));
    const k = Math.floor(r() * 8);
    if (k === 0 && out.length) { const i = Math.floor(r() * out.length); out[i] ^= 1 << Math.floor(r() * 8); }
    else if (k === 1 && out.length) out[Math.floor(r() * out.length)] = Math.floor(r() * 256);
    else if (k === 2) out.splice(pos(), 0, 32 + Math.floor(r() * 95));
    else if (k === 3) { if (r() < 0.3) out.splice(pos(), 0, ...strBytes(FZ_MB[Math.floor(r() * FZ_MB.length)])); else out.splice(pos(), 0, 97 + Math.floor(r() * 26)); }
    else if (k === 4 && out.length > 1) out.splice(Math.floor(r() * out.length), 1);
    else if (k === 5 && out.length) { const i = Math.floor(r() * out.length), L = 1 + Math.floor(r() * Math.min(4, out.length - i)); out.splice(pos(), 0, ...out.slice(i, i + L)); }
    else if (k === 6) { const o = corpus[Math.floor(r() * corpus.length)].v; const c = Math.floor(r() * (o.length + 1)); out.splice(pos(), 0, ...o.slice(c, c + 3)); }
    else if (out.length) { const i = Math.floor(r() * out.length); out[i] = (out[i] + 1 + Math.floor(r() * 3)) & 0x7F; }
    if (out.length > 24) out.length = 24;
    return out;
  }
  function fzMutI(v, r) {
    const out = v.slice(), i = r() < 0.5 ? 0 : 1, k = Math.floor(r() * 5);
    if (k === 0) out[i] += (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 64));
    else if (k === 1) out[i] = -out[i];
    else if (k === 2) out[i] = Math.floor(r() * 257) - 128;
    else if (k === 3) out[i] = [0, 1, -1, 127, -128][Math.floor(r() * 5)];
    else out[i] = Math.floor(r() * 20001) - 10000;
    return out;
  }
  D.c13Fuzz = {
    title: `Fuzzing simulator: seed corpus, mutations and crashers`,
    blurb: `A toy-scale, coverage-guided fuzzer modelled on <code>go test -fuzz</code>, running the book's examples: <code>AddInt</code>, which ignores negative <code>x</code>, and the string reversers. The fuzz target checks two properties: reversing twice gives the original, and valid UTF-8 stays valid. Mutated inputs that reach new behaviour join the corpus ("new interesting"). When a check fails, the input is minimized and written to <code>testdata/fuzz</code>, and plain <code>go test</code> keeps failing until the code is fixed. The real fuzzer runs hundreds of thousands of execs per second on all cores; this one runs a few hundred so you can watch.`,
    mount(el, ctx) {
      const st = { impl: `r1`, speed: `slow`, ft: `10` };
      const testdata = { FuzzAddInt: [], FuzzReverse: [] };
      let seedSeq = 7, run = null;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`code under test`, seg(`impl`, Object.keys(FZ_T).map(k => [k, FZ_T[k].label]), st.impl))}</div>
        <div class="ctl-row">${ctl(`-fuzztime`, seg(`ft`, [[`10`, `10s`], [`0`, `until failure`]], st.ft))}${ctl(`speed`, seg(`speed`, [[`slow`, `slow`], [`fast`, `fast`]], st.speed))}${btn(`fuzz`, `go test -fuzz`)}${btn(`stop`, `Ctrl+C`, true)}${btn(`test`, `go test (no -fuzz)`, true)}${btn(`clean`, `rm -r testdata`, true)}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Seed corpus (one f.Add per line)</h4><textarea class="lab-textarea" data-k="seeds" rows="3"></textarea><div data-k="code" style="margin-top:8px"></div><h4 style="margin-top:8px">Last input executed</h4><div class="bytes" data-k="bytes"></div></div>
          <div class="lab-panel"><h4>Terminal</h4><div class="log" data-k="log" style="max-height:300px"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>Corpus</h4><div class="scroll-y" style="max-height:160px" data-k="corpus"></div></div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const T = () => FZ_T[st.impl];
      const defaultSeeds = () => T().ints ? `0,1\n0,100` : `Hello, world\n \n!12345`;
      const parseSeeds = () => {
        const lines = q(`seeds`).value.split(`\n`);
        if (T().ints) return lines.map(l => l.split(`,`).map(x => parseInt(x, 10))).filter(p => p.length === 2 && p.every(x => !isNaN(x)));
        return lines.filter((l, i) => l.length || i < lines.length - 1).map(strBytes);
      };
      const fmtIn = v => T().ints ? `int(${v[0]})\nint(${v[1]})` : `string(${goQuote(v)})`;
      const shortIn = v => T().ints ? `(${v[0]}, ${v[1]})` : goQuote(v);
      let log = [], lastIn = null, lastFail = null;
      const say = (cls, t) => { t.split(`\n`).forEach(line => log.push([cls, line])); if (log.length > 120) log = log.slice(-120); };
      const drawBytes = () => {
        if (!lastIn) { q(`bytes`).innerHTML = `<span class="cs-note">nothing executed yet</span>`; return; }
        if (T().ints) { q(`bytes`).innerHTML = lastIn.map((v, i) => `<span class="byte ${v < 0 ? `bad` : `c0`}">${v}<small>${i ? `y` : `x`}</small></span>`).join(``); return; }
        let h = ``;
        for (let i = 0; i < lastIn.length;) {
          const [r, n] = u8dec(lastIn, i);
          for (let j = 0; j < n; j++) {
            const by = lastIn[i + j];
            const cls = r === 0xFFFD && n === 1 ? `bad` : n === 1 ? `c0` : j === 0 ? `c2` : `c1`;
            h += `<span class="byte ${cls}">${hex2(by)}<small>${n === 1 && r !== 0xFFFD && by >= 32 && by < 127 ? esc(String.fromCharCode(by)) : r === 0xFFFD && n === 1 ? `bad` : j === 0 ? esc(String.fromCodePoint(r)) : `+`}</small></span>`;
          }
          i += n;
        }
        q(`bytes`).innerHTML = h || `<span class="cs-note">empty string ""</span>`;
      };
      const draw = () => {
        q(`log`).innerHTML = log.map(([c, t]) => `<div class="${c}">${esc(t) || `&nbsp;`}</div>`).join(``);
        const lg = q(`log`); lg.scrollTop = lg.scrollHeight;
        drawBytes();
        const corpus = run ? run.corpus : [];
        const td = testdata[T().fn];
        q(`corpus`).innerHTML = `<table class="mini-table"><tr><th>source</th><th>input</th></tr>${td.map(e => `<tr><td>${chip(`no`, `testdata/fuzz/${T().fn}/${e.h.slice(0, 8)}...`)}</td><td>${esc(shortIn(e.v))}</td></tr>`).join(``)}${(corpus.length ? corpus : parseSeeds().map(v => ({ v, src: `seed` }))).filter(e => e.src !== `testdata`).map(e => `<tr><td>${e.src === `seed` ? chip(`final`, `seed (f.Add)`) : chip(`muted`, `generated`)}</td><td>${esc(shortIn(e.v))}</td></tr>`).join(``)}</table>`;
        const r = run;
        q(`stats`).innerHTML = stat(`execs`, r ? fmtNum(r.execs) : 0) + stat(`corpus`, r ? r.corpus.length : parseSeeds().length + td.length) + stat(`new interesting`, r ? r.ni : 0) + stat(`elapsed`, r ? round(r.ticks / 10, 1) + `s` : `0s`) + stat(`testdata`, td.length, td.length ? `bad` : ``);
        let n;
        const k = st.impl;
        if (lastFail && lastFail.impl === k) {
          if (k === `addint`) n = `The fuzzer tried a negative <code>x</code>. The <code>for i := 0; i &lt; x; i++</code> loop never runs, so <code>AddInt</code> returns <code>y</code>. The positive-only table test never noticed. Switch to "AddInt fixed" and run plain <code>go test</code>: the saved crasher now passes.`;
          else if (k === `r1`) n = `Reversing <strong>bytes</strong> splits a multi-byte character: <code>"Ԕ"</code> is <code>d4 94</code>, reversed <code>94 d4</code>, which is invalid UTF-8. Reversing twice still restores the original, so only the "valid stays valid" property catches it. Try the rune-based version next.`;
          else if (k === `runes`) n = `Reversing <strong>runes</strong> fixes multi-byte characters, but converting <em>invalid</em> UTF-8 to <code>[]rune</code> replaces each bad byte with U+FFFD (<code>ef bf bd</code>), so the round trip no longer returns the original bytes. That's why the book's fix checks <code>utf8.ValidString</code> first and returns an error.`;
          else n = `A saved crasher still fails this implementation.`;
        } else if (run && run.done === `pass`) n = k === `fixed` || k === `addfix` ? `No failures within -fuzztime: invalid UTF-8 is rejected up front (the target returns early on error), and valid strings are reversed rune by rune. Fuzzing can't prove the absence of bugs, but every input it found interesting is now in the cache and will be retried next time.` : `No failure found within -fuzztime this time. Fuzzing is random: run it again or use "until failure".`;
        else n = `The colored boxes show the bytes of the last input: <span class="chip final">ASCII</span> single bytes, multi-byte characters as lead + continuation bytes, and invalid bytes in red. Press <strong>go test -fuzz</strong>. Plain <code>go test</code> only runs the seeds and the saved testdata files.`;
        q(`note`).innerHTML = note(n, lastFail && lastFail.impl === k ? `bad` : run && run.done === `pass` ? `good` : ``);
      };
      const finish = (kind) => { run.done = kind; if (run.h) { ctx.clear ? ctx.clear(run.h) : clearInterval(run.h); run.h = null; } };
      const failOut = (v, msg, label, minimized) => {
        const h = fzHash(T().ints ? v.map(x => x & 0xFFFF).concat(v.map(x => (x >>> 16) & 0xFFFF)) : v);
        if (minimized) say(`info`, `fuzz: minimizing ${minimized}-byte failing input file`);
        say(`bad`, `--- FAIL: ${T().fn} (${round(run.ticks / 10 + 0.02, 2)}s)\n    --- FAIL: ${T().fn} (0.00s)\n        ${msg}\n\n    Failing input written to testdata/fuzz/${T().fn}/${h}\n    To re-run:\n    go test -run=${T().fn}/${h}\nFAIL\nexit status 1\nFAIL\tcommand-line-arguments\t${round(run.ticks / 10 + 0.2, 3)}s`);
        say(`info`, `$ cat testdata/fuzz/${T().fn}/${h}\ngo test fuzz v1\n${fmtIn(v)}`);
        testdata[T().fn].push({ v, h });
        lastFail = { impl: st.impl };
        void label;
      };
      const minimize = v => {
        if (T().ints) return v;
        let cur = v.slice(), ch = true;
        while (ch) { ch = false; for (let i = 0; i < cur.length; i++) { const t = cur.slice(0, i).concat(cur.slice(i + 1)); if (T().run(t)) { cur = t; ch = true; break; } } }
        return cur;
      };
      const tick = () => {
        if (!run || run.done) return;
        const t = T(), r = run.rnd, batch = st.speed === `fast` ? 40 : 4;
        for (let b = 0; b < batch; b++) {
          const parent = run.corpus[Math.floor(r() * run.corpus.length)].v;
          const v = t.ints ? fzMutI(parent, r) : fzMutB(parent, r, run.corpus);
          run.execs++; lastIn = v;
          const msg = t.run(v);
          if (msg) {
            const m = minimize(v);
            failOut(m, t.run(m), ``, t.ints ? 0 : v.length);
            finish(`fail`); draw(); return;
          }
          const fs = t.ints ? fzFeatI(v) : fzFeatB(v);
          if (fs.some(f => !run.seen.has(f))) { fs.forEach(f => run.seen.add(f)); run.corpus.push({ v, src: `gen` }); run.ni++; }
        }
        run.ticks++;
        if (run.ticks % 30 === 0) say(`info`, `fuzz: elapsed: ${run.ticks / 10}s, execs: ${run.execs} (${Math.round(run.execs / (run.ticks / 10))}/sec), new interesting: ${run.ni} (total: ${run.corpus.length})`);
        if (String(st.ft) !== `0` && run.ticks >= 100) {
          say(`info`, `fuzz: elapsed: 10s, execs: ${run.execs} (${Math.round(run.execs / 10)}/sec), new interesting: ${run.ni} (total: ${run.corpus.length})`);
          say(`ok`, `PASS\nok  \tcommand-line-arguments\t10.396s`);
          finish(`pass`);
        }
        draw();
      };
      const startFuzz = () => {
        if (run && run.h) finish(`stopped`);
        const t = T();
        const seeds = parseSeeds();
        const td = testdata[t.fn];
        log = []; lastFail = null;
        say(`info`, `$ go test -fuzz=${t.fn} *.go${String(st.ft) !== `0` ? ` -fuzztime 10s` : ``}`);
        run = { rnd: mulberry32(seedSeq++ * 2654435761), corpus: td.map(e => ({ v: e.v, src: `testdata` })).concat(seeds.map(v => ({ v, src: `seed` }))), execs: 0, ni: 0, ticks: 0, seen: new Set(), done: null, h: null };
        if (!run.corpus.length) run.corpus.push({ v: t.ints ? [0, 0] : [], src: `seed` });
        const N = run.corpus.length;
        say(`info`, `fuzz: elapsed: 0s, gathering baseline coverage: 0/${N} completed`);
        for (const e of run.corpus) {
          lastIn = e.v; run.execs++;
          const msg = t.run(e.v);
          if (msg) {
            const nm = e.src === `testdata` ? td.find(x => x.v === e.v).h : `seed#${run.corpus.indexOf(e)}`;
            say(`bad`, `--- FAIL: ${t.fn} (0.00s)\n    --- FAIL: ${t.fn}/${nm} (0.00s)\n        ${msg}\nFAIL\nexit status 1\nFAIL\tcommand-line-arguments\t0.253s`);
            lastFail = { impl: st.impl };
            run.done = `fail`; draw(); return;
          }
          (t.ints ? fzFeatI(e.v) : fzFeatB(e.v)).forEach(f => run.seen.add(f));
        }
        say(`info`, `fuzz: elapsed: 0s, gathering baseline coverage: ${N}/${N} completed, now fuzzing with 10 workers`);
        run.h = ctx.every(tick, 100);
        draw();
      };
      const plainTest = () => {
        if (run && run.h) finish(`stopped`);
        const t = T(), seeds = parseSeeds(), td = testdata[t.fn];
        log = []; lastFail = null;
        say(`info`, `$ go test *.go`);
        const all = seeds.map((v, i) => ({ v, nm: `seed#${i}` })).concat(td.map(e => ({ v: e.v, nm: e.h })));
        const fails = all.map(e => ({ e, msg: t.run(e.v) })).filter(x => x.msg);
        if (fails.length) {
          say(`bad`, `--- FAIL: ${t.fn} (0.00s)`);
          fails.forEach(x => say(`bad`, `    --- FAIL: ${t.fn}/${x.e.nm} (0.00s)\n        ${x.msg}`));
          say(`bad`, `FAIL\nexit status 1\nFAIL\tcommand-line-arguments\t0.253s`);
          lastFail = { impl: st.impl };
        } else say(`ok`, `ok  \tcommand-line-arguments\t0.103s${td.length ? `\n(${all.length} corpus entries ran as subtests, including ${td.length} from testdata/fuzz)` : ``}`);
        run = null; lastIn = all.length ? all[all.length - 1].v : null;
        draw();
      };
      onAct(el, a => {
        if (a === `fuzz`) startFuzz();
        else if (a === `stop`) { if (run && run.h) { say(`dup`, `^C\nfuzz: elapsed: ${run.ticks / 10}s, execs: ${run.execs}, new interesting: ${run.ni} (total: ${run.corpus.length})\nPASS`); finish(`stopped`); draw(); } }
        else if (a === `test`) plainTest();
        else if (a === `clean`) { testdata[T().fn] = []; say(`info`, `$ rm -r testdata`); lastFail = null; draw(); }
      });
      q(`seeds`).addEventListener(`input`, () => { if (!run || run.done) draw(); });
      wireSegs(el, st, k => {
        if (k === `impl`) {
          if (run && run.h) finish(`stopped`);
          const wasInts = q(`seeds`).dataset.ints === `1`;
          if (wasInts !== !!T().ints) { q(`seeds`).value = defaultSeeds(); q(`seeds`).dataset.ints = T().ints ? `1` : `0`; }
          run = null; lastIn = null;
          q(`code`).innerHTML = pblock(`ctx`, `${T().label}`, FZ_CODE[st.impl]);
        }
        draw();
      });
      q(`seeds`).value = defaultSeeds(); q(`seeds`).dataset.ints = `0`;
      q(`code`).innerHTML = pblock(`ctx`, T().label, FZ_CODE[st.impl]);
      draw();
    }
  };

  // =====================================================================
  // Ch13 - Prometheus metric types
  // =====================================================================
  const PROM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  D.c13Prom = {
    title: `Prometheus metric types, live: counter, gauge, histogram, summary`,
    blurb: `A browser version of the book's <code>samplePro.go</code>. Every tick (one loop iteration, 2 s in the original) it runs <code>counter.Add(rand*5)</code>, <code>gauge.Add(rand*15 - 5)</code>, <code>histogram.Observe(rand*10)</code> and <code>summary.Observe(rand*10)</code>, and you see what <code>curl localhost:1234/metrics</code> would return. Restart the process to see a counter reset that <code>rate()</code> handles, switch to skewed latencies, and compare the histogram's estimated p90 with the summary's exact one.`,
    mount(el, ctx) {
      const st = { dist: `uniform`, obj: `off`, speed: 1 };
      let rnd = mulberry32(42), running = true, t = 0, h = null;
      let M, hist;
      const reset = () => { M = { counter: 0, gauge: 0, hb: PROM_BUCKETS.map(() => 0), hsum: 0, hcount: 0, ssum: 0, scount: 0, win: [] }; };
      reset(); hist = [];
      el.innerHTML = `
        <div class="ctl-row">${ctl(`observations`, seg(`dist`, [[`uniform`, `rand*10 (book)`], [`skew`, `skewed latency`]], st.dist))}${ctl(`summary objectives`, seg(`obj`, [[`off`, `none (default)`], [`on`, `0.5 / 0.9 / 0.99`]], st.obj))}${ctl(`speed`, seg(`speed`, [[1, `1x`], [4, `4x`]], st.speed))}</div>
        <div class="ctl-row">${btn(`pause`, `pause`, true)}${btn(`restart`, `restart process`, true)}${btn(`burst`, `traffic burst`, true)}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>$ curl localhost:1234/metrics | grep mtsouk</h4><div class="scroll-y" style="max-height:380px" data-k="expo"></div></div>
          <div class="lab-panel"><h4>Counter and rate()</h4><div data-k="c1"></div><h4>Gauge</h4><div data-k="c2"></div><h4>Histogram buckets (cumulative, le)</h4><div data-k="hb"></div><div class="stat-row" data-k="stats" style="margin-top:8px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const obs = () => st.dist === `uniform` ? rnd() * 10 : Math.min(30, Math.exp(-1.6 + 1.1 * Math.sqrt(-2 * Math.log(1 - rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())));
      const observe = v => {
        PROM_BUCKETS.forEach((b, i) => { if (v <= b) M.hb[i]++; });
        M.hsum += v; M.hcount++;
        M.ssum += v; M.scount++; M.win.push(v); if (M.win.length > 60) M.win.shift();
      };
      const step = (n) => {
        for (let k = 0; k < (n || 1); k++) {
          M.counter += rnd() * 5;
          M.gauge += rnd() * 15 - 5;
          observe(obs()); observe(obs());
        }
        t++;
        hist.push({ t, c: M.counter, g: M.gauge }); if (hist.length > 40) hist.shift();
      };
      const hq = qv => {
        if (!M.hcount) return NaN;
        const rank = qv * M.hcount;
        let prevB = 0, prevC = 0;
        for (let i = 0; i < PROM_BUCKETS.length; i++) {
          if (M.hb[i] >= rank) { const inB = M.hb[i] - prevC; return inB ? prevB + (PROM_BUCKETS[i] - prevB) * (rank - prevC) / inB : PROM_BUCKETS[i]; }
          prevB = PROM_BUCKETS[i]; prevC = M.hb[i];
        }
        return PROM_BUCKETS[PROM_BUCKETS.length - 1];
      };
      const sq = qv => { if (!M.win.length) return NaN; const s = M.win.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(qv * s.length))]; };
      const rate = () => {
        if (hist.length < 2) return 0;
        const w = hist.slice(-6); let inc = 0;
        for (let i = 1; i < w.length; i++) inc += w[i].c >= w[i - 1].c ? w[i].c - w[i - 1].c : w[i].c;
        return inc / ((w.length - 1) * 2);
      };
      const gfmt = v => isNaN(v) ? `NaN` : String(v);
      const chart = (key, cls) => {
        const pts = hist.map(p => p[key]);
        const lo = Math.min(0, ...pts), hi = Math.max(1, ...pts);
        const a = axes({ x0: 40, x1: 470, y0: 100, y1: 8, dx0: 0, dx1: 39, dy0: lo, dy1: hi, yTicks: [lo, (lo + hi) / 2, hi], yFmt: v => fmtNum(v, 0), xTicks: [] });
        const off = 40 - hist.length;
        return svgWrap(490, 112, a.svg + (pts.length > 1 ? `<path class="${cls}" d="${path(pts.map((v, i) => [a.X(i + off), a.Y(v)]))}"/>` : ``));
      };
      const draw = () => {
        const lines = [
          `# HELP mtsouk_my_counter This is my counter`, `# TYPE mtsouk_my_counter counter`, `mtsouk_my_counter ${gfmt(M.counter)}`,
          `# HELP mtsouk_my_gauge This is my gauge`, `# TYPE mtsouk_my_gauge gauge`, `mtsouk_my_gauge ${gfmt(M.gauge)}`,
          `# HELP mtsouk_my_histogram This is my histogram`, `# TYPE mtsouk_my_histogram histogram`
        ].concat(PROM_BUCKETS.map((b, i) => `mtsouk_my_histogram_bucket{le="${b}"} ${M.hb[i]}`), [`mtsouk_my_histogram_bucket{le="+Inf"} ${M.hcount}`, `mtsouk_my_histogram_sum ${gfmt(M.hsum)}`, `mtsouk_my_histogram_count ${M.hcount}`,
          `# HELP mtsouk_my_summary This is my summary`, `# TYPE mtsouk_my_summary summary`],
          st.obj === `on` ? [0.5, 0.9, 0.99].map(qv => `mtsouk_my_summary{quantile="${qv}"} ${gfmt(sq(qv))}`) : [],
          [`mtsouk_my_summary_sum ${gfmt(M.ssum)}`, `mtsouk_my_summary_count ${M.scount}`]);
        q(`expo`).innerHTML = pblock(`out`, `text exposition format`, lines.join(`\n`));
        q(`c1`).innerHTML = chart(`c`, `svg-line`);
        q(`c2`).innerHTML = chart(`g`, `svg-line3`);
        q(`hb`).innerHTML = hbars(PROM_BUCKETS.filter(b => b >= 0.1).map(b => { const i = PROM_BUCKETS.indexOf(b); return { label: `le="${b}"`, value: M.hb[i], text: String(M.hb[i]) }; }).concat([{ label: `le="+Inf"`, value: M.hcount, text: String(M.hcount), cls: `alt` }]), Math.max(1, M.hcount));
        const p90h = hq(0.9), p90s = sq(0.9);
        q(`stats`).innerHTML = stat(`rate(counter) /s`, round(rate(), 2)) + stat(`histogram p90 (estimated)`, isNaN(p90h) ? `-` : round(p90h, 2)) + stat(`exact p90 (last 60)`, isNaN(p90s) ? `-` : round(p90s, 2)) + stat(`avg = sum/count`, M.hcount ? round(M.hsum / M.hcount, 2) : `-`);
        let n = `A <strong>counter</strong> only goes up; the <strong>gauge</strong> wanders up and down (it can go negative here because the book adds rand*15 - 5). The histogram exposes cumulative <code>_bucket{le}</code> counts plus <code>_sum</code> and <code>_count</code>; <code>histogram_quantile()</code> interpolates inside a bucket, so the estimated p90 is only as good as the bucket boundaries.`;
        if (st.dist === `uniform`) n += ` With values spread over 0-10 and default buckets that jump from 5 to 10, the p90 estimate can be well off the exact value.`;
        else n += ` With skewed, mostly small latencies, the dense low buckets give a much better estimate. Pick buckets around the values you care about (your SLO).`;
        if (st.obj === `off`) n += ` The summary shows only <code>_sum</code> and <code>_count</code>, exactly like the book's output: client_golang summaries have no quantile objectives unless you configure them.`;
        else n += ` Summary quantiles are computed inside the process (here over the last 60 observations) and can't be aggregated across instances.`;
        q(`note`).innerHTML = note(n, ``);
      };
      const start = () => { if (h) clearInterval(h); h = ctx.every(() => { if (running) { step(1); draw(); } }, 1000 / st.speed); };
      onAct(el, (a, b) => {
        if (a === `pause`) { running = !running; b.textContent = running ? `pause` : `resume`; }
        else if (a === `restart`) { reset(); hist.push({ t: ++t, c: 0, g: 0 }); if (hist.length > 40) hist.shift(); }
        else if (a === `burst`) step(8);
        draw();
      });
      wireSegs(el, st, k => { if (k === `speed`) start(); draw(); });
      for (let i = 0; i < 6; i++) step(1);
      draw(); start();
    }
  };

  // =====================================================================
  // Ch14 - Benchmark b.N ramp
  // =====================================================================
  const PHI = (1 + Math.sqrt(5)) / 2;
  const fib = k => Math.round(Math.pow(PHI, k) / Math.sqrt(5));
  const fibCalls = k => 2 * fib(k + 1) - 1;
  const FIB_NS = 1.6;
  const costNew = n => n < 1 ? 2 : n * 0.55 + 30 + roundupsize(Math.ceil(n) * 8) * 0.03 + 2;
  const costCap = n => n < 1 ? 2 : n * 0.9 + 30 + roundupsize(Math.ceil(n) * 8) * 0.03 + 2;
  const costApp = n => { const s = appendStats(Math.ceil(n)); return n * 0.9 + s.allocs * 30 + s.bytes * 0.03 + s.copied * 0.35 + 2; };
  const memNew = n => n < 1 ? [0, 0] : [roundupsize(Math.ceil(n) * 8), 1];
  const memApp = n => { const s = appendStats(Math.ceil(n)); return [s.bytes, s.allocs]; };
  const BENCH = {
    new1k: { label: `New(1000)`, name: `BenchmarkNew`, ok: true, code: `func BenchmarkNew(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\tt = InitSliceNew(1000) // make([]int, n), fill by index\n\t}\n}`, total: n => n * costNew(1000), mem: () => memNew(1000) },
    cap1k: { label: `Cap(1000)`, name: `BenchmarkCap`, ok: true, code: `func BenchmarkCap(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\tt = InitSliceCap(1000) // make([]int, 0, n) + append\n\t}\n}`, total: n => n * costCap(1000), mem: () => memNew(1000) },
    app1k: { label: `Append(1000)`, name: `BenchmarkAppend`, ok: true, code: `func BenchmarkAppend(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\tt = InitSliceAppend(1000) // make([]int, 0) + append\n\t}\n}`, total: n => n * costApp(1000), mem: () => memApp(1000) },
    bookNew: { label: `New(i) (book)`, name: `BenchmarkNew`, ok: `drift`, code: `func BenchmarkNew(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\tt = InitSliceNew(i) // size grows with i!\n\t}\n}`, total: n => n * costNew((n - 1) / 2), mem: n => memNew((n - 1) / 2) },
    fiboIV: { label: `fibo1(10)`, name: `BenchmarkFiboIV`, ok: true, code: `func BenchmarkFiboIV(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\t_ = fibo1(10)\n\t}\n}`, total: n => n * fibCalls(10) * FIB_NS, mem: () => [0, 0] },
    fiboI: { label: `fibo1(i)`, name: `BenchmarkFiboI`, ok: false, code: `func BenchmarkFiboI(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\t_ = fibo1(i) // work grows with i\n\t}\n}`, total: n => FIB_NS * (2 * (fib(n + 2) - 1) - n), mem: () => [0, 0] },
    fiboII: { label: `fibo1(b.N) in loop`, name: `BenchmarkFiboII`, ok: false, code: `func BenchmarkFiboII(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\t_ = fibo1(b.N)\n\t}\n}`, total: n => n * fibCalls(n) * FIB_NS, mem: () => [0, 0] },
    fiboIII: { label: `fibo1(b.N), no loop`, name: `BenchmarkFiboIII`, ok: false, code: `func BenchmarkFiboIII(b *testing.B) {\n\t_ = fibo1(b.N)\n}`, total: n => fibCalls(n) * FIB_NS, mem: () => [0, 0] }
  };
  const fmtNs = ns => !isFinite(ns) ? `forever` : ns >= 3.15e16 ? fmtNum(ns / 3.15e16, 1) + ` years` : ns >= 3.6e12 ? round(ns / 3.6e12, 1) + ` h` : ns >= 1e9 ? round(ns / 1e9, 2) + ` s` : ns >= 1e6 ? round(ns / 1e6, 2) + ` ms` : ns >= 1e3 ? round(ns / 1e3, 2) + ` µs` : round(ns, 1) + ` ns`;
  const goNsOp = x => x >= 99.995 ? x.toFixed(0) : x >= 9.9995 ? x.toFixed(1) : x >= 0.99995 ? x.toFixed(2) : x.toFixed(3);
  D.c14BenchN = {
    title: `How go test grows b.N, and how a benchmark goes wrong`,
    blurb: `The framework runs your benchmark with <code>b.N = 1</code>, measures, predicts how many iterations fill <code>-benchtime</code> (1 s), and runs again until a run lasts long enough. Watch the ramp for a correct benchmark, for the book's slice initializers (with <code>-benchmem</code>: one allocation vs twelve), and for the wrongly defined Fibonacci benchmarks whose work grows with <code>i</code> or <code>b.N</code>. Times come from a simple cost model; allocation counts follow Go's real growth rule and size classes.`,
    mount(el, ctx) {
      const st = { b: `new1k`, bt: `1s`, growth: `modern`, mem: `on` };
      let anim = null, shown = 0, plan = null;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`benchmark`, seg(`b`, Object.keys(BENCH).map(k => [k, BENCH[k].label]), st.b))}</div>
        <div class="ctl-row">${ctl(`-benchtime`, seg(`bt`, [[`1s`, `1s`], [`3s`, `3s`], [`100x`, `100x`]], st.bt))}${ctl(`b.N growth`, seg(`growth`, [[`modern`, `predicted (current Go)`], [`book`, `1, 2, 5, 10, 20, 50... (book)`]], st.growth))}${ctl(`-benchmem`, seg(`mem`, [[`on`, `on`], [`off`, `off`]], st.mem))}${btn(`run`, `go test -bench`)}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>The ramp: each launch of the benchmark function</h4><div data-k="ramp"></div><div data-k="out" style="margin-top:8px"></div></div>
          <div class="lab-panel"><h4>Code</h4><div data-k="code"></div><h4>Compare (final ns/op)</h4><div data-k="cmp"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const mkPlan = () => {
        const B = BENCH[st.b];
        const goal = st.bt === `3s` ? 3e9 : 1e9;
        const runs = [];
        const runN = n => { const t = B.total(n); runs.push({ n, t }); return t; };
        let t = runN(1);
        if (st.bt === `100x`) { t = runN(100); }
        else if (st.growth === `book`) {
          const mult = [2, 5, 10];
          let base = 1, k = 0;
          while (t < goal && isFinite(t) && runs.length < 40) {
            const n = Math.min(1e9, mult[k % 3] * base);
            if (k % 3 === 2) base *= 10;
            k++;
            t = runN(n);
            if (n >= 1e9) break;
          }
        } else {
          let n = 1;
          while (t < goal && isFinite(t) && n < 1e9) {
            const last = n; const prev = Math.max(t, 1);
            n = Math.floor(goal * last / prev); n += Math.floor(n / 5); n = Math.min(n, 100 * last); n = Math.max(n, last + 1); n = Math.min(n, 1e9);
            t = runN(n);
          }
        }
        return runs;
      };
      const drawStatic = () => {
        const B = BENCH[st.b];
        q(`code`).innerHTML = pblock(B.ok === true ? `out` : B.ok === `drift` ? `user` : `bad`, B.ok === true ? `well defined` : B.ok === `drift` ? `per-op work depends on b.N` : `wrongly defined`, B.code);
        const ok = [`new1k`, `cap1k`, `app1k`, `fiboIV`];
        const vals = ok.map(k => ({ k, v: BENCH[k].total(1e5) / 1e5 }));
        q(`cmp`).innerHTML = hbars(vals.map(x => ({ label: BENCH[x.k].label, value: x.v, text: goNsOp(x.v) + ` ns/op`, cls: x.k === st.b ? `warn` : `` }))) + `<div class="cs-note">Allocations per op: New ${memNew(1000)[1]}, Cap ${memNew(1000)[1]}, Append ${memApp(1000)[1]} (${fmtBytes(memApp(1000)[0])}), caps ${appendStats(1000).steps.join(` &rarr; `)}</div>`;
      };
      const drawRamp = () => {
        const B = BENCH[st.b];
        const rows = plan.slice(0, shown);
        const goal = st.bt === `3s` ? 3e9 : 1e9;
        q(`ramp`).innerHTML = `<table class="mini-table"><tr><th>launch</th><th class="num">b.N</th><th class="num">run time</th><th class="num">ns/op</th><th></th></tr>${rows.map((r, i) => { const huge = !isFinite(r.t) || r.t > 6e11; return `<tr class="${huge ? `undo` : i === plan.length - 1 && shown === plan.length ? `new` : ``}"><td>${i + 1}</td><td class="num">${fmtNum(r.n, 0)}</td><td class="num">${fmtNs(r.t)}</td><td class="num">${huge ? `-` : goNsOp(r.t / r.n)}</td><td>${huge ? chip(`no`, `never returns`) : r.t >= goal || (st.bt === `100x` && r.n === 100) ? chip(`ok`, `long enough`) : chip(`muted`, `too short`)}</td></tr>`; }).join(``)}</table>`;
        if (shown < plan.length) { q(`out`).innerHTML = ``; return; }
        const last = plan[plan.length - 1];
        const huge = !isFinite(last.t) || last.t > 6e11;
        if (huge) {
          q(`out`).innerHTML = pblock(`bad`, `go test -bench=. *.go`, `goos: darwin\ngoarch: arm64\n${B.name}-10   \t... (still running: this launch needs ${fmtNs(last.t)})\npanic: test timed out after 10m0s\nFAIL\tcommand-line-arguments\t600.112s`);
        } else {
          const nsop = last.t / last.n, [by, al] = B.mem(last.n);
          const total = sum(plan.map(r => r.t));
          q(`out`).innerHTML = pblock(B.ok === true ? `out` : `user`, `go test -bench=. ${st.mem === `on` ? `-benchmem ` : ``}*.go`, `goos: darwin\ngoarch: arm64\n${B.name}-10   \t${String(last.n).padStart(9)}\t${goNsOp(nsop).padStart(10)} ns/op` + (st.mem === `on` ? `\t${String(by).padStart(7)} B/op\t${String(al).padStart(6)} allocs/op` : ``) + `\nPASS\nok  \tcommand-line-arguments\t${round(total / 1e9 + 0.3, 3)}s`);
        }
        let n;
        if (huge) n = st.b === `fiboIII` ? `The book lists <code>BenchmarkFiboIII</code> (no loop, <code>fibo1(b.N)</code>) as correct, but its cost is exponential in b.N: after b.N = 1 the framework jumps to b.N = 100 and <code>fibo1(100)</code> never returns. Only <code>BenchmarkFiboIV</code> is sound.` : `The work per call grows with ${st.b === `fiboI` ? `<code>i</code>` : `<code>b.N</code>`}, so every bigger b.N makes each op slower and the framework can never reach a stable ns/op. Recursive Fibonacci of 100 would take ${fmtNs(fibCalls(100) * FIB_NS)}; <code>go test</code>'s default <code>-timeout 10m</code> kills the binary.`;
        else if (st.b === `bookNew`) n = `It finishes, but each op builds a slice of size <code>i</code>, so the reported ns/op is really "average cost of sizes 0..b.N". Change benchtime and the result changes too: the measurement depends on b.N, the same flaw as the Fibonacci examples in a milder form. Use a fixed size or sub-benchmarks per size.`;
        else if (st.b === `app1k`) n = `Appending 1000 ints to an empty slice reallocates ${appendStats(1000).allocs} times (capacity ${appendStats(1000).steps.join(`, `)}: doubling up to 256, then about 1.25x plus a constant, rounded up to allocator size classes), copying the old elements each time: ${fmtBytes(memApp(1000)[0])}/op. Pre-allocating with <code>make([]int, 0, n)</code> or <code>make([]int, n)</code> does a single 8 KB allocation.`;
        else n = `A well-defined benchmark does the same work in every iteration, so ns/op converges and b.N simply scales until one launch lasts ${st.bt === `100x` ? `exactly 100 iterations (-benchtime=100x fixes b.N)` : `at least ` + st.bt}. ${st.growth === `book` ? `The 1-2-5 sequence is how the book describes it; ` : `Current Go predicts the next b.N from the last ns/op (+20%, at most 100x growth); `}store results in a package-level variable so the compiler can't delete the call.`;
        q(`note`).innerHTML = note(n, huge ? `bad` : BENCH[st.b].ok === true ? `good` : `warn`);
      };
      const go = () => {
        if (anim) { clearInterval(anim); anim = null; }
        plan = mkPlan(); shown = 0;
        drawStatic(); drawRamp();
        anim = ctx.every(() => { if (shown < plan.length) { shown++; drawRamp(); } else if (anim) { clearInterval(anim); anim = null; } }, 380);
      };
      onAct(el, a => { if (a === `run`) go(); });
      wireSegs(el, st, go);
      go();
    }
  };

  // =====================================================================
  // Ch14 - Escape analysis quiz
  // =====================================================================
  const ESC_Q = [
    { code: `func answer() int {\n\tx := 42\n\treturn x\n}`, ask: `Where does x live?`, opts: [`stack`, `heap`], a: 0, msg: `./esc.go:3:6: can inline answer\n(no escape message for x)`, why: `x is returned <em>by value</em>: the caller gets a copy, so x never outlives the frame.` },
    { code: `func newInt() *int {\n\tx := 42\n\treturn &x\n}`, ask: `Where does x live?`, opts: [`stack`, `heap`], a: 1, msg: `./esc.go:4:2: moved to heap: x`, why: `Its address is returned, so x must survive after newInt returns. This is why returning a pointer to a local is safe in Go: the compiler moves it to the heap.` },
    { code: `type Item struct {\n\tDescription string\n\tValue       float64\n}\n\nfunc doubled() float64 {\n\tp := &Item{Value: 100}\n\treturn p.Value * 2\n}`, ask: `Where is the Item allocated?`, opts: [`stack`, `heap`], a: 0, msg: `./esc.go:10:7: &Item{...} does not escape`, why: `Taking an address does not force a heap allocation. The pointer never leaves the function, so the Item stays on the stack.` },
    { code: `func main() {\n\tt := Item{Description: "Keyboard", Value: 100}\n\tt.Value = Value(t.Value)\n\tfmt.Println(t)\n}`, ask: `What does -m report for t (from the book's allocate.go)?`, opts: [`does not escape`, `escapes to heap`], a: 1, msg: `./allocate.go:20:13: inlining call to fmt.Println\n./allocate.go:20:13: ... argument does not escape\n./allocate.go:20:14: t escapes to heap`, why: `Passing t to <code>fmt.Println(a ...any)</code> converts it to an interface, and fmt can't be proven not to retain it, so a copy of t is boxed on the heap. Logging and printing in hot loops allocates for this reason.` },
    { code: `func total() int {\n\ts := make([]int, 1000)\n\tsum := 0\n\tfor i := range s {\n\t\tsum += i\n\t}\n\treturn sum\n}`, ask: `Where is the 1000-int backing array?`, opts: [`stack`, `heap`], a: 0, msg: `./esc.go:2:11: make([]int, 1000) does not escape`, why: `Constant size (8 KB, under the 64 KB limit for implicit stack allocations) and the slice never leaves the function.` },
    { code: `func total(n int) int {\n\ts := make([]int, n)\n\tsum := 0\n\tfor i := range s {\n\t\tsum += i\n\t}\n\treturn sum\n}`, ask: `Where is the backing array now?`, opts: [`stack`, `heap`], a: 1, msg: `./esc.go:2:11: make([]int, n) escapes to heap`, why: `The size isn't known at compile time, so the compiler can't reserve stack space for it. (Go 1.25 can put very small variable-sized backing arrays on the stack; the message here is from Go 1.21/1.22.)` },
    { code: `for i := 0; i < 10; i++ {\n\ts := make([]byte, 50000000)\n\tif s == nil {\n\t\tfmt.Println("Operation failed!")\n\t}\n}`, ask: `Where are these 50 MB slices allocated?`, opts: [`stack`, `heap`], a: 1, msg: `./gColl.go:12:13: make([]byte, 50000000) escapes to heap`, why: `Constant size, never escapes, but far larger than the 64 KB limit for implicit stack variables. This is how the book's examples trigger the GC.` },
    { code: `func counter() func() int {\n\tc := 0\n\treturn func() int {\n\t\tc++\n\t\treturn c\n\t}\n}`, ask: `Where does c live?`, opts: [`stack`, `heap`], a: 1, msg: `./esc.go:2:2: moved to heap: c\n./esc.go:3:9: func literal escapes to heap`, why: `The returned closure captures c by reference and outlives counter(), so both c and the closure object go to the heap.` },
    { code: `var global *int\n\nfunc keep() {\n\tx := 1\n\tglobal = &x\n}`, ask: `Where does x live?`, opts: [`stack`, `heap`], a: 1, msg: `./esc.go:4:2: moved to heap: x`, why: `Storing an address in a package-level variable makes it reachable forever.` },
    { code: `func sum(nums []int) int {\n\ts := 0\n\tfor _, v := range nums {\n\t\ts += v\n\t}\n\treturn s\n}`, ask: `What does -m say about the parameter nums?`, opts: [`nums does not escape`, `leaking param: nums`], a: 0, msg: `./esc.go:1:10: nums does not escape`, why: `It's only read. Callers can pass stack-allocated slices to it without forcing a heap allocation.` },
    { code: `func getValue(s []int) []int {\n\tval := s[:3]\n\treturn val\n}`, ask: `The book's slicesLeaks.go. What does -m -l report?`, opts: [`s does not escape`, `leaking param: s to result`], a: 1, msg: `./slicesLeaks.go:12:15: leaking param: s to result ~r0 level=0`, why: `The result aliases the parameter's backing array, so whatever s points to lives as long as the result. That's the 8 MB array kept alive by a 3-element slice. The copy version reports "s does not escape".` },
    { code: `func local() int {\n\tp := new(int)\n\t*p = 7\n\treturn *p\n}`, ask: `Does new(int) allocate on the heap?`, opts: [`no, stack`, `yes, heap`], a: 0, msg: `./esc.go:2:10: new(int) does not escape`, why: `Unlike C++'s <code>new</code>, Go's <code>new()</code> and <code>make()</code> don't decide placement; escape analysis does.` },
    { code: `func produce(ch chan *int) {\n\tv := 10\n\tch <- &v\n}`, ask: `Where does v live?`, opts: [`stack`, `heap`], a: 1, msg: `./esc.go:2:2: moved to heap: v`, why: `A pointer sent on a channel can be received by any goroutine at any later time.` },
    { code: `func main() {\n\tmyMap := make(map[int]*int)\n\tfor i := 0; i < N; i++ {\n\t\tvalue := int(i)\n\t\tmyMap[value] = &value\n\t}\n}`, ask: `The appendix's mapStar.go. Where does each value live?`, opts: [`stack`, `heap`], a: 1, msg: `./mapStar.go:13:3: moved to heap: value`, why: `Each &value is stored in the map, so 80 million ints become separate heap objects, and the GC must trace every one of those pointers. That's why this version was the slowest.` }
  ];
  D.c14Escape = {
    title: `Escape analysis quiz: stack or heap?`,
    blurb: `For each snippet, predict what <code>go build -gcflags '-m'</code> decides, then check the compiler's message. Several come straight from the book (allocate.go, slicesLeaks.go, gColl.go, mapStar.go). Heap allocation is not wrong, but every escaped value costs allocator time and GC work.`,
    mount(el) {
      const st = { view: `quiz` };
      let i = 0;
      const ans = ESC_Q.map(() => null);
      el.innerHTML = `
        <div class="ctl-row">${ctl(`view`, seg(`view`, [[`quiz`, `quiz`], [`all`, `all answers`]], st.view))}${btn(`prev`, `&larr; prev`, true)}${btn(`next`, `next &rarr;`, true)}${btn(`restart`, `restart`, true)}<span class="stat-row" data-k="score"></span></div>
        <div data-k="body"></div>`;
      const q = qsel(el);
      const draw = () => {
        const right = ans.filter((a, k) => a !== null && a === ESC_Q[k].a).length, done = ans.filter(a => a !== null).length;
        q(`score`).innerHTML = stat(`question`, `${i + 1} / ${ESC_Q.length}`) + stat(`answered`, done) + stat(`correct`, right, done && right === done ? `good` : ``);
        if (st.view === `all`) {
          q(`body`).innerHTML = `<table class="mini-table"><tr><th>#</th><th>question</th><th>answer</th><th>-gcflags -m</th></tr>${ESC_Q.map((x, k) => `<tr><td>${k + 1}</td><td style="white-space:normal">${x.ask}<br><code style="font-size:11px">${esc(x.code.split(`\n`).slice(0, 3).join(` `))}...</code></td><td>${chip(x.opts[x.a].includes(`heap`) || x.opts[x.a].includes(`leak`) || x.opts[x.a].includes(`escapes`) ? `late` : `ok`, esc(x.opts[x.a]))}</td><td style="white-space:normal;font-size:11px"><code>${esc(x.msg.split(`\n`).pop())}</code></td></tr>`).join(``)}</table>`;
          return;
        }
        const x = ESC_Q[i], a = ans[i];
        q(`body`).innerHTML = `<div class="lab-grid even">
          <div class="lab-panel"><h4>Snippet ${i + 1}</h4>${codeView(x.code.split(`\n`))}<h4 style="margin-top:10px">${x.ask}</h4><div class="ctl-row">${x.opts.map((o, k) => `<button class="lab-btn${a === k ? `` : ` ghost`}" data-act="ans" data-o="${k}">${esc(o)}</button>`).join(``)}</div></div>
          <div class="lab-panel"><h4>$ go build -gcflags '-m'</h4>${a === null ? `<div class="cs-note">Answer to reveal the compiler output.</div>` : pblock(a === x.a ? `out` : `bad`, a === x.a ? `correct` : `not quite`, x.msg) + `<div style="margin-top:6px">${chip(a === x.a ? `ok` : `no`, a === x.a ? `&#10003; correct` : `&#10007; answer: ` + esc(x.opts[x.a]))}</div>` + note(x.why, a === x.a ? `good` : `warn`)}</div>
        </div>`;
      };
      onAct(el, (act, b) => {
        if (act === `ans`) { if (ans[i] === null) ans[i] = +b.dataset.o; }
        else if (act === `next`) i = (i + 1) % ESC_Q.length;
        else if (act === `prev`) i = (i - 1 + ESC_Q.length) % ESC_Q.length;
        else if (act === `restart`) { ans.fill(null); i = 0; }
        draw();
      });
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch14 - Memory leaks: subslices and maps
  // =====================================================================
  D.c14Leaks = {
    title: `Memory leaks in a GC language: subslices and maps that never shrink`,
    blurb: `Two leaks from the chapter. <strong>Subslices</strong>: <code>getValue</code> returns <code>s[:3]</code> of a 1,000,000-int slice, and the 3-element result keeps the whole 8 MB backing array alive; copying fixes it. <strong>Maps</strong>: deleting every key of a <code>map[int][128]byte</code> leaves all its buckets allocated, and only <code>m = nil</code> (or rebuilding the map) gives the memory back. Sizes are computed from the runtime's layout, and the book's measurements are shown for comparison.`,
    mount(el) {
      const st = { mode: `slice`, impl: `sub`, keep: `keep`, iters: 15, n: 2000000, val: `arr` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`leak`, seg(`mode`, [[`slice`, `subslice`], [`map`, `map buckets`]], st.mode))}</div>
        <div class="ctl-row" data-k="c-slice">${ctl(`getValue`, seg(`impl`, [[`sub`, `return s[:3]`], [`copy`, `make + copy`]], st.impl))}${ctl(`caller`, seg(`keep`, [[`keep`, `keeps every result`], [`drop`, `book's loop (drops it)`]], st.keep))}${ctl(`iterations`, rng(`iters`, 1, 60, 1, st.iters))}</div>
        <div class="ctl-row" data-k="c-map">${ctl(`entries n`, rng(`n`, 100000, 4000000, 100000, st.n))}${ctl(`value type`, seg(`val`, [[`arr`, `[128]byte (book)`], [`ptr`, `*[128]byte`]], st.val))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4 data-k="h1"></h4><div data-k="viz"></div></div>
          <div class="lab-panel"><h4 data-k="h2"></h4><div data-k="side"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const drawSlice = () => {
        const N = st.iters, sub = st.impl === `sub`, keep = st.keep === `keep`;
        const ARR = 8000000, SMALL = 24;
        const liveArrays = sub ? (keep ? N : 1) : 0;
        const live = liveArrays * ARR + (keep ? N : 1) * (sub ? 0 : SMALL);
        q(`h1`).textContent = `Heap after ${N} iteration${N > 1 ? `s` : ``} and a GC`;
        let cells = ``;
        for (let k = 0; k < N; k++) {
          const alive = sub && (keep || k === N - 1);
          cells += `<div title="createSlice() #${k + 1}: 8 MB backing array" style="display:inline-block;width:46px;margin:2px;vertical-align:top;text-align:center;font-size:10px">
            <div style="height:30px;border-radius:4px;${alive ? `background:rgba(239,68,68,0.55)` : `background:var(--bg-3);opacity:.5;border:1px dashed var(--text-muted)`}"></div>
            <div style="height:8px;margin-top:2px;border-radius:2px;width:${sub ? 100 : 30}%;${(keep || k === N - 1) ? (sub ? `background:rgba(239,68,68,0.9)` : `background:var(--good)`) : `background:var(--bg-3)`}"></div>${k + 1}</div>`;
        }
        q(`viz`).innerHTML = `<div>${cells}</div><div class="legend"><span>${chip(`no`, `8 MB array kept alive`)}</span><span>${chip(`muted`, `freed by GC`)}</span><span>${chip(`ok`, `3-int copy (24 B)`)}</span></div>` +
          hbars([{ label: `live heap`, value: live, text: fmtBytes(live), cls: live > 1e8 ? `bad` : live > 1e6 ? `warn` : `good` }, { label: `useful data`, value: (keep ? N : 1) * SMALL, text: fmtBytes((keep ? N : 1) * SMALL), cls: `good` }], Math.max(live, 1));
        q(`h2`).textContent = `go run -gcflags '-m -l'`;
        q(`side`).innerHTML = pblock(`ctx`, `getValue`, sub ? `func getValue(s []int) []int {\n\tval := s[:3]\n\treturn val\n}` : `func getValue(s []int) []int {\n\treturnVal := make([]int, 3)\n\tcopy(returnVal, s)\n\treturn returnVal\n}`) +
          pblock(sub ? `bad` : `out`, `escape analysis`, sub ? `./slicesLeaks.go:9:13: make([]int, 1000000) escapes to heap\n./slicesLeaks.go:12:15: leaking param: s to result ~r0 level=0` : `./slicesNoLeaks.go:9:13: make([]int, 1000000) escapes to heap\n./slicesNoLeaks.go:12:15: s does not escape\n./slicesNoLeaks.go:13:19: make([]int, 3) escapes to heap`) +
          `<div class="stat-row">${stat(`retained arrays`, liveArrays, liveArrays > 1 ? `bad` : ``)}${stat(`wasted`, fmtBytes(Math.max(0, live - (keep ? N : 1) * SMALL)), sub ? `bad` : `good`)}</div>`;
        let n = sub ? `A slice is a pointer, a length and a capacity. <code>s[:3]</code> shares the original array, and the GC can only free a whole array, so every kept result pins 8 MB to hold 24 useful bytes.` : `<code>make</code> + <code>copy</code> (or <code>slices.Clone(s[:3])</code>) creates an independent 3-element array, so the 8 MB arrays become garbage right away.`;
        if (!keep) n += ` In the book's loop each result is dropped on the next iteration, so at most one array is pinned; the leak bites when results are stored, as in caches or token lists.`;
        q(`note`).innerHTML = note(n, sub && keep ? `bad` : sub ? `warn` : `good`);
      };
      const drawMap = () => {
        const n = st.n, ptr = st.val === `ptr`;
        let B = 0; while (n > 6.5 * Math.pow(2, B)) B++;
        const nb = Math.pow(2, B);
        const bucket = 8 + 8 * 8 + 8 * (ptr ? 8 : 128) + 8;
        const buckets = nb * bucket;
        const vals = ptr ? n * 128 : 0;
        const stages = [
          [`make(map[int]...)`, 111 * 1024],
          [`after inserting ${fmtNum(n)}`, buckets + vals + Math.round(buckets / 2) + 111 * 1024],
          [`delete all + runtime.GC()`, buckets + 111 * 1024],
          [`m = nil + runtime.GC()`, 119 * 1024]
        ];
        const book = n === 2000000 && !ptr ? [`111 KB`, `927,931 KB`, `600,767 KB`, `119 KB`] : null;
        q(`h1`).textContent = `runtime.MemStats.Alloc at each step of mapsLeaks.go`;
        q(`viz`).innerHTML = hbars(stages.map(([l, v], k) => ({ label: l, value: v, text: fmtBytes(v) + (book ? ` (book: ${book[k]})` : ``), cls: k === 2 ? `bad` : k === 3 ? `good` : `` }))) +
          `<div class="stat-row" style="margin-top:10px">${stat(`buckets (2^B)`, fmtNum(nb, 0) + ` (B=${B})`)}${stat(`bytes per bucket`, bucket)}${stat(`load factor`, round(n / nb, 2))}${stat(`kept after delete`, fmtBytes(buckets), `bad`)}</div>`;
        q(`h2`).textContent = `mapsLeaks.go`;
        q(`side`).innerHTML = pblock(`ctx`, `the program`, `n := ${n}\nm := make(map[int]${ptr ? `*` : ``}[128]byte)\nprintAlloc()\nfor i := 0; i < n; i++ {\n\tm[i] = ${ptr ? `new([128]byte)` : `[128]byte{}`}\n}\nprintAlloc()\nfor i := 0; i < n; i++ {\n\tdelete(m, i)\n}\nruntime.GC()\nprintAlloc()\nruntime.KeepAlive(m)\n\nm = nil\nruntime.GC()\nprintAlloc()`);
        let note_ = `A map grows by doubling its bucket array (8 slots per bucket, average load 6.5) but <strong>never shrinks</strong>: <code>delete</code> only clears slots. ${fmtNum(n)} entries need 2^${B} = ${fmtNum(nb, 0)} buckets of ${bucket} bytes each, ${fmtBytes(buckets)} that stay allocated after every key is gone. The "after inserting" bar also counts the old bucket array still awaiting collection after the last growth.`;
        note_ += ptr ? ` With <code>*[128]byte</code> values each bucket holds 8-byte pointers, so the leftover buckets are about 8x smaller, and the 128-byte values themselves are freed on delete.` : ` Values up to 128 bytes are stored inline in the buckets, which is what makes this map so heavy. Store pointers, or rebuild the map (copy live entries into a new one), or set it to nil.`;
        note_ += ` <em>Layout of the classic bucket map (Go 1.23 and earlier); Go 1.24's Swiss-table maps also don't shrink.</em>`;
        q(`note`).innerHTML = note(note_, `warn`);
      };
      const draw = () => {
        q(`c-slice`).style.display = st.mode === `slice` ? `` : `none`;
        q(`c-map`).style.display = st.mode === `map` ? `` : `none`;
        if (st.mode === `slice`) drawSlice(); else drawMap();
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { iters: v => v, n: v => fmtNum(v) }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch15 - Go 1.22 loop variables
  // =====================================================================
  D.c15LoopVar = {
    title: `Go 1.21 vs 1.22: what does the loop variable capture?`,
    blurb: `Before Go 1.22 a <code>for</code> loop declared its variable once and overwrote it every iteration, so goroutines, closures and pointers all shared it. Since Go 1.22 (selected by the <code>go</code> line in <code>go.mod</code>) every iteration gets a fresh variable. Run the book's <code>changesForLoops.go</code> under both semantics, slow the loop down to see the data race, and try <code>range</code> over an integer.`,
    mount(el) {
      const st = { ver: `1.22`, kind: `go`, form: `range`, slow: 0 };
      let seed = 1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`go.mod`, seg(`ver`, [[`1.21`, `go 1.21`], [`1.22`, `go 1.22`]], st.ver))}${ctl(`snippet`, seg(`kind`, [[`go`, `goroutines (book)`], [`closure`, `closures called later`], [`ptr`, `append(&amp;v)`], [`rint`, `for x := range 5`]], st.kind))}</div>
        <div class="ctl-row">${ctl(`loop form`, seg(`form`, [[`range`, `range values`], [`three`, `i := 0; i &lt; n; i++`]], st.form))}${ctl(`work per iteration`, rng(`slow`, 0, 10, 1, st.slow))}${btn(`again`, `run again`, true)}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Code</h4><div data-k="code"></div><h4>Variables in memory</h4><div data-k="mem"></div></div>
          <div class="lab-panel"><h4>$ go run changesForLoops.go</h4><div data-k="out"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const vals = [1, 2, 3, 4, 5];
      const draw = () => {
        const old = String(st.ver) === `1.21`, three = st.form === `three`, r = mulberry32(seed * 7919 + st.slow);
        const shown = three ? [0, 1, 2, 3, 4] : vals;
        const vname = three ? `i` : `val`;
        const head = three ? `for i := 0; i < 5; i++ {` : `values := []int{1, 2, 3, 4, 5}\nfor _, val := range values {`;
        let code, out, cls = `out`, mem = ``, n;
        const box = (lbl, v, hot, addr) => `<span class="tok ${hot ? `c2 hot` : `c0`}" title="${addr}">${lbl}=${v}<small style="opacity:.6"> @${addr}</small></span>`;
        if (st.kind === `rint`) {
          code = `for x := range 5 {\n\tfmt.Print(" ", x)\n}\nfmt.Println()`;
          out = old ? `./changesForLoops.go:8:17: cannot range over 5 (untyped int constant)` : `  0 1 2 3 4`;
          cls = old ? `bad` : `out`;
          mem = old ? `<span class="cs-note">does not compile</span>` : `<div class="toks">${[0, 1, 2, 3, 4].map(x => box(`x`, x, false, `0xc0000120${(8 * x).toString(16).padStart(2, `0`)}`)).join(``)}</div>`;
          n = old ? `Ranging over an integer is a Go 1.22 language feature; with <code>go 1.21</code> in go.mod it's a compile error.` : `<code>for x := range n</code> runs x = 0..n-1, a shorter form of the classic three-clause loop. Go 1.23 extended range to iterator functions.`;
        } else if (st.kind === `go`) {
          code = `${head}\n\tgo func() {\n\t\tfmt.Printf("%d ", ${vname})\n\t}()\n}\ntime.Sleep(time.Second)`;
          const order = shown.map((v, k) => ({ k, start: k * st.slow + 2 + r() * 14 })).sort((a, b) => a.start - b.start);
          const loopEnd = shown.length * st.slow;
          const printed = order.map(o => {
            if (!old) return shown[o.k];
            const t = o.start;
            if (st.slow === 0 || t >= loopEnd) return three ? shown.length : shown[shown.length - 1];
            const m = Math.floor(t / st.slow);
            return three ? m : shown[m];
          });
          out = printed.join(` `);
          if (old) out += `\n\n$ go vet\n./changesForLoops.go:15:20: loop variable ${vname} captured by func literal\n\n$ go run -race changesForLoops.go\n==================\nWARNING: DATA RACE\nRead at 0x00c000012088 by goroutine 8:\n  main.main.func1()\n...\nPrevious write at 0x00c000012088 by main goroutine:\n  main.main()\n==================`;
          cls = old ? `bad` : `out`;
          mem = old ? `<div class="toks">${box(vname, three ? shown.length : shown[shown.length - 1], true, `0xc000012088`)}</div><div class="cs-note">one variable, overwritten each iteration and read by 5 goroutines</div>` : `<div class="toks">${shown.map((v, k) => box(vname, v, false, `0xc0000120${(0x80 + 8 * k).toString(16)}`)).join(``)}</div><div class="cs-note">a fresh variable per iteration</div>`;
          n = old ? `All goroutines read the <em>same</em> variable. ${st.slow === 0 ? `The loop finishes before any goroutine is scheduled, so they mostly print the final value.` : `With slower iterations some goroutines start mid-loop and catch intermediate values: the output depends on timing, which is a data race.`} The pre-1.22 fix was <code>${vname} := ${vname}</code> inside the loop, or passing it as an argument.` : `Each goroutine captures its own copy, so all five values are printed, in whatever order the scheduler runs them (the book got <code>5 3 4 1 2</code>). Order is still not guaranteed: use a WaitGroup and collect results if order matters.`;
        } else if (st.kind === `closure`) {
          code = `var fns []func()\n${head}\n\tfns = append(fns, func() { fmt.Print(${vname}, " ") })\n}\nfor _, f := range fns {\n\tf()\n}`;
          out = old ? shown.map(() => three ? shown.length : shown[shown.length - 1]).join(` `) : shown.join(` `);
          cls = old ? `bad` : `out`;
          mem = old ? `<div class="toks">${box(vname, three ? shown.length : shown[shown.length - 1], true, `0xc000012088`)}</div>` : `<div class="toks">${shown.map((v, k) => box(vname, v, false, `0xc0000120${(0x80 + 8 * k).toString(16)}`)).join(``)}</div>`;
          n = old ? `The closures run after the loop, when the shared variable holds its final value: ${three ? `<code>i</code> was incremented to 5 before the condition failed` : `the last element, 5`}. No concurrency is involved, so this bug was deterministic and very common.` : `Each closure captured a different variable, so it prints the value of its own iteration.`;
        } else {
          code = `var ptrs []*int\n${head}\n\tptrs = append(ptrs, &${vname})\n}\nfor _, p := range ptrs {\n\tfmt.Print(*p, " ")\n}`;
          out = old ? shown.map(() => three ? shown.length : shown[shown.length - 1]).join(` `) + `\n(all 5 pointers are 0xc000012088)` : shown.join(` `) + `\n(5 different addresses)`;
          cls = old ? `bad` : `out`;
          mem = old ? `<div class="toks">${box(vname, three ? shown.length : shown[shown.length - 1], true, `0xc000012088`)}</div><div class="cs-note">ptrs[0..4] all point here</div>` : `<div class="toks">${shown.map((v, k) => box(vname, v, false, `0xc0000120${(0x80 + 8 * k).toString(16)}`)).join(``)}</div><div class="cs-note">ptrs[k] points to iteration k's variable (each escapes to the heap)</div>`;
          n = old ? `Taking <code>&amp;${vname}</code> gave the address of the single loop variable, so every pointer saw the last value: a classic source of bugs when building slices of pointers or ORM models.` : `Each iteration's variable has its own address. The cost: a variable whose address escapes is now allocated once per iteration instead of once per loop.`;
        }
        q(`code`).innerHTML = pblock(`ctx`, `main.go (module: go ${st.ver})`, code);
        q(`out`).innerHTML = pblock(cls, `output`, out);
        q(`mem`).innerHTML = mem;
        q(`note`).innerHTML = note(n, cls === `bad` ? `bad` : `good`);
      };
      onAct(el, a => { if (a === `again`) { seed++; draw(); } });
      wireSegs(el, st, draw);
      wireRanges(el, st, { slow: v => v === 0 ? `none` : v + ` units` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch15 - clear() and slices changes
  // =====================================================================
  D.c15Slices = {
    title: `clear(), slices.Delete and the zeroed tail`,
    blurb: `A slice is a window (length) onto a backing array (capacity). See exactly which array cells <code>clear(s)</code>, <code>s = s[:0]</code>, <code>slices.Delete</code> and <code>slices.Compact</code> touch, and how Go 1.22 started zeroing the cells that shrinking functions leave behind. With pointer elements, stale cells keep objects alive. The book's examples are the defaults: <code>[0 1 2 3 4]</code> with capacity 10 for clear, and <code>slices.Delete([-1 1 2 3 4], 1, 3)</code>.`,
    mount(el) {
      const st = { op: `del`, ver: `1.22`, i: 1, j: 3, elem: `int` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`operation`, seg(`op`, [[`clear`, `clear(s)`], [`trunc`, `s = s[:0]`], [`del`, `slices.Delete(s, i, j)`], [`compact`, `slices.Compact(s)`], [`concat`, `slices.Concat`], [`map`, `clear(m)`]], st.op))}</div>
        <div class="ctl-row">${ctl(`Go version`, seg(`ver`, [[`1.21`, `1.21`], [`1.22`, `1.22+`]], st.ver))}${ctl(`elements`, seg(`elem`, [[`int`, `int`], [`ptr`, `*User`]], st.elem))}${ctl(`i`, rng(`i`, 0, 4, 1, st.i))}${ctl(`j`, rng(`j`, 0, 5, 1, st.j))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Code</h4><div data-k="code"></div><h4>Output</h4><div data-k="out"></div></div>
          <div class="lab-panel"><h4>Backing arrays</h4><div data-k="arr"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const cell = (v, inLen, cls, ptr) => `<span class="byte ${cls}" style="min-width:34px">${ptr && v !== 0 ? `&amp;u` + v : ptr ? `nil` : v}<small>${inLen ? `in len` : `cap only`}</small></span>`;
      const row = (label, arr, len, marks, ptr) => `<div style="margin-bottom:10px"><div style="font-size:11.5px;color:var(--text-muted);margin-bottom:3px">${label}: len=${len} cap=${arr.length}</div><div class="bytes">${arr.map((v, k) => cell(v, k < len, marks[k] || (k < len ? `c0` : `dim`), ptr)).join(``)}</div></div>`;
      const fmtS = (arr, len, ptr) => `[` + arr.slice(0, len).map(v => ptr ? (v ? `0xc0000a` + (v * 16).toString(16) : `<nil>`) : v).join(` `) + `]`;
      const draw = () => {
        const ptr = st.elem === `ptr`, newer = String(st.ver) === `1.22`;
        let code, out, arr = ``, n, cls = `good`;
        if (st.op === `map`) {
          code = `m := map[string]int{"One": 1}\nm["Two"] = 2\nfmt.Println("Before clear:", m)\nclear(m)\nfmt.Println("After clear:", m)`;
          out = `Before clear: map[One:1 Two:2]\nAfter clear: map[]`;
          arr = `<div class="kv"><div class="kv-row"><span>len(m)</span><span>2 &rarr; 0</span></div><div class="kv-row hot"><span>buckets allocated</span><span>kept</span></div></div>`;
          n = `On a map, <code>clear</code> deletes every entry (len becomes 0), unlike on a slice. It can also remove NaN keys, which a <code>delete</code> loop can't. Like delete, it keeps the allocated buckets for reuse; set the map to nil to release them.`;
        } else if (st.op === `concat`) {
          code = `s1 := []int{1, 2}\ns2 := []int{-1, -2}\ns3 := []int{10, 20}\nconCat := slices.Concat(s1, s2, s3)\nfmt.Println(conCat)`;
          out = newer ? `[1 2 -1 -2 10 20]` : `./sliceChanges.go:12:19: undefined: slices.Concat`;
          cls = newer ? `good` : `bad`;
          arr = newer ? row(`conCat (new array)`, [1, 2, -1, -2, 10, 20], 6, {}, false) : `<span class="cs-note">does not compile on 1.21</span>`;
          n = newer ? `<code>slices.Concat</code> (Go 1.22) allocates one new slice of the exact total length and copies the inputs into it; the inputs are untouched.` : `slices.Concat was added in Go 1.22.`;
        } else if (st.op === `clear` || st.op === `trunc`) {
          const back = [0, 1, 2, 3, 4, 0, 0, 0, 0, 0].map((v, k) => ptr ? (k < 5 ? k + 1 : 0) : v);
          code = `s := make([]${ptr ? `*User` : `int`}, 0, 10)\nfor i := 0; i < 5; i++ {\n\ts = append(s, ${ptr ? `&users[i]` : `i`})\n}\nfmt.Println("Before:", s, len(s), cap(s))\n${st.op === `clear` ? `clear(s)` : `s = s[:0]`}\nfmt.Println("After:", s, len(s), cap(s))`;
          const after = st.op === `clear` ? back.map((v, k) => k < 5 ? 0 : v) : back;
          const len2 = st.op === `clear` ? 5 : 0;
          out = `Before: ${fmtS(back, 5, ptr)} 5 10\nAfter: ${fmtS(after, len2, ptr)} ${len2} 10`;
          arr = row(`before`, back, 5, {}, ptr) + row(`after`, after, len2, st.op === `clear` ? { 0: `c5`, 1: `c5`, 2: `c5`, 3: `c5`, 4: `c5` } : (ptr ? { 0: `bad`, 1: `bad`, 2: `bad`, 3: `bad`, 4: `bad` } : {}), ptr);
          n = st.op === `clear` ? `<code>clear(s)</code> writes the zero value into s[0:len] and keeps len and cap: <code>[0 0 0 0 0] 5 10</code>, exactly the book's output. It does not touch cells beyond len.` : `<code>s = s[:0]</code> only changes the length; the old elements are still in the backing array${ptr ? `, so the 5 Users stay reachable and can't be collected. Call clear(s) first, then truncate, to drop those references.` : `. That's fine for ints and is the usual way to reuse a buffer.`}`;
          cls = st.op === `trunc` && ptr ? `warn` : `good`;
        } else {
          const base = [-1, 1, 2, 3, 4];
          const src = st.op === `compact` ? [1, 1, 2, 2, 2] : base;
          const vals = ptr ? src.map((v, k) => k + 1) : src;
          let i = st.i, j = st.j;
          if (st.op === `del` && (j < i || j > 5)) { out = `panic: runtime error: slice bounds out of range [${i}:${j}]`; }
          let res, back;
          if (st.op === `del` && !out) {
            const kept = vals.slice(0, i).concat(vals.slice(j));
            back = kept.concat(newer ? new Array(j - i).fill(0) : vals.slice(5 - (j - i)));
            res = kept.length;
          } else if (st.op === `compact`) {
            const kept = []; src.forEach((v, k) => { if (!k || v !== src[k - 1]) kept.push(vals[k]); });
            back = kept.concat(newer ? new Array(5 - kept.length).fill(0) : vals.slice(kept.length));
            res = kept.length;
          }
          code = st.op === `del` ? `v1 := []${ptr ? `*User{u1, u2, u3, u4, u5}` : `int{-1, 1, 2, 3, 4}`}\nfmt.Println("v1:", v1)\nv2 := slices.Delete(v1, ${i}, ${j})\nfmt.Println("v1:", v1)\nfmt.Println("v2:", v2)` : `v1 := []${ptr ? `*User{a, a, b, b, b} // equal neighbours` : `int{1, 1, 2, 2, 2}`}\nv2 := slices.Compact(v1)\nfmt.Println("v1:", v1)\nfmt.Println("v2:", v2)`;
          if (out) { cls = `bad`; arr = row(`v1`, vals, 5, {}, ptr); n = `<code>slices.Delete(s, i, j)</code> requires 0 &lt;= i &lt;= j &lt;= len(s); otherwise it panics.`; }
          else {
            const marks = {};
            for (let k = res; k < 5; k++) marks[k] = newer ? `c5` : (ptr ? `bad` : `c2`);
            out = (st.op === `del` ? `v1: ${fmtS(vals, 5, ptr)}\n` : ``) + `v1: ${fmtS(back, 5, ptr)}\nv2: ${fmtS(back, res, ptr)}`;
            arr = row(`v1 before`, vals, 5, {}, ptr) + row(`v1 after (same array)`, back, 5, marks, ptr) + row(`v2 = returned slice`, back, res, marks, ptr);
            const stale = 5 - res;
            if (!stale) n = `Nothing was removed, so nothing changed.`;
            else if (newer) n = `Since Go 1.22 the ${stale} vacated cell${stale > 1 ? `s` : ``} between the new and old length ${stale > 1 ? `are` : `is`} zeroed${st.op === `del` && i === 1 && j === 3 && !ptr ? `: <code>v1: [-1 3 4 0 0]</code>, <code>v2: [-1 3 4]</code>, the book's output` : ``}. ${ptr ? `The removed Users are no longer referenced from the array, so the GC can free them.` : `Using the stale v1 now shows zeros instead of misleading duplicates.`} Always continue with the returned slice.`;
            else { n = `In Go 1.21 the shifted-out tail kept its old values (${fmtS(back, 5, ptr).slice(1, -1).split(` `).slice(res).join(` `)}). ${ptr ? `Those stale pointers kept the deleted Users alive: a quiet memory leak.` : `Code that kept using v1 saw duplicated elements.`}`; cls = `warn`; }
          }
        }
        q(`code`).innerHTML = pblock(`ctx`, `Go ${st.ver}`, code);
        q(`out`).innerHTML = pblock(cls === `bad` ? `bad` : `out`, `go run`, out);
        q(`arr`).innerHTML = arr;
        q(`note`).innerHTML = note(n, cls);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { i: v => v, j: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Appendix - Tri-color mark and sweep with a write barrier
  // =====================================================================
  const GC_NODES = { A: [70, 95], B: [210, 95], C: [400, 95], D: [140, 180], G: [270, 180], H: [140, 262], I: [400, 180], J: [490, 180], E: [470, 262], F: [350, 262] };
  const GC_EDGES = [[`A`, `D`], [`B`, `D`], [`B`, `G`], [`D`, `H`], [`C`, `I`], [`J`, `E`], [`E`, `F`]];
  const GC_ROOTS = { A: `stack`, B: `stack`, C: `globals` };
  const GC_SLOTS = [[40, 180], [250, 262], [530, 95]];
  D.cAGC = {
    title: `Tri-color mark and sweep, with and without a write barrier`,
    blurb: `A small heap like the appendix's Figure A.1: roots on goroutine stacks and in globals, reachable objects, and an unreachable cluster (J, E, F). Step through marking: roots turn gray, a gray object is scanned and turns black, and its white children turn gray. Then let the <strong>mutator</strong> move a pointer behind the collector's back. With the write barrier on, the moved object is shaded and survives; turn the barrier off and the sweep frees an object that is still referenced.`,
    mount(el, ctx) {
      const st = { wb: `on` };
      let nodes, edges, phase, queue, cycle, log, freedLive, slot, playing = null, extra;
      const reset = () => {
        nodes = {}; Object.keys(GC_NODES).forEach(k => { nodes[k] = { c: `w`, freed: false, x: GC_NODES[k][0], y: GC_NODES[k][1] }; });
        edges = GC_EDGES.map(e => ({ f: e[0], t: e[1], hot: false }));
        phase = `idle`; queue = []; cycle = 1; log = []; freedLive = []; slot = 0; extra = 0;
        say(`info`, `heap ready: roots A, B (stack) and C (globals). Press "start cycle".`);
      };
      const say = (c, t) => { log.unshift([c, t]); log = log.slice(0, 40); };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`write barrier`, seg(`wb`, [[`on`, `on (Go)`], [`off`, `off`]], st.wb))}${btn(`start`, `start cycle`)}${btn(`step`, `step`)}${btn(`play`, `play`, true)}${btn(`reset`, `reset`, true)}</div>
        <div class="ctl-row">${ctl(`mutator`, btn(`hide`, `move pointer: black.p = gray.p; gray.p = nil`, true) + btn(`alloc`, `allocate new object`, true) + btn(`drop`, `drop a reference`, true))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4 data-k="ph"></h4><div data-k="svg"></div><div class="legend"><span>${chip(`muted`, `white: not reached`)}</span><span>${chip(`final`, `gray: reached, not scanned`)}</span><span>${chip(`ok`, `black: scanned`)}</span></div></div>
          <div class="lab-panel"><h4>Collector log</h4><div class="log" data-k="log"></div><div class="stat-row" data-k="stats" style="margin-top:10px"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const live = k => !nodes[k].freed;
      const shade = k => { if (live(k) && nodes[k].c === `w`) { nodes[k].c = `g`; queue.push(k); return true; } return false; };
      const clearHot = () => edges.forEach(e => { e.hot = false; });
      const actions = {
        start() {
          if (phase !== `idle`) { say(`dup`, `a cycle is already running`); return; }
          clearHot(); freedLive = [];
          Object.keys(nodes).forEach(k => { if (live(k)) nodes[k].c = `w`; });
          phase = `mark`; queue = [];
          Object.keys(GC_ROOTS).forEach(k => shade(k));
          say(`info`, `cycle ${cycle}: STW, ${st.wb === `on` ? `enable the write barrier, ` : ``}gray the roots A, B, C`);
        },
        step() {
          clearHot();
          if (phase === `idle`) { actions.start(); return; }
          if (phase === `mark`) {
            if (!queue.length) { phase = `term`; say(`info`, `mark termination (STW): no gray objects left`); return; }
            const x = queue.shift();
            const kids = edges.filter(e => e.f === x && live(e.t));
            const grayed = [];
            kids.forEach(e => { e.hot = true; if (shade(e.t)) grayed.push(e.t); });
            nodes[x].c = `b`;
            say(`ok`, `scan ${x}: ${grayed.length ? `gray ${grayed.join(`, `)}` : `no white children`}; ${x} is black`);
            return;
          }
          if (phase === `term`) {
            const white = Object.keys(nodes).filter(k => live(k) && nodes[k].c === `w`);
            white.forEach(k => { nodes[k].freed = true; });
            freedLive = edges.filter(e => white.includes(e.t) && live(e.f)).map(e => `${e.f}→${e.t}`);
            say(white.length ? `ok` : `info`, `sweep: free ${white.length ? white.join(`, `) : `nothing`}`);
            if (freedLive.length) say(`bad`, `DANGLING POINTER: ${freedLive.join(`, `)} points to freed memory!`);
            edges = edges.filter(e => live(e.f));
            phase = `idle`; cycle++;
            say(`info`, `cycle done. Live objects are reset to white at the next cycle.`);
          }
        },
        hide() {
          clearHot();
          if (phase !== `mark`) { say(`dup`, `start a cycle and step until one object is black and a gray one points to a white one`); return; }
          let found = null;
          for (const ey of edges) {
            if (nodes[ey.f].c === `g` && live(ey.t) && nodes[ey.t].c === `w`) {
              const xb = Object.keys(nodes).find(k => live(k) && nodes[k].c === `b` && !edges.some(e => e.f === k && e.t === ey.t));
              if (xb) { found = { x: xb, y: ey.f, z: ey.t }; break; }
            }
          }
          if (!found) { say(`dup`, `need a black object plus a gray object pointing to a white one; step once or twice more`); return; }
          const { x, y, z } = found;
          edges.push({ f: x, t: z, hot: true });
          edges = edges.filter(e => !(e.f === y && e.t === z));
          say(`dup`, `mutator: ${x}.p = ${y}.p (now ${x}→${z}); ${y}.p = nil`);
          if (st.wb === `on`) { shade(z); say(`ok`, `write barrier: shade ${z} (new target of ${x}.p, and old value of ${y}.p): ${z} is gray`); }
          else say(`bad`, `no barrier: ${z} stays white, but black ${x} will never be rescanned. Invariant broken: black ${x} → white ${z}`);
        },
        alloc() {
          clearHot();
          if (slot >= GC_SLOTS.length) { say(`dup`, `no room for more objects in this demo`); return; }
          const k = `N` + (++extra), [x, y] = GC_SLOTS[slot++];
          const parent = Object.keys(GC_ROOTS).find(r => live(r)) || `A`;
          nodes[k] = { c: phase === `mark` || phase === `term` ? `b` : `w`, freed: false, x, y };
          edges.push({ f: parent, t: k, hot: true });
          say(`ok`, `mutator: ${parent}.next = new object ${k}${phase === `mark` ? ` (allocated black: objects created during marking count as marked)` : ``}`);
        },
        drop() {
          clearHot();
          const cand = edges.filter(e => live(e.f) && live(e.t) && !GC_ROOTS[e.t] && (phase !== `mark` || nodes[e.t].c !== `w`) && edges.filter(o => o.t === e.t).length === 1);
          const e = cand[0] || edges.find(o => live(o.f) && live(o.t) && !GC_ROOTS[o.t]);
          if (!e) { say(`dup`, `nothing to drop`); return; }
          edges = edges.filter(o => o !== e);
          const tc = nodes[e.t].c;
          if (st.wb === `on` && phase === `mark`) shade(e.t);
          say(`dup`, `mutator: ${e.f}.p = nil (dropped the pointer to ${e.t})`);
          if (phase === `mark` && (tc !== `w` || st.wb === `on`)) say(`info`, `${e.t} is unreachable now but already ${nodes[e.t].c === `b` ? `black` : `gray`}: floating garbage, freed in the next cycle`);
          else say(`info`, `${e.t} is unreachable; it stays white and will be swept`);
        },
        reset() { reset(); },
        play(b) {
          if (playing) { clearInterval(playing); playing = null; if (b) b.textContent = `play`; return; }
          if (b) b.textContent = `pause`;
          playing = ctx.every(() => { actions.step(); draw(); if (phase === `idle`) { clearInterval(playing); playing = null; const pb = el.querySelector(`[data-act="play"]`); if (pb) pb.textContent = `play`; } }, 750);
        }
      };
      const draw = () => {
        q(`ph`).textContent = phase === `idle` ? `Cycle ${cycle}: not collecting` : phase === `mark` ? `Cycle ${cycle}: marking (concurrent, barrier ${st.wb})` : `Cycle ${cycle}: mark termination, ready to sweep`;
        const R = 17;
        let s = `<defs><marker id="cA-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" style="fill:var(--text-muted)"/></marker></defs>`;
        s += `<text class="svg-label" x="140" y="22" text-anchor="middle">goroutine stack</text><text class="svg-label" x="400" y="22" text-anchor="middle">globals</text>`;
        Object.keys(GC_ROOTS).forEach(k => { const n = nodes[k]; const sx = GC_ROOTS[k] === `stack` ? 140 : 400; s += `<line class="svg-edge" x1="${sx}" y1="28" x2="${n.x}" y2="${n.y - R}" style="stroke-dasharray:3 3" marker-end="url(#cA-arrow)"/>`; });
        edges.forEach(e => {
          const a = nodes[e.f], b = nodes[e.t]; if (!a || !b) return;
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
          const bad = a.c === `b` && b.c === `w` && phase === `mark` && live(e.t) && live(e.f);
          const dang = b.freed && live(e.f);
          s += `<line class="svg-edge ${e.hot ? `hot` : ``}" x1="${a.x + dx / L * R}" y1="${a.y + dy / L * R}" x2="${b.x - dx / L * (R + 2)}" y2="${b.y - dy / L * (R + 2)}" marker-end="url(#cA-arrow)" style="${bad || dang ? `stroke:var(--bad);opacity:1;stroke-width:2.4` : ``}"/>`;
        });
        Object.keys(nodes).forEach(k => {
          const n = nodes[k];
          const fill = n.freed ? `transparent` : n.c === `w` ? `#f8fafc` : n.c === `g` ? `#94a3b8` : `#0f172a`;
          const txt = n.freed ? `var(--text-muted)` : n.c === `b` ? `#fff` : `#111`;
          s += `<circle cx="${n.x}" cy="${n.y}" r="${R}" style="fill:${fill};stroke:${n.freed ? `var(--text-muted)` : GC_ROOTS[k] ? `var(--accent-3)` : `#64748b`};stroke-width:${GC_ROOTS[k] ? 2.5 : 1.5};${n.freed ? `stroke-dasharray:3 3;opacity:.45` : ``}"/>`;
          s += `<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" style="fill:${txt};font-size:12px;font-weight:700">${k}</text>`;
          if (n.freed) s += `<text class="svg-label" x="${n.x}" y="${n.y + R + 12}" text-anchor="middle">freed</text>`;
        });
        q(`svg`).innerHTML = svgWrap(560, 300, s);
        q(`log`).innerHTML = log.map(([c, t]) => `<div class="${c}">${esc(t)}</div>`).join(``);
        const cnt = c => Object.keys(nodes).filter(k => live(k) && nodes[k].c === c).length;
        const viol = phase === `mark` ? edges.filter(e => live(e.f) && live(e.t) && nodes[e.f].c === `b` && nodes[e.t].c === `w`) : [];
        q(`stats`).innerHTML = stat(`white`, cnt(`w`)) + stat(`gray (work list)`, cnt(`g`)) + stat(`black`, cnt(`b`)) + stat(`freed`, Object.keys(nodes).filter(k => !live(k)).length) + `<div class="stat-mini">${viol.length ? chip(`no`, `invariant violated: ${viol.map(e => e.f + `→` + e.t).join(`, `)}`) : chip(`ok`, `no black → white pointer`)}</div>`;
        let n;
        if (freedLive.length) n = `The sweep freed ${freedLive.map(x => x.split(`→`)[1]).join(`, `)} while ${freedLive.map(x => x.split(`→`)[0]).join(`, `)} still points to it. In a real program the memory would be reused and the pointer would see garbage: corruption or a crash. This is exactly what the write barrier prevents; turn it on and replay.`;
        else if (phase === `idle` && cycle === 1) n = `Start a cycle: every object begins white and the roots are grayed. Each step scans one gray object. The algorithm is finished when the gray set is empty; whatever is still white is unreachable (J, E and F here: E points to F, but nothing reachable points to E).`;
        else if (phase === `mark`) n = `The collector never revisits black objects, so correctness rests on one invariant: <strong>no black object points to a white one</strong>. The mutator keeps running during marking; try "move pointer" ${st.wb === `on` ? `and watch the barrier shade the target` : `with the barrier off`}.`;
        else if (phase === `term`) n = `Nothing is gray. Mark termination is one of Go's short stop-the-world phases; the next step sweeps the white objects.`;
        else n = `Cycle complete. Objects that became unreachable after being shaded survived as floating garbage and will be freed next cycle. Go's GC is concurrent and non-moving: survivors stay where they are.`;
        q(`note`).innerHTML = note(n, freedLive.length ? `bad` : phase === `mark` && st.wb === `off` ? `warn` : ``);
      };
      onAct(el, (a, b) => {
        if (!actions[a]) return;
        if (a === `reset` && playing) { clearInterval(playing); playing = null; const pb = el.querySelector(`[data-act="play"]`); if (pb) pb.textContent = `play`; }
        actions[a](b); draw();
      });
      wireSegs(el, st, () => { say(`info`, `write barrier ${st.wb}`); draw(); });
      reset(); draw();
    }
  };

  // =====================================================================
  // Appendix - GOGC pacing and gctrace
  // =====================================================================
  D.cAPacer = {
    title: `GOGC, GOMEMLIMIT and the heap sawtooth`,
    blurb: `The GC starts a new cycle when the heap reaches the <strong>goal</strong>: live heap x (1 + GOGC/100). Set the live heap your program really needs, how fast it allocates garbage, and GOGC, and watch the heap sawtooth, the number of cycles, an estimate of GC CPU cost and the <code>GODEBUG=gctrace=1</code> lines. Add a <code>GOMEMLIMIT</code> to cap memory, and set it too low to see the GC run back to back. The cost model is illustrative; the goal formula is Go's (simplified: it ignores stacks and globals).`,
    mount(el) {
      const st = { gogc: 100, live: 60, rate: 300, lim: 0 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`GOGC`, rng(`gogc`, 0, 400, 25, st.gogc))}${ctl(`live heap (MB)`, rng(`live`, 5, 200, 5, st.live))}${ctl(`allocation rate (MB/s)`, rng(`rate`, 20, 1000, 20, st.rate))}</div>
        <div class="ctl-row">${ctl(`GOMEMLIMIT`, seg(`lim`, [[0, `off`], [96, `96 MiB`], [160, `160 MiB`], [256, `256 MiB`]], st.lim))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Heap over 5 seconds</h4><div data-k="chart"></div><div class="legend"><span><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" class="svg-line"/></svg> heap in use</span><span><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" class="svg-line2"/></svg> heap goal</span><span><svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" class="svg-line3"/></svg> live heap / limit</span></div></div>
          <div class="lab-panel"><h4>Pacing</h4><div class="stat-row" data-k="stats"></div><div data-k="bars" style="margin-top:10px"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>$ GODEBUG=gctrace=1 ./app</h4><div data-k="trace"></div></div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const draw = () => {
        const off = st.gogc === 0, live = st.live, rate = st.rate, lim = st.lim;
        let goal = off ? Infinity : Math.max(4, live * (1 + st.gogc / 100));
        let limited = false;
        if (lim && goal > lim - 4) { goal = Math.max(live + 2, lim - 4); limited = true; }
        const T = 5, dt = 0.005, markMBperS = 400;
        let heap = live, t = 0, inMark = false, markEnd = 0, startHeap = 0, cycles = 0, cpuMs = 0, peak = live;
        const pts = [], trace = [];
        while (t < T) {
          heap += rate * dt;
          if (!inMark && heap >= goal) { inMark = true; startHeap = heap; markEnd = t + live / markMBperS + 0.002; cycles++; cpuMs += live * 2.5; }
          if (inMark && t >= markEnd) {
            inMark = false;
            const endHeap = heap;
            trace.push(`gc ${cycles} @${t.toFixed(3)}s ${Math.min(50, Math.round(100 * cpuMs / (Math.max(t, 0.01) * 1000 * 10)))}%: 0.021+${(live / markMBperS * 1000).toFixed(1)}+0.015 ms clock, ${round(live * 2.5 / 4, 2)}+0.1/${round(live * 2.5 / 10, 1)}/0+0.12 ms cpu, ${Math.round(startHeap)}->${Math.round(endHeap)}->${Math.round(live)} MB, ${isFinite(goal) ? Math.round(goal) : `-`} MB goal, 0 MB stacks, 0 MB globals, 10 P`);
            heap = live + (endHeap - startHeap);
          }
          peak = Math.max(peak, heap);
          if (Math.round(t / dt) % 4 === 0) pts.push([t, heap]);
          t += dt;
        }
        const ymax = Math.max(lim || 0, isFinite(goal) ? goal : 0, peak) * 1.1;
        const a = axes({ x0: 46, x1: 470, y0: 200, y1: 12, dx0: 0, dx1: T, dy0: 0, dy1: ymax, xTicks: [0, 1, 2, 3, 4, 5], yTicks: [0, ymax / 4, ymax / 2, 3 * ymax / 4, ymax].map(v => Math.round(v)), xFmt: v => v + `s`, yLabel: `MB` });
        let s = a.svg + `<path class="svg-line" d="${path(pts.map(p => [a.X(p[0]), a.Y(Math.min(p[1], ymax))]))}"/>`;
        if (isFinite(goal)) s += `<line class="svg-line2" x1="${a.X(0)}" x2="${a.X(T)}" y1="${a.Y(goal)}" y2="${a.Y(goal)}"/>`;
        s += `<line class="svg-line3" x1="${a.X(0)}" x2="${a.X(T)}" y1="${a.Y(live)}" y2="${a.Y(live)}" style="opacity:.6"/>`;
        if (lim) s += `<line class="svg-line3" x1="${a.X(0)}" x2="${a.X(T)}" y1="${a.Y(lim)}" y2="${a.Y(lim)}" style="stroke:var(--bad);stroke-dasharray:2 2"/><text class="svg-label" x="${a.X(T) - 4}" y="${a.Y(lim) - 4}" text-anchor="end">GOMEMLIMIT</text>`;
        q(`chart`).innerHTML = svgWrap(490, 235, s);
        const cpuPct = 100 * cpuMs / (T * 1000 * 10);
        const thrash = limited && goal - live < live * 0.1;
        q(`stats`).innerHTML = stat(`heap goal`, isFinite(goal) ? Math.round(goal) + ` MB` : `none`) + stat(`GC cycles / s`, round(cycles / T, 1), cycles / T > 20 ? `bad` : ``) + stat(`peak heap`, Math.round(peak) + ` MB`, lim && peak > lim ? `bad` : ``) + stat(`GC CPU (10 Ps)`, round(Math.min(cpuPct, 50), 1) + `%`, cpuPct > 25 ? `bad` : cpuPct < 5 ? `good` : ``);
        q(`bars`).innerHTML = hbars([
          { label: `memory (peak)`, value: peak, text: Math.round(peak) + ` MB`, cls: `alt` },
          { label: `GC CPU`, value: Math.min(cpuPct, 50) * 10, text: round(Math.min(cpuPct, 50), 1) + `%`, cls: cpuPct > 25 ? `bad` : `warn` }
        ], Math.max(peak, Math.min(cpuPct, 50) * 10));
        q(`trace`).innerHTML = trace.length ? pblock(`sys`, `last cycles (start->end->live MB, goal)`, trace.slice(-5).join(`\n`)) : `<div class="cs-note">No GC cycle in 5 seconds${off ? `: GOGC=off disables collection, and the heap just grows (${Math.round(peak)} MB and counting).` : `.`}</div>`;
        let n;
        if (off && !lim) n = `<code>GOGC=off</code> without a limit never collects: memory grows by ${rate} MB every second until the process is OOM-killed. It's only for short batch jobs or when combined with GOMEMLIMIT.`;
        else if (off) n = `<code>GOGC=off</code> plus <code>GOMEMLIMIT=${lim}MiB</code>: the GC runs only when total memory approaches the limit. That's a popular container setting: use all the memory you're allowed, collect only when you must.`;
        else if (thrash) n = `The limit sits barely above the live heap, so each cycle frees almost nothing and the next one starts immediately. Go caps GC CPU at about 50% in this situation to avoid a death spiral, but the program crawls. A memory limit can't make live data smaller; raise it or reduce live data.`;
        else n = `With GOGC=${st.gogc} the goal is ${live} x ${round(1 + st.gogc / 100, 2)} = ${Math.round(goal)} MB${limited ? ` (lowered by GOMEMLIMIT)` : ``}. Each cycle reclaims about ${Math.round(goal - live)} MB of garbage, so at ${rate} MB/s you get about ${round(rate / Math.max(goal - live, 1), 1)} cycles per second. Doubling GOGC halves the cycles (less CPU) at the price of more memory. The gctrace triplet is heap at start, heap at end (allocation continued during concurrent marking), and live heap.`;
        q(`note`).innerHTML = note(n, (off && !lim) || thrash ? `bad` : ``);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { gogc: v => v === 0 ? `off` : v, live: v => v + ` MB`, rate: v => v + ` MB/s` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Appendix - Maps, slices and GC cost
  // =====================================================================
  const MAPS_BOOK = { slice: [`sliceGC.go`, 1.222, `0.61s user 0.52s system 92% cpu`], star: [`mapStar.go`, 14.107, `23.86s user 1.02s system 176% cpu`], nostar: [`mapNoStar.go`, 10.701, `10.01s user 0.53s system 98% cpu`], split: [`mapSplit.go`, 11.641, `11.22s user 0.44s system 100% cpu`] };
  D.cAMaps = {
    title: `What the GC has to scan: slice vs maps, with and without pointers`,
    blurb: `The appendix stores N = 80 million entries in four ways and times them. Pick a structure and a size to see how many heap objects it creates, how much memory may contain pointers (the GC must scan it) and how many pointers it must follow on every cycle. The book's measured times at 80M are shown for comparison; the other numbers come from the runtime's data layout.`,
    mount(el) {
      const st = { s: `star`, n: 7.9 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`structure`, seg(`s`, [[`slice`, `[]data{i, j int}`], [`nostar`, `map[int]int`], [`split`, `[]map[int]int (2000)`], [`star`, `map[int]*int`]], st.s))}${ctl(`entries (10^n)`, rng(`n`, 5, 7.9, 0.1, st.n))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4 data-k="h"></h4><div data-k="code"></div><div class="stat-row" data-k="stats" style="margin-top:8px"></div></div>
          <div class="lab-panel"><h4>Compare all four at this size</h4><div data-k="bars"></div><h4 style="margin-top:10px">Book: time go run ... (N = 80,000,000)</h4><div data-k="book"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = qsel(el);
      const model = (s, N) => {
        const buckets = n => { let B = 0; while (n > 6.5 * Math.pow(2, B)) B++; return Math.pow(2, B); };
        if (s === `slice`) { const st_ = appendStats(Math.min(N, 2e5)); const cap = N <= 2e5 ? st_.cap : N * 1.25; return { mem: cap * 16, objs: 1, scan: 0, ptrs: 0 }; }
        if (s === `nostar`) { const nb = buckets(N); return { mem: nb * 144, objs: 1, scan: 0, ptrs: 0 }; }
        if (s === `split`) { const per = Math.ceil(N / 2000), nb = buckets(per); return { mem: 2000 * (nb * 144 + 48), objs: 2000 * 2 + 1, scan: 2000 * 8, ptrs: 2000 }; }
        const nb = buckets(N); return { mem: nb * 144 + N * 8, objs: 1 + N, scan: nb * 144, ptrs: N };
      };
      const NAMES = { slice: `[]data`, nostar: `map[int]int`, split: `[]map[int]int`, star: `map[int]*int` };
      const CODE = {
        slice: `var structure []data\nfor i := 0; i < N; i++ {\n\tvalue := int(i)\n\tstructure = append(structure, data{value, value})\n}\nruntime.GC()\n_ = structure[0]`,
        nostar: `myMap := make(map[int]int)\nfor i := 0; i < N; i++ {\n\tvalue := int(i)\n\tmyMap[value] = value\n}\nruntime.GC()\n_ = myMap[0]`,
        split: `split := make([]map[int]int, 2000)\nfor i := range split {\n\tsplit[i] = make(map[int]int)\n}\nfor i := 0; i < N; i++ {\n\tvalue := int(i)\n\tsplit[i%2000][value] = value\n}\nruntime.GC()\n_ = split[0][0]`,
        star: `myMap := make(map[int]*int)\nfor i := 0; i < N; i++ {\n\tvalue := int(i)\n\tmyMap[value] = &value // value escapes\n}\nruntime.GC()\n_ = myMap[0]`
      };
      const draw = () => {
        const N = Math.round(Math.pow(10, st.n));
        const m = model(st.s, N);
        q(`h`).textContent = `${NAMES[st.s]} with ${fmtNum(N)} entries`;
        q(`code`).innerHTML = pblock(`ctx`, MAPS_BOOK[st.s][0], CODE[st.s]);
        q(`stats`).innerHTML = stat(`memory`, fmtBytes(m.mem)) + stat(`heap objects`, fmtNum(m.objs)) + stat(`bytes to scan`, m.scan ? fmtBytes(m.scan) : `0 (noscan)`, m.scan > 1e8 ? `bad` : m.scan ? `` : `good`) + stat(`pointers to trace / cycle`, fmtNum(m.ptrs), m.ptrs > 1e6 ? `bad` : `good`);
        const all = Object.keys(NAMES).map(k => ({ k, m: model(k, N) }));
        const work = x => x.m.scan / 8 + x.m.ptrs * 4;
        q(`bars`).innerHTML = `<div class="cs-note" style="margin-top:0">GC mark work per cycle (words scanned + pointers followed, relative)</div>` + hbars(all.map(x => ({ label: NAMES[x.k], value: work(x) + 1, text: work(x) ? fmtNum(work(x)) : `~0`, cls: x.k === st.s ? `warn` : work(x) > 1e6 ? `bad` : `good` }))) +
          `<div class="cs-note">Memory</div>` + hbars(all.map(x => ({ label: NAMES[x.k], value: x.m.mem, text: fmtBytes(x.m.mem), cls: x.k === st.s ? `warn` : `alt` })));
        q(`book`).innerHTML = hbars(Object.keys(MAPS_BOOK).map(k => ({ label: MAPS_BOOK[k][0], value: MAPS_BOOK[k][1], text: MAPS_BOOK[k][1] + ` s`, title: MAPS_BOOK[k][2], cls: k === st.s ? `warn` : k === `slice` ? `good` : `` })));
        const n = {
          slice: `One contiguous array of 16-byte structs with no pointers: the GC marks a single object and never looks inside it ("noscan"). Appends reallocate as it grows, but access is a simple offset: by far the fastest at 1.2 s.`,
          nostar: `No pointers in keys or values, so the runtime allocates the buckets as noscan memory and the GC skips their contents. The time goes to hashing and scattered bucket writes, not to the GC: 10.7 s.`,
          split: `Sharding into 2000 maps doesn't reduce the total work: the same hashing, the same bucket memory, plus 2000 map headers. The GC sees only 2000 pointers, but there was no GC problem to solve: 11.6 s. Sharding helps lock contention, not GC.`,
          star: `<code>&amp;value</code> makes each value escape, so there are ${fmtNum(N)} separate heap objects, and the buckets now hold pointers, so every GC cycle must scan all buckets and follow every pointer. Its 176% CPU in the book is the GC's background workers. Slowest: 14.1 s. Avoid pointers in big long-lived collections.`
        }[st.s];
        q(`note`).innerHTML = note(n + (N < 8e7 ? ` <em>Book times are for 80M entries regardless of the slider.</em>` : ``), st.s === `star` ? `bad` : st.s === `slice` ? `good` : ``);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { n: v => fmtNum(Math.round(Math.pow(10, v))) }, draw);
      draw();
    }
  };
})();
