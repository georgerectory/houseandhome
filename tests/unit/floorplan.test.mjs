// The floor plan engine. The rule under test throughout is that a grid
// reference is DERIVED from metric coordinates and never stored, so the
// plan, the register and the 3D model cannot describe different places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_CELL, columnName, columnIndex, cellOf, gridRef, refBounds,
  levels, levelById, levelCode, qualifiedRef, roomsOn, wallsOn, openingsOn,
  openingSegment, bounds, roomAt, roomByKey, roomLabel, roomCentre, roomArea,
  place, placeAll, placedOn, roomsNotOnPlan, axis, spreadInferred,
  INFERRED_DROP,
} from '../../assets/js/engine/floorplan.js';
import { levelSvg } from '../../assets/js/engine/floorplan-svg.js';
import { composeBuilding } from '../../assets/js/engine/building.js';

// The real model, composed the way the page composes it, so the tests
// exercise the object the renderers are actually handed.
const read = (f) => JSON.parse(readFileSync(`data/buildings/48-ameysford-road/${f}`, 'utf8'));
const building = composeBuilding(
  read('building.json'), read('stages/as-bought.json'), read('variants/as-bought--empty.json'),
);

// A tiny hand-made building, so the arithmetic is checkable by eye.
const toy = {
  grid: { cell: 1, originX: 0, originY: 0 },
  defaults: { wallExternal: 0.2, wallInternal: 0.1 },
  levels: [{ id: 'g', name: 'Ground', code: 'G', elevation: 0, ceilingHeight: 2.4 },
    { id: 'u', name: 'Upper', code: '1', elevation: 2.7, ceilingHeight: 2.4 }],
  rooms: [
    { id: 'a', level: 'g', name: 'Kitchen', roomKey: 'kitchen', rect: [0, 0, 4, 3] },
    { id: 'b', level: 'g', name: 'Hall', roomKey: 'hallway', rect: [4, 0, 6, 3] },
    { id: 'c', level: 'u', name: 'Bedroom', roomKey: 'bedroom', rect: [0, 0, 4, 3] },
  ],
  walls: [{ id: 'w1', level: 'g', a: [0, 0], b: [10, 0], kind: 'external' }],
  openings: [{ id: 'o1', wall: 'w1', type: 'door', at: 5, width: 1 }],
};

// --- Column names ----------------------------------------------------

test('columns run A to Z then AA, so a wide building never runs out', () => {
  assert.equal(columnName(0), 'A');
  assert.equal(columnName(25), 'Z');
  assert.equal(columnName(26), 'AA');
  assert.equal(columnName(27), 'AB');
  assert.equal(columnName(51), 'AZ');
  assert.equal(columnName(52), 'BA');
});

test('a column name round-trips back to its index', () => {
  for (let i = 0; i < 200; i += 1) assert.equal(columnIndex(columnName(i)), i);
});

test('nonsense in, nothing out - never a wrong square', () => {
  assert.equal(columnName(-1), '');
  assert.equal(columnName(1.5), '');
  assert.equal(columnIndex(''), -1);
  assert.equal(columnIndex('A1'), -1);
  assert.equal(columnIndex(null), -1);
});

// --- References ------------------------------------------------------

test('a reference is computed from metres, column then row, one-based', () => {
  assert.equal(gridRef(0, 0, toy), 'A1');
  assert.equal(gridRef(0.9, 0.9, toy), 'A1');
  assert.equal(gridRef(3.5, 2.2, toy), 'D3');
});

test('a point exactly on a boundary belongs to the cell it starts', () => {
  assert.equal(gridRef(1, 1, toy), 'B2');
  assert.deepEqual(cellOf(2, 3, toy), { col: 2, row: 3 });
});

test('an unplaced or nonsense point has no reference rather than a made-up one', () => {
  assert.equal(gridRef(null, 2, toy), null);
  assert.equal(gridRef(2, undefined, toy), null);
  assert.equal(gridRef(NaN, 2, toy), null);
  assert.equal(gridRef(-1, 2, toy), null, 'outside the grid is not square A');
});

