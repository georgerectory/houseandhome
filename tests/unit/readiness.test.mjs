// What is doable, and why most of it is not.
//
// The SQL view is the authority and the parity harness holds the two
// together. These pin the rule itself, so a failure says what broke
// rather than only that the two disagree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readinessOf, readinessReport, whatCanIDoToday, blockersOf, missingMaterialsOf,
} from '../../assets/js/engine/readiness.js';

const job = (o = {}) => ({ id: 'j', title: 'Job', kind: 'renovation', status: 'planned', ...o });
const link = (kind, from, to, o = {}) => ({
  from_type: 'work_item', from_id: from, to_type: 'work_item', to_id: to,
  kind, valid_to: null, ...o,
});

test('an obstacle that comes first wins the label', () => {
  // A job both blocked and unfunded is BLOCKED. Saying "waiting on
  // money" would send somebody to spend money that changes nothing.
  assert.equal(readinessOf(job({ cost_expected: 500 }), ['Rewire'], []), 'waiting_on_work');
  assert.equal(readinessOf(job({ cost_expected: 500 }), [], ['Lime']), 'waiting_on_materials');
  assert.equal(readinessOf(job({ cost_expected: 500 })), 'waiting_on_money');
  assert.equal(readinessOf(job({ cost_expected: 500, allocated_balance: 500 })), 'ready');
  assert.equal(readinessOf(job({ status: 'idea' })), 'not_decided');
  assert.equal(readinessOf(job({ status: 'done' })), 'closed');
  assert.equal(readinessOf(job()), 'ready');
});

test('closed work holds nothing up, and owned materials are in hand', () => {
  const items = [
    job({ id: 'strip', status: 'done' }),
    job({ id: 'plaster' }),
    job({ id: 'lime', kind: 'purchase', acquisition: 'owned' }),
  ];
  const links = [link('must_precede', 'strip', 'plaster'), link('requires_material', 'plaster', 'lime')];
  assert.equal(blockersOf(items, links).size, 0, 'a job already done blocks nothing');
  assert.equal(missingMaterialsOf(items, links).size, 0, 'a thing you own is not a thing to buy');
  const rows = readinessReport(items, links);
  assert.equal(rows.find((r) => r.id === 'plaster').readiness, 'ready');
});

test('a closed link stops blocking, because links close rather than delete', () => {
  const items = [job({ id: 'a' }), job({ id: 'b' })];
  const closed = [link('must_precede', 'a', 'b', { valid_to: '2026-01-01T00:00:00Z' })];
  assert.equal(blockersOf(items, closed).size, 0);
});

test('an unknown duration is reported, never assumed to be zero', () => {
  const rows = readinessReport([
    job({ id: 'quick', duration_min_minutes: 30, priority: 1 }),
    job({ id: 'unknown', priority: 2 }),
    job({ id: 'long', duration_min_minutes: 480, priority: 3 }),
  ], []);
  const today = whatCanIDoToday(rows, { minutes: 120 });
  assert.deepEqual(today.map((r) => r.id), ['quick', 'unknown'],
    'the long job is out; the unestimated one is in, but last');
  assert.equal(today[0].duration_known, true);
  assert.equal(today[1].duration_known, false, 'and it says so rather than claiming to fit');
});

test('a job needing a long session does not fit a short afternoon', () => {
  const rows = readinessReport([
    job({ id: 'render', duration_min_minutes: 60, min_session_minutes: 180 }),
  ], []);
  assert.equal(whatCanIDoToday(rows, { minutes: 90 }).length, 0);
  assert.equal(whatCanIDoToday(rows, { minutes: 240 }).length, 1);
});

test('budget lets money already set aside through regardless', () => {
  const rows = readinessReport([
    job({ id: 'cheap', cost_expected: 20, allocated_balance: 20 }),
    job({ id: 'funded', cost_expected: 900, allocated_balance: 900 }),
  ], []);
  assert.deepEqual(whatCanIDoToday(rows, { budget: 50 }).map((r) => r.id), ['cheap', 'funded'],
    'a funded job costs nothing more today');
});
