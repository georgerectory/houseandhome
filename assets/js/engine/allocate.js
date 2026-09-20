// allocate.js - the allocation curve, as a pure function.
//
// The database is the AUTHORITY: run_deposit_allocation writes the real
// ledger. This module exists so the front end and the assistant can
// show what a deposit *would* do without writing anything, and so the
// maths is unit-testable without a server.
//
// Two implementations of one rule is exactly the duplication this
// project avoids elsewhere, so it is held honest mechanically:
// `npm run test:parity` (tools/parity-check.mjs) provisions a real
// Postgres from supabase/schema/, runs both against the same inputs and
// fails if a single micro-pound differs.
//
// The rule:
//   * every open, fundable, costed item gets a share of every deposit
//   * share falls geometrically by PRIORITY RANK, not by cost, so the
//     top item takes the most whether it costs 20 pounds or 4,000
//   * an equal floor share is distributed across all items, which is
//     what guarantees nothing ever reaches zero - a pure geometric tail
//     underflows to nothing once the list gets long
//   * shares sum to the deposit EXACTLY, settled in integer
//     micro-pounds by largest remainder

export const DEFAULTS = Object.freeze({ decay: 0.85, floorShare: 0.10 });

const MICRO = 1_000_000;

/**
 * Weight for one rank in a list of n.
 * @param {number} rank 1-based, 1 is the highest priority
 * @param {number} n total items competing
 * @param {number} decay geometric falloff per rank, 0 < decay < 1
 * @param {number} floorShare fraction split equally, 0 <= floorShare < 1
 * @returns {number} share of the deposit, strictly > 0
 */
export function weightForRank(rank, n, decay = DEFAULTS.decay, floorShare = DEFAULTS.floorShare) {
  if (n <= 0) return 0;
  const geoSum = (1 - Math.pow(decay, n)) / (1 - decay);
  return ((1 - floorShare) * Math.pow(decay, rank - 1)) / geoSum + floorShare / n;
}

/**
 * Split a deposit across a ranked list of items.
 *
 * @param {Array<{id:string,title?:string,targetCost?:number,allocatedBalance?:number}>} items
 *        already ordered by priority, highest first
 * @param {number} amount the deposit
 * @param {{decay?:number, floorShare?:number}} [opts]
 * @returns {Array<{id:string,title:string,rank:number,weight:number,amount:number,
 *                  targetCost:number|null,balanceAfter:number,fundedAfter:boolean}>}
 */
export function allocate(items, amount, opts = {}) {
  const decay = opts.decay ?? DEFAULTS.decay;
  const floorShare = opts.floorShare ?? DEFAULTS.floorShare;
  const n = items.length;
  if (!n || !(amount > 0)) return [];

  const totalMicro = Math.round(amount * MICRO);

  const rows = items.map((item, i) => {
    const rank = i + 1;
    const weight = weightForRank(rank, n, decay, floorShare);
    const exact = weight * totalMicro;
    const base = Math.floor(exact);
    return { item, rank, weight, base, frac: exact - base };
  });

  // Largest-remainder settlement. Without it the floors lose up to n
  // micro-pounds and the ledger stops reconciling to the deposit.
  const assigned = rows.reduce((s, r) => s + r.base, 0);
  let leftover = totalMicro - assigned;
  const byFrac = [...rows].sort((a, b) => (b.frac - a.frac) || (a.rank - b.rank));
  for (let i = 0; i < byFrac.length && leftover > 0; i++, leftover--) byFrac[i].base += 1;

  return rows.map((r) => {
    const amt = r.base / MICRO;
    const balance = (r.item.allocatedBalance ?? 0) + amt;
    const target = r.item.targetCost ?? null;
    return {
      id: r.item.id,
      title: r.item.title ?? '',
      rank: r.rank,
      weight: r.weight,
      amount: amt,
      targetCost: target,
      balanceAfter: balance,
      fundedAfter: target != null && balance >= target,
    };
  });
}

/**
 * Months until each item is fully funded at a steady contribution.
 * Approximate by construction: it assumes the list does not change,
 * which it always does. Presented as a projection, never a promise.
 */
export function projectFunding(items, monthly, opts = {}, horizonMonths = 120) {
  const state = items.map((i) => ({ ...i, allocatedBalance: i.allocatedBalance ?? 0 }));
  const eta = new Map();
  let open = state.filter((i) => i.targetCost != null && i.allocatedBalance < i.targetCost);

  for (let m = 1; m <= horizonMonths && open.length; m++) {
    for (const row of allocate(open, monthly, opts)) {
      const item = state.find((i) => i.id === row.id);
      item.allocatedBalance = row.balanceAfter;
      if (row.fundedAfter && !eta.has(row.id)) eta.set(row.id, m);
    }
    open = state.filter((i) => i.targetCost != null && i.allocatedBalance < i.targetCost);
  }
  return state.map((i) => ({
    id: i.id,
    title: i.title ?? '',
    targetCost: i.targetCost ?? null,
    monthsToFund: eta.get(i.id) ?? null,
    balanceAfterHorizon: i.allocatedBalance,
  }));
}
