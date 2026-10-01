// build-road-fixture.mjs - the Road Ahead page's demo data, all of it invented.
//
// The browser gate runs every page in demo mode, offline and in CI, so
// the Road Ahead page needs rows to render. They are built here from the
// golden master's invented inputs (tests/fixtures/road-ahead-golden.json):
// the same made-up pay, savings and roads the kit's own Python was run
// on, so the demo page runs the real engine on figures that are nobody's.
// Every place, listing, auctioneer and rule below is invented as well.
// Nothing is read from the private extract or the live database.
//
// The shape is exactly what loadRoadAhead() in core/store.js returns from
// Supabase, so a page that renders the fixture renders the live data.
//
//   node tools/build-road-fixture.mjs      writes data/fixtures/road-ahead.json
//
// A unit test builds it again and compares, so a change to the engine
// cannot leave the demo showing figures the engine no longer produces.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REGISTRY } from '../assets/js/engine/road-ahead/registry.js';
import { ROAD_SHAPE } from '../assets/js/core/road-shape.js';
import { buildParams, appraisalSettings, appraise } from '../assets/js/engine/road-ahead/index.js';

const at = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
export const FIXTURE_PATH = at('data/fixtures/road-ahead.json');
const golden = JSON.parse(readFileSync(at('tests/fixtures/road-ahead-golden.json'), 'utf8'));
const ON = '2026-09-30';
// The listings with a full answer were appraised last, so the Assess section shows them.
const EARLIER = '2026-09-23';
const INVENTED = 'Invented for the demo';

// --- Variables ------------------------------------------------------
// The golden master's invented values, labelled as the live rows are:
// the registry's meaning as the label, and each figure's evidence label
// mapped to the portal's confidence (RA-03: STATED confirmed, VERIFIED
// researched, ESTIMATE and CHECK drafted).
const STATED = new Set(['income.gross_salary_now', 'income.pay_rise_2027', 'income.pay_rise_month',
  'cash.works_buffer', 'costs.family_cost', 'costs.children', 'costs.family_from', 'timeline.bridge_from',
  'mortgage.mip_amount', 'mortgage.mip_salary', 'house1.deposit_pct']);
const VERIFIED = new Set(['income.net_pay_now', 'income.net_per_3k_gross', 'income.student_loan_rate',
  'income.student_loan_threshold', 'cash.start_cash', 'cash.pre_purchase_spend', 'mortgage.stress_rate']);
const RANGES = {
  'income.pay_rise_2027': [0, 6000],
  'income.annual_rise_from_2028': [0, 4000],
  'costs.family_cost': [300, 800],
  'costs.bridge_rent': [1200, 1700],
  'costs.cost_inflation': [0.02, 0.045],
  'mortgage.rate': [0.04, 0.065],
  'mortgage.refix_rate': [0.032, 0.058],
  'mortgage.stress_rate': [0.07, 0.09],
  'mortgage.lender_expenditure_adult': [850, 1300],
  'mortgage.lender_expenditure_child': [280, 520],
};
// What the page reads beyond the engine: the practical ceiling line on
// the scatter and the limits the register checks listings against.
const EXTRA = [
  ['ceiling.practical', 340000, '£', 'The price the plan is comfortable paying; the hard ceiling is the most it ever bids.'],
  ['rules.house1_min_beds', 2, 'count', 'House 1 has at least this many bedrooms as found.'],
  ['rules.house1_max_minutes', 75, 'minutes', 'House 1 is within this many minutes of home.'],
  ['rules.forever_max_minutes', 45, 'minutes', 'The forever home is within this many minutes of home.'],
  ['rules.rent_max_months', 9, 'months', 'Renting lasts no more than this many months.'],
  ['targets.endgame_today_target', 450000, '£', 'The forever-home budget aimed for, in model-start money.'],
];

