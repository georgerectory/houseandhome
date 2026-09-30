// Road Ahead's chart builders: pure functions from numbers to markup.
// Run on the invented demo through the real engine, then checked for
// what a reader would be misled by - a bar the wrong length, a phase in
// the wrong month, a lowest point that is not the lowest, text unescaped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linear, pct, niceCeil, ticks, kilo, seriesOf } from '../../assets/js/engine/road-ahead/charts/scale.js';
import { budgetBars } from '../../assets/js/engine/road-ahead/charts/bars.js';
import { roadPhases, timeline, shortMonth } from '../../assets/js/engine/road-ahead/charts/timeline.js';
import { cashSpark } from '../../assets/js/engine/road-ahead/charts/spark.js';
import { scatter, placeLabels } from '../../assets/js/engine/road-ahead/charts/scatter.js';
import { fitHeatmap } from '../../assets/js/engine/road-ahead/charts/heatmap.js';
import { resolve } from '../../assets/js/engine/road-ahead/page/resolve.js';
import { runAll, registerRows } from '../../assets/js/engine/road-ahead/page/model.js';

const D = JSON.parse(readFileSync(new URL('../../data/fixtures/road-ahead.json', import.meta.url), 'utf8'));
const ctx = resolve(D, 'base');
const runs = runAll(ctx);
const noNaN = (html) => assert.ok(!/NaN|undefined|Infinity/.test(html), 'no NaN, undefined or Infinity in the markup');

test('the scale: positions, clamping, round axes, the kit\'s £k', () => {
  assert.equal(linear(0, 200)(50), 25);
  assert.equal(linear(5, 5)(9), 0, 'an empty domain does not divide by zero');
  assert.equal(pct(140), '100.00%');
  assert.equal(pct(-3), '0.00%');
  assert.equal(pct(NaN), '0.00%');
  assert.deepEqual([niceCeil(0.8), niceCeil(3), niceCeil(420000), niceCeil(0)], [1, 5, 500000, 1]);
  assert.deepEqual(ticks(0, 400000, 4), [0, 100000, 200000, 300000, 400000]);
  assert.deepEqual([kilo(418499), kilo(-5200), kilo(null)], ['£418k', '-£5k', '—']);
  assert.deepEqual([...seriesOf([{ code: 'A' }, { code: 'B' }, { code: 'C' }, { code: 'D' }, { code: 'E' }, { code: 'F' }]).values()], [1, 2, 3, 4, 5, 1]);
});

