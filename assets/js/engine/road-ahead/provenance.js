// provenance.js - what an output rests on, and how much of that is only
// an estimate.
//
// Road Ahead is a model built mostly on estimates, and CLAUDE.md rule 4
// says an unconfirmed figure never drives a decision. So the model's
// outputs are always computed, and always say how much of them is
// unconfirmed; they never become "you can afford this". This module is
// where that sentence comes from.
//
// Two label systems travel together, as they do on every row here:
//   evidence    the kit's own: STATED, VERIFIED, ESTIMATE, CHECK
//   confidence  the portal's ladder, where only confirmed and actual
//               are trusted

import { keysUsedBy } from './registry.js';

const TRUSTED = new Set(['confirmed', 'actual']);
const SOFT = new Set(['ESTIMATE', 'CHECK']);

const APPRAISAL_PROFIT = [
  'appraisal.buy_costs', 'appraisal.sell_pct', 'appraisal.sell_fixed',
  'help.near_minutes', 'help.near.cost', 'help.far.cost', 'appraisal.works_factor',
];

/** The variables each headline output reads. */
export const DEPENDS = Object.freeze({
  profit: APPRAISAL_PROFIT,
  walk_away: [...APPRAISAL_PROFIT, 'appraisal.target_profit', 'appraisal.walk_from', 'appraisal.walk_to', 'appraisal.walk_step'],
  cash_left: ['appraisal.cash_at_purchase', 'appraisal.deposit_pct', 'appraisal.buy_costs', 'appraisal.day_one_kit'],
  verdict: [...APPRAISAL_PROFIT, 'appraisal.cash_at_purchase', 'appraisal.deposit_pct', 'appraisal.day_one_kit',
    'ceiling.hard', 'appraisal.stretch_below', 'verdict.strong', 'verdict.worth', 'verdict.marginal'],
  forever_budget: [...new Set([...keysUsedBy('roads'), ...keysUsedBy('lender')])],
});

/**
 * How far an output can be trusted.
 * @param {string[]} keys the variables it reads (DEPENDS[name], or a listing's own figures)
 * @param {Object<string, {evidence?:string, confidence?:string}>} labels key -> its labels
 * @returns {{inputs:number, by_evidence:Object<string, number>, soft:string[],
 *            untrusted:string[], soft_share:number, trusted_share:number}}
 */
export function provenance(keys, labels) {
  const byEvidence = { STATED: 0, VERIFIED: 0, ESTIMATE: 0, CHECK: 0, unlabelled: 0 };
  const soft = [];
  const untrusted = [];
  for (const k of keys) {
    const l = labels[k] ?? {};
    const e = l.evidence && l.evidence in byEvidence ? l.evidence : 'unlabelled';
    byEvidence[e] += 1;
    if (SOFT.has(e) || e === 'unlabelled') soft.push(k);
    if (!TRUSTED.has(l.confidence)) untrusted.push(k);
  }
  const n = keys.length || 1;
  return {
    inputs: keys.length,
    by_evidence: byEvidence,
    soft,
    untrusted,
    soft_share: soft.length / n,
    trusted_share: (keys.length - untrusted.length) / n,
  };
}

/** One sentence for the page: how much of a figure is still only an estimate. */
export function trustLine(p) {
  if (!p.inputs) return 'Nothing to weigh.';
  if (!p.soft.length && !p.untrusted.length) return 'Every input is confirmed.';
  const est = p.soft.length;
  return `${est} of ${p.inputs} inputs are estimates or unchecked; `
    + `${p.inputs - p.untrusted.length} of ${p.inputs} are confirmed. A model, not a promise.`;
}
