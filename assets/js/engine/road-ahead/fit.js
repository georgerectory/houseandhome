// fit.js - how well a listing fits a road, worked out from the road's
// criteria, shown BESIDE the owner's own score and never instead of it.
//
// The kit's road-fit scores (0 to 3) were typed by hand. They are the
// owner's judgement and stay the stored answer. This computes a second
// opinion from the criteria each road states - distance, price band,
// beds, type, plot, the finished-value margin, no auction fee - so a
// score that has drifted from its own road's rules gets noticed. A
// disagreement is reported; nothing is corrected automatically.
//
// A criterion is data, from the road's row:
//   { field, op, value, label }
//   op: '<=' | '>=' | 'between' | 'is' | 'in' | 'not'
// A listing that lacks the field leaves the criterion UNKNOWN, which is
// not the same as failing it: an unknown is excluded from the score and
// listed, so a thin listing reads as thin rather than as a poor fit.

const TESTS = {
  '<=': (v, x) => v <= x,
  '>=': (v, x) => v >= x,
  between: (v, [lo, hi]) => v >= lo && v <= hi,
  is: (v, x) => v === x,
  in: (v, xs) => xs.includes(v),
  not: (v, x) => v !== x,
};

/** Fields worked out from others, so criteria can name them directly. */
function derivedFields(L) {
  const out = { ...L };
  if (L.finished_mid == null && L.fin_lo != null && L.fin_hi != null) out.finished_mid = (L.fin_lo + L.fin_hi) / 2;
  if (out.finished_mid != null && L.likely_buy) out.finished_ratio = out.finished_mid / L.likely_buy;
  if (L.price == null && L.likely_buy != null) out.price = L.likely_buy;
  if (L.mmoa == null && L.pct != null) out.mmoa = L.pct > 0;
  return out;
}

/**
 * Score one listing against one road's criteria.
 * @param {object} listing
 * @param {Array<{field:string, op:string, value:*, label?:string}>} criteria
 * @returns {{score:number|null, met:string[], failed:string[], unknown:string[]}}
 *   score 0 to 3 from the criteria that could be judged; null if none could
 */
export function fitScore(listing, criteria) {
  const L = derivedFields(listing);
  const met = [];
  const failed = [];
  const unknown = [];
  for (const c of criteria) {
    const name = c.label ?? `${c.field} ${c.op} ${JSON.stringify(c.value)}`;
    const v = L[c.field];
    const test = TESTS[c.op];
    if (!test) throw new Error(`unknown fit operator ${c.op}`);
    if (v == null) unknown.push(name);
    else if (test(v, c.value)) met.push(name);
    else failed.push(name);
  }
  const judged = met.length + failed.length;
  return { score: judged ? Math.round((3 * met.length) / judged) : null, met, failed, unknown };
}

/**
 * Every road's computed fit beside the stored one.
 * @param {object} listing
 * @param {Array<{code:string, fit?:object[]}>} roads
 * @param {Array<[string, number]>} stored the owner's [road, score] pairs
 * @returns {Array<{road:string, stored:number|null, computed:number|null, agrees:boolean|null,
 *                  met:string[], failed:string[], unknown:string[]}>}
 */
export function fitCheck(listing, roads, stored = []) {
  const byRoad = new Map(stored);
  return roads.map((r) => {
    const f = fitScore(listing, r.fit ?? []);
    const s = byRoad.has(r.code) ? byRoad.get(r.code) : 0;
    return {
      road: r.code, stored: s, computed: f.score,
      agrees: f.score == null ? null : Math.abs(f.score - s) <= 1,
      met: f.met, failed: f.failed, unknown: f.unknown,
    };
  });
}
