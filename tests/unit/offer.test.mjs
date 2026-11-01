// The offer engine: the highest price the completion-day cash supports,
// with the reserve untouched. The earlier chat worked its tender by hand
// as (loan + cash + 15,000 - costs - reserve) / 1.05 inside the 5% band,
// rounded down to £50; these tests reproduce that method on INVENTED
// inputs. The owner's own figures live in Supabase only (RA-06).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakdown, maxPrice, tenderRound, cashAt, offerPlan, offerInputs } from '../../assets/js/engine/offer.js';
import { sdlt } from '../../assets/js/engine/road-ahead/money.js';

const terms = (cash, reserve, fees = 3000) => ({
  loan: 300000, maxLtv: 0.95, ftb: true, cash, reserve, fees: [{ amount: fees }],
});
const handWorked = (cash, reserve, fees = 3000) => tenderRound(Math.floor((300000 + cash + 15000 - fees - reserve) / 1.05));

test('golden: bisection agrees with the hand formula inside the 5% band', () => {
  assert.equal(maxPrice(terms(40000, 4000)), 331428);
  assert.equal(tenderRound(maxPrice(terms(40000, 4000))), 331400);
  for (const cash of [30000, 36000, 41000]) {
    for (const r of [0, 2000, 5000]) assert.equal(tenderRound(maxPrice(terms(cash, r))), handWorked(cash, r));
  }
});

test('at the maximum the reserve is exactly kept, and a pound more breaks it', () => {
  const t = terms(40000, 4000);
  const m = maxPrice(t);
  assert.ok(breakdown(m, t).margin >= 0);
  assert.ok(breakdown(m + 1, t).margin < 0);
  assert.equal(breakdown(m, t).sdlt, sdlt(m, true));
});

test('first-time buyer duty: nil to 300k, 5% to 500k, no relief above', () => {
  assert.equal(sdlt(300000, true), 0);
  assert.equal(sdlt(400000, true), 5000);
  assert.equal(sdlt(500000, true), 10000);
  assert.ok(sdlt(500001, true) > 10000);
});

test('a down-valuation cuts the loan to the LTV cap and the cash pays the gap', () => {
  const t = { ...terms(40000, 4000), downValuation: 0.10 };
  const b = breakdown(331400, t);
  assert.ok(Math.abs(b.loan - 0.95 * 331400 * 0.9) < 1e-6);
  assert.ok(b.margin < 0);
});

test('the tender ends in 50 or 00 and never exceeds the maximum', () => {
  for (const p of [331428, 300000, 299999, 50, 49]) {
    assert.equal(tenderRound(p) % 50, 0);
    assert.ok(tenderRound(p) <= p);
  }
});

test('cash on completion adds a month of saving per month after the as-of month', () => {
  assert.equal(cashAt('2027-03', { cashNow: 30000, cashAsOf: '2026-10', savingPerMonth: 1500 }), 30000 + 5 * 1500);
  assert.equal(cashAt('2026-09', { cashNow: 100, cashAsOf: '2026-10', savingPerMonth: 1500 }), 100);
});

const vars = [
  { key: 'mortgage.dip_max_expected', value: 300000, confidence: 'drafted' },
  { key: 'cash.isa_balance_est', value: 30000, confidence: 'confirmed', source_date: '2026-10-30' },
  { key: 'cash.saving_rate_observed', value: 1500, confidence: 'drafted' },
  { key: 'offer.completion_month', value: '2027-03', confidence: 'drafted' },
  { key: 'cash.works_buffer', value: 5000, confidence: 'confirmed' },
  { key: 'fees.conveyancing', label: 'Conveyancing', value: 1700, confidence: 'researched' },
  { key: 'fees.removals', label: 'Removals', value: 600, confidence: 'drafted' },
  { key: 'fees.old', value: 9999 },
  { key: 'mortgage.rate', value: 0.05 },
];

test('inputs come from rows; missing ones are named, not guessed', () => {
  const { ready, inputs } = offerInputs(vars);
  assert.ok(ready);
  assert.equal(inputs.cashAsOf, '2026-10');
  assert.equal(inputs.fees.length, 2);
  assert.equal(offerInputs([]).ready, false);
  assert.ok(offerInputs([]).missing.includes('offer.completion_month'));
});

test('the plan names every unconfirmed input and never hides a shortfall', () => {
  const p = offerPlan(offerInputs(vars).inputs);
  assert.equal(p.tender % 50, 0);
  assert.ok(p.unconfirmed.includes('Decision in principle'));
  assert.ok(p.unconfirmed.includes('Removals'));
  assert.ok(!p.unconfirmed.includes('Savings now'));
  assert.ok(p.shortcomings.some((s) => s.startsWith('Valuation 10%')));
  const later = p.byMonth.map((m) => m.maxPrice);
  for (let i = 1; i < later.length; i += 1) assert.ok(later[i] >= later[i - 1]);
});
