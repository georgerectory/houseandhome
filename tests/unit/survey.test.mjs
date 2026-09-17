// The survey. The rule under test throughout is that a disagreement
// between a drawing and the model is REPORTED, never absorbed: an audit
// that quietly rounds a 280mm residual away is worse than no audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeBuilding } from '../../assets/js/engine/building.js';
import {
  auditDimensions, auditSummary, auditAreas, auditIntegrity, integritySummary,
  clearanceReport, swingRect, elevationSvg, SIDES,
} from '../../assets/js/engine/survey.js';

const read = (f) => JSON.parse(readFileSync(`data/buildings/48-ameysford-road/${f}`, 'utf8'));
const property = read('building.json');
const stage = (id) => composeBuilding(property, read(`stages/${id}.json`), read(`variants/${id}--empty.json`));
const asBought = stage('as-bought');
const postExt = stage('post-extension');

// A two-room box with one door, so every number below can be checked on
// the back of an envelope.
const toy = {
  id: 'toy',
  envelope: { widthM: 6, depthM: 4 },
  defaults: { wallExternal: 0.2, wallInternal: 0.1, doorHeight: 2, windowHead: 2, windowSill: 0.9, eavesHeight: 5 },
  statedDimensions: [{ of: 'room:toy/a', kind: 'clearSize', value: [2.8, 3.6], source: 'test' }],
  stage: { id: 'toy' },
  levels: [{ id: 'g', name: 'Ground', code: 'G', elevation: 0, ceilingHeight: 2.4 }],
  rooms: [
    { id: 'a', level: 'g', name: 'A', roomType: 'living', rect: [0.2, 0.2, 3.0, 3.8] },
    { id: 'b', level: 'g', name: 'B', roomType: 'living', rect: [3.1, 0.2, 5.8, 3.8] },
  ],
  walls: [
    { id: 'n', level: 'g', a: [0.1, 0.1], b: [5.9, 0.1], kind: 'external', thickness: 0.2 },
    { id: 's', level: 'g', a: [0.1, 3.9], b: [5.9, 3.9], kind: 'external', thickness: 0.2 },
    { id: 'w', level: 'g', a: [0.1, 0.1], b: [0.1, 3.9], kind: 'external', thickness: 0.2 },
    { id: 'e', level: 'g', a: [5.9, 0.1], b: [5.9, 3.9], kind: 'external', thickness: 0.2 },
    { id: 'mid', level: 'g', a: [3.05, 0.1], b: [3.05, 3.9], kind: 'internal', thickness: 0.1 },
  ],
  openings: [
    { id: 'd', wall: 'mid', type: 'door', at: 2.0, width: 0.8, leaf: 'single', swing: { hinge: 'a', into: 'in' } },
    { id: 'front', wall: 's', type: 'door', at: 1.4, width: 0.9, leaf: 'single' },
    { id: 'back', wall: 'n', type: 'door', at: 4.4, width: 0.9, leaf: 'single' },
  ],
  stairs: [], roofs: [], chimneys: [], features: [], furniture: [], assumptions: [],
};

// --- Stated against modelled -----------------------------------------

test('a figure the model matches exactly reads as exact', () => {
  const [row] = auditDimensions(toy);
  assert.equal(row.status, 'ok');
  assert.equal(row.deltaLabel, '0 mm');
  assert.equal(row.source, 'test');
});

test('a residual inside the source\'s own precision is tolerable, not hidden', () => {
  const b = { ...toy, statedDimensions: [{ of: 'room:toy/a', kind: 'clearSize', value: [2.83, 3.6], source: 'test' }] };
  const [row] = auditDimensions(b);
  assert.equal(row.status, 'tolerable');
  assert.equal(row.deltaLabel, '30 mm');
  assert.deepEqual(row.stated, [2.83, 3.6], 'the stated figure survives the disagreement');
  assert.deepEqual(row.modelled, [2.8, 3.6], 'and so does the modelled one');
});

test('a residual beyond it is a check, and nothing rounds it away', () => {
  const b = { ...toy, statedDimensions: [{ of: 'room:toy/a', kind: 'clearSize', value: [3.2, 3.6], source: 'test' }] };
  assert.equal(auditDimensions(b)[0].status, 'check');
});

