// roads.js - the roads as data, run under scenarios.
//
// A port of the Rectory kit's roads_v4 layer. A road's stages come from
// the database; this module only transforms and runs them:
//
//   * LOCAL HELP. Near home, friends and family replace some paid labour
//     and speed the sprint; far away, more is paid and it takes longer.
//     Works are scaled and rounded to the thousand, months scaled and
//     rounded with a floor - the kit's order, because the rounding is
//     part of every published figure.
//   * THE WORKS FACTOR. The optimistic scenarios take a further share
//     off the works, applied after help and rounded again.
//   * SCENARIOS. { overrides, works_factor?, help? }: parameter
//     overrides (promotion, a job change, bad luck, no child costs, a
//     longer family stay) and the two road transforms. A scenario is a
//     row in ra_scenarios, never a branch in this code.

import { pyRound } from './money.js';
import { simulate } from './simulate.js';

const clone = (x) => structuredClone(x);

/**
 * Scale a road's works for local help.
 * @param {object} road
 * @param {boolean} near within the near-home radius
 * @param {{near:{cost:number,time:number}, far:{cost:number,time:number}, min_months:number}} help
 */
export function withHelp(road, near, help) {
  const r = clone(road);
  const h = near ? help.near : help.far;
  for (const st of r.stages) {
    if ((st.kind === 'buy' || st.kind === 'forever') && st.works) {
      st.works = pyRound(st.works * h.cost, -3);
      st.wm = Math.max(help.min_months, pyRound(st.wm * h.time));
      if ('eff' in st) st.eff = pyRound(st.eff * h.cost, -3);
    }
  }
  return r;
}

/** Take a further share off every stage's works, to the thousand. */
export function withWorksFactor(road, factor) {
  if (factor === 1) return road;
  const r = clone(road);
  for (const st of r.stages) if (st.works) st.works = pyRound(st.works * factor, -3);
  return r;
}

/** The same road with one stage moved to another month. */
export function withStageAt(road, index, at) {
  const r = clone(road);
  r.stages[index].at = at;
  return r;
}

/** Parameters with a scenario's overrides laid over them. */
export const applyOverrides = (P, overrides) => (overrides ? { ...P, ...overrides } : P);

/**
 * Run a road under a scenario.
 * @param {object} road stages as stored
 * @param {boolean} near
 * @param {object} P base parameters
 * @param {{overrides?:object, works_factor?:number, help?:boolean}} [scenario]
 * @param {object} help the help settings (see withHelp)
 */
export function runRoad(road, near, P, scenario = {}, help) {
  let r = scenario.help === false ? road : withHelp(road, near, help);
  if (scenario.works_factor != null) r = withWorksFactor(r, scenario.works_factor);
  return simulate(r, applyOverrides(P, scenario.overrides));
}

/** Profit on each sale along a road, in order. */
export const saleProfits = (result) =>
  result.ledger.filter((e) => e.step.startsWith('Sell')).map((e) => e.profit);

/** The first purchase on a road, which carries the monthly the sweep reports. */
export const firstBuy = (result) => result.ledger.find((e) => e.step.startsWith('Buy')) ?? null;

/**
 * The headline of a run: what the forever home costs in today's money,
 * when, what House 1 made, and how low the cash went.
 */
export function headline(result) {
  return {
    forever_today: result.forever_today ?? null,
    forever_price: result.forever_price ?? null,
    forever_when: result.forever_when ?? null,
    profits: saleProfits(result),
    min_cash: result.min_cash,
    min_cash_when: result.min_cash_when,
    fa_used: result.fa_used,
    works_done: result.works_done ?? null,
    works_left: result.works_left ?? null,
    flags: result.ledger.flatMap((e) => e.flags ?? []),
  };
}
