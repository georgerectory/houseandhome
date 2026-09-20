// demand.js - why a purchase is on the list, as a pure function.
//
// THE DATABASE IS THE AUTHORITY. `shopping_list` in 56_shopping.sql is
// what the site reads when it is signed in. This module exists for the
// same two reasons allocate.js does: the fixture generator has to
// produce view-shaped rows so the front-end gate can run offline, and
// the rule is worth having somewhere a unit test can reach it.
//
// Two implementations of one rule is the duplication this project
// avoids elsewhere, so it is held honest mechanically - `npm run
// test:parity` runs both against the same rows and fails on any
// disagreement.
//
// THE RULE. A renovation shopping list written in one sitting contains
// a mini digger on the day the keys are collected, and the total at the
// bottom is therefore wrong by thousands, in the direction that makes
// the whole plan look unaffordable. So a purchase is on the list
// because a LIVE JOB requires it - through `requires_material`, the
// link whose stated job is turning a job into a shopping list.

/**
 * Is somebody about to need this? One definition, mirroring
 * `work_item_is_live(status, horizon)` in SQL.
 *
 * A `someday` job is a real intention and keeps its links. It just does
 * not put a jackhammer on this month's list.
 */
export const isLive = (status, horizon) =>
  status === 'ready' || status === 'in_progress'
  || (status === 'planned' && (horizon === 'now' || horizon === 'next'));

const CLOSED = new Set(['done', 'dropped']);

/**
 * Index the open `requires_material` links by what they point AT.
 *
 * Only open links (`valid_to` null) count: a link is closed, never
 * deleted, and a closed one must not keep a purchase alive.
 */
export function demandsByItem(items, links) {
  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  const out = new Map();
  for (const l of links ?? []) {
    if (l.kind !== 'requires_material') continue;
    if (l.valid_to) continue;
    if (l.from_type !== 'work_item' || l.to_type !== 'work_item') continue;
    const job = byId.get(l.from_id);
    // A dropped job demands nothing. It is still a row, and its link is
    // still open, but it has stopped being a reason to buy anything.
    if (!job || job.status === 'dropped') continue;
    const d = out.get(l.to_id) ?? { count: 0, live: 0, by: [] };
    d.count += 1;
    if (isLive(job.status, job.horizon)) d.live += 1;
    d.by.push(job.title);
    out.set(l.to_id, d);
  }
  return out;
}

/**
 * live | dormant | standalone | closed.
 *
 * `standalone` is not a gap. A bed is its own reason; nothing has to
 * require it. The state exists so "nothing demands this" and "the only
 * thing that demanded it has not started" stay different answers.
 */
export function demandState(item, demand) {
  if (CLOSED.has(item.status)) return 'closed';
  if (!demand || demand.count === 0) return 'standalone';
  return demand.live > 0 ? 'live' : 'dormant';
}

/**
 * What this item costs the list THIS time round.
 *
 * A dormant item is not zero-cost - it is not yet a cost at all - so it
 * is excluded here and reported separately rather than quietly folded
 * in. An `owned` item costs nothing because it is already in the shed;
 * the row exists so the plan can see the need is covered.
 */
export function costInScope(item, state) {
  if (state === 'closed' || state === 'dormant') return 0;
  if (item.acquisition === 'owned') return 0;
  return Number(item.cost_expected ?? 0);
}

/** Every purchase, with the demand behind it. Mirrors `shopping_list`. */
export function shoppingList(items, links) {
  const demands = demandsByItem(items, links);
  return (items ?? [])
    .filter((i) => i.kind === 'purchase')
    .map((i) => {
      const d = demands.get(i.id);
      const demand_state = demandState(i, d);
      return {
        ...i,
        is_hire: i.acquisition === 'hire',
        is_covered: i.acquisition === 'owned',
        demand_count: d?.count ?? 0,
        live_demand_count: d?.live ?? 0,
        demanded_by: d?.by ?? null,
        demand_state,
        cost_in_scope: costInScope(i, demand_state),
      };
    });
}

const TRUSTED_COST = new Set(['confirmed', 'actual']);
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * The number at the bottom, by phase. Mirrors `shopping_totals`.
 *
 * Split three ways because they are three different kinds of money:
 * what will be owned, what is only rented, and what is parked until a
 * job wakes it up. A single total hides the third and flatters the
 * second.
 */
export function shoppingTotals(rows) {
  const out = new Map();
  for (const s of rows ?? []) {
    const phase = s.phase ?? 'unplaced';
    const t = out.get(phase) ?? {
      phase,
      items_in_scope: 0, items_dormant: 0, items_closed: 0,
      buy_cost: 0, hire_cost: 0, total_in_scope: 0,
      dormant_cost: 0, unconfirmed_cost: 0,
    };
    if (s.demand_state === 'live' || s.demand_state === 'standalone') t.items_in_scope += 1;
    if (s.demand_state === 'dormant') t.items_dormant += 1;
    if (s.demand_state === 'closed') t.items_closed += 1;

    const c = Number(s.cost_in_scope ?? 0);
    if (s.is_hire) t.hire_cost += c; else t.buy_cost += c;
    t.total_in_scope += c;
    if (s.demand_state === 'dormant') t.dormant_cost += Number(s.cost_expected ?? 0);
    if (!TRUSTED_COST.has(s.cost_confidence)) t.unconfirmed_cost += c;
    out.set(phase, t);
  }
  return [...out.values()]
    .map((t) => ({
      ...t,
      buy_cost: r2(t.buy_cost),
      hire_cost: r2(t.hire_cost),
      total_in_scope: r2(t.total_in_scope),
      dormant_cost: r2(t.dormant_cost),
      unconfirmed_cost: r2(t.unconfirmed_cost),
    }))
    .sort((a, b) => b.total_in_scope - a.total_in_scope);
}
