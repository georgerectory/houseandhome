// The marketplace engine. What is asserted hardest is that a verdict to
// buy cannot be reached on price alone: the grade needs evidence, the
// fit is its own test, and the one exception is as narrow as it reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  band, grade, unseenChecks, doorstepOk, travelBand, verdictRefusal, verdictAllowed,
  tripWorth, offerRange, questionsFor, sellerMessage, ledger,
  board, houseState, canBuyNow, huntQueue, alertsToSet, sweepsDue, tierTotals, ledgerTotals,
  priceEvidence, thresholdReview, evidenceSummary, lessons, lineBenchmark, secondHandCheck, isStale,
  budgetPosition, versusBenchmarks, budgetVerdict,
} from '../../assets/js/engine/marketplace.js';

const P = { id: 'p1', key: 'chest', name: 'Chest', category: 'storage', tier: 'day_one', wanted_qty: 2,
  price_steal: 40, price_good: 80, price_fair: 130, price_max: 200, price_new: 650,
  price_confidence: 'drafted', status: 'hunting', supply: 'common', buy_window: 'from_exchange',
  created_at: '2026-01-01T00:00:00Z', captured_on: '2026-01-01' };
const CHECKS = [
  { profile_id: 'p1', key: 'carcass', question: 'Solid carcass?', must_pass: true, doorstep: false, how: 'photo', sort_order: 1 },
  { profile_id: 'p1', key: 'joints', question: 'Dovetailed?', must_pass: true, doorstep: true, how: 'in_hand', sort_order: 2 },
  { profile_id: 'p1', key: 'linings', question: 'Oak linings?', must_pass: false, distinction: true, doorstep: true, how: 'photo', sort_order: 3 },
];
const OK = { carcass: { answer: 'pass' }, joints: { answer: 'pass' } };
const BRIEF = { travel_bands: [{ band: 'B', miles_max: 25, minutes_max: 40 }, { band: 'A', miles_max: 10, minutes_max: 20 }] };

test('the band is per unit, and lands on each boundary', () => {
  assert.deepEqual([40, 80, 130, 200, 201].map((u) => band(u, P)), ['steal', 'good', 'fair', 'high', 'over']);
  assert.equal(band(null, P), null);
  assert.equal(band(10, null), null);
  assert.equal(band(10, { ...P, price_fair: null }), null);
  assert.equal(band(150, { ...P, price_max: null }), 'over');
});

test('the grade needs evidence: unseen is C, never B', () => {
  assert.equal(grade(CHECKS, {}, null).grade, 'C');
  assert.equal(grade(CHECKS, { carcass: { answer: 'pass' } }, null).grade, 'C');
  assert.equal(grade(CHECKS, OK, null).grade, 'B');
  assert.equal(grade(CHECKS, { ...OK, linings: { answer: 'pass' } }, null).grade, 'A');
  assert.equal(grade(CHECKS, OK, { name: 'Goodwright', standing: 'seek' }).grade, 'A');
  assert.equal(grade(CHECKS, OK, { name: 'Plain', standing: 'acceptable' }).grade, 'B');
  assert.equal(grade(CHECKS, { ...OK, joints: { answer: 'fail' } }, null).grade, 'X');
  assert.equal(grade(CHECKS, OK, { name: 'Flatpack', standing: 'avoid' }).grade, 'X');
  assert.equal(grade(CHECKS, { ...OK, linings: { answer: 'fail' } }, null).grade, 'B');
  assert.equal(grade([], {}, null).grade, 'C', 'a profile with no checks proves nothing');
  assert.equal(grade(null, {}, null).grade, null, 'no profile, no grade');
  assert.equal(grade([{ ...CHECKS[0], status: 'retired' }, CHECKS[1]], { joints: { answer: 'pass' } }, null).grade, 'B');
  assert.ok(grade(CHECKS, {}, null).reasons[0].includes('2 must-pass'));
});

test('unseen checks come back as questions, in order', () => {
  const u = unseenChecks(CHECKS, { carcass: { answer: 'pass' } });
  assert.deepEqual(u.map((x) => x.key), ['joints']);
  assert.equal(doorstepOk(u), true);
  assert.equal(doorstepOk(unseenChecks(CHECKS, {})), false, 'the carcass cannot be settled at the door');
  assert.equal(doorstepOk([]), false);
});

