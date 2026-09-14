import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilters, groupItems, optionsFor, buildTimeline, spanMonths,
  toCSV, toJSON, GROUPINGS, groupingFor,
} from '../../assets/js/engine/roadmap-views.js';

const item = (o = {}) => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  title: 'Item', kind: 'renovation', status: 'planned', horizon: 'later',
  priority: 10, room_name: 'Kitchen', trade: 'decorating', theme: 'cosmetic',
  benefit_type: 'comfort', associated_trades: [], tools_required: [],
  cost_expected: 100, allocated_balance: 0, cost_confidence: 'drafted',
  duration_min_minutes: 60, duration_max_minutes: 120, ...o,
});

test('filters narrow on every house axis', () => {
  const rows = [
    item({ id: 'a', room_name: 'Bathroom', trade: 'plumbing' }),
    item({ id: 'b', room_name: 'Kitchen', trade: 'electrical' }),
    item({ id: 'c', room_name: 'Kitchen', trade: 'plumbing', kind: 'purchase' }),
  ];
  assert.equal(applyFilters(rows, { room: 'Kitchen' }).length, 2);
  assert.equal(applyFilters(rows, { trade: 'plumbing' }).length, 2);
  assert.equal(applyFilters(rows, { kind: 'purchase' }).length, 1);
  assert.equal(applyFilters(rows, { room: 'Kitchen', trade: 'plumbing' }).length, 1);
});

test('a trade filter matches associated trades, not only the owner', () => {
  // A bathroom rewire is owned by electrical but an organisation view
  // should still surface it. That is the whole point of the second axis.
  const rows = [
    item({ id: 'a', trade: 'electrical', associated_trades: ['plastering'] }),
    item({ id: 'b', trade: 'decorating', associated_trades: [] }),
  ];
  assert.equal(applyFilters(rows, { trade: 'plastering' }).length, 1);
  assert.equal(applyFilters(rows, { trade: 'plastering' })[0].id, 'a');
});

test('search covers title, room, trade and tools', () => {
  const rows = [
    item({ id: 'a', title: 'Bleed radiators', tools_required: ['radiator key'] }),
    item({ id: 'b', title: 'Paint hallway', room_name: 'Hallway' }),
  ];
  assert.equal(applyFilters(rows, { search: 'radiator key' })[0].id, 'a');
  assert.equal(applyFilters(rows, { search: 'hallway' })[0].id, 'b');
  assert.equal(applyFilters(rows, { search: 'nothing here' }).length, 0);
});

test('done work is hidden by default and shown on request', () => {
  const rows = [item({ id: 'a' }), item({ id: 'b', status: 'done' }), item({ id: 'c', status: 'dropped' })];
  assert.equal(applyFilters(rows, {}).length, 1);
  assert.equal(applyFilters(rows, { hideDone: false }).length, 3);
});

test('grouping by horizon keeps band order and shows empty bands', () => {
  // An absent "Now" column is information. Dropping it loses that.
  const groups = groupItems([item({ horizon: 'later' })], 'horizon');
  assert.deepEqual(groups.map((g) => g.key), ['now', 'next', 'later', 'someday']);
  assert.equal(groups.find((g) => g.key === 'now').count, 0);
  assert.equal(groups.find((g) => g.key === 'later').count, 1);
});

test('grouping by room orders by most urgent work, not alphabetically', () => {
  const groups = groupItems([
    item({ room_name: 'Attic', priority: 40 }),
    item({ room_name: 'Bathroom', priority: 2 }),
    item({ room_name: 'Cellar', priority: 15 }),
  ], 'room');
  assert.deepEqual(groups.map((g) => g.label), ['Bathroom', 'Cellar', 'Attic']);
});

test('items with no value for the grouping land in a named bucket', () => {
  const groups = groupItems([item({ trade: null }), item({ trade: '' })], 'trade');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, groupingFor('trade').fallback);
  assert.equal(groups[0].count, 2);
});

