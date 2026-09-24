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
//   node tools/takeoff.mjs                 the default building
//   node tools/takeoff.mjs --json          machine-readable
//   node tools/takeoff.mjs --building <id>
//   node tools/takeoff.mjs --sql           upsert into property_quantities
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
  internalFaceM2, ceilingAreaM2, floorAreaM2, newWallFaceM2,
} from '../assets/js/engine/takeoff.js';
import { stageDiff } from '../assets/js/engine/building.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const asJson = args.includes('--json');
const asSql = args.includes('--sql');

const id = flag('building', '48-ameysford-road');
const dir = join('data', 'buildings', id);
if (!existsSync(dir)) {
  console.error(`No such building: ${dir}`);
  process.exit(1);
}
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const property = read('building.json');
const asBought = read('stages/as-bought.json');
const post = existsSync(join(dir, 'stages/post-extension.json'))
  ? read('stages/post-extension.json') : null;

// The rooms the owner has asked for underfloor heating in. Named here
// rather than guessed, because heating a room nobody stands in is how
// a system ends up oversized.
const UFH_ROOMS = ['kitchen-diner', 'ensuite'];

const sections = [];
const add = (title, note, lines, prefix = '') => {
  if (lines.length) sections.push({ title, note, lines, prefix });
};

// The wall build-up the building states. The extension's primary
// brickwork section follows it, and the other construction is shown as
// the alternative - an open decision until the brick bond is seen.
const walls = property.walls?.construction ?? 'solid';

add('Restoration: strip back to brick', 
  `${floorAreaM2(asBought).toFixed(1)} m2 of floor, `
  + `${internalFaceM2(asBought).toFixed(1)} m2 of internal wall face, `
  + `${ceilingAreaM2(asBought).toFixed(1)} m2 of ceiling.`,
  restorationTakeoff(asBought, property, { skipRoomIds: UFH_ROOMS }));

if (post) {
  const diff = stageDiff(asBought, post);
  const face = `${diff.newExternalWallPlanM.toFixed(2)}m of new outer wall on plan, `
    + `${newWallFaceM2(diff, property).toFixed(1)} m2 of face.`;
  const solid = ['Extension: brickwork, solid 9in', brickTakeoff(diff, property, { construction: 'solid9' }), 'ext-solid:'];
  const cavity = ['Extension: brickwork, cavity (brick outer, block inner)', brickTakeoff(diff, property, { construction: 'cavity' }), 'ext-cavity:'];
  const [first, second] = walls === 'cavity' ? [cavity, solid] : [solid, cavity];
  add(`${first[0]} - matching the ${walls} original`, face, first[1], first[2]);
  add(`${second[0]} - the alternative`, 'An open decision until the original walls are seen.', second[1], second[2]);
  add('Extension: underfloor heating',
    `Rooms: ${UFH_ROOMS.join(', ')}.`,
    ufhTakeoff(post, UFH_ROOMS), 'ufh:');
}

// Garden quantities are sized off the owner's intent, not off the
// model - there is no paved area in the geometry to measure. They are
// here so the figure and its assumption travel together.
const PATIO_M2 = Number(flag('patio', 24));
const GRAVEL_M2 = Number(flag('gravel', 18));
add('Garden: patio',
  `Assumes ${PATIO_M2} m2 of 600x600 slabs. NOT measured off the model - `
  + 'there is no paved area in the geometry. Change it with --patio.',
  pavingTakeoff({ areaM2: PATIO_M2, slabW: 0.6, slabH: 0.6 }), 'garden:');
add('Garden: gravel path',
  `Assumes ${GRAVEL_M2} m2 at 50mm. Change it with --gravel.`,
  gravelTakeoff({ areaM2: GRAVEL_M2 }), 'garden:');

if (asSql) {
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
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
