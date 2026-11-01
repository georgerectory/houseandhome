#!/usr/bin/env node
// tools/takeoff.mjs - print the material quantities the geometry
// implies, so a stockpile target can be reconciled against them.
//
// WHY THIS IS A TOOL AND NOT A TABLE. A stock target says "6,882
// bricks". That number came off the building model. Change the
// extension - move a wall, drop a storey - and the number moves, but
// the row in Supabase does not, and nobody will notice until the wall
// stops short.
//
// So the quantity is never the authority: the geometry is. This prints
// what the geometry says today, and a session compares it against
// `stock_targets.quantity_needed` and reconciles the difference
// deliberately. That is the "adapts when the plans change" rule, in the
// only form that actually works: the derived figure is recomputed and
// the stored one is challenged by it.
//
//   node tools/takeoff.mjs                 the building the site shows
//   node tools/takeoff.mjs --json          machine-readable
//   node tools/takeoff.mjs --building <id>
//   node tools/takeoff.mjs --stage <id>    one design stage only
//   node tools/takeoff.mjs --sql           upsert into property_quantities
//   node tools/takeoff.mjs --patio 24 --gravel 18   garden intent, opt-in
//
// The restoration section is measured off the building's base stage
// (the one derived from nothing). Every other stage in index.json is
// diffed against the stage it was forked from, and its lines are keyed
// `<stage>:` so each design option prices separately and the base set
// is never overwritten by an option nobody has chosen.
//
// --sql prints the statements that write this takeoff into
// property_quantities for the property whose building_key is this
// building. It is the ONLY way a quantity gets into that table: a
// quantity typed into a cell is a shadow that goes stale when a wall
// moves, so the table is overwritten from the geometry, never edited.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  brickTakeoff, ufhTakeoff, restorationTakeoff, pavingTakeoff, gravelTakeoff,
  internalFaceM2, ceilingAreaM2, floorAreaM2, newWallFaceM2, roomTakeoff,
} from '../assets/js/engine/takeoff.js';
import { stageDiff } from '../assets/js/engine/building.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const asJson = args.includes('--json');
const asSql = args.includes('--sql');

// The default is the building the site shows, read from the one place
// that says so, so this tool never silently measures a house that has
// been archived.
const ACTIVE = readFileSync(new URL('../assets/js/core/building-data.js', import.meta.url), 'utf8')
  .match(/const BUILDING = '([^']+)'/)[1];
const id = flag('building', ACTIVE);
const dir = join('data', 'buildings', id);
if (!existsSync(dir)) {
  console.error(`No such building: ${dir}`);
  process.exit(1);
}
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const property = read('building.json');
const index = read('index.json');
const stageOf = (sid) => read(`stages/${sid}.json`);
const baseId = (index.stages.find((s) => !s.derivedFrom) ?? index.stages[0]).id;
const only = flag('stage', null);
if (only && !index.stages.some((s) => s.id === only)) {
  console.error(`No stage ${only} in ${id}: ${index.stages.map((s) => s.id).join(', ')}`);
  process.exit(1);
}
const asBought = stageOf(baseId);

// The rooms the owner has asked for underfloor heating in. Named here
// rather than guessed, because heating a room nobody stands in is how
// a system ends up oversized.
const UFH_ROOMS = ['kitchen-diner', 'ensuite'];

const sections = [];
const add = (title, note, lines, prefix = '') => {
  if (lines.length) sections.push({ title, note, lines, prefix });
};

// The wall build-up the building states. New brickwork follows it, and
// the other construction is shown as the alternative - an open decision
// until the brick bond is seen.
const walls = property.walls?.construction ?? 'solid';

if (!only || only === baseId) {
  add('Restoration: strip back to brick',
    `${floorAreaM2(asBought).toFixed(1)} m2 of floor, `
    + `${internalFaceM2(asBought).toFixed(1)} m2 of internal wall face, `
    + `${ceilingAreaM2(asBought).toFixed(1)} m2 of ceiling.`,
    restorationTakeoff(asBought, property, { skipRoomIds: UFH_ROOMS }));
  // The realistic plan works one room at a time (R-14), so each room's
  // faces are lines of their own, keyed `room:<id>:`.
  add('Room by room: wall face, ceiling and floor',
    'Each room measured on its own, for the one-room-at-a-time plan.',
    roomTakeoff(asBought));
}

