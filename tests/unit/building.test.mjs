// Stages and variants. The rule under test throughout is that a fork is
// a COPY and the difference between two of them is COMPUTED, so what a
// change narrative claims and what the geometry does cannot drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  composeBuilding, stageDiff, variantDiff, grossInternalArea,
  newExternalWallPlanLength, newExternalWallLength, wallLength, roofArea, stageArea,
} from '../../assets/js/engine/building.js';

const read = (f) => JSON.parse(readFileSync(`data/buildings/48-ameysford-road/${f}`, 'utf8'));
const property = read('building.json');
const asBought = read('stages/as-bought.json');
const postExt = read('stages/post-extension.json');
const manifest = read('index.json');

// Two storeys of one wall, so the plan-length arithmetic is checkable by eye.
const toyStage = {
  id: 'toy',
  levels: [{ id: 'g', name: 'Ground', elevation: 0, ceilingHeight: 2.4 },
    { id: 'u', name: 'Upper', elevation: 2.7, ceilingHeight: 2.4 }],
  rooms: [{ id: 'r', level: 'g', name: 'Room', rect: [0.1, 0.1, 4, 3] }],
  walls: [
    { id: 'g-n', level: 'g', a: [0, 0], b: [4, 0], kind: 'external', provenance: 'new', thickness: 0.2 },
    { id: 'u-n', level: 'u', a: [0, 0], b: [4, 0], kind: 'external', provenance: 'new', thickness: 0.2 },
  ],
  openings: [],
};

// --- Composing -------------------------------------------------------

test('a composed building is the shape the renderers already take', () => {
  const b = composeBuilding(property, asBought, read('variants/as-bought--empty.json'));
  for (const key of ['grid', 'defaults', 'levels', 'rooms', 'walls', 'openings']) {
    assert.ok(b[key], `a renderer expects ${key}`);
  }
  assert.equal(b.stage.id, 'as-bought');
  assert.equal(b.variant.id, 'as-bought--empty');
  assert.deepEqual(b.furniture, [], 'the empty variant is empty, not absent');
});

test('the stage carries its structure and the variant carries only furniture', () => {
  const b = composeBuilding(property, postExt, read('variants/post-extension--empty.json'));
  assert.equal(b.rooms.length, postExt.rooms.length);
  assert.equal(b.furniture.length, 0);
  assert.equal(composeBuilding(property, postExt, null).variant, null,
    'a stage can be drawn with no variant at all');
});

test('composing nothing is null rather than an empty house', () => {
  assert.equal(composeBuilding(null, asBought, null), null);
  assert.equal(composeBuilding(property, null, null), null);
});

// --- Measuring -------------------------------------------------------

test('gross internal area counts the partitions, which is why it beats the rooms', () => {
  const b = composeBuilding(property, postExt, null);
  assert.ok(grossInternalArea(b, b) > stageArea(b),
    'the figure a drawing prints is measured inside the external walls');
  assert.ok(Math.abs(grossInternalArea(b, b) - 112) < 1,
    'and it lands on the 112 square metres the design study states');
});

test('new outer wall is counted once on plan, not once per storey', () => {
  assert.equal(newExternalWallLength(toyStage), 8, 'both storeys');
  assert.equal(newExternalWallPlanLength(toyStage), 4, 'the line you would trace on the ground');
});

test('a roof is bigger than its footprint, by exactly its pitch', () => {
  const flat = roofArea({ over: [0, 0, 10, 10], pitchDeg: 0 });
  const steep = roofArea({ over: [0, 0, 10, 10], pitchDeg: 45 });
  assert.equal(Math.round(flat), 100);
  assert.equal(Math.round(steep), Math.round(100 * Math.SQRT2));
});

test('wall length is the centreline, in metres', () => {
  assert.equal(wallLength({ a: [0, 0], b: [3, 4] }), 5);
});

// --- The difference between two stages -------------------------------