test('the travel band is unknown when the distance is', () => {
  assert.equal(travelBand(BRIEF, 10, null), 'A');
  assert.equal(travelBand(BRIEF, 10.1, null), 'B');
  assert.equal(travelBand(BRIEF, null, 30), 'B');
  assert.equal(travelBand(BRIEF, 26, null), 'beyond');
  assert.equal(travelBand(BRIEF, null, null), null);
});

test('the guard: buy needs a proven grade and the fit', () => {
  const r = verdictRefusal;
  assert.equal(r('buy', 'B', 5, 'fair', null, false), null);
  assert.equal(r('buy', 'B', 3, 'steal', 'A', true), 'fit');
  assert.equal(r('buy', 'B', null, 'steal', 'A', true), 'fit');
  assert.equal(r('buy', 'C', 5, 'good', 'A', true), 'unproven');
  assert.equal(r('offer', 'C', 4, 'over', null, false), null);
  assert.equal(r('offer', 'C', 3, 'over', null, false), 'fit');
  assert.equal(r('watch', 'C', 3, null, null, false), null);
  assert.equal(r('watch', 'X', 5, 'steal', 'A', true), 'grade_x');
  assert.equal(r('pass', 'X', 1, null, null, false), null);
  assert.equal(r('watch', 'B', 2, null, null, false), 'wrong_for_house');
  assert.equal(r('buy', null, 5, null, null, false), 'no_profile');
  assert.equal(r('watch', null, 5, null, null, false), null);
  assert.equal(r(null, 'X', 1, null, null, false), null);
});

test('the one exception: steal, band A, every open check a doorstep check', () => {
  const r = verdictRefusal;
  assert.equal(r('buy', 'C', 5, 'steal', 'A', true), null);
  assert.equal(r('buy', 'C', 5, 'steal', 'B', true), 'unproven');
  assert.equal(r('buy', 'C', 5, 'steal', null, true), 'unproven');
  assert.equal(r('buy', 'C', 5, 'good', 'A', true), 'unproven');
  assert.equal(r('buy', 'C', 5, 'steal', 'A', false), 'unproven');
  assert.equal(r('buy', 'C', 3, 'steal', 'A', true), 'fit');
  const v = verdictAllowed('buy', 'C', 'good', 'A', { fit: 5, doorstep: true });
  assert.equal(v.allowed, false);
  assert.ok(v.why.includes('unseen'));
});

test('a trip is a margin, not a yes or no', () => {
  assert.deepEqual(tripWorth({ fair: 130, price: 100, roundTripMiles: 60 }), { tripCost: 27, margin: 3, worth: true });
  assert.equal(tripWorth({ fair: 130, price: 110, roundTripMiles: 60 }).worth, false);
  assert.equal(tripWorth({ fair: 130, price: 110, roundTripMiles: null }), null);
  assert.equal(tripWorth({ fair: 100, price: 50, roundTripMiles: 100, costPerMile: 0.5 }).margin, 0);
});

test('the offer rule: patient by default, the good price is the ceiling', () => {
  const row = (asking, quantity = 1) => ({ ...P, asking_price: asking, quantity });
  assert.deepEqual(offerRange(row(60)), { kind: 'accept', open: 60, stop: 60 });
  assert.deepEqual(offerRange(row(120)), { kind: 'offer', open: 60, stop: 80 });
  assert.deepEqual(offerRange(row(250)), { kind: 'offer', open: 60, stop: 80 });
  assert.deepEqual(offerRange(row(500, 2)), { kind: 'offer', open: 120, stop: 160 }, 'a lot is priced per unit');
  assert.equal(offerRange({ asking_price: 5 }), null);
});

test('the offer rule when a day-one need is urgent', () => {
  const row = (asking) => ({ ...P, asking_price: asking, quantity: 1 });
  const urgent = { patient: false };
  assert.deepEqual(offerRange(row(60), urgent), { kind: 'accept', open: 60, stop: 60 });
  assert.deepEqual(offerRange(row(120), urgent), { kind: 'offer', open: 96, stop: 120 });
  assert.deepEqual(offerRange(row(90), urgent), { kind: 'offer', open: 80, stop: 90 }, 'never opens under the good price');
  assert.deepEqual(offerRange(row(250), urgent), { kind: 'offer', open: 80, stop: 130 });
});

