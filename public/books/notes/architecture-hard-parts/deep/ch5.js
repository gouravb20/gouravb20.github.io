// Deep dive: Chapter 5, Component-based decomposition patterns. Format: DeepDive in public/shared/notes.d.ts.
window.DEEP = window.DEEP || {};
DEEP.ch5 = {
  hook: `<p>Basket's metrics say its code is decomposable, just messy. There are recognisable areas (catalogue, checkout, delivery) but they're uneven: one checkout package holds a third of the codebase, notifications are sent from five places in five ways, and classes sit at random levels of the namespace tree. Extracting services from that as it stands would produce services just as uneven.</p>
<p>The book turns component-based decomposition into six patterns applied in order, each with something to look for, a refactoring to make and a fitness function that keeps the improvement from eroding. This deep dive walks through them on Basket's codebase. The point isn't the exact recipe; it's that the hard structural work happens <em>inside</em> the monolith, where mistakes are cheap, before anything is deployed separately.</p>`,
  sections: [
    {
      id: "what-is-a-component",
      title: "Components: the unit you move",
      kicker: "Groundwork",
      blocks: [
        {
          type: "idea",
          html: `<p>A <strong>component</strong> is a building block with a clear role, normally represented by a leaf namespace or package such as <code>basket.delivery.slots</code>. The classes inside it implement that role. Services will be made of one or more components, so components need clean edges and sensible sizes before anything can be extracted predictably.</p>`
        },
        {
          type: "diagram",
          title: "Six patterns in sequence",
          caption: "Each pattern prepares the next. The first five change only code structure inside the monolith; only the sixth changes how things are deployed.",
          svg: `<svg viewBox="0 0 660 160" role="img" aria-label="Six component-based decomposition patterns in sequence">
<defs><marker id="ahp5-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="11" text-anchor="middle">
<rect x="5" y="40" width="98" height="70" rx="9" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="54" y="64" font-weight="700" font-size="12">1</text><text x="54" y="82">Identify and</text><text x="54" y="96">size</text>
<rect x="115" y="40" width="98" height="70" rx="9" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="164" y="64" font-weight="700" font-size="12">2</text><text x="164" y="82">Gather common</text><text x="164" y="96">domain code</text>
<rect x="225" y="40" width="98" height="70" rx="9" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="274" y="64" font-weight="700" font-size="12">3</text><text x="274" y="82">Flatten</text><text x="274" y="96">components</text>
<rect x="335" y="40" width="98" height="70" rx="9" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="384" y="64" font-weight="700" font-size="12">4</text><text x="384" y="82">Determine</text><text x="384" y="96">dependencies</text>
<rect x="445" y="40" width="98" height="70" rx="9" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/><text x="494" y="64" font-weight="700" font-size="12">5</text><text x="494" y="82">Create component</text><text x="494" y="96">domains</text>
<rect x="555" y="40" width="98" height="70" rx="9" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/><text x="604" y="64" font-weight="700" font-size="12">6</text><text x="604" y="82">Create domain</text><text x="604" y="96">services</text>
<line x1="103" y1="75" x2="113" y2="75" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp5-arr)"/>
<line x1="213" y1="75" x2="223" y2="75" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp5-arr)"/>
<line x1="323" y1="75" x2="333" y2="75" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp5-arr)"/>
<line x1="433" y1="75" x2="443" y2="75" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp5-arr)"/>
<line x1="543" y1="75" x2="553" y2="75" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp5-arr)"/>
<text x="164" y="135" style="fill: var(--dg-muted)" font-size="12">shape the components</text>
<text x="439" y="135" style="fill: var(--dg-muted)" font-size="12">find the domains</text>
<text x="604" y="135" style="fill: var(--dg-muted)" font-size="12">deploy</text>
</g>
</svg>`
        }
      ]
    },
    {
      id: "size-and-gather",
      title: "Patterns 1 and 2: size the components, gather duplicates",
      kicker: "Shaping",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Identify and size components.</strong> List every component with its size and its share of the codebase. The book recommends counting <em>statements</em> rather than lines or files, since statements measure units of work independent of formatting. Then look at the distribution: a component far above the mean (say, more than two standard deviations) is probably several responsibilities sharing a namespace and should be split; a component that's a tiny fraction of the codebase may be a fragment that belongs inside a neighbour.</p>
<p><strong>Gather common domain components.</strong> Look for the same <em>business</em> function implemented in several places. Basket sends customer messages from checkout (order confirmations), delivery (SMS "driver nearby") and account (password emails), each with its own templates and provider code. Consolidating them into one notification component gives the function one owner and removes hidden duplication that would otherwise be extracted three times.</p>`
        },
        {
          type: "lab",
          id: "componentSizes",
          caption: "Step from the codebase as found, to gathering the notification fragments, to splitting the oversized checkout component."
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Don't confuse <em>domain</em> duplication with <em>technical</em> shared code. Notification rules are a business capability with an owner, so gather them into a component (and later perhaps a service). Logging, formatting and serialisation helpers are infrastructure; they're handled with the reuse patterns in Chapter 8, not by creating a "utilities domain".</p>`
        },
        {
          type: "code",
          title: "A size fitness function",
          lang: "text",
          code: `for each component c:
    share = statements(c) / statements(all)
    if share > 0.10:                      fail  "c is over 10% of the codebase"
    if statements(c) > mean + 2 * stdev:  warn  "c is an outlier; consider splitting"
    if share < 0.01:                      warn  "c may be a fragment; consider merging"`
        }
      ]
    },
    {
      id: "flatten-and-depend",
      title: "Patterns 3 and 4: flatten, then map dependencies",
      kicker: "Cleaning edges",
      blocks: [
        {
          type: "problem",
          html: `<p>Basket has <code>basket.checkout.payment</code> and <code>basket.checkout.cart</code>, which look like components. But there are also forty classes sitting directly in <code>basket.checkout</code>. Are they part of payment? Cart? Something else? When payment is later moved to its own service, nobody knows which of those forty go with it.</p>`
        },
        {
          type: "idea",
          html: `<p><strong>Flatten components</strong> so code lives only in leaf namespaces. Classes in a parent namespace that also has child components are <em>orphans</em>. Fix them by moving each orphan into the leaf that owns it, by creating a new leaf such as <code>basket.checkout.shared</code> for genuinely common code, or by collapsing the children into the parent if the split wasn't meaningful.</p>`
        },
        {
          type: "diagram",
          title: "Flattening orphaned classes",
          caption: "Before: classes sit in basket.checkout alongside its child components. After: every class belongs to exactly one leaf component.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Before and after flattening a namespace">
<defs><marker id="ahp5-arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<g font-size="12">
<text x="140" y="20" text-anchor="middle" font-weight="700">Before</text>
<rect x="20" y="32" width="240" height="40" rx="7" style="fill: var(--dg-bad-soft); stroke: var(--dg-bad)"/>
<text x="32" y="50">basket.checkout</text><text x="32" y="65" font-size="11" style="fill: var(--dg-bad)">40 orphan classes</text>
<rect x="40" y="96" width="200" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="52" y="118">basket.checkout.payment</text>
<rect x="40" y="142" width="200" height="34" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)"/><text x="52" y="164">basket.checkout.cart</text>
<line x1="30" y1="72" x2="30" y2="160" style="stroke: var(--dg-line)"/><line x1="30" y1="113" x2="40" y2="113" style="stroke: var(--dg-line)"/><line x1="30" y1="160" x2="40" y2="160" style="stroke: var(--dg-line)"/>
<line x1="285" y1="110" x2="345" y2="110" style="stroke: var(--dg-muted)" stroke-width="2" marker-end="url(#ahp5-arr2)"/>
<text x="500" y="20" text-anchor="middle" font-weight="700">After</text>
<rect x="380" y="32" width="240" height="30" rx="7" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-dasharray="4 3"/><text x="392" y="52" style="fill: var(--dg-muted)">basket.checkout (no code)</text>
<rect x="400" y="76" width="220" height="34" rx="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="412" y="98">basket.checkout.payment</text>
<rect x="400" y="120" width="220" height="34" rx="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="412" y="142">basket.checkout.cart</text>
<rect x="400" y="164" width="220" height="34" rx="7" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/><text x="412" y="186">basket.checkout.pricing</text>
<line x1="390" y1="62" x2="390" y2="181" style="stroke: var(--dg-line)"/><line x1="390" y1="93" x2="400" y2="93" style="stroke: var(--dg-line)"/><line x1="390" y1="137" x2="400" y2="137" style="stroke: var(--dg-line)"/><line x1="390" y1="181" x2="400" y2="181" style="stroke: var(--dg-line)"/>
</g>
</svg>`
        },
        {
          type: "text",
          html: `<p><strong>Determine component dependencies</strong> next: draw which components use which and how heavily. This is the feasibility check at component level. If most components depend on a few, those few will become shared libraries or services. If dependencies run every which way, you'll need interfaces or more restructuring before extraction. If the picture is mostly clean clusters with a few cross-links, the clusters are your future domains.</p>`
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p>Weight the dependency map. "Delivery uses one constant from checkout" and "delivery calls 30 checkout methods" are both an arrow on a naive diagram, but they're very different amounts of work to cut.</p>`
        }
      ]
    },
    {
      id: "domains-and-services",
      title: "Patterns 5 and 6: domains, then services",
      kicker: "From structure to deployment",
      blocks: [
        {
          type: "text",
          html: `<p><strong>Create component domains.</strong> Group related components into domains and make the grouping visible in the namespaces. Basket ends up with something like:</p>`
        },
        {
          type: "table",
          headers: ["Domain", "Components (after realignment)"],
          rows: [
            ["Customer", "basket.customer.account, basket.customer.profile, basket.customer.addresses"],
            ["Catalogue", "basket.catalogue.search, basket.catalogue.admin, basket.catalogue.pricing"],
            ["Ordering", "basket.ordering.cart, basket.ordering.checkout, basket.ordering.payment, basket.ordering.promotions"],
            ["Fulfilment", "basket.fulfilment.stock, basket.fulfilment.picking"],
            ["Delivery", "basket.delivery.slots, basket.delivery.routes, basket.delivery.drivers"],
            ["Engagement", "basket.engagement.notification, basket.engagement.reporting"]
          ]
        },
        {
          type: "text",
          html: `<p>Renaming namespaces sounds cosmetic, but it's a structural commitment: any dependency from <code>basket.delivery.*</code> into <code>basket.ordering.*</code> internals is now visibly a cross-domain dependency, and a fitness function can forbid new ones.</p>
<p><strong>Create domain services.</strong> Finally, move each domain into its own deployable, usually as a service-based architecture with the database still shared. Because the earlier patterns already shaped the code, each move is largely mechanical: a domain's namespaces become a service's codebase, cross-domain calls become remote calls through a small API, and the rest of the monolith keeps working.</p>`
        },
        {
          type: "keypoints",
          title: "Fitness functions that guard the work",
          items: [
            `<strong>Pattern 1:</strong> fail when a component passes a size threshold or drifts far from the mean.`,
            `<strong>Pattern 2:</strong> flag new code that calls a notification provider outside the notification component.`,
            `<strong>Pattern 3:</strong> forbid classes directly in a namespace that has child namespaces.`,
            `<strong>Pattern 4:</strong> cap the number of incoming dependencies to any one component.`,
            `<strong>Pattern 5:</strong> forbid new dependencies between domains except through their published interfaces.`
          ]
        },
        {
          type: "callout",
          tone: "history",
          html: `<p>Features keep shipping during a migration, and new code lands wherever it's easiest. Without automated guards, a year-long decomposition can end with the monolith in roughly the same shape it started, just with new parts bolted on. The fitness functions are what make progress stick.</p>`
        },
        {
          type: "quiz",
          q: "Why gather duplicated notification logic into one component before extracting services?",
          options: ["Because notifications must always be a separate microservice", "So the business function has one owner and isn't extracted three times into three services", "Because the book forbids code duplication", "To reduce the number of statements in the codebase"],
          answer: 1,
          explain: `<p>Duplicated domain logic diverges and becomes a hidden dependency in every extraction. Consolidating it first gives it one home, which may later become a service, a shared library or stay inside one domain, depending on the forces in Chapters 7 and 8.</p>`
        }
      ]
    }
  ],
  takeaways: [
    `Components (leaf namespaces) are the unit of decomposition; get their edges and sizes right first.`,
    `Size by statements and flag outliers; split oversized components and absorb fragments.`,
    `Gather duplicated domain functionality into one component; handle technical shared code with reuse patterns instead.`,
    `Flatten so code lives only in leaves, then map weighted dependencies to judge feasibility.`,
    `Group components into domains visible in namespaces, then move domains into services, guarding each step with fitness functions.`
  ],
  furtherReading: [
    { title: "Modular Monoliths (Simon Brown)", note: "A talk on structuring a monolith by component, the state these patterns aim for." },
    { title: "ArchUnit", url: "https://www.archunit.org/", note: "Java library for writing the namespace and dependency rules described here." }
  ]
};
