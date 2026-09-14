// The shopping engine. What is asserted hardest here is that a total
// never presents itself as trustworthy when one of its inputs is not,
// because a budget built from drafted prices is the specific failure
// this system exists to prevent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIP_AXES, axisFor, purchases, targetCost, funding, totals, trips,
  readyToBuy, nextUp, benchmarks, estimateCheck, STALE_DAYS,
} from '../../assets/js/engine/shopping.js';

const buy = (o = {}) => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  title: 'Hoover', kind: 'purchase', status: 'planned', horizon: 'next',
  priority: 10, room_name: 'Hallway', theme: 'make_clean',
  cost_best: 80, cost_expected: 165, cost_worst: 250,
  cost_confidence: 'drafted', allocated_balance: 0, ...o,
});

// --- Membership ------------------------------------------------------

test('the list is purchases still to make - jobs are not shopping', () => {
  const rows = [buy({ id: 'a' }), buy({ id: 'j', kind: 'repair' })];
  assert.deepEqual(purchases(rows).map((i) => i.id), ['a']);
});

test('a bought or abandoned item leaves the list but not the database', () => {
  const rows = [buy({ id: 'a' }), buy({ id: 'b', status: 'done' }), buy({ id: 'c', status: 'dropped' })];
  assert.deepEqual(purchases(rows).map((i) => i.id), ['a']);
});

test('an empty dataset is an empty list, not a crash', () => {
  assert.deepEqual(purchases(null), []);
  assert.deepEqual(purchases([]), []);
});

// --- Funding ---------------------------------------------------------

test('the working figure is the expected cost, falling back to the low one', () => {
  assert.equal(targetCost(buy({ cost_expected: 165 })), 165);
  assert.equal(targetCost(buy({ cost_expected: null, cost_best: 80 })), 80);
  assert.equal(targetCost(buy({ cost_expected: null, cost_best: null })), null);
});

test('shortfall is what is still needed, and an item is ready only at zero', () => {
  assert.deepEqual(funding(buy({ cost_expected: 100, allocated_balance: 40 })),
    { target: 100, saved: 40, shortfall: 60, funded: false, pct: 40 });
  const done = funding(buy({ cost_expected: 100, allocated_balance: 100 }));
  assert.equal(done.shortfall, 0);
  assert.equal(done.funded, true);
});

test('an over-funded item is not a negative requirement', () => {
  const f = funding(buy({ cost_expected: 100, allocated_balance: 150 }));
  assert.equal(f.shortfall, 0, 'clamped, or the grand total would be silently reduced');
  assert.equal(f.pct, 100);
});

test('an uncosted item has no shortfall to state, and is never "ready"', () => {
  const f = funding(buy({ cost_expected: null, cost_best: null, allocated_balance: 20 }));
  assert.equal(f.target, null);
  assert.equal(f.shortfall, null);
  assert.equal(f.funded, false, 'nothing is ready against an unknown price');
});

test('a zero-cost item is not "ready to buy" either', () => {
  assert.equal(funding(buy({ cost_expected: 0, cost_best: 0 })).funded, false);
});

// --- Totals ----------------------------------------------------------

test('a total is untrusted as soon as ONE input is', () => {
  const mixed = totals([
    buy({ cost_confidence: 'confirmed' }),
    buy({ cost_confidence: 'drafted' }),
  ]);
  assert.equal(mixed.trusted, false, 'a total is only as good as its worst input');
  assert.equal(totals([buy({ cost_confidence: 'confirmed' })]).trusted, true);
  assert.equal(totals([buy({ cost_confidence: 'actual' })]).trusted, true);
});

test('carried-over and researched figures do not make a total trustworthy', () => {
  for (const c of ['carried_over', 'researched', 'drafted']) {
    assert.equal(totals([buy({ cost_confidence: c })]).trusted, false, `${c} must not be trusted`);
  }
});

test('an empty set is never trusted, so a zero cannot read as a confirmed zero', () => {
  assert.equal(totals([]).trusted, false);
  assert.equal(totals([]).expected, 0);
});

test('uncosted items are counted separately, never silently understating the total', () => {
  const t = totals([
    buy({ cost_expected: 100, cost_best: 80, cost_worst: 120 }),
    buy({ cost_expected: null, cost_best: null, cost_worst: null }),
  ]);
  assert.equal(t.count, 2);
  assert.equal(t.costed, 1);
  assert.equal(t.uncosted, 1, 'the page can say the total is missing a price');
  assert.equal(t.expected, 100);
});

test('the range sums the low and high ends, falling back to the working figure', () => {
  const t = totals([
    buy({ cost_best: 80, cost_expected: 165, cost_worst: 250 }),
    buy({ cost_best: null, cost_expected: 50, cost_worst: null }),
  ]);
  assert.equal(t.low, 130);
  assert.equal(t.high, 300);
  assert.equal(t.expected, 215);
});

test('the grand shortfall nets off what has been saved', () => {
  const t = totals([
    buy({ cost_expected: 100, allocated_balance: 25 }),
    buy({ cost_expected: 50, allocated_balance: 10 }),
  ]);
  assert.equal(t.saved, 35);
  assert.equal(t.shortfall, 115);
});

test('saved counts even on an uncosted item, because the money is real', () => {
  const t = totals([buy({ cost_expected: null, cost_best: null, allocated_balance: 12 })]);
  assert.equal(t.saved, 12);
  assert.equal(t.expected, 0);
});

// --- Trips -----------------------------------------------------------

test('every axis is selectable and nameable, and room is the default', () => {
  for (const a of TRIP_AXES) assert.ok(a.key && a.label && a.fallback);
  assert.equal(axisFor('nonsense').key, 'room', 'an unknown axis falls back, never throws');
});

