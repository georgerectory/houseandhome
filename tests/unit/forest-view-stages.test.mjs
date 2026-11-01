// The design stages say what they do in words; these hold the geometry
// to the words. A narrative that says "removes the partition" over a
// geometry that keeps it, or an en-suite stage that quietly builds new
// outer wall, is the drift the fork-and-diff model exists to catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stageDiff } from '../../assets/js/engine/building.js';
import { roomArea } from '../../assets/js/engine/floorplan.js';

const stage = (id) => JSON.parse(readFileSync(`data/buildings/forest-view/stages/${id}.json`, 'utf8'));
const s0 = stage('as-bought');
const s1 = stage('ground-floor-open');
const s2a = stage('ensuite-within');
const s2b = stage('rear-two-storey');
const room = (s, id) => s.rooms.find((r) => r.id === id);

test('S1 removes the kitchen | dining partition and nothing else structural', () => {
  const d = stageDiff(s0, s1);
  assert.deepEqual(d.wallsRemoved.map((w) => w.line), ['kit-e']);
  assert.ok(Math.abs(roomArea(room(s1, 'kitchen-diner')) - 25.5) < 0.3, 'kitchen-diner is not about 25.5 m2');
  assert.ok(!room(s1, 'dining'), 'the dining room survived the knock-through');
});

test('S1 rebuilds the rear range as boot room, WC and utility on its own footprint', () => {
  const d = stageDiff(s0, s1);
  assert.deepEqual(d.roomsAdded.map((r) => r.id), ['utility']);
  for (const id of ['boot', 'wc', 'utility']) assert.ok(room(s1, id), id);
  const wc = room(s1, 'wc').rect;
  assert.ok(wc[2] - wc[0] >= 0.9 && wc[3] - wc[1] >= 1.5, 'the WC is under 0.9 x 1.5m clear');
  assert.ok(Math.abs(d.areaAddedM2) < 0.2, 'S1 claims no new floor area');
});

test('S2a builds no outer wall and leaves bedroom 4 reachable but small', () => {
  const d = stageDiff(s1, s2a);
  assert.equal(d.newExternalWallPlanM, 0, 'S2a is meant to be inside the footprint');
  const ens = room(s2a, 'ensuite').rect;
  assert.ok(ens[2] - ens[0] >= 2.0 && ens[3] - ens[1] >= 1.2, 'en-suite under 2.0 x 1.2m clear');
  // Reported in the stage's assumptions, not enlarged: under 6.5 m2.
  assert.ok(roomArea(room(s2a, 'bed4')) < 6.5);
  assert.ok(s2a.assumptions.some((a) => a.id === 's2a-size'));
  assert.ok(s2a.openings.some((o) => o.id === 'f-door-bed4'), 'bedroom 4 lost its landing door');
});

test('S2b adds a first-floor room over the store, counted for DP36', () => {
  const d = stageDiff(s1, s2b);
  assert.deepEqual(d.roomsAdded.map((r) => r.id), ['ensuite3']);
  assert.ok(d.areaAddedM2 > 5 && d.areaAddedM2 < 7);
  assert.ok(d.newExternalWallPlanM > 0);
  assert.ok(s2b.assumptions.some((a) => a.id === 's2b-planning'));
});

test('a child stage never re-prices its parent\'s new walls', () => {
  // S1's rebuilt rear range is EXISTING from S2a's and S2b's point of view.
  const inherited = (s) => s.walls.filter((w) => w.level === 'ground' && w.provenance === 'new');
  assert.equal(inherited(s2a).length, 0);
  assert.equal(inherited(s2b).length, 0);
});
