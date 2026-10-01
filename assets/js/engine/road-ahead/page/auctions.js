// auctions.js - the auctions arranged for the page: everything dated from
// today, a month as weeks, each sale's tracked lots with the step each is
// on, and what lots went for against their guides. A step reported done
// is gone from all of it; done steps live on in the listing's card.
// Pure: no DOM, no fetch.

/** Today in London, 'YYYY-MM-DD': the day every countdown counts from, wherever the reader is. */
export const londonToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);

const MS_DAY = 86400000;
const toDay = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso, n) => new Date(toDay(iso) + n * MS_DAY).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((toDay(to) - toDay(from)) / MS_DAY);

const KIND_WORDS = { auction: 'Auction', catalogue: 'Catalogue out', bidding_opens: 'Bidding opens', step: 'Lot step' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-21' as '21 Oct', how a sale is named. */
export const dayMonth = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const KIND_ORDER = ['auction', 'bidding_opens', 'catalogue', 'step'];
const lotWords = (lots) => lots.map((l) => (l.lot ? `lot ${l.lot}` : l.code)).join(', ');

/**
 * Everything dated from today to the horizon: the houses' own dates and
 * every tracked lot's open steps, the lots on one step folded into one line.
 * @param {{houses:object[], calendar:object[], pipeline:object[]}} data
 * @param {string} today 'YYYY-MM-DD'
 * @param {number} [horizon] days ahead
 * @returns {Array<{on:string, kind:string, what:string, short:string, checked:string|null, status:string,
 *   notes:string|null, lots:object[]}>} short is the few words a day of the month grid has room for
 */
export function agenda(data, today, horizon = 120) {
  const until = addDays(today, horizon);
  const house = new Map(data.houses.map((h) => [h.code, h.name]));
  const dates = data.calendar.filter((c) => c.on_date >= today && c.on_date <= until).map((c) => ({
    on: c.on_date, kind: c.kind, what: `${house.get(c.house_code) ?? c.house_code}: ${c.title ?? KIND_WORDS[c.kind] ?? c.kind}`,
    short: `${c.house_code} ${(KIND_WORDS[c.kind] ?? c.kind).toLowerCase()}`,
    checked: c.checked_on, status: c.status, notes: c.notes, lots: [],
  }));
  const steps = new Map();
  for (const p of data.pipeline) {
    if (p.is_done || p.due_on < today || p.due_on > until) continue;
    const key = `${p.due_on}|${p.house_code}|${p.auction_on}|${p.step_key}`;
    if (!steps.has(key)) {
      steps.set(key, { on: p.due_on, kind: 'step', label: p.label, settles: p.settles,
        sale: `${p.house_name ?? house.get(p.house_code) ?? p.house_code} ${dayMonth(p.auction_on)}`, lots: [] });
    }
    steps.get(key).lots.push({ code: p.code, name: p.name, lot: p.lot });
  }
  const stepRows = [...steps.values()].map((s) => {
    s.lots.sort((a, b) => String(a.lot ?? a.code).localeCompare(String(b.lot ?? b.code), 'en', { numeric: true }));
    return { on: s.on, kind: 'step', what: `${s.sale}: ${s.label} (${lotWords(s.lots)})`,
      short: `${s.label.split(':')[0]}: ${s.lots.map((l) => l.code).join(', ')}`, checked: null, status: 'open',
      notes: s.settles, lots: s.lots };
  });
  return [...dates, ...stepRows].sort((a, b) => a.on.localeCompare(b.on)
    || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.what.localeCompare(b.what));
}

/**
 * A month as weeks, Monday first, each day with what falls on it.
 * @param {number} year
 * @param {number} month 1 to 12
 * @param {Array<{on:string}>} items from agenda()
 * @returns {Array<Array<{date:string|null, items:object[]}>>}
 */
export function monthGrid(year, month, items) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (new Date(toDay(first)).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: lead }, () => ({ date: null, items: [] }));
  for (let d = 1; d <= days; d += 1) {
    const date = addDays(first, d - 1);
    cells.push({ date, items: items.filter((i) => i.on === date) });
  }
  while (cells.length % 7) cells.push({ date: null, items: [] });
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/**
 * Each sale still to come with its tracked lots and the step each is on:
 * the first step not done, and how many earlier ones are overdue.
 * @param {object[]} pipeline ra_pipeline rows
 * @param {string} today
 */
export function sales(pipeline, today) {
  const bySale = new Map();
  for (const p of pipeline) {
    if (p.auction_on < today) continue;
    const key = `${p.auction_on}|${p.house_code}`;
    if (!bySale.has(key)) bySale.set(key, { on: p.auction_on, house: p.house_name ?? p.house_code, lots: new Map() });
    const lots = bySale.get(key).lots;
    if (!lots.has(p.code)) lots.set(p.code, { code: p.code, name: p.name, lot: p.lot, status: p.listing_status, steps: [] });
    lots.get(p.code).steps.push(p);
  }
  return [...bySale.values()].sort((a, b) => a.on.localeCompare(b.on)).map((s) => ({
    on: s.on, house: s.house, days: daysBetween(today, s.on),
    lots: [...s.lots.values()].map((l) => {
      const open = l.steps.filter((x) => !x.is_done).sort((a, b) => a.sort_order - b.sort_order);
      const next = open[0] ?? null;
      return { code: l.code, name: l.name, lot: l.lot, status: l.status, next,
        overdue: open.filter((x) => x.due_on < today).length, done: l.steps.length - open.length };
    }).sort((a, b) => String(a.lot ?? a.code).localeCompare(String(b.lot ?? b.code), 'en', { numeric: true })),
  }));
}

/** What lots went for against their guides, newest first, the ratio worked out. */
export const resultRows = (results) => [...results].sort((a, b) => b.sold_on.localeCompare(a.sold_on)).map((r) => ({
  ...r, ratio: r.guide > 0 && r.sold > 0 ? r.sold / r.guide : null,
}));

/** The playbook in its kinds, in their order. */
export const PLAYBOOK_KINDS = Object.freeze([
  ['setup', 'Set up once'], ['daily', 'Every day'], ['weekly', 'Every week'], ['rule', 'Rules'], ['did_not_work', 'What did not work'],
]);
export const playbookByKind = (lines) => PLAYBOOK_KINDS.map(([kind, label]) => ({
  kind, label, lines: lines.filter((l) => l.kind === kind).sort((a, b) => a.sort_order - b.sort_order),
})).filter((g) => g.lines.length);
