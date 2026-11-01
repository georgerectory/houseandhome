// offer.js - what to offer, from the money that exists on completion day.
//
// THE QUESTION. The owner's aim (R-16): win the house, then cover day
// one. So the offer is the HIGHEST price at which the cash on completion
// day still pays the deposit, the stamp duty and every buying cost AND
// leaves the day-one reserve untouched. Bid less and the house can be
// lost to a few hundred pounds; bid more and the keys arrive with no
// money to make the house usable.
//
// THE ARITHMETIC. With a loan L (capped at maxLtv of the valuation),
// cash C on completion day, buying costs F and a reserve R:
//
//     need(P) = (P - loan(P)) + sdlt(P) + F + R   must not exceed C
//
// need() rises with P, so the largest P is found by bisection over whole
// pounds rather than by an algebraic formula that only holds inside one
// stamp duty band. The tender figure is that maximum rounded DOWN to a
// multiple of 50 (the convention the earlier chat's hand-worked figures
// used; the unit test reproduces that method on invented inputs).
//
// TRUST. Every input carries its confidence, and the result names the
// ones nobody has confirmed. Nothing here says the price is affordable:
// it says what the recorded figures imply, and how far they can move.
//
// Pure: no DOM, no fetch.
import { sdlt, pmtN } from './road-ahead/money.js';
import { addMonths, monthsBetween } from './cash-over-time.js';

const num = (v) => (v == null || v === '' ? null : Number(v));
const TRUSTED = new Set(['confirmed', 'actual']);

/** Round down to a multiple of 50: the tender convention. */
export const tenderRound = (p) => Math.floor(p / 50) * 50;

/** Cash needed at price P, and what is left, under one set of terms. */
export function breakdown(P, t) {
  const valuation = P * (1 - (t.downValuation ?? 0));
  const loan = Math.max(0, Math.min(t.loan, (t.maxLtv ?? 0.95) * valuation) - (t.retention ?? 0));
  const deposit = P - loan;
  const duty = sdlt(P, t.ftb ?? true);
  const fees = (t.fees ?? []).reduce((s, f) => s + (num(f.amount) ?? 0), 0);
  const reserve = num(t.reserve) ?? 0;
  const need = deposit + duty + fees + reserve;
  return {
    price: P, valuation, loan, deposit, sdlt: duty, fees, reserve, need,
    cash: t.cash, leftAfterBuying: t.cash - deposit - duty - fees, margin: t.cash - need,
    ltv: valuation > 0 ? loan / valuation : null,
  };
}

/** The highest whole-pound price whose need fits the cash. */
export function maxPrice(t) {
  let lo = 0;
  let hi = t.loan + t.cash + 1e6;
  if (breakdown(lo, t).margin < 0) return null;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (breakdown(mid, t).margin >= 0) lo = mid; else hi = mid;
  }
  return lo;
}

/** Cash on completion day: savings now plus the monthly saving to then. */
export function cashAt(month, { cashNow, cashAsOf, savingPerMonth }) {
  return cashNow + Math.max(0, monthsBetween(cashAsOf, month)) * (savingPerMonth ?? 0);
}

/**
 * The whole offer picture.
 *
 * inputs: { loan, maxLtv, ftb, cashNow, cashAsOf 'YYYY-MM', savingPerMonth,
 *   completion 'YYYY-MM', fees [{key,label,amount,confidence}], reserve,
 *   guide, rate, termYears, retention, plannedMortgage,
 *   confidence: { <input>: level } }
 */
