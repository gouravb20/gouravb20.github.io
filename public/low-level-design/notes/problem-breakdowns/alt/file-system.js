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
n, _ := fs.Get("/home/todo.txt")
n.Path()                               // "/home/todo.txt"
fs.Delete("/home/ana", false)
_, err := fs.Read("/home/missing.txt") // errors.Is(err, ErrNotFound)
// (errors ignored above for brevity)`,

"Nodes": `// Node is the Composite's component; File is the leaf, Directory the composite.
type Node interface {
	Name() string
	Parent() *Directory
	Path() string
	base() *nodeBase // unexported: only this package can change structure
}

type nodeBase struct {
	name   string
	parent *Directory // nil only for the root
}

func (b *nodeBase) Name() string       { return b.name }
func (b *nodeBase) Parent() *Directory { return b.parent }
func (b *nodeBase) base() *nodeBase    { return b }

// pathOf walks parent pointers: O(depth), always correct after moves.
func pathOf(n Node) string {
	if n.Parent() == nil {
		return "/"
	}
	var parts []string
	for cur := n; cur.Parent() != nil; cur = cur.Parent() {
		parts = append(parts, cur.Name())
	}
	slices.Reverse(parts)
	return "/" + strings.Join(parts, "/")
}

type File struct {
	nodeBase
	content string
}

func (f *File) Path() string { return pathOf(f) }
func (f *File) Read() string { return f.content }

type Directory struct {
	nodeBase
	children map[string]Node
}

func newDirectory(name string) *Directory {
	return &Directory{nodeBase: nodeBase{name: name}, children: map[string]Node{}}
}

func (d *Directory) Path() string  { return pathOf(d) }
func (d *Directory) IsEmpty() bool { return len(d.children) == 0 }

func (d *Directory) Child(name string) (Node, bool) {
	n, ok := d.children[name]
	return n, ok
}

func (d *Directory) List() []Node {
	out := slices.Collect(maps.Values(d.children))
	slices.SortFunc(out, func(a, b Node) int { return strings.Compare(a.Name(), b.Name()) })
	return out
}

func (d *Directory) add(n Node) {
	d.children[n.Name()] = n
	n.base().parent = d
}

func (d *Directory) remove(n Node) {
	delete(d.children, n.Name())
	n.base().parent = nil
}`,

"Paths and exceptions": `type FsPath struct{ parts []string }

func ParsePath(raw string) (FsPath, error) {
	if !strings.HasPrefix(raw, "/") {
		return FsPath{}, fmt.Errorf("%w: %q must be absolute", ErrInvalidPath, raw)
	}
	var parts []string
	for _, s := range strings.Split(raw, "/") {
		switch s {
		case "": // leading, trailing, doubled slashes
		case ".", "..":
			return FsPath{}, fmt.Errorf("%w: %q: relative segments are not supported", ErrInvalidPath, raw)
		default:
			parts = append(parts, s)
		}
	}
	return FsPath{parts}, nil
}

func (p FsPath) IsRoot() bool   { return len(p.parts) == 0 }
func (p FsPath) Name() string   { return p.parts[len(p.parts)-1] }
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
	ErrInvalidOperation  = errors.New("invalid operation") // delete root, move into own subtree
)`,

"FileSystem: resolve, create, read, list": `type FileSystem struct {
	root *Directory
}

func NewFileSystem() *FileSystem { return &FileSystem{root: newDirectory("")} }

func (fs *FileSystem) Get(path string) (Node, error) {
	p, err := ParsePath(path)
	if err != nil {
		return nil, err
	}
	return fs.resolve(p)
}

func (fs *FileSystem) CreateDirectory(path string) (*Directory, error) {
	p, parent, err := fs.parentFor(path)
	if err != nil {
		return nil, err
	}
	d := newDirectory(p.Name())
	parent.add(d)
	return d, nil
}

func (fs *FileSystem) CreateFile(path, content string) (*File, error) {
	p, parent, err := fs.parentFor(path)
	if err != nil {
		return nil, err
	}
	f := &File{nodeBase: nodeBase{name: p.Name()}, content: content}
	parent.add(f)
	return f, nil
}

func (fs *FileSystem) Read(path string) (string, error) {
	f, err := fs.file(path)
	if err != nil {
		return "", err
	}
	return f.Read(), nil
}

func (fs *FileSystem) Write(path, content string) error {
	f, err := fs.file(path)
	if err != nil {
		return err
	}
	f.content = content
	return nil
}

func (fs *FileSystem) List(path string) ([]string, error) {
	n, err := fs.Get(path)
	if err != nil {
		return nil, err
	}
	d, ok := n.(*Directory)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrNotADirectory, path)
	}
	var names []string
	for _, c := range d.List() {
		names = append(names, c.Name())
	}
	return names, nil
}

// resolve walks from the root: one map lookup per segment, O(depth).
func (fs *FileSystem) resolve(p FsPath) (Node, error) {
	var cur Node = fs.root
	for _, part := range p.parts {
		d, ok := cur.(*Directory)
		if !ok {
			return nil, fmt.Errorf("%w: %s", ErrNotADirectory, cur.Path())
		}
		if cur, ok = d.Child(part); !ok {
			return nil, fmt.Errorf("%w: %s", ErrNotFound, p)
		}
	}
	return cur, nil
}

// parentFor checks that the parent exists, is a directory, and doesn't already contain the name.
func (fs *FileSystem) parentFor(path string) (FsPath, *Directory, error) {
	p, err := ParsePath(path)
	if err != nil {
		return p, nil, err
	}
	if p.IsRoot() {
		return p, nil, fmt.Errorf("%w: /", ErrAlreadyExists)
	}
	n, err := fs.resolve(p.Parent())
	if err != nil {
		return p, nil, err
	}
	parent, ok := n.(*Directory)
	if !ok {
		return p, nil, fmt.Errorf("%w: %s", ErrNotADirectory, p.Parent())
	}
	if _, taken := parent.Child(p.Name()); taken {
		return p, nil, fmt.Errorf("%w: %s", ErrAlreadyExists, p)
	}
	return p, parent, nil
}

func (fs *FileSystem) file(path string) (*File, error) {
	n, err := fs.Get(path)
	if err != nil {
		return nil, err
	}
	f, ok := n.(*File)
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrNotAFile, path)
	}
	return f, nil
}`,

