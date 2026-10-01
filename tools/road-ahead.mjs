// road-ahead.mjs - Road Ahead from the command line, for Claude Code.
//
//   node tools/road-ahead.mjs roads   [--scenario <key>]      every road's headline
//   node tools/road-ahead.mjs assess  <listing.json> [--scenario <key>]
//   node tools/road-ahead.mjs sweep   [--from 250000 --to 420000 --step 5000 --dep 0.05]
//   node tools/road-ahead.mjs agenda  [--road H1] [--listing <file>] [--top 8]
//                                     [--snapshot --household <uuid>]
//                                                              what to confirm first
//   node tools/road-ahead.mjs snapshot --household <uuid> --note "the owner's words"
//                                                              accept today's road results
//   node tools/road-ahead.mjs verify                           the checksum gate
//   node tools/road-ahead.mjs docs                             write docs/road-ahead/VARIABLES.md
//
// The inputs are the owner's and PRIVATE: the kit extract in
// data/road-ahead/ (gitignored), or with --extract <file> another file -
// most usefully `select road_ahead_inputs('<household>')` saved from the
// live database, so the engine runs on today's figures. Output goes to
// this terminal, except:
//   * `docs` writes the public variable reference (keys, units and
//     meanings, never a value);
//   * `agenda --snapshot` and `snapshot` write SQL to data/road-ahead/out/
//     (gitignored) for a session to run through the Supabase connector:
//     the sensitivity rows the sit-down agenda ranks, and accepted road
//     results the next change is measured against.
//
// A listing file for `assess` is JSON:
//   { "name": "...", "likely_buy": 0, "fin_lo": 0, "fin_hi": 0, "works": 0,
//     "mins": 0, "fee": 0, "pct": 0, "fits": [["H1", 2], ["H3", 3]] }
// works are DIY works before local help; fin_lo/fin_hi the finished-value range.
// It may carry the owner's judgement beside the maths:
//   "judgement": { "premium": 10000, "reason": "...", "kind": "emotional" }
//   (or "walk_away" instead of "premium"; kind emotional, personal,
//   strategic or information). The maths is shown unchanged beside it.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGISTRY, buildParams, assertRunnable, helpSettings, appraisalSettings, runRoad, headline, focusRoad,
  highestSustainableBid, appraise, provenance, trustLine, DEPENDS,
  sensitivity, rangesOf, calibrationAgenda, combinedAgenda, foreverBudget, walkAwayOf,
} from '../assets/js/engine/road-ahead/index.js';
import { valuesOf } from './road-ahead-lib.mjs';
import { sensitivitySql, runsSql } from './road-ahead-sql.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : dflt;
};
const sign = (n) => (n < 0 ? '-' : '');
const money = (n) => (n == null ? '-' : `${sign(n)}£${Math.abs(Math.round(n)).toLocaleString('en-GB')}`);
const k = (n) => (n == null ? '-' : `${sign(n)}£${Math.abs(Math.round(n / 1000))}k`);

function loadExtract() {
  const path = resolve(flag('extract') ?? join(ROOT, 'data', 'road-ahead', 'kit-extract.json'));
  if (!existsSync(path)) {
    console.error(`No private inputs at ${path}. Build them with: node tools/road-ahead-kit.mjs <kit zip>`);
    process.exit(1);
  }
  const X = JSON.parse(readFileSync(path, 'utf8'));
  const FORMATS = ['road-ahead-kit-extract/1', 'road-ahead-export/1', 'road-ahead-inputs/1'];
  if (!FORMATS.includes(X.format)) {
    console.error(`${path} is not Road Ahead inputs (format ${X.format}); expected one of ${FORMATS.join(', ')}`);
    process.exit(1);
  }
  return X;
}

function scenarioOf(X) {
  const key = flag('scenario', 'base');
  const s = X.scenarios[key];
  if (!s) {
    console.error(`No scenario "${key}". There are: ${Object.keys(X.scenarios).join(', ')}`);
    process.exit(1);
  }
  return [key, s];
}

const labelsOf = (X) => Object.fromEntries(Object.entries(X.variables)
  .map(([key, v]) => [key, { evidence: v.evidence, confidence: v.confidence ?? null }]));

