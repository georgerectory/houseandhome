// The drawer and the export. The drawer is where an unconfirmed figure
// either earns its provisional marker or quietly reads as fact, so most
// of what is asserted here is provenance discipline rather than layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { context, markRecency } from '../../assets/js/engine/roadmap-model.js';
import { drawerHtml, itemExport } from '../../assets/js/engine/roadmap-detail.js';
import { toCSV, toJSON, EXPORT_COLUMNS } from '../../assets/js/engine/roadmap-export.js';

const THEMES = [{ key: 'make_safe', label: 'Make safe', sort_order: 10 }];

const item = (o = {}) => ({
  id: o.id ?? 'a1', title: 'Fit smoke and CO alarms', kind: 'improvement',
  level: 'job', status: 'planned', horizon: 'now', priority: 3,
  room_name: 'Hallway', trade: 'electrical', theme: 'make_safe',
  associated_trades: [], tools_required: [], posture: [], weather_needs: [],
  season_window: [], ...o,
});
const build = (items) => {
  markRecency(items, Date.now());
  return context({ items, themes: THEMES });
};
const draw = (o = {}) => {
  const i = item(o);
  return drawerHtml(i, build([i]));
};

// --- Provenance ------------------------------------------------------

test('an unconfirmed estimate says so, in words, on the panel', () => {
  const html = draw({ cost_expected: 65, cost_confidence: 'drafted' });
  assert.match(html, /has not been confirmed, so it is not driving any decision yet/);
});

test('a confirmed estimate drops the warning rather than crying wolf', () => {
  const html = draw({ cost_expected: 65, cost_confidence: 'confirmed' });
  assert.doesNotMatch(html, /has not been confirmed/);
});

test('an actual figure is trusted, because it was observed', () => {
  assert.doesNotMatch(draw({ cost_expected: 65, cost_confidence: 'actual' }), /has not been confirmed/);
});

test('a carried-over figure is never presented as current', () => {
  assert.match(draw({ cost_expected: 65, cost_confidence: 'carried_over' }),
    /has not been confirmed/);
});

test('a researched figure has a source but still is not the owner\'s word', () => {
  assert.match(draw({ cost_expected: 65, cost_confidence: 'researched' }),
    /has not been confirmed/);
});

test('a drafted benefit is marked drafted, and a confirmed one confirmed', () => {
  assert.match(draw({ house_benefit: 'Stops a fire going unnoticed', benefit_status: 'drafted' }),
    /Drafted, not yet confirmed/);
  assert.match(draw({ house_benefit: 'Stops a fire going unnoticed', benefit_status: 'confirmed' }),
    /prov--confirmed/);
});

test('an item with no cost shows no money section at all, rather than a zero', () => {
  assert.doesNotMatch(draw({}), /<h3>Money<\/h3>/,
    'a missing estimate is not the same as an estimate of nothing');
});

test('the funding bar falls back to the low estimate when there is no expected one', () => {
  assert.match(draw({ cost_best: 40, cost_confidence: 'drafted' }), /<h3>Money<\/h3>/);
});

test('a zero-cost item cannot divide by zero', () => {
  const html = draw({ cost_expected: 0, allocated_balance: 0, cost_confidence: 'confirmed' });
  assert.match(html, /--pct:0\.0%/);
});

// --- The record ------------------------------------------------------

test('the drawer names where the item sits, and agrees with the board', () => {
  assert.match(draw({ horizon: 'now', end_horizon: 'later' }), /Now through Later/);
  assert.match(draw({ horizon: 'now' }), /<dd>Now<\/dd>/);
});

test('the drawer explains why the item ranks where it does', () => {
  const html = draw({
    priority: 3, priority_score: 125,
    priority_explain: { base: 125, room_weight: 5, theme_weight: 5, benefit_weight: 5, unblocks: 2, unblocks_bonus: 10 },
  });
  assert.match(html, /Why it ranks here/);
  assert.match(html, /room 5\/5 x intent 5\/5 x benefit 5\/5 = 125/);
  assert.match(html, /\+10 for unblocking 2 item\(s\)/);
});

test('an item with no computed priority simply omits the explanation', () => {
  assert.doesNotMatch(draw({}), /Why it ranks here/);
});

test('"Doing it" carries what decides whether the job can start today', () => {
  const html = draw({
    duration_min_minutes: 45, duration_max_minutes: 90, min_session_minutes: 15,
    tools_required: ['drill'], materials_ready: false, physical_demand: 'light',
    posture: ['overhead'], setting: 'indoor', mess_level: 'clean',
  });
  assert.match(html, /<h3>Doing it<\/h3>/);
  assert.match(html, /15 minutes/);
  assert.match(html, /drill/);
  assert.match(html, /<dd>No<\/dd>/, 'materials not ready is stated, not left blank');
});

