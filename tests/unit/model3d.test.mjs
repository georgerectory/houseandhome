// The 3D model's frame. One property is under test above all others:
// the model is not a mirror image of the plan.
//
// A mirrored building renders perfectly. Nothing throws, no wall is
// missing, the roof still fits. It is only wrong when you stand in
// front of it and find the west rooms on the east - and from the
// opposite side the mirror and the viewpoint cancel out and it looks
// right again. That is exactly how it shipped once. So the handedness
// is asserted here in arithmetic, where it cannot hide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// three.js is a browser bundle, so the mapping is re-stated here rather
// than imported. If these two ever disagree, the first assertion fails.
const SOURCE = readFileSync('assets/js/engine/model3d/geom.js', 'utf8');

test('the mapping in geom.js is the one this file reasons about', () => {
  assert.match(SOURCE, /export const v = \(x, h, y\) => new THREE\.Vector3\(x, h, y\);/,
    'plan (x, y) must map to world (x, h, y): negating y mirrors the house');
  assert.match(SOURCE, /mesh\.rotation\.y = Math\.atan2\(-dy, dx\);/,
    'a wall\'s bearing is negated in y to match, because +Y rotation swings +X toward -Z');
});

// plan (x east, y south) -> world (x, h, y)
const v = (x, h, y) => ({ x, y: h, z: y });
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

test('the frame is right-handed, which is what three.js renders', () => {
  // Unit vectors in world space for the three compass directions.
  const east = v(1, 0, 0);
  const up = { x: 0, y: 1, z: 0 };
  const south = v(0, 0, 1);
  // X cross Y = Z is the definition of a right-handed frame.
  const c = cross(east, up);
  assert.deepEqual(c, south, 'east cross up must be south, or the model is mirrored');
});

/** Where a point lands across the screen, for a camera at `from` looking
 *  at the origin. Negative is to the left of the view, positive right. */
function acrossScreen(point, from) {
  // three.js builds the camera basis as x_axis = normalize(up x z_axis),
  // with z_axis = normalize(position - target).
  const len = Math.hypot(from.x, from.y, from.z);
  const z = { x: from.x / len, y: from.y / len, z: from.z / len };
  const right = cross({ x: 0, y: 1, z: 0 }, z);
  const rl = Math.hypot(right.x, right.y, right.z);
  return (point.x * right.x + point.y * right.y + point.z * right.z) / rl;
}

test('standing on the road, west is on your left and east on your right', () => {
  // The viewpoint the owner described as the right one: the entrance and
  // the stair at the bottom, which is a camera to the SOUTH.
  const road = v(0, 6, 12);
  assert.ok(acrossScreen(v(-4, 1, 0), road) < 0, 'a point to the west reads left');
  assert.ok(acrossScreen(v(4, 1, 0), road) > 0, 'a point to the east reads right');
  assert.ok(acrossScreen(v(0, 1, -4), road) < 1e-9, 'a point due north is neither');
});

test('the real house puts the boot room on the left from the road', () => {
  const read = (f) => JSON.parse(readFileSync(`data/buildings/48-ameysford-road/${f}`, 'utf8'));
  const stage = read('stages/post-extension.json');
  const ground = stage.rooms.filter((r) => r.level === 'ground');
  const at = (id) => {
    const r = ground.find((q) => q.id === id);
    assert.ok(r, `no room ${id}`);
    const [x1, y1, x2, y2] = r.rect;
    // World space, with the building centred the way the model centres it.
    return v((x1 + x2) / 2 - 4.10, 1, (y1 + y2) / 2 - 3.86);
  };
  const road = v(0, 8, 16);
  const boot = acrossScreen(at('boot'), road);
  const living = acrossScreen(at('living'), road);
  assert.ok(boot < 0, `the boot room must read LEFT from the road, got ${boot.toFixed(2)}`);
  assert.ok(living > 0, `the living room must read RIGHT from the road, got ${living.toFixed(2)}`);
  assert.ok(acrossScreen(at('wc'), road) < boot, 'and the WC is further left still');
});

test('a wall laid along a bearing keeps its bearing in world space', () => {
  // segmentBox rotates a box about +Y. A rotation of t takes the box's
  // long axis +X to (cos t, 0, -sin t); the wall must end up pointing
  // along (dx, 0, dy), so t = atan2(-dy, dx).
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 2], [3, -1]]) {
    const t = Math.atan2(-dy, dx);
    const axis = { x: Math.cos(t), y: 0, z: -Math.sin(t) };
    const len = Math.hypot(dx, dy);
    assert.ok(Math.abs(axis.x - dx / len) < 1e-12 && Math.abs(axis.z - dy / len) < 1e-12,
      `a wall running (${dx}, ${dy}) in plan must run the same way in world space`);
  }
});
