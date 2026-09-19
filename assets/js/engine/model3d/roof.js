// model3d/roof.js - the roof, and the stacks that come through it.
//
// The ridge height is COMPUTED from the footprint and the pitch, not
// typed, which is the whole reason the model can be checked against a
// drawing that says "about 7.8m at 35 degrees": if the arithmetic
// disagrees, the Survey view says so rather than the model quietly
// agreeing with itself.
//
// A hipped roof has four slopes and no valleys - two trapezoids along
// the ridge and a triangle at each end - which is exactly why the design
// study squares the footprint off. A gabled roof has two slopes and two
// vertical ends, and those ends are brickwork, not tile, so they are
// built in the wall colour.

import { faces, quad, rectBox, box, v, THREE } from './geom.js';

const rise = (span, pitchDeg) => (span / 2) * Math.tan((pitchDeg * Math.PI) / 180);

/**
 * One roof over one rectangle.
 *
 * `over` is the plan footprint it covers; the eaves sit `overhang`
 * outside it on every side, which is what stops a model's walls looking
 * like they were cut off with scissors.
 */
export function buildRoof(roof, palette) {
  const group = new THREE.Group();
  const o = roof.overhang ?? 0.3;
  const [x1, y1, x2, y2] = [roof.over[0] - o, roof.over[1] - o, roof.over[2] + o, roof.over[3] + o];
  const eaves = roof.eavesHeight;
  const alongX = roof.ridgeAxis === 'x';
  const across = alongX ? (y2 - y1) : (x2 - x1);
  const ridgeH = eaves + rise(across, roof.pitchDeg ?? 35);
  // A hip pulls the ridge in by the same run at each end; a gable does
  // not pull it in at all.
  const inset = roof.kind === 'hipped' ? across / 2 : 0;

  // Corners of the eaves, and the two ends of the ridge, in plan.
  const mid = alongX ? (y1 + y2) / 2 : (x1 + x2) / 2;
  const r1 = alongX ? [x1 + inset, mid] : [mid, y1 + inset];
  const r2 = alongX ? [x2 - inset, mid] : [mid, y2 - inset];

  const P = (p, h) => [p[0], h, p[1]];
  const c = {
    a: [x1, y1], b: [x2, y1], c: [x2, y2], d: [x1, y2],
  };
  const tris = [];
  if (alongX) {
    // North slope, south slope.
    tris.push(...quad(P(c.a, eaves), P(c.b, eaves), P(r2, ridgeH), P(r1, ridgeH)));
    tris.push(...quad(P(c.d, eaves), P(r1, ridgeH), P(r2, ridgeH), P(c.c, eaves)));
    if (inset) {
      tris.push([P(c.a, eaves), P(r1, ridgeH), P(c.d, eaves)]);
      tris.push([P(c.b, eaves), P(c.c, eaves), P(r2, ridgeH)]);
    }
  } else {
    tris.push(...quad(P(c.a, eaves), P(r1, ridgeH), P(r2, ridgeH), P(c.d, eaves)));
    tris.push(...quad(P(c.b, eaves), P(c.c, eaves), P(r2, ridgeH), P(r1, ridgeH)));
    if (inset) {
      tris.push([P(c.a, eaves), P(c.b, eaves), P(r1, ridgeH)]);
      tris.push([P(c.d, eaves), P(r2, ridgeH), P(c.c, eaves)]);
    }
  }
  const slopes = faces(tris, palette.roof);
  slopes.userData.kind = 'roof';
  group.add(slopes);

  // A gable end is a wall, not a roof: brick up to the underside of the
  // tiles. Built here because only the roof knows where that line is.
  if (!inset) {
    const ends = alongX
      ? [[[c.a, c.d], r1], [[c.b, c.c], r2]]
      : [[[c.a, c.b], r1], [[c.d, c.c], r2]];
    for (const [[p, q], apex] of ends) {
      group.add(faces([[P(p, eaves), P(q, eaves), P(apex, ridgeH)]], palette.external));
    }
  }
  group.userData.kind = 'roof';
  return group;
}

/**
 * A stack, its crown, and the pots seated in it.
 *
 * THE POTS USED TO FLOAT, and the reason is worth writing down. Every
 * other mesh in this model reaches world space through `v()`, which maps
 * plan (x, y) to world (x, h, y). A pot is a cylinder rather than a box,
 * so it was positioned by hand - and that hand-written line negated z,
 * which is the LEFT-handed mapping the rest of the model was corrected
 * away from. The stacks sit 5.6m south of the origin, so their pots were
 * placed 5.6m NORTH of it: eleven metres adrift, hanging over the
 * garden. It survived the mirror fix because it never went through the
 * function that fix changed. It goes through it now.
 *
 * THE CROWN is the slab the pots sit in. A stack that stops at a flat
 * course with pots balanced on top is not how a chimney is built and it
 * does not read as one; the crown oversails slightly, which is what
 * throws water clear of the brickwork. Whether THIS house still has a
 * sound one is a separate question and an open job - see the
 * chimneys assumption.
 */
