// model.js - everything the Marketplace page shows, worked out once.
// Pure: the loaded rows in, a plain object out. The page renders it and
// the unit tests read it, so a state the sweep never reaches (no
// purchases, no profiles, no evidence) is still checked.
import {
  huntQueue, alertsToSet, sweepsDue, ledgerTotals, lessons, tripWorth, offerRange,
  questionsFor, sellerMessage, grade, evidenceSummary, isStale,
} from '../../engine/marketplace.js';

const LIVE = new Set(['spotted', 'messaged', 'offered', 'agreed']);
const VERDICT_ORDER = { buy: 0, offer: 1, watch: 2 };
const by = (list, key) => {
  const m = new Map();
  for (const r of list ?? []) {
    if (!m.has(r[key])) m.set(r[key], []);
    m.get(r[key]).push(r);
  }
  return m;
};

export function buildModel(data) {
  const today = data.meta?.today ?? new Date().toISOString().slice(0, 10);
  const brief = data.mp_brief ?? null;
  const boardRows = data.mp_board ?? [];
  const profileById = new Map(boardRows.map((b) => [b.id, b]));
  const checksByProfile = by(data.mp_checks, 'profile_id');
  const makers = data.mp_makers ?? [];
  const makerById = new Map(makers.map((m) => [m.id, m]));
  const makersByCategory = by(makers, 'category');
  const evidenceByProfile = new Map((data.mp_price_evidence ?? []).map((e) => [e.profile_id, e]));
  const state = data.house_state ?? 'none';

  // One find as the page shows it: the ledger row, plus the words.
  const find = (l) => {
    const p = profileById.get(l.profile_id) ?? null;
    const row = { ...l, category: p?.category ?? null };
    const own = p ? (checksByProfile.get(p.id) ?? []) : null;
    const offer = offerRange(row);
    const price = Number(l.opening_offer ?? offer?.open ?? l.asking_price);
    const trip = l.distance_miles == null || l.price_fair == null ? null : tripWorth({
      fair: Number(l.price_fair) * Number(l.quantity ?? 1), price,
      roundTripMiles: Number(l.distance_miles) * 2, costPerMile: Number(brief?.cost_per_mile ?? 0.45),
    });
    const questions = questionsFor(row);
    // A verdict the guard no longer allows is shown, and treated as
    // watch: no price to open at, and the message asks the questions.
    const acting = l.verdict_stands === false ? 'watch' : l.verdict;
    const messageKind = acting === 'buy' ? 'accept' : acting === 'offer' ? 'offer' : 'ask';
    return {
      ...row,
      gradeReasons: grade(own, l.checks, makerById.get(l.maker_id) ?? null).reasons,
      answered: Object.entries(l.checks ?? {}).map(([key, a]) => ({
        key, answer: a.answer, evidence: a.evidence ?? null,
        question: own?.find((c) => c.key === key)?.question ?? key,
      })),
      questions, offer, trip, acting,
      open: l.opening_offer ?? offer?.open ?? null,
      stop: l.max_offer ?? offer?.stop ?? null,
      message: l.verdict === 'pass' || !LIVE.has(l.status) ? null : sellerMessage(row, messageKind),
      messageKind,
    };
  };

  const ledgerRows = (data.mp_find_ledger ?? []).map(find);
  const live = ledgerRows.filter((l) => LIVE.has(l.status) && l.verdict !== 'pass')
    .sort((a, b) => (VERDICT_ORDER[a.verdict] ?? 3) - (VERDICT_ORDER[b.verdict] ?? 3)
      || String(b.seen_on).localeCompare(String(a.seen_on)));
  const turnedDown = ledgerRows.filter((l) => l.verdict === 'pass' || l.status === 'passed' || l.status === 'lost')
    .filter((l) => l.status !== 'bought');
  const bought = ledgerRows.filter((l) => l.status === 'bought')
    .sort((a, b) => String(b.bought_on).localeCompare(String(a.bought_on)));

  const queue = huntQueue(boardRows, state, today).map((q) => ({
    ...q,
    checks: checksByProfile.get(q.id) ?? [],
    seek: (makersByCategory.get(q.category) ?? []).filter((m) => m.standing === 'seek'),
    acceptable: (makersByCategory.get(q.category) ?? []).filter((m) => m.standing === 'acceptable'),
    avoid: (makersByCategory.get(q.category) ?? []).filter((m) => m.standing === 'avoid'),
    evidence: evidenceByProfile.get(q.id) ?? null,
    evidenceLine: evidenceSummary(evidenceByProfile.get(q.id)),
    stale: isStale(q.captured_on, today),
  }));

  const alerts = alertsToSet(queue, data.mp_searches ?? []);
  const sweeps = sweepsDue(data.mp_searches ?? [], today);
  const grounds = data.mp_grounds ?? [];
  const stale = queue.filter((q) => q.stale);

  return {
    today, brief, state,
    hasProfiles: boardRows.length > 0,
    head: ledgerTotals(ledgerRows, data.mp_totals ?? []),
    totals: data.mp_totals ?? [],
    alerts: {
      on: alerts.filter((a) => a.action !== 'retire'),
      retire: alerts.filter((a) => a.action === 'retire'),
      toChange: alerts.filter((a) => a.action !== 'keep').length,
    },
    sweeps,
    auctions: grounds.filter((g) => g.kind === 'auction' || g.kind === 'fair'),
    live, turnedDown, bought,
    real: bought.filter((l) => !l.is_placeholder),
    placeholders: bought.filter((l) => l.is_placeholder),
    queue,
    fallbacksDue: queue.filter((q) => q.fallback_due),
    grounds,
    lessons: lessons(ledgerRows, grounds),
    review: data.mp_threshold_review ?? [],
    stale,
    makers,
    filled: boardRows.filter((b) => b.status === 'filled'),
  };
}
