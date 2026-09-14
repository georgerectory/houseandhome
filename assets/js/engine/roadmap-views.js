// roadmap-views.js - grouping, filtering, scheduling and export for the
// roadmap. Pure: no DOM, no fetch, no clock reads except what is passed
// in. The page is a thin renderer over this.
//
// The roadmap has to be readable three ways, because the same rows
// answer three different questions:
//
//   Board     what is happening now, next, later, someday
//   Timeline  WHEN can each thing actually happen
//   List      everything at once, dense, sortable
//
// and groupable by the axes that matter in a house - the room it is in,
// the trade it needs, the renovation intent, what it buys - rather than
// by anything resembling a department.

import { allocate } from './allocate.js';

export const VIEWS = [
  { key: 'board', label: 'Board' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'list', label: 'List' },
];

/** The axes a house roadmap is usefully sliced by. `field` is read off
 *  the item; `fallback` is the group an item with no value lands in. */
export const GROUPINGS = [
  { key: 'horizon', label: 'When', field: 'horizon', fallback: 'someday',
    order: ['now', 'next', 'later', 'someday'] },
  { key: 'room', label: 'Room', field: 'room_name', fallback: 'No room set' },
  { key: 'trade', label: 'Trade', field: 'trade', fallback: 'No trade' },
  { key: 'theme', label: 'Intent', field: 'theme', fallback: 'Unclassified' },
  { key: 'benefit_type', label: 'Benefit', field: 'benefit_type', fallback: 'No benefit set' },
  { key: 'kind', label: 'Kind', field: 'kind', fallback: 'Unclassified' },
  { key: 'status', label: 'Status', field: 'status', fallback: 'idea' },
  { key: 'none', label: 'Ungrouped', field: null, fallback: 'Everything' },
];

export const HORIZONS = ['now', 'next', 'later', 'someday'];

export const groupingFor = (key) =>
  GROUPINGS.find((g) => g.key === key) ?? GROUPINGS[0];

const isOpen = (i) => !['done', 'dropped'].includes(i.status);

/**
 * Narrow a list. Every filter is optional; an absent one does not apply.
 * @param {Array<object>} items
 * @param {{room?:string, trade?:string, theme?:string, kind?:string,
 *          benefit?:string, horizon?:string, search?:string,
 *          hideDone?:boolean}} f
 */