test('a reference and its bounds are inverses of each other', () => {
  for (const ref of ['A1', 'D7', 'Q3', 'AA12']) {
    const b = refBounds(ref, toy);
    assert.equal(gridRef(b.x1, b.y1, toy), ref, `${ref} did not round-trip`);
    assert.equal(gridRef((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, toy), ref);
  }
});

test('a malformed reference resolves to nothing', () => {
  for (const bad of ['', '1A', 'A', '7', 'A0', null, 'A-1']) {
    assert.equal(refBounds(bad, toy), null, `${bad} should not resolve`);
  }
});

test('cell size is read from the building, not assumed', () => {
  const half = { ...toy, grid: { cell: 0.5, originX: 0, originY: 0 } };
  assert.equal(gridRef(1.2, 0.2, half), 'C1');
  assert.equal(gridRef(1.2, 0.2, toy), 'B1');
  assert.equal(DEFAULT_CELL, 1);
});

test('a plan origin that is not zero shifts every reference with it', () => {
  const shifted = { ...toy, grid: { cell: 1, originX: 10, originY: 10 } };
  assert.equal(gridRef(10.5, 10.5, shifted), 'A1');
});

test('a bare square is ambiguous between levels, so it is qualified', () => {
  assert.equal(levelCode(toy, 'g'), 'G');
  assert.equal(levelCode(toy, 'u'), '1');
  assert.equal(qualifiedRef('A7', 'g', toy), 'G-A7');
  assert.equal(qualifiedRef('A7', 'u', toy), '1-A7');
  assert.equal(qualifiedRef(null, 'g', toy), null);
});

// --- Geometry --------------------------------------------------------

test('rooms and walls are read per level', () => {
  assert.deepEqual(roomsOn(toy, 'g').map((r) => r.id), ['a', 'b']);
  assert.deepEqual(roomsOn(toy, 'u').map((r) => r.id), ['c']);
  assert.equal(wallsOn(toy, 'g').length, 1);
  assert.equal(wallsOn(toy, 'u').length, 0);
});

test('an opening belongs to a level through the wall it sits on', () => {
  assert.deepEqual(openingsOn(toy, 'g').map((o) => o.id), ['o1']);
  assert.deepEqual(openingsOn(toy, 'u'), []);
});

test('an opening is positioned by its CENTRE, not its near edge', () => {
  const seg = openingSegment(toy.openings[0], toy);
  assert.deepEqual(seg.a, [4.5, 0], 'a 1m door at 5 starts at 4.5');
  assert.deepEqual(seg.b, [5.5, 0], 'and ends at 5.5');
});

test('the real front door lands centred in the hall it opens into', () => {
  const door = building.openings.find((o) => o.id === 'g-door-front');
  const seg = openingSegment(door, building);
  const mid = (seg.a[0] + seg.b[0]) / 2;
  const hall = building.rooms.find((r) => r.id === 'hall');
  assert.ok(mid > hall.rect[0] && mid < hall.rect[2],
    `door centre ${mid} should sit within the hall ${hall.rect[0]}..${hall.rect[2]}`);
});

test('an opening is clamped to its wall rather than running off the end', () => {
  const wide = { id: 'x', wall: 'w1', type: 'door', at: 0, width: 4 };
  const seg = openingSegment(wide, { ...toy, openings: [wide] });
  assert.equal(seg.a[0], 0, 'clamped at the start');
  assert.equal(seg.b[0], 2);
});

test('an opening on a wall that does not exist draws nothing', () => {
  assert.equal(openingSegment({ id: 'x', wall: 'nope', at: 1, width: 1 }, toy), null);
});

test('bounds cover rooms AND walls at full thickness, since a wall has two faces', () => {
  const b = bounds(toy, 'g', 0);
  assert.equal(b.x2, 10.1, 'the wall runs past the rooms, and half of it past its own centreline');
  assert.equal(b.y1, -0.1);
});

test('a level with no geometry has no bounds rather than an empty box', () => {
  assert.equal(bounds(toy, 'nope'), null);
});

test('a point resolves to exactly one room even on a shared wall', () => {
  assert.equal(roomAt(toy, 'g', 1, 1).id, 'a');
  assert.equal(roomAt(toy, 'g', 4, 1).id, 'b', 'the upper edge is exclusive');
  assert.equal(roomAt(toy, 'g', 9, 1), null, 'outside every room is null');
});

test('a room is found by the household\'s key, and named in their words', () => {
  assert.equal(roomByKey(toy, 'kitchen').id, 'a');
  assert.equal(roomByKey(toy, 'nope'), null);
  assert.equal(roomLabel(roomByKey(toy, 'kitchen'), { kitchen: 'The Kitchen' }), 'The Kitchen');
  assert.equal(roomLabel(roomByKey(toy, 'kitchen'), {}), 'Kitchen',
    'falling back to the survey name rather than blank');
});

test('centre and area come off the rect corners, not a width and height', () => {
  assert.deepEqual(roomCentre(roomByKey(toy, 'kitchen')), { x: 2, y: 1.5 });
  assert.equal(roomArea(roomByKey(toy, 'kitchen')), 12);
});

// --- Placing ---------------------------------------------------------

const thing = (o = {}) => ({ id: 'x', name: 'Cooker', room_key: 'kitchen', ...o });

test('real coordinates make a placed thing with a qualified reference', () => {
  const p = place(thing({ plan_x_m: 2.2, plan_y_m: 2.8 }), toy);
  assert.equal(p.state, 'placed');
  assert.equal(p.ref, 'C3');
  assert.equal(p.fullRef, 'G-C3');
  assert.equal(p.room.id, 'a');
});

test('a known room with no coordinates is INFERRED, never presented as measured', () => {
  const p = place(thing(), toy);
  assert.equal(p.state, 'inferred');
  assert.deepEqual([p.x, p.y], [2, 1.5], 'shown at the room centre');
  assert.equal(p.fullRef, 'G-C2');
});

test('neither coordinates nor a room on the plan means unplaced, not square A1', () => {
  const p = place(thing({ room_key: 'gym' }), toy);
  assert.equal(p.state, 'unplaced');
  assert.equal(p.ref, null);
  assert.equal(p.fullRef, null);
  assert.equal(p.room, null);
});

test('a placed thing takes the level of the room it actually lands in', () => {
  const p = place(thing({ room_key: 'bedroom', plan_x_m: 1, plan_y_m: 1 }), toy);
  assert.equal(p.level, 'u');
  assert.equal(p.fullRef, '1-B2', 'the same square on another floor is a different reference');
});

test('placements filter to one level for drawing', () => {
  const ps = placeAll([
    thing({ id: 'g1', plan_x_m: 1, plan_y_m: 1 }),
    thing({ id: 'u1', room_key: 'bedroom' }),
  ], toy);
  assert.deepEqual(placedOn(ps, 'g').map((p) => p.thing.id), ['g1']);
  assert.deepEqual(placedOn(ps, 'u').map((p) => p.thing.id), ['u1']);
});

test('rooms the building does not have are reported, not silently dropped', () => {
  assert.deepEqual(roomsNotOnPlan(['kitchen', 'gym', 'loft'], toy), ['gym', 'loft']);
});

// --- Spreading inferred pins -----------------------------------------

test('inferred pins in one room fan out instead of stacking on the label', () => {
  const ps = spreadInferred(placeAll([
    thing({ id: 'a1' }), thing({ id: 'a2' }), thing({ id: 'a3' }),
  ], toy));
  const xs = ps.map((p) => p.x);
  assert.equal(new Set(xs).size, 3, 'each gets its own spot');
  for (const p of ps) {
    assert.ok(p.y > roomCentre(roomByKey(toy, 'kitchen')).y, 'and drops below the room name');
  }
});

test('a fan stays inside the room it belongs to', () => {
  const narrow = { ...toy, rooms: [{ id: 'n', level: 'g', name: 'Cupboard', roomKey: 'kitchen', rect: [0, 0, 0.8, 0.8] }] };
  const ps = spreadInferred(placeAll(
    Array.from({ length: 6 }, (_, i) => thing({ id: `c${i}` })), narrow));
  for (const p of ps) {
    assert.ok(p.x >= 0 && p.x <= 0.8, `x ${p.x} escaped the room`);
    assert.ok(p.y >= 0 && p.y <= 0.8, `y ${p.y} escaped the room`);
  }
});

test('a PLACED pin is never moved to tidy the drawing', () => {
  const ps = spreadInferred(placeAll([thing({ plan_x_m: 0.3, plan_y_m: 0.3 })], toy));
  assert.deepEqual([ps[0].x, ps[0].y], [0.3, 0.3], 'real coordinates are not decoration');
});

test('spreading does not mutate the placements it was given', () => {
  const ps = placeAll([thing({ id: 'a1' }), thing({ id: 'a2' })], toy);
  const before = ps.map((p) => p.x);
  spreadInferred(ps);
  assert.deepEqual(ps.map((p) => p.x), before);
  assert.ok(INFERRED_DROP > 0);
});

// --- Axis ------------------------------------------------------------

test('the axis labels the same squares the references use', () => {
  const ax = axis({ x1: 0, y1: 0, x2: 10, y2: 3 }, toy);
  assert.deepEqual(ax.cols.map((c) => c.label), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
  assert.deepEqual(ax.rows.map((r) => r.label), ['1', '2', '3']);
  const a = ax.cols[3];
  assert.equal(gridRef(a.x1, 0, toy), 'D1', 'a column label and a reference agree');
});

test('no bounds means no axis rather than a crash', () => {
  assert.deepEqual(axis(null, toy), { cols: [], rows: [] });
});

// --- The real model --------------------------------------------------

test('the shipped building is a coherent building', () => {
  assert.ok(levels(building).length >= 2);
  for (const l of levels(building)) {
    assert.ok(l.code, `level ${l.id} needs a code to qualify its references`);
    assert.ok(bounds(building, l.id), `level ${l.id} has no geometry`);
  }
  for (const r of building.rooms) {
    assert.equal(r.rect.length, 4);
    assert.ok(r.rect[2] > r.rect[0] && r.rect[3] > r.rect[1],
      `${r.id} rect is [x1,y1,x2,y2] with the second corner larger`);
    assert.ok(levelById(building, r.level), `${r.id} is on a level that does not exist`);
  }
  for (const o of building.openings) {
    assert.ok(building.walls.some((w) => w.id === o.wall), `${o.id} has no wall`);
  }
});

test('the model says clearly that it is not a survey', () => {
  assert.equal(building.surveyed, false);
  assert.equal(building.bought, false);
  assert.ok(building.assumptions.length, 'what is inferred is recorded with a severity');
  assert.ok(building.assumptions.some((a) => a.severity === 'high'));
  assert.ok(building.sources.length, 'every figure can name the document it came from');
});

test('a level of the real building draws to SVG in metre space', () => {
  const ps = placedOn(placeAll([{ id: 'k', name: 'Cooker', room_key: 'kitchen', plan_x_m: 3.0, plan_y_m: 0.6 }], building), 'ground');
  const svg = levelSvg(building, 'ground', ps, { roomNames: { kitchen: 'Kitchen' } });
  assert.match(svg, /viewBox="/);
  assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(svg, /class="fp-wall/);
  assert.match(svg, /data-asset-id="k"/);
  assert.match(svg, /Cooker \(D1\)/, 'the pin carries the reference the register shows');
});

test('the drawing carries no colour of its own', () => {
  const svg = levelSvg(building, 'ground', [], {});
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}\b/, 'colour comes from tokens, not the markup');
  assert.doesNotMatch(svg, /style="(?![^"]*--)[^"]*"/, 'no static inline styles');
});

test('a level with nothing on it says so rather than drawing an empty box', () => {
  assert.match(levelSvg(building, 'nope', [], {}), /no geometry/);
});
