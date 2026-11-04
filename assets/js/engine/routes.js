// routes.js - which route to the next home, month by month.
//
// A ROUTE is one way of living until the next purchase: renting, or
// buying a house now (to stay in, or to sell on). Each route is walked
// month by month from the same starting cash and the same pay, so the
// only differences are the ones the route itself makes: what housing
// costs each month, what was spent getting in, and what comes back out
// on a sale - after the agent, the solicitor and any early repayment
// charge.
//
// Every route answers the same two questions:
//   - the earliest month a target home is within reach (deposit, stamp
//     duty, costs and a reserve covered; the loan within both the
//     income multiple and the loan-to-value cap);
//   - what the owner has at a given month, in cash and in equity.
//
// Stamp duty follows first-time-buyer status: a route that buys now
// spends the relief, so its NEXT purchase pays full rates.
//
// Pure: no DOM, no fetch. Inputs come from ra_variables; nothing here is
// a figure about the owner.
import { sdlt, pmtN } from './road-ahead/money.js';
import { addMonths, monthsBetween } from './cash-over-time.js';

const aprilsPassed = (start, month) => {
  // April rises seen from the month after start up to and including month.
  let n = 0;
  for (let m = addMonths(start, 1); monthsBetween(m, month) >= 0; m = addMonths(m, 1)) {
    if (m.endsWith('-04')) n += 1;
  }
  return n;
};

/** Pay at a month: the base plus one rise for each April passed. */
export function payAt(month, p) {
  const n = aprilsPassed(p.start, month);
  return { gross: p.gross + n * p.grossRise, net: p.net + n * p.netRise };
}

/** Outstanding balance after k monthly repayments. */
export function balanceAfter(loan, rate, years, k) {
  if (!loan) return 0;
  const r = rate / 12;
  const pay = pmtN(loan, rate, years * 12);
  return r === 0 ? loan - pay * k : loan * (1 + r) ** k - pay * ((1 + r) ** k - 1) / r;
}

/** A value path from dated points, straight lines between them. */
export function valueAt(points, month) {
  const pts = [...points].sort((a, b) => a[0].localeCompare(b[0]));
  if (monthsBetween(pts[0][0], month) <= 0) return pts[0][1];
  for (let i = 1; i < pts.length; i += 1) {
    const [a, va] = pts[i - 1];
    const [b, vb] = pts[i];
    if (monthsBetween(month, b) >= 0) return va + (vb - va) * monthsBetween(a, month) / monthsBetween(a, b);
  }
  return pts.at(-1)[1];
}

/** The most the next purchase can be, or whether one price is reachable. */
export function cashNeeded(price, gross, next, ftb) {
  const loan = Math.min(next.multiple * gross, next.maxLtv * price);
  return price - loan + sdlt(price, ftb) + (next.costs ?? 0) + (next.reserve ?? 0);
}

/**
 * Walk one route.
 *
 * p (shared): { start 'YYYY-MM' (the month before the first spending
 *   month), cash, gross, grossRise, net, netRise, bonus (each April),
 *   spend (monthly, excluding housing), horizon (months) }
 * route: { kind: 'rent', rent, deposit, untilMonth?, boardBefore? }
 *     or { kind: 'buy', price, value, depositPct, maxLoan, rate, years,
 *          productFee, buyCosts, ercByYear [..], sell (true to sell on),
 *          saleFeePct, saleFixed, path [[month, value]...] }
 * next: { price, multiple, maxLtv, costs, reserve }
 */
export function walk(p, route, next) {
  const rows = [];
  let cash = p.cash;
  let loan = 0;
  let pay = 0;
  if (route.kind === 'rent') {
    cash -= route.deposit ?? 0;
  } else {
    loan = Math.min(route.maxLoan ?? Infinity, route.price * (1 - route.depositPct));
    pay = pmtN(loan, route.rate, route.years * 12);
    cash -= route.price - loan + sdlt(route.price, true) + (route.buyCosts ?? 0) + (route.productFee ?? 0);
  }
  const ftbNext = route.kind === 'rent';
  let reached = null;
  for (let k = 1; k <= p.horizon; k += 1) {
    const month = addMonths(p.start, k);
    const { gross, net } = payAt(month, p);
    const housing = route.kind === 'rent'
      ? (route.boardUntil && monthsBetween(month, route.boardUntil) >= 0 ? route.board : route.rent)
      : pay;
    cash += net - p.spend - housing + (month.endsWith('-04') ? p.bonus : 0);
    let equity = 0;
    let saleNet = 0;
    if (route.kind === 'buy') {
      const value = valueAt(route.path, month);
      const owed = balanceAfter(loan, route.rate, route.years, k);
      const year = Math.floor((k - 1) / 12);
      const erc = (route.ercByYear?.[year] ?? 0) * owed;
      equity = value - owed;
      saleNet = value * (1 - (route.saleFeePct ?? 0)) - (route.saleFixed ?? 0) - owed - erc;
    }
    const available = route.kind === 'rent' ? cash : cash + (route.sell ? saleNet : 0);
    const can = (route.kind === 'rent' || route.sell) && next?.price
      ? available >= cashNeeded(next.price, gross, next, ftbNext) : false;
    if (can && !reached) reached = month;
    rows.push({ month, cash, equity, saleNet, available, gross, can });
  }
  return { rows, reached, monthly: pay, loan };
}

/** The highest purchase price at which a buy route reaches the target no later than a given month. */
export function priceToMatch(p, route, next, byMonth, { low, high, step = 500 }) {
  for (let price = high; price >= low; price -= step) {
    const r = walk(p, { ...route, price }, next);
    if (r.reached && monthsBetween(r.reached, byMonth) >= 0) return price;
  }
  return null;
}
