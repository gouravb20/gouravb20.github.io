// Deep dive: Chapter 4, Real-time push: polling, SSE, WebSockets, WebRTC. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>This chapter answers how a server gets updates to clients when HTTP only lets clients speak first. The techniques form a ladder: each rung buys lower latency or two-way traffic in exchange for more server state and harder infrastructure.</p>`,
  sections: [
    {
      id: "polling",
      title: "Polling and long polling",
      kicker: "The first rungs",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Polling</strong> asks on a timer: stateless and works everywhere, but staleness (half an interval on average) trades against wasted requests. One million clients polling every 5 seconds is 200,000 requests per second, mostly saying "nothing changed". For rarely changing data, that boring answer is often right.</p>`,
        },
        {
          type: "diagram",
          title: "Four ways to get the same three events to a client",
          caption: "Dashed lines are moments when the server has news. Polling delivers each event at the next poll; long polling, SSE and WebSockets deliver it immediately. Only the WebSocket also carries client-to-server messages on the same connection.",
          svg: `<svg viewBox="0 0 620 318" role="img" aria-label="Timeline comparing polling, long polling, server-sent events and WebSockets delivering three server events">
<line x1="250" y1="50" x2="250" y2="268" stroke-width="2" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="420" y1="50" x2="420" y2="268" stroke-width="2" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="520" y1="50" x2="520" y2="268" stroke-width="2" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<text x="250" y="42" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">event</text>
<text x="420" y="42" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">event</text>
<text x="520" y="42" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">event</text>
<text x="20" y="84" font-size="13" font-weight="700">Polling</text>
<text x="20" y="101" font-size="12" style="fill: var(--dg-muted)">every interval</text>
<rect x="153" y="73" width="14" height="14" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="233" y="73" width="14" height="14" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="313" y="73" width="14" height="14" style="fill: var(--dg-1); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="393" y="73" width="14" height="14" style="fill: var(--dg-panel); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="473" y="73" width="14" height="14" style="fill: var(--dg-1); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="553" y="73" width="14" height="14" style="fill: var(--dg-1); stroke: var(--dg-1)" stroke-width="2"/>
<text x="20" y="144" font-size="13" font-weight="700">Long polling</text>
<text x="20" y="161" font-size="12" style="fill: var(--dg-muted)">held until news</text>
<rect x="150" y="134" width="100" height="12" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="254" y="134" width="166" height="12" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="424" y="134" width="96" height="12" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<rect x="524" y="134" width="76" height="12" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<circle cx="250" cy="140" r="6" style="fill: var(--dg-2)"/>
<circle cx="420" cy="140" r="6" style="fill: var(--dg-2)"/>
<circle cx="520" cy="140" r="6" style="fill: var(--dg-2)"/>
<text x="20" y="204" font-size="13" font-weight="700">SSE</text>
<text x="20" y="221" font-size="12" style="fill: var(--dg-muted)">one long response</text>
<rect x="150" y="194" width="450" height="12" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<circle cx="250" cy="200" r="6" style="fill: var(--dg-3)"/>
<circle cx="420" cy="200" r="6" style="fill: var(--dg-3)"/>
<circle cx="520" cy="200" r="6" style="fill: var(--dg-3)"/>
<text x="20" y="264" font-size="13" font-weight="700">WebSocket</text>
<text x="20" y="281" font-size="12" style="fill: var(--dg-muted)">two-way channel</text>
<rect x="150" y="254" width="450" height="12" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<circle cx="250" cy="260" r="6" style="fill: var(--dg-4)"/>
<circle cx="420" cy="260" r="6" style="fill: var(--dg-4)"/>
<circle cx="520" cy="260" r="6" style="fill: var(--dg-4)"/>
<circle cx="335" cy="260" r="6" stroke-width="2" style="fill: var(--dg-panel); stroke: var(--dg-4)"/>
<circle cx="470" cy="260" r="6" stroke-width="2" style="fill: var(--dg-panel); stroke: var(--dg-4)"/>
<text x="320" y="300" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Filled marks: an event reaching the client. Empty squares: polls with no news.</text>
<text x="320" y="316" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Hollow circles: messages the client sends up the WebSocket.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p><strong>Long polling</strong> holds the request open until an event arrives or a timeout passes (commonly 20 to 60 seconds, under proxy idle limits), then the client immediately asks again. Delivery is near instant over plain HTTP.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Send a cursor</strong> (<code>GET /updates?after=1042</code>): events that arrive between one response and the next request are served from a buffer instead of lost.",
            "<strong>Each waiting client is an open connection.</strong> It scales only on async-I/O servers (Node.js, Netty, Go, nginx), where an idle request costs kilobytes, not a thread.",
            "Still one full HTTP request per event burst, and client-to-server messages need separate requests. Many real-time libraries use it as a fallback.",
          ],
        },
      ],
    },
    {
      id: "server-sent-events",
      title: "Server-Sent Events: one response, many messages",
      kicker: "Server to client",
      blocks: [
        {
          type: "idea",
          html: `<p>Keep the response open and write each event as it happens. <strong>SSE</strong> standardizes this as a <code>text/event-stream</code> response that the browser's <code>EventSource</code> API delivers one event at a time.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "A few events on an SSE stream",
          code: `HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

retry: 3000

id: 1042
event: bid
data: {"lot": 17, "price_cents": 125000}

id: 1043
event: bid
data: {"lot": 17, "price_cents": 126000}
`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Reconnection is built in:</strong> <code>EventSource</code> reconnects and sends <code>Last-Event-ID</code>. Keep a short replay buffer (memory, Redis Streams or Kafka) or every reconnect silently drops events.",
            "Over HTTP/1.1 each stream uses one of about six connections per host; HTTP/2 multiplexes them and the limit stops mattering.",
            "OpenAI's API streams tokens as SSE when <code>stream: true</code> is set: one request, a one-way stream of small chunks.",
          ],
        },
        {
          type: "compare",
          items: [
            { title: "SSE fits", tone: "ok", html: "One-way updates: live scores, notifications, dashboards, tickers, progress bars, streamed AI responses. Client actions go through normal HTTP requests." },
            { title: "SSE struggles", tone: "warn", html: "Frequent client-to-server messages, binary payloads (SSE is UTF-8 text), and proxies that buffer responses instead of streaming them." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>A buffering proxy or compression middleware holds SSE events until its buffer fills, so the stream arrives in clumps. Disable buffering on that route (for example nginx's <code>X-Accel-Buffering: no</code>) and test through the real network path.</p>`,
        },
      ],
    },
    {
      id: "websockets",
      title: "WebSockets: a persistent two-way channel",
      kicker: "Full duplex",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>WebSocket</strong> (RFC 6455, 2011) starts as an HTTP request with <code>Upgrade: websocket</code>; after <code>101 Switching Protocols</code> the TCP connection carries small frames both ways. You design the messages: typically JSON with a <code>type</code>, client-generated IDs for acks and retries, and sequence numbers for catch-up.</p>`,
        },
        {
          type: "list",
          title: "Why it is harder to operate: each user is a connection pinned to one server",
          items: [
            "<strong>Load balancing</strong> happens once per connection, so use least connections; a server added mid-day stays nearly empty until clients reconnect.",
            "<strong>Every hop</strong> must allow the upgrade and long-lived connections; idle timeouts (AWS ALB defaults to 60 s) force heartbeats.",
            "<strong>Deploys</strong> must drain gradually and clients must reconnect with randomized backoff, or restarts cause reconnect stampedes.",
            "<strong>Routing</strong> between users is distributed: sender and recipient are usually on different servers.",
          ],
        },
        {
          type: "diagram",
          title: "Delivering a message when users sit on different servers",
          caption: "A connects to server 1 and B to server 2. Server 1 publishes the message on B's channel; server 2, which subscribed to channels for its connected users, pushes it down B's socket.",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="User A on WebSocket server 1 sends a message that travels through a pub/sub system to server 2 and then to user B">
<defs><marker id="cc4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<rect x="20" y="60" width="100" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="70" y="85" text-anchor="middle" font-size="13">User A</text>
<rect x="20" y="170" width="100" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="70" y="195" text-anchor="middle" font-size="13">User B</text>
<rect x="180" y="55" width="130" height="50" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="245" y="85" text-anchor="middle" font-size="13">WS server 1</text>
<rect x="180" y="165" width="130" height="50" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="245" y="195" text-anchor="middle" font-size="13">WS server 2</text>
<rect x="400" y="110" width="190" height="50" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="495" y="132" text-anchor="middle" font-size="13" font-weight="700">Pub/sub</text>
<text x="495" y="150" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">e.g. Redis channels</text>
<line x1="120" y1="80" x2="177" y2="80" stroke-width="2" marker-end="url(#cc4-arrow)" style="stroke: var(--dg-ink)"/>
<text x="149" y="70" text-anchor="middle" font-size="12">1. send</text>
<line x1="310" y1="80" x2="397" y2="124" stroke-width="2" marker-end="url(#cc4-arrow)" style="stroke: var(--dg-ink)"/>
<text x="330" y="70" font-size="12">2. publish to B</text>
<line x1="400" y1="146" x2="313" y2="190" stroke-width="2" marker-end="url(#cc4-arrow)" style="stroke: var(--dg-ink)"/>
<text x="340" y="208" font-size="12">3. deliver</text>
<line x1="180" y1="190" x2="123" y2="190" stroke-width="2" marker-end="url(#cc4-arrow)" style="stroke: var(--dg-ink)"/>
<text x="150" y="180" text-anchor="middle" font-size="12">4. push</text>
<text x="310" y="248" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Each server subscribes to the channels of the users connected to it.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>The alternative to pub/sub is a <strong>connection registry</strong> (often Redis) mapping user ID to server, so messages go straight to the right server. Pub/sub is simpler; a registry avoids servers receiving traffic for users they don't hold. Either way, persist the message first: the push is only a notification.</p>`,
        },
      ],
    },
    {
      id: "webrtc",
      title: "WebRTC: peer to peer, through NAT",
      kicker: "Direct connections",
      blocks: [
        {
          type: "text",
          html: `<p><strong>WebRTC</strong> sends audio, video and data directly between browsers, mostly over UDP, so call media doesn't cross your servers. Most devices sit behind NATs that drop unsolicited inbound traffic, so connecting takes supporting infrastructure.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Signaling</strong> (you build it, usually over WebSockets): peers exchange session descriptions and network candidates.",
            "<strong>STUN</strong> tells a peer its public address and port; both peers then send toward each other to open NAT holes (hole punching).",
            "<strong>TURN</strong> relays media when no direct path works (strict firewalls, symmetric NATs). Always works, and you pay for the bandwidth.",
            "<strong>ICE</strong> gathers candidates (local, STUN, TURN) and picks the best working pair.",
          ],
        },
        {
          type: "tradeoffs",
          pros: [
            "Lowest latency: media flows directly between peers over UDP",
            "Server bandwidth is near zero for calls that connect directly",
            "Built into every major browser, with encryption required",
          ],
          cons: [
            "Needs signaling, STUN and TURN before anything works",
            "Full-mesh group calls don't scale, so they use a media server (SFU)",
            "Collaborative editors usually still pick a central WebSocket server for storage, ordering, permissions and late joiners",
          ],
        },
        {
          type: "quiz",
          q: "Two users on the same video call can't connect directly because one is behind a strict corporate firewall. What carries their media?",
          options: [
            "The STUN server",
            "The signaling server",
            "A TURN relay server",
            "The call fails; WebRTC requires a direct path",
          ],
          answer: 2,
          explain: "STUN only tells a peer its public address; signaling only exchanges connection details. When ICE can't find a direct path, both peers send media to a TURN relay that forwards it, which is why TURN capacity is a real cost in any WebRTC product.",
        },
      ],
    },
    {
      id: "choosing",
      title: "Choosing the right rung",
      kicker: "Trade-offs and interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Climb only as high as the requirements force you. Each rung holds more server state for longer and asks more of every proxy, load balancer and deploy on the path.</p>`,
        },
        {
          type: "table",
          headers: ["Technique", "Direction", "Latency", "Server holds", "Good for"],
          rows: [
            ["Polling", "Client pulls", "Up to one interval", "Nothing between polls", "Rare updates, simple dashboards"],
            ["Long polling", "Server to client", "Near instant", "One parked request per client", "Fallback, proxies that block upgrades"],
            ["SSE", "Server to client", "Near instant", "One open response per client", "Feeds, notifications, streamed AI output"],
            ["WebSocket", "Both ways", "Near instant", "One open connection per client", "Chat, collaboration, live games"],
            ["WebRTC", "Peer to peer", "Lowest", "Signaling and TURN only", "Voice, video, low-latency peer data"],
          ],
        },
        {
          type: "lab",
          id: "realtimeCompare",
          caption: "Set the number of clients, how often events happen and whether clients send messages back. Compare the requests per second, staleness and open connections each technique costs the server.",
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Pick the lowest rung, justify it in a sentence, then spend time on fan-out and recovery. For "2 million WebSocket connections across 50 servers", cover:</p>
<ol>
<li>An L4 or upgrade-aware L7 load balancer using least connections; about 40,000 sockets per server.</li>
<li>Persist the message first, then route it: per-user pub/sub channels or a registry of which server holds which user.</li>
<li>Disconnected recipients catch up from storage using a last-seen sequence number.</li>
<li>Heartbeats for idle timeouts; gradual draining on deploys; jittered reconnect backoff.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Reaching for WebSockets by reflex. If the client only listens, SSE gives push over plain HTTP with built-in reconnection and replay.</p>`,
        },
        {
          type: "quiz",
          q: "A live auction page must show the current price instantly; bids are placed by clicking a button a few times per session. What fits best?",
          options: [
            "Polling every 5 seconds",
            "SSE for price updates, and normal POST requests for bids",
            "WebRTC between all bidders",
            "A TURN server",
          ],
          answer: 1,
          explain: "Price updates flow one way, at high frequency, to many viewers: exactly SSE's sweet spot. Bids are rare, user-initiated writes that benefit from ordinary HTTP semantics (status codes, idempotency keys). WebSockets would also work, but add two-way infrastructure you don't need.",
        },
      ],
    },
  ],
  takeaways: [
    "HTTP can't push. Polling is simple and stateless but trades staleness against huge numbers of empty requests; long polling needs a cursor so gap events aren't lost.",
    "SSE streams many events in one HTTP response and reconnects with Last-Event-ID; keep a replay buffer on the server.",
    "WebSockets give a two-way channel at the cost of per-server connection state, heartbeats, draining and cross-server routing.",
    "WebRTC connects peers directly using signaling, STUN for public addresses and TURN relays when no direct path exists.",
    "Choose the lowest rung that meets the requirement; the hard work is fan-out across servers and recovery after disconnects.",
  ],
  furtherReading: [
    { title: "RFC 6455: The WebSocket Protocol", url: "https://www.rfc-editor.org/rfc/rfc6455", note: "The upgrade handshake and frame format." },
    { title: "MDN: Using server-sent events", url: "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events", note: "Event stream format, EventSource and reconnection." },
    { title: "WebRTC for the Curious", note: "A free, open-source book explaining signaling, ICE, STUN and TURN from first principles." },
  ],
};
