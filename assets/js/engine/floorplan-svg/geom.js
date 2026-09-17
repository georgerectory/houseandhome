// floorplan-svg/geom.js - the arithmetic every layer of the drawing
// needs, in one place so no two layers can disagree about where a wall
// face is.
//
// The whole drawing works in METRES. The viewBox is the building's own
// extent, so an x of 3.5 in the model is an x of 3.5 in the picture and
// there is no scale factor to get wrong anywhere.

import { wallThickness } from '../floorplan.js';

/** Three decimal places is a millimetre, which is finer than anything
 *  here is known to. Trailing zeros go, and -0 becomes 0. */
export const n = (v) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return '0';
  if (Object.is(x, -0)) return '0';
  return x.toFixed(3).replace(/\.?0+$/, '') || '0';
};

export const pts = (list) => list.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');

/** A wall's own axes: along it, and across it. */
export function wallAxes(wall) {
  const dx = wall.b[0] - wall.a[0];
  const dy = wall.b[1] - wall.a[1];
  const len = Math.hypot(dx, dy);
  if (!len) return null;
  return { u: [dx / len, dy / len], m: [-dy / len, dx / len], len };
}

/**
 * A wall as the four corners of a solid, not as a line.
 *
 * The 3D model builds every wall as a box of real thickness. Drawing it
 * on the plan as a stroke would mean two descriptions of one wall, and
 * the whole point of this system is that there is only ever one - so the
 * plan reads the same thickness and draws the same solid.
 *
 * Each end is extended by half the wall's own thickness, which fills the
 * corner square exactly where two walls meet and disappears harmlessly
 * inside the other wall at a T-junction.
 */
export function wallPolygon(wall, building) {
  const ax = wallAxes(wall);
  if (!ax) return null;
  const t = wallThickness(wall, building) / 2;
  const [ux, uy] = ax.u;
  const [mx, my] = ax.m;
  const a = [wall.a[0] - ux * t, wall.a[1] - uy * t];
  const b = [wall.b[0] + ux * t, wall.b[1] + uy * t];
  return [
    [a[0] + mx * t, a[1] + my * t],
    [b[0] + mx * t, b[1] + my * t],
    [b[0] - mx * t, b[1] - my * t],
    [a[0] - mx * t, a[1] - my * t],
  ];
}

/** Where an opening sits on its wall, with the wall's own axes, so a
 *  door leaf and a window frame are set out from one calculation. */
export function openingFrame(opening, building) {
  const wall = (building.walls ?? []).find((w) => w.id === opening.wall);
  if (!wall) return null;
  const ax = wallAxes(wall);
  if (!ax) return null;
  const half = (opening.width ?? 0) / 2;
  const t = wallThickness(wall, building) / 2;
  const centre = [wall.a[0] + ax.u[0] * opening.at, wall.a[1] + ax.u[1] * opening.at];
  const at = (along, across) => [
    centre[0] + ax.u[0] * along + ax.m[0] * across,
    centre[1] + ax.u[1] * along + ax.m[1] * across,
  ];
  return { wall, ...ax, half, t, centre, at, horizontal: Math.abs(ax.u[1]) < 0.001 };
}

/** The largest size at or below `base` that fits `text` across `width`,
 *  leaving a margin so a name never touches the wall. Returned rather
 *  than applied, so the caller decides what to do when it is very
 *  small. */
export const GLYPH_RATIO = 0.55;
export function fitSize(text, width, base) {
  const usable = Math.max(0, width - 0.24);
  const needed = String(text ?? '').length * GLYPH_RATIO * base;
  if (!needed || needed <= usable) return base;
  return Math.max(0.1, (usable / needed) * base);
}
