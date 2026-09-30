// focus.js - one real listing dropped into a road in place of the road's
// typical House 1, so the question "what would THIS house do to the
// forever-home budget?" has an answer rather than an impression.
//
// The road keeps its shape - rent, buy, sell, then the forever home -
// and takes the listing's price, works, finished value and fees. The
// owner's sub-decisions are options, each a plain override:
//   keys         the month of purchase (renting shorter or longer)
//   stay_months  how long the house is kept before it is sold
//   dep          the deposit
//   wm           how many months the works take
// Everything else - promotion, child timing and count - is a scenario,
// passed to runRoad() as usual.
//
// A percentage auction fee becomes the stage's MMoA rate. A fixed admin
// fee is left out, as the kit's roads left it out: the register counts
// it, the road model has never had a line for it.

import { addMonths, monthIndex } from './money.js';

/**
 * The road with its House 1 replaced by a listing.
 * @param {object} road stages as stored
 * @param {{name:string, likely_buy:number, works:number, fin_lo:number, fin_hi:number,
 *          fee?:number, pct?:number, wm?:number}} listing
 * @param {{keys?:[number, number], stay_months?:number, dep?:number, wm?:number}} [opts]
 * @returns {object} a new road; the stored one is untouched
 */
export function focusRoad(road, listing, opts = {}) {
  const r = structuredClone(road);
  const buyAt = r.stages.findIndex((s) => s.kind === 'buy');
  if (buyAt < 0) throw new Error('this road has no House 1 to replace');
  const buy = r.stages[buyAt];
  const sellAt = r.stages.findIndex((s, i) => i > buyAt && s.kind === 'sell');
  const oldBuy = buy.at;
  const oldStay = sellAt >= 0 ? monthIndex(r.stages[sellAt].at) - monthIndex(oldBuy) : null;

  Object.assign(buy, {
    label: listing.name,
    price: listing.likely_buy,
    works: listing.works,
    E: (listing.fin_lo + listing.fin_hi) / 2,
  });
  delete buy.mmoa;
  if (listing.pct) buy.mmoa = listing.pct;
  if (opts.dep != null) buy.dep = opts.dep;
  if (opts.wm != null || listing.wm != null) buy.wm = opts.wm ?? listing.wm;
  if (opts.keys) buy.at = opts.keys;

  // Moving the purchase or the stay moves the sale, and the forever
  // home bought with its proceeds, together.
  if (sellAt >= 0) {
    const stay = opts.stay_months ?? oldStay;
    const sold = addMonths(buy.at, stay);
    const before = r.stages[sellAt].at;
    for (const s of r.stages.slice(sellAt)) {
      if (monthIndex(s.at) === monthIndex(before)) s.at = sold;
    }
  }
  return r;
}