const meaning = new Map(REGISTRY.map((r) => [r.key, r]));
const variable = (key, value, unit, label) => {
  const evidence = STATED.has(key) ? 'STATED' : VERIFIED.has(key) ? 'VERIFIED' : 'ESTIMATE';
  const confidence = { STATED: 'confirmed', VERIFIED: 'researched' }[evidence] ?? 'drafted';
  const [low, high] = RANGES[key] ?? [null, null];
  return {
    key, label, value, unit: unit || null, low, high, evidence,
    certainty: evidence === 'ESTIMATE' ? 'M' : 'H', confidence,
    confirmed_at: confidence === 'confirmed' ? `${ON}T12:00:00+00:00` : null,
    source: INVENTED, source_date: ON,
  };
};
const variables = [
  ...Object.entries(golden.variables).map(([k, v]) => variable(k, v, meaning.get(k)?.unit, meaning.get(k)?.meaning ?? null)),
  ...EXTRA.map(([k, v, unit, label]) => variable(k, v, unit, label)),
].sort((a, b) => a.key.localeCompare(b.key));

// The appraisal settings come from the variables, as they do live. (The
// golden master's register case priced local help on its own, to test
// the two apart; the demo, like the owner's data, has one set of help
// factors for the roads and the register.)
const P = buildParams(Object.fromEntries(variables.map((v) => [v.key, v.value])));
const V = appraisalSettings(P);
for (const [k, v] of Object.entries(V)) {
  if (!Number.isFinite(v)) throw new Error(`appraisal setting ${k} has no value in the invented variables`);
}

// --- Scenarios ------------------------------------------------------
const scenario = (key, name, description, extra = {}) => ({
  key, name, description, overrides: {}, works_factor: null, help: true,
  is_builtin: true, is_default: key === 'base', status: 'active', confidence: 'drafted', ...extra,
});
const scenarios = [
  scenario('base', 'Base', 'The variables as they stand.'),
  scenario('optimistic', 'Optimistic', 'Works at 85% of the estimate, child costs at £300 a month.',
    { works_factor: 0.85, overrides: { 'costs.family_cost': 300 } }),
  scenario('highly_optimistic', 'Highly optimistic', 'Works at 75% of the estimate, child costs at £300 a month.',
    { works_factor: 0.75, overrides: { 'costs.family_cost': 300 } }),
  scenario('promotion', 'Promotion', 'A £6,000 rise in 2027 instead of the expected one.',
    { overrides: { 'income.pay_rise_2027': 6000 } }),
  scenario('job_change', 'Job change', 'A new job at £1,500 less in 2027.',
    { overrides: { 'income.pay_rise_2027': -1500 } }),
  scenario('family_longer', 'Family stay longer', 'The family stay runs two months longer.',
    { overrides: { 'timeline.bridge_from': [2027, 2] } }),
  scenario('bad_luck', 'Bad luck', 'Rates higher and no 2027 rise.',
    { overrides: { 'mortgage.rate': 0.062, 'mortgage.refix_rate': 0.055, 'income.pay_rise_2027': 0 } }),
  scenario('no_child', 'No child costs', 'Child costs never start.', { overrides: { 'costs.family_from': [2099, 1] } }),
  scenario('no_help', 'No local help', 'Every job paid for at trade rates.', { help: false }),
  scenario('optimistic_promotion', 'Optimistic with promotion', 'Optimistic, and the promotion.',
    { works_factor: 0.85, overrides: { 'costs.family_cost': 300, 'income.pay_rise_2027': 6000 } }),
];

// --- Roads ----------------------------------------------------------
// The golden master's invented roads, under the live codes so the page
// meets the same structure: one buy-once track and four House 1 roads.
const road = (code, from, name, rank, family, near, sort, fit) => ({
  code, name, kind: 'road', rank_label: rank, family, near, stages: golden.raw_roads[from].stages,
  fit, narrative: null, sort_order: sort, status: 'active',
});
const roads = [
  road('GE', 'SG1', 'Buy once and grow', 'Parallel track', 'Buy the forever home first', true, 10,
    [{ field: 'mins', op: '<=', value: 45, label: 'within 45 minutes' },
      { field: 'finished_ratio', op: '>=', value: 1.35, label: 'finished value at least 1.35 times the price' }]),
  road('H1', 'SH1', 'Character restoration', '1 · Priority', 'One House 1, then the forever home', true, 20,
    [{ field: 'mins', op: '<=', value: 45, label: 'within 45 minutes' },
      { field: 'price', op: 'between', value: [290000, 360000], label: '£290-360k' },
      { field: 'beds', op: '>=', value: 3, label: '3 beds or more' }]),
  road('H2', 'SH2', 'Distant sprint', '2 · Fastest capital', 'One House 1, then the forever home', false, 30,
    [{ field: 'mins', op: '>=', value: 45, label: 'beyond 45 minutes' },
      { field: 'price', op: '<=', value: 300000, label: 'up to £300k' }]),
  road('H3', 'SH3', 'Tired semi sprint', '3 · Backup', 'One House 1, then the forever home', true, 40,
    [{ field: 'price', op: 'between', value: [220000, 300000], label: '£220-300k' },
      { field: 'mins', op: '<=', value: 45, label: 'within 45 minutes' }]),
  road('H4', 'SX', 'Stretch purchase', '4 · Fallback', 'One House 1, then the forever home', true, 50,
    [{ field: 'price', op: 'between', value: [380000, 440000], label: '£380-440k' }]),
];
const FIT = { A: 'H1', B: 'H3', C: 'GE', D: 'H4' };