test('materials_ready false is shown, but an unknown one is not invented', () => {
  assert.match(draw({ materials_ready: false }), /Materials ready/);
  assert.doesNotMatch(draw({ materials_ready: null }), /Materials ready/);
});

test('an item with nothing recorded about doing it omits the section', () => {
  assert.doesNotMatch(draw({}), /<h3>Doing it<\/h3>/);
});

test('a project lists its jobs, and both are clickable through to their own detail', () => {
  const rows = [
    item({ id: 'p', level: 'project', title: 'Bathroom' }),
    item({ id: 'c', parent_id: 'p', title: 'Rewire lights' }),
    item({ id: 's', parent_id: 'p', level: 'step', title: 'Buy the cable' }),
  ];
  const html = drawerHtml(rows[0], build(rows));
  assert.match(html, /Jobs in this project/);
  assert.match(html, /data-item-id="c"/);
  assert.match(html, /<h3>Steps<\/h3>/);
  assert.match(html, /data-item-id="s"/);
});

test('a step row is keyboard-reachable, since it is a list item acting as a button', () => {
  const rows = [item({ id: 'j' }), item({ id: 's', parent_id: 'j', title: 'A step' })];
  const html = drawerHtml(rows[0], build(rows));
  assert.match(html, /role="button" tabindex="0"/);
});

test('a step that is done is marked done', () => {
  const rows = [item({ id: 'j' }), item({ id: 's', parent_id: 'j', status: 'done' })];
  assert.match(drawerHtml(rows[0], build(rows)), /rmv-step--done/);
});

test('everything a person typed is escaped on the way out', () => {
  const html = draw({ title: '<script>alert(1)</script>', summary: 'a & b' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /a &amp; b/);
});

// --- Item export -----------------------------------------------------

test('an exported item drops blanks, so the file stays readable', () => {
  const i = item({ cost_expected: 65, summary: '', tools_required: [] });
  const out = itemExport(i, build([i]));
  assert.equal(out.title, 'Fit smoke and CO alarms');
  assert.equal(out.cost_expected, 65);
  assert.ok(!('summary' in out), 'an empty string is not a value');
  assert.ok(!('tools_required' in out), 'nor is an empty list');
});

test('an exported item carries its provenance, not just its number', () => {
  const i = item({ cost_expected: 65, cost_confidence: 'drafted' });
  const out = itemExport(i, build([i]));
  assert.equal(out.cost_confidence, 'drafted',
    'a figure that leaves the system without its confidence is a figure that will be trusted');
});

test('an exported item states its placement in words', () => {
  const i = item({ horizon: 'now', end_horizon: 'later' });
  assert.equal(itemExport(i, build([i])).board_placement, 'Now through Later');
});

test('an exported project carries its jobs and steps', () => {
  const rows = [
    item({ id: 'p', level: 'project' }),
    item({ id: 'c', parent_id: 'p', title: 'Rewire' }),
    item({ id: 's', parent_id: 'p', level: 'step', title: 'Buy cable' }),
  ];
  const out = itemExport(rows[0], build(rows));
  assert.deepEqual(out.jobs, [{ title: 'Rewire', status: 'planned' }]);
  assert.deepEqual(out.steps, [{ title: 'Buy cable', status: 'planned' }]);
});

// --- Board export ----------------------------------------------------

test('CSV writes a header and one row per item', () => {
  const csv = toCSV([item({ title: 'A' }), item({ title: 'B' })]);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0].split(',')[1], 'Title');
});

test('CSV quotes only what has to be quoted, and doubles an inner quote', () => {
  const csv = toCSV([item({ title: 'Paint, then seal' }), item({ title: 'The "good" brush' })]);
  assert.match(csv, /"Paint, then seal"/);
  assert.match(csv, /"The ""good"" brush"/);
  assert.match(csv, /Hallway,electrical/, 'a plain value stays unquoted');
});

test('CSV flattens a list rather than printing an object', () => {
  assert.match(toCSV([item({ associated_trades: ['a', 'b'] })]), /Hallway/);
  assert.doesNotMatch(toCSV([item({ room_name: null })]), /null/);
});

test('JSON export is valid and carries exactly the declared columns', () => {
  const rows = JSON.parse(toJSON([item()]));
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]), EXPORT_COLUMNS.map(([f]) => f),
    'CSV and JSON describe the same thing, or an export means two things');
});

test('a missing field exports as null rather than being dropped from the shape', () => {
  const rows = JSON.parse(toJSON([item({ cost_expected: undefined })]));
  assert.equal(rows[0].cost_expected, null);
});

test('exporting nothing is an empty file, not a crash', () => {
  assert.equal(toCSV([]).split('\n').length, 1, 'the header alone');
  assert.deepEqual(JSON.parse(toJSON([])), []);
});
