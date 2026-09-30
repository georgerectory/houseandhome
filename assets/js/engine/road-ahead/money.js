// money.js - the money primitives Road Ahead is built on, ported from
// the Rectory kit's engine.py so every figure the kit published can be
// reproduced here to the pound.
//
// FIDELITY OVER TASTE. Three things a straight port gets wrong, handled
// here once rather than left to every caller:
//
//   * Python rounds half to even, on the EXACT binary value of a float.
//     Math.round rounds half up, and toFixed rounds half up on the exact
//     value. The kit's register turns on the difference: works that come
//     to exactly 42,500 must round to 42,000, and 43,500 to 44,000.
//     pyRound() reproduces Python from the float's own bits, so no tie is
//     ever decided by an approximation.
//
//   * Months are (year, month) tuples compared as tuples. Here they are
//     [year, month] pairs, compared through monthIndex().
//
//   * Python's f"{x:.0f}" is half-even as well. fmt0() is its twin, for
//     the few flags the kit writes as text.
//
// P is the kit's flat parameter map: 'group.key' -> value, months as
// [y, m], market paths as P.market[name][year]. Nothing here reads a
// global and nothing here knows whose money it is; the values arrive
// from params.js.

// ---------------------------------------------------------------
// Rounding, exactly as Python does it.
// ---------------------------------------------------------------

const F64 = new DataView(new ArrayBuffer(8));

/** A finite x >= 0 as an exact fraction num / den, den a power of two. */
function exactFraction(x) {
  F64.setFloat64(0, x);
  const hi = F64.getUint32(0);
  const lo = F64.getUint32(4);
  const biased = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (biased) mant |= 1n << 52n;
  const exp = (biased || 1) - 1075; // x = mant * 2^exp
  return exp >= 0
    ? { num: mant << BigInt(exp), den: 1n }
    : { num: mant, den: 1n << BigInt(-exp) };
}

/**
 * Python's round(x, ndigits): half to even, decided on the exact value.
 * round(x, -3) is to the nearest thousand. Called without ndigits it is
 * Python's round(x), which returns an int - and an int has no -0.
 * @param {number} x
 * @param {number} [ndigits]
 * @returns {number} -0 only where Python gives -0.0
 */
export function pyRound(x, ndigits) {
  const nd = ndigits ?? 0;
  if (!Number.isFinite(x) || x === 0) return ndigits === undefined ? x + 0 : x;
  const neg = x < 0;
  const { num, den } = exactFraction(Math.abs(x));
  const scale = 10n ** BigInt(Math.abs(nd));
  // |x| x 10^nd as N / D, then the nearest integer to it.
  const N = nd >= 0 ? num * scale : num;
  const D = nd >= 0 ? den : den * scale;
  let q = N / D;
  const twice = 2n * (N % D);
  if (twice > D || (twice === D && (q & 1n) === 1n)) q += 1n;
  // Both operands are exact, so the division is correctly rounded - the
  // same double Python reaches by parsing the rounded decimal string.
  const magnitude = nd >= 0 ? Number(q) / Number(scale) : Number(q * scale);
  const out = neg ? -magnitude : magnitude;
  return ndigits === undefined ? out + 0 : out;
}

/** Python's f"{x:.0f}": half-even, and "-0" for a small negative. */
export function fmt0(x) {
  const r = pyRound(x, 0); // round(x, 0), not round(x): keeps the -0
  return (r < 0 || Object.is(r, -0) ? '-' : '') + String(Math.abs(r));
}

// ---------------------------------------------------------------
// Months.
// ---------------------------------------------------------------

/** [y, m] as a single ordinal, so months compare with < and ===. */
export const monthIndex = ([y, m]) => y * 12 + (m - 1);

/** Negative, zero or positive, as the tuple comparison would be. */
export const cmpMonth = (a, b) => monthIndex(a) - monthIndex(b);

/** [y, m] plus k months (k may be negative). */
export function addMonths([y, m], k) {
  const t = y * 12 + (m - 1) + k;
  return [Math.floor(t / 12), (((t % 12) + 12) % 12) + 1];
}

/** Every month from start to end inclusive, as [y, m] pairs. */
export function months(start, end) {
  const out = [];
  let [y, m] = start;
  const last = monthIndex(end);
  while (y * 12 + (m - 1) <= last) {
    out.push([y, m]);
    m += 1;
    if (m === 13) { y += 1; m = 1; }
  }
  return out;
}

/** '2027-05', the kit's label for a month. */
export const ym = ([y, m]) => `${y}-${String(m).padStart(2, '0')}`;

/** The inverse of ym(). */
export function parseYm(s) {
  const [y, m] = String(s).split('-').map(Number);
  return [y, m];
}

// ---------------------------------------------------------------
// Loans.
// ---------------------------------------------------------------

/** Monthly repayment on a loan over n months at an annual rate. */
export function pmtN(loan, rate, n) {
  const r = rate / 12;
  return r === 0 ? loan / n : loan * r / (1 - (1 + r) ** -n);
}

/** Monthly repayment over a term in years (30 by default). */
export const pmt = (loan, rate, years = 30) => pmtN(loan, rate, years * 12);

