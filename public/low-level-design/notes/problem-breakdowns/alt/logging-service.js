// Go versions of the Logging Service code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["logging-service"] = { go: {
"Final class design": `type Level int // Debug, Info, Warn, Error, Fatal: declaration order is severity order

// Go has no goroutine names, so the logger name is what says where a line came from.
type LogRecord struct {
	Time    time.Time
	Level   Level
	Logger  string
	Message string
}

type LoggerFactory struct {
	appenders []*Appender // fixed at startup, shared by every logger
	threshold Level       // the lowest level any appender accepts
	now       func() time.Time
	mu        sync.Mutex
	loggers   map[string]*Logger // one logger per name, guarded by mu
}

func NewLoggerFactory(appenders []*Appender, now func() time.Time) (*LoggerFactory, error) // error if empty
func (f *LoggerFactory) GetLogger(name string) *Logger
func (f *LoggerFactory) Close() // closes every sink once

type Logger struct {
	name      string
	appenders []*Appender
	threshold Level
	now       func() time.Time
}

func (l *Logger) Enabled(level Level) bool
func (l *Logger) Log(level Level, message string) // never panics into the caller
func (l *Logger) Debug(m string)                  // and Info, Warn, Error, Fatal

type Appender struct { // one destination
	minLevel  Level
	formatter Formatter
	sink      Sink
}

func (a *Appender) Accepts(level Level) bool
func (a *Appender) Append(r LogRecord) // filter, format, write

type Formatter interface{ Format(r LogRecord) string } // PlainFormatter, JSONFormatter

type Sink interface { // ConsoleSink, FileSink: one mutex each
	Write(line string)
	Close()
}`,

"Wiring it up at startup": `fileSink, err := NewFileSink("app.log")
if err != nil {
	return err
}
logs, err := NewLoggerFactory([]*Appender{
	NewAppender(Debug, PlainFormatter{}, NewConsoleSink(os.Stdout)),
	NewAppender(Warn, JSONFormatter{}, fileSink),
}, time.Now)
if err != nil {
	return err
}
defer logs.Close()

log := logs.GetLogger("payments") // usually one per package or type, kept in a variable
log.Info("user 42 signed in")     // console only
log.Error("charge failed")        // console and app.log`,

"LogLevel and LogRecord": `// Level: declaration order is severity order, so filtering is one comparison.
type Level int

const (
	Debug Level = iota
	Info
	Warn
	Error
	Fatal
)

func (l Level) String() string { return [...]string{"DEBUG", "INFO", "WARN", "ERROR", "FATAL"}[l] }

func (l Level) valid() bool { return l >= Debug && l <= Fatal }

func (l Level) AtLeast(min Level) bool { return l >= min }

// LogRecord is one log call, built once and passed by value to every appender,
// so no goroutine can change another's copy.
type LogRecord struct {
	Time    time.Time
	Level   Level
	Logger  string
	Message string
}`,

"Logger": `type Logger struct {
	name      string
	appenders []*Appender // shared with the factory, never modified
	threshold Level       // nothing below this can reach any appender
	now       func() time.Time
}

func (l *Logger) Enabled(level Level) bool { return level.valid() && level.AtLeast(l.threshold) }

func (l *Logger) Log(level Level, message string) {
	if !l.Enabled(level) { // unknown level, or below every appender: no record built
		return
	}
	r := LogRecord{Time: l.now(), Level: level, Logger: l.name, Message: message}
	for _, a := range l.appenders {
		appendSafely(a, r)
	}
}

// appendSafely keeps one broken formatter or sink from stopping the others or crashing the caller.
func appendSafely(a *Appender, r LogRecord) {
	defer func() {
		if p := recover(); p != nil {
			fmt.Fprintln(os.Stderr, "appender failed:", p)
		}
	}()
	a.Append(r)
}

func (l *Logger) Debug(m string) { l.Log(Debug, m) }
func (l *Logger) Info(m string)  { l.Log(Info, m) }
func (l *Logger) Warn(m string)  { l.Log(Warn, m) }
func (l *Logger) Error(m string) { l.Log(Error, m) }
func (l *Logger) Fatal(m string) { l.Log(Fatal, m) } // a level, not os.Exit`,

