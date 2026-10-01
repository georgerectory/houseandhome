// record.js - Road Ahead's record arranged for the page: the decisions in
// force by topic and the ones they replaced, the owner's words and
// whether the model has taken each in, every logged change in words,
// the model's figures beside the owner's own records, and today's
// figures against each road's last accepted run. The rows come from the
// views in 89_road_ahead_record.sql, which road_ahead_agenda() reads too,
// so nothing here decides what is due: it only arranges. Pure: no DOM.

import { money, provenance } from '../../../core/format.js';
import { showFigure, unitOf, EVIDENCE_WORDS } from './figures.js';
import { dayName } from './state.js';
import { londonToday } from './auctions.js';

const byCode = (a, b) => String(a.code ?? '').localeCompare(String(b.code ?? ''), 'en', { numeric: true });

/** Firmness, most in need of an answer first. */
export const FIRMNESS = Object.freeze([['open', 'Open'], ['lean', 'Leaning'], ['locked', 'Locked']]);

/**
 * The road's decisions for the page: those still open, every decision in
 * force by topic, and the replaced, each naming what replaced it. Only
 * ra_decision_history's is_current says which are in force, so a
 * replaced decision can never be shown as current.
 * @param {object[]} decisions ra_decision_history rows
 */
export function decisionGroups(decisions) {
  const current = decisions.filter((d) => d.is_current).sort(byCode);
  const topics = new Map();
  for (const d of current) {
    const t = d.topic || 'Other';
    if (!topics.has(t)) topics.set(t, []);
    topics.get(t).push(d);
  }
  const count = (rows, f) => rows.filter((d) => d.firmness === f).length;
  return {
    total: current.length,
    counts: Object.fromEntries(FIRMNESS.map(([f]) => [f, count(current, f)])),
    open: current.filter((d) => d.firmness === 'open'),
    topics: [...topics].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([topic, rows]) => ({ topic, rows, open: count(rows, 'open'), lean: count(rows, 'lean') })),
    replaced: decisions.filter((d) => !d.is_current).sort(byCode),
  };
}

/** The kinds of the owner's words, as the page groups them. */
export const SIGNAL_KINDS = Object.freeze([['signal', 'Signals'], ['pattern', 'Patterns'], ['reaction', 'Reactions to listings']]);

/** The owner's words in their kinds, each kind with how many the model has not yet taken in. */
export const signalGroups = (signals) => SIGNAL_KINDS.map(([kind, label]) => {
  const rows = signals.filter((s) => s.kind === kind).sort(byCode);
  return { kind, label, rows, waiting: rows.filter((s) => !s.is_reflected).length };
}).filter((g) => g.rows.length);

/** Signals the model has not yet taken in, newest first: the agenda's own order. */
export const unreflected = (signals) => signals.filter((s) => s.kind === 'signal' && !s.is_reflected)
  .sort((a, b) => String(b.said_on ?? '').localeCompare(String(a.said_on ?? '')) || byCode(a, b));

/** What each logged field is called on the page. */
const FIELD_WORDS = {
  value: 'Value', low: 'Low end', high: 'High end', confidence: 'Trust', evidence: 'Label', status: 'Status',
  guide_price: 'Guide', asking_price: 'Asking price', auction_on: 'Auction day', property_id: 'Promoted',
  overrides: 'Figures it changes', works_factor: 'Works factor', help: 'Help with the works',
};
const MONEY_FIELDS = new Set(['guide_price', 'asking_price']);
const parse = (raw) => {
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
};

/** One logged value in words. */
function readValue(c, raw, unit) {
  const v = parse(raw);
  if (v == null) return '—';
  if (c.entity_type === 'ra_variables' && ['value', 'low', 'high'].includes(c.field)) return showFigure(v, unit);
  if (MONEY_FIELDS.has(c.field)) return money(v);
  if (c.field === 'auction_on') return dayName(String(v));
  if (c.field === 'property_id') return 'a project';
  if (c.field === 'help') return v === true || v === 'true' ? 'Yes' : 'No';
  if (c.field === 'works_factor') return `×${v}`;
  if (c.field === 'confidence') return provenance(v).label;
  if (c.field === 'evidence') return EVIDENCE_WORDS[v] ?? String(v);
  if (c.field === 'overrides' && typeof v === 'object') {
    const keys = Object.keys(v);
    return keys.length ? keys.map((k) => `${k} ${showFigure(v[k], unitOf(k))}`).join('; ') : 'none';
  }
  return String(v);
}

