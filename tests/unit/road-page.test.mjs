// The Road Ahead page's pure half: state in the URL, what-ifs resolved
// into engine inputs, the register's rows, and the messages for Claude.
// The data is the invented demo fixture; the roads in it are the golden
// master's, so the page's what-ifs can be held to the kit's own Python.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readState, writeState, control, dayName, CONTROLS, FILTERS } from '../../assets/js/engine/road-ahead/page/state.js';
import {
  resolve, currentValues, withStageWhatIfs, keysMonth, depositsOf, defaultScenario,
} from '../../assets/js/engine/road-ahead/page/resolve.js';
import {
  runAll, compare, listingInputs, currentJudgement, registerRows, ruleChecks, sortRows, movedSince,
} from '../../assets/js/engine/road-ahead/page/model.js';
import { scenarioMessage, judgementMessage, assessMessage } from '../../assets/js/engine/road-ahead/page/message.js';
import { assessHtml } from '../../assets/js/pages/road/assess.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const D = read('../../data/fixtures/road-ahead.json');
const G = read('../fixtures/road-ahead-golden.json');
const FROM = { GE: 'SG1', H1: 'SH1', H2: 'SH2', H3: 'SH3', H4: 'SX' };

// While works wait at the cash buffer, the balance sits there for
// months; which of those tied months Python calls the lowest is decided
// by its last bit of pow. Accept a different month only in that case.
function sameRun(got, want, label) {
  const g = structuredClone(got);
  if (g.min_cash_when !== want.min_cash_when) {
    const cashIn = (m) => g.trace.find(([when]) => when === m)?.[1];
    const lowest = Math.min(...g.trace.map(([, c]) => c));
    if (cashIn(g.min_cash_when) === lowest && cashIn(want.min_cash_when) === lowest) g.min_cash_when = want.min_cash_when;
  }
  if (!('trace' in want)) delete g.trace;
  assert.deepEqual(JSON.parse(JSON.stringify(g)), JSON.parse(JSON.stringify(want)), label);
}

// Each case: a page state, and the golden run it must reproduce.
const CASES = [
  { scenario: 'base', values: {}, variant: 'base', help: 'help', wf: null },
  { scenario: 'base', values: { rise: 8000 }, variant: 'promotion', help: 'help', wf: null },
  { scenario: 'base', values: { rise: -1500 }, variant: 'job_change', help: 'help', wf: null },
  { scenario: 'base', values: { bridge: [2027, 4] }, variant: 'family_longer', help: 'help', wf: null },
  { scenario: 'base', values: { child_from: [2099, 1] }, variant: 'no_child', help: 'help', wf: null },
  { scenario: 'no_help', values: {}, variant: 'base', help: 'none', wf: null },
  { scenario: 'optimistic', values: { works: 0.8, child_cost: 215 }, variant: 'optimistic', help: 'help', wf: 0.8 },
  { scenario: 'highly_optimistic', values: { works: 0.7, child_cost: 215 }, variant: 'optimistic', help: 'help', wf: 0.7 },
];

test('the page\'s what-ifs reproduce the kit\'s own scenarios, month by month', () => {
  for (const c of CASES) {
    const runs = runAll(resolve(D, c.scenario, c.values));
    assert.equal(runs.length, 5);
    for (const { road, result } of runs) {
      const want = G.roads.find((x) => x.road === FROM[road.code] && x.help === c.help && x.variant === c.variant
        && (x.works_factor ?? null) === c.wf && x.near === road.near);
      assert.ok(want, `a golden run for ${road.code} ${c.variant}`);
      sameRun(result, want.result, `${road.code} under ${c.scenario} ${JSON.stringify(c.values)}`);
    }
  }
});

test('a what-if on the family stay moves its derived last month, as a scenario does', () => {
  const ctx = resolve(D, 'base', { bridge: [2027, 4] });
  assert.deepEqual(ctx.P['timeline.family_until'], [2027, 3]);
  assert.deepEqual(resolve(D, 'family_longer').P['timeline.family_until'], [2027, 1]);
});

test('the works share moves a scenario\'s factor, or the register\'s alone under base', () => {
  const opt = resolve(D, 'optimistic', { works: 0.7 });
  assert.equal(opt.scenario.works_factor, 0.7);
  assert.equal(opt.V.works_factor, 0.7);
  const base = resolve(D, 'base', { works: 0.7 });
  assert.equal(base.scenario.works_factor, null, 'the roads still price the works in full');
  assert.equal(base.V.works_factor, 0.7);
  assert.equal(resolve(D, 'no_help').V.help_near_cost, 1, 'no local help prices listings at trade rates');
});

