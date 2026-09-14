// roadmap-export.js - the board as a file.
//
// Export what is on SCREEN, not the whole table: an export that ignores
// the current filters is a different document to the one the person is
// looking at, and the difference is invisible once it has left the
// system.
//
// One column list feeds both formats, so CSV and JSON can never drift
// into describing different things.

const COLUMNS = [
  ['priority', 'Priority'], ['title', 'Title'], ['kind', 'Kind'],
  ['room_name', 'Room'], ['trade', 'Trade'], ['theme', 'Intent'],
  ['benefit_type', 'Benefit'], ['horizon', 'When'], ['status', 'Status'],
  ['cost_best', 'Cost low'], ['cost_expected', 'Cost expected'],
  ['cost_worst', 'Cost high'], ['cost_confidence', 'Cost confidence'],
  ['allocated_balance', 'Saved so far'],
  ['duration_min_minutes', 'Minutes low'], ['duration_max_minutes', 'Minutes high'],
  ['physical_demand', 'Physical demand'], ['setting', 'Setting'],
];

export const EXPORT_COLUMNS = COLUMNS;

/** A cell is quoted only when it has to be, so the file stays readable
 *  by eye as well as by a spreadsheet. */
const csvCell = (v) => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(items) {
  const head = COLUMNS.map(([, label]) => csvCell(label)).join(',');
  const rows = items.map((i) => COLUMNS.map(([f]) => csvCell(i[f])).join(','));
  return [head, ...rows].join('\n');
}

export function toJSON(items) {
  return JSON.stringify(
    items.map((i) => Object.fromEntries(COLUMNS.map(([f]) => [f, i[f] ?? null]))),
    null, 2);
}
