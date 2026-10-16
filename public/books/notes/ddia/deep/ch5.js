// Deep dive: Chapter 5, Replication. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>A user edits their profile photo, the app says "Saved", and they hit refresh. The old photo comes back. They refresh again: new photo. Again: old photo. Your support team files it as "flaky caching", but there is no cache. The writes go to a primary database and the reads are spread across three read replicas to take load off it, and one replica is running two seconds behind. Each refresh lands on a different replica, so the user watches time move backward and forward.</p>
<p>Copying data to several machines is the obvious way to survive a crash, serve users from nearby, and handle more reads. The hard part is that the copies are never perfectly in sync, and users notice. Chapter 5 walks through the three ways to organize replicas (single-leader, multi-leader and leaderless), what goes wrong with each, and the guarantees you can add back.</p>`,
  sections: [
    {
      id: "leaders-and-followers",
      title: "Leaders and followers: one writer, many copies",
      kicker: "Single-leader replication",
      blocks: [
        {
          type: "text",
          html: `<p>Replication means keeping a copy of the same data on several machines connected by a network. There are three reasons to do it: to keep working when some machines fail (<strong>availability</strong>), to put data geographically close to users (<strong>latency</strong>), and to serve more read queries than one machine could (<strong>read throughput</strong>). If data never changed, replication would be trivial: copy it once. All of the difficulty is in handling <em>changes</em>.</p>
<p>The most common arrangement is <strong>single-leader</strong> (also called primary-replica or active-passive). One replica is the leader, and every write must go to it. The leader writes the change locally and sends it to all the other replicas, the followers, through a <strong>replication log</strong>. Each follower applies the changes in the same order the leader did. Clients can read from the leader or from any follower.</p>
<p>This is built into PostgreSQL (streaming replication), MySQL, SQL Server, Oracle and MongoDB, and into non-database systems such as Kafka, where each partition has a leader broker and follower replicas.</p>`,
        },
        {
          type: "diagram",
          title: "Semi-synchronous replication",
          caption: "The leader waits for one synchronous follower before confirming the write, so the data is on two machines when the client hears OK. A second, asynchronous follower receives the change whenever it can.",
          svg: `<svg viewBox="0 0 620 280" role="img" aria-label="Sequence diagram: client writes to leader, leader replicates synchronously to follower 1 and waits for its ack, replies OK, and replicates asynchronously to follower 2">
