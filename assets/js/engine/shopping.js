// shopping.js - the acquisitions list as trips rather than as a table.
// Pure: data in, values out. No DOM, no fetch, no clock except what is
// passed in.
//
// A shopping list is not a backlog with the jobs filtered out. The
// question it answers is different: not "what matters most" but "what am
// I actually buying on the next run, and what will it cost me". So the
// unit here is a TRIP - a set of items you would sensibly buy in one go -
// and the axes are the ones that decide that: the room being kitted out,
// the intent behind it, when it is needed, or the channel it comes from.
//
// Every figure on this page is an estimate until someone checks a real
// price. The engine therefore never returns a bare number: a total
// carries whether it can be trusted, so the page cannot accidentally
// present a drafted sum as a budget.

const TRUSTED = new Set(['confirmed', 'actual']);

/** The axes a shopping run is actually organised by. `field` is read off
 *  the item; `fallback` is the group an item with no value lands in -
 *  never dropped, because an uncategorised purchase is still money. */
export const TRIP_AXES = [
  { key: 'room', label: 'Room', field: 'room_name', fallback: 'No room set' },
  { key: 'theme', label: 'Intent', field: 'theme', fallback: 'Unclassified' },
  { key: 'horizon', label: 'When', field: 'horizon', fallback: 'someday',
    order: ['now', 'next', 'later', 'someday'] },
  // Which part of the project needs it, as opposed to when it can be
  // afforded. Those are different questions and the list is organised
  // by both.
  //
  // This slot used to be a 'channel' axis reading `item.channel`.
  // work_items HAS NO SUCH COLUMN - channel lives on price_references
  // and purchase_options - so every item fell into "Channel not set"
  // and the tab had never once grouped anything, in any dataset, since
  // the day it shipped. The fixture carried no channel key either, so
  // no test could see it.
  { key: 'phase', label: 'Phase', field: 'phase', fallback: 'Not placed yet',
    order: ['before_purchase', 'move_in', 'strip_out', 'first_year',
      'second_year', 'extension', 'fit_out', 'garden', 'ongoing'] },
  // How it is come by. Hire is the one that matters: a skip and a
  // digger are real money and are never owned.
  { key: 'acquisition', label: 'How', field: 'acquisition', fallback: 'new',
    order: ['new', 'reclaimed', 'either', 'hire', 'owned', 'gift'] },
];

export const axisFor = (key) => TRIP_AXES.find((a) => a.key === key) ?? TRIP_AXES[0];

/** Purchases that are still to be made. A bought or abandoned item
 *  leaves the list but never the database. */
export const purchases = (items) =>
  (items ?? []).filter((i) => i.kind === 'purchase' && !['done', 'dropped'].includes(i.status));

export const targetCost = (i) => i.cost_expected ?? i.cost_best ?? null;

/** What is still needed for this one item, and whether it can be bought
 *  today. Shortfall is clamped at zero: an over-funded item is not a
 *  negative requirement. */
export function funding(i) {
  const target = targetCost(i);
  const saved = Number(i.allocated_balance ?? 0);
  if (target == null) return { target: null, saved, shortfall: null, funded: false, pct: 0 };
  const shortfall = Math.max(0, target - saved);
  return {
    target,
    saved,
    shortfall,
    funded: shortfall === 0 && target > 0,
    pct: target > 0 ? Math.min(100, (saved / target) * 100) : 0,
  };
}

/**
 * Sum a set of items, and say whether the sum means anything.
 *
 * `trusted` is false as soon as ONE item in the set is unconfirmed,
 * because a total is only as good as its worst input. `costed` and
 * `uncosted` are reported separately so a total is never quietly
 * understated by items that carry no price at all.
 */
export function totals(items) {
  let expected = 0;
  let low = 0;
  let high = 0;
  let saved = 0;
  let costed = 0;
  let uncosted = 0;
  let trusted = true;
  for (const i of items) {
    const t = targetCost(i);
    saved += Number(i.allocated_balance ?? 0);
    if (t == null) { uncosted += 1; continue; }
    costed += 1;
    expected += t;
    low += i.cost_best ?? t;
    high += i.cost_worst ?? t;
    if (!TRUSTED.has(i.cost_confidence)) trusted = false;
  }
  return {
    count: items.length,
    costed,
    uncosted,
    expected,
    low,
    high,
    saved,
    shortfall: Math.max(0, expected - saved),
    trusted: trusted && costed > 0,
  };
}

/** Group into trips along one axis, each with its own subtotal. Groups
 *  are ordered by the axis's declared order where it has one, and
 *  otherwise by what the trip costs - the expensive run is the one worth
 *  planning. The fallback group always sorts last, because "not set" is
 *  never the headline. */
export function trips(items, axisKey) {
  const axis = axisFor(axisKey);
  const buckets = new Map();
  for (const i of items) {
    const key = (axis.field ? i[axis.field] : null) || axis.fallback;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }
  const out = [...buckets].map(([key, list]) => ({
    key,
    isFallback: key === axis.fallback,
    items: [...list].sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9)),
    totals: totals(list),
  }));
  const rank = (g) => {
    if (g.isFallback) return Number.MAX_SAFE_INTEGER;
    if (axis.order) {
      const idx = axis.order.indexOf(g.key);
      return idx === -1 ? axis.order.length : idx;
    }
    return -g.totals.expected;
  };
  return out.sort((a, b) => rank(a) - rank(b) || String(a.key).localeCompare(String(b.key)));
}

/** What could be bought right now: fully funded, dearest first, because
 *  clearing a big funded item frees the most future share. */
export const readyToBuy = (items) =>
  items.filter((i) => funding(i).funded)
    .sort((a, b) => (targetCost(b) ?? 0) - (targetCost(a) ?? 0));

/** The next run: the highest-priority items still to buy. Priority, not
 *  affordability - what to save toward, not what is already paid for. */
export const nextUp = (items, n = 8) =>
  [...items].sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9)).slice(0, n);

// --- Benchmark prices ------------------------------------------------

export const STALE_DAYS = 180;

/** Price references for one item, freshest first. A reference older than
 *  STALE_DAYS is marked rather than hidden: a stale benchmark is still
 *  evidence, but it must not read like a current quote. */
export function benchmarks(item, refs, now) {
  const at = now ?? Date.now();
  return (refs ?? [])
    .filter((r) => r.work_item_id === item.id)
    .map((r) => {
      const captured = r.captured_on ? Date.parse(r.captured_on) : NaN;
      const ageDays = Number.isNaN(captured) ? null : Math.floor((at - captured) / 864e5);
      return { ...r, ageDays, stale: ageDays == null || ageDays > STALE_DAYS };
    })
    .sort((a, b) => (a.ageDays ?? 1e9) - (b.ageDays ?? 1e9));
}

/** Does the estimate sit inside what the benchmarks say it should? An
 *  estimate outside every reference is the single most useful thing this
 *  page can point at, because it is a number that is probably wrong. */
export function estimateCheck(item, refs, now) {
  const marks = benchmarks(item, refs, now).filter((r) => !r.stale);
  const target = targetCost(item);
  if (!marks.length || target == null) return null;
  const low = Math.min(...marks.map((r) => r.price_low ?? r.price_typical ?? Infinity));
  const high = Math.max(...marks.map((r) => r.price_high ?? r.price_typical ?? -Infinity));
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (target < low) return { verdict: 'under', low, high };
  if (target > high) return { verdict: 'over', low, high };
  return { verdict: 'within', low, high };
}
