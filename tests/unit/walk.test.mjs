// Walking through the model. The rules under test are the two that make
// a walkthrough usable rather than infuriating: you cannot walk through
// a wall, and you CAN walk through a door.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveCollision, climbAt, stepFrom, headingName, headingDeg,
  EYE_HEIGHT, BODY_RADIUS,
} from '../../assets/js/engine/walk.js';

// A wall along y = 3, running west to east from x 0 to 8, 0.2 thick,
// with a 0.8m doorway centred 4m along it.
const wall = {
  id: 'w', level: 'ground',
  minX: -0.1, maxX: 8.1, minY: 2.9, maxY: 3.1,
  origin: [0, 3],
  doorways: [{ start: 3.6, end: 4.4 }],
};

test('a wall stops you, and stops you on the side you came from', () => {
  // Walking north into the wall from the south.
  const [, y] = resolveCollision([wall], 'ground', 1.0, 3.0);
  assert.ok(y <= 2.9 - BODY_RADIUS + 1e-9 || y >= 3.1 + BODY_RADIUS - 1e-9,
    'the walker ends up outside the wall, not inside it');
});

test('a doorway lets you through', () => {
  const [x, y] = resolveCollision([wall], 'ground', 4.0, 3.0);
  assert.equal(x, 4.0);
  assert.equal(y, 3.0, 'standing in the doorway is allowed');
});

test('the jambs of a doorway are still wall', () => {
  // 3.62 is inside the opening but within the jamb inset.
  const [, y] = resolveCollision([wall], 'ground', 3.62, 3.0);
  assert.notEqual(y, 3.0, 'a shoulder does not clip the reveal');
});

test('a wall on another floor is not in your way', () => {
  const [x, y] = resolveCollision([wall], 'first', 1.0, 3.0);
  assert.deepEqual([x, y], [1.0, 3.0]);
});

test('open floor leaves you exactly where you asked to be', () => {
  assert.deepEqual(resolveCollision([wall], 'ground', 1.0, 6.0), [1.0, 6.0]);
});

// A flight running north (decreasing y), from y 6.86 up to y 4.28.
const climb = {
  x0: 3.69, x1: 4.46, y0: 4.28, y1: 6.86,
  axis: 'y', topAtLow: true,
  bottom: 0, top: 2.70, fromLevel: 'ground', toLevel: 'first',
};

test('the stair carries you up, and the floor you are on follows your feet', () => {
  assert.equal(climbAt([climb], 4.0, 6.86).height, 0, 'the bottom riser is at floor level');
  assert.equal(climbAt([climb], 4.0, 6.86).level, 'ground');
  const top = climbAt([climb], 4.0, 4.28);
  assert.equal(Math.round(top.height * 100) / 100, 2.70, 'the top riser reaches the floor above');
  assert.equal(top.level, 'first');
  const half = climbAt([climb], 4.0, 5.57);
  assert.ok(half.height > 1.2 && half.height < 1.5, 'and it is a ramp in between');
});

test('standing beside the flight is not standing on it', () => {
  assert.equal(climbAt([climb], 3.0, 5.5), null, 'a doorway next to the stair does not send you up');
  assert.equal(climbAt([climb], 4.0, 7.2), null, 'nor does the hall past the bottom of it');
});

test('yaw zero looks north, and a step goes the way you are looking', () => {
  assert.equal(headingName(0), 'north');
  assert.equal(headingName(Math.PI / 2), 'east');
  assert.equal(Math.round(headingDeg(Math.PI)), 180);
  const [dx, dy] = stepFrom(0, 1, 0, 1);
  assert.ok(Math.abs(dx) < 1e-9 && Math.abs(dy + 1) < 1e-9, 'north is a decrease in plan y');
  const [ex, ey] = stepFrom(Math.PI / 2, 1, 0, 1);
  assert.ok(Math.abs(ex - 1) < 1e-9 && Math.abs(ey) < 1e-9, 'east is an increase in plan x');
});

test('walking diagonally is not faster than walking straight', () => {
  const straight = stepFrom(0, 1, 0, 1);
  const diagonal = stepFrom(0, 1, 1, 1);
  assert.ok(Math.abs(Math.hypot(...straight) - Math.hypot(...diagonal)) < 1e-9);
});

test('a standing walker does not drift', () => {
  assert.deepEqual(stepFrom(0.7, 0, 0, 1), [0, 0]);
});

test('you can get from the front door to the kitchen of the real house', () => {
  // The one route the drawings make awkward, walked as a straight line
  // of 5cm steps: in the front door, through the living room, into the
  // kitchen-diner. If the colliders are wrong this walks into a wall.
  const read = (f) => JSON.parse(readFileSync(`data/buildings/48-ameysford-road/${f}`, 'utf8'));
  const stage = read('stages/post-extension.json');
  const colliders = [];
  for (const w of stage.walls.filter((q) => q.level === 'ground')) {
    const t = w.thickness ?? 0.13;
    colliders.push({
      id: w.id, level: w.level, origin: w.a,
      minX: Math.min(w.a[0], w.b[0]) - t / 2, maxX: Math.max(w.a[0], w.b[0]) + t / 2,
      minY: Math.min(w.a[1], w.b[1]) - t / 2, maxY: Math.max(w.a[1], w.b[1]) + t / 2,
      doorways: stage.openings
        .filter((o) => o.wall === w.id && o.type !== 'window')
        .map((o) => ({ start: o.at - o.width / 2, end: o.at + o.width / 2 })),
    });
  }
  // Hall, just inside the front door.
  let [x, y] = [4.06, 7.2];
  const walkTo = (tx, ty) => {
    for (let i = 0; i < 400; i += 1) {
      const dx = tx - x;
      const dy = ty - y;
      const d = Math.hypot(dx, dy);
      if (d < 0.08) return true;
      const step = Math.min(0.05, d);
      [x, y] = resolveCollision(colliders, 'ground', x + (dx / d) * step, y + (dy / d) * step);
    }
    return false;
  };
  assert.ok(walkTo(6.3, 7.0), 'through the hall door into the living room');
  assert.ok(walkTo(6.52, 3.9), 'across the living room to its door into the kitchen-diner');
  assert.ok(walkTo(6.52, 3.0), 'and through it');
  assert.ok(y < 3.4, `ends up in the kitchen-diner, got y ${y.toFixed(2)}`);
});

test('the walker is a sensible size', () => {
  assert.ok(EYE_HEIGHT > 1.4 && EYE_HEIGHT < 1.8);
  assert.ok(BODY_RADIUS > 0.15 && BODY_RADIUS < 0.4);
});