test('the ledger derives the band, the grade and whether the verdict stands', () => {
  const finds = [
    { id: 'f1', profile_id: 'p1', title: 'Good chest', asking_price: 240, quantity: 2, style_fit: 5, verdict: 'buy', checks: OK, status: 'spotted' },
    { id: 'f2', profile_id: 'p1', title: 'Hopeful chest', asking_price: 35, quantity: 1, style_fit: 5, verdict: 'buy', checks: {}, status: 'spotted', distance_miles: 4 },
    { id: 'f3', profile_id: null, title: 'Oddment', asking_price: 5, quantity: 1, status: 'spotted' },
    { id: 'f4', profile_id: 'p1', title: 'Bought chest', asking_price: 100, quantity: 1, style_fit: 4, verdict: 'buy', checks: OK,
      status: 'bought', paid: 85, travel_cost: 5 },
  ];
  const [a, b, c, d] = ledger(finds, { profiles: [P], checks: CHECKS, brief: BRIEF });
  assert.deepEqual([a.unit_asking, a.price_band, a.quality_grade, a.verdict_stands], [120, 'fair', 'B', true]);
  assert.deepEqual([b.price_band, b.quality_grade, b.travel_band, b.verdict_refusal], ['steal', 'C', 'A', 'unproven']);
  assert.deepEqual([c.price_band, c.quality_grade, c.verdict_stands], [null, null, true]);
  assert.deepEqual([d.haggled_off, d.saved_vs_fair, d.saved_vs_new], [15, 40, 560]);
  assert.equal(questionsFor(b).length, 2);
});

test('seller messages are a short low offer, and never a deposit or a move off the platform', () => {
  const [row] = ledger([{ id: 'f', profile_id: 'p1', title: 'Mahogany chest', asking_price: 120, quantity: 1, checks: {}, status: 'spotted' }],
    { profiles: [P], checks: CHECKS });
  const ask = sellerMessage(row, 'ask');
  assert.ok(ask.includes('Solid carcass?') && !ask.includes('Dovetailed?'), 'one question, and never an in-hand check');
  assert.ok(!/photo/i.test(ask), 'no request for photographs');
  assert.ok(sellerMessage(row, 'offer').length < 90, 'an offer is one short line');
  assert.ok(sellerMessage(row, 'offer').includes('£60'));
  assert.ok(sellerMessage(row, 'offer', { patient: false }).includes('£96'));
  assert.ok(sellerMessage({ ...row, opening_offer: 90 }, 'offer').includes('£90'));
  assert.ok(sellerMessage(row, 'accept').includes('£120'));
  for (const k of ['ask', 'offer', 'accept']) {
    assert.ok(!/deposit|whatsapp|bank transfer|text me|phone/i.test(sellerMessage(row, k)));
  }
});

// --- The campaign ------------------------------------------------------

const prof = (o) => ({ ...P, ...o, id: o.key });
const PROFILES = [
  prof({ key: 'chest' }),
  prof({ key: 'sofa', price_good: 200, price_new: 1800, wanted_qty: 1, fallback: 'Borrow one', fallback_weeks: 4 }),
  prof({ key: 'side_table', price_good: 20, price_new: 2000, wanted_qty: 1, anchor_of: 'sofa', buy_window: 'any_time' }),
  prof({ key: 'lamp', tier: 'first_month', price_good: 10, price_new: 110, buy_window: 'any_time' }),
  prof({ key: 'stone', tier: 'first_year', supply: 'rare', price_good: 80, price_new: 400, wanted_qty: 1, buy_window: 'after_move' }),
  prof({ key: 'knobs', tier: 'opportunistic', wanted_qty: 0 }),
  prof({ key: 'paused', status: 'paused' }),
];

test('the board derives bought and outstanding; a placeholder fills nothing', () => {
  const finds = [
    { profile_id: 'chest', status: 'bought', quantity: 1, paid: 70, travel_cost: 5 },
    { profile_id: 'chest', status: 'bought', quantity: 1, paid: 20, is_placeholder: true },
    { profile_id: 'chest', status: 'spotted', quantity: 1 },
    { profile_id: 'chest', status: 'passed', quantity: 1 },
  ];
  const b = board(PROFILES, finds).find((x) => x.key === 'chest');
  assert.deepEqual([b.bought_qty, b.placeholder_qty, b.qty_outstanding, b.spent, b.live_finds, b.budget_outstanding],
    [1, 1, 1, 95, 1, 80]);
});