/** What a monthly payment buys: the present value of n payments. */
export function annuityPv(payment, rate, n) {
  const r = rate / 12;
  return r === 0 ? payment * n : payment * (1 - (1 + r) ** -n) / r;
}

// ---------------------------------------------------------------
// Stamp duty land tax, England, residential, from 1 April 2025.
//
// The law, not the owner's numbers: a change in the rates is a code
// change with a test, mirrored in ra_sdlt() and held equal by the
// parity gate.
// ---------------------------------------------------------------

export const SDLT_BANDS = Object.freeze([
  [125000, 0], [250000, 0.02], [925000, 0.05], [1500000, 0.10], [Infinity, 0.12],
]);
export const SDLT_FTB_LIMIT = 500000;
export const SDLT_FTB_NIL = 300000;
export const SDLT_FTB_RATE = 0.05;

/** Stamp duty on a price; first-time relief only up to its limit. */
export function sdlt(price, ftb = false) {
  if (ftb && price <= SDLT_FTB_LIMIT) return Math.max(0, price - SDLT_FTB_NIL) * SDLT_FTB_RATE;
  let t = 0;
  let prev = 0;
  for (const [top, rate] of SDLT_BANDS) {
    if (price > prev) t += (Math.min(price, top) - prev) * rate;
    prev = top;
  }
  return t;
}

// ---------------------------------------------------------------
// Pay.
// ---------------------------------------------------------------

/**
 * Gross salary in a month: today's, plus the 2027 rise from its month,
 * plus the yearly rise for each April from 2028.
 */
export function salary(P, y, m) {
  let s = P['income.gross_salary_now'];
  if (monthIndex([y, m]) >= monthIndex(P['income.pay_rise_month'])) s += P['income.pay_rise_2027'];
  let n = 0;
  for (let yy = 2028; yy <= y; yy += 1) if (yy < y || m >= 4) n += 1;
  return s + n * P['income.annual_rise_from_2028'];
}

/** Net monthly pay: today's plus the net share of every rise since. */
export function netPay(P, y, m) {
  const s = salary(P, y, m);
  let n = P['income.net_pay_now'] + P['income.net_per_3k_gross'] * (s - P['income.gross_salary_now']) / 3000;
  if (monthIndex([y, m]) >= monthIndex(P['income.student_loan_end'])) {
    // The loan is cleared, so its repayments come back into pay.
    n += P['income.student_loan_rate'] * Math.max(0, s - P['income.student_loan_threshold']) / 12;
  }
  return n;
}

/** Salary as a lender counts it: after any salary sacrifice. */
export const lenderIncome = (P, y, m) =>
  salary(P, y, m) - P['income.salary_sacrifice_annual'] * P['mortgage.lender_uses_post_sacrifice'];

// ---------------------------------------------------------------
// Prices.
// ---------------------------------------------------------------

/**
 * How far a house-price path has moved from start to until: monthly
 * compounding at each year's rate, over every month but the last.
 * @param {object} P
 * @param {string|object} scen a path name in P.market, or the path itself
 */
export function growthIndex(P, scen, start, until) {
  const g = typeof scen === 'string' ? P.market[scen] : scen;
  const span = months(start, until);
  let v = 1;
  for (let i = 0; i < span.length - 1; i += 1) v *= (1 + g[span[i][0]]) ** (1 / 12);
  return v;
}

// ---------------------------------------------------------------
// Borrowing.
// ---------------------------------------------------------------

/**
 * The most a lender would lend in a month: the lower of the income
 * multiple and what the stress-tested monthly surplus can service.
 * @returns {[number, number, number]} [cap, income-multiple cap, affordability cap]
 */
export function endgameMaxLoan(P, y, m, infl) {
  const partner = P['mortgage.partner_income'] ?? 0;
  const lti = (lenderIncome(P, y, m) + partner) * P['mortgage.endgame_income_multiple'];
  const net = netPay(P, y, m) + partner * P['mortgage.partner_net_ratio'] / 12;
  const kids = monthIndex([y, m]) >= monthIndex(P['costs.family_from']) ? P['costs.children'] : 0;
  const spend = (P['mortgage.lender_expenditure_adult']
    + kids * P['mortgage.lender_expenditure_child']
    + (partner > 0 ? P['mortgage.lender_expenditure_adult2'] : 0)) * infl;
  const aff = annuityPv(Math.max(0, net - spend), P['mortgage.stress_rate'], P['mortgage.endgame_term_years'] * 12);
  return [Math.min(lti, aff), lti, aff];
}

/**
 * The dearest home the cash and the loan cap reach, found by bisection:
 * price - loan + stamp duty + buying costs + the reserve <= cash.
 */
export function maxEndgamePrice(P, cash, maxLoan, ftb = false) {
  const ltv = P['mortgage.endgame_max_ltv'];
  const fixed = P['transaction.buy_costs'] + P['mortgage.endgame_reserve'];
  const need = (p) => p - Math.min(maxLoan, ltv * p) + sdlt(p, ftb) + fixed;
  let lo = 0;
  let hi = 5_000_000;
  if (need(lo) > cash) return 0;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (need(mid) <= cash) lo = mid;
    else hi = mid;
  }
  return lo;
}
