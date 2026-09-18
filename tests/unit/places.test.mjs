// Where the walkthrough can put you. These are the tests that would have
// caught "I can only see one floor and I cannot get outside": every
// storey has to be reachable by name, and so does the ground outside.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { destinations, resolvePlace, spawnPlace } from '../../assets/js/core/planner/places.js';
import { composeBuilding } from '../../assets/js/engine/building.js';

const read = (f) => JSON.parse(readFileSync(`data/buildings/48-ameysford-road/${f}`, 'utf8'));
const property = read('building.json');
const stage = (id) => composeBuilding(property, read(`stages/${id}.json`), read(`variants/${id}--empty.json`));
const STAGES = [['as-bought', stage('as-bought')], ['post-extension', stage('post-extension')]];

test('both stages offer outside and every storey', () => {
  for (const [name, b] of STAGES) {
    const places = destinations(b);
    const groups = [...new Set(places.map((p) => p.group))];
    assert.ok(groups.includes('Outside'), `${name}: you cannot get outside`);
    for (const level of b.levels) {
      assert.ok(groups.includes(level.name), `${name}: ${level.name} is unreachable`);
    }
    assert.ok(places.length >= 8, `${name}: only ${places.length} places`);
  }
});

test('every offered place actually resolves', () => {
  for (const [name, b] of STAGES) {
    for (const d of destinations(b)) {
      const at = resolvePlace(b, d.id);
      assert.ok(at, `${name}: "${d.name}" is offered but goes nowhere`);
      assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y), `${name}: ${d.name} has no position`);
      assert.ok(b.levels.some((l) => l.id === at.level), `${name}: ${d.name} is on no floor`);
    }
  }
});

test('an upstairs room stands you on the upper floor, not the ground', () => {
  for (const [name, b] of STAGES) {
    const first = b.levels[1];
    const up = destinations(b).find((d) => d.group === first.name);
    const at = resolvePlace(b, up.id);
    assert.equal(at.level, first.id, `${name}: ${up.name} put you on the wrong floor`);
    assert.equal(at.elevation, first.elevation);
    assert.ok(at.elevation > 0, `${name}: the first floor is at ground level`);
  }
});

test('outside is outside, on all four sides, and faces the house', () => {
  const b = STAGES[1][1];
  const w = b.envelope.widthM;
  const d = b.envelope.depthM;
  const front = resolvePlace(b, 'outside:front');
  assert.ok(front.y > d, 'the road is south of the south wall');
  assert.equal(front.yaw, 0, 'and you face north, at the house');
  const garden = resolvePlace(b, 'outside:garden');
  assert.ok(garden.y < 0, 'the garden is north of the north wall');
  const west = resolvePlace(b, 'outside:west');
  assert.ok(west.x < 0, 'west is west of the west wall');
  const east = resolvePlace(b, 'outside:east');
  assert.ok(east.x > w, 'east is east of the east wall');
  for (const p of [front, garden, west, east]) {
    assert.equal(p.elevation, 0, 'and all of them are on the ground');
    assert.ok(p.pitch > 0, 'looking slightly up, because the ridge is 7.7m');
  }
});

test('an id nobody offers goes nowhere rather than somewhere wrong', () => {
  const b = STAGES[1][1];
  assert.equal(resolvePlace(b, 'outside:upwards'), null);
  assert.equal(resolvePlace(b, 'room:ballroom'), null);
  assert.equal(resolvePlace(b, ''), null);
  assert.equal(resolvePlace(b, null), null);
});

test('the walkthrough starts inside the front door, facing in', () => {
  for (const [name, b] of STAGES) {
    const at = spawnPlace(b);
    const door = b.openings.find((o) => o.id === 'g-door-front');
    assert.ok(door, `${name}: no front door`);
    assert.equal(at.level, b.levels[0].id);
    assert.equal(at.yaw, 0, 'facing north, into the house');
    assert.ok(at.y < b.envelope.depthM - 0.5, `${name}: spawned outside the front wall`);
    assert.ok(at.y > 5, `${name}: spawned too far in`);
  }
});
