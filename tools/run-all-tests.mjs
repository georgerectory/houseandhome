// run-all-tests.mjs - one command, every gate.
//
//   lint      the rules a browser cannot see
//   secrets   nothing private is tracked by a public repository
//   unit      the pure engines, tested as stated
//   geometry  every stage of every building is a building, and agrees
//             with the drawings it was measured from
//   sql       the schema, guards and policies, on a real Postgres
//   frontend  the actual pages, in a real browser, at six viewports
//             in both themes
//
// The SQL and parity gates need a local Postgres. Where there is none
// they SKIP loudly rather than passing quietly: a gate that reports
// success when it did not run is worse than no gate.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const run = (label, cmd, args, { optional = false } = {}) => {
  process.stdout.write(`\n=== ${label}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', encoding: 'utf8' });
  if (r.status === 0) return { label, ok: true };
  if (optional) return { label, ok: true, skipped: true };
  return { label, ok: false };
};

const hasPg = existsSync('/usr/lib/postgresql') || process.env.PGBIN;

const results = [
  run('Lint', 'node', ['tools/lint-frontend.mjs']),
  // Runs early and cheaply: if a private extract is staged, that is the
  // one failure worth seeing before anything else scrolls past.
  run('Secrets', 'node', ['tools/check-secrets.mjs']),
  run('Unit', 'node', ['--test', 'tests/unit/*.test.mjs']),
  run('Geometry', 'node', ['tools/check-geometry.mjs']),
];

if (hasPg) {
  results.push(run('SQL', 'bash', ['tools/run-sql-tests.sh']));
  results.push(run('Parity (JS engine vs SQL engine)', 'node', ['tools/parity-check.mjs']));
} else {
  console.log('\n=== SQL\nSKIPPED: no local Postgres found. The schema and RLS gates did NOT run.');
  results.push({ label: 'SQL', ok: true, skipped: true });
}

results.push(run('Front end (real browser)', 'node', ['tools/check-frontend.mjs']));

console.log('\n=====================================');
for (const r of results) {
  console.log(`${r.ok ? (r.skipped ? 'SKIP' : 'PASS') : 'FAIL'}  ${r.label}`);
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} gate(s) failed` : '\nAll gates green');
process.exit(failed.length ? 1 : 0);
