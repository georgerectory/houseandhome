#!/usr/bin/env node
// check-geometry.mjs - the geometry gate.
//
// Runs the same audit the Survey view runs, over every stage and every
// variant of every building, and fails the build on anything that cannot
// be built: rooms on top of each other, a door off the end of its wall,
// a floor with nothing under it, a stair that does not reach the
// landing, a wardrobe outside its room.
//
// It does NOT fail on a disagreement with a drawing. A stated figure and
// a modelled one differing by 280mm is a fact about the sources, not a
// bug in the model, and burying it in a red build would teach everyone
// to make it go away. Those are reported here and shown on the page, and
// only a difference beyond the source's own stated precision - a "check"
// row - is treated as a fault.
//
// It also re-runs the generator and fails if the committed JSON has
// drifted from the spec, so the two cannot disagree.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { composeBuilding, stageDiff } from '../assets/js/engine/building.js';
import { auditDimensions, auditSummary } from '../assets/js/engine/survey/dimensions.js';
import { auditIntegrity } from '../assets/js/engine/survey/integrity.js';
import { clearanceReport } from '../assets/js/engine/survey/clearance.js';
import { elevationSvg, SIDES } from '../assets/js/engine/survey/elevation.js';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const pad = (s, n) => String(s).padEnd(n);

let failures = 0;
const fail = (msg) => { console.error(`FAIL ${msg}`); failures += 1; };

// The household's room vocabulary, so a plan room cannot claim a key the
// rest of the system has never heard of and quietly fail to join up.
const fixturePath = resolve(root, 'data/fixtures/demo.json');
const roomKeys = existsSync(fixturePath)
  ? read(fixturePath).rooms.map((r) => r.key) : null;

console.log('Regenerating the building JSON from its spec...');
try {
  execFileSync(process.execPath, [resolve(root, 'tools/build-building.mjs'), '--check'],
    { stdio: 'inherit' });
} catch {
  fail('the committed building JSON does not match its spec');
}

const buildingsDir = resolve(root, 'data/buildings');
const buildings = readdirSync(buildingsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name);

if (!buildings.length) fail('there are no buildings to check');

for (const id of buildings) {
  const dir = resolve(buildingsDir, id);
  const manifest = read(resolve(dir, 'index.json'));
  const building = read(resolve(dir, 'building.json'));
  console.log(`\n${building.name} (${manifest.stages.length} stages)`);

  const stages = new Map();
  for (const entry of manifest.stages) {
    const stage = read(resolve(dir, entry.file));
    stages.set(stage.id, stage);
    const variants = entry.variants.length ? entry.variants : [null];

    for (const v of variants) {
      const variant = v ? read(resolve(dir, v.file)) : null;
      const b = composeBuilding(building, stage, variant);
      const label = `${stage.id}${variant ? ` / ${variant.id}` : ''}`;

      const findings = auditIntegrity(b, { roomKeys });
      for (const f of findings) {
        const line = `${label}: ${f.id} - ${f.message}`;
        if (f.severity === 'error') fail(line);
        else console.log(`  warn  ${line}`);
      }

      const dims = auditDimensions(b);
      const s = auditSummary(dims);
      for (const row of dims.filter((r) => r.status === 'check' || r.status === 'missing')) {
        fail(`${label}: ${row.subject} ${row.label} - ${row.source} says `
          + `${JSON.stringify(row.stated)}, the model says ${JSON.stringify(row.modelled)}`
          + `${row.deltaLabel ? ` (${row.deltaLabel} out)` : ''}`);
      }
      console.log(`  ${pad(label, 46)} dimensions ${s.ok} exact, ${s.tolerable} within tolerance, `
        + `${s.check} out; integrity ${findings.filter((f) => f.severity === 'error').length} errors`);

      // A room you cannot cross is a FAULT when it is the empty shell -
      // the building itself is wrong - and a FINDING when it is a
      // furnished variant, because a variant is a proposal and the
      // answer to "the sofa does not fit" is to move the sofa, which is
      // the owner's call and not a broken build. Both are reported; only
      // the first stops the build.
      const shell = !variant || !variant.furniture?.length;
      const note = shell ? fail : (m) => console.log(`  find  ${m}`);
      for (const level of b.levels) {
        for (const room of clearanceReport(b, level.id)) {
          if (room.status === 'blocked') {
            note(`${label}: you cannot get across ${room.name} - `
              + `${room.routeWidthM}m route against ${room.requiredWidthM}m needed`);
          } else if (room.status === 'tight') {
            console.log(`  warn  ${label}: ${room.name} is tight - ${room.routeWidthM}m route`);
          }
          // A door opening onto something is always a fault: it is not a
          // matter of taste and no arrangement makes it acceptable.
          for (const clash of room.clashes) {
            if (clash.kind === 'swing') fail(`${label}: ${room.name} - ${clash.message}`);
            else note(`${label}: ${room.name} - ${clash.message}`);
          }
        }
      }

      // The elevations have to draw. A view that throws is a view nobody
      // will look at, and looking at them is how the roof gets checked.
      for (const side of SIDES) {
        const svg = elevationSvg(b, side.id);
        if (!svg.includes('<svg')) fail(`${label}: the ${side.id} elevation did not draw`);
        if (/NaN|Infinity|undefined/.test(svg)) fail(`${label}: the ${side.id} elevation has a bad number in it`);
      }
    }
  }

  for (const entry of manifest.stages) {
    if (!entry.derivedFrom) continue;
    const parent = stages.get(entry.derivedFrom);
    if (!parent) { fail(`${entry.id} derives from ${entry.derivedFrom}, which does not exist`); continue; }
    const d = stageDiff(parent, stages.get(entry.id));
    console.log(`  ${pad(`${entry.derivedFrom} -> ${entry.id}`, 46)} `
      + `+${d.areaAddedM2} m2, ${d.newExternalWallPlanM}m new outer wall on plan, `
      + `${d.demolitionWallM}m down, ${d.roomsCreated} rooms`);
    if (!d.roomsCreated && !d.areaAddedM2) {
      fail(`${entry.id} claims to derive from ${entry.derivedFrom} but changes nothing`);
    }
  }
}

if (failures) {
  console.error(`\nGeometry: ${failures} failure${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('\nGeometry: every stage is a building, and agrees with its sources.');
