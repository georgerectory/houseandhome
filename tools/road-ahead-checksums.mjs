// road-ahead-checksums.mjs - the eighth gate: does the ported engine
// reproduce, exactly, everything the Rectory kit published?
//
// Runs the JavaScript engine on the kit's own inputs and compares every
// field of every published result: the roads under every variant
// (monthly cash traces included), the Golden Egg extras and its
// sustainability table, the optimistic roads, all 25 register rows, the
// route model's 28 scenarios and its sell-year sweep. Exact, after the
// kit's own rounding - the brief's £1k is the outer tolerance and is not
// needed.
//
// The inputs are PRIVATE, so this reads data/road-ahead/kit-extract.json
// (gitignored) and SKIPS LOUDLY without it, as the SQL gate does without
// Postgres. CI never has it; a session that does proves the port.
// Mismatches name the field; values are printed only with --show, so a
// log never carries a figure by accident.
//
//   node tools/road-ahead-checksums.mjs [extract] [--show]

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildParams, helpSettings, appraisalSettings, simulate, runRoute, withHelp, withWorksFactor,
  withStageAt, applyOverrides, saleProfits, sustainability, appraise,
} from '../assets/js/engine/road-ahead/index.js';
import { valuesOf, validateExtract } from './road-ahead-lib.mjs';
import { kitTests } from './road-ahead-kit-tests.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SHOW = args.includes('--show');
const path = resolve(args.find((a) => !a.startsWith('--')) ?? join(ROOT, 'data', 'road-ahead', 'kit-extract.json'));

if (!existsSync(path)) {
  console.log('SKIP  Road Ahead checksums: no private kit extract here.');
  console.log(`      Expected ${path}.`);
  console.log('      Build it with: node tools/road-ahead-kit.mjs <kit zip>. CI never has it; that is by design.');
  process.exit(0);
}

