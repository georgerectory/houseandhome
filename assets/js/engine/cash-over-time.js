// When does each piece of work become fundable?
//
// The owner has almost nothing spare each month after the mortgage, so
// "what does it cost" is the wrong question on its own: the useful one is
// WHEN the money for it exists. This walks month by month from completion,
// adds the monthly spare and any bonuses, keeps a reserve untouched, and
// funds the work IN THE ORDER GIVEN (the roadmap's order), each item once
// the running balance covers it.
//
// It is a model of the owner's planned figures, not a forecast, and it
// says so: every result carries the share of the money that rests on
// unconfirmed costs, and nothing here is ever phrased as "affordable".
//
// Pure: no DOM, no fetch. Months are 'YYYY-MM' strings.

/** 'YYYY-MM' plus n months. */
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Months from a to b ('YYYY-MM'), negative if b is earlier. */
export function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}

/**
 * The monthly spare in force in a month: the latest step at or before it.
 * steps: [{ from: 'YYYY-MM', amount }].
 */
export function spareIn(month, steps) {
  let amount = 0;
  for (const s of [...steps].sort((a, b) => monthsBetween(b.from, a.from))) {
    if (monthsBetween(s.from, month) >= 0) amount = s.amount;
  }
  return amount;
}

/**
 * Walk the months.
 *
 * @param {object} o
 * @param {string} o.start          first month after completion, 'YYYY-MM'
 * @param {number} o.startCash      cash left on completion day
 * @param {number} [o.reserve]      kept back, never spent on work
 * @param {Array}  o.spare          [{ from, amount }] monthly spare, stepped
 * @param {Array}  [o.bonuses]      [{ month, amount }]
 * @param {Array}  o.items          [{ id, label, cost, unconfirmed }] in roadmap order;
 *                                  `unconfirmed` true when the cost is not confirmed
 * @param {number} [o.horizon]      months to walk (default 120)
 * @returns {{ months: Array, items: Array, unfunded: Array, unconfirmedShare: number }}
 */
export function cashOverTime(o) {
  const horizon = o.horizon ?? 120;
  const reserve = o.reserve ?? 0;
  const queue = (o.items ?? []).filter((i) => Number.isFinite(i.cost) && i.cost > 0);
  const funded = [];
  const months = [];
  let balance = o.startCash ?? 0;
  let next = 0;

  for (let k = 0; k < horizon; k += 1) {
    const month = addMonths(o.start, k);
    if (k > 0) balance += spareIn(month, o.spare ?? []);
    for (const b of o.bonuses ?? []) if (b.month === month) balance += b.amount;
    const spent = [];
    while (next < queue.length && balance - reserve >= queue[next].cost) {
      balance -= queue[next].cost;
      funded.push({ ...queue[next], month, monthsFromStart: k });
      spent.push(queue[next].id);
      next += 1;
    }
    months.push({ month, balance: Math.round(balance * 100) / 100, funded: spent });
    if (next >= queue.length) break;
  }

  const total = queue.reduce((s, i) => s + i.cost, 0);
  const unconfirmed = queue.filter((i) => i.unconfirmed).reduce((s, i) => s + i.cost, 0);
  return {
    months,
    items: funded,
    unfunded: queue.slice(next),
    unconfirmedShare: total ? Math.round((unconfirmed / total) * 1000) / 1000 : 0,
  };
}
