// ladder.js - the route model: one House 1, then the forever home, or
// rent and invest instead, simulated month by month to a fixed end.
//
// A port of the Rectory kit's engine.run, the older model its 43 tests
// exercise and its route scenarios came from. The roads (simulate.js)
// superseded it for planning; it stays because the tests pin the
// mechanics through it, and because "rent and invest the deposit
// instead" is the benchmark every road should beat.
//
// A ROUTE is data: { label?, sell?: [y, m] | null, keeper?, rent_invest?,
// invest_surplus?, motivated?, params?: {key: value} }. House 1 is
// bought at timeline.house1_keys, sold at `sell`, and the forever home
// bought the same month at the dearest price the cash and the lender
// allow. Market is a path name in P.market or a path itself.

import {
  pyRound, monthIndex, addMonths, months, ym,
  pmtN, sdlt, netPay, lenderIncome, growthIndex, endgameMaxLoan, maxEndgamePrice,
} from './money.js';

/**
 * Run one route.
 * @param {object} P0 parameters
 * @param {object} route
 * @param {string|object} [scen='base']
 * @param {object} [overrides] applied over P0 before the route's params
 * @param {boolean} [monthly=false] log every month rather than each December
 * @returns {[object, object[]]} [summary, log], as the kit returns them
 */