export function offerPlan(inp) {
  const cash = cashAt(inp.completion, inp);
  const terms = { loan: inp.loan, maxLtv: inp.maxLtv ?? 0.95, ftb: inp.ftb ?? true, cash, fees: inp.fees, reserve: inp.reserve };
  const max = maxPrice(terms);
  const tender = max == null ? null : tenderRound(max);
  const atTender = tender == null ? null : breakdown(tender, terms);

  // What the same tender looks like if the world moves after it is in.
  const scenario = (id, label, change, note) => {
    const t = { ...terms, ...change };
    const b = tender == null ? null : breakdown(tender, t);
    const m = maxPrice(t);
    return { id, label, note, margin: b?.margin ?? null, shortfall: b ? Math.max(0, -b.margin) : null,
      maxPrice: m, tender: m == null ? null : tenderRound(m) };
  };
  const sensitivities = [
    scenario('down5', 'Valuation 5% under the price', { downValuation: 0.05 },
      'The lender lends against the valuation, not the price; the gap comes out of cash.'),
    scenario('down10', 'Valuation 10% under the price', { downValuation: 0.10 },
      'A house with no working kitchen or heating is where down-valuations happen.'),
    scenario('retention', 'Lender retains the cost of the works it wants done', { retention: inp.retention ?? 0 },
      'Sized at the high day-one case. A retention is paid out after the works, so on the day it is a hole in the cash.'),
    scenario('early', `Completion a month earlier (${addMonths(inp.completion, -1)})`, { cash: cashAt(addMonths(inp.completion, -1), inp) },
      'One month less saving.'),
    scenario('late', `Completion a month later (${addMonths(inp.completion, 1)})`, { cash: cashAt(addMonths(inp.completion, 1), inp) },
      'One month more saving, if nothing else moves.'),
  ];

  const byMonth = [-1, 0, 1, 2].map((k) => {
    const month = addMonths(inp.completion, k);
    const m = maxPrice({ ...terms, cash: cashAt(month, inp) });
    return { month, cash: cashAt(month, inp), maxPrice: m, tender: m == null ? null : tenderRound(m) };
  });

  // The honest range when the saving is a range and the completion day
  // inside the month is unknown: the safe end saves the low rate and
  // completes before that month's saving lands; the top end saves the
  // high rate and completes after it.
  const lowRate = inp.savingLow ?? inp.savingPerMonth;
  const highRate = inp.savingHigh ?? inp.savingPerMonth;
  const rangeCase = (label, rate, month) => {
    const c = cashAt(month, { ...inp, savingPerMonth: rate });
    const m = maxPrice({ ...terms, cash: c });
    return { label, saving: rate, month, cash: c, maxPrice: m, tender: m == null ? null : tenderRound(m) };
  };
  const range = [
    rangeCase('Safe: lower saving, completing before that month\'s saving lands', lowRate, addMonths(inp.completion, -1)),
    rangeCase('Lower saving, completing at the month end', lowRate, inp.completion),
    rangeCase('Higher saving, completing before that month\'s saving lands', highRate, addMonths(inp.completion, -1)),
    rangeCase('Top: higher saving, completing at the month end', highRate, inp.completion),
  ];

  // Bidding the guide: how much of the day-one reserve it takes, at the
  // safe end and the top end of the range.
  const guide = inp.guide ? {
    price: inp.guide,
    reserveUsed: [range[0], range[3]].map((r) => {
      const b = breakdown(inp.guide, { ...terms, cash: r.cash });
      return Math.max(0, -b.margin);
    }),
    reserve: num(inp.reserve) ?? 0,
  } : null;
  if (guide) guide.reserveLeft = guide.reserveUsed.map((u) => guide.reserve - u);

  const n = (inp.termYears ?? 35) * 12;
  const loanAtTender = atTender?.loan ?? inp.loan;
  const payment = inp.rate == null ? null : {
    loan: loanAtTender, rate: inp.rate, years: inp.termYears ?? 35,
    monthly: pmtN(loanAtTender, inp.rate, n),
    plusOne: pmtN(loanAtTender, inp.rate + 0.01, n),
    planned: num(inp.plannedMortgage),
  };

  const unconfirmed = Object.entries(inp.confidence ?? {})
    .filter(([, c]) => !TRUSTED.has(c)).map(([k]) => k);
  for (const f of inp.fees ?? []) if (!TRUSTED.has(f.confidence)) unconfirmed.push(f.label ?? f.key);

  const shortcomings = [];
  for (const s of sensitivities) {
    if (s.shortfall > 0) shortcomings.push(`${s.label}: the tender would be ${Math.round(s.shortfall)} short on the day.`);
  }
  if (atTender && inp.guide && tender < inp.guide) {
    shortcomings.push(`The funded tender is ${Math.round(inp.guide - tender)} under the guide.`);
  }
  if (payment?.planned != null && payment.monthly > payment.planned) {
    shortcomings.push(`The repayment (${Math.round(payment.monthly)}) is above the planned budget's mortgage line (${Math.round(payment.planned)}).`);
  }
  if (unconfirmed.length) shortcomings.push(`Rests on ${unconfirmed.length} figure(s) nobody has confirmed: ${unconfirmed.join('; ')}.`);

  if (guide && guide.reserveLeft.some((r) => r < 0)) {
    shortcomings.push(`Bidding the guide needs more than the whole reserve at the safe end of the range.`);
  }

  return { cash, completion: inp.completion, max, tender, atTender, sensitivities, byMonth, range, guide, payment, unconfirmed, shortcomings };
}

