// The allocation rule, tested as stated rather than as implemented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, weightForRank, projectFunding, DEFAULTS } from '../../assets/js/engine/allocate.js';

const items = (n, cost = 1000) =>
  Array.from({ length: n }, (_, i) => ({ id: `i${i}`, title: `Item ${i + 1}`, targetCost: cost, allocatedBalance: 0 }));

const sum = (rows) => rows.reduce((s, r) => s + r.amount, 0);

test('every open item receives a strictly positive share', () => {
  for (const n of [1, 5, 20, 60, 120, 300]) {
    const rows = allocate(items(n), 500);
    assert.equal(rows.length, n, `expected ${n} rows`);
    for (const r of rows) {
      assert.ok(r.amount > 0, `rank ${r.rank} of ${n} received ${r.amount}`);
    }
  }
});

test('shares sum to the deposit exactly, to the micro-pound', () => {
  for (const [n, amount] of [[5, 100], [20, 500], [17, 333.33], [120, 250], [60, 5], [3, 0.03]]) {
    const total = sum(allocate(items(n), amount));
    assert.equal(Math.round(total * 1e6), Math.round(amount * 1e6),
      `n=${n} amount=${amount} summed to ${total}`);
  }
});

test('priority drives magnitude, and cost does not', () => {
  // The expensive item sits last; it must still receive the smallest
  // share, because rank is what decides, not price.
  const list = [
    { id: 'a', title: 'cheap, top priority', targetCost: 20, allocatedBalance: 0 },
    { id: 'b', title: 'mid', targetCost: 500, allocatedBalance: 0 },
    { id: 'c', title: 'expensive, bottom priority', targetCost: 4000, allocatedBalance: 0 },
  ];
  const [top, mid, bottom] = allocate(list, 300);
  assert.ok(top.amount > mid.amount, 'rank 1 should beat rank 2');
  assert.ok(mid.amount > bottom.amount, 'rank 2 should beat rank 3');
});

test('weights are strictly decreasing and always sum to one', () => {
  const n = 40;
  let prev = Infinity;
  let total = 0;
  for (let r = 1; r <= n; r++) {
    const w = weightForRank(r, n);
    assert.ok(w > 0, `weight at rank ${r} was ${w}`);
    assert.ok(w < prev, `weight did not decrease at rank ${r}`);
    prev = w;
    total += w;
  }
  assert.ok(Math.abs(total - 1) < 1e-9, `weights summed to ${total}`);
});

test('the floor share is what keeps a long tail alive', () => {
  // With no floor, a geometric curve underflows to zero on a long list.
  // This is the specific reason the floor exists, so it is asserted.
  const n = 200;
  const withFloor = weightForRank(n, n, DEFAULTS.decay, DEFAULTS.floorShare);
  const withoutFloor = weightForRank(n, n, DEFAULTS.decay, 0);
  assert.ok(withoutFloor < 1e-12, `expected underflow without a floor, got ${withoutFloor}`);
  assert.ok(withFloor > 1e-6, `floor share should keep the tail fundable, got ${withFloor}`);
});

test('a cheap item near the top funds before an expensive one above it', () => {
  // The fast-win behaviour is emergent, not a special rule: a small
  // target fills quickly even on a modest share.
  const list = [
    { id: 'big', title: 'kitchen', targetCost: 4000, allocatedBalance: 0 },
    { id: 'small', title: 'door handles', targetCost: 40, allocatedBalance: 0 },
  ];
  const p = projectFunding(list, 200);
  const small = p.find((x) => x.id === 'small');
  const big = p.find((x) => x.id === 'big');
  assert.ok(small.monthsToFund < big.monthsToFund,
    `cheap item took ${small.monthsToFund} months, expensive took ${big.monthsToFund}`);
});

test('closing an item accelerates everything below it', () => {
  const before = allocate(items(10), 500);
  const after = allocate(items(9), 500);
  assert.ok(after[0].amount > before[1].amount,
    'the item promoted into rank 1 should receive more than it did at rank 2');
});

test('an empty list or a zero deposit allocates nothing rather than throwing', () => {
  assert.deepEqual(allocate([], 500), []);
  assert.deepEqual(allocate(items(5), 0), []);
  assert.deepEqual(allocate(items(5), -10), []);
});

test('balances carry forward across deposits', () => {
  let list = items(4, 100);
  for (let m = 0; m < 3; m++) {
    const rows = allocate(list, 100);
    list = list.map((i) => ({ ...i, allocatedBalance: rows.find((r) => r.id === i.id).balanceAfter }));
  }
  const total = list.reduce((s, i) => s + i.allocatedBalance, 0);
  assert.equal(Math.round(total * 1e6), Math.round(300 * 1e6), 'three £100 deposits should total £300');
});
