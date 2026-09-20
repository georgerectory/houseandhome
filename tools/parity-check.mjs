// parity-check.mjs - prove the JS engines and the SQL ones agree.
//
// Two implementations of one rule is a liability unless something
// mechanically forbids them drifting. This is that something: it drives
// the SQL through psql and the JS through the module, on the same
// inputs, and fails on any difference at all.
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { allocate } from '../assets/js/engine/allocate.js';
import { shoppingList } from '../assets/js/engine/demand.js';
import { rank } from '../assets/js/engine/priority.js';

const PGBIN = process.env.PGBIN || '/usr/lib/postgresql/16/bin';
const DB = process.env.PARITY_DB || 'househome_parity';
const SOCK = process.env.PGSOCK || '/var/tmp';
const PORT = process.env.PGPORT || '5433';

const asRoot = process.getuid && process.getuid() === 0;

// Provision the parity database from the schema rather than assuming one
// is already there. A gate that depends on a hand-made database passes on
// one machine and fails on the next, which is worse than not having it.
function sh(cmd) {
  const c = asRoot ? ['su', ['postgres', '-c', cmd]] : ['bash', ['-c', cmd]];
  return execFileSync(c[0], c[1], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function provision() {
  const stage = join(tmpdir(), `parity-schema-${randomUUID()}`);
  execFileSync('mkdir', ['-p', stage]);
  execFileSync('bash', ['-c',
    `cp ${new URL('../supabase/schema', import.meta.url).pathname}/*.sql ${stage}/ && chmod -R a+rX ${stage}`]);
  writeFileSync(join(stage, '00_shim.sql'), `
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create or replace function auth.uid() returns uuid
  language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
do $blk$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $blk$;
create table if not exists auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  raw_app_meta_data jsonb, raw_user_meta_data jsonb);
`, { mode: 0o644 });

  sh(`${PGBIN}/psql -h ${SOCK} -p ${PORT} -U postgres -q -c "drop database if exists ${DB}" -c "create database ${DB}"`);
  sh(`${PGBIN}/psql -h ${SOCK} -p ${PORT} -U postgres -d ${DB} -q -v ON_ERROR_STOP=1 -f ${stage}/00_shim.sql`);
  // Read the directory rather than list the files. A hard-coded list is a
  // second home for "which schema files exist", and the day somebody adds
  // one and forgets this line, the parity gate applies a schema the SQL
  // gate does not - which is exactly the drift both gates are for.
  const files = readdirSync(stage)
    .filter((f) => f.endsWith('.sql') && f !== '00_shim.sql')
    .sort();
  for (const f of files) {
    sh(`${PGBIN}/psql -h ${SOCK} -p ${PORT} -U postgres -d ${DB} -q -v ON_ERROR_STOP=1 -f ${stage}/${f}`);
  }
  sh(`${PGBIN}/psql -h ${SOCK} -p ${PORT} -U postgres -d ${DB} -q -c "insert into households (id,name) values ('11111111-1111-1111-1111-111111111111','Parity') on conflict do nothing"`);
  execFileSync('rm', ['-rf', stage]);
}

provision();
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

// ---------------------------------------------------------------
// DEMAND PARITY. engine/demand.js mirrors the shopping_list view, and
// it exists for the same reason allocate.js does: the fixture
// generator has to produce view-shaped rows so the front-end gate can
// run offline. Same liability, same remedy.
//
// The case is built to exercise every branch at once: a live job, a
// parked job, a purchase nothing requires, one already owned, one
// hired, and one closed.
// ---------------------------------------------------------------
const HH = '11111111-1111-1111-1111-111111111111';
psql(`begin;
      set local house.allow_work_item_delete = 'on';
      delete from knowledge_links where household_id='${HH}';
      delete from allocations; delete from deposits;
      delete from work_items where household_id='${HH}';
      commit;`);

psql(`insert into work_items (id, household_id, title, kind, status, horizon, phase,
        acquisition, cost_expected, cost_confidence) values
  ('aaaa0000-0000-0000-0000-000000000001','${HH}','Live job','renovation','planned','next','strip_out','new',null,'drafted'),
  ('aaaa0000-0000-0000-0000-000000000002','${HH}','Parked job','renovation','idea','someday','extension','new',null,'drafted'),
  ('bbbb0000-0000-0000-0000-000000000001','${HH}','Needed now','purchase','planned','next','strip_out','new',380,'drafted'),
  ('bbbb0000-0000-0000-0000-000000000002','${HH}','Digger hire','purchase','idea','someday','extension','hire',750,'drafted'),
  ('bbbb0000-0000-0000-0000-000000000003','${HH}','Bedding','purchase','planned','now','move_in','new',100,'confirmed'),
  ('bbbb0000-0000-0000-0000-000000000004','${HH}','Already owned','purchase','planned','now','move_in','owned',60,'drafted'),
  ('bbbb0000-0000-0000-0000-000000000005','${HH}','Bought already','purchase','done','now','move_in','new',40,'actual');
insert into knowledge_links (household_id, from_type, from_id, to_type, to_id, kind) values
  ('${HH}','work_item','aaaa0000-0000-0000-0000-000000000001','work_item','bbbb0000-0000-0000-0000-000000000001','requires_material'),
  ('${HH}','work_item','aaaa0000-0000-0000-0000-000000000002','work_item','bbbb0000-0000-0000-0000-000000000002','requires_material');`);

const sqlDemand = psql(`select id, demand_state, cost_in_scope, is_hire
  from shopping_list where household_id='${HH}' order by id;`)
  .split('\n').filter(Boolean).map((l) => {
    const [id, state, cost, hire] = l.split('|');
    return { id, state, cost: Number(cost), hire: hire === 't' };
  });

const rowsRaw = psql(`select id, kind, status, horizon, acquisition, coalesce(cost_expected::text,'')
  from work_items where household_id='${HH}' order by id;`);
const linksRaw = psql(`select from_id, to_id from knowledge_links
  where household_id='${HH}' and kind='requires_material' and valid_to is null;`);

const jsItems = rowsRaw.split('\n').filter(Boolean).map((l) => {
  const [id, kind, status, horizon, acquisition, cost] = l.split('|');
  return { id, kind, status, horizon, acquisition, cost_expected: cost === '' ? null : Number(cost) };
});
const jsLinks = linksRaw.split('\n').filter(Boolean).map((l) => {
  const [from_id, to_id] = l.split('|');
  return { from_id, to_id, from_type: 'work_item', to_type: 'work_item',
    kind: 'requires_material', valid_to: null };
});
const jsDemand = shoppingList(jsItems, jsLinks)
  .map((r) => ({ id: r.id, state: r.demand_state, cost: r.cost_in_scope, hire: r.is_hire }))
  .sort((a, b) => a.id.localeCompare(b.id));

let demandDiffs = 0;
if (sqlDemand.length !== jsDemand.length) {
  demandDiffs++;
  console.log(`  row count differs: sql=${sqlDemand.length} js=${jsDemand.length}`);
} else {
  for (let i = 0; i < sqlDemand.length; i++) {
    const a = sqlDemand[i], b = jsDemand[i];
    if (a.id !== b.id || a.state !== b.state
      || Math.round(a.cost * 100) !== Math.round(b.cost * 100) || a.hire !== b.hire) {
      console.log(`  ${a.id}: sql=${a.state}/${a.cost}/${a.hire} js=${b.state}/${b.cost}/${b.hire}`);
      demandDiffs++;
    }
  }
}
// Every branch must actually have been exercised, or the case proves
// only that two implementations agree about nothing happening.
const seen = new Set(sqlDemand.map((r) => r.state));
const allBranches = ['live', 'dormant', 'standalone', 'closed'].every((x) => seen.has(x));

if (demandDiffs === 0 && allBranches) {
  console.log(`PASS parity: demand states (${sqlDemand.length} rows) - identical across live, dormant, standalone and closed`);
} else {
  failures++;
  console.log(`FAIL parity: demand - diffs=${demandDiffs} allBranches=${allBranches} saw=${[...seen].join(',')}`);
}

// ---------------------------------------------------------------
// PRIORITY PARITY. engine/priority.js mirrors recompute_priorities()
// and, unlike allocate.js, had no gate - so it had already drifted: it
// wrote `idx + 1` and ignored priority_override entirely, meaning any
// item pinned by hand ranked one way in the database and another in
// the front end. The case includes an override for that reason.
// ---------------------------------------------------------------
psql(`begin;
      set local house.allow_work_item_delete = 'on';
      delete from knowledge_links where household_id='${HH}';
      delete from allocations; delete from deposits;
      delete from work_items where household_id='${HH}';
      commit;`);

psql(`delete from rooms where household_id='${HH}' and key='parity-room';
insert into rooms (id, household_id, key, name, room_weight) values
  ('cccc0000-0000-0000-0000-000000000001','${HH}','parity-room','Parity room', 4);
insert into work_items (household_id, room_id, title, kind, theme, benefit_type,
                        status, horizon, priority_override) values
  ('${HH}','cccc0000-0000-0000-0000-000000000001','High','renovation','make_safe','safety','planned','now',null),
  ('${HH}','cccc0000-0000-0000-0000-000000000001','Middle','renovation','make_dry','habitability','planned','now',null),
  ('${HH}','cccc0000-0000-0000-0000-000000000001','Low','decoration','cosmetic','enjoyment','planned','now',null),
  ('${HH}','cccc0000-0000-0000-0000-000000000001','Pinned','decoration','cosmetic','enjoyment','planned','now',1);
select public.recompute_priorities('${HH}');`);

const sqlRank = psql(`select w.title, w.priority_score, w.priority
  from work_items w where w.household_id='${HH}' order by w.title;`)
  .split('\n').filter(Boolean).map((l) => {
    const [title, score, priority] = l.split('|');
    return { title, score: Number(score), priority: Number(priority) };
  });

// The REAL ids, because the tie-break is `order by score desc, id` on
// both sides and feeding JS anything else compares a different
// sequence. The two orderings agree across the uuid charset, which is
// agreement by accident unless the test actually uses uuids.
const wRaw = psql(`select w.id, w.title, r.room_weight, t.theme_weight, b.benefit_weight,
    coalesce(w.priority_override::text,'')
  from work_items w
  left join rooms r on r.id = w.room_id
  left join themes t on t.key = w.theme
  left join benefit_types b on b.key = w.benefit_type
  where w.household_id='${HH}' order by w.title;`);
const jsIn = wRaw.split('\n').filter(Boolean).map((l) => {
  const [id, title, rw, tw, bw, ov] = l.split('|');
  return {
    id, title,
    roomWeight: Number(rw), themeWeight: Number(tw), benefitWeight: Number(bw),
    priority_override: ov === '' ? null : Number(ov),
  };
});
const jsRank = rank(jsIn)
  .map((r) => ({ title: r.title, score: r.score, priority: r.priority }))
  .sort((a, b) => a.title.localeCompare(b.title));

// An empty comparison passes vacuously - the same failure mode that
// made three RLS tests meaningless earlier in this session. Prove the
// rows exist before proving they agree.
let prioDiffs = 0;
if (sqlRank.length !== 4) {
  console.log(`  expected 4 rows, got ${sqlRank.length} - the fixture did not insert`);
  prioDiffs++;
}
if (sqlRank.length !== jsRank.length) {
  console.log(`  row count differs: sql=${sqlRank.length} js=${jsRank.length}`);
  prioDiffs++;
}
for (let i = 0; i < sqlRank.length; i++) {
  const a = sqlRank[i], b = jsRank[i];
  if (!b || a.title !== b.title || a.score !== b.score || a.priority !== b.priority) {
    console.log(`  ${a.title}: sql=score ${a.score}/priority ${a.priority} js=score ${b?.score}/priority ${b?.priority}`);
    prioDiffs++;
  }
}
const sawOverride = sqlRank.some((r) => r.title === 'Pinned' && r.priority === 1);
if (prioDiffs === 0 && sawOverride) {
  console.log(`PASS parity: priority (${sqlRank.length} rows) - identical, and priority_override wins in both`);
} else {
  failures++;
  console.log(`FAIL parity: priority - diffs=${prioDiffs} overrideHonoured=${sawOverride}`);
}

console.log('');
console.log(failures === 0 ? `Parity: all ${CASES.length + 2} cases identical` : `Parity: ${failures} case(s) failed`);
process.exit(failures === 0 ? 0 : 1);
