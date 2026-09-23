// furniture-parts.js - what a thing is actually shaped like.
//
// Every item used to be ONE BOX. A bed, a sofa, a WC and a fridge were
// the same gesture at different sizes, so a room read as a car park:
// nothing had a seat height, a headboard, a cistern or a leg, and at eye
// height in a 2.4m room a row of blocks is what you saw.
//
// So each kind names its PARTS instead. This module is pure - it takes a
// rectangle and returns rectangles - which is what makes it testable
// from disk with no browser and no THREE, and model3d/furniture.js does
// nothing but extrude what comes back.
//
// THE LOCAL FRAME. Parts are written once, in the item's own terms, and
// placed by `facing`:
//
//   u  across the item, 0 at its left, 1 at its right
//   v  through the item, 0 at the FRONT, 1 at the BACK
//   z  metres above the floor, absolute - a seat is 0.42 whatever the
//      item's overall height says
//
// Writing a sofa's back at v 0.72-1.0 means it is at the back of the
// sofa in all four orientations, and nothing has to be restated per
// rotation. Plan space runs y NORTH TO SOUTH (see CLAUDE.md), so facing
// 'n' looks toward LOW y and its back is at high y.

/**
 * Map the item's local frame onto plan space.
 *
 * For a sofa facing east or west the depth axis is x and the width axis
 * is y, which is the whole reason this is a function and not four
 * hand-written offsets per kind.
 */
export function frame(rect, facing = 's') {
  const [x1, y1, x2, y2] = rect;
  const w = x2 - x1;
  const d = y2 - y1;
  switch (facing) {
    // Looks north: front at low y, back at high y.
    case 'n': return (u0, v0, u1, v1) =>
      [x1 + u0 * w, y1 + v0 * d, x1 + u1 * w, y1 + v1 * d];
    // Looks west: front at low x, back at high x. Width runs along y.
    case 'w': return (u0, v0, u1, v1) =>
      [x1 + v0 * w, y1 + u0 * d, x1 + v1 * w, y1 + u1 * d];
    // Looks east: front at high x, back at low x.
    case 'e': return (u0, v0, u1, v1) =>
      [x2 - v1 * w, y1 + u0 * d, x2 - v0 * w, y1 + u1 * d];
    // Looks south: front at high y, back at low y.
    default: return (u0, v0, u1, v1) =>
      [x1 + u0 * w, y2 - v1 * d, x1 + u1 * w, y2 - v0 * d];
  }
}

/** A part: a local rectangle and the band of height it occupies. */
const p = (u0, v0, u1, v1, z0, z1) => ({ u0, v0, u1, v1, z0, z1 });

/** Four legs at the corners, inset, from the floor to `to`. */
const legs = (to, inset = 0.03, thick = 0.07) => [
  p(inset, inset, inset + thick, inset + thick, 0, to),
  p(1 - inset - thick, inset, 1 - inset, inset + thick, 0, to),
  p(inset, 1 - inset - thick, inset + thick, 1 - inset, 0, to),
  p(1 - inset - thick, 1 - inset - thick, 1 - inset, 1 - inset, 0, to),
];

/** A worktop run: recessed plinth, carcass, slab proud of the front. */
const counter = (top) => [
  p(0.02, 0.18, 0.98, 1, 0, 0.12),
  p(0, 0.08, 1, 1, 0.12, top - 0.04),
  p(0, 0, 1, 1, top - 0.04, top),
];

/**
 * The parts of each kind, in the local frame.
 *
 * The numbers are ordinary furniture rather than measured products - a
 * 0.42 seat, a 0.30 mattress on a 0.25 base, a 0.90 worktop - and they
 * are deliberately the same numbers the plan's `detail()` vocabulary
 * draws, so the two views cannot drift apart.
 */