test('keys and deposits act on every road\'s steps and keep each road\'s gaps', () => {
  const keys = keysMonth(D.roads);
  assert.deepEqual(keys, [2027, 5]);
  const moved = withStageWhatIfs(D.roads, { keys: [2027, 8], dep1: 0.15, dep2: 0.2 });
  for (const [i, r] of moved.entries()) {
    const was = D.roads[i];
    r.stages.forEach((s, j) => {
      if (s.kind === 'rent') assert.deepEqual(s.at, was.stages[j].at);
      else assert.equal((s.at[0] - was.stages[j].at[0]) * 12 + s.at[1] - was.stages[j].at[1], 3);
      if (s.kind === 'buy') assert.equal(s.dep, 0.15);
      if (s.kind === 'forever') assert.equal(s.dep, 0.2);
    });
  }
  assert.deepEqual(depositsOf(D.roads, 'forever'), { common: 0.1, min: 0.05, max: 0.1 });
  assert.equal(D.roads[0].stages[1].dep, 0.05, 'the stored roads are untouched');
});

test('the URL holds only what differs, and reads back to the same state', () => {
  const known = { scenarios: D.scenarios.map((s) => s.key), listings: D.register.map((r) => r.code), fallback: defaultScenario(D.scenarios) };
  const current = currentValues(D, 'optimistic');
  const state = { scenario: 'optimistic', values: { child_cost: 250, keys: [2027, 7], works: current.works },
    listing: 'L03', filter: 'auctions', sort: 'profit_opt', dir: 'desc' };
  const q = writeState(state, { fallback: known.fallback, current });
  assert.equal(q, '?s=optimistic&keys=2027-07&child_cost=250&l=L03&f=auctions&sort=profit_opt&dir=desc');
  const back = readState(q, known);
  assert.deepEqual(back, { ...state, values: { child_cost: 250, keys: [2027, 7] } });
  assert.equal(writeState(readState('', known), { fallback: known.fallback, current: {} }), '');
  const junk = readState('?s=nope&child_cost=abc&keys=2027-13&beds=2.5&l=X99&f=odd&sort=zzz', known);
  assert.deepEqual(junk, { scenario: 'base', values: {}, listing: null, filter: FILTERS[0].key, sort: null, dir: 'asc' });
  assert.equal(CONTROLS.length, new Set(CONTROLS.map((c) => c.id)).size, 'control ids are unique');
});

test('a date reads as a person says it, the year only when it is not this one', () => {
  assert.equal(dayName('2026-10-21'), 'Wed 21 Oct 2026');
  assert.equal(dayName('2026-10-21', 2026), 'Wed 21 Oct');
  assert.equal(dayName('2027-02-28T00:00:00Z', 2026), 'Sun 28 Feb 2027');
  assert.equal(dayName('2028-02-29', 2028), 'Tue 29 Feb');
  assert.deepEqual([dayName(null), dayName(''), dayName('soon')], ['—', '—', '—']);
});

test('a listing\'s inputs are ra_listing_inputs(): own facts first, the appraisal over them, nulls dropped', () => {
  const row = {
    minutes_from_home: 40, fee: 1200, fee_pct: 0, inputs: { likely_buy: 300000, fin_lo: 1, fin_hi: 2, works: 3, fee: null, mins: 25 },
    fits: [['H1', 2]], override_grade: null,
    judgements: [{ field: 'premium', value: 5000, reason: 'r1', kind: 'emotional', said_on: '2026-09-01' },
      { field: 'walk_away', value: 350000, reason: 'r2', kind: 'personal', said_on: '2026-09-20' },
      { field: 'fit', value: 3, reason: 'r3', kind: 'strategic', said_on: '2026-09-25' }],
  };
  assert.deepEqual(listingInputs(row), {
    mins: 25, pct: 0, likely_buy: 300000, fin_lo: 1, fin_hi: 2, works: 3, fits: [['H1', 2]],
    judgement: { walk_away: 350000, reason: 'r2', kind: 'personal' },
  });
  assert.equal(listingInputs({ ...row, inputs: null }), null);
  assert.equal(listingInputs({ ...row, inputs: { works: 1 } }), null, 'no figures, no assessment');
  const tie = [{ field: 'premium', value: 1, reason: 'a', kind: 'emotional', said_on: '2026-09-20' },
    { field: 'walk_away', value: 2, reason: 'b', kind: 'emotional', said_on: '2026-09-20' }];
  assert.deepEqual(currentJudgement(tie), { walk_away: 2, reason: 'b', kind: 'emotional' });
  assert.equal(currentJudgement(null), null);
});

test('the register under the demo\'s own figures has moved nowhere; a what-if says what moved', () => {
  const rows = registerRows(D.register, resolve(D, 'base'), D.rules);
  assert.equal(rows.length, D.register.length);
  for (const x of rows) assert.deepEqual(x.moved, [], x.row.code);
  const fav = rows.find((x) => x.row.code === 'L03');
  assert.equal(fav.now.judgement.difference, 8000, 'the owner\'s premium sits beside the maths');
  assert.equal(rows.find((x) => x.row.code === 'G01').now, null, 'a benchmark without figures is shown, not scored');

  const base = resolve(D, 'base');
  const harder = registerRows(D.register, resolve(D, 'base', { target: 60000 }), D.rules, base);
  const l02 = harder.find((x) => x.row.code === 'L02');
  assert.ok(l02.moved.some((m) => m.field === 'walk_away_opt' && m.now < m.was), 'a higher target lowers the walk-away');
  assert.ok(harder.every((x) => x.drift.length === 0), 'a what-if is not drift: the model itself has not changed');
  // A variable corrected since the appraisal is drift, under any scenario in view.
  const corrected = { ...D, variables: D.variables.map((v) => (v.key === 'appraisal.target_profit' ? { ...v, value: 60000 } : v)) };
  const drifted = registerRows(corrected.register, resolve(corrected, 'optimistic'), corrected.rules, resolve(corrected, 'base'));
  assert.ok(drifted.find((x) => x.row.code === 'L02').drift.some((m) => m.field === 'walk_away_opt'), 'a changed variable is drift');
  assert.deepEqual(movedSince({ profit_opt: 1500, grade: 'Strong' }, { profit_opt: 1000, grade: 'Strong' }), []);
});

