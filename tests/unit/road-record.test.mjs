// Road Ahead's record arranged for the page: every figure in its own
// unit, the variables in their groups, the decisions in force and the
// replaced, the owner's words, every change in words, the model beside
// the ledger, and today's figures against the last accepted run. Then
// the three sections drawn from the demo, and the two messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { showFigure, unitOf, variableGroups, PAGE_UNITS } from '../../assets/js/engine/road-ahead/page/figures.js';
import {
  decisionGroups, signalGroups, unreflected, changeRows, ledgerRows, sinceAccepted, movesText, judgementText,
} from '../../assets/js/engine/road-ahead/page/record.js';
import { resolve } from '../../assets/js/engine/road-ahead/page/resolve.js';
import { runAll } from '../../assets/js/engine/road-ahead/page/model.js';
import { sitDownMessage, rebaseMessage } from '../../assets/js/engine/road-ahead/page/message.js';
import { calibrationHtml } from '../../assets/js/pages/road/calibration.js';
import { decisionsHtml } from '../../assets/js/pages/road/decisions.js';
import { variablesHtml } from '../../assets/js/pages/road/variables.js';

const D = JSON.parse(readFileSync(new URL('../../data/fixtures/road-ahead.json', import.meta.url), 'utf8'));
const TODAY = D.meta.generated;

test('a figure reads in its own unit', () => {
  assert.equal(showFigure(50000, '£'), '£50,000');
  assert.equal(showFigure(122.5, '£/mo'), '£122.50 a month');
  assert.equal(showFigure(52000, '£/yr'), '£52,000 a year');
  assert.equal(showFigure(0.051, '/yr'), '5.1% a year');
  assert.equal(showFigure(0.0144, 'ratio'), '1.44%');
  assert.equal(showFigure(0.85, 'factor'), '×0.85');
  assert.equal(showFigure(1.4, '£ per £'), '£1.40 per £1');
  assert.equal(showFigure(4.5, 'x salary'), '4.5× salary');
  assert.equal(showFigure(1, 'months'), '1 month');
  assert.equal(showFigure(6, 'months'), '6 months');
  assert.equal(showFigure(45, 'minutes'), '45 minutes');
  assert.equal(showFigure(0, '0 or 1'), 'No');
  assert.equal(showFigure([2026, 10], ''), 'October 2026');
  assert.equal(showFigure({ 2026: 0.03, 2027: 0.025, 2028: 0.025, 2029: 0.025 }, 'growth by year'), '2026: 3%; 2027 to 2029: 2.5%');
  assert.equal(showFigure(450000, '£ in 2026 money'), '£450,000 in 2026 money', 'a unit of free text keeps its words');
  assert.equal(showFigure(3, ''), '3');
  assert.equal(showFigure(null, '£'), '—');
});

test('the registry\'s unit wins over the row\'s free text; the page names its own keys', () => {
  assert.equal(unitOf('income.net_pay_now', '£/mo incl. bills'), '£/mo');
  assert.equal(unitOf('rules.rent_max_months', null), 'months');
  assert.equal(unitOf('some.new_key', '£'), '£');
  assert.equal(unitOf('some.new_key', null), '');
  for (const u of Object.values(PAGE_UNITS)) assert.notEqual(showFigure(1, u), '', u);
});

test('variables sit in their groups in a reader\'s order, each with its latest change', () => {
  const vars = [
    { key: 'zeta.thing', value: 2, confidence: 'drafted' },
    { key: 'cash.start_cash', value: 20000, confidence: 'researched', low: 18000, high: 22000 },
    { key: 'timeline.start', value: [2026, 10], confidence: 'confirmed' },
    { key: 'income.net_pay_now', value: 3000, confidence: 'confirmed' },
  ];
  const changes = changeRows([
    { entity_type: 'ra_variables', code: 'cash.start_cash', field: 'value', old_value: '19000', new_value: '20000', changed_at: '2026-09-01T10:00:00Z' },
    { entity_type: 'ra_variables', code: 'cash.start_cash', field: 'value', old_value: '20000', new_value: '21000', changed_at: '2026-09-20T10:00:00Z' },
  ], vars);
  const g = variableGroups(vars, changes);
  assert.deepEqual(g.map((x) => x.name), ['Time', 'Pay', 'Cash', 'Zeta']);
  const cash = g[2].rows[0];
  assert.equal(cash.shown, '£20,000');
  assert.equal(cash.range, '£18,000 to £22,000');
  assert.equal(variableGroups([{ key: 'mortgage.rate', value: 0.05, low: 0.04, high: 0.065 }])[0].rows[0].range,
    '4% to 6.5% a year', 'a range says its unit once');
  assert.equal(cash.changed.now, '£21,000', 'the newest change is the one shown');
  assert.equal(g[2].unconfirmed, 1);
  assert.equal(g[0].unconfirmed, 0);
});

