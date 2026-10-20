// Go versions of the Main tab's code blocks for chapter 4, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch4 = ALT.ch4 || {};
ALT.ch4.go = Object.assign(ALT.ch4.go || {}, {
"Export gate with global and per-tenant caps": `var (
	ErrTenantBusy = errors.New("tenant is at its export limit")
	ErrAllBusy    = errors.New("all export slots busy")
)

type ExportGate struct {
	global    chan struct{} // buffered channel used as a semaphore
	tenantCap int
	mu        sync.Mutex // guards perTenant
	perTenant map[string]chan struct{}
}

func NewExportGate(globalCap, tenantCap int) *ExportGate {
	return &ExportGate{global: make(chan struct{}, globalCap), tenantCap: tenantCap,
		perTenant: map[string]chan struct{}{}}
}

func (g *ExportGate) tenant(id string) chan struct{} {
	g.mu.Lock()
	defer g.mu.Unlock()
	s, ok := g.perTenant[id]
	if !ok {
		s = make(chan struct{}, g.tenantCap)
		g.perTenant[id] = s
	}
	return s
}

func (g *ExportGate) Run(tenantID string, export func() error) error {
	mine := g.tenant(tenantID)
	select {
	case mine <- struct{}{}: // acquired a tenant permit
	default:
		return ErrTenantBusy
	}
	defer func() { <-mine }()
	select {
	case g.global <- struct{}{}: // acquired a global permit
	case <-time.After(2 * time.Second):
		return ErrAllBusy
	}
	defer func() { <-g.global }()
	return export()
}`,

"Sliding-window log rate limiter": `type SlidingWindowLimiter struct {
	limit  int
	window time.Duration
	mu     sync.Mutex  // guards stamps
	stamps []time.Time // oldest first
}

func NewSlidingWindowLimiter(limit int, window time.Duration) *SlidingWindowLimiter {
	return &SlidingWindowLimiter{limit: limit, window: window}
}

func (l *SlidingWindowLimiter) TryAcquire() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now() // carries a monotonic reading, so Sub is safe against clock changes
	i := 0
	for i < len(l.stamps) && now.Sub(l.stamps[i]) >= l.window {
		i++ // forget requests outside the window
	}
	l.stamps = l.stamps[i:]
	if len(l.stamps) >= l.limit {
		return false
	}
	l.stamps = append(l.stamps, now)
	return true
}`,
});