export function runRoute(P0, route, scen = 'base', overrides = null, monthly = false) {
  const P = { ...P0, ...(overrides ?? {}), ...(route.params ?? {}) };
  const g = typeof scen === 'string' ? P.market[scen] : scen;
  const start = P['timeline.start'];
  const end = P['timeline.end'];
  const keys = monthIndex(P['timeline.house1_keys']);
  const infl = (y, m) => (1 + P['costs.cost_inflation']) ** ((y - start[0]) + (m - start[1]) / 12);
  const keeper = route.keeper ?? false;
  const sell = route.sell ? monthIndex(route.sell) : null;
  const renter = route.rent_invest ?? false;
  const invSurplus = route.invest_surplus ?? false;
  let port = 0;
  const eq = P.equity_path ?? null;
  const ovr = P.works_overrun ?? 1.0;
  const hPrice = keeper ? P['keeper.price'] : P['house1.price'];
  const hWorks = (keeper ? P['keeper.works'] : P['house1.works']) * ovr;
  const hEff = (keeper ? P['keeper.works'] : P['house1.works_efficient']) * ovr;
  const hUp = (keeper ? P['keeper.uplift'] : P['house1.uplift']) / ovr;
  const hUpX = P['house1.uplift_excess'] / ovr;
  const disc = route.motivated ? P['house1.motivated_discount'] : (P.motivated_draw ?? 0.0);
  const depPct = P['house1.deposit_pct'];
  let rate = P['mortgage.rate'] + (depPct < 0.10 ? P['mortgage.rate_premium_95'] : 0);
  const fixEnd = monthIndex(addMonths(P['timeline.house1_keys'], 12 * P['mortgage.fix_years']));
  let termN = P['mortgage.term_years'] * 12;
  let cash = P['cash.start_cash'];
  let owned = false;
  let loan = 0; let value = 0; let mp = 0;
  let worksLeft = 0; let worksRate = 0; let spent = 0;
  let effCap = hEff; let up = hUp; let upX = hUpX;
  let phase = 'pre';
  let nEl = 0;
  let bills = P['costs.bills_house1'];
  let ftb;
  let nw = 0;
  const out = { route: route.label ?? '', scen: typeof scen === 'string' ? scen : 'custom' };
  const log = [];
  let minPre = Infinity;

  for (const [y, m] of months(start, end)) {
    const here = monthIndex([y, m]);
    const net = netPay(P, y, m);
    const f = infl(y, m);
    if (owned) value *= (1 + g[y]) ** (1 / 12);
    if (renter) {
      if (here === monthIndex(P['counterfactual.invest_month'])) {
        const amt = Math.min(P['counterfactual.invest_amount'], cash);
        port += amt; cash -= amt;
      }
      port *= (1 + (eq ? eq[y] : P['counterfactual.equity_return'])) ** (1 / 12);
    }
    if (here === keys && !renter) {
      const paid = hPrice * (1 - disc);
      const stamp = sdlt(paid, true);
      const dep = depPct * paid;
      loan = paid - dep;
      cash -= dep + stamp + P['transaction.buy_costs'] + P['transaction.day_one_kit'];
      value = hPrice; owned = true; phase = 'house1'; nEl = 0; mp = pmtN(loan, rate, termN);
      worksLeft = hWorks; worksRate = hWorks / P['house1.works_months']; spent = 0;
      const li = lenderIncome(P, y, m);
      Object.assign(out, {
        h1_paid: pyRound(paid), h1_stamp: pyRound(stamp), cash_at_keys: pyRound(cash),
        h1_ltv: pyRound(loan / paid, 3), h1_lti: pyRound(loan / li, 2),
        h1_lti_ok: loan / li <= P['mortgage.house1_max_multiple'], h1_rate: rate,
      });
    }
    if (phase === 'house1' && here === fixEnd) {
      rate = P['mortgage.refix_rate'];
      mp = pmtN(loan, rate, termN - nEl);
      out.refix = ym([y, m]);
    }
    if (sell !== null && here === sell && (phase === 'house1' || (renter && phase === 'pre'))) {
      if (renter) {
        cash += port;
        out.portfolio_at_move = pyRound(port);
        port = 0; ftb = true;
      } else {
        const sale = value;
        const equity = sale - loan - (sale * P['transaction.sell_pct'] + P['transaction.sell_fixed']);
        cash += equity;
        Object.assign(out, { h1_sale: pyRound(sale), released: pyRound(equity), works_unfunded_at_sale: pyRound(worksLeft) });
        ftb = false;
      }
      const [cap, lti, aff] = endgameMaxLoan(P, y, m, f);
      const p = maxEndgamePrice(P, cash, cap, ftb);
      Object.assign(out, {
        endgame_lti_cap: pyRound(lti), endgame_aff_cap: pyRound(aff),
        endgame_binding: aff < lti ? 'affordability' : 'income multiple',
      });
      if (p <= 0) {
        Object.assign(out, { endgame_nominal: 0, endgame_today: 0, endgame_failed: true, endgame_date: ym([y, m]) });
        owned = false; loan = 0; value = 0; mp = 0; worksLeft = 0; phase = 'endgame';
        continue;
      }
      const dep = p - Math.min(cap, P['mortgage.endgame_max_ltv'] * p);
      loan = p - dep;
      cash -= dep + sdlt(p, ftb) + P['transaction.buy_costs'];
      value = p; owned = true;
      rate = P['mortgage.refix_rate']; termN = P['mortgage.endgame_term_years'] * 12; nEl = 0; mp = pmtN(loan, rate, termN);
      bills = P['costs.bills_endgame'];
      const ew = P['endgame.works'] * (1 + P['endgame.build_inflation']) ** (y - 2026);
      worksLeft = ew; worksRate = ew / P['endgame.works_months'];
      up = P['endgame.uplift']; upX = up; effCap = Infinity; spent = 0; phase = 'endgame';
      const yrs = (y - start[0]) + (m - start[1]) / 12;
      const idx = growthIndex(P, g, start, [y, m]) * (1 + P['endgame.segment_premium']) ** yrs;
      Object.assign(out, {
        endgame_nominal: pyRound(p), endgame_today: pyRound(p / idx), endgame_ltv: pyRound(loan / p, 3),
        endgame_stamp: pyRound(sdlt(p, ftb)), endgame_ftb: ftb, endgame_date: ym([y, m]),
      });
    }
    const fam = here >= monthIndex(P['costs.family_from']) ? P['costs.family_cost'] * f : 0;
    const contrib = here >= monthIndex(P['costs.contribution_from']) ? P['costs.household_contribution'] : 0;
    if (owned) {
      const interest = loan * rate / 12;
      loan -= (mp - interest);
      nEl += 1;
      const surplus = net - (P['costs.living_after_move'] + bills) * f - mp - fam + contrib;
      let spend = 0;
      if (worksLeft > 0) {
        spend = Math.max(0, Math.min(worksLeft, worksRate, cash + surplus - P['cash.works_buffer']));
        // Past the "done" standard each pound of works adds less value.
        const a = Math.max(0, Math.min(spend, effCap - spent));
        value += a * up + (spend - a) * upX;
        spent += spend; worksLeft -= spend;
      }
      cash += surplus - spend;
    } else if (here < monthIndex(P['timeline.bridge_from'])) {
      cash += net - P['cash.pre_purchase_spend'] * f;
    } else if (renter) {
      const rent = P['counterfactual.rent'] * (1 + P['counterfactual.rent_growth']) ** ((y - 2027) + (m - 1) / 12);
      const surplus = net - (P['costs.living_after_move'] + P['counterfactual.renter_bills']) * f - rent - fam + contrib;
      if (invSurplus && surplus > 0 && cash >= P['cash.works_buffer']) port += surplus;
      else cash += surplus;
    } else {
      cash += net - P['costs.living_after_move'] * f - P['costs.bridge_rent'] * f;
    }
    if (phase !== 'endgame') minPre = Math.min(minPre, cash);
    if (y === 2029 && m === 12) out.works_unfunded_2029 = pyRound(worksLeft);
    const sellc = owned ? value * P['transaction.sell_pct'] + P['transaction.sell_fixed'] : 0;
    nw = value - loan - sellc + cash + port;
    if (y === 2034 && m === 12) {
      out.portfolio_2034 = pyRound(port);
      out.nw_2034 = pyRound(nw);
      out.value_2034_today = pyRound(value / growthIndex(P, g, start, [2034, 12]));
    }
    if (monthly || m === 12) {
      log.push({
        ym: ym([y, m]), cash: pyRound(cash), loan: pyRound(loan), value: pyRound(value),
        net_worth: pyRound(nw), net: pyRound(net), mortgage: pyRound(mp), rate,
      });
    }
  }
  Object.assign(out, { nw_end: pyRound(nw), min_cash_pre_move: pyRound(minPre), final_value: pyRound(value) });
  return [out, log];
}
