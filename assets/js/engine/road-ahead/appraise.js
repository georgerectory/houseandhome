// appraise.js - one listing, one consistent money method: what it would
// make, the most it is worth paying, the cash it leaves, and a verdict.
//
// A port of the Rectory kit's register_v5 (Part P of the plan), which
// scored every property sent or found. Mirrored in SQL by ra_assess()
// so any Claude with the database connector reaches the same numbers
// without running code; the parity gate holds the two equal.
//
// V is the appraisal settings, read from variables (see registry.js):
//   cash_at_purchase, buy_costs, day_one_kit, sell_pct, sell_fixed,
//   target_profit, deposit_pct, works_factor (the optimistic one),
//   near_minutes, help_near_cost, help_far_cost, ceiling_hard,
//   stretch_below, verdict_strong, verdict_worth, verdict_marginal,
//   walk_from, walk_to, walk_step.
// Every purchase here is priced as a first-time buyer's, as the kit's
// was: the register is for House 1.

import { pyRound, sdlt } from './money.js';

/** The auction or agency fee on a price: a percentage with a floor, or a fixed fee. */
export const feeOn = (buy, fee = 0, pct = 0) => (pct ? Math.max(buy * pct, fee) : fee);

/** A percentage fee is part of the price for stamp duty; a fixed admin fee is not. */
const dutiable = (buy, fee, pct) => buy + (pct ? feeOn(buy, fee, pct) : 0);

/**
 * Profit if bought, done up and sold at the finished value, to the thousand.
 */
export function profit(V, buy, works, finished, fee = 0, pct = 0) {
  const f = feeOn(buy, fee, pct);
  return pyRound(finished - (buy + f + sdlt(dutiable(buy, fee, pct), true) + V.buy_costs + works
    + finished * V.sell_pct + V.sell_fixed), -3);
}

/**
 * The walk-away price: the highest buy that still makes the target
 * profit, searched upward in fixed steps. Returns the step below the
 * first price that misses; the top of the range if none does.
 */
export function walkAway(V, works, finished, fee = 0, pct = 0, target = null) {
  const t = target ?? V.target_profit;
  for (let b = V.walk_from; b <= V.walk_to; b += V.walk_step) {
    if (profit(V, b, works, finished, fee, pct) < t) return b - V.walk_step;
  }
  return V.walk_to;
}

/** Cash left after the deposit, stamp duty, buying costs, kit and fee. */
export function cashLeft(V, buy, fee = 0, pct = 0, dep = null) {
  const f = feeOn(buy, fee, pct);
  const d = dep ?? V.deposit_pct;
  return pyRound(V.cash_at_purchase - (buy * d + sdlt(dutiable(buy, fee, pct), true)
    + V.buy_costs + V.day_one_kit + f), -3);
}

/**
 * The verdict, from the optimistic profit, then the cash and price limits.
 * @returns {string} 'Strong', 'Worth pursuing', 'Marginal', 'Walk away',
 *   'Over budget', with ' (stretch)' when the cash left is thin
 */
export function verdict(V, profitOpt, buy, cash) {
  let grade = profitOpt >= V.verdict_strong ? 'Strong'
    : profitOpt >= V.verdict_worth ? 'Worth pursuing'
      : profitOpt >= V.verdict_marginal ? 'Marginal' : 'Walk away';
  if (buy > V.ceiling_hard || cash < 0) grade = 'Over budget';
  else if (cash < V.stretch_below && (grade === 'Strong' || grade === 'Worth pursuing')) grade += ' (stretch)';
  return grade;
}

/**
 * The road a listing fits best: the first highest score in the order
 * the scores were given. Order matters - it breaks ties - which is why
 * fits travel as an ordered list of [road, score] pairs.
 * @param {Array<[string, number]>} fits
 */
export function bestRoad(fits) {
  let best = null;
  for (const [road, score] of fits) if (best === null || score > best[1]) best = [road, score];
  return best ? best[0] : '—';
}

