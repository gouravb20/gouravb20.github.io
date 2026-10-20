// Go versions of the Logging Service code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["logging-service"] = { go: {
"Public API": `fileSink, err := NewFileSink("app.log")
if err != nil {
	return err
}
logger := NewLogger(
	NewDestination(Debug, PlainFormatter{}, NewConsoleSink()),
	NewDestination(Warn, JSONFormatter{}, fileSink),
)

logger.Info("user signed in")
logger.Error("payment failed")`,

"Levels, records and formatters": `type Level int

const (
	Debug Level = iota
	Info
	Warn
	Error
	Fatal
)

func (l Level) String() string { return [...]string{"DEBUG", "INFO", "WARN", "ERROR", "FATAL"}[l] }

// Go has no thread names, so a record carries a source label (component or request) instead.
type LogRecord struct {
	Time    time.Time
	Level   Level
	Message string
	Source  string
}

type Formatter interface {
	Format(r LogRecord) string
}

type PlainFormatter struct{}

func (PlainFormatter) Format(r LogRecord) string {
	return fmt.Sprintf("%s [%s] (%s) %s", r.Time.Format(time.RFC3339Nano), r.Level, r.Source, r.Message)
}

type JSONFormatter struct{}

func (JSONFormatter) Format(r LogRecord) string {
	b, _ := json.Marshal(map[string]string{ // encoding/json does the escaping
		"time":    r.Time.Format(time.RFC3339Nano),
		"level":   r.Level.String(),
		"source":  r.Source,
		"message": r.Message,
	})
	return string(b)
}`,

"Sinks, destinations and the logger": `type Sink interface {
	Write(line string)
}

type ConsoleSink struct{ mu sync.Mutex }

func NewConsoleSink() *ConsoleSink { return &ConsoleSink{} }

func (s *ConsoleSink) Write(line string) {
	s.mu.Lock() // whole line under one lock
	defer s.mu.Unlock()
	fmt.Println(line)
}

type FileSink struct {
	mu  sync.Mutex
	f   *os.File
	out *bufio.Writer
}

func NewFileSink(path string) (*FileSink, error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	return &FileSink{f: f, out: bufio.NewWriter(f)}, nil
}

func (s *FileSink) Write(line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := fmt.Fprintln(s.out, line)
	if err == nil {
		err = s.out.Flush()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "log write failed:", err) // never fail the caller
	}
}

func (s *FileSink) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.out.Flush()
	return s.f.Close()
}

type Destination struct {
	minLevel  Level
	formatter Formatter
	sink      Sink
}

func NewDestination(minLevel Level, f Formatter, s Sink) Destination {
	return Destination{minLevel: minLevel, formatter: f, sink: s}
}

func (d Destination) Accepts(l Level) bool { return l >= d.minLevel }

func (d Destination) Accept(r LogRecord) {
	if d.Accepts(r.Level) {
		d.sink.Write(d.formatter.Format(r))
	}
}

type Logger struct {
	destinations []Destination // fixed at startup
	source       string
	now          func() time.Time
}

func NewLogger(ds ...Destination) *Logger {
	return &Logger{destinations: slices.Clone(ds), source: "main", now: time.Now}
}

// With returns a logger that labels its records with source; it shares the destinations.
func (l *Logger) With(source string) *Logger {
	c := *l
	c.source = source
	return &c
}

func (l *Logger) Log(level Level, message string) {
	l.Write(LogRecord{Time: l.now(), Level: level, Message: message, Source: l.source})
}

func (l *Logger) Write(r LogRecord) {
	for _, d := range l.destinations {
		d.Accept(r)
	}
}

func (l *Logger) Debug(m string) { l.Log(Debug, m) }
func (l *Logger) Info(m string)  { l.Log(Info, m) }
func (l *Logger) Warn(m string)  { l.Log(Warn, m) }
func (l *Logger) Error(m string) { l.Log(Error, m) }
func (l *Logger) Fatal(m string) { l.Log(Fatal, m) }`,

