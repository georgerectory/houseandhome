// model.js - what the Road Ahead page shows, computed from a resolved
// context (resolve.js). Pure: no DOM.
//
//   runAll       every road, run, with its headline
//   compare      the same roads under the other headline scenarios
//   registerRows every listing: its inputs, the numbers now, what has
//                moved since it was appraised, its fit and its rule checks
//
// A listing's inputs are assembled here exactly as ra_listing_inputs()
// assembles them in SQL (89_road_ahead_logic.sql), so the page and
// ra_assess() agree; the parity gate holds the two equal.

import { runRoad, headline } from '../roads.js';
import { appraise } from '../appraise.js';
import { fitCheck } from '../fit.js';
import { resolve } from './resolve.js';

/** Every road under the context, with its headline. */
export function runAll(ctx) {
  return ctx.roads.map((road) => {
    const result = runRoad(road, road.near, ctx.P, ctx.scenario, ctx.help);
    return { road, result, head: headline(result) };
  });
}

/** The scenarios the compare markers are drawn from, when they exist. */
export const COMPARE = Object.freeze(['base', 'optimistic', 'promotion', 'job_change']);

/**
 * Each road's headline under each compare scenario, with the page's
 * what-ifs applied to every one of them, so a marker shows what that
 * scenario changes about the question being asked.
 */
export function compare(data, values, keys = COMPARE) {
  return keys.filter((k) => data.scenarios.some((s) => s.key === k)).map((k) => {
    const ctx = resolve(data, k, values);
    return { key: k, name: ctx.row.name, heads: new Map(runAll(ctx).map((x) => [x.road.code, x.head])) };
  });
}

const stripNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

/**
 * The owner's current walk-away judgement on a listing, as ra_listing_inputs
 * picks it: a walk-away or a premium, the newest by the day it was said.
 * (SQL breaks a same-day tie by when the row was written, which the
 * register does not carry; here an explicit walk-away wins the tie.)
 */
export function currentJudgement(judgements) {
  const js = (judgements ?? []).filter((j) => j.field === 'walk_away' || j.field === 'premium');
  if (!js.length) return null;
  js.sort((a, b) => String(b.said_on).localeCompare(String(a.said_on)) || (a.field === 'walk_away' ? -1 : 1));
  const j = js[0];
  return stripNulls({ [j.field]: j.value, reason: j.reason, kind: j.kind });
}

/**
 * What the assessor takes for a register row: the listing's own minutes
 * and fee, overlaid by its latest appraisal's inputs, then its fits, any
 * override and the current judgement, with nulls dropped. Null when the
 * listing has no appraisal with figures.
 */
export function listingInputs(row) {
  if (!row.inputs || row.inputs.likely_buy == null) return null;
  return stripNulls({
    ...stripNulls({ mins: row.minutes_from_home, fee: row.fee, pct: row.fee_pct }),
    ...row.inputs,
    fits: row.fits,
    override_grade: row.override_grade,
    judgement: currentJudgement(row.judgements),
  });
}

// The rules a listing's own facts can be checked against, by the
// variable each rule names. A rule in words alone ("no leasehold") is
// shown, never guessed at.
const CHECKS = {
  'rules.house1_min_beds': (row, v) => (row.beds == null ? null : row.beds >= v),
  'rules.house1_max_minutes': (row, v) => (row.minutes_from_home == null ? null : row.minutes_from_home <= v),
};

/** The House 1 rules this listing's facts can be checked against, and the answers. */
export function ruleChecks(row, P, rules) {
  return rules
    .filter((r) => (r.scope === 'all' || r.scope === 'house1') && (r.params ?? []).some((p) => CHECKS[p]))
    .map((r) => {
      const key = r.params.find((p) => CHECKS[p]);
      return { code: r.code, rule: r.rule, key, value: P[key], pass: CHECKS[key](row, P[key]),
        severity: r.severity, kind: r.kind };
    });
}