test('a replaced decision is never in force; the open ones come first', () => {
  const d = (code, firmness, is_current, topic = 'Money') => ({ code, firmness, is_current, topic, title: code });
  const g = decisionGroups([d('D-10', 'locked', true), d('D-2', 'open', true, 'Where'), d('D-1', 'locked', false),
    d('D-3', 'lean', true)]);
  assert.equal(g.total, 3);
  assert.deepEqual(g.counts, { open: 1, lean: 1, locked: 1 });
  assert.deepEqual(g.open.map((x) => x.code), ['D-2']);
  assert.deepEqual(g.topics.map((t) => [t.topic, t.rows.map((x) => x.code)]), [['Money', ['D-3', 'D-10']], ['Where', ['D-2']]],
    'topics in order, codes in natural order');
  assert.deepEqual(g.replaced.map((x) => x.code), ['D-1']);
  assert.ok(!g.topics.some((t) => t.rows.some((x) => !x.is_current)));
});

test('the owner\'s words in their kinds; what is not yet taken in, newest first', () => {
  const s = (code, kind, said_on, is_reflected = false) => ({ code, kind, said_on, is_reflected, words: code });
  const rows = [s('S-1', 'signal', '2026-09-01'), s('S-2', 'signal', '2026-09-20'), s('S-3', 'signal', null),
    s('S-4', 'signal', '2026-09-25', true), s('R1-1', 'reaction', '2026-09-02'), s('PT-1', 'pattern', null)];
  assert.deepEqual(unreflected(rows).map((x) => x.code), ['S-2', 'S-1', 'S-3'], 'newest first, undated last, taken-in left out');
  assert.deepEqual(signalGroups(rows).map((g) => [g.kind, g.rows.length, g.waiting]),
    [['signal', 4, 3], ['pattern', 1, 1], ['reaction', 1, 1]]);
});

test('every change reads in words, on its London day', () => {
  const vars = [{ key: 'income.net_pay_now', value: 3100 }];
  const rows = changeRows([
    { entity_type: 'ra_variables', code: 'income.net_pay_now', field: 'value', old_value: '3000', new_value: '3100',
      changed_at: '2026-09-30T23:30:00+00:00' },
    { entity_type: 'ra_listings', code: 'L01', field: 'guide_price', old_value: '250000', new_value: '260000',
      changed_at: '2026-09-02T10:00:00+00:00' },
    { entity_type: 'ra_scenarios', code: 'promotion', field: 'overrides', old_value: '{"income.pay_rise_2027": 5000}',
      new_value: '{"income.pay_rise_2027": 6000}', changed_at: '2026-09-03T10:00:00+00:00' },
    { entity_type: 'ra_variables', code: 'income.net_pay_now', field: 'confidence', old_value: 'drafted', new_value: 'confirmed',
      changed_at: '2026-09-01T10:00:00+00:00' },
  ], vars);
  assert.deepEqual(rows.map((r) => r.code), ['income.net_pay_now', 'promotion', 'L01', 'income.net_pay_now'], 'newest first');
  assert.equal(rows[0].was, '£3,000 a month');
  assert.equal(rows[0].now, '£3,100 a month');
  assert.equal(rows[0].on, '2026-10-01', 'half past midnight in London is the next day');
  assert.equal(rows[1].now, 'income.pay_rise_2027 £6,000 a year');
  assert.equal(rows[2].was, '£250,000');
  assert.equal(rows[3].was, 'Drafted, not yet confirmed');
  assert.equal(rows[3].now, 'Confirmed');
  assert.equal(rows[3].what, 'Trust');
});

test('the model beside the ledger, and the £1k that makes a gap matter', () => {
  const rows = ledgerRows([
    { measure: 'cash', model_value: 20000, ledger_value: 18800 },
    { measure: 'net pay per month', model_value: 3000, ledger_value: 3000 },
    { measure: 'cash', model_value: 20000, ledger_value: null },
  ]);
  assert.deepEqual(rows.map((r) => [r.label, r.gap, r.differs]),
    [['Cash', 1200, true], ['Take-home pay a month', 0, false], ['Cash', null, false]]);
  assert.equal(rows[0].key, 'cash.start_cash');
});

