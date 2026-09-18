// model3d/walls.js - walls, split around their openings.
//
// A wall is cut around each opening, with the piece under the sill and
// the piece over the head kept, so a window is a hole in a wall rather
// than a panel stuck on one.
//
// Thickness and provenance both come from the model, and the floor plan
// reads the same two values - so an existing wall is the same thickness
// and the same colour in both views, and new work is told apart from old
// in both.

import { wallThickness } from '../floorplan.js';
import { segmentBox, lerp, rectBox } from './geom.js';

/**
 * One wall's meshes, plus the COLLIDER the walkthrough stops against.
 *
 * The collider is plan-space and axis-aligned, which is all a house of
 * rectangles needs, and it carries its own doorways so the walker can
 * step through a door rather than having to be let through by a
 * separate list that could fall out of step with the geometry.
 */
export function buildWall(wall, openings, level, defaults, palette, opts = {}) {
  const meshes = [];
  const thickness = wallThickness(wall, { defaults });
  const color = wall.provenance === 'new' ? palette.wallNew
    : (palette[wall.kind] ?? palette.internal);
  const base = level.elevation;
  const top = wall.height ?? level.ceilingHeight;
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  if (!len) return meshes;

  const mine = openings
    .filter((o) => o.wall === wall.id)
    .map((o) => ({ ...o, start: o.at - o.width / 2, end: o.at + o.width / 2 }))
    .sort((x, y) => x.start - y.start);

  let cursor = 0;
  for (const o of mine) {
    const s = Math.max(0, o.start);
    const e = Math.min(len, o.end);
    if (s / len > cursor) {
      meshes.push(segmentBox(lerp(wall.a, wall.b, cursor), lerp(wall.a, wall.b, s / len),
        thickness, base, top, color));
    }
    // An opening may carry its own sill and head; the defaults cover the
    // common case of a window at cill height and a door to the floor.
    const head = o.head ?? (o.type === 'garage' ? defaults.garageDoorHeight
      : o.type === 'door' ? defaults.doorHeight : defaults.windowHead);
    const sill = o.sill ?? (o.type === 'window' ? defaults.windowSill : 0);
    const pa = lerp(wall.a, wall.b, s / len);
    const pb = lerp(wall.a, wall.b, e / len);
    if (sill > 0) meshes.push(segmentBox(pa, pb, thickness, base, sill, color));
    if (top > head) meshes.push(segmentBox(pa, pb, thickness, base + head, top - head, color));
    if (o.type === 'window' && opts.glazing !== false) {
      const glass = segmentBox(pa, pb, thickness * 0.25, base + sill, head - sill,
        palette.glass, { opacity: 0.32 });
      if (glass) meshes.push(glass);
    } else if (o.type === 'garage') {
      meshes.push(segmentBox(pa, pb, thickness * 0.4, base, head, palette.garageDoor));
    }
    cursor = e / len;
  }
  if (cursor < 1) {
    meshes.push(segmentBox(lerp(wall.a, wall.b, cursor), wall.b, thickness, base, top, color));
  }
  const solids = meshes.filter(Boolean);
  solids.collider = {
    id: wall.id,
    level: wall.level,
    minX: Math.min(wall.a[0], wall.b[0]) - thickness / 2,
    maxX: Math.max(wall.a[0], wall.b[0]) + thickness / 2,
    minY: Math.min(wall.a[1], wall.b[1]) - thickness / 2,
    maxY: Math.max(wall.a[1], wall.b[1]) + thickness / 2,
    // Distance along the wall is measured from its own start point, not
    // from the min corner: a wall drawn south-to-north has its start at
    // the high y, and measuring from the wrong end puts every doorway
    // in this wall at the opposite end of it.
    origin: wall.a,
    // A window is not a way through. Everything else is.
    doorways: (openings ?? [])
      .filter((o) => o.wall === wall.id && o.type !== 'window')
      .map((o) => ({ start: o.at - o.width / 2, end: o.at + o.width / 2 })),
  };
  return solids;
}

/** A room's floor slab, sitting just under the level it belongs to. A
 *  compound room gets a slab per rectangle, so an L-shaped landing does
 *  not get a floor over the stairwell it wraps. */
export function buildFloor(rect, level, defaults, palette) {
  const t = defaults.floorThickness ?? 0.3;
  return rectBox(rect, level.elevation - t, t, palette.floor);
}