/**
 * The owner's judgement beside the maths. The maths gives a walk-away
 * price; the owner may know something it cannot - that this is the
 * house, that the village matters, that a survey is coming - and set a
 * different figure, or a premium above the maths, WITH A REASON. The
 * computed figure is never replaced: both are shown, and what the
 * judgement costs is stated in money, so a feeling can be weighed
 * rather than hidden. The cash ceiling still binds, because a reason is
 * not cash; raising the ceiling is a change to the ceiling itself.
 *
 * @param {object} V appraisal settings
 * @param {object} L the listing (fee, pct, fin_lo, fin_hi)
 * @param {number} mathsWalk the computed optimistic walk-away
 * @param {number} worksOpt the optimistic works
 * @param {{walk_away?:number, premium?:number, reason:string,
 *          kind?:'emotional'|'personal'|'strategic'|'information'}} J
 * @returns {object|null}
 */
export function judged(V, L, mathsWalk, worksOpt, J) {
  if (!J || (J.walk_away == null && J.premium == null)) return null;
  if (!J.reason || !String(J.reason).trim()) throw new Error('a judgement needs its reason');
  const fee = L.fee ?? 0;
  const pct = L.pct ?? 0;
  const mid = (L.fin_lo + L.fin_hi) / 2;
  const walk = J.walk_away ?? mathsWalk + J.premium;
  const profitThere = profit(V, walk, worksOpt, mid, fee, pct);
  return {
    walk_away: walk,
    bid_limit: Math.min(walk, V.ceiling_hard),
    above_ceiling: walk > V.ceiling_hard,
    difference: walk - mathsWalk,
    profit_opt: profitThere,
    // Profit given up against paying the maths' own walk-away price.
    cost: profit(V, mathsWalk, worksOpt, mid, fee, pct) - profitThere,
    cash_left: cashLeft(V, Math.min(walk, V.ceiling_hard), fee, pct),
    reason: J.reason,
    kind: J.kind ?? 'personal',
  };
}

/**
 * Score one listing.
 * @param {object} V appraisal settings
 * @param {{likely_buy:number, fin_lo:number, fin_hi:number, works:number,
 *          fee?:number, pct?:number, mins:number,
 *          fits?: Array<[string, number]>, override_grade?: string,
 *          judgement?: object}} L
 * @returns {object} the kit's register row, computed fields only, and the
 *   owner's judgement beside it when there is one
 */
export function appraise(V, L) {
  const buy = L.likely_buy;
  const fee = L.fee ?? 0;
  const pct = L.pct ?? 0;
  const mid = (L.fin_lo + L.fin_hi) / 2;
  const near = L.mins <= V.near_minutes;
  // Local help first, then the optimistic factor on top, each to the thousand.
  const worksBase = pyRound(L.works * (near ? V.help_near_cost : V.help_far_cost), -3);
  const worksOpt = pyRound(worksBase * V.works_factor, -3);
  const profitBase = profit(V, buy, worksBase, mid, fee, pct);
  const profitOpt = profit(V, buy, worksOpt, mid, fee, pct);
  const profitOptHi = profit(V, buy, worksOpt, L.fin_hi, fee, pct);
  const walk = walkAway(V, worksOpt, mid, fee, pct);
  const cash = cashLeft(V, buy, fee, pct);
  const grade = L.override_grade ?? verdict(V, profitOpt, buy, cash);
  return {
    near, works_base: worksBase, works_opt: worksOpt,
    best_road: bestRoad(L.fits ?? []),
    profit_base: profitBase, profit_opt: profitOpt, profit_opt_hi: profitOptHi,
    walk_away_opt: walk, bid_limit: Math.min(walk, V.ceiling_hard), cash_left: cash,
    over_ceiling: buy > V.ceiling_hard, grade,
    judgement: judged(V, L, walk, worksOpt, L.judgement),
  };
}