// --- Rules ----------------------------------------------------------
const rule = (code, scope, kind, text, params = [], severity = 'block') => ({
  code, scope, kind, rule: text, check_id: null, params, severity, decision_code: null,
});
const rules = [
  rule('HR-1', 'all', 'hard', 'No leasehold'),
  rule('HR-2', 'all', 'hard', 'No flats above the ground floor'),
  rule('HR-3', 'all', 'hard', 'No non-standard construction'),
  rule('RV-1', 'forever', 'hard', 'The forever home is within this many minutes of home', ['rules.forever_max_minutes']),
  rule('RV-2', 'house1', 'hard', 'House 1 is within this many minutes of home', ['rules.house1_max_minutes']),
  rule('RV-3', 'house1', 'default', 'House 1 has at least this many bedrooms as found', ['rules.house1_min_beds'], 'warn'),
  rule('RV-4', 'renting', 'hard', 'Renting lasts no more than this many months', ['rules.rent_max_months']),
];

// --- The pipeline template, read from the schema -------------------
// It is vocabulary the database already publishes; one home.
const schema = readFileSync(at('supabase/schema/88_road_ahead.sql'), 'utf8');
const TEMPLATE = [...schema.matchAll(/\('(t[-+]\d+)',\s*(-?\d+), '([^']+)', '([^']+)', (\d+)\)/g)]
  .map(([, key, offset, label, settles, sort]) => ({ key, offset_days: Number(offset), label, settles, sort_order: Number(sort) }));
if (TEMPLATE.length !== 8) throw new Error(`expected the 8 pipeline steps in 88_road_ahead.sql, found ${TEMPLATE.length}`);

