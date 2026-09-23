// model3d/furniture.js - what is in the room, and what is built into it.
//
// EVERY item is extruded from the SAME rectangle the floor plan draws.
// That is the whole 1:1 guarantee: neither view owns a position, so
// moving a sofa moves it in both, and the clearance the plan measures
// around it is the clearance you can see in the model.
//
// The SHAPE comes from furniture-parts.js, which is pure and tested. A
// sofa is a plinth, two arms, a seat and a back; a WC is a pan, a lid
// and a cistern. This module only extrudes what that one hands back,
// which is why the shapes can be tested from disk with no browser.
//
// ONE MATERIAL PER COLOUR still holds. Parts multiply the box count, so
// every part of every item uses the same two colours the items always
// did - a material per part would be a GPU state change per draw, and
// the walk step is scaled by frame time, so it would show up as walking
// that crawls rather than as a picture that stutters.

import { rectBox, THREE } from './geom.js';
import { partsOf } from './furniture-parts.js';

export function buildFurniture(item, level, palette) {
  const group = new THREE.Group();
  const colour = item.fixed ? palette.furnitureFixed : palette.furniture;
  let any = false;
  for (const part of partsOf(item)) {
    const mesh = rectBox(part.rect, level.elevation + part.z0, part.z1 - part.z0, colour);
    if (mesh) { group.add(mesh); any = true; }
  }
  if (!any) return null;
  group.userData = { kind: 'furniture', label: item.name, id: item.id };
  return group;
}

/** Built in, so it does not move: chimney breasts, fitted wardrobes,
 *  bulkheads, the porch. Drawn hatched on the plan for the same reason
 *  they are a different colour here. */
export function buildFeature(feature, level, palette) {
  const h = feature.height ?? level.ceilingHeight;
  const mesh = rectBox(feature.rect, level.elevation, h, palette.built);
  if (mesh) mesh.userData = { kind: 'feature', label: feature.kind.replace(/_/g, ' ') };
  return mesh;
}

/** The flight, as the steps it is. Built from the rise and going the
 *  model already carries, so a stair that does not reach the landing
 *  looks like one. */
export function buildStair(stair, from, to, palette) {
  const group = new THREE.Group();
  const [x1, y1, x2, y2] = stair.footprint;
  const vertical = (stair.direction ?? '-y').includes('y');
  const up = (stair.direction ?? '-y').startsWith('-');
  const run = vertical ? y2 - y1 : x2 - x1;
  const steps = Math.max(1, stair.risers ?? 1);
  const depth = run / steps;
  for (let i = 0; i < steps; i += 1) {
    const at = up ? run - (i + 1) * depth : i * depth;
    const rect = vertical
      ? [x1, y1 + at, x2, y1 + at + depth]
      : [x1 + at, y1, x1 + at + depth, y2];
    const mesh = rectBox(rect, from.elevation, (i + 1) * (stair.rise ?? 0.2), palette.built);
    if (mesh) group.add(mesh);
  }
  group.userData = { kind: 'stair', label: `${stair.risers} risers` };
  void to;
  return group;
}