test('every grouping is usable and none is a department', () => {
  const keys = GROUPINGS.map((g) => g.key);
  for (const k of ['room', 'trade', 'theme', 'benefit_type', 'kind', 'horizon', 'none']) {
    assert.ok(keys.includes(k), `missing grouping ${k}`);
  }
  assert.ok(!keys.includes('department'));
  for (const g of GROUPINGS) {
    assert.doesNotThrow(() => groupItems([item()], g.key), `grouping ${g.key} threw`);
  }
});

test('group totals sum the estimates they contain', () => {
  const groups = groupItems([
    item({ room_name: 'Kitchen', cost_expected: 100 }),
    item({ room_name: 'Kitchen', cost_expected: 250 }),
  ], 'room');
  assert.equal(groups[0].totalCost, 350);
});

test('filter options only offer values that exist', () => {
  const rows = [item({ trade: 'plumbing' }), item({ trade: 'electrical' }), item({ trade: null })];
  assert.deepEqual(optionsFor(rows, 'trade'), ['electrical', 'plumbing']);
});

test('the timeline places cheaper, higher-priority work earlier', () => {
  const rows = [
    item({ id: 'cheap', priority: 1, cost_expected: 50 }),
    item({ id: 'dear', priority: 2, cost_expected: 4000 }),
  ];
  const t = buildTimeline(rows, { monthly: 200 });
  const cheap = t.bars.find((b) => b.item.id === 'cheap');
  const dear = t.bars.find((b) => b.item.id === 'dear');
  assert.ok(cheap.fundedMonth < (dear.fundedMonth ?? Infinity),
    `cheap funded at ${cheap.fundedMonth}, dear at ${dear.fundedMonth}`);
});

test('work needing no money starts immediately', () => {
  const t = buildTimeline([item({ id: 'free', cost_expected: 0 })], { monthly: 200 });
  const bar = t.bars.find((b) => b.item.id === 'free');
  assert.equal(bar.noCost, true);
  assert.equal(bar.start, 0);
});

test('work that cannot be funded in range is flagged, not hidden', () => {
  const t = buildTimeline([item({ id: 'huge', cost_expected: 500000 })], { monthly: 10, horizonMonths: 12 });
  const bar = t.bars.find((b) => b.item.id === 'huge');
  assert.equal(bar.beyond, true);
  assert.equal(bar.fundedMonth, null);
  assert.equal(t.anyBeyond, true);
});

test('with no contribution the timeline reports it rather than inventing dates', () => {
  const t = buildTimeline([item()], { monthly: 0 });
  assert.equal(t.fundable, false);
});

test('bar span reflects estimated effort', () => {
  assert.equal(spanMonths(item({ duration_max_minutes: 60 })), 1);
  assert.equal(spanMonths(item({ duration_max_minutes: null, duration_min_minutes: null })), 1);
  // 200 working days is ten months of a twenty-day month.
  assert.equal(spanMonths(item({ duration_max_minutes: 200 * 8 * 60 })), 10);
});

test('CSV exports a header and one row per item, escaping separators', () => {
  const csv = toCSV([item({ title: 'Paint, sand and fill' })]);
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Priority,Title,Kind,Room,Trade/);
  assert.match(lines[1], /"Paint, sand and fill"/);
});

test('JSON export is valid and carries the same columns', () => {
  const parsed = JSON.parse(toJSON([item({ title: 'A job' })]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'A job');
  assert.ok('cost_confidence' in parsed[0], 'provenance must survive the export');
});

test('export reflects the filtered set, not the whole table', () => {
  const rows = [item({ id: 'a', room_name: 'Kitchen' }), item({ id: 'b', room_name: 'Loft' })];
  const filtered = applyFilters(rows, { room: 'Kitchen' });
  assert.equal(toCSV(filtered).split('\n').length, 2);
});
