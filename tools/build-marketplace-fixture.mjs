// build-marketplace-fixture.mjs - the demo dataset behind the
// Marketplace page.
//
// EVERY ROW IS INVENTED. The owner's profiles, thresholds, finds,
// makers and grounds live in Supabase and never enter this repository;
// these stand in for them so the page can be rendered, and swept, with
// nothing private on disk. The towns and makers do not exist.
//
// The derived parts - the board, the ledger, the totals, the evidence -
// are computed here by the same engine the page and the parity gate
// use, so the demo cannot show a band or a grade the rules would not
// give. Between them the rows reach every band, grade, verdict, status
// and buy window, a placeholder, a verdict that no longer stands, and a
// threshold the evidence disputes.
import { writeFileSync } from 'node:fs';
import {
  board, ledger, tierTotals, priceEvidence, thresholdReview, lineBenchmark,
} from '../assets/js/engine/marketplace.js';

const TODAY = '2026-06-01';
const HH = 'demo';
let n = 0;
const id = (p) => `${p}-${String(n += 1).padStart(3, '0')}`;

const brief = {
  household_id: HH, confidence: 'drafted', home_base: 'Anytown', cost_per_mile: 0.45,
  style_brief: 'An invented brief: plain old furniture in honest materials, scaled to a small house.',
  reject_brief: 'Anything shiny, flat-packed or painted to look old.',
  travel_bands: [
    { band: 'A', minutes_max: 20, miles_max: 10, places: ['Anytown', 'Nearby'], min_saving: 10, use_for: 'Anything on the list.' },
    { band: 'B', minutes_max: 40, miles_max: 25, places: ['Middleton'], min_saving: 30, use_for: 'Furniture, or a real saving.' },
    { band: 'C', minutes_max: 60, miles_max: 40, places: ['Farfield'], min_saving: 75, use_for: 'Large or scarce pieces.' },
    { band: 'D', minutes_max: 90, miles_max: 70, places: ['Distantbury'], min_saving: 150, use_for: 'Rare pieces, or a planned day.' },
  ],
  rules: [
    { key: 'trip_cost', rule: 'A trip costs 45p a mile all in. Worth it when the fair price less what is paid beats that.', why: 'A small saving far away is a loss.' },
    { key: 'no_house_yet', rule: 'Until contracts exchange, buy only small things.', why: 'Storage eats the saving.' },
    { key: 'offer', rule: 'Above fair, open at the good price. At or under good, pay the asking price and go.', why: 'Haggling loses the bargains.' },
    { key: 'never', rule: 'No deposits and no moving off the platform. Pay on the doorstep after looking.', why: 'There is no buyer protection on a collection.' },
  ],
};

const P = (key, name, category, tier, o = {}) => ({
  id: id('prof'), household_id: HH, key, name, category, tier, room_hint: null, wanted_qty: 1, unit: 'each',
  work_item_id: null, spec: `An invented spec for the ${name.toLowerCase()}: solid, old and the right size.`,
  reject_if: 'Board, bright lacquer, or the wrong size.', inspect: 'Lift it, open it, look underneath.',
  price_steal: 20, price_good: 50, price_fair: 90, price_max: 150, price_new: 500,
  price_basis: 'Invented.', price_confidence: 'drafted', captured_on: '2026-03-01', source_id: null,
  keywords: [name.toLowerCase()], misspellings: [], exclude_terms: ['flat pack'],
  size_class: 'medium', buy_window: 'any_time', supply: 'regular', max_drive_minutes: 40,
  status: 'hunting', resolution: null, notes: null, sort_order: 100, confidence: 'drafted',
  needed_by: null, fallback: null, fallback_weeks: null, anchor_of: null,
  created_at: '2026-03-01T09:00:00Z', ...o,
});

