// model3d/geom.js - the one place plan space and world space meet.
//
// Plan space is metres with y running north to south, and the drawing
// uses the same numbers. World space is three.js's, where y is UP, so
// plan (x, y) maps to world (x, height, -y). That single mapping lives
// in v() below and nowhere else, because two of them would eventually
// disagree and the model would be a mirror image of the plan.

import * as THREE from '../../../vendor/three.module.min.js';

export { THREE };

export const v = (x, h, y) => new THREE.Vector3(x, h, -y);
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function box(w, h, d, color, opts = {}) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({
      color,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
    }),
  );
}

/** A box sitting on a plan rectangle, from `base` up by `height`. The
 *  same rectangle the floor plan draws, so a thing is in one place. */
export function rectBox(rect, base, height, color, opts = {}) {
  const [x1, y1, x2, y2] = rect;
  const w = x2 - x1;
  const d = y2 - y1;
  if (w <= 0.001 || d <= 0.001 || height <= 0.001) return null;
  const mesh = box(w, height, d, color, opts);
  mesh.position.copy(v((x1 + x2) / 2, base + height / 2, (y1 + y2) / 2));
  return mesh;
}

/** A box laid along a plan-space segment: the length of the segment, the
 *  given thickness across it, rotated to match its bearing. */
export function segmentBox(a, b, thickness, base, height, color, opts) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len <= 0.001 || height <= 0.001) return null;
  const mesh = box(len, height, thickness, color, opts);
  mesh.position.copy(v((a[0] + b[0]) / 2, base + height / 2, (a[1] + b[1]) / 2));
  mesh.rotation.y = Math.atan2(dy, dx);
  return mesh;
}

/**
 * A mesh from explicit triangles, for the shapes a box cannot make.
 *
 * Roof slopes are the reason this exists: a hip is a trapezoid and a hip
 * end is a triangle, and neither is a rotated cuboid. Points come in as
 * plan (x, y) plus a height, and go through v() like everything else.
 */
export function faces(triangles, color, opts = {}) {
  const positions = [];
  for (const tri of triangles) {
    for (const [x, h, y] of tri) {
      const p = v(x, h, y);
      positions.push(p.x, p.y, p.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
  }));
}

/** A quad as two triangles, wound so the normal comes out consistent. */
export const quad = (a, b, c, d) => [[a, b, c], [a, c, d]];
