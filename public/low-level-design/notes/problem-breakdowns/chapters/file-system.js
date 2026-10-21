// LLD problem breakdown: File System. Format: Chapter in public/shared/notes.d.ts; shared helpers in data-part2.js.
// Imports are omitted in the code.
(function () {
const { levels, PRACTICE_TIP } = LLD_PROBLEMS_KIT;

window.DATA.chapters.push({
    id: `file-system`, part: 2, number: 2, difficulty: `medium`,
    title: `File System: an in-memory, Unix-style tree`,
    references: [{ title: `awesome-low-level-design: File directory (Java solution)`, url: `https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/filedirectory` }],
    source: { title: `Hello Interview: File System (LLD) problem breakdown`, url: `https://www.hellointerview.com/learn/low-level-design/problem-breakdowns/file-system` },
    overview: `An in-memory file system: one root, folders that hold files and folders, files that hold text, and the operations a shell would call (create, read, write, list, delete, rename, move, and "what is the full path of this node?"). This page works the problem in interview order: clarify the requirements, find the entities, design the classes top down, implement the operations (comparing a simple, a better and a strong option for how to store the tree), verify with a trace, then handle follow-ups. The design lands on a <strong>Composite</strong> tree (<code>Node</code>, <code>File</code>, <code>Directory</code>) with children kept in a <strong>map by name</strong> and a <strong>parent pointer</strong> on every node, a <code>FileSystem</code> <strong>facade</strong> that parses paths in one place and checks everything before it changes anything, specific exceptions, and one <strong>read-write lock</strong> for thread safety.`,
    problem: [
      { id: `understanding`, title: `What an in-memory file system does`, kicker: `The problem`, blocks: [
        { type: `problem`, html: `<p>Build the core of a file system that lives entirely in memory. There is a root folder; folders contain files and other folders; files hold some text. Callers create, read, list, rename, move and delete entries by path, and can ask any file or folder for its full path. Nothing touches a disk: the whole problem is the data structure and the rules around it.</p>` },
        { type: `text`, html: `<p>The prompt is usually one sentence: <em>"Design an in-memory file system that supports creating, deleting and moving files and directories."</em> Everyone has used a file system, which makes it tempting to start coding from your own mental model: drive letters, permissions, symlinks, timestamps. The interviewer almost always wants something narrower. The first few minutes go into turning the sentence into a spec.</p>` },
        { type: `code`, lang: `java`, title: `The kind of usage to support`, code: `FileSystem fs = new FileSystem();
fs.createDirectory("/home");
fs.createDirectory("/home/ana");
fs.createFile("/home/ana/notes.txt", "buy milk");
fs.list("/home/ana");                       // [notes.txt]
fs.move("/home/ana/notes.txt", "/home");
fs.rename("/home/notes.txt", "todo.txt");
Node todo = fs.get("/home/todo.txt");
fs.pathOf(todo);                            // "/home/todo.txt"
fs.delete("/home/ana", false);
fs.read("/home/missing.txt");               // throws PathNotFoundException` }
      ] },
      { id: `clarifying`, title: `Clarifying questions`, kicker: `Step 1: requirements`, blocks: [
        { type: `text`, html: `<p>Work through four kinds of question: <strong>what the system must do</strong>, <strong>what happens with bad input</strong>, <strong>what is deliberately left out</strong>, and <strong>what might be added later</strong>. Spend one to three minutes here; every answer removes a branch you would otherwise design for.</p>` },
        { type: `table`, headers: [`You ask`, `A typical answer`, `What it decides`], rows: [
          [`One root, or several (drive letters)?`, `One root, Unix-style absolute paths like <code>/home/ana</code>`, `A single root directory; simple path parsing`],
          [`Which operations?`, `Create, delete, list, read and write, rename, move, and the full path of a node`, `The facade's public methods`],
          [`Do files have content? Do folders report a size?`, `Files hold a string; sizes can come later`, `<code>File</code> holds state; sizes are a follow-up`],
          [`What happens with bad input: a missing parent, a taken name, deleting the root, a file where a folder is expected?`, `Throw a specific exception for each`, `An exception hierarchy instead of booleans`],
          [`Does creating a file make missing parent folders, like <code>mkdir -p</code>?`, `No, the parent must exist; <code>mkdir -p</code> is a follow-up`, `Create never half-succeeds`],
          [`How big does it get?`, `Tens of thousands of entries, deep folders, and folders get moved`, `A map per folder; no full-tree scans and no stored paths`],
          [`Will several threads use one instance?`, `Yes, assume it is shared`, `All shared state behind a lock`],
          [`Relative paths, symlinks, permissions, timestamps, persistence?`, `All out of scope`, `Small node types; each is a follow-up`]
        ] },
        { type: `callout`, tone: `insight`, title: `Ask about scale and moves together`, html: `<p>"How many entries, and do whole folders get moved?" is the question that decides the design. A small tree that never moves could store each node's full path and be done. Tens of thousands of entries plus folder moves rule that out: moving <code>/home</code> would rewrite the path of everything beneath it. The answer is what justifies parent pointers later, so ask it out loud even when it seems obvious.</p>` }
      ] },
      { id: `final-requirements`, title: `Final requirements`, kicker: `Step 1: requirements`, blocks: [
        { type: `code`, lang: `text`, title: `Final requirements`, code: `Requirements
  1. One root "/"; folders contain files and folders.
  2. Files hold text that can be read and overwritten.
  3. Create files and folders; the parent folder must already exist.
  4. List a folder's contents by name, sorted.
  5. Resolve absolute paths such as /home/ana/notes.txt.
  6. Delete files and folders. A non-empty folder needs recursive = true;
     the root can never be deleted.
  7. Rename an entry in place; move an entry into another folder,
     keeping its name.
  8. Return the full path of any file or folder from a reference to it.
  9. Names are unique within a folder and never contain "/".
 10. Invalid operations throw a specific exception type.
 11. Tens of thousands of entries and deep folders: an operation costs
     about the path depth, not the size of the tree.
 12. One instance is shared by many threads.

Out of scope
  - Relative paths (. and ..), a working directory, symbolic links
  - Permissions, owners, timestamps
  - Search, persistence to disk, a UI` },
        { type: `callout`, tone: `tip`, html: PRACTICE_TIP }
      ] }
    ],
    solution: [
      { id: `entities`, title: `Core entities`, kicker: `Step 2: entities`, blocks: [
        { type: `text`, html: `<p>Scan the requirements for nouns that hold state or enforce rules: file system, folder, file, path, root, name, content, error. Test each one before committing to a class. One entity, <code>Node</code>, doesn't appear in the prompt at all; it shows up when you notice that most operations treat files and folders alike.</p>` },
        { type: `table`, headers: [`Candidate`, `Verdict`, `Why`], rows: [
          [`File system`, `A class: <code>FileSystem</code>`, `Owns the root and is the one place that enforces the rules (names free, no cycles, root protected)`],
          [`Folder`, `A class: <code>Directory</code>`, `Holds children and must find one by name quickly`],
          [`File`, `A class: <code>File</code>`, `Holds content`],
          [`What files and folders share`, `An abstract class: <code>Node</code>`, `Both have a name and a parent, and move, rename, delete and path work on either. This is the Composite pattern`],
          [`Path`, `A small record: <code>FsPath</code>`, `A raw string is parsed in many places if nothing owns it. One type validates it once and exposes its segments`],
          [`Root`, `Not a class`, `Just the one <code>Directory</code> the file system creates first; nothing about it needs different behaviour`],
          [`Name, content`, `Fields`, `Plain strings with no rules of their own beyond "no slash in a name", which the path parser checks`],
          [`Drive, volume`, `Nothing`, `One root, so there is nothing to model`],
          [`Errors`, `Exception classes`, `Each failure needs different handling, so each gets a type under one base`]
        ] },
        { type: `table`, title: `The entities we keep`, headers: [`Entity`, `Responsibility`], rows: [
          [`FileSystem`, `The entry point. Parses every path, walks the tree, checks every rule, then changes the tree. Holds the lock. The only class outside code calls.`],
          [`Node`, `What a file and a folder share: a name and a parent. Knows nothing about paths or rules.`],
          [`File`, `A node with text content.`],
          [`Directory`, `A node with children, kept in a map from name to node.`],
          [`FsPath`, `A parsed absolute path: its segments, its parent path and its last name. Never touches the tree.`],
          [`FileSystemException and subtypes`, `One unchecked exception per failure: not found, already exists, not a directory, not a file, not empty, invalid path, invalid operation.`]
        ] },
        { type: `callout`, tone: `interview`, html: `<p>Name the pattern as you draw the hierarchy: "Folders contain files and folders, and most operations treat the two alike, so it's a Composite: <code>Node</code> is the component, <code>File</code> the leaf, <code>Directory</code> the composite." One sentence explains the whole shape.</p>` }
      ] },
      { id: `filesystem-design`, title: `Class design: FileSystem`, kicker: `Step 3: class design, top down`, blocks: [
        { type: `text`, html: `<p>Start from the class outside code talks to, and derive its state and methods from the requirements rather than from intuition. For each requirement ask: what must this class remember, and what must it let callers do?</p>` },
        { type: `table`, headers: [`Requirement`, `What FileSystem remembers`], rows: [
          [`"One root; folders contain files and folders"`, `The root <code>Directory</code>, created once. Everything else hangs off it`],
          [`"Resolve absolute paths" and "costs about the path depth"`, `Nothing extra: walking from the root is already O(depth). No index of paths`],
          [`"Shared by many threads"`, `One <code>ReentrantReadWriteLock</code> for the whole tree`]
        ] },
        { type: `table`, headers: [`Need`, `Method`], rows: [
          [`Create a folder or a file`, `<code>Directory createDirectory(String path)</code>, <code>File createFile(String path, String content)</code>`],
          [`Read and overwrite a file`, `<code>String read(String path)</code>, <code>void write(String path, String content)</code>`],
          [`List a folder`, `<code>List&lt;String&gt; list(String path)</code>`],
          [`Delete`, `<code>void delete(String path, boolean recursive)</code>`],
          [`Rename in place; move into another folder`, `<code>void rename(String path, String newName)</code>, <code>void move(String srcPath, String destDirPath)</code>`],
          [`Get a reference, and the full path from a reference`, `<code>Node get(String path)</code>, <code>String pathOf(Node node)</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>Paths in, values out.</strong> Methods take path strings and return names and content, not internal collections. <code>get</code> and the create methods return a <code>Node</code>, but outside code can only read its name; <code>pathOf</code> answers requirement 8 under the lock.`,
          `<strong>No path index.</strong> A <code>Map&lt;String, Node&gt;</code> of every full path would make lookups O(1), but it is a second copy of the structure that every move and rename must keep in sync. The tree is the only source of truth.`,
          `<strong>Move and rename stay separate.</strong> <code>move</code> keeps the name (like <code>mv notes.txt /home</code>) and <code>rename</code> keeps the folder. If the interviewer wants "move under a new name", that is both under one lock, not a third set of rules.`,
          `<strong>Exceptions, not booleans.</strong> "Not found", "name taken" and "folder not empty" each need a different response from the caller; a <code>false</code> can't say which happened.`
        ] }
      ] },
      { id: `tree-design`, title: `Class design: Node, File and Directory`, kicker: `Step 3: class design`, blocks: [
        { type: `table`, headers: [`Requirement`, `What a node remembers`], rows: [
          [`"Folders contain files and folders"`, `A <code>Directory</code> holds its children`],
          [`"Names are unique within a folder"`, `Children are keyed by name, so a second entry with the same name can't exist`],
          [`"Files hold text"`, `A <code>File</code> holds its content`],
          [`"Full path from a reference"`, `Every node holds its own name and a pointer to its parent`]
        ] },
        { type: `text`, html: `<p>The central question is <strong>how to store the tree</strong> so that resolving a path, getting a node's path, moving and renaming are all cheap at tens of thousands of entries. Three shapes come up.</p>` },
        { type: `compare`, items: [
          { title: `Good: one map of full paths`, tone: `warn`, html: `<p><code>Map&lt;String, Node&gt;</code> from <code>"/home/ana/notes.txt"</code> to the node. Resolving is one lookup and a node can store its own path. But listing a folder means scanning every key for a prefix, and moving <code>/home</code> re-keys every path beneath it: 40,000 descendants, 40,000 updates, and any missed one leaves a node at a path that doesn't exist.</p>` },
          { title: `Better: a tree with child lists`, tone: `info`, html: `<p>Each <code>Directory</code> keeps a <code>List&lt;Node&gt;</code>. Moving a folder re-links one node and its whole subtree comes along. But each path segment is a linear scan of its folder (slow with thousands of entries), nothing stops duplicate names, and a node can't say where it is without searching down from the root or storing a path that goes stale after a move.</p>` },
          { title: `Great: a Composite tree with name maps and parent pointers`, tone: `ok`, html: `<p>Each <code>Directory</code> keeps <code>Map&lt;String, Node&gt;</code>, so each segment is one O(1) lookup and names are unique for free. Each node points to its parent, so its path is a walk up: O(depth). A move re-links one node and checks for a cycle by walking up from the destination: O(depth). Nothing derived is stored, so nothing goes stale.</p>` }
        ] },
        { type: `text`, html: `<p>We take the third. The cost argument to say out loud: <em>depth is small in practice, subtrees can be huge</em>, so it is better to pay O(depth) every time someone asks for a path than O(subtree) every time a folder moves. The parent pointer pays for itself again later: the cycle check, folder sizes and <code>..</code> are all the same upward walk.</p>` },
        { type: `diagram`, title: `Composite tree with parent pointers`, caption: `Each directory maps child names to nodes (solid arrows). Every node points back to its parent (dashed), which is how a node computes its own path and how a move detaches it cheaply.`, svg: `<svg viewBox="0 0 640 280" role="img" aria-label="A file system tree with children maps and parent pointers">
<defs>
<marker id="lp-fs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-muted)"/></marker>
<marker id="lp-fs-up" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill: var(--dg-3)"/></marker>
</defs>
<rect x="270" y="14" width="100" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="320" y="39" text-anchor="middle" font-size="14" font-weight="700" style="fill: var(--dg-ink)">/</text>
<rect x="130" y="110" width="120" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="190" y="135" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">home/</text>
<rect x="390" y="110" width="120" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="450" y="135" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">etc/</text>
<rect x="40" y="210" width="120" height="40" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="100" y="235" text-anchor="middle" font-size="13" font-weight="700" style="fill: var(--dg-ink)">ana/</text>
<rect x="210" y="210" width="130" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="275" y="235" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">todo.txt</text>
<rect x="400" y="210" width="130" height="40" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="465" y="235" text-anchor="middle" font-size="13" style="fill: var(--dg-ink)">hosts</text>
<line x1="300" y1="54" x2="210" y2="108" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<line x1="340" y1="54" x2="430" y2="108" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<line x1="170" y1="150" x2="115" y2="208" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<line x1="210" y1="150" x2="260" y2="208" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<line x1="450" y1="150" x2="462" y2="208" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#lp-fs-arrow)"/>
<path d="M300 210 C 330 180, 290 170, 245 152" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-3)" marker-end="url(#lp-fs-up)"/>
<path d="M145 110 C 150 80, 230 60, 268 40" fill="none" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-3)" marker-end="url(#lp-fs-up)"/>
<text x="560" y="40" font-size="12" style="fill: var(--dg-muted)">solid: children</text>
<text x="560" y="58" font-size="12" style="fill: var(--dg-3)">dashed: parent</text>
</svg>` },
        { type: `lab`, id: `pathDesigns`, caption: `Compare the three ways a node can know its path. Make moved folders large and moves frequent, then try very deep paths with almost no moves, and see when storing paths would ever pay off.` },
        { type: `table`, headers: [`Need`, `Method on Directory (package-private)`], rows: [
          [`Find one child while walking a path`, `<code>Node child(String name)</code>, null if absent`],
          [`List`, `<code>List&lt;String&gt; names()</code>, sorted copies`],
          [`Refuse a non-recursive delete`, `<code>boolean isEmpty()</code>`],
          [`Attach and detach, keeping the parent pointer in step`, `<code>void add(Node n)</code>, <code>void remove(Node n)</code>`]
        ] },
        { type: `keypoints`, items: [
          `<strong>A directory owns its children.</strong> Removing a folder from its parent's map removes the whole subtree; the garbage collector reclaims it. Every node except the root has exactly one parent, so the structure is always a tree.`,
          `<strong><code>add</code> and <code>remove</code> set the parent pointer themselves.</strong> The map and the pointer can never disagree, because nothing else writes either.`,
          `<strong>Mutators are package-private.</strong> Outside code can hold a <code>Node</code> and read its name, but it can only change the tree through <code>FileSystem</code>, where the checks are.`,
          `<strong><code>sealed</code></strong> says there are exactly two kinds of node, so a pattern-matching <code>switch</code> over them is exhaustive.`
        ] }
      ] },
      { id: `paths-and-errors`, title: `Class design: paths and errors`, kicker: `Step 3: class design`, blocks: [
        { type: `text`, html: `<p>Every operation starts from a string, so parsing deserves one small type and a deliberate answer for each odd input. Keep parsing (string to segments) separate from resolution (segments to nodes): parsing never touches the tree, so it can be tested on its own, and resolution can assume clean input.</p>` },
        { type: `table`, headers: [`Input`, `Policy`, `Why`], rows: [
          [`<code>/</code>`, `The root: zero segments`, `Resolves to the root; create, delete, move and rename on it are refused`],
          [`<code>/home//ana/</code>`, `Empty segments collapse: [home, ana]`, `Matches Unix and is forgiving`],
          [`<code>home/ana</code>`, `<code>InvalidPathException</code>`, `Relative paths are out of scope`],
          [`<code>/home/./ana</code>, <code>/home/../etc</code>`, `<code>InvalidPathException</code>`, `No relative segments; a <code>Session</code> can add them later`],
          [`Empty string or null`, `<code>InvalidPathException</code>`, `Fail fast with a clear message`],
          [`A new name containing <code>/</code>, or <code>.</code> or <code>..</code> (rename)`, `<code>InvalidPathException</code>`, `A name is exactly one segment`]
        ] },
        { type: `code`, lang: `java`, title: `FsPath and the exceptions`, code: `/** A parsed absolute path: the names between the slashes. Parsing never touches the tree. */
public record FsPath(List<String> parts) {
    public static FsPath parse(String raw) {
        if (raw == null || !raw.startsWith("/")) throw new InvalidPathException(raw + ": must be absolute");
        List<String> parts = new ArrayList<>();
        for (String s : raw.split("/")) {
            if (s.isEmpty()) continue;                               // leading, trailing or doubled slashes
            if (s.equals(".") || s.equals("..")) throw new InvalidPathException(raw + ": . and .. are not supported");
            parts.add(s);
        }
        return new FsPath(List.copyOf(parts));
    }

    boolean isRoot() { return parts.isEmpty(); }
    String name()    { return parts.get(parts.size() - 1); }         // callers check isRoot() first
    FsPath parent()  { return new FsPath(parts.subList(0, parts.size() - 1)); }
    @Override public String toString() { return "/" + String.join("/", parts); }
}

/** One unchecked base type: callers catch it, or a subtype when they handle that case specially. */
public class FileSystemException extends RuntimeException {
    public FileSystemException(String message) { super(message); }
}
public class PathNotFoundException      extends FileSystemException { public PathNotFoundException(String m)      { super(m); } }
public class AlreadyExistsException     extends FileSystemException { public AlreadyExistsException(String m)     { super(m); } }
public class NotADirectoryException     extends FileSystemException { public NotADirectoryException(String m)     { super(m); } }
public class NotAFileException          extends FileSystemException { public NotAFileException(String m)          { super(m); } }
public class DirectoryNotEmptyException extends FileSystemException { public DirectoryNotEmptyException(String m) { super(m); } }
public class InvalidPathException       extends FileSystemException { public InvalidPathException(String m)       { super(m); } }
public class InvalidOperationException  extends FileSystemException { public InvalidOperationException(String m)  { super(m); } }  // root, cycle` },
        { type: `callout`, tone: `tip`, html: `<p><code>File</code> and some of these exceptions share names with <code>java.io</code> and <code>java.nio</code> classes. Keep them in their own package and say so; an interviewer won't mind the names, but they will notice if you don't.</p>` }
      ] },
      { id: `class-diagram`, title: `Final class design`, kicker: `Step 3: class design`, blocks: [
        { type: `code`, lang: `java`, title: `Final class design`, code: `public final class FileSystem {
    private final Directory root;                         // created once; never deleted, moved or renamed
    private final ReentrantReadWriteLock lock;            // guards every node in the tree

    Directory createDirectory(String path);               // parent must exist; name must be free
    File createFile(String path, String content);
    String read(String path);
    void write(String path, String content);
    List<String> list(String path);                       // child names, sorted
    void delete(String path, boolean recursive);
    void move(String srcPath, String destDirPath);        // into destDir, keeping the name
    void rename(String path, String newName);
    Node get(String path);                                // a reference, for pathOf
    String pathOf(Node node);                             // walks parent pointers
}

public abstract sealed class Node permits File, Directory {
    private volatile String name;
    private Directory parent;                             // null for the root and for deleted nodes
}
public final class File extends Node      { private String content; }
public final class Directory extends Node { private final Map<String, Node> children; }

public record FsPath(List<String> parts) { static FsPath parse(String raw); FsPath parent(); String name(); }

public class FileSystemException extends RuntimeException {}
// PathNotFound, AlreadyExists, NotADirectory, NotAFile, DirectoryNotEmpty, InvalidPath, InvalidOperation` },
        { type: `text`, html: `<p><code>FileSystem</code> is a <strong>facade</strong>: it is the only class that takes paths, the only one that checks rules and the only one that changes structure. The nodes are a <strong>Composite</strong> that stores state and keeps its own map and parent pointers consistent, and nothing more. That split is what lets the follow-ups land in one place each.</p>` }
      ] },
      { id: `core-impl`, title: `Implementation: resolve, create, read and list`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>Check what the interviewer wants: working code, pseudocode or a walkthrough. For each method, write the normal path first, then the edge cases. Everything rests on <code>resolve</code>: parse the path, start at the root, and for each segment look the name up in the current folder's map. Creating a node resolves the parent path, checks the name is free and adds the node.</p>` },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `A segment that doesn't exist: <code>PathNotFoundException</code> naming the path.`,
          `A file in the middle of a path (<code>/home/ana/notes.txt/x</code>): <code>NotADirectoryException</code>, not a cast failure.`,
          `Creating at <code>/</code>, or at a name that is taken: <code>AlreadyExistsException</code>, and nothing changes.`,
          `<code>read</code> or <code>write</code> on a folder: <code>NotAFileException</code>; <code>list</code> on a file: <code>NotADirectoryException</code>.`,
          `<code>pathOf</code> on a node that has since been deleted: walking up ends at a detached folder, not the root, so throw rather than return a wrong path.`
        ] },
        { type: `code`, lang: `java`, title: `Node, File and Directory`, code: `/** The Composite's component. Holds state only; FileSystem holds the rules. */
public abstract sealed class Node permits File, Directory {
    private volatile String name;                 // volatile: a caller holding a node may read it without the lock
    private Directory parent;                     // guarded by the FileSystem lock; null for the root and deleted nodes

    protected Node(String name) { this.name = name; }

    public String name()             { return name; }
    Directory parent()               { return parent; }
    void setName(String name)        { this.name = name; }
    void setParent(Directory parent) { this.parent = parent; }
}

public final class File extends Node {
    private String content;                       // guarded by the FileSystem lock
    File(String name, String content) { super(name); this.content = content; }
    String content()                  { return content; }
    void setContent(String content)   { this.content = content; }
}

public final class Directory extends Node {
    private final Map<String, Node> children = new HashMap<>();   // guarded by the FileSystem lock

    Directory(String name) { super(name); }

    Node child(String name) { return children.get(name); }        // null if absent
    boolean isEmpty()       { return children.isEmpty(); }
    List<String> names()    { return children.keySet().stream().sorted().toList(); }

    void add(Node n)    { children.put(n.name(), n); n.setParent(this); }   // the map and the pointer change together
    void remove(Node n) { children.remove(n.name()); n.setParent(null); }
}` },
        { type: `code`, lang: `java`, title: `FileSystem: lock, resolve, create, read, list`, code: `public final class FileSystem {
    private final Directory root = new Directory("");
    // One lock for the whole tree. Every operation checks before it changes anything (the parent exists,
    // the name is free, no cycle), so the check and the change must happen under the same lock.
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

    public Directory createDirectory(String path) {
        return writing(() -> {
            FsPath p = FsPath.parse(path);
            Directory parent = parentWithFreeName(p);
            Directory dir = new Directory(p.name());
            parent.add(dir);
            return dir;
        });
    }

    public File createFile(String path, String content) {
        return writing(() -> {
            FsPath p = FsPath.parse(path);
            Directory parent = parentWithFreeName(p);
            File file = new File(p.name(), content);
            parent.add(file);
            return file;
        });
    }

    public String read(String path)                { return reading(() -> asFile(resolve(path), path).content()); }
    public void write(String path, String content) { writing(() -> asFile(resolve(path), path).setContent(content)); }
    public List<String> list(String path)          { return reading(() -> asDirectory(resolve(path), path).names()); }
    public Node get(String path)                   { return reading(() -> resolve(path)); }

    /** Walk parent pointers to the root: O(depth), and always current after moves and renames. */
    public String pathOf(Node node) {
        return reading(() -> {
            Deque<String> names = new ArrayDeque<>();
            Node n = node;
            for (; n.parent() != null; n = n.parent()) names.addFirst(n.name());
            if (n != root) throw new PathNotFoundException(node.name() + " is no longer in the tree");
            return "/" + String.join("/", names);
        });
    }

    private Node resolve(String raw) { return resolve(FsPath.parse(raw)); }

    /** Walk down from the root: one map lookup per segment, O(depth) however big the tree is. */
    private Node resolve(FsPath p) {
        Node cur = root;
        for (String part : p.parts()) {
            Node next = asDirectory(cur, p.toString()).child(part);
            if (next == null) throw new PathNotFoundException(p.toString());
            cur = next;
        }
        return cur;
    }

    /** The parent must exist and be a folder, and must not already hold the name. */
    private Directory parentWithFreeName(FsPath p) {
        if (p.isRoot()) throw new AlreadyExistsException("/");
        Directory parent = asDirectory(resolve(p.parent()), p.parent().toString());
        if (parent.child(p.name()) != null) throw new AlreadyExistsException(p.toString());
        return parent;
    }

    private static Directory asDirectory(Node n, String path) {
        if (n instanceof Directory d) return d;
        throw new NotADirectoryException(path);
    }

    private static File asFile(Node n, String path) {
        if (n instanceof File f) return f;
        throw new NotAFileException(path);
    }

    private <T> T reading(Supplier<T> body) {
        lock.readLock().lock();
        try { return body.get(); } finally { lock.readLock().unlock(); }
    }

    private <T> T writing(Supplier<T> body) {
        lock.writeLock().lock();
        try { return body.get(); } finally { lock.writeLock().unlock(); }
    }

    private void writing(Runnable body) {
        lock.writeLock().lock();
        try { body.run(); } finally { lock.writeLock().unlock(); }
    }
    // delete, move and rename: next section
}` },
        { type: `callout`, tone: `warning`, title: `Why one lock, and why a read-write one`, html: `<p>Every map, parent pointer and content field is shared mutable state, and a plain <code>HashMap</code> can be corrupted by concurrent writes. Worse, operations are check-then-act: "is the name free?" followed by "add it" lets two threads both pass the check. So every public method runs under one <code>ReentrantReadWriteLock</code>: reads (<code>read</code>, <code>list</code>, <code>get</code>, <code>pathOf</code>) share it and run in parallel, and changes take it exclusively. Node fields need no locks of their own because they are only touched inside these methods; the lock also makes every change visible to the next reader. The one exception is <code>name</code>, which is <code>volatile</code> because a caller may read it from a <code>Node</code> it holds.</p>` }
      ] },
      { id: `mutate-impl`, title: `Implementation: delete, move and rename`, kicker: `Step 4: implementation`, blocks: [
        { type: `text`, html: `<p>The three operations that change structure share one rule: <strong>check everything, then mutate</strong>. If you detach a node and only then discover a name conflict, you have to put it back, and a bug there loses a whole subtree. The order of checks in <code>move</code>:</p>` },
        { type: `steps`, items: [
          `Resolve the source; refuse if it is the root.`,
          `Resolve the destination; it must be a folder.`,
          `If the source already lives in the destination, there is nothing to do.`,
          `Walk up from the destination to the root; if you meet the source, refuse. Moving a folder into its own subtree would cut a loop of folders off from the root.`,
          `Refuse if the destination already holds the source's name.`,
          `Only now mutate: remove from the old parent's map, add to the new one. The parent pointer follows inside <code>add</code>.`
        ] },
        { type: `list`, title: `Edge cases the code must handle`, items: [
          `Deleting, moving or renaming the root: <code>InvalidOperationException</code>.`,
          `Deleting a non-empty folder without <code>recursive</code>: <code>DirectoryNotEmptyException</code>.`,
          `Moving a folder into itself or a descendant: <code>InvalidOperationException</code>, and the tree is untouched.`,
          `Renaming to the current name: a no-op. Renaming to a taken name: <code>AlreadyExistsException</code>.`,
          `Rename must re-key the parent's map, not just change the node's field.`
        ] },
        { type: `code`, lang: `java`, title: `FileSystem: delete, move, rename`, code: `    public void delete(String path, boolean recursive) {
        writing(() -> {
            Node node = resolve(path);
            if (node == root) throw new InvalidOperationException("cannot delete the root");
            if (node instanceof Directory d && !d.isEmpty() && !recursive) throw new DirectoryNotEmptyException(path);
            node.parent().remove(node);                  // the subtree becomes unreachable and is collected
        });
    }

    public void move(String srcPath, String destDirPath) {
        writing(() -> {
            Node node = resolve(srcPath);
            if (node == root) throw new InvalidOperationException("cannot move the root");
            Directory dest = asDirectory(resolve(destDirPath), destDirPath);
            if (node.parent() == dest) return;           // already there
            for (Directory a = dest; a != null; a = a.parent()) {          // is dest inside node?
                if (a == node) throw new InvalidOperationException("cannot move " + srcPath + " into its own subtree");
            }
            if (dest.child(node.name()) != null) throw new AlreadyExistsException(node.name() + " in " + destDirPath);
            node.parent().remove(node);                  // every check passed: now mutate
            dest.add(node);
        });
    }

    public void rename(String path, String newName) {
        if (newName == null || newName.isEmpty() || newName.contains("/") || newName.equals(".") || newName.equals(".."))
            throw new InvalidPathException("bad name: " + newName);
        writing(() -> {
            Node node = resolve(path);
            if (node == root) throw new InvalidOperationException("cannot rename the root");
            if (node.name().equals(newName)) return;
            Directory parent = node.parent();
            if (parent.child(newName) != null) throw new AlreadyExistsException(newName + " in " + pathOf(parent));
            parent.remove(node);                         // the map is keyed by name: take it out,
            node.setName(newName);                       // change the name,
            parent.add(node);                            // and file it under the new key
        });
    }` },
        { type: `callout`, tone: `mistake`, html: `<p>Changing <code>node.name</code> without re-keying the parent's map. The map still files the node under its old name: lookups by the new name fail and the old name looks taken. Remove, rename, then add.</p>` },
        { type: `keypoints`, items: [
          `<strong>A move is O(depth)</strong>: two resolves and the upward cycle walk. The subtree comes along for free because its nodes only know their parents.`,
          `<strong>Recursive delete is one map removal.</strong> Nothing visits the subtree; references callers still hold now report "no longer in the tree" from <code>pathOf</code>.`,
          `<strong>Calling <code>pathOf</code> inside a write is safe.</strong> <code>ReentrantReadWriteLock</code> lets the thread holding the write lock take the read lock too (the reverse, upgrading read to write, would deadlock).`
        ] },
        { type: `text`, html: `<p>The <a href="https://github.com/ashishps1/awesome-low-level-design/tree/main/solutions/java/src/filedirectory" target="_blank" rel="noopener">awesome-low-level-design file directory solution</a> uses the same core: an abstract node with file and directory subclasses, children in a map by name, and a facade that walks paths. The code here is written independently and adds parent pointers, delete, move and rename, specific exceptions and a lock (the original's maps are unguarded). Its search, built from a Strategy plus a filter chain, moves to a deep dive with typed predicates, and its "create missing folders" walk becomes a separate <code>mkdir -p</code> follow-up that refuses to replace a file with a folder.</p>` }
      ] },
      { id: `verification`, title: `Verifying with a trace`, kicker: `Step 5: verification`, blocks: [
        { type: `text`, html: `<p>Walk a concrete scenario call by call before the interviewer does, covering the normal path and the edge cases that matter: a taken name, a file mid-path, a move into its own subtree, a move that drags a subtree along, a rename, a refused and an allowed delete, and a reference that outlives its node.</p>` },
        { type: `code`, lang: `text`, title: `Call by call`, code: `createDirectory("/home")                       ok
createDirectory("/home/ana")                   ok
createFile("/home/ana/notes.txt", "buy milk")  ok   resolve [home, ana], notes.txt is free
createDirectory("/home/ana/archive")           ok
createDirectory("/backup")                     ok
list("/home/ana")                              [archive, notes.txt]   sorted names
notes = get("/home/ana/notes.txt")             ok   a reference we keep
pathOf(notes)                                  /home/ana/notes.txt   notes.txt -> ana -> home -> root
createFile("/home/ana/notes.txt", "")          AlreadyExistsException: /home/ana/notes.txt
createFile("/home/ana/notes.txt/x", "")        NotADirectoryException: /home/ana/notes.txt
move("/home/ana", "/home/ana/archive")         InvalidOperationException: cannot move /home/ana into its own subtree
                                               (walking up from archive meets ana; nothing changed)
move("/home/ana", "/backup")                   ok   one node re-linked
pathOf(notes)                                  /backup/ana/notes.txt   no update was needed
read("/home/ana/notes.txt")                    PathNotFoundException: /home/ana/notes.txt
rename("/backup/ana", "ana-2025")              ok   removed, renamed, re-added under the new key
pathOf(notes)                                  /backup/ana-2025/notes.txt
read("/backup/ana-2025/notes.txt")             buy milk
delete("/backup", false)                       DirectoryNotEmptyException: /backup
delete("/backup", true)                        ok   one map removal
list("/")                                      [home]
pathOf(notes)                                  PathNotFoundException: notes.txt is no longer in the tree
delete("/", true)                              InvalidOperationException: cannot delete the root
list("//home/")                                []   empty segments collapse
get("home")                                    InvalidPathException: home: must be absolute` },
        { type: `keypoints`, items: [
          `The move into <code>archive</code> was refused before anything changed, so the next move still found <code>/home/ana</code> intact.`,
          `After moving and renaming <code>ana</code>, the file reported its new path with no work on the file itself: parent pointers make descendants follow automatically.`,
          `The kept reference stayed honest: after the recursive delete, <code>pathOf</code> refused instead of returning <code>/notes.txt</code> or <code>/</code>.`,
          `Every failure named a specific exception and the path involved, which is what lets a caller react correctly.`
        ] },
        { type: `lab`, id: `fsPlayground`, caption: `Run the same kind of session yourself: mkdir, touch, write, cat, ls, mv, rename and rm. Try the edge cases from the trace: moving a folder into itself, deleting the root, a file where a folder is expected.` }
      ] }
    ],
    levels: levels(
      [`Scopes the problem: one root, absolute paths, the list of operations, what is out.`, `A Composite tree (<code>Node</code>, <code>File</code>, <code>Directory</code>) with children found by name, and working resolve, create, list, read and delete.`, `Sensible errors for a missing path or a taken name; with hints, gets to parent pointers for "full path from a reference" and spots the move-into-itself case.`],
      [`Picks name maps plus parent pointers unprompted and argues the cost: path in O(depth), move in O(depth), nothing stored that can go stale.`, `Move and rename correct first time: cycle check by walking up from the destination, conflict check, validate then mutate, rename re-keys the map.`, `One path parser with a stated policy for odd input, a specific exception hierarchy, and structure changes only through the facade.`, `A concrete thread-safety answer (one read-write lock) and why it is enough.`],
      [`Asks "how big, and do folders move?" early and uses the answer to justify the whole design.`, `Handles subtle cases without prompting: a kept reference to a deleted node, moving into the folder it is already in, a file in the middle of a path.`, `Discusses concurrency trade-offs fluently: one lock vs per-folder locks (and the concurrent-move cycle they allow), returning snapshots instead of live nodes.`, `Places follow-ups precisely: cached sizes along the parent chain, a Session for relative paths, symlinks as a third node type with a hop limit, search that returns paths.`]
    ),
    concepts: [
      { term: `Composite pattern`, def: `One type for single objects and groups: <code>Node</code> is the component, <code>File</code> the leaf, <code>Directory</code> the composite holding nodes.`, why: `Move, rename, delete and path work on any node; folder operations recurse into children.`, demo: `fsPlayground` },
      { term: `Children map`, def: `Each directory keeps <code>Map&lt;String, Node&gt;</code> from child name to child.`, why: `One O(1) lookup per path segment, and unique names for free.` },
      { term: `Parent pointer`, def: `Every node references its parent directory; null for the root and for deleted nodes.`, why: `A node's path is a walk up, a move re-links one node, and the cycle check is the same walk.`, demo: `pathDesigns` },
      { term: `Path resolution`, def: `Parse an absolute path into segments and walk down from the root, one child lookup per segment.`, why: `Costs O(depth), independent of how many entries the tree holds.`, demo: `fsPlayground` },
      { term: `FsPath`, def: `A record that validates a raw string once (absolute, no <code>.</code> or <code>..</code>, empty segments collapsed) and exposes segments, parent and name.`, why: `Parsing is separate from resolution: every edge case is handled in one place and tested without a tree.` },
      { term: `Cycle check`, def: `Before moving a folder, walk up from the destination to the root; if you meet the source, refuse.`, why: `Moving a folder into its own subtree would cut it off from the root as a loop.`, demo: `fsPlayground` },
      { term: `Validate, then mutate`, def: `Run every check (exists, type, cycle, name free) before changing any structure.`, why: `No half-done moves and no risky rollback.` },
      { term: `Facade`, def: `<code>FileSystem</code> is the single entry point: it takes paths, checks rules and changes structure; node mutators are package-private.`, why: `Every invariant lives in one class, and nobody can bypass it.` },
      { term: `One read-write lock`, def: `A <code>ReentrantReadWriteLock</code> around the tree: reads share it, changes take it exclusively.`, why: `Check-then-act stays atomic and reads run in parallel; per-folder locks are hard because a move spans folders.` }
    ],
    interview: [
      { q: `Why model the file system with the Composite pattern?`, a: `Folders contain both files and folders, and many operations (path, move, rename, delete, size) apply to either kind. A common Node type with File as the leaf and Directory as the composite lets the facade handle any node the same way, and recursive operations such as size fall out by delegating to children.`, diff: `easy` },
      { q: `Why parent pointers instead of storing each node's full path?`, a: `A stored path makes path() O(1), but moving or renaming a folder must rewrite the stored path of every descendant, which can be tens of thousands of nodes, and any missed update leaves a wrong path. With parent pointers, path() walks up in O(depth), a move re-links one node, and paths can never go stale. Depth is small; subtrees can be huge.`, diff: `medium` },
      { q: `Why a HashMap for children instead of a list?`, a: `Resolution does one child lookup per segment. With a list that is a linear scan per level, which hurts in folders with thousands of entries, and nothing stops duplicate names. A map gives O(1) lookup and unique names. Sort when listing, or use a TreeMap if sorted listings dominate.`, diff: `easy` },
      { q: `What can go wrong when moving a folder, and how do you prevent it?`, a: `Moving a folder into its own subtree detaches a loop of folders from the root and loses it. Walk up from the destination to the root before moving and refuse if you meet the source. Also refuse moving the root, a destination that isn't a folder, and a destination that already holds the name, and do every check before mutating.`, diff: `medium` },
      { q: `A caller keeps a Node reference and the folder containing it is deleted. What should pathOf return?`, a: `Not a path. After the delete, walking up from the node ends at the deleted folder, whose parent is null, so a naive walk would report a path starting at "/" that doesn't exist, or "/" itself. pathOf checks that the walk ended at this file system's root and throws PathNotFoundException otherwise. The same check rejects a node from a different FileSystem instance.`, diff: `medium` },
      { q: `How do you make it thread-safe, and why not lock each folder?`, a: `One ReentrantReadWriteLock around every public method: get, list, read and pathOf share the read lock; create, write, delete, move and rename take the write lock. Check-then-act becomes atomic and reads run in parallel. Per-folder locks allow parallel writes, but a move touches two folders plus the ancestor chain for the cycle check; two moves holding disjoint locks can each pass the check and together create a cycle. Only go there with proven write contention, and lock in a global order.`, diff: `hard` },
      { q: `Why throw specific exceptions instead of returning false?`, a: `Each failure needs a different reaction: create the missing parent, pick another name, ask for a recursive delete. A boolean can't say which happened. A base FileSystemException with subtypes (not found, already exists, not a directory, not a file, not empty, invalid path, invalid operation) lets callers catch broadly or precisely, and lets tests assert the exact failure.`, diff: `easy` }
    ],
    cheatsheet: [
      { title: `File system in one screen`, type: `code`, lang: `java`, body: `abstract sealed class Node permits File, Directory { volatile String name; Directory parent; }
final class File extends Node      { String content; }
final class Directory extends Node { Map<String, Node> children;      // add/remove also set parent
                                     Node child(String n); List<String> names(); }

record FsPath(List<String> parts) { static FsPath parse(String raw); FsPath parent(); String name(); }

final class FileSystem {                       // the facade; every method under one read-write lock
    Directory root;
    Directory createDirectory(String path);    // parentWithFreeName, then add
    File createFile(String path, String content);
    String read(String path); void write(String path, String content);
    List<String> list(String path);
    void delete(String path, boolean recursive);          // root refused; non-empty needs recursive
    void move(String src, String destDir);                // root? dest dir? cycle? name free? then mutate
    void rename(String path, String newName);             // remove, setName, add: re-key the map
    Node get(String path);
    String pathOf(Node node);                             // walk up; must end at root
}` },
      { title: `Operations and their cost`, type: `table`, headers: [`Operation`, `How`, `Cost`], rows: [
        [`resolve, get, read, write`, `Walk down from the root, one map lookup per segment`, `O(depth)`],
        [`create`, `Resolve the parent, check the name, add`, `O(depth)`],
        [`list`, `Copy and sort the folder's keys`, `O(k log k) for k children`],
        [`pathOf`, `Walk parent pointers up to the root`, `O(depth)`],
        [`move`, `Two resolves, cycle walk up from the destination, detach, attach`, `O(depth)`],
        [`rename`, `Resolve, check the name, re-key in the parent's map`, `O(depth)`],
        [`delete (recursive)`, `Remove from the parent's map`, `O(depth); the subtree is reclaimed by the GC`]
      ] },
      { title: `Follow-ups and where they land`, type: `table`, headers: [`Follow-up`, `Change`], rows: [
        [`Many threads`, `Already one read-write lock in FileSystem; return snapshots, not live nodes (Deep Dives)`],
        [`Folder sizes`, `<code>size()</code> on Node; cache totals in Directory, updated along the parent chain (Deep Dives)`],
        [`Working directory, <code>.</code> and <code>..</code>`, `A new Session class; FileSystem unchanged (Deep Dives)`],
        [`Search by name or size`, `Typed predicates and one walk in FileSystem (Deep Dives)`],
        [`Symbolic links`, `A third Node type; resolve follows links with a hop limit (Deep Dives)`],
        [`<code>mkdir -p</code>`, `<code>createDirectories</code>: walk what exists, then create the rest (Deep Dives)`],
        [`Permissions, timestamps`, `Fields on Node, checked in FileSystem during resolution`]
      ] }
    ],
    labs: [`fsPlayground`, `pathDesigns`]
  });
})();