const profiles = [
  P('sofa', 'Roll-arm sofa', 'seating', 'day_one', { size_class: 'large', buy_window: 'from_exchange', work_item_id: 'line-seating',
    price_steal: 80, price_good: 200, price_fair: 350, price_max: 550, price_new: 1800,
    fallback: 'Borrow one, or a sound stand-in at the steal price.', fallback_weeks: 8, misspellings: ['setee'] }),
  P('chest', 'Chest of drawers', 'storage', 'day_one', { size_class: 'large', buy_window: 'from_exchange', wanted_qty: 2,
    work_item_id: 'line-storage', price_steal: 40, price_good: 80, price_fair: 130, price_max: 200, price_new: 650,
    price_confidence: 'researched', misspellings: ['chester draws'] }),
  P('lamps', 'Table lamps', 'lighting', 'day_one', { size_class: 'small', wanted_qty: 4,
    price_steal: 5, price_good: 12, price_fair: 25, price_max: 40, price_new: 120, supply: 'common',
    fallback: 'Two plain new lamps.', fallback_weeks: 2 }),
  P('side_table', 'Side table', 'tables', 'first_month', { anchor_of: 'sofa', wanted_qty: 2, price_good: 20, price_fair: 40, price_steal: 8, price_max: 70, price_new: 200 }),
  P('rug', 'Wool rug', 'textiles', 'first_month', { wanted_qty: 1, price_steal: 40, price_good: 90, price_fair: 180, price_max: 320, price_new: 1200,
    price_confidence: 'confirmed', confidence: 'confirmed', captured_on: '2025-02-01' }),
  P('mirror', 'Wall mirror', 'mirrors_art', 'first_year', { size_class: 'small', work_item_id: 'line-mirrors' }),
  P('stone', 'Garden stone', 'garden', 'opportunistic', { supply: 'rare', buy_window: 'after_move', price_good: 80, price_fair: 140, price_steal: 40, price_max: 220, price_new: 400 }),
  P('cutlery', 'Canteen of cutlery', 'kitchen_dining', 'first_month', { size_class: 'small', supply: 'common',
    price_steal: 15, price_good: 30, price_fair: 55, price_max: 90, price_new: 400 }),
  P('hooks', 'Coat hooks', 'hardware', 'opportunistic', { wanted_qty: 0, buy_window: 'after_move', size_class: 'small' }),
  P('clock', 'Mantel clock', 'decorative', 'first_year', { size_class: 'small', price_good: 25, price_fair: 50, price_steal: 10, price_max: 90, price_new: 300 }),
];
const pid = Object.fromEntries(profiles.map((p) => [p.key, p.id]));

const C = (key, ckey, kind, question, o = {}) => ({
  id: id('check'), household_id: HH, profile_id: pid[key], key: ckey, kind, question,
  pass_looks_like: 'What a good one shows.', fail_looks_like: 'What a poor one shows.',
  must_pass: true, distinction: false, doorstep: true, how: 'photo', sort_order: 10, status: 'active', confidence: 'drafted', ...o,
});
const checks = [
  C('sofa', 'frame', 'construction', 'Is the frame hardwood? Lift one end.', { how: 'in_hand' }),
  C('sofa', 'smell', 'condition', 'Is it free of smoke and damp smell?', { how: 'in_hand', sort_order: 20 }),
  C('chest', 'carcass', 'material', 'Is the carcass solid timber?'),
  C('chest', 'joints', 'construction', 'Are the drawers dovetailed?', { sort_order: 20 }),
  C('chest', 'linings', 'construction', 'Oak drawer linings?', { must_pass: false, distinction: true, sort_order: 90 }),
  C('lamps', 'solid', 'material', 'Is it solid brass? A magnet does not stick.', { how: 'in_hand' }),
  C('side_table', 'joints', 'construction', 'Are the joints tight?', { how: 'in_hand' }),
  C('rug', 'knotted', 'construction', 'Is it hand-knotted? Look at the back.'),
  C('rug', 'wool', 'material', 'Is the pile wool?', { how: 'in_hand', sort_order: 20 }),
  C('mirror', 'frame', 'material', 'Is the frame gesso on wood, not resin?', { how: 'in_hand' }),
  C('mirror', 'size', 'fit', 'Does it fit the chimney breast?', { doorstep: false, how: 'ask_seller', sort_order: 20 }),
  C('stone', 'real', 'material', 'Is it real stone, with no mould lines?', { how: 'in_hand' }),
  C('cutlery', 'plate', 'material', 'Is it marked silver plate?'),
  C('clock', 'runs', 'condition', 'Does it run when wound?', { how: 'in_hand' }),
];