test('the hunt order: tier, lead time, anchors, then the saving', () => {
  const q = huntQueue(board(PROFILES, []), 'none', '2026-02-10');
  assert.deepEqual(q.map((r) => r.key), ['sofa', 'chest', 'stone', 'side_table', 'lamp']);
  const sofa = q[0];
  assert.deepEqual([sofa.mode, sofa.weeks_hunted, sofa.fallback_from, sofa.fallback_due], ['watch', 5, '2026-01-29', false]);
  assert.ok(sofa.reasons.some((r) => r.includes('contracts')));
  assert.ok(q[2].reasons.some((r) => r.includes('rare')));
  assert.ok(q[3].reasons.some((r) => r.includes('sofa')));
  assert.equal(q[4].mode, 'buy');
  const after = huntQueue(board(PROFILES, []), 'exchanged', '2026-02-10');
  assert.equal(after[0].mode, 'buy');
  assert.equal(after[0].fallback_due, true, 'patience runs out only once there is a house');
  assert.equal(after.find((r) => r.key === 'stone').mode, 'watch');
});

test('first few now, the rest later', () => {
  const beds = prof({ key: 'bed', wanted_qty: 3, first_qty: 1, price_good: 90, price_new: 600 });
  const sofa = prof({ key: 'sofa', wanted_qty: 1, price_good: 200, price_new: 1800 });
  const lamp = prof({ key: 'lamp', tier: 'first_month', price_good: 10, price_new: 110 });
  const before = huntQueue(board([beds, sofa, lamp], []), 'moved', '2026-02-10');
  assert.deepEqual(before.map((r) => r.key), ['sofa', 'bed', 'lamp'], 'three beds outstanding still rank as day one');
  const after = huntQueue(board([beds, sofa, lamp], [{ profile_id: 'bed', status: 'bought', quantity: 1, paid: 80 }]), 'moved', '2026-02-10');
  assert.deepEqual(after.map((r) => r.key), ['sofa', 'lamp', 'bed'], 'the second bed waits behind a first-month need');
  assert.ok(after[2].reasons.some((r) => r.includes('rest furnish rooms')));
});

test('the house state, and what it lets you buy', () => {
  assert.equal(houseState([]), 'none');
  assert.equal(houseState([{ status: 'candidate' }, { status: 'archived' }]), 'none');
  assert.equal(houseState([{ status: 'committed' }]), 'exchanged');
  assert.equal(houseState([{ status: 'committed' }, { status: 'owned' }]), 'moved');
  assert.equal(canBuyNow({ buy_window: 'any_time' }, 'none').can, true);
  assert.equal(canBuyNow({ buy_window: 'from_exchange' }, 'none').can, false);
  assert.equal(canBuyNow({ buy_window: 'after_move' }, 'exchanged').can, false);
  assert.equal(canBuyNow({ buy_window: 'after_move' }, 'moved').can, true);
});

test('alerts are rationed to ten, and the ones to stop are named', () => {
  const q = huntQueue(board(PROFILES, []), 'none', '2026-02-10');
  const searches = ['sofa', 'chest', 'side_table', 'lamp'].flatMap((k) => [1, 2, 3].map((n) => ({
    id: `${k}${n}`, profile_id: k, label: `${k} ${n}`, query: k, cadence: 'weekly', sort_order: n, is_alert: k === 'lamp' })));
  searches.push({ id: 'old', profile_id: 'gone', label: 'filled thing', cadence: 'alert', is_alert: true });
  const a = alertsToSet(q, searches);
  assert.equal(a.filter((r) => r.action === 'set').length, 9);
  assert.deepEqual(a.filter((r) => r.action === 'keep').map((r) => r.label), ['lamp 1']);
  assert.deepEqual(a.filter((r) => r.action === 'retire').map((r) => r.label), ['lamp 2', 'lamp 3', 'filled thing']);
  searches.find((s) => s.id === 'lamp3').cadence = 'alert';
  assert.equal(alertsToSet(q, searches)[0].label, 'lamp 3', 'a search written as an alert outranks a sweep');
});

test('sweeps come due on their cadence; an alert is not a sweep', () => {
  const s = sweepsDue([
    { label: 'weekly, run 3 days ago', cadence: 'weekly', last_run_on: '2026-02-07' },
    { label: 'twice weekly, run 3 days ago', cadence: 'twice_weekly', last_run_on: '2026-02-07' },
    { label: 'never run', cadence: 'monthly', last_run_on: null },
    { label: 'an alert', cadence: 'alert', is_alert: true },
    { label: 'retired', cadence: 'daily', status: 'retired' },
  ], '2026-02-10');
  assert.deepEqual(s.map((x) => [x.label, x.due]), [
    ['twice weekly, run 3 days ago', true], ['weekly, run 3 days ago', false], ['never run', true]]);
});

