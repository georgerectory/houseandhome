// priority.js - the priority score, as a pure function.
//
// Mirrors recompute_priorities() in supabase/schema/80_functions.sql.
// The database is the authority; this exists so the front end can
// explain an ordering without a round trip, and so the rule is
// unit-testable. Parity is enforced by test, not by hope.
//
// score = room_weight * theme_weight * benefit_weight
//       + 5 * (open items this one must precede)
//       + decay pressure (preservation work grows urgent with age)
//       - 25 if this item is itself blocked
//
// The core is MULTIPLICATIVE on purpose. Adding the three axes would
// let a cosmetic job in the best room outrank a make-safe job in the
// worst one; multiplying means a low score on any axis holds the whole
// item down, which is how a house actually works.

export const DEFAULT_WEIGHT = 3;
export const UNBLOCKS_BONUS = 5;
export const BLOCKED_PENALTY = 25;
export const DECAY_CAP = 25;

/**
 * @param {object} input
 * @param {number} [input.roomWeight]    1-5, how much this room matters now
 * @param {number} [input.themeWeight]   1-5, make-safe outranks cosmetic
 * @param {number} [input.benefitWeight] 1-5, from the benefit type
 * @param {number} [input.unblocks]      open items this one must precede
 * @param {number} [input.blockedBy]     open items blocking this one
 * @param {string} [input.benefitType]
 * @param {number} [input.ageMonths]     age, for preservation decay
 * @returns {{score:number, explain:object}}
 */
export function priorityScore(input = {}) {
  const rw = input.roomWeight ?? DEFAULT_WEIGHT;
  const tw = input.themeWeight ?? DEFAULT_WEIGHT;
  const bw = input.benefitWeight ?? DEFAULT_WEIGHT;
  const unblocks = input.unblocks ?? 0;
  const blockedBy = input.blockedBy ?? 0;

  const base = rw * tw * bw;
  const decayPressure = input.benefitType === 'preservation'
    ? Math.min(DECAY_CAP, Math.floor(input.ageMonths ?? 0) * 2)
    : 0;
  const unblocksBonus = UNBLOCKS_BONUS * unblocks;
  const blockedPenalty = blockedBy > 0 ? -BLOCKED_PENALTY : 0;

  const score = Math.max(1, base + unblocksBonus + decayPressure + blockedPenalty);

  return {
    score,
    explain: {
      room_weight: rw,
      theme_weight: tw,
      benefit_weight: bw,
      base,
      unblocks,
      unblocks_bonus: unblocksBonus,
      decay_pressure: decayPressure,
      blocked_by: blockedBy,
      blocked_penalty: blockedPenalty,
    },
  };
}

/**
 * Rank a list by score descending; ties break by id so it is stable.
 *
 * `priority_override` WINS, exactly as `recompute_priorities()` does -
 * `coalesce(priority_override, rnk)`. This module used to write
 * `idx + 1` unconditionally, so any item the owner had pinned by hand
 * ranked one way in the database and another in the front end. There
 * was no parity gate to catch it; there is one now.
 */
export function rank(items) {
  return [...items]
    .map((i) => ({ ...i, ...priorityScore(i) }))
    .sort((a, b) => (b.score - a.score) || String(a.id).localeCompare(String(b.id)))
    .map((i, idx) => ({ ...i, priority: i.priority_override ?? (idx + 1) }));
}

/** Turn an explain payload into one plain sentence. */
export function explainInWords(explain = {}) {
  if (!explain.base) return 'Not yet scored.';
  const parts = [
    `room ${explain.room_weight}/5 x theme ${explain.theme_weight}/5 x benefit ${explain.benefit_weight}/5 = ${explain.base}`,
  ];
  if (explain.unblocks) parts.push(`+${explain.unblocks_bonus} for unblocking ${explain.unblocks} item(s)`);
  if (explain.decay_pressure) parts.push(`+${explain.decay_pressure} for age (preservation work)`);
  if (explain.blocked_by) parts.push(`${explain.blocked_penalty} because ${explain.blocked_by} item(s) block it`);
  return parts.join(', ');
}