test('a renamed room is not a new room', () => {
  const d = stageDiff(asBought, postExt);
  assert.equal(d.roomsRemoved.length, 0, 'nothing is lost, it is renamed');
  assert.ok(d.roomsRenamed.some((r) => r.from === 'Lounge' && r.to === 'Living room'));
  assert.deepEqual(d.roomsAdded.map((r) => r.id).sort(),
    ['bed3', 'boot', 'ensuite', 'office', 'wc'],
    'the extension adds exactly the five rooms the design study says it does');
});

test('shortening a wall is reported as shortening, not as demolish and rebuild', () => {
  const from = { id: 'a', walls: [{ id: 'w', level: 'g', a: [0, 1], b: [8, 1], kind: 'external' }], rooms: [], openings: [], roofs: [] };
  const to = { id: 'b', walls: [{ id: 'w2', level: 'g', a: [0, 1], b: [5, 1], kind: 'external' }], rooms: [], openings: [], roofs: [] };
  const d = stageDiff(from, to);
  assert.equal(d.wallsRemoved.length, 0);
  assert.equal(d.wallsAdded.length, 0);
  assert.deepEqual(d.wallsShortened, [{ line: 'g|y|1.000', wasM: 8, isM: 5 }]);
  assert.equal(d.demolitionWallM, 3, 'three metres comes down, not eight');
});

test('the extension is measured, not described', () => {
  const d = stageDiff(asBought, postExt);
  assert.ok(d.areaAddedM2 > 20, 'the infill is worth more than twenty square metres');
  assert.ok(Math.abs(d.newExternalWallPlanM - 12) < 1.5,
    'and about the twelve metres of new outer wall the study states');
  assert.ok(d.newRoofAreaM2 > 70, 'one hipped roof over the whole square');
  assert.equal(d.roomsCreated, 5);
});

test('diffing against nothing is null rather than a diff against an empty house', () => {
  assert.equal(stageDiff(asBought, null), null);
  assert.equal(variantDiff(null, null), null);
});

// --- Variants --------------------------------------------------------

test('a fork records what moved, what arrived and what went', () => {
  const base = { furniture: [
    { id: 'sofa', rect: [0, 0, 2, 0.9] },
    { id: 'table', rect: [3, 0, 4.5, 0.9] },
  ] };
  const fork = { furniture: [
    { id: 'sofa', rect: [0, 2, 2, 2.9] },
    { id: 'lamp', rect: [5, 0, 5.4, 0.4] },
  ] };
  const d = variantDiff(base, fork);
  assert.deepEqual(d.added.map((f) => f.id), ['lamp']);
  assert.deepEqual(d.removed.map((f) => f.id), ['table']);
  assert.deepEqual(d.moved.map((m) => m.item.id), ['sofa']);
  assert.equal(d.unchanged, 0);
});

test('a rotation counts as a move, because it is one', () => {
  const a = { furniture: [{ id: 'bed', rect: [0, 0, 2, 1.5], rotationDeg: 0 }] };
  const b = { furniture: [{ id: 'bed', rect: [0, 0, 2, 1.5], rotationDeg: 90 }] };
  assert.equal(variantDiff(a, b).moved.length, 1);
});

// --- The manifest ----------------------------------------------------

test('every stage and variant in the manifest is really there', () => {
  assert.ok(manifest.stages.length >= 2);
  for (const s of manifest.stages) {
    const stage = read(s.file);
    assert.equal(stage.id, s.id);
    for (const v of s.variants) {
      const variant = read(v.file);
      assert.equal(variant.stage, s.id, `${v.id} belongs to the stage that lists it`);
    }
    assert.ok(s.variants.length, `${s.id} needs at least an empty variant to be drawable`);
  }
  assert.ok(manifest.stages.some((s) => s.id === manifest.defaultStage));
});

test('a derived stage names a parent that exists, and changes something', () => {
  for (const s of manifest.stages.filter((x) => x.derivedFrom)) {
    assert.ok(manifest.stages.some((p) => p.id === s.derivedFrom));
    const d = stageDiff(read(manifest.stages.find((p) => p.id === s.derivedFrom).file), read(s.file));
    assert.ok(d.roomsCreated || d.areaAddedM2, `${s.id} derives from a parent but changes nothing`);
  }
});
