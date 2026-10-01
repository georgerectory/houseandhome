// sweep.js - how much can the Golden Egg cost before the cash runs out?
//
// The Golden Egg is bought once and grown for years, so the question is
// not the dearest price a lender allows but the dearest price the cash
// can carry through the works. The sweep runs the road at fixed prices
// and reports the lowest the cash goes.
//
// SUSTAINABLE MEANS THE CASH NEVER GOES BELOW ZERO, on the run's own
// min_cash (rounded to the thousand, as the kit published it). The
// works done by the end are reported beside it rather than folded in:
// the kit's wording also asked for the first phase of works funded,
// and whether that should bind is a question for the owner, recorded
// as a contradiction, not settled here.

import { withHelp, applyOverrides, firstBuy } from './roads.js';
import { simulate } from './simulate.js';

/** The road's forever purchase fixed at a price and deposit, reserve removed. */
function atPrice(road, help, price, dep) {
  const g = withHelp(road, true, help);
  const s = g.stages.find((st) => st.kind === 'forever');
  s.price = price;
  s.dep = dep;
  delete s.keep_for_works;
  return g;
}

/**
 * The kit's sustainability table: each [price, deposit] point under each
 * named parameter set.
 * @param {object} road the Golden Egg road
 * @param {object} help help settings
 * @param {Array<[number, number]>} points
 * @param {Array<[string, object]>} pays [name, parameters] pairs
 * @returns {Object<string, {min_cash:number, works_done:number, monthly:number}>}
 *   keyed "price|name"
 */
export function sustainability(road, help, points, pays) {
  const out = {};
  for (const [price, dep] of points) {
    const g = atPrice(road, help, price, dep);
    for (const [name, P] of pays) {
      const r = simulate(g, P);
      out[`${price}|${name}`] = { min_cash: r.min_cash, works_done: r.works_done, monthly: firstBuy(r).monthly };
    }
  }
  return out;
}

/**
 * The dearest sustainable price on a grid, per pay path.
 * @param {object} road
 * @param {object} help
 * @param {object} P base parameters
 * @param {{from:number, to:number, step:number, dep:number}} grid
 * @param {Array<[string, object]>} scenarios [name, overrides] pairs
 * @returns {Object<string, {bid:number|null, min_cash:number|null, works_done:number|null}>}
 */
export function highestSustainableBid(road, help, P, grid, scenarios) {
  const out = {};
  for (const [name, overrides] of scenarios) {
    const Ps = applyOverrides(P, overrides);
    let best = { bid: null, min_cash: null, works_done: null };
    for (let price = grid.from; price <= grid.to; price += grid.step) {
      const r = simulate(atPrice(road, help, price, grid.dep), Ps);
      if (r.min_cash >= 0) best = { bid: price, min_cash: r.min_cash, works_done: r.works_done };
    }
    out[name] = best;
  }
  return out;
}
