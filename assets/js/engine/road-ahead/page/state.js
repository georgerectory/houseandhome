// state.js - what the Road Ahead page is showing, held in the URL.
//
// Every control is a what-if. It changes what the page computes and
// saves nothing (RA-02): anything worth keeping becomes a message to
// Claude, who records it as a scenario with its reason. Because the
// state is the URL, any view can be bookmarked or sent, and reloading
// the page never loses the question being asked.
//
//   s=<scenario>          the scenario pill; the default scenario when absent
//   <control>=<value>     one per control moved away from the scenario's value
//   l=<code>              the open property card
//   f=<filter>            the register filter
//   sort=<column>, dir=desc
//
// Pure: no DOM. The page reads location.search into readState() and
// writes writeState() back with history.replaceState.

import { STAGE_DEFAULTS } from '../simulate.js';
import { monthIndex, ym } from '../money.js';
import { money } from '../../../core/format.js';

/**
 * The controls, in the order the page lays them out.
 *   target 'var:<key>'      overrides that variable, after the scenario's own overrides
 *   target 'works'          the optimistic works share (see resolve.js)
 *   target 'keys'           the month of the first purchase on every road
 *   target 'dep:buy'        the House 1 deposit on every road
 *   target 'dep:forever'    the forever-home deposit on every road
 * kind: money | count | minutes | share | month. min and max bound the
 * slider; a variable's own low and high widen them.
 */
export const CONTROLS = Object.freeze([
  { id: 'bridge', target: 'var:timeline.bridge_from', kind: 'month', group: 'home', label: 'Renting starts' },
  { id: 'keys', target: 'keys', kind: 'month', group: 'home', label: 'Keys to the first purchase' },
  { id: 'child_cost', target: 'var:costs.family_cost', kind: 'money', group: 'home', label: 'Child costs a month', min: 0, max: 1500, step: 50 },
  { id: 'child_from', target: 'var:costs.family_from', kind: 'month', group: 'home', label: 'Child costs start' },
  { id: 'children', target: 'var:costs.children', kind: 'count', group: 'home', label: 'Children a lender counts', min: 0, max: 4, step: 1 },
  { id: 'rise', target: 'var:income.pay_rise_2027', kind: 'money', group: 'money', label: 'Pay rise in 2027', min: -10000, max: 20000, step: 500 },
  { id: 'annual', target: 'var:income.annual_rise_from_2028', kind: 'money', group: 'money', label: 'Rise each April from 2028', min: 0, max: 10000, step: 250 },
  { id: 'dep1', target: 'dep:buy', kind: 'share', group: 'money', label: 'House 1 deposit', min: 0.05, max: 0.3, step: 0.01 },
  { id: 'dep2', target: 'dep:forever', kind: 'share', group: 'money', label: 'Forever-home deposit', min: 0.05, max: 0.3, step: 0.01 },
  { id: 'works', target: 'works', kind: 'share', group: 'works', label: 'Optimistic works, share of the estimate', min: 0.5, max: 1.2, step: 0.05 },
  { id: 'near', target: 'var:help.near.cost', kind: 'share', group: 'works', label: 'Works near home, with local help', min: 0.5, max: 1.3, step: 0.05 },
  { id: 'far', target: 'var:help.far.cost', kind: 'share', group: 'works', label: 'Works further away', min: 0.7, max: 1.6, step: 0.05 },
  { id: 'target', target: 'var:appraisal.target_profit', kind: 'money', group: 'listings', label: 'Profit a House 1 must make', min: 0, max: 120000, step: 2500 },
  { id: 'ceiling', target: 'var:ceiling.hard', kind: 'money', group: 'listings', label: 'The most ever bid', min: 150000, max: 700000, step: 5000 },
  { id: 'beds', target: 'var:rules.house1_min_beds', kind: 'count', group: 'listings', label: 'Fewest bedrooms for House 1', min: 1, max: 6, step: 1 },
  { id: 'minutes', target: 'var:rules.house1_max_minutes', kind: 'minutes', group: 'listings', label: 'Furthest House 1, minutes from home', min: 10, max: 180, step: 5 },
]);

export const GROUPS = Object.freeze([
  { key: 'home', label: 'Family, renting and keys' },
  { key: 'money', label: 'Pay and deposits' },
  { key: 'works', label: 'Works' },
  { key: 'listings', label: 'Listings' },
]);

const LIVE = ['chase', 'viewing', 'legal', 'survey', 'bid', 'offer'];
/** The register's filters. The first is the default. */
export const FILTERS = Object.freeze([
  { key: 'live', label: 'Live', test: (r) => r.purpose !== 'benchmark' && [...LIVE, 'watch'].includes(r.status) },
  { key: 'chasing', label: 'Chasing', test: (r) => LIVE.includes(r.status) },
  { key: 'auctions', label: 'Auctions', test: (r) => r.auction_on != null && [...LIVE, 'watch'].includes(r.status) },
  { key: 'unreviewed', label: 'To review', test: (r) => r.status === 'unreviewed' },
  { key: 'history', label: 'Dropped and closed', test: (r) => ['dropped', 'closed', 'lost', 'won'].includes(r.status) },
  { key: 'benchmarks', label: 'Benchmarks', test: (r) => r.purpose === 'benchmark' },
  { key: 'all', label: 'All', test: () => true },
]);