// --- Listings -------------------------------------------------------
const HOUSES = { FBK: 'Fairbank & Co', CLV: 'Clover Auctions', BRH: 'Brook Hall' };
const g = new Map(golden.register.map((r) => [r.listing.kit_ref, r.listing]));
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
const plusDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const L = (code, from, facts) => ({ code, from, ...facts });
const LISTINGS = [
  L('L01', 'X01', { name: 'Mill House, Ashcombe', postcode: 'AB1 2CD', status: 'chase', sale_method: 'auction',
    house_code: 'FBK', lot: '7', auction_on: '2026-10-21', property_type: '4-bed detached, dated throughout',
    detached: true, beds: 4, guide_price: 275000, flag: 'Title is possessory: ask the lender', reaction: null }),
  L('L02', 'X07', { name: '2 Orchard Row, Brimley', postcode: 'AB3 4EF', status: 'chase', sale_method: 'auction',
    house_code: 'FBK', lot: '9', auction_on: '2026-10-21', property_type: 'Extended 3-bed detached bungalow',
    detached: true, beds: 3, guide_price: 260000, flag: 'Guide looks low: expect a crowd', floor_area_m2: 118,
    answer: {
      verdict: 'Strong (stretch) for H3: sub-optimal, it leaves little cash for the works',
      positives: ['A wide spread between the price it will take and its finished value',
        'Single-storey work: quick, and within the help nearby', 'Three comparables sold on the same road'],
      negatives: ['The guide is low, so the room will be busy', 'A flat-roofed extension to check'],
      next_checks: ['The legal pack, for the extension\'s approvals', 'A roofer on the flat roof'],
    } }),
  L('L03', 'X12', { name: 'The Old Forge, Fernwick', postcode: 'AB5 6GH', status: 'chase', sale_method: 'auction',
    house_code: 'FBK', lot: '3', auction_on: '2026-10-21', property_type: '4-bed character house on a large plot',
    detached: true, beds: 4, guide_price: 320000, reaction: 'The demo favourite',
    flag: 'Likely to go well over guide', floor_area_m2: 164,
    answer: {
      verdict: 'Over budget for GE: sub-optimal, it is dearer than the ceiling allows',
      positives: ['The largest plot on the register', 'Character that sells quickly once finished'],
      negatives: ['Likely to go well over guide', 'The works are the biggest in the demo'],
      next_checks: ['What the last three lots at this house went for against their guides'],
    } }),
  L('L04', 'X04', { name: 'Hollins Farm Close, Oakhollow', postcode: 'AB7 8IJ', status: 'chase', sale_method: 'mmoa',
    property_type: '3-bed detached, renovation potential', detached: true, beds: 3, asking_price: 285000,
    flag: 'A 5% buyer fee on top' }),
  L('L05', 'X02', { name: 'Ivy Lodge, Netherfold', postcode: 'AB9 1KL', status: 'watch', sale_method: 'auction',
    house_code: 'CLV', lot: '21', auction_on: '2026-11-05', property_type: '3-bed detached cottage',
    detached: true, beds: 3, guide_price: 230000, flag: 'An hour away: little help nearby', floor_area_m2: 96,
    answer: {
      verdict: 'Strong for H3: optimal',
      positives: ['Clears the target profit with room to spare', 'Leaves cash for the works after buying'],
      negatives: ['An hour away, so little help nearby'],
      next_checks: ['Whether the auction house takes a proxy bid', 'The drainage: the listing does not say'],
    } }),
  L('L06', 'X03', { name: '12 Station Road, Brackenmere', postcode: 'AB2 3MN', status: 'watch', sale_method: 'mmoa',
    property_type: '1-bed semi', detached: false, beds: 1, asking_price: 125000, flag: 'One bedroom only' }),
  L('L07', 'X11', { name: 'Beech End, Wrenfield', postcode: 'AB4 5OP', status: 'watch', sale_method: 'private',
    property_type: '3-bed semi, fair order', detached: false, beds: 3, asking_price: 315000,
    flag: 'Offer test at £300k', override: ['Worth pursuing (long keep)', 'Invented: kept for eight years, the sums change'] }),
  L('L08', 'X08', { name: 'Rowan Cottage, Kestlecombe', postcode: 'AB6 7QR', status: 'dropped', sale_method: 'private',
    property_type: '3-bed detached, already modernised', detached: true, beds: 3, asking_price: 335000,
    status_reason: 'Already done: nothing left to add' }),
  L('L09', 'X14', { name: '3 Quarry Lane, Stonebeck', postcode: 'AB8 9ST', status: 'watch', sale_method: 'private',
    property_type: '3-bed semi, tired', detached: false, beds: 3, asking_price: 265000 }),
  L('L10', 'X05', { name: 'Larch House, Fernwick', postcode: 'AB5 1UV', status: 'watch', sale_method: 'auction',
    house_code: 'BRH', lot: '12', auction_on: '2026-10-15', property_type: '6-bed listed villa, unmodernised',
    detached: true, beds: 6, guide_price: 380000, flag: 'Over the ceiling; listed' }),
  L('L11', 'X09', { name: 'Glebe View, Ashcombe', postcode: 'AB1 9WX', status: 'closed', sale_method: 'private',
    property_type: '3-bed semi', detached: false, beds: 3, asking_price: 210000,
    status_reason: 'Sold before an offer was made' }),
  L('L12', 'X06', { name: 'Kiln Barn, Oakhollow', postcode: 'AB7 2YZ', status: 'dropped', sale_method: 'mmoa',
    property_type: '4-bed barn conversion', detached: true, beds: 4, asking_price: 365000,
    status_reason: 'A 6% buyer fee takes the margin' }),
];

