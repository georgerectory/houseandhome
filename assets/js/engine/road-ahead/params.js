// params.js - from variable rows and a scenario to the parameter map the
// engine runs on, and a refusal when something is missing.
//
// THE ENGINE HAS NO DEFAULTS. Every value comes from ra_variables (or
// the fixture, or the golden master's invented inputs), because a
// default in code is a second source of truth that nobody reviews. A
// missing key is an error naming the key, never a silent fallback.
//
// Three things are DERIVED here, after the overrides, so that one fact
// has one home:
//   * the last month of the family stay, from timeline.bridge_from;
//   * the lender's income multiple, from the mortgage in principle and
//     the salary it was based on, unless a scenario sets it outright;
//   * every house-price path extended to 2040 by repeating its last
//     year, as the kit did.

import { REGISTRY, keysUsedBy } from './registry.js';
import { addMonths } from './money.js';

const PATH_LAST_YEAR = 2040;
const PATH_FIRST_YEAR = 2026;

/** A year -> growth path with every year to 2040 filled from its last. */
export function extendPath(path) {
  const d = {};
  for (const [y, g] of Object.entries(path)) d[Number(y)] = g;
  const years = Object.keys(d).map(Number);
  const last = d[Math.max(...years)];
  for (let y = PATH_FIRST_YEAR; y <= PATH_LAST_YEAR; y += 1) if (!(y in d)) d[y] = last;
  return d;
}

/**
 * Build the parameter map.
 * @param {Object<string, *>} values variable key -> value
 * @param {...(Object<string, *>|null)} overrides scenario overrides, applied in order
 * @returns {object} P, with P.market[name] for each 'market.name' path
 */
export function buildParams(values, ...overrides) {
  const P = { market: {} };
  const put = (k, v) => {
    if (k.startsWith('market.')) P.market = { ...P.market, [k.slice('market.'.length)]: extendPath(v) };
    else P[k] = v;
  };
  for (const [k, v] of Object.entries(values)) put(k, v);
  for (const o of overrides) if (o) for (const [k, v] of Object.entries(o)) put(k, v);

  if (P['timeline.bridge_from']) P['timeline.family_until'] = addMonths(P['timeline.bridge_from'], -1);
  if (P['mortgage.house1_max_multiple'] == null
      && P['mortgage.mip_amount'] != null && P['mortgage.mip_salary'] != null) {
    P['mortgage.house1_max_multiple'] = P['mortgage.mip_amount'] / P['mortgage.mip_salary'];
  }
  return P;
}

const isMonth = (v) => Array.isArray(v) && v.length === 2
  && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[1] >= 1 && v[1] <= 12;
const isPath = (v) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length > 0 && Object.values(v).every(Number.isFinite);

/**
 * What is missing or malformed for a part of the engine.
 * @param {object} P
 * @param {'roads'|'route'|'appraisal'|'lender'} part
 * @returns {string[]} one line per problem; empty when P will run
 */
export function problems(P, part) {
  const out = [];
  const needed = new Set([...keysUsedBy(part), ...(part === 'roads' || part === 'route' ? keysUsedBy('lender') : [])]);
  for (const r of REGISTRY) {
    if (!needed.has(r.key)) continue;
    if (r.key === 'mortgage.mip_amount' || r.key === 'mortgage.mip_salary') continue; // only needed to derive
    const v = r.kind === 'path' ? P.market?.[r.key.slice('market.'.length)] : P[r.key];
    if (v == null) out.push(`${r.key} is missing (${r.meaning})`);
    else if (r.kind === 'number' && !Number.isFinite(v)) out.push(`${r.key} should be a number, got ${JSON.stringify(v)}`);
    else if (r.kind === 'month' && !isMonth(v)) out.push(`${r.key} should be [year, month], got ${JSON.stringify(v)}`);
    else if (r.kind === 'path' && !isPath(v)) out.push(`${r.key} should be a year -> growth map`);
  }
  return out;
}

/** Throw, naming every problem, unless P can run the part. */
export function assertRunnable(P, part) {
  const p = problems(P, part);
  if (p.length) throw new Error(`Road Ahead cannot run the ${part}:\n  ${p.join('\n  ')}`);
  return P;
}

/** The local-help settings withHelp() takes. */
export const helpSettings = (P) => ({
  near: { cost: P['help.near.cost'], time: P['help.near.time'] },
  far: { cost: P['help.far.cost'], time: P['help.far.time'] },
  min_months: P['help.min_months'],
});

/** The appraisal settings appraise() takes. */
export const appraisalSettings = (P) => ({
  cash_at_purchase: P['appraisal.cash_at_purchase'],
  buy_costs: P['appraisal.buy_costs'],
  day_one_kit: P['appraisal.day_one_kit'],
  deposit_pct: P['appraisal.deposit_pct'],
  sell_pct: P['appraisal.sell_pct'],
  sell_fixed: P['appraisal.sell_fixed'],
  target_profit: P['appraisal.target_profit'],
  works_factor: P['appraisal.works_factor'],
  walk_from: P['appraisal.walk_from'],
  walk_to: P['appraisal.walk_to'],
  walk_step: P['appraisal.walk_step'],
  stretch_below: P['appraisal.stretch_below'],
  near_minutes: P['help.near_minutes'],
  help_near_cost: P['help.near.cost'],
  help_far_cost: P['help.far.cost'],
  ceiling_hard: P['ceiling.hard'],
  verdict_strong: P['verdict.strong'],
  verdict_worth: P['verdict.worth'],
  verdict_marginal: P['verdict.marginal'],
});
