// simulate.js - one road, month by month: where you live, what you buy
// and sell, what the works cost, and the cash left at every step.
//
// A port of the Rectory kit's roads_v3.run, which every road result in
// the kit came from. The order of operations is part of the answer, so
// it is kept exactly: in each month the events happen first (a sale
// before the purchase it pays for), then the month's cash flow.
//
// A ROAD is data: { stages: [...], horizon?: [y, m] }. A stage is one
// of
//   { kind: 'rent', at }                          starts renting
//   { kind: 'buy' | 'forever', at, label, price,  a purchase; price is a
//     dep?, E?, works?, wm?, bills?, mmoa?,         number or 'max', the
//     cap_price?, keep_for_works? }                 dearest the loan and
//                                                   cash allow
//   { kind: 'sell', at }                          sells the current home
//   { kind: 'plot_sale', at, amount, costs, value_loss?, spent? }
//
// Everything that varies between runs arrives in P (scenario overrides
// are applied by the caller) or in opts. The defaults below are the
// kit's own, kept only so a stage written the kit's way reads the same.

import {
  pyRound, fmt0, monthIndex, addMonths, months, ym,
  pmtN, sdlt, salary, netPay, growthIndex, endgameMaxLoan,
} from './money.js';

const STAGE_DEFAULTS = Object.freeze({
  dep: 0.10, capPrice: 900000, floorPrice: 100000, priceStep: 1000,
  foreverReserve: 10000, bills: 560, wm: 12,
});

/** How far through its works a home is, 0 to 1. */
const shareDone = (home) => Math.min(1, home.spent / Math.max(1, home.works));

/**
 * Run one road.
 * @param {{stages: object[], horizon?: [number, number]}} road
 * @param {object} P parameters, scenario overrides already applied
 * @param {{familyUntil?: [number, number], market?: string}} [opts]
 * @returns {object} the kit's result shape: trace, ledger, min_cash,
 *   min_cash_when, fa_used, spare, and end_* and forever_* when they apply
 */
