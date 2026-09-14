// The three boards. These render to strings, so they are asserted on the
// markup contract the page and the CSS both depend on: the title inside
// the bar, the grid line numbers a span pinches across, the continuation
// strip, and the counts in the roll-up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, markRecency } from '../../assets/js/engine/roadmap-model.js';
import { timeline, placeItem, placedWithChildren } from '../../assets/js/engine/roadmap-timeline.js';
import { cascade } from '../../assets/js/engine/roadmap-cascade.js';
import { summary, liveWork, tradeGroups } from '../../assets/js/engine/roadmap-summary.js';

const THEMES = [
  { key: 'make_safe', label: 'Make safe', sort_order: 10 },
  { key: 'cosmetic', label: 'Cosmetic', sort_order: 90, description: 'Looks, not function' },
];

const item = (o = {}) => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  title: 'Item', kind: 'renovation', level: 'job', status: 'planned',
  horizon: 'now', priority: 10, room_name: 'Kitchen', trade: 'decorating',
  theme: 'cosmetic', associated_trades: [], ...o,
});

function build(items) {
  markRecency(items, Date.parse('2026-06-01T00:00:00Z'));
  return { data: { items, themes: THEMES }, ctx: context({ items, themes: THEMES }) };
}
const render = (items, level = 'work', opts = {}) => {
  const { data, ctx } = build(items);
  return timeline(data, level, { ctx, ...opts });
};
const renderCascade = (items, level = 'work', opts = {}) => {
  const { data, ctx } = build(items);
  return cascade(data, level, { ctx, ...opts });
};

// --- Timeline: the bar IS the item -----------------------------------

test('the title is rendered INSIDE the bar, not beside it', () => {
  const html = render([item({ title: 'Re-grout the shower' })]);
  assert.match(html, /<span class="rmv-tl-title">Re-grout the shower<\/span>/,
    'the board must read without opening anything');
});

test('a bar carries its item id, so every bar opens the drawer', () => {
  const html = render([item({ id: 'abc-123' })]);
  assert.match(html, /data-item-id="abc-123"/);
});