/**
 * Every logged change in words, newest first: what changed, from what to
 * what, why, on whose word, and the London day it happened.
 * @param {object[]} changes ra_changes rows
 * @param {object[]} variables ra_variables rows, for each figure's unit
 */
export function changeRows(changes, variables) {
  const unit = new Map(variables.map((v) => [v.key, unitOf(v.key, v.unit)]));
  return [...changes].sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at))).map((c) => {
    const u = c.entity_type === 'ra_variables' ? unit.get(c.code) ?? unitOf(c.code) : '';
    return {
      ...c, what: FIELD_WORDS[c.field] ?? c.field,
      was: readValue(c, c.old_value, u), now: readValue(c, c.new_value, u),
      on: londonToday(new Date(c.changed_at)),
    };
  });
}

/** Which variable each of the model's figures beside the ledger is. */
export const LEDGER_MEASURES = Object.freeze({
  cash: { label: 'Cash', key: 'cash.start_cash' },
  'net pay per month': { label: 'Take-home pay a month', key: 'income.net_pay_now' },
});

/**
 * The model's figures beside the owner's own trusted records, with the
 * gap, and whether it is past the drift rule's £1k.
 * @param {object[]} ledger ra_model_vs_ledger rows
 */
export const ledgerRows = (ledger) => ledger.map((l) => {
  const model = Number(l.model_value);
  const own = l.ledger_value == null ? null : Number(l.ledger_value);
  return { ...l, ...(LEDGER_MEASURES[l.measure] ?? { label: l.measure, key: null }),
    gap: own == null ? null : model - own, differs: own != null && Math.abs(model - own) >= 1000 };
});

/** The figures a road is held to between accepted runs. */
const HELD = Object.freeze([['forever_today', 'Forever budget, today\'s money'], ['min_cash', 'Lowest cash']]);

/**
 * Today's figures against each road's last accepted run under a
 * scenario: what moved by the drift rule's £1k, and from what.
 * @param {object[]} runs ra_accepted_runs rows
 * @param {Array<{road:object, head:object}>} live runAll() under that scenario, no what-ifs
 * @param {string} scenarioKey
 */
export function sinceAccepted(runs, live, scenarioKey) {
  return live.map(({ road, head }) => {
    const run = runs.find((r) => r.road_code === road.code && r.scenario_key === scenarioKey && r.run_name === 'main');
    const fields = HELD.map(([field, label]) => {
      const was = run?.summary?.[field] ?? null;
      const now = head[field] ?? null;
      return { field, label, was, now, moved: was != null && now != null && Math.abs(now - was) >= 1000 };
    });
    return { code: road.code, name: road.name, run: run ?? null, fields, moved: fields.some((f) => f.moved) };
  });
}

/** A list as a sentence says it: 'A, B and C'. */
export const andList = (items) => (items.length < 2 ? items.join('')
  : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * The answers an input moves, in words, ready to stand before 'by up to
 * £Xk': 'the forever budget of GE and H1', or with several kinds of
 * answer 'the forever budget of GE and H1, and the walk-away of L03,'.
 * @param {string[]} moves outputs as the sensitivity snapshot names them, 'H1 forever budget'
 */
export function movesText(moves) {
  const by = new Map();
  for (const m of moves ?? []) {
    const [who, ...rest] = String(m).split(' ');
    const what = rest.join(' ') || who;
    if (!by.has(what)) by.set(what, []);
    by.get(what).push(who);
  }
  const phrases = [...by].map(([what, who]) =>
    `the ${what} of ${andList(who.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })))}`);
  return phrases.length > 1 ? `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]},` : phrases.join('');
}

/** A judgement's figure in words. */
export function judgementText(j) {
  const n = Number(j.value);
  if (j.field === 'premium' && Number.isFinite(n)) return `${money(n)} above the maths`;
  if (j.field === 'walk_away' && Number.isFinite(n)) return `walk away at ${money(n)}`;
  return j.value == null ? j.field : `${j.field}: ${j.value}`;
}