test('totals say how much still rests on an estimate, not on sold prices', () => {
  const b = board([...PROFILES, prof({ key: 'sure', price_confidence: 'researched', wanted_qty: 1 })], []);
  const day = tierTotals(b).find((t) => t.tier === 'day_one');
  assert.equal(day.budget_good, 160 + 200 + 20 + 160 + 80);
  assert.equal(day.unconfirmed_budget, day.budget_good - 80);
  assert.equal(tierTotals(b).find((t) => t.tier === 'opportunistic').profiles_filled, 0);
  const head = ledgerTotals([], tierTotals(b));
  assert.equal(head.trusted, false);
  assert.ok(head.unconfirmed_share > 0.8 && head.unconfirmed_share < 1);
  assert.equal(head.purchases, 0);
});

test('only typical sold prices in the window drive the evidence', () => {
  const obs = (kind, unit, allIn, on = '2026-01-10', extra = {}) =>
    ({ profile_id: 'p1', kind, unit_price: unit, price_all_in: allIn, observed_on: on, ...extra });
  const rows = [
    obs('auction_hammer', 100, 125), obs('auction_hammer', 120, 150), obs('auction_hammer', 140, 175),
    obs('auction_hammer', 100, 125), obs('auction_hammer', 120, 150), obs('auction_hammer', 140, 175),
    obs('sold_listing', 160, 160),
    obs('auction_hammer', 5000, 6250, '2026-01-10', { is_typical: false }),
    obs('auction_hammer', 9000, 9000, '2023-01-10'),
    obs('auction_estimate', 7000, 7000), obs('asking', 300, 300), obs('dealer', 900, 900),
  ];
  let [e] = priceEvidence([P], rows, '2026-02-10');
  assert.deepEqual([e.sold_n, e.asking_n, e.estimate_n, e.dealer_n, e.has_enough], [7, 1, 1, 1, false]);
  assert.deepEqual(thresholdReview([e]), [], 'seven sold prices suggest nothing');
  assert.ok(evidenceSummary(e).includes('1 more sold'));
  [e] = priceEvidence([P], [...rows, obs('auction_hammer', 180, 225)], '2026-02-10');
  // all in: 125 125 150 150 160 175 175 225 - q1 143.75, median 155, q3 175.
  assert.deepEqual([e.median_hammer, e.median_all_in, e.implied_steal, e.implied_good, e.implied_fair, e.implied_max, e.implied_new],
    [130, 155, 72, 144, 155, 175, 900]);
  assert.deepEqual(thresholdReview([e]).map((r) => [r.threshold, r.pct_out]), [['steal', 80], ['good', 80]]);
  assert.equal(evidenceSummary(null), 'No dated prices yet: the ladder is an estimate.');
  assert.equal(isStale('2025-01-01', '2026-02-10'), true);
  assert.equal(isStale('2025-06-01', '2026-02-10'), false);
});

test('lessons say "not enough yet" before five purchases', () => {
  const bought = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({
    status: 'bought', category: 'storage', platform: 'auction', paid: 80, asking_price: 100, id: i, ...extra }));
  const few = lessons([...bought(4), ...bought(3, { is_placeholder: true })]);
  assert.deepEqual([few.enough, few.purchases, few.needed], [false, 4, 1]);
  const many = lessons(bought(5, { ground_id: 'g1' }), [{ id: 'g1', name: 'The saleroom' }]);
  assert.equal(many.enough, true);
  assert.equal(many.byCategory[0].paid_to_asking, 0.8);
  assert.deepEqual([many.byGround[0].label, many.byGround[0].purchases], ['The saleroom', 5]);
});

test('a shopping line is checked against what its profiles cost second hand', () => {
  const b = board([prof({ key: 'a', work_item_id: 'w1', wanted_qty: 2 }), prof({ key: 'b', work_item_id: 'w1', wanted_qty: 1 }),
    prof({ key: 'c', work_item_id: null })], []);
  const [line] = lineBenchmark(b);
  assert.deepEqual([line.profiles, line.second_hand_good, line.second_hand_fair, line.nothing_outstanding, line.is_unconfirmed],
    [2, 240, 390, false, true]);
  assert.equal(secondHandCheck({ cost_expected: 120 }, line).verdict, 'under');
  assert.equal(secondHandCheck({ cost_expected: 300 }, line).verdict, 'within');
  assert.equal(secondHandCheck({ cost_expected: 400 }, line).verdict, 'over');
  assert.equal(secondHandCheck({ cost_expected: 120 }, null), null);
});

