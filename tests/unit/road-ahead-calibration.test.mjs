import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinedAgenda } from '../../assets/js/engine/road-ahead/sensitivity.js';
import { sensitivitySql, runsSql } from '../../tools/road-ahead-sql.mjs';

// Invented swings: nothing here is anybody's figure.
const row = (key, swing) => ({ key, low: 1, high: 2, at_low: 100, at_high: 100 + swing, swing });
const snapshots = [
  { output: 'R1 forever budget', rows: [row('pay', 40000), row('rate', 9000), row('rent', 500)] },
  { output: 'L01 walk-away', rows: [row('rate', 15000), row('fee', 6000), row('broken', Infinity), row('flat', 0)] },
];

test('the combined agenda names each input once, at its largest swing, with every answer it moves', () => {
  const out = combinedAgenda(snapshots, {});
  assert.deepEqual(out.map((a) => a.key), ['pay', 'rate', 'fee', 'rent']);
  const rate = out.find((a) => a.key === 'rate');
  assert.equal(rate.swing, 15000);
  assert.deepEqual(rate.moves, ['L01 walk-away', 'R1 forever budget'], 'the answer it moves most comes first');
  assert.ok(!out.some((a) => a.key === 'broken' || a.key === 'flat'), 'no answer at one end, or no swing, is not a question');
});

test('a confirmed input asks after an estimate that swings the answer as much', () => {
  const out = combinedAgenda(snapshots, { pay: { confidence: 'confirmed' } });
  assert.deepEqual(out.slice(0, 2).map((a) => a.key), ['rate', 'fee'], '40,000 confirmed weighs 4,000');
  assert.equal(out.find((a) => a.key === 'pay').score, 4000);
  assert.equal(combinedAgenda(snapshots, {}, { top: 2 }).length, 2);
});

test('a sensitivity snapshot is one statement; a missing answer is reported, not stored', () => {
  const hh = '11111111-1111-1111-1111-111111111111';
  const { sql, rows, skipped } = sensitivitySql(hh, snapshots, "engine o'clock");
  assert.equal(rows, 5);
  assert.equal((sql.match(/^insert into/gm) ?? []).length, 1, 'one statement, so the rows share their run_at');
  assert.match(sql, /'engine o''clock'/, 'quotes are escaped');
  assert.deepEqual(skipped, ['L01 walk-away: broken leaves no answer at one end of its range']);
  assert.throws(() => sensitivitySql('not-a-household', snapshots, 'x'), /not a household id/);
});

test('a swung range is recorded without the float\'s noise', () => {
  const hh = '11111111-1111-1111-1111-111111111111';
  const noisy = [{ output: 'R1 forever budget', rows: [
    { key: 'spend', low: 1300 * 0.9, high: 1300 * 1.1, at_low: 1, at_high: 2, swing: 1 },
    { key: 'path', low: { 2027: 0.07 * 0.9 }, high: [2027, 4], at_low: 1, at_high: 3, swing: 2 },
  ] }];
  assert.equal(1300 * 1.1, 1430.0000000000002, 'the noise this guards against');
  const { sql } = sensitivitySql(hh, noisy, 'x');
  assert.match(sql, /'1170'::jsonb, '1430'::jsonb/);
  assert.match(sql, /'\{"2027":0.063\}'::jsonb, '\[2027,4\]'::jsonb/, 'maps and months too');
});

test('an accepted run needs the owner\'s words', () => {
  const hh = '11111111-1111-1111-1111-111111111111';
  const runs = [{ road_code: 'R1', scenario_key: 'base', summary: { forever_today: 1 } }];
  assert.throws(() => runsSql(hh, runs, 'x', '  '), /owner's words/);
  assert.match(runsSql(hh, runs, 'x', 'Accepted after the sit-down'), /'engine', 'x', null, '\{"forever_today":1\}'::jsonb, 'Accepted after the sit-down'/);
});
