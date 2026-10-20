// Main tab: Chapter 6, Latency, regions and failure handling. Format: DeepSection[] in public/shared/notes.d.ts.
window.MAIN = window.MAIN || {};
MAIN.ch6 = [
  {
    id: "distance",
    title: "Distance sets a floor under latency",
    kicker: "Physics",
    blocks: [
      {
        type: "text",
        html: `<p>Light in optical fiber covers about 200 km per millisecond, and real cable routes are longer than straight lines. A useful rule: <strong>about 1 ms of round trip per 100 km</strong>, before any queueing or processing. No code change beats that. If your server is 7,000 km from the user, every round trip costs at least 70 ms, and a request that needs four round trips costs at least 280 ms.</p>`,
      },
      {
        type: "table",
        headers: ["Path", "Rough round trip"],
        rows: [
          ["Within one data center or zone", "Well under 1 ms"],
          ["Between zones in the same region", "1 to 2 ms"],
          ["Across the United States", "60 to 80 ms"],
          ["New York to London", "70 to 80 ms"],
          ["United States to Asia or Australia", "150 to 250 ms"],
        ],
        note: "Ballpark figures for estimates; real values depend on routing.",
      },
      {
        type: "text",
        html: `<p>The fix is <strong>data locality</strong>: put data near the computation that uses it, and both near the user. Three tools do this. A <strong>CDN</strong> caches static and cacheable content in hundreds of cities. <strong>Regional deployments</strong> run full copies of the service closer to users. <strong>Regional partitioning</strong> stores each region's data in that region, which works whenever users rarely interact across regions, as in ride hailing or food delivery. Equally important: keep a service and its database in the same region, because a chatty request that makes ten database calls across an ocean pays ten long round trips.</p>`,
      },
    ],
  },
  {
    id: "timeouts",
    title: "Every remote call needs a timeout, and timeouts are ambiguous",
    kicker: "Failure",
    blocks: [
      {
        type: "text",
        html: `<p>Networks lose, delay and duplicate messages, and dependencies fail independently. Without a timeout, a hung dependency holds your threads and connections until your own service runs out of them. So every remote call gets a timeout, set from the dependency's normal latency (a little above its 99th percentile is a common starting point).</p><p>But a timeout tells you very little. When it fires, one of three things happened: the request never arrived, the server is still working on it, or the server finished and the reply was lost. From the caller's side these look identical. That ambiguity is why retries must be designed carefully.</p>`,
      },
    ],
  },
  {
    id: "retries",
    title: "Retrying safely",
    kicker: "Trying again",
    blocks: [
      {
        type: "steps",
        title: "A retry policy you can recite",
        items: [
          "<strong>Retry only transient failures:</strong> timeouts, connection resets, 503 and 429. Never retry 400, 401, 403 or 404; the same request will fail the same way.",
          "<strong>Back off exponentially:</strong> wait roughly 100 ms, then 200, 400, 800, up to a cap, and stop after a few attempts.",
          "<strong>Add jitter:</strong> randomize each wait so that thousands of clients that failed at the same moment don't retry at the same moment.",
          "<strong>Make the operation idempotent,</strong> or send an idempotency key so the server can recognise a repeat and return the original result instead of acting twice.",
          "<strong>Budget retries:</strong> cap them at a small share of normal traffic so that during an outage retries can't multiply the load several times over.",
        ],
      },
      {
        type: "callout",
        tone: "insight",
        title: "Worked example: a checkout that timed out",
        html: `<p>A user clicks Pay, the call to the payment provider times out, and the client retries. Without protection the user may be charged twice, because the first attempt may have succeeded. With an idempotency key generated once per checkout attempt and sent on every retry, the server stores the key alongside the result; the retry finds the key and returns the stored outcome. The key must identify the user's intent, not each network attempt, or it protects nothing.</p>`,
      },
    ],
  },
  {
    id: "circuit-breakers",
    title: "Stopping one failure from becoming an outage",
    kicker: "Containing the blast",
    blocks: [
      {
        type: "text",
        html: `<p>Failures cascade. A slow dependency makes callers wait, their thread pools fill, their own callers time out and retry, and the added traffic flattens the dependency just as it tries to recover. A <strong>circuit breaker</strong> breaks that loop by failing fast once a dependency looks unhealthy.</p>`,
      },
      {
        type: "table",
        headers: ["State", "What calls do", "Moves on when"],
        rows: [
          ["Closed", "Pass through; failures are counted", "The failure rate crosses a threshold, then it opens"],
          ["Open", "Fail immediately or use a fallback, without touching the dependency", "A cool-down passes, then it goes half-open"],
          ["Half-open", "A few trial calls are let through", "They succeed, so it closes; or they fail, so it opens again"],
        ],
      },
      {
        type: "text",
        html: `<p>Pair every breaker with a <strong>fallback</strong> so users get a degraded experience instead of an error page: cached data, a sensible default, a hidden widget, or work queued for later. A product page whose recommendations service is down should still show the product.</p>`,
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
        html: `<p>Senior interviews almost always ask "what happens when this dependency fails or gets slow?" Answer it before you are asked, for each external call on the critical path, using the same four beats: a timeout, retries with exponential backoff and jitter, idempotency for anything that writes, and a circuit breaker with a fallback. For global products, say where users are, how many round trips a request needs, and how a CDN and regional deployments shorten them.</p>`,
      },
      {
        type: "callout",
        tone: "mistake",
        title: "Common mistakes",
        html: `<ul><li>"Just retry" with no backoff, jitter or limit, which turns a blip into a retry storm.</li><li>Retrying payments or bookings without an idempotency key.</li><li>Putting the database in a different region from the service that queries it.</li><li>Treating a timeout as proof that the operation didn't happen.</li></ul>`,
      },
    ],
  },
];