const X = JSON.parse(readFileSync(path, 'utf8'));
const invalid = validateExtract(X);
if (invalid.length) {
  console.log(`FAIL  the extract is not valid:\n  ${invalid.join('\n  ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------
// Comparison: every leaf, exact. -0 and 0 are the same number here,
// as they are to Python's ==.
// ---------------------------------------------------------------
let compared = 0;
const misses = [];
function same(got, want, at) {
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) {
      misses.push({ at, got: Array.isArray(got) ? `${got.length} items` : got, want: `${want.length} items` });
      return;
    }
    want.forEach((w, i) => same(got[i], w, `${at}[${i}]`));
    return;
  }
  if (want !== null && typeof want === 'object') {
    if (got === null || typeof got !== 'object') { misses.push({ at, got, want: 'an object' }); return; }
    const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
    for (const k of keys) {
      if (!(k in want)) misses.push({ at: `${at}.${k}`, got: got[k], want: '(absent)' });
      else if (!(k in got)) misses.push({ at: `${at}.${k}`, got: '(absent)', want: want[k] });
      else same(got[k], want[k], `${at}.${k}`);
    }
    return;
  }
  compared += 1;
  if (got !== want) misses.push({ at, got, want });
}

const values = valuesOf(X.variables);
const S = X.scenarios;
const P = (...ov) => buildParams(values, ...ov);
const help = helpSettings(P());
const R = X.results;
const sections = [];
const section = (name, fn) => {
  const before = { compared, misses: misses.length };
  fn();
  sections.push({ name, compared: compared - before.compared, misses: misses.length - before.misses });
};

// ---------------------------------------------------------------
// Roads under every variant (roads_v4.all_results).
// ---------------------------------------------------------------
section('roads: five roads x seven variants, traces included', () => {
  for (const road of X.roads.active) {
    const want = R.roads_v4[road.code];
    const r = withHelp(road, road.near, help);
    const noHelp = simulate(road, P());
    same({ forever_today: noHelp.forever_today, ledger: noHelp.ledger, min_cash: noHelp.min_cash },
      want.no_help, `${road.code}.no_help`);
    same(simulate(r, P()), want.base, `${road.code}.base`);
    same(simulate(r, P(S.promotion.overrides)), want.promotion, `${road.code}.promotion`);
    same(simulate(r, P(S.job_change.overrides)), want.job_change, `${road.code}.job_change`);
    same(simulate(r, P(S.family_longer.overrides)), want.family_longer, `${road.code}.family_longer`);
    same(simulate(r, P(S.bad_luck.overrides)), want.stress, `${road.code}.stress`);
    same(simulate(r, P(S.no_child.overrides)), want.nochild, `${road.code}.nochild`);
  }
});

section('Golden Egg found later, and its sustainability table', () => {
  const ge = X.roads.active.find((r) => r.code === 'GE');
  const idx = ge.stages.findIndex((s) => s.kind === 'forever');
  const later = withStageAt(withHelp(ge, true, help), idx, X.ge_later.at);
  same(simulate(later, P()), R.roads_v4.GE.if_found_jan_2028, 'GE.if_found_later');
  same(simulate(later, P(X.ge_later.family)), R.roads_v4.GE.if_found_jan_2028_family, 'GE.if_found_later_family');
  const pays = [['base', P()], ['promotion', P(S.promotion.overrides)]];
  same(sustainability(ge, help, X.sweep_points, pays), R.roads_v4.GE.sustainability, 'GE.sustainability');
});

section('optimistic roads (works x0.8, child costs from the scenario)', () => {
  for (const road of X.roads.active) {
    const r = withHelp(road, road.near, help);
    const ro = withWorksFactor(r, S.optimistic.works_factor);
    const b = simulate(r, P());
    const o = simulate(ro, P(S.optimistic.overrides));
    const op = simulate(ro, P(S.optimistic_promotion.overrides));
    same({
      base: b.forever_today ?? null, base_profit: saleProfits(b), opt: o.forever_today ?? null, opt_profit: saleProfits(o),
      opt_promo: op.forever_today ?? null, opt_min: o.min_cash, base_min: b.min_cash,
      opt_works_done: o.works_done ?? null, when: b.forever_when ?? null,
    }, R.optimistic_v5[road.code], `optimistic.${road.code}`);
  }
});

section('register: 25 listings, every computed field', () => {
  const V = appraisalSettings(P());
  const FIELDS = ['near', 'works_base', 'works_opt', 'best_road', 'profit_base', 'profit_opt', 'profit_opt_hi',
    'walk_away_opt', 'cash_left', 'over_ceiling', 'grade'];
  for (const row of X.register) {
    const want = R.register_v5.find((w) => w.id === row.kit_ref);
    const got = appraise(V, row);
    for (const f of FIELDS) same(got[f], want[f], `register.${row.kit_ref}.${f}`);
  }
});

section('route model: 7 routes x 4 markets, and the sell-year sweep', () => {
  const Pr = P(S.route_kit.overrides);
  for (const [key, want] of Object.entries(R.route.scenarios)) {
    const [name, scen] = key.split('|');
    const route = X.routes[name];
    const [got] = runRoute(Pr, { ...route, sell: route.sell ?? null }, scen);
    same(got, want, `route.${key}`);
  }
  for (const [key, want] of Object.entries(R.route.sell_year_sweep)) {
    const [yr, scen] = key.split('|');
    const [got] = runRoute(Pr, { sell: [Number(yr), 9] }, scen);
    same(got.endgame_today, want, `sweep.${key}`);
  }
});

// The kit's 43 tests: as the kit's own Python ran them on its own data
// (two of them check the owner's figures, not the engine), and again
// here in JavaScript for every one that is about the engine or the data.
const tests = kitTests(X, P);
section(`the kit's own tests: ${X.kit_tests.length} in its Python, ${tests.length} again in JavaScript`, () => {
  X.kit_tests.forEach(([, ok], i) => same(ok, true, `kit test ${i + 1} (Python)`));
  for (const t of tests) same(t.ok, true, `kit test: ${t.name}`);
});

// ---------------------------------------------------------------
for (const s of sections) {
  console.log(`${s.misses ? 'FAIL' : 'PASS'}  ${s.name} - ${s.compared} values${s.misses ? `, ${s.misses} differ` : ', all identical'}`);
}
if (misses.length) {
  console.log('');
  for (const m of misses.slice(0, 25)) {
    console.log(`  ${m.at}${SHOW ? `: got ${JSON.stringify(m.got)}, published ${JSON.stringify(m.want)}` : ' differs'}`);
  }
  if (misses.length > 25) console.log(`  ... and ${misses.length - 25} more`);
  if (!SHOW) console.log('  (run with --show to print the values; they are private)');
  console.log(`\nRoad Ahead checksums: ${misses.length} of ${compared} values differ from the kit`);
  process.exit(1);
}
console.log(`\nRoad Ahead checksums: all ${compared} published values reproduced exactly`);
