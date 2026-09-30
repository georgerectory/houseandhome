// road-ahead-kit-tests.mjs - the Rectory kit's 43 tests (model/tests.py),
// run against the JavaScript engine.
//
// The kit ran these before any result was used; so does Road Ahead. They
// are written against whatever parameters they are given, so the same
// checks run twice: on the owner's figures in the private checksum gate,
// and on invented figures in CI (tests/unit/road-ahead-kit.test.mjs).
// Where the kit pinned a private value - "salary in March 2027 is ..." -
// the check is against the parameter itself, so the mechanism is proven
// and no figure is written into this public file.
//
// Two of the kit's checks are about the owner's own figures rather than
// the engine (how a pay rise is taxed, and who earns); they would say
// private things in a public file, so they are not repeated here - the
// checksum gate reads their result from the kit's own run, recorded in
// the private extract. Six more check the kit's data files and run only
// where those are present; on invented inputs ({ synthetic: true }) the
// other 35 run.

import {
  pmt, sdlt, salary, netPay, growthIndex, maxEndgamePrice, addMonths, monthIndex, ym, runRoute,
} from '../assets/js/engine/road-ahead/index.js';

/**
 * @param {{data?:object, assumptions?:object}|null} X the extract, or null for none
 * @param {(...overrides:object[]) => object} build parameter builder for the route model
 * @param {{synthetic?:boolean}} [opts] invented inputs: skip the checks on the kit's own data files
 * @returns {Array<{name:string, ok:boolean, detail?:*}>}
 */
