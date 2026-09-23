// What a thing is shaped like, and which way round it is.
//
// The orientation assertions are the important ones. A left-handed frame
// shipped once already (see model3d.test.mjs) and it did not fail
// loudly - it rendered a perfect mirror. A sofa whose back is on the
// wrong side is the same class of bug at furniture scale: it looks like
// furniture, so nothing catches it but arithmetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partsOf, frame, HEIGHT, SHAPED_KINDS } from '../../assets/js/engine/model3d/furniture-parts.js';

const within = (part, rect) =>
  part.rect[0] >= rect[0] - 1e-9 && part.rect[1] >= rect[1] - 1e-9
  && part.rect[2] <= rect[2] + 1e-9 && part.rect[3] <= rect[3] + 1e-9;

test('the back of a thing is at the back, whichever way it faces', () => {
  // Plan space runs y NORTH TO SOUTH, so facing north looks toward LOW y
  // and the back band lands at HIGH y. Negating that is how a house gets
  // rendered as its own mirror image.
  const rect = [0, 0, 1, 1];
  const at = (f) => frame(rect, f)(0, 0.8, 1, 1).map((n) => Number(n.toFixed(6)));
  assert.deepEqual(at('n'), [0, 0.8, 1, 1]);
  assert.deepEqual(at('s'), [0, 0, 1, 0.2]);
  assert.deepEqual(at('w'), [0.8, 0, 1, 1]);
  assert.deepEqual(at('e'), [0, 0, 0.2, 1]);
});

test('a sofa has a seat you could sit on and a back above it', () => {
  const parts = partsOf({ kind: 'sofa', rect: [0, 0, 2, 0.9], facing: 'n' });
  const seat = Math.min(...parts.map((p) => p.z1));
  const back = Math.max(...parts.map((p) => p.z1));
  assert.ok(seat < 0.5, `a seat at ${seat} is a plinth, not a seat`);
  assert.equal(back, 0.82);
  // The back is at high y for a north-facing sofa, and the seat is not.
  const tallest = parts.find((p) => p.z1 === back);
  assert.ok(tallest.rect[1] > 0.5, 'the back should sit at the back');
});

test('a WC is a pan with a cistern behind it, not a cube', () => {
  const parts = partsOf({ kind: 'wc', rect: [0, 0, 0.4, 0.7], facing: 'n' });
  const cistern = parts.find((p) => p.z1 > 0.6);
  const pan = parts.find((p) => p.z1 <= 0.45);
  assert.ok(cistern && pan, 'a WC needs both');
  // Facing north: the front is low y, so the cistern is behind the pan.
  assert.ok(cistern.rect[1] >= pan.rect[3] - 1e-9,
    'the cistern belongs behind the pan, which is why a real one is 0.68 deep');
});

test('no part ever escapes the rectangle the floor plan draws', () => {
  // This is the 1:1 guarantee. If a sofa arm stuck out past its own
  // rect, the clearance the plan measures would not be the clearance you
  // can walk through, and the two views would be quietly lying.
  for (const kind of SHAPED_KINDS) {
    for (const facing of ['n', 's', 'e', 'w']) {
      const rect = [1, 2, 2.6, 3.1];
      for (const part of partsOf({ kind, rect, facing })) {
        assert.ok(within(part, rect), `${kind} facing ${facing} escapes its rect`);
        assert.ok(part.z1 > part.z0, `${kind} has a part with no height`);
      }
    }
  }
});

test('an unknown kind still renders, as the one box it always was', () => {
  // A missing sofa is a worse bug than a boxy one.
  const parts = partsOf({ kind: 'harpsichord', rect: [0, 0, 1, 2] });
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].rect, [0, 0, 1, 2]);
  assert.equal(parts[0].z1, HEIGHT.default);
});

test('an item carries its own height over the fallback', () => {
  const tall = partsOf({ kind: 'wardrobe', rect: [0, 0, 1, 0.6], height: 2.4 });
  assert.equal(Math.max(...tall.map((p) => p.z1)), 2.4);
});

test('every shaped kind makes more than one box', () => {
  // The whole point: if a kind still returns a single box it has not
  // actually been given a shape.
  for (const kind of SHAPED_KINDS) {
    const n = partsOf({ kind, rect: [0, 0, 1.6, 0.8] }).length;
    assert.ok(n > 1, `${kind} is still one block (${n} part)`);
  }
});
