// Deep dive: Chapter 1, Networking 101: layers and the life of a request. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>Your API answers in 20 ms. You measured it: the handler, the database query and the JSON encoding together take 20 ms on the server. Then a customer in Sydney opens the app against your servers in Virginia and the first screen takes well over half a second to start rendering. Nobody touched the code. The extra time was spent before your handler ever ran.</p>
<p>That time went into looking up a name, opening a connection, agreeing on encryption keys and carrying bytes across an ocean, several times over. To reason about latency, failover and how many connections a server can hold, you need a working model of what actually happens between "the client wants something" and "the server starts working". This chapter builds that model one layer at a time and then follows a single request from start to finish.</p>`,
  sections: [
    {
      id: "why-layers",
      title: "Why networks are built in layers",
      kicker: "The mental model",
      blocks: [
        {
          type: "problem",
          html: `<p>Sending a web page across the world involves radio signals, copper, fiber, dozens of routers owned by different companies, lost packets, encryption and a request format both ends understand. No single program could reasonably handle all of that, and if every application had to, nothing would ever change without breaking everything else.</p>`,
        },
        {
          type: "idea",
          html: `<p>Split the job into <strong>layers</strong>. Each layer offers a simpler service to the layer above and relies only on the layer directly below. Your code asks for "a reliable stream of bytes to this host and port" and never thinks about wires, routes or retransmissions.</p>`,
        },
        {
          type: "text",
          html: `<p>The textbook OSI model has seven layers; the internet's actual stack (often called TCP/IP) has four or five. For system design, three of them do almost all the work:</p>
<ul>
<li><strong>Network layer (L3), IP.</strong> Gives every machine an address and moves individual packets toward that address, one router hop at a time.</li>
<li><strong>Transport layer (L4), TCP, UDP or QUIC.</strong> Adds port numbers so data reaches the right process, and (for TCP and QUIC) turns lossy packets into a reliable, ordered stream.</li>
<li><strong>Application layer (L7), HTTP, DNS, WebSockets, gRPC.</strong> Carries meaning: "get order 42", "here is the user's profile", "a new chat message arrived".</li>
</ul>
<p>Each layer wraps the one above it. An HTTP request becomes the payload of TCP segments, and each segment becomes the payload of an IP packet. On the way in, the receiver peels the layers off in reverse.</p>`,
        },
        {
          type: "diagram",
          title: "Encapsulation: each layer wraps the one above",
          caption: "An HTTP request travels as the payload of a TCP segment, which travels as the payload of an IP packet. IP and TCP are handled by the operating system kernel; HTTP is parsed by your process.",
          svg: `<svg viewBox="0 0 600 260" role="img" aria-label="An IP packet containing a TCP segment containing an HTTP message, with the layer and where each runs">
