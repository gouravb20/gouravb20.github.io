// LLD problem breakdowns: helpers shared by the per-problem files in chapters/ (one file per problem).
// A uniquely named global, because every notes app's scripts are type-checked as one program.
const LLD_PROBLEMS_KIT = (function () {
const PRACTICE_TIP = `<p><strong>How to practise this problem:</strong> read only the requirements, then build the solution yourself in 45 minutes: clarify (5), entities (5), public API (5), core code (20), follow-ups (10). Then compare with the Solution tab and note what you missed, and redo it from a blank file a few days later. Imports are omitted in the code: <code>java.util.*</code>, <code>java.util.concurrent.*</code>, <code>java.time.*</code>.</p>`;

/** @type {Cheatsheet} */
const PATTERN_TABLE = { title: `Practice set: patterns at a glance`, type: `table`, headers: [`Problem`, `Main patterns`, `Core skill tested`], rows: [
  [`Parking Lot`, `Strategy`, `Pricing and allocation behind interfaces, atomic spot claiming`],
  [`Elevator`, `State, Strategy`, `Scheduling and direction state`],
  [`LRU Cache`, `Data structures`, `O(1) design, generics, locking`],
  [`Splitwise`, `Strategy`, `Money handling, balance bookkeeping`],
  [`Vending Machine`, `State`, `Transitions and invalid actions`],
  [`Pub-Sub`, `Observer`, `Async delivery, failure isolation`]
] };

/** @param {string[]} mid @param {string[]} senior @param {string[]} staff @returns {DeepSection[]} */
const levels = (mid, senior, staff) => [
  { id: `mid`, title: `Junior and mid-level`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: mid }] },
  { id: `senior`, title: `Senior`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: senior }] },
  { id: `staff`, title: `Staff and above`, kicker: `What is expected`, blocks: [{ type: `keypoints`, title: `You should drive`, items: staff }] }
];

return { PRACTICE_TIP, PATTERN_TABLE, levels };
})();
