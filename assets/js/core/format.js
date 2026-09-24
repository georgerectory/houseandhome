// format.js - every number the user sees passes through here.
// Pure: no DOM, no fetch. One home for money, duration and provenance
// formatting, so a figure never renders two different ways on two pages.

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const GBP2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(v, { pence = false } = {}) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return pence ? GBP2.format(Number(v)) : GBP.format(Number(v));
}

/** Sub-penny allocations are real and must not render as "£0.00". */
export function preciseMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '£0.00';
  if (n < 0.01) return `${(n * 100).toFixed(2)}p`;
  return GBP2.format(n);
}

export function duration(min, max) {
  if (min == null && max == null) return '—';
  const fmt = (m) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);
  if (min != null && max != null && min !== max) return `${fmt(min)}–${fmt(max)}`;
  return fmt(min ?? max);
}

export function range(lo, hi) {
  if (lo == null && hi == null) return '—';
  if (lo != null && hi != null && lo !== hi) return `${money(lo)}–${money(hi)}`;
  return money(lo ?? hi);
}

export function pct(part, whole) {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, (Number(part) / Number(whole)) * 100));
}

/**
 * The two confidence states that may drive a total, a projection or an
 * allocation of real money. Everything else is a guess wearing a
 * decimal point.
 *
 * EXPORTED because it had four copies - here, in engine/shopping.js,
 * and twice inline in core/store.js - and four copies of the rule that
 * decides which money counts is three too many. One home.
 */
export const TRUSTED = new Set(['confirmed', 'actual']);
export const isTrusted = (c) => TRUSTED.has(c);

const PROV_LABEL = {
  carried_over: 'Carried over, unverified',
  drafted: 'Drafted, not yet confirmed',
  researched: 'Researched, not confirmed',
  quoted: 'Quoted in writing',
  confirmed: 'Confirmed',
  actual: 'Actual',
};

/** The visible half of the rule the database enforces: an unconfirmed
 *  figure must never read like a checked one. */
export function provenance(confidence) {
  const trusted = isTrusted(confidence);
  return {
    trusted,
    label: PROV_LABEL[confidence] ?? confidence ?? 'Unknown',
    cls: trusted ? 'prov prov--confirmed' : 'prov prov--unconfirmed',
    valueCls: trusted ? '' : 'value--provisional',
  };
}

export function titleCase(s) {
  return String(s ?? '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
