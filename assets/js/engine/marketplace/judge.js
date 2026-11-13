// judge.js - one listing against one profile.
//
// Say what the thing IS before saying what it is worth. A band says it
// is cheap; a grade says it is good; a style fit says it suits the
// house. A verdict needs all three, and this module is where the page
// learns why one was refused.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => (v == null || v === '' ? null : Number(v));

/** Where a UNIT price sits on a profile's ladder: steal, good, fair,
 *  high, over - or null when there is no price or no fair price to
 *  measure against. The same rule as mp_band(). */
export function band(unitAsking, profile) {
  const unit = num(unitAsking);
  const fair = num(profile?.price_fair);
  if (unit == null || !profile || fair == null) return null;
  if (unit <= (num(profile.price_steal) ?? -1)) return 'steal';
  if (unit <= (num(profile.price_good) ?? -1)) return 'good';
  if (unit <= fair) return 'fair';
  if (unit <= (num(profile.price_max) ?? fair)) return 'high';
  return 'over';
}

const answerOf = (answers, key) => {
  const a = answers?.[key]?.answer;
  return a === 'pass' || a === 'fail' ? a : 'unseen';
};
const live = (checks) => (checks ?? []).filter((c) => (c.status ?? 'active') === 'active');
const inOrder = (a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100)
  || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** The must-pass checks nobody has answered, as the questions to ask. */
export function unseenChecks(checks, answers) {
  return live(checks).filter((c) => c.must_pass && answerOf(answers, c.key) === 'unseen')
    .sort(inOrder)
    .map((c) => ({ key: c.key, question: c.question, how: c.how, doorstep: !!c.doorstep }));
}

/** Can every unseen check be settled at the door? False when nothing
 *  is unseen: there is then nothing for the doorstep to settle. */
export const doorstepOk = (unseen) => unseen.length > 0 && unseen.every((u) => u.doorstep);

/**
 * The quality grade, with its reasons. `checks` is the profile's
 * checklist, or null when the find has no profile; `answers` is the
 * find's `checks` object; `maker` the maker row, if one is evidenced.
 *
 *   A  every must-pass passes, and a `seek` maker or every distinction.
 *   B  every must-pass passes.
 *   C  a must-pass is unseen, or the profile has no checks at all.
 *   X  a must-pass fails, or the maker is one to avoid.
 */
export function grade(checks, answers, maker) {
  const list = live(checks);
  const must = list.filter((c) => c.must_pass);
  const failed = must.filter((c) => answerOf(answers, c.key) === 'fail');
  const passed = must.filter((c) => answerOf(answers, c.key) === 'pass');
  const dist = list.filter((c) => c.distinction);
  const distPassed = dist.filter((c) => answerOf(answers, c.key) === 'pass');
  if (maker?.standing === 'avoid') return { grade: 'X', reasons: [`${maker.name} is a maker to avoid.`] };
  if (failed.length) return { grade: 'X', reasons: failed.map((c) => `Failed: ${c.question}`) };
  if (checks == null) return { grade: null, reasons: ['No profile, so no checks to prove it against.'] };
  if (!must.length) return { grade: 'C', reasons: ['This profile has no checks yet, so nothing is proven.'] };
  if (passed.length < must.length) {
    const n = must.length - passed.length;
    return { grade: 'C', reasons: [`${n} must-pass check${n === 1 ? '' : 's'} not yet seen.`] };
  }
  if (maker?.standing === 'seek') return { grade: 'A', reasons: [`Every check passes, and it is by ${maker.name}.`] };
  if (dist.length && distPassed.length === dist.length) {
    return { grade: 'A', reasons: ['Every check passes, with the marks of a better piece.'] };
  }
  return { grade: 'B', reasons: ['Every must-pass check passes.'] };
}

/** A to D from the brief's travel bands, by miles where known and by
 *  minutes otherwise; 'beyond' past the last band; null when the
 *  distance is unknown, because unknown is not band A. */
