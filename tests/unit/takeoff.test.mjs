// How many of the thing, measured off the model.
//
// A takeoff is the number that decides two years of collecting and a
// few thousand pounds, so the arithmetic is pinned here against the
// real building rather than checked by eye once. The rates are trade
// convention and the geometry is researched at best, which is exactly
// why the working has to be reproducible: when somebody disagrees with
// 4,000 bricks, the argument should be about the rate or the wall area,
// not about where the number came from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RATES, newWallFaceM2, brickTakeoff, ufhTakeoff, pavingTakeoff, gravelTakeoff,
  internalFaceM2, ceilingAreaM2, floorAreaM2, beadM, plasterTakeoff,
  plasterSundriesTakeoff, stripWasteTakeoff, electricalTakeoff,
  plumbingTakeoff, radiatorTakeoff, restorationTakeoff,
} from '../../assets/js/engine/takeoff.js';
import { stageDiff } from '../../assets/js/engine/building.js';

const read = (f) => JSON.parse(readFileSync(`data/buildings/48-ameysford-road/${f}`, 'utf8'));
const property = read('building.json');
const asBought = read('stages/as-bought.json');
const post = read('stages/post-extension.json');
const diff = stageDiff(asBought, post);

test('a solid 9in wall is two skins of brick, not one', () => {
  // The single most expensive thing to get wrong here: a solid wall
  // ordered as a single skin is half the bricks, and it is only found
  // out on site.
  assert.equal(RATES.skinsSolid9in, 2);
  const solid = brickTakeoff(diff, property, { construction: 'solid9' });
  const cavity = brickTakeoff(diff, property, { construction: 'cavity' });
  const b = (list) => list.find((l) => l.key === 'brick').quantity;
  assert.equal(b(solid), b(cavity) * 2,
    'solid is two skins of brick; a cavity wall is one, with block behind');
});

test('the brick count follows the wall the extension actually builds', () => {
  const faceM2 = newWallFaceM2(diff, property);
  const eaves = property.defaults.eavesHeight;
  assert.ok(diff.newExternalWallPlanM > 5, 'the extension builds new outer wall');
  assert.equal(faceM2, diff.newExternalWallPlanM * eaves);

  const bricks = brickTakeoff(diff, property).find((l) => l.key === 'brick');
  assert.equal(bricks.quantity, Math.round(faceM2 * RATES.brickPerM2Skin * 2));
  // A sanity band rather than a fixed number: the geometry may move,
  // but an order that comes out at 400 or at 40,000 is a bug, and both
  // are the kind of bug that looks plausible in a cell.
  assert.ok(bricks.quantity > 2000 && bricks.quantity < 12000,
    `${bricks.quantity} bricks for ${faceM2.toFixed(1)} m2 of face is not a believable order`);
});

test('every takeoff line carries its own working and admits it is drafted', () => {
  const lines = [
    ...brickTakeoff(diff, property),
    ...ufhTakeoff(post, ['kitchen-diner']),
    ...pavingTakeoff({ areaM2: 20, slabW: 0.6, slabH: 0.6 }),
    ...gravelTakeoff({ areaM2: 12 }),
  ];
  assert.ok(lines.length > 6);
  for (const l of lines) {
    assert.ok(l.basis && l.basis.length > 20, `${l.key} has no working behind it`);
    assert.equal(l.confidence, 'drafted',
      `${l.key} claims better than drafted - the rates are trade convention, not measurements`);
    assert.ok(l.quantity > 0, `${l.key} came out at ${l.quantity}`);
    assert.ok(l.unit, `${l.key} has no unit`);
  }
});

test('mortar is lime, and it scales with the bricks', () => {
  const lines = brickTakeoff(diff, property);
  const bricks = lines.find((l) => l.key === 'brick').quantity;
  const lime = lines.find((l) => l.key === 'lime');
  const sand = lines.find((l) => l.key === 'sand');
  assert.ok(lime, 'no lime in the mortar');
  assert.match(lime.label, /lime/i);
  assert.match(lime.basis, /not cement/i, 'the standing specification has to reach the order');
  assert.equal(lime.quantity, Math.round((bricks / 1000) * RATES.limeBagsPer1000Bricks));
  assert.ok(sand.quantity > 0);
  // And no cement anywhere in a takeoff for a solid-wall house.
  for (const l of lines) {
    assert.doesNotMatch(l.label, /cement/i, `${l.key} orders cement for a solid wall`);
  }
});

test('a cavity wall needs ties and a solid one does not', () => {
  const solid = brickTakeoff(diff, property, { construction: 'solid9' });
  const cavity = brickTakeoff(diff, property, { construction: 'cavity' });
  assert.equal(solid.find((l) => l.key === 'ties'), undefined);
  assert.ok(cavity.find((l) => l.key === 'ties'));
});