const M = (name, category, standing, o = {}) => ({
  id: id('maker'), household_id: HH, name, aliases: [], category, standing, era: '1900s',
  what: 'An invented maker.', how_to_tell: 'A label under the seat or inside a drawer.',
  price_effect: standing === 'seek' ? 'Worth paying above fair.' : null, status: 'active', confidence: 'drafted', ...o,
});
const makers = [
  M('Goodwright and Sons', 'storage', 'seek'), M('Plainwork', 'storage', 'acceptable'),
  M('Boardcraft Regency', 'storage', 'avoid'), M('Deepseat', 'seating', 'seek'),
  M('Looms of Anytown', 'textiles', 'seek', { confidence: 'confirmed' }),
];
const mid = Object.fromEntries(makers.map((m) => [m.name, m.id]));

const G = (key, name, kind, band, o = {}) => ({
  id: id('ground'), household_id: HH, key, name, kind, band, town: 'Anytown', drive_minutes: 15, miles: 8,
  schedule: null, buyer_premium_pct: null, good_for: 'Furniture and smalls.', tactics: 'Go early.',
  confidence: 'drafted', status: 'active', sort_order: 100, ...o,
});
const grounds = [
  G('local', 'Marketplace, around Anytown', 'marketplace_area', 'A'),
  G('saleroom', 'Middleton Saleroom', 'auction', 'B', { town: 'Middleton', drive_minutes: 35, miles: 22,
    schedule: 'General sale on the first Saturday of the month; viewing the day before.', buyer_premium_pct: 25, confidence: 'researched' }),
  G('hospice', 'Hospice furniture shop', 'charity_furniture', 'B', { town: 'Middleton', drive_minutes: 30, miles: 20 }),
  G('boot', 'Farfield car boot', 'car_boot', 'C', { town: 'Farfield', drive_minutes: 55, miles: 38, schedule: 'Sundays, April to October.' }),
  G('fair', 'Distantbury antiques fair', 'fair', 'D', { town: 'Distantbury', drive_minutes: 85, miles: 64, schedule: 'Twice a year.' }),
  G('online', 'Online auctions', 'online', 'online', { town: null, drive_minutes: null, miles: null }),
];
const gid = Object.fromEntries(grounds.map((g) => [g.key, g.id]));