const register = [];
for (const x of LISTINGS) {
  const src = g.get(x.from);
  if (!src) throw new Error(`no golden listing ${x.from}`);
  const fits = src.fits.map(([r, s]) => [FIT[r], s]);
  const inputs = { likely_buy: src.likely_buy, fin_lo: src.fin_lo, fin_hi: src.fin_hi, works: src.works,
    mins: src.mins, fee: src.fee, pct: src.pct };
  const [override_grade, override_reason] = x.override ?? [null, null];
  const out = appraise(V, { ...inputs, fits, override_grade });
  delete out.judgement;
  const auction = x.auction_on ?? null;
  register.push({
    id: `demo-${x.code}`, code: x.code, kit_ref: null, name: x.name, address: `${x.name}, ${x.postcode}`,
    postcode: x.postcode, links: [`https://example.org/demo/${x.code.toLowerCase()}`], source: INVENTED,
    house_code: x.house_code ?? null, lot: x.lot ?? null, auction_on: auction,
    auction_at: auction ? `${auction}T10:00:00+00:00` : null, sale_method: x.sale_method,
    property_type: x.property_type, detached: x.detached, beds: x.beds, baths: null, floor_area_m2: x.floor_area_m2 ?? null,
    plot_acres: null, condition: null, minutes_from_home: src.mins, guide_price: x.guide_price ?? null,
    asking_price: x.asking_price ?? null, fee: src.fee, fee_pct: src.pct, purpose: 'candidate',
    status: x.status, status_reason: x.status_reason ?? null, reaction: x.reaction ?? null, flag: x.flag ?? null,
    category: null, notes: null, confidence: 'drafted', checked_on: ON,
    appraised_on: x.answer ? ON : EARLIER, protocol: 'road-ahead-1', inputs, outputs: out, fits,
    verdict: x.answer?.verdict ?? out.grade,
    override_grade, override_reason,
    positives: x.answer?.positives ?? [], negatives: x.answer?.negatives ?? [],
    red_flags: x.flag ? [x.flag] : [], next_checks: x.answer?.next_checks ?? [],
    days_to_auction: auction ? dayDiff(auction, ON) : null,
    judgements: null, next_step: null, write_up_on: null, write_up_verdict: null,
    sources: [{ what: 'Invented for the demo', on: ON }],
    labels: { likely_buy: 'ESTIMATE', fin_lo: 'VERIFIED', fin_hi: 'VERIFIED', works: 'ESTIMATE', mins: 'STATED' },
  });
}
// Two rows with no appraisal: a benchmark and one still to be looked at.
register.push(
  { ...register[0], id: 'demo-G01', code: 'G01', name: 'The Grange, Wrenfield', address: 'The Grange, Wrenfield, AB4 1AA',
    postcode: 'AB4 1AA', links: [], house_code: null, lot: null, auction_on: null, auction_at: null, sale_method: 'private',
    property_type: '6-bed Georgian rectory', beds: 6, guide_price: null, asking_price: 895000, fee: 0, fee_pct: 0,
    minutes_from_home: 30, purpose: 'benchmark', status: 'watch', flag: null, reaction: 'What the forever home looks like',
    appraised_on: null, protocol: null, inputs: null, outputs: null, fits: [], verdict: null,
    override_grade: null, override_reason: null, red_flags: [], days_to_auction: null,
    positives: [], negatives: [], next_checks: [], floor_area_m2: null, sources: null, labels: null },
  { ...register[0], id: 'demo-G02', code: 'G02', name: '7 Mill Lane, Brimley', address: '7 Mill Lane, Brimley, AB3 2BB',
    postcode: 'AB3 2BB', links: [], house_code: null, lot: null, auction_on: null, auction_at: null, sale_method: 'unknown',
    property_type: '3-bed detached', beds: 3, guide_price: null, asking_price: 299000, fee: 0, fee_pct: 0,
    minutes_from_home: 25, purpose: 'candidate', status: 'unreviewed', flag: null, reaction: null,
    appraised_on: null, protocol: null, inputs: null, outputs: null, fits: [], verdict: null,
    override_grade: null, override_reason: null, red_flags: [], days_to_auction: null,
    positives: [], negatives: [], next_checks: [], floor_area_m2: null, sources: null, labels: null },
);

// The owner's judgement beside the maths, on the favourite.
const favourite = register.find((r) => r.code === 'L03');
favourite.judgements = [{ field: 'premium', value: 8000, reason: 'The demo favourite: worth a little more than the sums say',
  kind: 'emotional', said_on: ON }];
