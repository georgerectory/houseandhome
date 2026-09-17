// model3d.js - turn the building model into three.js geometry.
//
// Takes data, returns groups. No DOM beyond the label canvas, no state,
// no fetch. The viewer owns the canvas; this owns the shapes.
//
// Split by what each part builds - walls, roof, furniture, markers -
// behind this file, which keeps buildModel() and the THREE re-export so
// no import path had to change.
//
// Colour does not belong in geometry, so every material takes its colour
// from the palette the viewer passes in - which reads it from the same
// tokens the floor plan uses, and so follows the theme.

import { roomRects, stairsOn } from './floorplan.js';
import { THREE } from './model3d/geom.js';
import { buildWall, buildFloor } from './model3d/walls.js';
import { buildRoof, buildChimney } from './model3d/roof.js';
import { buildFurniture, buildFeature, buildStair } from './model3d/furniture.js';
import { buildMarker, buildLabel } from './model3d/markers.js';

/**
 * Build the whole model.
 *
 * Returns the root group plus a group per level, so the viewer can hide
 * the first floor to look into the ground floor without rebuilding
 * anything, and separate groups for the roof, the furniture and the
 * markers for the same reason.
 *
 * `opts.glazing: false` leaves the windows as holes, which is how you
 * see into a room from outside.
 */
export function buildModel(building, placements = [], palette, opts = {}) {
  const root = new THREE.Group();
  const defaults = building.defaults ?? {};
  const levelGroups = {};
  const markerGroups = {};
  const furnitureGroups = {};
  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof';

  for (const level of building.levels ?? []) {
    const g = new THREE.Group();
    g.name = `level-${level.id}`;
    for (const room of (building.rooms ?? []).filter((r) => r.level === level.id)) {
      // A compound room gets a slab per rectangle, so an L-shaped
      // landing does not get a floor over the stairwell it wraps.
      for (const rect of roomRects(room)) {
        const f = buildFloor(rect, level, defaults, palette);
        if (f) g.add(f);
      }
    }
    for (const wall of (building.walls ?? []).filter((w) => w.level === level.id)) {
      for (const m of buildWall(wall, building.openings ?? [], level, defaults, palette, opts)) {
        g.add(m);
      }
    }
    for (const feature of (building.features ?? []).filter((f) => f.level === level.id)) {
      const m = buildFeature(feature, level, palette);
      if (m) g.add(m);
    }
    for (const stair of stairsOn(building, level.id)) {
      const from = (building.rooms ?? []).find((r) => r.id === stair.from);
      if (from?.level !== level.id) continue;
      g.add(buildStair(stair, level, null, palette));
    }
    levelGroups[level.id] = g;
    root.add(g);

    const fg = new THREE.Group();
    fg.name = `furniture-${level.id}`;
    for (const item of (building.furniture ?? []).filter((f) => f.level === level.id)) {
      const m = buildFurniture(item, level, palette);
      if (m) fg.add(m);
    }
    furnitureGroups[level.id] = fg;
    root.add(fg);

    const mg = new THREE.Group();
    mg.name = `markers-${level.id}`;
    for (const p of placements.filter((q) => q.level === level.id && q.x != null)) {
      const m = buildMarker(p, building, palette);
      if (m) mg.add(m);
    }
    markerGroups[level.id] = mg;
    root.add(mg);
  }

  for (const roof of (building.roofs ?? [])) roofGroup.add(buildRoof(roof, palette));
  for (const stack of (building.chimneys ?? [])) roofGroup.add(buildChimney(stack, defaults, palette));
  root.add(roofGroup);

  // Centre the model on the origin so orbiting turns around the house
  // rather than around a corner of it. Measured from the STRUCTURE
  // alone: a label sprite sticks out well past the wall it sits behind,
  // and letting one drag the centre sideways would put the house off
  // axis for the sake of a caption.
  const bbox = new THREE.Box3();
  for (const g of Object.values(levelGroups)) bbox.expandByObject(g);
  const centre = bbox.getCenter(new THREE.Vector3());
  root.position.x = -centre.x;
  root.position.z = -centre.z;

  // Two boxes, and they do different jobs. The FULL one, roof and stacks
  // included, decides how far back the camera has to stand. The
  // STRUCTURE one decides what it looks at: aiming at the middle of a
  // box that includes a 7.7m ridge points the camera at the sky, and
  // aiming at it while a lower level is on its own - roof hidden - puts
  // the house in the bottom corner of the frame.
  const full = new THREE.Box3().setFromObject(root);
  const topLevel = (building.levels ?? [])
    .reduce((best, l) => (!best || l.elevation > best.elevation ? l : best), null);
  return {
    root,
    levelGroups,
    markerGroups,
    furnitureGroups,
    roofGroup,
    topLevelId: topLevel?.id ?? null,
    size: bbox.getSize(new THREE.Vector3()),
    fullSize: full.getSize(new THREE.Vector3()),
    centre: bbox.getCenter(new THREE.Vector3()),
  };
}

export { THREE, buildLabel };
