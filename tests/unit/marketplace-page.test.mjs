// The Marketplace page, rendered from its model without a browser. The
// sweep only ever sees the demo, which has purchases, finds and
// evidence; the states it never reaches - nothing bought, nothing in
// play, no profiles at all - are rendered here, because an empty state
// that says nothing is how a list of wishes reads as a list of things
// to go and buy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildModel } from '../../assets/js/pages/marketplace/model.js';
import { pageHtml, ladderHtml } from '../../assets/js/pages/marketplace/view.js';

const demo = JSON.parse(readFileSync(new URL('../../data/fixtures/marketplace.json', import.meta.url), 'utf8'));
const clean = (html) => {
  assert.ok(!/undefined|NaN|\[object Object\]|>null</.test(html), 'a raw value leaked into the page');
  assert.ok(!/style="(?![^"]*--)/.test(html), 'a static inline style');
  return html;
};

test('the demo renders all eight sections, in the order the questions arrive', () => {
  const html = clean(pageHtml(buildModel(demo)));
  const order = ['Still to find', 'id="week"', 'id="in-play"', 'id="hunt"', 'id="grounds"', 'id="bought"', 'id="lessons"', 'id="brief"'];
  const at = order.map((s) => html.indexOf(s));
  assert.ok(at.every((i) => i >= 0), `missing a section: ${at}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test('the headline says how much rests on unconfirmed thresholds, and that there is no house', () => {
  const m = buildModel(demo);
  const html = pageHtml(m);
  assert.equal(m.head.trusted, false);
  assert.ok(html.includes('rests on price thresholds nobody has confirmed'));
  assert.ok(html.includes('nothing large can be bought until contracts exchange'));
  assert.ok(!pageHtml(buildModel({ ...demo, house_state: 'moved' })).includes('nothing large can be bought'));
});

test('a find shows its grade, its open questions, and a lapsed verdict as lapsed', () => {
  const m = buildModel(demo);
  const html = pageHtml(m);
  assert.ok(m.live.length >= 5);
  assert.deepEqual(m.live.map((l) => l.verdict).filter((v, i, a) => a.indexOf(v) === i), ['buy', 'offer', 'watch']);
  assert.ok(html.includes('Grade A') && html.includes('Grade C, unproven') && html.includes('No profile, no grade'));
  assert.ok(html.includes('This verdict no longer stands'));
  const lapsed = m.live.find((l) => !l.verdict_stands);
  assert.equal(lapsed.acting, 'watch');
  assert.ok(lapsed.message.includes('still available'), 'a lapsed buy asks questions, it does not accept');
  assert.ok(html.includes('Still to settle'));
  assert.ok(html.includes('Distance not recorded'));
  assert.ok(html.includes('Turned down or lost'));
  const sofa = m.live.find((l) => l.title.includes('sofa'));
  assert.equal(sofa.trip.worth, true);
  assert.ok(sofa.message.includes('£200'));
  assert.ok(m.live.every((l) => !/deposit/i.test(l.message ?? '')));
});

test('a placeholder is shown apart and teaches nothing', () => {
  const m = buildModel(demo);
  assert.equal(m.placeholders.length, 1);
  assert.equal(m.real.length, 5);
  assert.equal(m.lessons.enough, true);
  assert.equal(m.lessons.purchases, 5);
  assert.ok(pageHtml(m).includes('In use until the real one turns up'));
});

test('the queue explains itself, and a watched profile says so', () => {
  const m = buildModel(demo);
  const sofa = m.queue.find((q) => q.key === 'sofa');
  assert.equal(sofa.mode, 'watch');
  assert.ok(sofa.checks.length && sofa.seek.length);
  assert.ok(m.queue.find((q) => q.key === 'side_table').reasons.some((r) => r.includes('sofa')));
  assert.ok(m.stale.some((q) => q.key === 'rug'));
  assert.ok(pageHtml(m).includes('Stale: priced over a year ago'));
  assert.equal(m.alerts.on.length <= 10, true);
  assert.ok(m.review.length > 0);
});

test('nothing bought, nothing in play: each section says so honestly', () => {
  const none = { ...demo, mp_find_ledger: [], mp_threshold_review: [],
    mp_board: demo.mp_board.map((b) => ({ ...b, bought_qty: 0, placeholder_qty: 0, spent: 0, live_finds: 0,
      qty_outstanding: b.wanted_qty, budget_outstanding: b.wanted_qty * b.price_good })) };
  const html = clean(pageHtml(buildModel(none)));
  assert.ok(html.includes('Nothing has been bought yet'));
  assert.ok(html.includes('Nothing is in play'));
  assert.ok(html.includes('Nothing bought yet'));
  assert.ok(html.includes('Not enough yet: 0 real purchases so far'));
  assert.ok(html.includes('No threshold is disputed'));
});

test('an empty database renders, and promises nothing', () => {
  const html = clean(pageHtml(buildModel({ meta: { today: '2026-06-01' } })));
  for (const s of ['No profiles yet', 'No alerts to set', 'No sweeps are set up', 'No grounds recorded yet', 'No brief yet']) {
    assert.ok(html.includes(s), `missing: ${s}`);
  }
  assert.ok(html.includes('£0'));
});

test('the ladder places the asking price by a custom property, clamped', () => {
  const p = { price_steal: 40, price_good: 80, price_fair: 130, price_max: 200 };
  assert.ok(ladderHtml(p, 120).includes('--at: 50.0%'));
  assert.ok(ladderHtml(p, 9999).includes('--at: 100.0%'));
  assert.ok(!ladderHtml(p, null).includes('mp-ladder__mark'));
  assert.equal(ladderHtml({}, 10), '');
});
