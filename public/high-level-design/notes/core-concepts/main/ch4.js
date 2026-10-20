// Main tab: Chapter 4, Real-time push: polling, SSE, WebSockets, WebRTC. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch4 = [
  {
    id: "the-ladder",
    title: "A ladder of techniques",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>Plain HTTP only lets the client speak first. When the server learns something new (a message arrived, a price moved, a driver got closer), it has no way to tell a client that hasn't asked. Every real-time technique is a workaround for that limit, and they form a ladder. Each rung up buys lower latency or two-way traffic, and pays for it with more connections held open, more state on servers and more demanding infrastructure. The skill is to climb only as high as the requirements force you.</p>`,
      },
      {
        type: "table",
        headers: ["Rung", "How it works", "What it costs", "Fits"],
        rows: [
          ["Polling", "Client asks on a timer", "Mostly empty responses; updates up to one interval late", "Rare updates, dashboards, status pages"],
          ["Long polling", "Server holds the request until there is news, then the client asks again", "One held request per client, a new request per event", "Near real-time with no new infrastructure"],
          ["Server-Sent Events", "One long HTTP response that streams many events", "One open response per client; replay on reconnect", "One-way push: notifications, scores, prices, progress"],
          ["WebSockets", "An upgraded connection where both sides send at any time", "A stateful connection pinned to one server per client", "Frequent two-way traffic: chat, games, collaboration"],
          ["WebRTC", "Direct peer-to-peer media and data over UDP", "Signaling, STUN, and TURN relays for some peers", "Voice and video calls"],
        ],
      },
    ],
  },
  {
    id: "choosing",
    title: "Choosing a rung",
    kicker: "Decision rule",
    blocks: [
      {
        type: "steps",
        items: [
          "<strong>How fresh must updates be?</strong> If a delay of several seconds is acceptable, or updates come a few times an hour, polling is enough. Don't dismiss it: it is the cheapest and most robust option.",
          "<strong>Who sends, and how often?</strong> If only the server pushes and the client acts occasionally (placing a bid, liking a post), use SSE for the push and ordinary requests for the actions.",
          "<strong>Is traffic frequent in both directions?</strong> Chat, multiplayer games, collaborative editing and trading screens justify WebSockets.",
          "<strong>Is it live audio or video between users?</strong> That is the one case for WebRTC. For almost anything else, a server in the middle is simpler and needed anyway for storage and permissions.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        html: `<p>Long polling is a good fallback answer when the interviewer asks for the simplest near real-time option that works through every proxy and needs no special load balancer support.</p>`,
      },
    ],
  },
  {
    id: "persistent-connections",
    title: "What changes once connections stay open",
    kicker: "The hard part",
    blocks: [
      {
        type: "text",
        html: `<p>SSE and WebSockets turn each client into a long-lived connection held by one particular server. That breaks the comfortable stateless model from request/response APIs, and a good design answers four new questions.</p>`,
      },
      {
        type: "keypoints",
        items: [
          "<strong>Routing a message to the right server.</strong> User A is connected to server 3 and user B to server 17. When A sends B a message, server 3 must find server 17. Either keep a connection registry (user to server, often in Redis) and forward directly, or publish to a pub/sub channel per user or per room that server 17 subscribes to.",
          "<strong>Catching up after a reconnect.</strong> Connections drop constantly on mobile networks. Give events IDs and keep a short replay buffer so a reconnecting client can report the last event it saw (say, event 812) and receive what it missed. SSE has this built in with <code>Last-Event-ID</code>.",
          "<strong>Balancing long-lived connections.</strong> Use least-connections balancing, often at Layer 4. With round robin, servers added later stay nearly empty while old ones keep the connections they accumulated.",
          "<strong>Deploys and restarts.</strong> Drain connections gradually and have clients reconnect with jittered backoff, or a restart becomes a reconnection storm that knocks over the remaining servers.",
        ],
      },
    ],
  },
  {
    id: "worked-example",
    title: "Two worked examples",
    kicker: "Applying it",
    blocks: [
      {
        type: "compare",
        items: [
          { title: "Live sports scores", tone: "ok", html: "<p>Updates flow one way, from server to millions of viewers, a few times a minute per match. <strong>SSE</strong> fits: each viewer opens a stream for the match, servers subscribe to score changes through pub/sub and push them out, and event IDs let reconnecting viewers catch up. A CDN-cached poll every few seconds would also be defensible at huge scale.</p>" },
          { title: "Group chat", tone: "info", html: "<p>Users both send and receive frequently, and need typing indicators and read receipts. <strong>WebSockets</strong> fit. Define the message types (for example <code>message.send</code>, <code>message.new</code>, <code>typing</code>), persist every message before acknowledging it, route between servers with pub/sub per chat, and fall back to push notifications for offline users.</p>" },
        ],
      },
      {
        type: "callout",
        tone: "insight",
        html: `<p>Listing your WebSocket message types is the real-time equivalent of listing REST endpoints. It makes the design concrete and shows you know the socket only carries frames; the protocol on top is yours to define.</p>`,
      },
    ],
  },
  {
    id: "interview",
    title: "Using this in an interview",
    kicker: "What to say",
    blocks: [
      {
        type: "callout",
        tone: "interview",
        html: `<p>Justify the rung from the requirements: how fresh, which direction, how often. Then cover the operational questions without being asked: how a message finds the recipient's server, how clients catch up after reconnecting, how connections are balanced, and what happens during a deploy. For calls, name WebRTC with signaling, STUN and TURN, and note that TURN relays cost real bandwidth.</p>`,
      },
      {
        type: "callout",
        tone: "mistake",
        title: "Common mistakes",
        html: `<ul><li>Reaching for WebSockets when updates only flow from server to client.</li><li>Ignoring how a message reaches a user connected to a different server.</li><li>Forgetting that reconnecting clients miss events unless there is a replay buffer.</li><li>Using WebRTC for chat or document collaboration, where a central server is needed anyway.</li></ul>`,
      },
    ],
  },
];
