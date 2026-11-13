// hunt.js - the whole campaign: what is still wanted, in what order,
// which alerts to have set, what has been spent and what the prices
// seen so far imply.
//
// Bought, outstanding and spent are DERIVED from the finds. Thresholds
// are typed until the evidence earns them; the evidence suggests and
// never overwrites.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const TRUSTED = new Set(['confirmed', 'actual']);
const LIVE = new Set(['spotted', 'messaged', 'offered', 'agreed']);
const TIER_RANK = { day_one: 1, first_month: 2, first_year: 3, opportunistic: 4 };
const LEAD = { rare: 2, scarce: 1 };
const DAY = 864e5;
const days = (a, b) => Math.floor((Date.parse(a) - Date.parse(b)) / DAY);

export const TIERS = ['day_one', 'first_month', 'first_year', 'opportunistic'];
/** A threshold captured longer ago than this is shown as stale. Its
 *  own rule: auction prices move more slowly than a shop benchmark. */
export const THRESHOLD_STALE_DAYS = 365;
export const isStale = (capturedOn, today) =>
  !capturedOn || days(today, capturedOn) > THRESHOLD_STALE_DAYS;

/** The page's copy of mp_board: each profile with what has been bought
 *  against it. A placeholder is counted apart and fills nothing. */
export function board(profiles, finds, items = []) {
  const wById = new Map(items.map((w) => [w.id, w]));
  return (profiles ?? []).map((p) => {
    const own = (finds ?? []).filter((f) => f.profile_id === p.id);
    const bought = own.filter((f) => f.status === 'bought');
    const qty = (list) => list.reduce((n, f) => n + Number(f.quantity ?? 1), 0);
    const boughtQty = qty(bought.filter((f) => !f.is_placeholder));
    const outstanding = Math.max(0, Number(p.wanted_qty) - boughtQty);
    const w = wById.get(p.work_item_id);
    return {
      ...p,
      tier_rank: TIER_RANK[p.tier] ?? 4,
      list_title: w?.title ?? null, list_cost: w?.cost_expected ?? null,
      list_cost_confidence: w?.cost_confidence ?? null, list_status: w?.status ?? null,
      bought_qty: boughtQty,
      qty_outstanding: outstanding,
      spent: round2(bought.reduce((n, f) => n + Number(f.paid ?? 0) + Number(f.travel_cost ?? 0), 0)),
      live_finds: own.filter((f) => LIVE.has(f.status)).length,
      budget_outstanding: round2(outstanding * Number(p.price_good ?? 0)),
      placeholder_qty: qty(bought.filter((f) => f.is_placeholder)),
    };
  });
}

/** none, exchanged or moved - from the household's properties, as
 *  mp_house_state() reads them. */
export function houseState(properties) {
  const has = (s) => (properties ?? []).some((p) => p.status === s);
  return has('owned') ? 'moved' : has('committed') ? 'exchanged' : 'none';
}

/** Whether a profile may be bought yet, and why not. */
export function canBuyNow(profile, state) {
  const w = profile.buy_window;
  if (w === 'any_time') return { can: true, why: null };
  if (w === 'from_exchange') {
    return state === 'exchanged' || state === 'moved'
      ? { can: true, why: null }
      : { can: false, why: 'Waits for contracts to exchange: there is nowhere to put it yet.' };
  }
  return state === 'moved'
    ? { can: true, why: null }
    : { can: false, why: 'Waits for the move: it is bought against the house itself.' };
}

/**
 * What to hunt next - the same order as mp_hunt_queue. Need first (the
 * tier), pulled earlier for scarce and rare things; anchors before what
 * is scaled to them; then the biggest saving against new. A profile
 * that cannot be bought yet stays in the queue to be WATCHED.
 */