<rect x="40" y="50" width="130" height="56" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="105" y="74" text-anchor="middle" font-size="13" font-weight="700">IP header</text>
<text x="105" y="94" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">src, dst address</text>
<rect x="170" y="50" width="130" height="56" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="235" y="74" text-anchor="middle" font-size="13" font-weight="700">TCP header</text>
<text x="235" y="94" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">ports, seq, ack</text>
<rect x="300" y="50" width="260" height="56" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="430" y="74" text-anchor="middle" font-size="13" font-weight="700">HTTP message</text>
<text x="430" y="94" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">GET /orders/42 + headers</text>
<path d="M300 124 V130 H560 V124" fill="none" stroke-width="2" style="stroke: var(--dg-3)"/>
<text x="430" y="150" text-anchor="middle" font-size="12">Application (L7) message: your process</text>
<path d="M170 168 V174 H560 V168" fill="none" stroke-width="2" style="stroke: var(--dg-2)"/>
<text x="365" y="194" text-anchor="middle" font-size="12">Transport (L4) segment: OS kernel</text>
<path d="M40 212 V218 H560 V212" fill="none" stroke-width="2" style="stroke: var(--dg-1)"/>
<text x="300" y="238" text-anchor="middle" font-size="12">Network (L3) packet: OS kernel, then every router</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Kernel versus user space</h3>
<p>Where each layer runs matters for performance and for how easily it can change. IP and TCP live in the operating system kernel: fast, battle tested, and slow to evolve because changing them means changing operating systems and the routers and firewalls in between. HTTP, gRPC and your JSON live in user space, inside your process. They cost more CPU per request but you can upgrade them with a deploy. That split explains why a Layer 4 load balancer can push far more traffic per core than a Layer 7 one (it never parses the request), and why QUIC was built on top of UDP in user space rather than as a new kernel protocol.</p>`,
        },
        {
          type: "quiz",
          q: "A teammate says \"we need messages to arrive in order\" and another says \"we need to route requests by URL path\". Which layers are they talking about?",
          options: [
            "Both are network layer (IP) concerns",
            "Ordering is a transport concern; routing by path is an application concern",
            "Ordering is an application concern; routing by path is a transport concern",
            "Both are application layer concerns",
          ],
          answer: 1,
          explain: "In-order delivery is something TCP (transport) provides on top of IP's unordered packets. A URL path only exists inside an HTTP request, so only something that parses Layer 7 can route on it.",
        },
      ],
    },
    {
      id: "ip-addresses",
      title: "IP: addresses and best-effort packets",
      kicker: "Network layer",
      blocks: [
        {
          type: "text",
          html: `<p>IP has one job: get a packet from one address to another. Each router looks at the destination address, picks the next hop from its routing table and forwards the packet. No router remembers anything about your conversation, and nothing guarantees delivery. Packets can be dropped when a queue overflows, delivered twice, or arrive out of order because they took different paths. This is called <strong>best effort</strong>, and everything above IP has to live with it.</p>
<p>That design is deliberate. Keeping routers simple and stateless is what lets the internet scale to billions of devices; the hard work of reliability is pushed to the two endpoints, which care about it.</p>`,
        },
        {
          type: "text",
          html: `<h3>Public and private addresses</h3>
<p>When a machine boots it usually asks a <strong>DHCP</strong> server for an address. What kind of address it gets decides who can reach it:</p>
<ul>
<li><strong>Private</strong> ranges, reserved by RFC 1918: <code>10.0.0.0/8</code>, <code>172.16.0.0/12</code> and <code>192.168.0.0/16</code>. They are reused in millions of networks, so they only mean something inside one network. Internet routers will not carry them.</li>
<li><strong>Public</strong> addresses are handed out through the regional internet registries and are globally unique, so routers everywhere know which network to send them to.</li>
</ul>
<p>IPv4 has only about 4.3 billion addresses, and the central pool ran out in 2011. That shortage is why <strong>NAT</strong> (network address translation) is everywhere: a home router or a cloud NAT gateway lets many private machines share one public address for outbound traffic. IPv6, with 128-bit addresses, removes the shortage but is still deployed alongside IPv4 rather than replacing it.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Public address", tone: "info", html: "Reachable from anywhere on the internet. Needed by anything clients connect to directly: load balancers, CDN edges, API gateways. Every public endpoint is also attack surface." },
            { title: "Private address", tone: "ok", html: "Reachable only inside the network (or over a VPN or peering link). The normal home for application servers, databases and caches. Outbound internet access goes through NAT." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "AWS VPC", title: "Public and private subnets", html: "The standard layout puts load balancers in public subnets and application servers and databases in private subnets with no public IPs. Instances in private subnets reach the internet, for example to download packages, through a NAT gateway." },
            { org: "Home networks", title: "One public IP, many devices", html: "Your laptop, phone and TV typically get <code>192.168.x.x</code> addresses from the router's DHCP server and share the router's single public address through NAT. That is also why nothing on the internet can open a connection to your laptop unless the router is told to forward it, a problem WebRTC has to work around." },
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>In a design diagram, it is worth one sentence to say which components have public addresses. Usually the answer is "only the load balancer or gateway", which quietly shows you are thinking about attack surface and network boundaries.</p>`,
        },
      ],
    },
    {
      id: "dns",
      title: "DNS: turning a name into an address",
      kicker: "The first step",
      blocks: [
        {
          type: "problem",
          html: `<p>Clients want to reach <code>api.example.com</code>, but IP routes on numbers. You also want the freedom to change which machines sit behind that name, move to another region, or spread users over several load balancers, without shipping a new app to every phone.</p>`,
        },
        {
          type: "steps",
          title: "Resolving api.example.com with nothing cached",
          items: [
            "The app asks the operating system's stub resolver, which forwards the question to a <strong>recursive resolver</strong> (your ISP's, a corporate one, or a public one such as 8.8.8.8 or 1.1.1.1).",
            "The recursive resolver asks a <strong>root server</strong>, which does not know the answer but replies with the servers responsible for <code>.com</code>.",
            "It asks a <code>.com</code> <strong>TLD server</strong>, which replies with the authoritative name servers for <code>example.com</code>.",
            "It asks the <strong>authoritative server</strong>, which returns the A (IPv4) or AAAA (IPv6) records for <code>api.example.com</code>, each with a TTL.",
            "The recursive resolver caches the answer for the TTL and returns it to the client, which usually caches it as well.",
          ],
        },
        {
          type: "text",
          html: `<p>In practice most lookups never get past step one or two, because the recursive resolver already has the answer (or at least the <code>.com</code> servers) cached. From the client's point of view a lookup typically costs about one round trip to its resolver, or nothing when the answer is cached locally.</p>
