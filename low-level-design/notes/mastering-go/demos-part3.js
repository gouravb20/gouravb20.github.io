// Mastering Go - interactive labs, part 3 (chapters 7-8). Depends on labkit.js.
(function () {
  "use strict";
  const K = window.LabKit;
  const { esc, clamp, sum, round, seg, wireSegs, rng, wireRanges, ctl, stat, note, hbars, svgWrap, fmtNum, fmtBytes, pct, mulberry32 } = K;
  const D = window.DEMOS;
  const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;
  const pblock = (cls, head, body) => `<div class="pblock ${cls}"><div class="pblock-h">${head}</div><pre>${esc(body)}</pre></div>`;
  const tok = (cls, txt, title) => `<span class="tok ${cls}"${title ? ` title="${esc(title)}"` : ``}>${esc(String(txt))}</span>`;
  const btn = (act, label, ghost) => `<button class="lab-btn${ghost ? ` ghost` : ``}" data-act="${act}">${label}</button>`;
  const finder = el => k => el.querySelector(`[data-k="${k}"]`);
  function onActs(el, map) {
    el.addEventListener(`click`, e => {
      const b = e.target.closest(`[data-act]`);
      if (!b || !el.contains(b) || b.disabled) return;
      const f = map[b.dataset.act];
      if (f) f(b);
    });
  }
  const show = s => String(s).replace(/\n/g, `\\n`).replace(/\t/g, `\\t`);

  // =====================================================================
  // Ch7 - Buffered vs unbuffered writes
  // =====================================================================
  function ioCost(total, chunk, buf, flush) {
    const calls = Math.ceil(total / chunk);
    let bufSys, lost;
    if (chunk >= buf) {
      const tail = total % chunk;
      bufSys = Math.floor(total / chunk) + (tail && flush === `yes` ? 1 : 0);
      lost = flush === `no` ? tail : 0;
    } else {
      const rem = total % buf;
      bufSys = Math.floor(total / buf) + (rem && flush === `yes` ? 1 : 0);
      lost = flush === `no` ? rem : 0;
    }
    return { calls, unbSys: calls, bufSys, lost };
  }
  D.c07BufferedIO = {
    title: `Buffered vs unbuffered writes: counting system calls`,
    blurb: `Every <code>f.Write(p)</code> on an <code>*os.File</code> is a <strong>write(2) system call</strong>. A <code>bufio.Writer</code> copies small writes into an in-memory buffer and only calls the kernel when the buffer fills up, or when you call <code>Flush()</code>. Pick how many bytes each <code>Write()</code> sends and the buffer size, then press play to watch the buffer fill and drain. Try <em>forgot Flush()</em> to see the classic truncated-file bug.`,
    mount(el, ctx) {
      const st = { kb: 64, chunk: 16, buf: 4096, flush: `yes`, playing: false, written: 0 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`file size`, rng(`kb`, 1, 1024, 1, st.kb))}</div>
        <div class="ctl-row">${ctl(`bytes per Write()`, seg(`chunk`, [[1, `1`], [16, `16`], [64, `64`], [512, `512`], [8192, `8 KB`]], st.chunk))}${ctl(`bufio buffer`, seg(`buf`, [[512, `512 B`], [4096, `4 KB (default)`], [65536, `64 KB`]], st.buf))}</div>
        <div class="ctl-row">${ctl(`at the end`, seg(`flush`, [[`yes`, `w.Flush()`], [`no`, `forgot Flush()`]], st.flush))}${btn(`play`, `&#9654; Write the file`)}${btn(`reset`, `Reset`, true)}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Unbuffered: f.Write(p) for every call</h4><div data-k="unb"></div></div>
          <div class="lab-panel"><h4>Buffered: w := bufio.NewWriter(f)</h4><div data-k="bufp"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>write(2) system calls for the whole file</h4><div data-k="bars"></div></div>
        <div data-k="note"></div>`;
      const q = finder(el);
      const bar = (parts) => `<div class="pagebar" style="height:30px">${parts.map(p => `<div class="pg ${p.cls}" style="left:${p.l}%;width:${p.w}%">${p.w > 14 ? p.t : ``}</div>`).join(``)}</div>`;
      const draw = () => {
        const total = st.kb * 1024, { chunk, buf, flush } = st;
        const C = ioCost(total, chunk, buf, flush);
        const w = Math.min(st.written, total), done = w >= total;
        const fileW = total ? (w / total) * 100 : 0;
        const callsSoFar = Math.ceil(w / chunk);
        q(`unb`).innerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">file on disk</div>` +
          bar([{ cls: `cell`, l: 0, w: fileW, t: fmtBytes(w) }, { cls: `free`, l: fileW, w: 100 - fileW, t: `` }]) +
          `<div class="stat-row">${stat(`Write() calls`, fmtNum(callsSoFar, 1))}${stat(`syscalls`, fmtNum(callsSoFar, 1), callsSoFar > 1000 ? `bad` : ``)}</div>` +
          pblock(`ctx`, `code`, `for _, p := range chunks {\n    f.Write(p) // ${chunk} bytes -> 1 syscall\n}`);
        let flushed, inBuf, sys;
        if (chunk >= buf) {
          flushed = done ? total - (flush === `no` ? C.lost : 0) : Math.floor(w / chunk) * chunk;
          inBuf = done && flush === `no` ? C.lost : 0;
          sys = done ? C.bufSys : Math.floor(w / chunk);
        } else {
          const full = Math.floor(w / buf);
          flushed = full * buf; inBuf = w - flushed; sys = full;
          if (done && flush === `yes` && inBuf) { flushed = total; inBuf = 0; sys = C.bufSys; }
        }
        const fw = total ? (flushed / total) * 100 : 0;
        const lostW = done && flush === `no` ? (C.lost / total) * 100 : 0;
        const bw = (inBuf / buf) * 100;
        q(`bufp`).innerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">buffer in memory (${fmtBytes(buf)})</div>` +
          bar([{ cls: `hdr`, l: 0, w: bw, t: fmtBytes(inBuf) }, { cls: `free`, l: bw, w: 100 - bw, t: `` }]) +
          `<div style="font-size:11px;color:var(--text-muted);margin:6px 0 3px">file on disk</div>` +
          bar([{ cls: `cell`, l: 0, w: fw, t: fmtBytes(flushed) }, { cls: `dead`, l: fw, w: lostW, t: `lost` }, { cls: `free`, l: fw + lostW, w: Math.max(0, 100 - fw - lostW), t: `` }]) +
          `<div class="stat-row">${stat(`Write() calls`, fmtNum(callsSoFar, 1))}${stat(`syscalls`, fmtNum(sys, 1), `good`)}${done && C.lost ? stat(`bytes lost`, fmtBytes(C.lost), `bad`) : ``}</div>` +
          pblock(flush === `no` ? `bad` : `out`, `code`, `w := bufio.NewWriter(f)\nfor _, p := range chunks {\n    w.Write(p) // copied into the buffer\n}\n${flush === `no` ? `// forgot w.Flush(); f.Close() does not flush w` : `w.Flush() // writes the last partial buffer`}`);
        const usPer = 1;
        q(`bars`).innerHTML = hbars([
          { label: `unbuffered`, value: C.unbSys, text: fmtNum(C.unbSys), cls: C.unbSys > C.bufSys ? `bad` : `good` },
          { label: `bufio.Writer`, value: C.bufSys, text: fmtNum(C.bufSys), cls: `good` }
        ]) + `<div class="stat-row">${stat(`file size`, fmtBytes(total))}${stat(`Write() calls`, fmtNum(C.calls))}${stat(`fewer syscalls`, C.bufSys ? round(C.unbSys / C.bufSys, 1) + `x` : `-`, `good`)}${stat(`syscall overhead saved`, `~` + round((C.unbSys - C.bufSys) * usPer / 1000, 2) + ` ms`)}</div>`;
        let n;
        if (done && C.lost) n = `The program "finished" but the file is <strong>${fmtBytes(C.lost)} short</strong>: the last partial buffer never reached the kernel. Closing the <code>*os.File</code> doesn't help, because the data is in the <code>bufio.Writer</code>, not in the file. Always <code>defer w.Flush()</code> and check its error.`;
        else if (chunk >= buf) n = `Each Write() is already as big as the buffer (${fmtBytes(chunk)} ≥ ${fmtBytes(buf)}), so <code>bufio</code> passes it straight to the file. Buffering only pays off for writes that are <em>small</em> compared with the buffer.`;
        else n = `Writing ${fmtBytes(total)} in ${chunk}-byte pieces costs <strong>${fmtNum(C.unbSys)}</strong> system calls unbuffered, and only <strong>${fmtNum(C.bufSys)}</strong> through a ${fmtBytes(buf)} buffer. The trade-off: until a flush, the data exists only in process memory, so it is lost on a crash. That is why the book suggests unbuffered I/O for critical data. <em>The ~1 µs per syscall figure is illustrative.</em>`;
        q(`note`).innerHTML = note(n, done && C.lost ? `bad` : chunk >= buf ? `warn` : `good`);
        const pb = el.querySelector(`[data-act="play"]`);
        if (pb) pb.innerHTML = st.playing ? `&#10074;&#10074; Pause` : done ? `&#8635; Write again` : `&#9654; Write the file`;
      };
      const reset = () => { st.written = 0; st.playing = false; draw(); };
      ctx.every(() => {
        if (!st.playing) return;
        const total = st.kb * 1024;
        const step = Math.max(st.chunk, Math.ceil(total / 60 / st.chunk) * st.chunk);
        st.written = Math.min(total, st.written + step);
        if (st.written >= total) st.playing = false;
        draw();
      }, 110);
      onActs(el, {
        play: () => { const total = st.kb * 1024; if (st.written >= total) st.written = 0; st.playing = !st.playing; draw(); },
        reset
      });
      wireSegs(el, st, reset);
      wireRanges(el, st, { kb: v => fmtBytes(v * 1024) }, reset);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - Reading text line / word / char / size / Scanner
  // =====================================================================
  const RM_TEXT = `Dimitris,Tsoukalos,2101112223,1600665563\nMihalis Tsoukalos   2109416471\n\nJane Doe, café`;
  D.c07ReadModes = {
    title: `Reading a text file: lines, words, characters and byte chunks`,
    blurb: `The book's <code>byLine.go</code>, <code>byWord.go</code>, <code>byCharacter.go</code> and <code>readSize.go</code>, run on text you can edit. Each <code>r.ReadString('\\n')</code> call returns the text up to and including the next newline. Watch the <strong>last line</strong>: it has no trailing newline, so it arrives <em>together with</em> <code>io.EOF</code>. Switch to the naive EOF check and it disappears. Character mode ranges over <strong>runes</strong>, while byte chunks can cut a multi-byte character in half.`,
    mount(el) {
      const st = { mode: `line`, eof: `handled`, size: 12, text: RM_TEXT };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`read`, seg(`mode`, [[`line`, `line by line`], [`word`, `word by word`], [`char`, `char by char`], [`size`, `fixed size`], [`scanner`, `bufio.Scanner`]], st.mode))}</div>
        <div class="ctl-row">${ctl(`EOF branch`, seg(`eof`, [[`handled`, `if len(line) != 0 { use it }`], [`naive`, `naive: break on io.EOF`]], st.eof))}${ctl(`buffer size`, rng(`size`, 1, 32, 1, st.size))}</div>
        <textarea class="lab-textarea" data-k="ta" spellcheck="false"></textarea>
        <div class="lab-grid" style="margin-top:12px">
          <div class="lab-panel"><h4>Calls made by the loop</h4><div class="scroll-y" data-k="calls"></div></div>
          <div class="lab-panel"><h4>What the program prints</h4><div data-k="out"></div></div>
        </div>
        <div data-k="code" style="margin-top:12px"></div>
        <div data-k="note"></div>`;
      const q = finder(el);
      q(`ta`).value = st.text;
      q(`ta`).addEventListener(`input`, () => { st.text = q(`ta`).value; draw(); });
      const pieces = text => {
        const out = []; let pos = 0;
        for (;;) {
          const i = text.indexOf(`\n`, pos);
          if (i < 0) { out.push({ s: text.slice(pos), eof: true }); break; }
          out.push({ s: text.slice(pos, i + 1), eof: false }); pos = i + 1;
        }
        return out;
      };
      const draw = () => {
        const text = st.text, mode = st.mode;
        const enc = new TextEncoder(), dec = new TextDecoder();
        const totalBytes = enc.encode(text).length, totalRunes = Array.from(text).length;
        let rows = [], toks = [], lostLast = ``, code;
        if (mode === `scanner`) {
          const lines = text.split(`\n`);
          if (lines.length && lines[lines.length - 1] === `` ) lines.pop();
          lines.forEach((l, i) => { rows.push([`sc.Scan() #${i + 1}`, `true`, `sc.Text() = "${show(l)}"`, ``]); toks.push({ t: l === `` ? `(empty line)` : l, cls: `c${i % 6}` }); });
          rows.push([`sc.Scan() #${lines.length + 1}`, `false`, `sc.Err() = nil (EOF is not an error)`, `info`]);
          code = `sc := bufio.NewScanner(f)\nfor sc.Scan() {\n    fmt.Println(sc.Text()) // newline already stripped\n}\nif err := sc.Err(); err != nil { return err }`;
        } else if (mode === `size`) {
          const bytes = enc.encode(text); let i = 0, k = 1;
          while (i < bytes.length) {
            const chunk = bytes.slice(i, i + st.size);
            const s = dec.decode(chunk);
            const broken = s.includes(`\uFFFD`);
            rows.push([`f.Read(buf) #${k++}`, `n=${chunk.length}`, `"${show(s)}"`, broken ? `bad` : ``]);
            toks.push({ t: show(s), cls: broken ? `c4 hot` : `c${(k - 2) % 6}`, title: broken ? `this chunk splits a UTF-8 rune` : `` });
            i += st.size;
          }
          rows.push([`f.Read(buf) #${k}`, `n=0`, `io.EOF: readSize() returns nil`, `info`]);
          code = `func readSize(f *os.File, size int) []byte {\n    buffer := make([]byte, size) // size = ${st.size}\n    n, err := f.Read(buffer)\n    if err == io.EOF { return nil }\n    if err != nil { fmt.Println(err); return nil }\n    return buffer[0:n] // n can be < size\n}`;
        } else {
          const P = pieces(text);
          P.forEach((p, i) => {
            const isLastPartial = p.eof && p.s.length > 0;
            const used = !p.eof || (isLastPartial && st.eof === `handled`);
            rows.push([`r.ReadString('\\n') #${i + 1}`, p.eof ? `io.EOF` : `nil`, `"${show(p.s)}"${p.eof && !p.s.length ? ` (nothing left)` : ``}${isLastPartial && !used ? ` - dropped!` : ``}`, isLastPartial && !used ? `bad` : p.eof ? `info` : ``]);
            if (isLastPartial && !used) lostLast = p.s;
            if (!used) return;
            if (mode === `line`) toks.push({ t: show(p.s), cls: `c${i % 6}` });
            else if (mode === `word`) (p.s.match(/[^\s]+/g) || []).forEach(w => toks.push({ t: w, cls: `c${i % 6}` }));
            else Array.from(p.s).forEach(ch => toks.push({ t: ch === `\n` ? `\\n` : ch === ` ` ? `␠` : ch, cls: (enc.encode(ch).length > 1 ? `c2 hot` : `c${i % 6}`), title: enc.encode(ch).length + ` byte(s)` }));
          });
          const body = mode === `line` ? `fmt.Print(line)` : mode === `word` ? `for _, w := range re.FindAllString(line, -1) {\n        fmt.Println(w)\n    }` : `for _, x := range line { // x is a rune\n        fmt.Println(string(x))\n    }`;
          code = `r := bufio.NewReader(f)\n${mode === `word` ? `re := regexp.MustCompile("[^\\\\s]+")\n` : ``}for {\n    line, err := r.ReadString('\\n')\n    if err == io.EOF {\n${st.eof === `handled` ? `        if len(line) != 0 {\n            // process the last line too\n        }\n` : `        // naive: last line silently dropped\n`}        break\n    } else if err != nil {\n        return err\n    }\n    ${body}\n}`;
        }
        q(`calls`).innerHTML = `<table class="mini-table"><tr><th>call</th><th>err / result</th><th>returned</th></tr>${rows.slice(0, 60).map(r => `<tr class="${r[3] === `bad` ? `undo` : r[3] === `info` ? `dim` : ``}"><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td style="white-space:normal;word-break:break-all">${esc(r[2])}</td></tr>`).join(``)}</table>`;
        q(`out`).innerHTML = `<div class="toks">${toks.slice(0, 400).map(t => tok(t.cls, t.t, t.title)).join(``) || chip(`muted`, `nothing`)}</div>` +
          `<div class="stat-row">${stat(`calls`, rows.length)}${stat(mode === `char` ? `runes printed` : mode === `word` ? `words` : mode === `size` ? `chunks` : `lines`, toks.length)}${stat(`bytes in file`, totalBytes)}${stat(`runes in file`, totalRunes)}</div>`;
        q(`code`).innerHTML = pblock(lostLast ? `bad` : `ctx`, `go`, code);
        let n, cls = `good`;
        if (lostLast) { n = `The last line <code>"${esc(show(lostLast))}"</code> has no trailing newline, so <code>ReadString</code> returned it <strong>together with io.EOF</strong>, and the naive loop broke out without using it. The book's loops check <code>len(line) != 0</code> in the EOF branch, and <code>bufio.Scanner</code> handles this for you.`; cls = `bad`; }
        else if (mode === `size`) { const br = toks.some(t => t.cls.includes(`c4`)); n = br ? `A ${st.size}-byte buffer cut a multi-byte UTF-8 character in two, so the chunk decodes to <code>\uFFFD</code>. <code>Read</code> works in <strong>bytes</strong>; to get whole characters, use <code>ReadRune()</code> or range over a string. Notice also that <code>n</code> can be smaller than the buffer, which is why <code>readSize()</code> returns <code>buffer[0:n]</code>.` : `Each <code>f.Read(buffer)</code> returns at most ${st.size} bytes, and the last chunk is shorter, so always slice with <code>buffer[0:n]</code>. Try buffer sizes that land inside "café" (é is 2 bytes) to split a rune.`; cls = br ? `warn` : `good`; }
        else if (mode === `char`) n = `<code>for _, x := range line</code> yields <strong>runes</strong>: the file has ${totalBytes} bytes but ${totalRunes} characters. Multi-byte characters are outlined. <code>line[i]</code> would give bytes instead.`;
        else if (mode === `word`) n = `The regexp <code>[^\\s]+</code> treats any run of non-whitespace as a word, so the comma-separated first line is a single "word" (as in the book's output), and the run of spaces in line 2 is skipped. <code>strings.Fields(line)</code> does the same without a regexp.`;
        else if (mode === `scanner`) n = `<code>bufio.Scanner</code> strips the newline, returns the final line even without one, and turns EOF into a <code>false</code> from <code>Scan()</code> with <code>Err() == nil</code>. Its limit: tokens over 64 KB fail with <code>bufio.ErrTooLong</code> unless you call <code>sc.Buffer()</code>.`;
        else n = `<code>ReadString('\\n')</code> keeps the delimiter, which is why the book prints with <code>fmt.Print</code>, not <code>Println</code>. The empty line comes back as just <code>"\\n"</code>, and the final call returns the leftover text plus <code>io.EOF</code>.`;
        q(`note`).innerHTML = note(n, cls);
      };
      wireSegs(el, st, draw);
      wireRanges(el, st, { size: v => v + ` bytes` }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch7 - JSON struct tags playground
  // =====================================================================
  const JF = [
    { go: `Name`, type: `string`, key: `username`, val: `"Mihalis"`, zero: `""`, tag: `name`, set: `yes`, exp: `yes` },
    { go: `Surname`, type: `string`, key: `surname`, val: `"Tsoukalos"`, zero: `""`, tag: `omit`, set: `no`, exp: `yes` },
    { go: `Year`, type: `int`, key: `creationyear`, val: `2024`, zero: `0`, tag: `omit`, set: `no`, exp: `yes` },
    { go: `Pass`, type: `string`, key: `pass`, val: `"myPassword"`, zero: `""`, tag: `dash`, set: `yes`, exp: `yes` },
    { go: `Email`, type: `string`, key: `email`, val: `"m@example.com"`, zero: `""`, tag: `none`, set: `yes`, exp: `no` }
  ];
  const JIN = [[`USERNAME`, `"M."`], [`surname`, `"Ts"`], [`creationyear`, `2025`], [`pass`, `"leaked?"`], [`email`, `"x@y.io"`], [`extra`, `true`]];
  D.c07JsonTags = {
    title: `JSON struct tags playground: rename, omitempty, "-" and unexported fields`,
    blurb: `The book's <code>Password</code> struct, which you can edit. For each field, choose its tag, whether it is set in the struct literal, and whether it is exported. The panels show what <code>json.Marshal</code> emits and what <code>json.Unmarshal</code> does with an incoming record. Key matching on decode is <strong>case-insensitive</strong>, and unknown keys are ignored.`,
    mount(el) {
      const st = { indent: `compact` };
      JF.forEach((f, i) => { st[`tag${i}`] = f.tag; st[`set${i}`] = f.set; st[`exp${i}`] = f.exp; });
      el.innerHTML = `
        <div class="lab-panel"><h4>Fields</h4><div class="scroll-x"><table class="mini-table"><tr><th>field</th><th>tag</th><th>in literal</th><th>exported</th></tr>
          ${JF.map((f, i) => `<tr><td class="mono">${f.go} ${f.type}</td><td>${seg(`tag${i}`, [[`none`, `none`], [`name`, `"${f.key}"`], [`omit`, `,omitempty`], [`dash`, `"-"`]], st[`tag${i}`])}</td><td>${seg(`set${i}`, [[`yes`, `set`], [`no`, `zero`]], st[`set${i}`])}</td><td>${seg(`exp${i}`, [[`yes`, `Upper`], [`no`, `lower`]], st[`exp${i}`])}</td></tr>`).join(``)}
        </table></div></div>
        <div class="ctl-row" style="margin-top:12px">${ctl(`encode with`, seg(`indent`, [[`compact`, `json.Marshal`], [`pretty`, `json.MarshalIndent(v, "", "  ")`]], st.indent))}</div>
        <div class="lab-grid even">
          <div class="lab-panel"><h4>Go source</h4><div data-k="src"></div></div>
          <div class="lab-panel"><h4>json.Marshal(&amp;v)</h4><div data-k="out"></div><div data-k="fate"></div></div>
        </div>
        <div class="lab-panel" style="margin-top:12px"><h4>json.Unmarshal(record, &amp;t)</h4><div data-k="un"></div></div>
        <div data-k="note"></div>`;
      const q = finder(el);
      const name = (f, i) => st[`exp${i}`] === `yes` ? f.go : f.go[0].toLowerCase() + f.go.slice(1);
      const tagStr = (f, i) => ({ none: ``, name: `\`json:"${f.key}"\``, omit: `\`json:"${f.key},omitempty"\``, dash: `\`json:"-"\`` })[st[`tag${i}`]];
      const keyOf = (f, i) => st[`tag${i}`] === `none` ? name(f, i) : f.key;
      const draw = () => {
        const w = Math.max(...JF.map((f, i) => name(f, i).length));
        const lit = JF.map((f, i) => st[`set${i}`] === `yes` ? `${name(f, i)}: ${f.val}` : null).filter(Boolean).join(`, `);
        q(`src`).innerHTML = pblock(`user`, `type + value`, `type Password struct {\n${JF.map((f, i) => `    ${name(f, i).padEnd(w)} ${f.type.padEnd(6)} ${tagStr(f, i)}`.replace(/\s+$/, ``)).join(`\n`)}\n}\n\nv := Password{${lit}}`);
        const kept = [], fate = [];
        JF.forEach((f, i) => {
          const n = name(f, i), t = st[`tag${i}`];
          if (st[`exp${i}`] === `no`) fate.push([n, chip(`no`, `skipped`), `unexported: invisible to encoding/json`]);
          else if (t === `dash`) fate.push([n, chip(`no`, `skipped`), `tag "-" always excludes it`]);
          else if (t === `omit` && st[`set${i}`] === `no`) fate.push([n, chip(`muted`, `omitted`), `omitempty and value is the zero value ${f.zero}`]);
          else { const v = st[`set${i}`] === `yes` ? f.val : f.zero; kept.push([keyOf(f, i), v]); fate.push([n, chip(`ok`, `"${esc(keyOf(f, i))}"`), st[`set${i}`] === `yes` ? `encoded` : `zero value ${f.zero} still encoded (no omitempty)`]); }
        });
        const json = st.indent === `pretty`
          ? (kept.length ? `{\n${kept.map(([k, v]) => `  "${k}": ${v}`).join(`,\n`)}\n}` : `{}`)
          : `{${kept.map(([k, v]) => `"${k}":${v}`).join(`,`)}}`;
        q(`out`).innerHTML = pblock(kept.length ? `out` : `bad`, `output`, json);
        q(`fate`).innerHTML = `<table class="mini-table">${fate.map(r => `<tr><td class="mono">${esc(r[0])}</td><td>${r[1]}</td><td style="white-space:normal">${r[2]}</td></tr>`).join(``)}</table>`;
        const inJson = `{${JIN.map(([k, v]) => `"${k}":${v}`).join(`,`)}}`;
        const used = new Set();
        const res = JF.map((f, i) => {
          const n = name(f, i), t = st[`tag${i}`];
          if (st[`exp${i}`] === `no`) return [n, f.zero, chip(`no`, `unset`), `unexported field: never decoded`];
          if (t === `dash`) return [n, f.zero, chip(`no`, `unset`), `tag "-": the "pass" key is ignored`];
          const k = keyOf(f, i);
          const hit = JIN.find(([jk]) => jk.toLowerCase() === k.toLowerCase());
          if (!hit) return [n, f.zero, chip(`muted`, `unset`), `no key matching "${esc(k)}"`];
          used.add(hit[0]);
          return [n, hit[1], chip(`ok`, `set`), hit[0] === k ? `exact match "${esc(k)}"` : `case-insensitive match "${esc(hit[0])}" ~ "${esc(k)}"`];
        });
        const ignored = JIN.filter(([k]) => !used.has(k)).map(([k]) => k);
        q(`un`).innerHTML = pblock(`sys`, `incoming record`, inJson) +
          `<table class="mini-table"><tr><th>field</th><th>value after Unmarshal</th><th></th><th>why</th></tr>${res.map(r => `<tr><td class="mono">${esc(r[0])}</td><td class="mono">${esc(r[1])}</td><td>${r[2]}</td><td style="white-space:normal">${r[3]}</td></tr>`).join(``)}</table>` +
          `<div class="legend"><span>ignored keys: ${ignored.map(k => chip(`muted`, esc(k))).join(` `) || `none`}</span></div>`;
        const unexp = JF.filter((f, i) => st[`exp${i}`] === `no`).length;
        let n;
        if (kept.length === 0) n = `Nothing survives, so you get <code>{}</code>. This is what happens when every field is lowercase: the "number one JSON bug" from the book. <code>encoding/json</code> can only see exported fields, and it reports no error.`;
        else if (unexp) n = `Lowercase fields are silently skipped in both directions. On decode, a field without a tag matches its Go name case-insensitively, and <code>"USERNAME"</code> still finds the <code>username</code> tag. Unknown keys such as <code>extra</code> are ignored, unless you use <code>Decoder.DisallowUnknownFields()</code>.`;
        else n = `<code>omitempty</code> drops zero values: "", 0, false, nil, and empty slices or maps. If 0 is meaningful, use a pointer field. <code>"-"</code> is how you keep secrets such as passwords out of payloads.`;
        q(`note`).innerHTML = note(n, kept.length ? `good` : `bad`);
      };
      wireSegs(el, st, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Go scheduler: G, M, P, run queues, work stealing
  // =====================================================================
  const LQ = 8, SLICE = 3;
  D.c08Scheduler = {
    title: `The Go scheduler: Gs, Ms, Ps, run queues and work stealing`,
    blurb: `<code>main</code> spawns a batch of goroutines on <strong>P0</strong>. Each P (logical processor, there are <code>GOMAXPROCS</code> of them) runs one G at a time on its M (OS thread) and keeps a <strong>local run queue</strong> (8 slots here; 256 in the runtime). Overflow goes to the <strong>global queue</strong>. An idle P takes work from the global queue, and when that is empty it <strong>steals half</strong> of another P's queue. Long-running Gs are preempted after ${SLICE} ticks. A G that makes a blocking <strong>syscall</strong> takes its M with it, so the runtime starts another thread to keep the P busy.`,
    mount(el, ctx) {
      const st = { procs: 4, ngo: 24, avg: 5, block: 10, steal: `on`, speed: 300, playing: false, seed: 7 };
      let S, timer;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`GOMAXPROCS`, rng(`procs`, 1, 8, 1, st.procs))}${ctl(`goroutines`, rng(`ngo`, 4, 64, 1, st.ngo))}</div>
        <div class="ctl-row">${ctl(`avg work (ticks)`, rng(`avg`, 1, 12, 1, st.avg))}${ctl(`chance of blocking syscall / tick`, rng(`block`, 0, 40, 1, st.block))}</div>
        <div class="ctl-row">${ctl(`work stealing`, seg(`steal`, [[`on`, `on`], [`off`, `off`]], st.steal))}${ctl(`speed`, seg(`speed`, [[600, `slow`], [300, `normal`], [90, `fast`]], st.speed))}${btn(`play`, `&#9654; Run`)}${btn(`step`, `Step`, true)}${btn(`reset`, `New run`, true)}</div>
        <div data-k="ps" style="display:flex;flex-wrap:wrap;gap:10px"></div>
        <div class="lab-grid even" style="margin-top:12px">
          <div class="lab-panel"><h4>Global run queue</h4><div data-k="gq"></div><h4 style="margin-top:10px">In a blocking syscall (each holds an M)</h4><div data-k="sys"></div></div>
          <div class="lab-panel"><h4>Scheduler events</h4><div class="log" data-k="log"></div></div>
        </div>
        <div data-k="stats"></div>
        <div data-k="note"></div>`;
      const q = finder(el);
      const init = () => {
        const r = mulberry32(st.seed * 7919 + st.procs * 31 + st.ngo);
        S = { r, t: 0, P: Array.from({ length: st.procs }, () => ({ run: null, slice: 0, q: [], busy: 0 })), gq: [], sys: [], done: 0, steals: 0, idle: 0, maxM: st.procs, work: 0, log: [] };
        for (let i = 1; i <= st.ngo; i++) {
          const g = { id: i, left: 1 + Math.floor(r() * (2 * st.avg - 1)) };
          S.work += g.left;
          (S.P[0].q.length < LQ ? S.P[0].q : S.gq).push(g);
        }
        S.log.push([`info`, `t=0 main: go f() x${st.ngo}; ${Math.min(LQ, st.ngo)} land in P0's local queue, ${Math.max(0, st.ngo - LQ)} overflow to the global queue`]);
      };
      const lg = (cls, s) => { S.log.push([cls, `t=${S.t} ` + s]); if (S.log.length > 60) S.log.shift(); };
      const pick = (P, i) => {
        if (P.q.length) { P.run = P.q.shift(); return; }
        if (S.gq.length) {
          const n = Math.min(S.gq.length, Math.floor(S.gq.length / st.procs) + 1, LQ);
          const got = S.gq.splice(0, n);
          P.run = got.shift(); P.q.push(...got);
          lg(`ok`, `P${i} idle: takes ${n} G from the global queue`);
          return;
        }
        if (st.steal === `on`) {
          const victims = S.P.map((p, j) => [p, j]).filter(([p, j]) => j !== i && p.q.length > 0);
          if (victims.length) {
            const [v, j] = victims[Math.floor(S.r() * victims.length)];
            const n = Math.ceil(v.q.length / 2);
            const got = v.q.splice(0, n);
            P.run = got.shift(); P.q.push(...got); S.steals++;
            lg(`dup`, `P${i} idle, global empty: steals ${n} G from P${j}`);
          }
        }
      };
      const tick = () => {
        if (S.done >= st.ngo) return;
        S.t++;
        S.sys = S.sys.filter(s => {
          s.left--;
          if (s.left <= 0) { S.gq.push(s.g); lg(`info`, `G${s.g.id} syscall returns: no P free, joins the global queue; its M parks`); return false; }
          return true;
        });
        S.P.forEach((P, i) => {
          if (!P.run) pick(P, i);
          if (!P.run) { S.idle++; return; }
          const g = P.run; g.left--; P.slice++; P.busy++;
          if (g.left <= 0) { S.done++; P.run = null; P.slice = 0; }
          else if (S.r() < st.block / 100) { S.sys.push({ g, left: 3 }); P.run = null; P.slice = 0; lg(`bad`, `G${g.id} enters a blocking syscall on M; P${i} is handed to another M`); }
          else if (P.slice >= SLICE && (P.q.length || S.gq.length || S.P.some(p => !p.run && p !== P))) { P.run = null; P.slice = 0; (P.q.length < LQ ? P.q : S.gq).push(g); }
        });
        S.maxM = Math.max(S.maxM, st.procs + S.sys.length);
        if (S.done >= st.ngo) { st.playing = false; lg(`ok`, `all ${st.ngo} goroutines finished`); }
      };
      const gt = (g, hot) => tok(`c${g.id % 6}${hot ? ` hot` : ``}`, `G${g.id}` + (hot ? `·${g.left}` : ``), `G${g.id}: ${g.left} ticks of work left`);
      const draw = () => {
        q(`ps`).innerHTML = S.P.map((P, i) => `<div class="lab-panel" style="flex:1;min-width:150px">
            <h4>P${i} ${chip(`final`, `M${i}`)} ${P.run ? chip(`ok`, `running`) : chip(`muted`, `idle`)}</h4>
            <div style="min-height:26px">${P.run ? gt(P.run, true) : `<span style="font-size:11px;color:var(--text-muted)">no G</span>`}</div>
            <div style="font-size:11px;color:var(--text-muted);margin:6px 0 3px">local run queue ${P.q.length}/${LQ}</div>
            <div class="toks" style="min-height:24px">${P.q.map(g => gt(g)).join(``)}</div>
            <div style="margin-top:6px">${hbars([{ label: `busy`, value: S.t ? P.busy / S.t : 0, max: 1, text: S.t ? pct(P.busy / S.t) : `-`, cls: `good` }], 1)}</div>
          </div>`).join(``);
        q(`gq`).innerHTML = `<div class="toks" style="min-height:24px">${S.gq.map(g => gt(g)).join(``) || chip(`muted`, `empty`)}</div>`;
        q(`sys`).innerHTML = `<div class="toks" style="min-height:24px">${S.sys.map((s, k) => tok(`c4`, `G${s.g.id} on M${st.procs + k}`, `blocked in the kernel`)).join(``) || chip(`muted`, `none`)}</div>`;
        q(`log`).innerHTML = S.log.slice().reverse().map(([c, s]) => `<div class="${c}">${esc(s)}</div>`).join(``);
        const ideal = Math.ceil(S.work / st.procs);
        const fin = S.done >= st.ngo;
        q(`stats`).innerHTML = `<div class="stat-row">${stat(`tick`, S.t)}${stat(`done`, `${S.done}/${st.ngo}`, fin ? `good` : ``)}${stat(`steals`, S.steals)}${stat(`idle P-ticks`, S.idle, S.idle > S.t ? `bad` : ``)}${stat(`threads now / max`, `${st.procs + S.sys.length} / ${S.maxM}`)}${stat(`ideal ticks (work ÷ P)`, ideal)}${fin ? stat(`efficiency`, pct(ideal / Math.max(1, S.t)), `good`) : ``}</div>`;
        let n;
        if (st.procs === 1) n = `With <code>GOMAXPROCS=1</code> there is a single P, so goroutines run <strong>concurrently but never in parallel</strong>: the P interleaves them by preemption. The program is still correct, just not faster.`;
        else if (st.steal === `off` && S.t > 0) n = `Stealing is off, so idle Ps can only take work from the global queue. Once it drains, they sit idle while P0 still has a backlog (${S.idle} idle P-ticks so far). Turn stealing on and compare the idle count and the finish time.`;
        else if (S.sys.length) n = `${S.sys.length} goroutine(s) are blocked in a syscall, each holding an OS thread. The runtime handed their Ps to other Ms, so <strong>the thread count (${st.procs + S.sys.length}) is above GOMAXPROCS</strong>. GOMAXPROCS limits threads <em>running Go code</em>, not the total number of threads.`;
        else n = `All goroutines start on P0. Idle Ps first drain the global queue, then <strong>steal half</strong> of P0's queue (${S.steals} steals so far), so all ${st.procs} Ps stay busy without a central lock. The real runtime also checks the global queue every 61 ticks for fairness and preempts long-running Gs after about 10 ms.`;
        q(`note`).innerHTML = note(n, st.procs === 1 || (st.steal === `off` && S.t > 0) ? `warn` : `good`);
        const pb = el.querySelector(`[data-act="play"]`);
        if (pb) pb.innerHTML = st.playing ? `&#10074;&#10074; Pause` : fin ? `&#8635; Run again` : `&#9654; Run`;
      };
      const arm = () => { if (timer) ctx.clear(timer); timer = ctx.every(() => { if (st.playing) { tick(); draw(); } }, st.speed); };
      const reset = () => { st.playing = false; init(); draw(); };
      onActs(el, {
        play: () => { if (S.done >= st.ngo) init(); st.playing = !st.playing; draw(); },
        step: () => { st.playing = false; tick(); draw(); },
        reset: () => { st.seed++; reset(); }
      });
      wireSegs(el, st, k => { if (k === `speed`) arm(); else reset(); });
      wireRanges(el, st, { procs: v => v + ` P`, ngo: v => v + ` G`, avg: v => v, block: v => v + `%` }, reset);
      init(); arm(); draw();
    }
  };

  // =====================================================================
  // Ch8 - Channel simulator: unbuffered, buffered, closed, nil, select default
  // =====================================================================
  D.c08Channels = {
    title: `Channel simulator: blocking, buffering, close and nil`,
    blurb: `Each button starts a goroutine that performs one operation on <code>ch</code>. Watch which goroutines <strong>block</strong>, when values are handed over directly (unbuffered rendezvous) or go through the buffer, and what happens with <code>close(ch)</code>: blocked receivers wake up with <code>0, false</code> and blocked senders panic. Set <code>ch</code> to <strong>nil</strong> to see operations that block forever. The <em>select + default</em> buttons are the non-blocking forms from <code>bufChannel.go</code>.`,
    mount(el) {
      const st = { cap: 0 };
      let C, nextG, nextV, logs, panics;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`ch := make(chan int, N)`, seg(`cap`, [[0, `N = 0 (unbuffered)`], [1, `N = 1`], [3, `N = 3`]], st.cap))}${btn(`nil`, `var ch chan int // nil`, true)}${btn(`reset`, `Reset`, true)}</div>
        <div class="ctl-row">${btn(`send`, `go: ch &lt;- v`)}${btn(`recv`, `go: v, ok := &lt;-ch`)}${btn(`trysend`, `select { case ch &lt;- v: default: }`, true)}${btn(`tryrecv`, `select { case v := &lt;-ch: default: }`, true)}${btn(`close`, `close(ch)`)}</div>
        <div class="lab-grid three">
          <div class="lab-panel"><h4>Blocked senders (sendq)</h4><div data-k="sq"></div></div>
          <div class="lab-panel"><h4>Channel</h4><div data-k="ch"></div></div>
          <div class="lab-panel"><h4>Blocked receivers (recvq)</h4><div data-k="rq"></div></div>
        </div>
        <div class="lab-grid" style="margin-top:12px">
          <div class="lab-panel"><h4>What happened</h4><div class="log" data-k="log"></div></div>
          <div class="lab-panel"><h4>State</h4><div data-k="stats"></div></div>
        </div>
        <div data-k="note"></div>`;
      const q = finder(el);
      const fresh = (isNil) => { C = { cap: isNil ? 0 : st.cap, buf: [], sendq: [], recvq: [], closed: false, nil: !!isNil, forever: [] }; nextG = 1; nextV = 1; logs = []; panics = 0; };
      const lg = (cls, s) => { logs.push([cls, s]); if (logs.length > 80) logs.shift(); };
      const send = (tryMode) => {
        const g = nextG++, v = nextV++ * 10;
        if (C.nil) { if (tryMode) return lg(`dup`, `select: send on a nil channel is never ready, so default runs (v=${v} dropped)`); C.forever.push(`G${g}: ch <- ${v}`); return lg(`bad`, `G${g}: ch <- ${v} blocks FOREVER (nil channel)`); }
        if (C.closed) { panics++; return lg(`bad`, `G${g}: panic: send on closed channel`); }
        if (C.recvq.length) { const r = C.recvq.shift(); return lg(`ok`, `G${g} hands ${v} directly to waiting G${r} (G${r} gets ${v}, true). Both continue`); }
        if (C.buf.length < C.cap) { C.buf.push({ v, g }); return lg(`ok`, `G${g} puts ${v} in the buffer (${C.buf.length}/${C.cap}) and continues without waiting`); }
        if (tryMode) return lg(`dup`, `select: ${C.cap ? `buffer full` : `no receiver ready`}, so default runs ("No space for ${v}")`);
        C.sendq.push({ g, v });
        lg(`info`, `G${g}: ch <- ${v} BLOCKS (${C.cap ? `buffer full` : `unbuffered, no receiver ready`})`);
      };
      const recv = (tryMode) => {
        const g = nextG++;
        if (C.nil) { if (tryMode) return lg(`dup`, `select: receive from a nil channel is never ready, so default runs`); C.forever.push(`G${g}: <-ch`); return lg(`bad`, `G${g}: <-ch blocks FOREVER (nil channel)`); }
        if (C.buf.length) {
          const x = C.buf.shift();
          lg(`ok`, `G${g} receives ${x.v}, ok=true from the buffer`);
          if (C.sendq.length) { const s = C.sendq.shift(); C.buf.push(s); lg(`ok`, `blocked G${s.g} wakes up: its ${s.v} moves into the freed slot`); }
          return;
        }
        if (C.sendq.length) { const s = C.sendq.shift(); return lg(`ok`, `G${g} receives ${s.v} straight from blocked sender G${s.g} (rendezvous). Both continue`); }
        if (C.closed) return lg(`dup`, `G${g} receives 0, ok=false immediately (closed and drained, never blocks)`);
        if (tryMode) return lg(`dup`, `select: nothing to receive, so default runs ("Nothing left to read!")`);
        C.recvq.push(g);
        lg(`info`, `G${g}: v := <-ch BLOCKS waiting for a value`);
      };
      const close = () => {
        if (C.nil) { panics++; return lg(`bad`, `panic: close of nil channel`); }
        if (C.closed) { panics++; return lg(`bad`, `panic: close of closed channel`); }
        C.closed = true;
        lg(`ok`, `close(ch): no more values will be sent`);
        C.recvq.splice(0).forEach(r => lg(`dup`, `G${r} wakes up with 0, ok=false`));
        C.sendq.splice(0).forEach(s => { panics++; lg(`bad`, `G${s.g} was blocked sending ${s.v}: panic: send on closed channel`); });
        if (C.buf.length) lg(`info`, `${C.buf.length} buffered value(s) can still be received`);
      };
      const draw = () => {
        q(`sq`).innerHTML = `<div class="toks" style="min-height:26px">${C.sendq.map(s => tok(`c2`, `G${s.g}: ${s.v}`)).join(``) || chip(`muted`, `none`)}</div>`;
        const state = C.nil ? chip(`no`, `nil`) : C.closed ? chip(`undo`, `closed`) : chip(`ok`, `open`);
        const slots = C.cap ? `<div class="frames">${Array.from({ length: C.cap }, (_, i) => C.buf[i] ? `<div class="frame in">${C.buf[i].v}<small>from G${C.buf[i].g}</small></div>` : `<div class="frame empty">·<small>free</small></div>`).join(``)}</div>` : `<div style="font-size:12px;color:var(--text-muted)">${C.nil ? `no channel at all: the variable is nil` : `no buffer: a send waits for a receiver (and vice versa)`}</div>`;
        q(`ch`).innerHTML = `<div style="margin-bottom:6px">${state} <span class="mono" style="font-size:12px">len=${C.buf.length} cap=${C.cap}</span></div>${slots}`;
        q(`rq`).innerHTML = `<div class="toks" style="min-height:26px">${C.recvq.map(r => tok(`c1`, `G${r}`)).join(``) || chip(`muted`, `none`)}</div>`;
        q(`log`).innerHTML = logs.length ? logs.slice().reverse().map(([c, s]) => `<div class="${c}">${esc(s)}</div>`).join(``) : `<div class="info">Start some goroutines with the buttons above.</div>`;
        const blocked = C.sendq.length + C.recvq.length + C.forever.length;
        q(`stats`).innerHTML = `<div class="stat-row">${stat(`goroutines started`, nextG - 1)}${stat(`blocked`, blocked, blocked ? `bad` : ``)}${stat(`blocked forever (nil)`, C.forever.length, C.forever.length ? `bad` : ``)}${stat(`panics`, panics, panics ? `bad` : `good`)}</div>` +
          (blocked ? pblock(`bad`, `if main also waits on these`, `fatal error: all goroutines are asleep - deadlock!`) : ``);
        let n, cls = `good`;
        const last = logs.length ? logs[logs.length - 1][1] : ``;
        if (/panic/.test(last)) { n = `A panic would crash the whole program. The rules: <strong>never send on a closed channel</strong>, and <strong>close only once, from the sending side</strong>. Closing on the receiver side is exactly the race the book finds in <code>channels.go</code> with <code>-race</code>.`; cls = `bad`; }
        else if (C.nil) { n = `A nil channel is the zero value of <code>chan int</code>. Send and receive block forever and <code>close</code> panics. It sounds useless, but in a <code>select</code>, setting a channel variable to nil <strong>disables that case</strong>, which is how <code>nilChannel.go</code> stops reading once its timer fires.`; cls = `warn`; }
        else if (C.closed) n = `Closed: the remaining buffered values are still delivered, then every receive returns <code>0, false</code> <em>immediately</em>. That is why <code>close(done)</code> works as a broadcast and why <code>for v := range ch</code> terminates.`;
        else if (C.cap === 0) n = `Unbuffered: a send and a receive must <strong>meet</strong>. Whichever arrives first blocks until its partner arrives, so every transfer is also a synchronization point. Try two sends, then one receive.`;
        else n = `Buffered (cap ${C.cap}): senders block only when the buffer is full, and receivers only when it is empty. Values come out in FIFO order. The <em>select + default</em> buttons never block. They drop or skip instead, as in <code>bufChannel.go</code>.`;
        q(`note`).innerHTML = note(n, cls);
      };
      onActs(el, {
        send: () => { send(false); draw(); }, recv: () => { recv(false); draw(); },
        trysend: () => { send(true); draw(); }, tryrecv: () => { recv(true); draw(); },
        close: () => { close(); draw(); },
        nil: () => { fresh(true); lg(`info`, `var ch chan int: ch is nil`); draw(); },
        reset: () => { fresh(false); draw(); }
      });
      wireSegs(el, st, () => { fresh(false); draw(); });
      fresh(false); draw();
    }
  };

  // =====================================================================
  // Ch8 - Data race vs Mutex vs atomic, plus WaitGroup Add/Done mismatch
  // =====================================================================
  function raceSim(mode, X, Y, r, traceN) {
    const G = Array.from({ length: X }, (_, i) => ({ id: i + 1, left: Y, pc: 0, reg: 0 }));
    let counter = 0, lock = 0, steps = 0, waits = 0, lostStores = 0;
    const trace = [];
    const ev = (g, op, bad) => { if (trace.length < traceN) trace.push({ g: g.id, op, c: counter, bad }); };
    let active = G.slice();
    let guard = 0;
    while (active.length && guard++ < 2000000) {
      const holder = lock ? active.find(x => x.id === lock) : null;
      const pool = active.slice(0, 4);
      const g = holder && r() < 0.75 ? holder : pool[Math.floor(r() * pool.length)];
      const burst = 2 + Math.floor(r() * 10);
      const finish = r() < 0.85;
      for (let b = 0; g.left > 0 && (b < burst || (finish && mode === `none` && g.pc !== 0)); b++) {
        steps++;
        if (mode === `atomic`) { counter++; g.left--; ev(g, `atomic.AddInt64(&c, 1)`); continue; }
        if (mode === `mutex`) {
          if (g.pc === 0) { if (lock && lock !== g.id) { waits++; ev(g, `m.Lock() blocks (held by G${lock})`); break; } lock = g.id; g.pc = 1; ev(g, `m.Lock()`); }
          else if (g.pc === 1) { g.reg = counter; g.pc = 2; ev(g, `load c (${g.reg})`); }
          else if (g.pc === 2) { counter = g.reg + 1; g.pc = 3; ev(g, `store c = ${counter}`); }
          else { lock = 0; g.pc = 0; g.left--; ev(g, `m.Unlock()`); }
          continue;
        }
        if (g.pc === 0) { g.reg = counter; g.pc = 1; ev(g, `load c (${g.reg})`); }
        else if (g.pc === 1) { g.reg++; g.pc = 2; ev(g, `add: reg = ${g.reg}`); }
        else { const stale = counter !== g.reg - 1; if (stale) lostStores++; counter = g.reg; g.pc = 0; g.left--; ev(g, `store c = ${g.reg}${stale ? ` (overwrites a newer value!)` : ``}`, stale); }
      }
      active = active.filter(x => x.left > 0);
    }
    return { counter, steps, waits, lostStores, trace };
  }
  D.c08Race = {
    title: `Data race vs Mutex vs atomic (and the WaitGroup counter)`,
    blurb: `The book's <code>atomic.go</code>: X goroutines each increment a shared counter Y times. Without synchronization, <code>c++</code> is really three steps, <em>load, add, store</em>, and the scheduler can switch goroutines between them, so updates get lost. A <code>sync.Mutex</code> makes the three steps a critical section; <code>atomic.AddInt64</code> makes them one indivisible instruction. The second panel shows what <code>wg.Wait()</code> does when the numbers of <code>Add</code> and <code>Done</code> calls don't match.`,
    mount(el) {
      const st = { mode: `none`, X: 100, Y: 4, seed: 1, adds: 3, dones: 3 };
      el.innerHTML = `
        <div class="ctl-row">${ctl(`increment with`, seg(`mode`, [[`none`, `c++ (no sync)`], [`mutex`, `sync.Mutex`], [`atomic`, `atomic.AddInt64`]], st.mode))}${btn(`rerun`, `&#8635; Run again`, true)}</div>
        <div class="ctl-row">${ctl(`goroutines X`, rng(`X`, 2, 100, 1, st.X))}${ctl(`increments each Y`, rng(`Y`, 1, 50, 1, st.Y))}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4>First steps of one run (interleaving)</h4><div class="scroll-y" data-k="trace"></div></div>
          <div class="lab-panel"><h4>Result</h4><div data-k="res"></div><h4 style="margin-top:10px">10 more runs</h4><div data-k="runs"></div></div>
        </div>
        <div data-k="code" style="margin-top:12px"></div>
        <div data-k="note"></div>
        <div class="lab-panel" style="margin-top:14px"><h4>sync.WaitGroup: do Add and Done match?</h4>
          <div class="ctl-row">${ctl(`total wg.Add()`, rng(`adds`, 0, 6, 1, st.adds))}${ctl(`wg.Done() calls`, rng(`dones`, 0, 6, 1, st.dones))}</div>
          <div data-k="wg"></div>
        </div>`;
      const q = finder(el);
      const draw = () => {
        const exp = st.X * st.Y;
        const R = raceSim(st.mode, st.X, st.Y, mulberry32(st.seed * 101 + st.X * 7 + st.Y), 22);
        q(`trace`).innerHTML = `<table class="sched"><tr><th>#</th><th>goroutine</th><th>operation</th><th>c</th></tr>${R.trace.map((t, i) => `<tr class="${t.bad ? `bad` : /blocks/.test(t.op) ? `wait` : ``}"><td>${i + 1}</td><td>${tok(`c${t.g % 6}`, `G${t.g}`)}</td><td class="op">${esc(t.op)}</td><td>${t.c}</td></tr>`).join(``)}</table>`;
        const lost = exp - R.counter;
        q(`res`).innerHTML = `<div class="stat-row">${stat(`expected X×Y`, fmtNum(exp, 0))}${stat(`counter`, fmtNum(R.counter, 0), lost ? `bad` : `good`)}${stat(`lost updates`, fmtNum(lost, 0), lost ? `bad` : `good`)}${stat(`steps`, fmtNum(R.steps, 0))}${st.mode === `mutex` ? stat(`Lock() waits`, fmtNum(R.waits, 0)) : ``}</div>`;
        const runs = Array.from({ length: 10 }, (_, k) => raceSim(st.mode, st.X, st.Y, mulberry32(st.seed * 977 + k * 13 + st.X), 0).counter);
        q(`runs`).innerHTML = hbars(runs.map((v, k) => ({ label: `run ${k + 1}`, value: v, max: exp, text: fmtNum(v, 0), cls: v === exp ? `good` : `bad` })), exp);
        const codes = {
          none: `var c int64\nfor i := 0; i < X; i++ {\n    wg.Add(1)\n    go func() {\n        defer wg.Done()\n        for j := 0; j < Y; j++ {\n            c++ // load, add, store: not atomic\n        }\n    }()\n}`,
          mutex: `var m sync.Mutex\nvar c int64\n// inside each goroutine:\nm.Lock()\nc++ // critical section\nm.Unlock()`,
          atomic: `type atomCounter struct{ val int64 }\n// inside each goroutine:\natomic.AddInt64(&counter.val, 1)\n// read with atomic.LoadInt64(&counter.val)`
        };
        q(`code`).innerHTML = pblock(st.mode === `none` ? `bad` : `out`, `go`, codes[st.mode]) +
          (st.mode === `none` ? pblock(`bad`, `go run -race`, `==================\nWARNING: DATA RACE\nWrite at 0x00c0000b4010 by goroutine 8:\n  main.main.func1()  atomic.go:22\nPrevious write at 0x00c0000b4010 by goroutine 7:\n  main.main.func1()  atomic.go:22\n==================\nFound 1 data race(s)\nexit status 66`) : ``);
        let n;
        if (st.mode === `none`) n = lost
          ? `<strong>${fmtNum(lost, 0)} of ${fmtNum(exp, 0)} increments were lost.</strong> In the red rows, a goroutine stores a value based on a stale load and overwrites another goroutine's work. The result changes on every run, which is the signature of a data race. <em>This toy scheduler switches goroutines far more often than a real one. Real races may lose nothing for a thousand runs and then fail in production, so rely on <code>-race</code>, not on luck.</em>`
          : `No updates were lost <em>this time</em>, but the code is still racy. Re-run, or raise X and Y. The race detector flags the conflicting accesses even when the final number happens to be right.`;
        else if (st.mode === `mutex`) n = `Always ${fmtNum(exp, 0)}. Only the goroutine holding the lock can be inside the load/add/store, and the others wait at <code>Lock()</code> (${fmtNum(R.waits, 0)} waits in this run). Keep critical sections short, use <code>defer m.Unlock()</code> and never lock the same mutex twice in one goroutine: Go mutexes are not reentrant.`;
        else n = `Always ${fmtNum(exp, 0)}, in the fewest steps: one indivisible read-modify-write per increment and no lock to wait for. The book's run, <code>go run -race atomic.go</code>, prints 400. The rule: once a variable is accessed atomically, <em>every</em> access must go through <code>atomic</code>.`;
        q(`note`).innerHTML = note(n, st.mode === `none` ? `bad` : `good`);
        const a = st.adds, d = st.dones;
        const evs = [];
        for (let i = 0; i < Math.max(a, d); i++) { if (i < a) evs.push(`+1`); if (i < d) evs.push(`-1`); }
        let c = 0, neg = false;
        const toksHtml = evs.map(e => { c += e === `+1` ? 1 : -1; if (c < 0) neg = true; return tok(e === `+1` ? `c5` : c < 0 ? `c4 hot` : `c1`, `${e === `+1` ? `Add(1)` : `Done()`} → ${c}`); }).join(``);
        let out, cls;
        if (a === d) { out = a ? `counter reaches 0, so wg.Wait() returns and main continues` : `nothing was added: Wait() returns immediately (and doesn't wait for goroutines you forgot to Add)`; cls = a ? `out` : `ctx`; }
        else if (d > a) { out = `panic: sync: negative WaitGroup counter`; cls = `bad`; }
        else { out = `wg.Wait() blocks forever: the counter is stuck at ${a - d}\nfatal error: all goroutines are asleep - deadlock!`; cls = `bad`; }
        q(`wg`).innerHTML = `<div class="toks" style="margin-bottom:8px">${toksHtml || chip(`muted`, `no calls`)}</div>` + pblock(cls, `outcome`, out) +
          note(a === d ? `Call <code>wg.Add(1)</code> in the parent <strong>before</strong> the <code>go</code> statement, and <code>defer wg.Done()</code> first thing in the goroutine. If Add runs inside the goroutine, Wait may see 0 and return too early.` : d > a ? `More Done() than Add() calls drives the counter below zero, which panics. As the book notes, the panic may not show up if <code>main</code> exits before the extra Done runs, which is what makes these bugs flaky.` : `Fewer Done() than Add() calls: Wait() never returns. If every goroutine is blocked, the runtime detects it and reports a deadlock. If anything else is still running, the program just hangs.`, a === d ? `good` : `bad`);
        void neg;
      };
      onActs(el, { rerun: () => { st.seed++; draw(); } });
      wireSegs(el, st, draw);
      wireRanges(el, st, { X: v => v, Y: v => v, adds: v => v, dones: v => v }, draw);
      draw();
    }
  };

  // =====================================================================
  // Ch8 - Worker pool (buffered channel) vs weighted semaphore
  // =====================================================================
  D.c08WorkerPool = {
    title: `Worker pool throughput: workers, jobs and a buffered channel`,
    blurb: `The book's <code>wPools.go</code>: <code>create()</code> sends <code>Client</code> jobs into the <strong>clients</strong> channel and closes it, N <code>worker()</code> goroutines range over it and send <code>Result</code>s to <strong>data</strong>, and a collector prints them. Change the number of workers, the jobs, the time per job and the channel buffer, then run it. Switch to <em>semaphore</em> to get the same bound on concurrency with <code>semaphore.NewWeighted(N)</code> and one goroutine per job.`,
    mount(el, ctx) {
      const st = { jobs: 20, workers: 4, jt: 4, cap: 4, mode: `chan`, playing: false };
      let S;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`jobs`, rng(`jobs`, 1, 60, 1, st.jobs))}${ctl(`workers`, rng(`workers`, 1, 16, 1, st.workers))}</div>
        <div class="ctl-row">${ctl(`ticks per job`, rng(`jt`, 1, 8, 1, st.jt))}${ctl(`clients buffer`, rng(`cap`, 0, 8, 1, st.cap))}</div>
        <div class="ctl-row">${ctl(`limit concurrency with`, seg(`mode`, [[`chan`, `buffered channels + WaitGroup`], [`sem`, `semaphore.Weighted`]], st.mode))}${btn(`play`, `&#9654; Run`)}${btn(`reset`, `Reset`, true)}</div>
        <div class="lab-grid">
          <div class="lab-panel"><h4 data-k="h1"></h4><div data-k="prod"></div><div data-k="workers" style="margin-top:10px"></div></div>
          <div class="lab-panel"><h4>Results collected</h4><div data-k="res"></div><h4 style="margin-top:10px">Predicted total time vs workers</h4><div data-k="pred"></div></div>
        </div>
        <div data-k="code" style="margin-top:12px"></div>
        <div data-k="note"></div>`;
      const q = finder(el);
      const init = () => { S = { t: 0, produced: 0, buf: [], W: Array.from({ length: st.workers }, () => null), done: 0, res: [], busy: 0, blocked: 0 }; };
      const cap = () => st.mode === `sem` ? 0 : st.cap;
      const tick = () => {
        if (S.done >= st.jobs) return;
        S.t++;
        S.W.forEach((w, i) => { if (w) { w.left--; S.busy++; if (w.left <= 0) { S.res.push(w.job); S.done++; S.W[i] = null; } } });
        S.W.forEach((w, i) => {
          if (w) return;
          if (S.buf.length) S.W[i] = { job: S.buf.shift(), left: st.jt };
          else if (S.produced < st.jobs) S.W[i] = { job: S.produced++, left: st.jt };
        });
        while (S.produced < st.jobs && S.buf.length < cap()) S.buf.push(S.produced++);
        if (S.produced < st.jobs) S.blocked++;
        if (S.done >= st.jobs) st.playing = false;
      };
      const predict = w => Math.ceil(st.jobs / w) * st.jt;
      const draw = () => {
        const sem = st.mode === `sem`, fin = S.done >= st.jobs;
        q(`h1`).textContent = sem ? `main: sem.Acquire(ctx, 1) per job, then go worker(i)` : `create() → clients channel → workers`;
        const inFlight = S.W.filter(Boolean).length;
        q(`prod`).innerHTML = sem
          ? `<div style="font-size:12px;margin-bottom:4px">semaphore weight in use: <b>${inFlight}/${st.workers}</b> ${S.produced < st.jobs ? (inFlight >= st.workers ? chip(`late`, `Acquire blocks`) : chip(`ok`, `acquiring`)) : chip(`final`, `all acquired`)}</div><div class="frames">${Array.from({ length: st.workers }, (_, i) => `<div class="frame ${S.W[i] ? `in` : `empty`}">${S.W[i] ? `#` + S.W[i].job : `·`}<small>slot</small></div>`).join(``)}</div>`
          : `<div style="font-size:12px;margin-bottom:4px">create(): sent ${S.produced}/${st.jobs} ${S.produced >= st.jobs ? chip(`final`, `close(clients)`) : S.t && S.buf.length >= cap() ? chip(`late`, cap() ? `blocked: clients full` : `blocked: no idle worker`) : chip(`ok`, `sending`)}</div>` +
            `<div class="frames">${cap() ? Array.from({ length: cap() }, (_, i) => S.buf[i] != null ? `<div class="frame in">#${S.buf[i]}<small>queued</small></div>` : `<div class="frame empty">·<small>free</small></div>`).join(``) : `<span style="font-size:12px;color:var(--text-muted)">unbuffered: each send waits for an idle worker</span>`}</div>`;
        q(`workers`).innerHTML = hbars(S.W.map((w, i) => ({ label: `worker ${i}`, value: w ? (st.jt - w.left) / st.jt : 0, max: 1, text: w ? `job #${w.job}` : fin ? `done` : `idle`, cls: w ? `good` : `muted`, dim: !w })), 1);
        q(`res`).innerHTML = `<div class="toks" style="min-height:24px">${S.res.map(j => tok(`c${j % 6}`, `#${j}²=${j * j}`)).join(``) || chip(`muted`, `none yet`)}</div>` +
          `<div class="stat-row">${stat(`tick`, S.t)}${stat(`done`, `${S.done}/${st.jobs}`, fin ? `good` : ``)}${stat(`throughput`, S.t ? round(S.done / S.t, 2) + `/tick` : `-`)}${stat(`worker utilization`, S.t ? pct(S.busy / (S.t * st.workers)) : `-`)}${stat(`predicted`, predict(st.workers) + ` ticks`)}</div>`;
        const ws = [1, 2, 4, 8, 16];
        q(`pred`).innerHTML = hbars(ws.map(w => ({ label: `${w} worker${w > 1 ? `s` : ``}`, value: predict(w), text: predict(w) + ` t`, cls: w === st.workers ? `good` : `muted` })));
        q(`code`).innerHTML = pblock(`ctx`, `go`, sem
          ? `var sem = semaphore.NewWeighted(int64(${st.workers}))\nfor i := range results {\n    if err := sem.Acquire(ctx, 1); err != nil { break }\n    go func(i int) {\n        defer sem.Release(1)\n        results[i] = worker(i) // distinct index: no race\n    }(i)\n}\n_ = sem.Acquire(ctx, int64(${st.workers})) // wait for all, like wg.Wait()`
          : `var clients = make(chan Client, ${cap()})\nvar data = make(chan Result, ${cap()})\nfunc worker(wg *sync.WaitGroup) {\n    for c := range clients { data <- Result{c, c.integer * c.integer} }\n    wg.Done()\n}\ngo create(${st.jobs}) // sends jobs, then close(clients)\nfor i := 0; i < ${st.workers}; i++ { wg.Add(1); go worker(&wg) }\nwg.Wait(); close(data) // only after every worker is done`);
        let n;
        if (st.workers > st.jobs) n = `More workers (${st.workers}) than jobs (${st.jobs}): the extra goroutines just sit idle. The time is set by one round of job time.`;
        else if (fin) n = `Finished in <strong>${S.t} ticks</strong>, close to ⌈${st.jobs}/${st.workers}⌉ × ${st.jt} = ${predict(st.workers)}. Once the workers are the bottleneck, the buffer size hardly matters: it only lets <code>create()</code> run ahead. More workers help until you run out of jobs, CPUs or downstream capacity, which is the point of having a bounded pool.`;
        else n = sem ? `No jobs channel: <code>Acquire</code> blocks once ${st.workers} goroutines hold the semaphore, and each <code>Release</code> lets the next one start. The final <code>Acquire(ctx, ${st.workers})</code> takes all the weight, so it returns only after every worker has released, the book's replacement for <code>Wait()</code>.` : `The producer blocks when <code>clients</code> is full (backpressure). Ownership keeps it panic-free: <code>create()</code> closes <code>clients</code>, which ends each worker's <code>range</code>, and <code>main</code> closes <code>data</code> only after <code>wg.Wait()</code>. A worker must never close <code>data</code>, because the others are still sending.`;
        q(`note`).innerHTML = note(n, st.workers > st.jobs ? `warn` : `good`);
        const pb = el.querySelector(`[data-act="play"]`);
        if (pb) pb.innerHTML = st.playing ? `&#10074;&#10074; Pause` : fin ? `&#8635; Run again` : `&#9654; Run`;
      };
      const reset = () => { st.playing = false; init(); draw(); };
      ctx.every(() => { if (st.playing) { tick(); draw(); } }, 260);
      onActs(el, { play: () => { if (S.done >= st.jobs) init(); st.playing = !st.playing; draw(); }, reset });
      wireSegs(el, st, reset);
      wireRanges(el, st, { jobs: v => v, workers: v => v, jt: v => v + ` ticks`, cap: v => v ? `cap ${v}` : `unbuffered` }, reset);
      init(); draw();
    }
  };

  // =====================================================================
  // Ch8 - Context cancellation tree
  // =====================================================================
  D.c08Context = {
    title: `Context tree: cancellation, timeouts, deadlines and causes`,
    blurb: `A context tree like the book's <code>f1</code>/<code>f2</code>/<code>f3</code> and <code>withCancelCause.go</code>. Each context has a worker running <code>select { case &lt;-ctx.Done(): return ctx.Err(); case &lt;-time.After(work): done }</code>. Press play to run the clock, or press a <code>cancel()</code> button at any time. Cancellation flows <strong>down</strong> to every descendant and never up, a child can never outlive its parent's deadline, and <code>context.Cause</code> carries the reason.`,
    mount(el, ctx) {
      const st = { T: 3, W: 5, autoA: 0, playing: false };
      const N = [
        { id: `root`, p: null, label: `context.Background()`, kind: `bg` },
        { id: `A`, p: `root`, label: `WithCancel(root)`, kind: `cancel` },
        { id: `B`, p: `A`, label: `WithTimeout(A, T)`, kind: `timeout` },
        { id: `C`, p: `B`, label: `WithDeadline(B, now+2T)`, kind: `deadline` },
        { id: `E`, p: `C`, label: `WithValue(C, "user", "mike")`, kind: `value` },
        { id: `D`, p: `A`, label: `WithCancelCause(A)`, kind: `cause` }
      ];
      const byId = Object.fromEntries(N.map(n => [n.id, n]));
      const kids = id => N.filter(n => n.p === id);
      const depth = n => n.p ? 1 + depth(byId[n.p]) : 0;
      let t = 0;
      el.innerHTML = `
        <div class="ctl-row">${ctl(`timeout T`, rng(`T`, 1, 10, 0.5, st.T))}${ctl(`work per worker`, rng(`W`, 1, 12, 0.5, st.W))}</div>
        <div class="ctl-row">${ctl(`goroutine calls A's cancel() at`, rng(`autoA`, 0, 12, 0.5, st.autoA))}${btn(`play`, `&#9654; Start`)}${btn(`reset`, `Reset`, true)}</div>
        <div class="lab-panel"><h4 data-k="clock"></h4><div class="scroll-x" data-k="tree"></div></div>
        <div data-k="code" style="margin-top:12px"></div>
        <div data-k="note"></div>`;
      const q = finder(el);
      const own = n => n.kind === `timeout` ? st.T : n.kind === `deadline` ? 2 * st.T : Infinity;
      const dl = n => n.p ? Math.min(own(n), dl(byId[n.p])) : Infinity;
      const reset = () => { t = 0; st.playing = false; N.forEach(n => { n.at = null; n.err = null; n.cause = null; }); draw(); };
      const cancel = (n, err, cause) => {
        if (n.at != null || n.kind === `bg`) return;
        n.at = t; n.err = err; n.cause = cause || err;
        kids(n.id).forEach(c => cancel(c, err, n.cause));
      };
      const advance = () => {
        N.forEach(n => { if (n.at == null && n.kind !== `bg` && dl(n) <= t + 1e-9 && own(n) <= dl(byId[n.p]) + 1e-9) cancel(n, `context deadline exceeded`); });
        if (st.autoA > 0 && t >= st.autoA - 1e-9) cancel(byId.A, `context canceled`);
      };
      const ended = () => N.filter(n => n.kind !== `bg`).every(n => (n.at != null && n.at <= t) || t >= st.W - 1e-9);
      const draw = () => {
        q(`clock`).innerHTML = `clock: t = ${round(t, 1)} s ${st.playing ? chip(`ok`, `running`) : t > 0 ? chip(`muted`, `paused`) : chip(`muted`, `ready`)}`;
        const rows = N.map(n => {
          const pad = depth(n) * 18;
          const d = dl(n);
          const done = n.at != null;
          let wk = ``, prog = 0, wcls = `good`;
          if (n.kind === `bg`) wk = chip(`muted`, `no worker`);
          else if (done && n.at < st.W) { wk = chip(`no`, `returned at ${round(n.at, 1)} s: ctx.Err()`); prog = n.at / st.W; wcls = `bad`; }
          else if (t >= st.W - 1e-9) { wk = chip(`ok`, `finished work at ${st.W} s`); prog = 1; }
          else { wk = chip(`early`, `working...`); prog = t / st.W; wcls = `alt`; }
          const doneChip = n.kind === `bg` ? chip(`muted`, `never closed`) : done ? chip(`undo`, `closed`) : chip(`ok`, `open`);
          const canBtn = n.kind === `cancel` || n.kind === `timeout` || n.kind === `deadline` ? `<button class="lab-btn ghost" data-act="cancel" data-id="${n.id}"${done ? ` disabled` : ``}>cancel()</button>`
            : n.kind === `cause` ? `<button class="lab-btn ghost" data-act="cause" data-id="${n.id}"${done ? ` disabled` : ``}>cancel(errQuota)</button>`
            : `<span style="font-size:11px;color:var(--text-muted)">${n.kind === `value` ? `no CancelFunc` : `-`}</span>`;
          return `<tr style="${done ? `opacity:0.75` : ``}">
            <td style="padding-left:${8 + pad}px"><b>${n.id}</b> <span class="mono" style="font-size:11px">${esc(n.label)}</span></td>
            <td class="num">${d === Infinity ? `none` : round(d, 1) + ` s`}</td>
            <td>${doneChip}</td>
            <td class="mono" style="font-size:11px">${n.err ? esc(n.err) : `nil`}</td>
            <td class="mono" style="font-size:11px">${n.cause ? esc(n.cause) : `nil`}</td>
            <td style="min-width:150px">${n.kind === `bg` ? `` : `<span class="hbar-track" style="display:block;margin-bottom:3px"><span class="hbar-fill ${wcls}" style="display:block;width:${clamp(prog * 100, 0, 100)}%"></span></span>`}${wk}</td>
            <td>${canBtn}</td></tr>`;
        }).join(``);
        q(`tree`).innerHTML = `<table class="mini-table"><tr><th>context</th><th class="num">Deadline()</th><th>Done()</th><th>Err()</th><th>context.Cause()</th><th>worker</th><th></th></tr>${rows}</table>`;
        q(`code`).innerHTML = pblock(`ctx`, `go`, `ctxA, cancelA := context.WithCancel(context.Background())\nctxB, cancelB := context.WithTimeout(ctxA, ${st.T}*time.Second)\nctxC, cancelC := context.WithDeadline(ctxB, time.Now().Add(${2 * st.T}*time.Second))\nctxE := context.WithValue(ctxC, "user", "mike") // no CancelFunc\nctxD, cancelD := context.WithCancelCause(ctxA)\ndefer cancelA(); defer cancelB(); defer cancelC(); defer cancelD(nil)\n\nfunc work(ctx context.Context) error {\n    select {\n    case <-time.After(${st.W} * time.Second):\n        return nil\n    case <-ctx.Done():\n        return context.Cause(ctx) // or ctx.Err()\n    }\n}`);
        const B = byId.B, C = byId.C, D2 = byId.D, A = byId.A;
        let n, cls = `good`;
        if (A.at != null) n = `Canceling <strong>A</strong> closed the Done channel of every descendant (B, C, E and D) in one step. The root stays open, because cancellation never propagates upward. ${D2.cause && D2.cause !== D2.err ? `` : `D inherited A's cause, so <code>context.Cause</code> equals <code>Err()</code> here.`}`;
        else if (D2.at != null && D2.cause !== D2.err) n = `<code>WithCancelCause</code>: <code>ctx.Err()</code> is still the generic <code>context canceled</code>, but <code>context.Cause(ctx)</code> returns your error, <code>quota exceeded</code>. Only D was affected, because siblings and parents are independent.`;
        else if (B.at != null && B.err === `context deadline exceeded`) { n = `B's timeout fired at ${round(B.at, 1)} s with <code>context deadline exceeded</code>. C asked for a <strong>later</strong> deadline (${2 * st.T} s), but a child can't outlive its parent, so C's <code>Deadline()</code> is ${st.T} s and C and E were canceled together with B. The A and D workers were not affected.`; cls = `warn`; }
        else if (t >= st.W) n = `Work (${st.W} s) finished before any deadline (T = ${st.T} s), so every worker returned normally. This is the book's <code>go run useContext.go 3</code> case. Still <code>defer cancel()</code>: it releases each child's timer and its entry in the parent.`;
        else n = `Every derived context gets a <code>CancelFunc</code> except <code>WithValue</code>, which only carries data and inherits its parent's cancellation. Press <code>cancel()</code> on any row to see what is affected, or let the clock run into B's ${st.T} s timeout.`;
        q(`note`).innerHTML = note(n, cls);
        const pb = el.querySelector(`[data-act="play"]`);
        if (pb) pb.innerHTML = st.playing ? `&#10074;&#10074; Pause` : ended() && t > 0 ? `&#8635; Restart` : `&#9654; Start`;
      };
      ctx.every(() => {
        if (!st.playing) return;
        t = round(t + 0.1, 1);
        advance();
        if (ended() || t >= 15) st.playing = false;
        draw();
      }, 100);
      onActs(el, {
        play: () => { if (ended() && t > 0) { reset(); } st.playing = !st.playing; draw(); },
        reset,
        cancel: b => { cancel(byId[b.dataset.id], `context canceled`); draw(); },
        cause: b => { cancel(byId[b.dataset.id], `context canceled`, `quota exceeded`); draw(); }
      });
      wireRanges(el, st, { T: v => v + ` s`, W: v => v + ` s`, autoA: v => v ? v + ` s` : `never` }, reset);
      reset();
    }
  };
})();
