// Mastering Go - interactive labs, part 1 (chapters 1-3). Depends on labkit.js.
(function () {
  "use strict";
  const K = window.LabKit;
  const { esc, clamp, sum, round, seg, setSeg, wireSegs, rng, wireRanges, ctl, stat, note, hbars, svgWrap, fmtNum, fmtBytes, pct, mulberry32 } = K;
  const D = window.DEMOS;
  const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;
  const pblock = (cls, head, body) => `<div class="pblock ${cls}"><div class="pblock-h">${head}</div><pre>${esc(body)}</pre></div>`;
  const tok = (cls, txt) => `<span class="tok ${cls}">${esc(String(txt))}</span>`;
  const btn = (act, label, ghost) => `<button class="lab-btn${ghost ? ` ghost` : ``}" data-act="${act}">${label}</button>`;
  const qk = (el, k) => el.querySelector(`[data-k="${k}"]`);
  const onAct = (el, fn) => el.addEventListener(`click`, e => {
    const b = e.target.closest(`[data-act]`);
    if (b && el.contains(b) && !b.disabled) fn(b.dataset.act, b);
  });

  // Go-like strconv helpers shared by several labs
  function parseFloatGo(s) {
    if (/^[+-]?(inf|infinity)$/i.test(s)) return { ok: true, v: s[0] === `-` ? -Infinity : Infinity };
    if (/^[+-]?nan$/i.test(s)) return { ok: true, v: NaN };
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
      const v = Number(s);
      if (!isFinite(v)) return { ok: false, err: `strconv.ParseFloat: parsing ${JSON.stringify(s)}: value out of range` };
      return { ok: true, v };
    }
    return { ok: false, err: `strconv.ParseFloat: parsing ${JSON.stringify(s)}: invalid syntax` };
  }
  const INT64_MIN = -(1n << 63n), INT64_MAX = (1n << 63n) - 1n;
  function atoiGo(s) {
    if (!/^[+-]?\d+$/.test(s)) return { ok: false, err: `strconv.Atoi: parsing ${JSON.stringify(s)}: invalid syntax` };
    const v = BigInt(s);
    if (v < INT64_MIN || v > INT64_MAX) return { ok: false, err: `strconv.Atoi: parsing ${JSON.stringify(s)}: value out of range` };
    return { ok: true, v };
  }
  // fmt's %v for float64 (shortest representation, Go-style exponent)
  function goFloat(v) {
    if (Number.isNaN(v)) return `NaN`;
    if (v === Infinity) return `+Inf`;
    if (v === -Infinity) return `-Inf`;
    if (Object.is(v, -0)) return `-0`;
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-4 || a >= 1e21)) {
      const [m, e] = v.toExponential().split(`e`);
      let d = e.replace(/^[+-]/, ``);
      if (d.length < 2) d = `0` + d;
      return m + `e` + (e[0] === `-` ? `-` : `+`) + d;
    }
    return String(v);
  }
  const goFloatSlice = xs => `[` + xs.map(goFloat).join(` `) + `]`;
  function meanStd(xs) {
    const n = xs.length, mean = sum(xs) / n;
    const sq = sum(xs.map(x => (x - mean) * (x - mean)));
    return { mean, sd: Math.sqrt(sq / n) };
  }
  const normalize = (xs, mean, sd) => sd === 0 ? xs.slice() : xs.map(v => Math.floor((v - mean) / sd * 10000) / 10000);

  // Number line with dots, mean and one-sigma band
  function dotPlot(values, mean, sd) {
    const W = 470, H = 120, x0 = 20, x1 = 450, y = 64;
    let lo = Math.min(...values, mean - sd), hi = Math.max(...values, mean + sd);
    if (!isFinite(lo) || !isFinite(hi)) return `<div class="lab-note">Cannot plot infinite or NaN values.</div>`;
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const X = v => x0 + (v - lo) / (hi - lo) * (x1 - x0);
    let s = `<rect class="svg-win" x="${X(mean - sd)}" y="${y - 30}" width="${Math.max(1, X(mean + sd) - X(mean - sd))}" height="60" rx="4"/>`;
    s += `<g class="svg-axis"><line x1="${x0}" x2="${x1}" y1="${y + 30}" y2="${y + 30}"/>`;
    [lo + pad, (lo + hi) / 2, hi - pad].forEach(v => { s += `<text x="${X(v)}" y="${y + 44}" text-anchor="middle">${round(v, 2)}</text>`; });
    s += `</g><line class="svg-wm2" x1="${X(mean)}" x2="${X(mean)}" y1="${y - 36}" y2="${y + 30}"/>`;
    s += `<text class="svg-label" x="${X(mean)}" y="${y - 40}" text-anchor="middle">mean ${round(mean, 3)}</text>`;
    const counts = {};
    values.forEach(v => { const key = Math.round(X(v)); counts[key] = (counts[key] || 0) + 1; const k = counts[key] - 1; s += `<circle class="svg-dot" cx="${X(v)}" cy="${y + 18 - k * 9}" r="4"/>`; });
    s += `<text class="svg-label" x="${x1}" y="${y - 22}" text-anchor="end">band = mean ± 1σ</text>`;
    return svgWrap(W, H, s);
  }

  // =====================================================================
  // Ch1 - which(1)
  // =====================================================================
  const WHICH_CWD = `/home/mtsouk/code`;
  const WHICH_FS = {
    "/usr/local/bin": { go: [`f`, 0o755], "notes.txt": [`f`, 0o644], "backup.sh": [`f`, 0o644] },
    "/usr/bin": { which: [`f`, 0o755], go: [`f`, 0o755], ls: [`f`, 0o755], scripts: [`d`, 0o755], secret: [`f`, 0o600] },
    "/bin": { ls: [`f`, 0o755] },
    "/home/mtsouk/go/bin": { godoc: [`f`, 0o755] },
    "/home/mtsouk/bin": { "backup.sh": [`f`, 0o700] },
    "/home/mtsouk/code": { stats: [`f`, 0o755], "which.go": [`f`, 0o644] }
  };
  const WHICH_PATHS = {
    std: `/usr/local/bin:/usr/bin:/bin:/home/mtsouk/go/bin`,
    home: `/home/mtsouk/bin:/usr/bin:/usr/local/bin:/bin`,
    messy: `/opt/missing:/usr/bin::/home/mtsouk/go/bin`,
    empty: ``
  };
  const WHICH_CMDS = [`which`, `go`, `ls`, `godoc`, `backup.sh`, `notes.txt`, `scripts`, `secret`, `stats`, `doesNotExist`];
  const permStr = (t, m) => { const r = `rwxrwxrwx`; let s = t === `d` ? `d` : `-`; for (let i = 8; i >= 0; i--) s += (m >> i) & 1 ? r[8 - i] : `-`; return s; };
  const oct = m => `0` + m.toString(8).padStart(3, `0`);
  const splitList = p => p === `` ? [] : p.split(`:`);
  const joinPath = (dir, file) => dir === `` ? file : dir.replace(/\/+$/, ``) + `/` + file;
  function statPath(p) {
    const abs = p.startsWith(`/`) ? p : WHICH_CWD + `/` + p;
    const i = abs.lastIndexOf(`/`);
    const dir = WHICH_FS[abs.slice(0, i)];
    const e = dir && dir[abs.slice(i + 1)];
    return e ? { type: e[0], perm: e[1] } : null;
  }
  D.c01Which = {
    title: `which(1): walking the PATH like which.go`,
    blurb: `The book's which.go splits <code>$PATH</code> with <code>filepath.SplitList</code>, builds each candidate with <code>filepath.Join</code> and keeps it only if <code>os.Stat</code> succeeds, <code>Mode().IsRegular()</code> is true and <code>mode&amp;0111 != 0</code>. Here a small fake filesystem includes a directory named like a command, a non-executable script, a file with mode 0600 and a binary in the current directory. Try a messy PATH (a missing directory, an empty entry) and the two exercise variants: printing every match and returning a proper exit code.`,
    mount(el) {
      const st = { cmd: `go`, path: `std`, all: `first`, exit: `book` };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`$ go run which.go`, seg(`cmd`, WHICH_CMDS.map(c => [c, c]), st.cmd))}</div>
        <div class="ctl-row">${ctl(`PATH`, seg(`path`, [[`std`, `standard`], [`home`, `~/bin first`], [`messy`, `missing dir + empty entry`], [`empty`, `empty`]], st.path))}</div>
        <div class="ctl-row">${ctl(`search`, seg(`all`, [[`first`, `first match (book)`], [`all`, `all matches (exercise)`]], st.all))}${ctl(`exit code`, seg(`exit`, [[`book`, `book: falls off main`], [`exit`, `os.Exit(1) if not found`]], st.exit))}</div>
        <div data-k="env"></div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>for _, directory := range pathSplit</h4><div class="scroll-x" data-k="trace"></div></div>
          <div class="lab-panel"><h4>Terminal</h4><div data-k="term"></div><div data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const draw = () => {
        const path = WHICH_PATHS[st.path], dirs = splitList(path);
        qk(el, `env`).innerHTML = pblock(`sys`, `environment`, `PATH=${path}\nfilepath.SplitList(PATH) = [${dirs.map(d => JSON.stringify(d)).join(` `)}]   // len ${dirs.length}\ncwd = ${WHICH_CWD}`);
        const found = [];
        let stop = false, sawDir = false, sawNoExec = false, sawEmpty = false, statFails = 0;
        const rows = dirs.map((dir, i) => {
          if (dir === ``) sawEmpty = true;
          const full = joinPath(dir, st.cmd);
          if (stop) return `<tr class="dim"><td class="num">${i}</td><td>${esc(dir || `""`)}</td><td>${esc(full)}</td><td colspan="4">not reached: main() already returned</td></tr>`;
          const s = statPath(full);
          if (!s) { statFails++; return `<tr><td class="num">${i}</td><td>${esc(dir || `""`)}</td><td>${esc(full)}</td><td>${chip(`no`, `err`)} <span style="font-size:11px">no such file or directory</span></td><td>-</td><td>-</td><td>${chip(`muted`, `continue`)}</td></tr>`; }
          const ms = permStr(s.type, s.perm);
          if (s.type === `d`) { sawDir = true; return `<tr><td class="num">${i}</td><td>${esc(dir || `""`)}</td><td>${esc(full)}</td><td>${chip(`ok`, ms)}</td><td>${chip(`no`, `false`)}</td><td>-</td><td>${chip(`muted`, `continue`)}</td></tr>`; }
          const x = s.perm & 0o111;
          if (!x) { sawNoExec = true; return `<tr><td class="num">${i}</td><td>${esc(dir || `""`)}</td><td>${esc(full)}</td><td>${chip(`ok`, ms)}</td><td>${chip(`ok`, `true`)}</td><td>${chip(`no`, `${oct(s.perm)}&amp;0111 = 0000`)}</td><td>${chip(`muted`, `skip`)}</td></tr>`; }
          found.push(full);
          if (st.all === `first`) stop = true;
          return `<tr class="new"><td class="num">${i}</td><td>${esc(dir || `""`)}</td><td>${esc(full)}</td><td>${chip(`ok`, ms)}</td><td>${chip(`ok`, `true`)}</td><td>${chip(`ok`, `${oct(s.perm)}&amp;0111 = ${oct(x)}`)}</td><td>${chip(`final`, st.all === `first` ? `print + return` : `print`)}</td></tr>`;
        });
        qk(el, `trace`).innerHTML = dirs.length
          ? `<table class="mini-table"><tr><th class="num">#</th><th>directory</th><th>filepath.Join</th><th>os.Stat</th><th>IsRegular()</th><th>mode&amp;0111</th><th>result</th></tr>${rows.join(``)}</table>`
          : note(`The loop body never runs: <code>filepath.SplitList("")</code> returns an empty slice.`, `warn`);
        const code = found.length ? 0 : (st.exit === `exit` ? 1 : 0);
        let term = `$ go run which.go ${st.cmd}\n` + found.join(`\n`) + (found.length ? `\n` : ``);
        if (code) term += `exit status 1\n`;
        term += `$ echo $?\n${code}`;
        qk(el, `term`).innerHTML = pblock(found.length ? `out` : code ? `bad` : `ctx`, `stdout / stderr`, term);
        qk(el, `stats`).innerHTML = `<div class="stat-row">${stat(`PATH entries`, dirs.length)}${stat(`os.Stat failures`, statFails)}${stat(`matches`, found.length, found.length ? `good` : `bad`)}${stat(`exit code`, code, code ? `bad` : ``)}</div>`;
        const n = [];
        if (!dirs.length) n.push(`An empty PATH means nothing is searched. The book's version silently prints nothing and still exits with 0.`);
        if (sawEmpty) n.push(`The empty entry between <code>::</code> becomes <code>filepath.Join("", "${esc(st.cmd)}")</code> = <code>"${esc(st.cmd)}"</code>, a <em>relative</em> path, so <code>os.Stat</code> looks in the current directory (${WHICH_CWD}). Shells do the same, which is why an empty PATH entry is a known security risk.`);
        if (sawDir) n.push(`<code>${esc(st.cmd)}</code> exists but is a directory: <code>mode.IsRegular()</code> is false, so it is skipped even though its x bits are set.`);
        if (sawNoExec) n.push(`A regular file without any execute bit (<code>mode&amp;0111 == 0</code>) is skipped: it exists but you could not run it.`);
        if (found.length > 1) n.push(`Printing all matches shows which binary <em>shadows</em> the others: the shell runs the first one, <code>${esc(found[0])}</code>.`);
        if (!found.length && st.exit === `book`) n.push(`Nothing was found and, following UNIX convention, nothing is printed. But the book's version exits with 0, so a script can't tell success from failure. Switch to <code>os.Exit(1)</code> (the chapter's exercise).`);
        if (found.length === 1 && st.all === `first` && !sawEmpty && !sawDir && !sawNoExec) n.push(`Found at the first directory that holds a regular executable file; <code>return</code> ends main() so later PATH entries are never checked.`);
        n.push(`<em>On Windows, SplitList splits on <code>;</code>, there are no execute bits and executables are found through PATHEXT, so use <code>exec.LookPath</code> for portable code.</em>`);
        qk(el, `note`).innerHTML = note(n.join(` `), found.length ? `good` : `warn`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch1 - log package: flags, destinations, Fatal vs Panic
  // =====================================================================
  const LOG_FLAGS = [[`date`, `Ldate`, 1], [`time`, `Ltime`, 2], [`micro`, `Lmicroseconds`, 4], [`long`, `Llongfile`, 8], [`short`, `Lshortfile`, 16], [`utc`, `LUTC`, 32], [`msgp`, `Lmsgprefix`, 64]];
  const LOG_BASE = Date.UTC(2023, 5, 8, 17, 46, 5); // 20:46:05 local (UTC+3)
  const two = n => String(n).padStart(2, `0`);
  D.c01Logging = {
    title: `The log package: flags, destinations, Fatal vs Panic`,
    blurb: `Build the logger from the chapter's customLog.go, customLogLineNumber.go, multipleLogs.go and systemLog.go: pick a destination (stderr, a file in <code>os.TempDir()</code>, <code>io.MultiWriter</code>, syslog), a prefix and flags, and run it as often as you like. The log file is opened with <code>O_APPEND</code>, so it keeps growing. Then switch to <code>log.Fatal</code> and <code>log.Panic</code> and watch the exit status and whether the deferred call runs.`,
    mount(el) {
      const st = { fn: `println`, dest: `file`, prefix: `iLog `, date: 1, time: 1, micro: 0, file: `none`, utc: 0, msgp: 0 };
      let msg = `Hello there!`, runs = 0, fileLines = [], journal = [], last = null;
      const onoff = k => seg(k, [[1, `on`], [0, `off`]], st[k]);
      el.innerHTML = `
        <div class="ctl-row">${ctl(`destination`, seg(`dest`, [[`stderr`, `os.Stderr (default)`], [`file`, `custom file`], [`multi`, `io.MultiWriter(f, os.Stderr)`], [`syslog`, `syslog`]], st.dest))}</div>
        <div class="ctl-row">${ctl(`call`, seg(`fn`, [[`println`, `Println`], [`fatal`, `Fatal`], [`panic`, `Panic`]], st.fn))}${ctl(`prefix`, seg(`prefix`, [[``, `""`], [`iLog `, `"iLog "`], [`LNum `, `"LNum "`], [`myApp: `, `"myApp: "`]], st.prefix))}</div>
        <div class="ctl-row">${ctl(`Ldate`, onoff(`date`))}${ctl(`Ltime`, onoff(`time`))}${ctl(`Lmicroseconds`, onoff(`micro`))}${ctl(`file:line`, seg(`file`, [[`none`, `none`], [`short`, `Lshortfile`], [`long`, `Llongfile`]], st.file))}${ctl(`LUTC`, onoff(`utc`))}${ctl(`Lmsgprefix`, onoff(`msgp`))}</div>
        <div class="ctl-row">${ctl(`message`, `<input class="lab-input" data-k="msg" value="${esc(msg)}">`)}${btn(`run`, `&#9654; go run logs.go`)}${btn(`clear`, `rm log file`, true)}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>logs.go</h4><div data-k="code"></div><div data-k="flags"></div></div>
          <div class="lab-panel"><h4>What you see</h4><div data-k="out"></div></div>
        </div>
        <div data-k="note"></div>`;
      const flagsVal = () => {
        let v = 0, names = [];
        if (st.date) { v |= 1; names.push(`log.Ldate`); }
        if (st.time) { v |= 2; names.push(`log.Ltime`); }
        if (st.micro) { v |= 4; names.push(`log.Lmicroseconds`); }
        if (st.file === `long`) { v |= 8; names.push(`log.Llongfile`); }
        if (st.file === `short`) { v |= 16; names.push(`log.Lshortfile`); }
        if (st.utc) { v |= 32; names.push(`log.LUTC`); }
        if (st.msgp) { v |= 64; names.push(`log.Lmsgprefix`); }
        return { v, expr: names.length ? names.join(`|`) : `0` };
      };
      const program = () => {
        const L = [], imp = [`"fmt"`, `"log"`];
        if (st.dest === `file` || st.dest === `multi`) imp.push(`"os"`, `"path"`);
        if (st.dest === `multi`) imp.push(`"io"`);
        if (st.dest === `stderr` && !imp.includes(`"os"`)) imp.push(`"os"`);
        if (st.dest === `syslog`) imp.push(`"log/syslog"`);
        imp.sort();
        L.push(`package main`, ``, `import (`, ...imp.map(i => `\t` + i), `)`, ``, `func main() {`);
        L.push(`\tdefer fmt.Println("cleanup: deferred call ran")`);
        if (st.dest === `file` || st.dest === `multi`) {
          L.push(`\tLOGFILE := path.Join(os.TempDir(), "mGo.log")`, `\tf, err := os.OpenFile(LOGFILE, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)`, `\tif err != nil {`, `\t\tfmt.Println(err)`, `\t\treturn`, `\t}`, `\tdefer f.Close()`);
        }
        if (st.dest === `syslog`) L.push(`\tw, err := syslog.New(syslog.LOG_SYSLOG, "logs.go")`, `\tif err != nil {`, `\t\tlog.Println(err)`, `\t\treturn`, `\t}`);
        if (st.dest === `multi`) L.push(`\tw := io.MultiWriter(f, os.Stderr)`);
        const w = st.dest === `stderr` ? `os.Stderr` : st.dest === `file` ? `f` : `w`;
        L.push(`\tl := log.New(${w}, ${JSON.stringify(st.prefix)}, ${flagsVal().expr})`);
        const call = st.fn === `println` ? `Println` : st.fn === `fatal` ? `Fatal` : `Panic`;
        L.push(`\tl.${call}(${JSON.stringify(msg)})`);
        const line = L.length;
        L.push(`}`);
        return { text: L.join(`\n`), line };
      };
      const header = (ts, line) => {
        const d = new Date(ts + (st.utc ? 0 : 3 * 3600e3));
        let s = st.msgp ? `` : st.prefix;
        if (st.date) s += `${d.getUTCFullYear()}/${two(d.getUTCMonth() + 1)}/${two(d.getUTCDate())} `;
        if (st.time || st.micro) {
          s += `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
          if (st.micro) s += `.` + String((runs * 137911 + 40213) % 1000000).padStart(6, `0`);
          s += ` `;
        }
        if (st.file !== `none`) s += (st.file === `short` ? `logs.go` : `/home/mtsouk/code/mGo4th/ch01/logs.go`) + `:${line}: `;
        if (st.msgp) s += st.prefix;
        return s;
      };
      const run = () => {
        runs++;
        const ts = LOG_BASE + runs * 7000;
        const p = program();
        const entry = header(ts, p.line) + msg;
        const term = [`$ go run logs.go`];
        if (st.dest === `stderr` || st.dest === `multi`) term.push(entry);
        if (st.dest === `file` || st.dest === `multi`) fileLines.push(entry);
        if (st.dest === `syslog`) {
          const d = new Date(ts + 3 * 3600e3);
          journal.push(`Jun ${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} thinkpad logs.go[${4400 + runs * 17}]: ${entry}`);
        }
        let code = 0, deferRan = true;
        if (st.fn === `println`) term.push(`cleanup: deferred call ran`);
        else if (st.fn === `fatal`) { code = 1; deferRan = false; term.push(`exit status 1`); }
        else {
          code = 2;
          term.push(`cleanup: deferred call ran`, `panic: ${msg}`, ``, `goroutine 1 [running]:`, `log.(*Logger).Panic(0xc000102000, {0xc000104f60, 0x1, 0x1})`, `\t/usr/lib/go/src/log/log.go:257 +0x65`, `main.main()`, `\t/home/mtsouk/code/mGo4th/ch01/logs.go:${p.line} +0x85`, `exit status 2`);
        }
        last = { term: term.join(`\n`), code, deferRan, entry };
      };
      const draw = () => {
        const p = program(), fv = flagsVal();
        qk(el, `code`).innerHTML = pblock(`sys`, `generated from your choices`, p.text);
        qk(el, `flags`).innerHTML = `<div class="stat-row">${stat(`flags value`, fv.v)}${stat(`call on line`, p.line)}${stat(`runs`, runs)}</div>`;
        const showFile = st.dest === `file` || st.dest === `multi` || fileLines.length;
        let out = last ? pblock(last.code === 0 ? `out` : `bad`, `terminal (stdout + stderr), exit status ${last.code}`, last.term) : note(`Press <strong>go run logs.go</strong>.`);
        out += pblock(showFile ? `ctx` : `off`, `$ cat /tmp/mGo.log  (${fileLines.length} line${fileLines.length === 1 ? `` : `s`})`, fileLines.length ? fileLines.slice(-8).join(`\n`) : `(empty)`);
        out += pblock(st.dest === `syslog` || journal.length ? `ctx` : `off`, `$ journalctl -xe`, journal.length ? journal.slice(-5).join(`\n`) : `(no entries from logs.go)`);
        if (last) out += `<div class="stat-row">${stat(`exit status`, last.code, last.code ? `bad` : `good`)}${stat(`deferred call`, last.deferRan ? `ran` : `skipped`, last.deferRan ? `good` : `bad`)}</div>`;
        qk(el, `out`).innerHTML = out;
        let n;
        if (st.fn === `fatal`) n = `<code>Fatal</code> = <code>Print</code> + <code>os.Exit(1)</code>. The process ends immediately: the deferred <code>fmt.Println</code> (and <code>f.Close()</code>) never run. With an <code>*os.File</code> nothing is lost because writes go straight to the kernel, but a <code>bufio.Writer</code> would lose its buffered data.${st.dest === `file` || st.dest === `syslog` ? ` The message went to ${st.dest === `file` ? `the log file` : `syslog`}, so the terminal only shows the exit status.` : ``}`;
        else if (st.fn === `panic`) n = `<code>Panic</code> = <code>Print</code> + <code>panic(msg)</code>. Deferred calls run first (so "cleanup" is printed), then the runtime prints the panic value and a goroutine trace to <strong>stderr</strong> no matter where the logger writes, and the exit status is 2. A deferred <code>recover()</code> could have stopped it.`;
        else n = `<code>log.New(w, prefix, flags)</code>: the header is prefix, date, time (with microseconds), then file:line, then the message. <code>Lmsgprefix</code> moves the prefix right before the message; <code>Lshortfile</code> wins over <code>Llongfile</code>; <code>LUTC</code> prints UTC instead of local time (UTC+3 here). The default logger uses <code>LstdFlags</code> = Ldate|Ltime = 3.`;
        if (st.dest === `multi`) n += ` <code>io.MultiWriter</code> copies every entry to the file and to stderr.`;
        if (st.dest === `syslog`) n += ` With syslog the entry lands in the system journal (tag and PID added by syslog). In containers prefer plain stderr.`;
        qk(el, `note`).innerHTML = note(n, st.fn === `println` ? `good` : st.fn === `fatal` ? `bad` : `warn`);
      };
      wireSegs(el, st, draw);
      qk(el, `msg`).addEventListener(`input`, e => { msg = e.target.value; draw(); });
      onAct(el, a => { if (a === `run`) run(); if (a === `clear`) { fileLines = []; journal = []; last = null; runs = 0; } draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch1/Ch2 - statistics application (v1 and v2)
  // =====================================================================
  const STATS_PRESETS = {
    p1: `1 2 3`,
    p2: `a b 2 -1`,
    p3: `a 0 b -1.2 10.32`,
    p4: `3 5 5 8 9 12 12 13 15 16 17 19 22 24 25 134`,
    p5: `1 2.1 a`,
    p6: `a b c`
  };
  D.c01Stats = {
    title: `The statistics application: stats.go v1 and v2`,
    blurb: `Type command-line arguments and run the book's statistics tool. <strong>v1</strong> (Chapter 1) skips anything <code>strconv.ParseFloat</code> rejects, then prints the count, min, max, mean and population standard deviation. <strong>v2</strong> (Chapter 2) stores the values in a slice, falls back to 10 random values from a <em>seeded</em> math/rand generator when no input is valid, and z-normalizes the data. Each argument is also classified the way process.go does: <code>Atoi</code> first, then <code>ParseFloat</code>.`,
    mount(el) {
      const st = { ver: `v1`, preset: `p1`, seed: 10 };
      let text = STATS_PRESETS.p1;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`version`, seg(`ver`, [[`v1`, `v1: Chapter 1`], [`v2`, `v2: + random fill, normalize`]], st.ver))}</div>
        <div class="ctl-row">${ctl(`examples`, seg(`preset`, [[`p1`, `1 2 3`], [`p2`, `a b 2 -1`], [`p3`, `a 0 b -1.2 10.32`], [`p4`, `16 values (book)`], [`p5`, `1 2.1 a`], [`p6`, `a b c`]], st.preset))}</div>
        <div class="ctl-row">${ctl(`$ go run stats.go`, `<input class="lab-input mono" data-k="args" value="${esc(text)}">`)}</div>
        <div class="ctl-row" data-k="seedrow">${ctl(`rand seed (v2)`, rng(`seed`, 1, 20, 1, st.seed))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>os.Args[1:] through strconv</h4><div data-k="argv"></div><div data-k="term"></div></div>
          <div class="lab-panel"><h4>The data</h4><div data-k="plot"></div><div data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const draw = () => {
        const args = text.trim() === `` ? [] : text.trim().split(/\s+/);
        let nInts = 0, nFloats = 0;
        const cls = args.map(a => {
          if (atoiGo(a).ok) { nInts++; return { a, kind: `int`, v: Number(a) }; }
          const f = parseFloatGo(a);
          if (f.ok) { nFloats++; return { a, kind: `float`, v: f.v }; }
          return { a, kind: `bad`, err: f.err };
        });
        const invalid = cls.filter(c => c.kind === `bad`);
        qk(el, `argv`).innerHTML = `<div class="toks" style="margin-bottom:8px">${tok(`dim`, `os.Args[0]=/tmp/go-build.../exe/stats`)}${cls.map(c => `<span title="${esc(c.err || c.kind)}">${tok(c.kind === `int` ? `c5` : c.kind === `float` ? `c1` : `c4`, c.a)}</span>`).join(``)}</div>
          <div class="legend"><span>${chip(`ok`, `Atoi ok: int`)}</span><span>${chip(`final`, `ParseFloat ok: float`)}</span><span>${chip(`no`, `invalid`)}</span></div>
          ${pblock(invalid.length > nInts + nFloats ? `bad` : `ctx`, `process.go would print`, `#read: ${nInts + nFloats} #ints: ${nInts} #floats: ${nFloats}` + (invalid.length > nInts + nFloats ? `\nToo much invalid input: ${invalid.length}\n` + invalid.map(c => c.a).join(`\n`) : ``))}`;
        let values = cls.filter(c => c.kind !== `bad`).map(c => c.v);
        const out = [`$ go run stats.go ${text.trim()}`];
        let random = false;
        if (st.ver === `v1` && !args.length) out.push(`Need one or more arguments!`);
        else {
          if (st.ver === `v2` && !values.length) {
            random = true;
            const r = mulberry32(st.seed * 7919);
            values = Array.from({ length: 10 }, () => Math.round((-10 + r() * 20) * 1e6) / 1e6);
          }
          const n = values.length;
          out.push(`Number of values: ${n}`);
          out.push(`Min: ${n ? goFloat(Math.min(...values)) : 0}`, `Max: ${n ? goFloat(Math.max(...values)) : 0}`);
          if (n) {
            const { mean, sd } = meanStd(values);
            out.push(`Mean value: ${mean.toFixed(5)}`, `Standard deviation: ${sd.toFixed(5)}`);
            if (st.ver === `v2`) out.push(`Normalized: ${goFloatSlice(normalize(values, mean, sd))}`);
          }
        }
        qk(el, `term`).innerHTML = pblock(values.length ? `out` : `bad`, random ? `stdout (all input invalid: 10 random values, seed ${st.seed})` : `stdout`, out.join(`\n`));
        if (values.length && values.every(isFinite)) {
          const { mean, sd } = meanStd(values);
          qk(el, `plot`).innerHTML = dotPlot(values, mean, sd);
          qk(el, `stats`).innerHTML = `<div class="stat-row">${stat(`n`, values.length)}${stat(`mean`, round(mean, 4))}${stat(`σ (population)`, round(sd, 4))}${stat(`min`, round(Math.min(...values), 4))}${stat(`max`, round(Math.max(...values), 4))}</div>`;
        } else {
          qk(el, `plot`).innerHTML = note(values.length ? `Inf or NaN in the data: mean and standard deviation become NaN or Inf too.` : `No valid values to plot.`, `warn`);
          qk(el, `stats`).innerHTML = ``;
        }
        qk(el, `seedrow`).style.opacity = st.ver === `v2` ? `1` : `0.4`;
        let n;
        if (st.ver === `v1` && args.length && !values.length) n = `Every argument was rejected, so v1 prints Number of values: 0 with Min and Max still at their <strong>zero values</strong> (0) and returns before dividing by zero. v2 fixes this by generating random data.`;
        else if (random) n = `All input was invalid, so v2 fills the slice with 10 values from <code>rand.New(rand.NewSource(${st.seed}))</code>. Move the seed and back: the <strong>same seed always gives the same sequence</strong>, which is handy for tests and is exactly why math/rand must never be used for passwords or tokens. <em>(The value range is the lab's choice.)</em>`;
        else if (st.ver === `v2`) n = `z-normalization maps each value to (x − mean) / σ, so the result has mean 0 and σ 1 and different series become comparable. Watch the outlier: in the book's 16 values, 134 becomes 3.78 while everything else stays below 0.13. Values are truncated to 4 decimals with <code>math.Floor(x*10000)/10000</code>.`;
        else n = `The mean needs one pass over the data and the standard deviation a <strong>second pass</strong>, because it depends on the mean: √(Σ(x − mean)² / n). That's the population formula (divide by n), so "1 2 3" gives 0.81650, not the sample value 1. Min and max are set from the first valid value using the <code>initialized</code> flag.`;
        qk(el, `note`).innerHTML = note(n, random ? `warn` : `good`);
      };
      wireSegs(el, st, k => {
        if (k === `preset`) { text = STATS_PRESETS[st.preset]; qk(el, `args`).value = text; }
        draw();
      });
      wireRanges(el, st, { seed: v => v }, draw);
      el.querySelector(`input[data-k="args"]`).addEventListener(`input`, e => { text = e.target.value; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch2 - integer types and overflow
  // =====================================================================
  const INT_TYPES = [[`int8`, 8, true], [`int16`, 16, true], [`int32`, 32, true], [`int64`, 64, true], [`int`, 64, true], [`uint8`, 8, false], [`uint16`, 16, false], [`uint32`, 32, false], [`uint64`, 64, false], [`uint`, 64, false]];
  const TINFO = Object.fromEntries(INT_TYPES.map(([n, b, s]) => {
    const B = BigInt(b);
    return [n, { name: n, bits: b, signed: s, min: s ? -(1n << (B - 1n)) : 0n, max: s ? (1n << (B - 1n)) - 1n : (1n << B) - 1n, mod: 1n << B }];
  }));
  const wrapInt = (v, t) => { let r = ((v % t.mod) + t.mod) % t.mod; if (t.signed && r > t.max) r -= t.mod; return r; };
  const unsignedRepr = (v, t) => ((v % t.mod) + t.mod) % t.mod;
  const fmtBig = v => { const s = (v < 0n ? -v : v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, `,`); return (v < 0n ? `-` : ``) + s; };
  D.c02Overflow = {
    title: `Integer types: ranges, wrap-around and conversions`,
    blurb: `Pick an integer type and push the value past its limits. At <strong>runtime</strong> Go wraps silently in two's complement (overflows.go: <code>math.MaxInt + 1</code> becomes <code>math.MinInt</code>), while a <strong>constant</strong> that doesn't fit is a compile error. The table shows the same bits converted to every other integer type, and whether float64 can hold the value exactly.`,
    mount(el) {
      const st = { t: `int8` };
      let x = 127n, log = [];
      el.innerHTML = `
        <div class="ctl-row">${ctl(`var x`, seg(`t`, INT_TYPES.map(([n]) => [n, n]), st.t))}</div>
        <div class="ctl-row">${btn(`inc`, `x++`)}${btn(`dec`, `x--`)}${btn(`add`, `x += 100`)}${btn(`dbl`, `x *= 2`)}${btn(`shl`, `x &lt;&lt;= 1`)}${btn(`neg`, `x = -x`)}${btn(`div3`, `x /= 3`)}${btn(`divm`, `x /= -1`)}${btn(`max`, `x = max`, true)}${btn(`min`, `x = min`, true)}</div>
        <div class="ctl-row">${ctl(`const literal`, `<input class="lab-input mono" data-k="lit" value="300" style="max-width:260px">`)}${btn(`lit`, `var x T = literal`)}${btn(`clr`, `clear log`, true)}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>x in memory</h4><div data-k="val"></div><div data-k="bits"></div><div class="log" data-k="log" style="margin-top:10px"></div></div>
          <div class="lab-panel"><h4>Converting x to other types</h4><div data-k="conv"></div></div>
        </div>
        <div data-k="note"></div>`;
      const T = () => TINFO[st.t];
      const push = (code, msg, cls) => { log.unshift({ code, msg, cls }); log = log.slice(0, 12); };
      let lastWrap = false, lastErr = false;
      const apply = (code, exact) => {
        const t = T(), r = wrapInt(exact, t);
        lastWrap = r !== exact; lastErr = false;
        push(code, lastWrap ? `exact ${fmtBig(exact)} doesn't fit: wrapped to ${fmtBig(r)}` : `= ${fmtBig(r)}`, lastWrap ? `bad` : `ok`);
        x = r;
      };
      const draw = () => {
        const t = T(), u = unsignedRepr(x, t);
        const hexDigits = t.bits / 4;
        qk(el, `val`).innerHTML = `<div class="stat-row">${stat(`x (${t.name})`, fmtBig(x), lastWrap ? `bad` : ``)}${stat(`hex (bit pattern)`, `0x` + u.toString(16).toUpperCase().padStart(hexDigits, `0`))}${stat(`range`, `${fmtBig(t.min)} .. ${fmtBig(t.max)}`)}</div>`;
        const bits = u.toString(2).padStart(t.bits, `0`);
        let bh = ``;
        for (let i = 0; i < t.bits; i += 8) {
          bh += `<div class="toks" style="margin-right:8px">${bits.slice(i, i + 8).split(``).map((b, j) => tok(i + j === 0 && t.signed ? `c4 hot` : b === `1` ? `c5` : `dim`, b)).join(``)}</div>`;
        }
        qk(el, `bits`).innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px 0">${bh}</div><div class="legend">${t.signed ? `<span>${chip(`no`, `sign bit`)}</span>` : ``}<span>${chip(`ok`, `1`)}</span><span>${chip(`muted`, `0`)}</span><span>${t.bits} bits, ${t.bits / 8} byte${t.bits > 8 ? `s` : ``}</span></div>`;
        qk(el, `log`).innerHTML = log.length ? log.map(l => `<div class="${l.cls}">${esc(l.code)}  // ${esc(l.msg)}</div>`).join(``) : `<div class="info">operations appear here</div>`;
        const rows = INT_TYPES.map(([n]) => {
          const tt = TINFO[n], c = wrapInt(x, tt), same = c === x;
          return `<tr class="${n === st.t ? `new` : ``}"><td><code>${n}(x)</code></td><td class="num">${fmtBig(c)}</td><td>${n === st.t ? chip(`muted`, `itself`) : same ? chip(`ok`, `same value`) : chip(`no`, `changed`)}</td></tr>`;
        }).join(``);
        const f = Number(x), exactF = Number.isSafeInteger(f) || BigInt(f) === x;
        qk(el, `conv`).innerHTML = `<table class="mini-table"><tr><th>conversion</th><th class="num">result</th><th></th></tr>${rows}
          <tr><td><code>float64(x)</code></td><td class="num">${esc(goFloat(f))}</td><td>${exactF ? chip(`ok`, `exact`) : chip(`no`, `rounded`)}</td></tr></table>`;
        let n;
        if (lastErr) n = `That's a <strong>compile-time</strong> error: an untyped constant must be representable in the target type. The same value computed at runtime would wrap silently.`;
        else if (lastWrap) n = `The exact result doesn't fit in ${t.bits} bits, so Go keeps the low ${t.bits} bits: no panic, no error. ${t.signed ? `For signed types MaxInt + 1 = MinInt, and even <code>-MinInt</code> and <code>MinInt / -1</code> give MinInt back.` : `For unsigned types 0 - 1 wraps to the maximum.`} Guard such arithmetic with limit checks or <code>math/bits</code>.`;
        else n = `Converting between integer types keeps the low bits of the two's-complement pattern: narrowing truncates and changing signedness reinterprets the same bits, which is why <code>uint8(-1)</code> computed at runtime is 255. ${exactF ? `` : `float64 has a 53-bit mantissa, so this value can't be stored exactly.`}`;
        qk(el, `note`).innerHTML = note(n, lastWrap || lastErr ? `bad` : ``);
      };
      wireSegs(el, st, () => {
        const t = T(), r = wrapInt(x, t);
        lastWrap = r !== x; lastErr = false;
        push(`y := ${t.name}(x)`, lastWrap ? `${fmtBig(x)} becomes ${fmtBig(r)} (low ${t.bits} bits)` : `= ${fmtBig(r)}`, lastWrap ? `dup` : `ok`);
        x = r; draw();
      });
      onAct(el, a => {
        const t = T();
        if (a === `inc`) apply(`x++`, x + 1n);
        else if (a === `dec`) apply(`x--`, x - 1n);
        else if (a === `add`) apply(`x += 100`, x + 100n);
        else if (a === `dbl`) apply(`x *= 2`, x * 2n);
        else if (a === `shl`) apply(`x <<= 1`, x << 1n);
        else if (a === `neg`) apply(`x = -x`, -x);
        else if (a === `div3`) apply(`x /= 3`, x / 3n);
        else if (a === `divm`) {
          if (!t.signed) { lastErr = true; lastWrap = false; push(`x /= -1`, `compile error: cannot use -1 (untyped int constant) as ${t.name} value (overflows)`, `bad`); }
          else apply(`x /= -1`, -x);
        }
        else if (a === `max`) { x = t.max; lastWrap = false; lastErr = false; push(`x = math.Max${t.name === `int` || t.name === `uint` ? (t.signed ? `Int` : `Uint`) : (t.signed ? `Int` : `Uint`) + t.bits}`, `= ${fmtBig(x)}`, `ok`); }
        else if (a === `min`) { x = t.min; lastWrap = false; lastErr = false; push(t.signed ? `x = math.Min${t.name === `int` ? `Int` : `Int` + t.bits}` : `x = 0`, `= ${fmtBig(x)}`, `ok`); }
        else if (a === `clr`) { log = []; }
        else if (a === `lit`) {
          const raw = qk(el, `lit`).value.trim();
          const clean = raw.replace(/_/g, ``);
          let v = null;
          try { v = /^-?(0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d+)$/.test(clean) ? (clean.startsWith(`-`) ? -BigInt(clean.slice(1)) : BigInt(clean)) : null; } catch (e) { v = null; }
          if (v === null) { lastErr = true; push(`var x ${t.name} = ${raw}`, `syntax error: not an integer literal`, `bad`); }
          else if (v < t.min || v > t.max) { lastErr = true; lastWrap = false; push(`var x ${t.name} = ${raw}`, `cannot use ${raw} (untyped int constant) as ${t.name} value in variable declaration (overflows)`, `bad`); }
          else { x = v; lastErr = false; lastWrap = false; push(`var x ${t.name} = ${raw}`, `= ${fmtBig(v)}`, `ok`); }
        }
        draw();
      });
      draw();
    }
  };

  // =====================================================================
  // Ch2 - strings, bytes and runes
  // =====================================================================
  const RUNE_PRESETS = [[`Hello World! €`, `Hello World! €`], [`Byte slice €`, `Byte slice €`], [`naïve café`, `naïve café`], [`Go 🚀`, `Go 🚀`], [`日本語`, `日本語`], [`e\u0301`, `e + U+0301`]];
  function encCp(cp) {
    if (cp < 0x80) return [cp];
    if (cp < 0x800) return [0xC0 | (cp >> 6), 0x80 | (cp & 63)];
    if (cp < 0x10000) return [0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
    return [0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
  }
  function utf8Runes(s) {
    const out = [];
    let off = 0;
    for (const ch of s) {
      let cp = ch.codePointAt(0);
      if (cp >= 0xD800 && cp <= 0xDFFF) cp = 0xFFFD;
      const bytes = encCp(cp);
      out.push({ off, cp, bytes });
      off += bytes.length;
    }
    return out;
  }
  const hex2 = b => b.toString(16).toUpperCase().padStart(2, `0`);
  const uPlus = cp => `U+` + cp.toString(16).toUpperCase().padStart(4, `0`);
  const showCh = cp => cp === 0x0301 ? `◌́` : cp < 0x20 || (cp >= 0x7F && cp < 0xA0) ? `·` : String.fromCodePoint(cp);
  D.c02Runes = {
    title: `Strings, bytes and runes: what UTF-8 really stores`,
    blurb: `A Go string is a read-only sequence of <strong>bytes</strong>. <code>len</code> counts bytes, <code>s[i]</code> returns a byte, and <code>for i, r := range s</code> decodes UTF-8 into <strong>runes</strong> (int32 code points) at byte offsets. Type any text (the defaults come from text.go and byteSlices.go) and see the bytes, the runes and the classic bugs: indexing into the middle of a character, and <code>string(n)</code> vs <code>strconv.Itoa(n)</code>.`,
    mount(el) {
      const st = { preset: RUNE_PRESETS[0][0], k: 0, n: 8364 };
      let text = st.preset;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`s :=`, seg(`preset`, RUNE_PRESETS, st.preset))}</div>
        <div class="ctl-row">${ctl(`or type`, `<input class="lab-input" data-k="txt" value="${esc(text)}">`)}</div>
        <div data-k="stats"></div>
        <div class="lab-panel"><h4>[]byte(s): one box per byte, coloured by the rune it belongs to</h4><div class="bytes" data-k="bytes"></div></div>
        <div class="lab-grid" style="margin-top:12px">
          <div class="lab-panel"><h4>for i, r := range s</h4><div class="scroll-y" data-k="range"></div></div>
          <div class="lab-panel"><h4>s[k]: indexing gives a byte</h4><div class="ctl-row" data-k="krow"></div><div data-k="kout"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>Converting an integer n to a string</h4><div class="ctl-row">${ctl(`n`, seg(`n`, [[65, `65`], [100, `100`], [8364, `8364`], [128640, `128640`], [-1, `-1`], [55296, `0xD800`], [1114112, `0x110000`]], st.n))}</div><div data-k="conv"></div></div>
        <div data-k="note"></div>`;
      const drawK = len => {
        const krow = qk(el, `krow`);
        st.k = clamp(st.k, 0, Math.max(0, len - 1));
        krow.innerHTML = len ? ctl(`k`, rng(`k`, 0, len - 1, 1, st.k)) : ``;
        const inp = krow.querySelector(`input`);
        if (inp) {
          const rv = krow.querySelector(`[data-rv="k"]`);
          rv.textContent = st.k;
          inp.addEventListener(`input`, () => { st.k = +inp.value; rv.textContent = st.k; draw(false); });
        }
      };
      const draw = rebuildK => {
        const runes = utf8Runes(text);
        const bytes = [];
        runes.forEach((r, ri) => r.bytes.forEach(b => bytes.push({ b, ri })));
        if (rebuildK) drawK(bytes.length);
        const seg8 = typeof Intl !== `undefined` && Intl.Segmenter ? [...new Intl.Segmenter().segment(text)].length : null;
        qk(el, `stats`).innerHTML = `<div class="stat-row">${stat(`len(s) bytes`, bytes.length)}${stat(`utf8.RuneCountInString`, runes.length)}${stat(`len([]rune(s))`, runes.length)}${seg8 !== null ? stat(`user-visible characters`, seg8) : ``}${stat(`ASCII only?`, bytes.every(x => x.b < 0x80) ? `yes` : `no`)}</div>`;
        qk(el, `bytes`).innerHTML = bytes.length ? bytes.map((x, i) => `<div class="byte c${x.ri % 6}${i === st.k ? ` hot` : ``}" title="byte ${i} = ${x.b}">${hex2(x.b)}<small>${i}</small></div>`).join(``) : `<span class="chip muted">empty string: len 0</span>`;
        qk(el, `range`).innerHTML = `<table class="mini-table"><tr><th class="num">i</th><th>%U</th><th>%c</th><th class="num">%d</th><th>UTF-8 bytes</th><th class="num">width</th></tr>${runes.map((r, ri) => `<tr${r.bytes.length > 1 ? ` class="new"` : ``}><td class="num">${r.off}</td><td>${uPlus(r.cp)}</td><td><span class="tok c${ri % 6}">${esc(showCh(r.cp))}</span></td><td class="num">${r.cp}</td><td class="mono">${r.bytes.map(hex2).join(` `)}</td><td class="num">${r.bytes.length}</td></tr>`).join(``)}</table>`;
        if (bytes.length) {
          const b = bytes[st.k].b;
          const kind = b < 0x80 ? `ASCII byte: a whole character` : b >= 0xC0 ? `lead byte of a ${b >= 0xF0 ? 4 : b >= 0xE0 ? 3 : 2}-byte sequence` : `continuation byte (10xxxxxx): the middle of a character`;
          qk(el, `kout`).innerHTML = `<table class="mini-table">
            <tr><td><code>s[${st.k}]</code></td><td class="mono">${b} (0x${hex2(b)}), type byte</td></tr>
            <tr><td>kind</td><td>${b < 0x80 ? chip(`ok`, kind) : b >= 0xC0 ? chip(`final`, kind) : chip(`no`, kind)}</td></tr>
            <tr><td><code>string(s[${st.k}])</code></td><td>"${esc(showCh(b))}" ${b < 0x80 ? chip(`ok`, `matches`) : chip(`no`, `${uPlus(b)}, not your text`)}</td></tr>
            <tr><td><code>s[${st.k}:]</code> valid UTF-8?</td><td>${b >= 0x80 && b < 0xC0 ? chip(`no`, `no: range yields U+FFFD first`) : chip(`ok`, `yes`)}</td></tr>
          </table>`;
        } else qk(el, `kout`).innerHTML = note(`Indexing an empty string panics: index out of range [0] with length 0.`, `bad`);
        const n = st.n, valid = n >= 0 && n <= 0x10FFFF && !(n >= 0xD800 && n <= 0xDFFF);
        const cp = valid ? n : 0xFFFD, enc = encCp(cp);
        qk(el, `conv`).innerHTML = `<table class="mini-table">
          <tr><th>expression</th><th>result</th></tr>
          <tr><td><code>string(rune(${n}))</code></td><td>"${esc(String.fromCodePoint(cp))}" ${valid ? chip(`ok`, uPlus(n)) : chip(`no`, `invalid code point: U+FFFD`)} bytes [${enc.join(` `)}]</td></tr>
          <tr><td><code>strconv.Itoa(${n})</code></td><td>"${n}" (${String(n).length} bytes)</td></tr>
          <tr><td><code>fmt.Printf("%c / %U / %q", r, r, r)</code></td><td>${esc(String.fromCodePoint(cp))} / ${uPlus(cp)} / '${esc(String.fromCodePoint(cp))}'</td></tr>
          <tr><td><code>fmt.Printf("%s", r)</code></td><td class="mono">%!s(int32=${n})</td></tr>
        </table>`;
        const multi = runes.filter(r => r.bytes.length > 1).length;
        let msg = multi
          ? `${multi} of the ${runes.length} runes need more than one byte, so the byte length (${bytes.length}) is bigger than the rune count. Ranging gives byte offsets: notice how <code>i</code> jumps after a multi-byte rune. To index characters, convert to <code>[]rune(s)</code> (which allocates a copy) or use <code>utf8.DecodeRuneInString</code>.`
          : `Pure ASCII: one byte per rune, so <code>len(s)</code> equals the rune count and indexing happens to work. Add a € or an emoji to see where it breaks.`;
        if (text === `e\u0301`) msg += ` Here two runes (e + combining acute accent) render as one visible character: runes are code points, not user-perceived characters (grapheme clusters).`;
        msg += ` <code>string(${n})</code> builds a character, while <code>strconv.Itoa</code> builds digits; <code>go vet</code> flags <code>string(int)</code> for this reason.`;
        qk(el, `note`).innerHTML = note(msg, multi ? `warn` : `good`);
      };
      wireSegs(el, st, k => {
        if (k === `preset`) { text = st.preset; qk(el, `txt`).value = text; st.k = 0; draw(true); }
        else draw(false);
      });
      qk(el, `txt`).addEventListener(`input`, e => { text = e.target.value; draw(true); });
      draw(true);
    }
  };

  // =====================================================================
  // Ch2 - slices: len, cap, append, shared backing arrays
  // =====================================================================
  const SIZE_CLASSES = [0, 8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 352, 384, 416, 448, 480, 512, 576, 640, 704, 768, 896, 1024, 1152, 1280, 1408, 1536, 1792, 2048, 2304, 2688, 3072, 3200, 3456, 4096, 4864, 5376, 6144, 6528, 6784, 6912, 8192, 9472, 9728, 10240, 10880, 12288, 13568, 14336, 16384, 18432, 19072, 20480, 21760, 24576, 27264, 28672, 32768];
  function roundupsize(n) {
    if (n <= 32768) { for (const c of SIZE_CLASSES) if (c >= n) return c; }
    return Math.ceil(n / 8192) * 8192;
  }
  function growRuntime(oldCap, newLen, es) {
    let newcap = oldCap;
    const dbl = newcap * 2;
    if (newLen > dbl) newcap = newLen;
    else if (oldCap < 256) newcap = dbl;
    else { while (newcap < newLen) newcap += Math.floor((newcap + 3 * 256) / 4); }
    return Math.floor(roundupsize(newcap * es) / es);
  }
  function growBook(oldCap, newLen) { let c = Math.max(1, oldCap * 2); while (c < newLen) c *= 2; return c; }
  function capSequence(rule, es, upTo) {
    const caps = [];
    let cap = 0;
    for (let len = 1; len <= upTo; len++) {
      if (len > cap) { cap = rule === `rt` ? growRuntime(cap, len, es) : growBook(cap, len); caps.push(cap); }
    }
    return caps;
  }
  D.c02Slices = {
    title: `Slices: length, capacity, append and shared backing arrays`,
    blurb: `A slice is a header {pointer, len, cap} over a backing array. Replay the book's <strong>sliceArrays.go</strong> step by step, or drive it yourself: reslice the array <code>a</code>, append, write through a slice or through the array. Cells marked <strong>len</strong> are visible through a slice; cells marked <strong>cap</strong> are spare room that the next <code>append</code> will overwrite <em>in place</em>. Once the capacity runs out, <code>append</code> copies everything to a new array and the connection to <code>a</code> is gone. The bottom panel compares the book's "capacity doubles" rule with the real runtime growth formula.`,
    mount(el, ctx) {
      const ES = 16;
      const st = { tgt: `S0`, rule: `rt`, lo: 0, hi: 1, max: 4, full: `no`, k: 0, es: 8 };
      let S, timer = null;
      const fresh = () => ({ arrays: [{ id: 1, cells: [`Zero`, `One`, `Two`, `Three`] }], vars: { S0: null, S12: null }, nextId: 2, nA: 0, nX: 0, log: [], step: 0, garbage: 0 });
      S = fresh();
      const arrOf = id => S.arrays.find(a => a.id === id);
      const fmtSlice = h => h ? `[` + arrOf(h.arr).cells.slice(h.off, h.off + h.len).join(` `) + `]` : `[]`;
      const push = (code, msg, cls) => { S.log.unshift({ code, msg, cls }); S.log = S.log.slice(0, 16); };
      const viewers = (arrId, idx, except) => {
        const v = [];
        if (arrId === 1 && except !== `a`) v.push(`a`);
        Object.entries(S.vars).forEach(([n, h]) => { if (n !== except && h && h.arr === arrId && idx >= h.off && idx < h.off + h.len) v.push(n); });
        return v;
      };
      const doReslice = (name, lo, hi, max) => {
        const code = `${name} = a[${lo}:${hi}${max !== null ? `:` + max : ``}]`;
        if (hi < lo) return push(code, `invalid slice indices: ${hi} < ${lo}`, `bad`);
        if (max !== null && max < hi) return push(code, `invalid slice indices: ${max} < ${hi}`, `bad`);
        const prev = S.vars[name];
        if (prev && prev.arr !== 1) S.garbage++;
        S.vars[name] = { arr: 1, off: lo, len: hi - lo, cap: (max !== null ? max : 4) - lo };
        push(code, `len ${hi - lo}, cap ${(max !== null ? max : 4) - lo}: shares a's array`, `ok`);
      };
      const doSet = (name, i, val) => {
        const h = S.vars[name], code = `${name}[${i}] = "${val}"`;
        if (!h || i >= h.len) return push(code, `panic: runtime error: index out of range [${i}] with length ${h ? h.len : 0}`, `bad`);
        arrOf(h.arr).cells[h.off + i] = val;
        const others = viewers(h.arr, h.off + i, name);
        push(code, others.length ? `also visible through ${others.join(`, `)}` : `only ${name} sees this cell`, others.length ? `dup` : `ok`);
      };
      const doSetA = (k, val) => {
        arrOf(1).cells[k] = val;
        const others = viewers(1, k, `a`);
        push(`a[${k}] = "${val}"`, others.length ? `visible through ${others.join(`, `)}` : `no slice looks at a[${k}] any more`, others.length ? `dup` : `ok`);
      };
      const doAppend = (name, val) => {
        const code = `${name} = append(${name}, "${val}")`;
        let h = S.vars[name];
        if (!h) { h = { arr: null, off: 0, len: 0, cap: 0 }; }
        if (h.arr !== null && h.len < h.cap) {
          const idx = h.off + h.len, arr = arrOf(h.arr);
          const clobbered = viewers(h.arr, idx, name);
          const old = arr.cells[idx];
          arr.cells[idx] = val;
          S.vars[name] = { ...h, len: h.len + 1 };
          push(code, `len ${h.len + 1}, cap ${h.cap}: written in place at array #${h.arr}[${idx}]` + (clobbered.length ? `, overwriting "${old}" seen by ${clobbered.join(`, `)}` : ``), clobbered.length ? `bad` : `ok`);
          return;
        }
        const newLen = h.len + 1;
        const ncap = st.rule === `rt` ? growRuntime(h.cap, newLen, ES) : growBook(h.cap, newLen);
        const cells = h.arr !== null ? arrOf(h.arr).cells.slice(h.off, h.off + h.len) : [];
        cells.push(val);
        while (cells.length < ncap) cells.push(``);
        const id = S.nextId++;
        S.arrays.push({ id, cells });
        if (h.arr !== null && h.arr !== 1) S.garbage++;
        S.vars[name] = { arr: id, off: 0, len: newLen, cap: ncap };
        push(code, `cap ${h.cap} is full: new array #${id} with cap ${ncap}, ${h.len} element${h.len === 1 ? `` : `s`} copied. ${name} no longer shares memory with ${h.arr === 1 ? `a` : `its old array`}`, `info`);
      };
      const SCRIPT = [
        [`S0 := a[0:1]`, () => doReslice(`S0`, 0, 1, null)],
        [`S0[0] = "S0"`, () => doSet(`S0`, 0, `S0`)],
        [`S12 := a[1:3]`, () => doReslice(`S12`, 1, 3, null)],
        [`S12[0] = "S12_0"`, () => doSet(`S12`, 0, `S12_0`)],
        [`S12[1] = "S12_1"`, () => doSet(`S12`, 1, `S12_1`)],
        [`change(S12)`, () => doSet(`S12`, 0, `Change_function`)],
        [`S0 = append(S0, "N1")`, () => doAppend(`S0`, `N1`)],
        [`S0 = append(S0, "N2")`, () => doAppend(`S0`, `N2`)],
        [`S0 = append(S0, "N3")`, () => doAppend(`S0`, `N3`)],
        [`a[0] = "-N1"`, () => doSetA(0, `-N1`)],
        [`S0 = append(S0, "N4")`, () => doAppend(`S0`, `N4`)],
        [`a[0] = "-N1-"`, () => doSetA(0, `-N1-`)],
        [`a[1] = "-N2-"`, () => doSetA(1, `-N2-`)]
      ];
      const stopTimer = () => { if (timer !== null) { ctx.clear(timer); timer = null; } };
      const stepOnce = () => { if (S.step < SCRIPT.length) { SCRIPT[S.step][1](); S.step++; } if (S.step >= SCRIPT.length) stopTimer(); draw(); };
      el.innerHTML = `
        <div class="ctl-row">${btn(`play`, `&#9654; play sliceArrays.go`)}${btn(`step`, `step`, true)}${btn(`reset`, `reset`, true)}<span data-k="prog" style="font-size:12px;color:var(--text-muted)"></span></div>
        <div class="ctl-row">${ctl(`slice`, seg(`tgt`, [[`S0`, `S0`], [`S12`, `S12`]], st.tgt))}${btn(`app`, `append`)}${btn(`set0`, `[0] = "X…"`)}${ctl(`append growth`, seg(`rule`, [[`rt`, `runtime (Go 1.20+)`], [`book`, `book: doubles`]], st.rule))}</div>
        <div class="ctl-row">${ctl(`lo`, rng(`lo`, 0, 4, 1, st.lo))}${ctl(`hi`, rng(`hi`, 0, 4, 1, st.hi))}</div>
        <div class="ctl-row">${ctl(`max`, rng(`max`, 0, 4, 1, st.max))}${ctl(`form`, seg(`full`, [[`no`, `a[lo:hi]`], [`yes`, `a[lo:hi:max]`]], st.full))}${btn(`slice`, `slice = a[...]`)}</div>
        <div class="ctl-row">${ctl(`k`, rng(`k`, 0, 3, 1, st.k))}${btn(`seta`, `a[k] = "A…"`)}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Backing arrays</h4><div data-k="arrays"></div><div data-k="hdrs"></div></div>
          <div class="lab-panel"><h4>fmt.Println</h4><div data-k="print"></div><h4 style="margin-top:10px">Statements</h4><div class="log" data-k="log"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>Capacity after each reallocation, appending one element at a time to an empty slice</h4>
          <div class="ctl-row">${ctl(`element size`, seg(`es`, [[1, `1 B (byte)`], [8, `8 B (int)`], [16, `16 B (string)`], [24, `24 B ([]T)`]], st.es))}</div>
          <div data-k="growth"></div></div>
        <div data-k="note"></div>`;
      const marker = (h, idx) => !h ? `` : idx >= h.off && idx < h.off + h.len ? chip(`ok`, `len`) : idx >= h.off + h.len && idx < h.off + h.cap ? chip(`muted`, `cap`) : ``;
      const draw = () => {
        qk(el, `prog`).textContent = S.step ? `sliceArrays.go: ${S.step}/${SCRIPT.length} statements` + (S.step < SCRIPT.length ? `, next: ${SCRIPT[S.step][0]}` : `, done`) : `next: ${SCRIPT[0][0]}`;
        const live = S.arrays.filter(a => a.id === 1 || Object.values(S.vars).some(h => h && h.arr === a.id));
        qk(el, `arrays`).innerHTML = live.map(a => {
          const names = Object.entries(S.vars).filter(([, h]) => h && h.arr === a.id);
          const cellCls = i => {
            const inS0 = S.vars.S0 && S.vars.S0.arr === a.id && i >= S.vars.S0.off && i < S.vars.S0.off + S.vars.S0.len;
            const inS12 = S.vars.S12 && S.vars.S12.arr === a.id && i >= S.vars.S12.off && i < S.vars.S12.off + S.vars.S12.len;
            return inS0 && inS12 ? `c3 hot` : inS0 ? `c1` : inS12 ? `c2` : a.id === 1 ? `c0` : `dim`;
          };
          return `<div style="margin-bottom:10px" class="scroll-x"><table class="mini-table">
            <tr><th>${a.id === 1 ? `a ([4]string)` : `array #${a.id} (append)`}</th>${a.cells.map((_, i) => `<th>${i}</th>`).join(``)}</tr>
            <tr><td>value</td>${a.cells.map((c, i) => `<td>${tok(cellCls(i), c === `` ? `""` : c)}</td>`).join(``)}</tr>
            ${names.map(([n, h]) => `<tr><td>${n}</td>${a.cells.map((_, i) => `<td>${marker(h, i)}</td>`).join(``)}</tr>`).join(``)}
          </table></div>`;
        }).join(``) + (S.garbage ? `<div class="legend"><span>${S.garbage} old array${S.garbage > 1 ? `s` : ``} no longer referenced: garbage for the GC</span></div>` : ``);
        qk(el, `hdrs`).innerHTML = `<div class="stat-row">${[`S0`, `S12`].map(n => { const h = S.vars[n]; return stat(n + ` header`, h ? `${h.arr === 1 ? `&amp;a` : `&amp;#` + h.arr}[${h.off}] len ${h.len} cap ${h.cap}` : `nil`); }).join(``)}</div>`;
        qk(el, `print`).innerHTML = pblock(`out`, `output`, `a:   [${arrOf(1).cells.join(` `)}]\nS0:  ${fmtSlice(S.vars.S0)}   len ${S.vars.S0 ? S.vars.S0.len : 0} cap ${S.vars.S0 ? S.vars.S0.cap : 0}\nS12: ${fmtSlice(S.vars.S12)}   len ${S.vars.S12 ? S.vars.S12.len : 0} cap ${S.vars.S12 ? S.vars.S12.cap : 0}`);
        qk(el, `log`).innerHTML = S.log.length ? S.log.map(l => `<div class="${l.cls}">${esc(l.code)}  // ${esc(l.msg)}</div>`).join(``) : `<div class="info">press play, or use the controls</div>`;
        const rt = capSequence(`rt`, st.es, 3000), bk = capSequence(`book`, st.es, 3000);
        qk(el, `growth`).innerHTML = `<div style="font-size:12px;margin-bottom:4px">runtime (growslice + size classes)</div><div class="toks" style="margin-bottom:8px">${rt.map(c => tok(c >= 256 ? `c2` : `c0`, c)).join(``)}</div>
          <div style="font-size:12px;margin-bottom:4px">book's rule of thumb (doubling)</div><div class="toks">${bk.map(c => tok(`c1`, c)).join(``)}</div>
          <div class="stat-row">${stat(`reallocations to reach len 3000 (runtime)`, rt.length)}${stat(`(doubling)`, bk.length)}${stat(`final cap (runtime)`, rt[rt.length - 1])}${stat(`final cap (doubling)`, bk[bk.length - 1])}</div>`;
        const last = S.log[0];
        let n;
        if (!last) n = `<code>a</code> is an array: a fixed block of 4 strings. Slicing it creates headers that point <em>into</em> it, without copying anything.`;
        else if (last.cls === `bad` && last.msg.includes(`overwriting`)) n = `<strong>Aliasing bug:</strong> the slice had spare capacity, so <code>append</code> wrote straight into the shared array and replaced an element that another slice (or <code>a</code>) can see. Use a full slice expression <code>a[lo:hi:hi]</code> to set cap = len and force the next append to copy.`;
        else if (last.cls === `info`) n = `Reallocation: the new array has a bigger capacity (${st.rule === `rt` ? `runtime rule: double below 256 elements, then about 1.25x + 192, rounded up to a malloc size class` : `book rule: double`}). From now on, writes through this slice and writes to the old array don't affect each other. That's why <code>append</code> returns a slice that you must assign.`;
        else if (last.cls === `dup`) n = `Same memory, two names: a slice is a view, so the write shows up everywhere that cell is visible.`;
        else if (last.cls === `bad`) n = `That statement fails. Slice bounds must satisfy 0 &lt;= lo &lt;= hi &lt;= max &lt;= cap, and you can only index below len.`;
        else n = `A sub-slice <code>a[lo:hi]</code> has len hi-lo and cap ${`cap(a)`}-lo: it can grow into the rest of the array without reallocating.`;
        qk(el, `note`).innerHTML = note(n, last && last.cls === `bad` ? `bad` : last && last.cls === `info` ? `good` : ``);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { lo: v => v, hi: v => v, max: v => v, k: v => v }, () => {});
      onAct(el, a => {
        if (a === `play`) { stopTimer(); if (S.step >= SCRIPT.length) S = fresh(); timer = ctx.every(stepOnce, 1100); stepOnce(); return; }
        if (a === `step`) { stopTimer(); stepOnce(); return; }
        stopTimer();
        if (a === `reset`) S = fresh();
        else if (a === `app`) doAppend(st.tgt, `N` + (++S.nA));
        else if (a === `set0`) doSet(st.tgt, 0, `X` + (++S.nX));
        else if (a === `seta`) doSetA(st.k, `A` + (++S.nX));
        else if (a === `slice`) doReslice(st.tgt, st.lo, st.hi, st.full === `yes` ? st.max : null);
        draw();
      });
      ctx.onCleanup(stopTimer);
      draw();
    }
  };

  // =====================================================================
  // Ch3 - maps: comma ok, nil maps, random iteration order
  // =====================================================================
  function fnv1a(s, seed) {
    let h = (0x811c9dc5 ^ seed) >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  D.c03Maps = {
    title: `Maps: comma ok, nil maps and random iteration`,
    blurb: `A <code>map[string]int</code> you can poke at. Missing keys return the <strong>zero value</strong> without complaint, <code>v, ok := m[k]</code> tells you whether the key really exists, a <strong>nil map</strong> can be read but panics on write (nilMap.go), and every <code>range</code> loop starts at a random bucket and offset, so the order changes from run to run. The bucket view shows the classic Go map layout (8 slots per bucket, grow at an average load of 6.5).`,
    mount(el) {
      const st = { init: `lit`, qkey: `key1`, val: 0 };
      let key = `key1`, M, log = [], iters = [], crashed = false;
      const rnd = mulberry32((Date.now() & 0xffff) + 17);
      const newMap = () => ({ seed: Math.floor(rnd() * 2 ** 31), B: 0, buckets: [new Array(8).fill(null)], data: new Map() });
      const place = (m, k) => {
        const b = fnv1a(k, m.seed) & ((1 << m.B) - 1), slots = m.buckets[b];
        const i = slots.indexOf(null);
        if (i >= 0) slots[i] = k; else slots.push(k);
      };
      const grow = m => {
        const keys = [];
        m.buckets.forEach(bk => bk.forEach(k => { if (k !== null) keys.push(k); }));
        m.B++;
        m.buckets = Array.from({ length: 1 << m.B }, () => new Array(8).fill(null));
        keys.forEach(k => place(m, k));
      };
      const put = (m, k, v) => {
        if (!m.data.has(k)) { if (m.data.size + 1 > 6.5 * (1 << m.B)) grow(m); place(m, k); }
        m.data.set(k, v);
      };
      const del = (m, k) => {
        if (!m.data.has(k)) return false;
        m.data.delete(k);
        m.buckets.forEach(bk => { const i = bk.indexOf(k); if (i >= 0) bk[i] = null; });
        return true;
      };
      const init = () => {
        crashed = false; log = []; iters = [];
        if (st.init === `nil`) { M = null; log.push({ code: `var m map[string]int`, msg: `m == nil: no hash table allocated`, cls: `info` }); }
        else {
          M = newMap();
          if (st.init === `lit`) { put(M, `key1`, -1); put(M, `key2`, 123); log.push({ code: `m := map[string]int{"key1": -1, "key2": 123}`, msg: `len 2`, cls: `ok` }); }
          else log.push({ code: `m := make(map[string]int)`, msg: `empty but ready for writes`, cls: `ok` });
        }
      };
      init();
      const push = (code, msg, cls) => { log.unshift({ code, msg, cls }); log = log.slice(0, 14); };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`start with`, seg(`init`, [[`lit`, `map literal`], [`make`, `make(map[string]int)`], [`nil`, `var m map[string]int (nil)`]], st.init))}</div>
        <div class="ctl-row">${ctl(`k`, `<input class="lab-input mono" data-k="key" value="${esc(key)}" style="max-width:150px">`)}${seg(`qkey`, [[`key1`, `key1`], [`key2`, `key2`], [`test`, `test`], [`zero`, `zero`], [`missing`, `missing`]], st.qkey)}${ctl(`v`, rng(`val`, -5, 200, 1, st.val))}</div>
        <div class="ctl-row">${btn(`set`, `m[k] = v`)}${btn(`get`, `v := m[k]`)}${btn(`getok`, `v, ok := m[k]`)}${btn(`del`, `delete(m, k)`)}${btn(`len`, `len(m)`)}${btn(`range`, `for k, v := range m`)}${btn(`print`, `fmt.Println(m)`)}</div>
        <div class="ctl-row">${btn(`fill`, `add 10 words`, true)}${btn(`nil`, `m = nil`, true)}${btn(`remake`, `m = map[string]int{}`, true)}${btn(`restart`, `restart program`, true)}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Program output</h4><div data-k="crash"></div><div class="log" data-k="log"></div></div>
          <div class="lab-panel"><h4>Inside the map</h4><div data-k="buckets"></div><h4 style="margin-top:10px">Last range loops</h4><div data-k="iters"></div></div>
        </div>
        <div data-k="note"></div>`;
      let lastAct = `init`;
      const fmtMap = () => `map[` + (M ? [...M.data.keys()].sort().map(k => `${k}:${M.data.get(k)}`).join(` `) : ``) + `]`;
      const draw = () => {
        el.querySelectorAll(`[data-act]`).forEach(b => { if (b.dataset.act !== `restart`) b.disabled = crashed; });
        qk(el, `crash`).innerHTML = crashed ? pblock(`bad`, `program crashed, exit status 2`, `panic: assignment to entry in nil map\n\ngoroutine 1 [running]:\nmain.main()\n\t/Users/mtsouk/mGo4th/code/ch03/nilMap.go:21 +0x17c\nexit status 2`) : ``;
        qk(el, `log`).innerHTML = log.map(l => `<div class="${l.cls}">${esc(l.code)}${l.msg ? `  // ` + esc(l.msg) : ``}</div>`).join(``);
        if (!M) qk(el, `buckets`).innerHTML = `<div class="stat-row">${stat(`m`, `nil`, `bad`)}${stat(`len(m)`, 0)}</div>` + note(`No buckets: a nil map has no hash table. Reads, len, delete and range all work; writes panic.`, `warn`);
        else {
          const nb = 1 << M.B;
          qk(el, `buckets`).innerHTML = `<div class="stat-row">${stat(`len(m)`, M.data.size)}${stat(`B (2^B buckets)`, `${M.B} (${nb})`)}${stat(`load`, round(M.data.size / nb, 2))}${stat(`hash seed`, `0x` + M.seed.toString(16))}</div>
            <div class="scroll-y" style="max-height:220px"><table class="mini-table"><tr><th>bucket</th><th>slots (0-7, then overflow)</th></tr>${M.buckets.map((bk, i) => `<tr><td class="num">${i}</td><td><div class="toks">${bk.map(k => k === null ? tok(`dim`, `·`) : tok(k === key ? `c2 hot` : `c0`, `${k}:${M.data.get(k)}`)).join(``)}</div></td></tr>`).join(``)}</table></div>`;
        }
        qk(el, `iters`).innerHTML = iters.length ? iters.map((it, i) => `<div style="margin-bottom:5px"><div style="font-size:11px;color:var(--text-muted)">run ${it.n}: start bucket ${it.b}, offset ${it.o}</div><div class="toks">${it.keys.length ? it.keys.map((k, j) => tok(`c${j % 6}${i === 0 ? `` : ` dim`}`, k)).join(``) : tok(`dim`, `(no iterations)`)}</div></div>`).join(``) : `<span class="chip muted">press "for k, v := range m" a few times</span>`;
        let n;
        if (crashed) n = `Writing to a nil map panics: there is no hash table to insert into. Reads were fine, and that's what makes this bug easy to miss. Fix it with <code>m = make(map[string]int)</code> or a literal, and check maps passed into functions (or stored in struct fields) before writing.`;
        else if (lastAct === `range`) n = `Each <code>range</code> starts at a random bucket and a random slot offset (and every map has its own hash seed), so the order differs between loops over the <em>same</em> map. For a stable order, sort the keys: <code>slices.Sorted(maps.Keys(m))</code> (Go 1.23). Since Go 1.24 maps are Swiss tables internally, but iteration order is still randomized. <code>fmt.Println</code>, by contrast, prints keys sorted.`;
        else if (lastAct === `get`) n = `A missing key is not an error: <code>m[k]</code> quietly returns the zero value (0 for int). That can't distinguish "absent" from "stored 0", which is what comma ok is for.`;
        else if (lastAct === `getok`) n = `<code>ok</code> is the only reliable presence test. Try the key <code>zero</code> after storing 0 in it: the plain read and the missing-key read look identical, while ok differs.`;
        else if (lastAct === `fill`) n = `Once the average load would exceed 6.5 keys per bucket, the map doubles its bucket count and rehashes (Go does this incrementally). The bucket a key lands in depends on the per-map random seed.`;
        else n = `Keys must be comparable (strings, numbers, structs of comparable fields...), never slices, maps or functions. Maps aren't safe for concurrent writes: guard them with a mutex.`;
        qk(el, `note`).innerHTML = note(n, crashed ? `bad` : lastAct === `range` ? `warn` : ``);
      };
      const syncKey = v => { key = v; qk(el, `key`).value = v; };
      wireSegs(el, st, k => { if (k === `init`) { init(); lastAct = `init`; } if (k === `qkey`) syncKey(st.qkey); draw(); });
      wireRanges(el, st, { val: v => v }, () => {});
      qk(el, `key`).addEventListener(`input`, e => { key = e.target.value; draw(); });
      onAct(el, a => {
        const k = key, v = st.val, ks = JSON.stringify(k);
        lastAct = a;
        if (a === `restart`) { init(); lastAct = `init`; }
        else if (a === `set`) {
          if (!M) { push(`m[${ks}] = ${v}`, ``, `bad`); crashed = true; }
          else { const had = M.data.has(k); put(M, k, v); push(`m[${ks}] = ${v}`, had ? `overwrote existing key` : `inserted, len ${M.data.size}`, `ok`); }
        }
        else if (a === `get`) { const has = M && M.data.has(k); push(`v := m[${ks}]`, `v = ${has ? M.data.get(k) : 0}${has ? `` : `  (missing key: zero value, no error)`}`, has ? `ok` : `dup`); }
        else if (a === `getok`) { const has = M && M.data.has(k); push(`v, ok := m[${ks}]`, `v = ${has ? M.data.get(k) : 0}, ok = ${!!has}`, has ? `ok` : `dup`); }
        else if (a === `del`) { const had = M ? del(M, k) : false; push(`delete(m, ${ks})`, had ? `removed, len ${M.data.size}` : `key not present: no-op${M ? `` : ` (nil map is fine too)`}`, had ? `ok` : `info`); }
        else if (a === `len`) push(`len(m)`, `= ${M ? M.data.size : 0}`, `ok`);
        else if (a === `print`) push(`fmt.Println(m)`, fmtMap() + `  (fmt sorts keys)`, `info`);
        else if (a === `nil`) { M = null; push(`m = nil`, `old map unreachable; reads still work, writes will panic`, `dup`); }
        else if (a === `remake`) { M = newMap(); push(`m = map[string]int{}`, `fresh empty map with a new hash seed`, `ok`); }
        else if (a === `fill`) {
          if (!M) { push(`m["alpha"] = 1`, ``, `bad`); crashed = true; }
          else {
            const W = [`alpha`, `bravo`, `charlie`, `delta`, `echo`, `foxtrot`, `golf`, `hotel`, `india`, `juliet`, `kilo`, `lima`, `mike`, `november`, `oscar`, `papa`, `quebec`, `romeo`, `sierra`, `tango`, `uniform`, `victor`, `whiskey`, `xray`, `yankee`, `zulu`];
            let added = 0;
            for (const w of W) { if (added >= 10) break; if (!M.data.has(w)) { put(M, w, w.length); added++; } }
            push(`for _, w := range words { m[w] = len(w) }`, `${added} keys added, len ${M.data.size}, B = ${M.B}`, `ok`);
          }
        }
        else if (a === `range`) {
          const keys = [];
          let b0 = 0, o = 0;
          if (M && M.data.size) {
            const nb = 1 << M.B;
            b0 = Math.floor(rnd() * nb); o = Math.floor(rnd() * 8);
            for (let i = 0; i < nb; i++) {
              const bk = M.buckets[(b0 + i) % nb];
              for (let j = 0; j < 8; j++) { const kk = bk[(j + o) & 7]; if (kk !== null) keys.push(kk); }
              for (let j = 8; j < bk.length; j++) if (bk[j] !== null) keys.push(bk[j]);
            }
          }
          iters.unshift({ n: (iters[0] ? iters[0].n : 0) + 1, b: b0, o, keys });
          iters = iters.slice(0, 4);
          push(`for k, v := range m`, keys.length ? keys.map(kk => `${kk}:${M.data.get(kk)}`).join(` `) : `no iterations`, `info`);
        }
        draw();
      });
      draw();
    }
  };

  // =====================================================================
  // Ch3 - regexp tester (RE2 rules)
  // =====================================================================
  const RE_PRESETS = {
    name: [`^[A-Z][a-z]*$`, `Z\nZA\nMihalis\nJo+\nmihalis\nO'Brien`],
    int: [`^[-+]?\\d+$`, `123\n/123\n+123.2\n+\n-123.2\n-42\n99999999999999999999`],
    uint: [`^[+]?\\d+$`, `123\n+7\n-42\n007`],
    look: [`^.*(?=.{7,})(?=.*\\d)$`, `password1\nshort1\nnodigitshere`],
    back: [`(\\w+) \\1`, `hello hello\nhello world`],
    find: [`\\d+`, `a123b\nno digits\n10 apples and 20 pears`]
  };
  function goRegexp(pat) {
    let m;
    const noEsc = pat.replace(/\\\\/g, `__`);
    const bare = noEsc.replace(/\\./g, `__`).replace(/\[\^?\]?[^\]]*\]/g, `_`);
    if ((m = bare.match(/\(\?<?[=!]/))) return { err: `error parsing regexp: invalid or unsupported Perl syntax: \`${m[0].slice(0, 3)}\`` };
    if ((m = noEsc.match(/\\[1-9]/))) return { err: `error parsing regexp: invalid escape sequence: \`${m[0]}\`` };
    if ((m = bare.match(/[*+?}][+*]/))) return { err: `error parsing regexp: invalid nested repetition operator: \`${m[0]}\`` };
    let src = pat, flags = ``;
    const fm = src.match(/^\(\?([imsU]+)\)/);
    if (fm) {
      if (fm[1].includes(`U`)) return { err: `lab limitation: the (?U) flag is not simulated` };
      src = src.slice(fm[0].length);
      flags = fm[1].replace(/U/g, ``);
    }
    src = src.replace(/\(\?P</g, `(?<`).replace(/\\A/g, `^`).replace(/\\z/g, `$`);
    if (/\\[pP]/.test(src)) { src = src.replace(/\\([pP])([A-Za-z])/g, `\\$1{$2}`); flags += `u`; }
    try { return { re: new RegExp(src, flags), src, flags }; }
    catch (e) { return { err: `error parsing regexp: ${String(e.message).replace(/^Invalid regular expression: /, ``)}` }; }
  }
  D.c03Regexp = {
    title: `Regular expressions: Compile, MustCompile and RE2`,
    blurb: `Test the chapter's patterns (nameSurRE.go, intRE.go, diffRegExp.go) against many inputs at once, or write your own. Go's <code>regexp</code> follows RE2: linear-time matching and therefore <strong>no lookahead, lookbehind or backreferences</strong>. Choose whether to compile with <code>regexp.Compile</code> (you get an error back) or <code>regexp.MustCompile</code> (the program panics). For integer patterns the results are compared with <code>strconv.Atoi</code>, which the book recommends instead of a regex.`,
    mount(el) {
      const st = { preset: `name`, mode: `compile`, method: `match` };
      let pat = RE_PRESETS.name[0], inputs = RE_PRESETS.name[1];
      el.innerHTML = `
        <div class="ctl-row">${ctl(`pattern`, seg(`preset`, [[`name`, `names`], [`int`, `integers`], [`uint`, `unsigned`], [`look`, `lookahead`], [`back`, `backreference`], [`find`, `unanchored \\d+`]], st.preset))}</div>
        <div class="ctl-row">${ctl(`\`raw string\``, `<input class="lab-input mono" data-k="pat" value="${esc(pat)}">`)}</div>
        <div class="ctl-row">${ctl(`compile with`, seg(`mode`, [[`compile`, `regexp.Compile`], [`must`, `regexp.MustCompile`]], st.mode))}${ctl(`call`, seg(`method`, [[`match`, `re.MatchString(s)`], [`find`, `re.FindAllString(s, -1)`]], st.method))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Inputs, one per line</h4><textarea class="lab-textarea" data-k="inputs" rows="8">${esc(inputs)}</textarea><div data-k="compile" style="margin-top:8px"></div></div>
          <div class="lab-panel"><h4>Results</h4><div class="scroll-y" data-k="res"></div><div data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const draw = () => {
        const r = goRegexp(pat);
        const lit = `\`${pat}\``;
        const lines = inputs.split(/\r?\n/);
        const isInt = /\\d\+\$$/.test(pat) && /^\^/.test(pat) && !/\./.test(pat);
        if (r.err) {
          qk(el, `compile`).innerHTML = st.mode === `compile`
            ? pblock(`bad`, `re, err := regexp.Compile(${lit})`, `Error: ${r.err}\nRegExp: <nil>`)
            : pblock(`bad`, `re := regexp.MustCompile(${lit})`, `panic: regexp: Compile(${lit}): ${r.err}\n\ngoroutine 1 [running]:\nregexp.MustCompile(...)\n\t/usr/local/go/src/regexp/regexp.go:317 +0xac\nmain.main()\nexit status 2`);
          qk(el, `res`).innerHTML = note(st.mode === `compile` ? `<code>re</code> is nil. You handled <code>err</code>, so the program can report the bad pattern and carry on, but calling <code>re.MatchString</code> on the nil pointer would panic.` : `The program never gets this far: MustCompile panicked while parsing the pattern.`, `bad`);
          qk(el, `stats`).innerHTML = ``;
        } else {
          qk(el, `compile`).innerHTML = pblock(`out`, st.mode === `compile` ? `re, err := regexp.Compile(${lit})` : `re := regexp.MustCompile(${lit})`, st.mode === `compile` ? `err == nil, re = ${pat}` : `ok, re = ${pat}`);
          let yes = 0, disagree = 0;
          const rows = lines.map(s => {
            let res;
            if (st.method === `match`) {
              const ok = r.re.test(s);
              if (ok) yes++;
              res = chip(ok ? `ok` : `no`, String(ok));
            } else {
              const g = new RegExp(r.re.source, r.flags + `g`);
              const all = [];
              let mm, guard = 0;
              while ((mm = g.exec(s)) && guard++ < 200) { all.push(mm[0]); if (mm[0] === ``) g.lastIndex++; }
              if (all.length) yes++;
              res = all.length ? `<div class="toks">${all.map((x, i) => tok(`c${i % 6}`, JSON.stringify(x))).join(``)}</div>` : chip(`muted`, `[] (nil)`);
            }
            let atoi = ``;
            if (isInt) {
              const a = atoiGo(s), ok = r.re.test(s);
              if (a.ok !== ok) disagree++;
              atoi = `<td>${a.ok ? chip(`ok`, `${a.v}`) : `<span title="${esc(a.err)}">${chip(`no`, a.err.includes(`range`) ? `out of range` : `invalid syntax`)}</span>`}</td>`;
            }
            return `<tr><td class="mono">${esc(JSON.stringify(s))}</td><td>${res}</td>${atoi}</tr>`;
          }).join(``);
          qk(el, `res`).innerHTML = `<table class="mini-table"><tr><th>s</th><th>${st.method === `match` ? `MatchString` : `FindAllString`}</th>${isInt ? `<th>strconv.Atoi</th>` : ``}</tr>${rows}</table>`;
          qk(el, `stats`).innerHTML = `<div class="stat-row">${stat(`inputs`, lines.length)}${stat(st.method === `match` ? `matched` : `with matches`, yes, `good`)}${isInt ? stat(`regex vs Atoi disagree`, disagree, disagree ? `bad` : ``) : ``}</div>`;
        }
        let n;
        if (r.err && /\(\?/.test(r.err)) n = `Lookahead <code>(?=...)</code> and lookbehind need backtracking, which RE2 deliberately leaves out so that matching always runs in linear time (no catastrophic backtracking, no ReDoS). Split the rule into separate checks instead: <code>len(s) &gt;= 7</code> and <code>regexp.MustCompile(\`\\d\`).MatchString(s)</code>.`;
        else if (r.err && /escape/.test(r.err)) n = `Backreferences such as <code>\\1</code> aren't regular (they need memory of what was matched), so RE2 rejects them. Capture the groups and compare them in Go code instead.`;
        else if (r.err) n = `The pattern doesn't parse. With Compile you get an error value to handle; with MustCompile the program panics, which is fine for constant patterns because the bug shows up at startup.`;
        else if (st.preset === `find` && st.method === `match`) n = `Without <code>^</code> and <code>$</code> a pattern matches <em>anywhere</em>, so "a123b" matches <code>\\d+</code>. Validators must be anchored. Switch to FindAllString to extract the matches instead.`;
        else if (isInt) n = `The regex only checks the shape of the text. <code>strconv.Atoi</code> also parses the value and rejects numbers that overflow int64, which no regex can do, so prefer strconv for numbers (the book's advice). Use <code>[+]?</code> instead of <code>[-+]?</code> to accept only unsigned values.`;
        else n = `<code>^[A-Z][a-z]*$</code> means exactly one capital letter followed by any number of lowercase letters, and nothing else. Write patterns as raw string literals (back quotes) so backslashes need no escaping, and compile constant patterns once in a package-level <code>var</code>.`;
        qk(el, `note`).innerHTML = note(n, r.err ? `bad` : ``);
      };
      wireSegs(el, st, k => {
        if (k === `preset`) { [pat, inputs] = RE_PRESETS[st.preset]; qk(el, `pat`).value = pat; qk(el, `inputs`).value = inputs; if (st.preset === `find`) { st.method = `find`; setSeg(el, `method`, `find`); } }
        draw();
      });
      qk(el, `pat`).addEventListener(`input`, e => { pat = e.target.value; draw(); });
      qk(el, `inputs`).addEventListener(`input`, e => { inputs = e.target.value; draw(); });
      draw();
    }
  };

  // =====================================================================
  // Ch3 - encoding/csv: csvData.go and stats.go v3
  // =====================================================================
  const CSV_PRESETS = {
    records: `Dimitris,Tsoukalos,2101112223,1600665563\nMihalis,Tsoukalos,2109416471,1600665563\nJane,Doe,0800123456,1608559903`,
    numbers: `1.1\n2.1\n-1.2\n-1\n0\na\n3`,
    ragged: `Dimitris,Tsoukalos,2101112223,1600665563\nMihalis,Tsoukalos,2109416471\nJane,Doe,0800123456,1608559903`,
    quoted: `"Doe, Jane",Doe,0800123456,1608559903\n"Mihalis ""Mike""",Tsoukalos,2109416471,1600665563\n Ann,Lee,2100000000,1700000000`,
    bare: `Dimitris,Tsou"kalos,2101112223,1600665563`,
    hash: `Dimitris#Tsoukalos#2101112223#1600665563\nJane#Doe#0800123456#1608559903`
  };
  function csvParse(text, comma) {
    const records = [];
    let pos = 0, line = 1, per = 0;
    const N = text.length;
    while (pos < N) {
      if (text[pos] === `\n`) { pos++; line++; continue; }
      if (text[pos] === `\r` && text[pos + 1] === `\n`) { pos += 2; line++; continue; }
      const recLine = line, fields = [];
      let lineStart = pos;
      for (;;) {
        if (text[pos] === `"`) {
          pos++;
          let buf = ``;
          for (;;) {
            if (pos >= N) return { err: `${recLine !== line ? `record on line ${recLine}; ` : ``}parse error on line ${line}, column ${pos - lineStart + 1}: extraneous or missing " in quoted-field`, records };
            const c = text[pos];
            if (c === `"`) {
              if (text[pos + 1] === `"`) { buf += `"`; pos += 2; continue; }
              pos++; break;
            }
            if (c === `\n`) { line++; lineStart = pos + 1; }
            buf += c; pos++;
          }
          if (pos < N && text[pos] !== comma && text[pos] !== `\n` && text[pos] !== `\r`) return { err: `${recLine !== line ? `record on line ${recLine}; ` : ``}parse error on line ${line}, column ${pos - lineStart + 1}: extraneous or missing " in quoted-field`, records };
          fields.push(buf);
        } else {
          let end = pos;
          while (end < N && text[end] !== comma && text[end] !== `\n` && !(text[end] === `\r` && text[end + 1] === `\n`)) end++;
          const f = text.slice(pos, end), q = f.indexOf(`"`);
          if (q >= 0) return { err: `parse error on line ${line}, column ${pos - lineStart + q + 1}: bare " in non-quoted field`, records };
          fields.push(f);
          pos = end;
        }
        if (pos < N && text[pos] === comma) { pos++; continue; }
        if (text[pos] === `\r`) pos++;
        if (pos < N && text[pos] === `\n`) { pos++; line++; }
        break;
      }
      if (!per) per = fields.length;
      else if (fields.length !== per) return { err: `record on line ${recLine}: wrong number of fields`, records };
      records.push(fields);
    }
    return { records };
  }
  function csvField(f, comma) {
    if (f === ``) return f;
    const needs = f === `\\.` || f.includes(comma) || f.includes(`"`) || f.includes(`\n`) || f.includes(`\r`) || f[0] === ` ` || f[0] === `\t`;
    return needs ? `"` + f.replace(/"/g, `""`) + `"` : f;
  }
  const showComma = c => c === `\t` ? `'\\t'` : `'${c}'`;
  D.c03Csv = {
    title: `encoding/csv: csvData.go and the statistics app v3`,
    blurb: `Edit a CSV file and run it through the chapter's two programs. <strong>csvData.go</strong> reads it with <code>csv.NewReader(f).ReadAll()</code> into a <code>[][]string</code>, maps each line to a <code>Record</code> struct and writes it back with <code>csvwriter.Comma = '\\t'</code>. <strong>stats.go</strong> parses the first field of every line as a float, sorts the values, and prints min, max, mean, standard deviation and the normalized data. Try the broken inputs: a ragged line, a stray quote, a different delimiter.`,
    mount(el) {
      const st = { preset: `records`, prog: `csvdata`, inc: `,`, outc: `\t` };
      let text = CSV_PRESETS.records;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`file`, seg(`preset`, [[`records`, `csv.data`], [`numbers`, `csvData.txt`], [`ragged`, `ragged line`], [`quoted`, `quoted fields`], [`bare`, `stray quote`], [`hash`, `# separated`]], st.preset))}</div>
        <div class="ctl-row">${ctl(`program`, seg(`prog`, [[`csvdata`, `csvData.go`], [`stats`, `stats.go (v3)`]], st.prog))}${ctl(`reader.Comma`, seg(`inc`, [[`,`, `','`], [`;`, `';'`], [`#`, `'#'`], [`\t`, `'\\t'`]], st.inc))}${ctl(`writer.Comma`, seg(`outc`, [[`\t`, `'\\t'`], [`,`, `','`]], st.outc))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>Input file</h4><textarea class="lab-textarea mono" data-k="txt" rows="7">${esc(text)}</textarea><h4 style="margin-top:10px">ReadAll() → [][]string</h4><div class="scroll-x" data-k="grid"></div></div>
          <div class="lab-panel"><h4>Program run</h4><div data-k="run"></div></div>
        </div>
        <div data-k="note"></div>`;
      const TS = `2023/11/27 22:15:10`;
      const draw = () => {
        const p = csvParse(text, st.inc);
        const recs = p.err ? [] : p.records;
        qk(el, `grid`).innerHTML = p.err
          ? pblock(`bad`, `err != nil`, p.err) + (p.records.length ? `<div style="font-size:11px;color:var(--text-muted)">ReadAll discards the ${p.records.length} record${p.records.length > 1 ? `s` : ``} read before the error and returns nil, err</div>` : ``)
          : recs.length ? `<table class="mini-table"><tr><th>line</th>${recs[0].map((_, i) => `<th>[${i}]</th>`).join(``)}</tr>${recs.map((r, i) => `<tr><td class="num">${i}</td>${r.map((f, j) => `<td>${tok(`c${j % 6}`, JSON.stringify(f))}</td>`).join(``)}</tr>`).join(``)}</table>` : `<span class="chip muted">no records</span>`;
        const run = [];
        let kind = `out`, crashed = false;
        if (st.prog === `csvdata`) {
          run.push(`$ go run csvData.go ~/csv.data /tmp/output.data`);
          if (p.err) { run.push(`${TS} ${p.err}`, `exit status 1`); kind = `bad`; }
          else {
            const out = [];
            for (let i = 0; i < recs.length; i++) {
              const line = recs[i];
              if (line.length < 4) {
                run.push(`panic: runtime error: index out of range [${line.length}] with length ${line.length}`, ``, `goroutine 1 [running]:`, `main.main()`, `\t/Users/mtsouk/mGo4th/code/ch03/csvData.go:66 +0x2f4`, `exit status 2`);
                kind = `bad`; crashed = true; break;
              }
              run.push(`${TS} {${line.slice(0, 4).join(` `)}}`);
              out.push([line[0], line[1], line[2], line[3]].map(f => csvField(f, st.outc)).join(st.outc));
            }
            qk(el, `run`).innerHTML = pblock(kind, `stderr (log.Println)`, run.join(`\n`)) + (crashed ? `` : pblock(`ctx`, `$ cat /tmp/output.data   (csvwriter.Comma = ${showComma(st.outc)})`, out.join(`\n`) || `(empty file)`)) + (crashed ? `` : `<div class="stat-row">${stat(`len(myData)`, recs.length, `good`)}${stat(`fields per record`, recs[0] ? recs[0].length : 0)}</div>`);
          }
          if (p.err) qk(el, `run`).innerHTML = pblock(kind, `stderr`, run.join(`\n`));
        } else {
          run.push(`$ go run stats.go csvData.txt`);
          if (p.err) { run.push(`${TS} Error reading: csvData.txt ${p.err}`); kind = `bad`; }
          else {
            const values = [];
            recs.forEach(line => { const f = parseFloatGo(line[0]); if (f.ok) values.push(f.v); else run.push(`${TS} Error reading: ${line[0]} ${f.err}`); });
            values.sort((a, b) => a - b);
            run.push(`Number of values: ${values.length}`);
            if (!values.length) { run.push(`panic: runtime error: index out of range [0] with length 0`, ``, `goroutine 1 [running]:`, `main.main()`, `\t/Users/mtsouk/mGo4th/code/ch03/stats.go:93 +0x3c8`, `exit status 2`); kind = `bad`; crashed = true; }
            else {
              const { mean, sd } = meanStd(values);
              run.push(`Min: ${goFloat(values[0])}`, `Max: ${goFloat(values[values.length - 1])}`, `Mean value: ${mean.toFixed(5)}`, `Standard deviation: ${sd.toFixed(5)}`, `Normalized: ${goFloatSlice(normalize(values, mean, sd))}`);
            }
            qk(el, `run`).innerHTML = pblock(kind, `stdout + stderr`, run.join(`\n`)) + (values.length && values.every(isFinite) ? dotPlot(values, meanStd(values).mean, meanStd(values).sd) : ``);
          }
          if (p.err) qk(el, `run`).innerHTML = pblock(kind, `stdout + stderr`, run.join(`\n`));
        }
        let n;
        if (p.err && p.err.includes(`wrong number`)) n = `With the default <code>FieldsPerRecord = 0</code>, the first record fixes the field count and every later record must match. ReadAll stops at the first bad record and returns <code>nil, err</code>, so the program logs the error and exits. Set <code>r.FieldsPerRecord = -1</code> to allow ragged lines, or use <code>Read()</code> to handle errors line by line.`;
        else if (p.err && p.err.includes(`bare`)) n = `A <code>"</code> inside an unquoted field is a parse error (ErrBareQuote). Either quote the whole field and double the inner quote (<code>"Tsou""kalos"</code>) or set <code>r.LazyQuotes = true</code>.`;
        else if (p.err) n = `A quoted field has to end with a closing quote followed by the delimiter or the end of the line.`;
        else if (crashed && st.prog === `stats`) n = `Not a single value parsed, so <code>values[0]</code> panics: v3 never checks for an empty slice. A <code>len(values) == 0</code> guard before printing Min would fix it.`;
        else if (crashed) n = `Every record has fewer than 4 fields, so <code>line[3]</code> is out of range and the program panics. The CSV reader only guarantees that all records have the <em>same</em> number of fields, not the number <em>you</em> expect. Check <code>len(line)</code> before indexing.`;
        else if (recs.length && recs[0].length === 1 && st.prog === `csvdata` && text.includes(`,`) && st.inc !== `,`) n = `Wrong delimiter: with Comma = ${showComma(st.inc)} each line is a single field, so the record can't be mapped to the struct.`;
        else if (st.prog === `stats`) n = `v3 reads the file once, keeps only lines whose first field parses as a float (logging the rest), and sorts with <code>sort.Float64s</code>, so min and max are simply the first and last elements. Everything in a CSV file is a string, and converting it is up to you.`;
        else n = `Each <code>[]string</code> line becomes a <code>Record{Name, Surname, Number, LastAccess}</code> appended to <code>myData</code>. The writer quotes a field only when needed (it contains the delimiter, a quote or a newline, or starts with a space). Writes are buffered, so call <code>Flush()</code> and check <code>Error()</code>.`;
        qk(el, `note`).innerHTML = note(n, p.err || crashed ? `bad` : `good`);
      };
      wireSegs(el, st, k => {
        if (k === `preset`) {
          text = CSV_PRESETS[st.preset];
          qk(el, `txt`).value = text;
          st.inc = st.preset === `hash` ? `#` : `,`; setSeg(el, `inc`, st.inc);
          st.prog = st.preset === `numbers` ? `stats` : `csvdata`; setSeg(el, `prog`, st.prog);
        }
        draw();
      });
      qk(el, `txt`).addEventListener(`input`, e => { text = e.target.value; draw(); });
      draw();
    }
  };
})();