"LoggerFactory": `type LoggerFactory struct {
	appenders []*Appender
	threshold Level
	now       func() time.Time

	mu      sync.Mutex
	loggers map[string]*Logger // guarded by mu
}

func NewLoggerFactory(appenders []*Appender, now func() time.Time) (*LoggerFactory, error) {
	if len(appenders) == 0 { // fail at startup, not on every call
		return nil, errors.New("configure at least one appender")
	}
	f := &LoggerFactory{appenders: slices.Clone(appenders), threshold: Fatal, now: now, loggers: map[string]*Logger{}}
	for _, a := range f.appenders {
		f.threshold = min(f.threshold, a.minLevel)
	}
	return f, nil
}

// GetLogger returns the same logger for the same name, even when many goroutines ask at once.
func (f *LoggerFactory) GetLogger(name string) *Logger {
	if strings.TrimSpace(name) == "" {
		name = "root"
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if l, ok := f.loggers[name]; ok {
		return l
	}
	l := &Logger{name: name, appenders: f.appenders, threshold: f.threshold, now: f.now}
	f.loggers[name] = l
	return l
}

// Close flushes and closes each sink once, even if two appenders share it.
func (f *LoggerFactory) Close() {
	seen := map[Sink]bool{}
	for _, a := range f.appenders {
		if !seen[a.sink] {
			seen[a.sink] = true
			a.sink.Close()
		}
	}
}`,

"Appender": `// Appender is one destination: a minimum level, a format and a place to write.
// Never changed after NewAppender, so any goroutine may use it.
type Appender struct {
	minLevel  Level
	formatter Formatter
	sink      Sink
}

func NewAppender(minLevel Level, f Formatter, s Sink) *Appender {
	return &Appender{minLevel: minLevel, formatter: f, sink: s}
}

func (a *Appender) Accepts(level Level) bool { return level.AtLeast(a.minLevel) }

func (a *Appender) Append(r LogRecord) {
	if a.Accepts(r.Level) {
		a.sink.Write(a.formatter.Format(r)) // format outside the sink's mutex
	}
}`,

"Formatters: plain text and JSON": `type Formatter interface {
	Format(r LogRecord) string
}

// PlainFormatter: 2026-10-21T08:00:01Z INFO payments - user 42 signed in
type PlainFormatter struct{}

func (PlainFormatter) Format(r LogRecord) string {
	return r.Time.UTC().Format(time.RFC3339) + " " + r.Level.String() + " " + r.Logger + " - " + r.Message
}

// JSONFormatter writes one JSON object per line; encoding/json escapes quotes and newlines.
type JSONFormatter struct{}

func (JSONFormatter) Format(r LogRecord) string {
	b, _ := json.Marshal(map[string]string{ // a map of strings always marshals; keys come out sorted
		"time":    r.Time.UTC().Format(time.RFC3339),
		"level":   r.Level.String(),
		"logger":  r.Logger,
		"message": r.Message,
	})
	return string(b)
}`,

"Sinks: console and file": `// Sink writes one whole line. Implementations must never interleave two lines,
// and never panic on an I/O failure.
type Sink interface {
	Write(line string)
	Close()
}

type ConsoleSink struct {
	mu  sync.Mutex
	out io.Writer
}

func NewConsoleSink(out io.Writer) *ConsoleSink { return &ConsoleSink{out: out} }

func (s *ConsoleSink) Write(line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fmt.Fprintln(s.out, line)
}

func (s *ConsoleSink) Close() {}

type FileSink struct {
	mu     sync.Mutex // guards everything below
	f      *os.File
	out    *bufio.Writer
	closed bool
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
	if s.closed { // late records after shutdown are dropped
		return
	}
	_, err := fmt.Fprintln(s.out, line)
	if err == nil {
		err = s.out.Flush() // in the file before Write returns
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "log write failed:", err) // never fail the caller
	}
}

func (s *FileSink) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	s.out.Flush()
	if err := s.f.Close(); err != nil {
		fmt.Fprintln(os.Stderr, "log close failed:", err)
	}
}`,

"Trace setup: in-memory sinks and a test clock": `// MemorySink keeps lines in memory so a test can assert exactly what each destination received.
type MemorySink struct {
	mu    sync.Mutex
	lines []string
}

func (s *MemorySink) Write(line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lines = append(s.lines, line)
}

func (s *MemorySink) Close() {}

func (s *MemorySink) Lines() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.lines)
}

// The test clock starts at 08:00:00Z and advances one second each time a record is stamped.
start := time.Date(2026, 10, 21, 8, 0, 0, 0, time.UTC)
var ticks atomic.Int64
testClock := func() time.Time { return start.Add(time.Duration(ticks.Add(1)) * time.Second) }

console, file := &MemorySink{}, &MemorySink{}
logs, _ := NewLoggerFactory([]*Appender{
	NewAppender(Debug, PlainFormatter{}, console),
	NewAppender(Warn, JSONFormatter{}, file),
}, testClock)`,

"Logging library in one screen": `type Level int // Debug, Info, Warn, Error, Fatal; AtLeast is l >= min

type LogRecord struct {
	Time            time.Time
	Level           Level
	Logger, Message string
}

type Formatter interface{ Format(r LogRecord) string } // PlainFormatter, JSONFormatter (escapes)

type Sink interface { // ConsoleSink, FileSink: mutex around each whole line
	Write(line string)
	Close()
}

type Appender struct { // minLevel + Formatter + Sink: N + M types
	minLevel  Level
	formatter Formatter
	sink      Sink
}

// Log: invalid or below threshold returns; otherwise one record, each appender behind recover; never panics.
func (l *Logger) Log(level Level, msg string)

func (f *LoggerFactory) GetLogger(name string) *Logger // a value you pass around, not a global; one per name
func (f *LoggerFactory) Close()                        // each distinct sink once`,

