// diary.js - the dates, tidied for reading.
//
// The whats_next view (65_diary.sql) is the authority and it counts the
// days, because a countdown computed in two places is a countdown that
// disagrees with itself. This module does the part that is presentation
// rather than arithmetic: dropping what has passed, merging the two rows
// that describe one day, and turning a number of days into English.

/**
 * What is still ahead, soonest first, with one row per day.
 *
 * A milestone and an event can legitimately describe the same day - the
 * open house is both a date the plan has to hit and a date the agent
 * set - and the view returns both because they are different records.
 * For reading, the EVENT wins: it is the one that knows the time and the
 * address. The milestone's pinned work count is carried across, so
 * nothing is lost by preferring it.
 */
export function upcoming(rows, { withinDays = null } = {}) {
  const ahead = rows
    .filter((r) => r.days_until != null && r.days_until >= 0)
    .filter((r) => withinDays == null || r.days_until <= withinDays);

  const byDate = new Map();
  for (const r of ahead) {
    const key = r.on_date;
    const held = byDate.get(key);
    if (!held) { byDate.set(key, { ...r }); continue; }
    // Keep the event's detail and the milestone's workload.
    const winner = held.source === 'event' ? held : r;
    const other = held.source === 'event' ? r : held;
    byDate.set(key, {
      ...winner,
      open_items: Math.max(held.open_items ?? 0, r.open_items ?? 0),
      description: winner.description ?? other.description,
      location: winner.location ?? other.location,
    });
  }
  return [...byDate.values()].sort((a, b) => a.days_until - b.days_until);
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
