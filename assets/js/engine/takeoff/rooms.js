// takeoff/rooms.js - the three faces of each room, measured off the model.
//
// The realistic plan (R-14) brings the house up to scratch ONE ROOM AT A
// TIME: make good what is sound, strip only what has failed. A room is
// then the unit of work and of money, so each room needs its own wall
// face, ceiling and floor rather than a share of a whole-house total.
//
// Same measuring rules as restoration.js: the room's perimeter times the
// ceiling height of its level, openings not deducted (reveals roughly
// cancel the holes), the ceiling equal to the floor.
import { line } from './newbuild.js';

const rectsOf = (r) => r.rects ?? [r.rect];
const area = (q) => (q[2] - q[0]) * (q[3] - q[1]);
const perimeter = (q) => 2 * ((q[2] - q[0]) + (q[3] - q[1]));

/** One room's faces: { id, name, level, wallM2, ceilingM2, floorM2 }. */
export function roomFaces(stage) {
  const height = Object.fromEntries((stage?.levels ?? []).map((l) => [l.id, l.ceilingHeight ?? 2.4]));
  return (stage?.rooms ?? []).map((r) => {
    const h = height[r.level] ?? 2.4;
    const floor = rectsOf(r).reduce((s, q) => s + area(q), 0);
    // An L-shaped room drawn as two rects shares an edge that is not a
    // wall; the plain sum of perimeters over-counts it by twice its length.
    const shared = sharedEdgeM(rectsOf(r));
    const wall = (rectsOf(r).reduce((s, q) => s + perimeter(q), 0) - 2 * shared) * h;
    return { id: r.id, name: r.name ?? r.id, level: r.level, wallM2: wall, ceilingM2: floor, floorM2: floor, heightM: h };
  });
}

/** Total length of edges two rects of one room share. */
function sharedEdgeM(rects) {
  let m = 0;
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) m += touch(rects[i], rects[j]);
  }
  return m;
}
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
// Two rects of ONE room within a wall's thickness of each other are the
// same space drawn in two pieces (bedroom 4's L leaves a 0.1 m seam), not
// two faces of a wall: there is no wall inside a room.
const SEAM_M = 0.15;
const near = (a, b) => Math.abs(a - b) <= SEAM_M;
function touch(a, b) {
  if (near(a[2], b[0]) || near(b[2], a[0])) return overlap(a[1], a[3], b[1], b[3]);
  if (near(a[3], b[1]) || near(b[3], a[1])) return overlap(a[0], a[2], b[0], b[2]);
  return 0;
}

/** Takeoff lines, keyed `room:<id>:walls|ceiling|floor`. */
export function roomTakeoff(stage) {
  return roomFaces(stage).flatMap((r) => {
    const basis = `${r.name}: perimeter x ${r.heightM} m ceiling height on the ${r.level} floor, openings not deducted.`;
    return [
      line(`room:${r.id}:walls`, `${r.name}: wall face`, r.wallM2, 'm2', basis, { dp: 1 }),
      line(`room:${r.id}:ceiling`, `${r.name}: ceiling`, r.ceilingM2, 'm2', `${r.name}: equal to the floor.`, { dp: 1 }),
      line(`room:${r.id}:floor`, `${r.name}: floor`, r.floorM2, 'm2', `${r.name}: the room's drawn rectangles.`, { dp: 1 }),
    ];
  });
}