export function huntQueue(boardRows, state, today) {
  const hunting = (boardRows ?? []).filter((b) => b.status === 'hunting' && Number(b.qty_outstanding) > 0);
  const open = new Set(hunting.map((b) => b.key));
  const rows = hunting.map((b) => {
    const startRank = Math.max(1, b.tier_rank - (LEAD[b.supply] ?? 0));
    const waits = !!b.anchor_of && open.has(b.anchor_of);
    const saving = round2(Number(b.qty_outstanding)
      * Math.max(0, Number(b.price_new ?? 0) - Number(b.price_good ?? 0)));
    const buy = canBuyNow(b, state);
    const since = String(b.created_at ?? today).slice(0, 10);
    const fallbackFrom = b.fallback_weeks
      ? new Date(Date.parse(since) + b.fallback_weeks * 7 * DAY).toISOString().slice(0, 10) : null;
    const reasons = [];
    reasons.push(b.tier === 'opportunistic' ? 'Only if one turns up.' : `Needed ${b.tier.replace('_', ' ')}.`);
    if (startRank < b.tier_rank) reasons.push(`Started early: ${b.supply} things take months to turn up.`);
    if (waits) reasons.push(`After the ${b.anchor_of.replace(/_/g, ' ')}, which sets its scale.`);
    if (saving > 0) reasons.push(`Saves about £${Math.round(saving)} against new.`);
    if (!buy.can) reasons.push(buy.why);
    return {
      ...b, start_rank: startRank, waits_for_anchor: waits, saving_vs_new: saving,
      house_state: state, can_buy_now: buy.can, mode: buy.can ? 'buy' : 'watch',
      hunting_since: since, weeks_hunted: Math.floor(days(today, since) / 7),
      fallback_from: fallbackFrom,
      fallback_due: b.tier === 'day_one' && !!b.fallback && !!fallbackFrom
        && Number(b.placeholder_qty ?? 0) === 0 && state !== 'none' && today >= fallbackFrom,
      reasons,
    };
  });
  rows.sort((a, b) => a.start_rank - b.start_rank
    || Number(a.waits_for_anchor) - Number(b.waits_for_anchor)
    || b.saving_vs_new - a.saving_vs_new
    || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return rows.map((r, i) => ({ ...r, queue_rank: i + 1 }));
}

/**
 * The ration: which searches should be alerts today, and what to do
 * about each - keep, set or retire. At most `limit`. A search written
 * as an alert outranks a sweep; then day-one and scarce profiles; then
 * the queue. The same rule as mp_alerts_to_set.
 */
export function alertsToSet(queue, searches, limit = 10) {
  const qById = new Map(queue.map((q) => [q.id ?? q.profile_id, q]));
  const active = (searches ?? []).filter((s) => (s.status ?? 'active') === 'active');
  const text = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const ranked = active.filter((s) => qById.has(s.profile_id))
    .map((s) => ({ s, q: qById.get(s.profile_id) }))
    .sort((a, b) => Number(b.s.cadence === 'alert') - Number(a.s.cadence === 'alert')
      || Number(b.q.tier === 'day_one' || b.q.supply === 'scarce' || b.q.supply === 'rare')
       - Number(a.q.tier === 'day_one' || a.q.supply === 'scarce' || a.q.supply === 'rare')
      || a.q.queue_rank - b.q.queue_rank
      || (a.s.sort_order ?? 100) - (b.s.sort_order ?? 100)
      || text(a.s.label, b.s.label))
    .map(({ s, q }, i) => ({
      ...s, key: q.key, name: q.name, queue_rank: q.queue_rank, slot: i + 1,
      action: i < limit ? (s.is_alert ? 'keep' : 'set') : 'retire',
    }))
    .filter((r) => r.slot <= limit || r.is_alert);
  const orphans = active.filter((s) => s.is_alert && !qById.has(s.profile_id))
    .map((s) => ({ ...s, key: null, name: null, queue_rank: null, slot: null, action: 'retire' }));
  return [...ranked, ...orphans];
}

const CADENCE_DAYS = { daily: 1, twice_weekly: 3, weekly: 7, monthly: 30 };

/** The sweeps run by hand, with whether each is due. An alert is not a
 *  sweep. `last_run_on` is written when the owner says a sweep is done. */
export function sweepsDue(searches, today) {
  return (searches ?? [])
    .filter((s) => (s.status ?? 'active') === 'active' && !s.is_alert && CADENCE_DAYS[s.cadence])
    .map((s) => {
      const since = s.last_run_on ? days(today, s.last_run_on) : null;
      return { ...s, days_since: since, due: since == null || since >= CADENCE_DAYS[s.cadence] };
    })
    .sort((a, b) => CADENCE_DAYS[a.cadence] - CADENCE_DAYS[b.cadence]
      || (a.sort_order ?? 100) - (b.sort_order ?? 100));
}

/** The money by tier - mp_totals. `unconfirmed_budget` is how much of
 *  the budget rests on thresholds nobody has confirmed. */
export function tierTotals(boardRows) {
  const rows = (boardRows ?? []).filter((b) => b.status !== 'dropped' && b.status !== 'idea');
  const sum = (list, f) => round2(list.reduce((n, b) => n + f(b), 0));
  return TIERS.map((tier) => {
    const list = rows.filter((b) => b.tier === tier);
    const at = (field) => (b) => Number(b.wanted_qty) * Number(b[field] ?? 0);
    return {
      tier, tier_rank: TIER_RANK[tier], profiles: list.length,
      profiles_filled: list.filter((b) => Number(b.wanted_qty) > 0 && Number(b.qty_outstanding) === 0).length,
      budget_good: sum(list, at('price_good')), budget_fair: sum(list, at('price_fair')),
      budget_ceiling: sum(list, at('price_max')), cost_if_new: sum(list, at('price_new')),
      spent: sum(list, (b) => Number(b.spent)),
      outstanding_good: sum(list, (b) => Number(b.budget_outstanding)),
      unconfirmed_budget: sum(list.filter((b) => !TRUSTED.has(b.price_confidence)), at('price_good')),
    };
  }).filter((t) => t.profiles > 0);
}

/** The headline: spent, saved and still to find, with how much of the
 *  last rests on unconfirmed thresholds. Savings are net of travel. */
export function ledgerTotals(ledgerRows, totals) {
  const bought = (ledgerRows ?? []).filter((l) => l.status === 'bought');
  const add = (f) => round2(bought.reduce((n, l) => n + Number(f(l) ?? 0), 0));
  const toFind = round2((totals ?? []).reduce((n, t) => n + Number(t.outstanding_good), 0));
  const budget = (totals ?? []).reduce((n, t) => n + Number(t.budget_good), 0);
  const unconfirmed = (totals ?? []).reduce((n, t) => n + Number(t.unconfirmed_budget), 0);
  return {
    purchases: bought.length,
    placeholders: bought.filter((l) => l.is_placeholder).length,
    spent: add((l) => Number(l.paid) + Number(l.travel_cost ?? 0)),
    haggled: add((l) => l.haggled_off),
    saved_vs_fair: add((l) => l.saved_vs_fair),
    saved_vs_new: add((l) => l.saved_vs_new),
    to_find_good: toFind,
    // The share of the budget nobody has confirmed, as a fraction.
    unconfirmed_share: budget > 0 ? unconfirmed / budget : 0,
    trusted: budget > 0 && unconfirmed === 0,
  };
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const whole = (n) => (n == null ? null : Math.round(n));
const SOLD = new Set(['auction_hammer', 'sold_listing', 'own_purchase']);
export const EVIDENCE_MIN = 5;
export const EVIDENCE_TOLERANCE = 0.2;

/**
 * What the dated prices imply, per profile - mp_price_evidence. Only
 * typical SOLD prices from the last 24 months count. Asking prices and
 * auction estimates are counted and never drive a threshold.
 */
export function priceEvidence(profiles, observations, today) {
  const cutoff = new Date(Date.parse(today));
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 24);
  const from = cutoff.toISOString().slice(0, 10);
  return (profiles ?? []).map((p) => {
    const own = (observations ?? []).filter((o) => o.profile_id === p.id && (o.status ?? 'active') === 'active');
    const sold = own.filter((o) => SOLD.has(o.kind) && o.is_typical !== false && o.observed_on >= from);
    const col = (list, f) => list.map((o) => Number(o[f])).sort((a, b) => a - b);
    const hammer = col(sold, 'unit_price');
    const allIn = col(sold, 'price_all_in');
    const of = (kind) => own.filter((o) => o.kind === kind);
    const medianAllIn = quantile(allIn, 0.5);
    return {
      profile_id: p.id, key: p.key, name: p.name,
      price_steal: p.price_steal, price_good: p.price_good, price_fair: p.price_fair,
      price_max: p.price_max, price_new: p.price_new,
      price_confidence: p.price_confidence, captured_on: p.captured_on,
      is_stale: isStale(p.captured_on, today),
      sold_n: sold.length, asking_n: of('asking').length,
      estimate_n: of('auction_estimate').length, dealer_n: of('dealer').length,
      median_hammer: quantile(hammer, 0.5), median_all_in: medianAllIn,
      median_asking: quantile(col(of('asking'), 'unit_price'), 0.5),
      has_enough: sold.length >= EVIDENCE_MIN,
      implied_steal: whole(medianAllIn == null ? null : medianAllIn / 2),
      implied_good: whole(quantile(hammer, 0.5)),
      implied_fair: whole(medianAllIn),
      implied_max: whole(quantile(allIn, 0.75)),
      implied_new: whole(quantile(col(of('dealer'), 'unit_price'), 0.5)),
    };
  });
}

/** Thresholds the evidence disputes by more than a fifth, on five or
 *  more sold prices. A prompt for the owner; nothing is changed. */
export function thresholdReview(evidence) {
  const out = [];
  for (const e of evidence ?? []) {
    if (!e.has_enough) continue;
    for (const t of ['steal', 'good', 'fair', 'max']) {
      const typed = e[`price_${t}`] == null ? null : Number(e[`price_${t}`]);
      const implied = e[`implied_${t}`];
      if (!typed || implied == null) continue;
      if (Math.abs(implied - typed) / typed > EVIDENCE_TOLERANCE) {
        out.push({ profile_id: e.profile_id, key: e.key, name: e.name, threshold: t, typed, implied,
          pct_out: Math.round(((implied - typed) / typed) * 100), sold_n: e.sold_n });
      }
    }
  }
  return out;
}

/** One line on how well a profile's ladder is evidenced. */
export function evidenceSummary(e) {
  if (!e || (e.sold_n === 0 && e.asking_n === 0)) return 'No dated prices yet: the ladder is an estimate.';
  const sold = `${e.sold_n} sold price${e.sold_n === 1 ? '' : 's'}`;
  const asking = e.asking_n ? `, ${e.asking_n} asking` : '';
  if (e.has_enough) return `${sold}${asking}. Enough to test the ladder against.`;
  return `${sold}${asking}. ${EVIDENCE_MIN - e.sold_n} more sold before the evidence can suggest a change.`;
}

export const LESSONS_MIN = 5;

/**
 * What the owner's own buying teaches: paid against asking by
 * category, and which grounds actually produce. Says "not enough yet"
 * (enough: false) before five real purchases, because a ratio over two
 * purchases is an anecdote.
 */
export function lessons(ledgerRows, grounds = []) {
  const bought = (ledgerRows ?? []).filter((l) => l.status === 'bought' && !l.is_placeholder);
  const group = (keyOf, labelOf) => {
    const m = new Map();
    for (const l of bought) {
      const k = keyOf(l);
      if (k == null) continue;
      const g = m.get(k) ?? { key: k, label: labelOf(l, k), purchases: 0, paid: 0, asking: 0 };
      g.purchases += 1;
      g.paid += Number(l.paid);
      g.asking += Number(l.asking_price ?? l.paid);
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ ...g, paid_to_asking: g.asking > 0 ? g.paid / g.asking : null }))
      .sort((a, b) => b.purchases - a.purchases || (a.label < b.label ? -1 : 1));
  };
  const gById = new Map(grounds.map((g) => [g.id, g]));
  return {
    enough: bought.length >= LESSONS_MIN,
    purchases: bought.length,
    needed: Math.max(0, LESSONS_MIN - bought.length),
    byCategory: group((l) => l.category, (l, k) => k),
    byGround: group((l) => l.ground_id ?? l.platform, (l, k) => gById.get(k)?.name ?? String(k).replace(/_/g, ' ')),
  };
}