export function travelBand(brief, miles, minutes) {
  const m = num(miles);
  const t = num(minutes);
  if (m == null && t == null) return null;
  const bands = [...(brief?.travel_bands ?? [])].sort((a, b) => Number(a.miles_max) - Number(b.miles_max));
  const hit = bands.find((b) => (m != null ? m <= Number(b.miles_max) : t <= Number(b.minutes_max)));
  return hit ? hit.band : 'beyond';
}

const REFUSALS = {
  grade_x: 'A must-pass check failed, or the maker is one to avoid. The only verdict is pass.',
  wrong_for_house: 'A style fit of 1 or 2 is wrong for the house at any price. The only verdict is pass.',
  no_profile: 'There is no profile, so no checks and no grade. Research a profile first.',
  fit: 'Buying needs a style fit of 4 or 5. Watch it, or look again at the fit.',
  unproven: 'A must-pass check is unseen. Buying unproven is allowed only at the steal price, close to home, '
    + 'with every open check settled on the doorstep.',
};

/** The guard as a code, or null when the verdict is allowed. The same
 *  rule, in the same order, as mp_verdict_refusal(). */
export function verdictRefusal(verdict, gradeLetter, fit, priceBand, travel, doorstep) {
  const f = num(fit);
  if (verdict == null || verdict === 'pass') return null;
  if (gradeLetter === 'X') return 'grade_x';
  if (f != null && f <= 2) return 'wrong_for_house';
  if (verdict === 'watch') return null;
  if (gradeLetter == null) return 'no_profile';
  if ((f ?? 0) < 4) return 'fit';
  if (verdict === 'offer') return null;
  if (gradeLetter === 'A' || gradeLetter === 'B') return null;
  if (priceBand === 'steal' && travel === 'A' && doorstep === true) return null;
  return 'unproven';
}

/** The guard, with the refusal in words the page can show. */
export function verdictAllowed(verdict, gradeLetter, priceBand, travel, { fit = null, doorstep = false } = {}) {
  const code = verdictRefusal(verdict, gradeLetter, fit, priceBand, travel, doorstep);
  return { allowed: code == null, code, why: code ? REFUSALS[code] : null };
}

/** What a trip leaves after the car: the margin, never a yes or no.
 *  45p a mile all in unless the brief says otherwise. */
export function tripWorth({ fair, price, roundTripMiles, costPerMile = 0.45 }) {
  if (num(fair) == null || num(price) == null || num(roundTripMiles) == null) return null;
  const tripCost = round2(Number(roundTripMiles) * Number(costPerMile));
  const margin = round2(Number(fair) - Number(price) - tripCost);
  return { tripCost, margin, worth: margin > 0 };
}

/**
 * Where to open and where to stop, for the whole lot, by the offer
 * rule: above fair, open at the good price; between good and fair, a
 * fifth under asking with a reason; at or under good, pay the asking
 * price and go today.
 */
export function offerRange(row) {
  const qty = Number(row.quantity ?? 1);
  const asking = num(row.asking_price);
  const good = num(row.price_good);
  const fair = num(row.price_fair);
  if (asking == null || good == null || fair == null) return null;
  const b = row.price_band ?? band(asking / qty, row);
  if (b === 'steal' || b === 'good') return { kind: 'accept', open: asking, stop: asking };
  if (b === 'fair') return { kind: 'offer', open: Math.max(round2(good * qty), Math.round(asking * 0.8)), stop: asking };
  return { kind: 'offer', open: round2(good * qty), stop: round2(fair * qty) };
}

const HOW = { photo: 'a photograph', ask_seller: 'the seller', in_hand: 'seeing it in the hand' };

/** The unseen checks of a ledger row as plain questions. */
export const questionsFor = (row) => (row.unseen_checks ?? [])
  .map((u) => ({ ...u, settledBy: HOW[u.how] ?? 'a look' }));