test('underfloor heating is taken off the rooms it actually heats', () => {
  const rooms = ['kitchen-diner', 'ensuite'];
  const lines = ufhTakeoff(post, rooms);
  const pipe = lines.find((l) => l.key === 'ufh-pipe');
  const ports = lines.find((l) => l.key === 'ufh-ports');
  const insul = lines.find((l) => l.key === 'ufh-insulation');

  // The area has to be the sum of those two rooms and nothing else.
  const area = post.rooms.filter((r) => rooms.includes(r.id))
    .flatMap((r) => r.rects ?? [r.rect])
    .reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0);
  assert.ok(Math.abs(insul.quantity - area) < 0.15, 'insulation is one board per square metre');
  assert.equal(pipe.quantity, Math.round(area * RATES.ufhPipeMPerM2At150));
  // One loop each plus a spare, so the manifold is not the thing that
  // stops a third room being added later.
  assert.equal(ports.quantity, rooms.length + RATES.ufhManifoldPortsSpare);
  for (const r of rooms) {
    const name = post.rooms.find((x) => x.id === r).name;
    assert.match(pipe.basis, new RegExp(name, 'i'), `${name} is not named in the working`);
  }
});

test('asking for underfloor heating in no rooms orders nothing', () => {
  // The rule the whole equipment list runs on: a thing the project does
  // not need is absent, not present with a zero against it.
  assert.deepEqual(ufhTakeoff(post, []), []);
  assert.deepEqual(gravelTakeoff({ areaM2: 0 }), []);
  assert.deepEqual(pavingTakeoff({ areaM2: 20, slabW: 0.6 }), []);
});

test('paving counts the joint, because a slab is bigger than its slab', () => {
  // 20 m2 of 600x600 with a 10mm joint is NOT 20/0.36 = 55.6 slabs.
  const withJoint = pavingTakeoff({ areaM2: 20, slabW: 0.6, slabH: 0.6, jointMm: 10 });
  const slabs = withJoint.find((l) => l.key === 'slab').quantity;
  assert.ok(slabs < 20 / 0.36, 'a joint means fewer slabs, not more');
  assert.equal(slabs, Math.round(20 / (0.61 * 0.61)));
});

// ------------------------------------------------------------------
// STRIPPING BACK TO BRICK.
//
// The standing assumption is a full strip: every internal face off,
// replumbed, rewired, made watertight. That makes the internal wall
// face of the whole house a quantity, and it is the one figure here
// that is read twice - as waste going out and as plaster coming back.
// ------------------------------------------------------------------

test('the internal face is measured off the rooms, at the right ceiling height', () => {
  const face = internalFaceM2(asBought);
  const floor = floorAreaM2(asBought);
  assert.ok(floor > 50 && floor < 200, `${floor} m2 of floor is not this house`);
  // A house's internal wall face runs to roughly three times its floor
  // area. Well outside that band and something is being counted twice
  // or not at all.
  const ratio = face / floor;
  assert.ok(ratio > 2 && ratio < 4.5,
    `${ratio.toFixed(2)} m2 of wall face per m2 of floor is not a believable house`);

  // And the two storeys are not the same height, so a single height
  // would be wrong. Prove the level is actually consulted.
  const heights = new Set(asBought.levels.map((l) => l.ceilingHeight));
  assert.ok(heights.size > 1, 'the fixture no longer has two ceiling heights to tell apart');
  const flattened = {
    ...asBought,
    levels: asBought.levels.map((l) => ({ ...l, ceilingHeight: 2.4 })),
  };
  assert.notEqual(face.toFixed(2), internalFaceM2(flattened).toFixed(2),
    'every room was measured at one height - the level ceiling height is being ignored');
  assert.ok(face < internalFaceM2(flattened),
    'the first floor is the lower storey, so it cannot add more face than the ground');
});

test('a ceiling comes down too, and the waste figure says so', () => {
  // The half that gets left out. A wall-area strip figure books half
  // the skips it needs, and the ceilings are the dirtier half.
  const face = internalFaceM2(asBought);
  const ceil = ceilingAreaM2(asBought);
  assert.equal(ceil, floorAreaM2(asBought));

  const waste = stripWasteTakeoff(asBought).find((l) => l.key === 'strip-waste');
  assert.ok(Math.abs(waste.quantity - (face + ceil) * RATES.stripWasteM3PerM2) < 0.1,
    'the waste figure is walls only - the ceilings are missing');
  assert.match(waste.basis, /ceiling/i);
  // And it admits what it does NOT cover, because that is how a skip
  // count gets trusted for more than it measured.
  assert.match(waste.basis, /NOT/);
});