test('trips group along the chosen axis, each with its own subtotal', () => {
  const rows = [
    buy({ id: 'a', room_name: 'Garden', cost_expected: 100 }),
    buy({ id: 'b', room_name: 'Garden', cost_expected: 50 }),
    buy({ id: 'c', room_name: 'Gym', cost_expected: 20 }),
  ];
  const g = trips(rows, 'room');
  assert.deepEqual(g.map((x) => x.key), ['Garden', 'Gym'], 'the dearest run leads');
  assert.equal(g[0].totals.expected, 150);
  assert.equal(g[0].items.length, 2);
});

test('an item with no value on the axis is grouped, never dropped', () => {
  const rows = [buy({ id: 'a', room_name: null, cost_expected: 500 }), buy({ id: 'b', room_name: 'Gym', cost_expected: 5 })];
  const g = trips(rows, 'room');
  assert.equal(g.length, 2);
  assert.equal(g.at(-1).key, 'No room set', '"not set" sorts last however expensive it is');
  assert.ok(g.at(-1).isFallback);
});

test('an axis with a declared order uses it rather than cost', () => {
  const rows = [
    buy({ id: 'a', horizon: 'someday', cost_expected: 900 }),
    buy({ id: 'b', horizon: 'now', cost_expected: 5 }),
    buy({ id: 'c', horizon: 'next', cost_expected: 50 }),
  ];
  assert.deepEqual(trips(rows, 'horizon').map((g) => g.key), ['now', 'next', 'someday']);
});

test('items within a trip are ordered by priority, not by price', () => {
  const rows = [
    buy({ id: 'cheap-urgent', priority: 1, cost_expected: 5 }),
    buy({ id: 'dear-later', priority: 90, cost_expected: 900 }),
  ];
  assert.deepEqual(trips(rows, 'room')[0].items.map((i) => i.id), ['cheap-urgent', 'dear-later']);
});

test('grouping never loses an item', () => {
  const rows = Array.from({ length: 12 }, (_, n) =>
    buy({ id: `i${n}`, room_name: n % 3 ? `Room ${n % 3}` : null }));
  for (const axis of TRIP_AXES.map((a) => a.key)) {
    const total = trips(rows, axis).reduce((s, g) => s + g.items.length, 0);
    assert.equal(total, rows.length, `${axis} dropped an item`);
  }
});

// --- Ready and next --------------------------------------------------

test('ready to buy is the fully funded, dearest first', () => {
  const rows = [
    buy({ id: 'small', cost_expected: 20, allocated_balance: 20 }),
    buy({ id: 'big', cost_expected: 200, allocated_balance: 200 }),
    buy({ id: 'part', cost_expected: 100, allocated_balance: 99 }),
  ];
  assert.deepEqual(readyToBuy(rows).map((i) => i.id), ['big', 'small'],
    'clearing the big funded item frees the most future share');
});

test('next up is priority order, whatever is affordable', () => {
  const rows = [
    buy({ id: 'later', priority: 40, allocated_balance: 165 }),
    buy({ id: 'first', priority: 2, allocated_balance: 0 }),
  ];
  assert.deepEqual(nextUp(rows, 2).map((i) => i.id), ['first', 'later']);
});

test('next up does not mutate the caller\'s list', () => {
  const rows = [buy({ id: 'b', priority: 9 }), buy({ id: 'a', priority: 1 })];
  nextUp(rows);
  assert.deepEqual(rows.map((i) => i.id), ['b', 'a']);
});

// --- Benchmarks ------------------------------------------------------

const now = Date.parse('2026-09-01T00:00:00Z');
const ago = (days) => new Date(now - days * 864e5).toISOString().slice(0, 10);
const ref = (o = {}) => ({
  work_item_id: 'a', channel: 'amazon', price_low: 100, price_typical: 150,
  price_high: 200, captured_on: ago(10), ...o,
});

test('benchmarks are the references for THIS item, freshest first', () => {
  const marks = benchmarks(buy({ id: 'a' }),
    [ref({ captured_on: ago(60) }), ref({ captured_on: ago(5) }), ref({ work_item_id: 'other' })], now);
  assert.equal(marks.length, 2);
  assert.equal(marks[0].ageDays, 5);
});

test('a stale benchmark is marked, not hidden - it is still evidence', () => {
  const marks = benchmarks(buy({ id: 'a' }), [ref({ captured_on: ago(STALE_DAYS + 1) })], now);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].stale, true);
});

test('a reference with no capture date is stale by default, never assumed current', () => {
  const marks = benchmarks(buy({ id: 'a' }), [ref({ captured_on: null })], now);
  assert.equal(marks[0].stale, true);
  assert.equal(marks[0].ageDays, null);
});

test('an estimate inside the benchmark range reads as within', () => {
  assert.equal(estimateCheck(buy({ id: 'a', cost_expected: 150 }), [ref()], now).verdict, 'within');
});

test('an estimate outside the range is flagged, which is the point of the page', () => {
  assert.equal(estimateCheck(buy({ id: 'a', cost_expected: 20 }), [ref()], now).verdict, 'under');
  assert.equal(estimateCheck(buy({ id: 'a', cost_expected: 900 }), [ref()], now).verdict, 'over');
});

test('a stale reference does not get to judge a current estimate', () => {
  assert.equal(estimateCheck(buy({ id: 'a', cost_expected: 20 }),
    [ref({ captured_on: ago(STALE_DAYS + 1) })], now), null);
});

test('no references and no price mean no verdict, rather than a made-up one', () => {
  assert.equal(estimateCheck(buy({ id: 'a' }), [], now), null);
  assert.equal(estimateCheck(buy({ id: 'a', cost_expected: null, cost_best: null }), [ref()], now), null);
});
