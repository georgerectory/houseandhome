// The placement and ordering rules the whole board rests on. These are
// the assertions that catch a bar drawn in the wrong band, a family that
// scatters, or a trade filter that quietly loses associated work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, ACTIVE_MAX, PARKED, RECENT_DAYS, LEVELS, LAYOUTS,
  markRecency, colStart, colEnd, isParked, isActive, bandVisible,
  topLevel, barKids, stepsOf, workList, isQuickJob, inTrade, byTrade,
  byRoom, bySearch, byOrder, childOrder, timelineOrder, context,
  themeLabel, bandLabel, endBandLabel, progressOf, childStats, groupBy,
} from '../../assets/js/engine/roadmap-model.js';

const item = (o = {}) => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  title: 'Item', kind: 'renovation', level: 'job', status: 'planned',
  horizon: 'later', priority: 10, room_name: 'Kitchen', trade: 'decorating',
  theme: 'cosmetic', associated_trades: [], ...o,
});

const THEMES = [
  { key: 'make_safe', label: 'Make safe', sort_order: 10 },
  { key: 'cosmetic', label: 'Cosmetic', sort_order: 90 },
];
const ctxOf = (items) => context({ items, themes: THEMES });

// --- Placement -------------------------------------------------------

test('the six bands are the axis, and the constants agree with them', () => {
  assert.deepEqual(BANDS.map((b) => b.key),
    ['previously', 'recently', 'now', 'next', 'later', 'parked']);
  assert.equal(BANDS[PARKED].key, 'parked');
  assert.equal(BANDS[ACTIVE_MAX].key, 'later');
});

test('placement comes from the item\'s own fields, so moving work is a data edit', () => {
  assert.equal(colStart(item({ horizon: 'now' })), 2);
  assert.equal(colStart(item({ horizon: 'next' })), 3);
  assert.equal(colStart(item({ horizon: 'later' })), 4);
  assert.equal(colStart(item({ horizon: 'someday' })), PARKED);
  assert.equal(colStart(item({ status: 'dropped', horizon: 'now' })), PARKED);
});

test('a bar spans from its horizon to its end horizon', () => {
  const i = item({ horizon: 'now', end_horizon: 'later' });
  assert.equal(colStart(i), 2);
  assert.equal(colEnd(i), 4);
});

test('an end horizon EARLIER than the start never draws backwards', () => {
  const i = item({ horizon: 'later', end_horizon: 'now' });
  assert.equal(colEnd(i), colStart(i), 'a reversed span collapses to its start band');
});

test('done work splits by recency, so it neither vanishes nor piles up', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const fresh = item({ status: 'done', resolved_at: '2026-05-20T00:00:00Z' });
  const old = item({ status: 'done', resolved_at: '2025-01-01T00:00:00Z' });
  markRecency([fresh, old], now);
  assert.equal(colStart(fresh), 1, 'inside the window it reads as recently done');
  assert.equal(colStart(old), 0, 'outside it, as history');
});

test('the recency cutoff is exactly RECENT_DAYS, not approximately', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const onCutoff = item({ status: 'done', resolved_at: new Date(now - RECENT_DAYS * 864e5).toISOString() });
  const justOutside = item({ status: 'done', resolved_at: new Date(now - (RECENT_DAYS * 864e5) - 1).toISOString() });
  markRecency([onCutoff, justOutside], now);
  assert.equal(colStart(onCutoff), 1);
  assert.equal(colStart(justOutside), 0);
});

test('a done item with no resolved_at falls back to updated_at', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const i = item({ status: 'done', updated_at: '2026-05-25T00:00:00Z' });
  markRecency([i], now);
  assert.equal(colStart(i), 1);
});

test('a done item with no date at all is history rather than a crash', () => {
  const i = item({ status: 'done' });
  markRecency([i], Date.now());
  assert.equal(colStart(i), 0);
});

test('parked and active are mutually exclusive readings of the same axis', () => {
  assert.ok(isParked(item({ horizon: 'someday' })));
  assert.ok(!isActive(item({ horizon: 'someday' })));
  assert.ok(isActive(item({ horizon: 'now' })));
});

