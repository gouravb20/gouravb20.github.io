// Main tab: Real-time Updates. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN["realtime-updates"] = [
  {
    id: `the-problem`,
    title: `Why plain request/response is not enough`,
    kicker: `The problem`,
    blocks: [
      { type: `text`, html: `<p>In a normal web API the client speaks first: it sends a request, the server answers, and the exchange is over. That model breaks as soon as the interesting event happens somewhere else. A friend sends you a chat message, a goal is scored, the driver turns the corner, a colleague edits the paragraph you are reading. The server knows, but it has no open line to tell you until you ask again.</p><p>Products like chat, live scores, ride tracking, auctions, collaborative documents and notifications all need that line. Designing it means answering two separate questions, and most candidates only answer the first.</p>` },
      { type: `diagram`, title: `Two hops for every real-time update`, caption: `Hop 2 (inside the backend) gets the event from the service where it happened to the gateway holding the user's connection. Hop 1 (the protocol) gets it from that gateway to the device.`, svg: `<svg viewBox="0 0 620 200" role="img" aria-label="An event travels from a service through a router to the gateway holding the connection, then to the client">
<defs><marker id="pt1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="16" y="70" width="120" height="56" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="76" y="94" text-anchor="middle" font-size="13" font-weight="700">Chat service</text>
<text x="76" y="113" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">event happens</text>
<rect x="190" y="70" width="130" height="56" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="255" y="94" text-anchor="middle" font-size="13" font-weight="700">Router</text>
<text x="255" y="113" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">pub/sub or hash</text>
<rect x="374" y="70" width="110" height="56" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="429" y="94" text-anchor="middle" font-size="13" font-weight="700">Gateway 17</text>
<text x="429" y="113" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">holds the socket</text>
<rect x="530" y="70" width="76" height="56" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="568" y="103" text-anchor="middle" font-size="13" font-weight="700">Client</text>
<line x1="136" y1="98" x2="188" y2="98" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt1-arrow)"/>
<line x1="320" y1="98" x2="372" y2="98" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt1-arrow)"/>
<line x1="484" y1="98" x2="528" y2="98" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt1-arrow)"/>
<path d="M16 150 H484" stroke-width="2" style="stroke: var(--dg-4); fill: none"/>
<text x="250" y="172" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-4)">Hop 2: server-side push or pull</text>
<path d="M484 50 H606" stroke-width="2" style="stroke: var(--dg-2); fill: none"/>
<text x="545" y="40" text-anchor="middle" font-size="12" font-weight="700" style="fill: var(--dg-2)">Hop 1: protocol</text>
</svg>` },
      { type: `keypoints`, items: [
        `<strong>Hop 1, server to client:</strong> which protocol carries updates to the device. Polling, long polling, Server-Sent Events, WebSockets or WebRTC.`,
        `<strong>Hop 2, inside the backend:</strong> the event is produced by one service, but the user's connection lives on one particular gateway among hundreds. How does the event find it?`,
      ] },
    ],
  },
  {
    id: `client-protocols`,
    title: `Hop 1: pick the simplest protocol that meets the latency target`,
    kicker: `Client-server protocols`,
    blocks: [
      { type: `text`, html: `<p>The protocols form a ladder. Each step up buys lower latency or two-way traffic and costs more server state. The mechanics are covered in <a href="../../core-concepts/ch4/">Core Concepts, chapter 4</a> (and the underlying TCP and HTTP in <a href="../../core-concepts/ch1/">chapter 1</a>); here is what you need to choose.</p>` },
      { type: `table`, headers: [`Protocol`, `How it works`, `Strength`, `Cost`], rows: [
        [`Simple polling`, `Client asks on a timer`, `Stateless, cacheable, trivial to scale`, `Delay up to one interval; mostly empty responses`],
        [`Long polling`, `Server holds the request until there is news`, `Near real-time over plain HTTP`, `A new request per event; held requests`],
        [`Server-Sent Events`, `One HTTP response that streams events`, `One-way push with built-in reconnect and resume`, `One open connection per client; server to client only`],
        [`WebSockets`, `HTTP upgrade to a full-duplex socket`, `Frequent messages both ways`, `Stateful, sticky servers; you build resume and heartbeats`],
        [`WebRTC`, `Peer-to-peer via signaling, STUN and TURN`, `Audio, video, lowest-latency peer data`, `Complex setup; rarely needed for app updates`],
      ] },
      { type: `steps`, title: `A decision rule you can say out loud`, items: [
        `If a few seconds of delay is acceptable, <strong>poll</strong>. It has no persistent connections and nothing new to operate.`,
        `If updates must arrive in under a second but flow only from server to client, use <strong>SSE</strong>.`,
        `If the client also sends often over the same channel (typing, moves, edits), use <strong>WebSockets</strong>.`,
        `If the requirement is a call, video or peer-to-peer data, use <strong>WebRTC</strong>, with your servers only for signaling and relay.`,
      ] },
      { type: `lab`, id: `rtPollingCost`, caption: `Move the client count, update rate and poll interval. Watch when polling becomes mostly wasted requests, and notice that SSE and WebSockets cost the same on the server: the difference is only whether the client needs to talk back.` },
    ],
  },
  {
    id: `server-side`,
    title: `Hop 2: getting the event to the server that holds the connection`,
    kicker: `Server-side push and pull`,
    blocks: [
      { type: `text`, html: `<p>Once connections are long-lived, each client is pinned to one gateway. Typically a dedicated <strong>connection tier</strong> holds the sockets, and stateless services (chat, trips, bidding) do the business logic. When the chat service saves a message for Bob, it does not know which of 200 gateways Bob is on. There are three standard answers.</p>` },
      { type: `compare`, items: [
        { title: `Pull: poll a store`, tone: `info`, html: `<p>The writer saves the update in a database or cache keyed by user or topic. Clients poll it, or each gateway polls on behalf of its clients. No routing problem exists, and the store is also the history for catch-up. Latency is the polling interval. Great when seconds are fine.</p>` },
        { title: `Push: consistent hashing`, tone: `ok`, html: `<p>Hash the user (or room) ID onto a ring of gateways. Clients connect to their owner, and producers compute the same hash and send directly: one hop, no broker. Scaling moves about 1/N of users. Everyone must agree on ring membership, usually via ZooKeeper or etcd. Fits very high rates and gateways that keep per-room state in memory.</p>` },
        { title: `Push: pub/sub`, tone: `ok`, html: `<p>Clients connect to any gateway. Each gateway subscribes to a channel per connected user or room on a broker (Redis Pub/Sub, Kafka, NATS). Producers publish to the channel and never track placement. Servers come and go freely. Every event pays a broker hop, and the broker must be highly available. This is the usual default.</p>` },
      ] },
      { type: `callout`, tone: `warning`, title: `Fire and forget`, html: `<p>Redis Pub/Sub delivers only to subscribers connected at that moment. If a gateway is restarting, the message is gone. That is fine because the database, not the broker, holds every message. Clients that reconnect catch up from storage. Use a durable stream (Redis Streams, Kafka) when the broker itself must be replayable.</p>` },
    ],
  },
  {
    id: `in-the-interview`,
    title: `When to reach for it, and when not to`,
    kicker: `In an interview`,
    blocks: [
      { type: `text`, html: `<p>Real-time updates come up in chat and messaging, ride sharing and delivery tracking, live comments, auctions and bidding, sports scores, collaborative editors, dashboards and multiplayer games. The signal is a requirement like "users see new messages instantly" or "the rider watches the driver approach".</p>` },
      { type: `compare`, items: [
        { title: `Use push when`, tone: `ok`, html: `<ul><li>The user is looking at the screen and expects to see the change within a second or so.</li><li>Changes are frequent enough that polling would either lag or flood the servers.</li><li>The client also sends often (chat, games, editors), so a two-way channel pays for itself.</li></ul>` },
        { title: `Skip it when`, tone: `bad`, html: `<ul><li>A few seconds of delay is fine: poll, ideally against a cache or CDN.</li><li>Updates are rare: refresh when the screen opens.</li><li>The user is not in the app: send a mobile push notification (APNs, FCM) instead of holding a connection.</li></ul>` },
      ] },
      { type: `callout`, tone: `interview`, title: `What to say`, html: `<p>"Message delivery should feel instant and clients send as well as receive, so clients hold a WebSocket to a gateway tier. Gateways subscribe in Redis Pub/Sub to a channel per conversation; the chat service persists each message with a per-conversation sequence number, then publishes it. On reconnect, clients send their last sequence number and fetch the gap from the database." Then offer the deep dives below before the interviewer asks.</p>` },
      { type: `callout`, tone: `mistake`, html: `<p>Choosing WebSockets in the first minute and never explaining hop 2. A protocol alone does not deliver a message to a user whose socket is on another machine.</p>` },
    ],
  },
  {
    id: `common-deep-dives`,
    title: `The three follow-ups interviewers ask`,
    kicker: `Common deep dives`,
    blocks: [
      { type: `text`, html: `<p><strong>1. Connection failures and reconnection.</strong> Mobile connections drop constantly, and servers get deployed or crash. Detect dead connections with heartbeats (WebSocket ping/pong, or SSE comment lines). Reconnect with exponential backoff and <strong>jitter</strong> so thousands of clients don't return in the same instant. Give every message a per-channel sequence number; on reconnect the client sends the last one it saw and the server replays the gap from a buffer or the database. Above all, persist before you push: the socket is a fast path, the store is the truth.</p>` },
      { type: `text`, html: `<p><strong>2. One update, millions of recipients.</strong> A celebrity posts or a stream has a huge live audience. One broker message per follower means millions of messages per post. Instead publish once to the author's channel; every gateway with at least one interested client receives one copy and writes it to its local sockets in parallel. Offline followers pull it later from a cached feed. Coalesce high-churn values such as like counts and viewer numbers, sending a summary every second rather than every change.</p>` },
      { type: `lab`, id: `rtCelebrity`, caption: `Raise followers to 10 million or 100 million and compare per-follower fan-out with one message per gateway. Then lower the fleet size and see how per-server write time takes over.` },
      { type: `text`, html: `<p><strong>3. Ordering across distributed servers.</strong> Two people send messages to one chat through different gateways. Global order is expensive and rarely needed; per-conversation order is what users notice. Route every write for a conversation through one owner, such as a Kafka partition keyed by conversation ID or a single sequencer, which assigns increasing sequence numbers before the message is stored. Clients sort by number, wait briefly or fetch when they see a gap, and drop duplicates. Never order by client timestamps; device clocks drift.</p>` },
      { type: `keypoints`, title: `Remember`, items: [
        `Two hops: protocol to the device, and routing inside the backend.`,
        `Poll if seconds are fine; SSE for one-way push; WebSockets only for frequent two-way traffic.`,
        `Pub/sub is the default router; consistent hashing removes the broker at the cost of ring coordination.`,
        `Persist, sequence, and replay on reconnect; jitter every retry.`,
      ] },
    ],
  },
];
