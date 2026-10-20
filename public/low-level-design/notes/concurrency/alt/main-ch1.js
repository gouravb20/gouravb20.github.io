// Go versions of the Main tab's code blocks for chapter 1, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT.ch1 = ALT.ch1 || {};
ALT.ch1.go = Object.assign(ALT.ch1.go || {}, {
"URL shortener made thread-safe": `type URLShortener struct {
	domain string       // set once in the constructor, never changed
	nextID atomic.Int64 // atomic counter
	mu     sync.RWMutex // guards codes
	codes  map[string]string
}

func NewURLShortener(domain string) *URLShortener {
	return &URLShortener{domain: domain, codes: map[string]string{}}
}

func (s *URLShortener) Shorten(url string) string {
	for {
		code := strconv.FormatInt(s.nextID.Add(1), 36) // unique per call
		if s.ClaimAlias(code, url) {                    // skip codes already taken by aliases
			return s.domain + "/" + code
		}
	}
}

func (s *URLShortener) ClaimAlias(alias, url string) bool {
	s.mu.Lock() // check and insert under one lock
	defer s.mu.Unlock()
	if _, taken := s.codes[alias]; taken {
		return false
	}
	s.codes[alias] = url
	return true
}

func (s *URLShortener) Resolve(code string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	url, ok := s.codes[code]
	return url, ok
}`,
});