test('the budget is the whole plan at each price point, with what is bought new beside it', () => {
  const profiles = [
    { ...P, wanted_qty: 2, purpose: 'utility' },
    { ...P, id: 'p2', key: 'rug', tier: 'first_year', wanted_qty: 1, purpose: 'aesthetic', price_confidence: 'researched',
      price_steal: 50, price_good: 100, price_fair: 200, price_new: 900 },
    { ...P, id: 'p3', key: 'lamp', wanted_qty: 3, purpose: null, price_steal: 5, price_good: 10, price_fair: 20, price_new: 50 },
    { ...P, id: 'p4', key: 'done', status: 'filled' },
  ];
  const buys = [
    { key: 'mattress', tier: 'day_one', quantity: 2, price_low: 200, price_mid: 300, price_high: 500, status: 'planned' },
    { key: 'towels', tier: 'day_one', quantity: 1, price_low: 50, price_mid: 80, price_high: 120, status: 'bought', paid: 65 },
    { key: 'telly', tier: 'first_year', quantity: 1, price_low: 300, price_mid: 400, price_high: 600, status: 'dropped' },
  ];
  const b = budgetPosition(profiles, buys);
  assert.equal(b.kinds, 3, 'only what is hunted counts');
  assert.deepEqual([b.sh_steal, b.sh_good, b.sh_fair, b.sh_new], [145, 290, 520, 2350]);
  assert.equal(b.utility_good, 190, 'a profile with no purpose counts as utility');
  assert.equal(b.aesthetic_good, 100);
  assert.equal(b.unconfirmed_good, 190);
  assert.deepEqual([b.new_kinds, b.new_low, b.new_mid, b.new_high], [2, 465, 665, 1065], 'bought at what was paid; dropped not at all');
  assert.deepEqual([b.all_in_steal, b.all_in_good, b.all_in_fair], [610, 955, 1585]);
  assert.equal(b.day_one_all_in, 190 + 665);
  assert.equal(b.aesthetic_share, 0.3448);
  assert.equal(b.unconfirmed_share, 0.6552);
  const empty = budgetPosition([], []);
  assert.equal(empty.aesthetic_share, null);
  assert.equal(empty.all_in_good, 0);
});

test('a benchmark is met by the figure that covers the same ground, and placed against its range', () => {
  const pos = budgetPosition([{ ...P, wanted_qty: 10 }], [{ key: 'm', tier: 'day_one', quantity: 1, price_low: 100, price_mid: 200, price_high: 300, status: 'planned' }]);
  const rows = versusBenchmarks(pos, [
    { key: 'a', label: 'Furniture survey', covers: 'furniture', home: 'first home', basis: 'new', amount_mid: 1000, sort_order: 2 },
    { key: 'b', label: 'Whole house', covers: 'furnishing', home: '3-bed', basis: 'new', amount_low: 500, amount_high: 1500, sort_order: 1 },
    { key: 'c', label: 'With decorating', covers: 'furnishing_and_decorating', home: 'first home', basis: 'mixed', amount_mid: 5000, sort_order: 3 },
    { key: 'd', label: 'Old', covers: 'furniture', home: 'x', basis: 'new', amount_mid: 1, status: 'retired' },
  ]);
  assert.deepEqual(rows.map((r) => r.key), ['b', 'a', 'c'], 'in sort order, retired left out');
  assert.deepEqual(rows.map((r) => [r.compared_with, r.ours_good, r.position, r.ratio]), [
    ['all_in', 1000, 'within', 1],
    ['second_hand_plan', 800, 'below', 0.8],
    ['all_in', 1000, 'below', 0.2],
  ]);
  assert.equal(rows[2].includes_decorating, true);
  assert.equal(budgetVerdict(rows), 'within');
  assert.equal(budgetVerdict(rows.filter((r) => r.position === 'below')), 'below');
  assert.equal(budgetVerdict([{ ratio: 2, position: 'above' }, { ratio: 0.5, position: 'below' }]), 'mixed');
  assert.equal(budgetVerdict([{ ratio: 2, position: 'above' }]), 'above');
  assert.equal(budgetVerdict([]), null);
  assert.deepEqual(versusBenchmarks(null, [{ key: 'a' }]), []);
});
