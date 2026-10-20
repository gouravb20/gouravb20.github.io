// Main tab: Chapter 3, HTTP and API styles: REST, GraphQL, gRPC. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch3 = [
  {
    id: "http-essentials",
    title: "HTTP in one page",
    kicker: "Mental model",
    blocks: [
      {
        type: "text",
        html: `<p>HTTP is a request/response protocol. The client sends a <strong>method</strong>, a <strong>path</strong>, <strong>headers</strong> and sometimes a <strong>body</strong>; the server replies with a <strong>status code</strong>, headers and usually a body. HTTP/2 and HTTP/3 change how those fields are packed on the wire, not what they mean, so an API design doesn't depend on the version.</p><p>The property that matters most for system design is that HTTP is <strong>stateless</strong>. Each request carries everything the server needs, including the caller's credentials. No server remembers the previous request, so any server behind a load balancer can handle any request, and you scale a tier by adding machines. Whatever state you do need (sessions, carts, drafts) lives in a token, a database or a cache, never in one server's memory.</p>`,
      },
      {
        type: "keypoints",
        items: [
          "<strong>Headers are extensible metadata:</strong> authentication, caching rules, content type, tracing IDs. New headers can be added without breaking old clients.",
          "<strong>HTTPS protects the channel only.</strong> It stops eavesdropping and tampering in transit. It says nothing about whether the caller is allowed to do what they ask.",
          "<strong>Identity comes from credentials, not from the request body.</strong> A <code>userId</code> field in the body or query string is just a claim; the server must take identity from a verified token and then check access to the specific resource.",
        ],
      },
    ],
  },
  {
    id: "contracts",
    title: "Methods and status codes are contracts",
    kicker: "What clients rely on",
    blocks: [
      {
        type: "text",
        html: `<p>Clients, proxies, caches and retry libraries all act on the method and the status code without understanding your business logic. Using them as everyone expects is what lets that infrastructure help you. The key idea is <strong>idempotency</strong>: an operation is idempotent if doing it twice leaves the server in the same state as doing it once. GET, PUT and DELETE are idempotent; POST is not. After a timeout the client cannot tell whether the server acted, so only idempotent requests can be retried blindly. Everything else needs an idempotency key.</p>`,
      },
      {
        type: "table",
        title: "Status code families and how a client should react",
        headers: ["Family", "Meaning", "Typical codes", "Client reaction"],
        rows: [
          ["2xx", "It worked", "200, 201 Created, 204 No Content", "Proceed"],
          ["3xx", "Look elsewhere", "301, 302, 304 Not Modified", "Follow the redirect or use the cached copy"],
          ["4xx", "The caller got something wrong", "400, 401, 403, 404, 409, 429", "Fix the request; only 429 is retried, after backing off"],
          ["5xx", "The server failed", "500, 502, 503, 504", "Retry with backoff, but only if the operation is idempotent"],
        ],
      },
      {
        type: "callout",
        tone: "warning",
        html: `<p>Returning 200 with an error message in the body hides failures from clients, retry logic, caches and monitoring dashboards. Use the status code to say what happened and the body to explain it.</p>`,
      },
    ],
  },
  {
    id: "three-styles",
    title: "REST, GraphQL and gRPC: which pain each one fixes",
    kicker: "API styles",
    blocks: [
      {
        type: "text",
        html: `<p>The three styles are not competitors so much as answers to different problems. Pick by asking who the client is and what hurts.</p>`,
      },
      {
        type: "compare",
        items: [
          { title: "REST", tone: "ok", html: "<p><strong>Fixes:</strong> unpredictable, inconsistent APIs. Resources are nouns, HTTP methods are the verbs, and once you know <code>/orders</code> you can guess the rest. GETs cache naturally in browsers and CDNs, and every tool understands it.</p><p><strong>Default for:</strong> public APIs and most product features.</p>" },
          { title: "GraphQL", tone: "info", html: "<p><strong>Fixes:</strong> under-fetching (one screen needs many calls) and over-fetching (endpoints return fields nobody shows). The client sends one query describing the exact shape it wants.</p><p><strong>Watch out for:</strong> N+1 resolver queries, expensive arbitrary queries, harder HTTP caching and per-field authorization.</p>" },
          { title: "gRPC", tone: "info", html: "<p><strong>Fixes:</strong> the overhead and loose contracts of JSON between your own services. A schema generates typed client and server code, messages are compact binary Protocol Buffers, and calls share long-lived HTTP/2 connections.</p><p><strong>Watch out for:</strong> browsers can't call it natively; binary payloads are harder to debug.</p>" },
        ],
      },
    ],
  },
  {
    id: "worked-example",
    title: "A worked example: a photo-sharing app",
    kicker: "Putting it together",
    blocks: [
      {
        type: "steps",
        items: [
          "<strong>Public API: REST.</strong> Web and mobile clients call <code>POST /photos</code>, <code>GET /photos/{id}</code>, <code>GET /users/{id}/photos?cursor=...</code> and <code>POST /photos/{id}/likes</code>. The caller's identity comes from the token. Photo pages are cacheable GETs, so a CDN can absorb much of the read traffic.",
          "<strong>Internal calls: gRPC, or simply REST.</strong> The upload service calls the media-processing and feed services tens of thousands of times a second; typed contracts and compact payloads help here. Starting with REST everywhere would also be acceptable.",
          "<strong>GraphQL only if the prompt pushes for it.</strong> If the interviewer says the mobile app, the web app and partner integrations all need different slices of user, photo and comment data, GraphQL earns its place. Otherwise it adds server complexity without solving a stated problem.",
          "<strong>Retries on writes.</strong> A retried <code>POST /photos</code> could create a duplicate, so the client sends an idempotency key with the upload.",
        ],
      },
      {
        type: "callout",
        tone: "insight",
        html: `<p>Serialization is rarely the first bottleneck. A request that waits 30 ms on a database and 80 ms on a cross-region call won't feel faster because its JSON shrank. Change formats when measurements say so.</p>`,
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
        html: `<p>Say "REST for the client-facing API" and move on unless a requirement says otherwise. Mention gRPC for hot internal paths if you want to show range. Raise GraphQL only when the prompt stresses many clients with different and changing data needs, and name its costs when you do.</p>`,
      },
      {
        type: "callout",
        tone: "mistake",
        title: "Common mistakes",
        html: `<ul><li>Verbs in paths, such as <code>POST /getUser</code> or <code>GET /deleteOrder</code>; a GET that changes data can be triggered by a crawler or prefetcher.</li><li>Trusting a user ID sent in the body, which lets any caller read anyone's data.</li><li>Retrying POSTs blindly after a timeout and creating duplicates.</li><li>Choosing gRPC for a public browser API, or GraphQL for a fixed set of screens.</li></ul>`,
      },
    ],
  },
];