test('an entry about another stage is not answered by this one', () => {
  const b = { ...toy, statedDimensions: [{ of: 'room:other/a', kind: 'clearSize', value: [1, 1], source: 'test' }] };
  assert.deepEqual(auditDimensions(b), []);
});

test('a stated figure about a room that is gone says so rather than passing', () => {
  const b = { ...toy, statedDimensions: [{ of: 'room:toy/nope', kind: 'clearSize', value: [1, 1], source: 'test' }] };
  assert.equal(auditDimensions(b)[0].status, 'missing');
});

test('an area is judged in square metres and a length in millimetres', () => {
  const b = {
    ...toy,
    statedDimensions: [
      { of: 'room:toy/a', kind: 'areaM2', value: 10.5, source: 'test' },
      { of: 'stage:toy', kind: 'envelopeWidthM', value: 6.02, source: 'test' },
    ],
  };
  const [area, width] = auditDimensions(b);
  assert.match(area.deltaLabel, /m2$/);
  assert.match(width.deltaLabel, /mm$/);
});

test('the real building agrees with every drawing it was measured from', () => {
  for (const b of [asBought, postExt]) {
    const s = auditSummary(auditDimensions(b));
    assert.equal(s.check, 0, `${b.stage.id} disagrees with a source beyond its stated precision`);
    assert.equal(s.missing, 0);
    assert.ok(s.total >= 5, 'and there is enough stated to be worth checking');
  }
});

test('the 280mm the sources disagree by is on the page, not smoothed over', () => {
  const row = auditDimensions(postExt).find((r) => r.kind === 'envelopeDepthM');
  assert.equal(row.stated, 8);
  assert.equal(row.modelled, 7.72);
  assert.equal(row.deltaLabel, '280 mm');
  assert.ok(row.note, 'and it says why the model took the other reading');
});

test('floor area is reported three ways because it is three numbers', () => {
  const a = auditAreas(postExt);
  assert.ok(a.grossInternalM2 > a.roomsM2, 'gross counts the partitions');
  assert.equal(a.grossInternalSqFt, Math.round(a.grossInternalM2 * 10.7639));
  assert.equal(a.levels.length, 2);
});

// --- Is it a building ------------------------------------------------

test('both stages of the real building are buildings', () => {
  for (const b of [asBought, postExt]) {
    const errors = auditIntegrity(b).filter((f) => f.severity === 'error');
    assert.deepEqual(errors, [], `${b.stage.id}: ${errors.map((e) => e.message).join('; ')}`);
  }
});

test('two rooms cannot claim one floor', () => {
  const b = { ...toy, rooms: [toy.rooms[0], { ...toy.rooms[1], rect: [2.0, 0.2, 5.8, 3.8] }] };
  assert.ok(auditIntegrity(b).some((f) => f.id === 'room-overlap' && f.severity === 'error'));
});

test('a door that runs off the end of its wall is an error, not a rounding', () => {
  const b = { ...toy, openings: [{ ...toy.openings[0], at: 0.1 }] };
  assert.ok(auditIntegrity(b).some((f) => f.id === 'opening-off-wall'));
});

test('a wall with a free end means the shell does not close', () => {
  const b = { ...toy, walls: [...toy.walls, { id: 'x', level: 'g', a: [1, 1], b: [2, 1], kind: 'internal', thickness: 0.1 }] };
  assert.ok(auditIntegrity(b).some((f) => f.id === 'shell-open'));
});

test('a room nobody can get into is flagged rather than drawn as if fine', () => {
  const b = { ...toy, openings: [toy.openings[1]] };
  const f = auditIntegrity(b);
  assert.ok(f.some((x) => x.id === 'room-unreachable' && x.severity === 'warning'));
});

test('the summary counts errors and warnings apart', () => {
  const s = integritySummary([{ severity: 'error' }, { severity: 'warning' }, { severity: 'warning' }]);
  assert.deepEqual(s, { errors: 1, warnings: 2, total: 3 });
});

// --- Room to move ----------------------------------------------------

