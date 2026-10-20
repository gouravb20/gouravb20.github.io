// Main tab: Chapter 5, Load balancing. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch5 = [
  {
    id: "what-it-does",
    title: "What a load balancer is for",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>When one machine is not enough, you have two options. <strong>Vertical scaling</strong> buys a bigger machine: simple, no distributed-systems problems, and modern servers go further than most people expect. <strong>Horizontal scaling</strong> adds more machines: it gives redundancy and practically unlimited room, but something now has to decide which machine handles each request. That decision is load balancing.</p><p>A load balancer does three jobs at once, and it helps to name all three in an interview.</p>`,
      },
      {
        type: "keypoints",
        items: [
          "<strong>Spread the work</strong> so that adding a server actually adds capacity.",
          "<strong>Hide failures</strong> by noticing dead or sick servers through health checks and sending traffic elsewhere.",
          "<strong>Decouple clients from servers</strong>: clients know one stable address while servers come and go during deploys and autoscaling.",
        ],
      },
      {
        type: "callout",
        tone: "warning",
        html: `<p>Horizontal scaling only works if the servers are interchangeable. Keep application servers stateless and put sessions, carts and other shared state in a database or cache, or the balancer can't move traffic freely.</p>`,
      },
    ],
  },
  {
    id: "where",
    title: "Where the decision happens",
    kicker: "Placement",
    blocks: [
      {
        type: "table",
        headers: ["Approach", "How it works", "Strengths", "Weaknesses"],
        rows: [
          ["DNS", "A name resolves to several addresses", "Free, global, can steer users to the nearest region", "Cached for the TTL, blind to server load, slow to fail over"],
          ["Dedicated load balancer", "A proxy in the path picks a backend per connection or request", "Instant changes, health checks, TLS termination, routing rules", "One more hop, and something else to scale and make redundant"],
          ["Client-side", "Clients hold the list of healthy servers and pick one themselves", "No extra hop, no central bottleneck", "Needs clients you control and a registry to keep lists fresh"],
        ],
      },
      {
        type: "text",
        html: `<p>A typical production design uses all three in layers: DNS spreads users across regions or availability zones, a dedicated Layer 7 balancer at each edge routes HTTP requests to services, and internal services call each other with client-side balancing built into gRPC or a service mesh.</p>`,
      },
    ],
  },
  {
    id: "l4-vs-l7",
    title: "Layer 4 or Layer 7",
    kicker: "What the balancer can see",
    blocks: [
      {
        type: "compare",
        items: [
          { title: "Layer 4: connections", tone: "info", html: "<p>Routes TCP or UDP connections by address and port without reading the contents. Once a connection is assigned, every byte goes to the same backend. Very cheap per byte and the natural fit for WebSockets, raw TCP and extreme throughput. Example: AWS NLB.</p>" },
          { title: "Layer 7: requests", tone: "info", html: "<p>Terminates the client connection, parses each HTTP request and forwards it to a backend chosen by path, host, header or cookie. Enables path routing, canary releases, per-request balancing, retries and rate limits, at more CPU per request. Example: AWS ALB, NGINX, Envoy.</p>" },
        ],
      },
      {
        type: "text",
        html: `<p>The rule of thumb: Layer 7 for HTTP APIs, because routing by path and balancing each request is usually what you want; Layer 4 for long-lived connections and non-HTTP protocols, or when raw throughput matters most.</p>`,
      },
    ],
  },
  {
    id: "algorithms-and-health",
    title: "Algorithms and health checks",
    kicker: "How it decides",
    blocks: [
      {
        type: "table",
        headers: ["Algorithm", "Use when", "Pitfall"],
        rows: [
          ["Round robin or random", "Short, stateless requests on similar servers", "Ignores how busy each server actually is"],
          ["Least connections", "Long-lived connections or very uneven request durations", "Needs the balancer to track open connections"],
          ["Least response time", "Mixed hardware or noisy neighbours", "Can pile traffic onto a server that just became fast because it is failing quickly"],
          ["Hash or sticky sessions", "Server-local caches or in-memory sessions", "Uneven spread; plain hash modulo N remaps nearly everyone when N changes"],
        ],
      },
      {
        type: "keypoints",
        title: "Health checks that help rather than hurt",
        items: [
          "Probe often and cheaply: a TCP connect, or an HTTP <code>/health</code> endpoint that returns 200 when this instance can serve.",
          "Require a few consecutive failures before removing a server, and a few successes before adding it back, so servers don't flap in and out.",
          "Don't make every instance's check depend on one shared database. If it hiccups, every server fails its check and the balancer removes the whole fleet.",
          "Drain connections before taking a server out for a deploy.",
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
        html: `<p>Draw a load balancer in front of every horizontally scaled tier and say one sentence about it: which layer, which algorithm, and that it health-checks the backends. Expect the follow-up "isn't the load balancer a single point of failure?" The answer: balancers run as redundant pairs or as a managed multi-zone service, with several balancer addresses behind DNS.</p>`,
      },
      {
        type: "callout",
        tone: "interview",
        title: "A worked answer",
        html: `<p>"Clients reach us through DNS, which points at a managed Layer 7 load balancer in each zone. It terminates TLS and routes <code>/api</code> to the API service with round robin, since requests are short and stateless. The chat service sits behind a Layer 4 balancer using least connections, because WebSocket connections last for hours. Internal services balance on the client side through gRPC."</p>`,
      },
      {
        type: "callout",
        tone: "mistake",
        title: "Common mistakes",
        html: `<ul><li>Round robin for WebSockets, leaving new servers idle.</li><li>Sticky sessions used to paper over stateful servers instead of moving state out.</li><li>Forgetting health checks, or making them so deep that one dependency takes out every server.</li></ul>`,
      },
    ],
  },
];