const pass = (...keys) => Object.fromEntries(keys.map((k) => [k, { answer: 'pass', evidence: 'Seen in the photographs.' }]));
const F = (key, title, asking, o = {}) => ({
  id: id('find'), household_id: HH, profile_id: key ? pid[key] : null, title, platform: 'facebook_marketplace',
  location_text: 'Anytown', distance_miles: 6, drive_minutes: 14, seen_on: '2026-05-28',
  asking_price: asking, is_ono: false, quantity: 1, style_fit: 4, what_it_is: 'An invented piece, described before it is priced.',
  verdict: 'watch', verdict_reason: 'An invented reason, in two sentences. It says what was seen.',
  opening_offer: null, max_offer: null, status: 'spotted', status_note: null, paid: null, travel_cost: null,
  bought_on: null, work_item_id: null, confidence: 'drafted', checks: {}, maker_id: null, maker_evidence: null,
  photos_seen: 3, is_placeholder: false, ground_id: gid.local, ...o,
});
const finds = [
  // Live, one of each verdict and band.
  F('chest', 'Mahogany chest, two over three', 75, { verdict: 'buy', style_fit: 5, checks: pass('carcass', 'joints', 'linings'),
    verdict_reason: 'Solid and dovetailed, with oak linings, at the good price. Pay it and go today.' }),
  F('lamps', 'Brass column lamp', 5, { verdict: 'buy', style_fit: 4, distance_miles: 3,
    verdict_reason: 'A steal a few minutes away. Take a magnet: leave it if the magnet sticks.' }),
  F('rug', 'Red wool rug, 2 x 3 m', 250, { verdict: 'offer', style_fit: 5, checks: pass('knotted', 'wool'),
    maker_id: mid['Looms of Anytown'], maker_evidence: 'Woven label on the back, photo 4.', opening_offer: 90, max_offer: 180,
    distance_miles: 22, drive_minutes: 35, status: 'offered', ground_id: gid.hospice, platform: 'charity_shop' }),
  F('mirror', 'Gilt wall mirror', 95, { verdict: 'watch', distance_miles: null, drive_minutes: null, status: 'messaged',
    verdict_reason: 'Looks right, but the frame cannot be told from resin in one photograph. Ask for the back.' }),
  F('sofa', 'Three-seater leather sofa', 600, { verdict: 'offer', style_fit: 4, distance_miles: 38, drive_minutes: 55, status: 'agreed',
    opening_offer: 200, max_offer: 350, verdict_reason: 'Over the ceiling as asked. Worth an offer at the good price; the frame and the smell are for the doorstep.' }),
  F('cutlery', 'Stainless cutlery set, boxed', 40, { verdict: 'pass', style_fit: 1, status: 'passed',
    checks: { plate: { answer: 'fail', evidence: 'Stamped stainless.' } }, verdict_reason: 'Not plate, and the wrong period. Kept so the reason is on record.' }),
  F('side_table', 'Small oak side table', 30, { verdict: 'pass', style_fit: 2, status: 'passed', verdict_reason: 'Fairly priced and wrong for the house.' }),
  F('clock', 'Oak mantel clock', 28, { verdict: 'buy', style_fit: 4, checks: {}, distance_miles: 20,
    verdict_reason: 'Was a buy when it was judged; a check added since means that no longer stands.' }),
  F(null, 'Box of mixed brassware', 10, { verdict: 'watch', style_fit: null, verdict_reason: 'No profile yet. Research one before going further.' }),
  F('stone', 'Garden stone with top', 150, { verdict: 'watch', status: 'lost', distance_miles: 64, drive_minutes: 85, verdict_reason: 'Sold before it could be seen.' }),
  // Bought: five real purchases and one placeholder, so the page can say what the buying has taught.
  F('chest', 'Pine chest, two over two', 90, { verdict: 'buy', style_fit: 4, checks: pass('carcass', 'joints'), status: 'bought',
    paid: 70, travel_cost: 5, bought_on: '2026-04-12', confidence: 'actual', maker_id: mid.Plainwork, maker_evidence: 'Label inside the top drawer.' }),
  F('lamps', 'Pair of brass lamps', 30, { verdict: 'buy', quantity: 2, checks: pass('solid'), status: 'bought', paid: 24, travel_cost: 3,
    bought_on: '2026-04-20', confidence: 'actual', ground_id: gid.boot, platform: 'car_boot' }),
  F('rug', 'Small wool rug', 60, { verdict: 'watch', style_fit: 3, is_placeholder: true, status: 'bought', paid: 35, travel_cost: 0,
    bought_on: '2026-04-25', confidence: 'actual', verdict_reason: 'A stand-in under the fallback. In use until the real one turns up.' }),
  F('mirror', 'Oval gilt mirror', 45, { verdict: 'buy', style_fit: 5, checks: pass('frame', 'size'), status: 'bought', paid: 45, travel_cost: 9,
    bought_on: '2026-05-02', confidence: 'actual', ground_id: gid.saleroom, platform: 'auction' }),
  F('cutlery', 'Plated canteen, eight settings', 35, { verdict: 'buy', style_fit: 5, checks: pass('plate'), status: 'bought', paid: 30,
    travel_cost: 0, bought_on: '2026-05-10', confidence: 'actual', ground_id: gid.saleroom, platform: 'auction' }),
  F('side_table', 'Mahogany wine table', 25, { verdict: 'buy', style_fit: 4, checks: pass('joints'), status: 'bought', paid: 18, travel_cost: 2,
    bought_on: '2026-05-18', confidence: 'actual' }),
];

const S = (key, label, o = {}) => ({
  id: id('search'), household_id: HH, profile_id: key ? pid[key] : null, label, query: label.toLowerCase(),
  platform: 'facebook_marketplace', max_price: 200, radius_km: 40, is_alert: false, cadence: 'weekly',
  why: null, status: 'active', last_run_on: null, sort_order: 100, ...o,
});
const searches = [
  S('sofa', 'Roll-arm sofa', { is_alert: true, cadence: 'alert', sort_order: 10 }),
  S('chest', 'Mahogany chest of drawers', { is_alert: true, cadence: 'alert', sort_order: 20 }),
  S('chest', 'Chester draws', { sort_order: 30, last_run_on: '2026-05-30' }),
  S('lamps', 'Brass lamp', { cadence: 'alert', sort_order: 40 }),
  S('rug', 'Wool rug', { is_alert: true, cadence: 'alert', sort_order: 50 }),
  S('cutlery', 'Canteen of cutlery', { is_alert: true, cadence: 'alert', sort_order: 60 }),
  S('stone', 'Garden stone', { cadence: 'monthly', sort_order: 70 }),
  S(null, 'Sweep: house clearance', { cadence: 'twice_weekly', sort_order: 80, last_run_on: '2026-05-25' }),
  S(null, 'Sweep: free furniture', { cadence: 'daily', sort_order: 90 }),
];

