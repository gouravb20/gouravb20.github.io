// Deep dive: Chapter 5, Load balancing. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>This chapter covers how traffic is spread across servers: where the decision happens, what the balancer can see, which algorithm it uses and how it detects failure. Those choices decide whether added servers actually add capacity and whether a crash becomes an outage.</p>`,
  sections: [
    {
      id: "scaling-and-placement",
      title: "Scaling out, and where the decision happens",
      kicker: "Why balance at all",
      blocks: [
        {
          type: "compare",
          items: [
            { title: "Vertical (bigger machine)", tone: "info", html: "Simple, no distributed-systems problems, and goes further than many assume (hundreds of vCPUs, terabytes of memory). Limited by the largest machine, costly at the top end, one failure domain. Often the right first step for databases." },
            { title: "Horizontal (more machines)", tone: "ok", html: "Near-unlimited capacity and tolerance of single-machine failure. Requires <strong>stateless</strong> servers, so any instance can handle any request, and a way to route each request. The default for application tiers." },
          ],
        },
        {
          type: "text",
          html: `<p>Something must turn "the service" into "this server". There are three places to put that logic, often combined.</p>`,
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
          type: "table",
          headers: ["Where", "Strength", "Weakness", "Fits"],
          rows: [
            ["DNS", "Free and universal", "Coarse, cached for the TTL, blind to load", "Spreading users across regions or balancers"],
            ["Client-side", "No extra hop; uses the client's own latency data", "Every client needs the logic and a fresh server list", "Internal services (gRPC, Redis Cluster smart clients)"],
            ["Dedicated balancer", "One stable address; health checks, TLS and routing in one place", "An extra hop that must itself be highly available", "Public traffic, most HTTP tiers"],
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
          html: `<p>An <strong>L4</strong> balancer picks a backend per TCP/UDP connection and forwards bytes unread: very cheap and protocol-agnostic. An <strong>L7</strong> balancer terminates the connection and TLS, parses each HTTP request and routes it: more capable, more CPU per request.</p>`,
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
          html: `<p>For short, uniform requests the algorithm barely matters. It matters a lot for long-lived connections and uneven servers.</p>`,
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
          type: "keypoints",
          items: [
            "<strong>Long-lived connections:</strong> round robin balances connections <em>opened</em>, so a restarted server stays nearly empty. Least connections fills it until it catches up.",
            "<strong>Power of two choices:</strong> many balancers picking the single least-loaded server from stale counts all pile onto it. Sampling two avoids the herd (Envoy's least-request, NGINX's <code>random two least_conn</code>).",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>Sticky sessions</strong> are a crutch for state in server memory. New servers only get new clients, a crash loses sessions, and with IP hash everyone behind one corporate NAT lands on one server. Move state to a shared store instead.</p>`,
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
      id: "health-and-redundancy",
      title: "Health checks and a redundant balancer",
      kicker: "Failure detection",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Active checks</strong> probe each backend on a timer (TCP connect or <code>GET /health</code>) and need several consecutive failures or passes to flip state. <strong>Passive checks</strong> (Envoy's outlier detection) eject backends that return runs of errors to real traffic. Use both.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Shallow check", tone: "ok", html: "The process is up and answers <code>/health</code> quickly without calling dependencies. Safe default: a shared dependency failing doesn't make every instance look dead at once." },
            { title: "Deep check", tone: "warn", html: "Also verifies database, cache and downstreams. If the database blips, every instance fails together and the balancer may remove the whole fleet. Use for alerting and readiness, carefully." },
          ],
        },
        {
          type: "keypoints",
          items: [
            "If every target is unhealthy, AWS ALB <strong>fails open</strong> and routes to all of them, assuming a bad check is likelier than a fleet-wide outage.",
            "Kubernetes separates <strong>readiness</strong> (send traffic?) from <strong>liveness</strong> (restart?): a pod warming its cache is alive but not ready.",
            "On deploys, fail the health check first, let in-flight requests finish, then stop the process.",
          ],
        },
        {
          type: "list",
          title: "The balancer needs redundancy too",
          items: [
            "<strong>Active-passive pair</strong> sharing a floating IP (keepalived with VRRP): failover in seconds, standby capacity idle.",
            "<strong>Active-active behind DNS:</strong> capacity scales, failover limited by DNS caching.",
            "<strong>Anycast and ECMP:</strong> many nodes announce one IP and routers spread flows; a failed node withdraws its route (Maglev works this way).",
            "<strong>Managed cloud balancers</strong> run multi-zone behind one name, so redundancy is the provider's problem.",
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "callout",
          tone: "interview",
          html: `<p>Usually a sentence is enough; spend more time with long-lived connections, very high traffic or when asked about failure detection. A strong answer covers:</p>
<ol>
<li>Stateless app servers so any request can go anywhere; state lives in shared stores.</li>
<li>L7 for HTTP APIs (path routing, TLS termination, per-request balancing); L4 for raw TCP, very high-scale WebSockets or non-HTTP protocols.</li>
<li>Least connections for long-lived connections; round robin or power of two choices for short requests.</li>
<li>Shallow health checks so a dependency blip doesn't empty the pool.</li>
<li>A redundant balancer (managed, active-passive or anycast), and client-side balancing for internal calls.</li>
</ol>`,
        },
      ],
    },
  ],
  takeaways: [
    "Vertical scaling is simpler and goes further than expected; horizontal scaling removes the ceiling but needs stateless servers and load balancing.",
    "Balance in DNS (coarse, cached), in the client (no extra hop) or in a dedicated proxy (one address, central control).",
    "L4 forwards connections unread; L7 terminates TLS and routes each HTTP request by host, path or header.",
    "Least connections suits long-lived connections, power of two choices is a strong default, and sticky sessions should be a last resort.",
    "Keep load balancer health checks shallow, and make the balancer itself redundant.",
  ],
  furtherReading: [
    { title: "Maglev: A Fast and Reliable Software Network Load Balancer (NSDI 2016)", note: "Google's paper on a software L4 balancer tier using anycast, ECMP and consistent hashing." },
    { title: "Envoy documentation: load balancing", url: "https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancing", note: "Round robin, least request with power of two choices, ring hash, and outlier detection." },
    { title: "The Power of Two Choices in Randomized Load Balancing (Michael Mitzenmacher)", note: "The theory behind sampling two servers instead of one." },
  ],
};
