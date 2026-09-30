// Road Ahead's engine beyond the kit's own results: the registry, the
// parameter rules, road fit, focus, provenance and the bid grid. Every
// input is the golden master's invented set; nothing here is the owner's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  REGISTRY, REGISTRY_KEYS, buildParams, problems, assertRunnable, extendPath, helpSettings,
  monthIndex, addMonths, months, ym, parseYm, fmt0, pyRound,
  simulate, runRoad, withHelp, withWorksFactor, headline, highestSustainableBid,
  appraise, bestRoad, feeOn, fitScore, fitCheck, focusRoad, provenance, trustLine, DEPENDS,
} from '../../assets/js/engine/road-ahead/index.js';
import { kitTests } from '../../tools/road-ahead-kit-tests.mjs';

const G = JSON.parse(readFileSync(new URL('../fixtures/road-ahead-golden.json', import.meta.url), 'utf8'));
const P = (...ov) => buildParams(G.variables, ...ov);

test("the kit's own tests hold on invented inputs (the 35 that are about the engine)", () => {
  const results = kitTests(null, P, { synthetic: true });
  assert.equal(results.length, 35);
  for (const t of results) assert.ok(t.ok, t.name);
});

test('every parameter the engine reads is in the registry', () => {
  const dir = new URL('../../assets/js/engine/road-ahead/', import.meta.url);
  // Keys a scenario may set that are not variables: the route model's
  // test levers, and the family stay's last month, which is derived.
  const LEVERS = new Set(['works_overrun', 'motivated_draw', 'equity_path', 'timeline.family_until']);
  const read = new Set();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/P\[['"]([a-z0-9_.]+)['"]\]/g)) read.add(m[1]);
    for (const m of src.matchAll(/P\.([a-z_]+)\b/g)) if (m[1] !== 'market') read.add(m[1]);
  }
  const missing = [...read].filter((k) => !REGISTRY_KEYS.has(k) && !LEVERS.has(k));
  assert.deepEqual(missing, [], `read by the engine but not registered: ${missing.join(', ')}`);
  for (const r of REGISTRY) {
    assert.ok(['number', 'month', 'path'].includes(r.kind), `${r.key} kind`);
    assert.ok(r.meaning.endsWith('.'), `${r.key} meaning should be a sentence`);
  }
});

test('the parameters derive one fact from one home', () => {
  const p = P();
  assert.deepEqual(p['timeline.family_until'], addMonths(G.variables['timeline.bridge_from'], -1));
  assert.equal(p['mortgage.house1_max_multiple'], G.variables['mortgage.mip_amount'] / G.variables['mortgage.mip_salary']);
  // A scenario that moves the end of the family stay moves the derived month too.
  assert.deepEqual(P({ 'timeline.bridge_from': [2027, 9] })['timeline.family_until'], [2027, 8]);
  // A multiple set outright wins over the derivation.
  assert.equal(P({ 'mortgage.house1_max_multiple': 4.5 })['mortgage.house1_max_multiple'], 4.5);
  // Paths are extended to 2040 from their last year, and never changed where given.
  const path = extendPath({ 2026: 0.01, 2028: 0.03 });
  assert.equal(path[2027], 0.03);
  assert.equal(path[2040], 0.03);
  assert.equal(path[2026], 0.01);
});

test('a missing or malformed parameter is refused by name, never defaulted', () => {
  assert.deepEqual(problems(P(), 'roads'), []);
  assert.deepEqual(problems(P(), 'route'), []);
  assert.deepEqual(problems(P(), 'appraisal'), []);
  const partial = { ...G.variables };
  delete partial['costs.bridge_rent'];
  partial['income.pay_rise_month'] = [2027, 13];
  const found = problems(buildParams(partial), 'roads');
  assert.ok(found.some((p) => p.startsWith('costs.bridge_rent is missing')));
  assert.ok(found.some((p) => p.startsWith('income.pay_rise_month should be [year, month]')));
  assert.throws(() => assertRunnable(buildParams(partial), 'roads'), /costs\.bridge_rent/);
});

test('months behave as the kit tuples did', () => {
  assert.equal(monthIndex([2027, 1]) - monthIndex([2026, 12]), 1);
  assert.deepEqual(addMonths([2027, 1], -1), [2026, 12]);
  assert.deepEqual(addMonths([2026, 11], 14), [2028, 1]);
  assert.deepEqual(months([2026, 11], [2027, 2]).map(ym), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(months([2027, 2], [2026, 11]), []);
  assert.deepEqual(parseYm('2029-05'), [2029, 5]);
  assert.equal(fmt0(2.5), '2');
  assert.equal(fmt0(-0.4), '-0');
  assert.equal(pyRound(-0.4), 0);
  assert.ok(Object.is(pyRound(-0.4, 0), -0));
});

test('road transforms never change the stored road', () => {
  const raw = G.raw_roads.SH1;
  const before = JSON.stringify(raw);
  withWorksFactor(withHelp(raw, true, helpSettings(P())), 0.7);
  focusRoad(raw, { name: 'x', likely_buy: 300000, works: 20000, fin_lo: 380000, fin_hi: 400000 });
  assert.equal(JSON.stringify(raw), before);
  assert.equal(withWorksFactor(raw, 1), raw, 'a factor of 1 is no transform at all');
});

test('a scenario is data: overrides, a works factor, help on or off', () => {
  const road = G.raw_roads.SH1;
  const h = helpSettings(P());
  const base = runRoad(road, true, P(), {}, h);
  assert.deepEqual(base, simulate(withHelp(road, true, h), P()));
  const noHelp = runRoad(road, true, P(), { help: false }, h);
  assert.deepEqual(noHelp, simulate(road, P()));
  const opt = runRoad(road, true, P(), { overrides: { 'costs.family_cost': 215 }, works_factor: 0.8 }, h);
  assert.ok(headline(opt).forever_today >= headline(base).forever_today, 'cheaper works cannot lower the forever budget here');
});

test('the dearest sustainable bid falls as prices rise past it', () => {
  const h = helpSettings(P());
  const grid = { from: 240000, to: 360000, step: 20000, dep: 0.10 };
  const out = highestSustainableBid(G.raw_roads.SG1, h, P(), grid, [['base', {}], ['promotion', { 'income.pay_rise_2027': 8000 }]]);
  for (const [name, r] of Object.entries(out)) {
    if (r.bid === null) continue;
    assert.ok(r.min_cash >= 0, `${name}: the bid it names must itself be sustainable`);
  }
  if (out.base.bid !== null && out.promotion.bid !== null) assert.ok(out.promotion.bid >= out.base.bid, 'more pay carries at least as much');
});

test('the best road is the first highest, in the order the scores were given', () => {
  assert.equal(bestRoad([['H1', 2], ['H3', 3], ['GE', 1]]), 'H3');
  assert.equal(bestRoad([['H3', 3], ['H1', 3]]), 'H3');
  assert.equal(bestRoad([['H1', 3], ['H3', 3]]), 'H1');
  assert.equal(bestRoad([]), '—');
  assert.equal(feeOn(300000, 6600, 0.045), 13500);
  assert.equal(feeOn(100000, 6600, 0.045), 6600);
  assert.equal(feeOn(300000, 600, 0), 600);
});

test('the bid limit is the walk-away price, capped by the cash ceiling', () => {
  const V = G.appraisal;
  const a = appraise(V, { likely_buy: 300000, fin_lo: 600000, fin_hi: 640000, works: 20000, mins: 10 });
  assert.equal(a.bid_limit, Math.min(a.walk_away_opt, V.ceiling_hard));
  assert.equal(appraise(V, { likely_buy: 300000, fin_lo: 380000, fin_hi: 400000, works: 20000, mins: 10, override_grade: 'Sub-optimal' }).grade, 'Sub-optimal');
});

test('road fit is computed beside the stored score, and unknowns are not failures', () => {
  const criteria = [
    { field: 'mins', op: '<=', value: 40, label: 'within 40 minutes' },
    { field: 'price', op: 'between', value: [330000, 390000], label: 'price band' },
    { field: 'beds', op: 'between', value: [3, 4], label: '3 to 4 beds' },
    { field: 'finished_ratio', op: '>=', value: 1.35, label: 'finished value at least 1.35x' },
    { field: 'detached', op: 'is', value: true, label: 'detached' },
  ];
  const L = { mins: 25, likely_buy: 350000, beds: 3, fin_lo: 470000, fin_hi: 500000 };
  const f = fitScore(L, criteria);
  assert.equal(f.score, 3);
  assert.deepEqual(f.unknown, ['detached']);
  const g = fitScore({ ...L, mins: 60, beds: 5 }, criteria);
  assert.equal(g.score, 2, 'two of four judged criteria is 1.5 of 3, which rounds to 2');
  // One of four met (only the finished-value margin) is 0.75 of 3: a 1.
  assert.equal(fitScore({ ...L, mins: 60, beds: 5, likely_buy: 395000, fin_lo: 540000, fin_hi: 560000 }, criteria).score, 1);
  assert.equal(fitScore({}, criteria).score, null);
  const check = fitCheck(L, [{ code: 'H1', fit: criteria }, { code: 'H4', fit: [{ field: 'mins', op: '<=', value: 10 }] }], [['H1', 2]]);
  assert.deepEqual(check.map((c) => [c.road, c.stored, c.computed, c.agrees]), [['H1', 2, 3, true], ['H4', 0, 0, true]]);
  assert.throws(() => fitScore(L, [{ field: 'mins', op: 'near', value: 1 }]), /unknown fit operator/);
});

test('focus puts a listing into a road and moves the sale and the forever home with it', () => {
  const road = G.raw_roads.SH1;
  const listing = { name: 'Invented listing', likely_buy: 300000, works: 40000, fin_lo: 400000, fin_hi: 440000, pct: 0.04 };
  const r = focusRoad(road, listing, { keys: [2027, 8], stay_months: 24, dep: 0.10 });
  const buy = r.stages.find((s) => s.kind === 'buy');
  assert.deepEqual([buy.label, buy.price, buy.works, buy.E, buy.mmoa, buy.dep, buy.at],
    ['Invented listing', 300000, 40000, 420000, 0.04, 0.10, [2027, 8]]);
  assert.deepEqual(r.stages.find((s) => s.kind === 'sell').at, [2029, 8]);
  assert.deepEqual(r.stages.find((s) => s.kind === 'forever').at, [2029, 8]);
  const res = simulate(withHelp(r, true, helpSettings(P())), P());
  assert.ok(res.ledger.some((e) => e.step === 'Buy Invented listing'));
  assert.throws(() => focusRoad(G.raw_roads.SG1, listing), /no House 1/);
});

test('provenance says how much of a figure rests on estimates', () => {
  const labels = {
    'appraisal.buy_costs': { evidence: 'ESTIMATE', confidence: 'drafted' },
    'appraisal.sell_pct': { evidence: 'VERIFIED', confidence: 'researched' },
    'appraisal.sell_fixed': { evidence: 'STATED', confidence: 'confirmed' },
  };
  const p = provenance(['appraisal.buy_costs', 'appraisal.sell_pct', 'appraisal.sell_fixed', 'help.near.cost'], labels);
  assert.deepEqual(p.by_evidence, { STATED: 1, VERIFIED: 1, ESTIMATE: 1, CHECK: 0, unlabelled: 1 });
  assert.deepEqual(p.soft, ['appraisal.buy_costs', 'help.near.cost']);
  assert.equal(p.trusted_share, 0.25);
  assert.match(trustLine(p), /2 of 4 inputs are estimates or unchecked; 1 of 4 are confirmed/);
  for (const [name, keys] of Object.entries(DEPENDS)) {
    for (const k of keys) assert.ok(REGISTRY_KEYS.has(k), `${name} depends on unregistered ${k}`);
  }
});

test('the privacy guard finds the owner\'s markers in every written form, and nothing near them', async () => {
  const { privateMarkers } = await import('../../tools/road-ahead-lib.mjs');
  // An invented owner: none of these values is anybody's.
  const x = {
    variables: { 'income.gross_salary_now': { value: 54000 }, 'mortgage.mip_amount': { value: 251000 } },
    assumptions: { meta: { owner: 'Ada Examplewright' } },
    data: { decisions: { d: ['within 30 minutes of Nowhereton', 'forever home within 40 minutes of Nowhereton'] }, preferences: {} },
  };
  const { numbers, words } = privateMarkers(x);
  const m = [...numbers, ...words];
  const hit = (s) => m.some((re) => re.test(s));
  for (const s of ['salary 54000', 'salary £54,000 a year', 'about £54k', 'a MIP of 251,000', 'Mrs Examplewright', 'near nowhereton']) {
    assert.ok(hit(s), `should catch: ${s}`);
  }
  for (const s of ['1540000', '54000.5 metres', 'Ada', 'Nowheretonshire', '£251,0001', 'lot 5400']) {
    assert.ok(!hit(s), `should not catch: ${s}`);
  }
});

test("the owner's judgement sits beside the maths, never over it, and says what it costs", async () => {
  const { judged } = await import('../../assets/js/engine/road-ahead/appraise.js');
  const V = G.appraisal;
  const L = { likely_buy: 280000, fin_lo: 380000, fin_hi: 410000, works: 30000, mins: 20, fee: 600 };
  const maths = appraise(V, L);
  assert.equal(maths.judgement, null, 'no judgement, no second figure');
  const withPremium = appraise(V, { ...L, judgement: { premium: 12000, reason: 'the village school', kind: 'personal' } });
  // The maths is untouched.
  for (const k of ['walk_away_opt', 'bid_limit', 'profit_opt', 'grade']) assert.equal(withPremium[k], maths[k], k);
  const j = withPremium.judgement;
  assert.equal(j.walk_away, maths.walk_away_opt + 12000);
  assert.equal(j.difference, 12000);
  assert.ok(j.cost > 0 && j.profit_opt < maths.profit_opt, 'paying more costs profit, and it is stated');
  assert.equal(j.kind, 'personal');
  // A set figure rather than a premium; the cash ceiling still binds the bid.
  const high = appraise(V, { ...L, judgement: { walk_away: V.ceiling_hard + 5000, reason: 'this is the house', kind: 'emotional' } }).judgement;
  assert.equal(high.bid_limit, V.ceiling_hard);
  assert.equal(high.above_ceiling, true);
  // A judgement without a reason is refused: a feeling is weighed, not hidden.
  assert.throws(() => judged(V, L, maths.walk_away_opt, maths.works_opt, { premium: 5000, reason: ' ' }), /reason/);
});

test('the calibration agenda puts the estimates that move the answer most first', async () => {
  const { sensitivity, rangesOf, calibrationAgenda, foreverBudget, walkAwayOf } = await import('../../assets/js/engine/road-ahead/sensitivity.js');
  const rows = Object.fromEntries(Object.entries(G.variables).map(([k, v]) => [k, { value: v }]));
  rows['mortgage.rate'].low = 0.04; rows['mortgage.rate'].high = 0.06;
  const ranges = rangesOf(rows);
  assert.ok(ranges.find((r) => r.key === 'mortgage.rate').stated, 'a stated range is used as given');
  const road = G.raw_roads.SH1;
  const sens = sensitivity(foreverBudget(road, true), G.variables, ranges);
  assert.ok(sens.length > 20);
  for (let i = 1; i < sens.length; i += 1) assert.ok(sens[i - 1].swing >= sens[i].swing, 'largest swing first');
  assert.ok(sens.find((r) => r.key === 'help.near.cost').swing > 0, 'help factors are measured too');
  const labels = { [sens[0].key]: { evidence: 'STATED', confidence: 'confirmed' } };
  const agenda = calibrationAgenda(sens, labels, { top: 5 });
  assert.equal(agenda.length, 5);
  assert.ok(agenda.every((a) => a.why.includes('moves the answer by')));
  if (sens[1].swing > sens[0].swing * 0.1) {
    assert.notEqual(agenda[0].key, sens[0].key, 'a confirmed input gives way to an estimate that moves the answer comparably');
  }
  const L = { likely_buy: 280000, fin_lo: 380000, fin_hi: 410000, works: 30000, mins: 20, fee: 600 };
  const walk = sensitivity(walkAwayOf(L), G.variables, rangesOf(rows));
  assert.ok(walk.find((r) => r.key === 'appraisal.target_profit').swing > 0, 'the target profit drives the walk-away');
  assert.equal(walk.find((r) => r.key === 'income.gross_salary_now')?.swing ?? 0, 0, 'salary does not touch the register');
});