/** The figures that have moved since the stored appraisal: £1k or more, or a new verdict. */
export function movedSince(now, stored) {
  if (!now || !stored) return [];
  const out = [];
  for (const k of ['profit_base', 'profit_opt', 'walk_away_opt', 'cash_left']) {
    if (stored[k] != null && now[k] != null && Math.abs(now[k] - stored[k]) >= 1000) out.push({ field: k, was: stored[k], now: now[k] });
  }
  if (stored.grade != null && now.grade !== stored.grade) out.push({ field: 'grade', was: stored.grade, now: now.grade });
  return out;
}

/**
 * Every register row with its numbers under the context.
 *
 * Two comparisons with the stored appraisal, for two questions. `moved`
 * is what the scenario in view and its what-ifs change: the card sets it
 * beside the appraisal's own figures. `drift` is the same listing under
 * the default scenario with no what-ifs: when that differs, the model
 * itself has changed since the appraisal (a variable was confirmed or
 * corrected), and the listing is due a fresh look whatever is in view.
 * @param {object[]} register ra_register rows
 * @param {object} ctx from resolve()
 * @param {object[]} rules ra_rules rows
 * @param {object} [base] resolve() under the default scenario, no what-ifs; ctx when that is what is in view
 */
export function registerRows(register, ctx, rules, base = ctx) {
  return register.map((row) => {
    const L = listingInputs(row);
    const now = L ? appraise(ctx.V, L) : null;
    const moved = movedSince(now, row.outputs);
    const facts = { beds: row.beds, detached: row.detached, sale_method: row.sale_method, plot_acres: row.plot_acres };
    return {
      row, L, now, moved,
      drift: base === ctx ? moved : movedSince(L ? appraise(base.V, L) : null, row.outputs),
      fit: L ? fitCheck({ ...facts, ...L }, ctx.roads, row.fits ?? []) : null,
      rules: row.purpose === 'benchmark' ? [] : ruleChecks(row, ctx.P, rules),
    };
  });
}

// Better verdicts first; a stretch after its plain form.
const VERDICTS = ['Strong', 'Worth pursuing', 'Marginal', 'Walk away', 'Over budget'];
export function verdictRank(grade) {
  if (!grade) return 99;
  const i = VERDICTS.findIndex((v) => grade.startsWith(v));
  return (i < 0 ? 50 : i * 2) + (/stretch/.test(grade) ? 1 : 0);
}

const STATUS_ORDER = ['offer', 'bid', 'survey', 'legal', 'viewing', 'chase', 'watch', 'unreviewed', 'won', 'lost', 'dropped', 'closed'];
const auctionTime = (x) => (x.row.auction_on ? Date.parse(x.row.auction_on) : null);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// A missing value sorts last whichever way the column runs.
const cmpLast = (a, b, sign) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : sign * cmp(a, b));

const SORT_KEYS = {
  code: (x) => x.row.code,
  name: (x) => x.row.name,
  auction: auctionTime,
  buy: (x) => x.L?.likely_buy ?? null,
  profit: (x) => x.now?.profit_base ?? null,
  profit_opt: (x) => x.now?.profit_opt ?? null,
  bid: (x) => x.now?.bid_limit ?? null,
  verdict: (x) => (x.now ? verdictRank(x.now.grade) : null),
  status: (x) => { const i = STATUS_ORDER.indexOf(x.row.status); return i < 0 ? null : i; },
};

/** The register in the order asked for; by auction date, then verdict, by default. */
export function sortRows(rows, sort, dir = 'asc') {
  const out = [...rows];
  const key = SORT_KEYS[sort];
  if (!key) {
    return out.sort((a, b) => cmpLast(auctionTime(a), auctionTime(b), 1)
      || cmp(verdictRank(a.now?.grade), verdictRank(b.now?.grade)) || cmp(a.row.code, b.row.code));
  }
  const sign = dir === 'desc' ? -1 : 1;
  return out.sort((a, b) => cmpLast(key(a), key(b), sign) || cmp(a.row.code, b.row.code));
}
