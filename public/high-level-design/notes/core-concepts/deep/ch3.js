// Deep dive: Chapter 3, HTTP and API styles: REST, GraphQL, gRPC. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch3 = {
  hook: `<p>A mobile team ships a new home screen. It shows twenty friends, each with a name, an avatar and the groups they belong to. Against your existing REST API that is one call for the friend list, then a profile call and a groups call for every friend: 41 requests, each paying a round trip over a congested cellular link. The screen takes three seconds to fill in.</p>
<p>The backend team's quick fix is a single <code>/home</code> endpoint that returns everything about each friend. Now the screen loads in one request, but that response is 400 KB, most of it fields the screen never shows, and every other screen wants its own special endpoint too. Meanwhile, the same backend's internal services are passing large JSON documents to each other thousands of times a second and burning CPU on parsing them.</p>
<p>These are three different problems with three different tools. HTTP is the common ground under all of them; REST, GraphQL and gRPC are three ways of shaping APIs on top of it, each built to fix a particular pain.</p>`,
  sections: [
    {
      id: "http-anatomy",
      title: "HTTP: the request/response protocol under almost everything",
      kicker: "The foundation",
      blocks: [
        {
          type: "text",
          html: `<p>HTTP is simple enough to read by eye. A client sends a <strong>method</strong> (what to do), a <strong>path</strong> (to what), <strong>headers</strong> (metadata) and optionally a <strong>body</strong>. The server answers with a <strong>status code</strong>, headers and optionally a body. In HTTP/1.1 this is literally text on a TCP connection; HTTP/2 and HTTP/3 encode the same fields in binary frames, but the meaning is identical, which is why APIs rarely care which version carries them.</p>`,
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
          type: "text",
          html: `<h3>Statelessness is the feature that makes it scale</h3>
<p>Each HTTP request is meant to carry everything the server needs to handle it: who the caller is (a token or cookie), what they want, and any input. The server keeps no memory of earlier requests. That sounds like a limitation, and it is the main reason HTTP services scale so easily: any server behind the load balancer can handle any request, servers can be added or killed at will, and a crashed server loses nothing a retry can't recover.</p>
<p>Real applications obviously have sessions and shopping carts. Statelessness just means that state lives somewhere shared, such as a signed token the client presents, a database, or a cache like Redis, rather than in the memory of whichever server handled the last request.</p>
<h3>HTTPS</h3>
<p>HTTPS is HTTP inside a TLS session: the bytes are encrypted, tampering is detected, and the server proves its identity with a certificate. It protects data in transit and nothing else. It does not authenticate the user, validate input, or make the API safe to call with any parameters a client chooses to send.</p>`,
        },
        {
          type: "keypoints",
          items: [
            "Request: method, path, headers, optional body. Response: status, headers, optional body.",
            "Stateless servers let any instance serve any request; shared state goes to tokens, databases or caches.",
            "HTTPS secures the channel, not the semantics: you still need authentication and authorization.",
          ],
        },
      ],
    },
    {
      id: "methods-status-headers",
      title: "Methods, status codes and headers that carry meaning",
      kicker: "The vocabulary",
      blocks: [
        {
          type: "text",
          html: `<p>HTTP's methods are not decoration. Proxies, caches, browsers and client libraries make decisions based on them. A <code>GET</code> may be cached, prefetched or retried automatically; a <code>POST</code> generally will not be. Using the wrong method breaks those assumptions in ways that are hard to debug.</p>`,
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
          type: "text",
          html: `<h3>Status codes are a contract with the caller</h3>
<p>The first digit tells the client what kind of thing happened: <strong>2xx</strong> success, <strong>3xx</strong> look elsewhere (or use your cached copy, for 304), <strong>4xx</strong> the caller did something wrong and repeating it unchanged won't help, <strong>5xx</strong> the server failed and a retry might work. Client libraries, retry policies, monitoring dashboards and load balancers all key off that split. Returning <code>200</code> with <code>{"error": ...}</code> in the body hides failures from all of them.</p>
<h3>Headers and content negotiation</h3>
<p>Headers are an open-ended metadata channel: authentication, caching (<code>Cache-Control</code>, <code>ETag</code>), content type, tracing IDs. <strong>Content negotiation</strong> is a nice example of designing for change. The client lists what it can handle (<code>Accept-Encoding: gzip, br</code>) and the server picks the best option it also supports and says which (<code>Content-Encoding: br</code>). Old clients that only know gzip keep working; newer ones get Brotli. The same pattern, where the client declares its capabilities and the server falls back gracefully, works for API versions and optional features.</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><strong>Never trust the request body for identity.</strong> A client can send any <code>userId</code> it likes. If <code>GET /orders?userId=42</code> returns user 42's orders to whoever asks, any logged-in user can read anyone's orders by changing a number. Identity comes from verified credentials (a validated token or session); the server then checks that this caller may access this specific resource. OWASP ranks this flaw, broken object-level authorization, as the top API security risk.</p>`,
        },
        {
          type: "quiz",
          q: "A client sends PUT /users/42/email with {\"email\": \"a@b.com\"}, the connection drops before the response, and the client retries. Is that safe?",
          options: [
            "No, PUT is never safe to retry",
            "Yes, setting a field to a fixed value has the same result however many times it runs",
            "Only if the server returns 201",
            "Only over HTTP/2",
          ],
          answer: 1,
          explain: "PUT replaces state with a given value, so applying it twice leaves the same state as once: it is idempotent. Compare POST /users/42/emails, which might add a second email address on retry, or a PATCH that says \"increment the counter\".",
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
          html: `<p>Describe the system as <strong>resources</strong> (nouns) with addresses, and use the standard HTTP methods to read and change them. The API becomes predictable: once you know <code>/orders</code>, you can guess how to list, fetch, create and cancel orders.</p>`,
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
          type: "text",
          html: `<p>Actions such as "cancel" or "refund" are the part people find awkward. There are two standard moves. Either express the action as a <strong>state change</strong> on the resource (<code>PATCH /orders/42</code> with <code>{"status": "cancelled"}</code>), or turn the action into a <strong>resource of its own</strong> that you create (<code>POST /orders/42/refunds</code>). The second works well when the action has its own data and lifecycle: a refund has an amount, a status and an ID you may want to fetch later.</p>
<p>REST's big practical advantage is that it fits HTTP's infrastructure. <code>GET</code> responses can be cached by browsers and CDNs with plain <code>Cache-Control</code> headers, and an <code>ETag</code> lets a client ask "has this changed?" and get a tiny <code>304 Not Modified</code> instead of the whole body. Every language has an HTTP client, every engineer can test an endpoint with <code>curl</code>, and every proxy and gateway understands the traffic.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Stripe", title: "A widely copied REST API", html: "Stripe models payments as resources such as customers, payment intents and refunds, uses standard verbs, and accepts an <code>Idempotency-Key</code> header so clients can retry POST requests safely." },
            { org: "GitHub", title: "REST and GraphQL side by side", html: "GitHub offers a REST API (<code>/repos/{owner}/{repo}/issues</code> and friends) and also a GraphQL API, letting integrators choose predictable endpoints or precise queries." },
          ],
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>RPC disguised as REST: <code>POST /getUser</code>, <code>POST /updateUserEmail</code>, <code>GET /deleteOrder?id=7</code>. Verbs in paths, reads that can't be cached, and a GET that deletes data (a link prefetcher or crawler could trigger it). Name resources, let the method carry the verb.</p>`,
        },
      ],
    },
    {
      id: "fetching-and-graphql",
      title: "Under-fetching, over-fetching and GraphQL",
      kicker: "When REST strains",
      blocks: [
        {
          type: "problem",
          html: `<p>Fine-grained REST resources make a screen that shows related data pay for many round trips (<strong>under-fetching</strong>). A coarse endpoint that returns everything costs bytes and server work for fields nobody displays (<strong>over-fetching</strong>), and a custom endpoint per screen multiplies backend work every time a client changes.</p>`,
        },
        {
          type: "text",
          html: `<p><strong>GraphQL</strong>, developed at Facebook for its mobile apps and open-sourced in 2015, attacks this by letting the client describe the exact shape of the data it wants. There is one endpoint and a typed <strong>schema</strong> listing every type and field. A query names the fields and nested relations it needs, and the response has exactly that shape.</p>`,
        },
        {
          type: "code",
          lang: "graphql",
          title: "The home screen from the opening, in one request",
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
          html: `<p>On the server, each field has a <strong>resolver</strong>, a function that knows how to fetch that field. This is where the cost moves. A naive implementation resolves the 20 friends with one query, then calls the <code>groups</code> resolver once per friend: 21 database queries for one request, the <strong>N+1 problem</strong>. The standard fix is batching: a loader (Facebook's DataLoader pattern) collects all the friend IDs requested in one tick and fetches their groups in a single query.</p>`,
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
            "One API shared by many teams and client types",
          ],
          cons: [
            "Resolvers cause N+1 queries unless you batch",
            "Arbitrary queries can be very expensive; you need depth and cost limits or persisted queries",
            "HTTP caching is harder: queries are usually POSTs to one URL",
            "Authorization must be enforced per field and per object, not per endpoint",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>A lighter alternative is a <strong>backend for frontend</strong> (BFF): a thin server per client type (iOS, web) that calls the fine-grained services and returns exactly what that client's screens need. It fixes under- and over-fetching without a new query language, at the cost of another service to own.</p>`,
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
      ],
    },
    {
      id: "grpc",
      title: "gRPC and Protocol Buffers: typed, compact service calls",
      kicker: "Inside the backend",
      blocks: [
        {
          type: "text",
          html: `<p>Between your own services, the flexibility of JSON is mostly overhead. Every message repeats every field name as text, numbers are written as decimal strings, and both sides parse strings into objects and back. At tens of thousands of calls per second that becomes real CPU and bandwidth. <strong>gRPC</strong>, open-sourced by Google in 2015 and based on its internal RPC system, takes a different approach: define the API in a schema, generate the code, and send compact binary messages.</p>`,
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
          type: "text",
          html: `<p>The numbers after each field are the key to the encoding. On the wire, Protocol Buffers never send the name <code>email</code>; they send a small <strong>tag</strong> combining the field number and a wire type, then the value. Integers use variable-length encoding, so small numbers take one or two bytes. Both sides know the schema, so the receiver maps field 3 back to <code>email</code>. Unknown field numbers are skipped, which is how old and new versions of a service can talk to each other as long as nobody reuses a number.</p>`,
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
          type: "lab",
          id: "protobufSize",
          caption: "Edit the user record and compare the real JSON and protobuf encodings byte for byte. Try a large id, an empty string and a long list of tags.",
        },
        {
          type: "text",
          html: `<p>The encoding is only part of the appeal. gRPC also brings generated, typed client and server stubs in many languages, so a renamed field is a compile error instead of a production incident; <strong>deadlines</strong> that propagate across calls, so a downstream service knows when the caller has already given up; and four call shapes: unary, server streaming, client streaming and bidirectional streaming, all multiplexed over long-lived HTTP/2 connections.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "etcd and Kubernetes", title: "gRPC as the cluster's backbone", html: "The etcd v3 API, which stores Kubernetes cluster state, is a gRPC API, and many cloud-native components talk to each other over gRPC." },
            { org: "Browsers", title: "The gap", html: "Browsers don't expose the HTTP/2 control gRPC needs, so web clients use gRPC-Web through a translating proxy such as Envoy, or the team exposes REST at the edge instead." },
          ],
        },
      ],
    },
    {
      id: "choosing",
      title: "Choosing a style: REST outside, gRPC inside",
      kicker: "Putting it together",
      blocks: [
        {
          type: "text",
          html: `<p>A pattern you will see in many companies: public clients you don't control (browsers, mobile apps, partners) talk REST with JSON, or GraphQL when the client landscape is varied, through an API gateway. Behind the gateway, internal services call each other over gRPC. Each choice is made where its strengths matter most: universal reach at the edge, efficiency and strict contracts on the heavily used internal paths.</p>`,
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
          html: `<p>Serialization is rarely the first bottleneck. A request that waits 30 ms on a database and 80 ms on a cross-region call will not be noticeably faster because its 2 KB JSON body became 600 bytes of protobuf. Switch formats when profiles show encoding or bandwidth costs that matter, typically on very hot internal paths, not by default.</p>`,
        },
        {
          type: "quiz",
          q: "You are designing the public API for a third-party developer platform. Which choice is easiest to defend?",
          options: [
            "gRPC, because it is fastest",
            "REST with JSON, because any developer can call it from any language and test it with curl",
            "GraphQL, because it is newest",
            "A custom binary protocol over TCP",
          ],
          answer: 1,
          explain: "For external developers, reach and ease of use dominate: REST works from browsers, scripts and every HTTP client, is easy to debug and cache. gRPC's speed matters less than the friction of binary tooling and browser limits for people you don't control.",
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
          html: `<p>Pick REST for the client-facing API unless the prompt gives you a reason not to, say why in a sentence, and move on. Interviewers mainly want a clean, consistent set of endpoints that satisfies the requirements; the next chapters go deeper on designing them. Raise GraphQL or gRPC only when a requirement points there.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>Signals that land well:</p>
<ol>
<li>Resources as nouns, verbs from HTTP methods, identity from the auth token, never from the body.</li>
<li>Know which methods are idempotent and make retried creates safe with an idempotency key.</li>
<li>Use correct status codes so clients and infrastructure can react (429 means back off, 5xx may be retried).</li>
<li>Mention GraphQL when many different clients need different slices of data, and name its costs: N+1 and query limits.</li>
<li>Mention gRPC for hot internal paths: schema, compact binary encoding, HTTP/2, deadlines.</li>
</ol>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Spending five minutes arguing protobuf versus JSON. Unless the prompt is about extreme throughput between services, the interviewer would rather hear about your data model and bottlenecks.</p>`,
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
    "HTTP is a stateless request/response protocol; statelessness lets any server handle any request, with shared state kept in tokens, databases or caches.",
    "Methods and status codes are contracts that caches, clients and retry logic rely on: GET is safe, PUT and DELETE are idempotent, POST is not.",
    "Identity always comes from verified credentials, never from IDs in the body or query; check access per resource.",
    "REST models resources with standard verbs and fits HTTP caching and tooling: the default for public APIs.",
    "GraphQL fixes under- and over-fetching with client-shaped queries, but moves cost to the server: N+1 resolvers, query limits, per-field authorization.",
    "gRPC sends compact Protocol Buffers over HTTP/2 with generated typed stubs, deadlines and streaming; it is a strong fit for internal service calls, less so for browsers.",
  ],
  furtherReading: [
    { title: "RFC 9110: HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110", note: "The definitions of methods, safety, idempotency and status codes." },
    { title: "Protocol Buffers encoding guide", url: "https://protobuf.dev/programming-guides/encoding/", note: "Tags, wire types and varints, including the field-1-equals-150 example." },
    { title: "GraphQL documentation", url: "https://graphql.org/learn/", note: "Schemas, queries and resolvers from the project itself." },
  ],
};