// --- Band collapse ---------------------------------------------------

test('an item belongs to its START band, so collapsing drops what begins there', () => {
  const spanning = item({ horizon: 'now', end_horizon: 'later' });
  assert.equal(bandVisible(spanning, { now: true }), false,
    'a now-to-later span leaves with Now');
  assert.equal(bandVisible(spanning, { later: true }), true,
    'and stays when only its end band is collapsed');
});

test('no hidden map means everything is visible', () => {
  assert.ok(bandVisible(item(), null));
  assert.ok(bandVisible(item(), {}));
});

// --- Membership ------------------------------------------------------

test('only top-level non-step rows become bars', () => {
  const rows = [
    item({ id: 'p', level: 'project' }),
    item({ id: 'c', parent_id: 'p' }),
    item({ id: 's', level: 'step' }),
  ];
  assert.deepEqual(topLevel(rows).map((i) => i.id), ['p']);
});

test('a project\'s non-step children draw as bars; a plain job\'s children never do', () => {
  const project = item({ id: 'p', level: 'project' });
  const job = item({ id: 'j' });
  const rows = [project, job,
    item({ id: 'c1', parent_id: 'p' }),
    item({ id: 'c2', parent_id: 'p', level: 'step' }),
    item({ id: 'c3', parent_id: 'j' })];
  const ctx = ctxOf(rows);
  assert.deepEqual(barKids(project, ctx).map((i) => i.id), ['c1']);
  assert.deepEqual(barKids(job, ctx), [], 'children of a job are steps by position');
});

test('steps are drawer-only detail, split correctly by parent level', () => {
  const project = item({ id: 'p', level: 'project' });
  const job = item({ id: 'j' });
  const rows = [project, job,
    item({ id: 'c1', parent_id: 'p' }),
    item({ id: 'c2', parent_id: 'p', level: 'step' }),
    item({ id: 'c3', parent_id: 'j' })];
  const ctx = ctxOf(rows);
  assert.deepEqual(stepsOf(project, ctx).map((i) => i.id), ['c2'],
    'a project\'s steps are its step-level children only');
  assert.deepEqual(stepsOf(job, ctx).map((i) => i.id), ['c3'],
    'a job\'s steps are every child it has');
});

test('the work list is done or active - parked work waits in the backlog', () => {
  const rows = [
    item({ id: 'a', horizon: 'now' }),
    item({ id: 'b', horizon: 'someday' }),
    item({ id: 'c', status: 'done' }),
  ];
  markRecency(rows, Date.now());
  assert.deepEqual(workList(rows).map((i) => i.id).sort(), ['a', 'c']);
});

test('a quick job is standalone and maintenance-flavoured, never a project or a child', () => {
  assert.ok(isQuickJob(item({ kind: 'repair' })));
  assert.ok(isQuickJob(item({ kind: 'cleaning' })));
  assert.ok(!isQuickJob(item({ kind: 'repair', parent_id: 'p' })), 'a child is part of a plan');
  assert.ok(!isQuickJob(item({ kind: 'repair', level: 'project' })));
  assert.ok(!isQuickJob(item({ kind: 'renovation' })));
});

// --- Filtering -------------------------------------------------------

test('a trade matches the owner OR an association, so a view sees what it touches', () => {
  const rewire = item({ trade: 'electrical', associated_trades: ['decorating'] });
  assert.ok(inTrade(rewire, 'electrical'));
  assert.ok(inTrade(rewire, 'decorating'), 'a decorating view still sees the rewire it follows');
  assert.ok(!inTrade(rewire, 'plumbing'));
});

test('a trade filter keeps families intact rather than orphaning children', () => {
  const rows = [
    item({ id: 'p', level: 'project', trade: 'plumbing' }),
    item({ id: 'c1', parent_id: 'p', trade: 'decorating' }),
    item({ id: 'other', level: 'project', trade: 'decorating' }),
    item({ id: 'c2', parent_id: 'other', trade: 'roofing' }),
  ];
  const direct = byTrade(rows, 'plumbing').map((i) => i.id).sort();
  assert.deepEqual(direct, ['c1', 'p'],
    'a project matched directly keeps its whole family');
  const viaChild = byTrade(rows, 'roofing').map((i) => i.id).sort();
  assert.deepEqual(viaChild, ['c2', 'other'],
    'a project kept only through a child keeps the matching child and itself');
});

