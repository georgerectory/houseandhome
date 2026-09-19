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
  bed: 0.55, sofa: 0.82, table: 0.75, chair: 0.85, stool: 0.7, island: 0.92,
  worktop: 0.92, hob: 0.92, sink: 0.92, oven: 0.9, fridge: 1.8, dishwasher: 0.85,
  washer: 0.85, dryer: 0.85, wc: 0.78, basin: 0.85, bath: 0.55, shower: 2.0,
  wardrobe: 2.0, desk: 0.74, shelf: 1.8, bench: 0.45, stove: 0.6, default: 0.75,
};

/**
 * WHAT `height` MEANS, per kind, and why it is not one rule.
 *
 * `height` is the TOP of the thing - the back of a sofa, the top of a
 * headboard, the top of a chair back. For most kinds that is also the
 * height of the whole box. For the three you sit or lie on it is not:
 * a sofa whose every part stands 0.82 off the floor is a plinth, and at
 * eye height in a 2.4m room it reads as a wall. Those get a low SEAT
 * over their whole footprint and the tall part only where the back is.
 *
 * The numbers are ordinary furniture, not measured: a 0.42 seat, a 0.30
 * mattress on a 0.25 base, a 0.45 chair seat.
 */
const SEAT = { sofa: 0.42, bed: 0.55, chair: 0.45 };

export function buildFurniture(item, level, palette) {
  const group = new THREE.Group();
  const top = item.height ?? HEIGHT[item.kind] ?? HEIGHT.default;
  const colour = item.fixed ? palette.furnitureFixed : palette.furniture;
  const seat = SEAT[item.kind];
  const body = rectBox(item.rect, level.elevation, seat ?? top, colour);
  if (!body) return null;
  group.add(body);

  // The back, where the item has one: a sofa's back and a chair's, a
  // bed's headboard. Not modelling - just enough that the room is
  // legible from above and does not read as a row of blocks at eye
  // height.
  if (seat) {
    const [x1, y1, x2, y2] = item.rect;
    const face = item.facing ?? 's';
    const bandDepth = Math.min(0.18, Math.min(x2 - x1, y2 - y1) * 0.45);
    // `facing` is the way the item LOOKS, so the back is the far side.
    const band = face === 'n' ? [x1, y2 - bandDepth, x2, y2]
      : face === 's' ? [x1, y1, x2, y1 + bandDepth]
        : face === 'w' ? [x2 - bandDepth, y1, x2, y2] : [x1, y1, x1 + bandDepth, y2];
    const back = item.kind === 'bed' ? Math.max(top, 0.95) : top;
    if (back > seat) {
      const extra = rectBox(band, level.elevation, back, colour);
      if (extra) group.add(extra);
    }
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
