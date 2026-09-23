// readiness.js - what is actually doable, as opposed to what is next.
//
// The SQL view work_item_readiness (64_readiness.sql) is the authority;
// this mirrors it so the site can answer the same question in demo mode,
// and so the rule can be unit-tested without a database.
//
// The roadmap ranks work by importance. That is a DIFFERENT QUESTION
// from "what can I do this afternoon", and answering the second with the
// first is how a list sends somebody to plaster a wall whose wiring is
// not in. Readiness is derived from the edges that already exist -
// must_precede and requires_material, the same two that drive the
// shopping list - so nothing here is stored and nothing is typed.

const CLOSED = new Set(['done', 'dropped']);
const live = (l, kind) => l.kind === kind && !l.valid_to
  && l.from_type === 'work_item' && l.to_type === 'work_item';

/** Open work that must happen before each item, by item id. */
export function blockersOf(items, links) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map();
  for (const l of links) {
    if (!live(l, 'must_precede')) continue;
    const before = byId.get(l.from_id);
    // Closed work is not a blocker: a job already done holds nothing up.
    if (!before || CLOSED.has(before.status)) continue;
    if (!out.has(l.to_id)) out.set(l.to_id, []);
    out.get(l.to_id).push(before.title);
  }
  return out;
}

/** Materials a job needs that are not in the house yet, by item id. */
export function missingMaterialsOf(items, links) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map();
  for (const l of links) {
    if (!live(l, 'requires_material')) continue;
    const m = byId.get(l.to_id);
    if (!m || CLOSED.has(m.status)) continue;
    // `owned` counts as in hand - the whole reason acquisition exists is
    // that a thing you already have is not a thing you have to buy.
    if ((m.acquisition ?? 'new') === 'owned') continue;
    if (!out.has(l.from_id)) out.set(l.from_id, []);
    out.get(l.from_id).push(m.title);
  }
  return out;
}

/**
 * One label, in the order the obstacles actually bite.
 *
 * A job that is both blocked and unfunded is BLOCKED: buying the
 * materials would not let you start it, so saying "waiting on money"
 * would send somebody to spend money that changes nothing.
 */
export function readinessOf(item, blockers = [], missing = []) {
  if (CLOSED.has(item.status)) return 'closed';
  if (item.status === 'idea') return 'not_decided';
  if (blockers.length) return 'waiting_on_work';
  if (missing.length) return 'waiting_on_materials';
  if (item.status === 'blocked') return 'blocked';
  const cost = Number(item.cost_expected ?? 0);
  const funded = Number(item.allocated_balance ?? 0);
  if (cost > 0 && funded < cost) return 'waiting_on_money';
  return 'ready';
}

/** Every item with its readiness and what is holding it up. */
export function readinessReport(items, links) {
  const blockers = blockersOf(items, links);
  const missing = missingMaterialsOf(items, links);
  return items.map((i) => {
    const b = blockers.get(i.id) ?? [];
    const m = missing.get(i.id) ?? [];
    return {
      ...i,
      blocked_by: b.length,
      waiting_on: b.length ? b.join('; ') : null,
      materials_missing: m.length,
      missing_materials: m.length ? m.join('; ') : null,
      is_funded: Number(i.allocated_balance ?? 0) >= Number(i.cost_expected ?? 0),
      readiness: readinessOf(i, b, m),
    };
  });
}

/**
 * The jobs that fit the time, the money and the place right now.
 *
 * AN UNKNOWN DURATION IS NOT A DURATION OF ZERO. Treating null as nought
 * quietly answers "yes, it fits" for every item nobody has estimated,
 * and most are unestimated - the same mistake as letting a drafted
 * figure drive an allocation. Hiding them is no better: the list then
 * shrinks to the handful somebody happened to time. So they come back
 * flagged, and sorted after everything that genuinely fits.
 */
export function whatCanIDoToday(rows, opts = {}) {
  const { minutes = 120, budget = null, setting = null } = opts;
  return rows
    .filter((r) => r.readiness === 'ready')
    .filter((r) => r.duration_min_minutes == null || r.duration_min_minutes <= minutes)
    .filter((r) => (r.min_session_minutes ?? 0) <= minutes)
    .filter((r) => budget == null || r.is_funded || Number(r.cost_expected ?? 0) <= budget)
    .filter((r) => setting == null || r.setting == null || r.setting === setting)
    .map((r) => ({ ...r, duration_known: r.duration_min_minutes != null }))
    .sort((a, b) =>
      Number(!a.duration_known) - Number(!b.duration_known)
      || (a.priority ?? 1e9) - (b.priority ?? 1e9)
      || (a.duration_min_minutes ?? 1e9) - (b.duration_min_minutes ?? 1e9));
}

/** How the backlog splits, for a page that wants to say why. */
export function readinessSummary(rows) {
  const out = {};
  for (const r of rows) out[r.readiness] = (out[r.readiness] ?? 0) + 1;
  return out;
}
