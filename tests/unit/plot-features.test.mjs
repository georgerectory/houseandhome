// The plot's drafted features. They are on the drawing because they
// change what can be built - where a car stands, where a live wire
// crosses the garden - and the rule that lets them on is that every one
// says how little is known about it. These pin that rule, and that the
// garden zones are arithmetic on the plot and the house rather than a
// tracing: they must tile the plot outside the house exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featuresHtml } from '../../assets/js/engine/floorplan-svg/plot.js';

const b = JSON.parse(readFileSync('data/buildings/forest-view/building.json', 'utf8'));
const { plot, envelope } = b;
const area = ([x1, y1, x2, y2]) => (x2 - x1) * (y2 - y1);

test('every feature is drafted and carries its basis', () => {
  assert.ok(plot.features?.length);
  for (const f of plot.features) {
    assert.equal(f.confidence, 'drafted', `${f.id} claims more than drafted`);
    assert.ok(f.basis?.length > 20, `${f.id} does not say what it rests on`);
  }
});

test('the uncertain ones say so in the label itself', () => {
  const by = Object.fromEntries(plot.features.map((f) => [f.id, f]));
  assert.match(by.parking.label, /to confirm/);
  assert.match(by['overhead-line'].label, /approximate/);
});

test('the garden zones tile the plot outside the house, no more and no less', () => {
  const zones = plot.features.filter((f) => f.kind === 'zone');
  const sum = zones.reduce((s, z) => s + area(z.rect), 0);
  const want = plot.widthM * plot.depthM - envelope.widthM * envelope.depthM;
  assert.ok(Math.abs(sum - want) < 1e-6, `zones ${sum.toFixed(2)} m2 against ${want.toFixed(2)} m2`);
});

test('the parking and the line sit inside the plot', () => {
  const x0 = plot.originX; const y0 = plot.originY;
  const inside = ([x, y]) => x >= x0 - 1e-9 && x <= x0 + plot.widthM + 1e-9
    && y >= y0 - 1e-9 && y <= y0 + plot.depthM + 1e-9;
  for (const f of plot.features) {
    const pts = f.points ?? [[f.rect[0], f.rect[1]], [f.rect[2], f.rect[3]]];
    for (const p of pts) assert.ok(inside(p), `${f.id} leaves the plot at ${p}`);
  }
});

test('the plan draws each feature once, dotted, with its label', () => {
  const svg = featuresHtml(plot.features);
  for (const f of plot.features) {
    assert.equal(svg.split(`data-feature="${f.id}"`).length - 1, 1, f.id);
  }
  assert.match(svg, /fp-plot-wire/);
  assert.match(svg, /fp-plot-parking/);
  assert.match(svg, /check the wayleave/);
});

test('a building with no features draws nothing extra', () => {
  assert.equal(featuresHtml(undefined), '');
});
