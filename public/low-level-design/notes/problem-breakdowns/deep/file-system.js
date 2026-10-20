// Deep dives: File System (LLD). Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["file-system"] = {
  hook: `<p>The Solution tab's tree handles the required operations in time proportional to path depth. The follow-ups probe whether that design holds up: how paths are parsed, why nodes don't store their own paths, what makes a move safe, which collection holds children, how to make it thread-safe, and how to add sizes, relative paths, symlinks and search without breaking the structure.</p>`,
  sections: [
    {
      id: "path-from-reference",
      title: "Full path from a reference: why parent pointers",
      kicker: "The key decision",
      blocks: [
        { type: "text", html: `<p>Two requirements pull against each other: "get the full path of any node" and "move and rename folders". There are three ways to know a node's path, and they price those two operations very differently.</p>` },
        { type: "compare", items: [
          { title: "Parent pointers (chosen)", tone: "ok", html: `<p>Each node knows only its parent. <code>path()</code> walks up: O(depth). A move re-links one node: O(1) plus the cycle check. Paths can never be stale.</p>` },
          { title: "Stored path in each node", tone: "warn", html: `<p><code>path()</code> is O(1), but moving or renaming a folder must rewrite the stored path of every descendant: O(subtree). A missed update leaves a node reporting a wrong path.</p>` },
          { title: "Global path index", tone: "bad", html: `<p>A <code>Map&lt;String, Node&gt;</code> of every full path makes resolve O(1), but every move re-keys every descendant in the map, and the index must stay in sync with the tree forever.</p>` }
        ] },
        { type: "lab", id: "pathDesigns", caption: "Make moved folders large and moves frequent, then try very deep paths with almost no moves, and see when caching paths would ever pay off." },
        { type: "callout", tone: "interview", html: `<p>The sentence to say: "Depth is small and bounded in practice, subtrees can be huge. I'd rather pay O(depth) on every path call than O(subtree) on a move, and I never have to keep stored paths consistent."</p>` }
      ]
    },
    {
      id: "path-parsing",
      title: "Parsing and validating paths",
      kicker: "Edge cases",
      blocks: [
        { type: "text", html: `<p>Every operation starts from a string, so parsing deserves one class (<code>FsPath</code>) and a deliberate answer for each odd input. Decide the policy, state it, and test it.</p>` },
        { type: "table", headers: ["Input", "Policy", "Why"], rows: [
          ["<code>/</code>", "The root: zero segments", "Resolves to the root; create, delete, move and rename on it are refused"],
          ["<code>/home//ana/</code>", "Collapse empty segments: [home, ana]", "Matches Unix behaviour and is forgiving"],
          ["<code>home/ana</code>", "InvalidPathException", "Relative paths are out of scope"],
          ["<code>/home/./ana</code>, <code>/home/../etc</code>", "InvalidPathException", "No relative segments in scope; support them in a Session later"],
          ["<code>\"\"</code> or null", "InvalidPathException", "Fail fast with a clear message"],
          ["Name containing <code>/</code> (rename)", "InvalidPathException", "A name is one segment by definition"]
        ] },
        { type: "callout", tone: "tip", html: `<p>Keep parsing (string to segments) separate from resolution (segments to nodes). Parsing never touches the tree, so it can be unit-tested on its own, and resolution can assume clean input.</p>` }
      ]
    },
    {
      id: "moving-safely",
      title: "Moving without breaking the tree",
      kicker: "Correctness",
      blocks: [
        { type: "problem", html: `<p><code>move("/a", "/a/b/c")</code> would make <code>a</code> a child of its own descendant. Detaching <code>a</code> from its parent and attaching it under <code>c</code> leaves a loop of folders that no longer connects to the root: the whole subtree is lost, and any code that walks up from it loops forever.</p>` },
        { type: "steps", title: "The order of checks in move", items: [
          "Resolve the source; refuse if it is the root.",
          "Resolve the destination; it must be a directory.",
          "Walk up from the destination to the root; if you meet the source, refuse (cycle).",
          "Refuse if the destination already contains a child with the source's name (or define an overwrite policy explicitly).",
          "Only now mutate: remove from the old parent's map, add to the new one, update the parent pointer."
        ] },
        { type: "code", lang: "java", title: "The cycle check is a short upward walk", code: `private static boolean isAncestorOrSelf(Node candidate, Directory start) {
    for (Directory d = start; d != null; d = d.parent()) {
        if (d == candidate) return true;
    }
    return false;                    // O(depth of the destination)
}` },
        { type: "keypoints", items: [
          "Moving a <em>file</em> can't create a cycle, but running the same check costs nothing and keeps the code uniform.",
          "Moving a node to the folder it is already in is a no-op or an AlreadyExists error; pick one and say which.",
          "Rename is a move to the same parent under a new name: same conflict check, and the parent's map must be re-keyed, not just the node's field."
        ] },
        { type: "callout", tone: "mistake", html: `<p>Changing <code>node.name</code> without re-keying the parent's map. The map still files the node under its old name: lookups by the new name fail and the old name looks taken. Remove, rename, then add.</p>` }
      ]
    },
    {
      id: "children-collection",
      title: "Choosing the children collection",
      kicker: "Data structures",
      blocks: [
        { type: "table", headers: ["Collection", "Lookup by name", "Listing", "Use when"], rows: [
          ["<code>HashMap</code>", "O(1)", "Unordered; sort on demand, O(k log k)", "Default: lookups dominate (every path segment)"],
          ["<code>TreeMap</code>", "O(log k)", "Already sorted", "Listings are frequent and must be sorted"],
          ["<code>LinkedHashMap</code>", "O(1)", "Insertion order", "\"Order created\" listings"],
          ["<code>ArrayList</code>", "O(k) scan", "Insertion order", "Tiny folders only; breaks down with thousands of entries"]
        ] },
        { type: "text", html: `<p>With tens of thousands of entries, some folders will have thousands of children, and every path resolution does one lookup per level. A list turns that into a scan per level. A map keeps resolution O(depth) regardless of folder size, and enforces unique names as a side effect.</p>` },
        { type: "callout", tone: "insight", html: `<p>Return listings as an unmodifiable copy or a stream of names, never the internal map. Handing out the map lets callers add children that bypass every check in <code>FileSystem</code>.</p>` }
      ]
    },
    {
      id: "thread-safety",
      title: "Making it thread-safe",
      kicker: "Follow-up: concurrency",
      blocks: [
        { type: "problem", html: `<p>Two threads move folders at the same time, or one lists a folder while another deletes from it. A plain <code>HashMap</code> can be corrupted by concurrent writes, and two concurrent moves can each pass the cycle check and together create a cycle (a into b while b moves into a).</p>` },
        { type: "code", lang: "java", title: "One read-write lock around the tree", code: `public final class FileSystem {
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
    private final Directory root = new Directory("");

    public List<String> list(String path) {
        lock.readLock().lock();
        try { return asDirectory(get0(path), path).list().stream().map(Node::name).toList(); }
        finally { lock.readLock().unlock(); }
    }

    public void move(String src, String destDir) {
        lock.writeLock().lock();
        try { move0(src, destDir); }               // the single-threaded logic, unchanged
        finally { lock.writeLock().unlock(); }
    }
    // ...same pattern for every public method
}` },
        { type: "tradeoffs", title: "Global read-write lock vs per-directory locks", prosLabel: "Global read-write lock", consLabel: "Per-directory locks", pros: ["Correct by construction: every invariant checked under one lock", "Reads run in parallel", "The single-threaded code is reused unchanged"], cons: ["More parallelism for writes in different folders", "A move must lock source parent, destination and the ancestor chain for the cycle check, in a global order to avoid deadlock", "Much harder to get right; only worth it with proven write contention"] },
        { type: "callout", tone: "warning", html: `<p>Don't return live <code>Node</code> objects to callers who then read them outside the lock: a concurrent move could change <code>parent</code> mid-walk. Either return immutable snapshots (names, paths, content) or document that nodes are only safe to use under the lock.</p>` }
      ]
    },
    {
      id: "sizes",
      title: "Folder sizes",
      kicker: "Follow-up: aggregates",
      blocks: [
        { type: "text", html: `<p>"How big is <code>/home</code>?" is the classic Composite operation: a file's size is its content length, a folder's size is the sum of its children's sizes.</p>` },
        { type: "code", lang: "java", title: "Recursive version (simple, O(subtree))", code: `public sealed abstract class Node permits File, Directory {
    public abstract long size();
}
public final class File extends Node {
    public long size() { return content.length(); }
}
public final class Directory extends Node {
    public long size() { return children.values().stream().mapToLong(Node::size).sum(); }
}` },
        { type: "code", lang: "java", title: "Cached version (O(1) reads, O(depth) updates)", code: `public final class Directory extends Node {
    private long totalSize;                          // sum of everything below
    public long size() { return totalSize; }

    void adjustSize(long delta) {                    // walk up, applying the change
        for (Directory d = this; d != null; d = d.parent()) d.totalSize += delta;
    }
}

// FileSystem calls it on every change:
//   write:  file.parent().adjustSize(newLength - oldLength)
//   add:    parent.adjustSize(node.size())
//   remove: oldParent.adjustSize(-node.size())     (a move is remove + add)` },
        { type: "callout", tone: "tip", html: `<p>Parent pointers pay off again: propagating a size change is the same upward walk as computing a path. Mention the trade-off: every write now costs O(depth), which is fine when reads of sizes are frequent.</p>` }
      ]
    },
    {
      id: "extensions",
      title: "Relative paths, symlinks and search",
      kicker: "Follow-ups: features",
      blocks: [
        { type: "table", headers: ["Feature", "Design change", "Watch out for"], rows: [
          ["Working directory and relative paths", "A <code>Session</code> holding a current <code>Directory</code>; resolve from it instead of the root; <code>..</code> follows the parent pointer, <code>.</code> stays", "<code>..</code> at the root stays at the root; the current folder might be deleted by someone else"],
          ["<code>mkdir -p</code>", "<code>createDirectories(path)</code>: walk segments, creating missing folders", "A file in the middle of the path is still NotADirectory"],
          ["Symbolic links", "A third node type, <code>Symlink</code>, storing a target path; resolution follows it", "Loops (a link to its own ancestor): cap the number of links followed"],
          ["Search by name", "DFS from a folder, or an index <code>Map&lt;String, Set&lt;Node&gt;&gt;</code> from name to nodes", "The index must be updated on create, delete and rename (moves don't change names)"],
          ["Permissions, timestamps", "Fields on <code>Node</code>, checked in <code>FileSystem</code> before each operation", "Directory permissions apply along the whole path during resolution"]
        ] },
        { type: "callout", tone: "insight", html: `<p>A search index keyed by <em>name</em> survives moves untouched, because a move changes a node's parent, not its name. An index keyed by <em>full path</em> has to be rewritten for the whole subtree. The same parent-pointer reasoning applies.</p>` },
        { type: "quiz", q: "A candidate stores each node's full path as a field so that <code>path()</code> is O(1). The interviewer asks them to move <code>/home</code>, which contains 40,000 files, to <code>/users/home</code>. What is the main problem?", options: [
          "Nothing: the move only changes /home's own path field",
          "Every one of the 40,000 descendants has a stale stored path that must be rewritten, so the move costs O(subtree) and any missed update leaves wrong paths",
          "HashMap can't hold 40,000 entries",
          "The cycle check becomes O(subtree)"
        ], answer: 1, explain: `<p>Each descendant's stored path still starts with /home. The move must visit and rewrite all 40,000 of them, and any bug leaves nodes reporting paths that don't exist. With parent pointers, the move re-links one node and every descendant's computed path is automatically correct; the cycle check only walks up from the destination, O(depth).</p>` }
      ]
    }
  ],
  takeaways: [
    "Parent pointers trade an O(depth) path() for O(1) moves and paths that can never go stale.",
    "Parse paths in one class with an explicit policy for every edge case; keep parsing separate from resolution.",
    "In move: check root, destination type, cycle (walk up from the destination) and name conflict, then mutate.",
    "Rename must re-key the parent's map, not just change the node's name.",
    "A HashMap of children keeps resolution O(depth) however large a folder grows; sort on listing.",
    "A single read-write lock is the simplest correct concurrency story; per-directory locking is hard because moves span folders.",
    "Sizes, relative paths, symlinks and search are additive, and most reuse the same upward walk."
  ],
  furtherReading: [
    { title: "Hello Interview: File System (LLD) problem breakdown", url: "https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/file-system", note: "The problem these notes follow." },
    { title: "ReentrantReadWriteLock (Java 21 API)", url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/locks/ReentrantReadWriteLock.html" },
    { title: "LLD in a Hurry: Design patterns", note: "The Composite pattern section in this site's LLD notes." }
  ]
};
