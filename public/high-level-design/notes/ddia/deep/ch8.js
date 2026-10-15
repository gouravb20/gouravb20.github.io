// Deep dive: DDIA Chapter 8, The Trouble with Distributed Systems. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>A background worker takes a lock from your lock service with a 10-second lease, reads a file from shared storage, and starts rewriting it. Halfway through, the JVM begins a full garbage collection and the process freezes for 15 seconds. The lease expires. A second worker takes the lock, rewrites the same file and finishes. Then the first worker wakes up. As far as its own code can tell, no time has passed: it still "holds the lock", so it writes its half-finished version on top of the second worker's. The file is now corrupt, and every component did exactly what it was designed to do.</p>
<p>On one machine, a program either works or crashes, and the clock is the clock. Across a network, parts fail independently, messages vanish without explanation, clocks disagree, and a process can stop for seconds without knowing it. This chapter catalogues those failure modes, because every algorithm in the next chapter exists to survive them.</p>`,
  sections: [
    {
      id: "partial-failure",
      title: "Partial failure: some parts work, some don't",
      kicker: "The core difference",
      blocks: [
        {
          type: "problem",
          html: `<p>A single computer is designed to be deterministic: if a hardware fault occurs, it usually crashes outright rather than returning a wrong answer, because a clean crash is easier to reason about than corruption. A distributed system cannot do that. With hundreds of machines and the network between them, something is always broken somewhere, and the rest of the system has to keep going.</p>`,
        },
        {
          type: "text",
          html: `<p>The defining feature of distributed systems is <strong>partial failure</strong>: some components are working and some are not, and the failures are <strong>nondeterministic</strong>. A request might succeed, fail, or succeed on the server while the client sees an error. Worse, you often cannot even find out which happened. That uncertainty, not raw failure rates, is what makes distributed software hard.</p>
