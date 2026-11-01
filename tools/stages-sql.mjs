#!/usr/bin/env node
// tools/stages-sql.mjs - print the statements that register a building's
// stages and the changes between them in Supabase.
//
// WHY. A work item has to point at the change it realises ("remove the
// kitchen | dining partition"), and that change has to carry the
// quantity behind it. Typed by hand, the quantity is a second opinion
// that drifts from the geometry; so every row here is MEASURED by
// stageDiff() from the stage files, exactly as building_changes'
// comment requires, and lands drafted.
//
//   node tools/stages-sql.mjs                  the building the site shows
//   node tools/stages-sql.mjs --building <id>
//
// Idempotent: stages upsert on (household_id, building_key, stage_key),
// changes on (stage_id, change_key). Written as insert ... on conflict,
// never a bare update. Nothing is deleted: a change a later geometry no
// longer produces stays, and is for a person to close.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stageDiff, roofArea } from '../assets/js/engine/building.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const ACTIVE = readFileSync(new URL('../assets/js/core/building-data.js', import.meta.url), 'utf8')
  .match(/const BUILDING = '([^']+)'/)[1];
const id = flag('building', ACTIVE);
const dir = join('data', 'buildings', id);
if (!existsSync(dir)) {
  console.error(`No such building: ${dir}`);
  process.exit(1);
}
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const index = read('index.json');
const stageOf = (sid) => read(`stages/${sid}.json`);

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : 'null');

/** The change rows one fork makes, each measured off the diff. */
export function changeRows(fromId, from, to) {
  const d = stageDiff(from, to);
  const src = `stageDiff(${fromId}, ${to.id}) on data/buildings/${id}/stages`;
  const rows = [];
  for (const line of [...new Set(d.wallsRemoved.map((w) => w.line))]) {
    const len = d.wallsRemoved.filter((w) => w.line === line)
      .reduce((s, w) => s + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), 0);
    rows.push({ key: `remove-${line}`, name: `Remove wall ${line}`, kind: 'structure', demolition: len, src });
  }
  if (d.newExternalWallPlanM > 0) {
    rows.push({ key: 'build-external', name: 'Build new external walls', kind: 'build',
      // Floor gained by taking a partition out is not area the new walls
      // add; only a real gain (a new storey or footprint) is recorded here.
      wall: d.newExternalWallPlanM, area: d.areaAddedM2 >= 1 ? d.areaAddedM2 : null,
      notes: `${n(d.newExternalWallFaceM2)} m2 of new external wall face.`, src });
  }
  for (const r of d.roofsAdded) {
    rows.push({ key: `roof-${r.id}`, name: `New roof ${r.id}`, kind: 'reroof', roof: roofArea(r), notes: r.note, src });
  }
  for (const r of d.roomsAdded) {
    rows.push({ key: `room-${r.id}`, name: `Create ${r.name}`, kind: 'fit_out', rooms: 1, src });
  }
  // A child stage inherits its parent's `was` markers; a room whose name
  // did not change in THIS fork was not converted by it.
  for (const r of d.roomsRenamed.filter((x) => x.from !== x.to)) {
    rows.push({ key: `convert-${r.from}-${r.to}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: `Convert ${r.from} to ${r.to}`, kind: 'convert', src });
  }
  if (d.openingsAdded.length) {
    rows.push({ key: 'openings', name: `New openings (${d.openingsAdded.length})`, kind: 'convert',
      notes: d.openingsAdded.map((o) => o.id).join(', '), src });
  }
  return rows;
}

const stageRows = index.stages.map((s) => `(${q(s.id)}, ${q(s.name)}, ${q(s.status)}, ${s.sequence}, ${q(s.summary)}, ${q(s.derivedFrom ?? null)})`);
const out = [];
out.push(`-- building_stages and building_changes for ${id}, from tools/stages-sql.mjs. Never edit by hand.
insert into public.building_stages (household_id, property_id, building_key, stage_key, name, status, sequence, summary, notes, confidence)
select p.household_id, p.id, ${q(id)}, v.k, v.name, v.status, v.seq, v.summary,
       'Geometry lives in the repository at data/buildings/${id}/stages/' || v.k || '.json. This row exists so the roadmap can point at the version; it carries no geometry of its own.',
       'drafted'
  from public.properties p,
       (values
${stageRows.join(',\n')}
       ) v(k, name, status, seq, summary, parent)
 where p.building_key = ${q(id)} and p.status <> 'archived'
on conflict (household_id, building_key, stage_key) do update
   set name = excluded.name, status = excluded.status, sequence = excluded.sequence,
       summary = excluded.summary, notes = excluded.notes;

-- Each fork points at the stage it was copied from.
insert into public.building_stages (household_id, property_id, building_key, stage_key, name, status, sequence, derived_from_id, confidence)
select c.household_id, c.property_id, c.building_key, c.stage_key, c.name, c.status, c.sequence, par.id, c.confidence
  from public.building_stages c
  join (values
${index.stages.filter((s) => s.derivedFrom).map((s) => `(${q(s.id)}, ${q(s.derivedFrom)})`).join(',\n')}
       ) v(k, parent) on v.k = c.stage_key
  join public.building_stages par on par.household_id = c.household_id
   and par.building_key = c.building_key and par.stage_key = v.parent
 where c.building_key = ${q(id)}
on conflict (household_id, building_key, stage_key) do update set derived_from_id = excluded.derived_from_id;`);

for (const s of index.stages) {
  if (!s.derivedFrom) continue;
  const rows = changeRows(s.derivedFrom, stageOf(s.derivedFrom), stageOf(s.id));
  if (!rows.length) continue;
  out.push(`
insert into public.building_changes (household_id, stage_id, change_key, name, kind, new_wall_m, demolition_m,
                                     area_added_m2, roof_area_m2, rooms_created, measured_from, notes, confidence)
select st.household_id, st.id, v.k, v.name, v.kind, v.wall, v.demo, v.area, v.roof, v.rooms, v.src, v.notes, 'drafted'
  from public.building_stages st,
       (values
${rows.map((r) => `(${q(r.key)}, ${q(r.name)}, ${q(r.kind)}, ${n(r.wall)}::numeric, ${n(r.demolition)}::numeric, ${n(r.area)}::numeric, ${n(r.roof)}::numeric, ${r.rooms ?? 'null'}::int, ${q(r.src)}, ${q(r.notes ?? null)})`).join(',\n')}
       ) v(k, name, kind, wall, demo, area, roof, rooms, src, notes)
 where st.building_key = ${q(id)} and st.stage_key = ${q(s.id)}
on conflict (stage_id, change_key) do update
   set name = excluded.name, kind = excluded.kind, new_wall_m = excluded.new_wall_m,
       demolition_m = excluded.demolition_m, area_added_m2 = excluded.area_added_m2,
       roof_area_m2 = excluded.roof_area_m2, rooms_created = excluded.rooms_created,
       measured_from = excluded.measured_from, notes = excluded.notes;`);
}
console.log(out.join('\n'));