test('budget bars: each bar is its share of the axis, markers and target placed, text escaped', () => {
  const rows = runs.map((r, i) => ({
    code: r.road.code, name: i === 0 ? '<b>odd & name</b>' : r.road.name, series: i + 1, value: r.head.forever_today,
    markers: [{ key: 'optimistic', label: 'Optimistic', value: r.head.forever_today + 10000 }],
  }));
  rows.push({ code: 'XX', name: 'none', series: 1, value: null, markers: [] });
  const html = budgetBars(rows, { caption: 'Forever home in today\'s money.', target: 450000 });
  noNaN(html);
  assert.equal((html.match(/rd-bars__row/g) ?? []).length, 6);
  assert.match(html, /&lt;b&gt;odd &amp; name&lt;\/b&gt;/);
  assert.ok(!html.includes('<b>odd'), 'names are escaped');
  const widths = [...html.matchAll(/rd-bars__fill" style="--pct:([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 5, 'no bar where there is no forever home');
  const max = niceCeil(Math.max(450000, ...rows.flatMap((r) => [r.value, ...r.markers.map((m) => m.value)]).filter(Number.isFinite)) * 1.04);
  runs.forEach((r, i) => assert.ok(Math.abs(widths[i] - (100 * r.head.forever_today) / max) < 0.01, r.road.code));
  assert.match(html, /no forever home/);
  assert.match(html, /The line is target: £450k/);
});

test('a road\'s phases follow its steps: family, renting, each house, the forever home', () => {
  const span = { start: ctx.P['timeline.start'], familyUntil: ctx.P['timeline.family_until'], end: ctx.P['roads.horizon'] };
  const h1 = roadPhases(ctx.roads.find((r) => r.code === 'H1'), span);
  assert.deepEqual(h1.map((p) => p.kind), ['family', 'rent', 'house', 'forever']);
  const buy = ctx.roads.find((r) => r.code === 'H1').stages.find((s) => s.kind === 'buy');
  const sell = ctx.roads.find((r) => r.code === 'H1').stages.find((s) => s.kind === 'sell');
  assert.deepEqual(h1[2].from, buy.at);
  assert.deepEqual(h1[2].to, sell.at);
  assert.deepEqual(h1[3].from, sell.at, 'the forever home is bought with the sale');
  const ge = roadPhases(ctx.roads.find((r) => r.code === 'GE'), span);
  assert.deepEqual(ge.map((p) => p.kind), ['family', 'rent', 'forever'], 'buy once: no House 1');
  assert.equal(shortMonth([2027, 5]), 'May 2027');
});

test('the timeline places every phase inside the axis and says it in words', () => {
  const span = { start: ctx.P['timeline.start'], familyUntil: ctx.P['timeline.family_until'], end: [2031, 12] };
  const lanes = ctx.roads.map((r, i) => ({ code: r.code, name: r.name, series: i + 1, phases: roadPhases(r, span) }));
  const html = timeline(lanes, { start: span.start, end: span.end, caption: 'The roads over time.' });
  noNaN(html);
  assert.equal((html.match(/class="rd-tl__lane /g) ?? []).length, 5);
  for (const [, from, width] of html.matchAll(/--from:([\d.]+)%;--width:([\d.]+)%/g)) {
    assert.ok(Number(from) >= 0 && Number(from) + Number(width) <= 100.01, `${from} + ${width}`);
  }
  assert.match(html, /visually-hidden">Family stay [A-Z][a-z]{2} \d{4} to/);
});

test('the cash line marks the true lowest month and draws the floor', () => {
  const h1 = runs.find((r) => r.road.code === 'H1').result;
  const svg = cashSpark(h1.trace, { floor: ctx.P['cash.works_buffer'], label: 'H1' });
  noNaN(svg);
  assert.equal((svg.match(/[ML]\d/g) ?? []).length, h1.trace.length, 'one point a month');
  assert.match(svg, /class="rd-spark__floor"/);
  const low = Math.min(...h1.trace.map(([, c]) => c));
  assert.match(svg, new RegExp(`lowest ${kilo(low).replace('£', '£')}`));
  assert.equal(cashSpark([], { label: 'x' }), '');
});

test('the scatter plots every listing with its code, and the ceiling and target lines', () => {
  const rows = registerRows(D.register, ctx, D.rules).filter((x) => x.now);
  const series = seriesOf(ctx.roads);
  const pts = rows.map((x) => ({ code: x.row.code, x: x.L.likely_buy, y: x.now.profit_opt, series: series.get(x.now.best_road) ?? null, title: x.row.name }));
  const svg = scatter(pts, { caption: 'Price against optimistic profit.', xLabel: 'Likely buy', yLabel: 'Profit, optimistic',
    xLines: [{ value: ctx.V.ceiling_hard, label: 'Ceiling' }], yLines: [{ value: ctx.V.target_profit, label: 'Target' }] });
  noNaN(svg);
  assert.equal((svg.match(/<circle/g) ?? []).length, pts.length);
  for (const p of pts) assert.ok(svg.includes(`>${p.code}</text>`), p.code);
  assert.match(svg, /Ceiling/);
  assert.match(svg, /Target/);
});

test('scatter labels never sit on each other, on a point or off the plot', () => {
  const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  // Two listings at almost the same price and profit, one at the right
  // edge, and a line label already in the way of the first.
  const pts = [{ cx: 300, cy: 200, code: 'L05' }, { cx: 302, cy: 201, code: 'L09' }, { cx: 615, cy: 100, code: 'L10' }];
  const line = { x0: 308, x1: 340, y0: 190, y1: 210 };
  const got = placeLabels(pts, [line]);
  const dots = pts.map((p) => ({ x0: p.cx - 6, x1: p.cx + 6, y0: p.cy - 6, y1: p.cy + 6 }));
  got.forEach((g, i) => {
    assert.ok(!overlap(g.box, line), `${pts[i].code} clear of the line label`);
    dots.forEach((d, j) => assert.ok(!overlap(g.box, d), `${pts[i].code} clear of ${pts[j].code}'s point`));
    got.forEach((h, j) => assert.ok(i === j || !overlap(g.box, h.box), `${pts[i].code} clear of ${pts[j].code}'s label`));
  });
  assert.equal(got[2].anchor, 'end', 'a point at the right edge is labelled on its left');
  // Two ceilings a few pounds apart: their names stack rather than overprint.
  const svg = scatter([{ code: 'L1', x: 300000, y: 50000, series: 1, title: 't' }], { caption: 'c', xLabel: 'x', yLabel: 'y',
    xLines: [{ value: 340000, label: 'Comfortable' }, { value: 342000, label: 'Ceiling' }] });
  const ys = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>(Comfortable|Ceiling)</g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 2);
  assert.notEqual(ys[0], ys[1], 'close lines put their names on separate rows');
});

test('the fit heatmap writes every score, and the check only where a road has criteria', () => {
  const rows = registerRows(D.register, ctx, D.rules).filter((x) => x.fit)
    .map((x) => ({ code: x.row.code, name: x.row.name, fit: x.fit }));
  const html = fitHeatmap(rows, ctx.roads, { caption: 'Road fit.' });
  noNaN(html);
  assert.equal((html.match(/class="rd-heat__cell/g) ?? []).length, rows.length * ctx.roads.length);
  assert.match(html, /check \d/);
  const bare = fitHeatmap([{ code: 'L1', name: 'n', fit: [{ road: 'H1', stored: 2, computed: null, agrees: null }] }],
    [{ code: 'H1', name: 'h' }], { caption: 'c' });
  assert.ok(!bare.includes('check'), 'no criteria, no check');
  assert.match(bare, /rd-heat--2/);
});
