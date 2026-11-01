// The cash plan reads rows, never types figures, and never double counts:
// its groups partition the work (one day-one case, condition, services,
// then each stage) where cost_rollup's ideas and cases overlap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planGroups, spareSteps, cashPlan, variable } from '../../assets/js/engine/cash-plan.js';

const rollup = [
  { dim: 'case', key: 'low', cost_base: 4000, cost_base_unconfirmed: 4000 },
  { dim: 'case', key: 'mid', cost_base: 7000, cost_base_unconfirmed: 7000 },
  { dim: 'idea', key: 'boot-room', cost_base: 30000, cost_base_unconfirmed: 30000 },
  { dim: 'condition', key: 'dry-rot', cost_base: 3000, cost_base_unconfirmed: 3000 },
  { dim: 'phase', key: 'P12', cost_base: 10000, cost_base_unconfirmed: 10000 },
  { dim: 'phase', key: 'P13', cost_base: 9000, cost_base_unconfirmed: 0 },
  { dim: 'stage', key: 'ground-floor-open', cost_base: 50000, cost_base_unconfirmed: 50000 },
];
const vars = [
  { key: 'income.net_pay_now', value: 3000 },
  { key: 'costs.planned_post_move', value: { total: 2900 } },
  { key: 'income.net_per_3k_gross', value: 100 },
  { key: 'income.pay_rise_month', value: [2027, 4] },
  { key: 'cash.works_buffer', value: 5000 },
  { key: 'income.bonus_net', value: 4000 },
  { key: 'income.bonus_old', value: 1, status: 'retired' },
];

test('groups partition the work: one case, no ideas, services summed', () => {
  const g = planGroups(rollup);
  assert.deepEqual(g.map((x) => x.id), ['day-one', 'condition', 'services', 's1']);
  assert.equal(g[0].cost, 4000);
  assert.equal(g[2].cost, 19000);
  assert.ok(!g.some((x) => x.label.includes('boot room') && x.id !== 's1'));
});

test('the spare is take-home less the planned budget, stepped at the pay rise', () => {
  assert.deepEqual(spareSteps(vars), [{ from: '2000-01', amount: 100 }, { from: '2027-04', amount: 200 }]);
});

test('a retired variable is not read', () => {
  assert.equal(variable(vars, 'income.bonus_old'), null);
});

test('both scenarios come back, and a bonus never makes things later', () => {
  const p = cashPlan(vars, rollup);
  assert.ok(p.ready);
  const month = (r, id) => r.items.find((i) => i.id === id)?.month ?? '9999-99';
  for (const g of p.items) assert.ok(month(p.withBonus, g.id) <= month(p.plain, g.id));
});

test('missing inputs are named, not guessed', () => {
  const p = cashPlan([], rollup);
  assert.equal(p.ready, false);
  assert.ok(p.missing.some((m) => m.includes('cash.works_buffer')));
});
