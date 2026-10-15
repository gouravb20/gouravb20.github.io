// Deep dive: Chapter 5, Load balancing. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>Your API runs on one server and it is at 90% CPU every evening. You add two more servers, so now you have triple the capacity. But clients still have one address to talk to, and somebody has to decide, for every one of thousands of requests per second, which of the three machines handles it. Get that decision wrong and you can have two idle servers next to one that's melting.</p>
<p>Then, at 9 pm, one of the three crashes. Requests that land on it hang until they time out, and a third of your users see errors until something notices and stops sending traffic there. Later you deploy a WebSocket feature, and the "balanced" fleet ends up with one server holding 60% of the connections. Load balancing looks like a single box on a diagram. Underneath it is a set of choices about where the decision happens, what it can see, how it detects failure and which algorithm it uses.</p>`,
  sections: [
    {
      id: "scaling-up-or-out",
      title: "Scaling up or scaling out",
      kicker: "Why balance at all",
      blocks: [
        {
          type: "text",
          html: `<p>When one machine isn't enough you have two options. <strong>Vertical scaling</strong> (scaling up) means moving to a bigger machine: more cores, more memory, faster disks. <strong>Horizontal scaling</strong> (scaling out) means adding more machines and spreading the work between them.</p>
<p>Vertical scaling goes much further than many engineers assume. Major clouds rent single machines with hundreds of vCPUs and terabytes of memory, and a single well-tuned database server can handle a very large product. It also keeps everything simple: no distributed coordination, no partial failures between nodes, transactions stay local. Stack Overflow has written publicly about serving its traffic from a small number of large, carefully tuned servers rather than a big fleet.</p>
<p>But a single machine has a ceiling, gets more expensive per unit of capacity near the top of the range, and is a single point of failure: when it reboots, you are down. Horizontal scaling removes the ceiling and gives redundancy, at the price of needing something to spread the work, and of making every server interchangeable.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Vertical (bigger machine)", tone: "info", html: "Simple, no code changes, no distributed-systems problems. Limited by the largest machine you can buy, costly at the top end, and one machine is one failure domain. Often the right first step for databases." },
            { title: "Horizontal (more machines)", tone: "ok", html: "Near-unlimited capacity and tolerance of single-machine failure. Requires stateless (or carefully partitioned) servers and a way to route each request: load balancing. The default for stateless application tiers." },
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Horizontal scaling only works cleanly for <strong>stateless</strong> servers, where any instance can handle any request. That is why session data goes into tokens or shared stores. Once a server holds per-user state (an open WebSocket, an in-memory game room), the load balancer can no longer pick freely, and the design gets harder.</p>`,
        },
        {
          type: "quiz",
          q: "An interviewer asks whether to scale a moderately loaded PostgreSQL primary vertically or horizontally first. What is the most defensible answer?",
          options: [
            "Always shard immediately; vertical scaling is obsolete",
            "Scale vertically first (and add read replicas) because it avoids distributed complexity, and shard only when one machine truly can't keep up",
            "Neither; databases can't be scaled",
            "Put it behind a round-robin load balancer with three independent primaries",
          ],
          answer: 1,
          explain: "A bigger machine plus read replicas buys a lot of headroom with no change to the data model or transactions. Sharding a database is a major step with permanent costs, so it should be justified by numbers. Round-robining writes across independent primaries would split the data.",
        },
      ],
    },
    {
      id: "where-balancing-happens",
      title: "Where the decision happens: DNS, client or proxy",
      kicker: "Three places",
      blocks: [
        {
          type: "text",
          html: `<p>Something must turn "the service" into "this particular server". There are three places to put that logic, and real systems often combine them.</p>