const O = (key, kind, price, on, o = {}) => ({
  id: id('obs'), household_id: HH, profile_id: pid[key], find_id: null, kind, price, quantity: 1,
  premium_pct: kind === 'auction_hammer' ? 25 : 0, unit_price: price,
  price_all_in: Math.round(price * (kind === 'auction_hammer' ? 1.25 : 1) * 100) / 100,
  observed_on: on, where_seen: 'Middleton Saleroom', description: 'An invented lot.', grade: null,
  is_typical: true, status: 'active', confidence: 'researched', ...o,
});
const observations = [
  ...[100, 120, 140, 160, 180].map((p, i) => O('chest', 'auction_hammer', p, `2026-0${i + 1}-10`)),
  O('chest', 'auction_hammer', 900, '2026-02-10', { is_typical: false, description: 'An invented lot at the top of the market.' }),
  O('chest', 'dealer', 650, '2026-03-01'), O('sofa', 'auction_estimate', 300, '2026-03-05'),
  O('rug', 'sold_listing', 150, '2026-04-01'), O('rug', 'sold_listing', 170, '2026-04-08'),
  ...finds.filter((f) => f.profile_id && f.asking_price != null).map((f) => O(
    profiles.find((p) => p.id === f.profile_id).key, 'asking', f.asking_price, f.seen_on, { find_id: f.id, confidence: 'actual' })),
];

// The shopping lines three of the profiles fill, in the shape the page reads.
const lines = [
  { id: 'line-seating', title: 'Sofa and armchairs', cost_expected: 900, cost_confidence: 'drafted', status: 'planned' },
  { id: 'line-storage', title: 'Wardrobes and drawers', cost_expected: 120, cost_confidence: 'drafted', status: 'planned' },
  { id: 'line-mirrors', title: 'Mirrors and wall art', cost_expected: 100, cost_confidence: 'drafted', status: 'planned' },
];

const mp_board = board(profiles, finds, lines);
const mp_find_ledger = ledger(finds, { profiles, checks, makers, brief });
const mp_totals = tierTotals(mp_board);
const mp_price_evidence = priceEvidence(profiles, observations, TODAY);
const mp_threshold_review = thresholdReview(mp_price_evidence);

// The demo must not show a verdict the guard would refuse - except the
// one find that is there to show what a lapsed verdict looks like.
const lapsed = mp_find_ledger.filter((l) => !l.verdict_stands).map((l) => l.title);
if (lapsed.join() !== 'Oak mantel clock') throw new Error(`fixture verdicts refused by the guard: ${lapsed.join(', ')}`);
const reached = (f, values) => {
  const got = new Set(mp_find_ledger.map(f));
  const missing = values.filter((v) => !got.has(v));
  if (missing.length) throw new Error(`fixture does not reach: ${missing.join(', ')}`);
};
reached((l) => l.price_band, ['steal', 'good', 'fair', 'high', 'over', null]);
reached((l) => l.quality_grade, ['A', 'B', 'C', 'X', null]);
reached((l) => l.verdict, ['buy', 'offer', 'watch', 'pass']);
reached((l) => l.status, ['spotted', 'messaged', 'offered', 'agreed', 'bought', 'passed', 'lost']);
if (!mp_threshold_review.length) throw new Error('fixture has no threshold for the evidence to dispute');

const data = {
  meta: { generated: TODAY, today: TODAY, note: 'Demo dataset. Every row is invented; none of it is the owner\'s.' },
  house_state: 'none',
  mp_brief: brief, mp_board, mp_find_ledger, mp_totals, mp_searches: searches, mp_grounds: grounds,
  mp_makers: makers, mp_checks: checks, mp_price_evidence, mp_threshold_review,
  mp_line_benchmark: lineBenchmark(mp_board),
};
writeFileSync('data/fixtures/marketplace.json', `${JSON.stringify(data, null, 2)}\n`);
console.log(`marketplace fixture: ${profiles.length} profiles, ${finds.length} finds, ${checks.length} checks, `
  + `${observations.length} price observations - all invented`);
