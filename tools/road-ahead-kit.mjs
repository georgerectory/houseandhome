// road-ahead-kit.mjs - the Rectory kit zip in, Road Ahead's private
// extract out.
//
//   node tools/road-ahead-kit.mjs <kit zip> [out]
//
// The zip is read in place and never changed. Its Python is run on a
// temporary copy (tools/road-ahead-kit.py) so the kit's constants come
// from the objects the kit itself ran on; its published results are read
// straight from the zip, untouched. As a bonus the temporary copy
// re-runs the register and the optimistic roads, so the extract records
// whether the kit's published results still follow from its own code.
//
// The output (default data/road-ahead/kit-extract.json) is PRIVATE and
// gitignored. This prints counts only - never a figure.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORMAT, toVariables, toScenarios, toRoads, toRegister, validateExtract,
} from './road-ahead-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [zip, outArg] = process.argv.slice(2);
if (!zip) {
  console.error('usage: node tools/road-ahead-kit.mjs <kit zip> [out]');
  process.exit(2);
}
const out = resolve(outArg ?? join(ROOT, 'data', 'road-ahead', 'kit-extract.json'));

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const unzipBuf = (entry) => execFileSync('unzip', ['-p', zip, entry], { maxBuffer: 64 * 1024 * 1024 });
const unzipJson = (entry) => JSON.parse(unzipBuf(entry).toString('utf8'));

const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
const kitRoot = 'rectory/';
if (!entries.some((e) => e.startsWith(`${kitRoot}model/engine.py`))) {
  console.error(`${zip} does not look like the Rectory kit (no ${kitRoot}model/engine.py)`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'road-ahead-kit-'));
try {
  execFileSync('unzip', ['-q', zip, `${kitRoot}model/*`, `${kitRoot}data/*`, `${kitRoot}results/*`,
    `${kitRoot}docs/road_ahead/*`, '-d', tmp]);
  const dumpPath = join(tmp, 'dump.json');
  execFileSync('python3', [join(ROOT, 'tools', 'road-ahead-kit.py'), join(tmp, 'rectory'), dumpPath], { stdio: 'inherit' });
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));

  const published = {
    roads_v4: unzipJson(`${kitRoot}results/roads_v4.json`),
    optimistic_v5: unzipJson(`${kitRoot}results/optimistic_v5.json`),
    register_v5: unzipJson(`${kitRoot}results/register_v5.json`),
  };
  const routeResults = unzipJson(`${kitRoot}results/results.json`);
  published.route = {
    version: routeResults.version, generated: routeResults.generated,
    scenarios: routeResults.scenarios, sell_year_sweep: routeResults.sell_year_sweep,
  };
  // Does the kit's code, re-run on its own data, still give what it published?
  const rerun = (name) => JSON.parse(readFileSync(join(tmp, 'rectory', 'results', `${name}.json`), 'utf8'));
  const selfCheck = {
    register_v5: JSON.stringify(rerun('register_v5')) === JSON.stringify(published.register_v5),
    optimistic_v5: JSON.stringify(rerun('optimistic_v5')) === JSON.stringify(published.optimistic_v5),
  };

  const { variables, superseded } = toVariables(dump);
  const extract = {
    format: FORMAT,
    extracted_at: new Date().toISOString(),
    kit: {
      sha256: sha256(readFileSync(zip)),
      entries: entries.filter((e) => e.startsWith(kitRoot) && !e.endsWith('/')).length,
      assumptions_as_of: String(dump.assumptions.meta?.as_of ?? ''),
      pdf_sha256: sha256(unzipBuf(`${kitRoot}Road_to_the_Rectory_MASTER_v5.0.pdf`)),
      archive_pdf_sha256: sha256(unzipBuf(`${kitRoot}ARCHIVE_v4.0.pdf`)),
      self_check: selfCheck,
    },
    variables,
    superseded,
    scenarios: toScenarios(dump),
    roads: toRoads(dump),
    register: toRegister(dump),
    sweep_points: dump.inline.sweep,
    ge_later: { at: dump.inline.ge_later_at, family: dump.inline.scenarios.ge_later_family },
    kit_tests: dump.kit_tests,
    routes: dump.data.routes.routes,
    results: published,
    data: dump.data,
    assumptions: dump.assumptions,
  };

  const bad = validateExtract(extract);
  if (bad.length) {
    console.error(`The extract is incomplete:\n  ${bad.join('\n  ')}`);
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(extract));
  const d = extract.data;
  console.log(`Kit extract written (private, gitignored): ${out}`);
  console.log(`  ${Object.keys(variables).length} variables, ${Object.keys(extract.scenarios).length} scenarios, `
    + `${extract.roads.active.length} active and ${extract.roads.retired.length} retired roads, `
    + `${extract.register.length} register rows`);
  console.log(`  ${d.decisions.decisions.length} decisions, ${d.decisions.checkpoints.length} checkpoints, `
    + `${d.preferences.signals?.length ?? 0} signals, ${d.appraisals.appraisals.length} appraisals, `
    + `${d.evidence.length - 1} evidence rows, ${d.listings.length - 1} older listings`);
  console.log(`  kit self-check: register ${selfCheck.register_v5 ? 'reproduces' : 'DIFFERS'}, `
    + `optimistic roads ${selfCheck.optimistic_v5 ? 'reproduce' : 'DIFFER'}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