const KIND = {
  sofa: () => [
    // Plinth, then arms full depth, then the seat between them, then the
    // back. A sofa modelled as one 0.82 block is a plinth, and reads as
    // a wall from a doorway.
    p(0.02, 0.02, 0.98, 0.98, 0.05, 0.16),
    p(0, 0, 0.13, 0.86, 0.16, 0.62),
    p(0.87, 0, 1, 0.86, 0.16, 0.62),
    p(0.13, 0, 0.87, 0.78, 0.16, 0.42),
    p(0, 0.78, 1, 1, 0.16, 0.82),
  ],
  chair: () => [
    ...legs(0.45, 0.04, 0.05),
    p(0, 0, 1, 1, 0.45, 0.49),
    p(0, 0.86, 1, 1, 0.49, 0.88),
  ],
  stool: () => [
    p(0.35, 0.35, 0.65, 0.65, 0, 0.66),
    p(0.2, 0.2, 0.8, 0.8, 0.02, 0.05),
    p(0, 0, 1, 1, 0.66, 0.7),
  ],
  bed: () => [
    // Base, mattress, headboard. The headboard is what tells you which
    // way the bed faces from the doorway.
    p(0.03, 0.03, 0.97, 0.95, 0.08, 0.32),
    p(0, 0, 1, 0.93, 0.32, 0.62),
    p(0, 0.95, 1, 1, 0.08, 1),
  ],
  table: (h) => [...legs(h - 0.04), p(0, 0, 1, 1, h - 0.04, h)],
  desk: (h) => [
    ...legs(h - 0.04),
    p(0, 0, 1, 1, h - 0.04, h),
    // Modesty panel, which is also what stops a desk reading as a table.
    p(0.04, 0.88, 0.96, 0.94, 0.35, h - 0.04),
  ],
  bench: () => [
    p(0.06, 0.06, 0.16, 0.94, 0, 0.44),
    p(0.84, 0.06, 0.94, 0.94, 0, 0.44),
    p(0, 0, 1, 1, 0.44, 0.48),
  ],
  shelf: (h) => {
    const out = [
      p(0, 0, 0.05, 1, 0, h),
      p(0.95, 0, 1, 1, 0, h),
      p(0, 0, 1, 1, h - 0.04, h),
    ];
    // Four shelves, evenly spaced, so the thing has a scale to it.
    for (let i = 1; i <= 4; i += 1) {
      const z = (h - 0.1) * (i / 5) + 0.05;
      out.push(p(0.05, 0.02, 0.95, 1, z, z + 0.03));
    }
    return out;
  },
  wardrobe: (h) => [
    p(0.02, 0.1, 0.98, 1, 0, 0.1),
    p(0, 0.06, 1, 1, 0.1, h),
    // Two door slabs proud of the carcass, with the shadow gap between.
    p(0.01, 0, 0.49, 0.06, 0.12, h - 0.02),
    p(0.51, 0, 0.99, 0.06, 0.12, h - 0.02),
  ],
  // SANITARYWARE. A WC is a pan and a cistern, and the cistern is why a
  // real one is nearly 0.70 deep - see the plausibility check in
  // survey/integrity.js, which reports a pan too shallow to be one.
  wc: () => [
    p(0.18, 0, 0.82, 0.58, 0, 0.40),
    p(0.12, 0, 0.88, 0.60, 0.40, 0.44),
    p(0.10, 0.60, 0.90, 1, 0, 0.80),
  ],
  basin: () => [
    p(0.34, 0.25, 0.66, 0.78, 0, 0.78),
    p(0, 0, 1, 1, 0.78, 0.87),
    p(0.42, 0.72, 0.58, 0.9, 0.87, 1.02),
  ],
  bath: () => [
    // A rim and an apron rather than a solid block: a bath you cannot
    // see into is a plinth with taps.
    p(0, 0, 1, 0.07, 0, 0.55),
    p(0, 0.93, 1, 1, 0, 0.55),
    p(0, 0, 0.06, 1, 0, 0.55),
    p(0.94, 0, 1, 1, 0, 0.55),
    p(0.06, 0.07, 0.94, 0.93, 0, 0.12),
  ],
  shower: (h) => [
    p(0, 0, 1, 1, 0, 0.06),
    p(0, 0.96, 1, 1, 0.06, h),
    p(0.96, 0, 1, 0.96, 0.06, h),
    p(0, 0, 0.04, 0.04, 0.06, h),
  ],
  // KITCHEN. All the runs share the counter shape so a worktop, a
  // dishwasher and an oven line through at the same height.
  worktop: (h) => counter(h),
  sink: (h) => [...counter(h), p(0.12, 0.12, 0.88, 0.88, h - 0.12, h - 0.03)],
  hob: (h) => [...counter(h), p(0.08, 0.1, 0.92, 0.9, h, h + 0.02)],
  dishwasher: (h) => [...counter(h), p(0.03, 0, 0.97, 0.05, 0.12, h - 0.06)],
  washer: (h) => [...counter(h), p(0.03, 0, 0.97, 0.05, 0.12, h - 0.06),
    p(0.3, 0, 0.7, 0.03, 0.4, h - 0.3)],
  dryer: (h) => [...counter(h), p(0.03, 0, 0.97, 0.05, 0.12, h - 0.06)],
  oven: (h) => [
    p(0.02, 0.18, 0.98, 1, 0, 0.12),
    p(0, 0.06, 1, 1, 0.12, h),
    p(0.03, 0, 0.97, 0.06, 0.15, h - 0.28),
    p(0.1, 0, 0.9, 0.04, h - 0.24, h - 0.16),
  ],
  island: (h) => [
    p(0.04, 0.22, 0.96, 0.96, 0, 0.12),
    p(0.02, 0.12, 0.98, 1, 0.12, h - 0.04),
    // The slab overhangs the front, which is what makes it an island
    // with stools rather than a run of units in the middle of a room.
    p(0, 0, 1, 1, h - 0.04, h),
  ],
  fridge: (h) => [
    p(0.02, 0.1, 0.98, 1, 0, 0.08),
    p(0, 0.05, 1, 1, 0.08, h),
    p(0.02, 0, 0.98, 0.05, 0.1, h - 0.02),
    p(0.86, 0, 0.9, 0.02, 0.9, h - 0.15),
  ],
  // A log burner: firebox on legs, with its flue going up. The flue is
  // most of what you recognise from across a room.
  stove: () => [
    p(0.08, 0.08, 0.2, 0.2, 0, 0.14),
    p(0.8, 0.08, 0.92, 0.2, 0, 0.14),
    p(0.08, 0.8, 0.2, 0.92, 0, 0.14),
    p(0.8, 0.8, 0.92, 0.92, 0, 0.14),
    p(0.04, 0.04, 0.96, 0.96, 0.14, 0.62),
    p(0.35, 0.35, 0.65, 0.65, 0.62, 1.45),
  ],
};