// ------------------------------------------------------------------
// From rows. The page never types a figure: it reads ra_variables and
// cost_rollup, and names what is missing rather than guessing it.
// ------------------------------------------------------------------

const FEE_KEYS = [
  'fees.conveyancing', 'fees.searches', 'fees.land_registry', 'fees.survey',
  'fees.lender_product', 'fees.valuation', 'fees.broker', 'fees.insurance_upfront', 'fees.removals',
];

const row = (vars, key) => (vars ?? []).find((v) => v.key === key && (v.status ?? 'active') === 'active');

/** Offer inputs from ra_variables (and the day-one cases in cost_rollup). */
export function offerInputs(vars, rollup = []) {
  const v = (k) => row(vars, k)?.value ?? null;
  const c = (k) => row(vars, k)?.confidence ?? 'drafted';
  const asOf = row(vars, 'cash.isa_balance_est')?.source_date;
  const fees = FEE_KEYS.filter((k) => row(vars, k)).map((k) => ({
    key: k, label: row(vars, k).label ?? k, amount: num(v(k)), confidence: c(k),
  }));
  const highCase = (rollup ?? []).find((r) => r.dim === 'case' && r.key === 'high');
  const budget = v('costs.planned_post_move');
  const inp = {
    loan: num(v('mortgage.dip_max_expected')),
    maxLtv: num(v('offer.max_ltv')) ?? 0.95,
    ftb: true,
    cashNow: num(v('cash.isa_balance_est')),
    cashAsOf: asOf ? String(asOf).slice(0, 7) : null,
    savingPerMonth: num(v('cash.saving_rate_observed')),
    savingLow: num(row(vars, 'cash.saving_rate_observed')?.low),
    savingHigh: num(row(vars, 'cash.saving_rate_observed')?.high),
    completion: v('offer.completion_month'),
    fees,
    reserve: num(v('cash.works_buffer')),
    guide: num(v('offer.guide_price')),
    rate: num(v('mortgage.rate')) == null ? null : num(v('mortgage.rate')) + (num(v('mortgage.rate_premium_95')) ?? 0),
    termYears: num(v('mortgage.mip_term_years')) ?? 35,
    retention: num(highCase?.cost_base) ?? 0,
    plannedMortgage: budget?.mortgage ?? null,
    confidence: {
      'Decision in principle': c('mortgage.dip_max_expected'),
      'Savings now': c('cash.isa_balance_est'),
      'Monthly saving to completion': c('cash.saving_rate_observed'),
      'Completion month': c('offer.completion_month'),
      'Day-one reserve': c('cash.works_buffer'),
    },
  };
  const missing = [
    inp.loan == null && 'mortgage.dip_max_expected',
    inp.cashNow == null && 'cash.isa_balance_est',
    !inp.cashAsOf && 'the date of cash.isa_balance_est',
    !inp.completion && 'offer.completion_month',
    inp.reserve == null && 'cash.works_buffer',
    !fees.length && 'fees.*',
  ].filter(Boolean);
  return { ready: !missing.length, missing, inputs: inp };
}
