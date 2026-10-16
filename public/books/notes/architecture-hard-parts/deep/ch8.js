// Deep dive: Chapter 8, Reuse patterns. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch8 = {
  hook: `<p>In the monolith, Basket's pricing rules were a class that anyone could call. Now five services need them: catalogue shows prices, cart totals them, checkout charges them, promotions adjusts them, and reporting audits them. The team's first instinct is a <code>Basket.Common</code> library. Six months later there are four versions of it in production, and the price shown in the catalogue occasionally disagrees with the price charged at checkout.</p>
<p>Part II of the book is about putting things back together, and the first thing to reconnect is code. The book compares four ways to share it across service boundaries, from copying it to running it as a separate process beside each service, and argues that the right one depends mostly on how often the shared code changes. This deep dive walks through each option and what it costs.</p>`,
  sections: [
    {
      id: "the-reuse-problem",
      title: "Why reuse gets hard once services split",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Inside one deployable, reuse is free: call the method, and every caller always runs the same version. Across services, every option for sharing code reintroduces some coupling the split was meant to remove. Share at build time and consumers drift onto different versions; share at runtime and every consumer depends on one more thing being up; copy it and fixes have to be repeated everywhere.</p>`
        },
        {
          type: "idea",
          html: `<p>Pick the reuse mechanism by two properties of the shared code: <strong>how often it changes</strong>, and <strong>whether consumers must all run the same behaviour at the same time</strong>. Slow-changing code tolerates build-time sharing; volatile code that must be consistent everywhere wants runtime sharing; trivial code can simply be copied. The book also distinguishes domain logic from operational concerns like logging and security, which have their own pattern.</p>`
        }
      ]
    },
    {
      id: "replication-and-libraries",
      title: "Code replication and shared libraries",
      kicker: "Build-time sharing",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Code replication</strong> copies the code into each service. It sounds like heresy, but for tiny, stable pieces (a few value types, an annotation, a constants file that never changes) it's the cheapest option: zero coupling, no versioning, no runtime dependency. The cost appears when it changes: every copy must be found and fixed by hand, and copies drift. Reserve it for code that's effectively frozen.</p>
<p><strong>Shared libraries</strong> package common code as a versioned artifact (NuGet, Maven, npm) that each service links at build time. Calls are in-process and fast, nothing extra needs to be running, and each consumer controls when it upgrades. That last point is both the strength and the weakness.</p>`
        },
        {
          type: "diagram",
          title: "Version drift with a shared library",
          caption: "Each consumer upgrades on its own schedule, so several versions run at once. For logging helpers that's harmless; for pricing rules it means different services charge different prices.",
          svg: `<svg viewBox="0 0 640 220" role="img" aria-label="Five services running different versions of a shared pricing library">
<g font-size="12" text-anchor="middle">
<rect x="250" y="16" width="140" height="40" rx="8" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="1.5"/>
<text x="320" y="34" font-weight="700">Basket.Pricing</text><text x="320" y="49" font-size="11" style="fill: var(--dg-muted)">latest: 2.4.0</text>
<rect x="20" y="140" width="100" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="70" y="163">Catalogue</text><text x="70" y="182" style="fill: var(--dg-ok)">2.4.0</text>
<rect x="140" y="140" width="100" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="190" y="163">Cart</text><text x="190" y="182" style="fill: var(--dg-3)">2.2.1</text>
<rect x="260" y="140" width="100" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="310" y="163">Checkout</text><text x="310" y="182" style="fill: var(--dg-ok)">2.4.0</text>
<rect x="380" y="140" width="100" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="430" y="163">Promotions</text><text x="430" y="182" style="fill: var(--dg-bad)">1.9.3</text>
<rect x="500" y="140" width="110" height="56" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="555" y="163">Reporting</text><text x="555" y="182" style="fill: var(--dg-3)">2.3.0</text>
<g style="stroke: var(--dg-muted)" stroke-width="1.5" stroke-dasharray="4 4">
<line x1="300" y1="56" x2="70" y2="138"/><line x1="310" y1="56" x2="190" y2="138"/><line x1="320" y1="56" x2="310" y2="138"/><line x1="330" y1="56" x2="430" y2="138"/><line x1="340" y1="56" x2="555" y2="138"/>
</g>
<text x="320" y="100" style="fill: var(--dg-muted)">linked at build time</text>
</g>
</svg>`
        },
        {
          type: "keypoints",
          title: "Making shared libraries manageable",
          items: [
            `<strong>Granularity:</strong> prefer several small libraries split by function and rate of change over one "commons" library. A change to date formatting shouldn't force a new version for consumers who only use the money type.`,
            `<strong>Semantic versioning:</strong> make breaking changes visible in the version number so consumers can upgrade minor versions safely.`,
            `<strong>Support windows:</strong> support the latest and one or two previous versions; announce deprecations with a date.`,
            `<strong>Don't force lockstep:</strong> "everyone must always be on latest" turns every library release into a coordinated release, undoing independent deployability.`
          ]
        }
      ]
    },
    {
      id: "shared-service",
      title: "Shared services",
      kicker: "Runtime sharing",
      blocks: [
        {
          type: "text",
          html: `<p>A <strong>shared service</strong> puts the common functionality behind its own API. Consumers call it at runtime, so there's exactly one version running and a change reaches everyone with a single deployment. It's also language-neutral: a Go service and a .NET service can call the same pricing API.</p>
<p>The costs are the mirror image of the library's benefits:</p>
<ul><li><strong>Change risk:</strong> one bad deployment breaks every consumer at once. Versioned endpoints (<code>/v1/price</code>, <code>/v2/price</code>) soften this, but bring back some of the version management you were trying to avoid.</li>
<li><strong>Performance:</strong> every use is a network call, with latency and serialisation cost. Calling it per cart line in a hot path adds up quickly.</li>
<li><strong>Fault tolerance:</strong> it's a runtime dependency of everyone. If it's down, every consumer must cope or fail.</li>
<li><strong>Scalability:</strong> it must scale for the combined load of all its consumers.</li></ul>`
        },
        {
          type: "lab",
          id: "reuseCost",
          caption: "Raise the rate of change: a library's version drift grows, while a shared service's risk becomes how many consumers one bad release hits."
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>A shared service is a product, not a utility. It needs an owner, an SLA, capacity planning, backwards-compatible releases and good observability. Teams that create a shared service as an afterthought tend to create the single point of failure they were afraid of.</p>`
        }
      ]
    },
    {
      id: "sidecars-and-mesh",
      title: "Sidecars and the service mesh",
      kicker: "Operational reuse",
      blocks: [
        {
          type: "problem",
          html: `<p>Every Basket service needs the same plumbing: structured logging in the same format, metrics, distributed tracing headers, mutual TLS, retries with backoff, circuit breaking. Putting that in a shared library means one library per language and constant upgrades; putting it in each service's code means it's done slightly differently everywhere.</p>`
        },
        {
          type: "idea",
          html: `<p>A <strong>sidecar</strong> is a separate process deployed next to each service instance (in Kubernetes, a second container in the same pod) that handles operational concerns on the service's behalf. Traffic in and out of the service flows through it, so it can add TLS, retries, metrics and tracing without the service's code knowing. Connect all the sidecars to a central control plane and you have a <strong>service mesh</strong> (Istio, Linkerd), where policies are set once and applied everywhere.</p>`
        },
        {
          type: "diagram",
          title: "Domain code in the service, operational code in the sidecar",
          caption: "Each service instance runs with a sidecar proxy. The mesh's control plane configures all sidecars centrally: security policy, retries, routing and telemetry.",
          svg: `<svg viewBox="0 0 640 230" role="img" aria-label="Services with sidecars managed by a mesh control plane">
<g font-size="12" text-anchor="middle">
<rect x="230" y="12" width="180" height="40" rx="8" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="1.5"/>
<text x="320" y="37" font-weight="700">Mesh control plane</text>
<rect x="30" y="100" width="170" height="100" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="5 4"/>
<text x="115" y="118" font-size="11" style="fill: var(--dg-muted)">pod</text>
<rect x="42" y="128" width="80" height="56" rx="7" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="82" y="152">Checkout</text><text x="82" y="168" font-size="11" style="fill: var(--dg-muted)">domain</text>
<rect x="130" y="128" width="60" height="56" rx="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="160" y="152" font-size="11">sidecar</text><text x="160" y="168" font-size="11" style="fill: var(--dg-muted)">TLS, retry</text>
<rect x="235" y="100" width="170" height="100" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="5 4"/>
<text x="320" y="118" font-size="11" style="fill: var(--dg-muted)">pod</text>
<rect x="247" y="128" width="80" height="56" rx="7" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="287" y="152">Payment</text><text x="287" y="168" font-size="11" style="fill: var(--dg-muted)">domain</text>
<rect x="335" y="128" width="60" height="56" rx="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="365" y="152" font-size="11">sidecar</text><text x="365" y="168" font-size="11" style="fill: var(--dg-muted)">metrics</text>
<rect x="440" y="100" width="170" height="100" rx="10" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="5 4"/>
<text x="525" y="118" font-size="11" style="fill: var(--dg-muted)">pod</text>
<rect x="452" y="128" width="80" height="56" rx="7" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="492" y="152">Stock</text><text x="492" y="168" font-size="11" style="fill: var(--dg-muted)">domain</text>
<rect x="540" y="128" width="60" height="56" rx="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="570" y="152" font-size="11">sidecar</text><text x="570" y="168" font-size="11" style="fill: var(--dg-muted)">tracing</text>
<g style="stroke: var(--dg-4)" stroke-width="1.5" stroke-dasharray="3 3">
<line x1="280" y1="52" x2="160" y2="126"/><line x1="330" y1="52" x2="365" y2="126"/><line x1="380" y1="52" x2="570" y2="126"/>
</g>
<line x1="190" y1="156" x2="333" y2="156" style="stroke: var(--dg-muted)" stroke-width="2"/>
<line x1="395" y1="156" x2="538" y2="156" style="stroke: var(--dg-muted)" stroke-width="2"/>
<text x="262" y="218" font-size="11" style="fill: var(--dg-muted)">service-to-service traffic flows sidecar to sidecar</text>
</g>
</svg>`
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Don't put domain logic in the mesh. Routing rules that decide which customers get which prices, or retries that change business outcomes, become invisible to the teams who own that behaviour. Sidecars are for <em>operational</em> coupling: behaviour that should be identical everywhere and has nothing to do with the domain.</p>`
        }
      ]
    },
    {
      id: "choosing",
      title: "Choosing a reuse pattern",
      kicker: "Decision guide",
      blocks: [
        {
          type: "table",
          headers: ["Shared thing", "Changes", "Must be identical everywhere?", "Reasonable choice"],
          rows: [
            ["Money and Address value types", "Almost never", "No", "Copy, or a tiny library"],
            ["Logging, metrics, mTLS, retries", "Occasionally", "Yes, fleet-wide", "Sidecar / service mesh"],
            ["Date and currency formatting", "Rarely", "No", "Small shared library"],
            ["Pricing rules", "Weekly", "Yes: shown price must equal charged price", "Shared pricing service"],
            ["Tax calculation", "When law changes", "Yes", "Shared service, or a library with forced upgrade dates"]
          ]
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>A useful observation from the book: the things software reuses most successfully, such as operating systems, frameworks and databases, change slowly. Reuse works best on stable foundations. Before extracting something to share, ask how often it will change and how many teams that would bind together.</p>`
        },
        {
          type: "quiz",
          q: "Basket's catalogue and checkout must always agree on a product's price, and pricing rules change weekly. Which reuse pattern best fits?",
          options: ["Copy the pricing code into both services", "A shared library that each service upgrades when convenient", "A shared pricing service, with versioned endpoints and an SLA", "A sidecar that calculates prices"],
          answer: 2,
          explain: `<p>Volatile logic that must be identical everywhere suits runtime sharing: one deployment updates every consumer. The cost is a network dependency and a wide blast radius, so the service needs careful releases and high availability. A sidecar is for operational, not domain, behaviour.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Every cross-service reuse mechanism reintroduces some coupling; choose it by rate of change and need for consistency.`,
    `Copy tiny, frozen code; use small, versioned libraries for stable domain code; expect version drift.`,
    `Shared services give one version everywhere, at the cost of latency, a shared failure point and shared scaling; treat them as products.`,
    `Sidecars and service meshes handle operational concerns consistently across languages; keep domain logic out of them.`,
    `Reuse works best on slow-changing foundations.`
  ],
  furtherReading: [
    { title: "Istio documentation: sidecar proxies", url: "https://istio.io/latest/docs/concepts/", note: "How a service mesh uses sidecars and a control plane." },
    { title: "Semantic Versioning", url: "https://semver.org/", note: "The versioning scheme that makes library upgrades predictable." }
  ]
};