test('a door sweeps a rectangle, and a sliding one sweeps nothing', () => {
  assert.ok(swingRect(toy.openings[0], toy));
  assert.equal(swingRect({ ...toy.openings[0], leaf: 'sliding' }, toy), null);
  assert.equal(swingRect({ ...toy.openings[0], type: 'window' }, toy), null);
});

test('an empty room is measured by the biggest circle that fits in it', () => {
  const [a] = clearanceReport(toy, 'g');
  assert.equal(a.name, 'A');
  assert.ok(a.widestCircleM > 2.5 && a.widestCircleM <= 2.8);
  assert.equal(a.status, 'ok');
});

test('furniture takes the floor it stands on', () => {
  const b = { ...toy, furniture: [{ id: 'f', level: 'g', room: 'a', name: 'Sofa', rect: [0.3, 0.3, 2.9, 2.0], height: 0.9 }] };
  const [a] = clearanceReport(b, 'g');
  assert.ok(a.freeAreaM2 < clearanceReport(toy, 'g')[0].freeAreaM2);
  assert.equal(a.furniture, 1);
});

test('a room you cannot cross says so', () => {
  // A door at each end and a run of units straight across between them.
  const b = {
    ...toy,
    openings: [
      { id: 'front', wall: 's', type: 'door', at: 1.4, width: 0.9, leaf: 'single' },
      { id: 'side', wall: 'w', type: 'door', at: 0.9, width: 0.9, leaf: 'single' },
    ],
    furniture: [{ id: 'units', level: 'g', room: 'a', name: 'Units', rect: [0.2, 1.6, 3.0, 2.4], height: 0.9 }],
  };
  const a = clearanceReport(b, 'g').find((r) => r.room === 'a');
  assert.equal(a.status, 'blocked', 'the units run wall to wall and nothing gets past them');
  assert.equal(a.routeWidthM, 0);
});

test('a door opening onto a wardrobe is a clash, and it is named', () => {
  const b = {
    ...toy,
    furniture: [{ id: 'w', level: 'g', room: 'b', name: 'Wardrobe', rect: [3.2, 1.4, 3.8, 2.0], height: 2, fixed: true }],
  };
  const room = clearanceReport(b, 'g').find((r) => r.room === 'b');
  assert.ok(room.clashes.some((c) => c.kind === 'swing' && /Wardrobe/.test(c.message)));
});

test('a stated clearance another thing stands in is a clash too', () => {
  const b = {
    ...toy,
    furniture: [
      { id: 'u', level: 'g', room: 'a', name: 'Worktop', rect: [0.2, 0.2, 3.0, 0.8], height: 0.9, facing: 's', clearance: { front: 1.0 } },
      { id: 'i', level: 'g', room: 'a', name: 'Island', rect: [0.4, 1.2, 2.4, 2.0], height: 0.9 },
    ],
  };
  const room = clearanceReport(b, 'g').find((r) => r.room === 'a');
  assert.ok(room.clashes.some((c) => c.kind === 'clearance' && /Island/.test(c.message)));
});

test('every room in the real house can be crossed', () => {
  for (const b of [asBought, postExt]) {
    for (const level of b.levels) {
      for (const room of clearanceReport(b, level.id)) {
        assert.notEqual(room.status, 'blocked', `${b.stage.id}: ${room.name} cannot be crossed`);
        assert.deepEqual(room.clashes, [], `${b.stage.id}: ${room.name} has a clash`);
      }
    }
  }
});

// --- Elevations ------------------------------------------------------

test('all four elevations draw, from the model rather than from a picture', () => {
  for (const b of [asBought, postExt]) {
    for (const side of SIDES) {
      const svg = elevationSvg(b, side.id);
      assert.match(svg, /^<svg class="el"/);
      assert.match(svg, /class="el-ground"/);
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
      assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}\b/, 'colour comes from tokens');
    }
  }
});

test('the hipped roof pulls its ridge in and the gabled one does not', () => {
  assert.match(elevationSvg(postExt, 'south'), /el-roof--hipped/);
  assert.match(elevationSvg(asBought, 'south'), /el-roof--gabled/);
});

test('a side that is not a side of the building says so', () => {
  assert.match(elevationSvg(postExt, 'up'), /not a side/);
});
