// checklist.js - work item details read as a checklist.
//
// Pure: rows in, structure out. No DOM, no fetch.
//
// WHY THIS EXISTS. A viewing checklist, a document-and-money list, a
// before-you-offer list - these are all work_items. They carry their
// content in `details` as plain text with `- [ ]` lines, because that
// is what a person writes and what reads correctly in a database cell,
// in a terminal and on a page without any of them knowing about the
// others.
//
// The parsing is here rather than in the page for the usual reason:
// the page is a renderer, and anything with a branch in it wants a
// test. It is deliberately NOT a markdown parser. It understands three
// things - a checkbox line, a bare line, and an ALL-CAPS line as a
// subheading - because that is the whole vocabulary these lists use,
// and a general parser would invite content this cannot render.

/** A line that is a tickable item. */
const BOX = /^\s*-\s*\[( |x|X)\]\s*(.+)$/;

/**
 * A subheading: a capitalised LEAD, optionally followed by a dash and a
 * lowercase gloss, and never ending in a full stop.
 *
 *   "STRUCTURE AND GROUND"                  heading
 *   "FLOORS - the expensive unknown"        heading, the lead is FLOORS
 *   "TICK EVERY ONE. A no on any line..."   prose - it is a sentence
 *
 * Testing the whole line for capitals is the obvious rule and it is
 * wrong: most real headings here carry a lowercase explanation after a
 * dash, which is the half that makes them worth reading. So the test is
 * on the lead only, with the terminal full stop as the tie-break.
 */
const isHeading = (line) => {
  const t = line.trim();
  if (t.length === 0 || t.length > 70) return false;
  if (/[.?!]$/.test(t)) return false;
  const lead = t.split(/\s[-–—:]\s/)[0];
  const letters = lead.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
};

/**
 * Parse one item's `details` into blocks.
 *
 * Returns an array of `{ kind, text, items? }` where kind is
 * 'heading', 'note' or 'list'. Consecutive checkbox lines gather into
 * one list so the markup can be a single <ul>.
 */
export function parseDetails(details) {
  const out = [];
  let list = null;

  for (const raw of String(details ?? '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const box = line.match(BOX);

    if (box) {
      if (!list) { list = { kind: 'list', items: [] }; out.push(list); }
      list.items.push({ text: box[2].trim(), done: box[1].toLowerCase() === 'x' });
      continue;
    }

    list = null;
    if (!line.trim()) continue;
    out.push({ kind: isHeading(line) ? 'heading' : 'note', text: line.trim() });
  }
  return out;
}

/** Every tickable line in an item, flattened. */
export const itemsOf = (details) =>
  parseDetails(details).filter((b) => b.kind === 'list').flatMap((b) => b.items);

/**
 * The checklist sections for a tag, in the order they were authored.
 *
 * `sort_order` rather than priority: a checklist has a reading order
 * that has nothing to do with what the priority engine thinks is most
 * valuable. Walking a house top to bottom is not the same question as
 * what to spend money on first.
 */
export function checklistFor(items, tag) {
  return (items ?? [])
    .filter((i) => (i.tags ?? []).includes(tag) && i.status !== 'dropped')
    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100)
      || String(a.title).localeCompare(String(b.title)))
    .map((i) => ({
      id: i.id,
      title: i.title,
      summary: i.summary ?? '',
      blocks: parseDetails(i.details),
      count: itemsOf(i.details).length,
      tags: i.tags ?? [],
    }));
}

/** How many lines there are to tick, across the whole checklist. */
export const totalItems = (sections) =>
  (sections ?? []).reduce((n, s) => n + s.count, 0);

/**
 * The tier a section belongs to, from its `tier:` tag.
 *
 * Tiers are how a checklist says which lines stop a purchase and which
 * merely price it. A list that treats "the kitchen is tired" and "the
 * house cannot be mortgaged" as equals is a list nobody reads twice.
 */
export const tierOf = (section) =>
  ((section.tags ?? []).find((t) => t.startsWith('tier:')) ?? '').slice(5) || null;

export const TIER_LABEL = {
  financing: 'Stops the purchase',
  redflag: 'Walk away or renegotiate',
  scope: 'Changes the job size',
  measure: 'Closes an open assumption',
  agent: 'Ask out loud',
  offer: 'Before you offer',
};