const LIVE = new Set(['chase', 'viewing', 'legal', 'survey', 'bid', 'offer']);
/**
 * The listings still being pursued, with the inputs the assessor takes:
 * from road_ahead_inputs() as they stand, or from the kit's register,
 * where a listing being chased or offer-tested is the live one.
 */
function liveListings(X) {
  if (X.listings) return X.listings.filter((l) => LIVE.has(l.status) && l.inputs?.likely_buy != null);
  return X.register.filter((r) => /^(Chase|Offer test)/.test(r.status))
    .map((r) => ({ code: r.code, name: r.name, status: 'chase', inputs: r }));
}

const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
// The commit the numbers came from, marked when the engine has changed since.
const engineVersion = () => `road-ahead engine ${git(['rev-parse', '--short', 'HEAD']) || 'unknown'}`
  + `${git(['status', '--porcelain', 'assets/js/engine/road-ahead']) ? ' with uncommitted changes' : ''}`;
function writeOut(name, sql) {
  const dir = join(ROOT, 'data', 'road-ahead', 'out');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, `-- ${name}: written by tools/road-ahead.mjs. Private: run it through the Supabase connector.\n\n${sql}`);
  return path;
}

function roads() {
  const X = loadExtract();
  const [key, s] = scenarioOf(X);
  const P = assertRunnable(buildParams(valuesOf(X.variables), s.overrides), 'roads');
  const help = helpSettings(P);
  console.log(`Roads under "${s.name}" (${key}). A model on mostly estimated inputs, not a promise.\n`);
  for (const road of X.roads.active) {
    const h = headline(runRoad(road, road.near, P, { ...s, overrides: null }, help));
    console.log(`${road.code.padEnd(3)} ${road.name}`);
    console.log(`    forever home ${k(h.forever_today)} today (${k(h.forever_price)} then), ${h.forever_when ?? '-'}; `
      + `House 1 profit ${h.profits.map(k).join(', ') || '-'}; lowest cash ${k(h.min_cash)} in ${h.min_cash_when}`);
    for (const f of h.flags) console.log(`    FLAG ${f}`);
  }
  console.log(`\n${trustLine(provenance(DEPENDS.forever_budget, labelsOf(X)))}`);
}

function assess() {
  const X = loadExtract();
  const file = rest.find((a) => !a.startsWith('--') && a !== flag('scenario') && a !== flag('extract'));
  if (!file) { console.error('usage: node tools/road-ahead.mjs assess <listing.json>'); process.exit(2); }
  const L = JSON.parse(readFileSync(resolve(file), 'utf8'));
  const [, s] = scenarioOf(X);
  const P = assertRunnable(buildParams(valuesOf(X.variables), s.overrides), 'appraisal');
  const a = appraise(appraisalSettings(P, s), L);
  console.log(`${L.name ?? 'Listing'}: ${a.grade}; best road ${a.best_road}\n`);
  const rows = [
    ['Likely buy', money(L.likely_buy)], ['Finished value', `${money(L.fin_lo)} to ${money(L.fin_hi)}`],
    ['Works (help applied / optimistic)', `${money(a.works_base)} / ${money(a.works_opt)}`],
    ['Profit base / optimistic / optimistic at the top', `${money(a.profit_base)} / ${money(a.profit_opt)} / ${money(a.profit_opt_hi)}`],
    ['Walk-away (optimistic)', money(a.walk_away_opt)], ['Bid limit', money(a.bid_limit)], ['Cash left', money(a.cash_left)],
  ];
  for (const [label, v] of rows) console.log(`  ${label.padEnd(48)} ${v}`);
  // Focus road: the listing as House 1 on its best road, against the
  // road's own typical House 1, as the page's card shows it.
  const road = X.roads.active.find((r) => r.code === a.best_road && r.stages.some((st) => st.kind === 'buy'));
  if (road) {
    const help = helpSettings(P);
    const run = (r) => headline(runRoad(r, road.near, P, { ...s, overrides: null }, help));
    const own = run(road);
    const mine = run(focusRoad(road, { name: L.name, likely_buy: L.likely_buy, works: L.works, fin_lo: L.fin_lo,
      fin_hi: L.fin_hi, fee: L.fee ?? 0, pct: L.pct ?? 0 }));
    const diff = (mine.forever_today ?? 0) - (own.forever_today ?? 0);
    console.log(`\n  As House 1 on ${road.code}: the forever home is ${k(mine.forever_today)} in today's money`
      + `${mine.forever_when ? ` from ${mine.forever_when}` : ''}, ${k(Math.abs(diff))} ${diff >= 0 ? 'more' : 'less'} than`
      + ` the road's own House 1 gives; the cash is lowest at ${k(mine.min_cash)}${mine.min_cash_when ? ` in ${mine.min_cash_when}` : ''}.`);
    for (const f of mine.flags) console.log(`    FLAG ${f}`);
  }
  const j = a.judgement;
  if (j) {
    console.log(`\n  Your judgement (${j.kind}): walk away at ${money(j.walk_away)}, ${money(j.difference)} from the maths - "${j.reason}"`);
    console.log(`    it costs ${money(j.cost)} of profit (${money(j.profit_opt)} left at that price), and leaves ${money(j.cash_left)} in cash`);
    if (j.above_ceiling) console.log(`    it is above the cash ceiling; the bid stays at ${money(j.bid_limit)} unless the ceiling itself changes`);
  }
  console.log(`\n${trustLine(provenance(DEPENDS.verdict, labelsOf(X)))}`);
}