"A bounded queue and one writer thread": `type AsyncLogger struct {
	delegate *Logger
	queue    chan LogRecord
	dropped  atomic.Int64
	done     chan struct{}
}

func NewAsyncLogger(delegate *Logger, size int) *AsyncLogger {
	a := &AsyncLogger{delegate: delegate, queue: make(chan LogRecord, size), done: make(chan struct{})}
	go a.drain() // one writer goroutine
	return a
}

func (a *AsyncLogger) Log(level Level, message string) {
	r := LogRecord{Time: time.Now(), Level: level, Message: message, Source: a.delegate.source} // stamped by the caller
	if level >= Error {
		a.queue <- r // never drop errors: wait for room
		return
	}
	select {
	case a.queue <- r:
	default:
		a.dropped.Add(1) // never block for DEBUG/INFO/WARN
	}
}

func (a *AsyncLogger) drain() {
	for r := range a.queue { // ends once the channel is closed and empty
		a.delegate.Write(r)
	}
	close(a.done)
}

// Close stops accepting records and waits for the queue to drain. Don't call Log after Close.
func (a *AsyncLogger) Close() {
	close(a.queue)
	<-a.done
}`,

"Registry and inheritance by dotted name": `type NamedLogger struct {
	Name  string
	Level Level
}

type LoggerRegistry struct {
	mu         sync.Mutex
	loggers    map[string]*NamedLogger
	configured map[string]Level // e.g. "" (root) -> Warn, "com.shop" -> Info
}

func (r *LoggerRegistry) Get(name string) *NamedLogger {
	r.mu.Lock()
	defer r.mu.Unlock()
	if l, ok := r.loggers[name]; ok {
		return l // one logger per name
	}
	l := &NamedLogger{Name: name, Level: r.effectiveLevel(name)}
	r.loggers[name] = l
	return l
}

func (r *LoggerRegistry) effectiveLevel(name string) Level {
	for n := name; ; n = parent(n) {
		if l, ok := r.configured[n]; ok {
			return l
		}
		if n == "" {
			return Info // default if the root isn't configured
		}
	}
}

func parent(name string) string {
	if i := strings.LastIndex(name, "."); i >= 0 {
		return name[:i]
	}
	return ""
}`,

"A size-based rolling file sink": `type RollingFileSink struct {
	mu       sync.Mutex
	base     string
	maxBytes int64
	f        *os.File
	written  int64
}

func NewRollingFileSink(base string, maxBytes int64) (*RollingFileSink, error) {
	s := &RollingFileSink{base: base, maxBytes: maxBytes}
	return s, s.open()
}

func (s *RollingFileSink) Write(line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := int64(len(line) + 1)
	if s.written+n > s.maxBytes {
		if err := s.roll(); err != nil {
			fmt.Fprintln(os.Stderr, "log roll failed:", err)
			return
		}
	}
	if _, err := fmt.Fprintln(s.f, line); err != nil {
		fmt.Fprintln(os.Stderr, "log write failed:", err)
		return
	}
	s.written += n
}

func (s *RollingFileSink) roll() error {
	s.f.Close()
	if err := os.Rename(s.base, fmt.Sprintf("%s.%d", s.base, time.Now().UnixMilli())); err != nil {
		return err
	}
	return s.open()
}

func (s *RollingFileSink) open() error {
	f, err := os.OpenFile(s.base, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	info, err := f.Stat()
	if err != nil {
		f.Close()
		return err
	}
	s.f, s.written = f, info.Size()
	return nil
}`,

"Supplier overloads and an enabled check": `func (l *Logger) Enabled(level Level) bool {
	for _, d := range l.destinations {
		if d.Accepts(level) {
			return true
		}
	}
	return false
}

func (l *Logger) DebugFunc(message func() string) {
	if l.Enabled(Debug) {
		l.Log(Debug, message())
	}
}

// Usage: logger.DebugFunc(func() string { return "cart=" + cart.Detailed() })`,

"Logging library in one screen": `type Level int // Debug, Info, Warn, Error, Fatal

type LogRecord struct {
	Time            time.Time
	Level           Level
	Message, Source string
}

type Formatter interface{ Format(r LogRecord) string } // PlainFormatter, JSONFormatter
type Sink interface{ Write(line string) }              // ConsoleSink, FileSink (mutex inside)

type Destination struct {
	minLevel  Level
	formatter Formatter
	sink      Sink
}

type Logger struct{ destinations []Destination } // Log(level, msg) fans out to every destination`
} };
