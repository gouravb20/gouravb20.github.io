// Deep dive: Chapter 2, Transport: TCP, UDP and QUIC. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch2 = {
  hook: `<p>This chapter answers what TCP, UDP and QUIC each promise and what those promises cost. The choice comes down to completeness and order versus freshness, and you should be able to defend it in a design review.</p>`,
  sections: [
    {
      id: "what-transport-adds",
      title: "What the transport layer adds on top of IP",
      kicker: "The basics",
      blocks: [
        {
          type: "text",
          html: `<p>Every transport protocol adds <strong>ports</strong>, so data reaches the right process. A connection is identified by both addresses and both ports, which is how one server holds a million conversations on port 443. Beyond that, UDP adds nothing and TCP adds a reliable, ordered byte stream.</p>`,
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
          html: `<p>TCP does not preserve message boundaries: two 100-byte writes may arrive as one 200-byte read. Every protocol on top of TCP (HTTP, WebSocket frames, gRPC) adds its own framing, such as length prefixes or delimiters.</p>`,
        },
      ],
    },
    {
      id: "tcp-reliability",
      title: "TCP reliability and head-of-line blocking",
      kicker: "How it works",
      blocks: [
        {
          type: "text",
          html: `<p>TCP numbers bytes, acknowledges them and resends what is missing, then hands data to the application <strong>strictly in order</strong>. The price is <strong>head-of-line blocking</strong>: one lost packet holds up everything behind it.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Sequence numbers</strong> let the receiver reorder segments, spot gaps and drop duplicates.",
            "<strong>Cumulative ACKs</strong> say \"I have everything up to here\".",
            "<strong>Retransmission</strong> fires after a timeout (RTO, derived from measured RTT), or immediately after three duplicate ACKs (fast retransmit).",
            "Ordering holds <em>within one connection only</em>. Messages on two connections have no order; if you need it, use one connection or put sequence numbers in the messages.",
          ],
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
          html: `<p>For a file download this barely matters. For real-time data it is poison: a voice packet every 20 ms has a playout deadline, often well under 200 ms, and one loss delays every packet after it. HTTP/2 multiplexes many streams over one TCP connection, so one lost packet stalls every stream; on lossy mobile networks it can do worse than HTTP/1.1 over six connections.</p>`,
        },
        {
          type: "lab",
          id: "tcpVsUdp",
          caption: "Run the same voice stream over UDP and TCP, raise the loss rate and the round-trip time, and watch which packets miss the playout deadline. UDP loses a few; TCP delays many.",
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Saying "TCP is slow". Its throughput on a clean link is excellent; what it adds under loss is <em>latency spikes</em>. Frame the trade-off as completeness and order versus freshness.</p>`,
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
      id: "flow-and-congestion",
      title: "Flow control and congestion control",
      kicker: "Pacing the sender",
      blocks: [
        {
          type: "text",
          html: `<p>TCP sends no more than the smaller of two windows: the receiver's <strong>receive window</strong> and its own <strong>congestion window</strong>. Interviewers like to check you can tell them apart.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Flow control", tone: "info", html: "<strong>Protects:</strong> the receiving application.<br><strong>Signal:</strong> the advertised receive window; it shrinks to zero when the app stops reading.<br><strong>Symptom:</strong> a slow consumer makes a fast producer wait (built-in backpressure)." },
            { title: "Congestion control", tone: "warn", html: "<strong>Protects:</strong> the shared network.<br><strong>Signal:</strong> loss or delay inferred from ACKs.<br><strong>Symptom:</strong> throughput drops on busy or lossy paths, and new connections start slowly." },
          ],
        },
        {
          type: "keypoints",
          items: [
            "<strong>Slow start:</strong> a new connection starts at 10 segments (about 14 KB, RFC 6928) and roughly doubles each round trip, so the first megabyte on a 100 ms path can take half a second however fat the pipe.",
            "A warm, reused connection already has a large window: another reason for connection reuse and for CDN edges close to users.",
            "Algorithms differ: CUBIC (Linux default since 2006) backs off on loss; Google's BBR (2016) paces to estimated bandwidth and minimum RTT and helps on paths with random loss.",
          ],
        },
      ],
    },
    {
      id: "udp-and-quic",
      title: "When UDP fits, and QUIC",
      kicker: "Choosing",
      blocks: [
        {
          type: "text",
          html: `<p>Default to TCP. Pick UDP when a late packet is worse than a missing one: real-time voice and video (RTP over UDP), game state, DNS (one datagram each way, TCP fallback for large answers) and lossy telemetry such as StatsD.</p>`,
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
            "Loss detection, ordering (sequence numbers, timestamps) and selective resend",
            "Congestion and rate control, or you harm the network and yourself",
            "Firewalls that block UDP, so keep a TCP fallback",
            "Browsers have no raw UDP: use WebRTC or HTTP/3-based WebTransport",
          ],
        },
        {
          type: "text",
          html: `<p><strong>QUIC</strong> rebuilds TCP's guarantees in user space on top of UDP, with TLS 1.3 built in. It removes TCP's two hard-to-fix costs (separate handshakes and cross-stream blocking) and is the transport for HTTP/3 (QUIC is RFC 9000, 2021; HTTP/3 is RFC 9114, 2022).</p>`,
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
          type: "tradeoffs",
          prosLabel: "QUIC gains",
          consLabel: "QUIC costs",
          pros: [
            "One combined handshake; 0-RTT on resume (with the same replay caveat as TLS 1.3)",
            "Independent streams: a loss stalls only its own stream",
            "Connection IDs survive a phone moving from Wi-Fi to cellular",
            "Encrypted headers keep middleboxes from ossifying it; evolves with app releases",
          ],
          cons: [
            "Some networks block or throttle UDP, so a TCP fallback is mandatory (clients discover HTTP/3 via <code>Alt-Svc</code>)",
            "User-space processing typically costs more CPU per byte than kernel TCP",
            "Encrypted headers make network-level debugging harder",
            "Less mature tooling and load balancer support",
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
          type: "callout",
          tone: "interview",
          html: `<p>Assume TCP (usually HTTPS) and say so in one sentence. When the prompt involves media, games or lossy telemetry, a strong answer covers:</p>
<ol>
<li>TCP gives reliable, ordered delivery with flow and congestion control, at the cost of a handshake and head-of-line blocking under loss.</li>
<li>UDP gives independent datagrams with no setup and no waiting, and nothing else.</li>
<li>Choose UDP when fresh data beats complete data; keep control traffic on TCP.</li>
<li>Name what the app must add on UDP: sequence numbers, selective resend, rate control and a TCP fallback.</li>
<li>For browsers, UDP means WebRTC or HTTP/3; QUIC removes TCP's handshake and blocking costs.</li>
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
    "UDP adds ports to IP and stops; TCP adds a reliable, ordered byte stream (within one connection, without message boundaries) plus flow and congestion control.",
    "Strict ordering causes head-of-line blocking: one lost packet delays everything behind it, which hurts real-time data and HTTP/2's shared connection.",
    "Flow control protects the receiver (receive window); congestion control protects the network (congestion window, slow start).",
    "Choose UDP when fresh beats complete, and add sequence numbers, selective resend and rate control yourself.",
    "QUIC rebuilds reliability on UDP with built-in TLS 1.3, one-round-trip setup, independent streams and connection migration; it carries HTTP/3.",
  ],
  furtherReading: [
    { title: "RFC 9000: QUIC, A UDP-Based Multiplexed and Secure Transport", url: "https://www.rfc-editor.org/rfc/rfc9000", note: "The QUIC specification; the introduction and stream sections are readable on their own." },
    { title: "RFC 9293: Transmission Control Protocol (TCP)", url: "https://www.rfc-editor.org/rfc/rfc9293", note: "The consolidated 2022 TCP specification." },
    { title: "High Performance Browser Networking (Ilya Grigorik)", url: "https://hpbn.co/", note: "Chapters on TCP, UDP and slow start with worked latency examples." },
  ],
};