/** Per shopping line: what its profiles come to second hand -
 *  mp_line_benchmark. A benchmark beside the estimate, never instead. */
export function lineBenchmark(boardRows) {
  const m = new Map();
  for (const b of boardRows ?? []) {
    if (!b.work_item_id || b.status === 'dropped' || b.status === 'idea') continue;
    const g = m.get(b.work_item_id) ?? { work_item_id: b.work_item_id, profiles: 0, second_hand_good: 0,
      second_hand_fair: 0, second_hand_max: 0, cost_if_new: 0, spent: 0,
      nothing_outstanding: true, is_unconfirmed: false };
    const q = Number(b.wanted_qty);
    g.profiles += 1;
    g.second_hand_good = round2(g.second_hand_good + q * Number(b.price_good ?? 0));
    g.second_hand_fair = round2(g.second_hand_fair + q * Number(b.price_fair ?? 0));
    g.second_hand_max = round2(g.second_hand_max + q * Number(b.price_max ?? 0));
    g.cost_if_new = round2(g.cost_if_new + q * Number(b.price_new ?? 0));
    g.spent = round2(g.spent + Number(b.spent ?? 0));
    g.nothing_outstanding = g.nothing_outstanding && (q === 0 || Number(b.qty_outstanding) === 0);
    g.is_unconfirmed = g.is_unconfirmed || !TRUSTED.has(b.price_confidence);
    m.set(b.work_item_id, g);
  }
  return [...m.values()];
}

/**
 * Is a shopping line's estimate in step with what second hand costs?
 * 'under' means the estimate is below even the GOOD second-hand price,
 * which is a line that cannot be met; 'over' means it is above the
 * fair price, which is money the list is holding that it may not need.
 */
export function secondHandCheck(item, benchmark) {
  const target = item.cost_expected ?? item.cost_best ?? null;
  if (!benchmark || target == null) return null;
  const good = Number(benchmark.second_hand_good);
  const fair = Number(benchmark.second_hand_fair);
  const verdict = Number(target) < good ? 'under' : Number(target) > fair ? 'over' : 'within';
  return { verdict, good, fair, gap: round2(Number(target) - good) };
}
