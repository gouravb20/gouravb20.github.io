// Deep dive: Real-time Updates. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP["realtime-updates"] = {
  hook: `<p>Picking WebSockets takes one sentence. Running them is the hard part: a tier of servers holding millions of open sockets, events that must find the one server holding a given user, clients that vanish and come back expecting to have missed nothing, and accounts whose single post must reach millions of screens. This deep dive covers what happens behind the protocol choice: the connection tier, routing, reconnection, fan-out, ordering and backpressure.</p>`,
  sections: [
    {
      id: "connection-tier",
      title: "The connection tier: servers that hold sockets",
      kicker: "Architecture",
      blocks: [
        {
          type: "text",
          html: `<p>Once you choose SSE or WebSockets, each client is attached to one specific server for as long as its connection lives, which can be hours. That breaks the stateless model the rest of your services enjoy, so most designs split the work. A <strong>gateway</strong> (or connection) tier terminates connections, authenticates them, keeps track of who is connected, and forwards messages. Business services stay stateless and never hold a socket.</p>`,
        },
        {
          type: "diagram",
          title: "A typical real-time backend",
          caption: "Clients connect through a Layer 4 load balancer to gateways. Services persist an event first, then publish it to the broker; each gateway receives events for the channels its clients subscribe to and writes them to their sockets.",
          svg: `<svg viewBox="0 0 620 260" role="img" aria-label="Clients, load balancer, gateways, broker, services and database">
<defs><marker id="pt1-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g style="fill: var(--dg-3-soft); stroke: var(--dg-3)">
<rect x="14" y="40" width="70" height="30" rx="6"/><rect x="14" y="115" width="70" height="30" rx="6"/><rect x="14" y="190" width="70" height="30" rx="6"/>
</g>
<g font-size="12" text-anchor="middle"><text x="49" y="60">client</text><text x="49" y="135">client</text><text x="49" y="210">client</text></g>
<rect x="112" y="40" width="74" height="180" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="149" y="124" text-anchor="middle" font-size="12" font-weight="700">L4 LB</text>
<text x="149" y="142" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">least conns</text>
<g style="fill: var(--dg-2-soft); stroke: var(--dg-2)">
<rect x="216" y="40" width="104" height="44" rx="8"/><rect x="216" y="108" width="104" height="44" rx="8"/><rect x="216" y="176" width="104" height="44" rx="8"/>
</g>
<g font-size="12" text-anchor="middle" font-weight="700"><text x="268" y="67">gateway 1</text><text x="268" y="135">gateway 2</text><text x="268" y="203">gateway 3</text></g>
<rect x="352" y="90" width="100" height="80" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<text x="402" y="125" text-anchor="middle" font-size="12" font-weight="700">broker</text>
<text x="402" y="143" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">pub/sub</text>
<rect x="490" y="40" width="116" height="60" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="548" y="66" text-anchor="middle" font-size="12" font-weight="700">services</text>
<text x="548" y="84" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">stateless</text>
<rect x="490" y="160" width="116" height="60" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)"/>
<text x="548" y="186" text-anchor="middle" font-size="12" font-weight="700">database</text>
<text x="548" y="204" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">source of truth</text>
<g stroke-width="2" style="stroke: var(--dg-muted)">
<line x1="84" y1="55" x2="110" y2="55"/><line x1="84" y1="130" x2="110" y2="130"/><line x1="84" y1="205" x2="110" y2="205"/>
<line x1="186" y1="62" x2="214" y2="62"/><line x1="186" y1="130" x2="214" y2="130"/><line x1="186" y1="198" x2="214" y2="198"/>
</g>
<line x1="350" y1="110" x2="322" y2="70" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt1-flow)"/>
<line x1="350" y1="130" x2="322" y2="130" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt1-flow)"/>
<line x1="350" y1="150" x2="322" y2="190" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt1-flow)"/>
<line x1="490" y1="80" x2="454" y2="108" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt1-flow)"/>
<line x1="548" y1="100" x2="548" y2="158" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#pt1-flow)"/>
<text x="556" y="134" font-size="12" style="fill: var(--dg-muted)">1. persist</text>
<text x="448" y="80" font-size="12" style="fill: var(--dg-muted)">2. publish</text>
<text x="216" y="248" font-size="12" style="fill: var(--dg-muted)">3. each gateway writes to its own sockets</text>
</svg>`,
        },
        {
          type: "keypoints",
          title: "What the tier has to get right",
          items: [
            "<strong>Load balancing:</strong> use least-connections, often at Layer 4. Round robin spreads new connections evenly, but connections last hours, so a newly added gateway stays nearly empty while old ones keep what they accumulated.",
            "<strong>Idle timeouts:</strong> load balancers and proxies close idle connections. Send heartbeats more often than the shortest idle timeout on the path.",
            "<strong>Heartbeats:</strong> WebSocket has ping and pong control frames; SSE can send a comment line (one starting with a colon) that the browser ignores. Missed heartbeats are how both sides learn that a connection silently died.",
            "<strong>Capacity:</strong> gateways scale on open connections and memory per connection, not requests per second. Keep per-connection state small.",
            "<strong>Deploys:</strong> drain gradually. Stop routing new connections to a gateway, ask its clients to reconnect over several minutes, then stop it. Restarting a whole tier at once is a self-inflicted reconnection storm.",
            "<strong>Browser limits:</strong> over HTTP/1.1 browsers allow only about six connections per host, and each SSE stream uses one; HTTP/2 multiplexes many streams over one connection, which removes the problem.",
          ],
        },
        {
          type: "quiz",
          q: "Your team adds four new gateways to a fleet of eight during peak hours. An hour later the new gateways hold almost no connections and the old ones are near their limits. What is the most likely cause?",
          options: [
            "The new gateways have a smaller memory limit",
            "The load balancer uses round robin, and existing long-lived connections never move",
            "Consistent hashing sends all users to the old gateways",
            "Clients cache DNS records forever",
          ],
          answer: 1,
          explain: "Round robin only balances new connections. Existing ones stay where they are for hours, so the old gateways keep their load and new arrivals are split evenly over all twelve. Least-connections balancing sends new connections to the emptiest servers, and a gradual rebalance (asking some clients on busy servers to reconnect) evens things out faster.",
        },
      ],
    },
    {
      id: "routing-events",
      title: "Routing: pub/sub, consistent hashing or a registry",
      kicker: "Hop 2 in depth",
      blocks: [
        {
          type: "text",
          html: `<p>A service produces an event for user Bob. Bob's socket is on one gateway among many. The backend needs a way to deliver it there. The three common approaches differ in who knows where Bob is.</p>`,
        },
        {
          type: "table",
          headers: ["Approach", "Who knows where Bob is", "Hops per event", "When the fleet changes", "Main risk"],
          rows: [
            ["Pub/sub", "Nobody; Bob's gateway subscribes to his channel", "Producer, broker, gateway", "Only the dead gateway's users reconnect", "Broker load and availability"],
            ["Consistent hashing", "Everyone, by hashing Bob's ID", "Producer, gateway", "About 1/N of users move to a new owner", "Disagreement about ring membership"],
            ["Connection registry", "A shared map, e.g. Redis: bob → gateway 17", "Lookup, then producer to gateway", "Entries update as users reconnect", "Stale entries after crashes (use TTLs)"],
          ],
        },
        {
          type: "lab",
          id: "rtRouting",
          caption: "Compare hash mod N, consistent hashing and pub/sub when you add a gateway or one dies. Lower the virtual nodes to see consistent hashing become lumpy; switch to hash mod N to see why nobody routes connections that way.",
        },
        {
          type: "compare",
          items: [
            { title: "Redis Pub/Sub", tone: "info", html: "<p>Very fast, in-memory, and simple: a channel per user or room. Delivery is fire-and-forget: a subscriber that is disconnected when a message is published never sees it. Fine when the database holds every message and clients catch up from it.</p>" },
            { title: "Durable streams (Kafka, Redis Streams)", tone: "ok", html: "<p>Messages are kept and consumers track their position, so a restarted gateway or reconnecting client can replay. Kafka partitions also give per-key ordering. Costs more to run, and per-user topics do not scale; partition by channel ID and filter on the gateway instead.</p>" },
          ],
        },
        {
          type: "text",
          html: `<p>Consistent hashing shines when a gateway must keep <strong>state per channel</strong> in memory: the live editing session of a document, the state of a game room. Then everyone in that room must be on the same server, and hashing the room ID guarantees it. The ring itself is covered in <a href="../../core-concepts/ch16/">Core Concepts, chapter 16</a>. During a membership change, some users are briefly on the wrong server; the usual fix is for the old owner to forward or reject, and for clients to reconnect to the new owner.</p>`,
        },
        {
          type: "quiz",
          q: "A collaborative whiteboard keeps each board's live state in memory on a gateway, and all editors of a board must see each other's strokes within 50 ms. Which routing fits best?",
          options: [
            "Pub/sub with clients connected to any gateway",
            "Consistent hashing on the board ID, so every editor of a board connects to the same gateway",
            "Clients poll a database every second",
            "A round-robin load balancer with no routing",
          ],
          answer: 1,
          explain: "When state for a channel lives in one server's memory, every participant has to reach that server. Hashing the board ID puts all editors of a board on its owner, which applies strokes and broadcasts them with no broker hop. Pub/sub would spread editors over many gateways, and none of them would own the board's state.",
        },
      ],
    },
    {
      id: "reconnect-and-resume",
      title: "Connection failures, reconnection storms and catching up",
      kicker: "Deep dive 1",
      blocks: [
        {
          type: "problem",
          html: `<p>A gateway holding 50,000 connections crashes. Every one of those clients notices within seconds and immediately tries to reconnect. The surviving gateways must perform 50,000 TLS handshakes, authentications and subscriptions at once, on top of their normal load. If clients retry instantly on failure, rejected attempts come straight back, and the flood can overload the healthy gateways as well.</p>`,
        },
        {
          type: "steps",
          title: "A safe recovery path",
          items: [
            "<strong>Detect:</strong> a closed socket or missed heartbeats tell the client the connection is dead. The dead gateway's registry entries or subscriptions expire through TTLs.",
            "<strong>Back off with jitter:</strong> wait a random time between zero and a ceiling that doubles after each failure (full jitter), capped at around 30 s.",
            "<strong>Reconnect anywhere:</strong> the load balancer picks a healthy gateway; the client authenticates and re-subscribes.",
            "<strong>Resume:</strong> the client sends the last sequence number it processed for each channel. The server replays newer events from a buffer or durable stream.",
            "<strong>Resync if the gap is too old:</strong> beyond the replay window, the server tells the client to refetch current state from the API.",
          ],
        },
        {
          type: "lab",
          id: "rtReconnect",
          caption: "Kill a gateway and compare retry policies. Watch immediate and fixed-interval retries arrive in synchronized waves, and full jitter spread them into a smooth stream near capacity. Shrink the replay buffer to see how many clients fall back to a full resync.",
        },
        {
          type: "code",
          lang: "json",
          title: "A WebSocket resume handshake (an application protocol, not part of the WebSocket standard)",
          code: `// client to server, right after connecting
{ "type": "resume", "token": "eyJ...", "channels": { "chat:42": 1810, "chat:97": 55 } }

// server to client: replayed events, then live ones
{ "type": "message", "channel": "chat:42", "seq": 1811, "body": "see you at 6" }
{ "type": "message", "channel": "chat:42", "seq": 1812, "body": "running late" }

// server to client: gap older than the replay window
{ "type": "resync", "channel": "chat:97" }`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>SSE builds this in:</strong> each event can carry an <code>id</code>, the browser's <code>EventSource</code> reconnects on its own, sends the last ID in the <code>Last-Event-ID</code> header, and honours a <code>retry</code> field that sets the reconnect delay.",
            "<strong>Persist before you push.</strong> If a message only ever exists in a gateway's memory, a crash loses it. Store it with its sequence number, then publish.",
            "<strong>Acknowledge on the client side too</strong> when delivery matters (chat): the client confirms the sequence numbers it has shown, and anything unconfirmed is redelivered or sent as a push notification.",
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Reconnect loops without jitter in the client SDK. They work in testing and fail the first time a gateway dies in production, because every client shares the same schedule. The fix has to ship in the client, so it is worth getting right before launch.</p>`,
        },
        {
          type: "quiz",
          q: "Clients use exponential backoff (1, 2, 4, 8 s) without jitter. After a gateway crash, what does the load on the surviving gateways look like?",
          options: [
            "A smooth stream of reconnects near capacity",
            "Synchronized waves: everyone who failed together retries at the same instant, so each wave is mostly rejected again",
            "No load, because backoff prevents retries",
            "A single spike at time zero and nothing afterwards",
          ],
          answer: 1,
          explain: "Backoff reduces how often each client retries, but clients that failed at the same moment compute the same delays and come back together. Each wave still exceeds capacity, and the gaps between waves leave the servers idle. Randomizing the delay (jitter) breaks the synchronization.",
        },
      ],
    },
    {
      id: "fan-out",
      title: "Fan-out: one update, millions of recipients",
      kicker: "Deep dive 2",
      blocks: [
        {
          type: "text",
          html: `<p>Most channels are small: a one-to-one chat, a group of twenty, the rider and driver of one trip. A few are enormous: a creator with tens of millions of followers, a live event with a million viewers, a company-wide announcement channel. A design that sends one message per recipient through the broker works for the first kind and collapses for the second.</p>`,
        },
        {
          type: "diagram",
          title: "Per-recipient fan-out versus per-server fan-out",
          caption: "Left: the producer sends one broker message for each online follower. Right: it publishes once to the author's channel, each gateway with interested clients receives one copy, and gateways fan out locally to their own sockets.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="Per-recipient fan-out compared with per-server fan-out">
<defs><marker id="pt1-fan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<text x="150" y="20" text-anchor="middle" font-size="13" font-weight="700">Per recipient</text>
<text x="470" y="20" text-anchor="middle" font-size="13" font-weight="700">Per server</text>
<line x1="310" y1="30" x2="310" y2="220" stroke-width="1" style="stroke: var(--dg-line)"/>
<rect x="100" y="34" width="100" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="150" y="54" text-anchor="middle" font-size="12">post</text>
<rect x="100" y="104" width="100" height="30" rx="6" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="150" y="124" text-anchor="middle" font-size="12">broker</text>
<g stroke-width="1.5" style="stroke: var(--dg-bad)">
<line x1="130" y1="64" x2="130" y2="102"/><line x1="140" y1="64" x2="140" y2="102"/><line x1="150" y1="64" x2="150" y2="102"/><line x1="160" y1="64" x2="160" y2="102"/><line x1="170" y1="64" x2="170" y2="102"/>
</g>
<text x="210" y="88" font-size="12" style="fill: var(--dg-bad)">N messages</text>
<g style="fill: var(--dg-3-soft); stroke: var(--dg-3)">
<circle cx="40" cy="190" r="10"/><circle cx="75" cy="190" r="10"/><circle cx="110" cy="190" r="10"/><circle cx="145" cy="190" r="10"/><circle cx="180" cy="190" r="10"/><circle cx="215" cy="190" r="10"/><circle cx="250" cy="190" r="10"/>
</g>
<g stroke-width="1.5" style="stroke: var(--dg-muted)">
<line x1="120" y1="134" x2="44" y2="178"/><line x1="130" y1="134" x2="78" y2="178"/><line x1="140" y1="134" x2="111" y2="178"/><line x1="150" y1="134" x2="145" y2="178"/><line x1="160" y1="134" x2="179" y2="178"/><line x1="170" y1="134" x2="212" y2="178"/><line x1="180" y1="134" x2="246" y2="178"/>
</g>
<rect x="420" y="34" width="100" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="470" y="54" text-anchor="middle" font-size="12">post</text>
<rect x="420" y="84" width="100" height="30" rx="6" style="fill: var(--dg-ok-soft); stroke: var(--dg-ok)"/>
<text x="470" y="104" text-anchor="middle" font-size="12">broker</text>
<line x1="470" y1="64" x2="470" y2="82" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#pt1-fan)"/>
<text x="480" y="78" font-size="12" style="fill: var(--dg-ok)">1 message</text>
<g style="fill: var(--dg-2-soft); stroke: var(--dg-2)">
<rect x="350" y="138" width="70" height="26" rx="6"/><rect x="435" y="138" width="70" height="26" rx="6"/><rect x="520" y="138" width="70" height="26" rx="6"/>
</g>
<g font-size="12" text-anchor="middle"><text x="385" y="156">gw 1</text><text x="470" y="156">gw 2</text><text x="555" y="156">gw 3</text></g>
<g stroke-width="2" style="stroke: var(--dg-ok)">
<line x1="450" y1="114" x2="392" y2="136"/><line x1="470" y1="114" x2="470" y2="136"/><line x1="490" y1="114" x2="548" y2="136"/>
</g>
<g style="fill: var(--dg-3-soft); stroke: var(--dg-3)">
<circle cx="360" cy="200" r="10"/><circle cx="395" cy="200" r="10"/><circle cx="452" cy="200" r="10"/><circle cx="488" cy="200" r="10"/><circle cx="540" cy="200" r="10"/><circle cx="575" cy="200" r="10"/>
</g>
<g stroke-width="1.5" style="stroke: var(--dg-muted)">
<line x1="378" y1="164" x2="362" y2="188"/><line x1="392" y1="164" x2="394" y2="188"/><line x1="462" y1="164" x2="454" y2="188"/><line x1="478" y1="164" x2="486" y2="188"/><line x1="548" y1="164" x2="542" y2="188"/><line x1="562" y1="164" x2="573" y2="188"/>
</g>
</svg>`,
        },
        {
          type: "keypoints",
          title: "Techniques",
          items: [
            "<strong>Publish per channel, not per recipient.</strong> Gateways subscribe to the author's or event's channel once, no matter how many of their clients follow it, and write to local sockets in parallel.",
            "<strong>Push to the online, pull for the offline.</strong> Most followers are not connected. They read the post from a cached feed when they open the app, so there is nothing to deliver to them now.",
            "<strong>Hybrid feeds.</strong> Precompute timelines (fan-out on write) for normal accounts, and merge posts from very large accounts at read time (fan-out on read), so one post never triggers millions of timeline writes.",
            "<strong>Coalesce and sample.</strong> Viewer counts, like counts and reaction bursts change constantly. Send an aggregate once a second, or a sample of comments, rather than every event.",
            "<strong>Shard hot channels.</strong> If one channel's traffic exceeds one broker node, split it into sub-channels (e.g. by viewer hash) that gateways subscribe to independently.",
          ],
        },
        {
          type: "tradeoffs",
          title: "Pushing to a huge audience",
          prosLabel: "Per-server fan-out gains",
          consLabel: "It costs",
          pros: [
            "Broker traffic grows with the number of gateways, not the number of followers.",
            "Gateways write to their sockets in parallel, so delivery time is roughly followers per gateway, not total followers.",
            "No per-follower state on the producer.",
          ],
          cons: [
            "Gateways must track which channels their clients care about and subscribe or unsubscribe as clients come and go.",
            "Very popular channels still hit every gateway; hot channels may need their own sharding.",
            "Per-recipient filtering (blocked users, privacy rules) has to happen on the gateway.",
          ],
        },
        {
          type: "quiz",
          q: "A live stream has 2 million viewers, each seeing a count of current viewers. The count changes hundreds of times a second. What should the system send to each viewer?",
          options: [
            "Every join and leave event, so the count is exact",
            "An updated total about once a second, published once to the stream's channel and fanned out by each gateway",
            "Nothing; viewers should poll the database every 100 ms",
            "One broker message per viewer per change",
          ],
          answer: 1,
          explain: "Nobody can read a number that changes hundreds of times a second. Aggregating to one update per second and fanning it out per gateway cuts traffic by orders of magnitude while looking identical to the viewer. Sending every event per viewer would be hundreds of millions of messages per second.",
        },
      ],
    },
    {
      id: "ordering",
      title: "Ordering messages across distributed servers",
      kicker: "Deep dive 3",
      blocks: [
        {
          type: "text",
          html: `<p>Alice and Bob reply to a group chat at almost the same moment, through different gateways. Each gateway forwards to the chat service, which might be several instances; each publishes through the broker; each recipient's gateway writes to sockets. Without care, two recipients can see the two replies in different orders, which makes the conversation unreadable. The fix is not global order, which needs coordination across the whole system, but <strong>order per channel</strong>.</p>`,
        },
        {
          type: "steps",
          title: "Per-channel ordering",
          items: [
            "<strong>One owner per channel.</strong> Route every write for chat 42 to a single place: a Kafka partition keyed by chat ID, or the one service instance (chosen by consistent hashing) that owns chat 42.",
            "<strong>Assign a sequence number there.</strong> The owner gives each message the next number for that chat and stores it. That number, not arrival time, defines the order.",
            "<strong>Deliver with the number.</strong> Gateways pass the number through to clients.",
            "<strong>Clients render by number.</strong> If message 1812 arrives before 1811, hold it briefly; if 1811 does not show up, fetch the gap. If a number arrives twice, drop the duplicate.",
          ],
        },
        {
          type: "compare",
          items: [
            { title: "Order by client timestamp", tone: "bad", html: "<p>Device clocks drift and can be set arbitrarily, so a message can appear before the one it answers. It also cannot detect gaps or duplicates.</p>" },
            { title: "Order by server arrival", tone: "warn", html: "<p>Works with a single server. With several, each sees a different arrival order, and network paths reorder messages on the way out.</p>" },
            { title: "Per-channel sequence from one owner", tone: "ok", html: "<p>One authority per channel defines the order. Different channels are handled by different owners in parallel, so it scales out, and the numbers double as resume points after reconnect.</p>" },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>The same sequence number solves three problems at once: ordering (sort by it), loss (a gap means something is missing), and duplicates (a repeated number is dropped). It is also the cursor a client sends when it reconnects. When you introduce it in an interview, point out all four uses.</p>`,
        },
        {
          type: "quiz",
          q: "A chat app writes messages to a Kafka topic partitioned by sender user ID. Users complain that replies sometimes appear before the messages they answer. What is the fix?",
          options: [
            "Add more partitions",
            "Partition by conversation ID, so every message in one chat goes through one partition and gets its order there",
            "Sort messages by the sender's device clock",
            "Use WebSockets instead of SSE",
          ],
          answer: 1,
          explain: "Kafka orders messages only within a partition. Partitioning by sender puts Alice's and Bob's messages to the same chat on different partitions, consumed independently, so their relative order is lost. Keying by conversation ID gives each chat a single ordered stream.",
        },
      ],
    },
    {
      id: "backpressure",
      title: "Slow consumers, backpressure and offline users",
      kicker: "Operating it",
      blocks: [
        {
          type: "text",
          html: `<p>A gateway can produce events faster than a phone on a weak network can read them. Each socket has a send buffer; if the gateway keeps appending, a few slow clients can consume all of its memory and hurt every other user on that server. Decide in advance what happens when a client falls behind.</p>`,
        },
        {
          type: "table",
          headers: ["Kind of update", "Policy when the client falls behind", "Example"],
          rows: [
            ["Latest value wins", "Drop superseded updates; keep only the newest per key", "Driver location, stock price, cursor position"],
            ["Aggregate", "Merge pending updates into one", "Like count, viewer count, unread badge"],
            ["Must not be lost", "Cap the buffer, then disconnect; the client resumes from its last sequence number", "Chat messages, order status changes"],
          ],
        },
        {
          type: "keypoints",
          items: [
            "<strong>Offline users</strong> are not a real-time problem. When a recipient has no live connection, hand the event to a notification service that sends a mobile push (APNs for iOS, FCM for Android), and let the app fetch details when opened.",
            "<strong>Presence</strong> (who is online) is derived from connections and heartbeats with a TTL, and it is itself a fan-out problem: broadcast presence only to people who are looking, and coalesce changes.",
            "<strong>Metrics to watch:</strong> open connections per gateway, connect rate, send-buffer sizes, publish-to-delivery latency and the number of resyncs after reconnect.",
          ],
        },
      ],
    },
    {
      id: "real-systems",
      title: "Real systems",
      kicker: "In production",
      blocks: [
        {
          type: "realworld",
          items: [
            { org: "Slack", title: "WebSockets for messaging", html: "Slack clients receive messages and events over WebSocket connections; its older Real Time Messaging API exposed this to developers as a WebSocket stream of events." },
            { org: "Discord", title: "A WebSocket gateway", html: "Discord's Gateway is a WebSocket API: clients and bots connect, send heartbeats on an interval the server specifies, and can resume a dropped session so missed events are replayed." },
            { org: "LLM APIs", title: "Server-Sent Events for streaming", html: "The Anthropic and OpenAI APIs stream generated tokens as Server-Sent Events: a one-way flow from server to client over a plain HTTP response, exactly the case SSE fits." },
            { org: "Figma", title: "Multiplayer editing", html: "Figma's multiplayer editing keeps clients connected over WebSockets to a server that holds each open document, so all editors of a file meet on the same process: per-channel ownership in practice." },
          ],
        },
      ],
    },
    {
      id: "interview-angle",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>When a requirement says "instantly" or "live", a strong answer moves through these points without being pushed:</p>
<ol>
<li><strong>Check the need:</strong> how fresh, and is the user looking? Poll if seconds are fine; push notifications for offline users.</li>
<li><strong>Hop 1:</strong> SSE for one-way push, WebSockets for frequent two-way traffic, with a one-line reason.</li>
<li><strong>Hop 2:</strong> a gateway tier, and pub/sub (or consistent hashing, with why) to reach the right gateway.</li>
<li><strong>Durability:</strong> persist first, sequence per channel, publish second.</li>
<li><strong>Failure:</strong> heartbeats, reconnect with backoff and jitter, resume from the last sequence number.</li>
<li><strong>Scale:</strong> per-channel fan-out for huge audiences, coalescing for noisy counters, backpressure for slow clients.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks for a sports app where fans see the score of a match within a few seconds. There are 5 million concurrent fans and scores change a few times per match. What is the simplest design that works?",
          options: [
            "WebSockets with a connection registry in Redis",
            "WebRTC between fans",
            "Clients poll a score endpoint every few seconds, served from a CDN or cache with a short TTL",
            "Long polling against the primary database",
          ],
          answer: 2,
          explain: "A few seconds of delay is acceptable, the data is identical for every fan of a match, and it changes rarely. A cached endpoint with a TTL of a couple of seconds absorbs millions of polls without touching the database and needs no persistent connections. SSE becomes worth it only if the latency target drops below what polling can give.",
        },
      ],
    },
  ],
  takeaways: [
    "Real-time delivery has two hops: the protocol to the device, and routing inside the backend to the gateway that holds the connection.",
    "Climb the protocol ladder only as far as needed: polling for seconds of delay, SSE for one-way push, WebSockets for frequent two-way traffic, WebRTC for media.",
    "Pub/sub is the default router; consistent hashing removes the broker and suits per-channel in-memory state; a registry maps users to gateways directly.",
    "Persist before you push, number messages per channel, and resume from the last number after a reconnect; fall back to a full resync beyond the replay window.",
    "Reconnect with exponential backoff and full jitter, balance by least connections, and drain gateways gradually.",
    "For huge audiences, publish once per channel and fan out on each gateway; pull for offline users; coalesce noisy counters.",
    "Order per channel through a single owner, never by client clocks, and cap per-socket buffers so slow clients can't take a server down.",
  ],
  furtherReading: [
    { title: "Server-sent events (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events", note: "EventSource, the event stream format, event IDs and reconnection." },
    { title: "RFC 6455: The WebSocket Protocol", url: "https://datatracker.ietf.org/doc/html/rfc6455", note: "The opening handshake, framing, and ping/pong control frames." },
    { title: "Redis Pub/Sub documentation", note: "Channel semantics, pattern subscriptions and at-most-once delivery." },
    { title: "Exponential Backoff and Jitter (AWS Architecture Blog)", note: "Compares backoff strategies and shows why full jitter spreads retries best." },
    { title: "Core Concepts, chapter 4: Real-time push", note: "The protocol mechanics this chapter builds on, in the core concepts notes." },
  ],
};