<p>Two philosophies exist at the extremes. High-performance computing clusters (weather simulation, physics) treat a node failure like a single-machine crash: checkpoint periodically, and if any node dies, stop the whole job and restart from the checkpoint. Internet services cannot stop: users expect the service to be available at any hour, nodes are commodity machines that fail often, and rolling upgrades mean some node is always restarting. So they must tolerate faults while running, which means building a reliable system out of unreliable parts.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Single machine", tone: "ok", html: "Either works or crashes. Shared memory, one clock, no messages lost between components. A bug reproduces when you rerun the same input." },
            { title: "Distributed system", tone: "warn", html: "Parts fail independently and silently. Messages are lost or delayed, clocks disagree, processes pause. The same input can produce different outcomes depending on timing." },
          ],
        },
        {
          type: "analogy",
          html: `<p>Think of coordinating a project with colleagues only by post. If a reply has not arrived, the letter may be lost, your colleague may be ill, they may have replied and that letter is lost, or they are simply slow. You cannot phone to check; another letter has the same problem. Every decision you make has to be safe under all of those possibilities.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Building reliable systems from unreliable parts is not new. TCP gives reliable, ordered delivery over IP, which drops and reorders packets; error-correcting codes give reliable bits over noisy channels. But there is always a limit: TCP can hide lost packets, not a network that has been cut. The fault-tolerance techniques in this book have similar limits, and knowing them is the point of this chapter.</p>`,
        },
      ],
    },
    {
      id: "unreliable-networks",
      title: "Unreliable networks and the silence problem",
      kicker: "Networks",
      blocks: [
        {
          type: "text",
          html: `<p>Most datacenter systems are <strong>shared-nothing</strong>: each machine has its own memory and disk and talks to others only through an asynchronous packet network. Such a network makes no promise about when, or whether, a packet will arrive. When you send a request and wait for a reply, any of these can happen:</p>
<ul>
<li>The request is lost (an unplugged cable, a misconfigured switch, a full queue that drops it).</li>
<li>The request is waiting in a queue and will be delivered later.</li>
<li>The remote node has crashed, or is paused, or is overloaded and not responding.</li>
<li>The remote node processed the request, but the response was lost or is delayed.</li>
</ul>`,
        },
        {
          type: "diagram",
          title: "Three different failures that look identical",
          caption: "In every case the client simply hears nothing. It cannot tell whether the work was done, so its only tool is a timeout, and after a timeout it still does not know.",
          svg: `<svg viewBox="0 0 640 290" role="img" aria-label="A client cannot distinguish a lost request, a crashed node, and a lost response">
<defs><marker id="ddia8-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="30" y="38" width="100" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="65" text-anchor="middle" font-size="13" font-weight="700">client</text>
<rect x="470" y="38" width="130" height="44" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="535" y="65" text-anchor="middle" font-size="13" font-weight="700">node</text>
<line x1="132" y1="60" x2="276" y2="60" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="282" y1="52" x2="298" y2="68" stroke-width="3" style="stroke: var(--dg-bad)"/>
<line x1="298" y1="52" x2="282" y2="68" stroke-width="3" style="stroke: var(--dg-bad)"/>
<text x="300" y="100" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">1. request lost or stuck in a queue</text>
<rect x="30" y="118" width="100" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="145" text-anchor="middle" font-size="13" font-weight="700">client</text>
<rect x="470" y="118" width="130" height="44" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="535" y="145" text-anchor="middle" font-size="13" font-weight="700">node down</text>
<line x1="132" y1="140" x2="464" y2="140" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia8-arrow)"/>
<text x="300" y="180" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">2. node crashed, paused or overloaded</text>
<rect x="30" y="198" width="100" height="44" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="225" text-anchor="middle" font-size="13" font-weight="700">client</text>
<rect x="470" y="198" width="130" height="44" rx="8" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="535" y="225" text-anchor="middle" font-size="13" font-weight="700">work done</text>
<line x1="132" y1="212" x2="464" y2="212" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia8-arrow)"/>
<line x1="468" y1="230" x2="340" y2="230" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="322" y1="222" x2="338" y2="238" stroke-width="3" style="stroke: var(--dg-bad)"/>
<line x1="338" y1="222" x2="322" y2="238" stroke-width="3" style="stroke: var(--dg-bad)"/>
<text x="300" y="262" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">3. request processed, response lost</text>
<text x="320" y="284" text-anchor="middle" font-size="12" font-weight="700">The client sees the same thing every time: no reply.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>This is why "just retry" is dangerous. In case 3 the work already happened, so retrying a non-idempotent operation (charge a card, send an email, append to a list) does it twice. The only general fixes are to make operations idempotent, or to give each request a unique ID that the server remembers so it can recognise a repeat.</p>
<p>Network faults are not rare corner cases. Published studies of real datacenters, such as Microsoft's 2011 SIGCOMM study of network failures and Peter Bailis and Kyle Kingsbury's 2014 survey "The Network Is Reliable" (whose title is ironic), describe partitions caused by switch failures, misconfiguration and software upgrades, some lasting minutes. Redundant hardware helps less than you would hope, because it does not protect against human error, which causes a large share of outages.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Cassandra and Akka", title: "Phi accrual failure detection", html: "Instead of a fixed timeout, these use the phi accrual detector (Hayashibara et al., 2004). It learns the distribution of heartbeat arrival times and outputs a suspicion level; Cassandra's <code>phi_convict_threshold</code> decides when a node is treated as down." },
            { org: "TCP", title: "Retransmission timeouts", html: "TCP adapts its retransmission timeout to measured round-trip times. On Linux the minimum is 200 ms, so a single lost packet can turn a sub-millisecond datacenter request into a 200 ms one." },
            { org: "Load balancers", title: "Health checks", html: "Load balancers decide a backend is dead after several failed health checks in a row, accepting slower detection in exchange for fewer false alarms caused by one dropped probe." },
          ],
        },
        {
          type: "quiz",
          q: "A client sends a 'transfer $50' request, gets no reply within its 2-second timeout, and retries. The account ends up debited twice. What went wrong?",
          options: [
            "The 2-second timeout was too short; with 10 seconds this cannot happen",
            "The first request was processed but its reply was lost or late, and the operation was not idempotent",
            "TCP should have guaranteed exactly-once delivery",
            "The server must have crashed after committing",
          ],
          answer: 1,
          explain: "Any timeout can expire while the work has been done, because the reply can be lost or delayed. A longer timeout only makes it rarer. TCP deduplicates packets within one connection, not application requests across retries. The fix is an idempotency key that the server checks before applying the transfer.",
        },
      ],
    },
    {
      id: "timeouts-and-delays",
      title: "Timeouts and unbounded delays",
      kicker: "Detecting faults",
      blocks: [
        {
          type: "problem",
          html: `<p>Since a silent node might be dead or just slow, the only practical detector is a timeout. But what value? Declare a node dead too quickly and you fail over from a healthy node that was briefly busy, possibly doing its work twice and piling extra load onto an already struggling cluster. Wait too long and users stare at errors while a genuinely dead node is still trusted.</p>`,
        },
        {
          type: "text",
          html: `<p>If the network guaranteed that every packet arrives within <em>d</em> and every node handles a request within <em>r</em>, then <code>2d + r</code> would be a perfect timeout. Real networks offer neither bound. Most of the variable delay comes from <strong>queueing</strong>:</p>
<ul>
<li>Several machines send to the same destination at once, and the switch queues packets for that port; if the queue fills, packets are dropped and must be retransmitted.</li>
<li>The destination's CPUs are busy, so the operating system queues the request until the application can take it.</li>
<li>In a virtualised environment, the whole VM may be descheduled for tens of milliseconds while another tenant runs.</li>
<li>TCP flow control slows the sender to avoid overloading the network, queueing data before it even leaves the machine.</li>
</ul>
<p>Shared, multi-tenant clouds make it worse, because a noisy neighbour can saturate the links your traffic shares.</p>
<h3>Why not reserve bandwidth, like a phone call?</h3>
<p>Traditional telephone networks <em>are</em> synchronous: a call reserves a fixed slice of bandwidth along its whole path, so delay is bounded. Datacenter networks deliberately use packet switching instead, because data traffic is bursty. A file transfer wants as much bandwidth as possible right now and nothing a moment later; reserving a fixed circuit would waste capacity most of the time. Packet switching uses the wire efficiently, and the price is unbounded queueing delay.</p>`,
        },
        {
          type: "table",
          title: "Choosing a timeout",
          headers: ["Strategy", "How it works", "Risk"],
          rows: [
            ["Short fixed timeout", "Declare dead after, say, 500 ms of silence", "False positives during GC or load spikes; failover storms"],
            ["Long fixed timeout", "Wait 30 s or more", "Long outages before a dead node is replaced"],
            ["Adaptive timeout", "Measure response-time distribution and its variance, set the timeout from it (TCP RTO, phi accrual)", "More complex; still guesses during sudden changes"],
            ["Several missed heartbeats", "Require k consecutive misses before acting", "Detection takes k intervals"],
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Sometimes you get a definite answer instead of silence: if the process crashed but the OS is alive, connecting to its port gets a TCP reset; a load balancer or orchestrator may know a container exited; a switch may report a link down. Use these signals when you have them, but never rely on them, because a node that is frozen rather than dead sends nothing at all.</p>`,
        },
      ],
    },
    {
      id: "unreliable-clocks",
      title: "Unreliable clocks",
      kicker: "Time",
      blocks: [
        {
          type: "text",
          html: `<p>Applications use time in two different ways: to measure a <em>duration</em> ("this request took 80 ms", "the lease expires in 10 s") and to name a <em>point in time</em> ("this row was written at 10:00:03"). Computers offer two kinds of clock for these, and mixing them up causes real bugs.</p>
<ul>
<li>A <strong>time-of-day clock</strong> (wall clock) returns the current date and time: <code>clock_gettime(CLOCK_REALTIME)</code> on Linux, <code>System.currentTimeMillis()</code> in Java. It is synchronised with NTP, which means it can be stepped <em>forward or backward</em> when it is found to be wrong.</li>
<li>A <strong>monotonic clock</strong> only moves forward: <code>CLOCK_MONOTONIC</code>, <code>System.nanoTime()</code>. NTP may adjust its rate slightly (slewing) but never makes it jump back. Its absolute value is meaningless (often time since boot), so comparing it across machines makes no sense.</li>
</ul>
<p>The rule is simple: use the monotonic clock for durations and timeouts, and treat wall-clock timestamps from different machines as approximate.</p>`,
        },
        {
          type: "text",
          html: `<h3>How wrong can a clock be?</h3>
<p>The quartz crystal in a server drifts with temperature. Google has assumed up to 200 parts per million for its servers; at that rate a clock resynced every 30 seconds can be 6 ms off, and one left alone for a day can be about 17 seconds off. NTP corrects drift but is limited by network delay: over the public internet its error is typically tens of milliseconds, and it can be much worse under congestion. A misconfigured firewall that blocks NTP can leave a machine drifting for weeks without anyone noticing, and a VM's clock can jump forward suddenly when it is resumed after being paused.</p>
<p>Leap seconds add another trap: a minute with 61 seconds, which software rarely expects. When the June 2012 leap second hit, a Linux kernel bug sent many Java and MySQL processes into CPU spins. On 1 January 2017, Cloudflare's DNS service had an outage because code computed a duration by subtracting two wall-clock readings, the leap second made the result negative, and the code did not expect that.</p>`,
        },
        {
          type: "diagram",
          title: "Last write wins, decided by a skewed clock",
          caption: "Node A's clock runs 3 seconds fast. Client 2 really did write a second after client 1, but its timestamp is earlier, so both replicas keep x = 1 and silently discard x = 2.",
          svg: `<svg viewBox="0 0 640 285" role="img" aria-label="Last-write-wins with clock skew discards the write that really happened later">
<defs><marker id="ddia8-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="16" y="70" font-size="13" font-weight="700">Node A</text>
<text x="16" y="88" font-size="12" style="fill: var(--dg-muted)">clock 3 s fast</text>
<text x="16" y="190" font-size="13" font-weight="700">Node B</text>
<text x="16" y="208" font-size="12" style="fill: var(--dg-muted)">clock correct</text>
<rect x="125" y="52" width="180" height="46" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="215" y="72" text-anchor="middle" font-size="13" font-weight="700">client 1: x = 1</text>
<text x="215" y="90" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">stamped 10:00:03</text>
<rect x="255" y="172" width="180" height="46" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="345" y="192" text-anchor="middle" font-size="13" font-weight="700">client 2: x = 2</text>
<text x="345" y="210" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">stamped 10:00:01</text>
<rect x="470" y="52" width="155" height="46" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="547" y="72" text-anchor="middle" font-size="13" font-weight="700">keeps x = 1</text>
<text x="547" y="90" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">03 beats 01</text>
<rect x="470" y="172" width="155" height="46" rx="8" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="547" y="192" text-anchor="middle" font-size="13" font-weight="700">keeps x = 1</text>
<text x="547" y="210" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">x = 2 discarded</text>
<line x1="307" y1="94" x2="466" y2="176" stroke-width="2" style="stroke: var(--dg-muted)" stroke-dasharray="5 4" marker-end="url(#ddia8-arrow2)"/>
<line x1="437" y1="176" x2="466" y2="98" stroke-width="2" style="stroke: var(--dg-muted)" stroke-dasharray="5 4" marker-end="url(#ddia8-arrow2)"/>
<line x1="125" y1="250" x2="625" y2="250" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#ddia8-arrow2)"/>
<line x1="215" y1="244" x2="215" y2="256" stroke-width="2" style="stroke: var(--dg-muted)"/>
<line x1="345" y1="244" x2="345" y2="256" stroke-width="2" style="stroke: var(--dg-muted)"/>
<text x="215" y="274" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">real time 0</text>
<text x="345" y="274" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">real time +1 s</text>
<text x="16" y="254" font-size="12" style="fill: var(--dg-muted)">real time</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Last-write-wins conflict resolution, used by Cassandra and by many multi-leader setups, is exactly this: whichever write carries the larger timestamp survives. With skewed clocks, a node whose clock is fast can make its writes win for as long as the skew lasts, and nobody gets an error. A safer reading of any clock is as a <strong>confidence interval</strong>: not "it is 10:00:03.000" but "it is somewhere between 10:00:02.990 and 10:00:03.010".</p>
<p>Google Spanner's TrueTime API makes that interval explicit. Each datacenter has GPS receivers and atomic clocks, and <code>TT.now()</code> returns <code>[earliest, latest]</code>, an interval that typically spans a few milliseconds. To guarantee that a transaction's timestamp is after every transaction that committed before it, Spanner performs a <strong>commit wait</strong>: it waits out the uncertainty before making the commit visible. Smaller uncertainty means a shorter wait, which is why Google invests in precise clocks.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Clock infrastructure has improved since 2017. Large cloud providers now offer much more precise time: AWS added PTP-based hardware clocks to its Time Sync Service (announced in 2023 as microsecond-accurate on supported instances) and publishes ClockBound, a library that returns time with an error bound, much like TrueTime. Google and AWS both "smear" leap seconds over many hours so clocks never step. And in 2022 the General Conference on Weights and Measures voted to stop adding leap seconds by 2035. Go 1.9 (2017) also started embedding a monotonic reading in <code>time.Time</code> so that durations computed by subtraction stay correct when the wall clock steps.</p>`,
        },
        {
          type: "quiz",
          q: "You need to enforce a 30-second session timeout inside one server process. Which clock should you use?",
          options: [
            "The time-of-day clock, because it is synchronised by NTP",
            "The monotonic clock",
            "A timestamp from the database server",
            "Either; they always agree within one machine",
          ],
          answer: 1,
          explain: "Durations within one process need a clock that never jumps. NTP can step the wall clock backward or forward, which would make the session last far too long or end at once. The monotonic clock is designed for exactly this, as long as you don't compare its values across machines.",
        },
      ],
    },
    {
      id: "process-pauses",
      title: "Process pauses: when a node stops without knowing",
      kicker: "Time, part 2",
      blocks: [
        {
          type: "problem",
          html: `<p>Even with perfect clocks, a thread cannot assume that the moment it checks a condition and the moment it acts on it are close together. Between any two lines of code, the process can be stopped for seconds, and when it resumes it has no idea time has passed.</p>`,
        },
        {
          type: "code",
          lang: "java",
          title: "A lease check that looks safe and is not",
          code: `while (true) {
    request = getIncomingRequest();
    // Ensure the lease has at least 10 seconds left
    if (lease.expiryTimeMillis - System.currentTimeMillis() < 10000) {
        lease = lease.renew();
    }
    if (lease.isValid()) {
        process(request);   // a 15 s pause here, and another node
    }                       // now holds the lease while we write
}`,
        },
        {
          type: "text",
          html: `<p>This code has two problems. It compares an expiry time set by another machine's clock with the local wall clock, so skew alone can break it. More fundamentally, it assumes very little time passes between <code>isValid()</code> and the end of <code>process()</code>. Here are some ways that assumption fails:</p>
<ul>
<li><strong>Garbage collection.</strong> Stop-the-world collectors in older JVM configurations could pause for seconds on large heaps.</li>
<li><strong>Virtual machine suspension.</strong> A hypervisor can pause a VM for live migration to another host, or simply not schedule it while other guests run (visible as "steal time").</li>
<li><strong>Laptop sleep</strong>, or a process stopped with <code>SIGSTOP</code> (for example by an accidental Ctrl-Z) and continued later.</li>
<li><strong>Paging and I/O.</strong> If memory is short, touching a page may wait for disk; a synchronous log write can stall on a slow or network-attached disk.</li>
</ul>
<p>Real-time systems (aircraft controls, airbags) avoid this with guaranteed response times, but that requires a real-time OS, restricted languages and huge testing effort. Server software accepts pauses and must stay correct despite them. Some systems shrink the impact: they treat a GC pause like a planned brief outage, steering traffic away from a node that is about to collect, or restart processes before long-lived objects build up.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "ZooKeeper clients", title: "Session expiry", html: "A client that pauses longer than its session timeout loses its session and its ephemeral nodes, so another process can take over its role. The paused client must notice on waking and stop acting as leader." },
            { org: "Java runtimes", title: "Low-pause collectors", html: "Concurrent collectors such as ZGC (production-ready since JDK 15) and Shenandoah keep pauses very short even on large heaps, which reduces, but does not eliminate, the risk of pause-induced failover." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>"We'll set the lease to 30 seconds; no GC takes that long." Pauses come from many sources besides GC, and you cannot bound them in general. Correctness must not depend on a process noticing that its lease expired. It must come from something outside the process rejecting the stale actor, which is the fencing idea in the next section.</p>`,
        },
      ],
    },
    {
      id: "fencing-and-majorities",
      title: "Truth is defined by the majority, and fenced by tokens",
      kicker: "Staying safe anyway",
      blocks: [
        {
          type: "idea",
          html: `<p>No node can trust its own judgement of the situation: it may be partitioned, paused, or have a wrong clock. So decisions are made by a <strong>quorum</strong>, usually a majority of nodes, and resources protect themselves by rejecting requests that carry an out-of-date <strong>fencing token</strong>.</p>`,
        },
        {
          type: "text",
          html: `<p>Picture a node that can receive messages but whose outgoing messages are being dropped. The others hear nothing, declare it dead and elect a new leader, while it carries on believing it is fine. Or a node that pauses for a minute, then resumes as if nothing happened. In both cases the node's belief and the cluster's belief disagree, and the cluster must win.</p>
<p>That is why consensus systems decide by majority vote. With five nodes, a majority is three; any two majorities share at least one node, so two conflicting decisions can never both be ratified. A node that has been voted out is out, regardless of what it thinks.</p>
<h3>Fencing tokens</h3>
<p>A lock or lease service hands out a number that increases every time the lock is granted. The holder sends that number with every write, and the storage service remembers the highest number it has accepted and rejects anything lower. A paused process that wakes up with an old token can do no damage, because the storage has already seen a newer one.</p>`,
        },
        {
          type: "diagram",
          title: "Fencing a paused lock holder",
          caption: "Client 1's lease expires during its pause and client 2 gets token 34. Storage accepts 34, so when client 1 wakes and writes with token 33, the write is rejected.",
          svg: `<svg viewBox="0 0 640 300" role="img" aria-label="Fencing tokens: storage rejects a write with token 33 after accepting token 34">
<defs><marker id="ddia8-arrow3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="16" y="64" font-size="13" font-weight="700">Client 1</text>
<text x="16" y="134" font-size="13" font-weight="700">Lock service</text>
<text x="16" y="204" font-size="13" font-weight="700">Client 2</text>
<text x="16" y="274" font-size="13" font-weight="700">Storage</text>
<line x1="112" y1="60" x2="628" y2="60" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="112" y1="130" x2="628" y2="130" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="112" y1="200" x2="628" y2="200" stroke-width="1" style="stroke: var(--dg-line)"/>
<line x1="112" y1="270" x2="628" y2="270" stroke-width="1" style="stroke: var(--dg-line)"/>
<rect x="120" y="43" width="120" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="180" y="65" text-anchor="middle" font-size="12">lease: token 33</text>
<rect x="250" y="43" width="250" height="34" rx="6" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2" stroke-dasharray="6 4"/>
<text x="375" y="65" text-anchor="middle" font-size="12">process paused (GC)</text>
<rect x="510" y="43" width="115" height="34" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="567" y="65" text-anchor="middle" font-size="12">write, token 33</text>
<rect x="120" y="113" width="120" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="180" y="135" text-anchor="middle" font-size="12">grant 33</text>
<rect x="260" y="113" width="140" height="34" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="330" y="135" text-anchor="middle" font-size="12">33 expires, grant 34</text>
<rect x="290" y="183" width="105" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="342" y="205" text-anchor="middle" font-size="12">got token 34</text>
<rect x="405" y="183" width="100" height="34" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="455" y="205" text-anchor="middle" font-size="12">write, token 34</text>
<rect x="405" y="253" width="100" height="34" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)" stroke-width="2"/>
<text x="455" y="275" text-anchor="middle" font-size="12" font-weight="700">accept 34</text>
<rect x="515" y="253" width="110" height="34" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)" stroke-width="2"/>
<text x="570" y="275" text-anchor="middle" font-size="12" font-weight="700">reject 33</text>
<line x1="180" y1="111" x2="180" y2="81" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia8-arrow3)"/>
<line x1="342" y1="149" x2="342" y2="179" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia8-arrow3)"/>
<line x1="455" y1="219" x2="455" y2="249" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia8-arrow3)"/>
<line x1="570" y1="79" x2="570" y2="249" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia8-arrow3)"/>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "ZooKeeper", title: "zxid and znode versions", html: "Every change gets a monotonically increasing transaction ID (<code>zxid</code>), and each znode carries version counters. Either can serve as a fencing token for a lock built on ZooKeeper." },
            { org: "etcd", title: "Revisions and leases", html: "Every write increments a cluster-wide revision. A lock's key records the revision at which it was created, which the holder can pass downstream, and transactions can compare revisions before writing." },
            { org: "Redlock debate", title: "Locks without fencing", html: "In 2016 Martin Kleppmann argued publicly that the Redlock algorithm for Redis lacks fencing tokens and depends on timing assumptions, so it is unsafe for locks that protect correctness. Redis's author Salvatore Sanfilippo published a rebuttal; the exchange is a good read on exactly this section." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Fencing only works if the <em>resource</em> checks the token. Storage that blindly accepts any write (a plain file server, many object stores) cannot be fenced; you then need a conditional write such as compare-and-set on a version, or a different design.</p>`,
        },
        {
          type: "quiz",
          q: "A five-node cluster splits into a group of two and a group of three. Which group can elect a leader and accept writes?",
          options: ["Both, independently", "Only the group of three", "Only the group containing the old leader", "Neither, until the partition heals"],
          answer: 1,
          explain: "A majority of five is three. Only the group of three can gather enough votes; the group of two must stop accepting writes, even if the old leader is in it. Because any two majorities overlap, two leaders can never be elected for the same term.",
        },
      ],
    },
    {
      id: "byzantine-and-system-models",
      title: "Byzantine faults, system models and safety versus liveness",
      kicker: "Reasoning precisely",
      blocks: [
        {
          type: "text",
          html: `<p>Everything so far assumes nodes are honest: they may be slow, crash or be cut off, but they don't lie. A <strong>Byzantine fault</strong> is when a node sends false or contradictory messages, through a bug, corrupted hardware or malice. The name comes from the "Byzantine Generals" problem posed by Lamport, Shostak and Pease in 1982. Tolerating <em>f</em> Byzantine nodes needs at least <code>3f + 1</code> nodes, versus <code>2f + 1</code> for crash faults, and the protocols send many more messages.</p>
<p>Inside a single organisation's datacenter, Byzantine tolerance is usually not worth that cost: you trust your own nodes, and a software bug would be present in every replica anyway, so the replicas would all lie the same way. It matters where participants do not trust each other, such as blockchains, and in aerospace, where radiation can flip bits. Cheap partial defences are still worthwhile: checksums against corrupted packets, input validation on anything from users, and sanity checks on NTP responses from multiple servers.</p>`,
        },
        {
          type: "text",
          html: `<h3>System models</h3>
<p>To prove an algorithm correct you must state what it assumes about the world. That set of assumptions is a <strong>system model</strong>, and it has a timing part and a fault part. Real systems almost always fit <strong>partial synchrony</strong> with <strong>crash-recovery</strong>: the network and clocks behave most of the time but can misbehave without bound, and nodes may crash and restart with their disk intact but their memory lost.</p>`,
        },
        {
          type: "table",
          title: "System models",
          headers: ["Dimension", "Model", "Assumption", "Realistic?"],
          rows: [
            ["Timing", "Synchronous", "Bounded network delay, pauses and clock error", "No, except special hardware"],
            ["Timing", "Partially synchronous", "Usually bounded, occasionally unbounded", "Yes: the usual target"],
            ["Timing", "Asynchronous", "No timing assumptions, no clocks", "Safe but very restrictive"],
            ["Faults", "Crash-stop", "A crashed node never returns", "Simplifying"],
            ["Faults", "Crash-recovery", "Nodes crash and return with durable state", "Yes: Raft, Paxos, most databases"],
            ["Faults", "Byzantine", "Nodes may do anything, including lie", "Needed only without mutual trust"],
          ],
        },
        {
          type: "compare",
          items: [
            { title: "Safety: nothing bad happens", tone: "ok", html: "Examples: two nodes never both hold the lock; a committed write is never lost; fencing tokens are unique. If a safety property is violated, you can point to the moment it happened, and it cannot be undone. Must hold <em>always</em>, even during partitions and pauses." },
            { title: "Liveness: something good eventually happens", tone: "info", html: "Examples: a request eventually gets a response; a leader is eventually elected. Violated only over infinite time, so it can always still be satisfied later. Usually promised only once the network behaves (partial synchrony)." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>This split is the standard design stance: <strong>never compromise safety, and accept that liveness may stall during bad periods</strong>. A consensus cluster that cannot reach a majority stops accepting writes rather than accepting conflicting ones. That is a liveness failure (an outage), not a safety failure (corruption), and it recovers when the network does.</p>`,
        },
        {
          type: "quiz",
          q: "Which is a safety property?",
          options: [
            "Every request eventually receives a response",
            "A new leader is elected within a few seconds of a crash",
            "No two clients ever hold the same lock at the same time",
            "Replicas eventually converge to the same value",
          ],
          answer: 2,
          explain: "Mutual exclusion is a safety property: a violation happens at a specific moment and cannot be undone. The others promise that something good eventually happens, which are liveness properties (eventual convergence included).",
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
          html: `<p>This chapter rarely appears as its own interview question, but it underlies every follow-up such as "what happens if this node dies?", "what if the network splits?" or "how does the lock holder know it still holds the lock?". Showing that you know a timeout cannot tell you what happened, and designing around that, is what separates a senior answer.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>When asked about failures in your design, walk through:</p>
<ol>
<li><strong>Detection:</strong> timeouts or heartbeats, with the trade-off between false positives and slow detection; mention adaptive detectors.</li>
<li><strong>Uncertainty:</strong> a timed-out request may have succeeded, so retries need idempotency keys.</li>
<li><strong>Leadership and locks:</strong> decided by a majority (via ZooKeeper, etcd or a Raft group), never by one node's opinion; protect resources with fencing tokens.</li>
<li><strong>Time:</strong> don't order events across machines with wall clocks; use logical versions, or bounded-uncertainty clocks like TrueTime if you truly need real-time ordering.</li>
<li><strong>Stance:</strong> the system stays safe during a partition and recovers liveness after it.</li>
</ol>`,
        },
        {
          type: "table",
          title: "Failure symptoms and the standard defence",
          headers: ["Symptom", "Root cause", "Defence"],
          rows: [
            ["Duplicate side effects after retry", "Response lost, request already processed", "Idempotency keys, deduplication"],
            ["Two leaders writing at once", "Old leader paused or partitioned", "Majority election plus fencing tokens"],
            ["Newer write silently discarded", "Last-write-wins with clock skew", "Version vectors, logical clocks, or CRDTs"],
            ["Failover storm under load", "Timeouts too aggressive", "Adaptive timeouts, several missed heartbeats"],
            ["Negative or huge durations", "Measuring time with the wall clock", "Monotonic clock for durations"],
          ],
        },
        {
          type: "quiz",
          q: "Your design uses a Redis key with a 30-second TTL as a lock so only one worker processes each job. The interviewer asks what could go wrong. What is the best answer?",
          options: [
            "Nothing, because Redis is single-threaded",
            "A worker can pause past the TTL while another takes the lock, so both act; fix it with fencing tokens checked by the resource, or make the job idempotent",
            "The TTL is too long; 5 seconds would be safe",
            "Redis might lose the key, so use two Redis keys",
          ],
          answer: 1,
          explain: "Single-threading only makes Redis's own commands atomic; it says nothing about the worker that pauses after acquiring the lock. Shortening the TTL makes the problem more likely, not less. The safe designs make the protected resource reject stale holders (fencing) or make duplicate processing harmless.",
        },
      ],
    },
  ],
  takeaways: [
    "Distributed systems fail <strong>partially and nondeterministically</strong>; the hard part is not knowing what failed.",
    "A missing reply could mean a lost request, a dead or paused node, or a lost response. Timeouts are the only detector, and a timed-out operation may still have succeeded, so make retries idempotent.",
    "Network delay is unbounded because packet-switched networks queue traffic; choose timeouts by measuring, and prefer adaptive detectors.",
    "Use monotonic clocks for durations. Wall clocks drift and jump, so last-write-wins on timestamps can silently discard newer writes.",
    "A process can pause for seconds at any line of code (GC, VM suspension, paging). Never rely on a node noticing that its lease expired.",
    "Truth is decided by a majority, and resources must reject stale actors with <strong>fencing tokens</strong>.",
    "Real systems assume partial synchrony and crash-recovery: always safe, live when the network behaves. Byzantine tolerance is for settings without mutual trust.",
  ],
  furtherReading: [
    { title: "The Network Is Reliable (Bailis and Kingsbury, ACM Queue, 2014)", note: "A collection of real-world network partitions and what they broke." },
    { title: "How to do distributed locking (Martin Kleppmann, 2016)", url: "https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html", note: "Fencing tokens, process pauses and the critique of Redlock." },
    { title: "Spanner: Google's Globally-Distributed Database (Corbett et al., OSDI 2012)", note: "TrueTime, its uncertainty interval and commit wait." },
    { title: "The Byzantine Generals Problem (Lamport, Shostak, Pease, 1982)", note: "The origin of the term and the 3f+1 bound." },
  ],
};
