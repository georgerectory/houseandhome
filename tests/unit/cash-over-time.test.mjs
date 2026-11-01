// The cash-over-time walk: work is funded in roadmap order when the money
// exists, the reserve is never touched, a bonus lands in its month, and
// the share resting on unconfirmed costs travels with the answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cashOverTime, addMonths, monthsBetween, spareIn } from '../../assets/js/engine/cash-over-time.js';

test('month arithmetic crosses year ends', () => {
  assert.equal(addMonths('2027-11', 3), '2028-02');
  assert.equal(monthsBetween('2027-04', '2028-04'), 12);
  assert.equal(spareIn('2027-03', [{ from: '2027-01', amount: 12 }, { from: '2027-04', amount: 135 }]), 12);
  assert.equal(spareIn('2027-05', [{ from: '2027-01', amount: 12 }, { from: '2027-04', amount: 135 }]), 135);
});

test('items fund in order as the balance allows, never touching the reserve', () => {
  const r = cashOverTime({
    start: '2027-04', startCash: 5000, reserve: 1000,
    spare: [{ from: '2027-04', amount: 500 }],
    items: [{ id: 'a', cost: 3000 }, { id: 'b', cost: 2000 }],
  });
  // Month 0: 5000 - 1000 reserve covers a (3000), leaving 2000 -> 1000 usable.
  assert.equal(r.items[0].id, 'a');
  assert.equal(r.items[0].month, '2027-04');
  // b needs 2000 usable: 1000 + 500/month -> two months later.
  assert.equal(r.items[1].id, 'b');
  assert.equal(r.items[1].month, '2027-06');
  assert.ok(r.months.every((m) => m.balance >= 1000 || m.funded.length === 0));
  assert.equal(r.unfunded.length, 0);
});

test('order is respected: a cheap item waits behind a dear one', () => {
  const r = cashOverTime({
    start: '2027-04', startCash: 0, spare: [{ from: '2027-04', amount: 100 }],
    items: [{ id: 'dear', cost: 1000 }, { id: 'cheap', cost: 50 }],
  });
  assert.deepEqual(r.items.map((i) => i.id), ['dear', 'cheap']);
});

test('a bonus lands in its month', () => {
  const r = cashOverTime({
    start: '2027-04', startCash: 0, spare: [{ from: '2027-04', amount: 10 }],
    bonuses: [{ month: '2027-06', amount: 4500 }],
    items: [{ id: 'x', cost: 4000 }],
  });
  assert.equal(r.items[0].month, '2027-06');
});

test('what never becomes fundable inside the horizon is reported, not dropped', () => {
  const r = cashOverTime({
    start: '2027-04', startCash: 0, spare: [{ from: '2027-04', amount: 12 }], horizon: 24,
    items: [{ id: 'big', cost: 50000 }],
  });
  assert.equal(r.items.length, 0);
  assert.equal(r.unfunded[0].id, 'big');
});

test('the unconfirmed share is computed from the costs', () => {
  const r = cashOverTime({
    start: '2027-04', startCash: 10000, spare: [],
    items: [{ id: 'a', cost: 3000, unconfirmed: true }, { id: 'b', cost: 1000, unconfirmed: false }],
  });
  assert.equal(r.unconfirmedShare, 0.75);
});
