// Deep dive: Chapter 7, Telling a UNIX system what to do. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch7 = {
  hook: `<p>A nightly export writes 50,000 rows to a CSV report. Someone switches it from <code>f.Write</code> to a <code>bufio.Writer</code> because profiling showed time spent in system calls, and the job does get faster. A week later finance notices that every report ends mid-row: the last few kilobytes are always missing. Nobody called <code>Flush()</code>, so whatever was still in the buffer when the program exited was simply thrown away.</p>
<p>Systems programming in Go is mostly about a few small interfaces and the rules around them: what a <code>Read</code> may return, when buffered data actually reaches the kernel, how JSON tags decide what is written, and which newer standard library pieces (<code>embed</code>, <code>io/fs</code>, <code>log/slog</code>) replace the old ones. This chapter goes through them with UNIX in mind, since that is where most Go services run, but almost everything here is portable.</p>`,
  sections: [
    {
      id: "processes-and-streams",
      title: "Processes and the three standard streams",
      kicker: "UNIX basics",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>program</strong> is a file on disk; a <strong>process</strong> is a running instance of it, with its own memory, open files and a process ID; a <strong>thread</strong> is a flow of execution inside a process that shares its memory. A Go program is one process whose goroutines are spread over a few threads by the runtime.</p>
<p>Every UNIX process starts with three open files: standard input (file descriptor 0), standard output (1) and standard error (2). Go exposes them as <code>os.Stdin</code>, <code>os.Stdout</code> and <code>os.Stderr</code>, all of type <code>*os.File</code>. The convention that makes shell pipelines work is simple: read data from stdin, write results to stdout, write diagnostics to stderr, and exit with status 0 on success and non-zero on failure.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "A well-behaved filter",
          code: `func main() {
	sc := bufio.NewScanner(os.Stdin)
	matches := 0
	for sc.Scan() {
		if line := sc.Text(); strings.Contains(line, "ERROR") {
			fmt.Println(line) // stdout: the data
			matches++
		}
	}
	if err := sc.Err(); err != nil {
		fmt.Fprintln(os.Stderr, "read:", err) // stderr: diagnostics
		os.Exit(2)
	}
	fmt.Fprintf(os.Stderr, "%d matching lines\\n", matches)
	if matches == 0 {
		os.Exit(1) // like grep: 1 means "nothing found"
	}
}`,
          caption: "Used as cat app.log | errfilter > errors.txt, the count still appears on the terminal while the file holds only matching lines.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>In containers this convention becomes infrastructure. Docker and Kubernetes capture a container's stdout and stderr as its logs, so a Go service that writes logs to those streams needs no log files, rotation or syslog configuration.</p>`,
        },
      ],
    },
    {
      id: "reader-and-writer",
      title: "io.Reader and io.Writer: two methods that run everything",
      kicker: "The key idea",
      blocks: [
        {
          type: "idea",
          html: `<p>All I/O in Go meets at two one-method interfaces: <code>Read(p []byte) (n int, err error)</code> and <code>Write(p []byte) (n int, err error)</code>. Because files, sockets, buffers, compressors, hashes and HTTP bodies all implement them, any of these can be <strong>layered</strong> on any other.</p>`,
        },
        {
          type: "text",
          html: `<p>The contract of <code>Read</code> is subtle and worth knowing exactly. It reads <em>up to</em> <code>len(p)</code> bytes and may return fewer even when more data is coming. It may return <code>n &gt; 0</code> together with a non-nil error, including <code>io.EOF</code>, so callers must <strong>process the n bytes first and look at the error second</strong>. Implementations should not return <code>0, nil</code>, and must not keep a reference to <code>p</code> after returning. <code>Write</code> must return a non-nil error whenever it writes fewer than <code>len(p)</code> bytes, and must not modify <code>p</code>.</p>
<p>You rarely call <code>Read</code> in a loop yourself. <code>io.Copy(dst, src)</code> moves everything from a reader to a writer, <code>io.ReadAll</code> collects a reader into a slice, <code>io.MultiWriter</code> duplicates writes, <code>io.TeeReader</code> copies what is read into a writer, and <code>io.LimitReader</code> caps how much can be read.</p>`,
        },
        {
          type: "diagram",
          title: "Layering readers and writers",
          caption: "Each box wraps the one before it and satisfies the same interface, so the layers can be combined freely. Data flows left to right in both rows.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="A chain of readers from a file through gzip and a scanner, and a chain of writers from a JSON encoder through a buffer to two destinations">
<defs><marker id="go7-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="20" y="30" font-size="13" font-weight="700">Reading: each layer is an io.Reader wrapping another</text>
<rect x="20" y="44" width="130" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="180" y="44" width="130" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="340" y="44" width="130" height="50" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="500" y="44" width="120" height="50" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="85" y="66" text-anchor="middle" font-size="13">*os.File</text>
<text x="85" y="84" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">raw bytes</text>
<text x="245" y="66" text-anchor="middle" font-size="13">gzip.Reader</text>
<text x="245" y="84" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">decompresses</text>
<text x="405" y="66" text-anchor="middle" font-size="13">bufio.Scanner</text>
<text x="405" y="84" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">splits lines</text>
<text x="560" y="66" text-anchor="middle" font-size="13">your loop</text>
<text x="560" y="84" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">sc.Text()</text>
<line x1="152" y1="69" x2="177" y2="69" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go7-arrow)"/>
<line x1="312" y1="69" x2="337" y2="69" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go7-arrow)"/>
<line x1="472" y1="69" x2="497" y2="69" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go7-arrow)"/>
<text x="20" y="130" font-size="13" font-weight="700">Writing: each layer is an io.Writer wrapping another</text>
<rect x="20" y="144" width="130" height="50" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="180" y="144" width="130" height="50" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="340" y="144" width="130" height="50" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="500" y="144" width="120" height="50" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="85" y="166" text-anchor="middle" font-size="13">json.Encoder</text>
<text x="85" y="184" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Encode(v)</text>
<text x="245" y="166" text-anchor="middle" font-size="13">bufio.Writer</text>
<text x="245" y="184" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">batches writes</text>
<text x="405" y="166" text-anchor="middle" font-size="13">io.MultiWriter</text>
<text x="405" y="184" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">duplicates</text>
<text x="560" y="166" text-anchor="middle" font-size="13">stdout + file</text>
<text x="560" y="184" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">*os.File x2</text>
<line x1="152" y1="169" x2="177" y2="169" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go7-arrow)"/>
<line x1="312" y1="169" x2="337" y2="169" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go7-arrow)"/>
<line x1="472" y1="169" x2="497" y2="169" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#go7-arrow)"/>
</svg>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Writing your own Reader",
          code: `// countingReader counts the bytes that pass through it.
type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n) // count n even when err != nil
	return n, err
}

func ratio(f *os.File) error {
	cr := &countingReader{r: f}
	zr, err := gzip.NewReader(cr)
	if err != nil {
		return err
	}
	out, err := io.Copy(io.Discard, zr)
	if err != nil {
		return err
	}
	fmt.Printf("%d compressed bytes -> %d bytes\\n", cr.n, out)
	return nil
}`,
        },
        {
          type: "quiz",
          q: "A <code>Read</code> call returns <code>n = 512</code> and <code>err = io.EOF</code>. What should the caller do?",
          options: [
            "Discard the 512 bytes, since an error was returned",
            "Process the 512 bytes, then stop because the stream has ended",
            "Retry the read until it returns err == nil",
            "Treat it as a bug: Read cannot return data and an error together",
          ],
          answer: 1,
          explain: "The io.Reader contract allows data and an error in the same call. Always handle the <code>n</code> bytes first, then the error. Ignoring them is exactly how the last chunk of a file goes missing.",
        },
      ],
    },
    {
      id: "buffered-io",
      title: "Buffered I/O and the forgotten Flush",
      kicker: "Performance",
      blocks: [
        {
          type: "problem",
          html: `<p>Every <code>Write</code> on an <code>*os.File</code> is a system call: a switch into the kernel and back. Writing a 50,000-row report one small line at a time means 50,000 system calls, and the overhead of crossing into the kernel can dominate the actual work.</p>`,
        },
        {
          type: "text",
          html: `<p><code>bufio.Writer</code> wraps any writer with an in-memory buffer (4096 bytes by default). Small writes are copied into the buffer, and only when it fills up does one large write go to the underlying file. <code>bufio.Reader</code> does the reverse: it reads a large block once and serves many small reads from memory, and adds helpers such as <code>ReadString</code> and <code>ReadRune</code>.</p>
<p>The cost of buffering is that data sits in your process's memory until the buffer is flushed. If the program exits, crashes or simply forgets, that data never reaches the file. Errors are delayed too: a full disk might only be reported by <code>Flush</code>, so its error must be checked.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `func writeReport(path string, rows []Row) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	w := bufio.NewWriter(f)
	for _, r := range rows {
		fmt.Fprintf(w, "%s,%d\\n", r.Name, r.Count) // no system call yet
	}
	if err := w.Flush(); err != nil { // the final partial buffer goes out here
		return err
	}
	return f.Close() // report close errors too; the second, deferred Close is harmless
}`,
        },
        {
          type: "lab",
          id: "c07BufferedIO",
          caption: "Choose the size of each write and of the buffer, then watch the buffer fill and drain while the lab counts system calls. Turn on forgot Flush() to reproduce the truncated report.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Writing <code>defer w.Flush()</code> and moving on. It does flush, but the error is thrown away, and if the program calls <code>os.Exit</code> or <code>log.Fatal</code> first, deferred calls never run at all. Flush explicitly and check the result.</p>`,
        },
      ],
    },
    {
      id: "reading-and-writing-files",
      title: "Reading by line, word and character; writing files",
      kicker: "File I/O",
      blocks: [
        {
          type: "text",
          html: `<p>Two tools read text. <code>bufio.Scanner</code> is the simplest: it splits input into tokens, lines by default, with the newline removed. Switch the split function with <code>sc.Split(bufio.ScanWords)</code> or <code>bufio.ScanRunes</code>. Its one trap is size: a token longer than 64 KiB stops the scan with <code>bufio.ErrTooLong</code> unless you raise the limit with <code>sc.Buffer</code>.</p>
<p><code>bufio.Reader.ReadString('\\n')</code> returns everything up to and including the delimiter, with no size limit. Its trap is the last line: if the file does not end with a newline, the final line comes back <em>together with</em> <code>io.EOF</code>. A loop that checks the error first and breaks drops that line.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `r := bufio.NewReader(f)
for {
	line, err := r.ReadString('\\n')
	if len(line) > 0 {
		handle(line) // handle data first: the last line may come with io.EOF
	}
	if err == io.EOF {
		break
	}
	if err != nil {
		return err
	}
}

sc := bufio.NewScanner(f2)
sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024) // allow lines up to 4 MiB
sc.Split(bufio.ScanWords)
for sc.Scan() {
	words++
}
if err := sc.Err(); err != nil { // io.EOF is not reported as an error
	return err
}`,
        },
        {
          type: "lab",
          id: "c07ReadModes",
          caption: "Read the same text by line, by word, by character and in fixed-size byte chunks. Watch the final line arrive with io.EOF, and see byte chunks cut a multi-byte character in half.",
        },
        {
          type: "text",
          html: `<p>Reading raw bytes in fixed-size chunks with <code>f.Read(buf)</code> is right for binary data but can split a UTF-8 character across two chunks, so decode text with a scanner or <code>ReadRune</code> instead. For binary formats, <code>encoding/binary</code> decodes fixed-size values in a chosen byte order: <code>binary.Read(r, binary.LittleEndian, &amp;n)</code> fills an <code>int64</code> from 8 bytes. That is how you turn bytes from <code>/dev/random</code> (or, portably, <code>crypto/rand.Reader</code>) into a number.</p>
<h3>Writing files</h3>
<p><code>os.WriteFile(path, data, 0644)</code> writes a whole file in one call. <code>os.Create</code> creates or truncates a file for writing. To append, open with <code>os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)</code>. Then write with <code>f.Write</code>, <code>f.WriteString</code>, <code>fmt.Fprintf(f, ...)</code>, <code>io.WriteString</code> or a <code>bufio.Writer</code>: they all end in the same <code>Write</code> method.</p>`,
        },
        {
          type: "quiz",
          q: "A loop does <code>line, err := r.ReadString('\\n'); if err != nil { break }; handle(line)</code>. The file's last line has no trailing newline. What happens to it?",
          options: [
            "It is handled normally",
            "It is lost, because it arrives together with io.EOF and the loop breaks before handling it",
            "ReadString blocks forever waiting for a newline",
            "ReadString returns an empty string and a nil error",
          ],
          answer: 1,
          explain: "ReadString returns the remaining text and <code>io.EOF</code> in the same call when the delimiter is missing. Handling <code>line</code> before checking <code>err</code> fixes it.",
        },
      ],
    },
    {
      id: "json",
      title: "JSON: struct tags, omitempty and streams",
      kicker: "encoding/json",
      blocks: [
        {
          type: "text",
          html: `<p><code>json.Marshal(v)</code> turns a Go value into JSON bytes, and <code>json.Unmarshal(data, &amp;v)</code> parses JSON into a value through a pointer. Both use reflection, and both see only <strong>exported</strong> fields. A struct whose fields are all lowercase marshals to <code>{}</code>, with no error, which is one of the most common surprises in Go.</p>
<p>Struct tags customize the mapping. <code>json:"username"</code> renames the key. <code>json:",omitempty"</code> drops the field when it holds an "empty" value: <code>false</code>, 0, an empty string, a nil pointer or interface, or an empty slice or map. <code>json:"-"</code> excludes the field always. Note that <code>omitempty</code> never omits a struct value such as <code>time.Time</code>; Go 1.24 added an <code>omitzero</code> option for that.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `type Account struct {
	Username string    \`json:"username"\`
	Email    string    \`json:"email,omitempty"\` // "" is left out
	Password string    \`json:"-"\`               // never encoded
	Admin    *bool     \`json:"admin,omitempty"\` // nil: left out; false: kept
	Created  time.Time \`json:"created"\`
	notes    string    // unexported: invisible to encoding/json
}

func main() {
	no := false
	a := Account{Username: "ana", Password: "s3cret", Admin: &no, notes: "x"}
	b, err := json.Marshal(a)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(string(b))
	// {"username":"ana","admin":false,"created":"0001-01-01T00:00:00Z"}
}`,
          caption: "When zero is a meaningful value (an explicit false or 0), use a pointer so that nil means \"not set\" and omitempty only drops the unset case.",
        },
        {
          type: "text",
          html: `<p>Decoding is forgiving by default. Keys are matched to fields case-insensitively (an exact match is preferred), unknown keys are silently ignored, and fields missing from the input keep whatever value they had. When you want strictness, use a <code>json.Decoder</code> and call <code>DisallowUnknownFields()</code>.</p>
<p><code>json.NewEncoder(w).Encode(v)</code> and <code>json.NewDecoder(r).Decode(&amp;v)</code> work directly on writers and readers, so you never need the whole document in memory as a byte slice. Calling <code>Decode</code> in a loop reads a stream of concatenated JSON values, such as newline-delimited JSON logs. For human-readable output, use <code>json.MarshalIndent(v, "", "  ")</code> or <code>enc.SetIndent</code>.</p>`,
        },
        {
          type: "lab",
          id: "c07JsonTags",
          caption: "Edit each field's tag, whether it is set and whether it is exported, then compare what json.Marshal emits with what json.Unmarshal does to an incoming record.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Relying on <code>json:"-"</code> or unexported fields as a security boundary while also logging the struct with <code>%+v</code>. The fmt package prints every field, including the password. Keep secrets out of structs that get logged, or give the type a <code>String</code> method that redacts them.</p>`,
        },
        {
          type: "quiz",
          q: "<code>type user struct { name string; age int }</code>. What does <code>json.Marshal(user{\"ana\", 31})</code> produce?",
          options: [
            "<code>{\"name\":\"ana\",\"age\":31}</code>",
            "<code>{}</code> with a nil error",
            "An error saying the fields are unexported",
            "<code>{\"Name\":\"ana\",\"Age\":31}</code>",
          ],
          answer: 1,
          explain: "encoding/json can only see exported fields. With none, it emits an empty object and no error. Capitalize the fields and add tags like <code>json:\"name\"</code> to keep lowercase keys.",
        },
      ],
    },
    {
      id: "cli-and-modern-stdlib",
      title: "CLIs, embedded files, io/fs and slog",
      kicker: "Modern tooling",
      blocks: [
        {
          type: "text",
          html: `<p>The standard <code>flag</code> package handles simple options. Larger tools usually adopt two libraries by the same author. <strong>cobra</strong> structures a CLI as a tree of commands with subcommands, aliases, generated help and shell completion, with <em>persistent</em> flags inherited by subcommands and <em>local</em> flags that belong to one command. <strong>viper</strong> merges configuration from flags, environment variables and config files into one place, with a clear precedence order. kubectl and Hugo are built on cobra.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var rootCmd = &cobra.Command{Use: "stats", Short: "Statistics on stored datasets"}

var listCmd = &cobra.Command{
	Use:     "list",
	Aliases: []string{"ls"},
	Short:   "List stored datasets",
	RunE: func(cmd *cobra.Command, args []string) error {
		file, _ := cmd.Flags().GetString("file")
		return listDatasets(file)
	},
}

func main() {
	rootCmd.PersistentFlags().StringP("file", "f", "data.json", "data file")
	rootCmd.AddCommand(listCmd)
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}`,
          caption: "Persistent flags defined on the root are visible to every subcommand, so stats ls -f other.json works.",
        },
        {
          type: "text",
          html: `<h3>Files inside the binary, and file systems as interfaces</h3>
<p>Since Go 1.16, a <code>//go:embed</code> directive directly above a package-level variable bakes files into the binary at build time. The variable can be a <code>string</code> or <code>[]byte</code> for one file, or an <code>embed.FS</code> for many. Patterns are relative to the package directory and cannot reach outside it with <code>..</code>; files whose names start with <code>.</code> or <code>_</code> are skipped unless you use the <code>all:</code> prefix. Single-binary deployment now includes templates, static assets and SQL migrations.</p>
<p>The same release added <code>io/fs</code>, which defines <code>fs.FS</code>, a read-only file system interface, with helpers such as <code>fs.WalkDir</code> and <code>fs.ReadFile</code>. <code>embed.FS</code>, <code>os.DirFS(dir)</code> and <code>testing/fstest.MapFS</code> all implement it, so code written against <code>fs.FS</code> can serve embedded files in production and an in-memory map in tests.</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `//go:embed templates/*.html
var templates embed.FS

func listTemplates() error {
	return fs.WalkDir(templates, "templates", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			fmt.Println(path)
		}
		return nil
	})
}`,
        },
        {
          type: "table",
          title: "io/ioutil replacements (deprecated since Go 1.16)",
          headers: ["Old", "New"],
          rows: [
            ["<code>ioutil.ReadFile</code> / <code>WriteFile</code>", "<code>os.ReadFile</code> / <code>os.WriteFile</code>"],
            ["<code>ioutil.ReadAll</code>", "<code>io.ReadAll</code>"],
            ["<code>ioutil.ReadDir</code> (returns <code>[]FileInfo</code>)", "<code>os.ReadDir</code> (returns <code>[]os.DirEntry</code>, no stat per entry)"],
            ["<code>ioutil.TempDir</code> / <code>TempFile</code>", "<code>os.MkdirTemp</code> / <code>os.CreateTemp</code>"],
            ["<code>ioutil.Discard</code> / <code>NopCloser</code>", "<code>io.Discard</code> / <code>io.NopCloser</code>"],
          ],
          note: "os.ReadDir is faster for large directories because it gets each entry's name and type from the directory listing instead of calling stat on every file.",
        },
        {
          type: "text",
          html: `<h3>Structured logging with log/slog</h3>
<p>Go 1.21 added <code>log/slog</code>. Each record has a level (Debug, Info, Warn, Error), a message and key-value attributes. A <code>TextHandler</code> writes <code>key=value</code> lines and a <code>JSONHandler</code> writes one JSON object per record, which log platforms can index. A <code>slog.LevelVar</code> lets you change the level while the program runs. To silence logging cheaply, use a handler that writes to <code>io.Discard</code> (Go 1.24 also added <code>slog.DiscardHandler</code>).</p>`,
        },
        {
          type: "code",
          lang: "go",
          code: `var level slog.LevelVar // zero value: Info
logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: &level}))

