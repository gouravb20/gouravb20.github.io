// Deep dives: File System (LLD practice set). Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP["file-system"] = {
  hook: `<p>Once the core works, interviewers add twists to see whether the design bends without breaking. You rarely implement them in full; you show which class changes and why the rest doesn't. In this design almost every follow-up lands in one of three places: a new <code>Node</code> type, a new method on the <code>FileSystem</code> facade, or a new class that sits in front of it. Mid-level candidates may get one or two of these, senior candidates several, in more depth.</p>`,
  sections: [
    {
      id: "thread-safety",
      title: "\"Many threads share one instance. Is that safe, and could it be faster?\"",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "text", html: `<p>The solution already puts every public method under one <code>ReentrantReadWriteLock</code>. The follow-up usually probes two things: whether finer locking would help, and whether anything leaks out of the lock.</p>` },
        { type: "compare", items: [
          { title: "One read-write lock (the solution)", tone: "ok", html: `<p>Reads run in parallel; changes run one at a time. Every check-then-act (name free, no cycle) is atomic because the whole operation holds the lock. Only <code>FileSystem</code> changes; nodes stay plain.</p>` },
          { title: "A lock per folder", tone: "warn", html: `<p>Writes in different folders run in parallel. But a move touches the source's parent, the destination and every ancestor of the destination (the cycle check), and those locks must be taken in one global order to avoid deadlock. Get the set wrong and two moves can pass their checks together.</p>` },
          { title: "Copy-on-write snapshots", tone: "info", html: `<p>Readers take an immutable tree from an <code>AtomicReference</code> with no lock; a writer copies the nodes along one path and swaps the root. Great for read-heavy loads, but a shared, immutable node can't have one parent pointer, so <code>pathOf</code> and the cycle check need a different approach.</p>` }
        ] },
        { type: "text", html: `<p>Stay with the single lock unless the interviewer gives you measured write contention. The other leak to close is <em>live nodes</em>: a caller holding a <code>Node</code> outside the lock could watch its parent change mid-walk. The solution already keeps node mutators package-private and answers paths through <code>pathOf</code>. For richer queries, return plain values built under the lock.</p>` },
        { type: "code", lang: "java", title: "Hand out snapshots, not live nodes", code: `/** What callers get back: plain values, safe to keep and read on any thread. */
public record Entry(String path, boolean directory, int size) {}

// In FileSystem
public Entry stat(String path) {
    return reading(() -> {
        Node n = resolve(path);
        int size = n instanceof File f ? f.content().length() : 0;
        return new Entry(FsPath.parse(path).toString(), n instanceof Directory, size);
    });
}` },
        { type: "keypoints", items: [
          "Only <code>FileSystem</code> changes: one new method and one record. Nodes and paths are untouched.",
          "Callers that need a path from a held reference still go through <code>pathOf</code>, which walks under the read lock.",
          "If writes do become the bottleneck, shard first (several independent trees, for example one per user) before attempting per-folder locks."
        ] },
        { type: "quiz", q: "With a lock per folder, thread 1 runs <code>move(\"/x/a\", \"/y/b\")</code> while thread 2 runs <code>move(\"/y/b\", \"/x/a\")</code>. Each locks only the source's parent and the destination. What can happen?", options: [
          "Nothing: the two moves lock different folders, so they don't interfere",
          "A deadlock, every time",
          "Both cycle checks pass before either move lands, so a ends up inside b and b inside a, a loop cut off from the root",
          "The second move always fails with AlreadyExistsException"
        ], answer: 2, explain: `<p>Thread 1 locks <code>x</code> and <code>b</code>; thread 2 locks <code>y</code> and <code>a</code>. The sets don't overlap, so both proceed. Thread 1 walks up from <code>b</code> (b, y, root) and doesn't meet <code>a</code>; thread 2 walks up from <code>a</code> (a, x, root) and doesn't meet <code>b</code>. Both move, and the two folders now contain each other. A move must also lock the ancestor chain it checks, which is why the single lock is the sensible default.</p>` }
      ]
    },
    {
      id: "sizes",
      title: "\"How big is /home?\"",
      kicker: "Follow-up: aggregates",
      blocks: [
        { type: "text", html: `<p>Folder size is the classic Composite operation: a file's size is its content length; a folder's is the sum of its children. Start with the recursive version, then offer the cached one if sizes are read often.</p>` },
        { type: "code", lang: "java", title: "Folder sizes: recursive", code: `public abstract sealed class Node permits File, Directory {
    abstract long size();                              // called under the FileSystem lock
}

public final class File extends Node {
    long size() { return content().length(); }
}

public final class Directory extends Node {
    long size() { return children.values().stream().mapToLong(Node::size).sum(); }   // O(subtree)
}

// In FileSystem
public long size(String path) { return reading(() -> resolve(path).size()); }` },
        { type: "code", lang: "java", title: "Folder sizes: cached along the parent chain", code: `public final class Directory extends Node {
    private long totalSize;                            // everything below; guarded by the FileSystem lock

    long size() { return totalSize; }                  // O(1)

    void add(Node n)    { children.put(n.name(), n); n.setParent(this); adjust(n.size()); }
    void remove(Node n) { children.remove(n.name()); adjust(-n.size()); n.setParent(null); }

    void adjust(long delta) {                          // the same upward walk as pathOf
        for (Directory d = this; d != null; d = d.parent()) d.totalSize += delta;
    }
}

public final class File extends Node {
    void setContent(String c) {
        long delta = c.length() - content.length();
        content = c;
        if (parent() != null) parent().adjust(delta);
    }
}` },
        { type: "keypoints", items: [
          "The change stays inside the nodes: <code>add</code>, <code>remove</code> and <code>setContent</code> already run on every structural change, so <code>FileSystem</code> only gains a <code>size(path)</code> method.",
          "A move is a remove plus an add, so the old ancestors lose the subtree's size and the new ones gain it. A rename does both on the same parent and nets to zero.",
          "The cost moves from reads to writes: every change now walks O(depth) up. Worth it when sizes are read far more often than files change.",
          "Thread safety is unchanged: <code>totalSize</code> is only touched inside operations that already hold the write lock."
        ] }
      ]
    },
    {
      id: "working-directory",
      title: "\"How would you add a current directory, with . and ..?\"",
      kicker: "Follow-up: relative paths",
      blocks: [
        { type: "text", html: `<p>A current directory belongs to a user's shell, not to the file system, so put it in a new class and leave <code>FileSystem</code> working purely with absolute paths. The <code>Session</code> turns a relative path into an absolute one, then calls the facade as any other caller would.</p>` },
        { type: "code", lang: "java", title: "A Session with a working directory", code: `/** One user's shell. Not shared between threads, so cwd needs no lock; the tree has FileSystem's lock. */
public final class Session {
    private final FileSystem fs;
    private Node cwd;                                  // a reference, so it follows moves and renames

    public Session(FileSystem fs) { this.fs = fs; this.cwd = fs.get("/"); }

    public void cd(String path) {
        Node target = fs.get(absolute(path));
        if (!(target instanceof Directory)) throw new NotADirectoryException(path);
        cwd = target;
    }

    public String pwd()                   { return fs.pathOf(cwd); }   // throws if someone deleted it
    public List<String> ls(String path)   { return fs.list(absolute(path)); }
    public String cat(String path)        { return fs.read(absolute(path)); }

    /** Join onto the working directory and fold . and .. as text; .. at the root stays at the root. */
    String absolute(String path) {
        Deque<String> parts = new ArrayDeque<>();
        if (!path.startsWith("/")) {
            for (String s : pwd().split("/")) if (!s.isEmpty()) parts.addLast(s);
        }
        for (String s : path.split("/")) {
            if (s.isEmpty() || s.equals(".")) continue;
            if (s.equals("..")) parts.pollLast();      // does nothing on an empty deque: the root's parent is the root
            else parts.addLast(s);
        }
        return "/" + String.join("/", parts);
    }
}` },
        { type: "keypoints", items: [
          "<code>FileSystem</code>, <code>FsPath</code> and the nodes don't change. <code>FsPath</code> still rejects <code>.</code> and <code>..</code>, because by the time a path reaches it the <code>Session</code> has folded them away.",
          "Holding the working directory as a <code>Node</code> rather than a string means it follows a move of that folder, the way a Unix shell does; <code>pathOf</code> gives the current path each time.",
          "Converting and then calling is two lock acquisitions, so a concurrent move can make the computed path stale and the call fails with <code>PathNotFoundException</code>. That is the same race a real shell has, and it fails loudly rather than touching the wrong file.",
          "Folding <code>..</code> as text is correct here because there are no symlinks. With symlinks, <code>..</code> should follow the parent pointer of the resolved folder instead."
        ] }
      ]
    },
    {
      id: "search",
      title: "\"Find every .txt file under /home bigger than 1 KB\"",
      kicker: "Follow-up: search",
      blocks: [
        { type: "text", html: `<p>The awesome-low-level-design solution answers this with a search Strategy that runs a chain of filters, each reading its settings from a <code>Map&lt;String, Object&gt;</code>. The idea is right (filters you can combine), but the untyped map lets a typo or a wrong type fail at run time. Java's <code>Predicate</code> already composes with <code>and</code>, <code>or</code> and <code>negate</code>, so a filter can simply be a typed predicate.</p>` },
        { type: "code", lang: "java", title: "Search with composable filters", code: `/** Typed filters; combine with and(), or() and negate() instead of a hand-written chain. */
public final class Filters {
    private Filters() {}
    public static Predicate<Node> nameMatches(String regex) {
        Pattern p = Pattern.compile(regex);                // compiled once, not per node
        return n -> p.matcher(n.name()).matches();
    }
    public static Predicate<Node> isFile() { return n -> n instanceof File; }
    public static Predicate<Node> sizeAtLeast(long bytes) {
        return n -> n instanceof File f && f.content().length() >= bytes;
    }
}

// In FileSystem: one walk under the read lock, returning paths rather than live nodes.
public List<String> search(String dirPath, Predicate<Node> filter) {
    return reading(() -> {
        FsPath p = FsPath.parse(dirPath);
        List<String> found = new ArrayList<>();
        collect(asDirectory(resolve(p), dirPath), p.isRoot() ? "" : p.toString(), filter, found);
        return found;
    });
}

private void collect(Directory dir, String prefix, Predicate<Node> filter, List<String> out) {
    for (String name : dir.names()) {                      // sorted, so results are deterministic
        Node child = dir.child(name);
        String path = prefix + "/" + name;
        if (filter.test(child)) out.add(path);
        if (child instanceof Directory d) collect(d, path, filter, out);
    }
}

// fs.search("/home", Filters.isFile().and(Filters.nameMatches(".*[.]txt")).and(Filters.sizeAtLeast(1024)));` },
        { type: "keypoints", items: [
          "<code>FileSystem</code> gains one method; <code>Filters</code> is new; nodes don't change. A new kind of filter is a new static method, with no chain class to edit.",
          "Results are paths built during the walk, so callers never hold live nodes and the walk never calls <code>pathOf</code> per hit.",
          "Filters run while the read lock is held, so they must be quick and must never call back into the file system to write: a read lock can't be upgraded and the thread would block forever.",
          "A full walk is O(subtree). For frequent searches by name, keep an index from name to nodes; a move doesn't change names, so only create, delete and rename have to update it."
        ] }
      ]
    },
    {
      id: "symlinks",
      title: "\"How would you add symbolic links?\"",
      kicker: "Follow-up: a new node type",
      blocks: [
        { type: "text", html: `<p>A symlink is a node whose content is another path. That is a third kind of node, so it goes into the Composite's <code>permits</code> list, and path resolution learns to follow it. Two policies need stating: which operations follow a link (read and list do; delete and rename act on the link itself, like Unix), and how to stop a loop of links.</p>` },
        { type: "code", lang: "java", title: "A symlink is a third kind of node", code: `public abstract sealed class Node permits File, Directory, Symlink { /* unchanged */ }

public final class Symlink extends Node {
    private final String target;                       // an absolute path, resolved only when used
    Symlink(String name, String target) { super(name); this.target = target; }
    String target() { return target; }
}

// In FileSystem
private static final int MAX_HOPS = 40;                // the same limit Linux uses

/** Follows links in the middle of a path; the last segment is returned as-is so delete and rename hit the link. */
private Node resolve(FsPath p, int[] hops) {
    Node cur = root;
    for (String part : p.parts()) {
        Node next = asDirectory(follow(cur, hops), p.toString()).child(part);
        if (next == null) throw new PathNotFoundException(p.toString());
        cur = next;
    }
    return cur;
}

private Node follow(Node n, int[] hops) {
    while (n instanceof Symlink link) {
        if (++hops[0] > MAX_HOPS) throw new InvalidPathException("too many links: " + link.target());
        n = resolve(FsPath.parse(link.target()), hops);
    }
    return n;
}

// read and list call follow(resolve(p, hops), hops) so they see the target.` },
        { type: "keypoints", items: [
          "<code>Node</code>'s <code>permits</code> list, <code>resolve</code> and a new <code>createSymlink</code> change. <code>File</code>, <code>Directory</code>, move, rename and delete don't: a link is a leaf, so it can never make the tree itself cyclic.",
          "The hop counter is shared across the whole lookup, so <code>/a</code> linking to <code>/b</code> linking back to <code>/a</code> stops after 40 hops instead of recursing forever.",
          "A link to a missing path is allowed (it dangles); following it reports <code>PathNotFoundException</code>, which is how Unix behaves too.",
          "<code>pathOf</code> on a node reached through a link returns its real location, because parent pointers describe the tree, not the route taken."
        ] }
      ]
    },
    {
      id: "mkdir-p",
      title: "\"Can create make the missing parent folders, like mkdir -p?\"",
      kicker: "Follow-up: convenience",
      blocks: [
        { type: "text", html: `<p>The awesome-low-level-design solution's path walk creates missing folders as it goes. Two things go wrong with that version: a file found in the way is silently replaced by a new folder, losing the file, and a failure halfway leaves some folders created. Split the walk in two: first walk the part of the path that already exists, checking types; then create the rest, which can no longer fail.</p>` },
        { type: "code", lang: "java", title: "createDirectories, like mkdir -p", code: `// In FileSystem
public Directory createDirectories(String path) {
    return writing(() -> {
        List<String> parts = FsPath.parse(path).parts();
        Directory cur = root;
        int i = 0;
        for (; i < parts.size(); i++) {                // walk what exists
            Node next = cur.child(parts.get(i));
            if (next == null) break;
            cur = asDirectory(next, path);             // a file in the way: error, and nothing created yet
        }
        for (; i < parts.size(); i++) {                // everything below is new, so no conflicts are possible
            Directory d = new Directory(parts.get(i));
            cur.add(d);
            cur = d;
        }
        return cur;                                    // an existing folder if the whole path was there
    });
}` },
        { type: "keypoints", items: [
          "Only <code>FileSystem</code> changes, by one method. <code>createDirectory</code> keeps its strict behaviour; callers choose.",
          "Idempotent: calling it twice returns the same folder, matching <code>mkdir -p</code>.",
          "This is validate-then-mutate again: once the first missing segment is found, every later segment is guaranteed free, so the create loop can't fail halfway.",
          "One write lock around both loops means no other thread can create a file in the gap between checking and creating."
        ] }
      ]
    }
  ],
  takeaways: [
    "Follow-ups land in one place each: a new Node type (symlinks), a new facade method (sizes, search, mkdir -p, stat), or a new class in front of the facade (Session).",
    "One read-write lock is the right default; per-folder locks let two concurrent moves create a cycle unless the whole ancestor chain is locked.",
    "Return snapshots or paths, not live nodes, so nothing is read outside the lock.",
    "Cached folder sizes reuse the parent-pointer walk: O(1) reads for O(depth) writes.",
    "A Session holds the working directory as a node and folds . and .. before calling the facade.",
    "Search filters are typed predicates combined with and(); symlink resolution needs a hop limit; mkdir -p walks what exists before creating anything."
  ],
  furtherReading: [
    { title: "Hello Interview: File System (LLD) problem breakdown", url: "https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/file-system", note: "The problem these notes follow." },
    { title: "awesome-low-level-design: File directory (Java solution)", url: "https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/filedirectory", note: "The reference solution compared in the Solution tab." },
    { title: "ReentrantReadWriteLock (Java 21 API)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/locks/ReentrantReadWriteLock.html" }
  ]
};