test('a project kept through one child does not drag its other children in', () => {
  const rows = [
    item({ id: 'p', level: 'project', trade: 'plumbing' }),
    item({ id: 'hit', parent_id: 'p', trade: 'roofing' }),
    item({ id: 'miss', parent_id: 'p', trade: 'glazing' }),
  ];
  assert.deepEqual(byTrade(rows, 'roofing').map((i) => i.id).sort(), ['hit', 'p']);
});

test('an empty filter returns the data untouched rather than an empty board', () => {
  const rows = [item(), item()];
  assert.equal(byTrade(rows, ''), rows);
  assert.equal(byRoom(rows, ''), rows);
  assert.equal(bySearch(rows, '   '), rows);
});

test('search reaches title, summary, room, trade and tools', () => {
  const rows = [
    item({ id: 'a', title: 'Re-grout the shower' }),
    item({ id: 'b', title: 'Paint', summary: 'second coat of eggshell' }),
    item({ id: 'c', title: 'Hang shelf', tools_required: ['drill', 'level'] }),
    item({ id: 'd', title: 'Nothing', room_name: 'Pantry' }),
  ];
  assert.deepEqual(bySearch(rows, 'grout').map((i) => i.id), ['a']);
  assert.deepEqual(bySearch(rows, 'eggshell').map((i) => i.id), ['b']);
  assert.deepEqual(bySearch(rows, 'drill').map((i) => i.id), ['c']);
  assert.deepEqual(bySearch(rows, 'pantry').map((i) => i.id), ['d'], 'search is case-insensitive');
});

test('a room filter is a plain match, because rooms nest nothing', () => {
  const rows = [item({ id: 'a', room_name: 'Bathroom' }), item({ id: 'b', room_name: 'Kitchen' })];
  assert.deepEqual(byRoom(rows, 'Bathroom').map((i) => i.id), ['a']);
});

// --- Ordering --------------------------------------------------------

test('quick jobs sink below considered work whatever their priority', () => {
  const chore = item({ id: 'chore', kind: 'repair', priority: 1 });
  const plan = item({ id: 'plan', kind: 'renovation', priority: 50 });
  assert.deepEqual([chore, plan].sort(byOrder).map((i) => i.id), ['plan', 'chore']);
});

test('at equal priority a project leads its peers', () => {
  const project = item({ id: 'p', level: 'project', priority: 10 });
  const job = item({ id: 'j', priority: 10 });
  assert.deepEqual([job, project].sort(byOrder).map((i) => i.id), ['p', 'j']);
});

test('a missing priority sorts last rather than first', () => {
  const none = item({ id: 'none', priority: undefined });
  const some = item({ id: 'some', priority: 900 });
  assert.deepEqual([none, some].sort(byOrder).map((i) => i.id), ['some', 'none']);
});

test('children stack by stage: start band, then the shorter run above', () => {
  const long = item({ id: 'long', horizon: 'now', end_horizon: 'later' });
  const short = item({ id: 'short', horizon: 'now' });
  const later = item({ id: 'later', horizon: 'later' });
  assert.deepEqual([later, long, short].sort(childOrder).map((i) => i.id),
    ['short', 'long', 'later']);
});

test('board order puts the earlier band first, then the shorter span', () => {
  const placed = (o) => ({ _s: 2, _e: 2, _quick: 0, _pri: 10, _project: false, _themeSo: 10, _so: 100, ...o });
  const rows = [
    placed({ id: 'spans', _e: 4 }),
    placed({ id: 'here' }),
    placed({ id: 'next', _s: 3, _e: 3 }),
  ];
  assert.deepEqual(rows.sort(timelineOrder).map((i) => i.id), ['here', 'spans', 'next']);
});