favourite.positives = ['Large plot', 'Character throughout'];
favourite.negatives = ['Busy road at the front'];
favourite.next_checks = ['Read the legal pack', 'Ask the agent about the boundary'];

// --- Pipeline, and the dated actions it produces --------------------
const pipeline = [];
for (const r of register) {
  if (!r.auction_on || !['watch', 'chase', 'viewing', 'legal', 'survey', 'bid', 'offer'].includes(r.status)) continue;
  for (const t of TEMPLATE) {
    if (r.status === 'watch' && t.key !== 't-0') continue;
    const due = plusDays(r.auction_on, t.offset_days);
    const done = r.code === 'L03' && t.key === 't-21';
    pipeline.push({
      listing_id: r.id, code: r.code, name: r.name, house_code: r.house_code, house_name: HOUSES[r.house_code],
      lot: r.lot, auction_on: r.auction_on, auction_at: r.auction_at, listing_status: r.status,
      step_key: t.key, label: t.label, settles: t.settles, sort_order: t.sort_order,
      due_on: due, days_until: dayDiff(due, ON), done_on: done ? ON : null, outcome: done ? 'Kept' : null, is_done: done,
    });
  }
}
for (const r of register) {
  const next = pipeline.filter((p) => p.code === r.code && !p.is_done).sort((a, b) => a.sort_order - b.sort_order)[0];
  if (next) r.next_step = { step: next.label, due_on: next.due_on, days_until: next.days_until };
}
const byDay = new Map();
for (const p of pipeline.filter((x) => !x.is_done && x.days_until >= 0)) {
  const k = `${p.due_on}|${p.house_name}|${p.label}`;
  if (!byDay.has(k)) byDay.set(k, { ...p, lots: [] });
  byDay.get(k).lots.push(p.lot);
}
const dd = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const next = [...byDay.values()]
  .map((p) => ({ source: 'pipeline', title: `${p.house_name} ${dd(p.auction_on)}: ${p.label} (${p.lots.sort((a, b) => a - b).map((l) => `lot ${l}`).join(', ')})`,
    on_date: p.due_on, days_until: p.days_until, open_items: p.lots.length }))
  .concat([{ source: 'milestone', title: 'Demo checkpoint: the broker has answered', on_date: '2026-11-30',
    days_until: dayDiff('2026-11-30', ON), open_items: 0 }])
  .sort((a, b) => a.days_until - b.days_until || a.title.localeCompare(b.title));

// --- Comparables and the ledger -------------------------------------
const comparables = [
  { listing_code: 'L01', address: 'Mill Lane, Ashcombe', property_type: '4-bed detached, modernised', price: 430000,
    kind: 'sold', when_text: 'March 2026', on_date: '2026-03-12', source: INVENTED, url: null, confidence: 'researched' },
  { listing_code: 'L01', address: 'Church Street, Ashcombe', property_type: '4-bed detached', price: 455000,
    kind: 'asking', when_text: 'September 2026', on_date: null, source: INVENTED, url: null, confidence: 'researched' },
  { listing_code: 'L03', address: 'Forge Lane, Fernwick', property_type: '4-bed character house', price: 610000,
    kind: 'sold', when_text: 'June 2025', on_date: '2025-06-20', source: INVENTED, url: null, confidence: 'researched' },
];
const cash = variables.find((v) => v.key === 'cash.start_cash');
const pay = variables.find((v) => v.key === 'income.net_pay_now');
const ledger = [
  { measure: 'cash', model_value: cash.value, model_confidence: cash.confidence, model_source: INVENTED,
    ledger_value: cash.value - 1150, ledger_as_of: '2026-09-15' },
  { measure: 'net pay per month', model_value: pay.value, model_confidence: pay.confidence, model_source: INVENTED,
    ledger_value: pay.value, ledger_as_of: null },
];

