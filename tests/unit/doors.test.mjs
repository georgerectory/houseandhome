// Where a door is hung, and which way it opens.
//
// The spec records `swing: { hinge, toward }` for every door, measured
// off the drawings. That record is only worth keeping if it survives
// the trip into geometry, and a leaf on the wrong jamb looks entirely
// plausible on screen - it is a door, it is in the opening, it swings.
// So the arithmetic is pinned here, on the real building, where a wrong
// hinge is a failed assertion rather than something to notice one day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(`data/buildings/48-ameysford-road/${f}`, 'utf8'));
const stage = read('stages/post-extension.json');
const wallOf = (id) => stage.walls.find((w) => w.id === id);
const openingOf = (id) => stage.openings.find((o) => o.id === id);

// doors.js imports three.js, which is a browser bundle, so the swing
// rule is re-stated here from the same formula. The shape of the source
// is asserted first, so the two cannot drift apart silently.
const SOURCE = readFileSync('assets/js/engine/model3d/doors.js', 'utf8');

test('doors.js hangs the leaf on the jamb the spec names', () => {
  assert.match(SOURCE, /const t = hinge === 'a' \? at - half : at \+ half;/,
    "hinge 'a' is the wall's low end, 'b' its high end");
  assert.match(SOURCE, /const sign = hinge === 'a' \? 1 : -1;/,
    'the leaf closes back across the opening, so its closed direction flips with the hinge');
});

const OPEN_DEG = 72;
const UNIT = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

function doorSwing(wall, opening) {
  const [ax, ay] = wall.a;
  const [bx, by] = wall.b;
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const nx = -uy;
  const ny = ux;
  const hinge = opening.swing?.hinge ?? 'a';
  const half = opening.width / 2;
  const t = hinge === 'a' ? opening.at - half : opening.at + half;
  const sign = hinge === 'a' ? 1 : -1;
  const toward = UNIT[opening.swing?.toward];
  const side = toward ? (nx * toward[0] + ny * toward[1] >= 0 ? 1 : -1) : 1;
  const leaf = Math.max(0.1, opening.width - 0.03);
  const th = (OPEN_DEG * Math.PI) / 180;
  const dx = sign * ux * Math.cos(th) + side * nx * Math.sin(th);
  const dy = sign * uy * Math.cos(th) + side * ny * Math.sin(th);
  const a = [ax + ux * t, ay + uy * t];
  return { a, b: [a[0] + dx * leaf, a[1] + dy * leaf], leaf };
}

test('a leaf is hung at one jamb of its own opening, not at the wall end', () => {
  for (const o of stage.openings.filter((x) => x.type === 'door' && x.leaf !== 'cased' && x.leaf !== 'double')) {
    const w = wallOf(o.wall);
    const sw = doorSwing(w, o);
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const along = Math.hypot(sw.a[0] - w.a[0], sw.a[1] - w.a[1]);
    const jambs = [o.at - o.width / 2, o.at + o.width / 2];
    assert.ok(jambs.some((j) => Math.abs(along - j) < 0.002),
      `${o.id}: hinge at ${along.toFixed(3)} along, jambs at ${jambs.map((j) => j.toFixed(3))}`);
    assert.ok(along >= -0.002 && along <= len + 0.002, `${o.id}: hinge is off the end of its wall`);
  }
});

test('a leaf standing open is clear of the wall it is hung in', () => {
  // Fully open is perpendicular; fully shut is in the wall plane. At 72
  // degrees the tip has to be well off the wall, or the door is drawn
  // buried in the masonry.
  for (const o of stage.openings.filter((x) => x.type === 'door' && x.leaf !== 'cased' && x.leaf !== 'double')) {
    const w = wallOf(o.wall);
    const sw = doorSwing(w, o);
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const ux = (w.b[0] - w.a[0]) / len;
    const uy = (w.b[1] - w.a[1]) / len;
    const off = Math.abs((sw.b[0] - sw.a[0]) * -uy + (sw.b[1] - sw.a[1]) * ux);
    assert.ok(off > sw.leaf * 0.9, `${o.id}: leaf stands only ${off.toFixed(3)}m off its wall`);
  }
});

test('the en-suite opens off the master bedroom, not off the landing', () => {
  // The owner said so and the study draws it so: ens-w is solid its
  // whole height, and the leaf is in the en-suite's south wall. An
  // en-suite you reach from the landing is just a second bathroom.
  const door = openingOf('f-door-ensuite');
  const wall = wallOf(door.wall);
  assert.equal(wall.line, 'main-n', 'the en-suite door is in the old rear wall');
  assert.ok(door.at > 0, 'and east of the landing');
  const ensW = stage.walls.filter((w) => w.line === 'ens-w');
  const through = stage.openings.filter((o) => ensW.some((w) => w.id === o.wall));
  assert.deepEqual(through, [], 'nothing opens through the en-suite\'s west wall');

  // It has to arrive in the en-suite, so the leaf swings north.
  const ens = stage.rooms.find((r) => r.id === 'ensuite');
  const sw = doorSwing(wall, door);
  assert.ok(sw.b[1] < sw.a[1], 'the leaf swings north, into the shower room');
  assert.ok(sw.a[0] >= ens.rect[0] - 0.005 && sw.a[0] < ens.rect[2],
    'and its jamb lands on the en-suite partition, not behind it');
});

test('bedroom 3 is reached from the landing, not through bedroom 1', () => {
  const door = openingOf('f-door-bed3');
  const wall = wallOf(door.wall);
  assert.equal(wall.line, 'bed3-e', 'the door is in bedroom 3\'s east wall');
  // The landing's west arm is what is on the other side of it.
  const landing = stage.rooms.find((r) => r.id === 'landing');
  const west = landing.rects[0];
  assert.ok(door.at > west[1] - 0.05 && door.at < west[3] + 0.05,
    'the opening falls within the landing\'s west arm');
  // Nothing in the old rear wall opens into bedroom 3 any more.
  const mainN = stage.walls.filter((w) => w.line === 'main-n' && w.level === 'first');
  const bed3 = stage.rooms.find((r) => r.id === 'bed3');
  for (const o of stage.openings.filter((x) => mainN.some((w) => w.id === x.wall))) {
    assert.ok(!(o.at > bed3.rect[0] && o.at < bed3.rect[2]),
      `${o.id} opens in the old rear wall under bedroom 3, which would land in bedroom 1`);
  }
});

test('every door records which way it opens', () => {
  for (const o of stage.openings.filter((x) => x.type === 'door' && x.leaf !== 'cased')) {
    // A PAIR is hung on both jambs by definition, so it names only the
    // direction; the builder gives each leaf its own hinge.
    if (o.leaf !== 'double') {
      assert.ok(o.swing?.hinge === 'a' || o.swing?.hinge === 'b', `${o.id} has no hinge`);
    }
    assert.ok(o.swing?.toward in UNIT, `${o.id} has no direction to open in`);
  }
});
