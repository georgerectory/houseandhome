#!/usr/bin/env node
// tools/rooms-sql.mjs - print the statements that write a building's
// levels and rooms into Supabase, from the geometry.
//
// WHY. Work items, notes and equipment point at a ROOM, and a room row
// typed by hand is a second description of the building that drifts
// from the first. So the rows come from the base stage's geometry, the
// same way quantities come from takeoff: the drawing is the authority,
// the table is a copy keyed to it.
//
//   node tools/rooms-sql.mjs                     the building the site shows
//   node tools/rooms-sql.mjs --building <id>
//   node tools/rooms-sql.mjs --stage <id>        default: the base stage
//
// Idempotent: levels upsert on (property_id, key) and rooms on
// (household_id, property_id, key), the key being the stage's room id.
// Written as insert ... on conflict do update, never as a bare update,
// because the connector holds bare updates. Every row lands DRAFTED.
// Nothing is deleted: a room a later stage removes stays, because the
// as-bought house still has it.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
const stageId = flag('stage', (index.stages.find((s) => !s.derivedFrom) ?? index.stages[0]).id);
const stage = read(`stages/${stageId}.json`);

// The geometry's room types against the database's check constraint.
// Anything the database does not know becomes 'other' rather than
// failing the whole load.
const DB_TYPES = new Set(['hallway', 'living', 'kitchen', 'dining', 'office', 'bedroom', 'bathroom',
  'wc', 'utility', 'pantry', 'boot_room', 'landing', 'stairs', 'loft', 'cellar', 'garage', 'shed',
  'greenhouse', 'outbuilding', 'garden', 'yard', 'driveway', 'gym', 'store', 'other']);
const ALIAS = { storage: 'store', ensuite: 'bathroom', 'en-suite': 'bathroom', boot: 'boot_room' };
export const dbType = (t) => {
  const v = ALIAS[t] ?? t;
  return DB_TYPES.has(v) ? v : 'other';
};

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : 'null');

const levels = stage.levels.map((l, i) =>
  `(${q(l.id)}, ${q(l.name)}, ${n(l.elevation)}, ${n(l.ceilingHeight)}, ${i})`);
const rooms = stage.rooms.map((r) => {
  const [x1, y1, x2, y2] = r.rect ?? [];
  const note = `From data/buildings/${id}/stages/${stageId}.json (room ${r.id}`
    + `${r.roomKey ? `, roomKey ${r.roomKey}` : ''}). Geometry is the authority; this row is a copy.`;
  return `(${q(r.id)}, ${q(r.name)}, ${q(dbType(r.roomType))}, ${q(r.level)}, `
    + `${n(x1)}, ${n(y1)}, ${n(x2 - x1)}, ${n(y2 - y1)}, ${n(r.areaM2)}, ${q(note)})`;
});

console.log(`-- levels and rooms for ${id} (stage ${stageId}), from tools/rooms-sql.mjs. Never edit by hand.
insert into public.levels (property_id, key, name, elevation_m, ceiling_height_m, sort_order)
select p.id, v.key, v.name, v.elev, v.ceil, v.sort
  from public.properties p,
       (values
${levels.join(',\n')}
       ) v(key, name, elev, ceil, sort)
 where p.building_key = ${q(id)}
on conflict (property_id, key) do update
   set name = excluded.name, elevation_m = excluded.elevation_m,
       ceiling_height_m = excluded.ceiling_height_m, sort_order = excluded.sort_order;

insert into public.rooms (household_id, property_id, level_id, key, name, room_type,
                          plan_x_m, plan_y_m, plan_w_m, plan_d_m, floor_area_m2,
                          condition, confidence, notes)
select p.household_id, p.id, l.id, v.key, v.name, v.room_type,
       v.x, v.y, v.w, v.d, v.area, 'unknown', 'drafted', v.note
  from public.properties p
  join (values
${rooms.join(',\n')}
       ) v(key, name, room_type, level_key, x, y, w, d, area, note) on true
  left join public.levels l on l.property_id = p.id and l.key = v.level_key
 where p.building_key = ${q(id)}
on conflict (household_id, property_id, key) do update
   set name = excluded.name, room_type = excluded.room_type, level_id = excluded.level_id,
       plan_x_m = excluded.plan_x_m, plan_y_m = excluded.plan_y_m,
       plan_w_m = excluded.plan_w_m, plan_d_m = excluded.plan_d_m,
       floor_area_m2 = excluded.floor_area_m2, notes = excluded.notes;`);