logger.Info("user created", "id", 42, "plan", "pro")
// {"time":"...","level":"INFO","msg":"user created","id":42,"plan":"pro"}

level.Set(slog.LevelDebug) // e.g. from an admin endpoint
logger.Debug("cache miss", slog.String("key", "user:42"))`,
        },
      ],
    },
    {
      id: "interview",
      title: "Interview angle: I/O contracts and encoding traps",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>I/O questions check that you know the contracts, not just the function names. Interviewers like to show a file-reading loop and ask what is wrong with it, or ask why a JSON response is empty. Design questions follow: how would you make this code testable without touching the disk? (Accept an <code>io.Reader</code> or an <code>fs.FS</code>.)</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Points to cover:</p>
<ul>
<li><strong>io.Reader/io.Writer:</strong> one method each; everything composes; <code>io.Copy</code> moves data between any pair.</li>
<li><strong>Read rules:</strong> may return fewer bytes, or data plus an error; process <code>n</code> bytes before checking <code>err</code>.</li>
<li><strong>Buffering:</strong> fewer system calls, but data waits in memory; always <code>Flush</code> and check its error.</li>
<li><strong>Missing last line:</strong> <code>ReadString</code> returns it with <code>io.EOF</code>; handle data first.</li>
<li><strong>Empty JSON:</strong> only exported fields are encoded; <code>omitempty</code> drops zero values, so use pointers for meaningful zeros.</li>
<li><strong>Encoder/Decoder vs Marshal:</strong> streams and large or concatenated documents versus small in-memory values.</li>
<li><strong>embed, io/fs, slog:</strong> files in the binary, file systems as interfaces, structured leveled logs.</li>
</ul>`,
        },
        {
          type: "quiz",
          q: "You want a function that parses a config file to be testable without creating real files. Which parameter type is the best choice?",
          options: [
            "A file path <code>string</code>",
            "An <code>*os.File</code>",
            "An <code>io.Reader</code>",
            "A <code>[]string</code> of lines",
          ],
          answer: 2,
          explain: "An <code>io.Reader</code> accepts a real file in production and <code>strings.NewReader</code> in tests, and it also works with network bodies or decompressed streams. A path or an <code>*os.File</code> ties the function to the disk.",
        },
      ],
    },
  ],
  takeaways: [
    "Read data from stdin, write results to stdout and diagnostics to stderr, and use exit codes; containers turn stdout and stderr into logs.",
    "io.Reader and io.Writer are the universal I/O interfaces; layering them (files, gzip, buffers, hashes) is how Go programs are built.",
    "A Read may return fewer bytes, or data together with an error such as <code>io.EOF</code>: process the bytes first, then the error.",
    "<code>bufio</code> cuts system calls by batching I/O, but buffered data is lost unless you <code>Flush</code> and check its error.",
    "encoding/json sees only exported fields; tags rename (<code>\"name\"</code>), drop zero values (<code>omitempty</code>) or exclude (<code>\"-\"</code>); use Encoder/Decoder for streams.",
    "Replace io/ioutil with os and io functions; <code>os.ReadDir</code> returns DirEntry values without a stat per file.",
    "<code>//go:embed</code> puts files in the binary, <code>io/fs</code> makes file systems swappable, and <code>log/slog</code> gives structured, leveled logging.",
  ],
  furtherReading: [
    { title: "Package io documentation", url: "https://pkg.go.dev/io", note: "The exact contracts of Reader and Writer, plus Copy, MultiWriter and TeeReader." },
    { title: "JSON and Go (The Go Blog)", url: "https://go.dev/blog/json", note: "Marshal, Unmarshal, struct tags and decoding into interface values." },
    { title: "Structured Logging with slog (The Go Blog)", url: "https://go.dev/blog/slog", note: "Why slog was added and how handlers, levels and attributes work." },
    { title: "Package embed documentation", url: "https://pkg.go.dev/embed", note: "The //go:embed directive, its patterns and its restrictions." },
  ],
};
