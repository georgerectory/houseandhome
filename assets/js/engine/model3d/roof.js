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

import { faces, quad, rectBox, THREE } from './geom.js';

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

/** A stack, from inside the roof to its pots. */
export function buildChimney(chimney, defaults, palette) {
  const group = new THREE.Group();
  const base = (defaults.eavesHeight ?? 5) - 1.2;
  const stack = rectBox(chimney.footprint, base, chimney.topHeight - base, palette.external);
  if (stack) group.add(stack);
  const [x1, y1, x2, y2] = chimney.footprint;
  const pots = chimney.pots ?? 0;
  for (let i = 0; i < pots; i += 1) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.15, 0.45, 12),
      new THREE.MeshLambertMaterial({ color: palette.pot }),
    );
    const t = pots === 1 ? 0.5 : (i + 0.5) / pots;
    const long = (x2 - x1) > (y2 - y1);
    pot.position.set(
      long ? x1 + (x2 - x1) * t : (x1 + x2) / 2,
      chimney.topHeight + 0.22,
      -(long ? (y1 + y2) / 2 : y1 + (y2 - y1) * t),
    );
    group.add(pot);
  }
  group.userData.kind = 'roof';
  return group;
}