/** The register's sortable columns. */
export const SORTS = Object.freeze(['code', 'name', 'auction', 'buy', 'profit', 'profit_opt', 'bid', 'verdict', 'status']);

const byId = new Map(CONTROLS.map((c) => [c.id, c]));

/** A month from 'YYYY-MM', or null. */
export function monthOf(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? [y, mo] : null;
}

/** A control's value from its URL text, or null when it will not parse. */
export function parseValue(control, text) {
  if (control.kind === 'month') return monthOf(text);
  if (text == null || String(text).trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  if (control.kind === 'count' || control.kind === 'minutes') return Number.isInteger(n) && n >= 0 ? n : null;
  if (control.kind === 'share') return n > 0 && n <= 2 ? n : null;
  return n;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

/** A month as a person reads it: 'May 2027'. */
export const monthName = (v) => (Array.isArray(v) ? `${MONTH_NAMES[v[1] - 1]} ${v[0]}` : '—');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/**
 * A date as a person reads it: 'Wed 21 Oct 2026', or 'Wed 21 Oct' when
 * the year is the one given as this year. The calendar date as written,
 * whatever the browser's time zone.
 * @param {string|null} iso 'YYYY-MM-DD'
 * @param {number} [thisYear]
 */
export function dayName(iso, thisYear) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '—';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = DAY_NAMES[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${day} ${d} ${MONTH_NAMES[mo - 1].slice(0, 3)}${y === thisYear ? '' : ` ${y}`}`;
}

/** A control's value as a person reads it. */
export function showValue(control, v) {
  if (v == null) return '—';
  if (control.kind === 'month') return monthName(v);
  if (control.kind === 'money') return money(v);
  if (control.kind === 'share') return `${Math.round(v * 1000) / 10}%`;
  if (control.kind === 'minutes') return `${v} minutes`;
  return String(v);
}

/** A control's value as URL text. */
export const formatValue = (control, v) => (control.kind === 'month' ? ym(v) : String(v));

const sameValue = (control, a, b) => (control.kind === 'month'
  ? Array.isArray(a) && Array.isArray(b) && monthIndex(a) === monthIndex(b)
  : Number(a) === Number(b));

/**
 * The page's state from a query string.
 * @param {string} search location.search
 * @param {{scenarios: string[], listings: string[], fallback: string}} known what may be named
 * @returns {{scenario:string, values:Object<string,*>, listing:string|null, filter:string, sort:string|null, dir:'asc'|'desc'}}
 */
export function readState(search, known) {
  const q = new URLSearchParams(search);
  const scenario = known.scenarios.includes(q.get('s')) ? q.get('s') : known.fallback;
  const values = {};
  for (const c of CONTROLS) {
    if (!q.has(c.id)) continue;
    const v = parseValue(c, q.get(c.id));
    if (v != null) values[c.id] = v;
  }
  const listing = known.listings.includes(q.get('l')) ? q.get('l') : null;
  const filter = FILTERS.some((f) => f.key === q.get('f')) ? q.get('f') : FILTERS[0].key;
  const sort = SORTS.includes(q.get('sort')) ? q.get('sort') : null;
  const dir = q.get('dir') === 'desc' ? 'desc' : 'asc';
  return { scenario, values, listing, filter, sort, dir };
}

/**
 * The query string for a state, leaving out anything at its default so a
 * link says only what is different.
 * @param {object} state from readState
 * @param {{fallback:string, current?:Object<string,*>}} defaults the default
 *   scenario, and each control's value before any what-if
 */
export function writeState(state, defaults) {
  const q = new URLSearchParams();
  if (state.scenario !== defaults.fallback) q.set('s', state.scenario);
  for (const c of CONTROLS) {
    const v = state.values[c.id];
    if (v == null) continue;
    const before = defaults.current?.[c.id];
    if (before != null && sameValue(c, v, before)) continue;
    q.set(c.id, formatValue(c, v));
  }
  if (state.listing) q.set('l', state.listing);
  if (state.filter && state.filter !== FILTERS[0].key) q.set('f', state.filter);
  if (state.sort) q.set('sort', state.sort);
  if (state.sort && state.dir === 'desc') q.set('dir', 'desc');
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const control = (id) => byId.get(id);

/** The deposit a stage of this kind carries, the kit's default when it names none. */
export const stageDeposit = (stage) => stage.dep ?? STAGE_DEFAULTS.dep;