test('a bar is a real button, so it is reachable by keyboard', () => {
  const html = render([item()]);
  assert.match(html, /<button type="button" class="rmv-tl-bar/);
});

test('a span is placed by GRID LINE numbers so it pinches, never slides off', () => {
  // With delivered shown the axis opens at Previously, so line 1 is the
  // gutter and Now is line 4. --to is exclusive, so a now-to-later bar
  // ends at line 7.
  const html = render([item({ horizon: 'now', end_horizon: 'later' })]);
  assert.match(html, /--from:4;--to:7/);
});

test('a bar is clipped to the bands the level actually draws', () => {
  // A now-to-someday item in the work level stops at Later, because the
  // parked column is not on that board at all.
  const html = render([item({ horizon: 'now', end_horizon: 'someday' })]);
  assert.match(html, /--from:4;--to:7/, 'it stops at Later, the last band this level draws');
});

test('hiding done work shifts the axis, and the bars shift with it', () => {
  const withDone = render([item({ horizon: 'now' })], 'work', { showDelivered: true });
  const without = render([item({ horizon: 'now' })], 'work', { showDelivered: false });
  assert.match(withDone, /--from:4/, 'previously and recently occupy the first two lines');
  assert.match(without, /--from:2/, 'without them the Now band starts at the first column');
});

test('every band header is a collapse toggle with its state announced', () => {
  const html = render([item()]);
  assert.match(html, /class="rmv-tl-col rmv-band-toggle[^"]*"[\s\S]*?data-band="now" aria-pressed="false"/);
});

test('a collapsed band thins to a seam and drops what starts in it', () => {
  const html = render([item({ id: 'gone', horizon: 'now' }), item({ id: 'kept', horizon: 'next' })],
    'work', { hiddenBands: { now: true } });
  assert.doesNotMatch(html, /data-item-id="gone"/);
  assert.match(html, /data-item-id="kept"/);
  assert.match(html, /--tl-seams:1/);
  assert.match(html, /rmv-tl-col--seam/);
});

test('collapsing every band still leaves a way back', () => {
  const html = render([item({ horizon: 'now' })], 'work',
    { hiddenBands: { previously: true, recently: true, now: true, next: true, later: true } });
  assert.match(html, /Click a struck heading to bring one back/);
  assert.match(html, /rmv-band-toggle--off/, 'the struck headings stay clickable');
});

test('an empty board says where items come from rather than showing nothing', () => {
  assert.match(render([]), /No work items yet/);
});

test('a project\'s children follow it immediately, indented', () => {
  const html = render([
    item({ id: 'p', level: 'project', title: 'Bathroom', priority: 1 }),
    item({ id: 'c', parent_id: 'p', title: 'Rewire lights', priority: 2 }),
    item({ id: 'other', title: 'Unrelated', priority: 3 }),
  ]);
  const order = [...html.matchAll(/data-item-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['p', 'c', 'other'], 'a family groups rather than scatters');
  assert.match(html, /rmv-tl-row--child/);
});

test('a child inherits its parent\'s lane, and a disagreeing theme surfaces as a dot', () => {
  const { ctx } = build([
    item({ id: 'p', level: 'project', theme: 'make_safe' }),
    item({ id: 'c', parent_id: 'p', theme: 'cosmetic' }),
  ]);
  const parent = ctx.itemById.p;
  const placed = placeItem(ctx.itemById.c, ctx, true, parent);
  assert.equal(placed._theme.key, 'make_safe', 'the family reads as one block');
  assert.equal(placed._dot.key, 'cosmetic', 'the misfiling is still visible');
});

test('a child whose theme agrees with its parent gets no dot', () => {
  const { ctx } = build([
    item({ id: 'p', level: 'project', theme: 'make_safe' }),
    item({ id: 'c', parent_id: 'p', theme: 'make_safe' }),
  ]);
  assert.equal(placeItem(ctx.itemById.c, ctx, true, ctx.itemById.p)._dot, null);
});

test('a delivered bar keeps its theme as a dot once it loses its lane fill', () => {
  const { ctx } = build([item({ id: 'd', status: 'done', resolved_at: '2026-05-20T00:00:00Z' })]);
  const placed = placeItem(ctx.itemById.d, ctx);
  assert.equal(placed._dot.key, 'cosmetic');
  assert.equal(placed.done, true);
});

test('steps never take a lane of their own', () => {
  const html = render([
    item({ id: 'p', level: 'project' }),
    item({ id: 's', parent_id: 'p', level: 'step', title: 'Buy the grout' }),
  ]);
  assert.doesNotMatch(html, /data-item-id="s"/, 'or the board becomes a task list');
});

test('the projects level shows only projects', () => {
  const html = render([item({ id: 'p', level: 'project' }), item({ id: 'j' })], 'projects');
  assert.match(html, /data-item-id="p"/);
  assert.doesNotMatch(html, /data-item-id="j"/);
});

test('the backlog level is the only one that reaches the parked column', () => {
  const parked = [item({ id: 'someday', horizon: 'someday' })];
  assert.doesNotMatch(render(parked, 'work'), /data-item-id="someday"/);
  assert.match(render(parked, 'backlog'), /data-item-id="someday"/);
});

test('hiding quick jobs drops standalone chores and keeps the plan', () => {
  const rows = [item({ id: 'chore', kind: 'repair' }), item({ id: 'plan', kind: 'renovation' })];
  const html = render(rows, 'work', { hideQuick: true });
  assert.doesNotMatch(html, /data-item-id="chore"/);
  assert.match(html, /data-item-id="plan"/);
});

test('titles and tooltips are escaped, so a quote in a room name cannot break the board', () => {
  const html = render([item({ title: 'Fix "the" <thing> & go' })]);
  assert.doesNotMatch(html, /<thing>/);
  assert.match(html, /&quot;the&quot;/);
  assert.match(html, /&amp; go/);
});

test('placedWithChildren orders tops first, then drops each family in beneath', () => {
  const { ctx } = build([
    item({ id: 'p', level: 'project', priority: 5 }),
    item({ id: 'c2', parent_id: 'p', priority: 30 }),
    item({ id: 'c1', parent_id: 'p', priority: 10 }),
  ]);
  const out = placedWithChildren([ctx.itemById.p], ctx);
  assert.deepEqual(out.map((p) => p._id), ['p', 'c1', 'c2']);
});

// --- Cascade ---------------------------------------------------------

test('cascade puts a full card in the start band and a strip in the ones it runs through', () => {
  const html = renderCascade([item({ id: 'x', horizon: 'now', end_horizon: 'next', summary: 'Detail here' })]);
  const cards = [...html.matchAll(/class="rm-card ([^"]*)"/g)].map((m) => m[1]);
  assert.equal(cards.length, 2, 'it appears in both bands');
  assert.ok(cards.some((c) => c.includes('rm-card--now')), 'full card in its start band');
  assert.ok(cards.some((c) => c.includes('rm-card--cont')), 'a slim strip after that');
  assert.equal((html.match(/Detail here/g) || []).length, 1,
    'the summary belongs to the start-band card only, so it reads as continuing not repeating');
});

test('cascade groups by theme inside each band, in intent order', () => {
  const html = renderCascade([
    item({ id: 'a', theme: 'cosmetic', title: 'Paint' }),
    item({ id: 'b', theme: 'make_safe', title: 'Alarms' }),
  ]);
  assert.ok(html.indexOf('Make safe') < html.indexOf('Cosmetic'),
    'make-safe outranks cosmetic, and the lanes say so');
});

test('a cascade child is marked as owned by its project', () => {
  const html = renderCascade([
    item({ id: 'p', level: 'project', title: 'Bathroom' }),
    item({ id: 'c', parent_id: 'p', title: 'Rewire' }),
  ]);
  assert.match(html, /Part of Bathroom/);
  assert.match(html, /rm-card--child/);
});

test('a cascade card carries its item id, so the drawer opens from either layout', () => {
  assert.match(renderCascade([item({ id: 'zz' })]), /data-item-id="zz"/);
});

test('a collapsed band in cascade keeps its header and drops its work', () => {
  const html = renderCascade([item({ id: 'gone', horizon: 'now' })], 'work', { hiddenBands: { now: true } });
  assert.match(html, /rmv-band--off/);
  assert.doesNotMatch(html, /data-item-id="gone"/);
});

// --- Trades roll-up --------------------------------------------------

test('the roll-up counts live work only - parked is not commitment', () => {
  const rows = [item({ id: 'a', horizon: 'now' }), item({ id: 'b', horizon: 'someday' })];
  build(rows);
  assert.deepEqual(liveWork(rows, true).map((i) => i.id), ['a']);
});

test('delivered work enters the roll-up only when it is being shown', () => {
  const rows = [item({ id: 'd', status: 'done', resolved_at: '2026-05-20T00:00:00Z' })];
  build(rows);
  assert.equal(liveWork(rows, true).length, 1);
  assert.equal(liveWork(rows, false).length, 0);
});

test('a roll-up counts an item under its OWNING trade only, or the totals lie', () => {
  const rows = [item({ id: 'a', trade: 'electrical', associated_trades: ['decorating'] })];
  const { ctx } = build(rows);
  const groups = tradeGroups(liveWork(rows, true), ctx);
  assert.deepEqual(groups.map((g) => g.key), ['electrical']);
  assert.equal(groups[0].items.length, 1);
});

test('the roll-up nests intent under trade, with counts on both', () => {
  const rows = [
    item({ id: 'a', trade: 'electrical', theme: 'make_safe' }),
    item({ id: 'b', trade: 'electrical', theme: 'cosmetic' }),
    item({ id: 'c', trade: 'electrical', theme: 'make_safe' }),
  ];
  const { data, ctx } = build(rows);
  const html = summary(data, { ctx });
  assert.match(html, /Electrical\s*<span class="rmv-sum-trade-count num">3 items<\/span>/);
  assert.match(html, /Make safe<\/span\s*><span class="rmv-sum-count num">2 items<\/span>/);
  assert.match(html, /Cosmetic<\/span\s*><span class="rmv-sum-count num">1 item<\/span>/,
    'one item, not one items');
});

test('the roll-up is counts until asked for detail, then lists the items', () => {
  const rows = [item({ id: 'a', title: 'Fit smoke alarms' })];
  const { data, ctx } = build(rows);
  assert.doesNotMatch(summary(data, { ctx }), /Fit smoke alarms/);
  const detailed = summary(data, { ctx, expanded: true });
  assert.match(detailed, /Fit smoke alarms/);
  assert.match(detailed, /data-item-id="a"/, 'and each one still opens the drawer');
});

test('a listed item keeps its band, so the roll-up never loses the timing', () => {
  const rows = [item({ id: 'a', horizon: 'next' })];
  const { data, ctx } = build(rows);
  assert.match(summary(data, { ctx, expanded: true }), /class="rmv-sum-band">Next</);
});

test('an item with no trade is counted, not silently dropped, and sorts last', () => {
  const rows = [item({ id: 'a', trade: null }), item({ id: 'b', trade: 'plumbing' })];
  const { data, ctx } = build(rows);
  const groups = tradeGroups(liveWork(rows, true), ctx);
  assert.deepEqual(groups.map((g) => g.key), ['plumbing', 'none']);
  assert.match(summary(data, { ctx }), /No trade set/);
});

test('an unknown theme lands under General rather than vanishing from the count', () => {
  const rows = [item({ id: 'a', theme: 'not_a_theme' })];
  const { data, ctx } = build(rows);
  assert.match(summary(data, { ctx }), /General<\/span\s*><span class="rmv-sum-count num">1 item</);
});

test('a project is counted once, not once per child', () => {
  const rows = [
    item({ id: 'p', level: 'project', trade: 'plumbing' }),
    item({ id: 'c', parent_id: 'p', trade: 'plumbing' }),
  ];
  const { ctx } = build(rows);
  const groups = tradeGroups(liveWork(rows, true), ctx);
  assert.equal(groups[0].items.length, 1, 'top-level rows only, or the same job counts twice');
});

test('an empty roll-up explains how work gets onto it', () => {
  const { data, ctx } = build([]);
  assert.match(summary(data, { ctx }), /No live work to summarise/);
});
