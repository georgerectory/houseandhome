// parity-check.mjs - prove the JS allocation engine and the SQL one
// agree to the micro-pound.
//
// Two implementations of one rule is a liability unless something
// mechanically forbids them drifting. This is that something: it drives
// the SQL through psql and the JS through the module, on the same
// inputs, and fails on any difference at all.
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { allocate } from '../assets/js/engine/allocate.js';

const PGBIN = process.env.PGBIN || '/usr/lib/postgresql/16/bin';
const DB = process.env.PARITY_DB || 'househome_parity';
const SOCK = process.env.PGSOCK || '/var/tmp';
const PORT = process.env.PGPORT || '5433';

const asRoot = process.getuid && process.getuid() === 0;
// SQL goes through a file rather than -c: multi-line statements do not
// survive shell quoting intact, and a silently mangled query would make
// this check pass for the wrong reason.
function psql(sql) {
  const f = join(tmpdir(), `parity-${randomUUID()}.sql`);
  writeFileSync(f, sql, { mode: 0o644 });
  try {
    const inner = `${PGBIN}/psql -h ${SOCK} -p ${PORT} -U postgres -d ${DB} -qAt -F '|' -f ${f}`;
    const cmd = asRoot ? ['su', ['postgres', '-c', inner]] : ['bash', ['-c', inner]];
    return execFileSync(cmd[0], cmd[1], { encoding: 'utf8' }).trim();
  } finally {
    unlinkSync(f);
  }
}

const CASES = [
  { name: 'even split, small list', n: 5, amount: 100 },
  { name: 'typical backlog', n: 20, amount: 500 },
  { name: 'long tail - the floor share must hold', n: 120, amount: 250 },
  { name: 'awkward amount', n: 17, amount: 333.33 },
  { name: 'single item takes everything', n: 1, amount: 75 },
  { name: 'tiny deposit across many items', n: 60, amount: 5 },
];

let failures = 0;

for (const c of CASES) {
  // The delete guard is doing its job here, so the fixture reset has to
  // opt in explicitly - exactly as a deliberate cleanup would. Without
  // this the rows accumulate and each case silently runs a longer list
  // than it claims.
  psql(`begin;
        set local house.allow_work_item_delete = 'on';
        delete from allocations;
        delete from deposits;
        delete from work_items where household_id='11111111-1111-1111-1111-111111111111';
        commit;`);
  psql(`insert into work_items (household_id, title, kind, cost_expected, cost_confidence, priority)
        select '11111111-1111-1111-1111-111111111111', 'P'||g, 'renovation', 1000, 'confirmed', g
          from generate_series(1,${c.n}) g;`);

  const raw = psql(`select work_item_id, rank, amount from allocation_preview('11111111-1111-1111-1111-111111111111', ${c.amount}) order by rank;`);
  const sqlRows = raw ? raw.split('\n').map((l) => {
    const [id, rank, amount] = l.split('|');
    return { id, rank: Number(rank), amount: Number(amount) };
  }) : [];

  const order = psql(`select id from work_items where household_id='11111111-1111-1111-1111-111111111111' and is_fundable and status not in ('done','dropped') order by priority, id;`);
  const ids = order ? order.split('\n') : [];
  const jsRows = allocate(ids.map((id) => ({ id, targetCost: 1000, allocatedBalance: 0 })), c.amount);

  const sqlTotal = sqlRows.reduce((s, r) => s + r.amount, 0);
  const jsTotal = jsRows.reduce((s, r) => s + r.amount, 0);

  let diffs = 0;
  if (sqlRows.length !== jsRows.length) {
    diffs++;
    console.log(`  row count differs: sql=${sqlRows.length} js=${jsRows.length}`);
  } else {
    for (let i = 0; i < sqlRows.length; i++) {
      const a = sqlRows[i], b = jsRows[i];
      if (a.id !== b.id || Math.round(a.amount * 1e6) !== Math.round(b.amount * 1e6)) {
        if (diffs < 3) console.log(`  rank ${a.rank}: sql=${a.amount} js=${b.amount}`);
        diffs++;
      }
    }
  }

  const exact = Math.abs(sqlTotal - c.amount) < 1e-9 && Math.abs(jsTotal - c.amount) < 1e-9;
  const noZero = sqlRows.every((r) => r.amount > 0) && jsRows.every((r) => r.amount > 0);

  if (diffs === 0 && exact && noZero) {
    console.log(`PASS parity: ${c.name} (n=${c.n}, £${c.amount}) - identical, sums exactly, no zero shares`);
  } else {
    failures++;
    console.log(`FAIL parity: ${c.name} - diffs=${diffs} exactSum=${exact} noZeroShares=${noZero}`);
  }
}

console.log('');
console.log(failures === 0 ? `Parity: all ${CASES.length} cases identical` : `Parity: ${failures} case(s) failed`);
process.exit(failures === 0 ? 0 : 1);
