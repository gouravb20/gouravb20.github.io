// Deep dive: Chapter 3, HTTP and API styles: REST, GraphQL, gRPC. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>This chapter covers the HTTP basics every API relies on and when to shape an API as REST, GraphQL or gRPC. Each style fixes a specific pain: predictable public endpoints, under- and over-fetching, or costly internal calls.</p>`,
  sections: [
    {
      id: "http-basics",
      title: "HTTP: methods, status codes and statelessness",
      kicker: "The foundation",
      blocks: [
        {
          type: "text",
          html: `<p>A request is a <strong>method</strong>, a <strong>path</strong>, <strong>headers</strong> and an optional <strong>body</strong>; a response is a <strong>status code</strong>, headers and an optional body. HTTP/2 and HTTP/3 encode the same fields in binary frames, so APIs rarely care which version carries them.</p>`,
        },
        {
          type: "code",
          lang: "http",
          title: "One request and its response, as HTTP/1.1 puts them on the wire",
          code: `GET /orders/42 HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOi...
Accept: application/json
Accept-Encoding: gzip, br

HTTP/1.1 200 OK
Content-Type: application/json
Content-Encoding: br
Cache-Control: private, max-age=60
ETag: "v7"

{"id": 42, "status": "shipped", "total_cents": 2599}`,
        },
        {
          type: "table",
          headers: ["Method", "Typical use", "Safe (no side effects)", "Idempotent"],
          rows: [
            ["GET", "Read a resource or a list", "Yes", "Yes"],
            ["POST", "Create (server picks the ID) or trigger an action", "No", "No"],
            ["PUT", "Replace a resource, or create it at a known ID", "No", "Yes"],
            ["PATCH", "Change some fields", "No", "Not guaranteed"],
            ["DELETE", "Remove a resource", "No", "Yes"],
          ],
          note: "Idempotent: repeating the request leaves the server in the same state as sending it once. It decides what a client may retry blindly after a timeout.",
        },
        {
          type: "keypoints",
          items: [
            "<strong>Stateless:</strong> each request carries everything needed (token, input), so any server can handle any request. Shared state lives in signed tokens, databases or caches.",
            "<strong>Status codes are a contract:</strong> 2xx success, 3xx look elsewhere (304: use your cache), 4xx caller error (don't repeat unchanged), 5xx server error (retry may work). <code>200</code> with an error body hides failures from clients, retries and monitoring.",
            "<strong>Content negotiation</strong> (<code>Accept-Encoding</code> / <code>Content-Encoding</code>) lets old and new clients coexist; the same pattern works for versions and optional features.",
            "<strong>HTTPS</strong> secures the channel only. It does not authenticate users or validate input.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>Never trust the request for identity.</strong> If <code>GET /orders?userId=42</code> returns user 42's orders to whoever asks, any user can read anyone's orders. Derive identity from a verified token, then check access to this specific resource. OWASP ranks this flaw, broken object-level authorization, as the top API security risk.</p>`,
        },
      ],
    },
    {
      id: "rest",
      title: "REST: model resources, not procedures",
      kicker: "The default style",
      blocks: [
        {
          type: "idea",
          html: `<p>Expose <strong>resources</strong> (nouns) and let standard HTTP methods carry the verb. Once you know <code>/orders</code>, you can guess how to list, fetch, create and cancel orders.</p>`,
        },
        {
          type: "code",
          lang: "text",
          title: "A small REST surface for orders",
          code: `GET    /orders?status=open&cursor=abc   list my open orders (paginated)
GET    /orders/{id}                     one order
POST   /orders                          create an order (server assigns the id)
PATCH  /orders/{id}                     change fields, e.g. {"status": "cancelled"}
GET    /orders/{id}/items               items that belong to an order
POST   /orders/{id}/refunds             create a refund for an order`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Actions</strong> become a state change (<code>PATCH /orders/42</code> with <code>{\"status\": \"cancelled\"}</code>) or a resource of their own when they have data and a lifecycle (<code>POST /orders/42/refunds</code>).",
            "<strong>It fits HTTP infrastructure:</strong> GETs cache in browsers and CDNs via <code>Cache-Control</code>; an <code>ETag</code> turns \"has this changed?\" into a tiny <code>304</code>. Every language, proxy and <code>curl</code> understands it.",
            "Stripe models payments as resources and accepts an <code>Idempotency-Key</code> header so clients can retry POSTs safely.",
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>RPC disguised as REST: <code>POST /getUser</code>, <code>GET /deleteOrder?id=7</code>. Verbs in paths, reads that can't be cached, and a GET that deletes data (a prefetcher or crawler could trigger it).</p>`,
        },
      ],
    },
    {
      id: "graphql",
      title: "Under-fetching, over-fetching and GraphQL",
      kicker: "When REST strains",
      blocks: [
        {
          type: "text",
          html: `<p>Fine-grained resources make a screen pay many round trips (<strong>under-fetching</strong>); a kitchen-sink endpoint ships fields nobody shows (<strong>over-fetching</strong>). <strong>GraphQL</strong> (Facebook, open-sourced 2015) lets the client ask for exactly the shape it needs from one endpoint backed by a typed schema.</p>`,
        },
        {
          type: "code",
          lang: "graphql",
          title: "A friends screen in one request",
          code: `query HomeScreen {
  me {
    friends(first: 20) {
      name
      avatarUrl(size: 64)
      groups { name }
    }
  }
}`,
        },
        {
          type: "text",
          html: `<p>Each field has a <strong>resolver</strong>. Naively, the <code>groups</code> resolver runs once per friend: 21 queries for one request, the <strong>N+1 problem</strong>. A DataLoader-style batch collects the IDs in one tick and fetches them in a single query.</p>`,
        },
        {
          type: "lab",
          id: "apiFetch",
          caption: "Load the same screen with fine-grained REST, a kitchen-sink endpoint and GraphQL. Compare round trips, bytes transferred and database queries, then turn on resolver batching.",
        },
        {
          type: "tradeoffs",
          prosLabel: "GraphQL is good at",
          consLabel: "GraphQL costs",
          pros: [
            "One round trip per screen, with exactly the needed fields",
            "Clients change what they fetch without backend changes",
            "A typed schema that doubles as documentation",
          ],
          cons: [
            "Resolvers cause N+1 queries unless you batch",
            "Arbitrary queries can be very expensive; you need depth and cost limits or persisted queries",
            "HTTP caching is harder: queries are usually POSTs to one URL",
            "Authorization must be enforced per field and per object",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>A lighter alternative is a <strong>backend for frontend</strong> (BFF): a thin server per client type that calls fine-grained services and returns exactly what its screens need. No new query language, but another service to own.</p>`,
        },
      ],
    },
    {
      id: "grpc",
      title: "gRPC and Protocol Buffers",
      kicker: "Inside the backend",
      blocks: [
        {
          type: "text",
          html: `<p>Between your own services, JSON's repeated field names and text parsing are overhead at tens of thousands of calls per second. <strong>gRPC</strong> (Google, open-sourced 2015) defines the API in a schema, generates typed code and sends compact binary Protocol Buffers over HTTP/2.</p>`,
        },
        {
          type: "code",
          lang: "protobuf",
          title: "A .proto file: the contract both sides generate code from",
          code: `service Users {
  rpc GetUser (GetUserRequest) returns (User);
  rpc WatchUsers (WatchRequest) returns (stream User);
}

message User {
  int64  id     = 1;
  string name   = 2;
  string email  = 3;
}`,
        },
        {
          type: "diagram",
          title: "The same record in JSON and in Protocol Buffers",
          caption: "{\"id\":150,\"name\":\"Ada\"} is 23 bytes of JSON. The protobuf encoding is 8 bytes: a tag byte and a varint for the id, then a tag byte, a length and the raw characters for the name.",
          svg: `<svg viewBox="0 0 620 230" role="img" aria-label="Byte-by-byte comparison of a 23-byte JSON message and an 8-byte Protocol Buffers message">
<text x="30" y="30" font-size="13" font-weight="700">JSON: 23 bytes</text>
<rect x="30" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="54" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="78" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="102" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="126" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="150" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="174" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="198" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="222" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="246" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="270" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="294" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="318" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="342" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="366" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="390" y="42" width="22" height="30" style="fill: var(--dg-4-soft); stroke: var(--dg-4)"/>
<rect x="414" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="438" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="462" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="486" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="510" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="534" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="558" y="42" width="22" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="41" y="62" text-anchor="middle" font-size="13">{</text>
<text x="65" y="62" text-anchor="middle" font-size="13">"</text>
<text x="89" y="62" text-anchor="middle" font-size="13">i</text>
<text x="113" y="62" text-anchor="middle" font-size="13">d</text>
<text x="137" y="62" text-anchor="middle" font-size="13">"</text>
<text x="161" y="62" text-anchor="middle" font-size="13">:</text>
<text x="185" y="62" text-anchor="middle" font-size="13">1</text>
<text x="209" y="62" text-anchor="middle" font-size="13">5</text>
<text x="233" y="62" text-anchor="middle" font-size="13">0</text>
<text x="257" y="62" text-anchor="middle" font-size="13">,</text>
<text x="281" y="62" text-anchor="middle" font-size="13">"</text>
<text x="305" y="62" text-anchor="middle" font-size="13">n</text>
<text x="329" y="62" text-anchor="middle" font-size="13">a</text>
<text x="353" y="62" text-anchor="middle" font-size="13">m</text>
<text x="377" y="62" text-anchor="middle" font-size="13">e</text>
<text x="401" y="62" text-anchor="middle" font-size="13">"</text>
<text x="425" y="62" text-anchor="middle" font-size="13">:</text>
<text x="449" y="62" text-anchor="middle" font-size="13">"</text>
<text x="473" y="62" text-anchor="middle" font-size="13">A</text>
<text x="497" y="62" text-anchor="middle" font-size="13">d</text>
<text x="521" y="62" text-anchor="middle" font-size="13">a</text>
<text x="545" y="62" text-anchor="middle" font-size="13">"</text>
<text x="569" y="62" text-anchor="middle" font-size="13">}</text>
<text x="30" y="92" font-size="12" style="fill: var(--dg-muted)">Shaded: field names, repeated in every message</text>
<text x="30" y="124" font-size="13" font-weight="700">Protocol Buffers: 8 bytes</text>
<rect x="30" y="136" width="46" height="30" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="80" y="136" width="46" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="130" y="136" width="46" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="180" y="136" width="46" height="30" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<rect x="230" y="136" width="46" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="280" y="136" width="46" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="330" y="136" width="46" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<rect x="380" y="136" width="46" height="30" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="53" y="156" text-anchor="middle" font-size="13">08</text>
<text x="103" y="156" text-anchor="middle" font-size="13">96</text>
<text x="153" y="156" text-anchor="middle" font-size="13">01</text>
<text x="203" y="156" text-anchor="middle" font-size="13">12</text>
<text x="253" y="156" text-anchor="middle" font-size="13">03</text>
<text x="303" y="156" text-anchor="middle" font-size="13">41</text>
<text x="353" y="156" text-anchor="middle" font-size="13">64</text>
<text x="403" y="156" text-anchor="middle" font-size="13">61</text>
<path d="M30 174 V180 H176 V174" fill="none" stroke-width="2" style="stroke: var(--dg-2)"/>
<text x="103" y="198" text-anchor="middle" font-size="12">tag: field 1, varint</text>
<text x="103" y="216" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">value 150</text>
<path d="M180 174 V180 H426 V174" fill="none" stroke-width="2" style="stroke: var(--dg-3)"/>
<text x="303" y="198" text-anchor="middle" font-size="12">tag: field 2, length-delimited</text>
<text x="303" y="216" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">length 3, then A d a</text>
<text x="450" y="146" font-size="12" style="fill: var(--dg-muted)">Shaded: tag bytes.</text>
<text x="450" y="164" font-size="12" style="fill: var(--dg-muted)">No names on the wire;</text>
<text x="450" y="182" font-size="12" style="fill: var(--dg-muted)">the schema maps field</text>
<text x="450" y="200" font-size="12" style="fill: var(--dg-muted)">numbers back to names.</text>
</svg>`,
        },
        {
          type: "keypoints",
          items: [
            "<strong>Field numbers, not names, go on the wire</strong>, with varint integers. Unknown numbers are skipped, so old and new versions interoperate as long as nobody reuses a number.",
            "<strong>Generated stubs</strong> in many languages: a renamed field is a compile error, not an incident.",
            "<strong>Deadlines</strong> propagate across calls, and four call shapes (unary, server, client and bidirectional streaming) share long-lived HTTP/2 connections.",
            "<strong>Browsers</strong> can't speak it directly: use gRPC-Web through a proxy such as Envoy, or REST at the edge.",
          ],
        },
        {
          type: "lab",
          id: "protobufSize",
          caption: "Edit the user record and compare the real JSON and protobuf encodings byte for byte. Try a large id, an empty string and a long list of tags.",
        },
      ],
    },
    {
      id: "choosing",
      title: "Choosing a style",
      kicker: "Putting it together",
      blocks: [
        {
          type: "text",
          html: `<p>A common split: REST (or GraphQL for varied clients) at the edge through a gateway, gRPC between internal services. Starting with REST everywhere is also perfectly reasonable.</p>`,
        },
        {
          type: "diagram",
          title: "A common split",
          caption: "External clients use REST over HTTPS through a gateway; internal service-to-service calls use gRPC. Starting with REST everywhere is also perfectly reasonable.",
          svg: `<svg viewBox="0 0 620 240" role="img" aria-label="Browsers, mobile apps and partners call an API gateway over REST; the gateway calls internal services over gRPC">
<defs><marker id="cc3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="40" width="120" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="65" text-anchor="middle" font-size="13">Browser</text>
<rect x="20" y="100" width="120" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="125" text-anchor="middle" font-size="13">Mobile app</text>
<rect x="20" y="160" width="120" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<text x="80" y="185" text-anchor="middle" font-size="13">Partner</text>
<rect x="230" y="90" width="130" height="60" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="295" y="117" text-anchor="middle" font-size="13" font-weight="700">API gateway</text>
<text x="295" y="135" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">auth, rate limits</text>
<rect x="450" y="40" width="150" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="525" y="65" text-anchor="middle" font-size="13">Orders service</text>
<rect x="450" y="100" width="150" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="525" y="125" text-anchor="middle" font-size="13">Payments service</text>
<rect x="450" y="160" width="150" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<text x="525" y="185" text-anchor="middle" font-size="13">Inventory service</text>
<line x1="140" y1="60" x2="227" y2="106" stroke-width="2" marker-end="url(#cc3-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="140" y1="120" x2="227" y2="120" stroke-width="2" marker-end="url(#cc3-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="140" y1="180" x2="227" y2="134" stroke-width="2" marker-end="url(#cc3-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="360" y1="106" x2="447" y2="60" stroke-width="2" marker-end="url(#cc3-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="360" y1="120" x2="447" y2="120" stroke-width="2" marker-end="url(#cc3-arrow)" style="stroke: var(--dg-muted)"/>
<line x1="360" y1="134" x2="447" y2="180" stroke-width="2" marker-end="url(#cc3-arrow)" style="stroke: var(--dg-muted)"/>
<text x="185" y="228" text-anchor="middle" font-size="12" font-weight="700">REST / JSON</text>
<text x="405" y="228" text-anchor="middle" font-size="12" font-weight="700">gRPC / protobuf</text>
</svg>`,
        },
        {
          type: "table",
          headers: ["", "REST", "GraphQL", "gRPC"],
          rows: [
            ["Shape", "Resources and HTTP verbs", "One endpoint, client-written queries", "Typed methods from a schema"],
            ["Payload", "Usually JSON", "JSON", "Protocol Buffers (binary)"],
            ["HTTP caching", "Natural for GET", "Hard without extra work", "Not applicable"],
            ["Browser support", "Native", "Native", "Needs gRPC-Web and a proxy"],
            ["Best fit", "Public APIs, most products", "Many clients with varied, changing needs", "High-volume internal calls, streaming"],
          ],
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Serialization is rarely the first bottleneck. A request waiting 30 ms on a database and 80 ms on a cross-region call won't get noticeably faster because 2 KB of JSON became 600 bytes of protobuf. Switch formats when profiles show it matters.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Pick REST for the client-facing API unless a requirement says otherwise. A strong answer covers:</p>
<ol>
<li>Resources as nouns, verbs from HTTP methods, identity from the auth token, never from the body.</li>
<li>Which methods are idempotent, and an idempotency key for retried creates.</li>
<li>Correct status codes so clients and infrastructure can react (429 means back off, 5xx may be retried).</li>
<li>GraphQL when many clients need different slices of data, with its costs: N+1 and query limits.</li>
<li>gRPC for hot internal paths: schema, binary encoding, HTTP/2, deadlines.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "A GraphQL query asks for 50 posts and each post's author. The database log shows 51 queries per request. What is happening and what is the fix?",
          options: [
            "The schema is too big; split it into several endpoints",
            "The author resolver runs once per post (N+1); batch author lookups into one query",
            "GraphQL always needs one query per object; add a cache",
            "The client is over-fetching; remove the author field",
          ],
          answer: 1,
          explain: "One query loads the posts and the author resolver then fires once per post. Collecting the 50 author IDs and loading them in one query (a DataLoader-style batch) brings it down to two queries without changing the API.",
        },
        {
          type: "quiz",
          q: "An interviewer asks what is wrong with POST /getUserData {\"userId\": 42}. Which answer is most complete?",
          options: [
            "Nothing; POST is fine for anything",
            "It should use PUT",
            "It's a verb in the path, a read that can't be cached or retried by convention, and it trusts a user ID from the body, so callers can read other users' data",
            "The body should be XML",
          ],
          answer: 2,
          explain: "Better: GET /users/me or GET /users/42, with the server deriving the caller from their token and checking they may see user 42. That fixes naming, uses a cacheable and idempotent method, and closes the authorization hole.",
        },
      ],
    },
  ],
  takeaways: [
    "HTTP is stateless request/response; methods and status codes are contracts that caches, clients and retries rely on (GET safe, PUT and DELETE idempotent, POST not).",
    "Identity comes from verified credentials, never from IDs in the request; check access per resource.",
    "REST models resources with standard verbs and fits HTTP caching and tooling: the default for public APIs.",
    "GraphQL fixes under- and over-fetching but moves cost to the server: N+1 resolvers, query limits, per-field authorization.",
    "gRPC sends compact Protocol Buffers over HTTP/2 with typed stubs, deadlines and streaming: a strong fit for internal calls, less so for browsers.",
  ],
  furtherReading: [
    { title: "RFC 9110: HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110", note: "The definitions of methods, safety, idempotency and status codes." },
    { title: "Protocol Buffers encoding guide", url: "https://protobuf.dev/programming-guides/encoding/", note: "Tags, wire types and varints, including the field-1-equals-150 example." },
    { title: "GraphQL documentation", url: "https://graphql.org/learn/", note: "Schemas, queries and resolvers from the project itself." },
  ],
};
