// System design core concepts - interactive notes data.
// Original study notes. Topic outline follows Hello Interview's "Core Concepts" series:
// https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials
window.DATA = {
  book: {
    title: `System Design Core Concepts`,
    subtitle: `The core concepts that come up in almost every system design interview, read as one book: <strong>networking</strong>, <strong>API design</strong>, <strong>data modeling</strong>, <strong>database indexing</strong>, <strong>caching</strong>, <strong>sharding</strong>, <strong>consistent hashing</strong>, the <strong>CAP theorem</strong> and the <strong>numbers to know</strong>. Every chapter has concepts, labs, a cheatsheet and interview Q&amp;A. Topics follow Hello Interview's <a href="https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials" target="_blank" rel="noopener" style="color:var(--accent)">Core Concepts</a> series; the notes and labs are written independently.`,
    storageKey: `core_concepts_notes_v1`,
    appId: `core-concepts-notes`,
    exportPrefix: `core-concepts-progress`,
    pillarsTitle: `Four instincts for every design`,
    takeawaysTitle: `Twenty things to remember`,
    labsIntro: `Each lab is a small model of one idea. The numbers come from simple, stated assumptions rather than real measurements, so read them as shapes and ratios, not benchmarks. Labs reset when you leave the tab.`
  },
  parts: {
    1: `Part I &middot; Networking Essentials`,
    2: `Part II &middot; API Design`,
    3: `Part III &middot; Data Modeling`,
    4: `Part IV &middot; Database Indexing`,
    5: `Part V &middot; Caching`,
    6: `Part VI &middot; Sharding`,
    7: `Part VII &middot; Consistent Hashing`,
    8: `Part VIII &middot; CAP Theorem`,
    9: `Part IX &middot; Numbers to Know`
  },
  fourQuestions: [
    { cls: `what`, q: `Default to the boring choice`, text: `TCP and HTTP, REST APIs, PostgreSQL, B-tree indexes, Redis with cache-aside, hash-based sharding. Interviewers assume these unless you say otherwise. Reach for something else only when a stated requirement needs it, and name the requirement.`, answer: `Ch 2-3, 7, 9-10, 12, 14: the defaults and when to leave them.` },
    { cls: `where`, q: `Do the math before you scale`, text: `Estimate requests per second, storage and bandwidth, then compare them with what one modern machine can do. A single database or cache goes much further than most candidates think; add caches, replicas and shards when a number forces you to.`, answer: `Ch 18 (numbers), Ch 12 (when to cache), Ch 14 (when to shard).` },
    { cls: `when`, q: `Design around access patterns`, text: `Every structural choice should serve the queries you must answer: the schema, which columns are indexed, the shard key, the cache keys and the API resources. Say the query out loud, then the structure that makes it cheap.`, answer: `Ch 7, 9-11, 14-16: resources, schemas, indexes, shard keys.` },
    { cls: `how`, q: `Pick consistency per feature, and expect failure`, text: `Decide where every read must see the latest write (bookings, payments) and where stale data is fine (profiles, feeds). Then plan for failure: timeouts, retries with backoff and jitter, idempotency keys, replicas and circuit breakers.`, answer: `Ch 6, 8, 13, 15, 17: failure handling, idempotency, consistency.` }
  ],
  takeaways: [
    `Think in three layers: <strong>IP</strong> moves packets between addresses, <strong>TCP/UDP/QUIC</strong> connect processes end to end, and <strong>HTTP, WebSockets, gRPC, WebRTC</strong> carry application messages.`,
    `A fresh HTTPS request costs several round trips before the first byte: DNS, the TCP handshake and the TLS handshake. <strong>Keep-alive</strong> and <strong>HTTP/2 multiplexing</strong> pay that cost once.`,
    `<strong>TCP</strong> is the default. Use <strong>UDP</strong> only when late data is worthless (voice, video, games), and remember browsers can't open raw UDP sockets.`,
    `Push options in increasing power and cost: polling, long polling, <strong>SSE</strong> (server to client), <strong>WebSockets</strong> (full duplex), <strong>WebRTC</strong> (peer to peer). <strong>Least connections</strong> balancing suits the long-lived ones.`,
    `Light in fiber covers roughly 200 km per millisecond. Fix distance with <strong>CDNs</strong> and regional deployments; fix failure with timeouts, <strong>backoff with jitter</strong> and <strong>circuit breakers</strong>.`,
    `<strong>REST</strong> by default: plural-noun resources, HTTP verbs, path parameters for required identifiers, query parameters for optional filters, the body for payload. <strong>GraphQL</strong> for varied clients, <strong>gRPC</strong> between internal services.`,
    `GET, PUT and DELETE are idempotent; POST and PATCH are not. Put an <strong>idempotency key</strong> on POSTs that create bookings, orders or payments.`,
    `Paginate every collection (<strong>cursor</strong> pagination for live data), keep the API stateless, secure every endpoint by default (JWT for users, API keys for services) and rate limit with 429.`,
    `Start with a <strong>relational database</strong>. Document, key-value, wide-column and graph stores each need a requirement that justifies them.`,
    `Model schemas from <strong>access patterns</strong>, volume and consistency needs. Normalize the source of truth; denormalize (or cache) only for a measured read problem.`,
    `An index trades write cost and space for read speed. <strong>B-trees</strong> are the default (equality and ranges); <strong>LSM trees</strong> suit write-heavy workloads; hash indexes do equality only.`,
    `<strong>Composite indexes</strong> follow the leftmost-prefix rule: put equality columns first, the range or sort column last. <strong>Covering</strong> indexes skip the table lookup entirely.`,
    `Geospatial queries use <strong>geohashes</strong>, quadtrees or R-trees; full-text search uses an <strong>inverted index</strong> (term to documents).`,
    `Cache when a number says the database is too slow or too loaded. Default to <strong>Redis with cache-aside</strong>, LRU eviction plus a TTL, and invalidate on write.`,
    `Every cache brings failure modes: <strong>stampedes</strong> (use request coalescing), <strong>stale data</strong> (invalidate or short TTLs), <strong>hot keys</strong> (replicate or cache in process) and the cache itself going down.`,
    `Shard only when storage or write throughput exceeds one machine. Pick a <strong>high-cardinality, evenly distributed shard key that matches the main query</strong>; hash-based distribution is the default.`,
    `Sharding costs you hot spots, scatter-gather queries and cross-shard transactions. Keep each request on one shard; use <strong>sagas</strong>, not two-phase commit, when you can't.`,
    `<strong>Consistent hashing</strong> moves only about 1/N of keys when a node joins or leaves; <strong>virtual nodes</strong> even out the load. Replication, not hashing, handles hot keys and failures.`,
    `<strong>CAP</strong>: partitions will happen, so the real choice is consistency or availability during one. Choose per feature: consistent for bookings and payments, available for profiles and feeds.`,
    `Know modern numbers: servers with hundreds of GB to TBs of RAM, Redis at ~100K+ ops/s with sub-ms latency, Postgres handling TBs and thousands to tens of thousands of writes per second, ~1 ms within a region and 50-150 ms across regions.`
  ],
  chapters: [
    // ------------------------------------------------------------------
    {
      id: `ch1`, part: 1, number: 1,
      source: { title: `Hello Interview: Networking Essentials`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials` },
      title: `Networking 101: layers and the life of a request`,
      overview: `Networks are built in layers so that each layer can ignore the details below it. For system design you mostly need three: the <strong>network layer</strong> (IP), the <strong>transport layer</strong> (TCP, UDP, QUIC) and the <strong>application layer</strong> (HTTP, DNS, WebSockets, gRPC, WebRTC). Following a single web request through DNS, the TCP handshake, TLS, the HTTP exchange and teardown shows where latency comes from and why connections are state that both ends must keep.`,
      concepts: [
        { term: `Layered networking (OSI / TCP-IP)`, def: `Communication is split into layers, each offering a simpler service to the one above: physical signals, links, IP routing, end-to-end transport, then application protocols. An application only talks to the layer directly beneath it.`, why: `Layers let you reason about a design at the right level: "this needs ordered delivery" is a transport question, "route by URL" is an application question.`, ex: `Opening a file in your language doesn't make you drive the disk head; sending an HTTP request doesn't make you encode voltages on a wire.` },
        { term: `Network layer (Layer 3): IP`, def: `IP gives every host an address and forwards <strong>packets</strong> hop by hop toward a destination address. Delivery is best effort: packets can be lost, duplicated or reordered, and IP does nothing about it.`, why: `Everything above IP has to cope with an unreliable packet service, which is exactly why TCP exists.` },
        { term: `Transport layer (Layer 4)`, def: `TCP, UDP and QUIC add <strong>ports</strong> so traffic reaches the right process, and optionally add reliability, ordering, flow control and congestion control on top of IP.`, why: `The TCP vs UDP choice is the one transport decision you may need to defend in an interview.`, demo: `tcpVsUdp` },
        { term: `Application layer (Layer 7)`, def: `Protocols that carry application meaning: DNS, HTTP, WebSockets, gRPC, WebRTC. They run in user space inside your process, while IP and TCP mostly run in the operating system kernel.`, why: `User-space protocols are easy to change and inspect but cost more CPU; kernel-level layers are fast but hard to change. L7 load balancers pay this cost to read requests.` },
        { term: `IP addresses: public, private, DHCP`, def: `Hosts usually get addresses from a DHCP server when they boot. <strong>Private</strong> ranges (10.x, 172.16-31.x, 192.168.x) are only meaningful inside one network. <strong>Public</strong> addresses are allocated through regional internet registries and are routable across the internet.`, why: `Internet routers know where public address blocks live. That is why a public service needs public addresses (or a load balancer or NAT that has them).` },
        { term: `DNS resolution`, def: `The Domain Name System turns a name like <code>api.example.com</code> into IP addresses through a hierarchy of resolvers and authoritative servers. Answers carry a <strong>TTL</strong> and are cached along the way.`, why: `DNS is the first step of almost every request and a cheap, coarse load-balancing and failover tool. Its caching means changes propagate no faster than the TTL.`, demo: `webRequest` },
        { term: `TCP three-way handshake`, def: `Before data flows, the client sends <strong>SYN</strong>, the server replies <strong>SYN-ACK</strong>, and the client answers <strong>ACK</strong>. Both sides now hold connection state (sequence numbers, buffers). The client can send its request right after the ACK.`, why: `The handshake costs one full round trip before the first request byte, which matters a lot on long-distance or mobile links.`, demo: `webRequest` },
        { term: `TLS handshake`, def: `HTTPS adds a TLS handshake on top of TCP to agree on keys and verify the server's certificate: about one round trip with TLS 1.3, two with TLS 1.2. Session resumption can cut this further.`, why: `A cold HTTPS request can need three or four round trips before the response starts, which is a big reason to reuse connections.`, demo: `webRequest` },
        { term: `Connection teardown`, def: `TCP closes each direction separately: one side sends <strong>FIN</strong>, the other ACKs, then sends its own FIN, which is ACKed. Teardown happens after the response, so it usually isn't on the user's critical path.`, why: `Short-lived connections still burn server resources on setup and teardown; at high request rates this adds up.` },
        { term: `Round-trip time (RTT)`, def: `The time for a message to reach the other side and a reply to come back. It is set by distance, routing and queueing. Most protocol costs are counted in RTTs.`, why: `"How many round trips does this take?" is the quickest way to estimate the latency of a design.` },
        { term: `Server processing time`, def: `The time the server spends doing the work: parsing, querying, rendering. It is usually the only part application engineers control directly.`, why: `On a fast nearby network, processing dominates. Far away or on mobile, round trips dominate, and optimizing code won't help much.` },
        { term: `Connections are state`, def: `An open TCP connection is memory and bookkeeping on both client and server. Unless you use keep-alive or HTTP/2, every request repeats the setup.`, why: `Designs with many persistent connections (chat, live updates) must budget for that state and plan how to move it when servers restart.` },
        { term: `Keep-alive and multiplexing`, def: `<strong>HTTP keep-alive</strong> reuses one TCP connection for many sequential requests. <strong>HTTP/2</strong> multiplexes many concurrent requests over one connection, and <strong>HTTP/3</strong> does the same over QUIC.`, why: `They remove repeated handshakes and are the cheapest latency win for chatty clients.`, demo: `webRequest` },
        { term: `"What happens when you type a URL?"`, def: `The classic walk-through: DNS lookup, TCP handshake, TLS handshake, HTTP request, server work, response, rendering, connection reuse or teardown.`, why: `Less common as an interview question today, but it is the mental model behind most latency discussions.` }
      ],
      cheatsheet: [
        { title: `The three layers that matter`, type: `table`, headers: [`Layer`, `Protocols`, `Unit`, `What it gives you`], rows: [
          [`Network (L3)`, `IP (v4/v6)`, `Packet`, `Addressing and hop-by-hop routing, best effort`],
          [`Transport (L4)`, `TCP, UDP, QUIC`, `Segment / datagram`, `Ports; optionally reliability, ordering, flow and congestion control`],
          [`Application (L7)`, `HTTP, DNS, WebSockets, gRPC, WebRTC`, `Message`, `Application semantics: requests, responses, events`]
        ] },
        { title: `Round trips for one cold HTTPS request`, type: `table`, headers: [`Step`, `Round trips`, `Avoid it by`], rows: [
          [`DNS lookup`, `~1 (to the resolver)`, `Caching (TTL), prefetching`],
          [`TCP handshake`, `1`, `Keep-alive, connection pools`],
          [`TLS handshake`, `1 (TLS 1.3) or 2 (TLS 1.2)`, `TLS 1.3, session resumption, connection reuse`],
          [`HTTP request and response`, `1 + server time`, `Fewer, larger requests; caching; CDNs`],
          [`Teardown (FIN/ACK)`, `Off the critical path`, `Reuse instead of closing`]
        ], note: `QUIC (HTTP/3) merges the transport and TLS handshakes into one round trip and can resume with zero.` },
        { title: `Things worth saying in an interview`, type: `list`, items: [
          `Clients reach services by name through DNS; DNS can also spread load and fail over between regions.`,
          `Assume TCP and HTTPS unless a requirement says otherwise.`,
          `Reuse connections (keep-alive, HTTP/2, pools) between services and to databases.`,
          `Persistent connections are server-side state; plan for how they are balanced and drained.`
        ] }
      ],
      interview: [
        { q: `Walk through what happens when a browser loads https://example.com.`, a: `The browser resolves the name through DNS (possibly from cache), opens a TCP connection with a three-way handshake, runs a TLS handshake to agree on keys and check the certificate, then sends an HTTP GET. The server processes it and returns a response, the browser parses it and fetches further resources, usually over the same connection (keep-alive or HTTP/2). Eventually the connection is closed with FIN/ACK exchanges.`, diff: `easy` },
        { q: `Why does latency to a far-away server hurt more than its raw distance suggests?`, a: `Because a cold request pays several round trips before the first response byte: DNS, the TCP handshake, one or two for TLS, then the request itself. Each costs a full RTT, so a 100 ms RTT can mean 400 ms or more before anything useful arrives. Connection reuse, TLS 1.3, QUIC and edge servers all reduce the number of round trips or their length.`, diff: `medium` },
        { q: `What does the transport layer add on top of IP?`, a: `Ports to identify processes, and (for TCP) connection setup, reliable delivery with acknowledgements and retransmission, in-order delivery, flow control so a fast sender doesn't overwhelm a slow receiver, and congestion control so senders back off when the network is overloaded. UDP adds only ports and a checksum.`, diff: `easy` },
        { q: `Why is it useful that HTTP runs in user space and TCP in the kernel?`, a: `User-space protocols can be changed, deployed and inspected per application, so HTTP evolves quickly and L7 proxies can read and route requests. Kernel protocols are shared and highly optimized but slow to change. It also explains costs: parsing at L7 takes more CPU per request than forwarding at L4.`, diff: `medium` },
        { q: `How would you reduce connection overhead between two internal services handling 50k requests per second?`, a: `Avoid a new TCP (and TLS) connection per request. Use connection pools with keep-alive, or a multiplexed protocol such as HTTP/2 or gRPC so many requests share a few long-lived connections. Size the pools, and make sure load is still spread when connections are long-lived, for example with client-side balancing or periodic connection recycling.`, diff: `medium` },
        { q: `What is the difference between a public and a private IP address, and why does it matter for a design?`, a: `Private ranges are only meaningful inside one network and aren't routed on the internet; public addresses are globally allocated and routable. Backend servers usually sit on private addresses behind a load balancer, gateway or NAT that owns the public address, which also limits their exposure.`, diff: `easy` },
        { q: `DNS changes "take a while to propagate". Why, and what does that mean for failover?`, a: `Resolvers cache answers for the record's TTL, so clients keep using the old address until the cached entry expires (and some clients cache longer than they should). DNS failover therefore takes at least one TTL. Use short TTLs for records you may need to change quickly, and put faster failover (load balancers, health checks) behind the DNS name.`, diff: `medium` }
      ],
      labs: [`webRequest`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch2`, part: 1, number: 2,
      source: { title: `Hello Interview: Networking Essentials`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials` },
      title: `Transport: TCP, UDP and QUIC`,
      overview: `The transport layer turns IP's loose packets into something applications can use. <strong>TCP</strong> gives a reliable, ordered byte stream with flow and congestion control, at the cost of a handshake, acknowledgements and head-of-line blocking. <strong>UDP</strong> just sends datagrams: no setup, no guarantees, very low overhead. <strong>QUIC</strong> rebuilds TCP-like reliability on UDP with built-in encryption and independent streams. In interviews TCP is the assumed default; the skill is recognising when UDP is genuinely better and handling the consequences.`,
      concepts: [
        { term: `UDP`, def: `A connectionless protocol that sends independent <strong>datagrams</strong>. The receiver learns the source and destination address and port, plus the payload. There is no handshake, no acknowledgement, no retransmission and no ordering.`, why: `Lowest latency and overhead. The application decides what to do about loss, which is ideal when a late packet is useless anyway.`, demo: `tcpVsUdp` },
        { term: `TCP`, def: `A connection-oriented protocol that delivers a reliable, ordered <strong>byte stream</strong>. Bytes are numbered, the receiver acknowledges them, and the sender retransmits anything not acknowledged in time.`, why: `It is what almost everything runs on: HTTP/1.1, HTTP/2, database protocols, gRPC. Choosing it rarely needs justification.`, demo: `tcpVsUdp` },
        { term: `Ordering within a connection`, def: `Two messages sent on the same TCP connection arrive in the order they were sent. There is no ordering between different connections.`, why: `If you need ordering per user or per conversation, keep that traffic on one connection or add sequence numbers.` },
        { term: `Acknowledgements and retransmission`, def: `The receiver ACKs data it has received. If an ACK doesn't arrive within the retransmission timeout, the sender resends.`, why: `Reliability costs time: a lost packet adds at least one extra round trip before the data reaches the application.` },
        { term: `Head-of-line blocking`, def: `Because TCP delivers bytes in order, one lost packet holds back everything behind it until the retransmission arrives, even data that already reached the machine.`, why: `This is why live audio and video stutter badly over TCP on lossy links, and why HTTP/2 over TCP suffers on bad networks. QUIC avoids it across streams.`, demo: `tcpVsUdp` },
        { term: `Flow control`, def: `The receiver advertises how much buffer space it has (the receive window), and the sender never sends more than that unacknowledged.`, why: `Stops a fast producer from overwhelming a slow consumer at the connection level.` },
        { term: `Congestion control`, def: `TCP probes for available bandwidth (slow start), then backs off when it detects loss or rising delay, so many flows can share a network without collapsing it.`, why: `New connections start slowly, which is another reason to reuse warm connections for bulk transfers.` },
        { term: `QUIC and HTTP/3`, def: `QUIC runs over UDP but provides reliable, encrypted, multiplexed streams. It combines transport and TLS setup into one round trip, avoids head-of-line blocking between streams and survives network changes (Wi-Fi to cellular) with connection IDs.`, why: `Think of it as a modernized TCP for the web. It is widely deployed by large sites, but most interview designs don't need to mention it.` },
        { term: `Header overhead`, def: `A UDP header is 8 bytes. A TCP header is 20 bytes without options and up to 60 with them, plus ACK traffic flowing back.`, why: `For tiny, frequent messages (sensor readings, game ticks) the overhead ratio is noticeable; for normal API calls it isn't.` },
        { term: `When UDP fits`, def: `Real-time media (voice, video), multiplayer games, high-volume telemetry or metrics where occasional loss is fine, and DNS queries.`, why: `In all of these, retransmitting stale data would be worse than skipping it.` },
        { term: `Browsers and UDP`, def: `Web pages can't open raw UDP sockets. The practical browser routes are WebRTC (UDP-based media and data channels) and HTTP/3 or WebTransport over QUIC.`, why: `If you propose UDP, say what web clients get instead, for example a batched HTTP feed for browsers and UDP for native apps.` },
        { term: `Mixing protocols`, def: `Real systems often use both: TCP and HTTP for login, signalling and control, UDP for the latency-sensitive data path.`, why: `A video call app is the textbook example, and saying so shows you know the trade-off isn't all or nothing.` }
      ],
      cheatsheet: [
        { title: `TCP vs UDP`, type: `table`, headers: [`Property`, `TCP`, `UDP`], rows: [
          [`Setup`, `Three-way handshake`, `None`],
          [`Delivery`, `Reliable (ACK + retransmit)`, `Best effort, silent loss`],
          [`Ordering`, `In order within a connection`, `None`],
          [`Flow / congestion control`, `Yes / yes`, `No / no (app must be careful)`],
          [`Header`, `20-60 bytes`, `8 bytes`],
          [`Loss behaviour`, `Stalls until retransmission (head-of-line blocking)`, `Gaps, no stall`],
          [`Typical uses`, `HTTP, gRPC, databases, almost everything`, `Voice, video, games, telemetry, DNS`]
        ] },
        { title: `Pick UDP only if...`, type: `list`, items: [
          `Latency matters more than completeness (a late packet is worthless).`,
          `The application can tolerate or conceal loss (drop a frame, interpolate a position).`,
          `Volume is high and individual messages are cheap (metrics, logs, sensor data).`,
          `Browser clients are not needed, or have another path (WebRTC, batched HTTP).`
        ], note: `Otherwise default to TCP and don't spend interview time on it.` },
        { title: `QUIC in one breath`, type: `list`, items: [
          `Runs over UDP, implemented in user space, encrypted by default.`,
          `1-RTT setup (0-RTT on resumption) instead of TCP + TLS handshakes.`,
          `Independent streams: a lost packet only stalls its own stream.`,
          `Connection IDs let a session survive a change of IP address.`
        ] }
      ],
      interview: [
        { q: `When would you choose UDP over TCP? Give a concrete example.`, a: `When freshness beats completeness and the app can handle loss. In a voice call, a packet that arrives 300 ms late is useless; it's better to drop it and conceal the gap than to stall the audio waiting for a retransmission. Games sending position updates and metrics pipelines that can lose a few samples are similar. I'd still use TCP/HTTP for signalling, auth and anything that must arrive.`, diff: `easy` },
        { q: `What is head-of-line blocking and how does it show up?`, a: `TCP delivers bytes in order, so if one packet is lost, data behind it waits in the receive buffer until the retransmission arrives. The app sees a stall of roughly one RTT or more. With HTTP/2 over TCP, one loss stalls every multiplexed stream on that connection. QUIC fixes this across streams by making ordering per stream.`, diff: `medium` },
        { q: `A live reactions feature (hearts flying across a video) sends millions of tiny events. TCP or UDP?`, a: `Individual reactions are low value and latency-sensitive, so UDP is defensible for native clients: losing a few hearts is invisible. But browsers can't use raw UDP, so web clients would get a batched, aggregated feed over HTTP (SSE or polling) that the UI spreads out over time. Many teams would simply aggregate server-side and push counts over an existing connection.`, diff: `medium` },
        { q: `How do flow control and congestion control differ?`, a: `Flow control protects the receiver: the sender never exceeds the receiver's advertised window. Congestion control protects the network: the sender adjusts its rate based on loss or delay signals so shared links don't collapse. Both limit how much unacknowledged data is in flight, for different reasons.`, diff: `medium` },
        { q: `What does QUIC change compared with TCP + TLS?`, a: `It runs over UDP in user space, combines transport and crypto handshakes into one round trip (zero on resumption), multiplexes independent streams so loss on one doesn't block others, encrypts most of the header, and identifies connections by ID so they survive IP changes. HTTP/3 is HTTP over QUIC.`, diff: `hard` },
        { q: `Does UDP mean "unreliable" for the whole application?`, a: `No. UDP is unreliable at the transport level; the application can add exactly the reliability it needs. Games resend important events but not stale positions, media codecs use forward error correction, and QUIC builds full reliability on UDP. The point is control over the trade-off.`, diff: `medium` },
        { q: `Why do new TCP connections transfer large files slowly at first?`, a: `Congestion control starts with a small congestion window and grows it as ACKs come back (slow start). A brand-new connection needs several round trips to reach full speed, so warm, reused connections or parallel connections finish bulk transfers sooner.`, diff: `hard` }
      ],
      labs: [`tcpVsUdp`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch3`, part: 1, number: 3,
      source: { title: `Hello Interview: Networking Essentials`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials` },
      title: `HTTP and API styles: REST, GraphQL, gRPC`,
      overview: `HTTP is the request/response protocol most systems speak: a method, a path, headers and an optional body in; a status code, headers and a body out. It is <strong>stateless</strong>, which makes servers easy to scale. On top of it sit three API styles. <strong>REST</strong> models resources and is the safe default. <strong>GraphQL</strong> lets clients ask for exactly the data a screen needs, fixing under- and over-fetching. <strong>gRPC</strong> uses HTTP/2 and Protocol Buffers for compact, typed, fast service-to-service calls.`,
      concepts: [
        { term: `HTTP request and response`, def: `A request has a <strong>method</strong>, a <strong>path</strong>, <strong>headers</strong> and an optional <strong>body</strong>. A response has a <strong>status code</strong>, headers and a body. Plain text over a TCP connection (HTTP/1.1) or binary frames (HTTP/2, HTTP/3).`, why: `Almost every service boundary in a design is an HTTP call; knowing its parts lets you specify APIs precisely.` },
        { term: `Statelessness`, def: `Each request carries everything the server needs; the server keeps no memory of earlier requests. Session data lives in tokens, cookies or a shared store.`, why: `Stateless servers can be added, removed and load balanced freely. Keep the stateful parts of a design as small as possible.` },
        { term: `Methods and idempotency`, def: `GET reads, POST creates or triggers, PUT replaces, PATCH partially updates, DELETE removes. GET, PUT and DELETE should be <strong>idempotent</strong> (repeating them has the same effect as doing them once); POST generally is not.`, why: `Idempotent operations can be retried safely after a timeout, which matters for reliability.` },
        { term: `Status codes`, def: `2xx success (200 OK, 201 Created), 3xx redirection (301 permanent, 302 temporary), 4xx client errors (400 bad request, 401 not authenticated, 403 not allowed, 404 not found, 429 rate limited), 5xx server errors (500 internal error, 502 bad gateway, 503 unavailable).`, why: `Clients and proxies act on these: retry 503 with backoff, don't retry 400, slow down on 429.` },
        { term: `Headers and content negotiation`, def: `Headers are open-ended key/value metadata: auth, caching, content type, tracing. With <code>Accept-Encoding</code> a client lists encodings it supports (gzip, br) and the server answers with <code>Content-Encoding</code> naming the one it chose.`, why: `Extensible metadata lets a protocol evolve without breaking old clients, which is a good lesson for your own API design.` },
        { term: `HTTPS (TLS)`, def: `HTTP inside a TLS session: traffic is encrypted and the server proves its identity with a certificate, protecting against eavesdropping and tampering in transit.`, why: `Any public endpoint uses HTTPS. Encryption in transit says nothing about whether the request content is honest, though.` },
        { term: `Never trust the request body`, def: `A client can send anything. Identity must come from authenticated credentials (a verified token or session), not from a <code>userId</code> field in the body or query string.`, why: `Reading the user ID from the body is a classic security hole: change the ID, read someone else's data. Validate every field server-side.` },
        { term: `REST: resources and verbs`, def: `Model the domain as <strong>resources</strong> (nouns) addressed by paths, and use HTTP methods for operations. Example: <code>GET /orders/{id}</code>, <code>POST /orders</code>, <code>PATCH /orders/{id}</code>, <code>GET /customers/{id}/orders</code>.`, why: `REST is widely understood and maps cleanly onto the core entities of a design. It is the default for interviews.`, demo: `apiFetch` },
        { term: `Operations vs resources`, def: `Names like <code>cancelOrder</code> or <code>startMatch</code> are actions. In REST you express them as state changes on a resource, e.g. <code>PATCH /orders/{id}</code> with <code>{"status": "cancelled"}</code>, or as a sub-resource such as <code>POST /orders/{id}/cancellation</code>.`, why: `Thinking in resources keeps an API consistent and cacheable instead of a grab bag of verbs.` },
        { term: `Under-fetching and over-fetching`, def: `<strong>Under-fetching</strong>: a screen needs many calls (a list, then details for each item), costing round trips. <strong>Over-fetching</strong>: one big endpoint returns far more fields than the screen uses, costing bytes and server time.`, why: `These are the problems GraphQL was designed to solve, and the reason "backend for frontend" endpoints exist.`, demo: `apiFetch` },
        { term: `GraphQL`, def: `A query language where the client describes the exact shape of data it wants (fields and nested relations) in one request, and the server resolves each field.`, why: `Great for complex, fast-changing clients and many teams sharing data. The cost moves to the server: resolvers can cause N+1 queries and expensive queries need limits.`, demo: `apiFetch` },
        { term: `GraphQL in interviews`, def: `Interview requirements are fixed and the interviewer usually wants to see you optimize specific access patterns, which GraphQL can obscure.`, why: `Mention it when the prompt stresses flexible or rapidly changing client requirements; otherwise REST is simpler to reason about.` },
        { term: `gRPC and Protocol Buffers`, def: `gRPC defines services and messages in a schema (<code>.proto</code>), generates client and server code, and sends compact binary Protocol Buffers over HTTP/2. Fields are identified by small numbers instead of names.`, why: `Smaller payloads and cheaper parsing than JSON, strong typing, streaming, deadlines and client-side load balancing built in.`, demo: `protobufSize` },
        { term: `REST outside, gRPC inside`, def: `A common split: public clients you don't control use REST/JSON (easy to call, browser-friendly), while internal services talk gRPC.`, why: `You get efficiency where traffic is heaviest without forcing binary tooling on external developers. Using REST everywhere is also fine to start.` },
        { term: `Avoid premature protocol optimization`, def: `Serialization is rarely the first bottleneck. Databases, fan-out and network distance usually matter far more.`, why: `Interviewers care more about how you find and fix real bottlenecks than about squeezing bytes out of every call.` }
      ],
      cheatsheet: [
        { title: `Status codes worth knowing`, type: `table`, headers: [`Code`, `Meaning`, `Client should`], rows: [
          [`200 / 201 / 204`, `OK / created / no content`, `Proceed`],
          [`301 / 302 / 304`, `Moved permanently / temporarily / not modified`, `Follow redirect; use cached copy for 304`],
          [`400`, `Malformed or invalid request`, `Fix the request; don't retry as is`],
          [`401 / 403`, `Not authenticated / not authorized`, `Re-authenticate / give up`],
          [`404`, `Not found`, `Don't retry`],
          [`409`, `Conflict (e.g. version mismatch, duplicate)`, `Re-read and resolve`],
          [`429`, `Too many requests`, `Back off (respect Retry-After)`],
          [`500 / 502 / 503 / 504`, `Server error / bad gateway / unavailable / gateway timeout`, `Retry with backoff if the operation is idempotent`]
        ] },
        { title: `REST vs GraphQL vs gRPC`, type: `table`, headers: [``, `REST`, `GraphQL`, `gRPC`], rows: [
          [`Shape`, `Resources + HTTP verbs`, `One endpoint, client-defined queries`, `Typed RPC methods`],
          [`Encoding`, `Usually JSON`, `JSON`, `Protocol Buffers (binary)`],
          [`Transport`, `HTTP/1.1 or 2`, `HTTP`, `HTTP/2`],
          [`Strengths`, `Simple, cacheable, universal`, `No under/over-fetching, flexible clients`, `Fast, compact, typed, streaming`],
          [`Weaknesses`, `Chatty or bloated responses`, `Server complexity, N+1, harder caching`, `Not browser-native, binary tooling`],
          [`Use for`, `Public APIs, the default`, `Complex, fast-moving frontends`, `Internal service-to-service`]
        ] },
        { title: `API design reminders`, type: `list`, items: [
          `Name resources with plural nouns and nest for ownership: <code>/users/{id}/posts</code>.`,
          `Use the right verb and make retried writes safe (PUT, or POST with an idempotency key).`,
          `Paginate list endpoints (cursor-based for feeds).`,
          `Derive the caller's identity from auth, never from the body.`,
          `Version public APIs and add fields without removing old ones.`
        ] }
      ],
      interview: [
        { q: `Design the REST endpoints for a simple ride-hailing app's trips.`, a: `<code>POST /trips</code> to request a ride (pickup, destination; rider comes from the auth token), <code>GET /trips/{id}</code> for status, <code>PATCH /trips/{id}</code> to change state (cancel, or driver accepts), <code>GET /riders/me/trips?cursor=...</code> for history. Drivers might use <code>POST /trips/{id}/acceptance</code>. Use an idempotency key on trip creation so a retried request doesn't book two rides.`, diff: `easy` },
        { q: `What's wrong with POST /getUserData { "userId": 42 }?`, a: `It is an RPC-style verb in the path, uses POST for a read (not cacheable, not idempotent by convention), and takes the user ID from the body. If that ID is trusted, any caller can read anyone's data by changing it. Better: <code>GET /users/me</code> or <code>GET /users/42</code> with the server checking that the authenticated caller may see user 42.`, diff: `easy` },
        { q: `When would you pick GraphQL over REST?`, a: `When many client screens need different slices of overlapping data and change often, especially mobile apps where round trips and payload size hurt. GraphQL lets each screen fetch exactly what it needs in one call. I'd be wary when access patterns are fixed and need heavy optimization, when HTTP caching matters a lot, or when the team can't invest in resolver batching and query cost limits.`, diff: `medium` },
        { q: `Why is gRPC faster than JSON over HTTP?`, a: `Protocol Buffers encode fields as small numeric tags with compact variable-length integers instead of repeating field names as text, so messages are smaller and cheaper to parse. gRPC also runs over HTTP/2, multiplexing many calls over long-lived connections, and generated stubs avoid hand-written serialization. The gain matters most when calls are frequent and network or CPU bound.`, diff: `medium` },
        { q: `Why not use gRPC for a public API?`, a: `Browsers can't speak native gRPC (you need gRPC-Web and a proxy), third-party developers expect plain HTTP and JSON they can test with curl, binary payloads are harder to debug, and schema distribution adds friction. A common pattern is REST at the edge and gRPC internally.`, diff: `easy` },
        { q: `Which HTTP methods are idempotent, and why does it matter?`, a: `GET, HEAD, PUT, DELETE (and OPTIONS) are idempotent by definition; POST and PATCH are not guaranteed to be. It matters for retries: after a timeout you can't tell whether the server applied the request, so you can only blindly retry operations whose repetition is harmless, or add an idempotency key to make others safe.`, diff: `medium` },
        { q: `A mobile home screen makes 25 API calls on launch. How would you fix it?`, a: `Measure first, then reduce round trips: add an aggregated endpoint for that screen (backend for frontend), use GraphQL, or batch calls. Also run independent calls in parallel over HTTP/2, cache static parts on the device or a CDN, and trim responses to the fields the screen uses so the aggregate doesn't become an over-fetching problem.`, diff: `medium` },
        { q: `What does content negotiation teach about designing extensible APIs?`, a: `The client says what it can handle (<code>Accept</code>, <code>Accept-Encoding</code>) and the server picks the best mutually supported option, falling back gracefully. Old clients keep working, new capabilities can be added without breaking anyone. The same idea applies to API versioning, optional fields and feature flags in headers.`, diff: `hard` }
      ],
      labs: [`apiFetch`, `protobufSize`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch4`, part: 1, number: 4,
      source: { title: `Hello Interview: Networking Essentials`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials` },
      title: `Real-time push: polling, SSE, WebSockets, WebRTC`,
      overview: `Request/response can't tell a client that something changed. The options, from simplest to most powerful: <strong>polling</strong> on a timer, <strong>long polling</strong> (the server holds the request until there is news), <strong>Server-Sent Events</strong> (one long HTTP response streaming many events), <strong>WebSockets</strong> (a persistent full-duplex channel) and <strong>WebRTC</strong> (direct peer-to-peer media and data over UDP). Each step up buys lower latency or two-way traffic at the cost of more persistent state and more demanding infrastructure.`,
      concepts: [
        { term: `Polling`, def: `The client asks "anything new?" on a fixed interval. Simple, works through every proxy, but most responses are empty and updates arrive up to one interval late.`, why: `Perfectly good when updates are infrequent or a few seconds of delay is fine. Don't dismiss it in interviews.`, demo: `realtimeCompare` },
        { term: `Long polling`, def: `The client sends a request and the server holds it open until an event arrives or a timeout passes, then the client immediately asks again.`, why: `Near real-time with plain HTTP and no special infrastructure, at the cost of a held request per client and a new request after every event.`, demo: `realtimeCompare` },
        { term: `Server-Sent Events (SSE)`, def: `A standard for streaming many messages from server to client inside one HTTP response. Each event is a small text chunk (<code>data: ...</code>) the browser's <code>EventSource</code> hands to the page as it arrives.`, why: `One-way push over plain HTTP: ideal for notifications, live scores, prices and progress updates. Client-to-server traffic uses ordinary requests.`, demo: `realtimeCompare` },
        { term: `SSE reconnection`, def: `Proxies and load balancers cut long-lived responses, so <code>EventSource</code> reconnects automatically and sends the ID of the last event it saw (<code>Last-Event-ID</code>). The server should replay anything missed.`, why: `You need a short buffer or log of recent events per stream. Some misbehaving proxies also buffer the whole stream, defeating the point.` },
        { term: `WebSockets`, def: `A persistent, full-duplex, message-oriented channel. It starts as an HTTP request with an <code>Upgrade</code> header; after that both sides can send frames at any time over the same TCP connection.`, why: `The browser-friendly answer for high-frequency two-way traffic: chat, multiplayer games, collaborative editing, trading screens.`, demo: `realtimeCompare` },
        { term: `WebSocket costs`, def: `Every client holds an open connection on some server. Load balancers, proxies and firewalls on the path must support upgrades and long-lived connections; deploys must drain connections; servers must track which user is connected where.`, why: `Proposing WebSockets without a need for frequent two-way messages is a red flag in interviews. Justify them.` },
        { term: `Defining a WebSocket protocol`, def: `WebSockets only carry frames; you design the messages. A common choice is JSON objects with a <code>type</code> field, e.g. <code>{"type": "message.send", "chatId": ..., "text": ...}</code> and <code>{"type": "message.new", ...}</code>.`, why: `Writing these message types down is the WebSocket equivalent of listing REST endpoints in your design.` },
        { term: `WebRTC`, def: `A set of browser protocols for direct peer-to-peer audio, video and data, mostly over UDP. Peers find each other through a <strong>signaling server</strong>, then connect directly when they can.`, why: `The standard answer for video and voice calls. Rarely the right answer for anything else in an interview.` },
        { term: `NAT and inbound connections`, def: `Most devices sit behind NAT routers and firewalls that block unsolicited inbound connections, so two peers usually can't simply connect to each other's address.`, why: `This is what makes peer-to-peer hard and why WebRTC needs helper servers.` },
        { term: `STUN`, def: `A peer asks a STUN server "what public address and port do you see me on?" and shares the answer with the other peer through signaling. Combined with hole punching, this often lets peers connect directly.`, why: `Cheap: STUN servers only answer small queries and never carry media.` },
        { term: `TURN`, def: `When a direct path can't be established, both peers send their traffic through a TURN relay server.`, why: `The fallback that makes calls work everywhere, but it carries all the media, so it costs real bandwidth.` },
        { term: `Signaling server`, def: `The central service peers use to discover each other and exchange connection details (session descriptions and network candidates) before the direct connection exists.`, why: `Even "serverless" peer-to-peer apps need servers for discovery, relay and usually persistence.` },
        { term: `Collaborative editing options`, def: `Most collaborative editors use a central server over WebSockets, which also stores the document. Peer-to-peer with WebRTC plus CRDTs is possible but complex.`, why: `In interviews, keep WebRTC for audio and video and use WebSockets plus a server for collaboration.` }
      ],
      cheatsheet: [
        { title: `Choosing a real-time technique`, type: `table`, headers: [`Technique`, `Direction`, `Latency`, `Server cost`, `Good for`], rows: [
          [`Polling`, `Client pulls`, `Up to one interval`, `Many mostly-empty requests`, `Infrequent updates, dashboards`],
          [`Long polling`, `Server responds when ready`, `Low`, `A held request per client, re-request per event`, `Simple near real-time without new infra`],
          [`SSE`, `Server to client`, `Low`, `An open HTTP response per client`, `Notifications, feeds, prices, progress`],
          [`WebSockets`, `Both ways`, `Lowest`, `An open stateful connection per client; LB/proxy support`, `Chat, games, collaboration`],
          [`WebRTC`, `Peer to peer`, `Lowest (UDP)`, `Signaling + STUN, TURN relays for some peers`, `Audio and video calls`]
        ] },
        { title: `WebRTC connection steps`, type: `list`, items: [
          `Both clients connect to a signaling server to find each other.`,
          `Each asks a STUN server for its public address and port.`,
          `They exchange these candidates through the signaling server.`,
          `They try direct connections; if all fail, they relay through TURN.`
        ] },
        { title: `Real-time design checklist`, type: `list`, items: [
          `Do you need two-way traffic, or is server-to-client push enough (SSE)?`,
          `How many concurrent connections, and how will you balance them (L4, least connections)?`,
          `How do clients catch up after a reconnect (event IDs, replay buffer)?`,
          `How does a server know which machine a user is connected to (pub/sub, connection registry)?`,
          `What happens to connections during a deploy (draining, client backoff)?`
        ] }
      ],
      interview: [
        { q: `Live auction: bidders must see the current price immediately. What would you use?`, a: `SSE is a good fit: updates flow one way, from server to bidders, and placing a bid is a normal POST. Each bidder keeps an <code>EventSource</code> open on the auction's stream; servers subscribe to price changes (for example via pub/sub) and push them. Reconnects use Last-Event-ID to replay missed updates. WebSockets would also work but add complexity without a need for client-to-server streaming.`, diff: `medium` },
        { q: `Why are WebSockets harder to operate than plain HTTP?`, a: `They are long-lived and stateful. Every proxy and load balancer on the path must support the upgrade and long idle connections; balancing must be connection-aware (least connections, L4); deploys must drain connections without a reconnect storm; and servers need a way to route a message to whichever machine holds the recipient's connection.`, diff: `medium` },
        { q: `Polling vs long polling vs SSE for a notification badge that updates a few times a day?`, a: `Plain polling every 30-60 seconds, or just refreshing when the user opens the app, is probably enough: updates are rare and a short delay is fine. SSE or long polling would keep a connection per user open all day for very little benefit.`, diff: `easy` },
        { q: `How does SSE handle dropped connections?`, a: `The browser's EventSource reconnects automatically after a delay and sends the last event ID it received. The server must keep enough recent history per stream to resend events after that ID. Without that buffer, events during the gap are lost.`, diff: `medium` },
        { q: `Why does WebRTC need STUN and TURN servers?`, a: `Most peers are behind NATs and firewalls that block inbound connections. STUN tells each peer its public address and port so they can attempt a direct connection (hole punching). When that fails, for example with symmetric NATs or strict corporate firewalls, TURN relays the traffic through a server.`, diff: `medium` },
        { q: `Would you build a collaborative document editor with WebRTC?`, a: `Usually not. You need a server anyway to store the document, enforce permissions and serve late joiners, and most documents have few concurrent editors. A central server with WebSockets (operational transforms or CRDTs on the server) is simpler and more reliable. Peer-to-peer with CRDTs is an option for special cases, but I'd keep WebRTC for audio and video.`, diff: `hard` },
        { q: `A chat server has 2 million WebSocket connections across 50 machines. How does a message from user A reach user B?`, a: `A's server receives the message, persists it, then needs B's location. Either look B up in a connection registry (user to server) and forward directly, or publish to a pub/sub channel (per user or per chat) that B's server is subscribed to. B's server pushes it down B's socket. If B is offline, rely on storage and push notifications.`, diff: `hard` }
      ],
      labs: [`realtimeCompare`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch5`, part: 1, number: 5,
      source: { title: `Hello Interview: Networking Essentials`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials` },
      title: `Load balancing`,
      overview: `You can scale <strong>vertically</strong> (bigger machines) or <strong>horizontally</strong> (more machines). Modern hardware makes vertical scaling go further than people expect, but interview designs usually scale out, and then something must decide which server handles each request. <strong>Client-side load balancing</strong> lets clients pick from a list they keep updated. <strong>Dedicated load balancers</strong> sit in the path, at <strong>Layer 4</strong> (connections) or <strong>Layer 7</strong> (HTTP requests), run health checks and apply an algorithm such as round robin or least connections.`,
      concepts: [
        { term: `Vertical vs horizontal scaling`, def: `Vertical: move to a bigger machine (more cores, memory, faster disks). Horizontal: add more machines and spread the work.`, why: `Vertical scaling is simpler and today's large servers are very capable; horizontal scaling is the usual interview pattern and adds redundancy, but needs load balancing and stateless services.` },
        { term: `Client-side load balancing`, def: `Clients fetch the list of healthy servers from a registry (or from the servers themselves) and choose one per request, refreshing the list periodically or by push.`, why: `No extra hop and no central bottleneck. Built into gRPC and many service meshes, so it suits internal microservices.`, demo: `loadBalancer` },
        { term: `Redis Cluster routing`, def: `A Redis Cluster client learns which node owns which hash slots, hashes each key to a slot and sends the command straight to the owner. A node that doesn't own the slot replies with a redirect (<code>MOVED</code>) so the client can update its map.`, why: `A neat example of smart clients doing their own routing and self-correcting when the topology changes.` },
        { term: `DNS load balancing`, def: `A name resolves to several IP addresses, rotated or chosen per query, so different clients connect to different servers or load balancers.`, why: `Free and global, but slow to react because answers are cached for the TTL. Pointing DNS at two load balancers in different zones removes the balancer as a single point of failure.` },
        { term: `Dedicated load balancer`, def: `A proxy (hardware, software or cloud service) between clients and servers that picks a backend for each connection or request.`, why: `Clients only know one address; backends can change instantly; you get health checks, TLS termination and routing rules, for the cost of one more hop.` },
        { term: `Layer 4 load balancer`, def: `Routes TCP or UDP connections using addresses and ports, without reading the payload. Once a connection is assigned, all its bytes go to the same backend.`, why: `Fast and cheap per byte. The natural choice for WebSockets and other long-lived connections.`, demo: `loadBalancer` },
        { term: `Layer 7 load balancer`, def: `Terminates the client's connection, parses each HTTP request and forwards it over its own connection to a backend chosen by path, host, header or cookie.`, why: `Enables path-based routing, canary releases, header-based sticky sessions, retries and per-request balancing. More CPU per request than L4.` },
        { term: `Health checks`, def: `The balancer periodically probes each backend: a TCP check (does it accept connections?) or an HTTP check (does <code>/health</code> return 200?). Failing backends are removed until they pass again.`, why: `Automatic failover without humans. Make health endpoints check what matters, but not so deeply that one shared dependency fails every server at once.`, demo: `loadBalancer` },
        { term: `Round robin and random`, def: `Send each new request to the next server in turn, or to a random one.`, why: `Good defaults for stateless, short requests on similar servers. A newly added server starts receiving its share immediately.`, demo: `loadBalancer` },
        { term: `Least connections`, def: `Send new work to the backend with the fewest active connections.`, why: `The right choice for long-lived connections (WebSockets, SSE): with round robin, old servers keep their accumulated connections and new servers stay nearly idle.`, demo: `loadBalancer` },
        { term: `Least response time`, def: `Prefer backends that have been answering fastest recently (often combined with connection counts).`, why: `Steers traffic away from slow or overloaded machines in a mixed fleet.`, demo: `loadBalancer` },
        { term: `IP hash and sticky sessions`, def: `Choose the backend from a hash of the client IP, or pin a client with a cookie, so the same client keeps hitting the same server.`, why: `Useful for local caches or in-memory sessions, but it fights even distribution, and a plain hash modulo N reshuffles almost every client when N changes. Consistent hashing reduces that.`, demo: `loadBalancer` },
        { term: `Load balancer implementations`, def: `Hardware appliances (F5 BIG-IP), software proxies (HAProxy, NGINX, Envoy) and cloud services (AWS ALB at L7, NLB at L4; Google Cloud and Azure equivalents).`, why: `Naming a concrete option adds credibility. If the balancer itself becomes the bottleneck at extreme scale, mention hardware balancers or multiple balancers behind DNS.` }
      ],
      cheatsheet: [
        { title: `L4 vs L7`, type: `table`, headers: [``, `Layer 4`, `Layer 7`], rows: [
          [`Routes by`, `IP and port`, `URL, host, headers, cookies`],
          [`Sees request content`, `No`, `Yes (terminates TLS/HTTP)`],
          [`Unit balanced`, `Connection`, `Request`],
          [`Cost`, `Very low`, `Higher CPU per request`],
          [`Best for`, `WebSockets, raw TCP/UDP, very high throughput`, `HTTP APIs, path routing, canaries, sticky cookies`],
          [`Cloud examples`, `AWS NLB`, `AWS ALB, API gateways`]
        ] },
        { title: `Algorithms`, type: `table`, headers: [`Algorithm`, `How it picks`, `Use when`], rows: [
          [`Round robin`, `Next server in turn`, `Stateless requests, similar servers`],
          [`Random`, `Uniformly at random`, `Same as round robin; no shared counter needed`],
          [`Least connections`, `Fewest open connections`, `Long-lived connections, uneven request durations`],
          [`Least response time`, `Fastest recent responses`, `Mixed hardware, noisy neighbours`],
          [`IP hash / sticky`, `Hash of client or cookie`, `Server-local state or caches (use consistent hashing)`]
        ] },
        { title: `Client-side vs dedicated`, type: `list`, items: [
          `Client-side: no extra hop, no central bottleneck; needs clients you control (or slow-changing lists like DNS).`,
          `Dedicated: clients know one address, instant updates, health checks and routing rules; one more hop and something else to scale.`,
          `Typical design: DNS across regions or zones, dedicated L7 balancer at the edge, client-side balancing between internal services.`
        ] }
      ],
      interview: [
        { q: `Your chat service uses WebSockets. Which load balancer and algorithm?`, a: `An L4 balancer (or an L7 one with explicit WebSocket support) so the upgraded connection is simply passed through and stays on one backend. Use least connections: connections last hours, so round robin would leave newly added servers almost empty while old ones stay full. Add health checks and connection draining for deploys.`, diff: `medium` },
        { q: `Isn't the load balancer a single point of failure?`, a: `It can be. Run balancers in pairs or as a managed, multi-zone service, and put several balancer addresses behind DNS so clients fail over if one becomes unreachable. Cloud load balancers are internally distributed. Health checks plus short DNS TTLs keep recovery fast.`, diff: `easy` },
        { q: `When does client-side load balancing make sense?`, a: `When you control the clients and they are relatively few, as with internal microservices (gRPC has it built in) or smart database clients like Redis Cluster, or when the client population is huge but stale lists are acceptable, as with DNS. It saves a network hop and a central bottleneck. For public clients that need instant failover, use a dedicated balancer.`, diff: `medium` },
        { q: `What can an L7 balancer do that an L4 one can't?`, a: `Route by path or host (send /api to one pool and /static to another), make sticky sessions with cookies, terminate TLS and inspect headers, rewrite requests, retry failed requests on another backend, rate limit per client and split traffic for canary releases. It balances individual requests rather than whole connections.`, diff: `easy` },
        { q: `Why does IP-hash balancing cause trouble when you scale out?`, a: `With hash(client) mod N, changing N remaps almost every client to a different server, wiping out server-local caches or sessions all at once. Consistent hashing only moves about 1/N of clients when a server is added or removed. Also, many clients behind one NAT share an IP and can overload a single server.`, diff: `hard` },
        { q: `How should a health check be designed?`, a: `Cheap and frequent, and representative of whether this instance can serve traffic: the process is up, it can reach its own critical resources, it isn't overloaded. Avoid checks that fail every instance at once because of one shared dependency, which would take the whole fleet out of rotation. Use a few consecutive failures before removing a node to avoid flapping.`, diff: `hard` },
        { q: `Vertical or horizontal scaling first?`, a: `Often vertical first: it's simpler, avoids distributed-systems problems, and one large modern machine handles a lot. Scale horizontally when you need redundancy, exceed what one machine can do, or want to scale stateless tiers elastically. In interviews, show you know both and choose deliberately.`, diff: `medium` }
      ],
      labs: [`loadBalancer`]
    },
    // ------------------------------------------------------------------
    {
      id: `ch6`, part: 1, number: 6,
      source: { title: `Hello Interview: Networking Essentials`, url: `https://www.hellointerview.com/learn/system-design/core-concepts/networking-essentials` },
      title: `Latency, regions and failure handling`,
      overview: `Two practical realities come up in most deep dives. First, <strong>distance</strong>: light in fiber covers about 200 km per millisecond, so users far from your servers always pay tens of milliseconds per round trip. The fixes are <strong>data locality</strong>: CDNs at the edge, regional deployments and regional partitioning. Second, <strong>failure</strong>: networks drop and delay messages and dependencies go down. Timeouts, retries with exponential backoff and jitter, idempotency keys and circuit breakers keep one failure from becoming an outage.`,
      concepts: [
        { term: `Speed of light in fiber`, def: `Signals in optical fiber travel at roughly two thirds of the speed of light in vacuum, about 200,000 km/s, or 200 km per millisecond one way. Real routes are longer than straight lines, so add 30-100%.`, why: `It sets a hard floor on latency: roughly 1 ms of round trip per 100 km. No amount of optimization beats physics.`, demo: `latencyMap` },
        { term: `Regions and availability zones`, def: `A region is a geographic area (e.g. a metro) with several isolated data centers called availability zones, linked by fast networks. Large services run in multiple zones, and often multiple regions.`, why: `Zones protect against a building-level failure with little latency cost; regions bring servers closer to users and protect against regional disasters.` },
        { term: `Data locality`, def: `Performance is best when data sits close to the computation that needs it, and both sit close to the user.`, why: `A web server in one region querying a database in another pays a long round trip per query, which multiplies with chatty data access.`, demo: `latencyMap` },
        { term: `Content delivery networks (CDNs)`, def: `Networks of edge servers in hundreds of cities that cache content near users. A cache hit is served locally; a miss goes back to the origin.`, why: `The standard fix for static assets, images and video, and also for cacheable API responses. It cuts latency and origin load at the same time.`, demo: `latencyMap` },
        { term: `Regional partitioning`, def: `Split data and services by geography so each region holds and serves its own users' data, when requests rarely cross regions.`, why: `A ride-hailing app never matches a rider in one city with a driver in another, so each region can have its own servers and database close to its users.` },
        { term: `"The network is reliable" fallacy`, def: `One of the classic fallacies of distributed computing. In reality messages are lost, delayed, duplicated and reordered, and remote services fail independently.`, why: `Every network call in a design should have an answer to "what if this times out or fails?"` },
        { term: `Timeouts`, def: `A limit on how long to wait for a response before giving up. Without one, a hung dependency ties up threads and connections indefinitely.`, why: `Timeouts turn unbounded waits into fast, handleable errors. Set them from the dependency's latency percentiles.` },
        { term: `Retries`, def: `Repeat a failed request, because many failures are transient (a dropped packet, a restarting instance).`, why: `Retries hide transient failures from users, but only safe for idempotent operations, and dangerous if everyone retries at once.`, demo: `retryStorm` },
        { term: `Exponential backoff`, def: `Wait longer before each retry, e.g. 100 ms, 200 ms, 400 ms, 800 ms, up to a cap, and stop after a maximum number of attempts.`, why: `Gives a struggling dependency room to recover instead of hammering it. "Retry with exponential backoff" is what interviewers listen for.`, demo: `retryStorm` },
        { term: `Jitter`, def: `Randomize each backoff delay (for example pick uniformly between zero and the exponential delay) so clients that failed together don't retry together.`, why: `Without jitter, clients that failed at the same moment retry in synchronized waves that keep knocking the service over.`, demo: `retryStorm` },
        { term: `Idempotency keys`, def: `The client attaches a unique key to a write (e.g. a UUID per checkout attempt). The server records keys it has processed and returns the stored result for repeats instead of acting twice.`, why: `Makes non-idempotent operations such as payments safe to retry. Pick keys that identify the intent, not each network attempt.` },
        { term: `Cascading failures`, def: `One component's failure overloads others: callers pile up waiting, retries multiply traffic, and a recovering service is flattened by the backlog (a <strong>thundering herd</strong>) before it can come back.`, why: `"What happens when this dependency goes down?" is a favourite senior-level probe.`, demo: `circuitBreaker` },
        { term: `Circuit breaker`, def: `A wrapper around calls to a dependency. <strong>Closed</strong>: calls pass through and failures are counted. When failures cross a threshold it <strong>opens</strong>: calls fail immediately (or use a fallback). After a cool-down it goes <strong>half-open</strong> and lets a few test calls through; success closes it, failure reopens it.`, why: `Fails fast instead of hanging, sheds load from a sick dependency so it can recover, and tests recovery automatically.`, demo: `circuitBreaker` },
        { term: `Fallbacks and graceful degradation`, def: `When a dependency is unavailable, serve something reasonable: cached data, a default, a reduced feature, or a clear error, rather than hanging the whole request.`, why: `Pairs naturally with circuit breakers: users get a degraded experience instead of an outage.` }
      ],
      cheatsheet: [
        { title: `Latency rules of thumb`, type: `table`, headers: [`Path`, `Approx. round trip`], rows: [
          [`Same data center / zone`, `< 1 ms (often 0.1-0.5 ms)`],
          [`Between zones in a region`, `~1-2 ms`],
          [`Across a continent (e.g. US coast to coast)`, `~60-80 ms`],
          [`Transatlantic (New York - London)`, `~70-80 ms (physics floor ~56 ms)`],
          [`US - Asia or Australia`, `~150-250 ms`],
          [`Physics floor`, `~1 ms per 100 km of fiber, round trip`]
        ], note: `Measured latencies vary with routing; these are ballpark figures for estimates.` },
        { title: `Retry policy checklist`, type: `list`, items: [
          `Set a timeout on every remote call.`,
          `Retry only transient errors (timeouts, 503, connection resets), never 4xx like 400 or 403.`,
          `Use exponential backoff with a cap and a maximum number of attempts.`,
          `Add jitter so clients don't retry in lockstep.`,
          `Make the operation idempotent, or send an idempotency key.`,
          `Budget retries (e.g. at most 10% extra traffic) so retries can't multiply load during an outage.`
        ] },
        { title: `Circuit breaker states`, type: `table`, headers: [`State`, `Calls`, `Moves to`], rows: [
          [`Closed`, `Pass through; failures counted in a window`, `Open when failure rate exceeds the threshold`],
          [`Open`, `Fail immediately or use a fallback`, `Half-open after a cool-down`],
          [`Half-open`, `A few trial calls pass through`, `Closed if they succeed, open again if they fail`]
        ] }
      ],
      interview: [
        { q: `Users in Australia complain that your US-hosted site is slow. What do you do?`, a: `Measure where the time goes, then cut round trips and distance. Serve static assets and cacheable responses from a CDN with Australian edge locations, reuse connections and enable TLS 1.3 or HTTP/3 to reduce handshakes, and for dynamic data consider a deployment in an Asia-Pacific region with the relevant data replicated or partitioned there. A transpacific round trip is 150 ms or more, so every avoided round trip matters.`, diff: `medium` },
        { q: `Explain retry with exponential backoff and jitter.`, a: `After a failure, wait before retrying, doubling the wait each time up to a cap, and stop after a few attempts. Jitter randomizes each wait (for example uniformly between zero and the current backoff) so that many clients that failed at the same moment spread their retries out instead of hitting the service in synchronized waves. Combined with timeouts and idempotency it is the baseline for calling remote services.`, diff: `easy` },
        { q: `How do you make a payment API safe to retry?`, a: `Require an idempotency key per payment intent (generated by the client, for example one per checkout attempt). The server stores the key with the request's status and result in a table with a uniqueness constraint. A repeat with the same key returns the stored result, or waits for the in-flight one, instead of charging again. Keys expire after a reasonable window.`, diff: `medium` },
        { q: `What is a thundering herd and how do you prevent it?`, a: `Many clients hitting a resource at the same moment, typically right after it recovers or after a cache entry expires, overwhelming it again. Prevent it with jittered backoff, circuit breakers that let traffic back in gradually, request coalescing (one fetch per cache key), staggered expirations and admission control or rate limiting on the recovering service.`, diff: `medium` },
        { q: `Walk through how a circuit breaker behaves during a dependency outage.`, a: `Closed, it passes calls and tracks failures. When the failure rate crosses the threshold it opens: calls fail fast with a fallback, so callers aren't stuck waiting on timeouts and the dependency stops receiving traffic. After a cool-down it goes half-open and lets a few trial calls through. If they succeed it closes and normal traffic resumes; if not it opens again for another cool-down.`, diff: `medium` },
        { q: `Where would you put circuit breakers in a microservice design?`, a: `Around calls to anything that can fail or get slow independently: third-party APIs (payments, maps, email), databases and caches, and service-to-service calls, especially on the critical path of user requests. Pair each with a fallback: cached data, a default response, queueing the work for later, or a fast, clear error.`, diff: `easy` },
        { q: `When does regional partitioning work well, and when doesn't it?`, a: `It works when most interactions stay within a region: ride hailing, food delivery, local marketplaces. Each region serves its users from nearby servers and its own database. It's harder when users interact globally (social graphs, messaging across countries), when a user travels, or when you need global queries; then you need cross-region replication, routing by user home region, or a global tier for some data.`, diff: `hard` },
        { q: `Why can aggressive retries make an outage worse?`, a: `Each failed request turns into several, so a service that's already overloaded receives a multiple of its normal traffic exactly when it can least handle it. Synchronized retries arrive in spikes, and a recovering service can be pushed straight back down. Backoff, jitter, retry budgets and circuit breakers bound that amplification.`, diff: `medium` }
      ],
      labs: [`latencyMap`, `retryStorm`, `circuitBreaker`]
    }
  ]
};