test('board order sinks quick jobs within their band, before priority is read', () => {
  const placed = (o) => ({ _s: 2, _e: 2, _quick: 0, _pri: 10, _project: false, _themeSo: 10, _so: 100, ...o });
  const rows = [placed({ id: 'chore', _quick: 1, _pri: 1 }), placed({ id: 'plan', _pri: 99 })];
  assert.deepEqual(rows.sort(timelineOrder).map((i) => i.id), ['plan', 'chore']);
});

// --- Context ---------------------------------------------------------

test('context indexes children under their parent, pre-sorted in board order', () => {
  const rows = [
    item({ id: 'p', level: 'project' }),
    item({ id: 'b', parent_id: 'p', priority: 20 }),
    item({ id: 'a', parent_id: 'p', priority: 5 }),
  ];
  const ctx = ctxOf(rows);
  assert.deepEqual(ctx.childrenByParent.p.map((i) => i.id), ['a', 'b']);
  assert.equal(ctx.itemById.p.id, 'p');
});

test('context sorts themes by sort_order, so lanes read in intent order', () => {
  const ctx = context({ items: [], themes: [...THEMES].reverse() });
  assert.deepEqual(ctx.themeSorted.map((t) => t.key), ['make_safe', 'cosmetic']);
});

test('context survives an empty dataset, which is the launch condition', () => {
  const ctx = context({});
  assert.deepEqual(ctx.childrenByParent, {});
  assert.deepEqual(ctx.itemById, {});
  assert.deepEqual(ctx.themeSorted, []);
});

test('an unknown theme reads as General rather than breaking the lane', () => {
  const ctx = ctxOf([]);
  assert.equal(themeLabel(item({ theme: 'make_safe' }), ctx), 'Make safe');
  assert.equal(themeLabel(item({ theme: 'not_a_theme' }), ctx), 'General');
});

test('band labels name the placement the drawer has to agree with', () => {
  const i = item({ horizon: 'now', end_horizon: 'later' });
  assert.equal(bandLabel(i), 'Now');
  assert.equal(endBandLabel(i), 'Later');
});

// --- Progress --------------------------------------------------------

test('progress snaps to checkpoints, because it is a signal not a metric', () => {
  assert.deepEqual(progressOf(item({ progress: 0 })), { pct: 0, bucket: 0, label: 'Not started' });
  assert.equal(progressOf(item({ progress: 30 })).bucket, 25);
  assert.equal(progressOf(item({ progress: 60 })).bucket, 50);
  assert.equal(progressOf(item({ progress: 88 })).bucket, 90);
});

test('a done item reads 100 whatever its stored progress says', () => {
  assert.deepEqual(progressOf(item({ status: 'done', progress: 10 })),
    { pct: 100, bucket: 100, label: 'Complete' });
});

test('progress clamps rather than trusting a bad number', () => {
  assert.equal(progressOf(item({ progress: 500 })).pct, 100);
  assert.equal(progressOf(item({ progress: -20 })).pct, 0);
  assert.equal(progressOf(item({ progress: null })).pct, 0);
  assert.equal(progressOf(item({ progress: 'nonsense' })).pct, 0);
});

test('child stats count what is done against the total', () => {
  const rows = [
    item({ id: 'p', level: 'project' }),
    item({ id: 'a', parent_id: 'p', status: 'done' }),
    item({ id: 'b', parent_id: 'p' }),
  ];
  assert.deepEqual(childStats(rows[0], ctxOf(rows)), { total: 2, done: 1 });
});

test('groupBy files a missing value under none rather than dropping the row', () => {
  const out = groupBy([item({ id: 'a', trade: 'plumbing' }), item({ id: 'b', trade: null })],
    (i) => i.trade);
  assert.deepEqual(Object.keys(out).sort(), ['none', 'plumbing']);
});

// --- The declared surface --------------------------------------------

test('every level and layout the page offers has a key and a label', () => {
  for (const set of [LEVELS, LAYOUTS]) {
    for (const o of set) {
      assert.ok(o.key && o.label, `${JSON.stringify(o)} must be selectable and nameable`);
    }
  }
  assert.deepEqual(LEVELS.map((l) => l.key), ['projects', 'trades', 'work', 'backlog']);
});
