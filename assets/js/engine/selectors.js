// selectors.js - questions asked of the loaded data.
//
// These were in core/store.js, whose job is to know WHERE DATA COMES
// FROM - Supabase or the fixture - and nothing else. Reading the shape
// of what came back is a different job, and a pure one: no fetch, no
// DOM, no auth, so it belongs in engine/ with everything else that can
// be tested from disk.
//
// The rule they all serve: only TRUSTED confidence may reach a total, a
// projection or an allocation. See docs/DECISIONS.md.

export const openItems = (d) => d.items.filter((i) => !['done', 'dropped'].includes(i.status));

export const fundable = (d) =>
  openItems(d)
    .filter((i) => (i.cost_expected ?? i.cost_best) != null)
    .sort((a, b) => a.priority - b.priority)
    .map((i) => ({
      id: i.id,
      title: i.title,
      targetCost: i.cost_expected ?? i.cost_best,
      allocatedBalance: i.allocated_balance ?? 0,
    }));

export const byHorizon = (d, h) =>
  openItems(d).filter((i) => i.horizon === h).sort((a, b) => a.priority - b.priority);

export const totalOutstanding = (d) =>
  fundable(d).reduce((s, i) => s + Math.max(0, (i.targetCost ?? 0) - i.allocatedBalance), 0);

/** How much of what is on screen has actually been checked by a human.
 *  Surfaced prominently rather than buried, because early on the honest
 *  answer is "none of it". */
export function confidenceSummary(d) {
  const rows = openItems(d);
  const trusted = rows.filter((i) => ['confirmed', 'actual'].includes(i.cost_confidence)).length;
  return { total: rows.length, trusted, unconfirmed: rows.length - trusted };
}

/**
 * What is actually held, netted.
 *
 * Mirrors the house_funds view in 40_money.sql - the same rule, because
 * the page and the database disagreeing about how much money exists is
 * the worst bug this system could have.
 *
 * Only TRUSTED balances count. An unconfirmed one is reported separately
 * so a surface can say what it is leaving out rather than quietly
 * understating the position.
 */
export function houseFunds(d) {
  const rows = (d.accounts ?? []).filter((a) => a.is_active !== false);
  const trusted = rows.filter((a) => ['confirmed', 'actual'].includes(a.confidence));
  const sum = (list, f) => list.reduce((s, a) => s + f(a), 0);
  const assets = trusted.filter((a) => !a.is_liability);
  const debts = trusted.filter((a) => a.is_liability);
  // Undrawn works for a facility from either side: an account in credit
  // with a 1000 limit has 1000 undrawn; one overdrawn by 607.38 against
  // the same limit has 392.62 left.
  const undrawn = (a) => Math.max(0,
    Number(a.facility_limit ?? 0) - (a.is_liability ? Number(a.balance ?? 0) : 0));
  const net = sum(assets, (a) => Number(a.balance ?? 0)) - sum(debts, (a) => Number(a.balance ?? 0));
  return {
    totalAssets: sum(assets, (a) => Number(a.balance ?? 0)),
    earmarkedAssets: sum(assets, (a) => Number(a.balance ?? 0) * (a.earmark_pct ?? 0) / 100),
    totalLiabilities: sum(debts, (a) => Number(a.balance ?? 0)),
    netPosition: net,
    // What could be laid hands on today, borrowing included. Reported
    // separately from netPosition and never instead of it: an overdraft
    // adds to this and nothing to what is actually yours.
    undrawnFacilities: sum(trusted, undrawn),
    availableToDraw: net + sum(trusted, undrawn),
    accounts: rows,
    unconfirmed: rows.filter((a) => !['confirmed', 'actual'].includes(a.confidence)),
  };
}