function agenda() {
  const X = loadExtract();
  const values = valuesOf(X.variables);
  const top = Number(flag('top', 8));
  const labels = labelsOf(X);
  const ranges = rangesOf(X.variables);
  const only = flag('road');
  const roads = X.roads.active.filter((r) => !only || r.code === only);
  if (!roads.length) { console.error(`No road ${only}.`); process.exit(1); }
  const outputs = [
    ...roads.map((road) => [`${road.code} forever budget`, foreverBudget(road, road.near)]),
    ...(only ? [] : liveListings(X).map((l) => [`${l.code} walk-away`, walkAwayOf(l.inputs)])),
  ];
  const file = flag('listing');
  if (file) {
    const L = JSON.parse(readFileSync(resolve(file), 'utf8'));
    outputs.push([`${L.name ?? 'Listing'} walk-away`, walkAwayOf(L)]);
  }
  const snapshots = outputs.map(([output, fn]) => ({ output, rows: sensitivity(fn, values, ranges) }));
  console.log(`What to confirm first. Each input is swung across its range (its own low and high, or 10% either side)`);
  console.log(`and ranked by the most it moves any of ${outputs.length} answers, estimates first. Swings are in pounds.\n`);
  for (const a of combinedAgenda(snapshots, labels, { top })) {
    const state = a.confidence === 'confirmed' || a.confidence === 'actual' ? 'confirmed' : (a.evidence ?? 'unlabelled').toLowerCase();
    console.log(`  ${a.key.padEnd(36)} up to ${Math.round(a.swing).toLocaleString('en-GB')} (${state}); moves ${a.moves.slice(0, 3).join(', ')}`
      + `${a.moves.length > 3 ? ` and ${a.moves.length - 3} more` : ''}`);
  }
  if (rest.includes('--snapshot')) {
    const { sql, rows, skipped } = sensitivitySql(flag('household'), snapshots, engineVersion());
    for (const x of skipped) console.log(`  note: ${x}`);
    const path = writeOut(`sensitivity-${new Date().toISOString().slice(0, 10)}.sql`, sql);
    console.log(`\nwrote ${rows} sensitivity rows to ${path}: run it through the connector; road_ahead_agenda() then ranks them`);
  }
}

