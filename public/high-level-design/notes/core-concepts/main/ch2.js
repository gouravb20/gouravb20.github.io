// Main tab: Chapter 2, Transport: TCP, UDP and QUIC. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch2 = [
  {
    id: "complete-or-fresh",
    title: "The one question: complete or fresh?",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>IP delivers packets on a best-effort basis. The transport layer decides what to do about that. Every transport choice comes down to one question: when a packet goes missing, is it better to <strong>wait for it</strong> or to <strong>move on without it</strong>? If the data must arrive whole and in order (a web page, a bank transfer, a database query), you wait. If old data is worthless once newer data exists (a voice sample, a player's position), you move on.</p>`,
      },
      {
        type: "compare",
        items: [
          { title: "TCP: wait for it", tone: "info", html: "<p>A connection with a handshake, then a reliable, ordered byte stream. Lost bytes are retransmitted; the receiver holds later bytes until the gap is filled. It also paces the sender so it neither floods the receiver nor the network.</p>" },
          { title: "UDP: move on", tone: "warn", html: "<p>Independent datagrams with no handshake, no acknowledgements, no retransmission and no ordering. Each packet arrives or doesn't. The application decides what loss means and what, if anything, to resend.</p>" },
        ],
      },
      {
        type: "text",
        html: `<p>Both add <strong>ports</strong> so traffic reaches the right process. Beyond that, UDP adds almost nothing, which is exactly its appeal: you get raw speed and full control, and you take on every responsibility TCP would have handled.</p>`,
      },
    ],
  },
  {
    id: "what-tcp-costs",
    title: "What TCP's guarantees cost",
    kicker: "The price of reliability",
    blocks: [
      {
        type: "text",
        html: `<p>TCP is not slow. On a clean network its throughput is excellent, and almost every protocol you will name in an interview (HTTP/1.1, HTTP/2, gRPC, database wire protocols) runs on it. Its costs show up as <strong>latency</strong>, mostly under loss or on fresh connections.</p>`,
      },
      {
        type: "keypoints",
        items: [
          "<strong>Setup.</strong> One round trip for the handshake before the first byte, plus TLS on top for HTTPS.",
          "<strong>Head-of-line blocking.</strong> Because delivery is strictly in order, one lost packet holds back everything behind it for at least one extra round trip. For a file download that is invisible; for live audio it is a stutter.",
          "<strong>Slow start.</strong> A new connection begins with a small sending window and grows it as acknowledgements return, so bulk transfers on a cold connection take several round trips to reach full speed.",
          "<strong>Ordering only within one connection.</strong> Two messages sent on two different connections can arrive in either order. If order matters per user or per conversation, keep that traffic on one connection or add sequence numbers.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        title: "Flow control versus congestion control",
        html: `<p>Interviewers like this distinction. <strong>Flow control</strong> protects the receiver: the sender never has more unacknowledged data in flight than the receiver says it can buffer. <strong>Congestion control</strong> protects the network: the sender slows down when loss or rising delay suggests links are overloaded.</p>`,
      },
    ],
  },
  {
    id: "decision-rule",
    title: "A decision rule you can defend",
    kicker: "Choosing",
    blocks: [
      {
        type: "steps",
        title: "Pick UDP only if all of these hold",
        items: [
          "A late packet is worse than a missing one, because newer data replaces it.",
          "The application can hide or tolerate gaps: interpolate a position, conceal a dropped audio frame, lose a metric sample.",
          "You are prepared to add what you need yourself: sequence numbers, selective resend of important events, rate control.",
          "Browser clients are not required, or they have another route (WebRTC or HTTP/3), because web pages cannot open raw UDP sockets.",
        ],
      },
      {
        type: "table",
        title: "Applying it",
        headers: ["Scenario", "Choice", "Why"],
        rows: [
          ["Chat messages", "TCP (WebSocket)", "Every message must arrive, in order"],
          ["Voice or video call", "UDP (WebRTC)", "A frame that arrives 300 ms late is useless"],
          ["Multiplayer game positions", "UDP", "The next update arrives 30 ms later anyway"],
          ["Game events such as a score or a purchase", "Reliable messages, often on top of UDP", "Not superseded by later data, so they must be resent"],
          ["High-volume metrics", "UDP, or batched TCP", "Losing a few samples is fine; overhead is not"],
          ["File upload, API calls, payments", "TCP", "Completeness is the whole point"],
        ],
      },
      {
        type: "callout",
        tone: "insight",
        html: `<p>Real systems mix the two. A video call app uses HTTPS for login and signalling and UDP for the media itself. Saying this shows you see transport as a per-flow decision, not an all-or-nothing choice.</p>`,
      },
    ],
  },
  {
    id: "quic",
    title: "QUIC: TCP's guarantees, rebuilt on UDP",
    kicker: "The modern option",
    blocks: [
      {
        type: "text",
        html: `<p>QUIC runs over UDP but provides reliable, encrypted, multiplexed streams, implemented in user space rather than the kernel. It is the transport underneath HTTP/3. You rarely need it in a design, but you should be able to explain why it exists in a few sentences.</p>`,
      },
      {
        type: "tradeoffs",
        prosLabel: "What it fixes",
        consLabel: "What it costs",
        pros: [
          "Transport and TLS setup in one round trip, zero on resumption",
          "Ordering is per stream, so a lost packet stalls only its own stream",
          "Connections are identified by ID and survive a phone switching from Wi-Fi to cellular",
        ],
        cons: [
          "Some networks block UDP, so clients keep a TCP fallback",
          "More CPU per byte than kernel TCP",
          "Harder to inspect and debug at the network level",
        ],
      },
    ],
  },
  {
    id: "interview",
    title: "Using this in an interview",
    kicker: "What to say",
    blocks: [
      {
        type: "text",
        html: `<p>For most prompts, transport deserves one sentence: "everything runs over TCP, usually HTTPS". Spend more time only when the prompt involves live media, games or very high-volume telemetry. Then state the trade-off as completeness versus freshness, say what the application must add on top of UDP, and say what browser users get instead.</p>`,
      },
      {
        type: "callout",
        tone: "mistake",
        title: "Common mistakes",
        html: `<ul><li>Saying "TCP is slow" instead of "TCP adds latency spikes under loss".</li><li>Choosing UDP for data that must not be lost, such as chat messages or orders.</li><li>Assuming two TCP connections preserve order between them.</li><li>Proposing raw UDP for a browser feature without mentioning WebRTC or HTTP/3.</li></ul>`,
      },
    ],
  },
];
