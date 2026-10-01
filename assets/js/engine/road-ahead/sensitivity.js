// sensitivity.js - which inputs move an answer most, and which of those
// are still only estimates: the agenda for sitting down to make the
// model more accurate.
//
// A model like this is only as good as its least-examined input, and
// there are over a hundred. Asking about all of them is a waste of an
// evening; asking about the wrong ten is worse. So each input is swung
// across its plausible range (the low and high every variable row
// carries, or a stated step where it has none) and the change in the
// answer measured. An input that moves the forever budget by £40k and is
// a guess is the first question; one that moves it by £400 and is
// confirmed is never asked.
//
// Pure functions of an output and the parameters: the output is any
// function P -> number - a road's forever budget, a listing's walk-away,
// the lowest cash on a road - so the same agenda works for all of them.

import { simulate } from './simulate.js';
import { withHelp, withWorksFactor } from './roads.js';
import { appraise } from './appraise.js';
import { appraisalSettings, buildParams, helpSettings } from './params.js';

const TRUSTED = new Set(['confirmed', 'actual']);

/**
 * Swing each input across its range and measure the output.
 * @param {(P: object) => number|null} output
 * @param {Object<string, *>} values variable key -> value (as buildParams takes them)
 * @param {Array<{key:string, low:number, high:number}>} ranges
 * @param {object[]} [overrides] the scenario, applied as usual
 * @returns {Array<{key:string, low:number, high:number, at_low:number|null,
 *                  at_high:number|null, swing:number}>} largest swing first
 */
export function sensitivity(output, values, ranges, overrides = []) {
  const base = output(buildParams(values, ...overrides));
  const rows = [];
  for (const { key, low, high } of ranges) {
    if (!(key in values) || !Number.isFinite(low) || !Number.isFinite(high) || low === high) continue;
    const at = (v) => output(buildParams({ ...values, [key]: v }, ...overrides));
    const lo = at(low);
    const hi = at(high);
    const swing = (lo == null || hi == null) ? Infinity : Math.abs(hi - lo);
    rows.push({ key, low, high, base, at_low: lo, at_high: hi, swing });
  }
  return rows.sort((a, b) => b.swing - a.swing || a.key.localeCompare(b.key));
}

/**
 * The plausible range for each numeric variable: its own low and high
 * where the row has them, else the value plus or minus a relative step.
 * @param {Object<string, {value:*, low?:number, high?:number}>} variables
 * @param {number} [step=0.1]
 */
export function rangesOf(variables, step = 0.1) {
  const out = [];
  for (const [key, v] of Object.entries(variables)) {
    if (typeof v.value !== 'number' || v.value === 0) continue;
    const low = Number.isFinite(v.low) ? v.low : v.value * (1 - step);
    const high = Number.isFinite(v.high) ? v.high : v.value * (1 + step);
    out.push({ key, low, high, stated: Number.isFinite(v.low) && Number.isFinite(v.high) });
  }
  return out;
}

/**
 * What to ask about first: the swings, weighted by how little is known.
 * A confirmed input still appears if it swings the answer, but after
 * every estimate that swings it as much.
 * @param {ReturnType<typeof sensitivity>} rows
 * @param {Object<string, {evidence?:string, confidence?:string, meaning?:string}>} labels
 * @param {{top?:number, confirmedWeight?:number}} [opts]
 * @returns {Array<{key:string, swing:number, score:number, confidence:string|null,
 *                  evidence:string|null, why:string}>}
 */
export function calibrationAgenda(rows, labels, { top = 10, confirmedWeight = 0.1 } = {}) {
  return rows
    .filter((r) => r.swing > 0)
    .map((r) => {
      const l = labels[r.key] ?? {};
      const trusted = TRUSTED.has(l.confidence);
      const score = (Number.isFinite(r.swing) ? r.swing : 1e12) * (trusted ? confirmedWeight : 1);
      const state = trusted ? 'confirmed' : (l.evidence ?? 'unlabelled').toLowerCase();
      return {
        key: r.key, swing: r.swing, score, confidence: l.confidence ?? null, evidence: l.evidence ?? null,
        why: `across ${r.low} to ${r.high} it moves the answer by ${Math.round(r.swing).toLocaleString('en-GB')}; it is ${state}`,
      };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, top);
}

/**
 * One agenda across several answers: each input once, at its largest
 * weighted swing, with every answer it moves. The same aggregation as
 * ra_calibration_agenda in 89_road_ahead_record.sql, which road_ahead_agenda() reads.
 * @param {Array<{output:string, rows:ReturnType<typeof sensitivity>}>} snapshots
 * @param {Object<string, {evidence?:string, confidence?:string}>} labels
 * @param {{top?:number, confirmedWeight?:number}} [opts]
 * @returns {Array<{key:string, score:number, swing:number, moves:string[],
 *                  confidence:string|null, evidence:string|null}>}
 */
export function combinedAgenda(snapshots, labels, { top = 8, confirmedWeight = 0.1 } = {}) {
  const byKey = new Map();
  for (const { output, rows } of snapshots) {
    for (const r of rows) {
      if (!Number.isFinite(r.swing) || r.swing <= 0) continue;
      const l = labels[r.key] ?? {};
      const score = r.swing * (TRUSTED.has(l.confidence) ? confirmedWeight : 1);
      const held = byKey.get(r.key) ?? { key: r.key, score: 0, swing: 0, moves: [], confidence: l.confidence ?? null, evidence: l.evidence ?? null };
      held.moves.push({ output, score });
      held.score = Math.max(held.score, score);
      held.swing = Math.max(held.swing, r.swing);
      byKey.set(r.key, held);
    }
  }
  return [...byKey.values()]
    .map((h) => ({ ...h, moves: h.moves.sort((a, b) => b.score - a.score).map((m) => m.output) }))
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, top);
}

// The road outputs apply local help from P itself, so swinging a help
// factor is measured like any other input.
const asRun = (road, near, P, scenario) => {
  let r = scenario.help === false ? road : withHelp(road, near, helpSettings(P));
  if (scenario.works_factor != null) r = withWorksFactor(r, scenario.works_factor);
  return simulate(r, P);
};

/** A road's forever budget in today's money, as an output for sensitivity(). */
export const foreverBudget = (road, near, scenario = {}) => (P) => asRun(road, near, P, scenario).forever_today ?? null;

/** The lowest the cash goes on a road, as an output for sensitivity(). */
export const lowestCash = (road, near, scenario = {}) => (P) => asRun(road, near, P, scenario).min_cash;

/** A listing's walk-away price (optimistic), as an output for sensitivity(). */
export const walkAwayOf = (listing) => (P) => appraise(appraisalSettings(P), listing).walk_away_opt;
