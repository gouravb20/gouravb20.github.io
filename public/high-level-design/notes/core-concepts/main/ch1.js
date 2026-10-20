// Main tab: Chapter 1, Networking 101: layers and the life of a request. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch1 = [
  {
    id: "three-layers",
    title: "Three layers are all you need",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>A network is a stack of layers. Each layer solves one problem and hides it from the layer above, so an application can ask for "send these bytes to that service" without caring about cables, routers or lost packets. Textbooks list seven layers, but a system design conversation only ever touches three of them, and each one answers a different kind of design question.</p>`,
      },
      {
        type: "table",
        headers: ["Layer", "Main protocols", "The design question it answers"],
        rows: [
          ["Network (L3)", "IP", "Can this machine reach that machine at all? Which addresses are public and which are private?"],
          ["Transport (L4)", "TCP, UDP, QUIC", "Do I need every byte, in order, or do I prefer fresh data with occasional loss?"],
          ["Application (L7)", "HTTP, DNS, gRPC, WebSockets", "What does a request mean, how is it routed, and how is it secured?"],
        ],
      },
      {
        type: "text",
        html: `<p>IP is <strong>best effort</strong>: it forwards packets toward an address and makes no promises about loss, duplication or ordering. Everything reliable you build sits on top of that unreliable base. The transport and network layers mostly live in the operating system kernel, which makes them fast but slow to change. Application protocols run inside your own process, which makes them flexible and easy to inspect, but more expensive in CPU per request. That single fact explains why a Layer 4 load balancer pushes more traffic per core than a Layer 7 one.</p>`,
      },
    ],
  },
  {
    id: "one-request",
    title: "A worked example: counting the round trips",
    kicker: "Where latency comes from",
    blocks: [
      {
        type: "text",
        html: `<p>The most useful habit from this chapter is estimating latency by counting <strong>round trips</strong>. Response time is roughly <em>round trips times RTT, plus server time</em>. Take a user in London calling an API hosted in the eastern US, with a round-trip time of about 80 ms and 40 ms of server work. Here is the first request, with nothing cached and no open connection.</p>`,
      },
      {
        type: "steps",
        title: "A cold HTTPS request from London to Virginia",
        items: [
          "<strong>DNS lookup.</strong> The client asks a nearby resolver for the API's address. If the resolver has it cached, this costs a few milliseconds; if not, it may cost tens. Call it 20 ms.",
          "<strong>TCP handshake.</strong> SYN, SYN-ACK, ACK. One full round trip before any request byte can be sent: 80 ms.",
          "<strong>TLS handshake.</strong> Agree on keys and verify the certificate. TLS 1.3 needs one round trip (80 ms); the older TLS 1.2 needs two (160 ms).",
          "<strong>HTTP request and response.</strong> One more round trip plus the server's 40 ms of work: 120 ms.",
          "<strong>Total.</strong> About 300 ms with TLS 1.3, of which only 40 ms is your code. The second request on the same connection costs just 120 ms.",
        ],
      },
      {
        type: "callout",
        tone: "insight",
        title: "The lesson",
        html: `<p>For distant or mobile users, the network often costs several times more than the server. Making the code twice as fast saves 20 ms here; reusing the connection saves 160 ms. Always ask "how many round trips, and how long is each?" before tuning code.</p>`,
      },
    ],
  },
  {
    id: "levers",
    title: "The levers that cut network time",
    kicker: "Decision guide",
    blocks: [
      {
        type: "text",
        html: `<p>Every latency fix works on one of two quantities: the <strong>number</strong> of round trips or the <strong>length</strong> of each one. Knowing which lever removes which cost lets you pick the right fix quickly.</p>`,
      },
      {
        type: "table",
        headers: ["Lever", "What it removes", "Where you use it"],
        rows: [
          ["Keep-alive and connection pools", "Repeated TCP and TLS handshakes", "Every service-to-service call and every database client"],
          ["HTTP/2 multiplexing", "Waiting for one request to finish before the next", "Browsers, mobile apps, gRPC channels"],
          ["TLS 1.3 and session resumption", "One handshake round trip, sometimes two", "Any public HTTPS endpoint"],
          ["HTTP/3 (QUIC)", "Separate transport and TLS handshakes", "Large consumer sites with mobile users"],
          ["CDN or edge proxy", "Distance: handshakes end near the user", "Static assets, cacheable responses, global users"],
          ["DNS caching and sensible TTLs", "Repeated lookups", "Everywhere, with shorter TTLs on records you may need to change"],
        ],
      },
      {
        type: "compare",
        title: "How a service talks to its dependencies",
        items: [
          { title: "New connection per call", tone: "bad", html: "<p>Every call pays the handshakes and burns CPU on key exchange. Closed sockets linger in a waiting state and can exhaust ports at high call rates.</p>" },
          { title: "Pooled, long-lived connections", tone: "ok", html: "<p>A small pool of warm connections carries thousands of requests. This is the default for databases, caches and internal RPC.</p>" },
        ],
      },
    ],
  },
  {
    id: "state-and-dns",
    title: "Two facts that shape real designs",
    kicker: "Consequences",
    blocks: [
      {
        type: "keypoints",
        items: [
          "<strong>Connections are state.</strong> An open TCP connection holds memory and bookkeeping on both ends and is pinned to one machine. A design with millions of persistent connections (chat, live feeds) must budget for that memory and plan what happens when a server restarts and all its clients reconnect at once.",
          "<strong>DNS is cached for the TTL.</strong> Changing a DNS record does not move clients instantly; each resolver keeps the old answer until its copy expires, and some keep it longer. DNS failover therefore takes at least one TTL, which is why fast failover usually happens behind a stable address, at a load balancer.",
          "<strong>Only the edge needs a public address.</strong> Application servers, databases and caches sit on private addresses that the internet cannot route to. The load balancer, gateway or CDN owns the public address, which keeps the attack surface small.",
          "<strong>Idle connections get cut.</strong> Load balancers, NAT gateways and firewalls drop connections that stay silent too long, so long-lived connections need heartbeats.",
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
        html: `<p>Networking basics rarely get their own interview question any more, but they sit under every latency and scaling discussion. Spend one or two sentences on them during the high-level design, then bring them back when the interviewer asks why something is slow or how traffic reaches a server.</p>`,
      },
      {
        type: "callout",
        tone: "interview",
        title: "Sentences worth having ready",
        html: `<ul><li>"Clients find us through DNS, which points at a load balancer; only that load balancer has a public address."</li><li>"Everything is TCP and HTTPS unless a requirement forces otherwise."</li><li>"A cold request costs three or four round trips before the first byte, so for far-away users I'd reuse connections and terminate TLS at the edge."</li><li>"Services keep pooled connections to each other and to the database."</li></ul>`,
      },
      {
        type: "callout",
        tone: "mistake",
        title: "Common mistakes",
        html: `<ul><li>Blaming slow responses on server code when the budget is dominated by round trips across an ocean.</li><li>Promising instant failover by "updating DNS" without mentioning the TTL.</li><li>Proposing millions of persistent connections without saying how they are balanced, drained or re-established.</li></ul>`,
      },
    ],
  },
];
