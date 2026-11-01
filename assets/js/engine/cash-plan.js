// The cash plan for the house in view: which groups of work, in what
// order, against what money. It turns rows (cost_rollup and ra_variables)
// into the inputs cash-over-time.js walks, so the page never types a
// figure and never re-derives a total.
//
// THE GROUPS DO NOT OVERLAP. cost_rollup's idea totals share items (the
// rear range carries the boot room, the WC and the store at once) and
// its day-one cases are alternatives, so adding ideas or cases double
// counts. The plan instead takes one day-one case, the condition work,
// the whole-house services (first fix electrics and heating, phases P12
// and P13) and then each design stage, which partition the work.
//
// Pure: no DOM, no fetch.
import { cashOverTime, addMonths } from './cash-over-time.js';

const num = (v) => (v == null || v === '' ? null : Number(v));

/** One variable's value by key, or null when it is not recorded. */
export function variable(vars, key) {
  const row = (vars ?? []).find((v) => v.key === key && (v.status ?? 'active') === 'active');
  return row ? row.value : null;
}

/** The roadmap groups, in funding order, from cost_rollup rows. */
export function planGroups(rollup, { dayOneCase = 'low' } = {}) {
  const pick = (dim, key) => (rollup ?? []).find((r) => r.dim === dim && r.key === key);
  const groups = [];
  const add = (id, label, rows) => {
    const present = rows.filter(Boolean);
    if (!present.length) return;
    const base = present.reduce((s, r) => s + (num(r.cost_base) ?? 0), 0);
    const unconfirmed = present.reduce((s, r) => s + (num(r.cost_base_unconfirmed) ?? 0), 0);
    if (base > 0) groups.push({ id, label, cost: base, unconfirmed: unconfirmed > 0, unconfirmedCost: unconfirmed });
  };
  add('day-one', `Day one (${dayOneCase} case)`, [pick('case', dayOneCase)]);
  add('condition', 'Dry rot and condition work', [pick('condition', 'dry-rot')]);
  add('services', 'Rewire and heating (first fix)', [pick('phase', 'P12'), pick('phase', 'P13')]);
  add('s1', 'S1: kitchen-diner, boot room, WC, utility', [pick('stage', 'ground-floor-open')]);
  add('s2a', 'S2a: en-suite within the footprint', [pick('stage', 'ensuite-within')]);
  return groups;
}

/** The monthly spare: take-home less the planned budget, then the pay rise. */
export function spareSteps(vars) {
  const net = num(variable(vars, 'income.net_pay_now'));
  const plan = variable(vars, 'costs.planned_post_move');
  const total = num(plan?.total);
  if (net == null || total == null) return null;
  const now = net - total;
  const rise = num(variable(vars, 'income.net_per_3k_gross'));
  const riseMonth = variable(vars, 'income.pay_rise_month');
  const steps = [{ from: '2000-01', amount: now }];
  if (rise != null && Array.isArray(riseMonth)) {
    steps.push({ from: `${riseMonth[0]}-${String(riseMonth[1]).padStart(2, '0')}`, amount: now + rise });
  }
  return steps;
}

/**
 * Both scenarios the owner needs side by side: the planned budget alone,
 * and with an annual net bonus each April (never guaranteed).
 */
export function cashPlan(vars, rollup, { start = '2027-04', horizon = 240 } = {}) {
  const spare = spareSteps(vars);
  const startCash = num(variable(vars, 'cash.works_buffer'));
  const bonus = num(variable(vars, 'income.bonus_net'));
  const items = planGroups(rollup);
  if (!spare || startCash == null || !items.length) {
    return { ready: false, missing: [
      !spare && 'income.net_pay_now and costs.planned_post_move',
      startCash == null && 'cash.works_buffer',
      !items.length && 'costed work (cost_rollup)',
    ].filter(Boolean) };
  }
  const base = { start, startCash, spare, items, horizon };
  const plain = cashOverTime(base);
  const year = Number(start.slice(0, 4));
  const bonuses = bonus ? Array.from({ length: horizon / 12 }, (_, k) => ({
    month: `${year + 1 + k}-04`, amount: bonus })) : [];
  const withBonus = bonus ? cashOverTime({ ...base, bonuses }) : null;
  return {
    ready: true, start, startCash, spare, bonus, items,
    plain, withBonus, horizonEnd: addMonths(start, horizon - 1),
  };
}