"Delete, move, rename": `func (fs *FileSystem) Delete(path string, recursive bool) error {
	p, err := ParsePath(path)
	if err != nil {
		return err
	}
	if p.IsRoot() {
		return fmt.Errorf("%w: cannot delete the root", ErrInvalidOperation)
	}
	n, err := fs.resolve(p)
	if err != nil {
		return err
	}
	if d, ok := n.(*Directory); ok && !d.IsEmpty() && !recursive {
		return fmt.Errorf("%w: %s", ErrDirectoryNotEmpty, path)
	}
	n.Parent().remove(n) // the subtree becomes unreachable and is garbage collected
	return nil
}

func (fs *FileSystem) Move(srcPath, destDirPath string) error {
	n, err := fs.Get(srcPath)
	if err != nil {
		return err
	}
	if n.Parent() == nil {
		return fmt.Errorf("%w: cannot move the root", ErrInvalidOperation)
	}
	dn, err := fs.Get(destDirPath)
	if err != nil {
		return err
	}
	dest, ok := dn.(*Directory)
	if !ok {
		return fmt.Errorf("%w: %s", ErrNotADirectory, destDirPath)
	}
	for a := dest; a != nil; a = a.Parent() { // no folder inside itself
		if Node(a) == n {
			return fmt.Errorf("%w: cannot move %s into its own subtree", ErrInvalidOperation, srcPath)
		}
	}
	if _, taken := dest.Child(n.Name()); taken {
		return fmt.Errorf("%w: %s/%s", ErrAlreadyExists, dest.Path(), n.Name())
	}
	n.Parent().remove(n) // all checks passed: now mutate
	dest.add(n)
	return nil
}

func (fs *FileSystem) Rename(path, newName string) error {
	if newName == "" || strings.Contains(newName, "/") {
		return fmt.Errorf("%w: invalid name %q", ErrInvalidPath, newName)
	}
	n, err := fs.Get(path)
	if err != nil {
		return err
	}
	parent := n.Parent()
	if parent == nil {
		return fmt.Errorf("%w: cannot rename the root", ErrInvalidOperation)
	}
	if _, taken := parent.Child(newName); taken {
		return fmt.Errorf("%w: %s/%s", ErrAlreadyExists, parent.Path(), newName)
	}
	parent.remove(n)
	n.base().name = newName
	parent.add(n) // re-key the parent's map
	return nil
}`,

"The cycle check is a short upward walk": `func isAncestorOrSelf(candidate Node, start *Directory) bool {
	for d := start; d != nil; d = d.Parent() {
		if Node(d) == candidate {
			return true
		}
	}
	return false // O(depth of the destination)
}`,

"One read-write lock around the tree": `type FileSystem struct {
	mu   sync.RWMutex
	root *Directory
}

func (fs *FileSystem) List(path string) ([]string, error) {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	return fs.list(path) // the single-threaded logic, unchanged
}

func (fs *FileSystem) Move(src, destDir string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	return fs.move(src, destDir)
}

// ...same pattern for every exported method`,

"Recursive version (simple, O(subtree))": `type Node interface {
	// ... as before
	Size() int64
}

func (f *File) Size() int64 { return int64(len(f.content)) }

func (d *Directory) Size() int64 {
	var total int64
	for _, c := range d.children {
		total += c.Size()
	}
	return total
}`,

"Cached version (O(1) reads, O(depth) updates)": `type Directory struct {
	nodeBase
	children  map[string]Node
	totalSize int64 // sum of everything below
}

func (d *Directory) Size() int64 { return d.totalSize }

func (d *Directory) adjustSize(delta int64) { // walk up, applying the change
	for cur := d; cur != nil; cur = cur.parent {
		cur.totalSize += delta
	}
}

// FileSystem calls it on every change:
//   write:  f.parent.adjustSize(int64(len(newContent) - len(oldContent)))
//   add:    parent.adjustSize(n.Size())
//   remove: oldParent.adjustSize(-n.Size())   (a move is remove + add)`,

"Class sketch": `type Node interface {
	Name() string
	Parent() *Directory
	Path() string
}

type File struct {      // Read(), write
	nodeBase
	content string
}

type Directory struct { // Child(name), List()
	nodeBase
	children map[string]Node
}

type FsPath struct{ parts []string } // ParsePath(raw), Parent(), Name()

type FileSystem struct{ root *Directory }

func (fs *FileSystem) Get(path string) (Node, error)
func (fs *FileSystem) CreateDirectory(path string) (*Directory, error)
func (fs *FileSystem) CreateFile(path, content string) (*File, error)
func (fs *FileSystem) Read(path string) (string, error)
func (fs *FileSystem) Write(path, content string) error
func (fs *FileSystem) List(path string) ([]string, error)
func (fs *FileSystem) Delete(path string, recursive bool) error
func (fs *FileSystem) Move(src, destDir string) error
func (fs *FileSystem) Rename(path, newName string) error`
} };
