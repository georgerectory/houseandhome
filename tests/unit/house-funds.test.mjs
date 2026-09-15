// What is actually held, netted.
//
// These assertions exist because the two numbers here are easy to blur
// and expensive to get wrong: what is YOURS, and what you could lay
// hands on if you drew every facility. A deposit is built from the
// first. Confusing them overstates a deposit by the size of an
// overdraft, and a lender will not make the same mistake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { houseFunds } from '../../assets/js/core/store.js';

const acct = (o = {}) => ({
  id: Math.random().toString(36).slice(2), name: 'Account', kind: 'savings',
  is_liability: false, balance: 0, facility_limit: null, earmark_pct: 0,
  confidence: 'actual', is_active: true, ...o,
});
const d = (accounts) => ({ accounts });

test('an asset adds and a liability subtracts, without either carrying a sign', () => {
  const f = houseFunds(d([
    acct({ balance: 1000 }),
    acct({ balance: 300, is_liability: true }),
  ]));
  assert.equal(f.totalAssets, 1000);
  assert.equal(f.totalLiabilities, 300, 'a debt is stored as a positive amount OWED');
  assert.equal(f.netPosition, 700);
});

test('only trusted balances count - an unconfirmed one contributes nothing', () => {
  const f = houseFunds(d([
    acct({ balance: 1000, confidence: 'actual' }),
    acct({ balance: 9999, confidence: 'carried_over' }),
    acct({ balance: 5555, confidence: 'drafted' }),
  ]));
  assert.equal(f.netPosition, 1000);
  assert.equal(f.unconfirmed.length, 2, 'and they are reported, not silently dropped');
});

test('confirmed counts as well as actual', () => {
  assert.equal(houseFunds(d([acct({ balance: 500, confidence: 'confirmed' })])).netPosition, 500);
});

test('an unconfirmed LIABILITY is also excluded, so a position is never flattered', () => {
  const f = houseFunds(d([
    acct({ balance: 1000 }),
    acct({ balance: 400, is_liability: true, confidence: 'carried_over' }),
  ]));
  assert.equal(f.netPosition, 1000, 'excluding it OVERSTATES the position, which is why it is reported');
  assert.equal(f.unconfirmed.length, 1);
});

test('earmarking is a share of a balance, not a separate pot', () => {
  const f = houseFunds(d([
    acct({ balance: 10000, earmark_pct: 100 }),
    acct({ balance: 1000, earmark_pct: 50 }),
    acct({ balance: 500, earmark_pct: 0 }),
  ]));
  assert.equal(f.earmarkedAssets, 10500);
  assert.equal(f.totalAssets, 11500);
});

// --- The distinction that matters ------------------------------------

test('an UNDRAWN facility adds to what you can draw and nothing to what is yours', () => {
  const f = houseFunds(d([acct({ balance: 392.62, facility_limit: 1000 })]));
  assert.equal(f.netPosition, 392.62, 'the overdraft is not savings');
  assert.equal(f.undrawnFacilities, 1000);
  assert.equal(f.availableToDraw, 1392.62);
});

test('a DRAWN facility reduces the headroom and the net position together', () => {
  // Overdrawn by 607.38 against a 1000 limit: 392.62 of headroom left.
  const f = houseFunds(d([
    acct({ balance: 607.38, is_liability: true, facility_limit: 1000 }),
  ]));
  assert.equal(f.netPosition, -607.38);
  assert.equal(Math.round(f.undrawnFacilities * 100) / 100, 392.62);
  assert.equal(Math.round(f.availableToDraw * 100) / 100, -214.76,
    'drawing an overdraft moves money from available to owed; it creates none');
});

test('drawing a facility leaves availableToDraw unchanged - that is the whole point', () => {
  const before = houseFunds(d([acct({ balance: 1000, facility_limit: 500 })]));
  // Spend the 1000, then draw 500 of the facility: same spending power.
  const after = houseFunds(d([acct({ balance: 500, is_liability: true, facility_limit: 500 })]));
  assert.equal(before.availableToDraw, 1500);
  assert.equal(after.availableToDraw, -500);
  assert.equal(before.netPosition - after.netPosition, 1500,
    'what changed is the net position, by exactly what was spent');
});

test('a facility cannot contribute negative headroom when it is over its limit', () => {
  const f = houseFunds(d([
    acct({ balance: 1500, is_liability: true, facility_limit: 1000 }),
  ]));
  assert.equal(f.undrawnFacilities, 0, 'clamped: being over the limit is not negative borrowing');
});

test('an unconfirmed account contributes no headroom either', () => {
  const f = houseFunds(d([acct({ balance: 0, facility_limit: 5000, confidence: 'drafted' })]));
  assert.equal(f.undrawnFacilities, 0);
  assert.equal(f.availableToDraw, 0);
});

// --- Edges -----------------------------------------------------------

test('no accounts is zero, not a crash', () => {
  const f = houseFunds({});
  assert.equal(f.netPosition, 0);
  assert.deepEqual(f.accounts, []);
});

test('a null balance is zero, not NaN', () => {
  const f = houseFunds(d([acct({ balance: null }), acct({ balance: undefined })]));
  assert.equal(f.netPosition, 0);
  assert.ok(!Number.isNaN(f.netPosition));
});

test('a closed account is left out entirely', () => {
  const f = houseFunds(d([acct({ balance: 100 }), acct({ balance: 900, is_active: false })]));
  assert.equal(f.netPosition, 100);
  assert.equal(f.accounts.length, 1);
});

test('the real recorded position reconciles', () => {
  // ISA 37341.84 earmarked 100%, current account 392.62 with a 1000
  // facility undrawn, Barclaycard 307 carried over and therefore counted
  // toward nothing.
  const f = houseFunds(d([
    acct({ name: 'Trading 212 Stocks ISA', kind: 'isa', balance: 37341.84, earmark_pct: 100 }),
    acct({ name: 'Current account', kind: 'current_account', balance: 392.62, facility_limit: 1000 }),
    acct({ name: 'Barclaycard', kind: 'credit_card', balance: 307, is_liability: true,
      confidence: 'carried_over' }),
  ]));
  assert.equal(Math.round(f.netPosition * 100) / 100, 37734.46);
  assert.equal(Math.round(f.availableToDraw * 100) / 100, 38734.46);
  assert.equal(f.unconfirmed.length, 1, 'the card is unconfirmed and excluded');
});