<defs><marker id="ddia5-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="15" y="20" width="110" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="70" y="42" text-anchor="middle" font-size="13" font-weight="700">Client</text>
<rect x="175" y="20" width="110" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="230" y="42" text-anchor="middle" font-size="13" font-weight="700">Leader</text>
<rect x="335" y="20" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="390" y="42" text-anchor="middle" font-size="13" font-weight="700">Follower 1</text>
<rect x="495" y="20" width="110" height="34" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="550" y="42" text-anchor="middle" font-size="13" font-weight="700">Follower 2</text>
<line x1="70" y1="54" x2="70" y2="250" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="230" y1="54" x2="230" y2="250" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="390" y1="54" x2="390" y2="250" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="550" y1="54" x2="550" y2="250" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="70" y1="80" x2="226" y2="80" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#ddia5-arrow)"/>
<text x="150" y="73" text-anchor="middle" font-size="12">write x = 5</text>
<line x1="230" y1="110" x2="386" y2="110" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#ddia5-arrow)"/>
<text x="310" y="103" text-anchor="middle" font-size="12">replicate (sync)</text>
<line x1="390" y1="145" x2="234" y2="145" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#ddia5-arrow)"/>
<text x="310" y="138" text-anchor="middle" font-size="12">ack</text>
<line x1="230" y1="170" x2="74" y2="170" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#ddia5-arrow)"/>
<text x="150" y="163" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-ok)">OK</text>
<line x1="230" y1="185" x2="546" y2="235" stroke-width="2" stroke-dasharray="6 4" style="stroke: var(--dg-muted)" marker-end="url(#ddia5-arrow)"/>
<text x="470" y="200" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">replicate (async)</text>
<text x="310" y="272" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">OK means: on the leader and on one follower.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Synchronous or asynchronous?</h3>
<p>With <strong>synchronous</strong> replication the leader waits for a follower to confirm before reporting success. The follower is guaranteed to have an up-to-date copy, but if it is slow or down, every write stalls. Making <em>all</em> followers synchronous is impractical, since any one failure would halt writes.</p>
<p>With <strong>asynchronous</strong> replication the leader confirms immediately and followers catch up in the background, usually within a fraction of a second but sometimes minutes behind during load spikes or network trouble. Writes keep flowing even if every follower is down, but if the leader dies, confirmed writes it had not yet shipped are lost.</p>
<p>The common compromise is <strong>semi-synchronous</strong>: one follower is synchronous and the rest are asynchronous; if the synchronous one fails, another is promoted to synchronous. PostgreSQL configures this with <code>synchronous_standby_names</code>, and MySQL offers semi-synchronous replication as a plugin.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "Single-leader strengths",
          consLabel: "Single-leader limits",
          pros: [
            "No write conflicts: one node orders all writes",
            "Simple to understand and supported by nearly every database",
            "Reads scale by adding followers",
          ],
          cons: [
            "All writes go through one node, so write throughput is capped by it (until you partition, Chapter 6)",
            "Writes from far-away regions pay a round trip to the leader's region",
            "Leader failure requires failover, which is the riskiest operation in the design",
          ],
        },
        {
          type: "quiz",
          q: "A database uses fully asynchronous replication. The leader confirms a write to the client and crashes 50 ms later, and a follower is promoted. What may happen to that write?",
          options: [
            "Nothing; confirmed writes are always durable",
            "It may be lost, because the leader may not have sent it to any follower before crashing",
            "It is replayed automatically from the client",
            "The new leader rejects all writes until the old leader returns",
          ],
          answer: 1,
          explain: "Asynchronous replication confirms before followers have the data. If the leader dies in that window, the promoted follower never saw the write, so it is gone even though the client was told it succeeded. Semi-synchronous replication narrows the window by guaranteeing one other copy.",
        },
      ],
    },
    {
      id: "failover-and-logs",
      title: "Adding followers, failover, and what the replication log contains",
      kicker: "Operations",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Adding a follower</strong> without downtime cannot be done by copying files while the leader keeps changing them. Instead: take a consistent snapshot of the leader at a known position in its replication log, copy the snapshot to the new node, then have the follower request every change since that position and apply it until it has caught up. PostgreSQL calls the position a log sequence number (LSN), and MySQL uses binlog coordinates or global transaction IDs (GTIDs).</p>
<p><strong>A follower crash</strong> is easy: on restart it knows the last position it applied and asks the leader for everything after it.</p>
<p><strong>A leader crash</strong> needs <strong>failover</strong>: decide the leader is dead (usually via a timeout on heartbeats), choose a new one (ideally the follower with the most recent data, chosen by an election or a controller), and redirect clients and the remaining followers to it. If the old leader comes back, it must accept that it is now a follower.</p>`,
        },
        {
          type: "list",
          title: "What goes wrong during failover",
          items: [
            "<strong>Lost writes</strong>: with asynchronous replication the new leader may lack the old leader's last writes. When the old leader returns, its extra writes conflict, and they are usually discarded, which breaks durability promises.",
            "<strong>Damage outside the database</strong>: discarded writes can still have been seen by other systems, such as a cache or a search index that already holds IDs the new leader will hand out again.",
            "<strong>Split brain</strong>: two nodes both believe they are leader and both accept writes, and the data diverges. Systems use fencing (cutting off the old leader, sometimes literally powering it off) to prevent this.",
            "<strong>The wrong timeout</strong>: too long and recovery is slow; too short and a load spike or brief network blip triggers an unnecessary failover, which adds load exactly when the system is struggling.",
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>A widely read example came after the book was published. On October 21, 2018, GitHub lost connectivity between its US East Coast network hub and its primary data center for 43 seconds. Its automated MySQL failover promoted primaries in a West Coast data center during that window, and when connectivity returned some writes existed only in the East and others only in the West. GitHub chose to preserve data integrity over availability and spent about 24 hours restoring and reconciling, with degraded service throughout. Since then, the typical recommendation for automated failover has been to base it on a consensus system: Patroni manages PostgreSQL leadership through etcd, Consul or ZooKeeper, and Raft-based databases such as CockroachDB and etcd itself elect leaders internally.</p>`,
        },
        {
          type: "text",
          html: `<h3>Implementing the replication log</h3>
<p><strong>Statement-based</strong>: the leader ships every SQL statement. Compact, but any nondeterminism breaks it: <code>NOW()</code> or <code>RAND()</code> evaluate differently on each replica, auto-increment values and <code>UPDATE ... WHERE</code> depend on exact execution order, and triggers may have side effects. MySQL used this by default in old versions and now defaults to row-based logging.</p>
<p><strong>Write-ahead log shipping</strong>: send the storage engine's own WAL, the low-level record of which bytes changed in which disk pages. PostgreSQL's physical streaming replication works this way. It is exact, but couples replication to the storage format, so leader and followers usually must run the same database version, which complicates zero-downtime upgrades.</p>
<p><strong>Logical (row-based) log</strong>: a separate log describing changes at the row level, such as "inserted this row with these values" or "deleted the row with this primary key". It is independent of the storage engine, so replicas can run different versions, and it is easy for external systems to parse. MySQL's row-based binlog and PostgreSQL's logical decoding (with built-in logical replication since version 10) are examples. This is the foundation of <strong>change data capture</strong>, which tools such as Debezium use to stream database changes into Kafka.</p>`,
        },
        {
          type: "table",
          headers: ["Log type", "What is shipped", "Strength", "Weakness"],
          rows: [
            ["Statement-based", "SQL statements", "Compact", "Nondeterministic functions and ordering break it"],
            ["WAL shipping", "Disk-page byte changes", "Exact copy, low overhead", "Tied to storage format and version"],
            ["Logical (row-based)", "Row inserts, updates, deletes", "Version-independent, usable for change data capture", "Larger than statements for bulk updates"],
          ],
        },
        {
          type: "quiz",
          q: "You want to upgrade PostgreSQL to a new major version with near-zero downtime by running the new version as a replica and then failing over to it. Which replication method makes this possible?",
          options: [
            "Physical WAL streaming, because it is exact",
            "Logical replication, because it describes row changes independently of the on-disk format",
            "Statement-based replication",
            "Any method works across major versions",
          ],
          answer: 1,
          explain: "Physical WAL shipping describes changes to disk pages, which are specific to a major version, so a replica on a newer version cannot apply it. Logical replication sends row-level changes that any version can apply, so you can bring up a new-version replica, let it catch up, and switch over.",
        },
      ],
    },
    {
      id: "replication-lag",
      title: "Replication lag and the guarantees users notice",
      kicker: "Consistency anomalies",
      blocks: [
        {
          type: "problem",
          html: `<p>Reading from followers is how single-leader systems scale reads, and that only works with asynchronous replication. So followers are always a little behind. Stop all writes and they will eventually catch up, a property called <strong>eventual consistency</strong>. But "eventually" has no bound: normally it is milliseconds, under load it can be seconds or minutes. Three specific anomalies show up, each with its own fix.</p>`,
        },
        {
          type: "diagram",
          title: "Reading your own write from a lagging follower",
          caption: "The user's write reaches the leader and is confirmed, but the next read goes to a follower that has not received it yet. To the user, their comment has vanished.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="A user posts a comment to the leader, then reloads from a follower that has not yet received the change and sees nothing">
<defs><marker id="ddia5-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="25" y="20" width="110" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="80" y="42" text-anchor="middle" font-size="13" font-weight="700">User</text>
<rect x="265" y="20" width="110" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="320" y="42" text-anchor="middle" font-size="13" font-weight="700">Leader</text>
<rect x="485" y="20" width="110" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="540" y="42" text-anchor="middle" font-size="13" font-weight="700">Follower</text>
<line x1="80" y1="54" x2="80" y2="235" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="320" y1="54" x2="320" y2="235" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="540" y1="54" x2="540" y2="235" stroke-width="1.5" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="80" y1="80" x2="316" y2="80" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#ddia5-arrow2)"/>
<text x="200" y="73" text-anchor="middle" font-size="12">post comment</text>
<line x1="320" y1="105" x2="84" y2="105" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#ddia5-arrow2)"/>
<text x="200" y="98" text-anchor="middle" font-size="12">OK</text>
<line x1="80" y1="150" x2="536" y2="150" stroke-width="2" style="stroke: var(--dg-ink)" marker-end="url(#ddia5-arrow2)"/>
<text x="200" y="143" text-anchor="middle" font-size="12">reload page</text>
<line x1="540" y1="180" x2="84" y2="180" stroke-width="2" style="stroke: var(--dg-bad)" marker-end="url(#ddia5-arrow2)"/>
<text x="200" y="173" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-bad)">comment missing</text>
<line x1="320" y1="95" x2="536" y2="205" stroke-width="2" stroke-dasharray="6 4" style="stroke: var(--dg-muted)" marker-end="url(#ddia5-arrow2)"/>
<text x="535" y="228" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">replicated late</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Read-your-writes consistency</h3>
<p>Also called read-after-write consistency: a user always sees their own updates after making them, with no promise about other users' updates. Ways to provide it:</p>
<ul>
<li>Read things the user may have modified from the leader. For example, your own profile is read from the leader and other people's profiles from followers.</li>
<li>For a short window after a user writes (say, one minute), send all of their reads to the leader, or avoid followers that are lagging more than that.</li>
<li>Have the client remember the log position of its latest write and only read from a replica that has applied at least that position. In PostgreSQL, a client could compare its write's LSN with a replica's <code>pg_last_wal_replay_lsn()</code>.</li>
</ul>
<p>It gets harder when the same user has several devices, because the "remember my last write" state must be shared between them, and requests from different devices may be routed to different data centers.</p>
<h3>Monotonic reads</h3>
<p>The time-travel effect from the opening: two reads in a row go to different replicas, and the second replica is further behind than the first, so data the user just saw disappears. Monotonic reads guarantee that once you have seen data at some point in time, later reads never show older data. A simple implementation is to route each user to the same replica every time, for example by hashing the user ID, with a fallback if that replica fails.</p>
<h3>Consistent prefix reads</h3>
<p>If writes happen in a particular order, anyone reading them sees them in that order. Violations show up mainly in partitioned databases (Chapter 6), where different partitions replicate independently. Imagine an order event "payment captured" stored in one partition and "order shipped" in another: a reader could see "shipped" before "paid", which a fraud check would flag. Fixes include writing causally related events to the same partition, or tracking causal dependencies explicitly.</p>`,
        },
        {
          type: "table",
          title: "Lag anomalies and their fixes",
          headers: ["Guarantee", "Violation looks like", "Typical fix"],
          rows: [
            ["Read-your-writes", "My change vanished after I saved it", "Read own data from the leader, or wait for the replica to reach my write's log position"],
            ["Monotonic reads", "Data appears, then disappears on refresh", "Pin each user to one replica"],
            ["Consistent prefix", "An effect shows up before its cause", "Put causally related writes in one partition, or track dependencies"],
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Each of these guarantees is something a single-node database gives you for free. The lesson of this section is that once you add asynchronous replicas you must decide, per feature, which guarantee users need, and engineer it in the application or pick a database that offers it. The book argues this is exactly why transactions exist: to stop every application developer from reinventing these guarantees.</p>`,
        },
        {
          type: "quiz",
          q: "Users sometimes see a comment thread show a reply before the question it answers. The database is partitioned and asynchronously replicated. Which guarantee is being violated?",
          options: ["Read-your-writes", "Monotonic reads", "Consistent prefix reads", "Durability"],
          answer: 2,
          explain: "The writes happened in a causal order (question, then reply), but the reader saw them out of order, typically because they live in different partitions that replicate at different speeds. Keeping a thread's messages in one partition, or tracking causal dependencies, restores the order.",
        },
      ],
    },
    {
      id: "multi-leader",
      title: "Multi-leader replication: writes in many places",
      kicker: "Multi-leader",
      blocks: [
        {
          type: "text",
          html: `<p>Single-leader replication has an obvious limit: if you cannot reach the leader, you cannot write. <strong>Multi-leader</strong> replication (also called active-active or master-master) lets more than one node accept writes. Each leader processes writes locally and forwards them to the others, so every leader is also a follower of every other leader.</p>
<p>Inside one data center this rarely pays off, because the added complexity outweighs the benefit. It makes sense in three situations:</p>
<ul>
<li><strong>Several data centers</strong>: each region has its own leader, so writes are fast for local users, each data center keeps working if another goes offline or the link between them breaks, and replication between regions is asynchronous.</li>
<li><strong>Clients that work offline</strong>: a calendar or notes app on a phone or laptop is effectively a local database that accepts writes while disconnected and syncs later. Each device is a leader, and replication lag can be days. CouchDB was designed for this mode.</li>
<li><strong>Collaborative editing</strong>: in real-time editors like Google Docs, each user's local copy accepts their edits immediately and changes are exchanged with other users. For fast collaboration the unit of change is tiny, such as one keystroke.</li>
</ul>`,
        },
        {
          type: "problem",
          html: `<p>The big downside is <strong>write conflicts</strong>. Two users edit the title of the same page at the same time, one through the European leader and one through the US leader. Both writes succeed locally. The conflict is only discovered later, when the leaders exchange changes, and by then both users have been told their write succeeded. There is no "first" writer to keep.</p>`,
        },
        {
          type: "text",
          html: `<h3>Handling conflicts</h3>
<p><strong>Avoid them</strong>: route all writes for a given record to the same leader, for example by giving each user a home data center. This is the simplest and most recommended approach, but it breaks down when a data center fails or a user moves and the home must change.</p>
<p><strong>Converge</strong>: all replicas must end up with the same value, which means resolving the conflict the same way everywhere. Options include giving each write a unique ID or timestamp and keeping the highest (<strong>last write wins</strong>, which silently throws away the other writes), giving replicas a priority order (also lossy), merging the values (for example concatenating the two titles), or recording the conflict in a data structure that keeps both versions and resolving it later.</p>
<p><strong>Custom logic</strong>: many systems let the application decide. Some resolve on write, calling a handler as soon as the replication log reveals a conflict; others, such as CouchDB, store all conflicting versions and let the application resolve them on the next read, possibly by asking the user.</p>
<h3>Replication topologies</h3>
<p>With more than two leaders, the paths along which writes travel matter. In a <strong>circular</strong> or <strong>star</strong> topology writes pass through intermediate nodes, each tagged with the IDs of nodes it has passed through to avoid infinite loops, but one failed node can interrupt the flow for others. <strong>All-to-all</strong> is more fault tolerant, but writes may arrive out of order because some network paths are faster: an update can arrive before the insert it modifies. Version vectors (covered below) are the standard tool for ordering such events correctly.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "CouchDB", title: "Built for multi-leader sync", html: "Every CouchDB database can replicate with any other, in either direction, including offline clients. Conflicting revisions are kept, one is deterministically chosen as the winner for reads, and the losers remain available for the application to merge." },
            { org: "PostgreSQL and MySQL", title: "Add-on multi-leader", html: "Tools such as BDR for PostgreSQL and Tungsten Replicator for MySQL add multi-leader replication on top of databases designed for a single leader. Interactions with auto-increment keys, triggers and constraints make them riskier than built-in single-leader replication." },
            { org: "Collaborative editors", title: "Conflict resolution per keystroke", html: "Google Docs uses operational transformation to merge concurrent edits. Newer collaborative tools often use CRDT libraries such as Automerge and Yjs, which let each device edit offline and merge deterministically." },
          ],
        },
        {
          type: "quiz",
          q: "Your app has leaders in Europe and the US with last-write-wins conflict resolution based on wall-clock timestamps. Two users change the same setting within the same second. What is the risk?",
          options: [
            "Both changes are kept",
            "One change is silently discarded, and with clock skew it may not even be the later one",
            "The database rejects both writes",
            "Replication stops until an operator intervenes",
          ],
          answer: 1,
          explain: "Last write wins converges by throwing away every write except the one with the highest timestamp. Both users were told their write succeeded, and if the servers' clocks disagree slightly, the write kept may be the one that actually happened first.",
        },
      ],
    },
    {
      id: "leaderless-quorums",
      title: "Leaderless replication and quorums",
      kicker: "Leaderless",
      blocks: [
        {
          type: "idea",
          html: `<p>Drop the leader entirely. The client (or a coordinator node acting for it) sends each write to <strong>several replicas in parallel</strong> and reads from several in parallel too. With <strong>N</strong> replicas, a write counts as successful after <strong>W</strong> acknowledgments and a read queries <strong>R</strong> replicas. If <span class="formula">W + R &gt; N</span>, the set of nodes you read from must overlap the set that accepted the latest write, so at least one response is current.</p>`,
        },
        {
          type: "text",
          html: `<p>Amazon's internal Dynamo system (described in a 2007 paper) made this design popular, and Riak, Cassandra and Voldemort adopted it; such databases are often called Dynamo-style. Because there is no leader, there is no failover: if one of three replicas is down, writes with W = 2 and reads with R = 2 continue normally.</p>
<p>Reads detect staleness with version numbers attached to each value. When responses disagree, the client uses the newest value. Stale replicas get fixed in two ways. <strong>Read repair</strong>: when a read sees an old version on some replica, it writes the newer one back. This works well for values that are read frequently. <strong>Anti-entropy</strong>: a background process compares replicas and copies missing data; Dynamo and Cassandra use Merkle trees, hash trees that let two replicas find which ranges differ without comparing every key. Without anti-entropy, rarely read values could stay stale on some replicas indefinitely.</p>`,
        },
        {
          type: "diagram",
          title: "Quorum write and read with N = 3, W = 2, R = 2",
          caption: "The write of version 7 reaches two of three replicas. A later read contacts two replicas; because 2 + 2 &gt; 3, at least one of them has version 7. The client keeps the newest value and repairs the stale replica.",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="A writer reaches two of three replicas with version 7; a reader queries two replicas, gets version 7 and stale version 6, and keeps version 7">
<defs><marker id="ddia5-arrow3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="110" width="90" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="65" y="135" text-anchor="middle" font-size="12" font-weight="700">Write W=2</text>
<rect x="240" y="40" width="110" height="40" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="295" y="65" text-anchor="middle" font-size="12">Replica 1: v7</text>
<rect x="240" y="110" width="110" height="40" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="295" y="135" text-anchor="middle" font-size="12">Replica 2: v7</text>
<rect x="240" y="180" width="110" height="40" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="295" y="205" text-anchor="middle" font-size="12">Replica 3: v6</text>
<rect x="510" y="110" width="90" height="40" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="555" y="135" text-anchor="middle" font-size="12" font-weight="700">Read R=2</text>
<line x1="110" y1="130" x2="236" y2="62" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#ddia5-arrow3)"/>
<line x1="110" y1="130" x2="236" y2="130" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#ddia5-arrow3)"/>
<line x1="110" y1="130" x2="236" y2="198" stroke-width="2" stroke-dasharray="5 4" style="stroke: var(--dg-bad)"/>
<text x="150" y="196" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">missed</text>
<line x1="350" y1="130" x2="506" y2="130" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia5-arrow3)"/>
<text x="430" y="122" text-anchor="middle" font-size="12">v7</text>
<line x1="350" y1="200" x2="506" y2="142" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia5-arrow3)"/>
<text x="440" y="198" text-anchor="middle" font-size="12">v6 (stale)</text>
<text x="555" y="172" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">newest wins;</text>
<text x="555" y="188" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">repair replica 3</text>
<text x="310" y="250" text-anchor="middle" font-size="12" font-weight="700">W + R = 4 &gt; N = 3, so every read overlaps the latest write</text>
</svg>`,
        },
        {
          type: "table",
          title: "Choosing N, W and R",
          headers: ["Setting", "Tolerates", "Effect"],
          rows: [
            ["N=3, W=2, R=2", "1 node down for both reads and writes", "The common balanced default"],
            ["N=3, W=3, R=1", "No node down for writes", "Fast reads, but writes fail if any replica is unavailable"],
            ["N=3, W=1, R=3", "No node down for reads", "Fast writes, slow and fragile reads"],
            ["N=3, W=1, R=1", "2 nodes down", "Lowest latency, but W + R = 2 is not &gt; 3, so reads may be stale"],
            ["N=5, W=3, R=3", "2 nodes down", "More replicas for higher fault tolerance"],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>W + R &gt; N is weaker than it sounds. Stale reads remain possible when: a <strong>sloppy quorum</strong> accepted writes on nodes outside the usual N (below); two writes are concurrent and resolved by last write wins, so one is lost; a read runs concurrently with a write that has reached only some replicas; a write succeeded on fewer than W nodes, reported failure, but was not rolled back on the nodes that applied it; or a replica holding the new value fails and is restored from older data. Quorums give a probabilistic, best-effort freshness, not the linearizability of Chapter 9.</p>`,
        },
        {
          type: "text",
          html: `<h3>Sloppy quorums and hinted handoff</h3>
<p>In a large cluster a network problem may cut a client off from most of a key's N "home" replicas while plenty of other nodes are reachable. A <strong>sloppy quorum</strong> accepts the write on any W reachable nodes, even if they are not among the key's home nodes. When the home nodes come back, the stand-ins send the writes to them, called <strong>hinted handoff</strong>. This increases write availability, but a read from the home nodes may not see the write until the handoff completes, so it is really a durability promise, not a quorum in the overlapping sense. Riak enables sloppy quorums by default; Cassandra uses hinted handoff but does not count hints toward the consistency level of a write (except at its weakest level, ANY).</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Amazon DynamoDB shares a name with the 2007 Dynamo paper but not its replication design. Amazon's 2022 USENIX ATC paper on DynamoDB describes each partition as a replication group with an elected leader, using Multi-Paxos; strongly consistent reads go to the leader. Leaderless quorums remain central to Cassandra, ScyllaDB and Riak.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Apache Cassandra", title: "Tunable consistency", html: "Each request picks a consistency level: ONE, QUORUM, LOCAL_QUORUM (a quorum within the local data center, avoiding cross-region latency), ALL, and others. Repair is done with read repair and the <code>nodetool repair</code> anti-entropy process." },
            { org: "Amazon Aurora", title: "Quorums under a single leader", html: "Aurora keeps a single writer instance but replicates storage six ways across three availability zones, with a write quorum of 4 and a read quorum of 3 (4 + 3 &gt; 6). It can lose a whole zone and still write, or a zone plus one more node and still read." },
          ],
        },
        {
          type: "quiz",
          q: "A Cassandra cluster uses N = 3 with writes at ONE and reads at ONE for speed. A user updates their email and immediately reads it back, getting the old value. Why?",
          options: [
            "Cassandra lost the write",
            "W + R = 2 is not greater than N = 3, so the read can hit a replica the write has not reached yet",
            "The clock is wrong",
            "Read repair is disabled by default",
          ],
          answer: 1,
          explain: "With one acknowledgment for writes and one for reads, the replica that answered the read need not be the one that took the write. Writing and reading at QUORUM (2 of 3) guarantees overlap, at the cost of higher latency and less tolerance of failed nodes.",
        },
      ],
    },
    {
      id: "concurrent-writes",
      title: "Detecting concurrent writes: version vectors and CRDTs",
      kicker: "Conflicts",
      blocks: [
        {
          type: "problem",
          html: `<p>In leaderless and multi-leader systems two clients can write the same key at nearly the same time, and the writes arrive at different replicas in different orders. If each replica simply keeps whatever arrived last, replicas disagree forever. They must converge, and ideally without throwing data away.</p>`,
        },
        {
          type: "text",
          html: `<h3>Last write wins and its cost</h3>
<p><strong>Last write wins (LWW)</strong> attaches a timestamp to each write and keeps the biggest. It converges, and it is the only conflict resolution Cassandra supports (per column). But it achieves convergence by dropping data: when several writes are concurrent, all but one are discarded even though each client was told it succeeded, and with clock skew the survivor may not even be the most recent. LWW is safe when each key is written once and never updated, for example when keys are UUIDs.</p>
<h3>Happens-before versus concurrent</h3>
<p>Operation A <strong>happens before</strong> operation B if B knew about A, depended on it, or built upon it. If neither knew about the other, they are <strong>concurrent</strong>, whatever the clocks say. Exact timing does not matter: two writes are concurrent if neither was aware of the other when it was made. That gives a clear rule. If one write happened before the other, the later one may overwrite the earlier. If they are concurrent, there is a genuine conflict that must be merged.</p>`,
        },
        {
          type: "steps",
          title: "Tracking causality with version numbers (one replica)",
          items: [
            "The server keeps a version number per key, incremented on every write, and stores each value with its version.",
            "A client must read a key before writing it. The server returns all current values plus the latest version number.",
            "When writing, the client sends the version it last read and its merged new value.",
            "The server overwrites every value with a version less than or equal to the one sent, since the client has seen them, but keeps values with higher versions, since those were written concurrently.",
            "Values kept side by side are called <strong>siblings</strong>. The next reader merges them, for example by taking the union of two shopping carts.",
          ],
        },
        {
          type: "text",
          html: `<p>With several replicas accepting writes, a single number is not enough. Each replica keeps its own counter, and the collection of counters for a key is a <strong>version vector</strong>. Comparing two vectors tells you whether one value supersedes the other (every counter greater than or equal) or whether they are concurrent (each is ahead somewhere). Riak uses a refinement called dotted version vectors and returns siblings to the application.</p>
<p>Merging siblings by hand is error-prone. Union works for adding items to a cart, but deletions need care: if one sibling removed an item, a plain union brings it back. The fix is a <strong>tombstone</strong> that records the deletion, so merges know the item was removed rather than never added.</p>
<h3>CRDTs: merge logic you do not have to write</h3>
<p><strong>Conflict-free replicated data types</strong> are data structures (counters, sets, maps, ordered lists, text) designed so that concurrent updates on different replicas can always be merged automatically, and every replica ends up with the same result regardless of the order in which it received the updates. A grow-only counter keeps one count per replica and sums them; an observed-remove set tags each addition with a unique ID so that removing an element only removes the additions the remover had seen.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Last write wins", tone: "bad", html: "Simple and always converges, but concurrent writes are silently lost and clock skew decides the winner. Only safe for write-once or truly overwrite-only data." },
            { title: "Siblings with version vectors", tone: "warn", html: "Nothing is lost; concurrency is detected precisely. The application must merge siblings correctly, including deletions via tombstones." },
            { title: "CRDTs", tone: "ok", html: "Merges are automatic and provably convergent. Limited to the operations the data type supports, and metadata (unique tags, tombstones) can grow." },
          ],
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>CRDTs have moved from research into products since the book's first edition. Automerge and Yjs are widely used libraries for collaborative and offline-capable apps, and the 2019 essay "Local-first software" by Kleppmann and colleagues at Ink &amp; Switch argued for apps that keep the primary copy on the user's device and sync through CRDTs. Riak data types and Redis Enterprise's Active-Active databases apply CRDTs on the server side.</p>`,
        },
        {
          type: "quiz",
          q: "Two replicas hold version vectors {A: 3, B: 1} and {A: 2, B: 2} for the same key. What is the relationship between the two values?",
          options: [
            "The first supersedes the second",
            "The second supersedes the first",
            "They are concurrent, and must be kept as siblings or merged",
            "They are identical",
          ],
          answer: 2,
          explain: "The first is ahead on A (3 versus 2) and the second is ahead on B (2 versus 1), so neither saw all of the other's writes. That is the definition of concurrent. One supersedes the other only if all of its counters are greater than or equal.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Replication comes up in almost every design: "what happens if this database node dies?", "how do you serve users in Europe and Asia?", "the user just posted but cannot see it, why?". Interviewers listen for whether you know that replicas lag, what that does to users, and which knob trades consistency against availability and latency.</p>`,
        },
        {
          type: "table",
          title: "The three replication families",
          headers: ["", "Single-leader", "Multi-leader", "Leaderless"],
          rows: [
            ["Who accepts writes", "One leader", "One leader per region or device", "Any W of N replicas"],
            ["Write conflicts", "None", "Yes, resolved after the fact", "Yes, detected with versions"],
            ["Leader failure", "Failover needed (risky)", "Other leaders continue", "No leader to fail"],
            ["Typical systems", "PostgreSQL, MySQL, MongoDB, Kafka partitions", "Multi-region setups, CouchDB, offline apps", "Cassandra, ScyllaDB, Riak"],
          ],
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A strong replication answer covers:</p>
<ol>
<li>The topology and why: single-leader by default; multi-leader or leaderless for multi-region writes or extreme availability.</li>
<li>Sync versus async: semi-synchronous so a confirmed write survives the leader's death.</li>
<li>Failover: how the leader is detected dead, who decides (a consensus system, not a script), and how split brain is fenced off.</li>
<li>User-facing guarantees: read-your-writes for a user's own data (read from the leader or wait for the log position), monotonic reads by pinning users to a replica.</li>
<li>For leaderless: N, W, R values and why, plus read repair and anti-entropy; for multi-leader: the conflict strategy, and why last write wins loses data.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "You are designing a shopping cart that must accept writes even during a network split between two regions, and must never lose an item a user added. Which approach fits best?",
          options: [
            "Single-leader with synchronous replication across regions",
            "Multi-leader or leaderless with last-write-wins on the whole cart",
            "Multi-leader or leaderless storing the cart as a CRDT set (or siblings merged by union with tombstones for removals)",
            "Read-only replicas in each region",
          ],
          answer: 2,
          explain: "Accepting writes during a partition rules out a single leader in one region. Last write wins on the whole cart would discard one region's additions. A set CRDT, or siblings merged by union with tombstones so removals stick, keeps every addition and converges, which is exactly the shopping-cart example that motivated Dynamo.",
        },
      ],
    },
  ],
  takeaways: [
    "Replication serves availability, latency and read throughput; all of its difficulty comes from propagating changes.",
    "Single-leader is the default: no write conflicts, simple, and scalable for reads. Semi-synchronous replication guarantees each confirmed write exists on two nodes.",
    "Failover is the risky part: lost asynchronous writes, split brain and badly tuned timeouts. Base leader election on a consensus system and fence the old leader.",
    "Logical (row-based) replication logs decouple replicas from the storage format and power change data capture.",
    "Asynchronous followers lag. Decide per feature whether users need read-your-writes, monotonic reads or consistent prefix reads, and implement them deliberately.",
    "Multi-leader and leaderless designs keep accepting writes during failures but must handle conflicts. Last write wins converges by losing data; version vectors detect true concurrency; CRDTs merge automatically.",
    "Quorums with W + R &gt; N make stale reads unlikely, not impossible: sloppy quorums, concurrent writes and partial failures all leak through.",
  ],
  furtherReading: [
    { title: "Dynamo: Amazon's Highly Available Key-value Store (2007)", url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf", note: "Leaderless replication, sloppy quorums, hinted handoff, Merkle-tree anti-entropy and vector clocks." },
    { title: "October 21 post-incident analysis (GitHub Blog, 2018)", note: "A detailed account of how a 43-second network partition and automated MySQL failover led to a day of degraded service." },
    { title: "Amazon DynamoDB: A Scalable, Predictably Performant, and Fully Managed NoSQL Database Service (USENIX ATC 2022)", note: "How DynamoDB actually replicates: leader-based Multi-Paxos replication groups per partition." },
    { title: "A comprehensive study of Convergent and Commutative Replicated Data Types (Shapiro, Pregui&ccedil;a, Baquero and Zawirski, 2011)", note: "The foundational catalog of CRDT designs: counters, sets, registers, graphs and sequences." },
  ],
};
