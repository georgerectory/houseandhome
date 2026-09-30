import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, fixtureText, FIXTURE_PATH } from '../../tools/build-road-fixture.mjs';
import { ROAD_SHAPE } from '../../assets/js/core/road-shape.js';
import { buildParams, appraisalSettings, appraise } from '../../assets/js/engine/road-ahead/index.js';

test('the committed Road Ahead demo is what the builder makes today', () => {
  assert.equal(readFileSync(FIXTURE_PATH, 'utf8'), fixtureText(),
    'data/fixtures/road-ahead.json is stale: run node tools/build-road-fixture.mjs');
});

test('every demo row has exactly the columns the live loader selects', () => {
  for (const [part, cols] of Object.entries(ROAD_SHAPE)) {
    assert.ok(fixture[part].length > 0, `${part} has rows`);
    for (const row of fixture[part]) assert.deepEqual(Object.keys(row).sort(), [...cols].sort(), `${part} ${row.code ?? row.key ?? ''}`);
  }
});

test('the demo register holds what the engine computes from its own variables', () => {
  const P = buildParams(Object.fromEntries(fixture.variables.map((v) => [v.key, v.value])));
  const V = appraisalSettings(P);
  for (const r of fixture.register.filter((x) => x.inputs)) {
    const { judgement, ...out } = appraise(V, { ...r.inputs, fits: r.fits, override_grade: r.override_grade });
    assert.equal(judgement, null);
    assert.deepEqual(r.outputs, out, r.code);
  }
});