export function buildChimney(chimney, defaults, palette) {
  const group = new THREE.Group();
  const base = (defaults.eavesHeight ?? 5) - 1.2;
  const [x1, y1, x2, y2] = chimney.footprint;
  const top = chimney.topHeight;

  const stack = rectBox(chimney.footprint, base, top - base, palette.external);
  if (stack) group.add(stack);

  // The crown: 90mm thick, oversailing 50mm all round.
  const o = 0.05;
  const crown = rectBox([x1 - o, y1 - o, x2 + o, y2 + o], top, 0.09, palette.built);
  if (crown) group.add(crown);

  const pots = chimney.pots ?? 0;
  const long = (x2 - x1) > (y2 - y1);
  for (let i = 0; i < pots; i += 1) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.15, 0.45, 12),
      new THREE.MeshLambertMaterial({ color: palette.pot }),
    );
    const t = pots === 1 ? 0.5 : (i + 0.5) / pots;
    // Seated IN the crown, not balanced on it, so a course of mortar
    // holds the base the way one really would.
    pot.position.copy(v(
      long ? x1 + (x2 - x1) * t : (x1 + x2) / 2,
      top + 0.28,
      long ? (y1 + y2) / 2 : y1 + (y2 - y1) * t,
    ));
    group.add(pot);
  }
  group.userData.kind = 'roof';
  return group;
}

/**
 * The porch: a small gabled canopy over the front door.
 *
 * It was a solid box, because every feature was, and a 2.3m block
 * standing against the front wall is what the owner saw on the phone.
 * A porch is not a block: it is two cheeks and a pitched roof with a
 * way in between them, and the way in is the whole point of it.
 *
 * Its rectangle is the OUTSIDE of the cheeks, so the opening is that
 * less two cheeks - which is the figure worth reporting, because a
 * porch you cannot get a sofa through is a thing to know before
 * delivery day rather than on it.
 */
export function buildPorch(feature, level, palette) {
  const group = new THREE.Group();
  const [x1, y1, x2, y2] = feature.rect;
  const w = x2 - x1;
  const d = y2 - y1;
  if (w <= 0.2 || d <= 0.1) return null;
  const base = level.elevation;
  const cheek = feature.cheekM ?? 0.215;
  const eaves = feature.eavesM ?? Math.min(feature.height ?? 2.05, 2.05);
  const ridge = feature.height ?? (eaves + 0.7);

  // Two cheeks, open between them and open to the front.
  const side = (a, b) => {
    const m = rectBox([a, y1, b, y2], base, eaves, palette.external);
    if (m) group.add(m);
  };
  side(x1, x1 + cheek);
  side(x2 - cheek, x2);

  // A gable facing the road: the ridge runs north to south, out from the
  // house, so the roof sheds to east and west and the apex faces you.
  const o = feature.overhang ?? 0.08;
  const [ax1, ay1, ax2, ay2] = [x1 - o, y1, x2 + o, y2 + o];
  const mid = (ax1 + ax2) / 2;
  // Every height in this function is measured from the floor the porch
  // stands on, so one place adds the level's elevation and nowhere else
  // has to remember to.
  const P = (x, h, y) => [x, base + h, y];
  const tris = [
    ...quad(P(ax1, eaves, ay1), P(mid, ridge, ay1), P(mid, ridge, ay2), P(ax1, eaves, ay2)),
    ...quad(P(ax2, eaves, ay1), P(ax2, eaves, ay2), P(mid, ridge, ay2), P(mid, ridge, ay1)),
  ];
  group.add(faces(tris, palette.roof));

  // The gable end against the house is brick, like the wall it dies
  // into. The one facing the road is a BOARDED tympanum - the
  // photograph shows a painted board with the number on it - so it is
  // drawn in the joinery colour. That is not decoration: in brick on
  // brick the whole canopy disappeared into the wall behind it, which
  // is how a porch that is modelled correctly can still look like
  // nothing at all.
  group.add(faces([
    [P(ax1, eaves, ay1), P(ax2, eaves, ay1), P(mid, ridge, ay1)],
  ], palette.external));
  group.add(faces([
    [P(ax1, eaves, ay2), P(mid, ridge, ay2), P(ax2, eaves, ay2)],
  ], palette.built));

  // A barge along each slope of the front gable, and a fascia across the
  // eaves. Zero-thickness planes seen edge-on show nothing, and from
  // directly in front that is exactly how both slopes are seen - so
  // without these the canopy reads as a pencil line.
  const barge = (a, b) => {
    const m = beam(a, b, 0.07, 0.11, palette.roof);
    if (m) group.add(m);
  };
  barge(P(ax1, eaves, ay2), P(mid, ridge, ay2));
  barge(P(mid, ridge, ay2), P(ax2, eaves, ay2));
  const fascia = rectBox([ax1, ay2 - 0.06, ax2, ay2], base + eaves - 0.11, 0.11, palette.roof);
  if (fascia) group.add(fascia);

  group.userData = { kind: 'feature', label: 'porch' };
  return group;
}

/** A box laid along a sloping segment in the x-h plane, for a barge
 *  board. Not general: it only tilts in the vertical plane, which is
 *  all a gable needs. */
function beam(a, b, t, h, color) {
  const dx = b[0] - a[0];
  const dh = b[1] - a[1];
  const len = Math.hypot(dx, dh);
  if (len < 0.01) return null;
  const mesh = box(len, h, t, color);
  mesh.position.copy(v((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]));
  mesh.rotation.z = Math.atan2(dh, dx);
  return mesh;
}