const PHOTOS = {
  storage: 'a drawer pulled right out, the back and the underside',
  tables: 'the underside and any drawer pulled out',
  seating: 'the underside and any label under the cushions',
  textiles: 'the back and one corner folded over',
  mirrors_art: 'the back',
  kitchen_dining: 'the base and any maker\'s mark',
  lighting: 'the base, the flex and the plug',
};

/**
 * A short polite message for the owner to send himself. Text only.
 * Never a deposit, never a move off the platform - the brief's `never`
 * rule - and those two things are not negotiable here either.
 *   ask     the open questions and the photographs that settle them
 *   offer   the opening offer, one reason and a collection time
 *   accept  the asking price, today
 */
export function sellerMessage(row, kind) {
  const what = row.title;
  if (kind === 'accept') {
    return `Hello, I would like the ${what} at your asking price of £${num(row.asking_price)}. `
      + 'I can collect today or tomorrow and pay on collection. When would suit you?';
  }
  if (kind === 'offer') {
    const open = num(row.opening_offer) ?? offerRange(row)?.open;
    if (open == null) return null;
    return `Hello, I like the ${what}. Would you take £${open}? I can collect this week at a time `
      + 'that suits you and pay on collection.';
  }
  const asks = questionsFor(row).filter((q) => q.how !== 'in_hand').map((q) => q.question);
  const photos = PHOTOS[row.category] ?? 'the back and the underside';
  return `Hello, is the ${what} still available? ${asks.length ? `Could you tell me: ${asks.join(' ')} ` : ''}`
    + `And could you send a photograph of ${photos}? Thank you.`;
}

/**
 * Every find against its profile - the page's copy of mp_find_ledger,
 * used to build the demo and anywhere the view is not to hand.
 */
export function ledger(finds, { profiles = [], checks = [], makers = [], brief = null } = {}) {
  const pById = new Map(profiles.map((p) => [p.id, p]));
  const mById = new Map(makers.map((m) => [m.id, m]));
  return (finds ?? []).map((f) => {
    const p = pById.get(f.profile_id) ?? null;
    const maker = mById.get(f.maker_id) ?? null;
    const own = p ? checks.filter((c) => c.profile_id === p.id) : null;
    const qty = Number(f.quantity ?? 1);
    const unit = num(f.asking_price) == null ? null : round2(Number(f.asking_price) / qty);
    const g = grade(own, f.checks, maker).grade;
    const unseen = unseenChecks(own, f.checks);
    const tb = travelBand(brief, f.distance_miles, f.drive_minutes);
    const pb = p ? band(unit, p) : null;
    const refusal = verdictRefusal(f.verdict, g, f.style_fit, pb, tb, doorstepOk(unseen));
    const bought = f.status === 'bought';
    const travel = Number(f.travel_cost ?? 0);
    return {
      ...f,
      profile_key: p?.key ?? null, profile_name: p?.name ?? null, category: p?.category ?? null,
      tier: p?.tier ?? null, size_class: p?.size_class ?? null, buy_window: p?.buy_window ?? null,
      price_steal: p?.price_steal ?? null, price_good: p?.price_good ?? null,
      price_fair: p?.price_fair ?? null, price_max: p?.price_max ?? null, price_new: p?.price_new ?? null,
      price_confidence: p?.price_confidence ?? null,
      unit_asking: unit, price_band: pb,
      haggled_off: bought && unit != null ? round2(Number(f.asking_price) - Number(f.paid)) : null,
      saved_vs_fair: bought && p?.price_fair != null ? round2(p.price_fair * qty - Number(f.paid) - travel) : null,
      saved_vs_new: bought && p?.price_new != null ? round2(p.price_new * qty - Number(f.paid) - travel) : null,
      maker_name: maker?.name ?? null, maker_standing: maker?.standing ?? null,
      quality_grade: g, unseen_checks: unseen, travel_band: tb,
      verdict_refusal: refusal, verdict_stands: refusal == null,
    };
  });
}
