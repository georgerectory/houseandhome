// road-ahead.mjs - Road Ahead from the command line, for Claude Code.
//
//   node tools/road-ahead.mjs roads   [--scenario <key>]      every road's headline
//   node tools/road-ahead.mjs assess  <listing.json> [--scenario <key>]
//   node tools/road-ahead.mjs sweep   [--from 250000 --to 420000 --step 5000 --dep 0.05]
//   node tools/road-ahead.mjs agenda  [--road H1] [--listing <file>] [--top 10]
//                                                              what to confirm first
//   node tools/road-ahead.mjs verify                           the checksum gate
//   node tools/road-ahead.mjs docs                             write docs/road-ahead/VARIABLES.md
//
// The inputs are the owner's and PRIVATE: they come from the kit extract
// in data/road-ahead/ (gitignored), or with --extract <file> from
// another. Output goes to this terminal only. `docs` is the exception:
// it writes the public variable reference, which lists keys, units and
// meanings and never a value.
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
  REGISTRY, buildParams, assertRunnable, helpSettings, appraisalSettings, runRoad, headline,
  highestSustainableBid, appraise, provenance, trustLine, DEPENDS,
  sensitivity, rangesOf, calibrationAgenda, foreverBudget, walkAwayOf,
} from '../assets/js/engine/road-ahead/index.js';
import { valuesOf } from './road-ahead-lib.mjs';

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
  return JSON.parse(readFileSync(path, 'utf8'));
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
  const a = appraise(appraisalSettings(P), L);
  console.log(`${L.name ?? 'Listing'}: ${a.grade}; best road ${a.best_road}\n`);
  const rows = [
    ['Likely buy', money(L.likely_buy)], ['Finished value', `${money(L.fin_lo)} to ${money(L.fin_hi)}`],
    ['Works (help applied / optimistic)', `${money(a.works_base)} / ${money(a.works_opt)}`],
    ['Profit base / optimistic / optimistic at the top', `${money(a.profit_base)} / ${money(a.profit_opt)} / ${money(a.profit_opt_hi)}`],
    ['Walk-away (optimistic)', money(a.walk_away_opt)], ['Bid limit', money(a.bid_limit)], ['Cash left', money(a.cash_left)],
  ];
  for (const [label, v] of rows) console.log(`  ${label.padEnd(48)} ${v}`);
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
  const top = Number(flag('top', 10));
  const labels = labelsOf(X);
  const ranges = rangesOf(X.variables);
  const code = flag('road', 'H1');
  const road = X.roads.active.find((r) => r.code === code);
  if (!road) { console.error(`No road ${code}.`); process.exit(1); }
  console.log(`What to confirm first. Each input is swung across its range (its own low and high, or 10% either side);`);
  console.log(`estimates that move the answer most come first. Swings are in pounds.\n`);
  console.log(`${road.code} ${road.name}: the forever budget in today's money`);
  for (const a of calibrationAgenda(sensitivity(foreverBudget(road, road.near), values, ranges), labels, { top })) {
    console.log(`  ${a.key.padEnd(36)} ${a.why}`);
  }
  const file = flag('listing');
  if (file) {
    const L = JSON.parse(readFileSync(resolve(file), 'utf8'));
    console.log(`\n${L.name ?? 'Listing'}: the walk-away price`);
    for (const a of calibrationAgenda(sensitivity(walkAwayOf(L), values, ranges), labels, { top })) {
      console.log(`  ${a.key.padEnd(36)} ${a.why}`);
    }
  }
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
  roads, assess, sweep, agenda, docs,
  verify: () => process.exit(spawnSync('node', [join(ROOT, 'tools', 'road-ahead-checksums.mjs'), ...rest], { stdio: 'inherit' }).status ?? 1),
};
if (!COMMANDS[cmd]) {
  console.error('usage: node tools/road-ahead.mjs <roads|assess|sweep|agenda|verify|docs> [options]');
  process.exit(2);
}
COMMANDS[cmd]();