function snapshot() {
  if (!flag('note')?.trim()) {
    console.error('An accepted run needs the owner\'s words: --note "..." (say what they accepted, and why).');
    process.exit(2);
  }
  const X = loadExtract();
  const values = valuesOf(X.variables);
  const help = helpSettings(buildParams(values));
  const version = engineVersion();
  const runs = [];
  for (const [key, s] of Object.entries(X.scenarios)) {
    if (s.status && s.status !== 'active') continue;
    const P = assertRunnable(buildParams(values, s.overrides), 'roads');
    for (const road of X.roads.active) {
      const h = headline(runRoad(road, road.near, P, { ...s, overrides: null }, help));
      runs.push({ road_code: road.code, scenario_key: key, summary: {
        forever_today: h.forever_today, forever_price: h.forever_price, forever_when: h.forever_when,
        min_cash: h.min_cash, min_cash_when: h.min_cash_when, fa_used: h.fa_used, works_done: h.works_done,
        works_left: h.works_left, profits: h.profits } });
    }
  }
  const path = writeOut(`runs-${new Date().toISOString().slice(0, 10)}.sql`, runsSql(flag('household'), runs, version, flag('note')));
  console.log(`wrote ${runs.length} accepted runs (${version}) to ${path}: run it through the connector;`);
  console.log('road_ahead_agenda() then reports every forever budget that moved by £1k or more against the last accepted run.');
}

function sweep() {
  const X = loadExtract();
  const P = buildParams(valuesOf(X.variables));
  const ge = X.roads.active.find((r) => r.code === 'GE');
  const grid = {
    from: Number(flag('from', 250000)), to: Number(flag('to', 420000)),
    step: Number(flag('step', 5000)), dep: Number(flag('dep', 0.05)),
  };
  const pays = ['base', 'promotion', 'job_change'].filter((key) => X.scenarios[key])
    .map((key) => [key, X.scenarios[key].overrides]);
  const out = highestSustainableBid(ge, helpSettings(P), P, grid, pays);
  console.log(`Golden Egg: the dearest price at which the cash never goes below zero (${k(grid.from)} to ${k(grid.to)}, step ${k(grid.step)}, deposit ${grid.dep * 100}%)\n`);
  for (const [key, r] of Object.entries(out)) {
    console.log(`  ${key.padEnd(12)} ${r.bid == null ? 'none on this grid' : `${k(r.bid)} (lowest cash ${k(r.min_cash)}, works done ${k(r.works_done)})`}`);
  }
}

function docs() {
  const out = join(ROOT, 'docs', 'road-ahead', 'VARIABLES.md');
  const lines = [
    '# Road Ahead variables',
    '',
    'Generated by `node tools/road-ahead.mjs docs` from',
    '`assets/js/engine/road-ahead/registry.js`. Edit the registry, not this file.',
    '',
    'Every figure the Road Ahead engine reads. **The values are private.**',
    'They are the owner\'s pay, savings, borrowing and plans, and they live',
    'in `ra_variables` in Supabase, behind row-level security, each with its',
    'evidence label (STATED, VERIFIED, ESTIMATE, CHECK), its confidence and',
    'its source. None of them is in this repository, and the secrets gate',
    'checks that none arrives.',
    '',
    'The engine has no defaults: a missing key is refused by name. Two',
    'values are derived rather than stored, so one fact has one home: the',
    'last month of the family stay (from `timeline.bridge_from`) and the',
    'lender\'s income multiple (from the mortgage in principle and the',
    'salary it was based on, unless a scenario sets it outright).',
    '',
    '| Key | Kind | Unit | Read by | Meaning |',
    '|---|---|---|---|---|',
    ...REGISTRY.map((r) => `| \`${r.key}\` | ${r.kind} | ${r.unit || '-'} | ${r.used} | ${r.meaning} |`),
    '',
    'Read by: `roads` is the monthly road simulator, `route` the older route',
    'model, `appraisal` the listing assessor, `lender` the pay and borrowing',
    'rules both simulators share.',
    '',
  ];
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join('\n'));
  console.log(`wrote ${out} (${REGISTRY.length} variables, no values)`);
}

const COMMANDS = {
  roads, assess, sweep, agenda, snapshot, docs,
  verify: () => process.exit(spawnSync('node', [join(ROOT, 'tools', 'road-ahead-checksums.mjs'), ...rest], { stdio: 'inherit' }).status ?? 1),
};
if (!COMMANDS[cmd]) {
  console.error('usage: node tools/road-ahead.mjs <roads|assess|sweep|agenda|snapshot|verify|docs> [options]');
  process.exit(2);
}
COMMANDS[cmd]();
