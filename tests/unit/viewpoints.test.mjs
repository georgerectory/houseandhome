// "Front" stands on the street side. A fixed bearing put Forest View's
// Front camera in its back garden: a picture of a house, wrongly
// labelled, which nobody would notice from the picture alone. So the
// bearing is derived from the building, and pinned here for both
// buildings against the street each one names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { viewpointsFor, frontBearing, standOffset } from '../../assets/js/engine/viewpoints.js';

const read = (id) => JSON.parse(readFileSync(`data/buildings/${id}/building.json`, 'utf8'));
const by = (b, id) => viewpointsFor(b).find((v) => v.id === id);

test('every building declares which way its front faces', () => {
  for (const id of ['48-ameysford-road', 'forest-view']) {
    assert.ok(read(id).orientation?.frontFaces, `${id} has no orientation.frontFaces`);
  }
});

test('Forest View: the front camera stands north, on Tiptoe Road', () => {
  const b = read('forest-view');
  assert.equal(b.orientation.street, 'Tiptoe Road');
  assert.equal(by(b, 'front').bearing, 0);
  assert.equal(by(b, 'back').bearing, 180);
  // North is -y in plan space: the camera is on the road side of the house.
  assert.ok(standOffset(by(b, 'front').bearing).y < 0);
});

test('48 Ameysford Road: the front camera still stands south, as before', () => {
  const b = read('48-ameysford-road');
  assert.equal(by(b, 'front').bearing, 180);
  assert.equal(by(b, 'back').bearing, 0);
});

test('a building that says nothing renders exactly as the old fixed list', () => {
  assert.equal(frontBearing(null), 180);
});

test('four bird\'s-eye corners and a top-down view, all looking down', () => {
  const vs = viewpointsFor(read('forest-view'));
  const corners = vs.filter((v) => v.birdsEye).map((v) => v.id).sort();
  assert.deepEqual(corners, ['ne', 'nw', 'se', 'sw']);
  for (const v of vs.filter((x) => x.birdsEye)) {
    const o = standOffset(v.bearing);
    assert.ok(Math.abs(o.x) > 0.5 && Math.abs(o.y) > 0.5, `${v.id} is not a corner`);
  }
  const top = vs.find((v) => v.id === 'top');
  assert.ok(top.tilt > 1.4 && top.tilt < Math.PI / 2);
  assert.equal(new Set(vs.map((v) => v.id)).size, vs.length, 'viewpoint ids repeat');
});