"AsyncSink: a bounded queue in front of any sink": `// AsyncSink wraps any sink: callers enqueue the finished line, one goroutine does the slow I/O.
type AsyncSink struct {
	inner   Sink // touched only by the drain goroutine until Close
	queue   chan string
	dropped atomic.Int64
	done    chan struct{}

	mu     sync.RWMutex // Write holds it shared; Close takes it exclusively, so no send races the close
	closed bool
}

func NewAsyncSink(inner Sink, capacity int) *AsyncSink {
	s := &AsyncSink{inner: inner, queue: make(chan string, capacity), done: make(chan struct{})}
	go s.drain()
	return s
}

func (s *AsyncSink) Write(line string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.closed {
		s.dropped.Add(1)
		return
	}
	select {
	case s.queue <- line:
	default:
		s.dropped.Add(1) // never block the caller
	}
}

func (s *AsyncSink) drain() {
	for line := range s.queue { // ends once the channel is closed and empty
		s.inner.Write(line)
	}
	close(s.done)
}

func (s *AsyncSink) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	close(s.queue) // stop accepting; drain finishes what is queued
	s.mu.Unlock()
	<-s.done
	if n := s.dropped.Load(); n > 0 {
		s.inner.Write(fmt.Sprintf("dropped %d log lines: queue full", n))
	}
	s.inner.Close()
}

// Configuration only: the busy file goes through the queue; Error and above also go synchronously to errors.log.
//   NewAppender(Info, JSONFormatter{}, NewAsyncSink(appLog, 10_000))
//   NewAppender(Error, JSONFormatter{}, errorsLog)`,

"Per-name levels from the nearest configured ancestor": `// On LoggerFactory: levels map[string]Level, never modified after construction,
// e.g. "" (root) -> Warn, "com.shop" -> Info, "com.shop.payments" -> Debug.
// GetLogger now creates loggers with threshold: max(f.threshold, f.effectiveLevel(name)).

// effectiveLevel walks com.shop.payments.Refunds, com.shop.payments, com.shop, com, then the root "".
func (f *LoggerFactory) effectiveLevel(name string) Level {
	for n := name; ; n = parent(n) {
		if l, ok := f.levels[n]; ok {
			return l
		}
		if n == "" {
			return Info // the root wasn't configured
		}
	}
}

func parent(name string) string {
	if i := strings.LastIndex(name, "."); i >= 0 {
		return name[:i]
	}
	return ""
}`,

"Swapping the whole configuration at once": `// LogConfig is everything a log call reads, in one value that is replaced whole, never edited.
type LogConfig struct {
	Appenders []*Appender
	Threshold Level
}

func NewLogConfig(appenders []*Appender) *LogConfig {
	c := &LogConfig{Appenders: slices.Clone(appenders), Threshold: Fatal}
	for _, a := range c.Appenders {
		c.Threshold = min(c.Threshold, a.minLevel)
	}
	return c
}

// On LoggerFactory: config atomic.Pointer[LogConfig]. Loggers keep a pointer to the factory.
func (f *LoggerFactory) Current() *LogConfig { return f.config.Load() }

func (f *LoggerFactory) Reconfigure(next *LogConfig) {
	f.config.Store(next) // sinks only the old config used may still be mid-write elsewhere: close them later, not here
}

// Log reads the config once, so one call sees one consistent set of appenders and threshold.
func (l *Logger) Log(level Level, message string) {
	c := l.factory.Current()
	if !level.valid() || !level.AtLeast(c.Threshold) {
		return
	}
	r := LogRecord{Time: l.now(), Level: level, Logger: l.name, Message: message}
	for _, a := range c.Appenders {
		appendSafely(a, r)
	}
}`,

"A size-based rolling file sink": `type RollingFileSink struct {
	mu       sync.Mutex // guards everything below
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
		if err := s.roll(); err != nil { // with the mutex held, so no line is split across files
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

func (s *RollingFileSink) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.f.Close()
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

"Supplier overloads and parameterised messages": `// DebugFunc builds the message only if some appender would write it.
func (l *Logger) DebugFunc(message func() string) {
	if l.Enabled(Debug) {
		l.Log(Debug, message())
	}
}

// Debugf formats only after the level check.
func (l *Logger) Debugf(format string, args ...any) {
	if l.Enabled(Debug) {
		l.Log(Debug, fmt.Sprintf(format, args...))
	}
}

// Usage: log.DebugFunc(func() string { return "cart=" + cart.Detailed() })
//        log.Debugf("user %d added %d items", userID, count)`
} };
