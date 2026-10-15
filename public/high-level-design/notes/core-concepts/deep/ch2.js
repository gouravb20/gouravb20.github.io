// Deep dive: Chapter 2, Transport: TCP, UDP and QUIC. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>You are on a video call over hotel Wi-Fi and one packet in fifty gets lost. With the call running over TCP, each lost packet is resent and everything behind it waits, so the other person's voice freezes for a moment, then plays back a burst of stale audio at double speed. With the same call over UDP, the lost packet is simply gone: you hear a tiny click and the conversation carries on in real time.</p>
<p>Now flip the use case. You are downloading a bank statement. A single missing byte would make the file corrupt, and you would happily wait an extra 200 ms for a resend. Same network, same loss rate, opposite right answer. The transport layer is where that choice is made, and knowing what each protocol promises (and what it costs) lets you defend the choice in a design review.</p>`,
  sections: [
    {
      id: "what-transport-adds",
      title: "What the transport layer adds on top of IP",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>IP delivers individual packets to a machine, on a best-effort basis. It has no idea which process on that machine should get them, and it does nothing when packets are lost, duplicated or reordered. Applications need at least a way to reach the right process, and most of them need far more than that.</p>`,
        },
        {
          type: "text",
          html: `<p>Every transport protocol adds <strong>ports</strong>: 16-bit numbers that identify a process on each end. A connection or flow is identified by the pair of addresses and the pair of ports, which is how one server can hold a million separate conversations on port 443 at once.</p>
<p>Beyond ports, the protocols diverge sharply:</p>
<ul>
<li><strong>UDP</strong> adds ports, a length and a checksum, in an 8-byte header, and nothing else. Each <strong>datagram</strong> is sent independently. No handshake, no acknowledgements, no ordering, no retransmission, no rate control. If you send a datagram, it either arrives intact or it doesn't, and nobody tells you which.</li>
<li><strong>TCP</strong> provides a <strong>reliable, ordered byte stream</strong> between two endpoints. It numbers every byte, acknowledges what arrived, resends what didn't, delivers bytes to the application strictly in order, and paces the sender so it doesn't overwhelm the receiver or the network. Its header is 20 bytes without options and up to 60 with them.</li>
<li><strong>QUIC</strong> runs on top of UDP and rebuilds TCP-like reliability, with encryption and multiple independent streams built in. It is covered in its own section below.</li>
</ul>`,
        },
        {
          type: "table",
          headers: ["", "UDP", "TCP"],
          rows: [
            ["Setup", "None: just send", "Three-way handshake (1 RTT)"],
            ["Unit", "Independent datagrams with message boundaries", "A continuous byte stream (no message boundaries)"],
            ["Reliability", "None", "Acknowledgements and retransmission"],
            ["Ordering", "None", "Strictly in order within a connection"],
            ["Rate control", "None: the app must behave", "Flow control and congestion control"],
            ["Header", "8 bytes", "20 to 60 bytes, plus ACKs flowing back"],
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>"Byte stream" has a practical consequence people often miss: TCP does not preserve message boundaries. Two 100-byte writes may arrive as one 200-byte read, or as reads of 150 and 50. Every protocol on top of TCP (HTTP, WebSocket frames, gRPC) therefore adds its own framing, such as length prefixes or delimiters, to find where one message ends and the next begins.</p>`,
        },
      ],
    },
    {
      id: "tcp-reliability",
      title: "How TCP turns lost packets into a reliable stream",
      kicker: "How it works",
      blocks: [
        {
          type: "text",
          html: `<p>TCP's reliability rests on three mechanisms working together.</p>
<p><strong>Sequence numbers.</strong> Each byte in the stream has a position. A segment carries the sequence number of its first byte, so the receiver can put segments back in order, spot gaps and discard duplicates.</p>
<p><strong>Acknowledgements.</strong> The receiver tells the sender the next byte it expects. The ACK is cumulative: "I have everything up to here." It travels back on the same connection, often piggybacked on data going the other way.</p>
<p><strong>Retransmission.</strong> The sender keeps a copy of everything not yet acknowledged. If no ACK arrives within the <strong>retransmission timeout</strong> (RTO, derived from measured round-trip times), it resends. A faster path exists too: if the sender sees three duplicate ACKs for the same position, the receiver is clearly getting later segments but is stuck on a gap, so the sender resends the missing segment immediately ("fast retransmit") instead of waiting for the timer.</p>`,
        },
        {
          type: "diagram",
          title: "One lost segment, and everything behind it waits",
          caption: "Segment 2 is lost. Segments 3 and 4 arrive, but TCP must deliver bytes in order, so the receiver holds them and keeps acknowledging only up to 1. Duplicate ACKs tell the sender to retransmit; once segment 2 arrives, 2, 3 and 4 are handed to the application together.",
          svg: `<svg viewBox="0 0 600 360" role="img" aria-label="TCP sequence diagram with a lost segment, duplicate acknowledgements and a retransmission">
<defs><marker id="cc2-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="120" y="26" text-anchor="middle" font-size="13" font-weight="700">Sender</text>
<text x="420" y="26" text-anchor="middle" font-size="13" font-weight="700">Receiver</text>
<line x1="120" y1="36" x2="120" y2="320" stroke-width="2" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="420" y1="36" x2="420" y2="320" stroke-width="2" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="120" y1="60" x2="418" y2="76" stroke-width="2" marker-end="url(#cc2-arrow)" style="stroke: var(--dg-1)"/>
<text x="270" y="60" text-anchor="middle" font-size="12">seg 1</text>
<text x="440" y="80" font-size="12" style="fill: var(--dg-ok)">deliver 1</text>
<line x1="420" y1="88" x2="122" y2="104" stroke-width="2" marker-end="url(#cc2-arrow)" style="stroke: var(--dg-2)"/>
<text x="270" y="88" text-anchor="middle" font-size="12">ACK 1</text>
<line x1="120" y1="114" x2="262" y2="122" stroke-width="2" style="stroke: var(--dg-1)"/>
<path d="M264 116 L276 128 M276 116 L264 128" stroke-width="3" style="stroke: var(--dg-bad)"/>
<text x="190" y="110" text-anchor="middle" font-size="12">seg 2</text>
<text x="296" y="127" font-size="12" style="fill: var(--dg-bad)">lost</text>
<line x1="120" y1="144" x2="418" y2="160" stroke-width="2" marker-end="url(#cc2-arrow)" style="stroke: var(--dg-1)"/>
<text x="230" y="140" text-anchor="middle" font-size="12">seg 3</text>
<text x="440" y="164" font-size="12" style="fill: var(--dg-bad)">3 held: gap</text>
<line x1="420" y1="172" x2="122" y2="188" stroke-width="2" marker-end="url(#cc2-arrow)" style="stroke: var(--dg-2)"/>
<text x="270" y="172" text-anchor="middle" font-size="12">ACK 1 (duplicate)</text>
<line x1="120" y1="200" x2="418" y2="216" stroke-width="2" marker-end="url(#cc2-arrow)" style="stroke: var(--dg-1)"/>
<text x="230" y="197" text-anchor="middle" font-size="12">seg 4</text>
<text x="440" y="220" font-size="12" style="fill: var(--dg-bad)">4 held</text>
<line x1="420" y1="228" x2="122" y2="244" stroke-width="2" marker-end="url(#cc2-arrow)" style="stroke: var(--dg-2)"/>
<text x="270" y="228" text-anchor="middle" font-size="12">ACK 1 (duplicate)</text>
<line x1="120" y1="262" x2="418" y2="278" stroke-width="2" marker-end="url(#cc2-arrow)" style="stroke: var(--dg-3)"/>
<text x="250" y="258" text-anchor="middle" font-size="12">seg 2 (retransmit)</text>
<text x="440" y="282" font-size="12" style="fill: var(--dg-ok)">deliver 2, 3, 4</text>
<line x1="420" y1="290" x2="122" y2="306" stroke-width="2" marker-end="url(#cc2-arrow)" style="stroke: var(--dg-2)"/>
<text x="270" y="290" text-anchor="middle" font-size="12">ACK 4</text>
<text x="300" y="346" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">"ACK n" here means: everything up to segment n has arrived.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>A guarantee worth stating precisely: TCP orders bytes <em>within one connection</em>. Two messages sent on the same connection arrive in the order they were sent. Two messages sent on different connections, even from the same client to the same server, have no ordering relationship at all. If your design relies on "events arrive in order", either keep them on one connection or put sequence numbers in the messages themselves.</p>`,
        },
        {
          type: "quiz",
          q: "A client sends \"create order\" on one TCP connection and, a moment later, \"cancel order\" on a second connection to the same server. Can the server see the cancel first?",
          options: [
            "No, TCP guarantees ordering between a client and a server",
            "Yes, TCP only orders bytes within a single connection",
            "No, because both connections share the same IP addresses",
            "Only if the client uses UDP",
          ],
          answer: 1,
          explain: "Each TCP connection is its own ordered stream with its own retransmissions and queues. Across connections there is no ordering, so the second connection's message can easily overtake the first, for example if the first connection loses a packet and waits for a retransmission.",
        },
      ],
    },
    {
      id: "head-of-line-blocking",
      title: "Head-of-line blocking: the price of strict order",
      kicker: "The catch",
      blocks: [
        {
          type: "text",
          html: `<p>The diagram above shows TCP's main weakness. Segments 3 and 4 reached the receiving machine on time, but the application could not see them until segment 2 was retransmitted, at least one more round trip later. One lost packet blocks everything queued behind it. This is <strong>head-of-line blocking</strong>.</p>
<p>For a file download it barely matters: you need every byte anyway, and the total time grows only slightly. For real-time data it is poison. A voice app sends a small packet every 20 ms and the receiver has a playout deadline, often well under 200 ms, after which audio is useless. Under TCP, a single loss delays not just the lost packet but every packet after it, so a burst of audio arrives late together and gets dropped or played back in a rush.</p>`,
        },
        {
          type: "lab",
          id: "tcpVsUdp",
          caption: "Run the same voice stream over UDP and TCP, raise the loss rate and the round-trip time, and watch which packets miss the playout deadline. UDP loses a few; TCP delays many.",
        },
        {
          type: "text",
          html: `<h3>It shows up in HTTP too</h3>
<p>HTTP/1.1 suffers head-of-line blocking at the application level: a connection carries one request at a time, so a slow response holds up the next request on that connection. Browsers work around it by opening about six connections per host. HTTP/2 fixed the application-level problem by multiplexing many requests as interleaved streams over a single connection, but that made the transport-level problem worse: all those streams share one TCP byte stream, so one lost packet stalls every stream at once, even streams whose data already arrived. On lossy mobile networks, HTTP/2 over one connection can perform worse than HTTP/1.1 over six. This is the problem QUIC was built to remove.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Saying "TCP is slow". TCP's throughput on a clean link is excellent. What it can't do is deliver later data before earlier data, so it adds <em>latency spikes</em> under loss. Frame the trade-off as completeness and order versus freshness, not as fast versus slow.</p>`,
        },
      ],
    },
    {
      id: "flow-and-congestion",
      title: "Flow control and congestion control",
      kicker: "Pacing the sender",
      blocks: [
        {
          type: "text",
          html: `<p>A reliable protocol also has to decide how fast to send. TCP answers two different questions with two different mechanisms, and interviewers like to check that you can tell them apart.</p>
<p><strong>Flow control</strong> protects the <em>receiver</em>. The receiver advertises a <strong>receive window</strong>: how many more bytes it has buffer space for. The sender never has more unacknowledged data in flight than that. If the receiving application stops reading, its buffer fills, the window shrinks to zero and the sender pauses. This is TCP's built-in backpressure.</p>
<p><strong>Congestion control</strong> protects the <em>network</em>. The sender keeps its own <strong>congestion window</strong>, an estimate of how much the path can carry, and sends no more than the smaller of the two windows. A new connection starts with a small window (10 segments, about 14 KB, on modern stacks per RFC 6928) and roughly doubles it every round trip while ACKs come back cleanly: <strong>slow start</strong>. When it detects loss (or, in newer algorithms, rising delay) it cuts the window and grows more cautiously.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Flow control", tone: "info", html: "<strong>Who it protects:</strong> the receiving application.<br><strong>Signal:</strong> the receive window the receiver advertises.<br><strong>Symptom when it bites:</strong> a slow consumer makes a fast producer wait." },
            { title: "Congestion control", tone: "warn", html: "<strong>Who it protects:</strong> the shared network.<br><strong>Signal:</strong> loss or delay the sender infers from ACKs.<br><strong>Symptom when it bites:</strong> throughput drops on busy or lossy paths, and new connections start slowly." },
          ],
        },
        {
          type: "text",
          html: `<p>Slow start is why a brand new connection transfers a large response slowly at first. To move 1 MB, a fresh connection needs several round trips just to grow its window, so on a 100 ms path the first megabyte can take half a second regardless of how fat the pipe is. A warm, reused connection already has a large window. That is another argument for connection reuse and for putting CDN edges close to users: short RTTs make each doubling step quicker.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Linux", title: "CUBIC by default", html: "CUBIC has been the default TCP congestion control algorithm in Linux since 2006. It grows the window as a cubic function of the time since the last loss, which suits long, fast paths better than the older linear growth." },
            { org: "Google", title: "BBR", html: "BBR, published by Google in 2016, estimates the bottleneck bandwidth and minimum RTT and paces to them, instead of treating every lost packet as a sign of congestion. It helps most on paths with random loss, and Google uses it on its own services." },
          ],
        },
        {
          type: "quiz",
          q: "A slow consumer can't keep up with a fast TCP producer. Which mechanism stops the producer from flooding it?",
          options: ["Congestion control", "Flow control via the receive window", "The three-way handshake", "Fast retransmit"],
          answer: 1,
          explain: "The receiver's buffer fills because the application isn't reading, so it advertises a smaller and eventually zero window, and the sender stops. Congestion control reacts to the network, not to a slow application.",
        },
      ],
    },
    {
      id: "when-udp-fits",
      title: "When UDP is the better choice",
      kicker: "Choosing",
      blocks: [
        {
          type: "text",
          html: `<p>Default to TCP. Pick UDP when stale data is worthless and a late packet is worse than a missing one, or when the overhead of connections genuinely hurts. The common cases:</p>
<ul>
<li><strong>Real-time voice and video.</strong> Media is carried in RTP over UDP; codecs conceal small gaps, and jitter buffers smooth out arrival times.</li>
<li><strong>Multiplayer games.</strong> Only the latest position matters. Resending a position from 100 ms ago is pointless when a newer one is already on its way.</li>
<li><strong>DNS.</strong> A query and its answer usually fit in one datagram each, so a handshake would double the cost. DNS falls back to TCP when an answer is too large.</li>
<li><strong>High-volume telemetry.</strong> Metrics protocols such as StatsD send UDP by default: losing an occasional sample is acceptable, and the sender never blocks on a slow collector.</li>
</ul>`,
        },
        {
          type: "text",
          html: `<h3>UDP doesn't mean the application is unreliable</h3>
<p>Choosing UDP moves responsibility up a layer; it doesn't remove it. Real-time apps typically add sequence numbers (to detect loss and reorder), timestamps (to schedule playout), selective resend only for data that is still useful (a game might resend a "player died" event but never a position), forward error correction, and their own rate control so they don't flood the network. Many products also mix protocols: login, signaling and chat over TCP and HTTPS, the latency-sensitive media path over UDP, with a fallback to TCP when a firewall blocks UDP.</p>
<h3>Browsers can't open raw UDP sockets</h3>
<p>Web pages have no API for raw UDP. The browser paths to UDP-like behaviour are <strong>WebRTC</strong> (media and data channels, with an unordered and unreliable mode) and HTTP/3-based <strong>WebTransport</strong>, which offers unreliable datagrams over QUIC. For anything that must run in a plain web page today, assume TCP-based options (HTTP, WebSockets, SSE) unless WebRTC is justified.</p>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "UDP gives you",
          consLabel: "UDP leaves you to handle",
          pros: [
            "No handshake: the first datagram carries data",
            "No head-of-line blocking: each datagram stands alone",
            "Small headers and no ACK traffic",
            "Full control over what to resend and when",
          ],
          cons: [
            "Loss detection, ordering and any retransmission",
            "Congestion and rate control, or you harm the network and yourself",
            "Firewalls and corporate networks that block UDP",
            "No message larger than one datagram without your own fragmentation",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>For a "live reactions" style feature (millions of tiny hearts on a video), the answer is usually not UDP at all. Clients are browsers and phones behind firewalls, so send reactions over an existing HTTPS or WebSocket connection, aggregate them on the server, and push sampled or counted updates back. Losing some reactions is fine; the hard part is fan-out, not the transport.</p>`,
        },
      ],
    },
    {
      id: "quic",
      title: "QUIC and HTTP/3: TCP's guarantees, rebuilt on UDP",
      kicker: "The modern option",
      blocks: [
        {
          type: "problem",
          html: `<p>TCP has two built-in costs that are hard to fix: separate handshakes for TCP and TLS before any data, and head-of-line blocking across everything sharing a connection. TCP is implemented in operating system kernels and inspected by countless middleboxes, so changing it is extremely slow.</p>`,
        },
        {
          type: "idea",
          html: `<p>Build a new reliable transport in <strong>user space on top of UDP</strong>, which every network already passes. Make encryption mandatory and part of the transport, and give it many independent streams so loss on one doesn't stall the others.</p>`,
        },
        {
          type: "diagram",
          title: "HTTP/2 over TCP versus HTTP/3 over QUIC",
          caption: "QUIC takes over the jobs of TCP and TLS in one layer that runs in the application's process, using UDP only to get through the network.",
          svg: `<svg viewBox="0 0 600 278" role="img" aria-label="Protocol stacks: HTTP/2 over TLS over TCP over IP, compared with HTTP/3 over QUIC over UDP over IP">
<text x="170" y="24" text-anchor="middle" font-size="13" font-weight="700">HTTPS with HTTP/2</text>
<text x="440" y="24" text-anchor="middle" font-size="13" font-weight="700">HTTPS with HTTP/3</text>
<rect x="60" y="40" width="220" height="38" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="170" y="64" text-anchor="middle" font-size="13">HTTP/2 (streams)</text>
<rect x="60" y="84" width="220" height="38" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="170" y="108" text-anchor="middle" font-size="13">TLS 1.2 / 1.3</text>
<rect x="60" y="128" width="220" height="38" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="170" y="152" text-anchor="middle" font-size="13">TCP (kernel)</text>
<rect x="60" y="172" width="220" height="38" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="170" y="196" text-anchor="middle" font-size="13">IP</text>
<rect x="330" y="40" width="220" height="38" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="440" y="64" text-anchor="middle" font-size="13">HTTP/3</text>
<rect x="330" y="84" width="220" height="38" rx="6" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2"/>
<text x="440" y="108" text-anchor="middle" font-size="13">QUIC: streams + TLS 1.3</text>
<rect x="330" y="128" width="220" height="38" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="440" y="152" text-anchor="middle" font-size="13">UDP (kernel)</text>
<rect x="330" y="172" width="220" height="38" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="440" y="196" text-anchor="middle" font-size="13">IP</text>
<text x="170" y="238" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Setup: TCP 1 RTT + TLS 1 or 2 RTT</text>
<text x="170" y="258" text-anchor="middle" font-size="12" style="fill: var(--dg-bad)">One loss stalls every stream</text>
<text x="440" y="238" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Setup: 1 RTT combined, 0 on resume</text>
<text x="440" y="258" text-anchor="middle" font-size="12" style="fill: var(--dg-ok)">A loss stalls only its own stream</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>What QUIC changes, concretely:</p>
<ul>
<li><strong>One handshake.</strong> Transport and TLS 1.3 setup happen together in a single round trip; a client resuming a previous session can send data in its very first flight (0-RTT, with the same replay caveat as TLS 1.3).</li>
<li><strong>Independent streams.</strong> Each stream has its own ordering. A lost packet delays only the streams whose data it carried.</li>
<li><strong>Connection migration.</strong> Connections are identified by a connection ID rather than the address and port pair, so a phone moving from Wi-Fi to cellular can keep its connection instead of reconnecting.</li>
<li><strong>Encrypted by default.</strong> Almost all of the transport header is encrypted, which stops middleboxes from depending on its details and so keeps the protocol evolvable.</li>
</ul>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Google", title: "From experiment to standard", html: "Google developed and deployed its own version of QUIC in Chrome and its services before handing it to the IETF. The standardized QUIC was published as RFC 9000 in 2021, and HTTP/3 as RFC 9114 in 2022." },
            { org: "CDNs and browsers", title: "Broad support", html: "Major browsers and large CDNs such as Cloudflare support HTTP/3. Clients usually discover it through an <code>Alt-Svc</code> header on an HTTP/2 response and fall back to TCP when UDP is blocked." },
          ],
        },
        {
          type: "tradeoffs",
          pros: [
            "Fewer round trips to the first byte, especially on resume",
            "No cross-stream head-of-line blocking",
            "Survives network changes on mobile devices",
            "Evolves with application releases instead of kernel upgrades",
          ],
          cons: [
            "Some networks block or throttle UDP, so a TCP fallback is mandatory",
            "User-space packet processing typically costs more CPU per byte than kernel TCP",
            "Encrypted headers make network-level debugging and monitoring harder",
            "Less mature tooling and load balancer support than TCP",
          ],
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
          html: `<p>Assume TCP (usually HTTPS) unless a requirement pushes you elsewhere, and say so in one sentence. The transport choice only deserves airtime when the prompt involves real-time media, games, high-volume lossy telemetry, or very latency-sensitive mobile clients. Then the skill is not naming UDP but explaining what you lose and how you compensate.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>A compact answer to "TCP or UDP?":</p>
<ol>
<li>TCP gives reliable, ordered delivery with flow and congestion control, at the cost of a handshake and head-of-line blocking under loss.</li>
<li>UDP gives independent datagrams with no setup and no waiting, and nothing else.</li>
<li>Choose UDP when fresh data beats complete data (voice, video, game state); keep control traffic on TCP.</li>
<li>Name what the app must add on UDP: sequence numbers, selective resend, rate control, and a TCP fallback for blocked networks.</li>
<li>For browsers, UDP means WebRTC or HTTP/3; HTTP/3 itself shows how QUIC removes TCP's handshake and blocking costs.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "A multiplayer game sends each player's position 30 times per second. A packet carrying a position update is lost. What should the game do?",
          options: [
            "Retransmit it, like TCP would, so state stays consistent",
            "Ignore it: a newer position will arrive about 33 ms later",
            "Pause the game until it is recovered",
            "Switch the session to TCP permanently",
          ],
          answer: 1,
          explain: "Position updates are superseded by the next update, so resending an old one only adds traffic and delay. This is the classic case for UDP. Events that are not superseded (a player scoring, an item being picked up) are different and usually get selective acknowledgement and resend on top of UDP.",
        },
      ],
    },
  ],
  takeaways: [
    "Transport protocols add ports to IP. UDP stops there; TCP adds a reliable, ordered byte stream with flow and congestion control.",
    "TCP orders bytes only within one connection, and it doesn't preserve message boundaries, so higher protocols add framing.",
    "Strict ordering causes head-of-line blocking: one lost packet delays everything behind it, which hurts real-time data and HTTP/2's shared connection.",
    "Flow control protects the receiver (receive window); congestion control protects the network (congestion window, slow start).",
    "Choose UDP when fresh beats complete (voice, video, games, DNS, telemetry), and add sequence numbers, selective resend and rate control yourself.",
    "QUIC rebuilds reliability on UDP with built-in TLS 1.3, one-round-trip setup, independent streams and connection migration; it is the transport for HTTP/3.",
  ],
  furtherReading: [
    { title: "RFC 9000: QUIC, A UDP-Based Multiplexed and Secure Transport", url: "https://www.rfc-editor.org/rfc/rfc9000", note: "The QUIC specification; the introduction and stream sections are readable on their own." },
    { title: "RFC 9293: Transmission Control Protocol (TCP)", url: "https://www.rfc-editor.org/rfc/rfc9293", note: "The consolidated 2022 TCP specification." },
    { title: "High Performance Browser Networking (Ilya Grigorik)", url: "https://hpbn.co/", note: "Chapters on TCP, UDP and slow start with worked latency examples." },
  ],
};
