// Deep dive: Chapter 1, Networking 101: layers and the life of a request. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch1 = {
  hook: `<p>This chapter answers what happens between "the client wants something" and "the server starts working", and how much each step costs. That model explains why far-away users are slow, why services reuse connections and why DNS failover is never instant.</p>`,
  sections: [
    {
      id: "layers-and-ip",
      title: "Layers, IP and addresses",
      kicker: "The mental model",
      blocks: [
        {
          type: "text",
          html: `<p>Networking is split into <strong>layers</strong>: each one offers a simpler service to the layer above and relies only on the one below. Three matter for system design.</p>`,
        },
        {
          type: "table",
          headers: ["Layer", "Examples", "What it adds", "Runs in"],
          rows: [
            ["Network (L3)", "IP", "Addresses; moves packets hop by hop, best effort (drops, duplicates, reordering possible)", "Kernel and every router"],
            ["Transport (L4)", "TCP, UDP, QUIC", "Ports; TCP and QUIC add a reliable, ordered stream", "Kernel (QUIC: user space)"],
            ["Application (L7)", "HTTP, DNS, gRPC, WebSockets", "Meaning: \"get order 42\"", "Your process"],
          ],
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
          type: "keypoints",
          items: [
            "<strong>Kernel vs user space:</strong> kernel protocols are fast but slow to evolve; user-space protocols cost more CPU but ship with a deploy. That is why an L4 load balancer pushes more traffic per core than an L7 one, and why QUIC was built on UDP in user space.",
            "<strong>Private addresses</strong> (RFC 1918: <code>10.0.0.0/8</code>, <code>172.16.0.0/12</code>, <code>192.168.0.0/16</code>) only mean something inside one network. App servers, databases and caches live here and reach the internet through <strong>NAT</strong>.",
            "<strong>Public addresses</strong> are globally routable and are attack surface. Usually only the load balancer, gateway or CDN edge needs one.",
            "IPv4 has about 4.3 billion addresses and the central pool ran out in 2011, which is why NAT is everywhere; IPv6 runs alongside it rather than replacing it.",
          ],
        },
      ],
    },
    {
      id: "dns",
      title: "DNS: turning a name into an address",
      kicker: "The first step",
      blocks: [
        {
          type: "text",
          html: `<p>DNS lets clients use a stable name while you change the machines behind it. Answers are cached for the record's <strong>TTL</strong>, so a lookup usually costs one round trip to the resolver, or nothing.</p>`,
        },
        {
          type: "steps",
          title: "Resolving api.example.com with nothing cached",
          items: [
            "The OS stub resolver forwards the question to a <strong>recursive resolver</strong> (ISP, corporate, or public such as 8.8.8.8 or 1.1.1.1).",
            "A <strong>root server</strong> refers it to the <code>.com</code> servers.",
            "A <code>.com</code> <strong>TLD server</strong> refers it to the authoritative name servers for <code>example.com</code>.",
            "The <strong>authoritative server</strong> returns A (IPv4) or AAAA (IPv6) records, each with a TTL.",
            "The resolver and client cache the answer for the TTL.",
          ],
        },
        {
          type: "tradeoffs",
          prosLabel: "DNS load balancing and failover: good at",
          consLabel: "Limits",
          pros: [
            "Cheap and universal: every client already does DNS",
            "Spreads users across regions or load balancers coarsely, and can steer them to the nearest healthy region (weighted, latency-based and health-checked records)",
          ],
          cons: [
            "Long TTL means fewer lookups but slow changes; short TTL (30 to 60 s) means the reverse, and some caches ignore the TTL anyway",
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
      id: "round-trips",
      title: "Handshakes and counting round trips",
      kicker: "Latency",
      blocks: [
        {
          type: "text",
          html: `<p>Response time = <strong>round trips × RTT</strong> + <strong>server time</strong>. A cold HTTPS request pays DNS, a TCP handshake, a TLS handshake and the request itself before the first byte arrives, so distance multiplies.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>TCP:</strong> SYN, SYN-ACK, ACK. One round trip before the first request byte; both ends now hold per-connection state.",
            "<strong>TLS:</strong> 1.2 adds two round trips, 1.3 adds one. TLS 1.3 resumption allows 0-RTT data, which can be replayed, so it should only carry requests that are safe to repeat.",
            "<strong>Teardown:</strong> the side that closes first holds the socket in <code>TIME_WAIT</code> (60 s on Linux). Thousands of short connections per second to one server can exhaust the roughly 28,000 local ephemeral ports.",
          ],
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
          type: "table",
          headers: ["Path", "Typical RTT", "A cold 4-round-trip request spends"],
          rows: [
            ["Two servers in the same data center", "Well under 1 ms", "About 1 to 2 ms on the network"],
            ["Users and servers on the same continent", "Roughly 20 to 50 ms", "About 80 to 200 ms"],
            ["New York to London", "Roughly 70 to 80 ms", "About 300 ms"],
            ["Sydney to the US East Coast", "Roughly 200 ms or more", "About 800 ms or more"],
          ],
          note: "Ballpark figures; light in fiber covers roughly 200 km per millisecond, plus routing detours and queueing. The last column ignores server time.",
        },
        {
          type: "list",
          title: "Cutting network time",
          items: [
            "<strong>Reuse connections:</strong> HTTP keep-alive means only the first request pays the handshakes.",
            "<strong>Multiplex:</strong> HTTP/2 runs many requests over one connection; HTTP/3 does the same over QUIC and folds transport and TLS setup into one round trip.",
            "<strong>Move the endpoint closer:</strong> a CDN or edge proxy terminates TCP and TLS near the user and keeps warm connections to the origin.",
            "<strong>Cache DNS, use TLS 1.3 and session resumption.</strong>",
          ],
        },
        {
          type: "lab",
          id: "webRequest",
          caption: "Raise the round-trip time and the number of requests, then switch between a new connection per request, keep-alive and HTTP/2 to see how much of the wait is network rather than server work.",
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
      title: "Connections are state",
      kicker: "Operating it",
      blocks: [
        {
          type: "text",
          html: `<p>Every open connection costs kernel buffers, TLS keys and application context, and it is <strong>tied to one machine</strong>. If that server restarts, its clients must reconnect, and if they all do at once you get a reconnection storm. Inside a data center handshakes are cheap in time but not in CPU, which is why services use pools.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Connection per request", tone: "bad", html: "Simple, but every call pays handshakes and key-exchange CPU, and leaves sockets in <code>TIME_WAIT</code>. Fine for rare calls; wasteful at volume." },
            { title: "Pooled, reused connections", tone: "ok", html: "A few long-lived connections carry many requests. Standard for service-to-service calls and databases (HikariCP, PgBouncer in front of PostgreSQL, HTTP/2 or gRPC channels). Needs health checks and recycling." },
            { title: "Persistent client connections", tone: "warn", html: "One long-lived connection per user (WebSockets, SSE). Enables push, but each server holds many users' state, which complicates balancing, deploys and failover." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Load balancers, NAT gateways and firewalls silently drop connections idle past a timeout (often tens of seconds to several minutes). Long-lived connections need heartbeats or TCP keepalives shorter than the smallest idle timeout on the path.</p>`,
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
          html: `<p>A strong answer covers:</p>
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
          html: `<p>Optimizing server code when the latency budget is dominated by round trips. With global or mobile users, talk about round trips and distance first.</p>`,
        },
      ],
    },
  ],
  takeaways: [
    "IP moves packets best effort, the transport layer (TCP, UDP, QUIC) adds ports and optionally reliability, and the application layer carries meaning.",
    "DNS answers are cached for the TTL, so DNS changes and DNS failover are only as fast as the TTL allows.",
    "Latency is round trips times RTT plus server time; a cold HTTPS request needs several round trips, so reduce round trips and distance before tuning code.",
    "Connections are per-machine state: reuse them with keep-alive, HTTP/2 and pools, and plan how persistent ones are balanced, drained and re-established.",
  ],
  furtherReading: [
    { title: "High Performance Browser Networking (Ilya Grigorik)", url: "https://hpbn.co/", note: "Free online book; the TCP, TLS and latency chapters expand everything in this deep dive." },
    { title: "RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3", url: "https://www.rfc-editor.org/rfc/rfc8446", note: "The handshake in detail, including 0-RTT and its replay caveats." },
    { title: "RFC 1918: Address Allocation for Private Internets", url: "https://www.rfc-editor.org/rfc/rfc1918", note: "Where the 10/8, 172.16/12 and 192.168/16 ranges come from." },
  ],
};