for (const meta of index.stages) {
  if (meta.id === baseId || (only && meta.id !== only)) continue;
  const stage = stageOf(meta.id);
  const from = stageOf(meta.derivedFrom ?? baseId);
  const diff = stageDiff(from, stage);
  const tag = `${meta.id}:`;
  const label = `${meta.name ?? meta.id} (from ${meta.derivedFrom ?? baseId})`;
  if (diff.newExternalWallPlanM > 0) {
    const face = `${diff.newExternalWallPlanM.toFixed(2)}m of new outer wall on plan, `
      + `${newWallFaceM2(diff, property).toFixed(1)} m2 of face.`;
    const solid = ['brickwork, solid 9in', brickTakeoff(diff, property, { construction: 'solid9' }), `${tag}ext-solid:`];
    const cavity = ['brickwork, cavity (brick outer, block inner)', brickTakeoff(diff, property, { construction: 'cavity' }), `${tag}ext-cavity:`];
    const [first, second] = walls === 'cavity' ? [cavity, solid] : [solid, cavity];
    add(`${label}: ${first[0]} - matching the ${walls} original`, face, first[1], first[2]);
    add(`${label}: ${second[0]} - the alternative`, 'An open decision until the original walls are seen.', second[1], second[2]);
  }
  // Only rooms THIS stage creates: a child stage that still has its
  // parent's kitchen-diner must not price its floor heating again.
  const parentIds = new Set((from.rooms ?? []).map((r) => r.id));
  const created = new Set((stage.rooms ?? []).map((r) => r.id).filter((id) => !parentIds.has(id)));
  const ufhHere = UFH_ROOMS.filter((r) => created.has(r));
  add(`${label}: underfloor heating`,
    `Rooms this stage creates: ${ufhHere.join(', ') || 'none'}.`,
    ufhTakeoff(stage, ufhHere), `${tag}ufh:`);
}

// Garden quantities are sized off the owner's intent, not off the
// model - there is no paved area in the geometry to measure. So they
// are opt-in: a figure carried from one house's garden is not another
// house's intent. Pass --patio and --gravel to include them.
if (args.includes('--patio')) {
  const PATIO_M2 = Number(flag('patio', 0));
  add('Garden: patio',
    `Assumes ${PATIO_M2} m2 of 600x600 slabs. NOT measured off the model - `
    + 'there is no paved area in the geometry.',
    pavingTakeoff({ areaM2: PATIO_M2, slabW: 0.6, slabH: 0.6 }), 'garden:');
}
if (args.includes('--gravel')) {
  const GRAVEL_M2 = Number(flag('gravel', 0));
  add('Garden: gravel path', `Assumes ${GRAVEL_M2} m2 at 50mm.`,
    gravelTakeoff({ areaM2: GRAVEL_M2 }), 'garden:');
}

if (asSql) {
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  // A --stage run owns only that stage's keys; a full run owns them all.
  const scopeSql = !only ? 'true'
    : only === baseId ? "(q.package_key not like '%:%' or q.package_key like 'garden:%' or q.package_key like 'room:%')"
      : `q.package_key like ${q(`${only}:%`)}`;
  const rows = sections.flatMap((s) => s.lines.map((l) =>
    `(${q(s.prefix + l.key)}, ${q(l.label)}, ${Number(l.quantity)}, ${q(l.unit)}, ${q(l.basis)})`));
  console.log(`-- property_quantities for ${id}, from npm run takeoff. Overwrites; never edit by hand.
insert into public.property_quantities (household_id, property_id, package_key, label, quantity, unit, basis, source, confidence)
select p.household_id, p.id, v.k, v.label, v.qty, v.unit, v.basis, 'takeoff', 'drafted'
  from public.properties p,
       (values
${rows.join(',\n')}
       ) v(k, label, qty, unit, basis)
 where p.building_key = ${q(id)}
on conflict (property_id, package_key) do update
   set label = excluded.label, quantity = excluded.quantity, unit = excluded.unit,
       basis = excluded.basis, source = 'takeoff', confidence = 'drafted';
-- Lines this takeoff no longer produces are stale shadows of an old geometry.
delete from public.property_quantities q using public.properties p
 where q.property_id = p.id and p.building_key = ${q(id)} and q.source = 'takeoff'
   and ${scopeSql}
   and q.package_key not in (${sections.flatMap((s) => s.lines.map((l) => q(s.prefix + l.key))).join(', ')});`);
  process.exit(0);
}

if (asJson) {
  console.log(JSON.stringify({ building: id, sections }, null, 2));
  process.exit(0);
}

console.log(`\nMaterial takeoff - ${property.name ?? id}`);
console.log('Every figure below is DRAFTED: the geometry is researched at best');
console.log('and the rates are trade convention. Nothing here may drive an');
console.log('allocation of real money until it is confirmed.\n');

for (const s of sections) {
  console.log(`  ${s.title}`);
  console.log(`  ${'-'.repeat(s.title.length)}`);
  if (s.note) console.log(`  ${s.note}\n`);
  for (const l of s.lines) {
    console.log(`    ${String(l.quantity).padStart(9)} ${l.unit.padEnd(9)} ${l.label}`);
    console.log(`    ${' '.repeat(9)} ${' '.repeat(9)} ${l.basis}`);
  }
  console.log('');
}
