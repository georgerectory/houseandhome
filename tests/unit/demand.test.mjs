// Why a purchase is on the list.
//
// The SQL view is the authority and `npm run test:parity` holds the two
// together. These pin the behaviour itself, so a failure says what
// broke rather than only that the two disagree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLive, demandsByItem, demandState, costInScope, shoppingList, shoppingTotals,
} from '../../assets/js/engine/demand.js';

const job = (o = {}) => ({ id: 'j', kind: 'renovation', status: 'planned', horizon: 'next', ...o });
const buy = (o = {}) => ({
  id: 'b', kind: 'purchase', status: 'planned', horizon: 'next',
  acquisition: 'new', cost_expected: 100, cost_confidence: 'drafted', phase: 'strip_out', ...o,
});
const link = (from, to, o = {}) => ({
  from_type: 'work_item', from_id: from, to_type: 'work_item', to_id: to,
  kind: 'requires_material', valid_to: null, ...o,
});

test('live means somebody is about to need it, not merely intending to', () => {
  assert.ok(isLive('ready', 'someday'), 'ready is live whatever the horizon');
  assert.ok(isLive('in_progress', 'someday'));
  assert.ok(isLive('planned', 'now'));
  assert.ok(isLive('planned', 'next'));
  // A someday job is a real intention. It just does not put a
  // jackhammer on this month's list.
  assert.ok(!isLive('planned', 'later'));
  assert.ok(!isLive('planned', 'someday'));
  assert.ok(!isLive('idea', 'now'));
  assert.ok(!isLive('blocked', 'now'));
});

test('no digging, no digger - and a bed needs no job behind it', () => {
  const items = [
    job({ id: 'dig', status: 'idea', horizon: 'someday' }),
    job({ id: 'strip', status: 'planned', horizon: 'next' }),
    buy({ id: 'digger', acquisition: 'hire', cost_expected: 750 }),
    buy({ id: 'extractor', cost_expected: 380 }),
    buy({ id: 'bed', cost_expected: 500 }),
  ];
  const links = [link('dig', 'digger'), link('strip', 'extractor')];
  const rows = Object.fromEntries(shoppingList(items, links).map((r) => [r.id, r]));

  assert.equal(rows.digger.demand_state, 'dormant');
  assert.equal(rows.digger.cost_in_scope, 0, 'a dormant item is not yet a cost at all');
  assert.equal(rows.extractor.demand_state, 'live');
  assert.equal(rows.extractor.cost_in_scope, 380);
  assert.equal(rows.bed.demand_state, 'standalone', 'a bed is its own reason');
  assert.equal(rows.bed.cost_in_scope, 500);
});

test('waking the job wakes the purchase, and nothing was stored', () => {
  // The whole "adapts when the plans change" mechanism, in one test.
  const dig = job({ id: 'dig', status: 'idea', horizon: 'someday' });
  const items = [dig, buy({ id: 'digger', cost_expected: 750 })];
  const links = [link('dig', 'digger')];

  assert.equal(shoppingList(items, links)[0].demand_state, 'dormant');
  dig.status = 'planned'; dig.horizon = 'next';
  assert.equal(shoppingList(items, links)[0].demand_state, 'live');
  assert.equal(shoppingList(items, links)[0].cost_in_scope, 750);
  // And dropping it releases the purchase entirely.
  dig.status = 'dropped';
  assert.equal(shoppingList(items, links)[0].demand_state, 'standalone');
});

test('a closed link stops demanding, because links close rather than delete', () => {
  const items = [job({ id: 'dig', status: 'idea' }), buy({ id: 'digger' })];
  const closed = [link('dig', 'digger', { valid_to: '2026-01-01T00:00:00Z' })];
  assert.equal(shoppingList(items, closed)[0].demand_state, 'standalone');
  assert.equal(demandsByItem(items, closed).size, 0);
});

test('owned costs nothing, closed costs nothing, hire is flagged', () => {
  assert.equal(costInScope({ acquisition: 'owned', cost_expected: 60 }, 'standalone'), 0);
  assert.equal(costInScope({ acquisition: 'new', cost_expected: 60 }, 'closed'), 0);
  assert.equal(costInScope({ acquisition: 'new', cost_expected: 60 }, 'dormant'), 0);
  assert.equal(costInScope({ acquisition: 'hire', cost_expected: 60 }, 'live'), 60);

  const rows = shoppingList([
    buy({ id: 'skip', acquisition: 'hire' }),
    buy({ id: 'have', acquisition: 'owned' }),
    buy({ id: 'gone', status: 'done' }),
  ], []);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.skip.is_hire, true);
  assert.equal(by.have.is_covered, true);
  assert.equal(by.gone.demand_state, 'closed');
});

test('a total that adds hire to purchase says the project owns a skip', () => {
  const rows = shoppingList([
    buy({ id: 'a', cost_expected: 380 }),
    buy({ id: 'b', acquisition: 'hire', cost_expected: 320 }),
    buy({ id: 'c', cost_expected: 100, cost_confidence: 'confirmed' }),
  ], []);
  const [t] = shoppingTotals(rows);
  assert.equal(t.phase, 'strip_out');
  assert.equal(t.buy_cost, 480);
  assert.equal(t.hire_cost, 320, 'hire is totalled apart because it is never owned');
  assert.equal(t.total_in_scope, 800);
  // unconfirmed_cost spans BOTH columns - it asks how much of the total
  // rests on a figure nobody has checked, not how much of the buying
  // does. Here that is the 380 and the 320; only the confirmed 100 is
  // left out.
  assert.equal(t.unconfirmed_cost, 700);
  assert.equal(t.items_in_scope, 3);
});

test('parked money is reported, never folded in and never hidden', () => {
  const items = [job({ id: 'dig', status: 'idea', horizon: 'someday' }),
    buy({ id: 'digger', cost_expected: 750, phase: 'extension' })];
  const [t] = shoppingTotals(shoppingList(items, [link('dig', 'digger')]));
  assert.equal(t.total_in_scope, 0, 'parked money is not owed this round');
  assert.equal(t.dormant_cost, 750, 'but it is still visible');
  assert.equal(t.items_dormant, 1);
});

test('an unplaced purchase totals under "unplaced" rather than vanishing', () => {
  const [t] = shoppingTotals(shoppingList([buy({ phase: null })], []));
  assert.equal(t.phase, 'unplaced');
  assert.equal(t.total_in_scope, 100);
});
