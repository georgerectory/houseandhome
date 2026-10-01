// The Road Ahead engine against the Rectory kit's own Python, on invented
// inputs. tests/fixtures/road-ahead-golden.json was written by
// tools/road-ahead-golden.py running the kit's code; nothing in it is the
// owner's. Every answer must match exactly - month-by-month cash traces
// to the pound, Python's half-even rounding at every tie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  pyRound, sdlt, pmtN, annuityPv, growthIndex, salary, netPay, lenderIncome, endgameMaxLoan, maxEndgamePrice,
  buildParams, helpSettings, simulate, runRoute, withHelp, withWorksFactor, sustainability, appraise,
} from '../../assets/js/engine/road-ahead/index.js';

const G = JSON.parse(readFileSync(new URL('../fixtures/road-ahead-golden.json', import.meta.url), 'utf8'));
const P = (...ov) => buildParams(G.variables, ...ov);
const help = helpSettings(P());

/** Every leaf equal; -0 and 0 are the same number, as they are to Python. */
function diff(got, want, at = '', out = []) {
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) out.push(`${at}: length ${got?.length} vs ${want.length}`);
    else want.forEach((w, i) => diff(got[i], w, `${at}[${i}]`, out));
  } else if (want !== null && typeof want === 'object') {
    if (!got || typeof got !== 'object') out.push(`${at}: ${JSON.stringify(got)} vs an object`);
    else for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) diff(got[k], want[k], `${at}.${k}`, out);
  } else if (got !== want) out.push(`${at}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
  return out;
}
const same = (got, want, label) => {
  const d = diff(got, want);
  assert.equal(d.length, 0, `${label}: ${d.length} differences, first: ${d.slice(0, 5).join('; ')}`);
};

test('pyRound is Python round(): 2,000 cases, the ties included', () => {
  for (const [x, nd, want] of G.rounding) {
    const got = pyRound(x, nd);
    assert.ok(got === want && Object.is(got, -0) === Object.is(want, -0), `round(${x}, ${nd}) = ${want}, got ${got}`);
  }
  for (const [x, want] of G.rounding_int) assert.equal(pyRound(x), want, `round(${x})`);
});

test('primitives: stamp duty, repayments, index, pay, lender cap, dearest price', () => {
  const Pb = P();
  for (const [p, ftb, want] of G.primitives.sdlt) assert.equal(sdlt(p, ftb), want, `sdlt(${p}, ${ftb})`);
  // Repayments go through pow, which Python and V8 may round differently
  // in the last bit; everything downstream is rounded, so parts in 10^12
  // is the honest tolerance here.
  const near = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));
  for (const [L, r, n, want] of G.primitives.pmt) assert.ok(near(pmtN(L, r, n), want), `pmt(${L}, ${r}, ${n})`);
  for (const [pay, r, n, want] of G.primitives.annuity) assert.ok(near(annuityPv(pay, r, n), want), `annuity(${pay}, ${r}, ${n})`);
  for (const [s, u, want] of G.primitives.growth) {
    assert.ok(Math.abs(growthIndex(Pb, 'base', s, u) - want) < 1e-13, `growth ${s} -> ${u}`);
  }
  for (const [y, m, s, n, l] of G.primitives.pay) {
    assert.equal(salary(Pb, y, m), s, `salary ${y}-${m}`);
    assert.ok(Math.abs(netPay(Pb, y, m) - n) < 1e-9, `net ${y}-${m}`);
    assert.equal(lenderIncome(Pb, y, m), l, `lender income ${y}-${m}`);
  }
  for (const [y, m, f, want] of G.primitives.max_loan) {
    const got = endgameMaxLoan(Pb, y, m, f);
    want.forEach((w, i) => assert.ok(Math.abs(got[i] - w) < 1e-6 * Math.max(1, Math.abs(w)), `max loan ${y}-${m}`));
  }
  for (const [cash, cap, ftb, want] of G.primitives.max_price) {
    assert.ok(Math.abs(maxEndgamePrice(Pb, cash, cap, ftb) - want) < 1e-6, `max price ${cash} ${cap} ${ftb}`);
  }
});

test('local help and the works factor transform a road as the kit did', () => {
  for (const c of G.roads) {
    let road = c.help === 'help' ? withHelp(G.raw_roads[c.road], c.near, help) : G.raw_roads[c.road];
    if (c.works_factor != null) road = withWorksFactor(road, c.works_factor);
    same(road, c.road_as_run, `${c.road} ${c.help} ${c.variant}`);
  }
});

/**
 * While works are held at the cash buffer the balance sits on it for
 * months, equal to the pound. Which of those months Python calls the
 * lowest is decided by the last bit of its pow; the engine takes the
 * first. A different month is accepted only when both show the same
 * cash, to the pound, and it is the lowest the trace goes.
 */
function tiedLowestMonth(got, want) {
  if (got.min_cash_when === want.min_cash_when) return false;
  const cashIn = (m) => got.trace.find(([when]) => when === m)?.[1];
  const lowest = Math.min(...got.trace.map(([, c]) => c));
  return cashIn(got.min_cash_when) === lowest && cashIn(want.min_cash_when) === lowest;
}

test(`every road run is identical to the kit's, month by month (${G.roads.length} runs)`, (t) => {
  let ties = 0;
  for (const c of G.roads) {
    const got = simulate(c.road_as_run, P(c.overrides));
    if (tiedLowestMonth(got, c.result)) { got.min_cash_when = c.result.min_cash_when; ties += 1; }
    if (!('trace' in c.result)) delete got.trace;
    same(got, c.result, `${c.road} ${c.help} ${c.variant}${c.works_factor ? ` x${c.works_factor}` : ''}`);
  }
  t.diagnostic(`${ties} of ${G.roads.length} runs name a different month among tied lowest ones; all else identical`);
});

test('the Golden Egg sustainability sweep', () => {
  const pays = Object.entries(G.sweep.pays).map(([name, ov]) => [name, P(ov)]);
  const road = { ...G.raw_roads.SG1 };
  same(sustainability(road, help, G.sweep.points, pays), G.sweep.result, 'sweep');
});

test(`the route model matches the kit on every route and market (${G.routes.length} runs)`, () => {
  for (const c of G.routes) {
    const [got] = runRoute(P(), { ...c.spec, sell: c.spec.sell ?? null }, c.scen, c.overrides);
    same(got, c.result, `${c.route} ${c.scen} ${JSON.stringify(c.overrides)}`);
  }
  const [got, log] = runRoute(P(), { ...G.route_log.spec }, G.route_log.scen, null, true);
  same(got, G.route_log.result, 'monthly route');
  same(log, G.route_log.log, 'monthly log');
});

test(`the register scores every invented listing as the kit did (${G.register.length})`, () => {
  for (const c of G.register) {
    const got = appraise(G.appraisal, c.listing);
    const pick = Object.fromEntries(Object.keys(c.result).map((k) => [k, got[k]]));
    same(pick, c.result, c.listing.kit_ref);
  }
});
