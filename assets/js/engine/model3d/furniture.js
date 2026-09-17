// model3d/furniture.js - what is in the room, and what is built into it.
//
// EVERY item is extruded from the SAME rectangle the floor plan draws.
// That is the whole 1:1 guarantee: neither view owns a position, so
// moving a sofa moves it in both, and the clearance the plan measures
// around it is the clearance you can see in the model.

import { rectBox, THREE } from './geom.js';

/** How tall a thing is if it does not say. Only ever a fallback - a real
 *  item carries its own height. */
const HEIGHT = {
  bed: 0.55, sofa: 0.8, table: 0.75, chair: 0.85, stool: 0.7, island: 0.92,
  worktop: 0.92, hob: 0.92, sink: 0.92, oven: 0.9, fridge: 1.8, dishwasher: 0.85,
  washer: 0.85, dryer: 0.85, wc: 0.78, basin: 0.85, bath: 0.55, shower: 2.0,
  wardrobe: 2.0, desk: 0.74, shelf: 1.8, bench: 0.45, stove: 0.6, default: 0.75,
};

export function buildFurniture(item, level, palette) {
  const group = new THREE.Group();
  const h = item.height ?? HEIGHT[item.kind] ?? HEIGHT.default;
  const colour = item.fixed ? palette.furnitureFixed : palette.furniture;
  const body = rectBox(item.rect, level.elevation, h, colour);
  if (!body) return null;
  group.add(body);

  // A second box where one reads the shape: a sofa's back, a bed's
  // pillows, a wardrobe's plinth. Not modelling, just enough that the
  // room is legible from above.
  const [x1, y1, x2, y2] = item.rect;
  const face = item.facing ?? 's';
  const bandDepth = 0.24;
  const band = face === 'n' ? [x1, y2 - bandDepth, x2, y2]
    : face === 's' ? [x1, y1, x2, y1 + bandDepth]
      : face === 'w' ? [x2 - bandDepth, y1, x2, y2] : [x1, y1, x1 + bandDepth, y2];
  if (item.kind === 'sofa' || item.kind === 'bed') {
    const extra = rectBox(band, level.elevation, item.kind === 'bed' ? h + 0.35 : h + 0.4, colour);
    if (extra) group.add(extra);
  }

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