<p><strong>DNS.</strong> The name resolves to several addresses, and the DNS server rotates or chooses among them per query. It is free and universal, but coarse: clients cache the answer for the TTL, DNS can't see per-server load, and a dead server stays in caches until they expire. It works best for spreading users across regions or across several load balancers, not individual app servers.</p>
<p><strong>Client-side.</strong> Clients fetch the list of healthy servers from a service registry (or from the servers themselves) and choose one per request. There is no extra hop and no box to scale, and the client can use rich signals such as its own measured latencies. The price is that every client must implement the logic and keep the list fresh, so it suits internal services where you control the clients.</p>
<p><strong>Dedicated load balancer.</strong> A proxy sits between clients and servers and chooses a backend per connection or per request. Clients see one stable address; health checks, TLS and routing rules live in one place. It adds a hop and must itself be made highly available.</p>`,
        },
        {
          type: "diagram",
          title: "Three places to choose a server",
          caption: "DNS hands out addresses and then gets out of the way; a client-side balancer picks from a list it keeps; a dedicated load balancer is a proxy every request passes through.",
          svg: `<svg viewBox="0 0 630 240" role="img" aria-label="Three panels: DNS load balancing, client-side load balancing with a registry, and a dedicated load balancer in front of servers">
<defs><marker id="cc5-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<line x1="210" y1="12" x2="210" y2="232" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<line x1="420" y1="12" x2="420" y2="232" stroke-width="1.5" style="stroke: var(--dg-line)"/>
<text x="105" y="26" text-anchor="middle" font-size="13" font-weight="700">DNS</text>
<text x="315" y="26" text-anchor="middle" font-size="13" font-weight="700">Client-side</text>
<text x="525" y="26" text-anchor="middle" font-size="13" font-weight="700">Dedicated LB</text>
<rect x="60" y="40" width="90" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="105" y="60" text-anchor="middle" font-size="12">Client</text>
<rect x="15" y="100" width="70" height="30" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="50" y="120" text-anchor="middle" font-size="12">DNS</text>
<rect x="30" y="170" width="70" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="65" y="190" text-anchor="middle" font-size="12">Server</text>
<rect x="115" y="170" width="70" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="150" y="190" text-anchor="middle" font-size="12">Server</text>
<line x1="78" y1="70" x2="58" y2="97" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#cc5-arrow)" style="stroke: var(--dg-4)"/>
<line x1="122" y1="70" x2="148" y2="167" stroke-width="2" marker-end="url(#cc5-arrow)" style="stroke: var(--dg-ink)"/>
<rect x="270" y="40" width="90" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="315" y="60" text-anchor="middle" font-size="12">Client</text>
<rect x="225" y="100" width="80" height="30" rx="6" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<text x="265" y="120" text-anchor="middle" font-size="12">Registry</text>
<rect x="240" y="170" width="70" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="275" y="190" text-anchor="middle" font-size="12">Server</text>
<rect x="325" y="170" width="70" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="360" y="190" text-anchor="middle" font-size="12">Server</text>
<line x1="275" y1="98" x2="293" y2="73" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#cc5-arrow)" style="stroke: var(--dg-4)"/>
<line x1="332" y1="70" x2="358" y2="167" stroke-width="2" marker-end="url(#cc5-arrow)" style="stroke: var(--dg-ink)"/>
<rect x="480" y="40" width="90" height="30" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="525" y="60" text-anchor="middle" font-size="12">Client</text>
<rect x="465" y="100" width="120" height="30" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="525" y="120" text-anchor="middle" font-size="12">Load balancer</text>
<rect x="450" y="170" width="70" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="485" y="190" text-anchor="middle" font-size="12">Server</text>
<rect x="535" y="170" width="70" height="30" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="570" y="190" text-anchor="middle" font-size="12">Server</text>
<line x1="525" y1="70" x2="525" y2="97" stroke-width="2" marker-end="url(#cc5-arrow)" style="stroke: var(--dg-ink)"/>
<line x1="505" y1="130" x2="489" y2="167" stroke-width="2" marker-end="url(#cc5-arrow)" style="stroke: var(--dg-ink)"/>
<line x1="545" y1="130" x2="566" y2="167" stroke-width="2" marker-end="url(#cc5-arrow)" style="stroke: var(--dg-ink)"/>
<text x="105" y="226" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">coarse, cached by TTL</text>
<text x="315" y="226" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">client picks per request</text>
<text x="525" y="226" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">a proxy in the path</text>
</svg>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Redis Cluster", title: "Smart clients", html: "Cluster-aware Redis clients learn which node owns which of the 16,384 hash slots and send each command straight to the owner. A node that doesn't own a slot answers with a <code>MOVED</code> redirect, and the client updates its map. No proxy sits in the data path." },
            { org: "gRPC", title: "Client-side balancing built in", html: "gRPC clients can resolve a service to many backends and spread calls across them with a built-in policy such as round robin, or receive endpoints and weights from a control plane over the xDS protocol used by Envoy." },
          ],
        },
      ],
    },
    {
      id: "layer4-vs-layer7",
      title: "Layer 4 versus Layer 7 load balancers",
      kicker: "What the balancer can see",
      blocks: [
        {
          type: "text",
          html: `<p>A dedicated load balancer works at one of two levels, and the difference decides what it can do.</p>
<p>A <strong>Layer 4</strong> balancer works with TCP or UDP connections. It sees addresses and ports, picks a backend when a connection opens, and then forwards that connection's packets without reading them. It doesn't terminate TLS or parse HTTP, so it is extremely fast and cheap per byte, and it is protocol-agnostic: databases, WebSockets, custom binary protocols all pass through. But every request on a connection goes to the same backend, because the balancer can't see where one request ends.</p>
<p>A <strong>Layer 7</strong> balancer terminates the client's connection (including TLS), parses each HTTP request and forwards it over its own connection to a backend of its choosing. Because it understands requests, it can route by host, path, header or cookie, balance individual requests on a shared HTTP/2 connection, retry a failed request on another backend, add headers, enforce rate limits and authenticate. All of that costs CPU and latency per request, and the balancer becomes a point where TLS keys live.</p>`,
        },
        {
          type: "diagram",
          title: "One connection forwarded versus two connections with routing",
          caption: "A Layer 4 balancer passes one TCP connection through to a single backend. A Layer 7 balancer ends the client's connection, reads each request and routes it, for example by path.",
          svg: `<svg viewBox="0 0 620 276" role="img" aria-label="Layer 4 load balancer forwarding one connection versus Layer 7 load balancer routing requests by path to different backends">
<defs><marker id="cc5-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="20" y="34" font-size="13" font-weight="700">Layer 4</text>
<line x1="110" y1="73" x2="467" y2="73" stroke-width="3" marker-end="url(#cc5-arrow2)" style="stroke: var(--dg-1)"/>
<rect x="20" y="55" width="90" height="36" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="65" y="78" text-anchor="middle" font-size="13">Client</text>
<rect x="230" y="55" width="120" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="290" y="78" text-anchor="middle" font-size="13">L4 balancer</text>
<rect x="470" y="55" width="120" height="36" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="530" y="78" text-anchor="middle" font-size="13">Backend 2</text>
<text x="300" y="114" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">One TCP connection; bytes forwarded without being read</text>
<text x="20" y="152" font-size="13" font-weight="700">Layer 7</text>
<rect x="20" y="180" width="90" height="36" rx="6" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="65" y="203" text-anchor="middle" font-size="13">Client</text>
<rect x="230" y="180" width="120" height="36" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="290" y="203" text-anchor="middle" font-size="13">L7 balancer</text>
<rect x="470" y="150" width="120" height="32" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="530" y="171" text-anchor="middle" font-size="13">API servers</text>
<rect x="470" y="212" width="120" height="32" rx="6" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2"/>
<text x="530" y="233" text-anchor="middle" font-size="13">Image servers</text>
<line x1="110" y1="198" x2="227" y2="198" stroke-width="2" marker-end="url(#cc5-arrow2)" style="stroke: var(--dg-ink)"/>
<text x="170" y="190" text-anchor="middle" font-size="12">TLS + HTTP</text>
<line x1="350" y1="190" x2="467" y2="168" stroke-width="2" marker-end="url(#cc5-arrow2)" style="stroke: var(--dg-ink)"/>
<text x="400" y="166" text-anchor="middle" font-size="12">/api/*</text>
<line x1="350" y1="206" x2="467" y2="227" stroke-width="2" marker-end="url(#cc5-arrow2)" style="stroke: var(--dg-ink)"/>
<text x="405" y="238" text-anchor="middle" font-size="12">/images/*</text>
<text x="300" y="268" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Two connections; the balancer terminates TLS and reads every request</text>
</svg>`,
        },
        {
          type: "table",
          headers: ["", "Layer 4", "Layer 7"],
          rows: [
            ["Decides per", "Connection", "Request"],
            ["Sees", "Addresses and ports", "Full HTTP: host, path, headers, cookies"],
            ["TLS", "Passed through (usually)", "Terminated at the balancer"],
            ["Cost", "Very low per byte", "Higher: parsing, TLS, buffering"],
            ["Can do", "Spread connections, any protocol", "Path routing, retries, header rules, auth, rate limits"],
            ["Examples", "AWS NLB, Google Maglev, HAProxy in TCP mode", "AWS ALB, Envoy, NGINX, HAProxy in HTTP mode"],
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Google Maglev", title: "Software L4 at scale", html: "Google described Maglev in a 2016 paper: a distributed software network load balancer running on ordinary servers, using consistent hashing so that connections keep landing on the same backend even as balancer machines come and go." },
            { org: "AWS", title: "Two products for two layers", html: "Elastic Load Balancing offers the Network Load Balancer for Layer 4 traffic (TCP, UDP, TLS passthrough or termination) and the Application Load Balancer for Layer 7 HTTP routing by host, path and headers." },
          ],
        },
        {
          type: "quiz",
          q: "Clients hold long-lived HTTP/2 connections, each carrying hundreds of requests per second. Behind an L4 balancer, some backends are overloaded while others idle. Why, and what helps?",
          options: [
            "The backends are too small; scale them up",
            "L4 balances connections, so all requests on a busy connection go to one backend; an L7 (HTTP/2-aware) balancer can spread individual requests",
            "HTTP/2 is incompatible with load balancing",
            "Switch to IP-hash balancing",
          ],
          answer: 1,
          explain: "An L4 balancer chooses a backend once per connection and can't see the requests multiplexed inside it. With few, heavy connections the load is as uneven as the connections. An L7 balancer, or client-side balancing in gRPC, spreads requests individually.",
        },
      ],
    },
    {
      id: "algorithms",
      title: "Algorithms: choosing the next backend",
      kicker: "How it decides",
      blocks: [
        {
          type: "text",
          html: `<p>The algorithm matters less than people think for short, uniform requests, and a lot for long-lived connections or uneven servers. The common ones:</p>`,
        },
        {
          type: "table",
          headers: ["Algorithm", "How it chooses", "Works well when", "Breaks down when"],
          rows: [
            ["Round robin", "Next server in turn (weighted variants send more to bigger servers)", "Requests are short and similar; servers are equal", "Requests vary a lot in cost, or one server is slow"],
            ["Random", "Any server, uniformly", "Many balancers with no shared state", "Same weaknesses as round robin"],
            ["Least connections", "Server with the fewest active connections", "Long-lived connections (WebSockets), uneven request times", "Connection counts don't reflect actual cost"],
            ["Least response time", "Server that has answered fastest recently", "Mixed hardware or noisy neighbours", "Feedback loops: a fast-failing server looks fast"],
            ["Power of two choices", "Pick two at random, take the less loaded", "Many balancers with stale load data", "Rarely; a strong general default"],
            ["IP hash / sticky", "Same client to the same server", "Servers keep per-client state or caches", "Scaling out reshuffles clients; hot clients overload one server"],
          ],
        },
        {
          type: "lab",
          id: "loadBalancer",
          caption: "Pick an algorithm and a workload (short requests, long-lived connections, or a fleet with one slow server). Crash a server or add one halfway through and watch how load and errors shift.",
        },
        {
          type: "text",
          html: `<p>Two patterns are worth remembering. First, for <strong>long-lived connections</strong>, round robin balances the number of connections <em>opened</em>, not the number currently open. After a server restarts, it comes back empty while the others stay full, and round robin only fills it at the same rate as everyone else. Least connections sends new connections to the emptiest server until it catches up.</p>
<p>Second, <strong>"pick two at random and choose the less loaded"</strong> is remarkably effective. Picking the single least-loaded server sounds best, but with many balancers working from slightly stale counts they all pile onto the same "best" server at once. Sampling two avoids that herd while still steering away from overloaded machines. Envoy's least-request policy and NGINX's <code>random two least_conn</code> option are both built on this idea.</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>Sticky sessions</strong> (IP hash or a cookie that pins a client to a server) are a crutch for state that lives in server memory. They make scaling out uneven, since a new server only gets new clients; they turn a server crash into lost sessions; and with IP hash, thousands of users behind one corporate NAT all land on the same server. Prefer moving the state to a shared store and keeping servers interchangeable.</p>`,
        },
        {
          type: "quiz",
          q: "A chat service uses WebSockets. After a deploy restarts one of ten servers, that server stays nearly empty for hours under round robin. Which change fixes it best?",
          options: [
            "Switch to IP hash",
            "Switch to least connections so new connections go to the emptiest server",
            "Increase the health check frequency",
            "Use DNS load balancing instead",
          ],
          answer: 1,
          explain: "Round robin hands each server an equal share of new connections, so a freshly restarted server never catches up with servers that kept their old connections. Least connections directs new connections to it until counts even out. Clients reconnecting with jittered backoff also helps avoid a burst.",
        },
      ],
    },
    {
      id: "health-checks",
      title: "Health checks: knowing when to stop sending traffic",
      kicker: "Failure detection",
      blocks: [
        {
          type: "text",
          html: `<p>A load balancer that keeps sending requests to a dead server turns one crash into a stream of user-facing errors. <strong>Health checks</strong> let it notice and route around failures.</p>
<p><strong>Active checks</strong> probe each backend on a timer: a TCP check (does it accept a connection?) or an HTTP check (does <code>GET /health</code> return 200 in time?). A backend is marked unhealthy after several consecutive failures and healthy again after several passes, so one slow probe doesn't flap it in and out. <strong>Passive checks</strong> watch real traffic: if a backend returns a run of 5xx errors or connection failures, eject it for a while. Envoy calls this outlier detection. Passive checks react to failures real users hit; active checks find backends that are broken before any user does. Good setups use both.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Shallow check", tone: "ok", html: "The process is up and can serve: it answers <code>/health</code> quickly without calling dependencies. Safe default for load balancer checks, because a shared dependency failing doesn't make every instance look dead at once." },
            { title: "Deep check", tone: "warn", html: "Also verifies the database, cache and downstream services. Catches more problems, but if the database blips, every instance fails its check at the same moment and the balancer may remove the whole fleet. Use for alerting and readiness, carefully." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "AWS ALB", title: "Failing open", html: "If every target in a target group is unhealthy, an Application Load Balancer routes requests to all of them anyway rather than to none. The assumption is that a fleet-wide failure is more likely a bad health check than a fleet-wide outage." },
            { org: "Kubernetes", title: "Liveness versus readiness", html: "Kubernetes separates readiness probes (should this pod receive traffic right now?) from liveness probes (should this container be restarted?). A pod warming its cache can be alive but not ready, so it receives no traffic without being killed." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Make the health endpoint cheap, unauthenticated only on an internal path, and honest about the instance itself: report unhealthy while starting up, while draining for shutdown, or when the instance is truly unable to serve. During deploys, fail the health check first, wait for in-flight requests to finish, then stop the process.</p>`,
        },
      ],
    },
    {
      id: "no-single-point",
      title: "Isn't the load balancer a single point of failure?",
      kicker: "Making it redundant",
      blocks: [
        {
          type: "text",
          html: `<p>Yes, if you run exactly one of them. A load balancer exists to remove single points of failure, so it needs redundancy of its own. The standard approaches:</p>
<ul>
<li><strong>Active-passive pair.</strong> Two balancers share a floating virtual IP. The active one holds it; if it stops sending heartbeats, the standby claims the IP (keepalived with VRRP is the classic tool). Failover takes seconds, and the standby's capacity sits idle.</li>
<li><strong>Active-active behind DNS.</strong> Several balancers each have their own address, and DNS returns all of them. Capacity scales out, but failover is limited by DNS caching.</li>
<li><strong>Anycast and ECMP.</strong> Many balancer nodes announce the same IP, and routers spread flows between them with equal-cost multipath routing. A failed node withdraws its route and traffic shifts within moments. Large L4 tiers such as Maglev work this way, and CDNs use anycast across whole data centers.</li>
<li><strong>Managed cloud balancers.</strong> AWS, Google Cloud and Azure run their balancers as distributed, multi-zone services behind one name, so the redundancy is their problem rather than yours.</li>
</ul>`,
        },
        {
          type: "tradeoffs",
          prosLabel: "A dedicated balancer tier gives you",
          consLabel: "It also brings",
          pros: [
            "One stable address for clients",
            "Health checks, TLS and routing rules in one place",
            "Servers can be added and removed invisibly",
          ],
          cons: [
            "An extra network hop and component to operate",
            "Its own capacity limits and redundancy needs",
            "A shared blast radius: a bad config change affects every service behind it",
          ],
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>Load balancers used to be expensive hardware appliances (F5 BIG-IP and similar) bought in redundant pairs. Today most are software: HAProxy, NGINX and Envoy on ordinary servers, or cloud services that scale automatically. The concepts carried over unchanged; the cost of adding one dropped to almost nothing.</p>`,
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
          html: `<p>Almost every design has a load balancer box in front of a stateless tier, and interviewers rarely want more than a sentence on it. It earns more time when the design has long-lived connections, very high traffic, mixed request costs, or when the interviewer asks how failures are detected.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Points that show depth quickly:</p>
<ol>
<li>Keep app servers stateless so a balancer can send any request anywhere; state lives in shared stores.</li>
<li>L7 for HTTP APIs (path routing, TLS termination, per-request balancing); L4 for raw TCP, WebSockets at very high scale, or non-HTTP protocols.</li>
<li>Least connections for long-lived connections; round robin or power of two choices for short requests.</li>
<li>Health checks remove dead servers; keep them shallow so a dependency blip doesn't empty the pool.</li>
<li>The balancer is redundant too: managed multi-zone service, active-passive pair or anycast.</li>
<li>For internal service-to-service calls, client-side balancing removes a hop.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "Your service has 4 servers behind a balancer using IP hash. You add a 5th during a traffic spike. What happens?",
          options: [
            "Nothing changes until servers are restarted",
            "Most clients are remapped to different servers, losing any server-local state, and the new server gets an arbitrary share",
            "Only new clients go to the new server; existing ones stay put",
            "The balancer automatically switches to round robin",
          ],
          answer: 1,
          explain: "A simple hash mod N reshuffles most clients when N changes, which destroys any per-server sessions or caches right when you are already under load. Consistent hashing reduces the reshuffle; keeping servers stateless removes the problem.",
        },
      ],
    },
  ],
  takeaways: [
    "Vertical scaling is simpler and goes further than expected; horizontal scaling removes the ceiling and adds redundancy but needs stateless servers and load balancing.",
    "Balancing can happen in DNS (coarse, cached), in the client (no extra hop, needs smart clients) or in a dedicated proxy (one address, central control).",
    "Layer 4 balancers forward connections without reading them; Layer 7 balancers terminate TLS and route each HTTP request by host, path or header.",
    "Least connections suits long-lived connections; power of two choices is a strong default; sticky sessions and IP hash fight scaling and should be a last resort.",
    "Health checks (active probes plus passive outlier detection) remove failed servers; keep load balancer checks shallow to avoid emptying the whole pool.",
    "The load balancer itself must be redundant: active-passive with a floating IP, active-active with anycast, or a managed multi-zone service.",
  ],
  furtherReading: [
    { title: "Maglev: A Fast and Reliable Software Network Load Balancer (NSDI 2016)", note: "Google's paper on a software L4 balancer tier using anycast, ECMP and consistent hashing." },
    { title: "Envoy documentation: load balancing", url: "https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancing", note: "Round robin, least request with power of two choices, ring hash, and outlier detection." },
    { title: "The Power of Two Choices in Randomized Load Balancing (Michael Mitzenmacher)", note: "The theory behind sampling two servers instead of one." },
  ],
};