/** Fallback height when an item does not carry one. */
export const HEIGHT = {
  bed: 1.0, sofa: 0.82, table: 0.75, chair: 0.88, stool: 0.7, island: 0.92,
  worktop: 0.92, hob: 0.92, sink: 0.92, oven: 0.9, fridge: 1.8, dishwasher: 0.85,
  washer: 0.85, dryer: 0.85, wc: 0.8, basin: 1.02, bath: 0.55, shower: 2.0,
  wardrobe: 2.0, desk: 0.74, shelf: 1.8, bench: 0.48, stove: 1.45, default: 0.75,
};

/**
 * The parts of one item, already placed in plan space.
 *
 * Returns `[{ rect, z0, z1 }]`. A kind with no entry falls back to the
 * single box it always was, so an unknown kind still renders rather than
 * disappearing - a missing sofa is a worse bug than a boxy one.
 */
export function partsOf(item) {
  const h = item.height ?? HEIGHT[item.kind] ?? HEIGHT.default;
  const build = KIND[item.kind];
  const local = build ? build(h) : [{ u0: 0, v0: 0, u1: 1, v1: 1, z0: 0, z1: h }];
  const place = frame(item.rect, item.facing);
  return local
    .filter((q) => q.z1 > q.z0)
    .map((q) => ({ rect: place(q.u0, q.v0, q.u1, q.v1), z0: q.z0, z1: q.z1 }));
}

/** The kinds that have a real shape, for the tests and for the survey. */
export const SHAPED_KINDS = Object.keys(KIND);
