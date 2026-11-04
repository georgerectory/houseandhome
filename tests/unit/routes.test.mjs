// Routes to the next home: invented inputs only (RA-06).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payAt, balanceAfter, valueAt, cashNeeded, walk, priceToMatch } from '../../assets/js/engine/routes.js';
import { sdlt } from '../../assets/js/engine/road-ahead/money.js';

const p = { start: '2027-01', cash: 30000, gross: 50000, grossRise: 2000, net: 3000, netRise: 100, bonus: 1000, spend: 1200, horizon: 60 };
const next = { price: 300000, multiple: 5, maxLtv: 0.95, costs: 2000, reserve: 1000 };

test('pay rises each April after the start, not before', () => {
  assert.equal(payAt('2027-03', p).gross, 50000);
  assert.equal(payAt('2027-04', p).gross, 52000);
  assert.equal(payAt('2028-04', p).net, 3200);
});

test('a loan is repaid to nothing over its term, and a path is straight between points', () => {
  assert.ok(Math.abs(balanceAfter(100000, 0.05, 25, 300)) < 1e-6);
  assert.equal(valueAt([['2027-01', 100], ['2028-01', 112]], '2027-07'), 106);
  assert.equal(valueAt([['2027-01', 100], ['2028-01', 112]], '2030-01'), 112);
});

test('a first-time buyer needs less cash than a mover at the same price', () => {
  assert.ok(cashNeeded(300000, 50000, next, true) < cashNeeded(300000, 50000, next, false));
  assert.equal(cashNeeded(300000, 50000, next, false) - cashNeeded(300000, 50000, next, true), sdlt(300000, false) - sdlt(300000, true));
});

const buy = { kind: 'buy', price: 250000, depositPct: 0.1, rate: 0.05, years: 30, buyCosts: 1500, productFee: 0,
  ercByYear: [0.03, 0.02], sell: true, saleFeePct: 0.01, saleFixed: 1500, path: [['2027-01', 250000], ['2032-01', 280000]] };

test('a rent route keeps first-time-buyer duty; a buy route sells and pays full duty next', () => {
  const rent = walk(p, { kind: 'rent', rent: 1000, deposit: 1200 }, next);
  const own = walk(p, buy, next);
  assert.ok(rent.reached);
  assert.ok(own.rows.every((r) => r.month >= '2027-02'));
  assert.ok(own.loan === 225000);
});

test('an early repayment charge lowers what a sale returns inside the fix', () => {
  const a = walk(p, buy, next).rows[11];
  const b = walk(p, { ...buy, ercByYear: [] }, next).rows[11];
  assert.ok(b.saleNet - a.saleNet > 0);
});

test('the price that matches a month is the highest that reaches it in time', () => {
  const target = walk(p, { kind: 'rent', rent: 1000, deposit: 1200 }, next).reached;
  const pr = priceToMatch(p, buy, next, target, { low: 150000, high: 300000 });
  if (pr) {
    assert.ok(walk(p, { ...buy, price: pr }, next).reached <= target);
    const up = walk(p, { ...buy, price: pr + 500 }, next).reached;
    assert.ok(up === null || up > target);
  }
});
