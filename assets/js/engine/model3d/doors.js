// model3d/doors.js - joinery. What makes an opening read as a door or a
// window rather than as a hole with a slab over it.
//
// Before this existed an opening was a gap and the wall over it was one
// unbroken box, so every doorway in the walkthrough was a dark lintel
// with nothing under it, and every window was a sheet of tinted glass
// edge to edge. Both read as blocks, which is exactly what they looked
// like.
//
// Three things fix that, and none of them is modelling for its own sake:
//
//   THE LINING. A 230mm wall has 230mm of reveal, and the eye reads
//   depth from it. A lined opening tells you the wall has thickness;
//   an unlined one does not.
//
//   THE LEAF. A door is hung somewhere and opens one way, and the model
//   already records which - `swing: { hinge, toward }` on every door in
//   the spec, measured off the drawings. Standing the leaf on its hinge
//   puts that record on screen where it can be checked, which is the
//   whole argument for the 3D view. Stiles and rails, because a plank
//   at this size reads as a cupboard door.
//
//   THE GLAZING BARS. Cill, head, jambs, and a mullion every 550mm or
//   so. A window without them has no scale: it could be 600mm or 2m
//   wide and nothing in the picture says which.
//
// Structure and idiom follow the owner's own rec house planner, which
// solved this first.

import { segmentBox, lerp, box, v } from './geom.js';

/** Leaf thickness, frame section, and how far a drawn leaf stands open.
 *  72 degrees, because a leaf at 90 hides itself edge-on from most of
 *  the room and a leaf at 45 looks shut. */
const LEAF_T = 0.045;
const BAR = 0.06;
const OPEN_DEG = 72;

const UNIT = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
};

/**
 * Where a door's leaf hangs, in PLAN space.
 *
 * Pure: takes the wall and the opening, returns the two ends of the leaf
 * and its length. No three.js, so the hinge rule can be unit-tested
 * without a canvas.
 *
 * `hinge` is 'a' for the wall's own low end and 'b' for its high end -
 * which the spec guarantees means north-or-west and south-or-east
 * respectively, because every span in it is ordered that way. `toward`
 * names the compass direction the leaf swings into.
 */
export function doorSwing(wall, opening) {
  const [ax, ay] = wall.a;
  const [bx, by] = wall.b;
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 0.01) return null;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  // The wall's normal. With y running north to south this points south
  // on an east-west wall and west on a north-south one.
  const nx = -uy;
  const ny = ux;

  const hinge = opening.swing?.hinge ?? 'a';
  const at = opening.at;
  const half = opening.width / 2;
  // The hinge sits at one jamb; the leaf closes across the opening
  // toward the other, so its closed direction is along the wall.
  const t = hinge === 'a' ? at - half : at + half;
  const sign = hinge === 'a' ? 1 : -1;

  // Which side it opens into. Where the spec says, believe it; where it
  // does not, open it along the wall's normal.
  const toward = UNIT[opening.swing?.toward];
  const side = toward ? (nx * toward[0] + ny * toward[1] >= 0 ? 1 : -1) : 1;

  const leaf = Math.max(0.1, opening.width - 0.03);
  const th = (OPEN_DEG * Math.PI) / 180;
  const dx = sign * ux * Math.cos(th) + side * nx * Math.sin(th);
  const dy = sign * uy * Math.cos(th) + side * ny * Math.sin(th);
  const a = [ax + ux * t, ay + uy * t];
  return { a, b: [a[0] + dx * leaf, a[1] + dy * leaf], leaf };
}

/** The leaf itself: a panelled door standing open on its hinge. */
export function buildLeaf(sw, base, head, palette) {
  const meshes = [];
  const top = head - 0.02;
  const body = segmentBox(sw.a, sw.b, LEAF_T, base, top, palette.leaf);
  if (!body) return meshes;
  meshes.push(body);

  // Stiles and rails stand a little proud of both faces, so it reads as
  // a panelled door rather than a plank.
  const fr = Math.min(0.35, BAR / sw.leaf);
  const rail = (t0, t1, yOff, yH) => {
    const m = segmentBox(lerp(sw.a, sw.b, t0), lerp(sw.a, sw.b, t1),
      LEAF_T + 0.018, base + yOff, yH, palette.leafRail);
    if (m) meshes.push(m);
  };
  rail(0, fr, 0, top);              // hanging stile
  rail(1 - fr, 1, 0, top);          // closing stile
  rail(0, 1, 0, BAR);               // bottom rail
  rail(0, 1, top - BAR, BAR);       // top rail
  rail(0, 1, top * 0.46, BAR);      // middle rail

  const handle = box(0.10, 0.045, 0.14, palette.ironmongery);
  const hp = lerp(sw.a, sw.b, Math.max(0, 1 - fr - 0.07 / sw.leaf));
  handle.position.copy(v(hp[0], base + 1.02, hp[1]));
  handle.rotation.y = Math.atan2(-(sw.b[1] - sw.a[1]), sw.b[0] - sw.a[0]);
  meshes.push(handle);
  return meshes;
}

/**
 * The lining round an opening: two jambs and a head, set just inside the
 * reveal so the wall's thickness reads.
 *
 * Applies to doors and cased openings alike - a cased opening is a lined
 * opening with no leaf in it, which is exactly what the drawings mean by
 * one.
 */
export function buildLining(pa, pb, thickness, base, head, palette) {
  const meshes = [];
  const t = thickness * 0.92;
  const wlen = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  if (wlen < 0.12) return meshes;
  const fr = Math.min(0.4, 0.035 / wlen);
  const put = (t0, t1, yOff, yH) => {
    const m = segmentBox(lerp(pa, pb, t0), lerp(pa, pb, t1), t, base + yOff, yH, palette.lining);
    if (m) meshes.push(m);
  };
  put(0, fr, 0, head);              // jamb
  put(1 - fr, 1, 0, head);          // jamb
  put(0, 1, head - 0.04, 0.04);     // head
  return meshes;
}

/**
 * A window's frame: cill, head, jambs, a mullion every 550mm or so, and
 * a transom where there is height for one.
 *
 * Without these a window is a rectangle of tinted glass and the eye has
 * nothing to take scale from.
 */
export function buildWindowFrame(pa, pb, thickness, base, sill, head, palette) {
  const meshes = [];
  const wlen = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
  const hgt = head - sill;
  if (wlen < 0.2 || hgt < 0.1) return meshes;
  const t = thickness * 0.36;
  const put = (t0, t1, yOff, yH) => {
    const m = segmentBox(lerp(pa, pb, t0), lerp(pa, pb, t1), t, base + yOff, yH, palette.frame);
    if (m) meshes.push(m);
  };
  const fr = Math.min(0.45, 0.05 / wlen);
  put(0, 1, sill, 0.05);            // cill
  put(0, 1, head - 0.05, 0.05);     // head
  put(0, fr, sill, hgt);            // jambs
  put(1 - fr, 1, sill, hgt);
  const lights = Math.max(2, Math.round(wlen / 0.55));
  for (let i = 1; i < lights; i += 1) {
    const f = i / lights;
    put(f - fr / 2, f + fr / 2, sill, hgt);
  }
  // A transom only where there is height for one: a high-level window
  // divided again reads as a fanlight rather than a window.
  if (hgt > 0.9) put(0, 1, sill + hgt * 0.68, 0.05);
  return meshes;
}