test('today against the last accepted run: a move of £1k or more is named', () => {
  const live = [{ road: { code: 'H1', name: 'One' }, head: { forever_today: 410500, min_cash: -900 } },
    { road: { code: 'H2', name: 'Two' }, head: { forever_today: 300000, min_cash: 1000 } }];
  const runs = [{ scenario_key: 'base', road_code: 'H1', run_name: 'main', summary: { forever_today: 409000, min_cash: -1000 } },
    { scenario_key: 'promotion', road_code: 'H2', run_name: 'main', summary: { forever_today: 1, min_cash: 1 } }];
  const [h1, h2] = sinceAccepted(runs, live, 'base');
  assert.equal(h1.moved, true);
  assert.deepEqual(h1.fields.map((f) => f.moved), [true, false]);
  assert.equal(h2.run, null, 'another scenario\'s run is not this one\'s baseline');
  assert.equal(h2.moved, false);
});

test('what an input moves, and a judgement, in words', () => {
  assert.equal(movesText(['H10 forever budget', 'H2 forever budget', 'GE forever budget']),
    'the forever budget of GE, H2 and H10');
  assert.equal(movesText(['H1 forever budget', 'L03 walk-away']),
    'the forever budget of H1, and the walk-away of L03,', 'with two kinds, a comma closes the clause');
  assert.equal(judgementText({ field: 'premium', value: 8000 }), '£8,000 above the maths');
  assert.equal(judgementText({ field: 'walk_away', value: '262000' }), 'walk away at £262,000');
});

test('the demo tells one story: the pay rose after the runs were accepted, and Calibration shows it', () => {
  const base = resolve(D, 'base');
  const since = sinceAccepted(D.runs, runAll(base), 'base');
  assert.equal(since.length, D.roads.length);
  assert.ok(since.every((r) => r.run), 'every road has an accepted run');
  assert.ok(since.some((r) => r.moved), 'the pay rise moved at least one road by £1k or more');
  assert.ok(D.changes.some((c) => c.code === 'income.net_pay_now' && c.field === 'value'), 'and the change that did it is logged');
  assert.deepEqual(D.revisit.map((r) => r.listing_code), ['L01'], 'the old judgement is due again');
  assert.equal(D.calibrate.length, 8);
  assert.deepEqual(D.calibrate.map((c) => c.place), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('the three sections draw from the demo, and say what they hold', () => {
  const since = sinceAccepted(D.runs, runAll(resolve(D, 'base')), 'base');
  const cal = calibrationHtml(D, since, TODAY);
  assert.match(cal, /data-sitdown/);
  assert.match(cal, /data-rebase/, 'the demo cash gap offers a re-base');
  assert.match(cal, /demo-cash/);
  assert.match(cal, /Swings the forever budget of [A-Z0-9, ]+ and H\d by up to <strong>£\d+k<\/strong>\./);
  assert.match(cal, /Since the last accepted run/);
  const dec = decisionsHtml(D, TODAY);
  assert.match(dec, /7 decisions in force: 2 open, 2 leaning, 3 locked/);
  assert.match(dec, /Replaced by D-01/);
  assert.match(dec, /Not yet taken in/);
  const vars = variablesHtml(D, TODAY);
  assert.match(vars, /data-group="income"/);
  assert.match(vars, /The take-home pay was confirmed higher than first thought/);
  // Owner text goes in as text, never markup.
  const hostile = { ...D, signals: [{ ...D.signals[0], words: '<img src=x onerror=alert(1)>' }] };
  assert.doesNotMatch(decisionsHtml(hostile, TODAY), /<img/);
});

test('the messages that start a sit-down and a re-base', () => {
  const s = sitDownMessage();
  assert.match(s, /road_ahead_agenda/);
  assert.match(s, /Lock nothing without my confirmation/);
  const r = rebaseMessage({ start: [2026, 10], model: 20000, ledger: 18800, asOf: '2026-09-15', thisMonth: [2026, 11] });
  assert.match(r, /starts in 2026-10 with £20,000 in cash; my confirmed accounts say £18,800 on 2026-09-15/);
  assert.match(r, /timeline\.start to 2026-11/);
  assert.match(r, /Accept the new runs only when I say so/);
});
