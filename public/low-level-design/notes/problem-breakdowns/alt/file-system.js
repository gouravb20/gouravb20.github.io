// Go versions of the File System code blocks, matched to the Java blocks by title. Imports are omitted.
window.ALT = window.ALT || {};
ALT["file-system"] = { go: {
"The kind of usage to support": `fs := NewFileSystem()
fs.CreateDirectory("/home")
fs.CreateDirectory("/home/ana")
fs.CreateFile("/home/ana/notes.txt", "buy milk")
names, _ := fs.List("/home/ana")       // [notes.txt]
fs.Move("/home/ana/notes.txt", "/home")
fs.Rename("/home/notes.txt", "todo.txt")
todo, _ := fs.Get("/home/todo.txt")
p, _ := fs.PathOf(todo)                // "/home/todo.txt"
fs.Delete("/home/ana", false)
_, err := fs.Read("/home/missing.txt") // errors.Is(err, ErrNotFound)
// (most errors ignored above for brevity)`,

"FsPath and the exceptions": `// FsPath is a parsed absolute path: the names between the slashes. Parsing never touches the tree.
type FsPath struct{ parts []string }

func ParsePath(raw string) (FsPath, error) {
	if !strings.HasPrefix(raw, "/") {
		return FsPath{}, fmt.Errorf("%w: %q must be absolute", ErrInvalidPath, raw)
	}
	var parts []string
	for _, s := range strings.Split(raw, "/") {
		switch s {
		case "": // leading, trailing or doubled slashes
		case ".", "..":
			return FsPath{}, fmt.Errorf("%w: %q: . and .. are not supported", ErrInvalidPath, raw)
		default:
			parts = append(parts, s)
		}
	}
	return FsPath{parts}, nil
}

func (p FsPath) IsRoot() bool   { return len(p.parts) == 0 }
func (p FsPath) Name() string   { return p.parts[len(p.parts)-1] } // callers check IsRoot first
func (p FsPath) Parent() FsPath { return FsPath{p.parts[:len(p.parts)-1]} }
func (p FsPath) String() string { return "/" + strings.Join(p.parts, "/") }

// Sentinel errors, wrapped with details: callers test with errors.Is(err, ErrNotFound) and so on.
var (
	ErrNotFound          = errors.New("path not found")
	ErrAlreadyExists     = errors.New("already exists")
	ErrNotADirectory     = errors.New("not a directory")
	ErrNotAFile          = errors.New("not a file")
	ErrDirectoryNotEmpty = errors.New("directory not empty")
	ErrInvalidPath       = errors.New("invalid path")
	ErrInvalidOperation  = errors.New("invalid operation") // root, cycle
)`,

"Final class design": `type FileSystem struct {
	mu   sync.RWMutex // guards every node in the tree
	root *Directory   // created once; never deleted, moved or renamed
}

func (fs *FileSystem) CreateDirectory(path string) (*Directory, error) // parent must exist; name must be free
func (fs *FileSystem) CreateFile(path, content string) (*File, error)
func (fs *FileSystem) Read(path string) (string, error)
func (fs *FileSystem) Write(path, content string) error
func (fs *FileSystem) List(path string) ([]string, error)             // child names, sorted
func (fs *FileSystem) Delete(path string, recursive bool) error
func (fs *FileSystem) Move(srcPath, destDirPath string) error          // into destDir, keeping the name
func (fs *FileSystem) Rename(path, newName string) error
func (fs *FileSystem) Get(path string) (Node, error)                   // a reference, for PathOf
func (fs *FileSystem) PathOf(n Node) (string, error)                   // walks parent pointers

type Node interface {
	Name() string
	base() *nodeBase // unexported: only this package can implement Node
}

type nodeBase struct {
	name   atomic.Pointer[string]
	parent *Directory // nil for the root and for deleted nodes
}

type File struct {
	nodeBase
	content string
}

type Directory struct {
	nodeBase
	children map[string]Node
}

type FsPath struct{ parts []string } // ParsePath(raw), Parent(), Name()

// ErrNotFound, ErrAlreadyExists, ErrNotADirectory, ErrNotAFile,
// ErrDirectoryNotEmpty, ErrInvalidPath, ErrInvalidOperation`,

"Node, File and Directory": `// Node is the Composite's component. It holds state only; FileSystem holds the rules.
type Node interface {
	Name() string
	base() *nodeBase // unexported: only this package can implement Node or change structure
}

type nodeBase struct {
	name   atomic.Pointer[string] // atomic: a caller holding a node may read its name without the lock
	parent *Directory             // guarded by FileSystem.mu; nil for the root and for deleted nodes
}

func (b *nodeBase) Name() string     { return *b.name.Load() }
func (b *nodeBase) setName(n string) { b.name.Store(&n) }
func (b *nodeBase) base() *nodeBase  { return b }

type File struct {
	nodeBase
	content string // guarded by FileSystem.mu
}

func newFile(name, content string) *File {
	f := &File{content: content}
	f.setName(name)
	return f
}

type Directory struct {
	nodeBase
	children map[string]Node // guarded by FileSystem.mu
}

func newDirectory(name string) *Directory {
	d := &Directory{children: map[string]Node{}}
	d.setName(name)
	return d
}

func (d *Directory) child(name string) Node { return d.children[name] } // nil if absent
func (d *Directory) isEmpty() bool          { return len(d.children) == 0 }

func (d *Directory) names() []string {
	out := slices.Collect(maps.Keys(d.children))
	slices.Sort(out)
	return out
}

// add and remove change the map and the parent pointer together.
func (d *Directory) add(n Node) {
	d.children[n.Name()] = n
	n.base().parent = d
}

func (d *Directory) remove(n Node) {
	delete(d.children, n.Name())
	n.base().parent = nil
}`,

"FileSystem: lock, resolve, create, read, list": `type FileSystem struct {
	// One lock for the whole tree. Every operation checks before it changes anything (the parent
	// exists, the name is free, no cycle), so the check and the change must sit under the same lock.
	mu   sync.RWMutex
	root *Directory
}

func NewFileSystem() *FileSystem { return &FileSystem{root: newDirectory("")} }

func (fs *FileSystem) CreateDirectory(path string) (*Directory, error) {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	p, parent, err := fs.parentWithFreeName(path)
	if err != nil {
		return nil, err
	}
	d := newDirectory(p.Name())
	parent.add(d)
	return d, nil
}

func (fs *FileSystem) CreateFile(path, content string) (*File, error) {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	p, parent, err := fs.parentWithFreeName(path)
	if err != nil {
		return nil, err
	}
	f := newFile(p.Name(), content)
	parent.add(f)
	return f, nil
}

func (fs *FileSystem) Read(path string) (string, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	f, err := fs.file(path)
	if err != nil {
		return "", err
	}
	return f.content, nil
}

func (fs *FileSystem) Write(path, content string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	f, err := fs.file(path)
	if err != nil {
		return err
	}
	f.content = content
	return nil
}

func (fs *FileSystem) List(path string) ([]string, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	d, err := fs.dir(path)
	if err != nil {
		return nil, err
	}
	return d.names(), nil
}

func (fs *FileSystem) Get(path string) (Node, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	return fs.resolve(path)
}

// PathOf walks parent pointers to the root: O(depth), always current after moves and renames.
func (fs *FileSystem) PathOf(n Node) (string, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	return fs.pathOf(n)
}

// pathOf expects the caller to hold fs.mu. sync.RWMutex is not reentrant, so locked methods call this.
func (fs *FileSystem) pathOf(n Node) (string, error) {
	var names []string
	cur := n
	for cur.base().parent != nil {
		names = append(names, cur.Name())
		cur = cur.base().parent
	}
	if cur != Node(fs.root) {
		return "", fmt.Errorf("%w: %s is no longer in the tree", ErrNotFound, n.Name())
	}
	slices.Reverse(names)
	return "/" + strings.Join(names, "/"), nil
}

func (fs *FileSystem) resolve(raw string) (Node, error) {
	p, err := ParsePath(raw)
	if err != nil {
		return nil, err
	}
	return fs.resolvePath(p)
}

// resolvePath walks down from the root: one map lookup per segment, O(depth).
func (fs *FileSystem) resolvePath(p FsPath) (Node, error) {
	var cur Node = fs.root
	for _, part := range p.parts {
		d, ok := cur.(*Directory)
		if !ok {
			return nil, fmt.Errorf("%w: %s", ErrNotADirectory, p)
		}
		if cur = d.child(part); cur == nil {
			return nil, fmt.Errorf("%w: %s", ErrNotFound, p)
		}
	}
	return cur, nil
}

// parentWithFreeName: the parent must exist and be a folder, and must not already hold the name.
func (fs *FileSystem) parentWithFreeName(raw string) (FsPath, *Directory, error) {
	p, err := ParsePath(raw)
	if err != nil {
		return p, nil, err
	}
	if p.IsRoot() {
		return p, nil, fmt.Errorf("%w: /", ErrAlreadyExists)
	}
	n, err := fs.resolvePath(p.Parent())
	if err != nil {
		return p, nil, err
	}
	parent, ok := n.(*Directory)
	if !ok {
		return p, nil, fmt.Errorf("%w: %s", ErrNotADirectory, p.Parent())
	}
	if parent.child(p.Name()) != nil {
		return p, nil, fmt.Errorf("%w: %s", ErrAlreadyExists, p)
	}
	return p, parent, nil
}

func (fs *FileSystem) file(raw string) (*File, error) {
	n, err := fs.resolve(raw)
	if err != nil {
		return nil, err
	}
	f, ok := n.(*File)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrNotAFile, raw)
	}
	return f, nil
}

func (fs *FileSystem) dir(raw string) (*Directory, error) {
	n, err := fs.resolve(raw)
	if err != nil {
		return nil, err
	}
	d, ok := n.(*Directory)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrNotADirectory, raw)
	}
	return d, nil
}

// Delete, Move and Rename: next section`,

"FileSystem: delete, move, rename": `func (fs *FileSystem) Delete(path string, recursive bool) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	n, err := fs.resolve(path)
	if err != nil {
		return err
	}
	if n == Node(fs.root) {
		return fmt.Errorf("%w: cannot delete the root", ErrInvalidOperation)
	}
	if d, ok := n.(*Directory); ok && !d.isEmpty() && !recursive {
		return fmt.Errorf("%w: %s", ErrDirectoryNotEmpty, path)
	}
	n.base().parent.remove(n) // the subtree becomes unreachable and is garbage collected
	return nil
}

func (fs *FileSystem) Move(srcPath, destDirPath string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	n, err := fs.resolve(srcPath)
	if err != nil {
		return err
	}
	if n == Node(fs.root) {
		return fmt.Errorf("%w: cannot move the root", ErrInvalidOperation)
	}
	dest, err := fs.dir(destDirPath)
	if err != nil {
		return err
	}
	if n.base().parent == dest {
		return nil // already there
	}
	for a := dest; a != nil; a = a.parent { // is dest inside n?
		if Node(a) == n {
			return fmt.Errorf("%w: cannot move %s into its own subtree", ErrInvalidOperation, srcPath)
		}
	}
	if dest.child(n.Name()) != nil {
		return fmt.Errorf("%w: %s in %s", ErrAlreadyExists, n.Name(), destDirPath)
	}
	n.base().parent.remove(n) // every check passed: now mutate
	dest.add(n)
	return nil
}

func (fs *FileSystem) Rename(path, newName string) error {
	if newName == "" || newName == "." || newName == ".." || strings.Contains(newName, "/") {
		return fmt.Errorf("%w: bad name %q", ErrInvalidPath, newName)
	}
	fs.mu.Lock()
	defer fs.mu.Unlock()
	n, err := fs.resolve(path)
	if err != nil {
		return err
	}
	if n == Node(fs.root) {
		return fmt.Errorf("%w: cannot rename the root", ErrInvalidOperation)
	}
	if n.Name() == newName {
		return nil
	}
	parent := n.base().parent
	if parent.child(newName) != nil {
		where, _ := fs.pathOf(parent) // the unlocked helper: we already hold fs.mu
		return fmt.Errorf("%w: %s in %s", ErrAlreadyExists, newName, where)
	}
	parent.remove(n)          // the map is keyed by name: take it out,
	n.base().setName(newName) // change the name,
	parent.add(n)             // and file it under the new key
	return nil
}`,

"File system in one screen": `type Node interface{ Name() string }        // nodeBase: atomic name, parent *Directory
type File struct{ nodeBase; content string }
type Directory struct {                      // add/remove also set parent
	nodeBase
	children map[string]Node
}

type FsPath struct{ parts []string }         // ParsePath(raw), Parent(), Name()

type FileSystem struct {                     // the facade; every method under one RWMutex
	mu   sync.RWMutex
	root *Directory
}

func (fs *FileSystem) CreateDirectory(path string) (*Directory, error) // parentWithFreeName, then add
func (fs *FileSystem) CreateFile(path, content string) (*File, error)
func (fs *FileSystem) Read(path string) (string, error)
func (fs *FileSystem) Write(path, content string) error
func (fs *FileSystem) List(path string) ([]string, error)
func (fs *FileSystem) Delete(path string, recursive bool) error // root refused; non-empty needs recursive
func (fs *FileSystem) Move(src, destDir string) error           // root? dest dir? cycle? name free? then mutate
func (fs *FileSystem) Rename(path, newName string) error        // remove, setName, add: re-key the map
func (fs *FileSystem) Get(path string) (Node, error)
func (fs *FileSystem) PathOf(n Node) (string, error)            // walk up; must end at root`,

"Hand out snapshots, not live nodes": `// Entry is what callers get back: plain values, safe to keep and read on any goroutine.
type Entry struct {
	Path      string
	Directory bool
	Size      int
}

func (fs *FileSystem) Stat(path string) (Entry, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	p, err := ParsePath(path)
	if err != nil {
		return Entry{}, err
	}
	n, err := fs.resolvePath(p)
	if err != nil {
		return Entry{}, err
	}
	e := Entry{Path: p.String()}
	switch v := n.(type) {
	case *Directory:
		e.Directory = true
	case *File:
		e.Size = len(v.content)
	}
	return e, nil
}`,

"Folder sizes: recursive": `type Node interface {
	Name() string
	base() *nodeBase
	size() int64 // called under FileSystem.mu
}

func (f *File) size() int64 { return int64(len(f.content)) }

func (d *Directory) size() int64 { // O(subtree)
	var total int64
	for _, c := range d.children {
		total += c.size()
	}
	return total
}

func (fs *FileSystem) Size(path string) (int64, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	n, err := fs.resolve(path)
	if err != nil {
		return 0, err
	}
	return n.size(), nil
}`,

"Folder sizes: cached along the parent chain": `type Directory struct {
	nodeBase
	children  map[string]Node
	totalSize int64 // everything below; guarded by FileSystem.mu
}

func (d *Directory) size() int64 { return d.totalSize } // O(1)

func (d *Directory) add(n Node) {
	d.children[n.Name()] = n
	n.base().parent = d
	d.adjust(n.size())
}

func (d *Directory) remove(n Node) {
	delete(d.children, n.Name())
	d.adjust(-n.size())
	n.base().parent = nil
}

func (d *Directory) adjust(delta int64) { // the same upward walk as pathOf
	for cur := d; cur != nil; cur = cur.parent {
		cur.totalSize += delta
	}
}

func (f *File) setContent(c string) {
	delta := int64(len(c) - len(f.content))
	f.content = c
	if f.parent != nil {
		f.parent.adjust(delta)
	}
}`,

"A Session with a working directory": `// Session is one user's shell. It is not shared between goroutines, so cwd needs no lock;
// the tree itself is protected by FileSystem.mu.
type Session struct {
	fs  *FileSystem
	cwd Node // a reference, so it follows moves and renames
}

func NewSession(fs *FileSystem) *Session {
	root, _ := fs.Get("/")
	return &Session{fs: fs, cwd: root}
}

func (s *Session) Cd(path string) error {
	abs, err := s.absolute(path)
	if err != nil {
		return err
	}
	n, err := s.fs.Get(abs)
	if err != nil {
		return err
	}
	if _, ok := n.(*Directory); !ok {
		return fmt.Errorf("%w: %s", ErrNotADirectory, path)
	}
	s.cwd = n
	return nil
}

func (s *Session) Pwd() (string, error) { return s.fs.PathOf(s.cwd) } // fails if someone deleted it

func (s *Session) Ls(path string) ([]string, error) {
	abs, err := s.absolute(path)
	if err != nil {
		return nil, err
	}
	return s.fs.List(abs)
}

func (s *Session) Cat(path string) (string, error) {
	abs, err := s.absolute(path)
	if err != nil {
		return "", err
	}
	return s.fs.Read(abs)
}

// absolute joins onto the working directory and folds . and .. as text; .. at the root stays at the root.
func (s *Session) absolute(path string) (string, error) {
	var parts []string
	if !strings.HasPrefix(path, "/") {
		cwd, err := s.Pwd()
		if err != nil {
			return "", err
		}
		parts = strings.FieldsFunc(cwd, func(r rune) bool { return r == '/' })
	}
	for _, seg := range strings.Split(path, "/") {
		switch seg {
		case "", ".":
		case "..":
			if len(parts) > 0 {
				parts = parts[:len(parts)-1]
			}
		default:
			parts = append(parts, seg)
		}
	}
	return "/" + strings.Join(parts, "/"), nil
}`,

"Search with composable filters": `// Filter is a typed predicate; combine with And, Or and Not instead of a hand-written chain.
type Filter func(Node) bool

func (f Filter) And(g Filter) Filter { return func(n Node) bool { return f(n) && g(n) } }
func (f Filter) Or(g Filter) Filter  { return func(n Node) bool { return f(n) || g(n) } }
func Not(f Filter) Filter            { return func(n Node) bool { return !f(n) } }

func NameMatches(pattern string) Filter {
	re := regexp.MustCompile("^(?:" + pattern + ")$") // whole-name match, compiled once
	return func(n Node) bool { return re.MatchString(n.Name()) }
}

func IsFile() Filter { return func(n Node) bool { _, ok := n.(*File); return ok } }

func SizeAtLeast(bytes int) Filter {
	return func(n Node) bool { f, ok := n.(*File); return ok && len(f.content) >= bytes }
}

// Search walks under the read lock and returns paths rather than live nodes.
func (fs *FileSystem) Search(dirPath string, filter Filter) ([]string, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	p, err := ParsePath(dirPath)
	if err != nil {
		return nil, err
	}
	n, err := fs.resolvePath(p)
	if err != nil {
		return nil, err
	}
	d, ok := n.(*Directory)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrNotADirectory, dirPath)
	}
	prefix := p.String()
	if p.IsRoot() {
		prefix = ""
	}
	var found []string
	collect(d, prefix, filter, &found)
	return found, nil
}

func collect(dir *Directory, prefix string, filter Filter, out *[]string) {
	for _, name := range dir.names() { // sorted, so results are deterministic
		child := dir.child(name)
		path := prefix + "/" + name
		if filter(child) {
			*out = append(*out, path)
		}
		if d, ok := child.(*Directory); ok {
			collect(d, path, filter, out)
		}
	}
}

// fs.Search("/home", IsFile().And(NameMatches(".*[.]txt")).And(SizeAtLeast(1024)))`,

"A symlink is a third kind of node": `// Symlink implements Node like File and Directory (it embeds nodeBase).
type Symlink struct {
	nodeBase
	target string // an absolute path, resolved only when used
}

const maxHops = 40 // the same limit Linux uses

// resolveLinks follows links in the middle of a path; the last segment is returned as-is,
// so Delete and Rename act on the link itself.
func (fs *FileSystem) resolveLinks(p FsPath, hops *int) (Node, error) {
	var cur Node = fs.root
	for _, part := range p.parts {
		n, err := fs.follow(cur, hops)
		if err != nil {
			return nil, err
		}
		d, ok := n.(*Directory)
		if !ok {
			return nil, fmt.Errorf("%w: %s", ErrNotADirectory, p)
		}
		if cur = d.child(part); cur == nil {
			return nil, fmt.Errorf("%w: %s", ErrNotFound, p)
		}
	}
	return cur, nil
}

func (fs *FileSystem) follow(n Node, hops *int) (Node, error) {
	for {
		link, ok := n.(*Symlink)
		if !ok {
			return n, nil
		}
		*hops++
		if *hops > maxHops {
			return nil, fmt.Errorf("%w: too many links: %s", ErrInvalidPath, link.target)
		}
		p, err := ParsePath(link.target)
		if err != nil {
			return nil, err
		}
		if n, err = fs.resolveLinks(p, hops); err != nil {
			return nil, err
		}
	}
}

// Read and List call follow on the result of resolveLinks so they see the target.`,

"createDirectories, like mkdir -p": `func (fs *FileSystem) CreateDirectories(path string) (*Directory, error) {
	p, err := ParsePath(path)
	if err != nil {
		return nil, err
	}
	fs.mu.Lock()
	defer fs.mu.Unlock()
	cur, i := fs.root, 0
	for ; i < len(p.parts); i++ { // walk what exists
		next := cur.child(p.parts[i])
		if next == nil {
			break
		}
		d, ok := next.(*Directory)
		if !ok {
			return nil, fmt.Errorf("%w: %s", ErrNotADirectory, path) // a file in the way; nothing created yet
		}
		cur = d
	}
	for ; i < len(p.parts); i++ { // everything below is new, so no conflicts are possible
		d := newDirectory(p.parts[i])
		cur.add(d)
		cur = d
	}
	return cur, nil // an existing folder if the whole path was there
}`
} };