test('a skip is hired whole, so the count rounds up', () => {
  const lines = stripWasteTakeoff(asBought);
  const m3 = lines.find((l) => l.key === 'strip-waste').quantity;
  const skips = lines.find((l) => l.key === 'skip');
  assert.equal(skips.quantity, Math.ceil(m3 / RATES.builderSkipM3));
  assert.equal(skips.quantity % 1, 0, 'you cannot hire two fifths of a skip');
  assert.equal(skips.acquisition, 'hire', 'a skip is never owned');
});

test('plaster is lime and the finish is its own material', () => {
  const lines = plasterTakeoff(asBought);
  const backing = lines.find((l) => l.key === 'lime-plaster');
  const finish = lines.find((l) => l.key === 'lime-finish');
  assert.ok(backing && finish);
  // The whole specification, in the one place an order is placed from.
  assert.match(backing.basis, /not gypsum/i,
    'the standing lime specification has to reach the plastering order');
  for (const l of lines) {
    assert.doesNotMatch(l.label, /gypsum|multi-finish|browning/i,
      `${l.key} orders gypsum onto a solid brick wall`);
  }
  // A finish coat is a few millimetres; a backing coat is twenty. If
  // the finish ever outweighs the backing the rate has been fat-fingered.
  assert.ok(finish.quantity < backing.quantity,
    'the 3mm finish weighs more than the 20mm backing behind it');
});

test('beads are counted off the openings, not off a rate per square metre', () => {
  const bead = beadM(asBought, property);
  const n = asBought.openings.length;
  assert.ok(n > 5, 'the fixture has no openings to count');
  // Every reveal is two jambs and a head, and a doorway has them on
  // both faces. So the total cannot be less than one jamb each.
  assert.ok(bead > n * 2, `${bead.toFixed(1)}m of bead across ${n} openings is too little`);

  const sundries = plasterSundriesTakeoff(asBought, property);
  const line = sundries.find((l) => l.key === 'plaster-bead');
  assert.equal(line.quantity, Math.round(bead * 1.1));
  assert.match(line.basis, /stainless/i, 'lime eats galvanised bead and the order must say so');

  // A stage with no openings orders no bead rather than a zero.
  assert.equal(beadM({ openings: [] }, property), 0);
  assert.equal(
    plasterSundriesTakeoff({ openings: [], rooms: [] }, property).length, 0);
});

test('the rewire and the replumb follow the house, not a flat rate', () => {
  const elec = electricalTakeoff(asBought);
  const points = elec.find((l) => l.key === 'electrical-points');
  const cable = elec.find((l) => l.key === 'twin-earth');
  assert.equal(points.quantity,
    Math.round(floorAreaM2(asBought) * RATES.electricalPointsPerM2));
  assert.equal(cable.quantity, Math.round(
    floorAreaM2(asBought) * RATES.electricalPointsPerM2 * RATES.cableMPerPoint));
  // A three-bedroom rewire is tens of points, not a handful.
  assert.ok(points.quantity > 20 && points.quantity < 120,
    `${points.quantity} points is not a rewire of this house`);

  const plumb = plumbingTakeoff(asBought);
  const pipe = plumb.find((l) => l.key === 'pipe');
  assert.ok(pipe.quantity > 40, `${pipe.quantity}m of pipe is not a replumb`);
  // The wet rooms have to be named, or nobody can check the figure.
  assert.match(pipe.basis, /kitchen/i);
  assert.match(pipe.basis, /bathroom/i);
});

test('underfloor heating takes a room off the radiator count', () => {
  // The two have to agree, or the house is heated twice in one room
  // and the radiator order is one too many.
  const all = radiatorTakeoff(asBought).find((l) => l.key === 'radiator').quantity;
  const less = radiatorTakeoff(asBought, { skipRoomIds: ['kitchen'] })
    .find((l) => l.key === 'radiator').quantity;
  assert.ok(less < all, 'a room on underfloor heating still got a radiator');
});

test('the whole restoration comes out in one call, and every line shows its working', () => {
  const lines = restorationTakeoff(asBought, property);
  const keys = lines.map((l) => l.key);
  for (const k of ['strip-waste', 'skip', 'lime-plaster', 'plaster-bead',
    'ceiling-board', 'electrical-points', 'pipe', 'radiator']) {
    assert.ok(keys.includes(k), `${k} is missing from the restoration takeoff`);
  }
  assert.equal(new Set(keys).size, keys.length, 'the same line is taken off twice');
  for (const l of lines) {
    assert.ok(l.basis && l.basis.length > 20, `${l.key} has no working behind it`);
    assert.equal(l.confidence, 'drafted');
    assert.ok(l.quantity > 0, `${l.key} came out at ${l.quantity}`);
    assert.ok(l.unit, `${l.key} has no unit`);
  }
});

test('an empty stage orders nothing at all', () => {
  const empty = { rooms: [], levels: [], openings: [] };
  assert.deepEqual(restorationTakeoff(empty, property), []);
  assert.equal(internalFaceM2(empty), 0);
  assert.equal(ceilingAreaM2(empty), 0);
});