<p>The <strong>TTL</strong> (time to live) on each record is the key design lever. A long TTL (hours) means fewer lookups and faster clients. A short TTL (30 to 60 seconds) means a change takes effect quickly. You cannot have both, and you cannot force a resolver that already cached your old answer to forget it early. "DNS propagation" is just every cache along the way waiting out its copy of the TTL, plus some resolvers and clients that hold answers longer than they should.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Root servers", title: "13 names, many machines", html: "There are 13 root server identities, <code>a.root-servers.net</code> through <code>m.root-servers.net</code>, run by 12 organizations. Each is served by many machines around the world using anycast, so the same address is answered by whichever instance is nearest." },
            { org: "Amazon Route 53", title: "DNS as a traffic tool", html: "Managed DNS services can return different answers per query: weighted records split traffic between endpoints, latency-based records send users to the closest region, and health checks remove a failed endpoint from answers so clients fail over." },
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "DNS load balancing and failover: good at",
          consLabel: "Limits",
          pros: [
            "Cheap and universal: every client already does DNS",
            "Spreads users across regions or load balancers coarsely",
            "Can steer users to the nearest healthy region",
          ],
          cons: [
            "Changes are only as fast as the TTL, and some caches ignore it",
            "Clients pick an address and stick with it; DNS can't see per-server load",
            "A failed server stays in some caches until they expire, so clients need retries",
          ],
        },
        {
          type: "quiz",
          q: "Your primary region dies and you update DNS to point at the standby region. The record's TTL was 1 hour. What happens?",
          options: [
            "All clients switch within a few seconds",
            "Clients switch gradually over roughly the next hour as cached answers expire, and some take longer",
            "No client switches until you restart the authoritative server",
            "Clients switch immediately because DNS bypasses caches during outages",
          ],
          answer: 1,
          explain: "Every resolver and client that cached the old answer keeps using it until its copy expires, so failover is spread over the TTL (and longer for caches that hold answers too long). This is why records used for failover get short TTLs, and why many systems fail over behind a stable address instead, such as an anycast IP or a load balancer.",
        },
      ],
    },
    {
      id: "handshakes",
      title: "Handshakes: the round trips before the first byte",
      kicker: "Connection setup",
      blocks: [
        {
          type: "text",
          html: `<p>Once the client has an address, it cannot just send the request. TCP needs both ends to agree on starting sequence numbers and set aside buffers, and HTTPS needs both ends to agree on encryption keys and the client to check the server's certificate. Each agreement costs messages going back and forth, and every back-and-forth costs one <strong>round-trip time</strong> (RTT).</p>
<h3>The TCP three-way handshake</h3>
<p>The client sends <strong>SYN</strong> ("I want to connect, my sequence numbers start here"). The server answers <strong>SYN-ACK</strong> ("acknowledged, and mine start here"). The client replies <strong>ACK</strong> and may send its first data right behind it. Cost: one full round trip before any request byte leaves the client. Both ends now hold state for this connection: sequence numbers, send and receive buffers, timers.</p>
<h3>The TLS handshake</h3>
<p>On top of TCP, TLS negotiates a cipher, exchanges key material and proves the server's identity with a certificate chain. <strong>TLS 1.2</strong> needs two round trips before application data can flow. <strong>TLS 1.3</strong> (RFC 8446, 2018) redesigned the exchange so it takes one, and also allows a resumed session to send data immediately ("0-RTT"), with the caveat that such early data can be replayed by an attacker, so it should only carry requests that are safe to repeat.</p>`,
        },
        {
          type: "diagram",
          title: "A cold HTTPS request, round trip by round trip",
          caption: "With nothing cached or reused, the client spends four round trips (DNS, TCP, TLS 1.3, then the request itself) plus the server's processing time before the response arrives. The client's TLS Finished message travels together with the HTTP request.",
          svg: `<svg viewBox="0 0 600 412" role="img" aria-label="Sequence diagram of DNS lookup, TCP handshake, TLS 1.3 handshake and HTTP request between a client, a DNS resolver and a server">
<defs><marker id="cc1-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ink)"/></marker></defs>
<text x="60" y="28" text-anchor="middle" font-size="13" font-weight="700">Resolver</text>
<text x="210" y="28" text-anchor="middle" font-size="13" font-weight="700">Client</text>
<text x="430" y="28" text-anchor="middle" font-size="13" font-weight="700">Server</text>
<line x1="60" y1="38" x2="60" y2="372" stroke-width="2" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="210" y1="38" x2="210" y2="372" stroke-width="2" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="430" y1="38" x2="430" y2="372" stroke-width="2" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="210" y1="60" x2="62" y2="72" stroke-width="2" marker-end="url(#cc1-arrow)" style="stroke: var(--dg-4)"/>
<text x="135" y="54" text-anchor="middle" font-size="12">DNS query</text>
<line x1="60" y1="84" x2="208" y2="96" stroke-width="2" marker-end="url(#cc1-arrow)" style="stroke: var(--dg-4)"/>
<text x="135" y="82" text-anchor="middle" font-size="12">IP address</text>
<line x1="210" y1="120" x2="428" y2="134" stroke-width="2" marker-end="url(#cc1-arrow)" style="stroke: var(--dg-1)"/>
<text x="320" y="116" text-anchor="middle" font-size="12">SYN</text>
<line x1="430" y1="150" x2="212" y2="164" stroke-width="2" marker-end="url(#cc1-arrow)" style="stroke: var(--dg-1)"/>
<text x="320" y="150" text-anchor="middle" font-size="12">SYN-ACK</text>
<line x1="210" y1="180" x2="428" y2="194" stroke-width="2" marker-end="url(#cc1-arrow)" style="stroke: var(--dg-1)"/>
<text x="320" y="179" text-anchor="middle" font-size="12">ACK</text>
<line x1="210" y1="220" x2="428" y2="234" stroke-width="2" marker-end="url(#cc1-arrow)" style="stroke: var(--dg-2)"/>
<text x="320" y="218" text-anchor="middle" font-size="12">ClientHello</text>
<line x1="430" y1="250" x2="212" y2="264" stroke-width="2" marker-end="url(#cc1-arrow)" style="stroke: var(--dg-2)"/>
<text x="320" y="250" text-anchor="middle" font-size="12">ServerHello, cert, Finished</text>
<line x1="210" y1="290" x2="424" y2="304" stroke-width="2" marker-end="url(#cc1-arrow)" style="stroke: var(--dg-3)"/>
<text x="320" y="288" text-anchor="middle" font-size="12">Finished + GET /</text>
<rect x="424" y="306" width="12" height="28" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<line x1="430" y1="340" x2="212" y2="354" stroke-width="2" marker-end="url(#cc1-arrow)" style="stroke: var(--dg-3)"/>
<text x="320" y="340" text-anchor="middle" font-size="12">200 OK + page</text>
<text x="470" y="84" font-size="12" style="fill: var(--dg-muted)">DNS: ~1 RTT</text>
<text x="470" y="162" font-size="12" style="fill: var(--dg-muted)">TCP: 1 RTT</text>
<text x="470" y="246" font-size="12" style="fill: var(--dg-muted)">TLS 1.3: 1 RTT</text>
<text x="470" y="316" font-size="12" style="fill: var(--dg-muted)">HTTP: 1 RTT</text>
<text x="470" y="334" font-size="12" style="fill: var(--dg-muted)">+ server time</text>
<text x="300" y="400" text-anchor="middle" font-size="12">At 100 ms RTT: about 400 ms plus server time before the response arrives</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Teardown</h3>
<p>Closing is per direction: one side sends <strong>FIN</strong>, the other acknowledges, then sends its own FIN, which is acknowledged in turn. It happens after the response, so users rarely wait on it. Servers still pay for it, though. The side that closes first keeps the connection in a <code>TIME_WAIT</code> state for a while (60 seconds on Linux) so that stray late packets from the old connection cannot be mistaken for a new one. A client that opens and closes thousands of short connections per second to the same server can run out of local ports this way, one more reason to reuse connections.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "TCP costs one round trip before the first request byte.",
            "TLS 1.3 adds one more (TLS 1.2 adds two).",
            "Both ends keep per-connection state from the handshake until well after the close.",
          ],
        },
      ],
    },
    {
      id: "counting-round-trips",
      title: "Counting round trips: where the time actually goes",
      kicker: "Latency",
      blocks: [
        {
          type: "text",
          html: `<p>Total response time splits cleanly into two parts. <strong>Network time</strong> is the number of round trips multiplied by the RTT. <strong>Server time</strong> is the work your code and its dependencies do. They respond to completely different fixes, so the first question about a slow request is which one dominates.</p>
<p>RTT is set mostly by physical distance (light in fiber covers roughly 200 km per millisecond), plus routing detours and queueing. Some rough orders of magnitude:</p>`,
        },
        {
          type: "table",
          headers: ["Path", "Typical RTT", "A cold 4-round-trip request spends"],
          rows: [
            ["Two servers in the same data center", "Well under 1 ms", "About 1 to 2 ms on the network"],
            ["Users and servers on the same continent", "Roughly 20 to 50 ms", "About 80 to 200 ms"],
            ["New York to London", "Roughly 70 to 80 ms", "About 300 ms"],
            ["Sydney to the US East Coast", "Roughly 200 ms or more", "About 800 ms or more"],
            ["Mobile network, last mile alone", "Tens of ms, highly variable", "Adds to whatever distance costs"],
          ],
          note: "Ballpark figures; actual RTT depends on cable routes, peering and congestion. The last column ignores server time.",
        },
        {
          type: "text",
          html: `<p>Go back to the opening scenario. A 20 ms handler is invisible next to four round trips at 200 ms each. Making the code twice as fast saves 10 ms; removing two round trips saves 400. When users are far away or on mobile networks, the cheapest wins are almost always about <em>fewer</em> or <em>shorter</em> round trips:</p>
<ul>
<li><strong>Reuse connections.</strong> HTTP keep-alive sends many requests over one TCP and TLS session, so only the first request pays for the handshakes.</li>
<li><strong>Multiplex.</strong> HTTP/2 runs many concurrent requests over one connection instead of opening six in parallel, and HTTP/3 does the same over QUIC, which also folds the transport and TLS handshakes into a single round trip.</li>
<li><strong>Move the endpoint closer.</strong> A CDN or edge proxy terminates TCP and TLS a few milliseconds from the user and keeps warm, long-lived connections back to your origin.</li>
<li><strong>Cache DNS and use TLS 1.3 and session resumption</strong> to shave the remaining setup.</li>
</ul>`,
        },
        {
          type: "lab",
          id: "webRequest",
          caption: "Raise the round-trip time and the number of requests, then switch between a new connection per request, keep-alive and HTTP/2 to see how much of the wait is network rather than server work.",
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Inside a data center the picture flips. With sub-millisecond RTTs, handshakes are cheap in time but not in CPU: at tens of thousands of requests per second, opening a new TLS connection for every call between two services can burn more CPU than the requests themselves. That is why service-to-service clients use connection pools, and why database proxies such as PgBouncer exist.</p>`,
        },
        {
          type: "quiz",
          q: "A page makes 10 sequential HTTPS requests to the same server at 100 ms RTT, opening a fresh connection (TCP + TLS 1.3) for each. DNS is cached. Roughly how much network time does keep-alive save?",
          options: ["About 100 ms", "About 900 ms", "About 1,800 ms", "Nothing; keep-alive only saves server CPU"],
          answer: 2,
          explain: "Each fresh connection costs 2 round trips of setup (TCP and TLS 1.3) before its 1 round trip of request. With keep-alive only the first request pays setup, so 9 requests each save 2 RTTs: 18 round trips, about 1,800 ms.",
        },
      ],
    },
    {
      id: "connections-are-state",
      title: "Connections are state, and state has to be managed",
      kicker: "Operating it",
      blocks: [
        {
          type: "text",
          html: `<p>An open TCP connection is not free on either end. The kernel keeps a control block, send and receive buffers and timers for it; a TLS session adds keys and buffers; your application usually adds a goroutine, a thread or at least an event-loop entry plus per-connection context. A server holding a few thousand short-lived HTTP connections barely notices. A server holding a million long-lived WebSocket connections spends gigabytes of memory on them and must be tuned for file descriptor limits.</p>
<p>That state is also <strong>tied to one machine</strong>. A connection cannot be moved to another server; if the server restarts, every connection on it breaks and every client has to reconnect, and if they all do so at once you get a reconnection storm. Designs that rely on persistent connections, such as chat, live dashboards and multiplayer games, need answers for how connections are balanced across servers, how a deploy drains them gradually, and how a client finds its way back.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Connection per request", tone: "bad", html: "Simple and stateless between requests, but every call pays handshakes, CPU for key exchange, and leaves sockets in <code>TIME_WAIT</code>. Fine for rare calls; wasteful at volume." },
            { title: "Pooled, reused connections", tone: "ok", html: "A small number of long-lived connections carry many requests. The standard for service-to-service calls and databases (HikariCP in Java, PgBouncer in front of PostgreSQL, HTTP/2 or gRPC channels). Needs health checks and recycling of stale connections." },
            { title: "Persistent client connections", tone: "warn", html: "One long-lived connection per user (WebSockets, SSE). Enables push, but turns each server into the holder of many users' state, which complicates load balancing, deploys and failover." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL", title: "A process per connection", html: "PostgreSQL forks a backend process for every client connection, so thousands of direct connections cost a lot of memory and context switching. Teams put a pooler such as PgBouncer in front so thousands of application connections share a much smaller set of database connections." },
            { org: "Linux", title: "Ephemeral ports", html: "Outbound connections use a local port from the ephemeral range (by default 32768 to 60999 on Linux, about 28,000 ports). A client hammering one destination with short connections, each lingering in <code>TIME_WAIT</code>, can exhaust that range; connection reuse is the usual fix." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Load balancers, NAT gateways and firewalls also track connections and silently drop ones that sit idle past a timeout (often in the range of tens of seconds to several minutes). Long-lived connections need application-level heartbeats or TCP keepalives shorter than the smallest idle timeout on the path, or they will die without either end noticing until the next write.</p>`,
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
          html: `<p>You will rarely be asked to recite the layers, but this model sits under many interview decisions: why a far-away region is slow, why services reuse connections, why a WebSocket design needs extra infrastructure, and why DNS failover is not instant. The classic "what happens when you type a URL" question is less common today, yet answering it crisply is a good test of whether you can account for latency step by step.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Points that land well:</p>
<ol>
<li>Clients find services through DNS; short TTLs make failover faster but DNS is still coarse and cached.</li>
<li>A cold HTTPS request costs DNS + TCP + TLS + request: three to four round trips before the first byte, so distance multiplies.</li>
<li>Reuse connections everywhere: keep-alive and HTTP/2 at the edge, pools between services and to databases.</li>
<li>Persistent connections are per-server state; say how you balance, drain and reconnect them.</li>
<li>Only the edge (load balancer, gateway, CDN) needs public addresses; the rest lives in private networks.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Optimizing server code when the latency budget is dominated by round trips. If the interviewer mentions global users or mobile clients, talk about the number of round trips and the distance first, then about server time.</p>`,
        },
        {
          type: "quiz",
          q: "Two internal services exchange 50,000 requests per second over HTTPS, opening a new connection per request. CPU on both sides is high even though each request is trivial. What is the best first fix?",
          options: [
            "Switch from TCP to UDP",
            "Use a pool of persistent connections (or HTTP/2 / gRPC channels) so handshakes happen rarely",
            "Increase the DNS TTL",
            "Move both services to bigger machines",
          ],
          answer: 1,
          explain: "Each new connection pays a TCP handshake and a TLS key exchange, and the key exchange is CPU heavy. Reusing a small pool of long-lived connections, or multiplexing calls over HTTP/2, removes almost all of that cost. Dropping to UDP would throw away reliability without addressing the real issue.",
        },
      ],
    },
  ],
  takeaways: [
    "Three layers matter in design: IP moves packets on a best-effort basis, the transport layer (TCP, UDP, QUIC) adds ports and optionally reliability, and the application layer (HTTP, DNS, gRPC) carries meaning.",
    "Private addresses work only inside one network; only the components clients reach directly, usually load balancers and gateways, need public ones.",
    "DNS maps names to addresses through cached, TTL-bound answers, so DNS changes and DNS failover are only as fast as the TTL allows.",
    "A cold HTTPS request pays DNS, a TCP handshake, a TLS handshake (1 round trip in TLS 1.3, 2 in TLS 1.2) and the request itself: several round trips before the first byte.",
    "Latency is round trips times RTT plus server time. Far-away and mobile users are dominated by the first term, so reduce round trips and distance before tuning code.",
    "Connections are per-machine state: reuse them with keep-alive, HTTP/2 and pools, and plan how persistent connections are balanced, drained and re-established.",
  ],
  furtherReading: [
    { title: "High Performance Browser Networking (Ilya Grigorik)", url: "https://hpbn.co/", note: "Free online book; the TCP, TLS and latency chapters expand everything in this deep dive." },
    { title: "RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3", url: "https://www.rfc-editor.org/rfc/rfc8446", note: "The handshake in detail, including 0-RTT and its replay caveats." },
    { title: "RFC 1918: Address Allocation for Private Internets", url: "https://www.rfc-editor.org/rfc/rfc1918", note: "Where the 10/8, 172.16/12 and 192.168/16 ranges come from." },
  ],
};