test('rules a listing\'s facts can answer are checked; the rest are only shown', () => {
  const P = resolve(D, 'base').P;
  const one = ruleChecks({ beds: 1, minutes_from_home: 20 }, P, D.rules);
  assert.deepEqual(one.map((r) => [r.code, r.pass]), [['RV-2', true], ['RV-3', false]]);
  assert.equal(ruleChecks({ beds: null, minutes_from_home: 200 }, P, D.rules).find((r) => r.code === 'RV-3').pass, null);
  assert.equal(ruleChecks({ beds: 4, minutes_from_home: 200 }, resolve(D, 'base', { minutes: 240 }).P, D.rules)[0].pass, true);
});

test('the register sorts by auction then verdict, and any column either way with blanks last', () => {
  const rows = registerRows(D.register, resolve(D, 'base'), D.rules);
  const def = sortRows(rows).map((x) => x.row.code);
  assert.deepEqual(def.slice(0, 5), ['L10', 'L01', 'L02', 'L03', 'L05'], 'soonest auction, then better verdict, then code');
  const desc = sortRows(rows, 'profit_opt', 'desc').map((x) => x.row.code);
  assert.equal(desc[0], 'L03');
  assert.deepEqual(desc.slice(-2), ['G01', 'G02'], 'no figures, last either way');
  assert.deepEqual(sortRows(rows, 'profit_opt', 'asc').map((x) => x.row.code).slice(-2), ['G01', 'G02']);
});

test('compare runs the headline scenarios with the what-ifs on each', () => {
  const c = compare(D, { rise: 8000 });
  assert.deepEqual(c.map((x) => x.key), ['base', 'optimistic', 'promotion', 'job_change']);
  const base = c[0].heads.get('H1').forever_today;
  const alone = runAll(resolve(D, 'base', { rise: 8000 })).find((x) => x.road.code === 'H1').head.forever_today;
  assert.equal(base, alone);
});

test('messages for Claude say what changed and ask for the owner\'s reason', () => {
  const m = scenarioMessage({ key: 'base', name: 'Base' },
    [{ control: control('child_cost'), was: 430, now: 300 }, { control: control('keys'), was: [2027, 5], now: [2027, 7] }],
    'https://example.org/road.html?child_cost=300');
  assert.match(m, /Start from: Base \(base\)/);
  assert.match(m, /- Child costs a month \(costs\.family_cost\): £300, was £430/);
  assert.match(m, /- Keys to the first purchase \(keys\): July 2027, was May 2027/);
  assert.match(m, /nothing has been saved yet/);
  const j = judgementMessage({ code: 'L03', name: 'The Old Forge' }, { walk_away_opt: 400000, bid_limit: 360000 });
  assert.match(j, /walk away at £400,000, with a bid limit of £360,000/);
  assert.match(j, /because ____/);
  const a = assessMessage('  3-bed detached, guide £250,000  ');
  assert.match(a, /docs\/road-ahead\/ASSESS_PROPERTY\.md/);
  assert.match(a, /as I pasted it:\n3-bed detached, guide £250,000\n/);
  assert.match(assessMessage(''), /\[paste the listing's text here\]/);
});

test('Assess shows the latest answers in the protocol\'s format, with labels and the mortgage check', () => {
  const ctx = resolve(D, 'base');
  const html = assessHtml(registerRows(D.register, ctx, D.rules), D, ctx);
  assert.ok(!/NaN|undefined|Infinity|\[object Object\]/.test(html), 'no NaN, undefined or Infinity in the markup');
  const shown = [...html.matchAll(/class="rd-answer__title" id="rd-answer-(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(shown, ['L02', 'L03', 'L05'], 'the three appraised last, newest first then by code');
  assert.match(html, /Strong for H3: optimal/);
  assert.match(html, /rd-label--verified">verified/);
  assert.match(html, /within the mortgage in principle/);
  assert.match(html, /over the mortgage in principle/);
  assert.ok((html.match(/<li>/g) ?? []).length <= 3 * 9, 'at most three of each list per answer');
  const none = assessHtml(registerRows(D.register.map((r) => ({ ...r, protocol: 'register-v5' })), ctx, D.rules), D, ctx);
  assert.match(none, /No listing has been assessed by the protocol yet/);
  assert.match(none, /data-assess-copy/);
});