export function kitTests(X, build, { synthetic = false } = {}) {
  const P = build();
  const out = [];
  const ok = (name, cond, detail) => out.push({ name, ok: Boolean(cond), detail });
  const run = (route, scen = 'base', ov = null, monthly = false) => runRoute(P, route, scen, ov, monthly);

  // 1. Finance primitives.
  ok('pmt 270k at 5.1% over 30 years is about 1,466', Math.abs(pmt(270000, 0.051) - 1466) < 1.5);
  ok('SDLT first-time 300k = 0', sdlt(300000, true) === 0);
  ok('SDLT first-time 400k = 5,000', Math.abs(sdlt(400000, true) - 5000) < 0.01);
  ok('SDLT first-time 500k = 10,000', Math.abs(sdlt(500000, true) - 10000) < 0.01);
  ok('SDLT first-time 500,001 loses the relief', Math.abs(sdlt(500001, true) - sdlt(500001)) < 0.01 && sdlt(500001) > 15000);
  ok('SDLT standard 300k = 5,000', Math.abs(sdlt(300000) - 5000) < 0.01);
  ok('SDLT standard 550k = 17,500', Math.abs(sdlt(550000) - 17500) < 0.01);
  ok('SDLT standard 1m = 43,750', Math.abs(sdlt(1000000) - 43750) < 0.01);

  // 2. The salary path: the 2027 rise counted once.
  const gross = P['income.gross_salary_now'];
  const s27 = gross + P['income.pay_rise_2027'];
  const [ry, rm] = P['income.pay_rise_month'];
  const [by, bm] = addMonths([ry, rm], -1);
  ok('salary the month before the 2027 rise is today\'s', salary(P, by, bm) === gross);
  ok('salary from the 2027 rise includes it', salary(P, ry, rm) === s27);
  ok('salary in March 2028 has no yearly rise yet', salary(P, 2028, 3) === s27);
  ok('salary in April 2028 has one yearly rise', salary(P, 2028, 4) === s27 + P['income.annual_rise_from_2028']);
  ok('net pay at the start is today\'s', netPay(P, ...P['timeline.start']) === P['income.net_pay_now']);

  // 3. The index and the solver.
  ok('a flat market leaves the index at 1', Math.abs(growthIndex(P, 'flat', [2026, 10], [2033, 9]) - 1) < 1e-12);
  const cash = 150000;
  const cap = 405000;
  const p = maxEndgamePrice(P, cash, cap);
  const need = (q) => q - Math.min(cap, 0.9 * q) + sdlt(q) + P['transaction.buy_costs'] + P['mortgage.endgame_reserve'];
  ok('the solver finds a price that is affordable, and 1k more that is not', need(p) <= cash + 1 && need(p + 1000) > cash);

  // 4. Route invariants and direction of effect.
  const base = { sell: [2033, 9] };
  const [o] = run(base);
  ok('House 1 borrows no more than 95%', o.h1_ltv <= 0.95);
  ok('the forever home borrows no more than 90%', o.endgame_ltv <= 0.9 + 1e-9);
  ok('cash never goes negative before the move', o.min_cash_pre_move >= 0);
  const [of] = run(base, 'flat');
  const [ofz] = run(base, 'flat', { 'endgame.segment_premium': 0 });
  ok("in a flat market, with no premium on the target market, today's money equals the price",
    ofz.endgame_today === ofz.endgame_nominal);
  ok('a higher rate lowers the forever budget', run(base, 'base', { 'mortgage.rate': 0.065 })[0].endgame_nominal < o.endgame_nominal);
  ok('no pay rise lowers it', run(base, 'base', { 'income.pay_rise_2027': 0 })[0].endgame_nominal < o.endgame_nominal);
  ok('in a flat market a later move raises it',
    run({ sell: [2032, 9] }, 'flat')[0].endgame_nominal > run({ sell: [2031, 9] }, 'flat')[0].endgame_nominal);
  ok('a works overrun lowers it', run(base, 'base', { works_overrun: 1.3 })[0].endgame_nominal < o.endgame_nominal);
  ok('less value added lowers it', run(base, 'base', { 'house1.uplift': 1.0 })[0].endgame_nominal < o.endgame_nominal);

  // 4b. The researched mechanics.
  ok('a 5.5x multiple adds under 5k where affordability binds',
    run(base, 'base', { 'mortgage.endgame_income_multiple': 5.5 })[0].endgame_nominal - o.endgame_nominal < 5000);
  ok('one more child lowers the forever budget',
    run(base, 'base', { 'costs.children': P['costs.children'] + 1 })[0].endgame_nominal < o.endgame_nominal);
  ok('a 35-year term raises it', run(base, 'base', { 'mortgage.endgame_term_years': 35 })[0].endgame_nominal > o.endgame_nominal);
  ok('salary sacrifice lowers the income-multiple cap',
    run(base, 'base', { 'income.salary_sacrifice_annual': 6000, 'mortgage.endgame_income_multiple': 4.0 })[0].endgame_lti_cap < o.endgame_lti_cap);
  ok("a faster-rising target market lowers today's budget",
    run(base, 'base', { 'endgame.segment_premium': 0.01 })[0].endgame_today < o.endgame_today);
  const [, log] = run(base, 'base', { 'mortgage.refix_rate': 0.035 }, true);
  const fixEnd = addMonths(P['timeline.house1_keys'], 12 * P['mortgage.fix_years']);
  const pay = (at) => log.find((r) => r.ym === ym(at))?.mortgage;
  ok('a refix at a lower rate cuts the payment', pay(addMonths(fixEnd, 3)) < pay(addMonths(fixEnd, -3)));
  const [w45] = run(base, 'flat', { 'house1.works': P['house1.works'] + 11000 });
  ok('past the done standard, 11k more works adds under 11k of value', w45.h1_sale - of.h1_sale < 11000);
  const planned = P['income.student_loan_end'];
  const early = monthIndex(planned) > monthIndex([2031, 4]) ? [2031, 4] : addMonths(planned, -24);
  ok('clearing the student loan sooner raises the forever budget',
    run(base, 'base', { 'income.student_loan_end': early })[0].endgame_nominal > o.endgame_nominal);
  ok('bridging rent reduces the cash at the keys', run(base, 'base', { 'costs.bridge_rent': 0 })[0].cash_at_keys > o.cash_at_keys);
  const [ri] = run({ sell: [2034, 9], rent_invest: true }, 'flat');
  ok('rent and invest keeps first-time stamp duty up to 500k',
    ri.endgame_ftb && (ri.endgame_nominal > 500000 || Math.abs(ri.endgame_stamp - sdlt(ri.endgame_nominal, true)) < 2));
  const [rh] = run({ sell: null, rent_invest: true }, 'flat', { 'counterfactual.equity_return': 0.06 });
  const [iy, im] = P['counterfactual.invest_month'];
  ok('an invested sum compounds at about 6% a year',
    Math.abs(rh.portfolio_2034 - P['counterfactual.invest_amount'] * 1.06 ** ((2034 - iy) + (12 - im) / 12)) < 600);

  // 5. Data integrity, where the kit's data is here.
  const D = X?.data;
  const A = X?.assumptions;
  if (D && A && !synthetic) {  // the kit's own data files
    ok('evidence rows have seven fields', D.evidence.every((r) => r.length === 7));
    const dec = D.decisions.decisions;
    ok('decision ids are unique', new Set(dec.map((d) => d.id)).size === dec.length);
    ok('decisions carry id, question, status, door and date', dec.every((d) => ['id', 'q', 'status', 'door', 'date'].every((k) => k in d)));
    ok('checkpoints are only CP entries', D.decisions.checkpoints.every((c) => String(c.id).startsWith('CP')));
    ok('decision statuses are valid', dec.every((d) => ['locked', 'lean', 'open', 'superseded', 'rejected'].includes(d.status)));
    const missing = [];
    for (const [g, items] of Object.entries(A)) {
      if (['meta', 'market', 'timeline'].includes(g)) continue;
      for (const [k, x] of Object.entries(items)) if (x && typeof x === 'object' && !Array.isArray(x) && !('label' in x)) missing.push(`${g}.${k}`);
    }
    ok('every assumption is labelled', missing.length === 0, missing);
  }
  return out;
}
