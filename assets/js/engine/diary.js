// diary.js - the dates, tidied for reading.
//
// The whats_next view (89_road_ahead_logic.sql) is the authority and it
// counts the days, because a countdown computed in two places is a countdown that
// disagrees with itself. This module does the part that is presentation
// rather than arithmetic: dropping what has passed, merging the milestone
// and the event that describe one day, and turning a number of days into
// English.

/**
 * What is still ahead, soonest first.
 *
 * A milestone and an event can legitimately describe the same day - the
 * open house is both a date the plan has to hit and a date the agent
 * set - and the view returns both because they are different records.
 * For reading they are one row, and the EVENT wins: it is the one that
 * knows the time and the address. The milestone's pinned work count is
 * carried across, so nothing is lost by preferring it.
 *
 * Only that pair merges. Two events on one day are two things to be at,
 * and an auction countdown row already carries every lot due that day
 * (whats_next folds them), so neither is folded into anything else.
 */
export function upcoming(rows, { withinDays = null } = {}) {
  const ahead = rows
    .filter((r) => r.days_until != null && r.days_until >= 0)
    .filter((r) => withinDays == null || r.days_until <= withinDays);

  const eventOn = new Map();
  for (const r of ahead) if (r.source === 'event' && !eventOn.has(r.on_date)) eventOn.set(r.on_date, r);
  // Each day's first event takes that day's first milestone.
  const absorbed = new Map();
  const kept = [];
  for (const r of ahead) {
    const ev = r.source === 'milestone' ? eventOn.get(r.on_date) : null;
    if (ev && !absorbed.has(ev)) { absorbed.set(ev, r); continue; }
    kept.push(r);
  }
  return kept.map((r) => {
    const m = absorbed.get(r);
    if (!m) return { ...r };
    return {
      ...r,
      open_items: Math.max(r.open_items ?? 0, m.open_items ?? 0),
      description: r.description ?? m.description,
      location: r.location ?? m.location,
    };
  }).sort((a, b) => a.days_until - b.days_until);
}

/** A count of days as somebody would say it. */
export function whenLabel(days) {
  if (days == null) return 'no date';
  if (days < 0) return 'passed';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  if (days < 730) return `in ${Math.round(days / 30)} months`;
  return `in ${(days / 365).toFixed(1)} years`;
}
