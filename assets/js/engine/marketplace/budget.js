// budget.js - is the whole plan a sensible sum?
//
// The page's copy of mp_budget_position and mp_budget_vs_benchmarks in
// 97_marketplace_budget.sql, held equal to them by the parity gate.
// Pure: rows in, figures out.

const round = (n, dp) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};
const num = (v) => (v == null || v === '' ? null : Number(v));
const TRUSTED = new Set(['researched', 'confirmed', 'actual']);

/**
 * The whole plan in one object. `profiles` are mp_profiles rows (only
 * those hunting count, at the wanted quantity); `newBuys` are
 * mp_new_buys rows (planned or bought; a bought one at what was paid).
 * A profile with no purpose counts as utility.
 */
// Quantities and prices both carry two decimals, so a product is exact
// in ten-thousandths. Summing those as integers, as numeric does in
// SQL, keeps a long list from drifting a penny away from the database.
const cents = (v) => Math.round(Number(v ?? 0) * 100);
const fromParts = (n) => Math.round(n / 100) / 100;

export function budgetPosition(profiles, newBuys = []) {
  const hunting = (profiles ?? []).filter((p) => p.status === 'hunting');
  const at = (field, keep = () => true) => fromParts(hunting.filter(keep)
    .reduce((n, p) => n + cents(p.wanted_qty) * cents(p[field]), 0));
  const live = (newBuys ?? []).filter((n) => n.status === 'planned' || n.status === 'bought');
  const cost = (field, keep = () => true) => fromParts(live.filter(keep)
    .reduce((s, n) => s + (n.status === 'bought' ? cents(n.paid) * 100 : cents(n.quantity) * cents(n[field])), 0));

  const shGood = at('price_good');
  const aesthetic = at('price_good', (p) => p.purpose === 'aesthetic');
  const unconfirmed = at('price_good', (p) => !TRUSTED.has(p.price_confidence));
  const out = {
    kinds: hunting.length,
    sh_steal: at('price_steal'), sh_good: shGood, sh_fair: at('price_fair'), sh_new: at('price_new'),
    utility_good: at('price_good', (p) => (p.purpose ?? 'utility') === 'utility'),
    aesthetic_good: aesthetic,
    unconfirmed_good: unconfirmed,
    new_kinds: live.length,
    new_low: cost('price_low'), new_mid: cost('price_mid'), new_high: cost('price_high'),
  };
  out.all_in_steal = round(out.sh_steal + out.new_low, 2);
  out.all_in_good = round(out.sh_good + out.new_mid, 2);
  out.all_in_fair = round(out.sh_fair + out.new_high, 2);
  out.day_one_all_in = round(at('price_good', (p) => p.tier === 'day_one')
    + cost('price_mid', (n) => n.tier === 'day_one'), 2);
  out.aesthetic_share = shGood > 0 ? round(aesthetic / shGood, 4) : null;
  out.unconfirmed_share = shGood > 0 ? round(unconfirmed / shGood, 4) : null;
  return out;
}

/**
 * Each active benchmark beside our figure for the same ground: the
 * second-hand plan alone against a furniture-only figure, the plan all
 * in against the rest. `position` is below, within or above the
 * benchmark's range; `ratio` is ours over its middle figure.
 */
export function versusBenchmarks(position, benchmarks) {
  if (!position) return [];
  return (benchmarks ?? []).filter((b) => (b.status ?? 'active') === 'active').map((b) => {
    const furniture = b.covers === 'furniture';
    const [low, mid, high] = [num(b.amount_low), num(b.amount_mid), num(b.amount_high)];
    const ours = furniture ? position.sh_good : position.all_in_good;
    const middle = mid ?? (low != null && high != null ? (low + high) / 2 : low ?? high);
    const floor = low ?? mid ?? high;
    const ceiling = high ?? mid ?? low;
    return {
      key: b.key, label: b.label, covers: b.covers, home: b.home, basis: b.basis,
      amount_low: low, amount_mid: mid, amount_high: high,
      published_on: b.published_on ?? null, confidence: b.confidence ?? null,
      compared_with: furniture ? 'second_hand_plan' : 'all_in',
      ours_steal: furniture ? position.sh_steal : position.all_in_steal,
      ours_good: ours,
      ours_fair: furniture ? position.sh_fair : position.all_in_fair,
      ratio: middle ? round(ours / middle, 4) : null,
      position: ours < floor ? 'below' : ours > ceiling ? 'above' : 'within',
      includes_decorating: b.covers === 'furnishing_and_decorating',
      sort_order: b.sort_order ?? 100,
    };
  }).sort((a, b) => a.sort_order - b.sort_order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** One line on where the plan sits, for the page. Never "you can afford
 *  this": the comparison is of what is spent, not of what is in the bank. */
export function budgetVerdict(rows) {
  const comparable = (rows ?? []).filter((r) => r.ratio != null);
  if (!comparable.length) return null;
  const below = comparable.filter((r) => r.position === 'below').length;
  const above = comparable.filter((r) => r.position === 'above').length;
  if (above === 0 && below === comparable.length) return 'below';
  if (above === 0) return 'within';
  if (below === 0 && above === comparable.length) return 'above';
  return 'mixed';
}
