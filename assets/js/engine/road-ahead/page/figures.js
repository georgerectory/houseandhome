// figures.js - every Road Ahead variable read in its own unit, and the
// variables in their groups. The unit is the registry's for every key the
// engine reads; the few keys the page reads beyond the engine are named
// here. The row's own unit text, carried over from the kit, comes last,
// because it is free text and often empty. Pure: no DOM, no fetch.

import { money, titleCase, isTrusted } from '../../../core/format.js';
import { REGISTRY } from '../registry.js';
import { monthName } from './state.js';

/** The kit's evidence labels, in words. */
export const EVIDENCE_WORDS = Object.freeze({ STATED: 'stated', VERIFIED: 'verified', ESTIMATE: 'estimate', CHECK: 'to check' });

/** Units for the keys the page reads beyond the engine. */
export const PAGE_UNITS = Object.freeze({
  'ceiling.practical': '£',
  'targets.endgame_today_target': '£',
  'rules.house1_min_beds': 'count',
  'rules.house1_max_minutes': 'minutes',
  'rules.forever_max_minutes': 'minutes',
  'rules.rent_max_months': 'months',
  'counterfactual.equity_vol': 'rate',
});

const UNIT = new Map([...REGISTRY.map((r) => [r.key, r.unit]), ...Object.entries(PAGE_UNITS)]);

/** The unit a key is read in. */
export const unitOf = (key, rowUnit) => UNIT.get(key) || rowUnit || '';

const NUM = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 });
const share = (x) => `${NUM.format(Math.round(x * 100000) / 1000)}%`;
const pounds = (n) => (Number.isInteger(n) ? money(n) : money(n, { pence: true }));
const plural = (n, word) => `${NUM.format(n)} ${word}${n === 1 ? '' : 's'}`;

/** A year -> rate path, with the years that share a rate run together. */
function pathText(map) {
  const years = Object.keys(map).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const runs = [];
  for (const y of years) {
    const v = Number(map[y]);
    const last = runs[runs.length - 1];
    if (last && last.v === v && last.to === y - 1) last.to = y;
    else runs.push({ from: y, to: y, v });
  }
  return runs.map((r) => `${r.from === r.to ? r.from : `${r.from} to ${r.to}`}: ${share(r.v)}`).join('; ');
}

/**
 * One figure as a person reads it.
 * @param {*} value a number, a [year, month] pair or a year -> rate map
 * @param {string} unit from unitOf()
 */
export function showFigure(value, unit = '') {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.length === 2 ? monthName(value) : value.join(', ');
  if (typeof value === 'object') return pathText(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  switch (unit) {
    case '£': return pounds(n);
    case '£/mo': return `${pounds(n)} a month`;
    case '£/yr': return `${pounds(n)} a year`;
    case '/yr': return `${share(n)} a year`;
    case 'rate':
    case 'ratio': return share(n);
    case 'factor': return `×${NUM.format(n)}`;
    case '£ per £': return `${money(n, { pence: true })} per £1`;
    case 'x salary': return `${NUM.format(n)}× salary`;
    case 'months': return plural(n, 'month');
    case 'years': return plural(n, 'year');
    case 'minutes': return plural(n, 'minute');
    case '0 or 1': return n ? 'Yes' : 'No';
    case 'count': return NUM.format(n);
    default: return unit.startsWith('£') ? `${pounds(n)} ${unit.slice(1).trim()}`.trim() : NUM.format(n);
  }
}

/** A variable's range, low to high, in its unit, saying the unit once; null when it has none. */
export function showRange(v, unit) {
  if (v.low == null && v.high == null) return null;
  const [lo, hi] = [showFigure(v.low, unit), showFigure(v.high, unit)];
  const split = (t) => { const i = t.indexOf(' '); return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 1)]; };
  const [[a, tailA], [b, tailB]] = [split(lo), split(hi)];
  return tailA && tailA === tailB ? `${a} to ${b} ${tailA}` : `${lo} to ${hi}`;
}

// The groups, by the first part of each key, in the order a person
// thinks about them: their time, pay and cash; then borrowing; then each
// house; then how a listing is judged.
const GROUP_NAMES = [
  ['timeline', 'Time'], ['income', 'Pay'], ['cash', 'Cash'], ['costs', 'Living costs'],
  ['mortgage', 'Mortgage and lender'], ['fa', 'Further advance'], ['transaction', 'Buying and selling'],
  ['fees', 'Fees'], ['help', 'Help with the works'], ['house1', 'House 1'], ['keeper', 'A house kept'],
  ['endgame', 'The forever home'], ['roads', 'The roads'], ['market', 'House prices'],
  ['counterfactual', 'Renting and investing instead'], ['appraisal', 'Appraising a listing'],
  ['ceiling', 'Price ceilings'], ['verdict', 'Verdicts'], ['rules', 'Rules'], ['targets', 'Targets'],
];
const ORDER = new Map(GROUP_NAMES.map(([k], i) => [k, i]));
const NAME = new Map(GROUP_NAMES);
const groupOf = (key) => key.split('.')[0];

/**
 * The variables in their groups, each read in its unit, with its latest
 * logged change.
 * @param {object[]} variables ra_variables rows
 * @param {object[]} [changes] ra_changes rows, newest first
 */
export function variableGroups(variables, changes = []) {
  const latest = new Map();
  for (const c of changes) {
    if (c.entity_type === 'ra_variables' && !latest.has(c.code)) latest.set(c.code, c);
  }
  const groups = new Map();
  for (const v of variables) {
    const g = groupOf(v.key);
    if (!groups.has(g)) groups.set(g, []);
    const unit = unitOf(v.key, v.unit);
    groups.get(g).push({ ...v, shown: showFigure(v.value, unit), range: showRange(v, unit), changed: latest.get(v.key) ?? null });
  }
  return [...groups].sort((a, b) => (ORDER.get(a[0]) ?? 99) - (ORDER.get(b[0]) ?? 99) || a[0].localeCompare(b[0]))
    .map(([key, rows]) => ({
      key, name: NAME.get(key) ?? titleCase(key),
      rows: rows.sort((a, b) => a.key.localeCompare(b.key)),
      unconfirmed: rows.filter((r) => !isTrusted(r.confidence)).length,
    }));
}