// --- The auctions: invented houses, dates, results and a playbook -----
const HOUSE_FACTS = {
  FBK: ['Online, timed', 'Houses across the demo county', 'About monthly', 'The most lots of the right kind'],
  CLV: ['In the room and online', 'Cottages and land', 'Every six weeks or so', 'Fewer bidders in the room'],
  BRH: ['Online, live', 'Larger and listed houses', 'Quarterly', 'Where the over-budget houses turn up'],
};
const houses = Object.entries(HOUSES).map(([code, name]) => {
  const [format, covers, cadence, why] = HOUSE_FACTS[code];
  return { code, name, format, covers, cadence, link: `https://example.org/demo/${code.toLowerCase()}`, why };
});
const date = (code, kind, on, checked, title = null, status = 'scheduled', notes = null) =>
  ({ house_code: code, kind, on_date: on, title, notes, checked_on: checked, status });
const calendar = [
  date('BRH', 'catalogue', '2026-09-24', '2026-09-22'),
  date('FBK', 'catalogue', '2026-09-30', '2026-09-28'),
  date('BRH', 'auction', '2026-10-15', '2026-09-28'),
  date('CLV', 'catalogue', '2026-10-15', '2026-09-28'),
  date('FBK', 'auction', '2026-10-21', '2026-09-28'),
  date('CLV', 'auction', '2026-11-05', '2026-09-28'),
  date('FBK', 'catalogue', '2026-11-11', '2026-09-28'),
  date('FBK', 'bidding_opens', '2026-11-25', '2026-09-28', 'Timed sale opens'),
  date('FBK', 'auction', '2026-12-02', '2026-09-28', null, 'moved', 'Moved from 25 November'),
  date('CLV', 'auction', '2026-12-17', '2026-09-28'),
];
const results = [
  { house_code: 'FBK', listing_code: null, sold_on: '2026-07-15', lot: '4', property_type: '3-bed semi, tired',
    guide: 240000, sold: 291000, outcome: 'sold', lesson: 'A low guide drew a crowd: it went 21% over', source: INVENTED },
  { house_code: 'CLV', listing_code: null, sold_on: '2026-08-20', lot: '2', property_type: '2-bed cottage',
    guide: 180000, sold: 196000, outcome: 'sold', lesson: null, source: INVENTED },
  { house_code: 'BRH', listing_code: null, sold_on: '2026-06-10', lot: '9', property_type: '5-bed listed house',
    guide: 300000, sold: null, outcome: 'unsold', lesson: 'Unsold in the room; offers after', source: INVENTED },
];
const play = (code, kind, body, sort_order) => ({ code, kind, body, sort_order });
const playbook = [
  play('PB-1', 'setup', 'Register with each house before the catalogue is out.', 10),
  play('PB-2', 'daily', 'Check the new lots against the rules before anything else.', 20),
  play('PB-3', 'weekly', 'Re-check every tracked date: houses move them.', 30),
  play('PB-4', 'rule', 'Fix the maximum bid at the go or no-go step, and do not move it in the room.', 40),
  play('PB-5', 'did_not_work', 'Viewing before reading the legal pack wasted a morning.', 50),
];

export const fixture = {
  meta: { generated: ON, note: 'Invented. Every figure, place, listing and rule here is made up for the demo and the browser tests.' },
  variables, scenarios, roads, rules, register, comparables, pipeline, next, ledger, houses, calendar, results, playbook,
};

// One shape with the live loader, or the demo would prove nothing.
for (const [part, cols] of Object.entries(ROAD_SHAPE)) {
  const want = [...cols].sort().join(',');
  for (const row of fixture[part]) {
    const got = Object.keys(row).sort().join(',');
    if (got !== want) {
      const extra = Object.keys(row).filter((k) => !cols.includes(k));
      const missing = cols.filter((k) => !(k in row));
      throw new Error(`${part} row ${row.code ?? row.key ?? row.measure ?? ''} differs from ROAD_SHAPE: `
        + `extra ${extra.join(', ') || 'none'}; missing ${missing.join(', ') || 'none'}`);
    }
  }
}

/** The fixture as the file holds it. */
export const fixtureText = () => `${JSON.stringify(fixture, null, 1)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(FIXTURE_PATH, fixtureText());
  console.log(`road-ahead fixture: ${variables.length} variables, ${scenarios.length} scenarios, ${roads.length} roads, `
    + `${register.length} listings, ${pipeline.length} pipeline steps, ${next.length} dated actions, `
    + `${houses.length} auction houses, ${calendar.length} auction dates`);
}
