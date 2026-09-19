// Where the house sits in its plot.
//
// The boundary is the one part of this model that is not about the
// building, and it is the part most likely to be quietly wrong: a
// rectangle of the right size in the wrong place looks exactly as
// convincing as one in the right place. So what is asserted here is not
// the plot's SIZE - that is stated on the source - but that the four
// setbacks and the footprint add up to it in both directions, which is
// the check that catches a slipped origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => JSON.parse(readFileSync(`data/buildings/48-ameysford-road/${f}`, 'utf8'));
const property = read('building.json');
const plot = property.plot;

test('the building carries a plot at all', () => {
  assert.ok(plot, 'no plot on the building');
  assert.ok(plot.widthM > 0 && plot.depthM > 0);
  // Nothing in it may be trusted: it is traced off an aerial.
  assert.equal(plot.confidence, 'drafted');
  assert.match(plot.note, /approx/i, 'the boundary has to say it is approximate');
});

test('the house is inside its own boundary, on all four sides', () => {
  const { widthM, depthM } = property.envelope;
  assert.ok(plot.originX < 0, 'the west boundary is west of the house');
  assert.ok(plot.originY < 0, 'the north boundary is north of the house');
  assert.ok(plot.originX + plot.widthM > widthM, 'the east boundary is east of the house');
  assert.ok(plot.originY + plot.depthM > depthM, 'the south boundary is south of the house');
});

test('the setbacks and the footprint sum to the stated plot', () => {
  const { widthM, depthM } = property.envelope;
  const west = -plot.originX;
  const east = (plot.originX + plot.widthM) - widthM;
  const north = -plot.originY;
  const south = (plot.originY + plot.depthM) - depthM;
  assert.ok(Math.abs(west + widthM + east - plot.widthM) < 0.001,
    'across the plot: west + house + east must be the plot width');
  assert.ok(Math.abs(north + depthM + south - plot.depthM) < 0.001,
    'down the plot: rear + house + front must be the plot depth');
});

test('the setbacks match what the handbook states', () => {
  // Page 8: about 2m to the Pine Close hedge, 5-6m of garden east, 27m
  // of rear garden, 5m front. The boundary sits outside each hedge, so
  // the figures here are the hedge figure plus the hedge, which is why
  // the west one is 2.7 and not 2.0.
  const { widthM, depthM } = property.envelope;
  const west = -plot.originX;
  const east = (plot.originX + plot.widthM) - widthM;
  const north = -plot.originY;
  const south = (plot.originY + plot.depthM) - depthM;
  assert.ok(west > 2.0 && west < 3.2, `west setback ${west}`);
  assert.ok(east > 5.8 && east < 7.2, `east setback ${east}`);
  assert.ok(north > 25 && north < 28, `rear garden ${north}`);
  assert.ok(south > 4.5 && south < 5.6, `front garden ${south}`);
  // And the east side is the one with room, which is the whole reason
  // the optional extension goes there.
  assert.ok(east > west * 2, 'the east side has the room, not the west');
});

test('the plot belongs to the property, not to a stage', () => {
  // An extension changes the house. It does not move the boundary, so
  // the plot must not be authored per stage where two copies could
  // drift apart.
  for (const file of ['stages/as-bought.json', 'stages/post-extension.json']) {
    assert.equal(read(file).plot, undefined, `${file} must not carry its own plot`);
  }
});

test('the hedge stands on the boundary, inside it', () => {
  const h = plot.hedge;
  assert.ok(h, 'no hedge on the plot');
  // Six feet. The owner's figure, so it is theirs to change, but it has
  // to BE six feet: a hedge modelled at 1.2 would let you see over it
  // from the garden, which is the one thing this is here to answer.
  assert.ok(Math.abs(h.heightM - 1.83) < 0.005, `hedge is ${h.heightM}m, not 1.83`);
  assert.equal(h.heightConfidence, 'confirmed', 'the height is the owner\'s word, not an observation');
  assert.equal(h.depthConfidence, 'researched', 'the depth is scaled off a drawing, not measured');
  // It must fit inside its own plot twice over, or the two sides meet in
  // the middle and there is no garden left.
  assert.ok(h.depthM > 0 && h.depthM * 2 < plot.widthM, `hedge depth ${h.depthM} does not fit the plot`);
  assert.ok(h.sides.length === 4, 'the owner asked for a surrounding hedge');
});

test('the hedge does not reach the house on any side', () => {
  // If it did, the setbacks would be lying: "2m to the hedge" has to
  // leave 2m of something you can walk on.
  const { widthM, depthM } = property.envelope;
  const h = plot.hedge.depthM;
  const gaps = {
    west: -plot.originX - h,
    east: (plot.originX + plot.widthM) - widthM - h,
    north: -plot.originY - h,
    south: (plot.originY + plot.depthM) - depthM - h,
  };
  for (const [side, gap] of Object.entries(gaps)) {
    assert.ok(gap > 0.5, `${side}: only ${gap.toFixed(2)}m between the hedge and the house`);
  }
  // And the west gap is the tight one the handbook calls about 2m.
  assert.ok(gaps.west > 1.7 && gaps.west < 2.3, `west path is ${gaps.west.toFixed(2)}m`);
});

test('the hedge is taller than the walker', () => {
  // 1.62m eye height. A hedge you can see over answers a different
  // question from the one the owner asked.
  assert.ok(plot.hedge.heightM > 1.62, 'you can see over the hedge');
});