export function simulate(road, P, opts = {}) {
  const START = P['timeline.start'];
  const familyUntil = opts.familyUntil ?? P['timeline.family_until'];
  const g = P.market[opts.market ?? 'base'];
  const idx = (a, b) => growthIndex(P, g, a, b);
  const infl = (y, m) => (1 + P['costs.cost_inflation']) ** ((y - START[0]) + (m - START[1]) / 12);
  const faAfter = P['fa.after_months'];
  const faMaxLtv = P['fa.max_ltv'];
  const fixMonths = P['roads.fix_months'];
  const mmoaMin = P['fees.mmoa_min'];
  const horizon = road.horizon ?? P['roads.horizon'];

  const events = new Map();
  for (const s of road.stages) {
    const k = monthIndex(s.at);
    if (!events.has(k)) events.set(k, []);
    events.get(k).push(s);
  }

  let cash = P['cash.start_cash'];
  let ftb = true;
  let home = null;
  const led = [];
  const spareLog = new Map();
  let loan = 0;
  let mp = 0;
  let rate = 0;
  let nEl = 0;
  let fixEnd = null;
  let minCash = [1e9, null];
  let faUsed = 0;
  const trace = [];
  const lenderCap = (y, m, f) => {
    const [, , aff] = endgameMaxLoan(P, y, m, f);
    return Math.min(aff, salary(P, y, m) * P['mortgage.house1_max_multiple']);
  };

  for (const [y, m] of months(START, horizon)) {
    const f = infl(y, m);
    const net = netPay(P, y, m);
    const here = monthIndex([y, m]);

    // ---------------- events: sell, then buy ----------------
    for (const ev of events.get(here) ?? []) {
      if (ev.kind === 'sell' && home) {
        const val = (home.price + shareDone(home) * (home.E_p - home.price)) * idx(home.at, [y, m]);
        const sc = val * P['transaction.sell_pct'] + P['transaction.sell_fixed'];
        cash += val - loan - sc;
        const profit = val - home.price - home.st - home.fees - home.spent - sc;
        led.push({
          date: ym([y, m]), step: `Sell ${home.label}`, sale: pyRound(val, -3),
          loan_repaid: pyRound(loan, -3), sale_costs: pyRound(sc, -2),
          works_done: pyRound(home.spent, -3), works_left: pyRound(home.works - home.spent, -3),
          profit: pyRound(profit, -3), cash_after: pyRound(cash, -3),
        });
        home = null; loan = 0; mp = 0;
      }
      if (ev.kind === 'plot_sale' && home) {
        const gross = ev.amount * idx(START, [y, m]);
        const netPlot = gross - ev.costs;
        cash += netPlot;
        home.E_p -= ev.value_loss ?? 0;
        led.push({
          date: ym([y, m]), step: 'Sell building plot (with planning)', sale: pyRound(gross, -3),
          sale_costs: ev.costs, profit: pyRound(netPlot - (ev.spent ?? 0), -3), cash_after: pyRound(cash, -3),
        });
      }
      if (ev.kind === 'buy' || ev.kind === 'forever') {
        const cap = lenderCap(y, m, f);
        const dep = ev.dep ?? STAGE_DEFAULTS.dep;
        const reserve = ev.keep_for_works ?? (ev.kind === 'forever' ? STAGE_DEFAULTS.foreverReserve : 0);
        const fixedCosts = P['transaction.buy_costs'] + P['transaction.day_one_kit'];
        let price;
        if (ev.price === 'max') {
          // The dearest price the lender cap allows that still leaves
          // the works reserve, walked down a thousand at a time.
          price = ev.cap_price ?? STAGE_DEFAULTS.capPrice;
          while (price > STAGE_DEFAULTS.floorPrice) {
            const ln = Math.min(cap, price * (1 - dep));
            const need = price - ln + sdlt(price, ftb) + fixedCosts;
            if (need <= cash - reserve) break;
            price -= STAGE_DEFAULTS.priceStep;
          }
        } else {
          price = ev.price;
        }
        const fee = ev.mmoa ? Math.max(price * ev.mmoa, mmoaMin) : 0;
        const ln = ev.price === 'max' ? Math.min(cap, price * (1 - dep)) : price * (1 - dep);
        const st = sdlt(price + fee, ftb);
        const fees = fixedCosts + fee;
        const need = price - ln + st + fees;
        const flags = [];
        if (ln > cap * 1.001) flags.push(`loan £${fmt0(ln / 1000)}k above lender cap £${fmt0(cap / 1000)}k`);
        if (need > cash) flags.push(`short of cash by £${fmt0((need - cash) / 1000)}k`);
        cash -= need;
        loan = ln;
        const ltv = ln / price;
        rate = P['mortgage.rate'] + (ltv > 0.90 ? P['mortgage.rate_premium_95'] : 0);
        mp = pmtN(loan, rate, P['mortgage.term_years'] * 12);
        nEl = 0;
        fixEnd = monthIndex(addMonths([y, m], fixMonths));
        const E = (ev.E ?? price) * idx(START, [y, m]);
        home = {
          label: ev.label, at: [y, m], price, E_p: Math.max(E, price), works: ev.works ?? 0,
          wm: ev.wm ?? STAGE_DEFAULTS.wm, spent: 0, bills: ev.bills ?? STAGE_DEFAULTS.bills, st, fees,
        };
        led.push({
          date: ym([y, m]),
          step: (ev.kind === 'buy' ? 'Buy ' : 'Buy forever home: ') + ev.label,
          price, deposit: pyRound(price - ln, -2), stamp: pyRound(st, -2), fees: pyRound(fees, -2),
          loan: pyRound(ln, -3), lti: pyRound(ln / salary(P, y, m), 2),
          monthly: pyRound(mp + home.bills * f, -1), cash_after: pyRound(cash, -3),
          salary: pyRound(salary(P, y, m), -2), flags,
          today: pyRound(price / idx(START, [y, m]), -3),
        });
        ftb = false;
      }
    }

    // ---------------- the month's cash flow ----------------
    const fam = here >= monthIndex(P['costs.family_from']) ? P['costs.family_cost'] * f : 0;
    let spare;
    let where;
    if (home) {
      if (here === fixEnd) {
        rate = P['mortgage.refix_rate'];
        mp = pmtN(loan, rate, P['mortgage.term_years'] * 12 - nEl);
      }
      loan -= mp - loan * rate / 12;
      nEl += 1;
      spare = net - (P['costs.living_after_move'] + home.bills) * f - mp - fam;
      const left = home.works - home.spent;
      // One further advance, a set number of months after purchase, to
      // keep the works going when the cash will not.
      if (left > 0 && nEl === faAfter && cash < left) {
        const val = (home.price + (home.spent / Math.max(1, home.works)) * (home.E_p - home.price)) * idx(home.at, [y, m]);
        const capNow = lenderCap(y, m, f);
        const fa = Math.max(0, Math.min(left - Math.max(0, cash - P['cash.works_buffer']), faMaxLtv * val - loan, capNow - loan));
        if (fa > 1000) {
          loan += fa; cash += fa; faUsed += fa;
          mp = pmtN(loan, rate, P['mortgage.term_years'] * 12 - nEl);
          led.push({
            date: ym([y, m]), step: 'Further advance for works', loan: pyRound(fa, -3),
            monthly: pyRound(mp + home.bills * f, -1), cash_after: pyRound(cash, -3),
          });
        }
      }
      const rateM = home.works / Math.max(1, home.wm);
      const spend = left > 0 ? Math.max(0, Math.min(left, rateM, cash + spare - P['cash.works_buffer'])) : 0;
      home.spent += spend;
      cash += spare - spend;
      where = 'own';
    } else if (here <= monthIndex(familyUntil)) {
      spare = net - P['cash.pre_purchase_spend'] * f;
      cash += spare;
      where = 'family';
    } else {
      spare = net - P['costs.living_after_move'] * f - P['costs.bridge_rent'] * f - fam;
      cash += spare;
      where = 'rent';
    }
    const key = `${where}:${home ? home.label : where}`;
    if (!spareLog.has(key)) spareLog.set(key, []);
    spareLog.get(key).push(spare);
    // The first month at the lowest cash. While works are held at the
    // buffer the balance sits on it for months, equal to the pound; a
    // millionth of a pound of float noise must not decide which month
    // is "lowest" (Python's and V8's pow differ in the last bit).
    if (cash < minCash[0] - 1e-6) minCash = [cash, ym([y, m])];
    trace.push([ym([y, m]), pyRound(cash), where]);
  }

  const spareOut = {};
  for (const [k, v] of spareLog) spareOut[k] = pyRound(v.reduce((a, b) => a + b, 0) / v.length, -1);
  const res = {
    trace, ledger: led, min_cash: pyRound(minCash[0], -3), min_cash_when: minCash[1],
    fa_used: pyRound(faUsed, -3), spare: spareOut,
  };
  if (home) {
    const val = (home.price + shareDone(home) * (home.E_p - home.price)) * idx(home.at, horizon);
    const deflate = idx(START, horizon);
    Object.assign(res, {
      end_home: home.label, end_value_today: pyRound(val / deflate, -3),
      works_done: pyRound(home.spent, -3), works_left: pyRound(home.works - home.spent, -3),
      equity_today: pyRound((val - loan) / deflate, -3),
    });
  }
  const forever = led.filter((e) => e.step.startsWith('Buy forever'));
  if (forever.length) {
    const last = forever[forever.length - 1];
    Object.assign(res, { forever_price: last.price, forever_today: last.today, forever_when: last.date });
  }
  return res;
}
