// Deep dive: Chapter 4, Real-time push: polling, SSE, WebSockets, WebRTC. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>An online auction ends in ninety seconds. Bids are arriving every few hundred milliseconds, and each bidder's screen needs to show the current price right now, not five seconds ago, or people will bid against a price that no longer exists. Your API is classic request/response: the browser asks, the server answers. There is no way for the server to speak first.</p>
<p>The obvious fix is to have every browser ask "anything new?" once a second. With 100,000 people watching, that is 100,000 requests per second hitting your servers, almost all of them answered with "no", and the price can still be a second stale. Getting updates <em>pushed</em> to clients is a ladder of techniques. Each rung buys lower latency or two-way traffic, and each one makes the server hold more state and makes the infrastructure in between work harder.</p>`,
  sections: [
    {
      id: "why-push",
      title: "Why request/response can't push, and what polling costs",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>HTTP is client-initiated: a server can only send bytes as the answer to a request. Chat messages, notifications, live scores, prices, collaborative cursors and ride locations all originate on the server side at moments the client can't predict.</p>`,
        },
        {
          type: "text",
          html: `<p>The simplest workaround is <strong>polling</strong>: the client asks on a timer. It works through every proxy, firewall and load balancer, needs nothing special on the server, and is perfectly stateless. It also has two built-in costs that pull against each other:</p>
<ul>
<li><strong>Staleness.</strong> An update waits on average half the polling interval, and up to a full interval, before a client sees it.</li>
<li><strong>Wasted requests.</strong> Shortening the interval to cut staleness multiplies empty responses. One million clients polling every 5 seconds is 200,000 requests per second, each with full HTTP headers, authentication and routing, mostly to say "nothing changed".</li>
</ul>
<p>For data that changes rarely or where seconds of delay don't matter (a notification badge, a build status page, an order tracker that updates every few minutes), polling is often the right answer precisely because it is so boring. For anything that needs sub-second freshness at scale, you need the server to speak when it has something to say.</p>`,
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
          type: "quiz",
          q: "500,000 clients poll a notification endpoint every 10 seconds, and on average a client has a new notification once an hour. Roughly what fraction of polls return nothing?",
          options: ["About 50%", "About 90%", "More than 99%", "None; polling only returns when there is data"],
          answer: 2,
          explain: "Each client polls 360 times an hour and has news about once, so about 359 of every 360 polls are empty: over 99.7%. That is 50,000 requests per second of mostly wasted work, which is why rarely changing data either uses a long interval or a push mechanism.",
        },
      ],
    },
    {
      id: "long-polling",
      title: "Long polling: hold the request until there is news",
      kicker: "The first rung",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Long polling</strong> keeps polling's request/response shape but changes when the server answers. The client sends a request; if there is nothing new, the server simply doesn't respond yet. It holds the request open until an event arrives or a timeout passes (commonly 20 to 60 seconds, chosen to stay under proxy and load balancer idle limits). Then it responds, and the client immediately sends the next request.</p>
<p>Latency drops to nearly zero for the first event, and empty responses become rare: only the timeouts. It still runs over plain HTTP, so it passes through corporate proxies and needs no special load balancer support. Before WebSockets were standardized in 2011, this technique (popularized in the mid-2000s under the name Comet) was how most web chat and live feeds worked.</p>`,
        },
        {
          type: "steps",
          title: "One long-poll cycle",
          items: [
            "Client sends <code>GET /updates?after=1041</code>, including the ID of the last event it has.",
            "Server finds nothing newer and parks the request, keeping the connection open.",
            "Event 1042 arrives. The server responds with it and closes the response.",
            "Client processes it and immediately sends <code>GET /updates?after=1042</code>.",
            "If the timeout passes first, the server returns an empty response and the client re-requests.",
          ],
        },
        {
          type: "text",
          html: `<p>Two details make or break a long-polling design. First, the <strong>gap</strong>: between one response and the next request, events can arrive with no request waiting for them. The <code>after=</code> cursor solves this, because the server can answer the next request straight from a buffer of recent events. Without it, bursts of events get lost. Second, <strong>held requests are still open connections</strong>. Each waiting client ties up a connection and, on thread-per-request servers, a thread. Long polling scales well only on servers built around asynchronous I/O (Node.js, Netty, Go, nginx), where an idle request costs a few kilobytes rather than a thread stack.</p>`,
        },
        {
          type: "tradeoffs",
          pros: [
            "Near-instant delivery with ordinary HTTP",
            "Works through proxies and firewalls that block upgrades",
            "Easy to fall back to; many real-time libraries use it as a fallback",
          ],
          cons: [
            "A full HTTP request and response per event burst",
            "Events can be lost in the gap unless the client sends a cursor",
            "Holds an open connection per waiting client",
            "Client-to-server messages still need separate requests",
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
          html: `<p>Instead of ending the response after one event, keep it open and write each event as it happens. <strong>Server-Sent Events</strong> (SSE) standardize that: a long-lived HTTP response with type <code>text/event-stream</code>, made of small text records the browser's <code>EventSource</code> API hands to your code one at a time.</p>`,
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
          type: "text",
          html: `<p>Each event is a few <code>field: value</code> lines followed by a blank line. <code>data</code> is the payload, <code>event</code> an optional type, <code>id</code> a position in the stream, and <code>retry</code> tells the browser how long to wait before reconnecting.</p>
<h3>Reconnection is built in, which matters more than it looks</h3>
<p>Long-lived responses get cut constantly: proxies enforce idle limits, load balancers close connections during deploys, phones change networks. <code>EventSource</code> reconnects automatically, and when it does it sends a <code>Last-Event-ID</code> header with the last <code>id</code> it saw. If the server keeps a short buffer of recent events (in memory, or in Redis Streams or Kafka), it can replay what the client missed and the client never notices the break. Without that buffer, every reconnect silently drops events.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "LLM APIs", title: "Token streaming", html: "OpenAI's API streams generated tokens as server-sent events when a request sets <code>stream: true</code>, and many other model APIs do the same. SSE fits perfectly: one request, a one-way stream of small chunks, plain HTTP." },
            { org: "Browsers", title: "The HTTP/1.1 connection limit", html: "Over HTTP/1.1, browsers allow about six connections per host, and each open SSE stream uses one, so a user with many tabs open can starve the page of connections. Over HTTP/2 the streams are multiplexed on one connection and the limit stops mattering." },
          ],
        },
        {
          type: "compare",
          items: [
            { title: "SSE fits", tone: "ok", html: "One-way server-to-client updates: live scores, notifications, dashboards, price tickers, progress bars, streamed AI responses. Client actions go through normal HTTP requests." },
            { title: "SSE struggles", tone: "warn", html: "Frequent client-to-server messages (chat typing, game input), binary payloads (SSE is UTF-8 text), and environments where an intermediate proxy buffers responses instead of streaming them." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>A buffering proxy or a compression middleware that waits for a full response will hold SSE events back until the buffer fills, so the "real-time" stream arrives in clumps. Disable response buffering on that route (for example nginx's <code>X-Accel-Buffering: no</code> header) and test through the real network path, not just locally.</p>`,
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
          html: `<p>A <strong>WebSocket</strong> (RFC 6455, 2011) starts life as an ordinary HTTP request carrying <code>Upgrade: websocket</code>. If the server agrees, it answers <code>101 Switching Protocols</code>, and from then on the same TCP connection carries WebSocket <strong>frames</strong> in both directions, whenever either side likes, with only a few bytes of framing overhead per message. No headers per message, no request/response pairing.</p>
<p>The protocol only moves frames; you design the messages on top. A common pattern is JSON objects with a <code>type</code> field (<code>{"type": "message.send", "chatId": 9, "text": "hi"}</code> up, <code>{"type": "message.new", ...}</code> down), plus client-generated IDs so acknowledgements and retries can be matched, and sequence numbers so a reconnecting client can ask for what it missed.</p>`,
        },
        {
          type: "text",
          html: `<h3>Why WebSockets are harder to operate than HTTP</h3>
<p>Every connected user is now an open connection pinned to one specific server, for minutes or hours. That one fact ripples through the design:</p>
<ul>
<li><strong>Load balancing</strong> happens once per connection, not per message, so an algorithm like least connections matters, and a server added during the day stays nearly empty until clients reconnect.</li>
<li><strong>Every hop must support it.</strong> Load balancers, proxies and gateways must allow the upgrade and long-lived connections, and their idle timeouts (AWS Application Load Balancers default to 60 seconds) force you to send application-level heartbeats.</li>
<li><strong>Deploys</strong> must drain connections gradually, and clients must reconnect with randomized backoff, or every restart triggers a reconnect stampede.</li>
<li><strong>Routing messages</strong> between users becomes a distributed problem, because the sender and the recipient are usually connected to different servers.</li>
</ul>`,
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
          html: `<p>The alternative to broadcast-style pub/sub is a <strong>connection registry</strong>: a fast store (often Redis) mapping each user ID to the server holding their socket, so server 1 can forward the message straight to server 2. Pub/sub is simpler to build; a registry avoids every server receiving traffic for users it doesn't hold. Either way, messages must also be written to durable storage, because the recipient may be offline and the push is only a notification that something is there.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Slack", title: "Real-time messaging", html: "Slack clients keep a WebSocket open to receive messages and events as they happen, and Slack's Socket Mode lets apps receive events over a WebSocket instead of exposing a public HTTP endpoint." },
            { org: "Figma", title: "Multiplayer editing", html: "Figma has described its multiplayer system as clients holding WebSocket connections to a server that is the authority for each document, rather than peers syncing directly with each other." },
          ],
        },
      ],
    },
    {
      id: "webrtc",
      title: "WebRTC: peer to peer, through the NAT maze",
      kicker: "Direct connections",
      blocks: [
        {
          type: "problem",
          html: `<p>For a video call, routing every frame through your servers doubles the path length and costs a fortune in bandwidth. Two browsers talking directly would be ideal, but most devices sit behind NAT routers and firewalls that drop unsolicited inbound connections, so neither side can simply connect to the other's address.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>WebRTC</strong> is a set of browser APIs and protocols for direct peer-to-peer audio, video and data, mostly over UDP. Getting two peers connected takes several supporting pieces:</p>
<ul>
<li>A <strong>signaling server</strong> that you build, usually over WebSockets. Peers use it to find each other and exchange session descriptions (which codecs, which media) and network candidates (addresses where they might be reachable). WebRTC deliberately doesn't specify how signaling works.</li>
<li>A <strong>STUN</strong> server answers one question: "what public address and port do you see my packets coming from?" Each peer learns its public-facing address and shares it through signaling. Both then send packets toward each other at the same time, which opens matching holes in most NATs (<strong>hole punching</strong>).</li>
<li>A <strong>TURN</strong> server is the fallback when no direct path works, for example behind strict corporate firewalls or symmetric NATs. Both peers send their media to the TURN relay, which forwards it. It always works, and it costs you the bandwidth of every relayed call.</li>
</ul>
<p>The process of gathering candidates (local, STUN-discovered, TURN relay) and testing them to find the best working pair is called <strong>ICE</strong>.</p>`,
        },
        {
          type: "tradeoffs",
          pros: [
            "Lowest latency: media flows directly between peers over UDP",
            "Server bandwidth is near zero for calls that connect directly",
            "Built into every major browser, with encryption required",
          ],
          cons: [
            "Needs signaling, STUN and TURN infrastructure before anything works",
            "TURN relays carry the full media stream for calls that can't connect directly",
            "Full-mesh calls don't scale: each peer uploads a stream to every other peer, so group calls use a media server (SFU) instead",
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Collaborative editors are a tempting WebRTC use case, and most production editors still choose a central server over WebSockets. The server stores the document, orders or merges concurrent edits, enforces permissions and lets late joiners load the latest state. Peer-to-peer editing with CRDTs is possible, but you still need a server for persistence and discovery, so the direct connection buys little.</p>`,
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
      kicker: "Trade-offs",
      blocks: [
        {
          type: "text",
          html: `<p>Climb only as high as the requirements force you. Each technique up the ladder holds more state on the server for longer and asks more of every proxy, load balancer and deployment process on the path.</p>`,
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
          type: "keypoints",
          items: [
            "Updates a few times a day: polling with a long interval, or a push notification service for mobile.",
            "One-way live updates: SSE (or long polling if the network path forces it).",
            "Frequent messages in both directions: WebSockets, with heartbeats, reconnect backoff and a fan-out layer.",
            "Audio, video or peer data where milliseconds matter: WebRTC, with TURN as the safety net.",
          ],
        },
        {
          type: "quiz",
          q: "A notification badge updates a few times a day per user. Which approach is the most sensible default?",
          options: [
            "WebSockets for every user",
            "WebRTC data channels",
            "Polling on a long interval or on page focus, or SSE if an open stream already exists",
            "Long polling with a 1-second timeout",
          ],
          answer: 2,
          explain: "A handful of updates a day doesn't justify holding a persistent connection per user. Polling every minute or when the tab regains focus is cheap and stateless; if the app already keeps an SSE stream or WebSocket open for other reasons, piggyback on it.",
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
          html: `<p>Real-time requirements show up in chat, notifications, live comments, ride tracking, auctions, collaborative editing and dashboards. Pick the lowest rung that satisfies them, justify it in a sentence, then spend your time on the hard part: how a message produced on one server reaches a client connected to another, and what happens when connections drop.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>For a "2 million WebSocket connections across 50 servers" style question, cover:</p>
<ol>
<li>Clients connect through an L4 or upgrade-aware L7 load balancer using least connections; each server holds about 40,000 sockets.</li>
<li>Persist the message first, then route it: pub/sub channels per user or a registry of which server holds which user.</li>
<li>Offline or disconnected recipients catch up from storage using a last-seen sequence number.</li>
<li>Heartbeats to survive idle timeouts; deploys drain gradually; clients reconnect with jittered backoff.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Reaching for WebSockets by reflex. If the client only listens, SSE gives you push over plain HTTP with built-in reconnection and replay. Say why you need two-way traffic before you take on WebSocket infrastructure.</p>`,
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
    "HTTP can't push. Polling is simple and stateless but trades staleness against huge numbers of empty requests.",
    "Long polling holds each request until there is news; send a cursor with each request so events in the gap between polls aren't lost.",
    "SSE streams many events in one HTTP response and reconnects automatically with Last-Event-ID; keep a replay buffer on the server.",
    "WebSockets give a persistent two-way channel, at the cost of per-server connection state, upgrade-aware infrastructure, heartbeats, draining and cross-server message routing.",
    "WebRTC connects peers directly over UDP using signaling, STUN for public addresses and TURN relays when no direct path exists.",
    "Choose the lowest rung that meets the requirement; the hard design work is fan-out across servers and recovery after disconnects.",
  ],
  furtherReading: [
    { title: "RFC 6455: The WebSocket Protocol", url: "https://www.rfc-editor.org/rfc/rfc6455", note: "The upgrade handshake and frame format." },
    { title: "MDN: Using server-sent events", url: "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events", note: "Event stream format, EventSource and reconnection." },
    { title: "WebRTC for the Curious", note: "A free, open-source book explaining signaling, ICE, STUN and TURN from first principles." },
  ],
};