export function applyFilters(items, f = {}) {
  const q = (f.search ?? '').trim().toLowerCase();
  return items.filter((i) => {
    if (f.hideDone !== false && !isOpen(i)) return false;
    if (f.room && i.room_name !== f.room) return false;
    // A trade filter matches the OWNER trade or an associated one, so a
    // view of "electrical" shows everything electrical touches rather
    // than only what it formally owns.
    if (f.trade && i.trade !== f.trade
        && !(i.associated_trades ?? []).includes(f.trade)) return false;
    if (f.theme && i.theme !== f.theme) return false;
    if (f.kind && i.kind !== f.kind) return false;
    if (f.benefit && i.benefit_type !== f.benefit) return false;
    if (f.horizon && i.horizon !== f.horizon) return false;
    if (q) {
      const hay = `${i.title ?? ''} ${i.summary ?? ''} ${i.room_name ?? ''} ${i.trade ?? ''} ${(i.tools_required ?? []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct values present on a field, for building filter options that
 *  only ever offer choices that would return something. */
export function optionsFor(items, field) {
  return [...new Set(items.map((i) => i[field]).filter(Boolean))].sort();
}

/**
 * Group into ordered buckets. A grouping with a declared order uses it;
 * anything else sorts by the group's best (lowest) priority, so the
 * rooms and trades with the most urgent work come first rather than
 * alphabetically.
 */
export function groupItems(items, groupKey) {
  const g = groupingFor(groupKey);
  const buckets = new Map();

  for (const i of items) {
    const raw = g.field ? i[g.field] : null;
    const key = (raw ?? '') === '' ? g.fallback : String(raw);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }

  let groups = [...buckets.entries()].map(([label, rows]) => ({
    key: label,
    label,
    items: rows.sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9)),
    count: rows.length,
    bestPriority: Math.min(...rows.map((r) => r.priority ?? 1e9)),
    totalCost: rows.reduce((s, r) => s + Number(r.cost_expected ?? 0), 0),
  }));

  if (g.order) {
    groups = groups.sort((a, b) => {
      const ai = g.order.indexOf(a.key), bi = g.order.indexOf(b.key);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    // A declared order shows every band, including the empty ones: an
    // absent "Now" column is information, and hiding it loses that.
    for (const key of g.order) {
      if (!groups.some((x) => x.key === key)) {
        groups.push({ key, label: key, items: [], count: 0, bestPriority: 1e9, totalCost: 0 });
      }
    }
    groups.sort((a, b) => {
      const ai = g.order.indexOf(a.key), bi = g.order.indexOf(b.key);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  } else {
    groups.sort((a, b) => a.bestPriority - b.bestPriority || a.label.localeCompare(b.label));
  }

  return groups;
}

/** Rough working-month span for a job, from its estimated minutes.
 *  Most jobs are a day or less, so most bars are one month wide; the
 *  point of the span is to show the few that genuinely are not. */
export function spanMonths(item) {
  const mins = item.duration_max_minutes ?? item.duration_min_minutes;
  if (!mins) return 1;
  const days = mins / (60 * 8);
  return Math.max(1, Math.ceil(days / 20));
}

/**
 * The timeline. Its x-axis is MONEY, not wishful dates: a bar starts in
 * the month the item becomes affordable under the current allocation
 * curve, which is the only honest answer to "when can this happen".
 *
 * Everything it produces is downstream of cost estimates, so if those
 * are unconfirmed the whole chart is a projection - the caller is
 * expected to say so.
 *
 * @param {Array<object>} items   already filtered
 * @param {{monthly:number, decay?:number, floorShare?:number, horizonMonths?:number}} opts
 */
export function buildTimeline(items, opts = {}) {
  const monthly = Number(opts.monthly ?? 0);
  const horizonMonths = opts.horizonMonths ?? 36;
  const curve = { decay: opts.decay, floorShare: opts.floorShare };

  const costed = items.filter((i) => Number(i.cost_expected ?? i.cost_best ?? 0) > 0);
  const free = items.filter((i) => !(Number(i.cost_expected ?? i.cost_best ?? 0) > 0));

  const fundedMonth = new Map();
  if (monthly > 0 && costed.length) {
    let state = costed.map((i) => ({
      id: i.id,
      targetCost: Number(i.cost_expected ?? i.cost_best),
      allocatedBalance: Number(i.allocated_balance ?? 0),
    }));
    for (let m = 1; m <= horizonMonths; m++) {
      const open = state.filter((s) => s.allocatedBalance < s.targetCost);
      if (!open.length) break;
      for (const row of allocate(open, monthly, curve)) {
        const s = state.find((x) => x.id === row.id);
        s.allocatedBalance = row.balanceAfter;
        if (row.fundedAfter && !fundedMonth.has(row.id)) fundedMonth.set(row.id, m);
      }
    }
  }

  const bars = [];
  // Work needing no money can start immediately; that is a real and
  // useful distinction on a chart otherwise driven by affordability.
  for (const i of free) {
    bars.push({ item: i, start: 0, span: spanMonths(i), fundedMonth: 0, beyond: false, noCost: true });
  }
  for (const i of costed) {
    const m = fundedMonth.get(i.id);
    if (m == null) {
      bars.push({ item: i, start: horizonMonths, span: 1, fundedMonth: null, beyond: true, noCost: false });
    } else {
      bars.push({ item: i, start: m, span: spanMonths(i), fundedMonth: m, beyond: false, noCost: false });
    }
  }

  bars.sort((a, b) => a.start - b.start
    || (a.item.priority ?? 1e9) - (b.item.priority ?? 1e9));

  const lastMonth = bars.reduce((mx, b) => Math.max(mx, b.beyond ? 0 : b.start + b.span), 1);
  return {
    bars,
    months: Math.min(horizonMonths, Math.max(6, lastMonth)),
    horizonMonths,
    anyBeyond: bars.some((b) => b.beyond),
    fundable: monthly > 0,
  };
}

const CSV_COLUMNS = [
  ['priority', 'Priority'], ['title', 'Title'], ['kind', 'Kind'],
  ['room_name', 'Room'], ['trade', 'Trade'], ['theme', 'Intent'],
  ['benefit_type', 'Benefit'], ['horizon', 'When'], ['status', 'Status'],
  ['cost_best', 'Cost low'], ['cost_expected', 'Cost expected'],
  ['cost_worst', 'Cost high'], ['cost_confidence', 'Cost confidence'],
  ['allocated_balance', 'Saved so far'],
  ['duration_min_minutes', 'Minutes low'], ['duration_max_minutes', 'Minutes high'],
  ['physical_demand', 'Physical demand'], ['setting', 'Setting'],
];

const csvCell = (v) => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Export what is on screen, not the whole table: an export that
 *  ignores the current filters is a different document to the one the
 *  person is looking at. */
export function toCSV(items) {
  const head = CSV_COLUMNS.map(([, label]) => csvCell(label)).join(',');
  const rows = items.map((i) => CSV_COLUMNS.map(([f]) => csvCell(i[f])).join(','));
  return [head, ...rows].join('\n');
}

export function toJSON(items) {
  return JSON.stringify(
    items.map((i) => Object.fromEntries(CSV_COLUMNS.map(([f]) => [f, i[f] ?? null]))),
    null, 2);
}
